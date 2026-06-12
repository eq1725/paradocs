#!/usr/bin/env tsx
/**
 * SPR "Phantasms of the Living" (1886) Ingestion Runner
 *
 * Modeled on scripts/nderf-mass-ingest.ts but SINGLE-PASS (no shards): the
 * whole corpus is two static public-domain OCR text files (~760 cases), so
 * there is nothing to shard or rate-limit. Parsing is fully local via the
 * spr adapter (src/lib/ingestion/adapters/spr.ts).
 *
 * PUBLIC DOMAIN: Gurney d. 1888, Myers d. 1901, Podmore d. 1910. Every
 * report carries metadata.public_domain = true → engine V11.18.22 stores
 * the full text (no 2,000-char copyright cap).
 *
 * ── Usage ───────────────────────────────────────────────────────────
 *
 *   set -a; source .env.local; set +a
 *
 *   # Dry run — parse only. NO network, NO DB, NO AI. Writes
 *   # outputs/spr-dry-run.json with stats + first 15 mapped reports.
 *   tsx scripts/spr-phantasms-ingest.ts --dry-run
 *
 *   # Live ingest (Haiku OCR repair + insert as pending_review)
 *   tsx scripts/spr-phantasms-ingest.ts --concurrency 6 --max-cost 10
 *
 *   # Resume from case 370, skip the Haiku repair pass
 *   tsx scripts/spr-phantasms-ingest.ts --start-case 370 --skip-clean
 *
 * ── Flags ───────────────────────────────────────────────────────────
 *   --dry-run          Parse + map only; write outputs/spr-dry-run.json.
 *   --limit N          Process at most N cases.
 *   --skip-clean       Skip the Haiku OCR-repair call (ocr_cleaned=false).
 *   --concurrency N    Parallel case workers (default 6).
 *   --start-case N     Resume: only process caseNumber >= N.
 *   --max-cost USD     Abort when this run's Haiku spend exceeds it ($10).
 *   --v1 / --v2 PATH   Override local OCR text paths.
 *
 * ── Live flow per case ──────────────────────────────────────────────
 *   1. sha256 of the regex-cleaned body → metadata.raw_ocr_sha256
 *   2. Haiku OCR repair (claude-haiku-4-5-20251001, temperature 0) —
 *      deterministic typo/artifact repair, never rewriting. Sets
 *      metadata.ocr_cleaned = true. Cost logged to
 *      paradocs_narrative_cost_log (service 'spr-ocr-repair').
 *   3. Dedup (source_type='spr' + original_report_id) → PII redact →
 *      enrich → quality assess → smart re-evaluate → geocode → insert as
 *      status='pending_review' with the exact nderf-mass-ingest payload
 *      shape → deterministic phenomenon-linking mirror.
 *   4. State persisted to outputs/spr-ingest-state.json; 30s heartbeat.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import {
  parseVolume,
  caseToReport,
  SprVolumeConfig,
  SprVolumeStats,
  SprParsedCase,
} from '../src/lib/ingestion/adapters/spr';
import { ScrapedReport } from '../src/lib/ingestion/types';

// ─────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────

const SPR_SOURCE_TYPE = 'spr';
const STATE_FILE = path.resolve(process.cwd(), 'outputs/spr-ingest-state.json');
const DRY_RUN_FILE = path.resolve(process.cwd(), 'outputs/spr-dry-run.json');
const HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_MAX_COST_USD = 10;

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
// Live (non-batch) Haiku 4.5 pricing — matches src/lib/services/ai-cost-logger.ts
const HAIKU_INPUT_USD_PER_M = 1.0;
const HAIKU_OUTPUT_USD_PER_M = 5.0;
const HAIKU_MAX_TOKENS = 8192;
const HAIKU_TIMEOUT_MS = 90_000;
const HAIKU_MAX_RETRIES = 2;

const OCR_REPAIR_SYSTEM_PROMPT =
  'You repair OCR transcription errors in 19th-century printed English. ' +
  'Fix broken/misrecognized words, remove page-header artifacts and stray characters, rejoin split words. ' +
  'Do NOT rewrite, modernize, summarize, omit, or add content. ' +
  'Preserve original wording, punctuation, and period spellings exactly. ' +
  'Output only the repaired text.';

const DEFAULT_VOLUME_DEFS: { vol: number; archiveId: string; candidates: string[] }[] = [
  {
    vol: 1,
    archiveId: 'phantasmsoflivin01gurn',
    candidates: ['outputs/phantasms-v1.txt', '../outputs/phantasms-v1.txt'],
  },
  {
    vol: 2,
    archiveId: 'phantasmsoflivin02gurn',
    candidates: ['outputs/phantasms-v2.txt', '../outputs/phantasms-v2.txt'],
  },
];

// ─────────────────────────────────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  dryRun: boolean;
  limit: number;
  skipClean: boolean;
  concurrency: number;
  startCase: number;
  maxCostUsd: number;
  v1Path: string | null;
  v2Path: string | null;
  /** Keep borderline-scored cases instead of dropping them. smartReEvaluate's
   * promotion signals are tuned for modern web content; Phantasms cases are
   * pre-vetted 1886 depositions and ALL inserts land as DB status
   * 'pending_review' anyway, so the founder remains the gate. Kept rows get
   * metadata.score_status='borderline_kept' for easy queue filtering. */
  keepBorderline: boolean;
  /** Bypass the modern-web content pre-filters (isObviouslyLowQuality +
   * assessQuality hard rejects). The shared filter lists are Reddit-derived
   * and false-positive on Victorian prose — e.g. /\b(print)\b/ ("printed in
   * the Journal"), /\b(dressed as)\b/ ("the figure was dressed as a sailor"),
   * /\b(discussion)\b/. ~230 of 666 Phantasms cases were wrongly dropped.
   * All inserts remain DB status 'pending_review'; bypassed rows are tagged
   * metadata.score_status='prefilter_bypassed' for queue filtering. */
  skipPrefilter: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  function flag(name: string, def: string | null = null): string | null {
    const idx = argv.indexOf(name);
    if (idx < 0) return def;
    return argv[idx + 1];
  }
  function bool(name: string): boolean {
    return argv.indexOf(name) >= 0;
  }
  return {
    dryRun: bool('--dry-run'),
    limit: parseInt(flag('--limit', '100000') || '100000'),
    skipClean: bool('--skip-clean'),
    concurrency: parseInt(flag('--concurrency', String(DEFAULT_CONCURRENCY)) || String(DEFAULT_CONCURRENCY)),
    startCase: parseInt(flag('--start-case', '0') || '0'),
    maxCostUsd: parseFloat(flag('--max-cost', String(DEFAULT_MAX_COST_USD)) || String(DEFAULT_MAX_COST_USD)),
    v1Path: flag('--v1', null),
    v2Path: flag('--v2', null),
    keepBorderline: bool('--keep-borderline'),
    skipPrefilter: bool('--skip-prefilter'),
  };
}

