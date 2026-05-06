/**
 * API Route: /api/admin/ai/generate-push-copy
 *
 * V8.3 — generates ≤90 character push notification copy for any
 * phenomenon or report. Consumed by the push delivery workstream
 * (FCM / Web Push, future).
 *
 * Anchored on the same anchor_case_hook + anchor_when content, but
 * compressed to a single notification-ready line. Leads with date
 * or place. Self-contained — never starts with the phenomenon name
 * (assumes the reader doesn't know it).
 *
 * Mirrors the generate-anchor-cases pattern:
 *   - type=phenomena (default) | type=reports
 *   - actions: stats | single | batch_missing | force_all
 *   - paginated batch with 500ms inter-call delay
 *   - sentinel write on parse failure so loop never stalls
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
var ANTHROPIC_FALLBACK = 'claude-3-5-haiku-20241022'

var SYSTEM_PROMPT = 'You write push notification copy for a paranormal investigation index. '
  + 'Each notification opens like a headline that promises one specific case in 85 characters '
  + 'or fewer (HARD CAP), with full closing punctuation INSIDE that limit. Goal: make the '
  + 'user tap to read.\n\n'
  + 'CRITICAL LENGTH RULES — your output WILL be rejected if it violates any of these:\n'
  + '- TARGET: 70-85 characters total.\n'
  + '- HARD CAP: 90 characters absolute maximum, including the closing punctuation.\n'
  + '- MAX 13 WORDS.\n'
  + '- Closing punctuation (period, question mark, exclamation, arrow "→") MUST be within '
  + 'the first 90 characters. If your sentence runs past 90, you have failed — shorten the '
  + 'framing or cut adjectives.\n'
  + '- NEVER end on an em-dash, colon, hanging clause, dependent phrase, or trailing word '
  + 'like "No", "And", "But", "yet", "with", "during". The line must read as a complete '
  + 'standalone thought.\n\n'
  + 'COUNT BEFORE ANSWERING. Mentally render your draft, count characters, then trim until '
  + 'you fit. Always prefer the shorter framing. If torn between two drafts, choose the '
  + 'shorter.\n\n'
  + 'PRIVACY (CRITICAL): NEVER use experiencer names from BFRO, NUFORC, NDERF, OBERF, Reddit, '
  + 'Erowid, or any private archive — even if a name appears in the source data. Anonymize via '
  + 'witness role or count: "a motorist", "two riders", "47 witnesses". Names of historical / '
  + 'public-figure / published-author witnesses (Patterson-Gimlin, Travis Walton, Hubel-Wiesel, '
  + 'William James) are permitted only when supplied via input. Default = anonymize.\n\n'
  + 'STRUCTURE — pick ONE pattern per output:\n'
  + 'Pattern A (date + place + claim):  "[Year/era], [place]: [witness role] [verb] [claim]."\n'
  + 'Pattern B (place + date + claim):  "[Place], [year]: [witness count] [verb] [claim]."\n'
  + 'Pattern C (era + scope + claim):   "Since [era]: [count] [verb] [claim]."\n\n'
  + 'GOOD EXAMPLES (all 70-85 chars, all complete clauses):\n'
  + '"October 1934, Loch Ness: a surgeon photographed a 60-foot silhouette." (68 chars)\n'
  + '"On this day, 1947: the Roswell Daily Record retracted its UFO headline." (72 chars)\n'
  + '"Phoenix, 1997: thousands saw a mile-wide V pass silently overhead." (66 chars)\n'
  + '"Pacific NW, 1967: 59 seconds of 16mm film no costume has matched." (66 chars)\n'
  + '"Vienna, 1770s: a physician induced paralysis relief via suggestion alone." (74 chars)\n\n'
  + 'BAD EXAMPLES (would be rejected):\n'
  + '"Vienna, 1936: a hematologist found platelets that broke every rule of blood clotting" '
  + '(85 chars, NO closing period — missing terminator)\n'
  + '"1880s London: a medium’s forearms bore legible text during sealed séances—no pen, no" '
  + '(86 chars, ends mid-clause on "no")\n\n'
  + 'OTHER RULES:\n'
  + '- NO leading phenomenon name. Reader does not know what "Bigfoot" is — they need a hook.\n'
  + '- NO banned words: mysterious, unexplained as adjective at start, shocking, terrifying, '
  + 'eerie, chilling, haunting, bizarre, strange.\n'
  + '- Past tense for the case description.\n'
  + '- Use specific numbers, places, or dates whenever possible — they earn the read.\n\n'
  + 'Return ONLY the single line of push copy. No preamble, no explanation, no quotes around it.'

function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey)
}

function buildPhenomenonPrompt(p: any): string {
  var parts: string[] = []
  if (p.name) parts.push('Name: ' + p.name)
  if (p.category) parts.push('Category: ' + p.category)
  if (p.anchor_when) parts.push('When: ' + p.anchor_when)
  if (p.anchor_where) parts.push('Where: ' + p.anchor_where)
  if (p.anchor_witness) parts.push('Witness: ' + p.anchor_witness)
  if (p.anchor_case_hook) parts.push('\nAnchor case hook:\n' + p.anchor_case_hook)
  if (p.unresolved_tension) parts.push('\nUnresolved tension:\n' + p.unresolved_tension)
  if (p.feed_hook && !p.anchor_case_hook) parts.push('\nFeed hook:\n' + p.feed_hook)
  if (p.ai_summary && !p.anchor_case_hook) {
    var s = p.ai_summary.length > 800 ? p.ai_summary.substring(0, 800) + '...' : p.ai_summary
    parts.push('\nSummary:\n' + s)
  }
  return parts.join('\n')
}

function buildReportPrompt(r: any): string {
  var parts: string[] = []
  if (r.title) parts.push('Title: ' + r.title)
  if (r.category) parts.push('Category: ' + r.category)
  if (r.source_label) parts.push('Source: ' + r.source_label)
  if (r.anchor_when) parts.push('When: ' + r.anchor_when)
  if (r.anchor_where) parts.push('Where: ' + r.anchor_where)
  if (r.anchor_witness) parts.push('Witness: ' + r.anchor_witness)
  if (r.anchor_case_hook) parts.push('\nAnchor case hook:\n' + r.anchor_case_hook)
  if (r.unresolved_tension) parts.push('\nUnresolved tension:\n' + r.unresolved_tension)
  if (r.feed_hook && !r.anchor_case_hook) parts.push('\nFeed hook:\n' + r.feed_hook)
  if (r.summary && !r.anchor_case_hook) {
    var s = r.summary.length > 800 ? r.summary.substring(0, 800) + '...' : r.summary
    parts.push('\nSummary:\n' + s)
  }
  return parts.join('\n')
}

async function callClaudeOnce(userPrompt: string, additionalSystem?: string): Promise<string | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[PushCopy] No ANTHROPIC_API_KEY found')
    return null
  }
  var models = [ANTHROPIC_MODEL, ANTHROPIC_FALLBACK]
  var sysText = additionalSystem ? SYSTEM_PROMPT + '\n\n' + additionalSystem : SYSTEM_PROMPT
  for (var i = 0; i < models.length; i++) {
    try {
      var response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: models[i],
          max_tokens: 200,
          system: sysText,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
      if (response.ok) {
        var data = await response.json()
        var text = data.content && data.content[0] ? data.content[0].text : null
        return text ? text.trim() : null
      }
      if (response.status === 404 && i < models.length - 1) continue
      console.error('[PushCopy] API error:', response.status)
      return null
    } catch (err) {
      console.error('[PushCopy] Request failed:', err)
      if (i < models.length - 1) continue
      return null
    }
  }
  return null
}

// V8.3.4 — retry-on-overshoot wrapper. Claude Haiku doesn't reliably
// count characters; first drafts often overshoot. If output is > 95
// chars, retry once with explicit "previous was X chars, write a
// 70-char version" instruction. Adds ~30% cost on overshoot rows in
// exchange for clean copy.
async function callClaude(userPrompt: string): Promise<string | null> {
  var first = await callClaudeOnce(userPrompt)
  if (!first) return null
  // Strip surrounding quotes for length check
  var firstClean = first.trim()
  if (firstClean.length >= 2 && (firstClean[0] === '"' || firstClean[0] === "'")) {
    var last = firstClean[firstClean.length - 1]
    if (last === firstClean[0]) firstClean = firstClean.substring(1, firstClean.length - 1)
  }
  // Already clean enough — return as-is
  if (firstClean.length <= 90) return first

  // Overshoot — retry once with a stronger length constraint
  var retrySystem = 'YOUR PREVIOUS ATTEMPT WAS ' + firstClean.length + ' CHARACTERS, WHICH IS TOO LONG. '
    + 'Write a NEW version that is 70 characters or fewer. Drop adjectives, drop the "since" '
    + 'framing if needed, drop one of the place / date / count details. The output must end in '
    + 'a period within the first 80 characters. Previous attempt for reference (DO NOT just '
    + 'truncate it):\n"' + firstClean + '"\n\nReturn ONLY the new shorter line.'
  var second = await callClaudeOnce(userPrompt, retrySystem)
  if (!second) return first  // Retry failed, use first attempt + cleanCopy fallback
  return second
}

// Strip outer quotes + truncate cleanly if the model overshoots 90.
// Truncation prefers sentence-boundary cuts (period / question mark /
// em-dash / arrow) over word-boundary cuts so we never end on a hanging
// word like "No" or "And".
function cleanCopy(raw: string): string {
  var s = raw.trim()
  // Strip surrounding quotes
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'")) {
    var last = s[s.length - 1]
    if (last === s[0]) s = s.substring(1, s.length - 1)
  }
  // If under 90 we're done
  if (s.length <= 90) return s

  // Look for the last sentence-terminating punctuation within the first 90
  // chars. Acceptable terminators: period, question mark, em-dash followed by
  // a non-space (rare in practice), arrow.
  var window = s.substring(0, 90)
  var sentenceTerminators = ['.', '?', '!', '→']
  var bestCut = -1
  for (var ti = 0; ti < sentenceTerminators.length; ti++) {
    var idx = window.lastIndexOf(sentenceTerminators[ti])
    if (idx > bestCut) bestCut = idx
  }
  // Require terminator after at least 30 chars to avoid degenerate cuts
  if (bestCut >= 30) {
    return s.substring(0, bestCut + 1)
  }
  // No good sentence break — fall back to word boundary with ellipsis
  var trimmed = s.substring(0, 86)
  var lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace > 40) trimmed = trimmed.substring(0, lastSpace)
  return trimmed + '…'
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth — same pattern as generate-anchor-cases.
  var adminKey = req.headers['x-admin-key']
  if (adminKey !== process.env.ADMIN_API_KEY) {
    var authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    var userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    var { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  var supabase = getSupabaseAdmin()
  var action = (req.query && (req.query.action as string)) ||
               (req.body && req.body.action) ||
               'batch_missing'

  var rawType = (req.query && (req.query.type as string)) ||
                (req.body && req.body.type) ||
                'phenomena'
  var type: 'phenomena' | 'reports' = rawType === 'reports' ? 'reports' : 'phenomena'
  var tableName = type === 'reports' ? 'reports' : 'phenomena'
  var orderField = type === 'reports' ? 'event_date' : 'report_count'
  var nameField = type === 'reports' ? 'title' : 'name'
  var selectFields = type === 'reports'
    ? 'id, title, category, source_label, summary, feed_hook, anchor_case_hook, anchor_when, anchor_where, anchor_witness, unresolved_tension'
    : 'id, name, category, ai_summary, feed_hook, anchor_case_hook, anchor_when, anchor_where, anchor_witness, unresolved_tension, report_count'

  // ---- Stats ----
  if (action === 'stats') {
    var { count: total } = await supabase
      .from(tableName)
      .select('id', { count: 'exact', head: true })
    var { count: withCopy } = await supabase
      .from(tableName)
      .select('id', { count: 'exact', head: true })
      .not('push_copy', 'is', null)
    return res.status(200).json({
      type: type,
      total: total || 0,
      with_push_copy: withCopy || 0,
      missing: (total || 0) - (withCopy || 0),
      coverage: total ? Math.round(((withCopy || 0) / total) * 100) + '%' : '0%',
    })
  }

  // ---- Single ----
  if (action === 'single') {
    var rowId = req.body.id
    if (!rowId) return res.status(400).json({ error: 'Missing id' })

    var { data: row } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', rowId)
      .single()
    if (!row) return res.status(404).json({ error: type + ' not found' })

    var prompt = type === 'reports' ? buildReportPrompt(row) : buildPhenomenonPrompt(row)
    var raw = await callClaude(prompt)
    if (!raw) return res.status(500).json({ error: 'Failed to generate push copy' })

    var copy = cleanCopy(raw)
    await supabase.from(tableName).update({ push_copy: copy }).eq('id', rowId)
    return res.status(200).json({
      id: rowId,
      name: (row as any)[nameField],
      push_copy: copy,
      length: copy.length,
    })
  }

  // ---- Batch missing OR force_all ----
  var batchSize = parseInt((req.query.limit as string) || '0', 10) ||
                  (req.body && req.body.batch_size) || 25
  var offset = parseInt((req.query.offset as string) || '0', 10) ||
               (req.body && req.body.offset) || 0
  var delay = (req.body && req.body.delay_ms) || 500

  var query = supabase
    .from(tableName)
    .select(selectFields)
    .order(orderField, { ascending: false, nullsFirst: false })
    .range(offset, offset + batchSize - 1)

  if (action !== 'force_all') {
    query = query.is('push_copy', null)
  }

  var { data: missing } = await query

  if (!missing || missing.length === 0) {
    return res.status(200).json({ message: 'All ' + type + ' have push copy', generated: 0 })
  }

  var results: { id: string; name: string; success: boolean; copy?: string; length?: number }[] = []

  for (var j = 0; j < missing.length; j++) {
    var p = missing[j] as any
    var userPrompt = type === 'reports' ? buildReportPrompt(p) : buildPhenomenonPrompt(p)
    var rawCopy = await callClaude(userPrompt)

    if (rawCopy) {
      var cleaned = cleanCopy(rawCopy)
      await supabase.from(tableName).update({ push_copy: cleaned }).eq('id', p.id)
      results.push({ id: p.id, name: p[nameField], success: true, copy: cleaned, length: cleaned.length })
    } else {
      // Sentinel so the row exits IS NULL filter and loop continues.
      await supabase.from(tableName).update({ push_copy: '__NEEDS_REVIEW__' }).eq('id', p.id)
      results.push({ id: p.id, name: p[nameField], success: false })
    }

    if (j < missing.length - 1 && delay > 0) {
      await new Promise(function (resolve) { setTimeout(resolve, delay) })
    }
  }

  var successCount = results.filter(function (r) { return r.success }).length

  return res.status(200).json({
    type: type,
    generated: successCount,
    failed: results.length - successCount,
    total_processed: results.length,
    results: results,
  })
}
