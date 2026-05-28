#!/usr/bin/env tsx
/**
 * Audit approved reports whose stored coords fall outside the country
 * implied by the `country` field. This is the "Cambell, California ->
 * Quebec, Canada" geocode failure class: the geocoder matched a
 * partial / ambiguous place name to a location in the wrong country,
 * and the report now has US/CA state + Canadian/Quebec coords.
 *
 * V11.17.39 — operator spot-check found "Square Object Hovering Over
 * Bay Area Highway" with country=United States, state=California,
 * city=Cambell, lat=45.53, lng=-72.80 — that's Quebec. The geocoder
 * almost certainly matched the typo "Cambell" against a French-
 * Canadian place rather than Campbell, CA. coords_synthetic=false
 * because MapTiler returned a real precise match — just in the wrong
 * country.
 *
 * Detection:
 *   status='approved' AND country IS NOT NULL AND coords IS NOT NULL
 *   AND coords NOT inside the country's bbox
 *
 * Update strategy:
 *   - If state_province is set AND we have a state centroid → swap
 *     to state centroid (mark coords_synthetic=true)
 *   - Else if we have a country centroid → swap to country centroid
 *     (mark coords_synthetic=true)
 *   - Else null out coords (let the report fall through to the
 *     V11.17.39 WorldMapBackdrop)
 *
 * Default DRY-RUN. Use --apply.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-wrong-country-coords.ts --dry-run
 *   npx tsx scripts/audit-wrong-country-coords.ts --apply
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import countryCentroids from '../src/lib/ingestion/utils/country-centroids.json'
import stateCentroids from '../src/lib/ingestion/utils/state-centroids.json'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function parseArgs() {
  const a = process.argv.slice(2)
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),
  }
}

// Country bbox lookup. We only check first-class countries here —
// long-tail false positives are acceptable in this audit, false
// negatives are not. Bboxes are slightly padded to be permissive on
// edge cases (Alaska sticking out for the US, etc.). Values from
// Natural Earth admin0.
const COUNTRY_BBOX: Record<string, { lat: [number, number]; lng: [number, number] }> = {
  US: { lat: [18.0, 72.0], lng: [-180.0, -65.0] },   // includes Alaska, Hawaii, territories
  CA: { lat: [41.0, 84.0], lng: [-141.0, -52.0] },
  MX: { lat: [14.5, 33.0], lng: [-118.5, -86.0] },
  GB: { lat: [49.5, 61.0], lng: [-8.5, 2.0] },
  IE: { lat: [51.4, 55.5], lng: [-10.5, -5.4] },
  AU: { lat: [-44.0, -10.0], lng: [112.0, 154.0] },
  NZ: { lat: [-47.5, -34.0], lng: [166.0, 179.0] },
  DE: { lat: [47.2, 55.1], lng: [5.8, 15.1] },
  FR: { lat: [41.3, 51.1], lng: [-5.2, 9.6] },
  ES: { lat: [35.9, 43.8], lng: [-9.4, 4.4] },
  IT: { lat: [36.6, 47.1], lng: [6.6, 18.6] },
  NL: { lat: [50.7, 53.6], lng: [3.3, 7.3] },
  BE: { lat: [49.5, 51.6], lng: [2.5, 6.4] },
  CH: { lat: [45.8, 47.9], lng: [5.9, 10.5] },
  AT: { lat: [46.4, 49.0], lng: [9.5, 17.2] },
  SE: { lat: [55.3, 69.1], lng: [11.0, 24.2] },
  NO: { lat: [57.9, 71.2], lng: [4.5, 31.1] },
  FI: { lat: [59.7, 70.1], lng: [20.5, 31.6] },
  DK: { lat: [54.5, 57.8], lng: [8.0, 15.2] },
  PL: { lat: [49.0, 54.9], lng: [14.1, 24.2] },
  JP: { lat: [24.0, 45.6], lng: [122.9, 145.8] },
  BR: { lat: [-33.8, 5.3], lng: [-73.9, -34.7] },
  AR: { lat: [-55.2, -21.7], lng: [-73.6, -53.6] },
  CL: { lat: [-56.0, -17.5], lng: [-75.7, -66.4] },
  CO: { lat: [-4.2, 13.4], lng: [-79.0, -66.9] },
  PE: { lat: [-18.4, -0.0], lng: [-81.4, -68.7] },
  IN: { lat: [6.7, 35.5], lng: [68.2, 97.4] },
  ZA: { lat: [-34.8, -22.1], lng: [16.5, 32.9] },
  EG: { lat: [22.0, 31.7], lng: [24.7, 36.9] },
  RU: { lat: [41.2, 81.9], lng: [19.6, 180.0] },
  CN: { lat: [18.2, 53.6], lng: [73.5, 134.8] },
  PH: { lat: [4.6, 21.1], lng: [116.9, 126.6] },
  ID: { lat: [-11.0, 6.1], lng: [95.0, 141.0] },
  TH: { lat: [5.6, 20.5], lng: [97.3, 105.6] },
  VN: { lat: [8.4, 23.4], lng: [102.1, 109.5] },
  TR: { lat: [35.8, 42.1], lng: [25.7, 44.8] },
  IL: { lat: [29.5, 33.3], lng: [34.3, 35.9] },
  GR: { lat: [34.8, 41.7], lng: [19.4, 28.2] },
  PT: { lat: [36.9, 42.2], lng: [-9.5, -6.2] },
}

function buildCountryNameMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [iso2, entry] of Object.entries(countryCentroids as any)) {
    if (typeof entry !== 'object' || !entry || iso2.startsWith('$')) continue
    const e = entry as any
    if (e.name) map[e.name.toLowerCase()] = iso2
    if (Array.isArray(e.aliases)) {
      for (const a of e.aliases) map[String(a).toLowerCase()] = iso2
    }
  }
  return map
}

function buildStateNameMap(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const [iso2, states] of Object.entries(stateCentroids as any)) {
    if (typeof states !== 'object' || !states || iso2.startsWith('$')) continue
    const sub = states as any
    out[iso2] = {}
    for (const [key, entry] of Object.entries(sub)) {
      if (typeof entry !== 'object' || !entry) continue
      const e = entry as any
      out[iso2][key.toLowerCase()] = key
      if (e.name) out[iso2][String(e.name).toLowerCase()] = key
    }
  }
  return out
}

async function main() {
  const args = parseArgs()
  console.log('Audit wrong-country coords — V11.17.39')
  console.log('Mode:', args.apply ? 'APPLY' : 'DRY-RUN')
  console.log()

  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const countryNameMap = buildCountryNameMap()
  const stateNameMap = buildStateNameMap()

  const candidates: any[] = []
  let lastId = ''
  let scanned = 0
  while (true) {
    let q = s.from('reports')
      .select('id, slug, title, country, state_province, city, latitude, longitude, coords_synthetic')
      .eq('status', 'approved')
      .not('country', 'is', null)
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
      const countryRaw = (r.country || '').toString().toLowerCase().trim()
      if (!countryRaw) continue
      const iso2 = countryNameMap[countryRaw]
      if (!iso2) continue
      const bbox = COUNTRY_BBOX[iso2]
      if (!bbox) continue  // no bbox for this country — skip

      const lat = typeof r.latitude === 'number' ? r.latitude : parseFloat(String(r.latitude))
      const lng = typeof r.longitude === 'number' ? r.longitude : parseFloat(String(r.longitude))
      if (isNaN(lat) || isNaN(lng)) continue

      const insideBbox = lat >= bbox.lat[0] && lat <= bbox.lat[1] && lng >= bbox.lng[0] && lng <= bbox.lng[1]
      if (insideBbox) continue

      // Find replacement coords. Prefer state centroid, fall back to
      // country centroid, fall back to null.
      let newLat: number | null = null
      let newLng: number | null = null
      let strategy = 'null'
      const stateRaw = (r.state_province || '').toString().toLowerCase().trim()
      const stateKey = (stateNameMap[iso2] || {})[stateRaw]
      if (stateKey) {
        const stateEntry = ((stateCentroids as any)[iso2] || {})[stateKey]
        if (stateEntry) {
          newLat = stateEntry.lat
          newLng = stateEntry.lng
          strategy = 'state-centroid'
        }
      }
      if (newLat === null) {
        const ce = (countryCentroids as any)[iso2]
        if (ce && typeof ce.lat === 'number' && typeof ce.lng === 'number') {
          newLat = ce.lat
          newLng = ce.lng
          strategy = 'country-centroid'
        }
      }

      candidates.push({
        id: r.id,
        slug: r.slug,
        title: r.title,
        country: r.country,
        state_province: r.state_province,
        city: r.city,
        oldLat: lat,
        oldLng: lng,
        newLat,
        newLng,
        strategy,
      })
    }
    lastId = data[data.length - 1].id
    if (scanned % 5000 === 0) console.log('  scanned: ' + scanned + ' / wrong-country: ' + candidates.length)
    if (data.length < 1000) break
  }

  console.log()
  console.log('Scanned:        ' + scanned)
  console.log('Wrong-country:  ' + candidates.length)
  console.log()

  // Breakdown by strategy
  const byStrategy: Record<string, number> = {}
  for (const c of candidates) byStrategy[c.strategy] = (byStrategy[c.strategy] || 0) + 1
  console.log('By replacement strategy:')
  for (const [k, n] of Object.entries(byStrategy)) console.log('  ' + n + '\t' + k)
  console.log()

  console.log('Sample (30):')
  for (const c of candidates.slice(0, 30)) {
    console.log('  ' + c.id.substring(0, 8) + ' | ' + (c.title || '').substring(0, 60))
    console.log('       claims: ' + c.country + ' / ' + (c.state_province || '-') + ' / ' + (c.city || '-'))
    console.log('       coords:  old=(' + c.oldLat.toFixed(3) + ',' + c.oldLng.toFixed(3) + ') → new=(' +
      (c.newLat !== null ? c.newLat.toFixed(3) : 'null') + ',' +
      (c.newLng !== null ? c.newLng.toFixed(3) : 'null') + ')  [' + c.strategy + ']')
  }
  console.log()

  if (args.dryRun) {
    console.log('Dry-run complete. Re-run with --apply to update ' + candidates.length + ' reports.')
    return
  }
  if (candidates.length === 0) { console.log('Nothing to update.'); return }

  let updated = 0
  let nulled = 0
  let errors = 0
  for (const c of candidates) {
    const update: any = {
      latitude: c.newLat,
      longitude: c.newLng,
      coords_synthetic: c.newLat !== null,
      moderation_notes: 'V11.17.39 — wrong-country geocode audit: coords were in wrong country, replaced via ' + c.strategy,
    }
    const { error } = await s.from('reports').update(update).eq('id', c.id)
    if (error) { errors++; continue }
    if (c.newLat === null) nulled++; else updated++
    if ((updated + nulled) % 100 === 0) console.log('  progress: ' + (updated + nulled) + '/' + candidates.length)
  }

  console.log()
  console.log('========== FINAL ==========')
  console.log('Updated to centroid: ' + updated)
  console.log('Nulled out:          ' + nulled)
  console.log('Errors:              ' + errors)
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
