/**
 * V10.8.C follow-up — local backfill driver.
 *
 * Runs normalizeLocation against every approved report missing a
 * country_code AND writes the result back via the Supabase REST API.
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   NEXT_PUBLIC_MAPTILER_KEY=... \
 *   npx ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"resolveJsonModule":true}' scripts/backfill-location-live.ts
 *
 * Optional env:
 *   DRY_RUN=1      — print proposed updates, don't write
 *   FORCE=1        — re-normalize every approved row (default: only country_code IS NULL)
 *   LIMIT=N        — process at most N rows (default 500)
 *   SLUG=foo-bar   — restrict to a single report (spot-fix)
 */

import { createClient } from '@supabase/supabase-js'
import {
  normalizeLocation,
  geocodeWithFallback,
  makeSupabaseGeocodeCache,
} from '../src/lib/ingestion/utils/normalize-location'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const dryRun = process.env.DRY_RUN === '1'
  const force = process.env.FORCE === '1'
  const limit = parseInt(process.env.LIMIT || '500', 10)
  const slug = process.env.SLUG || null

  // V10.8.C.1 — always use the chained geocoder. It picks MapTiler
  // when a key is set and falls back to Nominatim (free, no key) on
  // any failure. So the script works even on a fresh checkout with
  // no MAPTILER_API_KEY in env.
  const cache = makeSupabaseGeocodeCache(supabase)
  const hasMaptiler = !!(process.env.MAPTILER_API_KEY || process.env.NEXT_PUBLIC_MAPTILER_KEY)

  console.log('Config:')
  console.log('  dry_run:', dryRun)
  console.log('  force:', force)
  console.log('  limit:', limit)
  console.log('  slug:', slug || '(all)')
  console.log('  geocoder: maptiler->nominatim (fallback chain)')
  console.log('  maptiler_key_present:', hasMaptiler)
  console.log('')

  let q = (supabase.from('reports') as any)
    .select('id, slug, title, city, state_province, country, country_code, location_name, latitude, longitude, coords_synthetic, metadata, status')

  if (slug) {
    q = q.eq('slug', slug)
  } else {
    q = q.eq('status', 'approved')
    if (!force) q = q.is('country_code', null)
  }
  q = q.order('created_at', { ascending: false }).limit(limit)

  const { data: rows, error } = await q
  if (error) {
    console.error('Fetch error:', error.message)
    process.exit(1)
  }

  console.log(`Scanning ${(rows || []).length} rows...\n`)

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const r of (rows || [])) {
    try {
      const before = {
        country: r.country,
        country_code: r.country_code,
        state_province: r.state_province,
        latitude: r.latitude,
        longitude: r.longitude,
        coords_synthetic: r.coords_synthetic,
      }

      // V10.8.C.1 — when re-running the backfill we want the geocoder
      // to fire even on rows that already have lat/lng (because those
      // existing coords might be a stale state-centroid we want to
      // upgrade to a real city geocode). Wipe lat/lng before we feed
      // the row to normalizeLocation so it skips the "exact" branch
      // and re-enters the geocoding ladder. Only do this when the
      // current coords are flagged synthetic — precise lat/lng from
      // an adapter must be preserved.
      const stripExisting = r.coords_synthetic === true
      const normalized = await normalizeLocation(
        {
          city: r.city || null,
          state_province: r.state_province || null,
          country: r.country || null,
          country_code: r.country_code || null,
          location_name: r.location_name || null,
          latitude: stripExisting ? null : (r.latitude ?? null),
          longitude: stripExisting ? null : (r.longitude ?? null),
        },
        {
          geocoder: 'maptiler',
          geocodeFn: geocodeWithFallback,
          cache,
        },
      )

      const eps = 0.0001
      const same =
        nullSafeEq(normalized.latitude, before.latitude, eps) &&
        nullSafeEq(normalized.longitude, before.longitude, eps) &&
        normalized.country === before.country &&
        normalized.country_code === before.country_code &&
        normalized.state_province === before.state_province &&
        normalized.coords_synthetic === before.coords_synthetic

      if (same) {
        skipped++
        continue
      }

      if (dryRun) {
        console.log(`[DRY] ${r.slug}: ${before.country}/${before.country_code} (${before.latitude},${before.longitude}) → ${normalized.country}/${normalized.country_code} (${normalized.latitude},${normalized.longitude}) [${normalized.location_precision}, synthetic=${normalized.coords_synthetic}]`)
        continue
      }

      const mergedMeta = Object.assign({}, r.metadata || {}, {
        location_precision: normalized.location_precision,
      })

      const { error: upErr } = await (supabase.from('reports') as any)
        .update({
          city: normalized.city,
          state_province: normalized.state_province,
          country: normalized.country,
          country_code: normalized.country_code,
          location_name: normalized.location_name,
          latitude: normalized.latitude,
          longitude: normalized.longitude,
          coords_synthetic: normalized.coords_synthetic,
          metadata: mergedMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', r.id)

      if (upErr) {
        failed++
        console.log(`  FAIL ${r.slug}: ${upErr.message}`)
        continue
      }
      updated++
      if (updated <= 10 || updated % 25 === 0) {
        console.log(`  ${updated}. ${r.slug}: ${normalized.country_code} ${normalized.state_province || '-'} (${normalized.location_precision}, synthetic=${normalized.coords_synthetic})`)
      }
    } catch (e: any) {
      failed++
      console.log(`  EX ${r.slug}: ${e.message}`)
    }
  }

  console.log('')
  console.log(`Scanned: ${(rows || []).length}`)
  console.log(`Updated: ${updated}`)
  console.log(`Skipped (unchanged): ${skipped}`)
  console.log(`Failed: ${failed}`)
}

function nullSafeEq(a: number | null, b: number | null, eps: number): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return Math.abs(a - b) < eps
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
