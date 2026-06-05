/**
 * scripts/test-extract-date-v11-17-82.ts — V11.17.82 smoke test for the
 * architectural-context guard added to extractDate.
 *
 * The prose-year extractor used to grab "1900s" inside "old early 1900s
 * warehouse looking building" and set event_date=1902-01-01 for a Reddit
 * post whose title literally said "last night". This test pins the
 * architectural-context guard so that regression doesn't reopen.
 *
 * Run: npx tsx scripts/test-extract-date-v11-17-82.ts
 * Exit 0 on all-pass, 1 on any fail.
 */

import { extractDate } from '../src/lib/ingestion/utils/extract-date'

interface Smoke {
  name: string
  prose: string
  referenceDate?: string
  expectNoYear?: number     // assertion: extractor MUST NOT return this year
  expectPrecision?: 'exact' | 'month' | 'year' | 'unknown'
  expectDate?: string | null
  expectSource?: string
}

const CASES: Smoke[] = [
  // ─── The founder's flagged case ──────────────────────────────────
  {
    name: 'gl6dd5 — "old early 1900s warehouse looking building" must NOT yield 1902',
    prose: 'I drank a 40 oz a couple hours before bed. I got pulled out into the front of some old early 1900s warehouse looking building.',
    referenceDate: '2025-06-04T12:00:00Z',
    expectNoYear: 1902,
    expectPrecision: 'unknown',
    expectDate: null,
  },
  {
    name: 'gl6dd5 with title "last night" + referenceDate — resolves to yesterday',
    prose: 'last night I rode out the vibrations. I drank a 40 oz a couple hours before bed. I got pulled out into the front of some old early 1900s warehouse looking building.',
    referenceDate: '2025-06-04T12:00:00Z',
    expectPrecision: 'exact',
    expectDate: '2025-06-03',
    expectSource: 'prose-relative',
  },

  // ─── Architectural-context guard variants ────────────────────────
  {
    name: 'guard: "1970s style truck" → no extraction',
    prose: 'I saw a 1970s style truck parked outside the gas station.',
    expectPrecision: 'unknown',
    expectDate: null,
  },
  {
    name: 'guard: "built in 1865" → no extraction',
    prose: 'The cabin was built in 1865 and had been abandoned since.',
    expectPrecision: 'unknown',
    expectDate: null,
  },
  {
    name: 'guard: "1800s farmhouse" → no extraction',
    prose: 'There was an 1800s farmhouse at the edge of the property where it all happened.',
    expectPrecision: 'unknown',
    expectDate: null,
  },
  {
    name: 'guard: "early 1900s warehouse" → no extraction',
    prose: 'pulled out into the front of some old early 1900s warehouse looking building.',
    expectPrecision: 'unknown',
    expectDate: null,
  },
  {
    name: 'guard: "circa 1920 mansion" → no extraction',
    prose: 'The circa 1920 mansion was supposedly haunted.',
    expectPrecision: 'unknown',
    expectDate: null,
  },

  // ─── Negative controls — true event dates must STILL extract ─────
  {
    name: 'still works: "I saw a ghost in 1995" → 1995',
    prose: 'I saw a ghost in 1995 when I was visiting my grandmother.',
    expectPrecision: 'year',
    expectDate: '1995-01-01',
    expectSource: 'prose-year',
  },
  {
    name: 'still works: "in the late 90s" → 1997 approximate',
    prose: 'I had this experience in the late 90s when I was a teenager.',
    expectPrecision: 'year',
    expectDate: '1997-01-01',
  },
  {
    name: 'still works: "On April 28th 2007" → exact',
    prose: 'On April 28th 2007 I was attacked by a Pit Bull.',
    expectPrecision: 'exact',
    expectDate: '2007-04-28',
    expectSource: 'prose-monthname',
  },
  {
    name: 'still works: "in 1996" without architectural binding → 1996',
    prose: 'Skinwalker Ranch first gained attention in 1996, when the Sherman family moved in.',
    expectPrecision: 'year',
    expectDate: '1996-01-01',
    expectSource: 'prose-year',
  },
  {
    name: 'mixed: "1970s style truck" but later "happened in 2018" → 2018',
    prose: 'There was a 1970s style truck in the driveway. The encounter happened in 2018 outside the trailer.',
    expectPrecision: 'year',
    expectDate: '2018-01-01',
    expectSource: 'prose-year',
  },
]

let pass = 0
let fail = 0
const failures: Array<{ name: string; got: any; reason: string }> = []

for (const c of CASES) {
  const got = extractDate({ prose: c.prose, referenceDate: c.referenceDate })

  const reasons: string[] = []
  if (c.expectNoYear !== undefined && got.date && got.date.startsWith(String(c.expectNoYear))) {
    reasons.push(`expected NOT year ${c.expectNoYear}, got date=${got.date}`)
  }
  if (c.expectPrecision !== undefined && got.precision !== c.expectPrecision) {
    reasons.push(`expected precision=${c.expectPrecision}, got ${got.precision}`)
  }
  if (c.expectDate !== undefined && got.date !== c.expectDate) {
    reasons.push(`expected date=${c.expectDate}, got ${got.date}`)
  }
  if (c.expectSource !== undefined && got.source !== c.expectSource) {
    reasons.push(`expected source=${c.expectSource}, got ${got.source}`)
  }

  if (reasons.length === 0) {
    pass++
    console.log(`[PASS] ${c.name}`)
    console.log(`       got: date=${got.date} precision=${got.precision} source=${got.source}${got.matchedText ? ' matched="' + got.matchedText + '"' : ''}`)
  } else {
    fail++
    console.log(`[FAIL] ${c.name}`)
    for (const r of reasons) console.log(`       - ${r}`)
    console.log(`       got: ${JSON.stringify(got)}`)
    failures.push({ name: c.name, got, reason: reasons.join('; ') })
  }
}

console.log(`\nTotal: ${CASES.length} | Pass: ${pass} | Fail: ${fail}`)
process.exit(fail === 0 ? 0 : 1)
