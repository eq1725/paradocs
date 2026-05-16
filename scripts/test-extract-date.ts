/**
 * scripts/test-extract-date.ts — V10.8.A regression suite.
 *
 * Run: npx ts-node scripts/test-extract-date.ts
 * Exit code 0 on all-pass, 1 if any fixture fails.
 *
 * Table-driven fixture set drawn from real source samples across all
 * 15 ingestion adapters, plus adversarial cases (false-positive
 * guards). Add a new fixture for every reported extraction bug.
 */

import { extractDate, type ExtractedDate, type DatePrecision, type DateExtractionSource } from '../src/lib/ingestion/utils/extract-date'

interface Fixture {
  name: string
  input: { structured?: string | null; prose?: string | null; maxYear?: number; minYear?: number }
  expect: {
    date?: string | null
    precision?: DatePrecision
    source?: DateExtractionSource
    approximate?: boolean
  }
}

const FIXTURES: Fixture[] = [
  // ─── Pit-bull canonical regression ────────────────────────────
  {
    name: 'OBERF prose with month-day-year (the pit-bull case)',
    input: { prose: 'On April 28th 2007, I was mauled nearly to death by a neighbor’s Pit Bull in the alley behind my house.' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'prose-monthname' },
  },

  // ─── Structured-field cases ───────────────────────────────────
  {
    name: 'OBERF structured MM/DD/YYYY',
    input: { structured: '04/28/2007', prose: 'Some prose with no dates.' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'structured' },
  },
  {
    name: 'OBERF structured with sentinel day → month precision',
    input: { structured: '04/00/2007' },
    expect: { date: '2007-04-01', precision: 'month', source: 'structured' },
  },
  {
    name: 'OBERF structured with sentinel month+day → year precision',
    input: { structured: '00/00/2007' },
    expect: { date: '2007-01-01', precision: 'year', source: 'structured' },
  },
  {
    name: 'NUFORC structured with date+time',
    input: { structured: '4/28/2007 21:55' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'structured' },
  },
  {
    name: 'NDERF structured ISO',
    input: { structured: '2007-04-28' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'structured' },
  },
  {
    name: 'Structured month-only ISO',
    input: { structured: '2007-04' },
    expect: { date: '2007-04-01', precision: 'month', source: 'structured' },
  },
  {
    name: 'Structured year-only',
    input: { structured: '2007' },
    expect: { date: '2007-01-01', precision: 'year', source: 'structured' },
  },
  {
    name: 'Structured "April 2007" (month name + year)',
    input: { structured: 'April 2007' },
    expect: { date: '2007-04-01', precision: 'month', source: 'structured' },
  },
  {
    name: 'Structured "April 28, 2007"',
    input: { structured: 'April 28, 2007' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'structured' },
  },
  {
    name: 'Structured "28 April 2007" (UK form)',
    input: { structured: '28 April 2007' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'structured' },
  },
  {
    name: 'Structured with trailing approximate parenthetical',
    input: { structured: '2007 (approximate)' },
    expect: { date: '2007-01-01', precision: 'year', source: 'structured' },
  },
  {
    name: 'Structured 2-digit year >= 50 maps to 19xx',
    input: { structured: '4/28/85' },
    expect: { date: '1985-04-28', precision: 'exact', source: 'structured' },
  },
  {
    name: 'Structured 2-digit year < 50 maps to 20xx',
    input: { structured: '4/28/07' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'structured' },
  },

  // ─── Prose month-name variants ────────────────────────────────
  {
    name: 'Prose: ordinal suffix th',
    input: { prose: 'It happened on April 28th 2007 in the alley.' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'prose-monthname' },
  },
  {
    name: 'Prose: ordinal suffix nd',
    input: { prose: 'On May 2nd, 2008 the witness saw it.' },
    expect: { date: '2008-05-02', precision: 'exact', source: 'prose-monthname' },
  },
  {
    name: 'Prose: ordinal suffix rd',
    input: { prose: 'September 3rd, 1965 was the date.' },
    expect: { date: '1965-09-03', precision: 'exact', source: 'prose-monthname' },
  },
  {
    name: 'Prose: ordinal suffix st',
    input: { prose: 'I saw it on January 1st 2020 around 3am.' },
    expect: { date: '2020-01-01', precision: 'exact', source: 'prose-monthname' },
  },
  {
    name: 'Prose: abbreviated month',
    input: { prose: 'Witnesses report seeing it Apr 28, 2007 in Phoenix.' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'prose-monthname' },
  },
  {
    name: 'Prose: "Sept" abbreviation',
    input: { prose: 'The encounter happened Sept 15, 1976.' },
    expect: { date: '1976-09-15', precision: 'exact', source: 'prose-monthname' },
  },
  {
    name: 'Prose: UK form (day before month)',
    input: { prose: 'The incident occurred on 28 April 2007 near Bristol.' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'prose-monthname' },
  },
  {
    name: 'Prose: month + year only',
    input: { prose: 'Witnesses report the sighting in April 2007 over Kansas.' },
    expect: { date: '2007-04-01', precision: 'month', source: 'prose-monthname' },
  },
  {
    name: 'Prose: takes the FIRST date when multiple',
    input: { prose: 'Construction began in 1923 and the haunting started on April 28th 2007.' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'prose-monthname' },
  },

  // ─── Prose numeric ────────────────────────────────────────────
  {
    name: 'Prose: embedded MM/DD/YYYY',
    input: { prose: 'On 04/28/2007 the dog attacked while we were playing.' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'prose-numeric' },
  },
  {
    name: 'Prose: embedded ISO date',
    input: { prose: 'The log entry timestamp reads 2007-04-28 and matches our records.' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'prose-numeric' },
  },

  // ─── Prose year-only ──────────────────────────────────────────
  {
    name: 'Prose: contextual "in <year>"',
    input: { prose: 'Skinwalker Ranch first gained attention in 1996, when the Sherman family moved in.' },
    expect: { date: '1996-01-01', precision: 'year', source: 'prose-year' },
  },
  {
    name: 'Prose: contextual "since <year>"',
    input: { prose: 'Activity has been reported since 1968 at this location.' },
    expect: { date: '1968-01-01', precision: 'year', source: 'prose-year' },
  },
  {
    name: 'Prose: year followed by punctuation',
    input: { prose: 'This is a report from 2007. The witness was ten years old.' },
    expect: { date: '2007-01-01', precision: 'year', source: 'prose-year' },
  },

  // ─── Approximate markers ──────────────────────────────────────
  {
    name: 'Prose: early 2000s → year 2002, approximate',
    input: { prose: 'The early 2000s saw a spike in NDE reports from the Midwest.' },
    expect: { date: '2002-01-01', precision: 'year', source: 'prose-year', approximate: true },
  },
  {
    name: 'Prose: mid 1970s',
    input: { prose: 'The phenomena began in the mid 1970s and continued for years.' },
    expect: { date: '1975-01-01', precision: 'year', source: 'prose-year', approximate: true },
  },
  {
    name: 'Prose: late 90s → 1997, approximate',
    input: { prose: 'I had this experience in the late 90s when I was a teenager.' },
    expect: { date: '1997-01-01', precision: 'year', source: 'prose-year', approximate: true },
  },
  {
    name: 'Prose: "the 1970s" bare',
    input: { prose: 'The 1970s were a particularly active decade for UFO sightings in this region.' },
    expect: { date: '1975-01-01', precision: 'year', source: 'prose-year', approximate: true },
  },

  // ─── Adversarial — false positives we MUST avoid ──────────────
  {
    name: 'Adversarial: "1,200 reports since 2007" extracts 2007 not 1200',
    input: { prose: 'The investigation reviewed 1,200 reports since 2007.' },
    expect: { date: '2007-01-01', precision: 'year', source: 'prose-year' },
  },
  {
    name: 'Adversarial: "$1,200 in damages" with no date returns unknown',
    input: { prose: 'The cleanup cost $1,200 in damages but no further details were recorded.' },
    expect: { date: null, precision: 'unknown', source: 'none' },
  },
  {
    name: 'Adversarial: "April Fool\'s Day" does NOT match April',
    input: { prose: 'It was April Fool\'s Day according to my friend.' },
    expect: { date: null, precision: 'unknown', source: 'none' },
  },
  {
    name: 'Adversarial: "May showers" does NOT match May',
    input: { prose: 'After the May showers we noticed the strange ground markings.' },
    expect: { date: null, precision: 'unknown', source: 'none' },
  },
  {
    name: 'Adversarial: Feb 30 rejected',
    input: { structured: '02/30/2007' },
    expect: { date: null, precision: 'unknown', source: 'none' },
  },
  {
    name: 'Adversarial: year out of range (3050)',
    input: { prose: 'In 3050 the witness will have been long forgotten.' },
    expect: { date: null, precision: 'unknown', source: 'none' },
  },
  {
    name: 'Adversarial: year too old (1500)',
    input: { prose: 'In 1500 there were already legends about this place.' },
    expect: { date: null, precision: 'unknown', source: 'none' },
  },
  {
    name: 'Empty input → unknown',
    input: {},
    expect: { date: null, precision: 'unknown', source: 'none' },
  },
  {
    name: 'Whitespace input → unknown',
    input: { structured: '   ', prose: '   ' },
    expect: { date: null, precision: 'unknown', source: 'none' },
  },

  // ─── Structured-vs-prose precedence ───────────────────────────
  {
    name: 'Structured wins over prose',
    input: { structured: '2007-04-28', prose: 'It also happened in 1995 according to some accounts.' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'structured' },
  },
  {
    name: 'Unparseable structured falls through to prose',
    input: { structured: 'last summer', prose: 'On April 28th 2007 I was attacked.' },
    expect: { date: '2007-04-28', precision: 'exact', source: 'prose-monthname' },
  },
]

