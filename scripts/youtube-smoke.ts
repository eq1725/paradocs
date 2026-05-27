#!/usr/bin/env tsx
/**
 * Path C YouTube smoke test (V11.17.28)
 *
 * Validates the YouTube adapter end-to-end against the deployed
 * Paradocs pipeline. Uses a tiny target (5-10 reports), single
 * channel by default, direct-to-DB insert. Same processing logic
 * as scripts/nuforc-mass-ingest.ts so we exercise the full pipeline.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/youtube-smoke.ts                          # 5 reports, MrBallen
 *   tsx scripts/youtube-smoke.ts --limit 10 --channels 2  # 10 reports, 2 channels
 *   tsx scripts/youtube-smoke.ts --include-search         # also use search queries
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { youtubeAdapter } from '../src/lib/ingestion/adapters/youtube';
import { isObviouslyLowQuality, assessQuality, getStatusFromScore, smartReEvaluate } from '../src/lib/ingestion/filters/quality-filter';
import { redactReportPii } from '../src/lib/ingestion/utils/redact-pii';
import { enrichReport } from '../src/lib/ingestion/enrichment/report-enricher';
import { normalizeLocation, geocodeWithFallback, makeSupabaseGeocodeCache } from '../src/lib/ingestion/utils/normalize-location';

const args = (() => {
  const a = process.argv.slice(2);
  function flag(name: string, def: string | null = null): string | null {
    const i = a.indexOf(name); return i < 0 ? def : a[i + 1];
  }
  return {
    limit: parseInt(flag('--limit', '5') || '5'),
    channelCount: parseInt(flag('--channels', '1') || '1'),
    includeSearch: a.indexOf('--include-search') >= 0,
  };
})();

// Subset of DEFAULT_CHANNELS for smoke (we only want 1-2 channels)
const SMOKE_CHANNELS = [
  { id: 'UCYUKGBpn93pX2dBF0EmeLPg', name: 'MrBallen', category: null },
  { id: 'UCnM5iMGiKsZg-iOlIO2ZkdQ', name: 'Bedtime Stories', category: null },
].slice(0, args.channelCount);

function generateSlug(title: string, originalId: string | null, sourceType: string): string {
  const titlePart = (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 60);
  const uniqueKey = sourceType + '-' + (originalId || Math.random().toString(36).substring(2, 8));
  let hash = 0;
  for (let i = 0; i < uniqueKey.length; i++) { hash = (hash << 5) - hash + uniqueKey.charCodeAt(i); hash = hash & hash; }
  const suffix = Math.abs(hash).toString(36).substring(0, 6);
  return titlePart + '-' + suffix;
}

async function main() {
  console.log('YouTube Smoke V11.17.28 — limit=' + args.limit + ' channels=' + SMOKE_CHANNELS.map(c => c.name).join(',') + ' includeSearch=' + args.includeSearch);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  console.log('\n[1/3] Scraping YouTube...');
  const scrapeResult = await youtubeAdapter.scrape({
    channels: SMOKE_CHANNELS,
    includeSearch: args.includeSearch,
    rateLimitMs: 750,
    includeComments: true,
    maxCommentsPerVideo: 30,
  }, args.limit);

  // Note: youtube adapter sets success=false when reports.length===0 even
  // if nothing actually errored, so treat "0 reports" as a non-fatal warning.
  if (scrapeResult.reports.length === 0) {
    console.warn('No reports scraped (channels returned no videos, quota exhausted, or search empty). Adapter error: ' + (scrapeResult.error || 'none'));
    console.warn('Try --include-search to use the 20 default search queries.');
    process.exit(0);
  }
  if (!scrapeResult.success) console.warn('Adapter reported partial success: ' + scrapeResult.error);
  console.log('Scraped ' + scrapeResult.reports.length + ' reports.');
  if ((scrapeResult as any).errors?.length) {
    console.warn('Adapter warnings: ' + JSON.stringify((scrapeResult as any).errors));
  }

  console.log('\n[2/3] Processing through pipeline (PII → filter → enrich → normalize)...');
  const stats = { scraped: scrapeResult.reports.length, inserted: 0, duplicates: 0, filtered: 0, errors: 0, rejectionReasons: {} as Record<string, number> };

  // Dedup pre-check
  const reportIds = scrapeResult.reports.map(r => r.original_report_id).filter(Boolean) as string[];
  const dedupSet = new Set<string>();
  if (reportIds.length > 0) {
    const { data } = await supabase.from('reports').select('original_report_id').eq('source_type', 'youtube').in('original_report_id', reportIds);
    (data || []).forEach((r: any) => dedupSet.add(r.original_report_id));
  }

  const toInsert: Record<string, any>[] = [];
  for (const report of scrapeResult.reports) {
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
        }),
      });
    } catch (e: any) {
      stats.errors++; console.warn('[smoke] per-report error: ' + (e?.message || e));
    }
  }

  console.log('\n[3/3] Inserting ' + toInsert.length + ' surviving reports...');
  if (toInsert.length > 0) {
    const { data, error } = await supabase.from('reports').insert(toInsert).select('id, slug, title, source_label, source_url');
    if (error) {
      console.error('Insert error: ' + error.message); stats.errors++;
    } else {
      stats.inserted = data?.length || 0;
      console.log('\nInserted reports:');
      for (const r of data || []) console.log('  ' + r.slug + '  |  ' + (r.title || '').substring(0, 60));
    }
  }

  console.log('\n========== SMOKE RESULTS ==========');
  console.log('Scraped:     ' + stats.scraped);
  console.log('Duplicates:  ' + stats.duplicates);
  console.log('Filtered:    ' + stats.filtered);
  console.log('Errors:      ' + stats.errors);
  console.log('Inserted:    ' + stats.inserted);
  if (Object.keys(stats.rejectionReasons).length > 0) {
    console.log('\nTop rejection reasons:');
    for (const [r, n] of Object.entries(stats.rejectionReasons).sort((a,b) => b[1] - a[1])) console.log('  ' + n + 'x ' + r);
  }
  console.log('\nIf inserted > 0, visit /admin or /report/<slug> on the live site to inspect.');
  console.log('Next step (after eyeball): build scripts/youtube-mass-ingest.ts orchestrator forked from nuforc-mass-ingest.ts pattern.');
}
main().catch(e => { console.error('Fatal: ' + (e?.stack || e?.message || e)); process.exit(1); });
