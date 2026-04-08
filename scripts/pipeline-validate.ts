#!/usr/bin/env npx tsx
/**
 * Pipeline Validation Script
 *
 * Two modes:
 *   1. CLEANUP: Delete all non-editorial reports, keeping Roswell/Rendlesham + encyclopedia
 *   2. INGEST:  Run 5 reports through the full pipeline for a given adapter
 *
 * Usage:
 *   npx tsx scripts/pipeline-validate.ts cleanup
 *   npx tsx scripts/pipeline-validate.ts ingest nuforc
 *   npx tsx scripts/pipeline-validate.ts ingest bfro
 *   npx tsx scripts/pipeline-validate.ts ingest nderf
 *   npx tsx scripts/pipeline-validate.ts ingest reddit-v2
 *   npx tsx scripts/pipeline-validate.ts ingest all
 */

// Load env FIRST via require() — this executes synchronously before
// any static ES imports are resolved, which prevents src/lib/supabase.ts
// from blowing up when it reads process.env at module-load time.
require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

var REPORT_LIMIT = parseInt(process.argv[4] || '5', 10) || 5;
var SITE_URL = 'https://beta.discoverparadocs.com';
var VALID_ADAPTERS = ['nuforc', 'bfro', 'nderf', 'reddit-v2'];
var PROTECTED_SOURCE_TYPES = ['curated', 'editorial'];

// Default data_source configs — auto-provisioned if missing from DB
var DEFAULT_SOURCE_CONFIGS: Record<string, { name: string; slug: string; adapter_type: string; scrape_config: Record<string, any> }> = {
  'nuforc': {
    name: 'NUFORC Database',
    slug: 'nuforc',
    adapter_type: 'nuforc',
    scrape_config: { base_url: 'https://nuforc.org', rate_limit_ms: 500 }
  },
  'bfro': {
    name: 'BFRO Database',
    slug: 'bfro',
    adapter_type: 'bfro',
    scrape_config: { base_url: 'https://www.bfro.net', rate_limit_ms: 500, states: ['wa', 'or', 'ca', 'oh', 'fl'] }
  },
  'nderf': {
    name: 'NDERF Database',
    slug: 'nderf',
    adapter_type: 'nderf',
    scrape_config: { base_url: 'https://www.nderf.org', rate_limit_ms: 500 }
  },
  'reddit-v2': {
    name: 'Reddit Paranormal',
    slug: 'reddit-v2',
    adapter_type: 'reddit-v2',
    scrape_config: { subreddits: ['Paranormal', 'Ghosts', 'UFOs', 'Thetruthishere'], rate_limit_ms: 1000 }
  }
};

function getSupabase() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  return createClient(supabaseUrl, serviceKey);
}

// ============================================================================
// CLEANUP
// ============================================================================

async function runCleanup() {
  var supabase = getSupabase();

  console.log('\n=== CLEANUP — Removing non-editorial reports ===\n');

  // 1. Show what will be KEPT
  console.log('Protected reports (will be KEPT):');
  var { data: protectedReports } = await supabase
    .from('reports')
    .select('id, title, slug, source_type, status')
    .in('source_type', PROTECTED_SOURCE_TYPES);

  if (protectedReports && protectedReports.length > 0) {
    for (var pr of protectedReports) {
      console.log('  [' + pr.source_type + '] ' + pr.title.substring(0, 70));
    }
    console.log('  Total protected: ' + protectedReports.length + '\n');
  } else {
    console.log('  (none found)\n');
  }

  // 2. Count what will be deleted
  var { data: toDelete } = await supabase
    .from('reports')
    .select('id, title, source_type')
    .not('source_type', 'in', '(' + PROTECTED_SOURCE_TYPES.join(',') + ')');

  if (!toDelete || toDelete.length === 0) {
    console.log('No non-editorial reports to delete. Already clean.\n');
    return;
  }

  // Group by source_type
  var bySource: Record<string, number> = {};
  for (var td of toDelete) {
    var st = td.source_type || 'unknown';
    bySource[st] = (bySource[st] || 0) + 1;
  }
  console.log('Will delete ' + toDelete.length + ' reports:');
  for (var key of Object.keys(bySource)) {
    console.log('  ' + key + ': ' + bySource[key]);
  }

  var sample = toDelete.slice(0, 8);
  for (var s of sample) {
    console.log('    [' + s.source_type + '] ' + s.title.substring(0, 70));
  }
  if (toDelete.length > 8) {
    console.log('    ... and ' + (toDelete.length - 8) + ' more');
  }
  console.log('');

  // 3. Clean ingestion tracking tables
  console.log('Clearing ingestion_jobs and ingestion_logs...');
  await supabase.from('ingestion_jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('ingestion_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('  Done.\n');

  // 4. Delete reports in batches (FK cascades handle child rows)
  console.log('Deleting ' + toDelete.length + ' reports...');
  var deleteIds = toDelete.map(function(r: any) { return r.id; });
  var batchSize = 10;
  var totalDeleted = 0;

  for (var i = 0; i < deleteIds.length; i += batchSize) {
    var batch = deleteIds.slice(i, i + batchSize);
    var { error: batchErr } = await supabase
      .from('reports')
      .delete()
      .in('id', batch);

    if (batchErr) {
      console.error('  Batch delete error: ' + batchErr.message);
    } else {
      totalDeleted += batch.length;
      console.log('  Deleted ' + totalDeleted + '/' + deleteIds.length);
    }
  }

  // 5. Verify
  var { count: remainingCount } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true });

  var { count: phenomenaCount } = await supabase
    .from('phenomena')
    .select('*', { count: 'exact', head: true });

  console.log('\nCleanup complete!');
  console.log('  Reports remaining: ' + (remainingCount || 0));
  console.log('  Encyclopedia entries (untouched): ' + (phenomenaCount || 0));
  console.log('');
}

