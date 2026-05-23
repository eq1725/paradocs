#!/usr/bin/env tsx
/**
 * V11.17.5 — Backfill location_precision for reports whose coords
 * sit at a country/state centroid or whose location_name is a
 * directional/region descriptor.
 *
 * Why not NULL the coords? The map already has differentiated
 * rendering for fuzzy pins:
 *   - location_precision = 'city'  → solid pin (default)
 *   - location_precision = 'region' → halo'd softer pin ("somewhere
 *     in this state")
 *   - location_precision = 'country' → larger halo ("somewhere in
 *     this country")
 *
 * The bug we're fixing: older reports were ingested before the
 * enricher started setting location_precision automatically, so
 * their coords (e.g., US centroid, GA centroid) render as solid
 * pins implying city-level precision they don't have. Backfilling
 * location_precision = 'region' / 'country' for these reports flips
 * them to the soft-halo rendering the map already supports.
 *
 * Two detection signals:
 *
 *   1. Centroid coord match — lat/lng matches a country centroid
 *      (set precision='country') or state centroid (set 'region'),
 *      rounded to 2 decimals.
 *
 *   2. Directional name — location_name like "northern GA",
 *      "Western California", "Central Florida". These are
 *      regionally vague even if the coord is somewhat real.
 *      Set precision='region'.
 *
 * Drain-safe: only writes reports.location_precision (does NOT
 * touch lat/lng, location_name, status, or any other field). The
 * affected reports stay visible on the map, just rendered with
 * the appropriate fuzzy treatment.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/backfill-null-centroid-coords.ts --dry-run
 *   tsx scripts/backfill-null-centroid-coords.ts
 */

import { createClient } from '@supabase/supabase-js'
import countryCentroids from '../src/lib/ingestion/utils/country-centroids.json'
import stateCentroids from '../src/lib/ingestion/utils/state-centroids.json'

const DRY = process.argv.includes('--dry-run')

function key(lat: number, lng: number): string {
  return Math.round(lat * 100) / 100 + ',' + Math.round(lng * 100) / 100
}

interface CentroidLookup {
  country: Map<string, string>  // "lat,lng" → country code
  state: Map<string, string>    // "lat,lng" → state key
}

function buildCentroidLookups(): CentroidLookup {
  const country = new Map<string, string>()
  const state = new Map<string, string>()
  for (const code in countryCentroids) {
    if (code.startsWith('$')) continue
    const c = (countryCentroids as any)[code]
    if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
      country.set(key(c.lat, c.lng), code)
    }
  }
  // state-centroids.json is nested: countryCode → stateKey → {name,lat,lng}
  for (const countryCode in stateCentroids) {
    if (countryCode.startsWith('$')) continue
    const subdivisions = (stateCentroids as any)[countryCode]
    if (!subdivisions || typeof subdivisions !== 'object') continue
    for (const stateKey in subdivisions) {
      if (stateKey.startsWith('$')) continue
      const s = subdivisions[stateKey]
      if (s && typeof s.lat === 'number' && typeof s.lng === 'number') {
        state.set(key(s.lat, s.lng), countryCode + '|' + stateKey)
      }
    }
  }
  return { country, state }
}

// Directional / regional descriptors. If location_name matches one
// of these patterns, the report is regionally-vague — we mark
// location_precision='region' so the map renders it as a fuzzy halo.
//
// DON'T match real state names (North Carolina, South Dakota, West
// Virginia) or real countries (Northern Ireland).
const DIRECTIONAL_PATTERNS: RegExp[] = [
  /^(?:northern|southern|eastern|western|central|northeastern|northwestern|southeastern|southwestern)\s+[A-Za-z\s]+$/i,
  /^(?:north|south|east|west)\s+(?!(?:carolina|dakota|virginia)\b)[A-Za-z\s]+$/i,
  /^(?:pacific\s+northwest|new\s+england|midwest|deep\s+south|mountain\s+west|great\s+lakes|appalachia|bible\s+belt|rust\s+belt|sun\s+belt|four\s+corners)\b/i,
  /^(?:rural|outside|near|around|just\s+outside|right\s+outside|just\s+off|about)\s+[A-Za-z\s]+$/i,
  /^(?:upstate|downstate)\s+[A-Za-z\s]+$/i,
  /^(?:east|west|gulf)\s+coast$/i,
]

