/**
 * CA anomaly-gate rescue — 1896 + 1897 (V11.18.27)
 *
 * Pulls all Chronicling-America rows that the V11.18.25 anomaly gate demoted
 * to status='pending_review' with metadata.qc_flag containing 'anomaly_gate_review',
 * then classifies each via Haiku batch into:
 *
 *   restore_witness_sighting  — third-person newspaper account of a clearly
 *                               anomalous event (ghost, presentiment, apparition,
 *                               telepathy, prophetic dream, cryptid sighting,
 *                               mystery-airship sighting that ISN'T inventor news).
 *                               Gate misfired. APPLY: status='approved', strip
 *                               anomaly_gate_review from qc_flag (preserve others).
 *
 *   keep_held_for_chase       — borderline / ambiguous / partial extraction.
 *                               Leave row as-is for human review.
 *
 *   archive_correct           — gate was right: wildlife/freak, debunked,
 *                               airship-inventor patent news, weather damage,
 *                               curiosity exhibits, stage mind-reading, sermon,
 *                               theological piece. APPLY: status='archived',
 *                               preserve qc_flag intact.
 *
 * Default DRY RUN. Pass --apply to write.
 *
 *   npx tsx scripts/ca-anomaly-gate-rescue.ts            # dry run (default)
 *   npx tsx scripts/ca-anomaly-gate-rescue.ts --apply    # write
 *
 * Output CSV: outputs/ca-anomaly-gate-rescue.csv (id, title, year, classification, reason).
 *
 * Uses the Anthropic Message Batches API with claude-haiku-4-5-20251001. One
 * batch submission per ~100 rows for parallelism. Expected total cost < $1.
 *
 * NOTE on qc_flag shape: in the live data this is a JSON array (not a
 * comma-joined string). Filter uses LIKE on the serialized JSON to find rows
 * carrying the flag; mutation strips the entry from the array.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv('/sessions/affectionate-tender-fermi/mnt/paradocs/.env.local');
loadEnv(`${process.cwd()}/.env.local`);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const BATCH_API_URL = 'https://api.anthropic.com/v1/messages/batches';
const BATCH_SIZE = 100;
const PARALLEL_BATCHES = 5;

// Resume support: persist batch IDs so a second run can poll instead of re-submitting.
const CHECKPOINT_PATH = '/tmp/ca-anomaly-gate-rescue-batches.json';
interface Checkpoint { batches: Array<{ batchId: string; rowIds: string[] }> }
function loadCheckpoint(): Checkpoint | null {
  if (!fs.existsSync(CHECKPOINT_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf-8')); } catch { return null; }
}
function saveCheckpoint(c: Checkpoint) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(c, null, 2));
}

// Haiku pricing (4.5): $1/M input, $5/M output. Per-row: ~1200 input + ~80 output.
// Batch API gets a 50% discount.
const HAIKU_INPUT_PER_M = 1.0;
const HAIKU_OUTPUT_PER_M = 5.0;
const BATCH_DISCOUNT = 0.5;

// ── types ────────────────────────────────────────────────────────────────────
interface Row {
  id: string;
  title: string | null;
  description: string | null;
  summary: string | null;
  answer_line: string | null;
  paradocs_narrative: string | null;
  original_report_id: string | null;
  event_date: string | null;
  metadata: any;
}
type Classification = 'restore_witness_sighting' | 'keep_held_for_chase' | 'archive_correct';
interface Verdict {
  id: string;
  row: Row;
  classification: Classification | 'error';
  reason: string;
  year: string;
}

function bodyText(r: Row): string {
  return [r.paradocs_narrative, r.summary, r.description, r.answer_line].filter(Boolean).join('\n\n');
}
function yearOf(r: Row): string {
  if (r.event_date) return String(r.event_date).slice(0, 4);
  const m = (r.original_report_id || '').match(/-(\d{4})-/);
  return m ? m[1] : 'unknown';
}

// ── fetch ────────────────────────────────────────────────────────────────────
async function fetchAll(): Promise<Row[]> {
  const PAGE = 500;
  const select = 'id,title,description,summary,answer_line,paradocs_narrative,original_report_id,event_date,metadata';
  const rows: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('reports').select(select)
      .eq('source_type', 'chronicling-america')
      .eq('status', 'pending_review')
      .like('metadata->>qc_flag', '%anomaly_gate_review%')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error('fetch: ' + error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as Row[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// ── prompt ───────────────────────────────────────────────────────────────────
function buildPrompt(r: Row): string {
  const title = (r.title || '(no title)').slice(0, 200);
  const body = bodyText(r).slice(0, 800);
  const year = yearOf(r);
  return `You are triaging an 1896-1897 newspaper account that was demoted by an anomalous-content gate. The gate often misfires on legitimate witness reports because newspaper reportage is inherently third-person ("news_summary" framing), so many demoted rows are real ghost/apparition/premonition/sighting reports that should be restored.

Paradocs archives third-person newspaper accounts of clearly anomalous events from this era: ghost sightings, apparitions, presentiments / premonitions, prophetic dreams, telepathy, sea-serpent or cryptid sightings (when framed as anomalous, not mundane wildlife), mystery-airship SIGHTINGS by witnesses (NOT inventor news / patent claims / kite demos), and spirit phenomena.

Classify into one of three buckets:

  restore_witness_sighting — third-person newspaper account of a clearly anomalous event: ghost sighting, presentiment, premonition, apparition, telepathy, prophetic dream, sea serpent / cryptid sighting with anomalous framing, mystery airship sighting (NOT inventor news), spirit phenomena. The gate wrongly demoted these.

  keep_held_for_chase — borderline anomalous + something off (ambiguous framing, partial extraction, multiple flags, unclear whether it's a real sighting or a debunked one). When in doubt, prefer this over restore. Better to under-restore than to surface bad rows to the user.

  archive_correct — gate was right: mundane wildlife reports (large fish/whale/snake captured), debunked stories ("turned out to be", "proved to be a"), technology/aviation news (airship inventor announcement, patent claim, kite demo), period crime news, accidents, weather damage with no anomalous element, freaks of nature (winged/two-headed/preserved in alcohol), curiosity exhibitions, stage hypnotism, paid mind-reading performances, theological doctrine / sermon pieces.

YEAR: ${year}
TITLE: ${title}

BODY (first 800 chars):
${body}

Respond with JSON only, no markdown:
{"classification":"restore_witness_sighting"|"keep_held_for_chase"|"archive_correct","reason":"<one short sentence>"}`;
}

// ── batch submit/poll ────────────────────────────────────────────────────────
interface BatchRequest {
  custom_id: string;
  params: { model: string; max_tokens: number; messages: Array<{ role: string; content: string }> };
}

async function submitBatch(rows: Row[]): Promise<string> {
  const requests: BatchRequest[] = rows.map(r => ({
    custom_id: r.id,
    params: {
      model: HAIKU_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: buildPrompt(r) }],
    },
  }));
  const resp = await fetch(BATCH_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
  if (!resp.ok) throw new Error('batch submit: ' + resp.status + ' — ' + await resp.text());
  const j: any = await resp.json();
  return j.id;
}

async function pollBatch(batchId: string, maxWaitSec = 1800): Promise<any[]> {
  const start = Date.now();
  let lastLog = 0;
  while (true) {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    if (elapsed > maxWaitSec) throw new Error('poll timeout: ' + batchId);
    if (elapsed - lastLog >= 30) {
      process.stderr.write(`  [+${elapsed}s] polling ${batchId.slice(0, 28)}...\n`);
      lastLog = elapsed;
    }
    const r = await fetch(BATCH_API_URL + '/' + batchId, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'message-batches-2024-09-24',
      },
    });
    if (!r.ok) throw new Error('poll: ' + r.status);
    const data: any = await r.json();
    if (data.processing_status === 'ended') {
      const rr = await fetch(data.results_url, {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'message-batches-2024-09-24',
        },
      });
      return (await rr.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
    }
    await new Promise(res => setTimeout(res, 15_000));
  }
}

interface UsageTotals { input: number; output: number }

function parseResults(results: any[], byId: Map<string, Row>, totals: UsageTotals): Verdict[] {
  const out: Verdict[] = [];
  for (const r of results) {
    const id = r.custom_id;
    const row = byId.get(id);
    if (!row) continue;
    const usage = r.result?.message?.usage;
    if (usage) {
      totals.input += (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
      totals.output += usage.output_tokens || 0;
    }
    const text = r.result?.message?.content?.[0]?.text || '';
    try {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('no json');
      const j = JSON.parse(m[0]);
      const c = j.classification;
      const valid = c === 'restore_witness_sighting' || c === 'keep_held_for_chase' || c === 'archive_correct';
      out.push({
        id,
        row,
        classification: valid ? c : 'error',
        reason: typeof j.reason === 'string' ? j.reason : '',
        year: yearOf(row),
      });
    } catch {
      out.push({ id, row, classification: 'error', reason: 'parse_error: ' + text.slice(0, 80), year: yearOf(row) });
    }
  }
  return out;
}

// ── qc_flag mutation (preserve array shape) ──────────────────────────────────
function stripGateFlag(meta: any): any {
  const m = (meta && typeof meta === 'object') ? { ...meta } : {};
  const q = m.qc_flag;
  if (Array.isArray(q)) {
    const filtered = q.filter(x => x !== 'anomaly_gate_review');
    if (filtered.length === 0) delete m.qc_flag;
    else m.qc_flag = filtered;
  } else if (typeof q === 'string') {
    const parts = q.split(',').map(s => s.trim()).filter(s => s && s !== 'anomaly_gate_review');
    if (parts.length === 0) delete m.qc_flag;
    else m.qc_flag = parts.join(',');
  }
  return m;
}

// ── apply ────────────────────────────────────────────────────────────────────
async function applyVerdicts(verdicts: Verdict[]): Promise<{ approved: number; archived: number; failed: number }> {
  let approved = 0, archived = 0, failed = 0;
  for (const v of verdicts) {
    if (v.classification === 'restore_witness_sighting') {
      const newMeta = stripGateFlag(v.row.metadata);
      const { error } = await sb.from('reports')
        .update({ status: 'approved', metadata: newMeta })
        .eq('id', v.id).eq('status', 'pending_review');
      if (error) { failed++; console.error('  approve FAIL', v.id, error.message); }
      else approved++;
    } else if (v.classification === 'archive_correct') {
      const { error } = await sb.from('reports')
        .update({ status: 'archived' })
        .eq('id', v.id).eq('status', 'pending_review');
      if (error) { failed++; console.error('  archive FAIL', v.id, error.message); }
      else archived++;
    }
    // keep_held_for_chase / error → no write
  }
  return { approved, archived, failed };
}

// ── output ───────────────────────────────────────────────────────────────────
function writeCsv(verdicts: Verdict[]): string {
  const outDir = fs.existsSync('/sessions/affectionate-tender-fermi/mnt/paradocs/outputs')
    ? '/sessions/affectionate-tender-fermi/mnt/paradocs/outputs'
    : path.join(process.cwd(), 'outputs');
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  const csvPath = path.join(outDir, 'ca-anomaly-gate-rescue.csv');
  const lines = ['id,title,year,classification,reason'];
  for (const v of verdicts) {
    const t = (v.row.title || '').replace(/"/g, '""');
    const r = (v.reason || '').replace(/"/g, '""');
    lines.push(`${v.id},"${t}",${v.year},${v.classification},"${r}"`);
  }
  fs.writeFileSync(csvPath, lines.join('\n'));
  return csvPath;
}

function summarize(verdicts: Verdict[]) {
  const buckets: Record<string, Verdict[]> = {
    restore_witness_sighting: [],
    keep_held_for_chase: [],
    archive_correct: [],
    error: [],
  };
  for (const v of verdicts) (buckets[v.classification] ||= []).push(v);

  console.log('\n=== Classification tally ===');
  for (const [k, arr] of Object.entries(buckets)) console.log(`  ${k.padEnd(28)} ${arr.length}`);

  for (const k of ['restore_witness_sighting', 'keep_held_for_chase', 'archive_correct']) {
    const arr = buckets[k];
    if (arr.length === 0) continue;
    console.log(`\n=== ${k} — 10 spot samples ===`);
    const sample = arr.slice().sort(() => Math.random() - 0.5).slice(0, 10);
    for (const v of sample) {
      console.log(`  [${v.year}] ${v.id}`);
      console.log(`    title: ${(v.row.title || '').slice(0, 90)}`);
      console.log(`    reason: ${v.reason.slice(0, 140)}`);
    }
  }
  if (buckets.error.length > 0) {
    console.log(`\n=== error / unparseable — first 5 ===`);
    for (const v of buckets.error.slice(0, 5)) {
      console.log(`  ${v.id}: ${v.reason.slice(0, 120)}`);
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`CA anomaly-gate rescue — mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN'}`);
  console.log('Fetching all CA pending_review rows with anomaly_gate_review flag...');
  const rows = await fetchAll();
  console.log(`Fetched ${rows.length} rows.`);

  const yr: Record<string, number> = {};
  for (const r of rows) yr[yearOf(r)] = (yr[yearOf(r)] || 0) + 1;
  console.log('Per-year:', JSON.stringify(yr));

  if (rows.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const byId = new Map<string, Row>();
  for (const r of rows) byId.set(r.id, r);

  // Submit batches OR resume from checkpoint
  let ckpt = loadCheckpoint();
  if (ckpt) {
    console.log(`\nResuming from checkpoint: ${ckpt.batches.length} batches already submitted.`);
    for (const b of ckpt.batches) console.log(`  ${b.batchId}  (${b.rowIds.length} rows)`);
  } else {
    const chunks: Row[][] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) chunks.push(rows.slice(i, i + BATCH_SIZE));
    console.log(`\nSubmitting ${chunks.length} Haiku batches...`);
    ckpt = { batches: [] };
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`  [batch ${i + 1}/${chunks.length}] submitting ${chunk.length}...`);
      const batchId = await submitBatch(chunk);
      ckpt.batches.push({ batchId, rowIds: chunk.map(r => r.id) });
      console.log(`  [batch ${i + 1}/${chunks.length}] submitted: ${batchId}`);
      saveCheckpoint(ckpt);
    }
    console.log(`Checkpoint saved: ${CHECKPOINT_PATH}`);
  }

  // Poll all batches (parallel)
  console.log(`\nPolling ${ckpt.batches.length} batches (parallel)...`);
  const totals: UsageTotals = { input: 0, output: 0 };
  const allVerdicts: Verdict[] = [];

  const pollPromises = ckpt.batches.map(async (b, i) => {
    const tag = `[batch ${i + 1}/${ckpt!.batches.length}]`;
    try {
      const results = await pollBatch(b.batchId);
      console.log(`${tag} returned ${results.length} results from ${b.batchId}`);
      const verdicts = parseResults(results, byId, totals);
      allVerdicts.push(...verdicts);
    } catch (e: any) {
      console.error(`${tag} error:`, e.message);
      for (const rid of b.rowIds) {
        const row = byId.get(rid);
        if (row) allVerdicts.push({ id: rid, row, classification: 'error', reason: 'poll_error: ' + e.message.slice(0, 80), year: yearOf(row) });
      }
    }
  });
  await Promise.all(pollPromises);

  console.log(`\nTotal verdicts: ${allVerdicts.length}`);

  // Cost
  const cost = (totals.input / 1_000_000) * HAIKU_INPUT_PER_M * BATCH_DISCOUNT
             + (totals.output / 1_000_000) * HAIKU_OUTPUT_PER_M * BATCH_DISCOUNT;
  console.log(`Tokens — input: ${totals.input.toLocaleString()}  output: ${totals.output.toLocaleString()}`);
  console.log(`Estimated Batch-API cost: $${cost.toFixed(4)}`);

  summarize(allVerdicts);
  const csvPath = writeCsv(allVerdicts);
  console.log(`\nCSV written: ${csvPath}`);

  if (!APPLY) {
    console.log('\nDRY RUN — no writes performed.');
    console.log('Re-run with --apply to write classifications.');
    return;
  }

  console.log('\nApplying verdicts...');
  const result = await applyVerdicts(allVerdicts);
  console.log(`Applied — approved (restored): ${result.approved}  archived: ${result.archived}  failed: ${result.failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
