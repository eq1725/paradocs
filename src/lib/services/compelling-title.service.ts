/**
 * Compelling Title Service
 *
 * Replaces the old "Type - Setting, Feature" formula titles with short,
 * specific, newspaper-style headlines derived from the actual witness
 * report. Used by the ingestion engine for new reports and by the
 * backfill script (`scripts/backfill-compelling-titles.js`) for all
 * existing reports.
 *
 * Design goals:
 *   - 4 to 9 words, title case
 *   - No clickbait, no ellipses, no colon-subtitles
 *   - No hallucinated names, places, or creatures — every concrete noun
 *     must be grounded in the source description
 *   - Works as a pure "give me a headline" function; callers do not need
 *     to juggle extracted fragments
 *
 * The generator calls Claude with a prompt that forbids invention and
 * produces a single line. A lightweight post-check strips quotes,
 * trailing punctuation, and filler words, then enforces the word count.
 */

var ANTHROPIC_PRIMARY = 'claude-haiku-4-5-20251001'
var ANTHROPIC_FALLBACK = 'claude-sonnet-4-5-20250929'
var REQUEST_TIMEOUT_MS = 25000
var MAX_RETRIES = 3
var MIN_WORDS = 4
var MAX_WORDS = 10
var MAX_CHARS = 80

export interface CompellingTitleInput {
  phenomenonType?: string | null    // human-readable type, e.g., "UFO Encounter"
  category?: string | null          // taxonomy category, e.g., "ufos_aliens"
  description: string               // full witness account
  summary?: string | null           // short summary if available
  locationName?: string | null
  eventDate?: string | Date | null
}

export interface CompellingTitleResult {
  title: string | null
  model: string | null
  attempts: number
  fallbackReason?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(function(resolve) { setTimeout(resolve, ms) })
}

function formatDateStr(date: string | Date | null | undefined): string | null {
  if (!date) return null
  try {
    var d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return null
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December']
    return months[d.getMonth()] + ' ' + d.getFullYear()
  } catch (e) {
    return null
  }
}

