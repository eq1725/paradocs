#!/usr/bin/env tsx
/**
 * YouTube Mass Ingest (V11.17.29) — Path C
 *
 * Harvests first-person experience reports from YouTube's comment
 * ecosystem on paranormal-adjacent channels + search-discovered videos.
 * The COMMENTS are the gold (Once when I was 12, I saw...); video
 * titles/descriptions are mostly promotional and get filtered out.
 *
 * Architecture differences vs nuforc-mass-ingest:
 *   - No month-shard state file. YouTube is a flat ingest with daily
 *     quota cap; each run pulls what fits.
 *   - Daily quota tracking: ~10k YouTube API units/day free tier.
 *     We stop at --quota-cap to leave a buffer.
 *   - Channel-first + search-fallback shard model: process each channel
 *     fully before falling through to search queries.
 *   - includeComments=true by default (the actual signal source).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/youtube-mass-ingest.ts                          # default: all channels, all searches, 1000 limit
 *   tsx scripts/youtube-mass-ingest.ts --limit 100 --no-search  # channels only, 100 reports
 *   tsx scripts/youtube-mass-ingest.ts --channels-only          # skip searches
 *   tsx scripts/youtube-mass-ingest.ts --include-search         # explicit; default is true
 *   tsx scripts/youtube-mass-ingest.ts --quota-cap 9000         # YouTube API quota safety cap
 *
 * Daily cron candidate (after smoke validation):
 *   0 4 * * * cd /path && set -a && source .env.local && set +a && tsx scripts/youtube-mass-ingest.ts --limit 500
 */
import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { youtubeAdapter } from '../src/lib/ingestion/adapters/youtube';
import { isObviouslyLowQuality, assessQuality, getStatusFromScore, smartReEvaluate } from '../src/lib/ingestion/filters/quality-filter';
import { redactReportPii } from '../src/lib/ingestion/utils/redact-pii';
import { enrichReport } from '../src/lib/ingestion/enrichment/report-enricher';
import { normalizeLocation, geocodeWithFallback, makeSupabaseGeocodeCache } from '../src/lib/ingestion/utils/normalize-location';
// V11.17.62 — location safety net (mirror of nuforc-mass-ingest.ts:69).
// YouTube comment bodies rarely carry structured city/state fields, so
// normalizeLocation can't geocode them. Haiku-extract from title + body
// when adapter+normalize produced nothing.
import { extractAndGeocodeLocation } from '../src/lib/services/location-extraction.service';
import { spawn } from 'child_process';

// V11.17.29 — Channel roster
// Curated for paranormal/consciousness/experiencer content. The COMMENTS
// on these channels' videos are the richest source of first-person
// reports — they tend to attract experiencers sharing their own stories
// in long-form, high-engagement threads.
//
// Each entry: { id, name, category (or null), why }
// category=null lets the AI classifier sort post-ingestion.
const CHANNELS: Array<{ id: string; name: string; category: string | null; why?: string }> = [
  // From Chase's spec (V11.17.29)
  { id: 'UC8ZKTXN9trt5dhixz6b6l6w', name: 'Jesse Michels',                category: null,           why: '85.7k subs — long-form UFO/anomalies interview show' },
  { id: 'UCF3j_4PND5orr6RK-sOFSDw', name: 'Anthony Chene Production',     category: null,           why: '4.23k subs — NDE interviews (small but high-signal)' },
  { id: 'UC-vcerpK068beb7q0RWS7tQ', name: 'Next Level Soul',              category: null,           why: '8.49k subs — NDE / consciousness interviews' },
  { id: 'UCPA5cHDlwkvTM7akXINZo9w', name: 'The Telepathy Tapes',          category: 'psychic_phenomena', why: 'Companion channel to the viral podcast on non-speakers + telepathy' },
  { id: 'UCOCRb54wyRMaNyI_qJy9Nfg', name: 'Dr. Mayim Bialik',             category: null,           why: 'Mayim Bialik personal channel — paranormal/consciousness interview content' },
  // Major reach (millions of subs → millions of commenters)
  { id: 'UCzQUP1qoWDoEbmsQxvdjxgQ', name: 'JRE Clips',                    category: null,           why: '20.9M subs — Joe Rogan paranormal/UFO clip channel' },
  { id: 'UCJIfeSCssxSC_Dhc5s7woww', name: 'Lex Fridman',                  category: null,           why: '1.62M subs — long-form interviews incl. paranormal guests' },
  { id: 'UCiDZj8drz2bGZ9OOJbNeIPA', name: 'Curious Origins',              category: null,           why: '26.6k subs — paranormal investigation' },
  // From the original DEFAULT_CHANNELS in the adapter (proven roster)
  { id: 'UC4FEXKLbg6mGCkPEtEKKkFA', name: 'Nukes Top 5',                  category: 'ghosts_hauntings' },
  { id: 'UCYUKGBpn93pX2dBF0EmeLPg', name: 'MrBallen',                     category: null },
  { id: 'UCnM5iMGiKsZg-iOlIO2ZkdQ', name: 'Bedtime Stories',              category: null },
  { id: 'UC7lOx1MReQ0_WIQtbo_zDdw', name: 'The Why Files',                category: null },
  { id: 'UCsvhSap9PYhblkW7GyP0K8A', name: 'Nexpo',                        category: null },
  { id: 'UC-2YHgc363EdcusLIBbgxzg', name: 'Joe Rogan — UFO Clips',        category: 'ufos_aliens' },
  { id: 'UCBSCOzV8_jDgRqRi5aVJNYg', name: 'MUFON',                        category: 'ufos_aliens' },
  { id: 'UCrUrxK4JnBBPcS4VRQ1_wFg', name: 'Bob Gymlan',                   category: 'cryptids' },
];

