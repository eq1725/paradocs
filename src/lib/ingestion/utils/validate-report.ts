/**
 * validateReportBeforeInsert — V10.8.D ingestion validation gates.
 *
 * Runs against a ScrapedReport-shaped object immediately before the
 * engine's INSERT into `reports`. Returns a {ok, warnings, errors}
 * triple. The engine policy:
 *
 *   - errors  →  set status='quarantine' on the row, write every flag
 *                to ingestion_audit, still insert (so /admin/quarantine
 *                has a row to triage). recordsQuarantined++ on the
 *                IngestionResult.
 *   - warnings →  insert with the originally-computed status, write
 *                every flag to ingestion_audit as severity='warning'.
 *                Dashboards aggregate these — a sudden spike in
 *                DATE_SENTINEL_EXACT for one adapter is the canonical
 *                regressed-regex signal.
 *
 * The full code matrix is in V10.8_PIPELINE_HARDENING_DESIGN.md ("V10.8.D
 * — Ingestion validation gates"). Keep this file as the single source
 * of truth for the gate definitions; the admin page reads codes back
 * out of `ingestion_audit` and displays them with these messages.
 */

// Validation codes — kept as a const map so the admin page can display
// codes alongside human-readable descriptions without hand-syncing.
export const VALIDATION_CODES = {
  // ── Error gates (block by quarantining) ───────────────────────────
  MISSING_REQUIRED: 'Required field is missing (source_url, source_label, or description)',
  DUPLICATE_ORIGINAL_ID: 'original_report_id already exists with different content',
  DATE_INVALID: 'event_date does not parse as YYYY-MM-DD',
  LOC_OUT_OF_RANGE: 'lat/lng outside valid range',
  // ── Warning gates (log + insert) ─────────────────────────────────
  DATE_SENTINEL_EXACT: 'event_date_precision=exact but event_date matches -01-01 sentinel',
  DATE_FUTURE: 'event_date is in the future',
  DATE_TOO_OLD: 'event_date year < 1800 (outside expected paranormal-report range)',
  LOC_COUNTRY_NO_COORDS: 'country set but lat/lng null — normalizeLocation should have filled centroids',
  LOC_COORDS_NO_COUNTRY: 'lat/lng present but country null — reverse-geocode or flag',
  LOC_COORDS_ORIGIN: 'lat/lng at (0, 0) — almost always a parsing bug',
  LOC_STATE_COUNTRY_MISMATCH: 'state does not belong to the declared country',
  TEXT_TITLE_GENERIC: 'title equals original_title or matches Other/Untitled/Unknown',
  TEXT_NARRATIVE_EMPTY: 'paradocs_narrative is null but source description exceeds 100 words',
  WITNESS_PROFILE_MISSING: 'witness_profile is null — profile service did not fire',
  CATEGORY_UNKNOWN: 'category is null or "other" — classifier did not produce a value',
} as const

export type ValidationCode = keyof typeof VALIDATION_CODES

export type ValidationSeverity = 'warning' | 'error'

export interface ValidationFlag {
  code: ValidationCode
  message: string
  field: string
  severity: ValidationSeverity
  /** Optional structured payload — copied into ingestion_audit.payload for forensics. */
  payload?: Record<string, unknown>
}

export interface ValidationResult {
  ok: boolean              // True iff errors.length === 0
  warnings: ValidationFlag[]
  errors: ValidationFlag[]
}

// ── Shape the validator accepts ──────────────────────────────────
//
// Mirrors the insertData object constructed in engine.ts immediately
// before .insert(insertData). Kept loose-typed (string | undefined |
// null) because the adapter layer is unevenly strict.
//
export interface ValidatableReport {
  title?: string | null
  original_title?: string | null
  description?: string | null
  category?: string | null

  source_url?: string | null
  source_label?: string | null
  source_type?: string | null
  original_report_id?: string | null

  country?: string | null
  state_province?: string | null
  city?: string | null
  latitude?: number | null
  longitude?: number | null

