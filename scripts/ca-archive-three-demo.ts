/**
 * One-off: archive three CA demo rows that exposed extraction failure modes.
 *
 *   1. Tuscaloosa lightning shoe (1895-09-04) — mundane storm news
 *   2. Dolgeville winged trout   (1895-06-11) — 1890s "freak of nature" curio
 *   3. Wood Island roaring whale (1895-12-17) — known wildlife dressed as cryptid
 *
 * Read-then-update via Supabase service role. Sets status='archived', adds
 * metadata.archive_reason='operator_qc_failure_mode_demo', preserves every
 * other field on the row.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/ca-archive-three-demo.ts            # dry preview
 *   npx tsx scripts/ca-archive-three-demo.ts --apply    # writes
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

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

const TARGETS: { label: string; titleRe: RegExp }[] = [
  { label: 'tuscaloosa_lightning_shoe', titleRe: /Lightning Strikes Cook'?s Shoe in Tuscaloosa/i },
  { label: 'dolgeville_winged_trout',  titleRe: /Winged Trout Caught in Dolgeville/i },
  { label: 'wood_island_roaring_whale', titleRe: /Roaring Whale Circles Schooner Off Wood Island/i },
];

interface Row {
  id: string;
  title: string | null;
  status: string | null;
  original_report_id: string | null;
  metadata: any;
}

async function findOne(titleRe: RegExp): Promise<Row | null> {
  // Server-side filter using ilike on a distinctive substring, then regex client-side.
  const probe = titleRe.source
    .replace(/\\[A-Za-z]/g, ' ')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 4)
    .slice(0, 2)
    .join('%');
  const { data, error } = await sb.from('reports')
    .select('id,title,status,original_report_id,metadata')
    .eq('source_type', 'chronicling-america')
    .ilike('title', `%${probe}%`);
  if (error) { console.error('  fetch error', error.message); return null; }
  const matches = (data || []).filter((r: any) => r.title && titleRe.test(r.title));
  if (matches.length === 0) return null;
  if (matches.length > 1) console.warn(`  WARN: ${matches.length} rows matched; taking first by id`);
  return matches[0] as Row;
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  const found: { label: string; row: Row }[] = [];
  for (const t of TARGETS) {
    const row = await findOne(t.titleRe);
    if (!row) { console.log(`MISS    ${t.label}`); continue; }
    console.log(`FOUND   ${t.label}: id=${row.id} status=${row.status} orig=${row.original_report_id} title="${row.title}"`);
    found.push({ label: t.label, row });
  }
  if (found.length !== TARGETS.length) {
    console.error(`\nExpected ${TARGETS.length} rows, found ${found.length}. Aborting${APPLY ? ' write' : ''}.`);
    if (APPLY) process.exit(2);
  }
  if (!APPLY) {
    console.log('\nDry run — re-run with --apply to archive.');
    return;
  }
  console.log('');
  for (const { label, row } of found) {
    const meta = (row.metadata && typeof row.metadata === 'object') ? { ...row.metadata } : {};
    meta.archive_reason = 'operator_qc_failure_mode_demo';
    const { error } = await sb.from('reports')
      .update({ status: 'archived', metadata: meta })
      .eq('id', row.id);
    if (error) {
      console.error(`FAIL    ${label} ${row.id}: ${error.message}`);
    } else {
      console.log(`ARCHIVED ${label} ${row.id}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