function looksDirectional(locationName: string | null): boolean {
  if (!locationName) return false
  const trimmed = locationName.trim()
  if (trimmed.length === 0) return false
  for (const re of DIRECTIONAL_PATTERNS) {
    if (re.test(trimmed)) return true
  }
  return false
}

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
  location_precision: string | null
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('=== Backfill location_precision for vague-location reports ===')
  console.log('Dry run: ' + DRY)
  console.log('Strategy: SET precision="country"/"state" so the map renders these as soft-halo fuzzy pins, NOT NULL the coords.')

  const lookups = buildCentroidLookups()
  console.log('\nCentroid lookups loaded:')
  console.log('  country centroids: ' + lookups.country.size)
  console.log('  state centroids:   ' + lookups.state.size)

  console.log('\nLoading approved reports with non-null lat/lng...')
  const rows = await fetchAllRows<ReportRow>(
    sb.from('reports')
      .select('id, latitude, longitude, location_name, country, location_precision')
      .eq('status', 'approved')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
  )
  console.log('  loaded ' + rows.length + ' pin-renderable reports')

  // Classify each report. Skip if it already has the right precision.
  type Update = { id: string; newPrecision: 'country' | 'region'; reason: string; row: ReportRow }
  const updates: Update[] = []
  let skippedAlreadyCorrect = 0
  let countryHits = 0
  let stateHits = 0
  let directionalHits = 0

  for (const r of rows) {
    const k = key(r.latitude, r.longitude)
    let target: 'country' | 'region' | null = null
    let reason = ''
    if (lookups.country.has(k)) {
      target = 'country'
      reason = 'country-centroid:' + lookups.country.get(k)
      countryHits++
    } else if (lookups.state.has(k)) {
      target = 'region'
      reason = 'state-centroid:' + lookups.state.get(k)
      stateHits++
    } else if (looksDirectional(r.location_name)) {
      target = 'region'
      reason = 'directional:' + (r.location_name || '')
      directionalHits++
    }
    if (!target) continue
    if (r.location_precision === target) {
      skippedAlreadyCorrect++
      continue
    }
    updates.push({ id: r.id, newPrecision: target, reason, row: r })
  }

  console.log('\nClassification:')
  console.log('  Country-centroid hits:        ' + countryHits)
  console.log('  State-centroid hits:          ' + stateHits)
  console.log('  Directional location_name:    ' + directionalHits)
  console.log('  Already correctly marked:     ' + skippedAlreadyCorrect)
  console.log('  TOTAL precision updates:      ' + updates.length)
  console.log('  (' + (Math.round(updates.length / rows.length * 10000) / 100) + '% of pin-renderable corpus needs fixing)')

  // Sample for sanity check
  function sample(reasonPrefix: string, n: number) {
    const subset = updates.filter(u => u.reason.startsWith(reasonPrefix)).slice(0, n)
    if (subset.length === 0) return
    console.log('\nSample (' + reasonPrefix + '):')
    subset.forEach(u => {
      console.log('  [' + u.id.substring(0, 8) + '] "' + (u.row.location_name || '(no name)') + '" | precision: ' + (u.row.location_precision || 'NULL') + ' → ' + u.newPrecision + ' | reason: ' + u.reason.substring(0, 80))
    })
  }
  sample('country-centroid', 5)
  sample('state-centroid', 5)
  sample('directional', 5)

  if (DRY) {
    console.log('\nDRY RUN — exiting before writes.')
    return
  }
  if (updates.length === 0) {
    console.log('Nothing to update.')
    return
  }

  // Apply in bulk. Group by new precision so we can issue 2 multi-row
  // updates (one for 'country', one for 'region') instead of N individual.
  console.log('\nApplying precision backfill...')
  const countryIds = updates.filter(u => u.newPrecision === 'country').map(u => u.id)
  const stateIds = updates.filter(u => u.newPrecision === 'region').map(u => u.id)

  let written = 0
  let errors = 0
  const CHUNK = 100
  const t0 = Date.now()

  async function applyChunked(ids: string[], precision: 'country' | 'region') {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const res = await sb.from('reports')
        .update({ location_precision: precision, updated_at: new Date().toISOString() })
        .in('id', chunk)
      if (res.error) {
        errors++
        console.error('  chunk ' + (i / CHUNK) + ' (' + precision + ') err: ' + res.error.message)
      } else {
        written += chunk.length
      }
      if (written % 500 === 0) {
        const el = Math.round((Date.now() - t0) / 1000)
        console.log('  +' + el + 's  written=' + written + '/' + updates.length)
      }
    }
  }

  await applyChunked(countryIds, 'country')
  await applyChunked(stateIds, 'region')

  const el = Math.round((Date.now() - t0) / 1000)
  console.log('\nDone in ' + el + 's')
  console.log('  Precision updated: ' + written)
  console.log('  Errors: ' + errors)
  console.log('\nNext steps:')
  console.log('  1. Visit /explore?mode=map — affected reports now render as soft-halo fuzzy pins')
  console.log('  2. Coords + location_name unchanged — only precision was adjusted')
  console.log('  3. Choropleth + region totals unaffected (driven by country/state aggregations)')
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1) })
