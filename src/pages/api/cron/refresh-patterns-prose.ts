/**
 * GET/POST /api/cron/refresh-patterns-prose
 *
 * V11.18.4 — Sprint 1B (Hybrid freshness, Option C weekly prose pass).
 *
 * For every PUBLISHED Finding in `findings_catalogue`, re-prompt Claude
 * Haiku 4.5 for an updated `interpretive_sentence` reflecting the
 * CURRENT counts. Validates each output against the Helena banned-
 * phrase list. If validation fails, the existing prose is preserved
 * and the rejection is logged.
 *
 * Cron schedule: weekly, Sundays at 04:00 UTC (vercel.json).
 *
 * Cost: ~10 Findings × $0.005/call × 52 weeks ≈ $2.60/year.
 *
 * Auth: shares the `CRON_SECRET` convention with the other cron routes.
 *
 * Output JSON: { ok, refreshed, rejected, errors, duration_ms }.
 *
 * Important: this route does NOT recompute counts — call
 * `refresh-patterns-counts` first if you want counts to be current
 * BEFORE the prose pass. The nightly cron runs at 03:00 UTC; this
 * weekly cron runs at 04:00 UTC on Sundays, so on Sunday the count
 * refresh fires an hour before the prose refresh and the prose
 * always rides on fresh numbers.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

interface FamilyBreakdown {
  family_slug: string
  family_label: string
  count: number
  total_in_family: number
  pct: number
}

interface FindingRow {
  id: string
  slug: string
  descriptor: string
  headline: string
  phen_families: any
  denominator_n: number
  interpretive_sentence: string
}

// Mirror of BANNED_PHRASES in seed-patterns-v1.ts. Duplicated here
// (small list) to keep the cron route self-contained — no pulling in
// the seed-script side-effects via import.
//
// V11.18.6 — Sprint 1C. Removed bare 'haunting' from this list and
// replaced it with a structured `isAdjectivalHaunting()` check below.
// Rationale: 'haunting' as a NOUN ("in a haunting", "the haunting",
// "filed as a haunting") is acceptable register — it's how the
// catalogue refers to the ghost-family of accounts; it's the verb
// an archivist uses. 'haunting' as an ADJECTIVE ("haunting tale",
// "haunting silence", "haunting melody") is the goth-marketing
// register Helena vetoed. The substring match couldn't disambiguate;
// the new check does.
var BANNED = [
  'mysteriously', 'mysterious', 'unexplained', 'shocking', 'incredibly',
  'amazingly', 'fascinating', 'spooky', 'creepy', 'weird', 'bizarre',
  'eerie', 'chilling', 'strange', 'fun fact', 'did you know',
  'you might', 'you are', "you're", 'your record',
  'remarkable', 'remarkably', 'striking', 'strikingly',
]

/**
 * Reject "haunting + adjective_noun" patterns ("haunting tale",
 * "haunting silence", "haunting melody") while accepting "haunting"
 * as a noun ("in a haunting", "the haunting", "filed as a haunting")
 * and "haunted" as a past-participle adjective ("haunted location",
 * "haunted house").
 *
 * Examples (Sprint 1C unit-test-style):
 *   "in a haunting (47%)"          → PASS (noun, preceded by article)
 *   "a haunting tale"              → REJECT (adjective + noun)
 *   "in a haunted location"        → PASS (past-participle adjective)
 *   "haunting silence"             → REJECT (adjective + noun)
 *   "the haunting"                 → PASS (noun, preceded by article)
 *   "filed as a haunting"          → PASS (noun, preceded by article)
 *   "a haunting melody fell"       → REJECT (adjective + noun)
 *
 * The regex tests for "haunting" followed by one of a documented
 * list of nouns that the goth-register voice attaches it to
 * (tale, silence, melody, story, image, moment, memory, feeling,
 * sound, sight). Other syntactic environments pass.
 */
function isAdjectivalHaunting(text: string): boolean {
  return /\bhaunting\b\s+(tale|tales|silence|silences|melody|melodies|story|stories|image|images|moment|moments|memory|memories|feeling|feelings|sound|sounds|sight|sights)\b/i.test(text)
}

