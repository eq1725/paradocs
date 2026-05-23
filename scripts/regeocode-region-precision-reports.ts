#!/usr/bin/env tsx
/**
 * V11.17.6 — Re-geocode region-precision reports with parseable
 * city names.
 *
 * Context: V11.17.5 backfill marked ~8,375 reports as region/country
 * precision because their stored coords matched a state/country
 * centroid. Many of those — "Chicago, IL", "Sussex, New Jersey",
 * "Mooresville, NC" — actually have a real city name in
 * location_name that *could* resolve to a city-accurate coord via
 * MapTiler. The original ingestion geocoder must've failed on them
 * (low budget, retry exhaustion, ambiguity), so it fell back to
 * the state centroid.
 *
 * This script:
 *   1. Loads reports with location_precision='region' (or
 *      country/exact at known centroids if a leftover)
 *   2. Skips reports whose location_name is purely directional
 *      ("northern New Jersey") — those are correctly fuzzy.
 *   3. For each remaining candidate, calls MapTiler with the
 *      full location_name and reads the accuracy returned.
 *   4. If MapTiler returns 'address' / 'street' / 'locality' →
 *      update lat/lng + set precision='city'.
 *   5. If MapTiler returns 'region' / 'country' → leave precision
 *      where it is (already correctly fuzzy).
 *
 * Cost: ~$0.001/lookup × ~4,500 candidates = ~$5 in MapTiler usage.
 * Throttle: 5 req/sec (well under MapTiler free-tier limits).
 *
 * Drain-safe + classifier-safe: only writes
 * reports.latitude/longitude/location_precision/updated_at.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/regeocode-region-precision-reports.ts --dry-run
 *   tsx scripts/regeocode-region-precision-reports.ts --limit 50
 *   tsx scripts/regeocode-region-precision-reports.ts
 */

import { createClient } from '@supabase/supabase-js'
import { maptilerGeocoder } from '../src/lib/ingestion/utils/normalize-location'

const DRY = process.argv.includes('--dry-run')
const LIMIT_IDX = process.argv.indexOf('--limit')
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1], 10) || 0 : 0

const THROTTLE_MS = 200 // 5 req/sec

// Directional patterns — these locations are truly approximate, so
// MapTiler can't improve their precision. Skip them.
const DIRECTIONAL_PATTERNS: RegExp[] = [
  /^(?:northern|southern|eastern|western|central|northeastern|northwestern|southeastern|southwestern)\s+/i,
  /^(?:north|south|east|west)\s+(?!(?:carolina|dakota|virginia)\b)/i,
  /^(?:pacific\s+northwest|new\s+england|midwest|deep\s+south|mountain\s+west|great\s+lakes|appalachia|bible\s+belt|rust\s+belt|sun\s+belt|four\s+corners)\b/i,
  /^(?:rural|outside|near|around|just\s+outside|right\s+outside|just\s+off|about)\s+/i,
  /^(?:upstate|downstate)\s+/i,
  /^(?:east|west|gulf)\s+coast$/i,
]

function isDirectional(s: string): boolean {
  for (const re of DIRECTIONAL_PATTERNS) if (re.test(s)) return true
  return false
}

// State-only names ("Florida", "Michigan", "Texas") — MapTiler resolves
// these to state-level coords which we already have. Skip them.
const BARE_STATE_PATTERN = /^(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new\s+hampshire|new\s+jersey|new\s+mexico|new\s+york|north\s+carolina|north\s+dakota|ohio|oklahoma|oregon|pennsylvania|rhode\s+island|south\s+carolina|south\s+dakota|tennessee|texas|utah|vermont|virginia|washington|west\s+virginia|wisconsin|wyoming)$/i

// Country-only — same logic, skip.
const BARE_COUNTRY_PATTERN = /^(united\s+states|usa|us|u\.s\.a?\.|uk|united\s+kingdom|canada|australia|new\s+zealand|germany|france|spain|italy|japan|china|india|brazil|mexico|argentina|south\s+africa|russia|ireland|scotland|wales|england|northern\s+ireland)$/i

async function fetchAllRows<T = any>(query: any, pageSize = 1000): Promise<T[]> {
  const all: T[] = []
  let offset = 0
  while (true) {
    const res = await query.range(offset, offset + pageSize - 1)
    if (res.error) throw new Error(res.error.message)
    const rows = res.data || []
    all.push(...(rows as any))
    if (rows.length < pageSize) break
    offset += pageSize
    if (offset > 500000) break
  }
  return all
}

