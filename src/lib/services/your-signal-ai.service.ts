/**
 * Your Signal — Card 3 ("Did you know") generator
 *
 * V9.11.6 Phase 1.C — Sonnet-driven insight synthesis.
 *
 * This service takes a user's report + the three deterministic
 * payloads we've already computed (fingerprint, cluster, context)
 * and asks Sonnet 4.6 to surface ONE surprising, non-obvious
 * pattern that connects the user's experience to something the
 * archive can see and a typical reader couldn't.
 *
 * Why Sonnet and not Haiku: this is the single card where the
 * quality of the insight disproportionately drives user perception
 * of the AI. Haiku gives factual restatement; Sonnet identifies
 * surprising correlations. Cost delta at scale is ~$6K/year at
 * 100K users, deemed worth it.
 *
 * Constraints:
 *   - Documentary tone — "your report shares patterns with", never
 *     "your report exhibits". This is not diagnosis.
 *   - Every insight cites a concrete number or pattern.
 *   - No speculation about meaning or cause.
 *   - 1-2 sentences, ~30-60 words.
 *   - JSON response so we can structurally bind the supporting
 *     context number to the headline.
 *
 * SWC compat: uses var + function() form.
 */

var ANTHROPIC_MODEL_PRIMARY = 'claude-sonnet-4-6'
var ANTHROPIC_MODEL_FALLBACK = 'claude-sonnet-4-5-20250929'
var REQUEST_TIMEOUT_MS = 20000

// Sonnet 4.6 pricing as of May 2026 ($/M tokens)
var COST_INPUT_PER_M_USD = 3
var COST_OUTPUT_PER_M_USD = 15

export interface DidYouKnowPayload {
  pending?: false
  headline: string
  supporting_context: string | null
  supporting_count: number | null
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

interface GenerateInput {
  userReport: {
    title?: string | null
    description?: string | null
    summary?: string | null
    category?: string | null
    type_name?: string | null
    event_date?: string | null
    location_name?: string | null
  }
  fingerprint: any
  cluster: any
  context: any
}

var SYSTEM_PROMPT = [
  'You are a pattern analyst for Paradocs, an archive of millions of',
  'unexplained experiences (UFOs, cryptid sightings, ghost encounters,',
  'near-death experiences, ESP, and similar phenomena). Each user shares',
  'their experience and receives a personalized "Did you know" insight',
  'that connects their report to ONE surprising, non-obvious pattern in',
  'the broader archive.',
  '',
  'Your job: produce one insight in JSON. Strict rules:',
  '',
  '1. DOCUMENTARY TONE. Say "Your report shares patterns with…", "Reports',
  '   like yours peak…", or "Your experience falls inside a cluster of…".',
  '   NEVER say "you may be experiencing", "your report exhibits", or',
  '   anything diagnostic. This is documentation, not therapy.',
  '',
  '2. CITE A NUMBER OR CONCRETE PATTERN. Every insight must reference a',
  '   specific count, percentage, year range, geographic region, or',
  '   temporal pattern that is grounded in the input data. No vague',
  '   speculation.',
  '',
  '3. SURPRISING, NOT OBVIOUS. Avoid restating the obvious (e.g., "UFO',
  '   reports involve UFOs"). Surface the unexpected correlation — a',
  '   temporal coincidence, a regional clustering, a cross-category',
  '   overlap, a demographic pattern. Look between the deterministic',
  '   numbers for what they imply together.',
  '',
  '4. NO CAUSATION CLAIMS. Patterns are patterns. Do not assert WHY.',
  '   "Reports cluster in October" is fine. "Reports cluster in October',
  '   because of harvest moon energy" is not.',
  '',
  '5. LENGTH: 1-2 sentences, 30-60 words total.',
  '',
  '6. NO BOLD, italics, emoji, headers, or markdown. Plain text only.',
  '',
  '7. RESPONSE FORMAT: a single JSON object, no preamble, no code fences:',
  '   {',
  '     "headline": "1-2 sentence insight referencing concrete numbers",',
  '     "supporting_context": "1 short clause explaining how to read it,',
  '         optional, or null",',
  '     "supporting_count": <number of underlying reports referenced, or null>',
  '   }',
  '',
  '8. If the input data is too sparse to produce a meaningful insight',
  '   (e.g., no phenomenon type, no location, fewer than 5 archive',
  '   matches), respond with headline = "Your Signal is still building',
  '   as more reports cluster around yours. Check back as the archive',
  '   grows." and supporting_count = null.',
].join('\n')

function buildUserPrompt(input: GenerateInput): string {
  var r = input.userReport
  var f = input.fingerprint || {}
  var c = input.cluster || {}
  var ctx = input.context || {}

  var lines: string[] = []
  lines.push('USER REPORT:')
  if (r.type_name) lines.push('- Phenomenon type: ' + r.type_name)
  if (r.category)  lines.push('- Category: ' + r.category)
  if (r.event_date) lines.push('- Event date: ' + r.event_date)
  if (r.location_name) lines.push('- Location: ' + r.location_name)
  var desc = (r.description || r.summary || '').trim()
  if (desc) {
    if (desc.length > 600) desc = desc.substring(0, 600) + '…'
    lines.push('- Description: "' + desc + '"')
  }
  lines.push('')

  lines.push('FINGERPRINT (Card 1 data):')
  lines.push('- Primary axis: ' + (f.axis || 'unknown'))
  lines.push('- Primary label: ' + (f.primary_label || 'unknown'))
  lines.push('- Reports sharing this axis: ' + (f.primary_count != null ? f.primary_count : 'unknown'))
  lines.push('- Reports sharing phenomenon type: ' + (f.type_count != null ? f.type_count : 'unknown'))
  lines.push('- Reports sharing category: ' + (f.category_count != null ? f.category_count : 'unknown'))
  lines.push('- User has photo/video evidence: ' + (f.has_evidence ? 'yes' : 'no'))
  if (f.evidence_count != null) lines.push('- Evidenced reports archive-wide: ' + f.evidence_count)
  lines.push('')

  lines.push('CLUSTER (Card 2 data):')
  if (c.skipped) {
    lines.push('- Skipped: ' + (c.reason || 'unknown'))
  } else {
    lines.push('- Nearby reports (within ' + (c.radius_mi || 100) + ' mi): ' + (c.nearby_count != null ? c.nearby_count : 'unknown'))
    if (c.year_min && c.year_max) lines.push('- Year range of nearby reports: ' + c.year_min + '–' + c.year_max)
    if (c.dated_count) lines.push('- Dated nearby reports: ' + c.dated_count)
  }
  lines.push('')

  lines.push('ARCHIVE CONTEXT (Card 4 data):')
  if (ctx.skipped) {
    lines.push('- Skipped: ' + (ctx.reason || 'unknown'))
  } else {
    lines.push('- Reports of this ' + (ctx.label || 'classification') + ' peak in: ' + (ctx.peak_month_name || 'unknown'))
    lines.push('- Peak month share: ' + (ctx.peak_share_pct != null ? ctx.peak_share_pct + '%' : 'unknown'))
    if (ctx.user_month_name) lines.push('- User\'s event month: ' + ctx.user_month_name)
    lines.push('- User matches the peak month: ' + (ctx.user_matches_peak ? 'yes' : 'no'))
    if (ctx.sample_size) lines.push('- Sample size (dated reports of this type): ' + ctx.sample_size)
  }
  lines.push('')

  lines.push('Now produce the Did-you-know insight as a single JSON object per the system prompt.')

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
        max_tokens: 400,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!resp.ok) {
      var errText = await resp.text().catch(function () { return '' })
      console.error('[YourSignalAI] ' + resp.status + ': ' + errText.substring(0, 300))
      return { text: null, status: resp.status, usage: null }
    }
    var data = await resp.json()
    var text = (data.content && data.content[0] && data.content[0].text) || null
    return { text: text, status: 200, usage: data.usage || null }
  } catch (err: any) {
    clearTimeout(timeoutId)
    console.error('[YourSignalAI] Network/timeout: ' + (err.message || err))
    return { text: null, status: 0, usage: null }
  }
}

