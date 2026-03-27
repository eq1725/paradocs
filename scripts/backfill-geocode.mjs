#!/usr/bin/env node
/**
 * One-time backfill script: geocode reports with null lat/lng
 * Uses MapTiler API + Supabase service role key
 * Run: node scripts/backfill-geocode.mjs
 */

import { createClient } from '@supabase/supabase-js';

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !MAPTILER_KEY) {
  console.error('Missing env vars. Run with: source .env.local && node scripts/backfill-geocode.mjs');
  process.exit(1);
}

var supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function buildQuery(report) {
  var parts = [];
  if (report.city) parts.push(report.city);
  if (report.state_province) parts.push(report.state_province);
  if (report.country) parts.push(report.country);
  if (parts.length === 0 && report.location_name) return report.location_name;
  return parts.join(', ');
}

async function geocode(location) {
  var encoded = encodeURIComponent(location);
  var url = 'https://api.maptiler.com/geocoding/' + encoded + '.json?key=' + MAPTILER_KEY + '&limit=1';
  var resp = await fetch(url);
  if (!resp.ok) {
    console.error('  API error:', resp.status);
    return null;
  }
  var data = await resp.json();
  if (!data.features || data.features.length === 0) return null;
  var f = data.features[0];
  var lng = f.center ? f.center[0] : null;
  var lat = f.center ? f.center[1] : null;
  if (lat == null || lng == null) return null;
  return { latitude: lat, longitude: lng, displayName: f.place_name };
}

async function main() {
  // Fetch reports without coordinates
  var { data: reports, error } = await supabase
    .from('reports')
    .select('id, title, city, state_province, country, location_name')
    .is('latitude', null)
    .limit(200);

  if (error) {
    console.error('Supabase fetch error:', error);
    process.exit(1);
  }

  console.log('Found ' + reports.length + ' reports without coordinates\n');

  var success = 0;
  var fail = 0;

  for (var i = 0; i < reports.length; i++) {
    var r = reports[i];
    var query = buildQuery(r);
    if (!query || query.length < 3) {
      console.log('SKIP: ' + (r.title || r.id).substring(0, 60) + ' (no location)');
      fail++;
      continue;
    }

    var result = await geocode(query);
    if (result) {
      var { error: updateErr } = await supabase
        .from('reports')
        .update({ latitude: result.latitude, longitude: result.longitude })
        .eq('id', r.id);

      if (updateErr) {
        console.log('UPDATE ERROR: ' + r.id + ' — ' + updateErr.message);
        fail++;
      } else {
        console.log('OK: ' + query + ' -> ' + result.latitude.toFixed(4) + ', ' + result.longitude.toFixed(4) + ' (' + (r.title || '').substring(0, 40) + ')');
        success++;
      }
    } else {
      console.log('MISS: ' + query + ' (' + (r.title || '').substring(0, 40) + ')');
      fail++;
    }

    // Rate limit: 100ms between calls
    if (i < reports.length - 1) {
      await new Promise(function(resolve) { setTimeout(resolve, 100); });
    }
  }

  console.log('\nDone: ' + success + ' geocoded, ' + fail + ' failed/skipped');
}

main().catch(function(e) { console.error(e); process.exit(1); });
