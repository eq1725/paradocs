/**
 * V10.8.D validate-report test suite.
 *
 * Table-driven fixtures covering every warning + error code from
 * validateReportBeforeInsert. Each fixture supplies a partial
 * report and asserts which flags should fire.
 *
 * Run:
 *   npx ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' scripts/test-validate-report.ts
 */

import {
  validateReportBeforeInsert,
  ValidatableReport,
  ValidationCode,
} from '../src/lib/ingestion/utils/validate-report'

interface Fixture {
  name: string
  report: ValidatableReport
  expectErrorCodes: ValidationCode[]
  expectWarningCodes: ValidationCode[]
}

const VALID_BASE: ValidatableReport = {
  title: 'Triangle Sighting in Sedona',
  description: 'Three bright orbs in formation moved silently over Sedona last weekend; multiple witnesses on the ground reported the same trajectory.',
  category: 'ufos_aliens',
  source_url: 'https://example.com/sighting/123',
  source_label: 'Example Aggregator',
  source_type: 'example',
  original_report_id: 'example-123',
  country: 'United States',
  state_province: 'AZ',
  city: 'Sedona',
  latitude: 34.86,
  longitude: -111.79,
  event_date: '2024-07-04',
  event_date_precision: 'exact',
}

const FIXTURES: Fixture[] = [
  // ── HAPPY PATH ───────────────────────────────────────────────────
  {
    name: 'fully-valid report passes with no flags',
    report: VALID_BASE,
    expectErrorCodes: [],
    expectWarningCodes: [],
  },

  // ── ERROR GATES ──────────────────────────────────────────────────
  {
    name: 'MISSING_REQUIRED — empty source_url',
    report: { ...VALID_BASE, source_url: '' },
    expectErrorCodes: ['MISSING_REQUIRED'],
    expectWarningCodes: [],
  },
  {
    name: 'MISSING_REQUIRED — empty source_label',
    report: { ...VALID_BASE, source_label: '   ' },
    expectErrorCodes: ['MISSING_REQUIRED'],
    expectWarningCodes: [],
  },
  {
    name: 'MISSING_REQUIRED — empty description',
    report: { ...VALID_BASE, description: '' },
    expectErrorCodes: ['MISSING_REQUIRED'],
    expectWarningCodes: [],
  },
  {
    name: 'MISSING_REQUIRED — fires multiple times if multiple fields missing',
    report: { ...VALID_BASE, source_url: '', source_label: '', description: '' },
    expectErrorCodes: ['MISSING_REQUIRED', 'MISSING_REQUIRED', 'MISSING_REQUIRED'],
    expectWarningCodes: [],
  },
  {
    name: 'DATE_INVALID — not parseable as YYYY-MM-DD',
    report: { ...VALID_BASE, event_date: '2024-07' },
    expectErrorCodes: ['DATE_INVALID'],
    expectWarningCodes: [],
  },
  {
    name: 'DATE_INVALID — Feb 30',
    report: { ...VALID_BASE, event_date: '2024-02-30' },
    expectErrorCodes: ['DATE_INVALID'],
    expectWarningCodes: [],
  },
  {
    name: 'LOC_OUT_OF_RANGE — latitude > 90',
    report: { ...VALID_BASE, latitude: 91, longitude: 0 },
    expectErrorCodes: ['LOC_OUT_OF_RANGE'],
    expectWarningCodes: [],
  },
  {
    name: 'LOC_OUT_OF_RANGE — longitude < -180',
    report: { ...VALID_BASE, latitude: 0, longitude: -181 },
    expectErrorCodes: ['LOC_OUT_OF_RANGE'],
    expectWarningCodes: [],
  },

  // ── WARNING GATES ────────────────────────────────────────────────
  {
    name: 'DATE_SENTINEL_EXACT — precision=exact + sentinel date',
    report: { ...VALID_BASE, event_date: '2007-01-01', event_date_precision: 'exact' },
    expectErrorCodes: [],
    expectWarningCodes: ['DATE_SENTINEL_EXACT'],
  },
  {
    name: 'DATE_FUTURE — event_date in the future',
    report: { ...VALID_BASE, event_date: '2099-12-31', event_date_precision: 'exact' },
    expectErrorCodes: [],
    expectWarningCodes: ['DATE_FUTURE'],
  },
  {
    name: 'DATE_TOO_OLD — year=1500 with non-mythology category',
    report: { ...VALID_BASE, event_date: '1500-06-15', event_date_precision: 'exact' },
    expectErrorCodes: [],
    expectWarningCodes: ['DATE_TOO_OLD'],
  },
  {
    name: 'DATE_TOO_OLD does NOT fire for religion_mythology',
    report: { ...VALID_BASE, event_date: '0600-01-01', event_date_precision: 'year', category: 'religion_mythology' },
    expectErrorCodes: [],
    expectWarningCodes: [],
  },
  {
    name: 'LOC_COORDS_ORIGIN — (0,0)',
    report: { ...VALID_BASE, latitude: 0, longitude: 0 },
    expectErrorCodes: [],
    expectWarningCodes: ['LOC_COORDS_ORIGIN'],
  },
  {
    name: 'LOC_COUNTRY_NO_COORDS — country set, coords null',
    report: { ...VALID_BASE, latitude: null, longitude: null },
    expectErrorCodes: [],
    expectWarningCodes: ['LOC_COUNTRY_NO_COORDS'],
  },
  {
    name: 'LOC_COORDS_NO_COUNTRY — coords set, country empty',
    report: { ...VALID_BASE, country: null, state_province: null },
    expectErrorCodes: [],
    expectWarningCodes: ['LOC_COORDS_NO_COUNTRY'],
  },
  {
    name: 'LOC_STATE_COUNTRY_MISMATCH — Texas in Mexico',
    report: { ...VALID_BASE, country: 'Mexico', state_province: 'TX' },
    expectErrorCodes: [],
    // We don't know Mexico's subdivisions in the table — so the warning
    // intentionally does NOT fire. Adding Mexico to STATE_COUNTRY would
    // be a V10.8.C concern. The fixture documents the current behavior.
    expectWarningCodes: [],
  },
  {
    name: 'LOC_STATE_COUNTRY_MISMATCH — Ontario in the United States',
    report: { ...VALID_BASE, country: 'United States', state_province: 'Ontario' },
    expectErrorCodes: [],
    expectWarningCodes: ['LOC_STATE_COUNTRY_MISMATCH'],
  },
  {
    name: 'TEXT_TITLE_GENERIC — title is "Untitled"',
    report: { ...VALID_BASE, title: 'Untitled' },
    expectErrorCodes: [],
    expectWarningCodes: ['TEXT_TITLE_GENERIC'],
  },
  {
    name: 'TEXT_TITLE_GENERIC — title == original_title',
    report: { ...VALID_BASE, title: 'My weird night', original_title: 'My weird night' },
    expectErrorCodes: [],
    expectWarningCodes: ['TEXT_TITLE_GENERIC'],
  },
  {
    name: 'TEXT_NARRATIVE_EMPTY — paradocs_narrative null + 200-word description',
    report: {
      ...VALID_BASE,
      paradocs_narrative: null,
      description: 'word '.repeat(200).trim(),
    },
    expectErrorCodes: [],
    expectWarningCodes: ['TEXT_NARRATIVE_EMPTY'],
  },
  {
    name: 'TEXT_NARRATIVE_EMPTY does NOT fire when paradocs_narrative is undefined (not yet generated)',
    report: { ...VALID_BASE },  // paradocs_narrative omitted = undefined
    expectErrorCodes: [],
    expectWarningCodes: [],
  },
  {
    name: 'WITNESS_PROFILE_MISSING — explicitly null',
    report: { ...VALID_BASE, witness_profile: null },
    expectErrorCodes: [],
    expectWarningCodes: ['WITNESS_PROFILE_MISSING'],
  },
  {
    name: 'CATEGORY_UNKNOWN — null category',
    report: { ...VALID_BASE, category: null },
    expectErrorCodes: [],
    expectWarningCodes: ['CATEGORY_UNKNOWN'],
  },
  {
    name: 'CATEGORY_UNKNOWN — "other"',
    report: { ...VALID_BASE, category: 'other' },
    expectErrorCodes: [],
    expectWarningCodes: ['CATEGORY_UNKNOWN'],
  },

  // ── COMBOS ───────────────────────────────────────────────────────
  {
    name: 'ok=false when at least one error fires (warnings present too)',
    report: {
      ...VALID_BASE,
      source_url: '',           // MISSING_REQUIRED (error)
      event_date: '2007-01-01', // DATE_SENTINEL_EXACT (warning)
    },
    expectErrorCodes: ['MISSING_REQUIRED'],
    expectWarningCodes: ['DATE_SENTINEL_EXACT'],
  },
]

