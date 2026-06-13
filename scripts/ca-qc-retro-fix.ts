/**
 * Chronicling-America retro QC fix — year-agnostic, pattern-based.
 *
 * Scope: ALL rows where source_type='chronicling-america' AND status='pending_review'.
 * No year filter — covers 1896, 1897, and any future re-runs that landed in
 * pending_review before V11.18.26's expanded lexicon. (1895 has no pending_review
 * rows so it's a no-op there.)
 *
 * Four pattern-based passes, in order, default DRY RUN. Pass --apply to write.
 *
 *   (1) Expanded PERIOD_TERM_LEXICON backstop → metadata.genre_flags.period_sensitive=true
 *       (forces pd-bulk-approve.ts hold via its period_sensitive check).
 *   (2) Airship-wave hoax detection → metadata.qc_flag append 'airship_wave_hoax_review'.
 *   (3) Wildlife / debunked / "turned out to be mundane" → 'wildlife_or_debunked_review'.
 *   (4) Bad-geocode sanity check (nonsense city/state pairs) → 'bad_geocode_review'.
 *
 * IDEMPOTENT — each pass checks existing flag state before appending. Re-running
 * the script on already-fixed rows is a no-op.
 *
 * No archive, no status change. All flagged rows route to held queue via existing
 * pd-bulk-approve.ts logic. False positives surface for review, not loss.
 *
 * Usage:
 *   npx tsx scripts/ca-qc-retro-fix.ts            # dry run (default)
 *   npx tsx scripts/ca-qc-retro-fix.ts --apply    # write
 *
 * Output: stdout log of every flagged row + counts summary (per-check × per-year).
 * If --apply: outputs/ca-qc-retro-fix-applied.csv audit trail.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf-8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}
loadEnv('/sessions/affectionate-tender-fermi/mnt/paradocs/.env.local');
loadEnv(`${process.cwd()}/.env.local`);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source .env.local first.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');

// ── (1) expanded PERIOD_TERM_LEXICON (copy of the regex in ca-extract-ingest.ts) ──
const PERIOD_TERM_LEXICON = /\b(negro(es)?|negress(es)?|colored (man|men|woman|women|people|folks?|boys?|girls?|church|preacher|preachers|congregation|servant|servants)|darke?y(s|ies)?|mammy|coon(s)?|chinam[ae]n|chinee|injun(s)?|redskin(s)?|papoose(s)?|squaw(s)?|hottentot(s)?|half-breed(s)?|savage (tribe|race|blood)|coolie(s)?|pickaninn(y|ies)|mulatto(es)?|oriental(s)?|japs?(?!an))\b/i;

function matchedPeriodTerms(text: string): string[] {
  const re = new RegExp(PERIOD_TERM_LEXICON.source, 'gi');
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.add(m[0].toLowerCase());
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return Array.from(out);
}

// ── (2) airship hoax detector — same regex from 1897 fix ──
// Trigger: title or body mentions airship/air-ship AND text matches hoax cues.
const AIRSHIP_HOAX_RE = /inventor (announces|reveals|explains|admits)|patent applied|patent pending|(secured|applied for|secure(d)?) patents?|patents? (for|on) (their|the|all)|manufactured in (an? )?(interior )?[A-Z]?\w+ (town|city|illinois)|factory in (st\.? louis|chicago|illinois)|fleet of (five|six|several) (airships?|ships?|vessels?)|crew (of (five|six|seven|eight) men|members? (spoke|stated|told|informed))|edison|tesla|professor [A-Z]\w+ (announces|claims|exhibits)|confessed (prank|hoax)|admitted (prank|hoax|joke)|practical joke|kite (with|carrying)|paper balloon|fire balloon|toy balloon|abducted (a |the )?(calf|cow|horse|cattle|heifer)|(stole|seized|took) (a |the )?(two-year-old |young |\w+ )?(calf|cow|horse|cattle|heifer)|secured patents|manufactured in [A-Z]\w+/i;

function isAirshipHoax(title: string, body: string): boolean {
  const combined = title + '\n' + body;
  if (!/airship|air-ship/i.test(combined)) return false;
  return AIRSHIP_HOAX_RE.test(body) || AIRSHIP_HOAX_RE.test(title);
}

// ── (3) wildlife / debunked / mundane ──
const RHETORICAL_RE = /proved\s+to\s+be\s+(?:the\s+)?(wisest|most|best|worst|greatest|finest|truest|kindest|noblest|fittest)\b/i;
const DEBUNK_RESOLVED: RegExp[] = [
  /turned\s+out\s+to\s+be\s+(?:a|an|the|nothing|no|just|merely|only)\s+\w+/i,
  /proved\s+to\s+be\s+(?:a|an|the|nothing|no|just|merely|only|due\s+to)\s+\w+/i,
  /was\s+no\s+more\s+than\s+(?:a|an|the)/i,
  /nothing\s+more\s+than\s+(?:a|an|the)/i,
  /escaped\s+(circus|menagerie|zoo|exhibition|asylum\s+patient)/i,
  /mystery\s+(animal|creature|beast)\s+(killed|shot|captured|caught)/i,
  /(?:later|finally|eventually)\s+identified\s+as/i,
  /(?:was|were)\s+identified\s+as\s+(?:a|an|the)\s+(dog|cat|owl|hawk|raccoon|bear|deer|fox|wolf|coyote|snake|squirrel|opossum|skunk|panther|wildcat|moose|gorilla|monkey|ape|fish|bat|crow|buzzard|vulture|hare|rabbit|cow|horse|pig|goat|sheep|mule|donkey|burro|turtle|toad|frog|lizard|alligator|crocodile|eagle|otter|mink|weasel|cougar|lynx|bobcat|mountain\s+lion|kite|balloon|star|planet|venus|jupiter|meteor|comet|kerosene|lantern|reflection|shadow|tree|rosebush|tablecloth|dahlia)/i,
  /revealed\s+(to\s+be|as)\s+(?:a|an|the|nothing|just)/i,
];
const ANIMAL_TITLE_RE = /\b(snake|fish|bear|wildcat|panther|moose|gorilla|owl|hawk|coyote|wolf|fox|rabbit|squirrel|leatherback|turtle)\b/i;
const DIMENSION_RE = /\b\d+\s*(feet|foot|inches?|in\.|ft\.?|pounds?|lbs?)\b/i;
const ANIMAL_VERB_RE = /\b(killed|shot|captured|caught|trapped|killed\s+by|hunters)\b/i;

function wildlifeMatches(title: string, body: string): string[] {
  const text = title + '\n' + body;
  const matched: string[] = [];
  for (const re of DEBUNK_RESOLVED) {
    const m = text.match(re);
    if (m && !RHETORICAL_RE.test(m[0])) matched.push(m[0]);
  }
  if (ANIMAL_TITLE_RE.test(title) && DIMENSION_RE.test(text) && ANIMAL_VERB_RE.test(text)) {
    const am = title.match(ANIMAL_TITLE_RE);
    matched.push(`title-wildlife: ${am?.[0]}`);
  }
  return Array.from(new Set(matched));
}

// ── (4) bad geocode — nonsense city/state pair detection ──
// Build a small whitelist of well-known major US cities and their actual states.
// If a row's location_city matches one of these and location_state is something
// else, flag it. Keeps the false-positive surface tiny — only flags blatant
// mismatches like "Kansas City, NH" or "Sacramento, TN".
const KNOWN_CITY_STATE: Record<string, string[]> = {
  // city (lowercased) → list of states it legitimately exists in
  'kansas city':   ['MO', 'KS'],
  'sacramento':    ['CA'],
  'san francisco': ['CA'],
  'los angeles':   ['CA'],
  'san diego':     ['CA'],
  'oakland':       ['CA'],
  'chicago':       ['IL'],
  'boston':        ['MA'],
  'philadelphia':  ['PA'],
  'pittsburgh':    ['PA'],
  'baltimore':     ['MD'],
  'new orleans':   ['LA'],
  'denver':        ['CO'],
  'seattle':       ['WA'],
  'portland':      ['OR', 'ME'],
  'atlanta':       ['GA'],
  'memphis':       ['TN'],
  'nashville':     ['TN'],
  'milwaukee':     ['WI'],
  'minneapolis':   ['MN'],
  'st. paul':      ['MN'],
  'st. louis':     ['MO'],
  'cincinnati':    ['OH'],
  'cleveland':     ['OH'],
  'detroit':       ['MI'],
  'indianapolis':  ['IN'],
  'louisville':    ['KY'],
  'omaha':         ['NE'],
  'des moines':    ['IA'],
  'salt lake city':['UT'],
  'houston':       ['TX'],
  'dallas':        ['TX'],
  'san antonio':   ['TX'],
  'galveston':     ['TX'],
  'austin':        ['TX'],
  'el paso':       ['TX'],
  'phoenix':       ['AZ'],
  'tucson':        ['AZ'],
  'albuquerque':   ['NM'],
  'santa fe':      ['NM'],
  'reno':          ['NV'],
  'helena':        ['MT'],
  'cheyenne':      ['WY'],
};
// state name → 2-letter code (lowercase keys for case-insensitive match)
const STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'district of columbia': 'DC', 'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI',
  'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME',
  'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN',
  'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE',
  'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX',
  'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
  'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
};
function normalizeCity(c: string | null | undefined): string {
  if (!c) return '';
  return c.trim().toLowerCase().replace(/\s+/g, ' ');
}
function normalizeStateCode(s: string | null | undefined): string {
  if (!s) return '';
  const t = s.trim();
  // already 2-letter
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  // full name
  const code = STATE_NAME_TO_CODE[t.toLowerCase()];
  return code || t.toUpperCase();  // unknown → return upper as-is (won't match whitelist, but won't false-flag known good)
}
function badGeocodeReason(city: string | null, state: string | null): string | null {
  const c = normalizeCity(city);
  const s = normalizeStateCode(state);
  if (!c || !s) return null;
  const allowed = KNOWN_CITY_STATE[c];
  if (!allowed) return null;            // city not in whitelist → don't judge
  if (allowed.includes(s)) return null; // state matches → OK
  // only flag when state resolves to a real 2-letter US code AND it's not in allowed
  // (this filters out non-US locations that share a city name)
  if (!/^[A-Z]{2}$/.test(s)) return null;
  return `${city}, ${state} — known states: ${allowed.join('/')}`;
}

// ── types ────────────────────────────────────────────────────────────────────
interface Row {
  id: string;
  title: string | null;
  description: string | null;
  summary: string | null;
  answer_line: string | null;
  paradocs_narrative: string | null;
  original_report_id: string | null;
  city: string | null;
  state_province: string | null;
  country: string | null;
  location_name: string | null;
  metadata: any;
  status: string | null;
}

function bodyText(r: Row): string {
  return [r.summary, r.description, r.answer_line, r.paradocs_narrative].filter(Boolean).join('\n');
}

function qcFlagString(meta: any): string {
  if (!meta) return '';
  const q = meta.qc_flag;
  if (Array.isArray(q)) return q.join(',');
  if (typeof q === 'string') return q;
  return '';
}

function appendFlag(existing: string, add: string): string {
  if (!existing) return add;
  const parts = existing.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.includes(add)) return existing;  // idempotent
  parts.push(add);
  return parts.join(',');
}

function hasFlag(meta: any, flag: string): boolean {
  return qcFlagString(meta).split(',').map(s => s.trim()).includes(flag);
}

function yearFromReportId(rid: string | null): string {
  if (!rid) return 'unknown';
  const m = rid.match(/-(\d{4})-/);
  return m ? m[1] : 'unknown';
}

// ── fetch all CA pending_review rows in pages ─────────────────────────
async function fetchAll(): Promise<Row[]> {
  const PAGE = 500;
  const rows: Row[] = [];
  let from = 0;
  const select = [
    'id', 'title', 'description', 'summary', 'answer_line',
    'paradocs_narrative', 'original_report_id',
    'city', 'state_province', 'country', 'location_name',
    'metadata', 'status',
  ].join(',');
  while (true) {
    const { data, error } = await sb.from('reports').select(select)
      .eq('source_type', 'chronicling-america')
      .eq('status', 'pending_review')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as Row[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// ── updater ──────────────────────────────────────────────────────────────────
interface PlannedUpdate {
  id: string;
  title: string;
  year: string;
  reasons: string[];
  setGenrePeriod?: boolean;
  qcFlagsToAdd: string[];
  matchedTerms?: string[];
}

async function applyUpdate(r: Row, plan: PlannedUpdate): Promise<{ ok: boolean; err?: string }> {
  const meta = (r.metadata && typeof r.metadata === 'object') ? { ...r.metadata } : {};
  if (plan.setGenrePeriod) {
    const gf = (meta.genre_flags && typeof meta.genre_flags === 'object') ? { ...meta.genre_flags } : {};
    gf.period_sensitive = true;
    meta.genre_flags = gf;
  }
  if (plan.qcFlagsToAdd.length > 0) {
    let cur = qcFlagString(meta);
    for (const f of plan.qcFlagsToAdd) cur = appendFlag(cur, f);
    meta.qc_flag = cur;
  }
  const { error } = await sb.from('reports').update({ metadata: meta }).eq('id', r.id);
  if (error) return { ok: false, err: error.message };
  return { ok: true };
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  process.stderr.write(`mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN'}\n`);
  process.stderr.write(`fetching all CA pending_review rows...\n`);
  const rows = await fetchAll();
  process.stderr.write(`fetched ${rows.length} rows\n\n`);

  // year breakdown for sanity
  const yearTotals: Record<string, number> = {};
  for (const r of rows) {
    const y = yearFromReportId(r.original_report_id);
    yearTotals[y] = (yearTotals[y] || 0) + 1;
  }
  process.stderr.write(`per-year totals: ${JSON.stringify(yearTotals)}\n\n`);

  const plans = new Map<string, PlannedUpdate>();
  function planFor(r: Row): PlannedUpdate {
    let p = plans.get(r.id);
    if (!p) {
      p = {
        id: r.id,
        title: r.title || '',
        year: yearFromReportId(r.original_report_id),
        reasons: [],
        qcFlagsToAdd: [],
      };
      plans.set(r.id, p);
    }
    return p;
  }

  // per-check per-year counters
  const counts = {
    period:   {} as Record<string, number>,
    airship:  {} as Record<string, number>,
    wildlife: {} as Record<string, number>,
    geocode:  {} as Record<string, number>,
  };
  function bump(check: keyof typeof counts, year: string) {
    counts[check][year] = (counts[check][year] || 0) + 1;
  }

  // ── pass (1): expanded lexicon backstop ──
  for (const r of rows) {
    const text = `${r.title || ''} ${bodyText(r)}`;
    const matched = matchedPeriodTerms(text);
    if (matched.length === 0) continue;
    if (r.metadata?.genre_flags?.period_sensitive === true) continue;  // idempotent
    const p = planFor(r);
    p.setGenrePeriod = true;
    p.matchedTerms = matched;
    p.reasons.push(`period_language terms=${matched.join('|')}`);
    bump('period', p.year);
    console.log(`[period_language] ${p.year} ${r.id} :: ${(r.title || '').slice(0, 80)} :: terms=${matched.join(',')}`);
  }

  // ── pass (2): airship hoaxes ──
  for (const r of rows) {
    if (!isAirshipHoax(r.title || '', bodyText(r))) continue;
    if (hasFlag(r.metadata, 'airship_wave_hoax_review')) continue;  // idempotent
    const p = planFor(r);
    p.qcFlagsToAdd.push('airship_wave_hoax_review');
    p.reasons.push('airship_wave_hoax');
    bump('airship', p.year);
    console.log(`[airship_hoax]    ${p.year} ${r.id} :: ${(r.title || '').slice(0, 80)}`);
  }

  // ── pass (3): wildlife / debunked ──
  for (const r of rows) {
    const matches = wildlifeMatches(r.title || '', bodyText(r));
    if (matches.length === 0) continue;
    if (hasFlag(r.metadata, 'wildlife_or_debunked_review')) continue;  // idempotent
    const p = planFor(r);
    p.qcFlagsToAdd.push('wildlife_or_debunked_review');
    p.reasons.push(`wildlife matches=${matches.length}`);
    bump('wildlife', p.year);
    console.log(`[wildlife]        ${p.year} ${r.id} :: ${(r.title || '').slice(0, 80)} :: ${matches.join(' / ').slice(0, 120)}`);
  }

  // ── pass (4): bad geocode ──
  for (const r of rows) {
    const reason = badGeocodeReason(r.city, r.state_province);
    if (!reason) continue;
    if (hasFlag(r.metadata, 'bad_geocode_review')) continue;  // idempotent
    const p = planFor(r);
    p.qcFlagsToAdd.push('bad_geocode_review');
    p.reasons.push(`bad_geocode: ${reason}`);
    bump('geocode', p.year);
    console.log(`[bad_geocode]     ${p.year} ${r.id} :: ${(r.title || '').slice(0, 60)} :: ${reason}`);
  }

  // ── summary table ──
  const allYears = Array.from(new Set([
    ...Object.keys(counts.period),
    ...Object.keys(counts.airship),
    ...Object.keys(counts.wildlife),
    ...Object.keys(counts.geocode),
    ...Object.keys(yearTotals),
  ])).sort();

  console.log('');
  console.log('═══ per-check × per-year ═══');
  console.log('year    | period | airship | wildlife | geocode | total-scanned');
  console.log('--------+--------+---------+----------+---------+--------------');
  for (const y of allYears) {
    const p = counts.period[y]   || 0;
    const a = counts.airship[y]  || 0;
    const w = counts.wildlife[y] || 0;
    const g = counts.geocode[y]  || 0;
    const t = yearTotals[y]      || 0;
    console.log(`${y.padEnd(7)} | ${String(p).padStart(6)} | ${String(a).padStart(7)} | ${String(w).padStart(8)} | ${String(g).padStart(7)} | ${String(t).padStart(13)}`);
  }
  const totP = Object.values(counts.period).reduce((a, b) => a + b, 0);
  const totA = Object.values(counts.airship).reduce((a, b) => a + b, 0);
  const totW = Object.values(counts.wildlife).reduce((a, b) => a + b, 0);
  const totG = Object.values(counts.geocode).reduce((a, b) => a + b, 0);
  console.log('--------+--------+---------+----------+---------+--------------');
  console.log(`TOTAL   | ${String(totP).padStart(6)} | ${String(totA).padStart(7)} | ${String(totW).padStart(8)} | ${String(totG).padStart(7)} | ${String(rows.length).padStart(13)}`);
  console.log('');
  console.log(`unique rows touched: ${plans.size}`);
  console.log(`mode:                ${APPLY ? 'APPLY' : 'DRY RUN — no writes'}`);

  if (!APPLY) {
    console.log('\n(dry run) no writes performed. re-run with --apply to write.');
    return;
  }

  console.log(`\napplying ${plans.size} updates...`);
  const csvLines: string[] = ['id,year,title,flags_added,reasons'];
  let ok = 0, fail = 0;
  for (const [id, plan] of plans) {
    const r = rows.find(x => x.id === id)!;
    const res = await applyUpdate(r, plan);
    if (res.ok) {
      ok++;
      const flags: string[] = [];
      if (plan.setGenrePeriod) flags.push('genre_flags.period_sensitive=true');
      for (const f of plan.qcFlagsToAdd) flags.push(`qc_flag+=${f}`);
      const titleEsc = (plan.title || '').replace(/"/g, '""');
      const reasonsEsc = plan.reasons.join(' | ').replace(/"/g, '""');
      csvLines.push(`${id},${plan.year},"${titleEsc}","${flags.join(';')}","${reasonsEsc}"`);
    } else {
      fail++;
      console.error(`  FAIL ${id}: ${res.err}`);
    }
  }
  console.log(`updates: ok=${ok} fail=${fail}`);

  const outDir = fs.existsSync('/sessions/affectionate-tender-fermi/mnt/paradocs/outputs')
    ? '/sessions/affectionate-tender-fermi/mnt/paradocs/outputs'
    : `${process.cwd()}/outputs`;
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  const csvPath = `${outDir}/ca-qc-retro-fix-applied.csv`;
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`audit trail: ${csvPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