// ============================================================================
// INGEST
// ============================================================================

async function runIngest(adapterType: string) {
  var supabase = getSupabase();

  console.log('\n' + '='.repeat(60));
  console.log('  INGEST: ' + adapterType.toUpperCase() + ' (' + REPORT_LIMIT + ' reports)');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(60) + '\n');

  // Look up data source — auto-provision if missing
  var { data: source, error: srcErr } = await supabase
    .from('data_sources')
    .select('id, name, slug, adapter_type, is_active, scrape_config')
    .or('adapter_type.eq.' + adapterType + ',slug.eq.' + adapterType)
    .single();

  // Auto-create if not found
  if ((srcErr || !source) && DEFAULT_SOURCE_CONFIGS[adapterType]) {
    var cfg = DEFAULT_SOURCE_CONFIGS[adapterType];
    console.log('No data_source found for "' + adapterType + '" — auto-provisioning...');
    var { data: newSource, error: insertErr } = await supabase
      .from('data_sources')
      .insert({
        name: cfg.name,
        slug: cfg.slug,
        adapter_type: cfg.adapter_type,
        is_active: true,
        scrape_config: cfg.scrape_config
      })
      .select('id, name, slug, adapter_type, is_active, scrape_config')
      .single();

    if (insertErr || !newSource) {
      console.error('Failed to auto-provision data_source for "' + adapterType + '"');
      console.error('Error: ' + (insertErr?.message || 'insert failed'));
      return;
    }
    source = newSource;
    console.log('Auto-provisioned: ' + source.name + ' (ID: ' + source.id + ')');
  } else if (srcErr || !source) {
    console.error('No data_source found for "' + adapterType + '" and no default config available');
    console.error('Error: ' + (srcErr?.message || 'not found'));

    var { data: allSources } = await supabase
      .from('data_sources')
      .select('name, slug, adapter_type, is_active')
      .order('name');
    console.log('\nAvailable sources:');
    if (allSources) {
      for (var as2 of allSources) {
        console.log('  - ' + as2.name + ' (slug: ' + as2.slug + ', adapter: ' + as2.adapter_type + ', active: ' + as2.is_active + ')');
      }
    }
    return;
  }

  // Ensure source is active for this run
  if (!source.is_active) {
    console.log('Source "' + source.name + '" is inactive — activating for this test run...');
    await supabase.from('data_sources').update({ is_active: true }).eq('id', source.id);
    source.is_active = true;
  }

  console.log('Source: ' + source.name + ' (ID: ' + source.id + ')');
  console.log('Adapter: ' + source.adapter_type);
  console.log('Config: ' + JSON.stringify(source.scrape_config || {}));
  console.log('');

  // Dynamic import of engine — deferred so dotenv is already loaded
  var { runIngestion } = await import('../src/lib/ingestion/engine');

  console.log('Running ingestion pipeline...\n');
  var result = await runIngestion(source.id, REPORT_LIMIT);

  // Results
  console.log('\n--- RESULTS: ' + adapterType.toUpperCase() + ' ---');
  console.log('Success:          ' + (result.success ? 'YES' : 'NO'));
  console.log('Job ID:           ' + result.jobId);
  console.log('Duration:         ' + (result.duration / 1000).toFixed(1) + 's');
  console.log('Records found:    ' + result.recordsFound);
  console.log('Records inserted: ' + result.recordsInserted);
  console.log('Records updated:  ' + result.recordsUpdated);
  console.log('Records skipped:  ' + result.recordsSkipped + ' (dedup)');
  console.log('Records rejected: ' + result.recordsRejected + ' (quality)');
  console.log('Pending review:   ' + result.recordsPendingReview);
  console.log('Phenomena linked: ' + result.phenomenaLinked);
  if (result.error) {
    console.log('Error:            ' + result.error);
  }

  // Query back the inserted reports
  var dbSourceType = adapterType === 'reddit-v2' ? 'reddit' : adapterType;

  var { data: reports, error: queryErr } = await supabase
    .from('reports')
    .select(
      'id, title, slug, source_type, source_url, source_label, ' +
      'original_report_id, status, category, tags, ' +
      'event_date, event_date_precision, ' +
      'location_name, city, state_province, country, ' +
      'latitude, longitude, credibility, witness_count, ' +
      'has_photo_video, has_official_report, ' +
      'description, summary, feed_hook, paradocs_narrative, ' +
      'created_at, updated_at'
    )
    .eq('source_type', dbSourceType)
    .order('created_at', { ascending: false })
    .limit(REPORT_LIMIT);

  if (queryErr) {
    console.error('Error querying reports: ' + queryErr.message);
    return;
  }

  if (!reports || reports.length === 0) {
    console.log('\nNo reports found for source_type="' + dbSourceType + '".');
    console.log('All scraped reports may have been rejected by quality filters.');
    console.log('Check the [Ingestion] log lines above for details.\n');
    return;
  }

  // Field validation
  console.log('\n--- INSERTED REPORTS ---\n');
  var warnings: string[] = [];

  for (var i = 0; i < reports.length; i++) {
    var r = reports[i];
    var liveUrl = SITE_URL + '/reports/' + r.slug;
    var rWarns: string[] = [];

    if (!r.source_url) rWarns.push('MISSING source_url');
    if (!r.source_label) rWarns.push('MISSING source_label');
    if (!r.title) rWarns.push('MISSING title');
    if (!r.description || r.description.length < 50) rWarns.push('SHORT description (' + (r.description || '').length + ' chars)');
    if (!r.category) rWarns.push('MISSING category');
    if (!r.tags || r.tags.length === 0) rWarns.push('EMPTY tags');
    if (!r.event_date) rWarns.push('MISSING event_date');
    if (!r.location_name) rWarns.push('MISSING location_name');
    if (!r.original_report_id) rWarns.push('MISSING original_report_id');

    console.log('[' + (i + 1) + '] ' + r.title);
    console.log('    ID:            ' + r.id);
    console.log('    Status:        ' + r.status);
    console.log('    Live URL:      ' + liveUrl);
    console.log('    Source URL:    ' + (r.source_url || 'MISSING'));
    console.log('    Source Label:  ' + (r.source_label || 'MISSING'));
    console.log('    Original ID:   ' + (r.original_report_id || 'MISSING'));
    console.log('    Category:      ' + r.category);
    console.log('    Tags:          ' + ((r.tags || []).join(', ') || 'EMPTY'));
    console.log('    Event Date:    ' + (r.event_date || 'none') + ' (' + (r.event_date_precision || 'unknown') + ')');
    console.log('    Location:      ' + (r.location_name || 'none'));
    console.log('    Coords:        ' + (r.latitude && r.longitude ? r.latitude + ', ' + r.longitude : 'none'));
    console.log('    Credibility:   ' + (r.credibility || 'unverified'));
    console.log('    Witnesses:     ' + (r.witness_count || 'unknown'));
    console.log('    Description:   ' + (r.description || '').substring(0, 120) + '...');
    console.log('    Feed Hook:     ' + (r.feed_hook ? r.feed_hook.substring(0, 80) + '...' : 'NOT GENERATED'));
    console.log('    Narrative:     ' + (r.paradocs_narrative ? 'YES (' + r.paradocs_narrative.length + ' chars)' : 'NOT GENERATED'));

    if (rWarns.length > 0) {
      console.log('    WARNINGS:      ' + rWarns.join(', '));
      for (var w of rWarns) {
        warnings.push('[' + r.title.substring(0, 35) + '] ' + w);
      }
    }
    console.log('');
  }

  // Media check
  var reportIds = reports.map(function(rr: any) { return rr.id; });
  var { data: media } = await supabase
    .from('report_media')
    .select('report_id, media_type, url')
    .in('report_id', reportIds);

  console.log('Media items: ' + ((media && media.length) || 0));
  if (media) {
    for (var m of media) {
      console.log('  [' + m.media_type + '] ' + (m.url || '').substring(0, 80));
    }
  }

  // Dedup check
  console.log('\nDedup verification:');
  for (var r2 of reports) {
    var { count: dupCount } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('original_report_id', r2.original_report_id)
      .eq('source_type', r2.source_type);

    if (dupCount && dupCount > 1) {
      console.log('  DUPLICATE: ' + r2.original_report_id + ' has ' + dupCount + ' copies!');
    } else {
      console.log('  OK: ' + r2.original_report_id);
    }
  }

  // Summary with live URLs
  console.log('\n--- SUMMARY ---');
  console.log('Total:       ' + reports.length);
  console.log('Approved:    ' + reports.filter(function(rr: any) { return rr.status === 'approved'; }).length);
  console.log('Pending:     ' + reports.filter(function(rr: any) { return rr.status === 'pending_review'; }).length);
  console.log('Warnings:    ' + warnings.length);

  if (warnings.length > 0) {
    console.log('\nAll warnings:');
    for (var ww of warnings) {
      console.log('  - ' + ww);
    }
  }

  console.log('\nReview on the live site:');
  for (var r3 of reports) {
    console.log('  ' + SITE_URL + '/report/' + r3.slug);
  }

  // ── Post-ingestion backfill: retry analysis for approved reports missing it ──
  var missingAnalysis = reports.filter(function(rr: any) {
    return rr.status === 'approved' && !rr.paradocs_narrative;
  });

  if (missingAnalysis.length > 0) {
    console.log('\n--- BACKFILL: ' + missingAnalysis.length + ' approved reports missing analysis ---\n');
    var { generateAndSaveParadocsAnalysis } = await import('../src/lib/services/paradocs-analysis.service');

    var backfilled = 0;
    var backfillFailed = 0;

    for (var bi = 0; bi < missingAnalysis.length; bi++) {
      var mr = missingAnalysis[bi];
      console.log('[Backfill ' + (bi + 1) + '/' + missingAnalysis.length + '] ' + mr.title.substring(0, 50));

      try {
        // Brief pause between backfill calls
        if (bi > 0) {
          await new Promise(function(resolve) { setTimeout(resolve, 3000); });
        }

        var ok = await generateAndSaveParadocsAnalysis(mr.id);
        if (ok) {
          console.log('  -> SUCCESS');
          backfilled++;
        } else {
          console.log('  -> FAILED (returned false)');
          backfillFailed++;
        }
      } catch (bErr: any) {
        console.log('  -> ERROR: ' + (bErr.message || bErr));
        backfillFailed++;
      }
    }

    console.log('\nBackfill results: ' + backfilled + ' succeeded, ' + backfillFailed + ' failed');
  }

  // ── Post-ingestion backfill: correct has_photo_video for reports with no actual media ──
  // EXCEPTION: Link-only adapters (bfro, nuforc) intentionally set has_photo_video
  // without storing media — they link to the source page instead. Don't override.
  var LINK_ONLY_VALIDATE = ['bfro', 'nuforc'];
  if (LINK_ONLY_VALIDATE.indexOf(adapterType) === -1) {
    var falseMedia = reports.filter(function(rr: any) { return rr.has_photo_video; });
    if (falseMedia.length > 0 && media) {
      var mediaReportIds = new Set((media || []).map(function(mm: any) { return mm.report_id; }));
      var falseFlagReports = falseMedia.filter(function(rr: any) { return !mediaReportIds.has(rr.id); });

      if (falseFlagReports.length > 0) {
        console.log('\n--- CORRECTING ' + falseFlagReports.length + ' false has_photo_video flags ---');
        for (var ff of falseFlagReports) {
          await supabase
            .from('reports')
            .update({ has_photo_video: false })
            .eq('id', ff.id);
          console.log('  Corrected: ' + ff.title.substring(0, 50));
        }
      }
    }
  }

  console.log('');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  var mode = process.argv[2] || '';

  if (!mode || (mode !== 'cleanup' && mode !== 'ingest')) {
    console.log('Usage:');
    console.log('  npx tsx scripts/pipeline-validate.ts cleanup');
    console.log('  npx tsx scripts/pipeline-validate.ts ingest <adapter>');
    console.log('');
    console.log('Adapters: ' + VALID_ADAPTERS.join(', ') + ', all');
    process.exit(1);
  }

  console.log('Supabase: ' + process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('Anthropic Key: ' + (process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET'));
  console.log('OpenAI Key: ' + (process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'));

  if (mode === 'cleanup') {
    await runCleanup();
  } else {
    var adapterArg = process.argv[3] || '';
    if (!adapterArg) {
      console.error('Specify an adapter: ' + VALID_ADAPTERS.join(', ') + ', all');
      process.exit(1);
    }
    if (adapterArg !== 'all' && VALID_ADAPTERS.indexOf(adapterArg) === -1) {
      console.error('Unknown adapter: "' + adapterArg + '"');
      process.exit(1);
    }

    var adapters = adapterArg === 'all' ? VALID_ADAPTERS : [adapterArg];
    for (var idx = 0; idx < adapters.length; idx++) {
      await runIngest(adapters[idx]);
      if (adapters.length > 1 && idx < adapters.length - 1) {
        console.log('Waiting 2s before next adapter...\n');
        await new Promise(function(resolve) { setTimeout(resolve, 2000); });
      }
    }
  }

  console.log('Done.\n');
}

main().catch(function(err) {
  console.error('FATAL:', err);
  process.exit(1);
});