  event_date?: string | null
  event_date_precision?: string | null
  event_date_extracted_from?: string | null

  // Optional downstream fields. When absent (e.g. a new ingestion that
  // hasn't run the analysis service yet), the related warning gates
  // are intentionally not raised — the engine only invokes the
  // validator before the analysis call.
  paradocs_narrative?: string | null
  witness_profile?: unknown | null
}

// ── State-country membership table ───────────────────────────────
//
// Used by LOC_STATE_COUNTRY_MISMATCH. Long-tail countries are
// permissive: if we don't know a country's subdivisions, we don't
// raise the warning. V10.8.C's `normalizeLocation` will own the
// comprehensive version of this table.
const STATE_COUNTRY: Record<string, ReadonlyArray<string>> = {
  'United States': [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC',
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
    'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
    'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
    'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
    'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
    'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
    'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
    'Wisconsin','Wyoming',
  ],
  'Canada': [
    'AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT',
    'Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador',
    'Nova Scotia','Northwest Territories','Nunavut','Ontario','Prince Edward Island',
    'Quebec','Saskatchewan','Yukon',
  ],
  'United Kingdom': [
    'England','Scotland','Wales','Northern Ireland',
  ],
  'Australia': [
    'NSW','VIC','QLD','WA','SA','TAS','ACT','NT',
    'New South Wales','Victoria','Queensland','Western Australia','South Australia',
    'Tasmania','Australian Capital Territory','Northern Territory',
  ],
}

