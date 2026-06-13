/**
 * CA systemic sweep — scan ALL approved chronicling-america rows for three
 * extraction failure-mode patterns surfaced by the three demo archives:
 *
 *   (1) mundane_weather    — lightning/storm news with no anomalous framing
 *   (2) freaks_of_nature   — 19th-century curiosity-column oddities
 *   (3) ambiguous_wildlife — known-species reports tagged 'cryptids'
 *
 * Default DRY RUN. Writes outputs/ca-systemic-sweep.csv. With --apply:
 *   - Unambiguous matches (pattern says ARCHIVE) → status='archived',
 *     metadata.archive_reason='systemic_sweep_v1'
 *   - Ambiguous matches (pattern says HOLD)      → metadata.qc_flag append
 *     'mundane_event_review' (status untouched, surfaces in held queue).
 *
 * Conservative posture: when in doubt, HOLD, not archive. Only the three
 * patterns marked archive_action='archive' below auto-archive; the rest hold.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/ca-systemic-sweep.ts          # dry run (default)
 *   npx tsx scripts/ca-systemic-sweep.ts --apply  # writes
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');

// ─── Patterns (shared with ca-qc-retro-fix's `mundane_freak_or_wildlife`) ─────

// (1) Mundane weather/storm with NO anomalous framing
const WEATHER_MUNDANE_RE = /struck by lightning|lightning struck|bolt of lightning|thunderbolt struck|killed by lightning|injured by lightning/i;
const ANOMALOUS_FRAMING_RE = /\b(apparition|ghost|presentiment|vision|premonition|unexplained|mysterious|spectral|phantom)\b/i;
// Additional anomalous-title cues that should keep weather pieces in HOLD even
// when no formal "apparition/ghost" keyword fires — e.g. "Lightning Passes
// Through Open Doors Unharmed" reads as anomaly-of-the-weather, not mundane
// news.
const ANOMALOUS_WEATHER_TITLE_RE = /\b(unharmed|miraculous|miracle|narrow escape|saved by|warned|warning|strange|peculiar|odd|defies|inexplicable)\b/i;

// (2) 19th-century "freak of nature" curiosity-column oddities
const FREAK_NATURE_RE = /winged (trout|fish|snake|frog|toad|cat|dog|rabbit|chicken)|two-headed|three-headed|double-headed|monstrous birth|freak (of nature|calf|fish)|albino (deer|squirrel|crow)|preserve(d)? in (alcohol|spirits)|exhibited at (the )?(fair|carnival|museum)|curiosity hunters|exhibit as a curiosity|on exhibition at|on display at|specimen (will be|is being) exhibited/i;
// The conservative title-level subset that signals "this whole piece is a
// curiosity-column oddity, not a witness account." Match these in the TITLE
// to auto-archive. Body-only matches stay HOLD because phrases like "on
// exhibition at" / "preserved in alcohol" often appear as incidental flavor
// inside otherwise-legitimate cryptid witness reports.
const FREAK_TITLE_RE = /\b(winged (trout|fish|snake|frog|toad|cat|dog|rabbit|chicken)|two-headed|three-headed|double-headed|monstrous birth|freak (of nature|calf|fish)|albino (deer|squirrel|crow))\b/i;

// (3) Ambiguous wildlife dressed as cryptid
const WILDLIFE_VERB_RE = /(whale|shark|porpoise|dolphin|seal|otter|moose|elk|deer|bear|wolf|panther|wildcat|bobcat|fox|owl|eagle|hawk|alligator|crocodile|snake|octopus|squid) (seen|sighted|spotted|reported|observed|encountered)/i;
const ANOMALOUS_WILDLIFE_RE = /glowing|luminous|spectral|phantom|enormous (size|head|teeth|jaws)|impossible|unknown species|never seen before|defies (known|classification)/i;

// ─── Row shape ───────────────────────────────────────────────────────────────
interface Row {
  id: string;
  title: string | null;
  category: string | null;
  status: string | null;
  original_report_id: string | null;
  description: string | null;
  summary: string | null;
  paradocs_narrative: string | null;
  metadata: any;
}

function bodyText(r: Row): string {
  return [r.summary, r.description, r.paradocs_narrative].filter(Boolean).join('\n');
}

function yearFromReportId(rid: string | null): string {
  if (!rid) return 'unknown';
  const m = rid.match(/-(\d{4})-/);
  return m ? m[1] : 'unknown';
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
  if (parts.includes(add)) return existing;
  parts.push(add);
  return parts.join(',');
}
function hasFlag(meta: any, flag: string): boolean {
  return qcFlagString(meta).split(',').map(s => s.trim()).includes(flag);
}

// ─── Pattern dispatch ────────────────────────────────────────────────────────
type Action = 'archive' | 'hold';
interface Match {
  pattern: 'mundane_weather' | 'freaks_of_nature' | 'ambiguous_wildlife';
  action: Action;
  reason: string;
}

function classify(r: Row): Match | null {
  const title = r.title || '';
  const body  = bodyText(r);
  const full  = title + '\n' + body;

  // (1) mundane weather + no anomalous framing → archive (unambiguous; matches
  //     the Tuscaloosa demo). If the title cues anomaly ("unharmed", "narrow
  //     escape", "miraculous"), downgrade to HOLD.
  if (WEATHER_MUNDANE_RE.test(full) && !ANOMALOUS_FRAMING_RE.test(full)) {
    const m = full.match(WEATHER_MUNDANE_RE)![0];
    const action: Action = ANOMALOUS_WEATHER_TITLE_RE.test(title) ? 'hold' : 'archive';
    return { pattern: 'mundane_weather', action, reason: `weather=${m}` };
  }

  // (2) freaks-of-nature curio. ARCHIVE only when the TITLE itself carries the
  //     curiosity-marker (winged X, two-headed Y, freak of nature) AND there is
  //     no anomalous framing — that's the Dolgeville-winged-trout shape, where
  //     the headline IS the curiosity. Body-only matches ("on exhibition at",
  //     "preserved in alcohol") often appear inside legitimate cryptid witness
  //     accounts as incidental flavor — those default to HOLD for human review.
  if (FREAK_NATURE_RE.test(full)) {
    const m = full.match(FREAK_NATURE_RE)![0];
    const titleHit = FREAK_TITLE_RE.test(title);
    const anomFrame = ANOMALOUS_FRAMING_RE.test(full);
    const action: Action = (titleHit && !anomFrame) ? 'archive' : 'hold';
    return { pattern: 'freaks_of_nature', action, reason: `freak=${m}${titleHit ? ' [title]' : ''}` };
  }

  // (3) ambiguous wildlife (cryptids tag + known species verb + no anomalous
  //     description) → hold. Wildlife is the most subjective bucket so default
  //     to HOLD; founder gets eyes on each one.
  if (r.category === 'cryptids' && WILDLIFE_VERB_RE.test(body) && !ANOMALOUS_WILDLIFE_RE.test(body)) {
    const m = body.match(WILDLIFE_VERB_RE)![0];
    return { pattern: 'ambiguous_wildlife', action: 'hold', reason: `wildlife=${m}` };
  }

  return null;
}

// ─── Fetch all approved chronicling-america rows ─────────────────────────────
async function fetchAll(): Promise<Row[]> {
  const PAGE = 500;
  const rows: Row[] = [];
  let from = 0;
  const select = [
    'id', 'title', 'category', 'status', 'original_report_id',
    'description', 'summary', 'paradocs_narrative', 'metadata',
  ].join(',');
  while (true) {
    const { data, error } = await sb.from('reports').select(select)
      .eq('source_type', 'chronicling-america')
      .eq('status', 'approved')
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

interface FlatMatch {
  id: string;
  title: string;
  year: string;
  pattern: Match['pattern'];
  action: Action;
  reason: string;
  row: Row;
}

async function main() {
  process.stderr.write(`mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN'}\n`);
  process.stderr.write(`fetching all approved CA rows...\n`);
  const rows = await fetchAll();
  process.stderr.write(`fetched ${rows.length} rows\n\n`);

  const matches: FlatMatch[] = [];
  for (const r of rows) {
    const m = classify(r);
    if (!m) continue;
    matches.push({
      id: r.id,
      title: r.title || '',
      year: yearFromReportId(r.original_report_id),
      pattern: m.pattern,
      action: m.action,
      reason: m.reason,
      row: r,
    });
  }

  // counts
  const byPattern: Record<string, FlatMatch[]> = {
    mundane_weather: [],
    freaks_of_nature: [],
    ambiguous_wildlife: [],
  };
  for (const m of matches) byPattern[m.pattern].push(m);

  console.log('═══ counts ═══');
  for (const p of Object.keys(byPattern)) {
    const arc = byPattern[p].filter(m => m.action === 'archive').length;
    const hld = byPattern[p].filter(m => m.action === 'hold').length;
    console.log(`  ${p.padEnd(20)}  total=${String(byPattern[p].length).padStart(4)}  archive=${arc}  hold=${hld}`);
  }
  console.log(`  TOTAL                 ${String(matches.length).padStart(10)}`);
  console.log('');

  // 10 spot samples per pattern
  for (const p of Object.keys(byPattern)) {
    const list = byPattern[p];
    if (list.length === 0) continue;
    console.log(`── ${p} samples (up to 10) ──`);
    for (const s of list.slice(0, 10)) {
      console.log(`  ${s.action.toUpperCase().padEnd(7)} ${s.id} ${s.year} "${s.title.slice(0, 90)}"  [${s.reason.slice(0, 60)}]`);
    }
    console.log('');
  }

  // CSV
  const outDir = fs.existsSync('/sessions/affectionate-tender-fermi/mnt/paradocs/outputs')
    ? '/sessions/affectionate-tender-fermi/mnt/paradocs/outputs'
    : path.resolve(process.cwd(), 'outputs');
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  const csvPath = path.join(outDir, 'ca-systemic-sweep.csv');
  const lines = ['id,title,year,pattern,suggested_action,reason'];
  for (const m of matches) {
    const t = (m.title || '').replace(/"/g, '""');
    const r = m.reason.replace(/"/g, '""');
    lines.push(`${m.id},"${t}",${m.year},${m.pattern},${m.action},"${r}"`);
  }
  fs.writeFileSync(csvPath, lines.join('\n'));
  console.log(`csv: ${csvPath} (${matches.length} rows)`);

  if (!APPLY) {
    console.log('\n(dry run) no writes performed. re-run with --apply to write.');
    return;
  }

  console.log(`\napplying ${matches.length} updates...`);
  let archived = 0, held = 0, fail = 0, skipped = 0;
  for (const m of matches) {
    const meta = (m.row.metadata && typeof m.row.metadata === 'object') ? { ...m.row.metadata } : {};
    if (m.action === 'archive') {
      // skip if already archived (e.g., Task-A demo rows shouldn't be re-touched
      // here because we filter status='approved', but defensive)
      if (m.row.status === 'archived') { skipped++; continue; }
      meta.archive_reason = 'systemic_sweep_v1';
      meta.systemic_sweep_pattern = m.pattern;
      const { error } = await sb.from('reports')
        .update({ status: 'archived', metadata: meta })
        .eq('id', m.id);
      if (error) { fail++; console.error(`  FAIL archive ${m.id}: ${error.message}`); }
      else archived++;
    } else {
      if (hasFlag(meta, 'mundane_event_review')) { skipped++; continue; }
      meta.qc_flag = appendFlag(qcFlagString(meta), 'mundane_event_review');
      const { error } = await sb.from('reports')
        .update({ metadata: meta })
        .eq('id', m.id);
      if (error) { fail++; console.error(`  FAIL hold ${m.id}: ${error.message}`); }
      else held++;
    }
  }
  console.log(`done: archived=${archived} held=${held} skipped=${skipped} fail=${fail}`);
}
main().catch(e => { console.error(e); process.exit(1); });
