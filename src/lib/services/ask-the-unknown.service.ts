/**
 * Ask the Unknown — Personalized Q&A inside Your Signal
 *
 * V9.13 Phase 3.A — Single-turn Sonnet-backed Q&A. The user types
 * a question; we feed Sonnet (a) their report, (b) the deterministic
 * fingerprint/cluster/context payloads from /api/lab/your-signal,
 * (c) a small corpus sample of nearby/matching reports for citation
 * grounding. Sonnet answers in 80-180 words with citations to the
 * supplied corpus IDs.
 *
 * Constraints:
 *   - Documentary tone (matches the Card 3 prompt rules).
 *   - Citations ONLY to corpus IDs we supplied; never invented.
 *   - No diagnostic / therapeutic language.
 *   - No causation claims.
 *   - Refuses out-of-scope questions politely.
 *
 * SWC compat: var + function() form.
 */

var ANTHROPIC_MODEL_PRIMARY = 'claude-sonnet-4-6'
var ANTHROPIC_MODEL_FALLBACK = 'claude-sonnet-4-5-20250929'
var REQUEST_TIMEOUT_MS = 25000

// Sonnet 4.6 pricing per million tokens.
var COST_INPUT_PER_M_USD = 3
var COST_OUTPUT_PER_M_USD = 15

export interface CorpusItem {
  id: string
  slug: string
  title: string
  category?: string | null
  type_name?: string | null
  event_date?: string | null
  location?: string | null
  summary?: string | null
}

export interface AskInput {
  question: string
  userReport: {
    title?: string | null
    description?: string | null
    summary?: string | null
    category?: string | null
    type_name?: string | null
    event_date?: string | null
    location_name?: string | null
  }
  fingerprint?: any
  cluster?: any
  context?: any
  corpus: CorpusItem[]
}

export interface AskAnswer {
  answer: string
  citation_ids: string[]
  refused: boolean
  refusal_reason?: string | null
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

var SYSTEM_PROMPT = [
  'You are the personalized Ask-the-Unknown assistant inside Paradocs,',
  'an archive of millions of unexplained experiences. A signed-in user',
  'has shared their own experience and now asks YOU one question about',
  'it, similar experiences in the archive, or patterns across reports.',
  '',
  'You are given:',
  '  - The user\'s full report',
  '  - Pre-computed fingerprint / cluster / context payloads',
  '  - A small CORPUS of relevant reports with IDs you may cite',
  '',
  'Rules (strict):',
  '',
  '1. DOCUMENTARY TONE. "Reports like yours…", "The archive shows…",',
  '   "Patterns suggest…". Never "you may be experiencing", never',
  '   "your report exhibits", never anything diagnostic or therapeutic.',
  '',
  '2. CITATIONS ONLY FROM THE PROVIDED CORPUS. When you reference a',
  '   specific report, cite its ID inside square brackets — like [42a1b…].',
  '   Use up to 3 citations per answer. Do NOT invent IDs. Do NOT cite',
  '   anything outside the corpus you were given. If the corpus is empty',
  '   or doesn\'t support the answer, say so plainly.',
  '',
  '3. NO CAUSATION CLAIMS. "Reports cluster in October" — fine.',
  '   "Reports cluster in October because of harvest moon energy" —',
  '   forbidden. Patterns are patterns; causes are speculation.',
  '',
  '4. STAY IN SCOPE. The archive covers UFO/UAP, cryptids, ghosts/',
  '   hauntings, NDEs, psychic phenomena, religion-mythology, esoteric',
  '   practices, perception/sensory anomalies, consciousness practices,',
  '   psychological experiences, biological factors. If the question is',
  '   off-topic (medical advice, legal advice, current events, coding,',
  '   politics), refuse with a single sentence and offer to redirect:',
  '   set refused=true and explain in refusal_reason.',
  '',
  '5. SAFETY. If the user mentions self-harm, suicidal ideation, or',
  '   immediate crisis, refuse the analytical answer and provide a',
  '   single line directing them to a licensed mental-health',
  '   professional or local emergency services. Set refused=true,',
  '   refusal_reason="user-safety". Do NOT moralize beyond that.',
  '',
  '6. LENGTH: 80–180 words. Plain text only. No markdown, no bullets,',
  '   no headers, no emoji.',
  '',
  '7. RESPONSE FORMAT: single JSON object, no preamble, no code fences:',
  '   {',
  '     "answer": "Your 80-180 word response with inline citations like',
  '         [report_id] when referring to specific corpus items.",',
  '     "citation_ids": ["<list of report ids cited in answer, max 3>"],',
  '     "refused": <true | false>,',
  '     "refusal_reason": "<one phrase or null>"',
  '   }',
  '',
  '8. If the corpus is small or doesn\'t answer the question, say so',
  '   honestly. Do NOT fabricate facts to fill the answer.',
].join('\n')

function buildUserPrompt(input: AskInput): string {
  var r = input.userReport
  var lines: string[] = []

  lines.push('USER QUESTION:')
  lines.push(input.question.trim().substring(0, 500))
  lines.push('')

  lines.push('USER REPORT:')
  if (r.type_name) lines.push('- Phenomenon type: ' + r.type_name)
  if (r.category)  lines.push('- Category: ' + r.category)
  if (r.event_date) lines.push('- Event date: ' + r.event_date)
  if (r.location_name) lines.push('- Location: ' + r.location_name)
  var desc = (r.description || r.summary || '').trim()
  if (desc) {
    if (desc.length > 700) desc = desc.substring(0, 700) + '…'
    lines.push('- Description: "' + desc + '"')
  }
  lines.push('')

  if (input.fingerprint && !input.fingerprint.pending) {
    lines.push('FINGERPRINT (precomputed):')
    var f = input.fingerprint
    if (f.primary_label != null) lines.push('- Strongest axis: ' + f.primary_label + ' (' + (f.primary_count || 0) + ' reports)')
    if (f.type_count != null) lines.push('- Same phenomenon type: ' + f.type_count + ' reports')
    if (f.category_count != null) lines.push('- Same category: ' + f.category_count + ' reports')
    lines.push('')
  }
  if (input.cluster && !input.cluster.skipped) {
    lines.push('CLUSTER (precomputed):')
    lines.push('- Nearby reports (~' + (input.cluster.radius_mi || 100) + ' mi): ' + (input.cluster.nearby_count || 0))
    if (input.cluster.year_min && input.cluster.year_max) lines.push('- Year range: ' + input.cluster.year_min + '–' + input.cluster.year_max)
    lines.push('')
  }
  if (input.context && !input.context.skipped) {
    lines.push('ARCHIVE CONTEXT (precomputed):')
    lines.push('- Peak month for this ' + (input.context.label || 'classification') + ': ' + (input.context.peak_month_name || 'unknown') + ' (' + (input.context.peak_share_pct || 0) + '%)')
    if (input.context.user_month_name) lines.push('- User\'s event month: ' + input.context.user_month_name)
    lines.push('- Sample size: ' + (input.context.sample_size || 0))
    lines.push('')
  }

  lines.push('CORPUS (you may cite these by id):')
  if (!input.corpus || input.corpus.length === 0) {
    lines.push('(empty — no relevant reports available; answer accordingly)')
  } else {
    input.corpus.slice(0, 10).forEach(function (item: CorpusItem) {
      var bits: string[] = []
      bits.push('id=' + item.id)
      bits.push('title="' + (item.title || '').substring(0, 90) + '"')
      if (item.type_name) bits.push('type=' + item.type_name)
      if (item.event_date) bits.push('date=' + item.event_date)
      if (item.location) bits.push('loc=' + item.location)
      if (item.summary) bits.push('summary="' + item.summary.substring(0, 220).replace(/"/g, "'") + '"')
      lines.push('- ' + bits.join(' · '))
    })
  }
  lines.push('')
  lines.push('Now answer the user\'s question as a single JSON object per the system prompt.')

  return lines.join('\n')
}

async function callSonnet(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string | null; status: number; usage: any }> {
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
        model: model,
        max_tokens: 700,
        temperature: 0.5,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!resp.ok) {
      var errText = await resp.text().catch(function () { return '' })
      console.error('[AskTheUnknown] ' + resp.status + ': ' + errText.substring(0, 300))
      return { text: null, status: resp.status, usage: null }
    }
    var data = await resp.json()
    var text = (data.content && data.content[0] && data.content[0].text) || null
    return { text: text, status: 200, usage: data.usage || null }
  } catch (err: any) {
    clearTimeout(timeoutId)
    console.error('[AskTheUnknown] Network/timeout: ' + (err.message || err))
    return { text: null, status: 0, usage: null }
  }
}

function parseJson(text: string): any {
  if (!text) return null
  var cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(cleaned) } catch (e) {
    var first = cleaned.indexOf('{')
    var last = cleaned.lastIndexOf('}')
    if (first !== -1 && last !== -1 && last > first) {
      try { return JSON.parse(cleaned.substring(first, last + 1)) } catch (_) { /* fall through */ }
    }
    return null
  }
}

