#!/usr/bin/env tsx
/**
 * NUFORC Mass Ingestion Runner (V11.17.13)
 *
 * Fans out NUFORC scrape across many month-shards in parallel, processes
 * each scraped report through the V11.14 ingestion pipeline (PII →
 * enrich → quality filter → normalizeLocation → insert as pending_review),
 * and auto-triggers `batch-ingest-worker.ts` between waves so AI fields
 * land on the inserted reports via Anthropic's Batch API (50% off).
 *
 * Architecture mirrors scripts/mass-ingest-orchestrator.ts (Arctic Shift)
 * but is direct-to-DB rather than HTTP-via-endpoint so we don't need a
 * new /api/admin/nuforc-import endpoint. Same processing rules — every
 * insert is either auto-approve-worthy (high score OR smartReEvaluate
 * promotes) or dropped at insert time. No admin queue clutter.
 *
 * ── Usage ───────────────────────────────────────────────────────────
 *
 *   set -a; source .env.local; set +a
 *
 *   # Dry run — enumerate months only, no scraping
 *   tsx scripts/nuforc-mass-ingest.ts --dry-run
 *
 *   # 1000-report validation pass (10 parallel workers, last 12 months)
 *   tsx scripts/nuforc-mass-ingest.ts \
 *     --target 1000 \
 *     --concurrency 10 \
 *     --from 202506 --to 202605
 *
 *   # Full corpus, ~250k reports, 12 parallel workers, $700 cap
 *   tsx scripts/nuforc-mass-ingest.ts \
 *     --target 300000 \
 *     --concurrency 12 \
 *     --from 197401 \
 *     --cost-cap 700
 *
 *   # Resume an interrupted run
 *   tsx scripts/nuforc-mass-ingest.ts --resume
 *
 * ── State file ──────────────────────────────────────────────────────
 *   outputs/nuforc-mass-ingest-state.json — per-shard status, totals,
 *   args. Reloaded on --resume; unfinished shards picked up first.
 *
 * ── Heartbeat ───────────────────────────────────────────────────────
 *   Every 30 seconds prints one line:
 *     [+0h 12m 33s] shards 18/624 | scraped 4521 | inserted 1203 |
 *     dup 89 | filt 156 | cost $4.83 | rate 96/min | eta ~11h
 *
 * ── Stop conditions ─────────────────────────────────────────────────
 *  - Global target reached (--target inserts)
 *  - Cost cap hit (--cost-cap USD)
 *  - All shards exhausted
 *  - Ctrl+C (graceful: writes state, finishes in-flight shards)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { nuforcAdapter } from '../src/lib/ingestion/adapters/nuforc';
import { ScrapedReport } from '../src/lib/ingestion/types';
import { redactReportPii } from '../src/lib/ingestion/utils/redact-pii';
import { enrichReport } from '../src/lib/ingestion/enrichment/report-enricher';
import {
  assessQuality,
  getStatusFromScore,
  isObviouslyLowQuality,
  smartReEvaluate,
} from '../src/lib/ingestion/filters';
import {
  normalizeLocation,
  geocodeWithFallback,
  makeSupabaseGeocodeCache,
} from '../src/lib/ingestion/utils/normalize-location';

// ─────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────

const NUFORC_SOURCE_TYPE = 'nuforc';
const STATE_FILE = path.resolve(process.cwd(), 'outputs/nuforc-mass-ingest-state.json');
const HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_BATCH_TRIGGER = 500;
const DEFAULT_COST_CAP_USD = 700;
const DEFAULT_RATE_LIMIT_MS = 500;

interface CliArgs {
  target: number;
  concurrency: number;
  fromMonth: string;
  toMonth: string;
  dryRun: boolean;
  resume: boolean;
  costCapUsd: number;
  batchTrigger: number;
  rateLimitMs: number;
  maxPerMonth: number;
  noBatchTrigger: boolean;
  strictMode: boolean;
  strictMinDescLen: number;
  strictMinScore: number;
  noFullDetails: boolean;  // V11.17.23 — opt-out of per-report fetch_full_details (Cloudflare-paranoid mode)
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
  const now = new Date();
  const currentMonth = String(now.getFullYear()) + String(now.getMonth() + 1).padStart(2, '0');
  return {
    target: parseInt(flag('--target', '250000') || '250000'),
    concurrency: parseInt(flag('--concurrency', String(DEFAULT_CONCURRENCY)) || String(DEFAULT_CONCURRENCY)),
    fromMonth: flag('--from', '197401') || '197401',
    toMonth: flag('--to', currentMonth) || currentMonth,
    dryRun: bool('--dry-run'),
    resume: bool('--resume'),
    costCapUsd: parseFloat(flag('--cost-cap', String(DEFAULT_COST_CAP_USD)) || String(DEFAULT_COST_CAP_USD)),
    batchTrigger: parseInt(flag('--batch-trigger', String(DEFAULT_BATCH_TRIGGER)) || String(DEFAULT_BATCH_TRIGGER)),
    rateLimitMs: parseInt(flag('--rate-limit-ms', String(DEFAULT_RATE_LIMIT_MS)) || String(DEFAULT_RATE_LIMIT_MS)),
    maxPerMonth: parseInt(flag('--max-per-month', '5000') || '5000'),
    noBatchTrigger: bool('--no-batch-trigger'),
    strictMode: bool('--strict-mode'),
    strictMinDescLen: parseInt(flag('--strict-min-desc-len', '300') || '300'),
    strictMinScore: parseInt(flag('--strict-min-score', '65') || '65'),
    noFullDetails: bool('--no-full-details'),
  };
}

// ─────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────

interface ShardState {
  monthId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  scraped: number;
  inserted: number;
  duplicates: number;
  filtered: number;
  errors: number;
  ms: number;
  error?: string;
}

interface MassIngestState {
  startedAt: string;
  args: CliArgs;
  shards: ShardState[];
  totals: {
    scraped: number;
    inserted: number;
    duplicates: number;
    filtered: number;
    errors: number;
    costUsd: number;
    rejectionReasons: Record<string, number>;
  };
  lastBatchTriggerInserts: number;
  lastUpdatedAt: string;
}

function emptyState(args: CliArgs): MassIngestState {
  return {
    startedAt: new Date().toISOString(),
    args,
    shards: [],
    totals: { scraped: 0, inserted: 0, duplicates: 0, filtered: 0, errors: 0, costUsd: 0, rejectionReasons: {} },
    lastBatchTriggerInserts: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
}

// V11.17.15 — Deterministic phenomenon-linker (mirrors the NDERF/OBERF
// orchestrator pattern). NUFORC adapter sets metadata.experienceTypeSlug
// from the shape→phenomenon-slug map (egg→egg-ufo, orb→orb-ufo, etc).
// Without this linker, NUFORC reports would land WITHOUT phenomenon
// junctions and rely on the AI classifier to add them — non-deterministic
// and slower. Slug cache keeps lookups to ~21 unique queries even at
// 200k-report scale.
const phenomenonSlugCache = new Map<string, { phenomenonId: string | null; phenomenonTypeId: string | null }>();

async function resolveSlugCached(supabase: SupabaseClient, slug: string): Promise<{ phenomenonId: string | null; phenomenonTypeId: string | null }> {
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

interface InsertedRowMin { id: string; metadata: any }

async function linkExperienceTypeForRow(supabase: SupabaseClient, row: InsertedRowMin): Promise<boolean> {
  const slug = row.metadata && row.metadata.experienceTypeSlug;
  if (!slug || typeof slug !== 'string') return false;
  const { phenomenonId, phenomenonTypeId } = await resolveSlugCached(supabase, slug);
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

function loadState(): MassIngestState | null {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    console.error('[nuforc-mass-ingest] Could not parse state file, ignoring:', (e as any)?.message);
    return null;
  }
}

function saveState(state: MassIngestState): void {
  state.lastUpdatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─────────────────────────────────────────────────────────────────────
// MONTH ENUMERATION
// ─────────────────────────────────────────────────────────────────────

function enumerateMonths(fromMonth: string, toMonth: string): string[] {
  const fromYear = parseInt(fromMonth.substring(0, 4));
  const fromM = parseInt(fromMonth.substring(4, 6));
  const toYear = parseInt(toMonth.substring(0, 4));
  const toM = parseInt(toMonth.substring(4, 6));
  const months: string[] = [];
  let y = fromYear;
  let m = fromM;
  while (y < toYear || (y === toYear && m <= toM)) {
    months.push(String(y) + String(m).padStart(2, '0'));
    m++;
    if (m > 12) { m = 1; y++; }
  }
  // Reverse so newest months process first — provides immediate signal
  // about adapter health on recent data, and old archives can run overnight
  return months.reverse();
}

// ─────────────────────────────────────────────────────────────────────
// PER-SHARD PROCESSOR
// ─────────────────────────────────────────────────────────────────────

interface ProcessResult {
  scraped: number;
  inserted: number;
  duplicates: number;
  filtered: number;
  errors: number;
  rejectionReasons: Record<string, number>;
}

async function processShard(
  supabase: SupabaseClient,
  monthId: string,
  args: CliArgs,
): Promise<ProcessResult> {
  const result: ProcessResult = { scraped: 0, inserted: 0, duplicates: 0, filtered: 0, errors: 0, rejectionReasons: {} };

  // 1. Scrape this month's reports via the adapter (targetMonths fast path).
  // V11.17.23 — fetch_full_details defaults TRUE (better data quality) but can be
  // opted out via --no-full-details for Cloudflare-paranoid runs. The wpDataTable
  // AJAX fix (also V11.17.23) now correctly returns all ~345 reports per month
  // in one call with their structured metadata + 135-char summary teaser; with
  // fetch_full_details=true we additionally fetch the per-sighting page for the
  // FULL narrative (200-1000+ chars typically), which is what passes the engine
  // quality filter's minDescLen=200 threshold. Without it most reports filter out.
  const scrapeResult = await nuforcAdapter.scrape({
    target_months: [monthId],
    rate_limit_ms: args.rateLimitMs,
    fetch_full_details: !args.noFullDetails,
  }, args.maxPerMonth);

  if (!scrapeResult.success) {
    result.errors++;
    result.rejectionReasons['scrape_failed'] = (result.rejectionReasons['scrape_failed'] || 0) + 1;
    return result;
  }

  const reports = scrapeResult.reports;
  result.scraped = reports.length;
  if (reports.length === 0) return result;

  // 2. Pre-fetch dedup set for all original_report_ids in this shard
  const reportIds = reports.map(r => r.original_report_id).filter(Boolean) as string[];
  const dedupSet = new Set<string>();
  if (reportIds.length > 0) {
    // Chunk into 500-ID groups to avoid 1000-ID IN() limit
    for (let i = 0; i < reportIds.length; i += 500) {
      const chunk = reportIds.slice(i, i + 500);
      const { data } = await supabase
        .from('reports')
        .select('original_report_id')
        .eq('source_type', NUFORC_SOURCE_TYPE)
        .in('original_report_id', chunk);
      (data || []).forEach((r: any) => dedupSet.add(r.original_report_id));
    }
  }

  // 3. Process each scraped report
  const toInsert: Record<string, any>[] = [];
  for (const report of reports) {
    try {
      // 3a. Hash-dedup
      if (report.original_report_id && dedupSet.has(report.original_report_id)) {
        result.duplicates++;
        continue;
      }

      // 3b. PII redaction
      redactReportPii(report);

      // 3c. Quick low-quality check
      if (isObviouslyLowQuality(report.title, report.description)) {
        result.filtered++;
        result.rejectionReasons['obviously_low_quality'] = (result.rejectionReasons['obviously_low_quality'] || 0) + 1;
        continue;
      }

      // 3d. Enrichment (date + location best-effort)
      try {
        await enrichReport(report);
      } catch (enrichErr) {
        // Non-fatal — just less-enriched row
      }

      // 3e. Quality assessment
      const qualityResult = assessQuality(report, report.metadata);
      if (!qualityResult.passed) {
        result.filtered++;
        const reason = (qualityResult.reason || 'unknown').substring(0, 40);
        result.rejectionReasons[reason] = (result.rejectionReasons[reason] || 0) + 1;
        continue;
      }

      const qualityScore = qualityResult.qualityScore!;
      let initialStatus = getStatusFromScore(qualityScore.total, report.source_type);

      // 3e.5 — Strict-mode gate (mass-ingest "highest-quality" preset).
      // When --strict-mode is on, also reject any report below the
      // strict description-length OR strict score floor. Applied
      // BEFORE smartReEvaluate so the boosts can't promote a strict-
      // mode reject into the queue.
      if (args.strictMode) {
        const descLen = (report.description || '').length;
        if (descLen < args.strictMinDescLen) {
          result.filtered++;
          const k = 'strict_desc_under_' + args.strictMinDescLen;
          result.rejectionReasons[k] = (result.rejectionReasons[k] || 0) + 1;
          continue;
        }
        if (qualityScore.total < args.strictMinScore) {
          result.filtered++;
          const k = 'strict_score_under_' + args.strictMinScore;
          result.rejectionReasons[k] = (result.rejectionReasons[k] || 0) + 1;
          continue;
        }
      }

      // 3f. Drop low-score-rejected before insert
      if (initialStatus === 'rejected') {
        result.filtered++;
        result.rejectionReasons['score_rejected'] = (result.rejectionReasons['score_rejected'] || 0) + 1;
        continue;
      }

      // 3g. Borderline policy: NO admin queue at scale
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
        } else {
          result.filtered++;
          result.rejectionReasons['score_borderline_no_signals'] = (result.rejectionReasons['score_borderline_no_signals'] || 0) + 1;
          continue;
        }
      }

      // 3h. Structural location-quality check
      let locName: string | null = report.location_name || null;
      const hasStructuredGeo = !!(report.city || report.state_province || report.country ||
        (typeof report.latitude === 'number' && typeof report.longitude === 'number'));
      if (locName && !hasStructuredGeo) {
        locName = null;
        report.location_name = null as any;
      }

      // 3i. normalizeLocation: country alias fold + country_code + geocode
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
      } catch (normErr) {
        // Non-fatal
      }

      const scoreStatus = initialStatus; // 'approved' (after smartReEvaluate promote)

      // 3j. Slug generation (matches engine.ts pattern via archive-import generateSlug logic)
      const slug = generateSlug(report.title || 'untitled', report.original_report_id || null, report.source_type);

      // 3k. Build insert payload
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
        source_label: report.source_label || 'NUFORC',
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

      toInsert.push(insertData);
    } catch (perReportErr: any) {
      result.errors++;
      console.warn('[nuforc-mass-ingest] per-report error: ' + (perReportErr?.message || perReportErr));
    }
  }

  // 4. Bulk insert in chunks of 100 — request id+metadata back via .select()
  //    so we can deterministically link each inserted row to its canonical
  //    encyclopedia phenomenon via metadata.experienceTypeSlug.
  for (let batchStart = 0; batchStart < toInsert.length; batchStart += 100) {
    const chunk = toInsert.slice(batchStart, batchStart + 100);
    const ins = await supabase.from('reports').insert(chunk).select('id, metadata');
    if (ins.error) {
      // Bulk failed — retry per-row to count duplicates accurately + still link successful ones
      for (const row of chunk) {
        const solo = await supabase.from('reports').insert(row).select('id, metadata').single();
        if (solo.error) {
          if (solo.error.message && solo.error.message.indexOf('duplicate key') !== -1) {
            result.duplicates++;
          } else {
            result.errors++;
          }
        } else {
          result.inserted++;
          if (solo.data) await linkExperienceTypeForRow(supabase, solo.data as InsertedRowMin);
        }
      }
    } else {
      result.inserted += chunk.length;
      const rows = (ins.data || []) as InsertedRowMin[];
      for (const row of rows) {
        await linkExperienceTypeForRow(supabase, row);
      }
    }
  }

  return result;
}

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
// COST TRACKING
// ─────────────────────────────────────────────────────────────────────

async function pollTodaysCost(supabase: SupabaseClient): Promise<number> {
  // Sum cost_usd from paradocs_narrative_cost_log for today
  try {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('paradocs_narrative_cost_log')
      .select('cost_usd')
      .gte('created_at', since.toISOString());
    return (data || []).reduce((sum: number, r: any) => sum + (parseFloat(r.cost_usd) || 0), 0);
  } catch (e) {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────
// BATCH WORKER TRIGGER
// ─────────────────────────────────────────────────────────────────────

let lastBatchSpawnAt = 0;
function triggerBatchWorker(insertCount: number): void {
  const now = Date.now();
  // Don't spawn batch workers more than once per 60s — even if inserts spike
  if (now - lastBatchSpawnAt < 60_000) return;
  lastBatchSpawnAt = now;
  console.log('[nuforc-mass-ingest] Triggering batch worker (cumulative inserts: ' + insertCount + ')');
  const child = spawn('npx', ['tsx', 'scripts/batch-ingest-worker.ts', '--backfill', '--limit', '500'], {
    stdio: 'ignore',
    detached: true,
    env: process.env,
  });
  child.unref();
}

// ─────────────────────────────────────────────────────────────────────
// HEARTBEAT
// ─────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h + 'h ' + m + 'm ' + s + 's';
}

function startHeartbeat(state: MassIngestState, totalShards: number, runStartMs: number): NodeJS.Timeout {
  return setInterval(() => {
    const elapsed = Date.now() - runStartMs;
    const completed = state.shards.filter(s => s.status === 'completed' || s.status === 'failed').length;
    const inserted = state.totals.inserted;
    const ratePerMin = inserted > 0 ? Math.round((inserted / elapsed) * 60_000) : 0;
    const remainingShards = totalShards - completed;
    const avgMsPerShard = completed > 0
      ? state.shards.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.ms, 0) / completed
      : 0;
    const etaMs = avgMsPerShard > 0 && state.args.concurrency > 0
      ? (remainingShards * avgMsPerShard) / state.args.concurrency
      : 0;
    console.log(
      '[+' + formatDuration(elapsed) + '] ' +
      'shards ' + completed + '/' + totalShards + ' | ' +
      'scraped ' + state.totals.scraped + ' | ' +
      'inserted ' + inserted + ' | ' +
      'dup ' + state.totals.duplicates + ' | ' +
      'filt ' + state.totals.filtered + ' | ' +
      'err ' + state.totals.errors + ' | ' +
      'cost $' + state.totals.costUsd.toFixed(2) + ' | ' +
      'rate ' + ratePerMin + '/min' +
      (etaMs > 0 ? ' | eta ~' + formatDuration(etaMs) : '')
    );
  }, HEARTBEAT_INTERVAL_MS);
}

// ─────────────────────────────────────────────────────────────────────
// WORKER POOL
// ─────────────────────────────────────────────────────────────────────

interface RunController {
  abort: boolean;
  reason: string;
}

async function runWorkerPool(
  supabase: SupabaseClient,
  state: MassIngestState,
  args: CliArgs,
  controller: RunController,
): Promise<void> {
  // Build the queue of shards to process
  const pendingShards = state.shards.filter(s => s.status === 'pending' || s.status === 'in_progress');
  if (pendingShards.length === 0) {
    console.log('[nuforc-mass-ingest] No pending shards. Run complete.');
    return;
  }

  let queueIdx = 0;
  let costCheckTimer = 0;

  async function worker(workerId: number): Promise<void> {
    while (!controller.abort) {
      // Pick next shard
      let shard: ShardState | null = null;
      while (queueIdx < pendingShards.length) {
        const cand = pendingShards[queueIdx++];
        if (cand.status === 'pending' || cand.status === 'in_progress') {
          shard = cand;
          break;
        }
      }
      if (!shard) break;

      // Check stop conditions
      if (state.totals.inserted >= args.target) {
        controller.abort = true;
        controller.reason = 'target reached (' + state.totals.inserted + ' >= ' + args.target + ')';
        break;
      }
      if (state.totals.costUsd >= args.costCapUsd) {
        controller.abort = true;
        controller.reason = 'cost cap reached ($' + state.totals.costUsd.toFixed(2) + ' >= $' + args.costCapUsd + ')';
        break;
      }

      shard.status = 'in_progress';
      const tStart = Date.now();
      try {
        const r = await processShard(supabase, shard.monthId, args);
        shard.scraped = r.scraped;
        shard.inserted = r.inserted;
        shard.duplicates = r.duplicates;
        shard.filtered = r.filtered;
        shard.errors = r.errors;
        shard.ms = Date.now() - tStart;
        shard.status = 'completed';

        // Update totals
        state.totals.scraped += r.scraped;
        state.totals.inserted += r.inserted;
        state.totals.duplicates += r.duplicates;
        state.totals.filtered += r.filtered;
        state.totals.errors += r.errors;
        for (const [k, v] of Object.entries(r.rejectionReasons)) {
          state.totals.rejectionReasons[k] = (state.totals.rejectionReasons[k] || 0) + v;
        }

        // Persist state every shard completion
        saveState(state);

        // Auto-trigger batch worker every N inserts
        if (!args.noBatchTrigger && (state.totals.inserted - state.lastBatchTriggerInserts) >= args.batchTrigger) {
          triggerBatchWorker(state.totals.inserted);
          state.lastBatchTriggerInserts = state.totals.inserted;
        }

        // Refresh today's cost periodically (every 10 shards across all workers)
        costCheckTimer++;
        if (costCheckTimer % 10 === 0) {
          const todaysCost = await pollTodaysCost(supabase);
          state.totals.costUsd = todaysCost;
        }
      } catch (err: any) {
        shard.status = 'failed';
        shard.error = err?.message || String(err);
        shard.ms = Date.now() - tStart;
        state.totals.errors++;
        saveState(state);
        console.error('[nuforc-mass-ingest] Worker ' + workerId + ' shard ' + shard.monthId + ' FAILED: ' + shard.error);
      }
    }
  }

  // Spawn N workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < args.concurrency; i++) {
    workers.push(worker(i));
  }
  await Promise.all(workers);
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  console.log('NUFORC Mass Ingest — V11.17.13');
  console.log('Args: ' + JSON.stringify(args));

  // Verify env
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[nuforc-mass-ingest] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env. Source .env.local first.');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[nuforc-mass-ingest] WARNING: ANTHROPIC_API_KEY missing. Batch worker will fail when triggered.');
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Load or initialize state
  let state: MassIngestState;
  if (args.resume) {
    const loaded = loadState();
    if (!loaded) {
      console.error('[nuforc-mass-ingest] --resume requested but no state file at ' + STATE_FILE);
      process.exit(1);
    }
    state = loaded;
    state.args = args; // Allow arg overrides on resume
    const completedCount = state.shards.filter(s => s.status === 'completed').length;
    const failedCount = state.shards.filter(s => s.status === 'failed').length;
    console.log('[nuforc-mass-ingest] Resuming from state: ' + completedCount + ' completed, ' + failedCount + ' failed, ' + state.totals.inserted + ' inserted so far');
    // Reset in-progress shards to pending (interrupted mid-shard)
    state.shards.forEach(s => { if (s.status === 'in_progress') s.status = 'pending'; });
  } else {
    state = emptyState(args);
    const months = enumerateMonths(args.fromMonth, args.toMonth);
    state.shards = months.map(monthId => ({
      monthId, status: 'pending', scraped: 0, inserted: 0, duplicates: 0, filtered: 0, errors: 0, ms: 0,
    }));
    console.log('[nuforc-mass-ingest] Enumerated ' + state.shards.length + ' month-shards from ' + args.fromMonth + ' to ' + args.toMonth);
  }

  if (args.dryRun) {
    console.log('[nuforc-mass-ingest] --dry-run; printing first 10 shards then exiting');
    state.shards.slice(0, 10).forEach(s => console.log('  ' + s.monthId + ' (status: ' + s.status + ')'));
    console.log('  ... ' + state.shards.length + ' total shards');
    return;
  }

  // Initialize today's cost
  state.totals.costUsd = await pollTodaysCost(supabase);
  console.log('[nuforc-mass-ingest] Starting today\'s cost: $' + state.totals.costUsd.toFixed(2) + ' (cap: $' + args.costCapUsd.toFixed(2) + ')');

  const runStartMs = Date.now();
  const controller: RunController = { abort: false, reason: '' };

  // Graceful Ctrl+C
  let sigintCount = 0;
  process.on('SIGINT', () => {
    sigintCount++;
    if (sigintCount === 1) {
      console.log('\n[nuforc-mass-ingest] Caught SIGINT, finishing in-flight shards and saving state. Press Ctrl+C again to force-exit.');
      controller.abort = true;
      controller.reason = 'SIGINT';
    } else {
      console.log('[nuforc-mass-ingest] Force exit on second SIGINT.');
      saveState(state);
      process.exit(130);
    }
  });

  const heartbeat = startHeartbeat(state, state.shards.length, runStartMs);

  try {
    await runWorkerPool(supabase, state, args, controller);
  } finally {
    clearInterval(heartbeat);
    saveState(state);
  }

  // Final summary
  console.log('\n=== NUFORC Mass Ingest Complete ===');
  console.log('Stop reason: ' + (controller.reason || 'all shards processed'));
  console.log('Elapsed: ' + formatDuration(Date.now() - runStartMs));
  console.log('Total shards: ' + state.shards.length);
  console.log('  completed: ' + state.shards.filter(s => s.status === 'completed').length);
  console.log('  failed: ' + state.shards.filter(s => s.status === 'failed').length);
  console.log('  pending: ' + state.shards.filter(s => s.status === 'pending').length);
  console.log('Totals: scraped=' + state.totals.scraped + ' inserted=' + state.totals.inserted + ' dup=' + state.totals.duplicates + ' filtered=' + state.totals.filtered + ' errors=' + state.totals.errors);
  console.log('Cost: $' + state.totals.costUsd.toFixed(2));
  console.log('State persisted to: ' + STATE_FILE);

  // Show top rejection reasons
  const topReasons = Object.entries(state.totals.rejectionReasons).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topReasons.length > 0) {
    console.log('\nTop rejection reasons:');
    topReasons.forEach(([reason, count]) => console.log('  ' + count + 'x ' + reason));
  }

  // Trigger one final batch worker pass to drain any straggler pending_review rows
  if (!args.noBatchTrigger && state.totals.inserted > state.lastBatchTriggerInserts) {
    console.log('\n[nuforc-mass-ingest] Triggering final batch worker drain...');
    triggerBatchWorker(state.totals.inserted);
  }
}

// V11.17.39 (#76 fix) — explicit clean exit. Supabase JS client holds
// keep-alive sockets + realtime channel open after main() returns,
// hanging the process indefinitely. Force exit once all real work
// (DB writes, state save, detached batch worker spawn) is done.
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[nuforc-mass-ingest] Fatal:', err);
    process.exit(1);
  });
