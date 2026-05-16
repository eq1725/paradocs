/**
 * V10.8.E escalate-date-haiku test suite.
 *
 * Run:
 *   npx ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' scripts/test-escalate-date-haiku.ts
 *
 * Uses mock haikuFn implementations to keep tests deterministic and
 * network-free. Covers:
 *   - happy path: Haiku returns verbatim-quoted month+day → upgrade to exact
 *   - happy path: Haiku returns verbatim-quoted month → upgrade to month
 *   - rejection: precision != 'year' → skipped without calling Haiku
 *   - rejection: no month-name in prose → skipped without calling Haiku
 *   - rejection: prose too short → skipped
 *   - rejection: Haiku returns null → keep current
 *   - rejection: Haiku quote not in source (hallucination) → reject upgrade
 *   - rejection: Haiku returns year that doesn't match current → reject
 *   - rejection: invalid date shape (Feb 30) → reject
 */

import {
  escalateDateWithHaiku,
  HaikuDateFn,
  HaikuDateResponse,
} from '../src/lib/ingestion/utils/escalate-date-haiku'
import { ExtractedDate } from '../src/lib/ingestion/utils/extract-date'

interface Fixture {
  name: string
  prose: string
  current: ExtractedDate
  haikuFn?: HaikuDateFn
  expectEscalated: boolean
  expectReason?: string
  expectDate?: string
  expectPrecision?: string
  expectSource?: string
}

function fixedHaiku(resp: HaikuDateResponse | null): HaikuDateFn {
  return async function () { return resp }
}

function shouldNotCallHaiku(): HaikuDateFn {
  return async function () {
    throw new Error('haikuFn should not have been called for this fixture')
  }
}

const longProseWithMonth =
  'The incident took place during an unusually cold spring. On April 28th the family ' +
  'gathered for dinner and afterwards the youngest daughter went out to the porch. ' +
  'That evening, around 8pm, something passed silently overhead. Witnesses across town ' +
  'in 2007 reported similar sightings throughout the week, though most assumed the lights ' +
  'were aircraft. The investigation closed weeks later with no conclusion.'

const yearOnlyCurrent: ExtractedDate = {
  date: '2007-01-01',
  precision: 'year',
  source: 'prose-year',
}