export async function askTheUnknown(input: AskInput): Promise<AskAnswer | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[AskTheUnknown] No ANTHROPIC_API_KEY')
    return null
  }
  if (!input.question || input.question.trim().length < 3) return null

  var systemPrompt = SYSTEM_PROMPT
  var userPrompt = buildUserPrompt(input)

  var attempt = await callSonnet(apiKey, ANTHROPIC_MODEL_PRIMARY, systemPrompt, userPrompt)
  var modelUsed = ANTHROPIC_MODEL_PRIMARY
  if (!attempt.text && attempt.status >= 500) {
    attempt = await callSonnet(apiKey, ANTHROPIC_MODEL_FALLBACK, systemPrompt, userPrompt)
    modelUsed = ANTHROPIC_MODEL_FALLBACK
  }
  if (!attempt.text) return null

  var parsed = parseJson(attempt.text)
  if (!parsed || typeof parsed.answer !== 'string') {
    console.warn('[AskTheUnknown] Unparseable response')
    return null
  }

  var allowedIds: Record<string, boolean> = {}
  ;(input.corpus || []).forEach(function (c: CorpusItem) { if (c.id) allowedIds[c.id] = true })

  var citations: string[] = Array.isArray(parsed.citation_ids) ? parsed.citation_ids : []
  // Drop any hallucinated IDs that aren't in our corpus.
  citations = citations.filter(function (id: any) { return typeof id === 'string' && allowedIds[id] }).slice(0, 3)

  var inputTokens = (attempt.usage && attempt.usage.input_tokens) || 0
  var outputTokens = (attempt.usage && attempt.usage.output_tokens) || 0
  var costUsd =
    (inputTokens * COST_INPUT_PER_M_USD) / 1000000 +
    (outputTokens * COST_OUTPUT_PER_M_USD) / 1000000

  return {
    answer: String(parsed.answer).trim(),
    citation_ids: citations,
    refused: !!parsed.refused,
    refusal_reason: parsed.refusal_reason || null,
    model: modelUsed,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: Number(costUsd.toFixed(6)),
  }
}