var HAIKU_SYSTEM = [
  'You are the editorial voice of Paradocs, a serious paranormal-research database.',
  'Write ONE 1-2 sentence editorial gloss in a documentary register.',
  '',
  'PURPOSE: Make the reader think "wait — that\'s interesting" within 5 seconds. They should',
  'finish the sentence asking themselves a question, not nodding at a statistic.',
  '',
  'STRUCTURE (pick the shape that fits the data):',
  '  - "What X witnesses describe (P%) matches what Y witnesses describe (Q%) — and shows up in Z% of [third]."',
  '  - "Three [category] families describe the same [descriptor]: [A] at P%, [B] at Q%, [C] at R%."',
  '  - "[Category A] (P%), [category B] (Q%), [category C] (R%): three different phenomenon families, one recurring [descriptor]."',
  '  - Close with the absolute count to make scale concrete: "Across NNN,NNN documented accounts, [the descriptor] is the constant."',
  '',
  'HARD RULES:',
  '  - Lead with the cross-cutting comparison. Do NOT lead with the descriptor name.',
  '  - Always include the absolute count (denominator_n) somewhere. Numbers anchor the claim.',
  '  - Under 50 words total.',
  '  - Helena-style austere: no clickbait, no buzzwords, no exclamation marks.',
  '  - BANNED words: mysteriously, mysterious, unexplained, shocking, incredibly, fascinating, spooky, eerie, chilling, strange, bizarre, weird, "did you know", "remarkable", "striking".',
  '  - No second-person ("you", "your"). Third-person archival only.',
  '  - No superlatives unless the input explicitly says "most common" / "highest"; "most consistent" is BANNED.',
  '  - Do NOT make the Vallée-style inference ("the same phenomenon", "the same entity", "evidence of"). State the structure; let the reader infer.',
  '  - Describe what witnesses describe / report / see — not the corpus\'s internal structure ("the descriptor cuts across categories" is the OLD voice; we want plain English now).',
  '',
  'OUTPUT FORMAT: Return ONLY a JSON object: {"sentence": "<text>"}. No preamble, no markdown.',
].join('\n')

function parseSentence(raw: string): string | null {
  try {
    var trimmed = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    var s = trimmed.indexOf('{')
    var e = trimmed.lastIndexOf('}')
    if (s >= 0 && e > s) {
      var obj = JSON.parse(trimmed.substring(s, e + 1))
      if (typeof obj.sentence === 'string') return obj.sentence.trim()
    }
  } catch (_e) { /* fall through */ }
  return null
}

function validateInterpretive(text: string): { ok: boolean; reason?: string } {
  if (!text) return { ok: false, reason: 'empty' }
  if (text.length > 500) return { ok: false, reason: 'too_long_chars' }
  if (/!/.test(text)) return { ok: false, reason: 'exclamation' }
  var words = text.split(/\s+/).filter(Boolean)
  if (words.length > 55) return { ok: false, reason: 'too_long_words' }
  var lower = text.toLowerCase()
  for (var i = 0; i < BANNED.length; i++) {
    if (lower.indexOf(BANNED[i]) !== -1) {
      return { ok: false, reason: 'banned:' + BANNED[i] }
    }
  }
  // V11.18.6 — structured adjectival-haunting check (replaces the bare
  // 'haunting' substring entry in the BANNED list).
  if (isAdjectivalHaunting(text)) {
    return { ok: false, reason: 'banned:adjectival_haunting' }
  }
  return { ok: true }
}

