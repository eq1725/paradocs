/**
 * extractDate — V10.8.A unified date extractor for ingestion adapters.
 *
 * Replaces 15 ad-hoc per-adapter date parsers with one cascading
 * priority chain:
 *
 *   1. structured field (passed by the adapter; e.g. OBERF "Date of
 *      Experience", NUFORC "Occurred", BFRO "DATE", etc.)
 *   2. prose month-name extraction ★ killer new capability — captures
 *      "On April 28th 2007" forms that the previous year-only regex
 *      threw away. Handles US ("April 28, 2007") and UK ("28 April
 *      2007") orders.
 *   3. prose numeric date — MM/DD/YYYY and YYYY-MM-DD embedded in
 *      narrative text.
 *   4. prose relative — "yesterday", "last night", "three days ago",
 *      "last month", etc. Requires a `referenceDate` option (typically
 *      the post's publication timestamp) to anchor the resolution.
 *      Skipped when no referenceDate is supplied.
 *   5. prose year-only — `(18|19|20)\d\d` with date-like context
 *      (preceded by "in"/"around"/"during"/"since" or followed by
 *      punctuation) so it doesn't hit "1,200 reports".
 *
 * Approximate markers ("circa", "around", "approximately", "early
 * 2000s") set `approximate=true` and may degrade precision (e.g.
 * "early 2000s" → year 2002, approximate).
 *
 * Returns audit fields (`source`, `matchedText`) so the ingest engine
 * can record how it arrived at any given date in `ingestion_audit`.
 *
 * NOTE: month/year-only precisions still populate `date` with a
 * sentinel-day-of-month / sentinel-month-and-day so the column stays
 * a real DATE. Consumers MUST consult `precision` before rendering;
 * see ReportMeta.formatWhen (V10.7.I).
 */

export type DatePrecision = 'exact' | 'month' | 'year' | 'unknown'

export type DateExtractionSource =
  | 'structured'         // parsed from the source's structured date field
  | 'prose-monthname'    // "April 28, 2007" / "28 April 2007" / "April 2007"
  | 'prose-numeric'      // MM/DD/YYYY or YYYY-MM-DD embedded in prose
  | 'prose-relative'     // "yesterday", "last night", "three days ago" — needs referenceDate
  | 'prose-year'         // bare year with date-like context
  | 'haiku'              // V10.8.E — Haiku-assisted upgrade of a year-only result
  | 'none'

export interface ExtractedDate {
  /** ISO YYYY-MM-DD. Always populated when precision != 'unknown' (day/month sentinels at lower precisions). */
  date: string | null
  precision: DatePrecision
  /** Where in the cascade we found this — audit trail. */
  source: DateExtractionSource
  /** The substring that matched, for debugging the regex layer. */
  matchedText?: string
  /** True if approximate markers ('circa', 'around', 'early 2000s') were present. */
  approximate?: boolean
}

export interface ExtractDateOptions {
  /**
   * Pre-cleaned structured field value (e.g. OBERF 'Date of Experience').
   * Tried first — when present and parseable it always wins over prose.
   */
  structured?: string | null
  /** Free-form prose. Scanned only if structured is missing or unparseable. */
  prose?: string | null
  /** Cap the year — defaults to current year + 1. */
  maxYear?: number
  /** Floor the year — defaults to 1800. */
  minYear?: number
  /**
   * Anchor for relative date phrases ("yesterday", "last night", "3 days
   * ago"). Typically the source post's publication timestamp. Without
   * this, the prose-relative layer is skipped entirely.
   */
  referenceDate?: Date | string
}

// ── Month name tables ──────────────────────────────────────────────

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

const MONTH_ABBR = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]

// Map any spelling back to a 1-12 month number.
const MONTH_LOOKUP: Record<string, number> = {}
MONTH_NAMES.forEach((m, i) => { MONTH_LOOKUP[m] = i + 1 })
MONTH_ABBR.forEach(m => {
  // jan→1, feb→2, ..., sep & sept→9
  if (m === 'sept') { MONTH_LOOKUP[m] = 9; return }
  const idx = MONTH_NAMES.findIndex(n => n.startsWith(m))
  if (idx >= 0) MONTH_LOOKUP[m] = idx + 1
})

