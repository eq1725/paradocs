// V11.17.74 - Sentiment + endpoints (Tier 3D)
//
// POST /api/lab/synthesized-paragraph
//
// Body:
//   {
//     userExperiences: [
//       { id, title, phen_family, event_date, location, descriptors }
//     ],
//     cross_experience_signals?: { ... optional extra signals ... }
//   }
//
// Returns:
//   { paragraph: "single documentary-voice sentence describing the user's body of work" }
//
// Behavior:
//   - Single Haiku call (synchronous, ≤2s) — replaces the client-side
//     synthesis currently rendered by CrossExperienceHeader.
//   - Constrained prompt: documentary voice; single sentence; ≤200 chars;
//     no exclamation marks; banned phrasings (fascinating, spooky,
//     creepy, weird, you might).
//   - Per-user cache, 1h TTL OR until the user submits a new experience
//     (we key on a hash of the experience IDs + event_dates, so adding
//     an experience naturally busts the cache).
//   - Anonymous fallback: if no Anthropic API key is configured, the
//     endpoint returns a deterministic prose summary built from the
//     same signals (no Haiku) so the surface degrades gracefully in
//     dev / preview envs.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

var HAIKU_MODEL = 'claude-haiku-4-5-20251001'
var REQUEST_TIMEOUT_MS = 15000

var MAX_LEN = 200
var CACHE_TTL_MS = 60 * 60 * 1000  // 1h

var BANNED_PHRASES = [
  'fascinating',
  'spooky',
  'creepy',
  'weird',
  'you might',
  'mysterious',
  'eerie',
  'chilling',
  'haunting',
  'bizarre',
  'strange',
]

interface CacheEntry {
  expires: number
  paragraph: string
}

var _cache: Map<string, CacheEntry> = new Map()

function cacheGet(key: string): string | null {
  var hit = _cache.get(key)
  if (!hit) return null
  if (hit.expires < Date.now()) {
    _cache.delete(key)
    return null
  }
  return hit.paragraph
}

function cacheSet(key: string, paragraph: string): void {
  _cache.set(key, { expires: Date.now() + CACHE_TTL_MS, paragraph: paragraph })
  if (_cache.size > 500) {
    var oldest = _cache.keys().next().value
    if (oldest) _cache.delete(oldest)
  }
}

// ─── Validation + cleanup ──────────────────────────────────────────────

export function validateSynthesizedParagraph(text: string): { ok: boolean; reason?: string } {
  if (!text) return { ok: false, reason: 'empty' }
  var trimmed = text.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'empty' }
  if (trimmed.length > MAX_LEN) return { ok: false, reason: 'too_long' }
  // Single sentence — count sentence terminators. Allow at most one
  // terminal punctuation (the closing one).
  var terminators = (trimmed.match(/[.?!]/g) || []).length
  if (terminators > 1) return { ok: false, reason: 'multi_sentence' }
  if (/!/.test(trimmed)) return { ok: false, reason: 'exclamation' }
  var lower = trimmed.toLowerCase()
  for (var i = 0; i < BANNED_PHRASES.length; i++) {
    if (lower.indexOf(BANNED_PHRASES[i]) !== -1) {
      return { ok: false, reason: 'banned_phrase:' + BANNED_PHRASES[i] }
    }
  }
  return { ok: true }
}