function cleanTitle(raw: string): string {
  var s = (raw || '').trim()
  // Strip common surrounding quote characters and markdown
  s = s.replace(/^["'`\u201C\u201D\u2018\u2019*_]+/, '')
  s = s.replace(/["'`\u201C\u201D\u2018\u2019*_]+$/, '')
  // Strip leading "Title:" or "Headline:"
  s = s.replace(/^(title|headline|suggested title|answer)\s*:\s*/i, '')
  // Strip trailing period or ellipsis
  s = s.replace(/[.\u2026]+$/, '')
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function toTitleCase(s: string): string {
  var small = new Set(['a','an','the','and','but','or','nor','for','yet','so','at','by','in','of','on','to','up','as','vs','v','with','from','into','onto','over','under'])
  var words = s.split(' ')
  return words.map(function(word, i) {
    if (!word) return word
    // Preserve all-caps acronyms of 2+ letters
    if (/^[A-Z]{2,}$/.test(word)) return word
    var lower = word.toLowerCase()
    if (i !== 0 && i !== words.length - 1 && small.has(lower)) return lower
    // Handle hyphenated
    if (word.indexOf('-') !== -1) {
      return word.split('-').map(function(part) {
        if (/^[A-Z]{2,}$/.test(part)) return part
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      }).join('-')
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  }).join(' ')
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

/**
 * Best-effort client-side validation. Rejects titles that are obviously
 * unusable (empty, too short, too long, forbidden patterns). Returns
 * null if the title passes, otherwise a string explaining the problem.
 */
function validateTitle(title: string, input: CompellingTitleInput): string | null {
  if (!title) return 'empty'
  if (title.length > MAX_CHARS) return 'too_long_chars'
  var wc = wordCount(title)
  if (wc < MIN_WORDS) return 'too_few_words'
  if (wc > MAX_WORDS) return 'too_many_words'
  // Ellipses forbidden
  if (/\u2026|\.\.\./.test(title)) return 'contains_ellipsis'
  // Colon-subtitle forbidden
  if (/:/.test(title)) return 'contains_colon'
  // Quotation marks
  if (/["\u201C\u201D]/.test(title)) return 'contains_quote'
  // Obvious preamble
  if (/^(here\s+is|here's|i\s+suggest|how\s+about)/i.test(title)) return 'contains_preamble'
  // Bare category fallback — user explicitly rejected these
  var barePatterns = [
    /^UFO Encounter$/i,
    /^UFO Sighting$/i,
    /^NDE Report$/i,
    /^Near-Death Experience$/i,
    /^Out-of-Body Experience$/i,
    /^Dream Experience$/i,
    /^Deathbed Vision$/i,
    /^Prayer Experience$/i,
    /^Other Experience$/i,
    /^Pre-Birth Memory$/i,
    /^Spiritually Transformative Experience$/i,
    /^Paranormal Experience$/i,
    /^Creature Sighting$/i,
    /^Strange Experience$/i,
  ]
  for (var i = 0; i < barePatterns.length; i++) {
    if (barePatterns[i].test(title.trim())) return 'bare_category'
  }
  return null
}

async function callClaude(model: string, prompt: string, system: string): Promise<string | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[CompellingTitle] No ANTHROPIC_API_KEY found')
    return null
  }

  var controller = new AbortController()
  var timeoutId = setTimeout(function() { controller.abort() }, REQUEST_TIMEOUT_MS)
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 80,
        temperature: 0.4,
        system: system,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    })

    if (!resp.ok) {
      var errText = await resp.text()
      console.error('[CompellingTitle] API ' + resp.status + ': ' + errText.substring(0, 200))
      return null
    }

    var data = await resp.json()
    var content = data && data.content
    if (!Array.isArray(content) || content.length === 0) return null
    var block = content[0]
    if (!block || block.type !== 'text') return null
    return typeof block.text === 'string' ? block.text : null
  } catch (e: any) {
    if (e && e.name === 'AbortError') {
      console.error('[CompellingTitle] Timeout for model ' + model)
    } else {
      console.error('[CompellingTitle] Error: ' + (e && e.message ? e.message : String(e)))
    }
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

var SYSTEM_PROMPT = [
  'You write short, compelling, SPECIFIC titles for a paranormal research encyclopedia.',
  'Every title is a factual newspaper-style headline derived from the actual witness report.',
  '',
  'Rules:',
  '- 4 to 9 words total, title case',
  '- Name the most distinctive concrete element: the creature, craft shape, setting, entity,',
  '  or pivotal action from the report',
  '- Never invent names, places, dates, numbers, or creatures that are not in the source',
  '- No clickbait (no "You Won\'t Believe", no exclamation marks)',
  '- No ellipses, no quotation marks, no colons, no subtitles',
  '- Do not use the bare generic category as the full title (e.g., "UFO Encounter",',
  '  "NDE Report", "Out-of-Body Experience"). Always add the distinguishing element.',
  '- Prefer concrete nouns over abstractions (e.g., "Triangular Craft Hovers Over Highway"',
  '  beats "Strange Aerial Anomaly")',
  '- If the witness was a child, it is fine to say "Boy" / "Girl" / "Child"; do not invent ages',
  '',
  'Return ONLY the title. No quotes. No preamble. No trailing punctuation.'
].join('\n')

function buildUserPrompt(input: CompellingTitleInput): string {
  var parts: string[] = []
  if (input.phenomenonType) parts.push('Phenomenon type: ' + input.phenomenonType)
  if (input.category && !input.phenomenonType) parts.push('Category: ' + input.category)
  if (input.locationName) parts.push('Location: ' + input.locationName)
  var dateStr = formatDateStr(input.eventDate)
  if (dateStr) parts.push('Date: ' + dateStr)

  var desc = (input.description || '').trim()
  // Cap at ~3500 chars so we keep enough of the report while keeping token usage low
  if (desc.length > 3500) desc = desc.substring(0, 3500) + ' [...truncated]'
  parts.push('')
  parts.push('Witness report:')
  parts.push(desc)
  if (input.summary && input.summary.trim() && desc.indexOf(input.summary.trim()) === -1) {
    parts.push('')
    parts.push('Editor summary: ' + input.summary.trim())
  }
  parts.push('')
  parts.push('Write one compelling, specific, non-hallucinated title (4-9 words, title case, no punctuation at the end):')
  return parts.join('\n')
}

/**
 * Generate a compelling title for a report.
 * Retries up to MAX_RETRIES across primary + fallback models.
 * Returns { title: null } if every attempt fails validation.
 */
export async function generateCompellingTitle(input: CompellingTitleInput): Promise<CompellingTitleResult> {
  var userPrompt = buildUserPrompt(input)
  var models = [ANTHROPIC_PRIMARY, ANTHROPIC_FALLBACK]
  var attempts = 0
  var lastReason: string | undefined

  for (var m = 0; m < models.length; m++) {
    for (var r = 0; r < MAX_RETRIES; r++) {
      attempts++
      var raw = await callClaude(models[m], userPrompt, SYSTEM_PROMPT)
      if (!raw) {
        lastReason = 'api_error'
        await sleep(500 + r * 500)
        continue
      }
      // Take first non-empty line only
      var firstLine = raw.split('\n').map(function(l) { return l.trim() }).filter(Boolean)[0] || ''
      var cleaned = cleanTitle(firstLine)
      cleaned = toTitleCase(cleaned)
      var problem = validateTitle(cleaned, input)
      if (!problem) {
        return { title: cleaned, model: models[m], attempts: attempts }
      }
      lastReason = problem
      // On validation failure, retry with a slightly different nudge
      await sleep(200 + r * 200)
    }
  }

  return { title: null, model: null, attempts: attempts, fallbackReason: lastReason }
}