// Regex helpers — built once, reused.
const MONTH_ALT = '(?:' + Object.keys(MONTH_LOOKUP).join('|') + ')'

// Tokens that look like "April" but aren't a real month reference.
// Triggered when one of these immediately precedes/follows a matched
// month and the month is NOT near a 4-digit year.
const MONTH_STOPWORDS_BEFORE: ReadonlyArray<string> = [
  'fool', "fool's", 'fools', 'fresh', 'mayor', 'mays',
]
const MONTH_STOPWORDS_AFTER: ReadonlyArray<string> = [
  "fool's", 'fools', 'showers', 'flowers', 'day',
]

// ── Public entry point ────────────────────────────────────────────

export function extractDate(opts: ExtractDateOptions): ExtractedDate {
  const today = new Date()
  const maxYear = opts.maxYear ?? today.getUTCFullYear() + 1
  const minYear = opts.minYear ?? 1800

  // 1. Structured field — tried first; absent or unparseable falls through.
  if (opts.structured && opts.structured.trim().length > 0) {
    const struct = parseStructured(opts.structured.trim(), minYear, maxYear)
    if (struct) return struct
  }

  // 2-4. Prose cascade.
  if (opts.prose && opts.prose.trim().length > 0) {
    const prose = opts.prose

    // Detect approximate markers up front — they apply to whatever we
    // ultimately extract (or degrade precision when we extract a year
    // from "early 2000s").
    const approxResult = detectApproximate(prose, minYear, maxYear)

    // 2. Month-name prose extraction (highest-precision prose path)
    const mn = extractProseMonthName(prose, minYear, maxYear)
    if (mn) {
      if (approxResult) mn.approximate = true
      return mn
    }

    // 3. Numeric date in prose
    const numeric = extractProseNumeric(prose, minYear, maxYear)
    if (numeric) {
      if (approxResult) numeric.approximate = true
      return numeric
    }

    // 4. Relative date in prose ("yesterday", "last night", "3 days ago").
    // Only fires when a referenceDate was supplied (otherwise we have
    // nothing to anchor against).
    if (opts.referenceDate) {
      const ref = opts.referenceDate instanceof Date
        ? opts.referenceDate
        : new Date(opts.referenceDate)
      if (Number.isFinite(ref.getTime())) {
        const relative = extractProseRelative(prose, ref, minYear, maxYear)
        if (relative) {
          if (approxResult) relative.approximate = true
          return relative
        }
      }
    }

    // 5. Year-only with date-like context (or from "early 2000s")
    if (approxResult) return approxResult
    const year = extractProseYear(prose, minYear, maxYear)
    if (year) return year
  }

  return { date: null, precision: 'unknown', source: 'none' }
}

// ── Structured-field parser ────────────────────────────────────────

function parseStructured(raw: string, minYear: number, maxYear: number): ExtractedDate | null {
  const trimmed = raw.trim().replace(/\s+\(.*\)\s*$/, '')  // strip trailing "(approximate)" etc.

  // ISO YYYY-MM-DD
  let m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (m) {
    return buildFromYMD(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), minYear, maxYear, 'structured', m[0])
  }

  // ISO YYYY-MM
  m = trimmed.match(/^(\d{4})-(\d{1,2})$/)
  if (m) {
    return buildFromYMD(parseInt(m[1], 10), parseInt(m[2], 10), 0, minYear, maxYear, 'structured', m[0])
  }

  // US numeric MM/DD/YYYY, M/D/YY, with optional time tail
  m = trimmed.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/)
  if (m) {
    let month = parseInt(m[1], 10)
    let day = parseInt(m[2], 10)
    let year = parseInt(m[3], 10)
    if (year < 100) year = year < 50 ? 2000 + year : 1900 + year
    // Heuristic: if month > 12 and day <= 12, looks like DD/MM/YYYY (UK form)
    if (month > 12 && day <= 12) { const t = month; month = day; day = t }
    return buildFromYMD(year, month, day, minYear, maxYear, 'structured', m[0])
  }

  // Month name forms in structured
  const mn = extractProseMonthName(trimmed, minYear, maxYear, /* anchored */ true)
  if (mn) return { ...mn, source: 'structured' }

  // Year only
  m = trimmed.match(/^(\d{4})$/)
  if (m) {
    const year = parseInt(m[1], 10)
    if (year < minYear || year > maxYear) return null
    return { date: year + '-01-01', precision: 'year', source: 'structured', matchedText: m[0] }
  }

  return null
}