// ── Runner ─────────────────────────────────────────────────────

function runFixture(f: Fixture): { ok: boolean; got: ExtractedDate; reasons: string[] } {
  const got = extractDate(f.input)
  const reasons: string[] = []
  if (f.expect.date !== undefined && got.date !== f.expect.date) {
    reasons.push('date: expected ' + JSON.stringify(f.expect.date) + ', got ' + JSON.stringify(got.date))
  }
  if (f.expect.precision !== undefined && got.precision !== f.expect.precision) {
    reasons.push('precision: expected ' + f.expect.precision + ', got ' + got.precision)
  }
  if (f.expect.source !== undefined && got.source !== f.expect.source) {
    reasons.push('source: expected ' + f.expect.source + ', got ' + got.source)
  }
  if (f.expect.approximate !== undefined && Boolean(got.approximate) !== f.expect.approximate) {
    reasons.push('approximate: expected ' + f.expect.approximate + ', got ' + Boolean(got.approximate))
  }
  return { ok: reasons.length === 0, got, reasons }
}

let pass = 0
let fail = 0
const failures: Array<{ name: string; reasons: string[]; got: ExtractedDate }> = []

for (const fixture of FIXTURES) {
  const r = runFixture(fixture)
  if (r.ok) {
    pass++
    process.stdout.write('.')
  } else {
    fail++
    process.stdout.write('F')
    failures.push({ name: fixture.name, reasons: r.reasons, got: r.got })
  }
}
process.stdout.write('\n\n')

if (failures.length > 0) {
  console.log('=== FAILURES ===')
  for (const f of failures) {
    console.log('\n[FAIL] ' + f.name)
    for (const r of f.reasons) console.log('  - ' + r)
    console.log('  got: ' + JSON.stringify(f.got))
  }
  console.log('')
}

console.log('Total: ' + FIXTURES.length + ' | Pass: ' + pass + ' | Fail: ' + fail)
process.exit(fail === 0 ? 0 : 1)
