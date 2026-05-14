/**
 * escalateDateWithHaiku — V10.8.E
 *
 * Final rung of the date-extraction ladder. Runs only when extractDate
 * returned precision='year' AND the source prose still contains a
 * recognizable month name. In that situation the regex layer saw a
 * year and bailed, but a human (or a small LLM) could read the
 * paragraph and pin down the month or full date.
 *
 * Pipeline:
 *   1. Pre-flight gate. Skip when precision != 'year', when prose
 *      lacks any month-name match, or when prose is shorter than the
 *      length floor. Free + deterministic; no LLM call.
 *   2. Haiku call. Strict JSON prompt that asks the model to return
 *      {date, precision, year_quote, month_quote?, day_quote?}. Each
 *      *_quote must be a verbatim span from the source. Temperature
 *      0 so two runs are reproducible.
 *   3. Claim-check. Verify the returned date and every *_quote is
 *      actually a substring of the source prose. If anything doesn't
 *      check out — the model halucinated — we discard the response
 *      and return the original year-precision result.
 *   4. Upgrade. On success, return a new ExtractedDate with
 *      source='haiku', precision='month' or 'exact' (according to
 *      Haiku's response), matchedText set to the concatenated quotes
 *      for forensics.
 *
 * Cost gate: pre-flight skips the call for any row that wouldn't
 * benefit. Mass-ingest of 1M rows produces ~50-100K candidates → ~$50-100
 * at Haiku rates (~$0.001/call).
 *
 * Test injection: callers can pass `haikuFn` to short-circuit the
 * Anthropic call, which keeps the test suite deterministic without
 * needing a network mock framework.
 */

import { ExtractedDate, DatePrecision } from './extract-date'

// ── Public API ────────────────────────────────────────────────────

export interface HaikuDateResponse {
  date: string                          // ISO YYYY-MM-DD
  precision: 'exact' | 'month'          // never 'year' — that's the no-op outcome
  year_quote: string                    // verbatim text proving the year
  month_quote?: string                  // verbatim text proving the month
  day_quote?: string                    // verbatim text proving the day
}

export type HaikuDateFn = (prose: string) => Promise<HaikuDateResponse | null>

export interface EscalateDateOptions {
  /** Override the Haiku call — used by tests. Default: real Anthropic API call. */
  haikuFn?: HaikuDateFn
  /** Skip if prose is shorter than this many characters. Default 200. */
  minProseChars?: number
  /** Hard upper bound on year. Default current year + 1. */
  maxYear?: number
  /** Hard lower bound on year. Default 1800. */
  minYear?: number
}

export interface EscalationResult {
  /** Final ExtractedDate to use. Either the upgraded result OR the original `current`. */
  result: ExtractedDate
  /** True when Haiku actually fired and the upgrade was accepted. */
  escalated: boolean
  /** Diagnostic when escalation was skipped or rejected. */
  reason: 'skipped-precision' | 'skipped-no-month-name' | 'skipped-too-short' |
          'haiku-null' | 'haiku-parse' | 'claim-check-failed' |
          'invalid-date' | 'upgraded'
}

const MONTH_NAME_REGEX = /\b(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|oct|nov|dec)\b/i

export async function escalateDateWithHaiku(
  prose: string | null | undefined,
  current: ExtractedDate,
  opts?: EscalateDateOptions,
): Promise<EscalationResult> {
  const options = opts || {}
  const minChars = options.minProseChars ?? 200
  const today = new Date()
  const maxYear = options.maxYear ?? today.getUTCFullYear() + 1
  const minYear = options.minYear ?? 1800

  // ── 1. Pre-flight gates (cost-free skips) ───────────────────────
  if (current.precision !== 'year') {
    return { result: current, escalated: false, reason: 'skipped-precision' }
  }
  const proseStr = (prose || '').toString()
  if (proseStr.length < minChars) {
    return { result: current, escalated: false, reason: 'skipped-too-short' }
  }
  if (!MONTH_NAME_REGEX.test(proseStr)) {
    return { result: current, escalated: false, reason: 'skipped-no-month-name' }
  }

  // ── 2. Haiku call ───────────────────────────────────────────────
  const haikuFn = options.haikuFn || defaultHaikuDateFn
  let response: HaikuDateResponse | null = null
  try {
    response = await haikuFn(proseStr)
  } catch (e) {
    response = null
  }
  if (!response) {
    return { result: current, escalated: false, reason: 'haiku-null' }
  }

  // Required fields
  if (!response.date || !response.year_quote ||
      (response.precision !== 'exact' && response.precision !== 'month')) {
    return { result: current, escalated: false, reason: 'haiku-parse' }
  }

  // ── 3. Claim-check ──────────────────────────────────────────────
  //
  // Every quoted span MUST appear verbatim in the prose. We do a
  // case-insensitive substring check on the trimmed quote because
  // models sometimes change capitalization slightly even when
  // instructed to copy verbatim. If any quote is fabricated, we
  // throw away the whole response.
  const proseLower = proseStr.toLowerCase()
  function quoteAppears(q: string | undefined): boolean {
    if (!q) return true   // optional quotes are allowed missing
    const trimmed = q.trim().toLowerCase()
    if (!trimmed) return false
    return proseLower.indexOf(trimmed) !== -1
  }
  if (!quoteAppears(response.year_quote)) {
    return { result: current, escalated: false, reason: 'claim-check-failed' }
  }
  if (response.precision === 'exact' && !quoteAppears(response.day_quote)) {
    return { result: current, escalated: false, reason: 'claim-check-failed' }
  }
  if ((response.precision === 'exact' || response.precision === 'month') && !quoteAppears(response.month_quote)) {
    return { result: current, escalated: false, reason: 'claim-check-failed' }
  }

  // ── 4. Validate date shape ──────────────────────────────────────
  const iso = response.date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!iso) {
    return { result: current, escalated: false, reason: 'invalid-date' }
  }
  const year = parseInt(iso[1], 10)
  const month = parseInt(iso[2], 10)
  const day = parseInt(iso[3], 10)
  if (year < minYear || year > maxYear) {
    return { result: current, escalated: false, reason: 'invalid-date' }
  }
  if (month < 1 || month > 12) {
    return { result: current, escalated: false, reason: 'invalid-date' }
  }
  // Day-of-month sanity (Feb 30 etc)
  const daysInMonth = new Date(year, month, 0).getUTCDate()
  if (response.precision === 'exact' && (day < 1 || day > daysInMonth)) {
    return { result: current, escalated: false, reason: 'invalid-date' }
  }

  // Refuse to "downgrade" the original year if Haiku changes it
  // entirely — the regex extractor already saw a year and Haiku is
  // only meant to add precision. Mismatched years indicate the
  // model latched onto a different date in the prose.
  const currentYear = current.date ? current.date.substring(0, 4) : ''
  if (currentYear && iso[1] !== currentYear) {
    return { result: current, escalated: false, reason: 'claim-check-failed' }
  }

  // ── 5. Build the upgraded ExtractedDate ─────────────────────────
  //
  // We rebuild the ISO string from the validated parts (rather than
  // trust the model's string) so a precision='month' answer always
  // gets the day-01 sentinel and we never write a bogus shape.
  const storedDay = response.precision === 'exact' ? day : 1
  const dateStr =
    iso[1] + '-' +
    String(month).padStart(2, '0') + '-' +
    String(storedDay).padStart(2, '0')
  const upgraded: ExtractedDate = {
    date: dateStr,
    precision: response.precision as DatePrecision,
    source: 'haiku',
    matchedText: [response.year_quote, response.month_quote, response.day_quote]
      .filter(Boolean).join(' | '),
  }
  return { result: upgraded, escalated: true, reason: 'upgraded' }
}