// ── Prose month-name extractor (the V10.8.A killer feature) ───────

function extractProseMonthName(
  text: string,
  minYear: number,
  maxYear: number,
  anchored = false,
): ExtractedDate | null {
  const flags = 'i' + (anchored ? '' : 'g')

  // US form: (on|in)? Month D(st|nd|rd|th)? (,)? YYYY
  const usForm = new RegExp(
    (anchored ? '^' : '\\b') +
    '(?:on\\s+|in\\s+|since\\s+|around\\s+|circa\\s+|about\\s+)?' +
    '(' + MONTH_ALT + ')' +
    '\\s+(\\d{1,2})(?:st|nd|rd|th)?' +
    '(?:,)?\\s+' +
    '(\\d{4})' +
    (anchored ? '\\s*$' : '\\b'),
    flags,
  )
  const usMatch = firstMatch(text, usForm)
  if (usMatch) {
    const month = MONTH_LOOKUP[usMatch[1].toLowerCase()]
    const day = parseInt(usMatch[2], 10)
    const year = parseInt(usMatch[3], 10)
    if (year >= minYear && year <= maxYear && month && day >= 1 && day <= 31 &&
        !isStopwordMonth(text, usMatch.index!, usMatch[0])) {
      const result = buildFromYMD(year, month, day, minYear, maxYear, 'prose-monthname', usMatch[0])
      if (result) return result
    }
  }

  // UK form: (on|in)? D(st|nd|rd|th)? Month (,)? YYYY
  const ukForm = new RegExp(
    (anchored ? '^' : '\\b') +
    '(?:on\\s+|in\\s+|since\\s+|around\\s+|circa\\s+|about\\s+)?' +
    '(\\d{1,2})(?:st|nd|rd|th)?' +
    '\\s+(' + MONTH_ALT + ')' +
    '(?:,)?\\s+' +
    '(\\d{4})' +
    (anchored ? '\\s*$' : '\\b'),
    flags,
  )
  const ukMatch = firstMatch(text, ukForm)
  if (ukMatch) {
    const day = parseInt(ukMatch[1], 10)
    const month = MONTH_LOOKUP[ukMatch[2].toLowerCase()]
    const year = parseInt(ukMatch[3], 10)
    if (year >= minYear && year <= maxYear && month && day >= 1 && day <= 31 &&
        !isStopwordMonth(text, ukMatch.index!, ukMatch[0])) {
      const result = buildFromYMD(year, month, day, minYear, maxYear, 'prose-monthname', ukMatch[0])
      if (result) return result
    }
  }

  // Month + year only: "April 2007", "in April, 2007"
  const monthYearForm = new RegExp(
    (anchored ? '^' : '\\b') +
    '(?:on\\s+|in\\s+|since\\s+|around\\s+|circa\\s+|about\\s+)?' +
    '(' + MONTH_ALT + ')' +
    '(?:,)?\\s+(\\d{4})' +
    (anchored ? '\\s*$' : '\\b'),
    flags,
  )
  const myMatch = firstMatch(text, monthYearForm)
  if (myMatch) {
    const month = MONTH_LOOKUP[myMatch[1].toLowerCase()]
    const year = parseInt(myMatch[2], 10)
    if (year >= minYear && year <= maxYear && month &&
        !isStopwordMonth(text, myMatch.index!, myMatch[0])) {
      const monthPad = String(month).padStart(2, '0')
      return { date: year + '-' + monthPad + '-01', precision: 'month', source: 'prose-monthname', matchedText: myMatch[0] }
    }
  }

  return null
}