const FIXTURES: Fixture[] = [
  // ── Happy path: exact-precision upgrade ─────────────────────────
  {
    name: 'Haiku returns exact date with verbatim quotes → upgrade to exact',
    prose: longProseWithMonth,
    current: yearOnlyCurrent,
    haikuFn: fixedHaiku({
      date: '2007-04-28',
      precision: 'exact',
      year_quote: '2007',
      month_quote: 'April',
      day_quote: '28th',
    }),
    expectEscalated: true,
    expectReason: 'upgraded',
    expectDate: '2007-04-28',
    expectPrecision: 'exact',
    expectSource: 'haiku',
  },
  {
    name: 'Haiku returns month-only with verbatim quotes → upgrade to month',
    prose: longProseWithMonth,
    current: yearOnlyCurrent,
    haikuFn: fixedHaiku({
      date: '2007-04-01',
      precision: 'month',
      year_quote: '2007',
      month_quote: 'April',
    }),
    expectEscalated: true,
    expectReason: 'upgraded',
    expectDate: '2007-04-01',
    expectPrecision: 'month',
    expectSource: 'haiku',
  },

  // ── Pre-flight gates (cost-free skips) ──────────────────────────
  {
    name: 'precision != year skipped without calling Haiku',
    prose: longProseWithMonth,
    current: { ...yearOnlyCurrent, precision: 'exact' as const },
    haikuFn: shouldNotCallHaiku(),
    expectEscalated: false,
    expectReason: 'skipped-precision',
  },
  {
    name: 'prose without month name skipped',
    prose:
      'A long passage with no month words anywhere — only years like 2007, 1999, 2014, etc. ' +
      'Padded out to clear the 200-character length floor so the no-month-name gate is the ' +
      'one that fires rather than the too-short gate. Several sentences here ensure we hit ' +
      'the precondition for the month-name check to be the dispositive one.',
    current: yearOnlyCurrent,
    haikuFn: shouldNotCallHaiku(),
    expectEscalated: false,
    expectReason: 'skipped-no-month-name',
  },
  {
    name: 'prose shorter than threshold skipped',
    prose: 'April 2007.',
    current: yearOnlyCurrent,
    haikuFn: shouldNotCallHaiku(),
    expectEscalated: false,
    expectReason: 'skipped-too-short',
  },

  // ── Haiku failure paths ─────────────────────────────────────────
  {
    name: 'Haiku returns null → keep current',
    prose: longProseWithMonth,
    current: yearOnlyCurrent,
    haikuFn: fixedHaiku(null),
    expectEscalated: false,
    expectReason: 'haiku-null',
  },
  {
    name: 'Haiku hallucinates a month quote not in source → reject',
    prose: longProseWithMonth,
    current: yearOnlyCurrent,
    haikuFn: fixedHaiku({
      date: '2007-08-15',
      precision: 'exact',
      year_quote: '2007',
      month_quote: 'August',     // does NOT appear in the prose
      day_quote: '15',
    }),
    expectEscalated: false,
    expectReason: 'claim-check-failed',
  },
  {
    name: 'Haiku returns year mismatching current → reject',
    prose: longProseWithMonth,
    current: yearOnlyCurrent,
    haikuFn: fixedHaiku({
      date: '2014-04-28',   // current is 2007
      precision: 'exact',
      year_quote: '2014',   // appears as a numeric in prose, but year mismatch
      month_quote: 'April',
      day_quote: '28th',
    }),
    expectEscalated: false,
    expectReason: 'claim-check-failed',
  },
  {
    name: 'Haiku returns impossible date (Feb 30) → reject',
    prose: longProseWithMonth.replace('April', 'February'),
    current: yearOnlyCurrent,
    haikuFn: fixedHaiku({
      date: '2007-02-30',
      precision: 'exact',
      year_quote: '2007',
      month_quote: 'February',
      day_quote: '28th',
    }),
    expectEscalated: false,
    expectReason: 'invalid-date',
  },
  {
    name: 'Haiku returns malformed date string → reject',
    prose: longProseWithMonth,
    current: yearOnlyCurrent,
    haikuFn: fixedHaiku({
      date: '2007/04/28',
      precision: 'exact',
      year_quote: '2007',
      month_quote: 'April',
      day_quote: '28th',
    }),
    expectEscalated: false,
    expectReason: 'invalid-date',
  },
  {
    name: 'Haiku returns precision=year (invalid) → reject',
    prose: longProseWithMonth,
    current: yearOnlyCurrent,
    haikuFn: fixedHaiku({
      date: '2007-01-01',
      precision: 'year' as any,
      year_quote: '2007',
    }),
    expectEscalated: false,
    expectReason: 'haiku-parse',
  },

  // ── Case-insensitive claim-check ────────────────────────────────
  {
    name: 'Haiku quote case differs but folds (April vs APRIL) → upgrade',
    prose: longProseWithMonth,
    current: yearOnlyCurrent,
    haikuFn: fixedHaiku({
      date: '2007-04-28',
      precision: 'exact',
      year_quote: '2007',
      month_quote: 'APRIL',   // case differs from source 'April'
      day_quote: '28th',
    }),
    expectEscalated: true,
    expectReason: 'upgraded',
  },
]

;(async () => {
  let pass = 0
  let fail = 0
  const fails: string[] = []

  for (const fx of FIXTURES) {
    const result = await escalateDateWithHaiku(fx.prose, fx.current, {
      haikuFn: fx.haikuFn,
    })

    let ok = true
    const diffs: string[] = []

    if (result.escalated !== fx.expectEscalated) {
      ok = false
      diffs.push('  escalated: want=' + fx.expectEscalated + ' got=' + result.escalated)
    }
    if (fx.expectReason !== undefined && result.reason !== fx.expectReason) {
      ok = false
      diffs.push('  reason: want=' + fx.expectReason + ' got=' + result.reason)
    }
    if (fx.expectDate !== undefined && result.result.date !== fx.expectDate) {
      ok = false
      diffs.push('  date: want=' + fx.expectDate + ' got=' + result.result.date)
    }
    if (fx.expectPrecision !== undefined && result.result.precision !== fx.expectPrecision) {
      ok = false
      diffs.push('  precision: want=' + fx.expectPrecision + ' got=' + result.result.precision)
    }
    if (fx.expectSource !== undefined && result.result.source !== fx.expectSource) {
      ok = false
      diffs.push('  source: want=' + fx.expectSource + ' got=' + result.result.source)
    }

    if (ok) {
      process.stdout.write('.')
      pass++
    } else {
      process.stdout.write('F')
      fail++
      fails.push('[' + fx.name + ']\n' + diffs.join('\n'))
    }
  }

  console.log('')
  console.log('')
  console.log('Total: ' + FIXTURES.length + ' | Pass: ' + pass + ' | Fail: ' + fail)
  if (fails.length) {
    console.log('')
    console.log('Failures:')
    for (const f of fails) {
      console.log(f)
      console.log('')
    }
    process.exit(1)
  }
})()
