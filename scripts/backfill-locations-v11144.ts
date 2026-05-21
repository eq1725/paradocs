#!/usr/bin/env tsx
/**
 * V11.14.4 — Backfill missed locations on existing reports.
 *
 * For every report (approved + pending_review) where country IS NULL
 * but the title+description mentions a country that the new
 * parseLocation regex can catch, re-run the location pipeline and
 * update the row.
 *
 * Catches cases like:
 *   - "trip to Italy" / "After hitting southern Italy"
 *   - "rural northern Italy"
 *   - body mentions India 3+ times with no clear preposition
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/backfill-locations-v11144.ts --dry-run   # preview
 *   tsx scripts/backfill-locations-v11144.ts             # apply
 */

import { createClient } from '@supabase/supabase-js'
import { parseLocation } from '../src/lib/ingestion/utils/location-parser'
import {
  normalizeLocation,
  geocodeWithFallback,
  makeSupabaseGeocodeCache,
} from '../src/lib/ingestion/utils/normalize-location'

var dryRun = process.argv.includes('--dry-run')

async function main() {
  var sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('=== V11.14.4 Location backfill ===')
  console.log('Mode: ' + (dryRun ? 'DRY RUN (no writes)' : 'APPLYING UPDATES'))

  // Find candidates — paginate around Supabase's 5000-row PostgREST cap.
  var rows: any[] = []
  var pageSize = 1000
  var fetchedThisPage = pageSize
  var offset = 0
  while (fetchedThisPage === pageSize) {
    var page = await sb
      .from('reports')
      .select('id, slug, title, description, status, source_type, country, location_name')
      .in('status', ['approved', 'pending_review'])
      .is('country', null)
      .neq('source_type', 'user_submission')
      .not('description', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (page.error) {
      console.error('Query failed:', page.error.message)
      process.exit(1)
    }
    var pageRows = page.data || []
    rows.push.apply(rows, pageRows)
    fetchedThisPage = pageRows.length
    offset += pageSize
    if (offset > 100000) break  // safety cap
  }
  console.log('Candidates (all pages): ' + rows.length)

  var stats = {
    matched: 0,
    updated: 0,
    no_match: 0,
    geocode_fail: 0,
    update_fail: 0,
  }

  var cache = makeSupabaseGeocodeCache(sb)

  var skippedUS = 0
  for (var i = 0; i < (rows || []).length; i++) {
    var row = rows![i]
    var text = (row.title || '') + '\n\n' + (row.description || '')
    var parsed = parseLocation(text)
    if (!parsed.country) {
      stats.no_match++
      continue
    }
    // V11.14.4 — Backfill is scoped to INTERNATIONAL country matches
    // only. The US-state extractor in parseLocation has a pre-existing
    // loose city regex that picks up garbage like "In West" from
    // "In West Virginia" — which is fine during fresh ingest (paired
    // with the strict report-enricher US-state extractor) but produces
    // junk values when applied retroactively to long bodies that the
    // strict extractor already rejected. International countries are
    // what V11.14.4 was actually built to catch.
    if (parsed.country === 'United States') {
      skippedUS++
      stats.no_match++
      continue
    }
    stats.matched++
    if (dryRun) {
      console.log('  [' + row.slug + '] → ' + parsed.country + (parsed.city ? ' (' + parsed.city + ')' : ''))
      continue
    }
    // Run normalizeLocation to get country_code + centroid coords
    var norm: any = null
    try {
      norm = await normalizeLocation(
        {
          city: parsed.city || null,
          state_province: parsed.stateProvince || null,
          country: parsed.country,
          country_code: null,
          location_name: parsed.locationName || parsed.country,
          latitude: null,
          longitude: null,
        },
        { geocoder: 'maptiler', geocodeFn: geocodeWithFallback, cache: cache },
      )
    } catch (e: any) {
      stats.geocode_fail++
      console.warn('  [' + row.slug + '] normalizeLocation failed: ' + (e.message || e))
      continue
    }
    if (!norm) {
      stats.geocode_fail++
      continue
    }
    var updateData: any = {
      location_name: norm.location_name || parsed.locationName || parsed.country,
      country: norm.country,
      country_code: norm.country_code,
      state_province: norm.state_province,
      city: norm.city,
      latitude: norm.latitude,
      longitude: norm.longitude,
      coords_synthetic: !!norm.coords_synthetic,
      updated_at: new Date().toISOString(),
    }
    // Also update metadata.location_precision if available
    var { error: updErr } = await sb.from('reports').update(updateData).eq('id', row.id)
    if (updErr) {
      stats.update_fail++
      console.warn('  [' + row.slug + '] update failed: ' + updErr.message)
      continue
    }
    stats.updated++
    if (stats.updated % 25 === 0) {
      console.log('  ... ' + stats.updated + ' updated')
    }
  }

  console.log('')
  console.log('=== Summary ===')
  console.log('Matched (international):                  ' + stats.matched)
  console.log('Updated:                                  ' + stats.updated)
  console.log('Skipped (US match — noisy, out of scope): ' + skippedUS)
  console.log('No match:                                 ' + (stats.no_match - skippedUS))
  console.log('Geocode fail:                             ' + stats.geocode_fail)
  console.log('Update fail:                              ' + stats.update_fail)
}

main().catch(function (e) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})