// ─────────────────────────────────────────────────────────────────────
// VOLUME RESOLUTION + PARSE (shared by dry + live)
// ─────────────────────────────────────────────────────────────────────

function resolveVolumeFile(candidates: string[], override: string | null): string | null {
  const list = override ? [override, ...candidates] : candidates;
  for (const c of list) {
    const abs = path.resolve(process.cwd(), c);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

interface ParsedCorpus {
  volumes: {
    config: SprVolumeConfig;
    stats: SprVolumeStats;
    rejectedLog: string[];
  }[];
  cases: SprParsedCase[];           // cross-volume deduped, in order
  duplicateCaseNumbers: { caseNumber: number; keptVol: number; skippedVol: number }[];
}

function parseCorpus(args: CliArgs): ParsedCorpus {
  const volumes: ParsedCorpus['volumes'] = [];
  const cases: SprParsedCase[] = [];
  const duplicateCaseNumbers: ParsedCorpus['duplicateCaseNumbers'] = [];
  const seen = new Map<number, number>();

  for (const def of DEFAULT_VOLUME_DEFS) {
    const override = def.vol === 1 ? args.v1Path : args.v2Path;
    const file = resolveVolumeFile(def.candidates, override);
    if (!file) {
      throw new Error(
        'vol ' + def.vol + ': no local OCR text found (tried: ' +
        (override ? override + ', ' : '') + def.candidates.join(', ') +
        '). Download https://archive.org/download/' + def.archiveId + '/' + def.archiveId + '_djvu.txt first.',
      );
    }
    const config: SprVolumeConfig = { file, archiveId: def.archiveId, vol: def.vol };
    console.log('[spr-ingest] vol ' + def.vol + ': parsing ' + file);
    const text = fs.readFileSync(file, 'utf8');
    const { cases: volCases, stats, rejectedLog } = parseVolume(text, config);
    rejectedLog.forEach(l => console.log(l));
    console.log(
      '[spr-ingest] vol ' + stats.vol + ': raw markers=' + stats.rawMarkers +
      ' accepted=' + stats.acceptedMarkers + ' rejected=' + stats.rejectedMarkers +
      ' skippedShort=' + stats.skippedShort + ' cases=' + stats.cases,
    );
    volumes.push({ config, stats, rejectedLog });

    for (const c of volCases) {
      if (seen.has(c.caseNumber)) {
        duplicateCaseNumbers.push({ caseNumber: c.caseNumber, keptVol: seen.get(c.caseNumber)!, skippedVol: c.vol });
        console.log('[spr-ingest] case (' + c.caseNumber + ') repeats across volumes — keeping vol ' + seen.get(c.caseNumber) + ', skipping vol ' + c.vol);
        continue;
      }
      seen.set(c.caseNumber, c.vol);
      cases.push(c);
    }
  }

  return { volumes, cases, duplicateCaseNumbers };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

// ─────────────────────────────────────────────────────────────────────
// DRY RUN — parse only. NO network, NO DB, NO AI.
// ─────────────────────────────────────────────────────────────────────

function runDry(args: CliArgs): void {
  const corpus = parseCorpus(args);
  const reports = corpus.cases
    .filter(c => c.caseNumber >= args.startCase)
    .slice(0, args.limit)
    .map(caseToReport);

  const bodyLens = reports.map(r => r.description.length);
  const withLocation = reports.filter(r => !!r.location_name).length;
  const withDate = reports.filter(r => !!r.event_date && r.event_date_precision !== 'unknown').length;

  const out = {
    generatedAt: new Date().toISOString(),
    args,
    volumes: corpus.volumes.map(v => ({
      vol: v.config.vol,
      archiveId: v.config.archiveId,
      file: v.config.file,
      rawMarkers: v.stats.rawMarkers,
      acceptedMarkers: v.stats.acceptedMarkers,
      rejectedMarkers: v.stats.rejectedMarkers,
      skippedShort: v.stats.skippedShort,
      cases: v.stats.cases,
      rejectedLog: v.rejectedLog,
    })),
    duplicateCaseNumbersAcrossVolumes: corpus.duplicateCaseNumbers,
    totals: {
      totalCases: reports.length,
      medianBodyLength: median(bodyLens),
      minBodyLength: bodyLens.length ? Math.min(...bodyLens) : 0,
      maxBodyLength: bodyLens.length ? Math.max(...bodyLens) : 0,
      withLocationName: withLocation,
      pctWithLocationName: reports.length ? Math.round((withLocation / reports.length) * 1000) / 10 : 0,
      withEventDate: withDate,
      pctWithEventDate: reports.length ? Math.round((withDate / reports.length) * 1000) / 10 : 0,
    },
    sampleReports: reports.slice(0, 15),
  };

  fs.mkdirSync(path.dirname(DRY_RUN_FILE), { recursive: true });
  fs.writeFileSync(DRY_RUN_FILE, JSON.stringify(out, null, 2));

  console.log('\n=== SPR Phantasms dry run ===');
  for (const v of out.volumes) {
    console.log('vol ' + v.vol + ': raw=' + v.rawMarkers + ' accepted=' + v.acceptedMarkers + ' rejected=' + v.rejectedMarkers + ' cases=' + v.cases);
  }
  console.log('total mapped reports: ' + out.totals.totalCases);
  console.log('median body length:   ' + out.totals.medianBodyLength + ' chars');
  console.log('with location_name:   ' + out.totals.withLocationName + ' (' + out.totals.pctWithLocationName + '%)');
  console.log('with event_date:      ' + out.totals.withEventDate + ' (' + out.totals.pctWithEventDate + '%)');
  console.log('Dry-run report written to ' + DRY_RUN_FILE);
}

// ─────────────────────────────────────────────────────────────────────
// STATE (live mode)
// ─────────────────────────────────────────────────────────────────────

interface IngestState {
  startedAt: string;
  args: CliArgs;
  totals: {
    parsed: number;
    processed: number;
    inserted: number;
    duplicates: number;
    filtered: number;
    errors: number;
    ocrRepaired: number;
    ocrRepairSkipped: number;
    costUsd: number;
    rejectionReasons: Record<string, number>;
  };
  lastProcessedCase: number;
  lastUpdatedAt: string;
}

function emptyState(args: CliArgs): IngestState {
  return {
    startedAt: new Date().toISOString(),
    args,
    totals: {
      parsed: 0, processed: 0, inserted: 0, duplicates: 0, filtered: 0,
      errors: 0, ocrRepaired: 0, ocrRepairSkipped: 0, costUsd: 0, rejectionReasons: {},
    },
    lastProcessedCase: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function saveState(state: IngestState): void {
  state.lastUpdatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h + 'h ' + m + 'm ' + s + 's';
}

// ─────────────────────────────────────────────────────────────────────
// SLUG (identical to nderf-mass-ingest.ts)
// ─────────────────────────────────────────────────────────────────────

function generateSlug(title: string, originalId: string | null, sourceType: string): string {
  const titlePart = (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 60);
  const uniqueKey = sourceType + '-' + (originalId || Math.random().toString(36).substring(2, 8));
  let hash = 0;
  for (let i = 0; i < uniqueKey.length; i++) {
    hash = (hash << 5) - hash + uniqueKey.charCodeAt(i);
    hash = hash & hash;
  }
  const suffix = Math.abs(hash).toString(36).substring(0, 6);
  return titlePart + '-' + suffix;
}

// ─────────────────────────────────────────────────────────────────────
// HAIKU OCR REPAIR (live mode only)
// ─────────────────────────────────────────────────────────────────────

interface OcrRepairResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

async function repairOcrWithHaiku(body: string): Promise<OcrRepairResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  for (let attempt = 0; attempt <= HAIKU_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: HAIKU_MAX_TOKENS,
          temperature: 0,
          system: OCR_REPAIR_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: body }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt < HAIKU_MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        return null;
      }
      if (!resp.ok) return null;
      const data: any = await resp.json();
      const text: string | undefined = data?.content?.[0]?.text;
      if (!text || typeof text !== 'string') return null;
      const repaired = text.trim();
      // Sanity guard: repair should not materially shrink or grow the text.
      // If it does, Haiku rewrote/summarized — keep the deterministic body.
      const ratio = repaired.length / Math.max(1, body.length);
      if (ratio < 0.6 || ratio > 1.3) {
        console.warn('[spr-ingest] OCR repair length ratio ' + ratio.toFixed(2) + ' out of bounds — keeping raw body');
        return null;
      }
      const inputTokens = data?.usage?.input_tokens || 0;
      const outputTokens = data?.usage?.output_tokens || 0;
      const costUsd =
        (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_M +
        (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_M;
      return { text: repaired, inputTokens, outputTokens, costUsd };
    } catch (e) {
      clearTimeout(timeoutId);
      if (attempt < HAIKU_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

/** Rebuild the ~380-char summary after the body changes (OCR repair). */
function summarize(body: string): string {
  let summary = body.replace(/\n+/g, ' ').trim();
  if (summary.length > 380) {
    let cut = summary.lastIndexOf(' ', 380);
    if (cut < 380 * 0.6) cut = 380;
    summary = summary.substring(0, cut).trim() + '…';
  }
  return summary;
}

// ─────────────────────────────────────────────────────────────────────
// LIVE MODE
// ─────────────────────────────────────────────────────────────────────

async function runLive(args: CliArgs): Promise<void> {
  // Heavy imports are deferred so --dry-run never touches env/DB/AI deps.
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[spr-ingest] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source .env.local first.');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY && !args.skipClean) {
    console.error('[spr-ingest] ANTHROPIC_API_KEY missing and --skip-clean not set. Either source .env.local or pass --skip-clean.');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const { redactReportPii } = await import('../src/lib/ingestion/utils/redact-pii');
  const { enrichReport } = await import('../src/lib/ingestion/enrichment/report-enricher');
  const {
    assessQuality,
    getStatusFromScore,
    isObviouslyLowQuality,
    smartReEvaluate,
  } = await import('../src/lib/ingestion/filters');
  const {
    normalizeLocation,
    geocodeWithFallback,
    makeSupabaseGeocodeCache,
  } = await import('../src/lib/ingestion/utils/normalize-location');
  const { extractAndGeocodeLocation } = await import('../src/lib/services/location-extraction.service');

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // ── Deterministic phenomenon-linker mirror (nderf-mass-ingest V11.17.13) ──
  const phenomenonSlugCache = new Map<string, { phenomenonId: string | null; phenomenonTypeId: string | null }>();

  async function resolveSlugCached(slug: string): Promise<{ phenomenonId: string | null; phenomenonTypeId: string | null }> {
    if (phenomenonSlugCache.has(slug)) return phenomenonSlugCache.get(slug)!;
    let phenomenonId: string | null = null;
    let phenomenonTypeId: string | null = null;
    try {
      const { data: phen } = await supabase.from('phenomena').select('id').eq('slug', slug).eq('status', 'active').maybeSingle();
      phenomenonId = phen ? (phen as any).id : null;
    } catch { /* ignore */ }
    try {
      const { data: ptype } = await supabase.from('phenomenon_types').select('id').eq('slug', slug).maybeSingle();
      phenomenonTypeId = ptype ? (ptype as any).id : null;
    } catch { /* ignore */ }
    const result = { phenomenonId, phenomenonTypeId };
    phenomenonSlugCache.set(slug, result);
    return result;
  }

  async function linkExperienceTypeForRow(row: { id: string; metadata: any }): Promise<boolean> {
    const slug = row.metadata && row.metadata.experienceTypeSlug;
    if (!slug || typeof slug !== 'string') return false;
    const { phenomenonId, phenomenonTypeId } = await resolveSlugCached(slug);
    if (!phenomenonId) return false;
    try {
      await supabase.from('report_phenomena').upsert(
        {
          report_id: row.id,
          phenomenon_id: phenomenonId,
          confidence: 0.95,
          tagged_by: 'auto',
          is_primary: true,
        },
        { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true },
      );
    } catch { return false; }
    if (phenomenonTypeId) {
      try {
        await supabase.from('reports').update({ phenomenon_type_id: phenomenonTypeId }).eq('id', row.id).is('phenomenon_type_id', null);
      } catch { /* ignore */ }
    }
    return true;
  }

  async function logOcrRepairCost(reportId: string | null, originalReportId: string, r: OcrRepairResult): Promise<void> {
    try {
      await supabase.from('paradocs_narrative_cost_log').insert({
        service: 'spr-ocr-repair',
        report_id: reportId,
        model: HAIKU_MODEL + ' (spr-ocr-repair)',
        input_tokens: r.inputTokens,
        output_tokens: r.outputTokens,
        cache_creation_tokens: null,
        cost_usd: r.costUsd,
        status: 'completed',
        reason: originalReportId,
      });
    } catch { /* non-fatal */ }
  }

  // ── Parse corpus ────────────────────────────────────────────────────
  const corpus = parseCorpus(args);
  let reports = corpus.cases
    .filter(c => c.caseNumber >= args.startCase)
    .slice(0, args.limit)
    .map(caseToReport);

  const state = emptyState(args);
  state.totals.parsed = reports.length;
  saveState(state);
  console.log('[spr-ingest] ' + reports.length + ' cases to process (start-case=' + args.startCase + ', limit=' + args.limit + ')');

  // ── Pre-fetch dedup set (nderf convention) ──────────────────────────
  const reportIds = reports.map(r => r.original_report_id).filter(Boolean) as string[];
  const dedupSet = new Set<string>();
  for (let i = 0; i < reportIds.length; i += 500) {
    const chunk = reportIds.slice(i, i + 500);
    const { data } = await supabase
      .from('reports')
      .select('original_report_id')
      .eq('source_type', SPR_SOURCE_TYPE)
      .in('original_report_id', chunk);
    (data || []).forEach((r: any) => dedupSet.add(r.original_report_id));
  }
  console.log('[spr-ingest] dedup: ' + dedupSet.size + ' already in DB');

  const controller = { abort: false, reason: '' };
  let sigintCount = 0;
  process.on('SIGINT', () => {
    sigintCount++;
    if (sigintCount === 1) {
      console.log('\n[spr-ingest] Caught SIGINT, finishing in-flight cases and saving state. Press Ctrl+C again to force-exit.');
      controller.abort = true;
      controller.reason = 'SIGINT';
    } else {
      console.log('[spr-ingest] Force exit on second SIGINT.');
      saveState(state);
      process.exit(130);
    }
  });

  const runStartMs = Date.now();
  const heartbeat = setInterval(() => {
    const elapsed = Date.now() - runStartMs;
    const t = state.totals;
    const ratePerMin = t.processed > 0 ? Math.round((t.processed / elapsed) * 60_000) : 0;
    console.log(
      '[+' + formatDuration(elapsed) + '] ' +
      'processed ' + t.processed + '/' + t.parsed + ' | ' +
      'inserted ' + t.inserted + ' | ' +
      'dup ' + t.duplicates + ' | ' +
      'filt ' + t.filtered + ' | ' +
      'err ' + t.errors + ' | ' +
      'ocr-repaired ' + t.ocrRepaired + ' | ' +
      'cost $' + t.costUsd.toFixed(2) + ' | ' +
      'rate ' + ratePerMin + '/min',
    );
  }, HEARTBEAT_INTERVAL_MS);

  // ── Per-case processor (mirrors nderf-mass-ingest processShard step 3) ──
  async function processCase(report: ScrapedReport): Promise<void> {
    const t = state.totals;
    const caseNumber = report.metadata?.caseNumber || 0;
    try {
      if (report.original_report_id && dedupSet.has(report.original_report_id)) {
        t.duplicates++;
        return;
      }

      // (1) Audit hash of the deterministic (regex-cleaned) OCR body.
      const rawSha = crypto.createHash('sha256').update(report.description, 'utf8').digest('hex');
      report.metadata = Object.assign({}, report.metadata, { raw_ocr_sha256: rawSha });

      // (2) Haiku OCR repair.
      let ocrCost: OcrRepairResult | null = null;
      if (!args.skipClean) {
        ocrCost = await repairOcrWithHaiku(report.description);
        if (ocrCost) {
          report.description = ocrCost.text;
          report.summary = summarize(ocrCost.text);
          report.metadata.ocr_cleaned = true;
          t.ocrRepaired++;
          t.costUsd += ocrCost.costUsd;
        } else {
          t.ocrRepairSkipped++;
        }
      } else {
        t.ocrRepairSkipped++;
      }

      // (3) PII redact → quality → enrich → geocode → insert (nderf shape).
      redactReportPii(report);

      if (!args.skipPrefilter && isObviouslyLowQuality(report.title, report.description)) {
        t.filtered++;
        t.rejectionReasons['obviously_low_quality'] = (t.rejectionReasons['obviously_low_quality'] || 0) + 1;
        return;
      }

      try { await enrichReport(report); } catch { /* non-fatal */ }

      const qualityResult = assessQuality(report, report.metadata);
      let prefilterBypassed = false;
      if (!qualityResult.passed) {
        if (args.skipPrefilter) {
          // Reddit-derived patterns false-positive on Victorian prose; the
          // founder reviews every row in the pending_review queue anyway.
          prefilterBypassed = true;
          const reason = (qualityResult.reason || 'unknown').substring(0, 40);
          t.rejectionReasons['bypassed: ' + reason] = (t.rejectionReasons['bypassed: ' + reason] || 0) + 1;
        } else {
          t.filtered++;
          const reason = (qualityResult.reason || 'unknown').substring(0, 40);
          t.rejectionReasons[reason] = (t.rejectionReasons[reason] || 0) + 1;
          return;
        }
      }

      const qualityScore = qualityResult.qualityScore ?? ({ total: 0 } as any);
      let initialStatus = prefilterBypassed
        ? ('prefilter_bypassed' as any)
        : getStatusFromScore(qualityScore.total, report.source_type);

      if (initialStatus === 'rejected') {
        t.filtered++;
        t.rejectionReasons['score_rejected'] = (t.rejectionReasons['score_rejected'] || 0) + 1;
        return;
      }

      if (initialStatus === 'pending_review') {
        const reeval = smartReEvaluate(qualityScore, {
          title: report.title,
          description: report.description,
          source_type: report.source_type,
          location_name: report.location_name,
          event_date: report.event_date,
          category: report.category,
        });
        if (reeval.promote) {
          initialStatus = 'approved';
        } else if (args.keepBorderline) {
          // Insert anyway — DB status is 'pending_review' for every row, so
          // the founder reviews these like everything else. Tagged for queue
          // filtering via metadata.score_status below.
          initialStatus = 'borderline_kept' as any;
          t.rejectionReasons['borderline_kept'] = (t.rejectionReasons['borderline_kept'] || 0) + 1;
        } else {
          t.filtered++;
          t.rejectionReasons['score_borderline_no_signals'] = (t.rejectionReasons['score_borderline_no_signals'] || 0) + 1;
          return;
        }
      }

      // NOTE — divergence from nderf: nderf nulls location_name when there
      // are no structured geo fields because NDERF location strings are
      // junk ("at home in bed"). SPR witness-line locations are real
      // 19th-century UK place strings, so we KEEP location_name and let
      // normalizeLocation/geocodeWithFallback resolve what it can.
      const locName: string | null = report.location_name || null;

      let normalizedLocation: any = null;
      try {
        normalizedLocation = await normalizeLocation(
          {
            city: report.city || null,
            state_province: report.state_province || null,
            country: report.country || null,
            country_code: (report as any).country_code || null,
            location_name: locName,
            latitude: typeof report.latitude === 'number' ? report.latitude : null,
            longitude: typeof report.longitude === 'number' ? report.longitude : null,
          },
          {
            geocoder: 'maptiler',
            geocodeFn: geocodeWithFallback,
            cache: makeSupabaseGeocodeCache(supabase),
          },
        );
      } catch { /* non-fatal */ }

      const scoreStatus = initialStatus;
      const slug = generateSlug(report.title || 'untitled', report.original_report_id || null, report.source_type);

      const insertData: Record<string, any> = {
        title: report.title,
        slug,
        summary: report.summary,
        description: report.description,
        category: report.category,
        location_name: normalizedLocation ? normalizedLocation.location_name : locName,
        country: normalizedLocation ? normalizedLocation.country : (report.country || null),
        country_code: normalizedLocation ? normalizedLocation.country_code : (report as any).country_code || null,
        state_province: normalizedLocation ? normalizedLocation.state_province : report.state_province,
        city: normalizedLocation ? normalizedLocation.city : report.city,
        latitude: normalizedLocation ? normalizedLocation.latitude : report.latitude,
        longitude: normalizedLocation ? normalizedLocation.longitude : report.longitude,
        coords_synthetic: normalizedLocation ? !!normalizedLocation.coords_synthetic : false,
        event_date: report.event_date,
        event_date_precision: report.event_date_precision || 'unknown',
        credibility: report.credibility || 'medium',
        source_type: report.source_type,
        original_report_id: report.original_report_id,
        status: 'pending_review',
        tags: report.tags || [],
        source_label: report.source_label || 'SPR — Phantasms of the Living (1886)',
        source_url: report.source_url,
        upvotes: 0,
        view_count: 0,
        report_type: 'ingested',
        metadata: Object.assign({}, report.metadata || {}, {
          location_precision: normalizedLocation ? normalizedLocation.location_precision : ((report as any).location_precision || 'unknown'),
          score_status: scoreStatus,
          quality_score: qualityScore.total,
        }),
      };
      if ((report as any).event_date_extracted_from) insertData.event_date_extracted_from = (report as any).event_date_extracted_from;
      if (report.witness_count && report.witness_count > 0) insertData.witness_count = report.witness_count;
      if (report.has_photo_video) insertData.has_photo_video = true;

      // V11.17.56 — location safety net (see engine.ts).
      if (!insertData.location_name) {
        try {
          const resolved = await extractAndGeocodeLocation({
            title: insertData.title || null,
            summary: insertData.summary || null,
            description: insertData.description || null,
          });
          if (resolved) {
            insertData.location_name = resolved.location_name;
            insertData.city = resolved.city;
            insertData.state_province = resolved.state_province;
            insertData.country = resolved.country;
            insertData.latitude = resolved.latitude;
            insertData.longitude = resolved.longitude;
            insertData.location_precision = resolved.location_precision;
          }
        } catch { /* leave null */ }
      }

      const solo = await supabase.from('reports').insert(insertData).select('id, metadata').single();
      if (solo.error) {
        if (solo.error.message && solo.error.message.indexOf('duplicate key') !== -1) {
          t.duplicates++;
        } else {
          t.errors++;
          console.warn('[spr-ingest] insert error case (' + caseNumber + '): ' + solo.error.message);
        }
        if (ocrCost) await logOcrRepairCost(null, report.original_report_id, ocrCost);
      } else {
        t.inserted++;
        if (solo.data) {
          await linkExperienceTypeForRow(solo.data as { id: string; metadata: any });
          if (ocrCost) await logOcrRepairCost((solo.data as any).id, report.original_report_id, ocrCost);
        }
      }
    } catch (perReportErr: any) {
      t.errors++;
      console.warn('[spr-ingest] per-case error (' + caseNumber + '): ' + (perReportErr?.message || perReportErr));
    } finally {
      t.processed++;
      if (caseNumber > state.lastProcessedCase) state.lastProcessedCase = caseNumber;
      if (t.processed % 10 === 0) saveState(state);
    }
  }

  // ── Worker pool ─────────────────────────────────────────────────────
  let queueIdx = 0;
  async function worker(workerId: number): Promise<void> {
    while (!controller.abort) {
      if (state.totals.costUsd >= args.maxCostUsd) {
        controller.abort = true;
        controller.reason = 'max cost reached ($' + state.totals.costUsd.toFixed(2) + ' >= $' + args.maxCostUsd + ')';
        break;
      }
      const idx = queueIdx++;
      if (idx >= reports.length) break;
      await processCase(reports[idx]);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.max(1, args.concurrency); i++) workers.push(worker(i));

  try {
    await Promise.all(workers);
  } finally {
    clearInterval(heartbeat);
    saveState(state);
  }

  const t = state.totals;
  console.log('\n=== SPR Phantasms Ingest Complete ===');
  console.log('Stop reason: ' + (controller.reason || 'all cases processed'));
  console.log('Elapsed: ' + formatDuration(Date.now() - runStartMs));
  console.log('Totals: parsed=' + t.parsed + ' processed=' + t.processed + ' inserted=' + t.inserted + ' dup=' + t.duplicates + ' filtered=' + t.filtered + ' errors=' + t.errors);
  console.log('OCR repair: ' + t.ocrRepaired + ' repaired, ' + t.ocrRepairSkipped + ' skipped/failed');
  console.log('Cost: $' + t.costUsd.toFixed(4));
  console.log('Last processed case: ' + state.lastProcessedCase + ' (resume with --start-case ' + (state.lastProcessedCase + 1) + ')');
  console.log('State persisted to: ' + STATE_FILE);

  const topReasons = Object.entries(t.rejectionReasons).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topReasons.length > 0) {
    console.log('\nTop rejection reasons:');
    topReasons.forEach(([reason, count]) => console.log('  ' + count + 'x ' + reason));
  }
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  console.log('SPR Phantasms Ingest');
  console.log('Args: ' + JSON.stringify(args));

  if (args.dryRun) {
    runDry(args);
    return;
  }
  await runLive(args);
}

main().catch(err => {
  console.error('[spr-ingest] Fatal:', err);
  process.exit(1);
});
