#!/usr/bin/env tsx
/**
 * BFRO Mass Ingestion Runner (V11.33)
 *
 * Fork of scripts/nderf-mass-ingest.ts adapted for BFRO (bfro.net) — the
 * Bigfoot Field Researchers Organization sighting database.
 *
 * KEY DIFFERENCES vs the NDERF orchestrator:
 *   - Shards by US state / Canadian province (BFRO organizes reports by
 *     state_listing.asp?state=XX), not by archive URL. ~63 shards.
 *   - No credibility written — credibility was deprecated site-wide
 *     (V11.32+). The adapter no longer emits it; this driver never sets it.
 *   - The adapter sets metadata.experienceTypeSlug='bigfoot' on every row,
 *     so the deterministic encyclopedia linker tags the canonical
 *     phenomenon (phenomenon_types.slug='bigfoot', category 'cryptids')
 *     without leaning on the AI classifier — same pattern as NDERF.
 *   - Geolocation: BFRO supplies real GPS only when the report page has it
 *     (exact precision). Otherwise lat/lng are left undefined and the
 *     engine's enrichReport + normalizeLocation ladder geocode from
 *     city/county/state/country — inheriting all the V11.29–V11.32 geo
 *     hardening (country-at-source, prepositional handling, wrong-state
 *     bbox guard, centroid fallbacks).
 *   - Politeness: default concurrency=1, ~1 req/sec. BFRO is a single
 *     volunteer-run site; do not hammer it.
 *
 * ── Usage ───────────────────────────────────────────────────────────
 *
 *   set -a; source .env.local; set +a
 *
 *   # Dry run — list shards only
 *   npx tsx scripts/bfro-mass-ingest.ts --dry-run
 *
 *   # Small daytime validation batch (a few states, capped)
 *   npx tsx scripts/bfro-mass-ingest.ts --states wa,or --max-per-shard 25 --target 40 --cost-cap 10
 *
 *   # Full corpus, polite single-worker, $300 cap
 *   npx tsx scripts/bfro-mass-ingest.ts --target 20000 --rate-limit-ms 1000 --cost-cap 300
 *
 *   # Resume an interrupted run
 *   npx tsx scripts/bfro-mass-ingest.ts --resume
 *
 * State persisted to outputs/bfro-mass-ingest-state.json. Resume-safe.
 *
 * ── Stop conditions ─────────────────────────────────────────────────
 *  - Global target reached (--target inserts)
 *  - Cost cap hit (--cost-cap USD)
 *  - All shards exhausted
 *  - Ctrl+C (graceful: writes state, finishes in-flight)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { bfroAdapter } from '../src/lib/ingestion/adapters/bfro';
import { extractAndGeocodeLocation } from '../src/lib/services/location-extraction.service';
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

const BFRO_SOURCE_TYPE = 'bfro';
const STATE_FILE = path.resolve(process.cwd(), 'outputs/bfro-mass-ingest-state.json');
const HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_BATCH_TRIGGER = 500;
const DEFAULT_COST_CAP_USD = 300;
const DEFAULT_RATE_LIMIT_MS = 1000;
const DEFAULT_MAX_PER_SHARD = 5000;

// BFRO shard set: US states + Canadian provinces (the keys BFRO's
// state_listing.asp?state=XX accepts). High-activity states first so a
// capped validation run hits the richest data.
const ALL_STATE_CODES = [
  'wa', 'or', 'ca', 'oh', 'fl', 'tx', 'pa', 'ny', 'mi', 'il',
  'wv', 'ga', 'nc', 'tn', 'ky', 'in', 'mo', 'co', 'wi', 'mn',
  'va', 'az', 'ok', 'ar', 'al', 'sc', 'ms', 'la', 'ks', 'ia',
  'id', 'mt', 'nm', 'nv', 'ut', 'me', 'nh', 'vt', 'ma', 'ct',
  'nj', 'md', 'ne', 'sd', 'nd', 'wy', 'ri', 'de', 'hi', 'ak',
  // Canadian provinces
  'ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'on', 'qc', 'sk', 'yt', 'nt',
];

interface CliArgs {
  target: number;
  concurrency: number;
  states: string[];
  statesExplicit: boolean;
  dryRun: boolean;
  resume: boolean;
  costCapUsd: number;
  batchTrigger: number;
  rateLimitMs: number;
  maxPerShard: number;
  noBatchTrigger: boolean;
  strictMode: boolean;
  strictMinDescLen: number;
  strictMinScore: number;
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
  const statesArg = flag('--states', null);
  return {
    target: parseInt(flag('--target', '20000') || '20000'),
    concurrency: parseInt(flag('--concurrency', String(DEFAULT_CONCURRENCY)) || String(DEFAULT_CONCURRENCY)),
    states: statesArg ? statesArg.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : ALL_STATE_CODES.slice(),
    statesExplicit: !!statesArg,
    dryRun: bool('--dry-run'),
    resume: bool('--resume'),
    costCapUsd: parseFloat(flag('--cost-cap', String(DEFAULT_COST_CAP_USD)) || String(DEFAULT_COST_CAP_USD)),
    batchTrigger: parseInt(flag('--batch-trigger', String(DEFAULT_BATCH_TRIGGER)) || String(DEFAULT_BATCH_TRIGGER)),
    rateLimitMs: parseInt(flag('--rate-limit-ms', String(DEFAULT_RATE_LIMIT_MS)) || String(DEFAULT_RATE_LIMIT_MS)),
    maxPerShard: parseInt(flag('--max-per-shard', String(DEFAULT_MAX_PER_SHARD)) || String(DEFAULT_MAX_PER_SHARD)),
    noBatchTrigger: bool('--no-batch-trigger'),
    strictMode: bool('--strict-mode'),
    strictMinDescLen: parseInt(flag('--strict-min-desc-len', '300') || '300'),
    strictMinScore: parseInt(flag('--strict-min-score', '65') || '65'),
  };
}

// ─────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────

interface ShardState {
  stateCode: string;
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

function loadState(): MassIngestState | null {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    console.error('[bfro-mass-ingest] Could not parse state file, ignoring:', (e as any)?.message);
    return null;
  }
}

function saveState(state: MassIngestState): void {
  state.lastUpdatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─────────────────────────────────────────────────────────────────────
// DETERMINISTIC PHENOMENON LINKER (same pattern as NDERF orchestrator)
// ─────────────────────────────────────────────────────────────────────

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
  stateCode: string,
  args: CliArgs,
): Promise<ProcessResult> {
  const result: ProcessResult = { scraped: 0, inserted: 0, duplicates: 0, filtered: 0, errors: 0, rejectionReasons: {} };

  // 1. Scrape this state's sightings via the adapter.
  const scrapeResult = await bfroAdapter.scrape({
    states: [stateCode],
    rate_limit_ms: args.rateLimitMs,
  }, args.maxPerShard);

  if (!scrapeResult.success) {
    result.errors++;
    result.rejectionReasons['scrape_failed'] = (result.rejectionReasons['scrape_failed'] || 0) + 1;
    return result;
  }

  const reports = scrapeResult.reports;
  result.scraped = reports.length;
  if (reports.length === 0) return result;

  // 2. Pre-fetch dedup set (by original_report_id within this source).
  const reportIds = reports.map(r => r.original_report_id).filter(Boolean) as string[];
  const dedupSet = new Set<string>();
  if (reportIds.length > 0) {
    for (let i = 0; i < reportIds.length; i += 500) {
      const chunk = reportIds.slice(i, i + 500);
      const { data } = await supabase
        .from('reports')
        .select('original_report_id')
        .eq('source_type', BFRO_SOURCE_TYPE)
        .in('original_report_id', chunk);
      (data || []).forEach((r: any) => dedupSet.add(r.original_report_id));
    }
  }

  // 3. Per-report processing.
  const toInsert: Record<string, any>[] = [];
  for (const report of reports) {
    try {
      if (report.original_report_id && dedupSet.has(report.original_report_id)) {
        result.duplicates++;
        continue;
      }

      redactReportPii(report);

      if (isObviouslyLowQuality(report.title, report.description)) {
        result.filtered++;
        result.rejectionReasons['obviously_low_quality'] = (result.rejectionReasons['obviously_low_quality'] || 0) + 1;
        continue;
      }

      // Enrich (extract dates/locations from text + geocode via the
      // hardened ladder). Non-fatal on failure.
      try { await enrichReport(report); } catch { /* non-fatal */ }

      const qualityResult = assessQuality(report, report.metadata);
      if (!qualityResult.passed) {
        result.filtered++;
        const reason = (qualityResult.reason || 'unknown').substring(0, 40);
        result.rejectionReasons[reason] = (result.rejectionReasons[reason] || 0) + 1;
        continue;
      }

      const qualityScore = qualityResult.qualityScore!;
      let initialStatus = getStatusFromScore(qualityScore.total, report.source_type);

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

      if (initialStatus === 'rejected') {
        result.filtered++;
        result.rejectionReasons['score_rejected'] = (result.rejectionReasons['score_rejected'] || 0) + 1;
        continue;
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
        } else {
          result.filtered++;
          result.rejectionReasons['score_borderline_no_signals'] = (result.rejectionReasons['score_borderline_no_signals'] || 0) + 1;
          continue;
        }
      }

      // Location: drop a bare location_name with no structured geo so the
      // ladder doesn't geocode a non-place.
      let locName: string | null = report.location_name || null;
      const hasStructuredGeo = !!(report.city || report.state_province || report.country ||
        (typeof report.latitude === 'number' && typeof report.longitude === 'number'));
      if (locName && !hasStructuredGeo) {
        locName = null;
        report.location_name = null as any;
      }

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

      // NOTE: no `credibility` field — deprecated site-wide (V11.32+).
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
        source_type: report.source_type,
        original_report_id: report.original_report_id,
        status: 'pending_review',
        tags: report.tags || [],
        source_label: report.source_label || 'BFRO Database',
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
      if (report.has_official_report) insertData.has_official_report = true;

      // Location safety net — if still no location_name, try AI extraction.
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

      toInsert.push(insertData);
    } catch (perReportErr: any) {
      result.errors++;
      console.warn('[bfro-mass-ingest] per-report error: ' + (perReportErr?.message || perReportErr));
    }
  }

  // 4. Bulk insert in chunks of 100; request id+metadata back so we can
  //    deterministically link each row to the canonical 'bigfoot' phenomenon.
  for (let batchStart = 0; batchStart < toInsert.length; batchStart += 100) {
    const chunk = toInsert.slice(batchStart, batchStart + 100);
    const ins = await supabase.from('reports').insert(chunk).select('id, metadata');
    if (ins.error) {
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
  try {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('paradocs_narrative_cost_log')
      .select('cost_usd')
      .gte('created_at', since.toISOString());
    return (data || []).reduce((sum: number, r: any) => sum + (parseFloat(r.cost_usd) || 0), 0);
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────
// BATCH WORKER TRIGGER
// ─────────────────────────────────────────────────────────────────────

let lastBatchSpawnAt = 0;
function triggerBatchWorker(insertCount: number): void {
  const now = Date.now();
  if (now - lastBatchSpawnAt < 60_000) return;
  lastBatchSpawnAt = now;
  console.log('[bfro-mass-ingest] Triggering batch worker (cumulative inserts: ' + insertCount + ')');
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
    const line =
      '[+' + formatDuration(elapsed) + '] ' +
      'shards ' + completed + '/' + totalShards + ' | ' +
      'scraped ' + state.totals.scraped + ' | ' +
      'inserted ' + inserted + ' | ' +
      'dup ' + state.totals.duplicates + ' | ' +
      'filt ' + state.totals.filtered + ' | ' +
      'err ' + state.totals.errors + ' | ' +
      'cost $' + state.totals.costUsd.toFixed(2) + ' | ' +
      'rate ' + ratePerMin + '/min';
    console.log(line);
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
  const pendingShards = state.shards.filter(s => s.status === 'pending' || s.status === 'in_progress');
  if (pendingShards.length === 0) {
    console.log('[bfro-mass-ingest] No pending shards. Run complete.');
    return;
  }

  let queueIdx = 0;
  let costCheckTimer = 0;

  async function worker(workerId: number): Promise<void> {
    while (!controller.abort) {
      let shard: ShardState | null = null;
      while (queueIdx < pendingShards.length) {
        const cand = pendingShards[queueIdx++];
        if (cand.status === 'pending' || cand.status === 'in_progress') {
          shard = cand;
          break;
        }
      }
      if (!shard) break;

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
      console.log('[bfro-mass-ingest] Worker ' + workerId + ' starting state: ' + shard.stateCode.toUpperCase());
      const tStart = Date.now();
      try {
        const r = await processShard(supabase, shard.stateCode, args);
        shard.scraped = r.scraped;
        shard.inserted = r.inserted;
        shard.duplicates = r.duplicates;
        shard.filtered = r.filtered;
        shard.errors = r.errors;
        shard.ms = Date.now() - tStart;
        shard.status = 'completed';
        console.log('[bfro-mass-ingest] Worker ' + workerId + ' completed ' + shard.stateCode.toUpperCase() + ' in ' + formatDuration(shard.ms) + ' — scraped=' + r.scraped + ' inserted=' + r.inserted + ' dup=' + r.duplicates + ' filtered=' + r.filtered);

        state.totals.scraped += r.scraped;
        state.totals.inserted += r.inserted;
        state.totals.duplicates += r.duplicates;
        state.totals.filtered += r.filtered;
        state.totals.errors += r.errors;
        for (const [k, v] of Object.entries(r.rejectionReasons)) {
          state.totals.rejectionReasons[k] = (state.totals.rejectionReasons[k] || 0) + v;
        }

        saveState(state);

        if (!args.noBatchTrigger && (state.totals.inserted - state.lastBatchTriggerInserts) >= args.batchTrigger) {
          triggerBatchWorker(state.totals.inserted);
          state.lastBatchTriggerInserts = state.totals.inserted;
        }

        costCheckTimer++;
        if (costCheckTimer % 5 === 0) {
          const todaysCost = await pollTodaysCost(supabase);
          state.totals.costUsd = todaysCost;
        }
      } catch (err: any) {
        shard.status = 'failed';
        shard.error = err?.message || String(err);
        shard.ms = Date.now() - tStart;
        state.totals.errors++;
        saveState(state);
        console.error('[bfro-mass-ingest] Worker ' + workerId + ' shard ' + shard.stateCode + ' FAILED: ' + shard.error);
      }
    }
  }

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
  console.log('BFRO Mass Ingest — V11.33');
  console.log('Args: ' + JSON.stringify(args));

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[bfro-mass-ingest] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source .env.local first.');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[bfro-mass-ingest] WARNING: ANTHROPIC_API_KEY missing. Batch worker will fail when triggered.');
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let state: MassIngestState;
  if (args.resume) {
    const loaded = loadState();
    if (!loaded) {
      console.error('[bfro-mass-ingest] --resume requested but no state file at ' + STATE_FILE);
      process.exit(1);
    }
    state = loaded;
    state.args = args;
    const completedCount = state.shards.filter(s => s.status === 'completed').length;
    const failedCount = state.shards.filter(s => s.status === 'failed').length;
    console.log('[bfro-mass-ingest] Resuming: ' + completedCount + ' completed, ' + failedCount + ' failed, ' + state.totals.inserted + ' inserted so far');
    state.shards.forEach(s => { if (s.status === 'in_progress') s.status = 'pending'; });
  } else {
    state = emptyState(args);
    const stateCodes = args.states;
    state.shards = stateCodes.map(stateCode => ({
      stateCode, status: 'pending', scraped: 0, inserted: 0, duplicates: 0, filtered: 0, errors: 0, ms: 0,
    }));
    console.log('[bfro-mass-ingest] Enumerated ' + state.shards.length + ' state-shards');
    console.log('  ' + state.shards.map(s => s.stateCode.toUpperCase()).join(', '));
  }

  if (args.dryRun) {
    console.log('[bfro-mass-ingest] --dry-run; exiting');
    return;
  }

  state.totals.costUsd = await pollTodaysCost(supabase);
  console.log('[bfro-mass-ingest] Starting today\'s cost: $' + state.totals.costUsd.toFixed(2) + ' (cap: $' + args.costCapUsd.toFixed(2) + ')');

  const runStartMs = Date.now();
  const controller: RunController = { abort: false, reason: '' };

  let sigintCount = 0;
  process.on('SIGINT', () => {
    sigintCount++;
    if (sigintCount === 1) {
      console.log('\n[bfro-mass-ingest] Caught SIGINT, finishing in-flight shards and saving state. Press Ctrl+C again to force-exit.');
      controller.abort = true;
      controller.reason = 'SIGINT';
    } else {
      console.log('[bfro-mass-ingest] Force exit on second SIGINT.');
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

  console.log('\n=== BFRO Mass Ingest Complete ===');
  console.log('Stop reason: ' + (controller.reason || 'all shards processed'));
  console.log('Elapsed: ' + formatDuration(Date.now() - runStartMs));
  console.log('Total shards: ' + state.shards.length);
  console.log('  completed: ' + state.shards.filter(s => s.status === 'completed').length);
  console.log('  failed: ' + state.shards.filter(s => s.status === 'failed').length);
  console.log('  pending: ' + state.shards.filter(s => s.status === 'pending').length);
  console.log('Totals: scraped=' + state.totals.scraped + ' inserted=' + state.totals.inserted + ' dup=' + state.totals.duplicates + ' filtered=' + state.totals.filtered + ' errors=' + state.totals.errors);
  console.log('Cost: $' + state.totals.costUsd.toFixed(2));
  console.log('State persisted to: ' + STATE_FILE);

  const topReasons = Object.entries(state.totals.rejectionReasons).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topReasons.length > 0) {
    console.log('\nTop rejection reasons:');
    topReasons.forEach(([reason, count]) => console.log('  ' + count + 'x ' + reason));
  }

  if (!args.noBatchTrigger && state.totals.inserted > state.lastBatchTriggerInserts) {
    console.log('\n[bfro-mass-ingest] Triggering final batch worker drain...');
    triggerBatchWorker(state.totals.inserted);
  }
}

main().catch(err => {
  console.error('[bfro-mass-ingest] Fatal:', err);
  process.exit(1);
});
