/**
 * Your Signal — Year in Review narrative generator
 *
 * V10 Phase 4.C — given the deterministic year-stats payload,
 * asks Sonnet to write a short (60-120 word) personal narrative
 * intro that recaps the user's year in patterns. Documentary
 * tone (matches Card 3 / Ask-the-Unknown rules). No diagnosis.
 *
 * Cost per call: ~\$0.015 (Sonnet 4.6). Cache once per
 * (user, year); regenerated only when year is in progress
 * (7-day TTL at the DB layer).
 *
 * SWC compat: var + function() form.
 */

var ANTHROPIC_MODEL_PRIMARY = 'claude-sonnet-4-6'
var ANTHROPIC_MODEL_FALLBACK = 'claude-sonnet-4-5-20250929'
var REQUEST_TIMEOUT_MS = 25000
var COST_INPUT_PER_M_USD = 3
var COST_OUTPUT_PER_M_USD = 15

export interface YearStats {
  year: number
  reports_shared: number
  cluster_size_total: number
  insights_surfaced: number
  resonances_received: number
  resonances_given: number
  connections_made: number
  comments_made: number
  ask_questions: number
  top_phenomenon_type: string | null
  top_month_label: string | null
  oldest_match_year: number | null
}

export interface YearNarrative {
  intro: string
  closing: string
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

var SYSTEM_PROMPT = [
  'You write the personalized "Your Signal, Year in Review" intro',
  'and closing for users of Paradocs, an archive of millions of',
  'unexplained experiences. The user is given a deterministic stats',
  'payload from their year. Your job: produce a short narrative',
  'INTRO (40–80 words) and CLOSING (20–40 words) that contextualize',
  'their year in patterns.',
  '',
  'STRICT RULES:',
  '',
  '1. DOCUMENTARY TONE. "Your year traced a path through…", "The',
  '   archive met you with…". NEVER diagnostic or therapeutic.',
  '   Never assert what their experience MEANS — only what shape',
  '   it traced in the data.',
  '',
  '2. GROUND IN THE PROVIDED STATS. If they shared 3 reports, say',
  '   3 — not "a few." Use the numbers given. Don\'t invent any.',
  '',
  '3. NO CAUSATION. Patterns are patterns; no "because" claims',
  '   about why phenomena happen.',
  '',
  '4. NO MARKDOWN, emoji, headers, or bullets. Plain text only.',
  '',
  '5. RESPONSE FORMAT: single JSON object, no preamble, no fences:',
  '   {',
  '     "intro": "40-80 word personal opener referencing 2-3 stats",',
  '     "closing": "20-40 word forward-looking line about the next year"',
  '   }',
  '',
  '6. If the user has zero or near-zero activity (shared 0 reports,',
  '   no resonances, no connections), produce a gentle intro that',
  '   invites them to start next year — don\'t fabricate a story.',
].join('\n')

function buildUserPrompt(stats: YearStats): string {
  var lines: string[] = []
  lines.push('YEAR: ' + stats.year)
  lines.push('STATS:')
  lines.push('- Reports shared: ' + stats.reports_shared)
  lines.push('- Total reports clustered with yours: ' + stats.cluster_size_total)
  lines.push('- AI insights surfaced: ' + stats.insights_surfaced)
  lines.push('- Resonances you received: ' + stats.resonances_received)
  lines.push('- Resonances you gave: ' + stats.resonances_given)
  lines.push('- Peer connections made: ' + stats.connections_made)
  lines.push('- Comments you wrote: ' + stats.comments_made)
  lines.push('- Ask-the-Unknown questions: ' + stats.ask_questions)
  if (stats.top_phenomenon_type) lines.push('- Most-shared phenomenon type: ' + stats.top_phenomenon_type)
  if (stats.top_month_label) lines.push('- Most-active month: ' + stats.top_month_label)
  if (stats.oldest_match_year) lines.push('- Earliest archived match year: ' + stats.oldest_match_year)
  lines.push('')
  lines.push('Now produce the JSON object per system prompt rules.')
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
        max_tokens: 500,
        temperature: 0.5,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!resp.ok) {
      var errText = await resp.text().catch(function () { return '' })
      console.error('[YearInReviewAI] ' + resp.status + ': ' + errText.substring(0, 300))
      return { text: null, status: resp.status, usage: null }
    }
    var data = await resp.json()
    var text = (data.content && data.content[0] && data.content[0].text) || null
    return { text: text, status: 200, usage: data.usage || null }
  } catch (err: any) {
    clearTimeout(timeoutId)
    return { text: null, status: 0, usage: null }
  }
}

function parseJson(text: string): any {
  if (!text) return null
  var cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(cleaned) } catch (_) {
    var first = cleaned.indexOf('{')
    var last = cleaned.lastIndexOf('}')
    if (first !== -1 && last !== -1 && last > first) {
      try { return JSON.parse(cleaned.substring(first, last + 1)) } catch (__) { /* fall through */ }
    }
    return null
  }
}

export async function generateYearNarrative(stats: YearStats): Promise<YearNarrative | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  var attempt = await callSonnet(apiKey, ANTHROPIC_MODEL_PRIMARY, SYSTEM_PROMPT, buildUserPrompt(stats))
  var modelUsed = ANTHROPIC_MODEL_PRIMARY
  if (!attempt.text && attempt.status >= 500) {
    attempt = await callSonnet(apiKey, ANTHROPIC_MODEL_FALLBACK, SYSTEM_PROMPT, buildUserPrompt(stats))
    modelUsed = ANTHROPIC_MODEL_FALLBACK
  }
  if (!attempt.text) return null

  var parsed = parseJson(attempt.text)
  if (!parsed || typeof parsed.intro !== 'string' || typeof parsed.closing !== 'string') return null

  var inputTokens = (attempt.usage && attempt.usage.input_tokens) || 0
  var outputTokens = (attempt.usage && attempt.usage.output_tokens) || 0
  var costUsd =
    (inputTokens * COST_INPUT_PER_M_USD) / 1000000 +
    (outputTokens * COST_OUTPUT_PER_M_USD) / 1000000

  return {
    intro: String(parsed.intro).trim(),
    closing: String(parsed.closing).trim(),
    model: modelUsed,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: Number(costUsd.toFixed(6)),
  }
}
