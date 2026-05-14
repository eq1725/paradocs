/**
 * V10.8.B.2 smoke test — run extractDate over sample prose drawn from each
 * adapter type and verify the unified result matches what the migrated
 * adapters now pass through.
 *
 * Not a replacement for the canonical extract-date fixture suite; this is
 * a quick "before commit" sanity check that adapter-typical strings still
 * produce sensible {date, precision, source} tuples.
 *
 * Run: npx ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' scripts/test-v10-8-b2-adapters.ts
 */

import { extractDate, ExtractDateOptions } from '../src/lib/ingestion/utils/extract-date';

type Expected = { date?: string | null; precision: string; source: string };
type Case = { adapter: string; description: string; opts: ExtractDateOptions; expected: Expected };

const CASES: Case[] = [
  // ── Reddit (post body, no structured field) ──────────────────────
  {
    adapter: 'reddit',
    description: 'reddit narrative with month-name date',
    opts: { prose: 'On April 28th 2007 I was driving home from work when I saw something in the sky.' },
    expected: { date: '2007-04-28', precision: 'exact', source: 'prose-monthname' },
  },
  {
    adapter: 'reddit',
    description: 'reddit narrative with year-only context',
    opts: { prose: 'Back in 1995 my grandmother’s house had this thing happen every night.' },
    expected: { date: '1995-01-01', precision: 'year', source: 'prose-year' },
  },
  // ── Reddit-v2 ────────────────────────────────────────────────────
  {
    adapter: 'reddit-v2',
    description: 'reddit-v2 selftext with no date references',
    opts: { prose: 'I have always felt something watching me at night, especially in older houses.' },
    expected: { precision: 'unknown', source: 'none' },
  },
  // ── IANDS ────────────────────────────────────────────────────────
  {
    adapter: 'iands',
    description: 'IANDS NDE narrative with month-only date',
    opts: { prose: 'During the car accident in April 2007 I left my body and saw a tunnel of light.' },
    expected: { date: '2007-04-01', precision: 'month', source: 'prose-monthname' },
  },
  // ── Erowid (structured + prose) ──────────────────────────────────
  {
    adapter: 'erowid',
    description: 'erowid Exp Year structured field',
    opts: { structured: '2018', prose: 'The dose hit about 30 minutes in.' },
    expected: { date: '2018-01-01', precision: 'year', source: 'structured' },
  },
  // ── Shadowlands ──────────────────────────────────────────────────
  {
    adapter: 'shadowlands',
    description: 'shadowlands haunted-place description with civil-war era',
    opts: { prose: 'The inn has been haunted since the 1860s, with sightings reported throughout the 20th century.' },
    expected: { date: '1865-01-01', precision: 'year', source: 'prose-year' },
  },
  // ── YouTube (video description) ──────────────────────────────────
  {
    adapter: 'youtube',
    description: 'youtube description with date mention',
    opts: { prose: 'In March 2019, a hiker captured this strange creature on his phone in the Pacific Northwest.' },
    expected: { date: '2019-03-01', precision: 'month', source: 'prose-monthname' },
  },
  // ── NDERF (structured "Date of NDE" with day=00) ─────────────────
  {
    adapter: 'nderf',
    description: 'NDERF structured Date of NDE with day-sentinel',
    opts: { structured: '04/00/2007' },
    expected: { date: '2007-04-01', precision: 'month', source: 'structured' },
  },
  {
    adapter: 'nderf',
    description: 'NDERF structured Date of NDE full date',
    opts: { structured: '2/4/2014' },
    expected: { date: '2014-02-04', precision: 'exact', source: 'structured' },
  },
  // ── BFRO (assembled structured: "Month Day, Year") ───────────────
  {
    adapter: 'bfro',
    description: 'BFRO assembled structured date (Month Day, Year)',
    opts: { structured: 'February 28, 2025' },
    expected: { date: '2025-02-28', precision: 'exact', source: 'structured' },
  },
  {
    adapter: 'bfro',
    description: 'BFRO bare year structured',
    opts: { structured: '2023' },
    expected: { date: '2023-01-01', precision: 'year', source: 'structured' },
  },
  // ── Ghosts of America (no structured, prose only) ────────────────
  {
    adapter: 'ghostsofamerica',
    description: 'GoA description with "around YYYY"',
    opts: { prose: 'It happened around 1987 in my grandmother’s farmhouse just outside town.' },
    expected: { date: '1987-01-01', precision: 'year', source: 'prose-year' },
  },
  // ── NUFORC (structured "Occurred" with time tail stripped) ───────
  {
    adapter: 'nuforc',
    description: 'NUFORC Occurred ISO date',
    opts: { structured: '2026-01-25', prose: 'Three bright orbs in formation.' },
    expected: { date: '2026-01-25', precision: 'exact', source: 'structured' },
  },
  // ── Wikipedia (structured row cell + lede prose) ─────────────────
  {
    adapter: 'wikipedia',
    description: 'Wikipedia row date cell',
    opts: { structured: 'August 1965', prose: 'Reported sightings near Exeter, New Hampshire involved multiple witnesses.' },
    expected: { date: '1965-08-01', precision: 'month', source: 'structured' },
  },
  // ── News (no structured; prose article body) ─────────────────────
  {
    adapter: 'news',
    description: 'News article body with embedded event date',
    opts: { prose: 'On July 4, 2023, residents of Sedona reported a glowing object that hovered for nearly an hour.' },
    expected: { date: '2023-07-04', precision: 'exact', source: 'prose-monthname' },
  },
  {
    adapter: 'news',
    description: 'News article with only pub-date in publishedAt (extractDate should not find a date in pure prose without date words)',
    opts: { prose: 'A new study has found that strange lights continue to appear in the desert.' },
    expected: { precision: 'unknown', source: 'none' },
  },
];

let pass = 0;
let fail = 0;
const fails: string[] = [];

for (const c of CASES) {
  const r = extractDate(c.opts);
  const ok =
    r.precision === c.expected.precision &&
    r.source === c.expected.source &&
    (c.expected.date === undefined || r.date === c.expected.date);

  if (ok) {
    process.stdout.write('.');
    pass++;
  } else {
    process.stdout.write('F');
    fail++;
    fails.push(
      `[${c.adapter}] ${c.description}\n` +
      `  expected: ${JSON.stringify(c.expected)}\n` +
      `  got:      ${JSON.stringify({ date: r.date, precision: r.precision, source: r.source, matchedText: r.matchedText })}`,
    );
  }
}

console.log('');
console.log('');
console.log(`Total: ${CASES.length} | Pass: ${pass} | Fail: ${fail}`);
if (fails.length) {
  console.log('');
  console.log('Failures:');
  for (const f of fails) {
    console.log(f);
    console.log('');
  }
  process.exit(1);
}