// ── Prose numeric extractor ──────────────────────────────────────

function extractProseNumeric(text: string, minYear: number, maxYear: number): ExtractedDate | null {
  // ISO embedded in prose
  let m = firstMatch(text, /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)
  if (m) {
    const r = buildFromYMD(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), minYear, maxYear, 'prose-numeric', m[0])
    if (r) return r
  }

  // US numeric in prose: MM/DD/YYYY or M/D/YY
  m = firstMatch(text, /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)
  if (m) {
    let month = parseInt(m[1], 10)
    let day = parseInt(m[2], 10)
    let year = parseInt(m[3], 10)
    if (year < 100) year = year < 50 ? 2000 + year : 1900 + year
    if (month > 12 && day <= 12) { const t = month; month = day; day = t }
    const r = buildFromYMD(year, month, day, minYear, maxYear, 'prose-numeric', m[0])
    if (r) return r
  }

  return null
}

// ── Prose relative-date extractor (anchored to referenceDate) ────

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

function extractProseRelative(
  text: string,
  ref: Date,
  minYear: number,
  maxYear: number,
): ExtractedDate | null {
  // Use only the first 1500 chars of prose — relative phrases are
  // overwhelmingly opening-paragraph framing, and scanning the entire
  // body invites false positives (e.g. "last week" elsewhere).
  const scan = text.slice(0, 1500)

  // 1. "yesterday" → ref - 1 day, exact precision
  if (/\byesterday\b/i.test(scan)) {
    return relativeResult(ref, -1, 'day', 'yesterday', minYear, maxYear, 'exact')
  }

  // 2. "last night" → ref - 1 day, exact precision (same calendar day as yesterday)
  const lastNight = scan.match(/\blast\s+night\b/i)
  if (lastNight) {
    return relativeResult(ref, -1, 'day', lastNight[0], minYear, maxYear, 'exact')
  }

  // 3. "today" / "this morning" / "this afternoon" / "this evening" → ref, exact
  const today = scan.match(/\b(today|this\s+(?:morning|afternoon|evening))\b/i)
  if (today) {
    return relativeResult(ref, 0, 'day', today[0], minYear, maxYear, 'exact')
  }

  // 4. "tonight" → ref, exact
  if (/\btonight\b/i.test(scan)) {
    return relativeResult(ref, 0, 'day', 'tonight', minYear, maxYear, 'exact')
  }

  // 5. "last week" → ref - 7 days, exact precision
  const lastWeek = scan.match(/\blast\s+week\b/i)
  if (lastWeek) {
    return relativeResult(ref, -7, 'day', lastWeek[0], minYear, maxYear, 'exact')
  }

  // 6. "last month" → ref - 1 month, month precision
  const lastMonth = scan.match(/\blast\s+month\b/i)
  if (lastMonth) {
    return relativeResult(ref, -1, 'month', lastMonth[0], minYear, maxYear, 'month')
  }

  // 7. "last year" → ref - 1 year, year precision
  const lastYear = scan.match(/\blast\s+year\b/i)
  if (lastYear) {
    return relativeResult(ref, -1, 'year', lastYear[0], minYear, maxYear, 'year')
  }

  // 8. "<n> <unit>s ago" — supports word numbers ("three days ago") and digits ("3 days ago").
  // "a few days ago" → 3 days. "a couple <unit>s ago" → 2.
  const fewMatch = scan.match(/\ba\s+few\s+(days?|weeks?|months?|years?)\s+ago\b/i)
  if (fewMatch) {
    const unit = unitToCanonical(fewMatch[1])
    const precision: DatePrecision = unit === 'day' ? 'exact' : unit === 'month' ? 'month' : unit === 'year' ? 'year' : 'exact'
    return relativeResult(ref, -3, unit, fewMatch[0], minYear, maxYear, precision)
  }
  const coupleMatch = scan.match(/\ba\s+couple\s+(?:of\s+)?(days?|weeks?|months?|years?)\s+ago\b/i)
  if (coupleMatch) {
    const unit = unitToCanonical(coupleMatch[1])
    const precision: DatePrecision = unit === 'day' ? 'exact' : unit === 'month' ? 'month' : unit === 'year' ? 'year' : 'exact'
    return relativeResult(ref, -2, unit, coupleMatch[0], minYear, maxYear, precision)
  }
  const nAgo = scan.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?|months?|years?)\s+ago\b/i)
  if (nAgo) {
    const raw = nAgo[1].toLowerCase()
    const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : (WORD_NUMBERS[raw] ?? null)
    if (n !== null && n > 0 && n < 200) {
      const unit = unitToCanonical(nAgo[2])
      const precision: DatePrecision = unit === 'day' ? 'exact' : unit === 'week' ? 'exact' : unit === 'month' ? 'month' : 'year'
      return relativeResult(ref, -n, unit, nAgo[0], minYear, maxYear, precision)
    }
  }

  return null
}

