#!/usr/bin/env tsx
/**
 * CA-CONSOLIDATED-SMOKE-REPORT — V11.18.29 Phase 2b
 *
 * Joins the consolidated-extractor dry-run JSON (Phase 2a output) against
 * the existing approved 1897 chronicling-america DB rows (3-pass ground
 * truth) by snippet_sha256. Spot-checks 50 random matched pairs across
 * five quality dimensions and writes a markdown report Chase can review.
 *
 * Reads:
 *   - outputs/ca-consolidated-1897-smoketest.json  (Phase 2a)
 *   - reports table where source_type='chronicling-america' AND status='approved'
 *     AND metadata.snippet_sha256 in (the dry-run shas)
 *   - report_phenomena junction rows for those reports
 *
 * Writes:
 *   - outputs/ca-consolidated-smoke-report.md  (markdown report + 50-pair table)
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/ca-consolidated-smoke-report.ts
 *
 * Optional flags:
 *   --input PATH    Override smoketest JSON path
 *   --output PATH   Override markdown report path
 *   --sample N      Number of spot-check pairs (default 50)
 *   --seed N        Random seed for spot-check pick (default 42)
 */

import * as fs from 'fs';
import * as path from 'path';

interface SmoketestRow {
  customId: string;
  baseId: string;
  sha256: string;
  shardFile: string;
  hitTerm: string;
  paperDate: string;
  paperCity: string | null;
  paperState: string | null;
  snippetPreview: string;
  status: string;
  rejectionReasons: string[];
  fallbackUsed: boolean;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; cost_usd: number };
  accountsRaw: any[];
  accountsAccepted: any[];
}

interface DbRow {
  id: string;
  title: string | null;
  description: string | null;
  event_date: string | null;
  event_date_precision: string | null;
  city: string | null;
  state_province: string | null;
  category: string | null;
  paradocs_narrative: string | null;
  paradocs_assessment: any;
  metadata: any;
}

interface PhenLink {
  report_id: string;
  phenomenon_id: string;
  is_primary: boolean;
  slug: string;
}

interface CliArgs {
  inputPath: string;
  outputPath: string;
  sampleSize: number;
  seed: number;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    inputPath: path.resolve(process.cwd(), 'outputs/ca-consolidated-1897-smoketest.json'),
    outputPath: path.resolve(process.cwd(), 'outputs/ca-consolidated-smoke-report.md'),
    sampleSize: 50,
    seed: 42,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.inputPath = path.resolve(process.cwd(), argv[++i]);
    else if (a === '--output') args.outputPath = path.resolve(process.cwd(), argv[++i]);
    else if (a === '--sample') args.sampleSize = parseInt(argv[++i], 10) || 50;
    else if (a === '--seed') args.seed = parseInt(argv[++i], 10) || 42;
  }
  return args;
}