// ── Default Haiku caller (Anthropic API) ─────────────────────────

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const REQUEST_TIMEOUT_MS = 20_000
const MAX_RETRIES = 1

const SYSTEM_PROMPT = [
  'You upgrade year-only date extractions to month or full-date precision.',
  '',
  'Input: a paragraph of prose about a single event. The current best date guess is year-only.',
  'Goal: identify the most likely event date (the date when the experience happened), and prove it by quoting the source.',
  '',
  'CRITICAL ANTI-FABRICATION RULES:',
  '- Every quoted span MUST appear VERBATIM in the source prose. Do not paraphrase, summarize, or correct spelling.',
  '- The year you return MUST match a 4-digit year that appears in the source. Do not infer or estimate.',
  '- If you cannot find clear month evidence in the source, return null. Do not guess.',
  '- The event date is when the experience happened, NOT when the article was written, NOT when it was witnessed by someone else, NOT a historical reference.',
  '- If the source mentions multiple dates, choose the one that is most clearly framed as the event date (e.g. "happened on", "occurred", "I was there"). When in doubt, prefer the FIRST date mentioned in the narrative.',
  '',
  'OUTPUT: a single JSON object. No prose before or after. No markdown fences. Either:',
  '',
  '  {',
  '    "date": "YYYY-MM-DD",',
  '    "precision": "exact" | "month",',
  '    "year_quote": "<verbatim span from source containing the year>",',
  '    "month_quote": "<verbatim span containing the month name>",',
  '    "day_quote": "<verbatim span containing the day, only if precision=exact>"',
  '  }',
  '',
  'or, if you cannot establish month/day with verbatim evidence:',
  '',
  '  null',
  '',
  'If precision=month, omit day_quote and use day=01 in the date string.',
  'Return ONLY the JSON object or the literal null. No explanation.',
].join('\n')

export const defaultHaikuDateFn: HaikuDateFn = async function (prose) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 250,
          temperature: 0,
          system: SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: 'SOURCE PROSE:\n\n' + prose },
          ],
        }),
        signal: controller.signal,
      })
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
          continue
        }
        clearTimeout(timeoutId)
        return null
      }
      if (!resp.ok) {
        clearTimeout(timeoutId)
        return null
      }
      const data: any = await resp.json()
      clearTimeout(timeoutId)
      const text: string | undefined = data?.content?.[0]?.text
      if (!text) return null
      return parseHaikuResponse(text)
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      clearTimeout(timeoutId)
      return null
    }
  }
  return null
}

function parseHaikuResponse(raw: string): HaikuDateResponse | null {
  const trimmed = raw.trim().replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  // Explicit null reply
  if (trimmed === 'null') return null
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    const obj = JSON.parse(trimmed.substring(start, end + 1))
    if (!obj || typeof obj !== 'object') return null
    if (typeof obj.date !== 'string') return null
    if (obj.precision !== 'exact' && obj.precision !== 'month') return null
    if (typeof obj.year_quote !== 'string') return null
    return {
      date: obj.date,
      precision: obj.precision,
      year_quote: obj.year_quote,
      month_quote: typeof obj.month_quote === 'string' ? obj.month_quote : undefined,
      day_quote: typeof obj.day_quote === 'string' ? obj.day_quote : undefined,
    }
  } catch (e) {
    return null
  }
}