type RelUnit = 'day' | 'week' | 'month' | 'year'

function unitToCanonical(raw: string): RelUnit {
  const lower = raw.toLowerCase()
  if (lower.startsWith('day')) return 'day'
  if (lower.startsWith('week')) return 'week'
  if (lower.startsWith('month')) return 'month'
  return 'year'
}

function relativeResult(
  ref: Date,
  delta: number,
  unit: RelUnit,
  matched: string,
  minYear: number,
  maxYear: number,
  precision: DatePrecision,
): ExtractedDate | null {
  // Operate on a UTC-anchored copy so DST / local-zone drift doesn't
  // shift "yesterday" by a day.
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()))
  if (unit === 'day') d.setUTCDate(d.getUTCDate() + delta)
  else if (unit === 'week') d.setUTCDate(d.getUTCDate() + delta * 7)
  else if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + delta)
  else if (unit === 'year') d.setUTCFullYear(d.getUTCFullYear() + delta)

  const year = d.getUTCFullYear()
  if (year < minYear || year > maxYear) return null

  let month = d.getUTCMonth() + 1
  let day = d.getUTCDate()
  if (precision === 'month') day = 1
  else if (precision === 'year') { month = 1; day = 1 }

  const iso = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
  return { date: iso, precision, source: 'prose-relative', matchedText: matched }
}

// ── Prose year-only extractor ────────────────────────────────────

function extractProseYear(text: string, minYear: number, maxYear: number): ExtractedDate | null {
  // Year preceded by a date-context preposition or followed by punctuation
  // so we don't hit "1,200 reports" or random 4-digit numbers.
  const contextual = firstMatch(
    text,
    /(?:in|around|during|since|circa|about|approximately|before|after|by)\s+(\d{4})\b/gi,
  )
  if (contextual) {
    const year = parseInt(contextual[1], 10)
    if (year >= minYear && year <= maxYear) {
      return { date: year + '-01-01', precision: 'year', source: 'prose-year', matchedText: contextual[0] }
    }
  }

  // Year followed by sentence/clause punctuation
  const punct = firstMatch(text, /\b(\d{4})\s*[.,;:]/g)
  if (punct) {
    const year = parseInt(punct[1], 10)
    if (year >= minYear && year <= maxYear && !looksLikeCount(text, punct.index!)) {
      return { date: year + '-01-01', precision: 'year', source: 'prose-year', matchedText: punct[1] }
    }
  }

  return null
}

// ── Approximate-marker detection (decade phrases) ─────────────────