// Mulberry32 — deterministic small PRNG so re-runs pick the same 50 pairs.
function mulberry32(seed: number): () => number {
  let t = seed | 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function normWords(s: string): string[] {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

function wordOverlap(a: string, b: string): number {
  const aw = new Set(normWords(a));
  const bw = new Set(normWords(b));
  if (aw.size === 0 || bw.size === 0) return 0;
  let hits = 0;
  Array.from(aw).forEach(w => { if (bw.has(w)) hits++; });
  return hits / Math.max(aw.size, bw.size);
}

function quoteVerbatim(quote: string, snippet: string): boolean {
  const qw = normWords(quote);
  const sw = normWords(snippet);
  if (qw.length === 0) return false;
  const sjoined = sw.join(' ');
  // Try as substring first
  if (sjoined.includes(qw.join(' '))) return true;
  // Else 8-gram coverage ≥ 80%
  const N = 8;
  if (qw.length < N) return false;
  const grams = new Set<string>();
  for (let i = 0; i + N <= sw.length; i++) grams.add(sw.slice(i, i + N).join(' '));
  let total = 0, hits = 0;
  for (let i = 0; i + N <= qw.length; i++) {
    total++;
    if (grams.has(qw.slice(i, i + N).join(' '))) hits++;
  }
  return total > 0 && hits / total >= 0.8;
}

async function main() {
  const args = parseArgs();

  if (!fs.existsSync(args.inputPath)) {
    console.error('[smoke-report] missing smoketest JSON: ' + args.inputPath);
    console.error('[smoke-report] run Phase 2a first:');
    console.error('  set -a; source .env.local; set +a');
    console.error('  npx tsx scripts/ca-extract-consolidated.ts --shard \'outputs/ca-shards/*-1897.json\' --dry-run --max-cost 5');
    process.exit(1);
  }

  const dotenv = await import('dotenv');
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[smoke-report] Missing Supabase env. Source .env.local first.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(args.inputPath, 'utf8'));
  const rows: SmoketestRow[] = raw.rows || [];
  const totals = raw.totals || {};
  console.log('[smoke-report] loaded ' + rows.length + ' dry-run rows');

  // Build sha→row index for dry-run; ALSO build sha→{snippet,paperDate}
  // so we can verbatim-check the pull_quote against the original.
  const dryBySha = new Map<string, SmoketestRow>();
  for (const r of rows) dryBySha.set(r.sha256, r);
  const allShas = Array.from(dryBySha.keys());

  // Pull approved DB rows whose snippet_sha256 is in our set.
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  console.log('[smoke-report] fetching approved 1897 CA DB rows...');
  const allDb: DbRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('reports')
      .select('id, title, description, event_date, event_date_precision, city, state_province, category, paradocs_narrative, paradocs_assessment, metadata')
      .eq('source_type', 'chronicling-america')
      .eq('status', 'approved')
      .gte('event_date', '1897-01-01')
      .lte('event_date', '1897-12-31')
      .range(from, from + 999);
    if (error) { console.error('DB fetch error: ' + error.message); break; }
    for (const r of (data || []) as any[]) allDb.push(r as DbRow);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  console.log('[smoke-report] DB rows: ' + allDb.length);

  // Index DB rows by snippet_sha256 (each row's metadata carries one).
  // Multiple DB rows may share a sha (multi-account snippets) — keep an array.
  const dbBySha = new Map<string, DbRow[]>();
  for (const r of allDb) {
    const sha = r.metadata && r.metadata.snippet_sha256;
    if (!sha) continue;
    if (!dbBySha.has(sha)) dbBySha.set(sha, []);
    dbBySha.get(sha)!.push(r);
  }
  console.log('[smoke-report] DB rows w/ sha256: ' + Array.from(dbBySha.values()).reduce((a, v) => a + v.length, 0) +
    ' across ' + dbBySha.size + ' unique snippets');

  // Pull phenomenon junction rows for these DB rows.
  const dbIds = allDb.map(r => r.id);
  const dbPrimaryByReport = new Map<string, string>();    // report_id → primary slug
  const dbAllByReport = new Map<string, string[]>();       // report_id → all slugs
  const CHUNK = 100;
  for (let i = 0; i < dbIds.length; i += CHUNK) {
    const ids = dbIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('report_phenomena')
      .select('report_id, phenomenon_id, is_primary, phenomena(slug)')
      .in('report_id', ids);
    if (error) { console.warn('phen fetch: ' + error.message); continue; }
    for (const link of (data || []) as any[]) {
      const slug = link.phenomena && link.phenomena.slug;
      if (!slug) continue;
      if (!dbAllByReport.has(link.report_id)) dbAllByReport.set(link.report_id, []);
      dbAllByReport.get(link.report_id)!.push(slug);
      if (link.is_primary) dbPrimaryByReport.set(link.report_id, slug);
    }
  }
  console.log('[smoke-report] phen junction rows for ' + dbAllByReport.size + ' DB reports');

  // Determine acceptance match. For pairs we have both:
  //   - dry-run accepted (≥1 account)
  //   - DB row exists (approved)
  // We pair by (sha, account-index-1) — the first accepted dry-run account
  // is compared against the first DB row for that sha.
  const matched: Array<{ sha: string; dry: SmoketestRow; db: DbRow; dryAcc: any; dbPrimarySlug: string | null }> = [];
  const dryAcceptedDbMissing: string[] = [];
  const dbExistsDryRejected: string[] = [];
  for (const sha of allShas) {
    const dry = dryBySha.get(sha)!;
    const dbRows = dbBySha.get(sha) || [];
    const dryAccepted = dry.accountsAccepted.length > 0;
    const dbExists = dbRows.length > 0;
    if (dryAccepted && dbExists) {
      matched.push({
        sha, dry, db: dbRows[0], dryAcc: dry.accountsAccepted[0],
        dbPrimarySlug: dbPrimaryByReport.get(dbRows[0].id) || null,
      });
    } else if (dryAccepted && !dbExists) {
      dryAcceptedDbMissing.push(sha);
    } else if (!dryAccepted && dbExists) {
      dbExistsDryRejected.push(sha);
    }
  }
  console.log('[smoke-report] matched pairs (both accepted): ' + matched.length);
  console.log('[smoke-report] dry accepted but no DB row: ' + dryAcceptedDbMissing.length);
  console.log('[smoke-report] DB row but dry rejected: ' + dbExistsDryRejected.length);

  // Compute the 5 metrics across ALL matched pairs.
  let titleMatch = 0, quoteVerbatimOk = 0, dateAgree = 0, locAgree = 0, primaryTagAgree = 0;
  let dryHasTag = 0, dbHasTag = 0, bothHaveTag = 0;
  for (const m of matched) {
    const dryTitle = m.dryAcc.modern_title || '';
    const dbTitle = m.db.title || '';
    if (wordOverlap(dryTitle, dbTitle) >= 0.5) titleMatch++;

    // Pull quote verbatim — does it appear in the snippet? We need the
    // full snippet, but only snippetPreview is in the JSON. The verbatim
    // GATE inside the extractor already ran the quote field; for pull_quote
    // (the editorial quote) we check vs the snippetPreview as a proxy.
    // Real verbatim check on accountsRaw[].verbatim_quote vs db snippet is
    // already enforced — here we just count the editorial pull_quote
    // overlap against the snippet preview (200 chars; weaker check).
    const pq = m.dryAcc.pull_quote || '';
    // pull_quote is an EDITORIAL line, NOT meant to be verbatim from the
    // snippet — so we instead check verbatim_quote (the extract field).
    const vq = m.dryAcc.verbatim_quote || '';
    if (vq && quoteVerbatim(vq, m.db.metadata?.original_snippet || m.dry.snippetPreview)) {
      quoteVerbatimOk++;
    }

    // Date agreement
    if (m.dryAcc.event_date && m.db.event_date) {
      if (m.dryAcc.event_date === m.db.event_date) dateAgree++;
    } else if (!m.dryAcc.event_date && !m.db.event_date) {
      dateAgree++;
    }

    // Location: city+state agreement (allow null↔null)
    const dryCity = (m.dryAcc.location?.city || '').toLowerCase().trim();
    const dryState = (m.dryAcc.location?.state || '').toLowerCase().trim();
    const dbCity = (m.db.city || '').toLowerCase().trim();
    const dbState = (m.db.state_province || '').toLowerCase().trim();
    if (dryCity === dbCity && dryState === dbState) locAgree++;

    // Phenomenon primary tag
    const dryP = m.dryAcc.phenomenon_primary;
    const dbP = m.dbPrimarySlug;
    if (dryP) dryHasTag++;
    if (dbP) dbHasTag++;
    if (dryP && dbP) {
      bothHaveTag++;
      if (dryP === dbP) primaryTagAgree++;
    }
  }

  // Spot-check 50 random pairs.
  const rnd = mulberry32(args.seed);
  const shuffled = matched.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const sample = shuffled.slice(0, Math.min(args.sampleSize, shuffled.length));

  // Real cost delta: sum dry-run cost vs ground-truth 3-pass cost log
  // for the same baseIds. The cost log uses .reason as baseId for ca-extract
  // service. For consolidated-narrative service, the .report_id field maps
  // to the DB row id. For classifier, also report_id.
  console.log('[smoke-report] fetching ground-truth cost log...');
  const groundShas = Array.from(dbBySha.keys());
  const dbBaseIds = Array.from(new Set(allDb.map(r => {
    // original_report_id is 'ca-{lccn}-{date}-p{page}-{n}'; baseId is everything before the last '-{n}'.
    return null; // we'll join differently
  }))).filter(Boolean) as string[];

  // Easier: pull every cost-log row for these report_ids (consolidated-narrative + classifier)
  // and every ca-extract row whose .reason matches a baseId for a row in our set.
  let extractCost = 0, narrativeCost = 0, classifierCost = 0, verifyCost = 0;
  let extractRows = 0, narrativeRows = 0, classifierRows = 0;

  // Build baseIds from original_report_id
  const baseIdSet = new Set<string>();
  for (const r of allDb) {
    const orid = (r as any).metadata && undefined; // not present; we need to query
  }
  // Query reports for original_report_id
  console.log('[smoke-report] fetching original_report_id for cost log join...');
  const oridByDbId = new Map<string, string>();
  for (let i = 0; i < dbIds.length; i += CHUNK) {
    const ids = dbIds.slice(i, i + CHUNK);
    const { data } = await supabase.from('reports').select('id, original_report_id').in('id', ids);
    for (const r of (data || []) as any[]) {
      if (r.original_report_id) oridByDbId.set(r.id, r.original_report_id);
    }
  }
  Array.from(oridByDbId.values()).forEach(orid => {
    // strip the trailing -N
    const m = orid.match(/^(ca-.+-p\d+)-\d+$/);
    if (m) baseIdSet.add(m[1]);
  });

  // ca-extract rows by reason in baseIdSet
  const baseIdArr = Array.from(baseIdSet);
  for (let i = 0; i < baseIdArr.length; i += CHUNK) {
    const ids = baseIdArr.slice(i, i + CHUNK);
    const { data } = await supabase
      .from('paradocs_narrative_cost_log')
      .select('cost_usd, input_tokens, output_tokens')
      .eq('service', 'ca-extract')
      .in('reason', ids);
    for (const row of (data || []) as any[]) {
      extractCost += row.cost_usd || 0;
      extractRows++;
    }
  }

  // consolidated-narrative + classifier + tag-verification rows by report_id
  for (let i = 0; i < dbIds.length; i += CHUNK) {
    const ids = dbIds.slice(i, i + CHUNK);
    const { data } = await supabase
      .from('paradocs_narrative_cost_log')
      .select('service, cost_usd, input_tokens, output_tokens')
      .in('report_id', ids);
    for (const row of (data || []) as any[]) {
      const s = row.service || '';
      const c = row.cost_usd || 0;
      if (s.indexOf('consolidated') !== -1) { narrativeCost += c; narrativeRows++; }
      else if (s.indexOf('classify') !== -1 || s.indexOf('phenomenon') !== -1) { classifierCost += c; classifierRows++; }
      else if (s.indexOf('verify') !== -1 || s.indexOf('tag-verify') !== -1) { verifyCost += c; }
    }
  }
  const groundTotal = extractCost + narrativeCost + classifierCost + verifyCost;
  const consolidatedTotal = (totals as any).costUsd || 0;
  const consolidatedAccepted = (totals as any).accepted || matched.length;

  // ─────────────────────────────────────────────────────────────────────
  // Write markdown report
  // ─────────────────────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push('# CA Consolidated Extractor — 1897 Smoke Test Report');
  lines.push('');
  lines.push('Generated: ' + new Date().toISOString());
  lines.push('Dry-run JSON: ' + path.basename(args.inputPath));
  lines.push('');
  lines.push('## Run totals');
  lines.push('');
  lines.push('| metric | value |');
  lines.push('|---|---|');
  lines.push('| Snippets processed | ' + (totals.snippets ?? rows.length) + ' |');
  lines.push('| Result rows | ' + (totals.resultRows ?? '?') + ' |');
  lines.push('| Accepted (≥1 account) | ' + (totals.accepted ?? '?') + ' |');
  lines.push('| Rejected | ' + (totals.rejected ?? '?') + ' |');
  lines.push('| Parse failures | ' + (totals.parseFailures ?? '?') + ' |');
  lines.push('| Fallback flagged | ' + (totals.fallbackUsed ?? '?') + ' |');
  lines.push('| Accounts returned | ' + (totals.accountsReturned ?? '?') + ' |');
  lines.push('| Accounts accepted | ' + (totals.accountsAccepted ?? '?') + ' |');
  lines.push('| Dry-run total cost | $' + (totals.costUsd ?? 0).toFixed(4) + ' |');
  lines.push('| Input tokens (total) | ' + (totals.inputTokens ?? 0) + ' |');
  lines.push('| Output tokens (total) | ' + (totals.outputTokens ?? 0) + ' |');
  lines.push('| Cache reads (total) | ' + (totals.cacheRead ?? 0) + ' |');
  lines.push('');

  lines.push('## Match coverage');
  lines.push('');
  lines.push('| set | count |');
  lines.push('|---|---|');
  lines.push('| Matched pairs (dry accepted + DB approved) | ' + matched.length + ' |');
  lines.push('| Dry accepted but no DB row (new finds OR DB held in pending_review) | ' + dryAcceptedDbMissing.length + ' |');
  lines.push('| DB row but dry rejected (LOST in consolidated) | ' + dbExistsDryRejected.length + ' |');
  lines.push('');

  lines.push('## Quality metrics (all ' + matched.length + ' matched pairs)');
  lines.push('');
  lines.push('| metric | n | % |');
  lines.push('|---|---|---|');
  const pct = (n: number, d: number) => d === 0 ? '—' : ((n / d) * 100).toFixed(1) + '%';
  lines.push('| Title word-overlap ≥50% | ' + titleMatch + ' / ' + matched.length + ' | ' + pct(titleMatch, matched.length) + ' |');
  lines.push('| verbatim_quote actually in snippet | ' + quoteVerbatimOk + ' / ' + matched.length + ' | ' + pct(quoteVerbatimOk, matched.length) + ' |');
  lines.push('| Date agreement | ' + dateAgree + ' / ' + matched.length + ' | ' + pct(dateAgree, matched.length) + ' |');
  lines.push('| City+state agreement | ' + locAgree + ' / ' + matched.length + ' | ' + pct(locAgree, matched.length) + ' |');
  lines.push('| Primary phen tag agreement (both tagged) | ' + primaryTagAgree + ' / ' + bothHaveTag + ' | ' + pct(primaryTagAgree, bothHaveTag) + ' |');
  lines.push('| Dry produced a primary tag | ' + dryHasTag + ' / ' + matched.length + ' | ' + pct(dryHasTag, matched.length) + ' |');
  lines.push('| DB has a primary tag | ' + dbHasTag + ' / ' + matched.length + ' | ' + pct(dbHasTag, matched.length) + ' |');
  lines.push('');

  lines.push('## Cost delta — consolidated dry-run vs ground-truth 3-pass log');
  lines.push('');
  lines.push('Ground-truth pulled from `paradocs_narrative_cost_log` for the same ' + allDb.length + ' DB rows.');
  lines.push('');
  lines.push('| pass | cost | rows |');
  lines.push('|---|---|---|');
  lines.push('| ca-extract (reason=baseId) | $' + extractCost.toFixed(4) + ' | ' + extractRows + ' |');
  lines.push('| consolidated-narrative (worker) | $' + narrativeCost.toFixed(4) + ' | ' + narrativeRows + ' |');
  lines.push('| classifier + tag-verify | $' + (classifierCost + verifyCost).toFixed(4) + ' | ' + classifierRows + ' |');
  lines.push('| **3-pass total** | **$' + groundTotal.toFixed(4) + '** | |');
  lines.push('| **Consolidated dry-run total** | **$' + consolidatedTotal.toFixed(4) + '** | |');
  lines.push('| Delta (positive = consolidated cheaper) | $' + (groundTotal - consolidatedTotal).toFixed(4) + ' | |');
  if (consolidatedAccepted > 0) {
    const per1k = (consolidatedTotal / consolidatedAccepted) * 1000;
    const gtPer1k = allDb.length > 0 ? (groundTotal / allDb.length) * 1000 : 0;
    lines.push('| Per 1k consolidated accepted accounts | $' + per1k.toFixed(2) + ' | |');
    lines.push('| Per 1k 3-pass accepted accounts | $' + gtPer1k.toFixed(2) + ' | |');
  }
  lines.push('');

  lines.push('## Top rejection reasons (dry-run)');
  lines.push('');
  const reasons: Record<string, number> = (totals as any).rejectionReasons || {};
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (top.length === 0) lines.push('_no rejections logged_');
  else {
    lines.push('| reason | count |');
    lines.push('|---|---|');
    for (const [r, c] of top) lines.push('| ' + r + ' | ' + c + ' |');
  }
  lines.push('');

  lines.push('## Spot-check — ' + sample.length + ' random matched pairs');
  lines.push('');
  lines.push('Seed: ' + args.seed + ' (deterministic — re-run reproduces this list).');
  lines.push('');
  lines.push('| # | sha (8ch) | dry title | DB title | dry date / DB date | dry city / DB city | dry primary / DB primary | overlap | verb |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  let idx = 0;
  for (const m of sample) {
    idx++;
    const dt = (m.dryAcc.modern_title || '').slice(0, 60).replace(/\|/g, '\\|');
    const dbt = (m.db.title || '').slice(0, 60).replace(/\|/g, '\\|');
    const ov = wordOverlap(m.dryAcc.modern_title || '', m.db.title || '');
    const vq = m.dryAcc.verbatim_quote || '';
    const verbOk = vq ? quoteVerbatim(vq, m.db.metadata?.original_snippet || m.dry.snippetPreview) : false;
    lines.push('| ' + idx + ' | ' + m.sha.slice(0, 8) + ' | ' + dt + ' | ' + dbt + ' | ' +
      (m.dryAcc.event_date || '—') + ' / ' + (m.db.event_date || '—') + ' | ' +
      ((m.dryAcc.location?.city) || '—') + ' / ' + (m.db.city || '—') + ' | ' +
      (m.dryAcc.phenomenon_primary || '—') + ' / ' + (m.dbPrimarySlug || '—') + ' | ' +
      ov.toFixed(2) + ' | ' + (verbOk ? 'Y' : 'N') + ' |');
  }
  lines.push('');

  lines.push('## Flagged for review');
  lines.push('');
  lines.push('### Dry-run accepted, but DB has no row (' + Math.min(20, dryAcceptedDbMissing.length) + ' shown of ' + dryAcceptedDbMissing.length + ')');
  lines.push('');
  lines.push('These are either (a) new accounts the consolidated path found that the 3-pass missed, or (b) DB rows still sitting in pending_review (not yet approved).');
  lines.push('');
  for (const sha of dryAcceptedDbMissing.slice(0, 20)) {
    const dry = dryBySha.get(sha)!;
    const a = dry.accountsAccepted[0];
    lines.push('- `' + sha.slice(0, 12) + '` [' + dry.shardFile + '] **' + (a.modern_title || '').slice(0, 80) + '** — ' + (a.category || '?') + ' / ' + (a.phenomenon_primary || '—'));
  }
  lines.push('');
  lines.push('### DB has row, but dry-run rejected (' + Math.min(20, dbExistsDryRejected.length) + ' shown of ' + dbExistsDryRejected.length + ')');
  lines.push('');
  lines.push('These are the quality losses — accounts the 3-pass approved but the consolidated dropped. Inspect rejection reasons in the dry-run JSON for these shas.');
  lines.push('');
  for (const sha of dbExistsDryRejected.slice(0, 20)) {
    const dry = dryBySha.get(sha)!;
    const dbRow = (dbBySha.get(sha) || [])[0];
    lines.push('- `' + sha.slice(0, 12) + '` [' + dry.shardFile + '] DB title: **' + (dbRow?.title || '').slice(0, 80) +
      '** — reasons: ' + dry.rejectionReasons.join(', ') + (dry.fallbackUsed ? ' [FALLBACK]' : ''));
  }
  lines.push('');

  lines.push('## Recommendation');
  lines.push('');
  const titlePct = matched.length > 0 ? titleMatch / matched.length : 0;
  const datePct = matched.length > 0 ? dateAgree / matched.length : 0;
  const locPct = matched.length > 0 ? locAgree / matched.length : 0;
  const tagPct = bothHaveTag > 0 ? primaryTagAgree / bothHaveTag : 0;
  const verbPct = matched.length > 0 ? quoteVerbatimOk / matched.length : 0;
  const fallbackPct = (totals as any).snippets > 0 ? ((totals as any).fallbackUsed || 0) / (totals as any).snippets : 0;
  lines.push('Honest quality bar (Chase\'s 3-5% drop budget):');
  lines.push('- Title overlap: ' + (titlePct * 100).toFixed(1) + '% (target ≥85%)');
  lines.push('- Date agreement: ' + (datePct * 100).toFixed(1) + '% (target ≥90%)');
  lines.push('- Location agreement: ' + (locPct * 100).toFixed(1) + '% (target ≥85%)');
  lines.push('- Primary tag agreement: ' + (tagPct * 100).toFixed(1) + '% (target ≥80%)');
  lines.push('- verbatim_quote in snippet: ' + (verbPct * 100).toFixed(1) + '% (target ≥95% — hallucination gate)');
  lines.push('- Fallback rate: ' + (fallbackPct * 100).toFixed(1) + '% (target ≤5%)');
  lines.push('');
  const allClear = titlePct >= 0.85 && datePct >= 0.90 && locPct >= 0.85 && tagPct >= 0.80 && verbPct >= 0.95 && fallbackPct <= 0.05;
  if (allClear) lines.push('**PASS** — quality clears the bar. Recommend proceeding to Phase 3 (wire DB insert path + run on 1898+).');
  else lines.push('**NEEDS TIGHTENING** — see metric(s) below target. Inspect the "DB has row, but dry-run rejected" list above for systemic loss patterns.');
  lines.push('');

  fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
  fs.writeFileSync(args.outputPath, lines.join('\n'));
  console.log('[smoke-report] wrote: ' + args.outputPath);
}

main().catch(err => {
  console.error('[smoke-report] Fatal:', err);
  process.exit(1);
});