let pass = 0
let fail = 0
const fails: string[] = []

for (const fx of FIXTURES) {
  const result = validateReportBeforeInsert(fx.report)
  const gotErrors = result.errors.map(e => e.code).sort()
  const wantErrors = [...fx.expectErrorCodes].sort()
  const gotWarnings = result.warnings.map(w => w.code).sort()
  const wantWarnings = [...fx.expectWarningCodes].sort()
  const expectedOk = wantErrors.length === 0

  const errorsMatch = arraysEqual(gotErrors, wantErrors)
  const warningsMatch = arraysEqual(gotWarnings, wantWarnings)
  const okMatch = result.ok === expectedOk

  if (errorsMatch && warningsMatch && okMatch) {
    process.stdout.write('.')
    pass++
  } else {
    process.stdout.write('F')
    fail++
    fails.push(
      `[${fx.name}]\n` +
      `  expected errors:   ${JSON.stringify(wantErrors)}\n` +
      `  got errors:        ${JSON.stringify(gotErrors)}\n` +
      `  expected warnings: ${JSON.stringify(wantWarnings)}\n` +
      `  got warnings:      ${JSON.stringify(gotWarnings)}\n` +
      `  expected ok:       ${expectedOk}\n` +
      `  got ok:            ${result.ok}`,
    )
  }
}

console.log('')
console.log('')
console.log(`Total: ${FIXTURES.length} | Pass: ${pass} | Fail: ${fail}`)

if (fails.length) {
  console.log('')
  console.log('Failures:')
  for (const f of fails) {
    console.log(f)
    console.log('')
  }
  process.exit(1)
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