function parseJsonResponse(text: string): { headline?: string; supporting_context?: string | null; supporting_count?: number | null } | null {
  if (!text) return null
  // Strip code fences if Sonnet wraps response despite the rule.
  var cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    // Salvage: find the first { and the last } and try again.
    var first = cleaned.indexOf('{')
    var last = cleaned.lastIndexOf('}')
    if (first !== -1 && last !== -1 && last > first) {
      try { return JSON.parse(cleaned.substring(first, last + 1)) } catch (e2) { /* fall through */ }
    }
    console.warn('[YourSignalAI] JSON parse failed: ' + cleaned.substring(0, 200))
    return null
  }
}

/**
 * Generate the Did-you-know insight for the given user report.
 * Returns null if generation failed (no API key, network error,
 * unparseable response). The caller should fall back to the
 * { pending: true } placeholder when null is returned.
 */
export async function generateDidYouKnow(input: GenerateInput): Promise<DidYouKnowPayload | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[YourSignalAI] No ANTHROPIC_API_KEY; skipping Card 3 generation')
    return null
  }

  var systemPrompt = SYSTEM_PROMPT
  var userPrompt = buildUserPrompt(input)

  var attempt = await callSonnet(apiKey, ANTHROPIC_MODEL_PRIMARY, systemPrompt, userPrompt)
  var modelUsed = ANTHROPIC_MODEL_PRIMARY

  if (!attempt.text && attempt.status >= 500) {
    // Fall back to previous Sonnet if 4.6 is degraded.
    attempt = await callSonnet(apiKey, ANTHROPIC_MODEL_FALLBACK, systemPrompt, userPrompt)
    modelUsed = ANTHROPIC_MODEL_FALLBACK
  }

  if (!attempt.text) return null

  var parsed = parseJsonResponse(attempt.text)
  if (!parsed || !parsed.headline) {
    console.warn('[YourSignalAI] No headline in parsed response')
    return null
  }

  var inputTokens = (attempt.usage && attempt.usage.input_tokens) || 0
  var outputTokens = (attempt.usage && attempt.usage.output_tokens) || 0
  var costUsd =
    (inputTokens * COST_INPUT_PER_M_USD) / 1000000 +
    (outputTokens * COST_OUTPUT_PER_M_USD) / 1000000

  return {
    headline: parsed.headline.trim(),
    supporting_context: parsed.supporting_context || null,
    supporting_count: typeof parsed.supporting_count === 'number' ? parsed.supporting_count : null,
    model: modelUsed,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: Number(costUsd.toFixed(6)),
  }
}