function detectApproximate(text: string, minYear: number, maxYear: number): ExtractedDate | null {
  // "early/mid/late <decade>s" — accepts both 4-digit ("late 1990s")
  // and 2-digit ("late 90s") decade forms. Emits a year inside the
  // decade window with precision='year' and approximate=true.
  //   early → start + 2 (e.g. early 90s → 1992)
  //   mid   → start + 5 (e.g. mid 70s → 1975)
  //   late  → start + 7 (e.g. late 90s → 1997)
  const decade = firstMatch(text, /\b(early|mid|late)[\s-]+(\d{2,4})s\b/gi)
  if (decade) {
    const phase = decade[1].toLowerCase()
    let decadeStart = parseInt(decade[2], 10)
    if (decadeStart < 100) decadeStart = decadeStart < 50 ? 2000 + decadeStart : 1900 + decadeStart
    if (decadeStart >= minYear && decadeStart <= maxYear) {
      const year =
        phase === 'early' ? decadeStart + 2 :
        phase === 'mid'   ? decadeStart + 5 :
                            decadeStart + 7  // late
      return { date: year + '-01-01', precision: 'year', source: 'prose-year', matchedText: decade[0], approximate: true }
    }
  }

  // Bare "the <decade>s" — "the 1970s", "the 90s". Mid-decade, approximate.
  const bare = firstMatch(text, /\bthe\s+(\d{2,4})s\b/gi)
  if (bare) {
    let dec = parseInt(bare[1], 10)
    if (dec < 100) dec = dec < 50 ? 2000 + dec : 1900 + dec
    const year = dec + 5
    if (year >= minYear && year <= maxYear) {
      return { date: year + '-01-01', precision: 'year', source: 'prose-year', matchedText: bare[0], approximate: true }
    }
  }

  return null
}

// ── Helpers ──────────────────────────────────────────────────────

function buildFromYMD(
  year: number,
  month: number,
  day: number,
  minYear: number,
  maxYear: number,
  source: DateExtractionSource,
  matched: string,
): ExtractedDate | null {
  if (!Number.isFinite(year) || year < minYear || year > maxYear) return null

  // Precision downgrade rules:
  //   month === 0           → year precision (e.g. "00/00/2007")
  //   month, day === 0      → month precision (e.g. "04/00/2007")
  //   else                  → exact precision
  let precision: DatePrecision = 'exact'
  let storedMonth = month
  let storedDay = day
  if (!month || month < 1 || month > 12) {
    precision = 'year'
    storedMonth = 1
    storedDay = 1
  } else if (!day || day < 1 || day > 31) {
    precision = 'month'
    storedDay = 1
  } else {
    // Validate day-of-month
    const daysInMonth = new Date(year, month, 0).getUTCDate()
    if (day > daysInMonth) return null  // Feb 30 etc — reject
  }

  const mPad = String(storedMonth).padStart(2, '0')
  const dPad = String(storedDay).padStart(2, '0')
  return { date: year + '-' + mPad + '-' + dPad, precision, source, matchedText: matched }
}

/**
 * Run a global regex against text and return the FIRST match. Used
 * throughout because narrative-opening dates are almost always the
 * event date.
 */
function firstMatch(text: string, re: RegExp): RegExpExecArray | null {
  re.lastIndex = 0
  return re.exec(text)
}

/**
 * Guard against false-positive month matches.
 * - "April Fool's Day" — the stopword "fool" appears immediately after April.
 * - "Mayor" — preceded/followed by characters that make it not a month.
 */
function isStopwordMonth(text: string, matchStart: number, matchedText: string): boolean {
  // Take the next 30 chars after the match for stopword scan
  const after = text.slice(matchStart + matchedText.length, matchStart + matchedText.length + 30).toLowerCase()
  const beforeStart = Math.max(0, matchStart - 30)
  const before = text.slice(beforeStart, matchStart).toLowerCase()

  // After-stopwords: "April Fool's Day", "May showers"
  for (const sw of MONTH_STOPWORDS_AFTER) {
    if (after.match(new RegExp('^\\s*' + escapeRegex(sw) + '\\b'))) return true
  }
  // Before-stopwords for safety
  for (const sw of MONTH_STOPWORDS_BEFORE) {
    if (before.match(new RegExp('\\b' + escapeRegex(sw) + '\\s*$'))) return true
  }
  return false
}

function looksLikeCount(text: string, position: number): boolean {
  // If the 4-digit number is preceded by a digit or comma-digit (like
  // "$1,200" or "200 reports"), it's not a year.
  const before = text.slice(Math.max(0, position - 2), position)
  return /[,\d]/.test(before)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
