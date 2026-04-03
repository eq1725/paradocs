#!/usr/bin/env npx tsx
/**
 * Backfill Script for Existing NUFORC Reports
 *
 * Fixes all 5 QA issues on existing NUFORC reports:
 *   1. Regenerate titles (removes false "Caught on Camera" labels)
 *   2. Re-geocode locations (now uses Nominatim fallback)
 *   3. Regenerate missing Paradocs Analysis
 *   4. (Maps auto-render once coordinates exist — no action needed)
 *   5. (Environmental context API fixed — no per-report action needed)
 *
 * Usage:
 *   npx tsx scripts/backfill-nuforc.ts
 */

// Load env FIRST via require() — synchronous, runs before ES imports resolve
require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

var SITE_URL = 'https://beta.discoverparadocs.com';

function getSupabase() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  return createClient(supabaseUrl, serviceKey);
}

async function main() {
  var supabase = getSupabase();

  console.log('\n' + '='.repeat(60));
  console.log('  BACKFILL: Fixing existing NUFORC reports');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(60) + '\n');

  console.log('Anthropic Key: ' + (process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET'));
  console.log('MapTiler Key:  ' + (process.env.NEXT_PUBLIC_MAPTILER_KEY ? 'SET' : 'NOT SET'));
  console.log('');

  // Fetch all NUFORC reports
  var { data: reports, error: queryErr } = await supabase
    .from('reports')
    .select('id, title, slug, description, category, location_name, city, state_province, country, latitude, longitude, event_date, event_date_precision, source_type, source_url, original_report_id, paradocs_narrative, feed_hook, has_photo_video, metadata')
    .eq('source_type', 'nuforc')
    .order('created_at', { ascending: false });

  if (queryErr || !reports || reports.length === 0) {
    console.error('No NUFORC reports found:', queryErr?.message);
    return;
  }

  console.log('Found ' + reports.length + ' NUFORC reports to backfill.\n');

  // Dynamic imports (deferred so dotenv is loaded first)
  var { improveTitleWithAI } = await import('../src/lib/ingestion/filters');
  var { geocodeLocation, buildLocationQuery } = await import('../src/lib/services/geocoding.service');
  var { generateAndSaveParadocsAnalysis } = await import('../src/lib/services/paradocs-analysis.service');
  var { generateAndSaveFeedHook } = await import('../src/lib/services/feed-hook.service');
  var { embedReport } = await import('../src/lib/services/embedding.service');

  for (var i = 0; i < reports.length; i++) {
    var r = reports[i];
    console.log('\n--- [' + (i + 1) + '/' + reports.length + '] ' + r.title.substring(0, 60) + ' ---');

    var updates: Record<string, any> = {};

    // ========================================
    // FIX 1: Regenerate title
    // ========================================
    console.log('  [Title] Regenerating...');
    try {
      var titleResult = await improveTitleWithAI(
        r.title,
        r.description,
        r.category,
        r.location_name,
        r.event_date
      );

      if (titleResult.wasImproved && titleResult.title !== r.title) {
        console.log('  [Title] ' + r.title.substring(0, 40) + ' -> ' + titleResult.title.substring(0, 40));
        updates.title = titleResult.title;
        updates.original_title = titleResult.originalTitle || r.title;

        // Regenerate slug for new title
        var baseSlug = titleResult.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .substring(0, 60);

        var uniqueKey = r.source_type + '-' + r.original_report_id;
        var hash = 0;
        for (var ci = 0; ci < uniqueKey.length; ci++) {
          var char = uniqueKey.charCodeAt(ci);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        var hashStr = Math.abs(hash).toString(36).substring(0, 8);
        updates.slug = baseSlug + '-' + hashStr;
      } else {
        console.log('  [Title] No change needed');
      }
    } catch (titleErr) {
      console.error('  [Title] Error:', titleErr);
    }

    // ========================================
    // FIX 2: Re-geocode location
    // ========================================
    if (!r.latitude || !r.longitude) {
      console.log('  [Geocode] No coordinates — attempting geocode...');
      try {
        var locationQuery = buildLocationQuery({
          city: r.city,
          state: r.state_province,
          country: r.country,
          location_name: r.location_name
        });

        if (locationQuery) {
          var geocoded = await geocodeLocation(locationQuery);
          if (geocoded) {
            updates.latitude = geocoded.latitude;
            updates.longitude = geocoded.longitude;
            console.log('  [Geocode] Success: ' + geocoded.latitude.toFixed(4) + ', ' + geocoded.longitude.toFixed(4) + ' (' + geocoded.displayName + ')');
          } else {
            console.log('  [Geocode] No results for: ' + locationQuery);
          }
        } else {
          console.log('  [Geocode] No location data to geocode');
        }

        // Rate limit: 1 req/sec for Nominatim
        await new Promise(function(resolve) { setTimeout(resolve, 1100); });
      } catch (geoErr) {
        console.error('  [Geocode] Error:', geoErr);
      }
    } else {
      console.log('  [Geocode] Already has coordinates: ' + r.latitude + ', ' + r.longitude);
    }

    // ========================================
    // Apply DB updates (title + coordinates)
    // ========================================
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      var { error: updateErr } = await supabase
        .from('reports')
        .update(updates)
        .eq('id', r.id);

      if (updateErr) {
        console.error('  [DB] Update error:', updateErr.message);
      } else {
        console.log('  [DB] Updated: ' + Object.keys(updates).join(', '));
      }
    }

    // ========================================
    // FIX 3: Regenerate Paradocs Analysis (force for all)
    // ========================================
    console.log('  [Analysis] Regenerating Paradocs analysis...');
    try {
      var analysisOk = await generateAndSaveParadocsAnalysis(r.id);
      if (analysisOk) {
        console.log('  [Analysis] Success');
      } else {
        console.log('  [Analysis] Generation returned false — retrying...');
        await new Promise(function(resolve) { setTimeout(resolve, 2000); });
        var retryOk = await generateAndSaveParadocsAnalysis(r.id);
        console.log('  [Analysis] Retry ' + (retryOk ? 'succeeded' : 'failed'));
      }
    } catch (analysisErr) {
      console.error('  [Analysis] Error:', analysisErr);
    }

    // Regenerate feed hook too (in case title changed)
    console.log('  [FeedHook] Regenerating...');
    try {
      await generateAndSaveFeedHook(r.id);
      console.log('  [FeedHook] Success');
    } catch (hookErr) {
      console.error('  [FeedHook] Error:', hookErr);
    }

    // Regenerate embedding (with new title/coordinates)
    console.log('  [Embedding] Regenerating...');
    try {
      await embedReport(r.id);
      console.log('  [Embedding] Success');
    } catch (embedErr) {
      console.error('  [Embedding] Error:', embedErr);
    }

    // Brief pause between reports to avoid rate limits
    if (i < reports.length - 1) {
      await new Promise(function(resolve) { setTimeout(resolve, 1000); });
    }
  }

  // ========================================
  // Verification
  // ========================================
  console.log('\n\n' + '='.repeat(60));
  console.log('  VERIFICATION');
  console.log('='.repeat(60) + '\n');

  var { data: updatedReports } = await supabase
    .from('reports')
    .select('id, title, slug, latitude, longitude, location_name, paradocs_narrative, feed_hook, has_photo_video')
    .eq('source_type', 'nuforc')
    .order('created_at', { ascending: false });

  if (updatedReports) {
    var allGood = true;
    for (var j = 0; j < updatedReports.length; j++) {
      var ur = updatedReports[j];
      var issues: string[] = [];

      if (ur.title.indexOf('Caught on Camera') !== -1) issues.push('STILL HAS "Caught on Camera"');
      if (!ur.latitude || !ur.longitude) issues.push('MISSING coordinates');
      if (!ur.paradocs_narrative) issues.push('MISSING narrative');
      if (!ur.feed_hook) issues.push('MISSING feed_hook');

      var status = issues.length === 0 ? 'OK' : 'ISSUES';
      if (issues.length > 0) allGood = false;

      console.log('[' + status + '] ' + ur.title.substring(0, 50));
      if (ur.latitude && ur.longitude) {
        console.log('       Coords: ' + ur.latitude.toFixed(4) + ', ' + ur.longitude.toFixed(4));
      }
      console.log('       Narrative: ' + (ur.paradocs_narrative ? 'YES (' + ur.paradocs_narrative.length + ' chars)' : 'MISSING'));
      console.log('       URL: ' + SITE_URL + '/reports/' + ur.slug);
      if (issues.length > 0) {
        console.log('       ISSUES: ' + issues.join(', '));
      }
      console.log('');
    }

    console.log(allGood ? 'All reports passed verification!' : 'Some reports still have issues — review above.');
  }

  console.log('\nDone.\n');
}

main().catch(function(err) {
  console.error('FATAL:', err);
  process.exit(1);
});
