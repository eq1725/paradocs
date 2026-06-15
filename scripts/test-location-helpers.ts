/**
 * _test-smart-titlecase.ts — V11.18.34
 * Standalone assertions for smartTitleCase (no vitest/jest harness in this
 * repo). Run: npx tsx scripts/_test-smart-titlecase.ts  (exit 0 = pass)
 */
import { smartTitleCase, isLikelyPlaceName } from '../src/lib/ingestion/utils/normalize-location'

const cases: [string | null, string | null][] = [
  // fixes: all-lowercase → title-cased
  ['ebensburg, pennsylvania', 'Ebensburg, Pennsylvania'],
  ['west sacramento', 'West Sacramento'],
  ['charleston, south carolina', 'Charleston, South Carolina'],
  ['winston-salem', 'Winston-Salem'],
  ["o'fallon", "O'Fallon"],
  ['mckinney', 'McKinney'],          // Mc prefix on all-lower input
  ['ebensburg, PA', 'Ebensburg, PA'], // abbreviation preserved, city fixed
  // no-ops: anything already containing a capital is preserved verbatim
  ['McKinney', 'McKinney'],
  ['DeKalb', 'DeKalb'],
  ['Las Vegas', 'Las Vegas'],
  ['NYC', 'NYC'],
  ['NEW YORK', 'NEW YORK'],          // legit all-caps token preserved
  ["O'Fallon", "O'Fallon"],
  ['Winston-Salem', 'Winston-Salem'],
  ['iPhone City', 'iPhone City'],    // internal cap preserved
  // edge: nulls / empties
  [null, null],
  ['', ''],
  // idempotence
  ['West Sacramento', 'West Sacramento'],
]

let pass = 0, fail = 0
for (const [input, expected] of cases) {
  const got = smartTitleCase(input)
  if (got === expected) { pass++ }
  else { fail++; console.error(`FAIL: smartTitleCase(${JSON.stringify(input)}) = ${JSON.stringify(got)}  expected ${JSON.stringify(expected)}`) }
}

// isLikelyPlaceName: real places true; parse artifacts false
const placeCases: [string | null, boolean][] = [
  ['Trout Lake', true], ['Ebensburg', true], ['McKinney', true], ['Las Vegas', true],
  ['St. Louis', true], ["O'Fallon", true], ['New York', true], ['Moriches Bay', true],
  ['the', false], ['some', false], ['around Louisville', false],
  ['20,000 feet over Trout Lake', false],          // altitude / digits
  ['vol. v. p. 420', false],                        // citation
  ['Middle of the Caspian Sea directly east of Baku', false], // over-captured phrase
  ['northwest', false],                             // pure directional
  [null, false], ['', false],
]
for (const [input, expected] of placeCases) {
  const got = isLikelyPlaceName(input)
  if (got === expected) { pass++ }
  else { fail++; console.error(`FAIL: isLikelyPlaceName(${JSON.stringify(input)}) = ${got}  expected ${expected}`) }
}

console.log(`location helpers: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