const GENERIC_TITLE_PATTERNS = [
  /^(other|untitled|unknown|no title|n\/a)\b/i,
  /^report(?:\s*#?\s*\d+)?$/i,
]

// ── Main entry point ─────────────────────────────────────────────

export function validateReportBeforeInsert(report: ValidatableReport): ValidationResult {
  const warnings: ValidationFlag[] = []
  const errors: ValidationFlag[] = []

  // ── ERRORS ─────────────────────────────────────────────────────
  // These block insert (engine quarantines the row).

  // MISSING_REQUIRED
  if (!report.source_url || !String(report.source_url).trim()) {
    errors.push({
      code: 'MISSING_REQUIRED',
      message: VALIDATION_CODES.MISSING_REQUIRED + ': source_url is empty',
      field: 'source_url',
      severity: 'error',
    })
  }
  if (!report.source_label || !String(report.source_label).trim()) {
    errors.push({
      code: 'MISSING_REQUIRED',
      message: VALIDATION_CODES.MISSING_REQUIRED + ': source_label is empty',
      field: 'source_label',
      severity: 'error',
    })
  }
  if (!report.description || !String(report.description).trim()) {
    errors.push({
      code: 'MISSING_REQUIRED',
      message: VALIDATION_CODES.MISSING_REQUIRED + ': description is empty',
      field: 'description',
      severity: 'error',
    })
  }

  // DATE_INVALID — only enforce when event_date is non-null. Null is
  // legal (covered by precision='unknown') and is not an error.
  if (report.event_date && !isIsoDate(report.event_date)) {
    errors.push({
      code: 'DATE_INVALID',
      message: VALIDATION_CODES.DATE_INVALID + ': "' + report.event_date + '"',
      field: 'event_date',
      severity: 'error',
      payload: { value: report.event_date },
    })
  }

  // LOC_OUT_OF_RANGE
  if (
    typeof report.latitude === 'number' &&
    (report.latitude < -90 || report.latitude > 90 || !Number.isFinite(report.latitude))
  ) {
    errors.push({
      code: 'LOC_OUT_OF_RANGE',
      message: VALIDATION_CODES.LOC_OUT_OF_RANGE + ': latitude=' + report.latitude,
      field: 'latitude',
      severity: 'error',
      payload: { latitude: report.latitude },
    })
  }
  if (
    typeof report.longitude === 'number' &&
    (report.longitude < -180 || report.longitude > 180 || !Number.isFinite(report.longitude))
  ) {
    errors.push({
      code: 'LOC_OUT_OF_RANGE',
      message: VALIDATION_CODES.LOC_OUT_OF_RANGE + ': longitude=' + report.longitude,
      field: 'longitude',
      severity: 'error',
      payload: { longitude: report.longitude },
    })
  }

  // DUPLICATE_ORIGINAL_ID is intentionally NOT enforced inside this
  // function — the engine already does an exact-match lookup against
  // (source_type, original_report_id) and routes to its UPDATE path
  // when one exists. Cross-source dedup is the fuzzy matcher's job.
  // We keep the code reserved in case a future async DB-aware validator
  // wants to expose it.

  // ── WARNINGS ───────────────────────────────────────────────────

  // DATE_SENTINEL_EXACT — precision over-claimed.
  if (
    report.event_date_precision === 'exact' &&
    typeof report.event_date === 'string' &&
    /-01-01$/.test(report.event_date)
  ) {
    warnings.push({
      code: 'DATE_SENTINEL_EXACT',
      message: VALIDATION_CODES.DATE_SENTINEL_EXACT,
      field: 'event_date_precision',
      severity: 'warning',
      payload: { event_date: report.event_date, precision: report.event_date_precision },
    })
  }

  // DATE_FUTURE
  if (typeof report.event_date === 'string' && isIsoDate(report.event_date)) {
    const eventDateMs = Date.parse(report.event_date + 'T00:00:00Z')
    const todayMs = Date.now()
    if (Number.isFinite(eventDateMs) && eventDateMs > todayMs) {
      warnings.push({
        code: 'DATE_FUTURE',
        message: VALIDATION_CODES.DATE_FUTURE + ': ' + report.event_date,
        field: 'event_date',
        severity: 'warning',
        payload: { event_date: report.event_date },
      })
    }
    // DATE_TOO_OLD — flag year < 1800 unless the row's category
    // permits ancient material (folklore / mythology / religion).
    const yearMatch = report.event_date.match(/^(\d{4})/)
    if (yearMatch) {
      const yr = parseInt(yearMatch[1], 10)
      if (yr < 1800 && !categoryAllowsAncient(report.category)) {
        warnings.push({
          code: 'DATE_TOO_OLD',
          message: VALIDATION_CODES.DATE_TOO_OLD + ': ' + yr,
          field: 'event_date',
          severity: 'warning',
          payload: { year: yr, category: report.category || null },
        })
      }
    }
  }

  // LOC_COORDS_ORIGIN
  if (report.latitude === 0 && report.longitude === 0) {
    warnings.push({
      code: 'LOC_COORDS_ORIGIN',
      message: VALIDATION_CODES.LOC_COORDS_ORIGIN,
      field: 'latitude,longitude',
      severity: 'warning',
      payload: { latitude: 0, longitude: 0 },
    })
  }

  // LOC_COUNTRY_NO_COORDS — country set but coords null. After V10.8.C
  // ships this should be impossible (normalizeLocation always fills
  // a country/state/city centroid). Until then it's expected on many
  // rows, so the warning surfaces the gap without blocking insert.
  if (
    !!report.country &&
    String(report.country).trim() !== '' &&
    (report.latitude === null || report.latitude === undefined) &&
    (report.longitude === null || report.longitude === undefined)
  ) {
    warnings.push({
      code: 'LOC_COUNTRY_NO_COORDS',
      message: VALIDATION_CODES.LOC_COUNTRY_NO_COORDS + ': country="' + report.country + '"',
      field: 'country',
      severity: 'warning',
      payload: { country: report.country },
    })
  }

  // LOC_COORDS_NO_COUNTRY
  if (
    typeof report.latitude === 'number' &&
    typeof report.longitude === 'number' &&
    !(report.latitude === 0 && report.longitude === 0) && // already covered by LOC_COORDS_ORIGIN
    (!report.country || !String(report.country).trim())
  ) {
    warnings.push({
      code: 'LOC_COORDS_NO_COUNTRY',
      message: VALIDATION_CODES.LOC_COORDS_NO_COUNTRY,
      field: 'country',
      severity: 'warning',
      payload: { latitude: report.latitude, longitude: report.longitude },
    })
  }

  // LOC_STATE_COUNTRY_MISMATCH
  if (
    report.state_province &&
    String(report.state_province).trim() !== '' &&
    report.country &&
    STATE_COUNTRY[String(report.country).trim()]
  ) {
    const known = STATE_COUNTRY[String(report.country).trim()]
    const stateTrim = String(report.state_province).trim()
    if (!known.includes(stateTrim)) {
      warnings.push({
        code: 'LOC_STATE_COUNTRY_MISMATCH',
        message:
          VALIDATION_CODES.LOC_STATE_COUNTRY_MISMATCH +
          ': "' + stateTrim + '" not in ' + report.country,
        field: 'state_province',
        severity: 'warning',
        payload: { state: stateTrim, country: report.country },
      })
    }
  }

  // TEXT_TITLE_GENERIC
  if (
    report.title &&
    (
      GENERIC_TITLE_PATTERNS.some(p => p.test(String(report.title).trim())) ||
      (report.original_title && String(report.title).trim() === String(report.original_title).trim())
    )
  ) {
    warnings.push({
      code: 'TEXT_TITLE_GENERIC',
      message: VALIDATION_CODES.TEXT_TITLE_GENERIC + ': "' + String(report.title).substring(0, 60) + '"',
      field: 'title',
      severity: 'warning',
      payload: { title: report.title, original_title: report.original_title || null },
    })
  }

  // TEXT_NARRATIVE_EMPTY — only meaningful when a narrative was
  // expected. The engine runs the analysis service post-insert, so
  // this only fires when an external caller (admin backfill,
  // ingestion-after-analysis path) hands us a row with paradocs_narrative
  // explicitly passed as null/empty.
  if (
    report.paradocs_narrative !== undefined &&
    (!report.paradocs_narrative || !String(report.paradocs_narrative).trim()) &&
    !!report.description &&
    wordCount(String(report.description)) > 100
  ) {
    warnings.push({
      code: 'TEXT_NARRATIVE_EMPTY',
      message: VALIDATION_CODES.TEXT_NARRATIVE_EMPTY,
      field: 'paradocs_narrative',
      severity: 'warning',
      payload: { description_words: wordCount(String(report.description)) },
    })
  }

  // WITNESS_PROFILE_MISSING — only fires when the field is explicitly
  // passed and null. Same rationale as TEXT_NARRATIVE_EMPTY.
  if (report.witness_profile === null) {
    warnings.push({
      code: 'WITNESS_PROFILE_MISSING',
      message: VALIDATION_CODES.WITNESS_PROFILE_MISSING,
      field: 'witness_profile',
      severity: 'warning',
    })
  }

  // CATEGORY_UNKNOWN
  if (
    !report.category ||
    !String(report.category).trim() ||
    String(report.category).trim().toLowerCase() === 'other'
  ) {
    warnings.push({
      code: 'CATEGORY_UNKNOWN',
      message: VALIDATION_CODES.CATEGORY_UNKNOWN,
      field: 'category',
      severity: 'warning',
      payload: { category: report.category || null },
    })
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (m < 1 || m > 12) return false
  if (d < 1 || d > 31) return false
  // Validate day-of-month so Feb 30 fails DATE_INVALID instead of
  // sliding through as a valid ISO shape.
  const daysInMonth = new Date(y, m, 0).getUTCDate()
  return d <= daysInMonth
}

function categoryAllowsAncient(category: string | null | undefined): boolean {
  if (!category) return false
  const c = String(category).trim().toLowerCase()
  return (
    c === 'religion_mythology' ||
    c === 'mythology' ||
    c === 'folklore' ||
    c.includes('mythology')
  )
}

function wordCount(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).length
}