interface ReportRow {
  id: string
  latitude: number
  longitude: number
  location_name: string | null
  country: string | null
  city: string | null
  state_province: string | null
  location_precision: string | null
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  if (!process.env.MAPTILER_API_KEY && !process.env.NEXT_PUBLIC_MAPTILER_KEY) {
    console.error('MAPTILER_API_KEY (or NEXT_PUBLIC_MAPTILER_KEY) missing from env')
    process.exit(1)
  }

  console.log('=== Re-geocode region-precision reports ===')
  console.log('Dry run: ' + DRY)
  if (LIMIT > 0) console.log('Limit: ' + LIMIT)

  console.log('\nLoading region-precision reports...')
  const rows = await fetchAllRows<ReportRow>(
    sb.from('reports')
      .select('id, latitude, longitude, location_name, country, city, state_province, location_precision')
      .eq('status', 'approved')
      .eq('location_precision', 'region')
      .not('location_name', 'is', null)
  )
  console.log('  loaded ' + rows.length + ' region-precision reports')

  // Filter to candidates — has a parseable location_name that's not
  // bare-state or directional.
  const candidates = rows.filter(r => {
    const name = (r.location_name || '').trim()
    if (name.length < 3) return false
    if (isDirectional(name)) return false
    if (BARE_STATE_PATTERN.test(name)) return false
    if (BARE_COUNTRY_PATTERN.test(name)) return false
    return true
  })
  console.log('  candidates to attempt: ' + candidates.length)
  console.log('    (skipped ' + (rows.length - candidates.length) + ' bare-state/country/directional)')

  const queue = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates
  console.log('  processing: ' + queue.length)
  console.log('  estimated cost: $' + (queue.length * 0.001).toFixed(2))
  console.log('  estimated time: ~' + Math.round(queue.length * THROTTLE_MS / 1000) + 's\n')

  let upgradedCount = 0
  let unchangedCount = 0
  let errorCount = 0
  const t0 = Date.now()

  for (let i = 0; i < queue.length; i++) {
    const r = queue[i]
    const name = (r.location_name || '').trim()
    // Append country hint to improve disambiguation.
    let query = name
    if (r.country && !name.toLowerCase().includes(r.country.toLowerCase())) {
      query = name + ', ' + r.country
    }
    let result
    try {
      result = await maptilerGeocoder(query)
    } catch (e: any) {
      errorCount++
      if (errorCount < 5) console.warn('  err ' + r.id.substring(0, 8) + ': ' + (e?.message || e))
      await new Promise(res => setTimeout(res, THROTTLE_MS))
      continue
    }

    if (!result) {
      unchangedCount++
    } else if (result.accuracy === 'address' || result.accuracy === 'street' || result.accuracy === 'locality') {
      // City-accurate result! Update.
      if (!DRY) {
        const upd = await sb.from('reports').update({
          latitude: result.lat,
          longitude: result.lng,
          location_precision: 'city',
          updated_at: new Date().toISOString(),
        }).eq('id', r.id)
        if (upd.error) {
          errorCount++
          if (errorCount < 5) console.warn('  db ' + r.id.substring(0, 8) + ': ' + upd.error.message)
        } else {
          upgradedCount++
        }
      } else {
        upgradedCount++
      }
      if (upgradedCount <= 10) {
        console.log('  ✓ [' + r.id.substring(0, 8) + '] "' + name.substring(0, 40) + '" → (' + result.lat.toFixed(3) + ', ' + result.lng.toFixed(3) + ') ' + result.accuracy)
      }
    } else {
      // Geocoder returned region/country — no improvement, leave as is.
      unchangedCount++
    }

    if ((i + 1) % 100 === 0) {
      const el = Math.round((Date.now() - t0) / 1000)
      console.log('  +' + el + 's  processed=' + (i + 1) + '/' + queue.length + '  upgraded=' + upgradedCount)
    }

    await new Promise(res => setTimeout(res, THROTTLE_MS))
  }

  const el = Math.round((Date.now() - t0) / 1000)
  console.log('\nDone in ' + el + 's')
  console.log('  Upgraded to city precision: ' + upgradedCount)
  console.log('  Unchanged (geocoder also fuzzy): ' + unchangedCount)
  console.log('  Errors: ' + errorCount)
  if (DRY) console.log('\n(dry-run — no DB writes performed)')
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1) })