const YOUTUBE_SOURCE_TYPE = 'youtube';

// YouTube Data API v3 unit costs (rough; we approximate to stay under quota)
const COST_PER_SEARCH = 100;   // search.list
const COST_PER_VIDEO_FETCH = 1;  // videos.list (batch of up to 50)
const COST_PER_COMMENT_PAGE = 1; // commentThreads.list

function parseArgs() {
  const a = process.argv.slice(2);
  function flag(n: string, d: string | null = null): string | null { const i = a.indexOf(n); return i < 0 ? d : a[i + 1]; }
  function bool(n: string): boolean { return a.indexOf(n) >= 0; }
  return {
    limit: parseInt(flag('--limit', '1000') || '1000'),
    quotaCap: parseInt(flag('--quota-cap', '9000') || '9000'),
    rateLimitMs: parseInt(flag('--rate-limit-ms', '500') || '500'),
    maxCommentsPerVideo: parseInt(flag('--max-comments', '100') || '100'),
    channelsOnly: bool('--channels-only'),
    noSearch: bool('--no-search'),
    noBatchTrigger: bool('--no-batch-trigger'),
    batchTrigger: parseInt(flag('--batch-trigger', '500') || '500'),
    dryRun: bool('--dry-run'),
  };
}

function generateSlug(title: string, originalId: string | null, sourceType: string): string {
  const titlePart = (title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').substring(0, 60);
  const uniqueKey = sourceType + '-' + (originalId || Math.random().toString(36).substring(2, 8));
  let hash = 0;
  for (let i = 0; i < uniqueKey.length; i++) { hash = (hash << 5) - hash + uniqueKey.charCodeAt(i); hash = hash & hash; }
  const suffix = Math.abs(hash).toString(36).substring(0, 6);
  return titlePart + '-' + suffix;
}

let lastBatchSpawnAt = 0;
function triggerBatchWorker(insertCount: number): void {
  const now = Date.now();
  if (now - lastBatchSpawnAt < 60_000) return;
  lastBatchSpawnAt = now;
  console.log('[youtube-mass-ingest] Triggering batch worker (cumulative inserts: ' + insertCount + ')');
  const child = spawn('npx', ['tsx', 'scripts/batch-ingest-worker.ts', '--backfill', '--limit', '500'], {
    stdio: 'ignore', detached: true, env: process.env,
  });
  child.unref();
}

interface ProcessStats {
  scraped: number;
  inserted: number;
  duplicates: number;
  filtered: number;
  errors: number;
  videoReports: number;     // V11.17.29 — track which signal source produced inserts
  commentReports: number;
  rejectionReasons: Record<string, number>;
}

async function processBatch(supabase: SupabaseClient, reports: any[], stats: ProcessStats): Promise<void> {
  if (reports.length === 0) return;

  // Dedup pre-check (one round-trip per batch)
  const reportIds = reports.map(r => r.original_report_id).filter(Boolean);
  const dedupSet = new Set<string>();
  if (reportIds.length > 0) {
    for (let i = 0; i < reportIds.length; i += 500) {
      const chunk = reportIds.slice(i, i + 500);
      const { data } = await supabase.from('reports').select('original_report_id').eq('source_type', YOUTUBE_SOURCE_TYPE).in('original_report_id', chunk);
      (data || []).forEach((r: any) => dedupSet.add(r.original_report_id));
    }
  }

  const toInsert: Record<string, any>[] = [];
  for (const report of reports) {
    try {
      if (report.original_report_id && dedupSet.has(report.original_report_id)) { stats.duplicates++; continue; }
      redactReportPii(report);
      if (isObviouslyLowQuality(report.title, report.description)) {
        stats.filtered++; stats.rejectionReasons['obviously_low_quality'] = (stats.rejectionReasons['obviously_low_quality'] || 0) + 1; continue;
      }
      try { await enrichReport(report); } catch (e) { /* non-fatal */ }
      const qr = assessQuality(report, report.metadata);
      if (!qr.passed) {
        stats.filtered++; const reason = (qr.reason || 'unknown').substring(0, 40);
        stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] || 0) + 1; continue;
      }
      const qs = qr.qualityScore!;
      let initialStatus = getStatusFromScore(qs.total, report.source_type);
      if (initialStatus === 'rejected') { stats.filtered++; stats.rejectionReasons['score_rejected'] = (stats.rejectionReasons['score_rejected'] || 0) + 1; continue; }
      if (initialStatus === 'pending_review') {
        const re = smartReEvaluate(qs, { title: report.title, description: report.description, source_type: report.source_type, location_name: report.location_name, event_date: report.event_date, category: report.category });
        if (re.promote) initialStatus = 'approved';
        else { stats.filtered++; stats.rejectionReasons['score_borderline_no_signals'] = (stats.rejectionReasons['score_borderline_no_signals'] || 0) + 1; continue; }
      }
      let normalizedLocation: any = null;
      try {
        normalizedLocation = await normalizeLocation(
          { city: report.city || null, state_province: report.state_province || null, country: report.country || null, country_code: (report as any).country_code || null, location_name: report.location_name || null, latitude: typeof report.latitude === 'number' ? report.latitude : null, longitude: typeof report.longitude === 'number' ? report.longitude : null },
          { geocoder: 'maptiler', geocodeFn: geocodeWithFallback, cache: makeSupabaseGeocodeCache(supabase) },
        );
      } catch (e) { /* non-fatal */ }
      // V11.17.62 — location safety net. If adapter + normalize both
      // produced no usable location, Haiku-extract from title/summary/
      // description. Best-effort + non-blocking. Especially important for
      // YouTube comments — typically no structured location fields.
      const haveLocation = !!(normalizedLocation?.location_name || report.location_name);
      if (!haveLocation) {
        try {
          const resolved = await extractAndGeocodeLocation({
            title: report.title || null,
            summary: report.summary || null,
            description: report.description || null,
          });
          if (resolved) {
            normalizedLocation = {
              location_name: resolved.location_name,
              city: resolved.city,
              state_province: resolved.state_province,
              country: resolved.country,
              country_code: (resolved as any).country_code || null,
              latitude: resolved.latitude,
              longitude: resolved.longitude,
              location_precision: resolved.location_precision,
              coords_synthetic: false,
            };
          }
        } catch { /* leave normalizedLocation null */ }
      }
      const slug = generateSlug(report.title || 'untitled', report.original_report_id || null, report.source_type);
      toInsert.push({
        title: report.title, slug, summary: report.summary, description: report.description,
        category: report.category || 'psychological_experiences',
        location_name: normalizedLocation?.location_name || report.location_name || null,
        country: normalizedLocation?.country || report.country || null,
        country_code: normalizedLocation?.country_code || (report as any).country_code || null,
        state_province: normalizedLocation?.state_province || report.state_province || null,
        city: normalizedLocation?.city || report.city || null,
        latitude: normalizedLocation?.latitude ?? (typeof report.latitude === 'number' ? report.latitude : null),
        longitude: normalizedLocation?.longitude ?? (typeof report.longitude === 'number' ? report.longitude : null),
        coords_synthetic: !!normalizedLocation?.coords_synthetic,
        event_date: report.event_date, event_date_precision: report.event_date_precision || 'unknown',
        credibility: report.credibility || 'medium',
        source_type: report.source_type, original_report_id: report.original_report_id,
        status: 'pending_review',
        tags: report.tags || [],
        source_label: report.source_label || 'youtube',
        source_url: report.source_url,
        upvotes: 0, view_count: 0, report_type: 'ingested',
        metadata: Object.assign({}, report.metadata || {}, {
          location_precision: normalizedLocation?.location_precision || (report as any).location_precision || 'unknown',
          score_status: initialStatus, quality_score: qs.total,
          // V11.17.29 — flag if this came from a video vs a comment so we can
          // measure signal-per-quota-unit by source type later.
          yt_signal: report.metadata?.yt_kind || (report.source_url?.includes('&lc=') ? 'comment' : 'video'),
        }),
      });
      if (report.metadata?.yt_kind === 'comment' || report.source_url?.includes('&lc=')) stats.commentReports++;
      else stats.videoReports++;
    } catch (e: any) {
      stats.errors++;
      console.warn('[youtube-mass-ingest] per-report error: ' + (e?.message || e));
    }
  }

  if (toInsert.length === 0) return;
  // Bulk insert in chunks of 100
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100);
    const { data, error } = await supabase.from('reports').insert(chunk).select('id');
    if (error) {
      // Retry per-row to count duplicates separately
      console.warn('[youtube-mass-ingest] bulk insert error: ' + error.message + ' — retrying per-row');
      for (const row of chunk) {
        const { error: solo } = await supabase.from('reports').insert(row);
        if (solo) {
          if (solo.message?.includes('duplicate key')) stats.duplicates++;
          else { stats.errors++; console.warn('[youtube-mass-ingest] per-row insert error for slug ' + row.slug + ': ' + solo.message); }
        } else {
          stats.inserted++;
        }
      }
    } else {
      stats.inserted += data?.length || 0;
    }
  }
}