function sanitizeParagraph(raw: string): string {
  if (!raw) return ''
  var t = raw.replace(/```\w*\s*/g, '').replace(/```/g, '').trim()
  // Strip surrounding quotes if the model added them.
  t = t.replace(/^["“']/g, '').replace(/["”']$/g, '')
  // Collapse whitespace.
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

// ─── Signal extraction (deterministic body-of-work facts) ──────────────

interface ExperienceIn {
  id?: string
  title?: string | null
  phen_family?: string | null
  event_date?: string | null
  location?: string | null
  descriptors?: string[] | null
}

interface BodySignals {
  n: number
  yearMin: number | null
  yearMax: number | null
  dominantFamily: string | null
  dominantFamilyCount: number
  sharedLocation: string | null
  sharedLocationCount: number
  nightCount: number
  withTimeCount: number
}

function extractSignals(experiences: ExperienceIn[]): BodySignals {
  var n = experiences.length
  var years: number[] = []
  var familyCount: Record<string, number> = {}
  var locCount: Record<string, number> = {}
  var nightCount = 0
  var withTimeCount = 0

  for (var i = 0; i < n; i++) {
    var e = experiences[i]
    if (e.event_date) {
      var d = new Date(e.event_date)
      var y = d.getFullYear()
      if (!isNaN(y) && y > 1800 && y < 2200) years.push(y)
      if (e.event_date.length > 10 && !isNaN(d.getTime())) {
        var h = d.getHours()
        withTimeCount++
        if (h >= 21 || h <= 4) nightCount++
      }
    }
    if (e.phen_family) familyCount[e.phen_family] = (familyCount[e.phen_family] || 0) + 1
    if (e.location) {
      var locKey = String(e.location).trim().toLowerCase()
      if (locKey) locCount[locKey] = (locCount[locKey] || 0) + 1
    }
  }

  var dominantFamily: string | null = null
  var dominantFamilyCount = 0
  Object.keys(familyCount).forEach(function (k) {
    if (familyCount[k] > dominantFamilyCount) {
      dominantFamily = k
      dominantFamilyCount = familyCount[k]
    }
  })

  var sharedLocation: string | null = null
  var sharedLocationCount = 0
  Object.keys(locCount).forEach(function (k) {
    if (locCount[k] > sharedLocationCount) {
      sharedLocation = k
      sharedLocationCount = locCount[k]
    }
  })

  return {
    n: n,
    yearMin: years.length > 0 ? Math.min.apply(null, years) : null,
    yearMax: years.length > 0 ? Math.max.apply(null, years) : null,
    dominantFamily: dominantFamily,
    dominantFamilyCount: dominantFamilyCount,
    sharedLocation: sharedLocation,
    sharedLocationCount: sharedLocationCount,
    nightCount: nightCount,
    withTimeCount: withTimeCount,
  }
}

function familyLabel(slug: string | null | undefined): string {
  if (!slug) return 'unspecified'
  if (slug === 'ufos_aliens') return 'UFO'
  if (slug === 'ghosts_hauntings') return 'apparition'
  if (slug === 'cryptids') return 'cryptid'
  if (slug === 'psychic_phenomena') return 'psychic'
  if (slug === 'consciousness_practices') return 'consciousness'
  if (slug === 'perception_sensory') return 'perception'
  if (slug === 'religion_mythology') return 'mythological'
  if (slug === 'esoteric_practices') return 'esoteric'
  return slug.replace(/_/g, ' ')
}

/**
 * Deterministic fallback. Used when Haiku is unavailable OR when the
 * Haiku response fails the validator twice in a row. Output is always
 * brand-safe and within the constraints.
 */
export function buildFallbackParagraph(signals: BodySignals): string {
  var n = signals.n
  if (n === 0) {
    return 'No experiences are recorded yet.'
  }
  if (n === 1) {
    var fam = familyLabel(signals.dominantFamily)
    var y = signals.yearMax
    if (y) return 'A single ' + y + ' ' + fam + ' account anchors your record.'
    return 'A single ' + fam + ' account anchors your record.'
  }
  var parts: string[] = []
  var span = ''
  if (signals.yearMin && signals.yearMax && signals.yearMin !== signals.yearMax) {
    span = ' between ' + signals.yearMin + ' and ' + signals.yearMax
  } else if (signals.yearMin) {
    span = ' anchored in ' + signals.yearMin
  }
  var stem = 'Your ' + n + ' submissions form a body of work' + span
  parts.push(stem)
  var clauses: string[] = []
  if (signals.dominantFamilyCount >= 2 && signals.dominantFamily) {
    clauses.push(signals.dominantFamilyCount + ' ' + familyLabel(signals.dominantFamily) + ' accounts')
  }
  if (signals.sharedLocationCount >= 2 && signals.sharedLocation) {
    clauses.push(signals.sharedLocationCount + ' near ' + signals.sharedLocation)
  }
  if (signals.nightCount >= 2) {
    clauses.push(signals.nightCount + ' in night-time hours')
  }
  var sentence = parts.join('')
  if (clauses.length > 0) sentence += ', including ' + clauses.slice(0, 2).join(' and ')
  sentence += '.'
  if (sentence.length > MAX_LEN) sentence = sentence.substring(0, MAX_LEN - 1).replace(/[\s,;:]+\S*$/, '') + '.'
  return sentence
}

// ─── Haiku call ────────────────────────────────────────────────────────

var SYNTH_SYSTEM_PROMPT = [
  'You are the editorial voice of Paradocs. Produce ONE documentary-voice sentence',
  'describing the body of work captured in a user\'s submitted experiences.',
  '',
  'HARD CONSTRAINTS:',
  '- EXACTLY ONE sentence. No second sentence. No semicolons used as sentence breaks.',
  '- Maximum 200 characters.',
  '- Documentary voice — the seasoned investigator. Plain, evidence-first, never lurid.',
  '- BANNED WORDS: fascinating, spooky, creepy, weird, mysterious, eerie, chilling,',
  '  haunting, bizarre, strange. BANNED PATTERN: "you might".',
  '- No exclamation marks. No emojis.',
  '- Lead with a count, span, or pattern observation. Cite shared location or shared',
  '  phenomenon family when present. Use specific numbers when given.',
  '',
  'EXAMPLES (good):',
  '  "Your three submissions form a coastal California sleep-paralysis cluster between 2008 and 2014, all between 02:00 and 04:00."',
  '  "Across your seven experiences, four reference a recurring residential location anchor and three describe airborne phenomena."',
  '',
  'OUTPUT FORMAT: return ONLY the sentence. No fences, no commentary, no labels.',
].join('\n')

function buildSynthUserPrompt(experiences: ExperienceIn[], signals: BodySignals, crossSignals?: any): string {
  var lines: string[] = []
  lines.push('Number of experiences: ' + signals.n)
  if (signals.yearMin && signals.yearMax) {
    if (signals.yearMin === signals.yearMax) {
      lines.push('Year: ' + signals.yearMin)
    } else {
      lines.push('Year span: ' + signals.yearMin + '–' + signals.yearMax)
    }
  }
  if (signals.dominantFamily && signals.dominantFamilyCount >= 2) {
    lines.push('Dominant phenomenon family: ' + familyLabel(signals.dominantFamily) +
      ' (' + signals.dominantFamilyCount + ' of ' + signals.n + ')')
  }
  if (signals.sharedLocation && signals.sharedLocationCount >= 2) {
    lines.push('Shared location anchor: ' + signals.sharedLocation +
      ' (' + signals.sharedLocationCount + ' of ' + signals.n + ')')
  }
  if (signals.nightCount >= 2) {
    lines.push('Night-time accounts (21:00–04:00): ' + signals.nightCount + ' of ' + signals.withTimeCount)
  }
  if (crossSignals && typeof crossSignals === 'object') {
    Object.keys(crossSignals).slice(0, 6).forEach(function (k) {
      var v = (crossSignals as any)[k]
      if (typeof v === 'string' || typeof v === 'number') lines.push(k + ': ' + v)
    })
  }
  lines.push('')
  lines.push('Experience list (truncated):')
  experiences.slice(0, 10).forEach(function (e, i) {
    var bits: string[] = []
    if (e.event_date) bits.push(String(e.event_date).slice(0, 10))
    if (e.phen_family) bits.push(familyLabel(e.phen_family))
    if (e.location) bits.push(String(e.location).slice(0, 60))
    if (e.title) bits.push(String(e.title).slice(0, 60))
    lines.push('  ' + (i + 1) + '. ' + bits.join(' | '))
  })
  lines.push('')
  lines.push('Compose the single documentary sentence.')
  return lines.join('\n')
}

async function callHaikuSynth(prompt: string): Promise<string | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  var controller = new AbortController()
  var timeoutId = setTimeout(function () { controller.abort() }, REQUEST_TIMEOUT_MS)
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 200,
        temperature: 0.3,
        system: [{ type: 'text', text: SYNTH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!resp.ok) return null
    var data = await resp.json()
    var text = (data.content && data.content[0] && data.content[0].text) || ''
    return sanitizeParagraph(text)
  } catch (_e) {
    clearTimeout(timeoutId)
    return null
  }
}

// ─── Cache key ─────────────────────────────────────────────────────────

function cacheKeyFor(userId: string | null, experiences: ExperienceIn[]): string {
  // ID + date string suffices — adding an experience changes the list,
  // editing event_date busts the key. Truncate to keep memory bounded.
  var ids = experiences.map(function (e) {
    return (e.id || '') + '@' + (e.event_date || '')
  }).sort().join(',')
  return (userId || 'anon') + '|' + ids.slice(0, 1000)
}

// ─── Handler ───────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  // Auth is optional — anonymous callers (or sub-agents in eval mode)
  // still get a paragraph; per-user cache key falls back to "anon".
  var userId: string | null = null
  try {
    var authHeader = req.headers.authorization || ''
    var token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (token && SUPABASE_URL && SUPABASE_ANON_KEY) {
      var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: 'Bearer ' + token } },
      })
      var u = await authClient.auth.getUser(token)
      if (u && u.data && u.data.user) userId = u.data.user.id
    }
  } catch (_e) { /* anonymous fall-through */ }

  var body = req.body || {}
  var experiences: ExperienceIn[] = Array.isArray(body.userExperiences) ? body.userExperiences : []
  var crossSignals = body.cross_experience_signals && typeof body.cross_experience_signals === 'object'
    ? body.cross_experience_signals
    : undefined

  if (experiences.length === 0) {
    return res.status(200).json({ paragraph: 'No experiences are recorded yet.' })
  }

  var key = cacheKeyFor(userId, experiences)
  var cached = cacheGet(key)
  if (cached) {
    res.setHeader('X-Paradocs-Cache', 'HIT')
    return res.status(200).json({ paragraph: cached })
  }

  var signals = extractSignals(experiences)
  var fallback = buildFallbackParagraph(signals)

  // Try Haiku. If we can't reach it, fall back to the deterministic
  // template — the brand stays consistent either way.
  var attempt = await callHaikuSynth(buildSynthUserPrompt(experiences, signals, crossSignals))
  var paragraph: string | null = null
  if (attempt) {
    var v = validateSynthesizedParagraph(attempt)
    if (v.ok) {
      paragraph = attempt
    } else {
      // One retry with explicit constraint reminder.
      var retry = await callHaikuSynth(
        buildSynthUserPrompt(experiences, signals, crossSignals) +
        '\n\nIMPORTANT: previous attempt failed because ' + v.reason +
        '. Return ONE sentence under 200 characters, no exclamation, no banned phrases.'
      )
      if (retry) {
        var v2 = validateSynthesizedParagraph(retry)
        if (v2.ok) paragraph = retry
      }
    }
  }
  if (!paragraph) paragraph = fallback

  cacheSet(key, paragraph)
  res.setHeader('X-Paradocs-Cache', 'MISS')
  return res.status(200).json({ paragraph: paragraph })
}