async function callHaiku(
  apiKey: string,
  row: FindingRow,
  families: FamilyBreakdown[],
): Promise<string | null> {
  var userPrompt = [
    'HEADLINE: ' + row.headline,
    'DESCRIPTOR: ' + row.descriptor,
    'FAMILY BREAKDOWN:',
    families.map(function (f) {
      return '  - ' + f.family_label + ': ' + f.pct + '% (' + f.count + ' of ' + f.total_in_family + ')'
    }).join('\n'),
    'TOTAL DOCUMENTED ACCOUNTS: ' + row.denominator_n.toLocaleString('en-US'),
    '',
    'Write the catalogue-treatment sentence per the rules. JSON only.',
  ].join('\n')

  var controller = new AbortController()
  var timeoutId = setTimeout(function () { controller.abort() }, 15000)
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        temperature: 0.3,
        system: HAIKU_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!resp.ok) {
      console.warn('[CronRefreshPatternsProse] Haiku non-2xx ' + resp.status)
      return null
    }
    var data: any = await resp.json()
    var text: string = (data?.content?.[0]?.text || '').trim()
    return parseSentence(text)
  } catch (e: any) {
    clearTimeout(timeoutId)
    console.warn('[CronRefreshPatternsProse] Haiku threw ' + (e?.message || e))
    return null
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var cronSecret = process.env.CRON_SECRET
  var authHeader = req.headers.authorization || ''
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'supabase_env_missing' })
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'anthropic_env_missing' })
  }

  var startedMs = Date.now()
  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    // V11.18.6 — Sprint 1C. The prose cron now respects the per-row
    // `prose_locked` flag (migration: 20260609_findings_catalogue_prose_locked.sql).
    // Founder sets prose_locked=true on rows with hand-edited copy
    // (shadow_figure, reunion_with_deceased, electromagnetic_disturbance,
    // sensed_presence as of Sprint 1C). Those rows are skipped entirely
    // — their interpretive_sentence is the source of truth.
    //
    // We do a single SELECT that filters out locked rows, then surface
    // the count of locked rows separately so the cron's log line is
    // honest about what it did and didn't touch.
    var listRes = await (supabase.from('findings_catalogue' as any) as any)
      .select('id, slug, descriptor, headline, phen_families, denominator_n, interpretive_sentence')
      .eq('published', true)
      .eq('prose_locked', false)
    if (listRes.error) {
      console.error('[CronRefreshPatternsProse] list error ' + listRes.error.message)
      return res.status(500).json({ error: listRes.error.message })
    }

    // Separately count locked rows for the log line. Cheap (head-only).
    var lockedCountRes = await (supabase.from('findings_catalogue' as any) as any)
      .select('id', { count: 'exact', head: true })
      .eq('published', true)
      .eq('prose_locked', true)
    var skippedLocked = Number((lockedCountRes as any).count) || 0
    if (skippedLocked > 0) {
      console.log('[CronRefreshPatternsProse] Skipping ' + skippedLocked + ' rows (prose_locked).')
    }

    var rows: FindingRow[] = (listRes.data as FindingRow[]) || []
    var refreshed = 0
    var rejected: { slug: string; reason: string }[] = []
    var errors: { slug: string; message: string }[] = []

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i]
      var families: FamilyBreakdown[] = Array.isArray(row.phen_families)
        ? (row.phen_families as FamilyBreakdown[])
        : []
      if (families.length === 0) {
        errors.push({ slug: row.slug, message: 'no phen_families' })
        continue
      }
      var newSentence = await callHaiku(ANTHROPIC_API_KEY, row, families)
      if (!newSentence) {
        errors.push({ slug: row.slug, message: 'haiku_no_response' })
        continue
      }
      var v = validateInterpretive(newSentence)
      if (!v.ok) {
        rejected.push({ slug: row.slug, reason: v.reason || 'unknown' })
        console.warn(
          '[CronRefreshPatternsProse] ' + row.slug + ' rejected: ' + v.reason + ' — preserving existing prose',
        )
        continue
      }
      var upd = await (supabase.from('findings_catalogue' as any) as any)
        .update({
          interpretive_sentence: newSentence,
          refreshed_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (upd.error) {
        errors.push({ slug: row.slug, message: upd.error.message })
      } else {
        refreshed++
        console.log('[CronRefreshPatternsProse] ' + row.slug + ' refreshed')
      }
    }

    var duration_ms = Date.now() - startedMs
    var out = {
      ok: errors.length === 0,
      refreshed: refreshed,
      skipped_locked: skippedLocked,
      rejected: rejected,
      errors: errors,
      duration_ms: duration_ms,
    }
    console.log('[CronRefreshPatternsProse] ' + JSON.stringify(out))
    return res.status(200).json(out)
  } catch (e: any) {
    console.error('[CronRefreshPatternsProse] error ' + (e?.message || e))
    return res.status(500).json({ error: 'internal_error', message: e?.message || String(e) })
  }
}