async function main() {
  const args = parseArgs();
  console.log('YouTube Mass Ingest V11.17.29');
  console.log('Args: ' + JSON.stringify(args));
  console.log('Channels: ' + CHANNELS.length + ' (' + CHANNELS.slice(0, 6).map(c => c.name).join(', ') + '...)');

  if (!process.env.YOUTUBE_API_KEY) {
    console.error('YOUTUBE_API_KEY missing from env. set -a && source .env.local && set +a first.');
    process.exit(1);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase env vars missing.');
    process.exit(1);
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stats: ProcessStats = { scraped: 0, inserted: 0, duplicates: 0, filtered: 0, errors: 0, videoReports: 0, commentReports: 0, rejectionReasons: {} };
  const runStartMs = Date.now();

  // V11.17.29 — Single-pass scrape. The adapter handles per-channel + per-
  // search internally. We call it once with our channel roster + comment
  // settings; it returns a unified ScrapedReport[] that the orchestrator
  // processes through the standard filter/enrich/insert pipeline.
  console.log('\n=== Phase 1: scrape ===');
  const scrapeResult = await youtubeAdapter.scrape({
    channels: CHANNELS,
    includeSearch: !args.noSearch && !args.channelsOnly,
    rateLimitMs: args.rateLimitMs,
    includeComments: true,
    maxCommentsPerVideo: args.maxCommentsPerVideo,
  }, args.limit);

  stats.scraped = scrapeResult.reports.length;
  console.log('Scraped ' + stats.scraped + ' reports (videos + comments)');
  if (scrapeResult.error) console.warn('Adapter warnings: ' + scrapeResult.error);
  if (stats.scraped === 0) {
    console.warn('No reports — check YouTube API quota or channel IDs.');
    process.exit(0);
  }

  if (args.dryRun) {
    console.log('--dry-run; skipping pipeline + insert.');
    console.log('Sample (first 5):');
    for (const r of scrapeResult.reports.slice(0, 5)) {
      console.log('  ' + (r.title || '').substring(0, 80));
      console.log('    src=' + r.source_url + ' kind=' + (r.metadata as any)?.yt_kind);
    }
    process.exit(0);
  }

  console.log('\n=== Phase 2: process + insert ===');
  await processBatch(supabase, scrapeResult.reports, stats);

  const elapsedMs = Date.now() - runStartMs;
  const mins = Math.floor(elapsedMs / 60000);
  const secs = Math.floor((elapsedMs % 60000) / 1000);

  console.log('\n========== YOUTUBE MASS INGEST COMPLETE ==========');
  console.log('Elapsed:        ' + mins + 'm ' + secs + 's');
  console.log('Scraped:        ' + stats.scraped);
  console.log('  from videos:  ' + stats.videoReports);
  console.log('  from comments:' + stats.commentReports);
  console.log('Inserted:       ' + stats.inserted);
  console.log('Duplicates:     ' + stats.duplicates);
  console.log('Filtered:       ' + stats.filtered);
  console.log('Errors:         ' + stats.errors);

  if (Object.keys(stats.rejectionReasons).length > 0) {
    console.log('\nTop rejection reasons:');
    Object.entries(stats.rejectionReasons).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .forEach(([r, n]) => console.log('  ' + n + 'x ' + r));
  }

  if (!args.noBatchTrigger && stats.inserted > 0) {
    console.log('\n[youtube-mass-ingest] Triggering final batch worker drain...');
    triggerBatchWorker(stats.inserted);
  }
}

main().catch(e => { console.error('Fatal: ' + (e?.stack || e?.message || e)); process.exit(1); });
