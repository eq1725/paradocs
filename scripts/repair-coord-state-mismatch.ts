#!/usr/bin/env tsx
/**
 * V11.32 — Repair approved reports whose stored coordinates fall OUTSIDE
 * the claimed state_province's bounding box.
 *
 * This is the "ambiguous city name geocoded to the wrong state" class —
 * the geocoder took the most-prominent hit for a name that exists in
 * several states ("Lumberton, Texas" → Lumberton, NC; "Portland, Maine"
 * → Portland, OR; the Washington-state ↔ Washington-DC cluster). In every
 * flagged row the TEXT (location_name + state_province) is correct and the
 * COORDINATE is the wrong field, so we trust the state and re-derive coords.
 *
 * Detection (matches scripts/audit-state-coord-mismatch.ts in spirit, but
 * keys off a real-coordinate bbox miss, not coords_synthetic):
 *   status='approved' AND country is US AND state_province resolves to a
 *   known 2-letter key AND (lat,lng) is OUTSIDE that state's bbox (±0.5°).
 *
 * Repair, per row:
 *   1. If the row has a city, re-geocode "city, state, USA" CONSTRAINED to
 *      the state bbox (MapTiler bbox= / Nominatim viewbox+bounded). A hit
 *      inside the bbox → precise coords, coords_synthetic=false.
 *   2. Otherwise (no city, or constrained geocode misses) → state centroid,
 *      coords_synthetic=true, location_precision='region'.
 *
 * Default DRY-RUN. Use --apply to commit. --limit N caps rows (testing).
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/repair-coord-state-mismatch.ts --dry-run
 *   npx tsx scripts/repair-coord-state-mismatch.ts --apply
 *   npx tsx scripts/repair-coord-state-mismatch.ts --apply --limit 5
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import stateBBoxes from '../src/lib/ingestion/utils/state-bboxes.json'
import stateCentroids from '../src/lib/ingestion/utils/state-centroids.json'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const MARGIN = 0.5

// Full state name → 2-letter key (DB stores a mix of full names and abbrevs).
const NAME2ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
}

const US_BBOX = (stateBBoxes as unknown as Record<string, Record<string, number[]>>).US
const US_CENTROIDS = (stateCentroids as unknown as Record<string, Record<string, { name: string; lat: number; lng: number }>>).US

function stateKeyOf(s: string | null | undefined): string | null {
  if (!s) return null
  const t = String(s).trim()
  if (t.length === 2 && US_BBOX[t.toUpperCase()]) return t.toUpperCase()
  return NAME2ABBR[t.toLowerCase()] || null
}

function inBBox(bb: number[], lat: number, lng: number): boolean {
  return lng >= bb[0] - MARGIN && lng <= bb[2] + MARGIN && lat >= bb[1] - MARGIN && lat <= bb[3] + MARGIN
}

function parseArgs() {
  const a = process.argv.slice(2)
  const has = (n: string) => a.indexOf(n) >= 0
  const limIdx = a.indexOf('--limit')
  const limit = limIdx >= 0 ? parseInt(a[limIdx + 1] || '0', 10) : 0
  return { apply: has('--apply'), dryRun: has('--dry-run') || !has('--apply'), limit }
}

function getMapTilerKey(): string | null {
  return process.env.MAPTILER_GEOCODING_KEY || process.env.MAPTILER_API_KEY ||
    process.env.NEXT_PUBLIC_MAPTILER_KEY || process.env.MAPTILER_KEY || null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Constrained geocode: only accept a hit that lands inside the state bbox.
const geoCache = new Map<string, { lat: number; lng: number } | null>()
async function geocodeInState(city: string, stateName: string, bb: number[]): Promise<{ lat: number; lng: number } | null> {
  const key = (city + '|' + stateName).toLowerCase()
  if (geoCache.has(key)) return geoCache.get(key)!
  const q = [city, stateName, 'USA'].join(', ')
  let hit: { lat: number; lng: number } | null = null
  const mtKey = getMapTilerKey()
  try {
    if (mtKey) {
      // MapTiler bbox = minLng,minLat,maxLng,maxLat = [w,s,e,n]
      const url = 'https://api.maptiler.com/geocoding/' + encodeURIComponent(q) +
        '.json?key=' + mtKey + '&limit=1&bbox=' + [bb[0], bb[1], bb[2], bb[3]].join(',')
      const r = await fetch(url)
      if (r.ok) {
        const d: any = await r.json()
        const f = d.features && d.features[0]
        const c = f && (f.center || (f.geometry && f.geometry.coordinates))
        if (c) hit = { lat: c[1], lng: c[0] }
      }
    } else {
      // Nominatim viewbox = left,top,right,bottom = w,n,e,s ; bounded=1
      const url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) +
        '&format=json&limit=1&bounded=1&viewbox=' + [bb[0], bb[3], bb[2], bb[1]].join(',')
      const r = await fetch(url, { headers: { 'User-Agent': 'Paradocs/1.0 (www.discoverparadocs.com)' } })
      if (r.ok) {
        const d: any = await r.json()
        if (Array.isArray(d) && d[0]) hit = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
      }
      await sleep(1100) // Nominatim 1 req/s policy
    }
  } catch {
    hit = null
  }
  if (hit && (isNaN(hit.lat) || isNaN(hit.lng) || !inBBox(bb, hit.lat, hit.lng))) hit = null
  geoCache.set(key, hit)
  return hit
}

async function main() {
  const args = parseArgs()
  console.log('Repair coord/state mismatch — V11.32')
  console.log('Mode:', args.apply ? 'APPLY' : 'DRY-RUN', args.limit ? '(limit ' + args.limit + ')' : '')
  console.log('Geocoder:', getMapTilerKey() ? 'MapTiler (bbox-constrained)' : 'Nominatim (viewbox-bounded, ~1 req/s)')
  console.log()

  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 1) Scan: page all approved US rows with state + coords; flag bbox misses.
  const flagged: any[] = []
  let lastId = ''
  let scanned = 0
  while (true) {
    let q = s.from('reports')
      .select('id, slug, title, location_name, city, state_province, country, country_code, latitude, longitude, coords_synthetic')
      .eq('status', 'approved')
      .not('state_province', 'is', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('id', { ascending: true })
      .limit(1000)
    if (lastId) q = q.gt('id', lastId) as any
    const { data, error } = await q
    if (error) { console.error('fetch failed:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    for (const r of data as any[]) {
      scanned++
      const cc = (r.country_code || '').toUpperCase()
      const cn = (r.country || '').toLowerCase()
      const isUS = cc === 'US' || cn === 'united states' || cn === 'usa' || cn === 'united states of america'
      if (!isUS) continue
      const key = stateKeyOf(r.state_province)
      if (!key) continue
      const bb = US_BBOX[key]
      if (!bb) continue
      const lat = typeof r.latitude === 'number' ? r.latitude : parseFloat(String(r.latitude))
      const lng = typeof r.longitude === 'number' ? r.longitude : parseFloat(String(r.longitude))
      if (isNaN(lat) || isNaN(lng)) continue
      if (!inBBox(bb, lat, lng)) flagged.push({ ...r, _key: key, _bb: bb, _lat: lat, _lng: lng })
    }
    lastId = (data as any[])[data.length - 1].id
    if (data.length < 1000) break
  }

  console.log('Scanned approved US-with-state: ' + scanned)
  console.log('Flagged (coords outside state bbox): ' + flagged.length)
  console.log()

  const work = args.limit ? flagged.slice(0, args.limit) : flagged

  // 2) Repair each flagged row.
  let precise = 0, centroid = 0, skipped = 0, updated = 0, errors = 0
  for (const r of work) {
    const centroidEntry = US_CENTROIDS[r._key]
    let newLat: number | null = null
    let newLng: number | null = null
    let synthetic = false
    let how = ''

    const city = (r.city || '').toString().trim()
    if (city) {
      const hit = await geocodeInState(city, centroidEntry?.name || r.state_province, r._bb)
      if (hit) { newLat = hit.lat; newLng = hit.lng; synthetic = false; how = 'precise'; precise++ }
    }
    if (newLat === null && centroidEntry) {
      newLat = centroidEntry.lat; newLng = centroidEntry.lng; synthetic = true; how = 'centroid'; centroid++
    }
    if (newLat === null) { skipped++; continue }

    console.log(
      '  ' + r.id.slice(0, 8) + ' [' + how + '] ' + (r.state_province || '') +
      ' | (' + r._lat.toFixed(3) + ',' + r._lng.toFixed(3) + ') -> (' +
      newLat.toFixed(3) + ',' + newLng!.toFixed(3) + ') | ' + String(r.location_name || r.title || '').slice(0, 50),
    )

    if (args.apply) {
      const patch: any = {
        latitude: newLat,
        longitude: newLng,
        coords_synthetic: synthetic,
        moderation_notes: 'V11.32 coord/state repair: ' + how + ' (' + (centroidEntry?.name || r.state_province) + ')',
      }
      if (synthetic) patch.location_precision = 'region'
      const { error } = await s.from('reports').update(patch).eq('id', r.id)
      if (error) { errors++; console.warn('    update failed:', error.message) }
      else { updated++ }
    }
  }

  console.log()
  console.log('========== SUMMARY ==========')
  console.log('Flagged:        ' + flagged.length)
  console.log('Precise re-geo: ' + precise)
  console.log('State centroid: ' + centroid)
  console.log('Skipped (no fix path): ' + skipped)
  if (args.apply) {
    console.log('Updated:        ' + updated)
    console.log('Errors:         ' + errors)
  } else {
    console.log('\nDry-run only. Re-run with --apply to commit ' + (precise + centroid) + ' updates.')
  }
}

main().catch((e) => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
