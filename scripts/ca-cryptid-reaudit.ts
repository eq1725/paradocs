/**
 * CA cryptid re-audit — paranormal-qualifier filter (V11.17.61 editorial policy)
 *
 * Pulls approved Chronicling-America cryptid rows (no report_phenomena link)
 * matching the sea_serpent / wild_man / giant_serpent keyword clusters, then
 * classifies each via Haiku Batch API into:
 *
 *   qualifies_paranormal — explicit paranormal/supernatural markers
 *                          (anomalous behavior, impossible physiology,
 *                          supernatural intelligence, vanishing/dematerializing,
 *                          immunity to weapons, glowing/luminous attributes,
 *                          intelligent malevolence). Leave row as-is — will be
 *                          picked up by classifier --retry-failed sweep once new
 *                          phenomenon entries are added.
 *
 *   mundane_zoology       — unidentified-but-mundane animal report
 *                          (rare species, escaped exotic pet, large native
 *                          predator, vagrant human, biologically-possible size).
 *                          APPLY: status='archived',
 *                          metadata.archive_reason='cryptid_paranormal_filter_v1'.
 *
 *   borderline            — has some hint of anomalous framing but mostly
 *                          zoological. APPLY: leave status; add
 *                          metadata.qc_flag='cryptid_borderline_review'.
 *
 * Default DRY RUN. Pass --apply to write.
 *
 *   npx tsx scripts/ca-cryptid-reaudit.ts            # dry run (default)
 *   npx tsx scripts/ca-cryptid-reaudit.ts --apply    # write
 *
 * Output CSV: outputs/ca-cryptid-reaudit.csv
 * Checkpoint: /tmp/ca-cryptid-reaudit-batches.json
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

const CHECKPOINT_PATH = '/tmp/ca-cryptid-reaudit-batches.json';
interface Checkpoint { batches: Array<{ batchId: string; rowIds: string[] }> }
function loadCheckpoint(): Checkpoint | null {
  if (!fs.existsSync(CHECKPOINT_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf-8')); } catch { return null; }
}
function saveCheckpoint(c: Checkpoint) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(c, null, 2));
}

// Haiku pricing (4.5): $1/M input, $5/M output. Batch API = 50% discount.
const HAIKU_INPUT_PER_M = 1.0;
const HAIKU_OUTPUT_PER_M = 5.0;
const BATCH_DISCOUNT = 0.5;

// ── types ────────────────────────────────────────────────────────────────────
interface Row {
  id: string;
  title: string | null;
  description: string | null;
  summary: string | null;
  paradocs_narrative: string | null;
  original_report_id: string | null;
  metadata: any;
  _cluster?: 'sea' | 'wild' | 'giant';
}
type Classification = 'qualifies_paranormal' | 'mundane_zoology' | 'borderline';
interface Verdict {
  id: string;
  row: Row;
  cluster: 'sea' | 'wild' | 'giant';
  classification: Classification | 'error';
  reason: string;
}

function bodyText(r: Row): string {
  return [r.paradocs_narrative, r.summary, r.description].filter(Boolean).join('\n\n');
}

// ── fetch + cluster ──────────────────────────────────────────────────────────
async function fetchCandidates(): Promise<Row[]> {
  const PAGE = 500;
  const select = 'id,title,description,summary,paradocs_narrative,original_report_id,metadata';
  const all: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('reports').select(select)
      .eq('source_type', 'chronicling-america')
      .eq('category', 'cryptids')
      .eq('status', 'approved')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error('fetch: ' + error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as Row[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Strip rows that already have a report_phenomena link
  const ids = all.map(r => r.id);
  const linked = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const { data } = await sb.from('report_phenomena').select('report_id').in('report_id', slice);
    (data || []).forEach((r: any) => linked.add(r.report_id));
  }
  const unlinked = all.filter(r => !linked.has(r.id));

  // Cluster filters
  const reSea = /sea[-\s]?serpent|sea[-\s]?monster|sea[-\s]?creature|marine (creature|serpent|monster)/i;
  const reWild = /wild man|wild woman|wild men|wildman|hairy (man|woman|creature|figure|beast|hominid)|bearded (figure|wild|man)|naked (wild|man|creature|attacker)|nude figure|nude wild|gorilla[-\s]?(like|sighting|crosses)|ape[-\s]?like|wild man of|shaggy figure|running bill|six-foot naked/i;
  const reGiantSnake = /silver serpent|black serpent|two-headed (rattle)?snake|giant (snake|serpent)|monster (snake|serpent)|enormous (snake|serpent)|huge (snake|serpent)|headless snake|scaled serpent|color-changing (snake|reptile)|black snake coils|crown-headed snake/i;

  const txt = (r: Row) => `${r.title || ''}\n${r.paradocs_narrative || ''}\n${r.description || ''}\n${r.summary || ''}`;
  const sea: Row[] = [];
  const wild: Row[] = [];
  const giant: Row[] = [];
  const seen = new Set<string>();
  for (const r of unlinked) {
    const t = txt(r);
    if (reSea.test(t) && !seen.has(r.id)) {
      r._cluster = 'sea'; sea.push(r); seen.add(r.id); continue;
    }
    if (reWild.test(t) && !seen.has(r.id)) {
      r._cluster = 'wild'; wild.push(r); seen.add(r.id); continue;
    }
    if (reGiantSnake.test(t) && !seen.has(r.id)) {
      r._cluster = 'giant'; giant.push(r); seen.add(r.id); continue;
    }
  }
  console.log(`sea: ${sea.length}  wild: ${wild.length}  giant: ${giant.length}  TOTAL: ${sea.length + wild.length + giant.length}`);
  return [...sea, ...wild, ...giant];
}

// ── prompt ───────────────────────────────────────────────────────────────────
function buildPrompt(r: Row): string {
  const cluster = r._cluster!;
  const title = (r.title || '(no title)').slice(0, 200);
  const body = bodyText(r).slice(0, 1500);
  const clusterLabel = cluster === 'sea' ? 'Sea Serpent / marine cryptid'
    : cluster === 'wild' ? 'Wild Man / hairy hominid'
    : 'Giant Serpent / monster snake';

  const markersHelp = cluster === 'sea'
    ? `For sea serpents, paranormal markers include: multi-humped serpentine form moving in physically-impossible ways (against current/wind), glowing or luminous attributes, supernatural intelligence/behavior, vanishing/dematerializing, immunity to harpoons/bullets, size far exceeding any biological maximum (>100ft), intelligent malevolent pursuit of vessels, anomalous physiology (sequential humps impossible for known species, horns, etc.). MUNDANE examples: "captain saw 100-foot creature briefly" (no impossible markers), a 25-foot creature washed ashore (= rare large fish/cetacean/leatherback turtle/conger eel), a fishing steamer striking something large, a 5- or 8-foot creature netted (= shark/sunfish/eel), a "whale" attacking a schooner (= actual whale).`
    : cluster === 'wild'
    ? `For wild men, paranormal markers include: hair-covered bipedal humanoid with impossible attributes (>7ft tall, superhuman strength/speed, immunity to gunfire), supernatural behaviors (vanishing into thin air, leaping impossible distances, glowing eyes), folkloric supernatural framing, drains livestock of blood (vampiric), bulletproof or impervious to capture in a way that suggests the supernatural rather than just an evasive fugitive. MUNDANE examples: "naked man caught in woods" (= vagrant/hermit/escaped asylum inmate), "bearded figure flees through woods" (= just a person), a hunted man eluding a posse (= human fugitive), thefts attributed to "wild man" (= human criminal).`
    : `For giant serpents, paranormal markers include: silver-scaled / color-changing / luminous appearance, vanishing when shot at, supernatural size combined with anomalous behavior, intelligent pursuit of humans, immunity to weapons, two-headed or impossible morphology, returning after being killed. MUNDANE examples: "20-foot snake in swamp" (= rare large boa/python/rat-snake), a large rattlesnake (= just a rattlesnake), a snake coiling around someone's leg (= ordinary snake behavior), an actual two-headed rattlesnake specimen (= real zoological curiosity, not paranormal).`;

  return `You are triaging a 19th-century newspaper account for the Paradocs cryptid taxonomy. Paradocs cryptids must have PARANORMAL or SUPERNATURAL qualities — not just "unidentified animal." Zoological mysteries (rare native species, escaped exotic pets, unknown-but-mundane large fish/cats/snakes, vagrant humans) belong in archives, not the phenomenon taxonomy.

This row was clustered as: ${clusterLabel}

Classify into one of three buckets:

  qualifies_paranormal — the account contains EXPLICIT supernatural/anomalous markers that go beyond "unknown species." ${markersHelp.split('. MUNDANE')[0]}.

  mundane_zoology — just an unidentified animal report without paranormal framing. ${markersHelp.split('MUNDANE examples: ')[1]}

  borderline — has some hint of anomalous framing but mostly zoological / ambiguous. When genuinely unsure, prefer this over the other two.

TITLE: ${title}

BODY (first 1500 chars):
${body}

Given this account, does it describe a creature with EXPLICIT paranormal/supernatural qualities (anomalous behavior, impossible physiology, supernatural intelligence/abilities, vanishing/dematerializing, immunity to weapons, glowing/luminous, intelligent malevolence) — or is it most plausibly an unidentified-but-mundane animal report (rare species, escaped exotic pet, large native predator, vagrant human, unusually large but biologically possible)?

Respond with JSON only, no markdown:
{"classification":"qualifies_paranormal"|"mundane_zoology"|"borderline","reason":"<one short sentence>"}`;
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
      max_tokens: 250,
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
    await new Promise(res => setTimeout(res, 10_000));
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
      const valid = c === 'qualifies_paranormal' || c === 'mundane_zoology' || c === 'borderline';
      out.push({
        id,
        row,
        cluster: row._cluster!,
        classification: valid ? c : 'error',
        reason: typeof j.reason === 'string' ? j.reason : '',
      });
    } catch {
      out.push({ id, row, cluster: row._cluster!, classification: 'error', reason: 'parse_error: ' + text.slice(0, 80) });
    }
  }
  return out;
}

// ── apply ────────────────────────────────────────────────────────────────────
async function applyVerdicts(verdicts: Verdict[]): Promise<{ archived: number; flagged: number; skipped: number; failed: number }> {
  let archived = 0, flagged = 0, skipped = 0, failed = 0;
  for (const v of verdicts) {
    if (v.classification === 'mundane_zoology') {
      const meta = (v.row.metadata && typeof v.row.metadata === 'object') ? { ...v.row.metadata } : {};
      meta.archive_reason = 'cryptid_paranormal_filter_v1';
      const { error } = await sb.from('reports')
        .update({ status: 'archived', metadata: meta })
        .eq('id', v.id).eq('status', 'approved');
      if (error) { failed++; console.error('  archive FAIL', v.id, error.message); }
      else archived++;
    } else if (v.classification === 'borderline') {
      const meta = (v.row.metadata && typeof v.row.metadata === 'object') ? { ...v.row.metadata } : {};
      const existing = meta.qc_flag;
      if (Array.isArray(existing)) {
        if (!existing.includes('cryptid_borderline_review')) meta.qc_flag = [...existing, 'cryptid_borderline_review'];
      } else if (typeof existing === 'string' && existing.length > 0) {
        const parts = existing.split(',').map((s: string) => s.trim());
        if (!parts.includes('cryptid_borderline_review')) meta.qc_flag = [...parts, 'cryptid_borderline_review'].join(',');
      } else {
        meta.qc_flag = ['cryptid_borderline_review'];
      }
      const { error } = await sb.from('reports')
        .update({ metadata: meta })
        .eq('id', v.id);
      if (error) { failed++; console.error('  flag FAIL', v.id, error.message); }
      else flagged++;
    } else {
      skipped++; // qualifies_paranormal / error → no write
    }
  }
  return { archived, flagged, skipped, failed };
}

// ── output ───────────────────────────────────────────────────────────────────
function writeCsv(verdicts: Verdict[]): string {
  const outDir = fs.existsSync('/sessions/affectionate-tender-fermi/mnt/paradocs/outputs')
    ? '/sessions/affectionate-tender-fermi/mnt/paradocs/outputs'
    : path.join(process.cwd(), 'outputs');
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  const csvPath = path.join(outDir, 'ca-cryptid-reaudit.csv');
  const lines = ['id,title,cluster,classification,reason'];
  for (const v of verdicts) {
    const t = (v.row.title || '').replace(/"/g, '""');
    const r = (v.reason || '').replace(/"/g, '""');
    lines.push(`${v.id},"${t}",${v.cluster},${v.classification},"${r}"`);
  }
  fs.writeFileSync(csvPath, lines.join('\n'));
  return csvPath;
}

function summarize(verdicts: Verdict[]) {
  const tally: Record<string, Record<string, Verdict[]>> = {
    sea: { qualifies_paranormal: [], mundane_zoology: [], borderline: [], error: [] },
    wild: { qualifies_paranormal: [], mundane_zoology: [], borderline: [], error: [] },
    giant: { qualifies_paranormal: [], mundane_zoology: [], borderline: [], error: [] },
  };
  for (const v of verdicts) (tally[v.cluster][v.classification] ||= []).push(v);

  console.log('\n=== Tally by cluster ===');
  for (const cluster of ['sea', 'wild', 'giant']) {
    const t = tally[cluster];
    const total = t.qualifies_paranormal.length + t.mundane_zoology.length + t.borderline.length + t.error.length;
    console.log(`  ${cluster.padEnd(8)} qualifies=${t.qualifies_paranormal.length}  mundane=${t.mundane_zoology.length}  borderline=${t.borderline.length}  error=${t.error.length}  (total=${total})`);
  }

  for (const cluster of ['sea', 'wild', 'giant']) {
    for (const cls of ['qualifies_paranormal', 'mundane_zoology', 'borderline']) {
      const arr = tally[cluster][cls];
      if (arr.length === 0) continue;
      console.log(`\n=== ${cluster} / ${cls} — ${Math.min(5, arr.length)} spot samples ===`);
      const sample = arr.slice().sort(() => Math.random() - 0.5).slice(0, 5);
      for (const v of sample) {
        console.log(`  ${v.id}`);
        console.log(`    title:  ${(v.row.title || '').slice(0, 100)}`);
        console.log(`    reason: ${v.reason.slice(0, 160)}`);
      }
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`CA cryptid re-audit — mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN'}`);
  console.log('Fetching approved-unlinked CA cryptid rows...');
  const rows = await fetchCandidates();
  console.log(`Total clustered: ${rows.length}`);
  if (rows.length === 0) { console.log('Nothing to do.'); return; }

  const byId = new Map<string, Row>();
  for (const r of rows) byId.set(r.id, r);

  let ckpt = loadCheckpoint();
  if (ckpt) {
    console.log(`\nResuming from checkpoint: ${ckpt.batches.length} batches already submitted.`);
    for (const b of ckpt.batches) console.log(`  ${b.batchId}  (${b.rowIds.length} rows)`);
  } else {
    const chunks: Row[][] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) chunks.push(rows.slice(i, i + BATCH_SIZE));
    console.log(`\nSubmitting ${chunks.length} Haiku batch(es)...`);
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

  console.log(`\nPolling ${ckpt.batches.length} batch(es)...`);
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
        if (row) allVerdicts.push({ id: rid, row, cluster: row._cluster!, classification: 'error', reason: 'poll_error: ' + e.message.slice(0, 80) });
      }
    }
  });
  await Promise.all(pollPromises);

  console.log(`\nTotal verdicts: ${allVerdicts.length}`);
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
  console.log(`Applied — archived: ${result.archived}  flagged: ${result.flagged}  skipped: ${result.skipped}  failed: ${result.failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
