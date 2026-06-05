#!/usr/bin/env tsx
/**
 * backfill-state-centroid-coords.ts — V11.17.83
 *
 * Backfill reports whose stored coordinates landed at the geographic
 * center of the continental US (the Nominatim/MapTiler country-centroid
 * for "United States" — ~39.78,-100.45 or ~39.83,-98.58) when in fact
 * the report has a known state_province. Swap in the static state
 * centroid from src/lib/ingestion/utils/state-centroids.json instead.
 *
 * Founder bug case (verified):
 *   slug: odd-critter-in-the-road-last-night-ge7ofq
 *   country: "United States", state_province: "New York", city: null
 *   coords stored: (39.78373055, -100.44588212)   ← US center, wrong
 *   coords expected: (~43.30, ~-74.22)            ← NY centroid
 *
 * This complements audit-state-coord-mismatch.ts (which has a broader
 * scope of "any synthetic coords not at the state centroid"). This
 * one is narrower and faster: it only touches rows whose lat/lng sit
 * inside the US-center bucket box. Useful for a targeted clean-up
 * after the V11.17.83 geocoder fix lands.
 *
 * Detection (matches the task spec):
 *   coords_synthetic = TRUE
 *   AND latitude  BETWEEN 38 AND 41
 *   AND longitude BETWEEN -101 AND -97
 *   AND state_province IS NOT NULL
 *   AND state-centroid lookup succeeds for (country, state)
 *
 * Update:
 *   latitude / longitude → state centroid
 *   coords_synthetic = true (these remain synthetic — just to a sharper
 *                            point)
 *   moderation_notes ← annotated
 *
 * Default is DRY-RUN. Use --apply to commit. Chunk size 500.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-state-centroid-coords.ts --dry-run
 *   npx tsx scripts/backfill-state-centroid-coords.ts --apply
 *   npx tsx scripts/backfill-state-centroid-coords.ts --apply --limit 1000
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import countryCentroids from '../src/lib/ingestion/utils/country-centroids.json'
import stateCentroids from '../src/lib/ingestion/utils/state-centroids.json'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// US-center bucket — the bug-coord regime described in the task.
// Inclusive ranges; captures both the MapTiler/Nominatim country
// match (39.78,-100.45) and the static US country centroid (39.83,-98.58).
const LAT_MIN = 38, LAT_MAX = 41
const LNG_MIN = -101, LNG_MAX = -97

// Once we've already moved a coord to its state centroid, leave it
// alone on subsequent runs (idempotency). We detect by checking how
// close the stored coord is to the resolved state centroid.
const STATE_TOLERANCE_DEG = 0.05

const CHUNK = 500

function parseArgs() {
  const a = process.argv.slice(2)
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  function num(n: string, def: number): number {
    const i = a.indexOf(n)
    if (i < 0 || i + 1 >= a.length) return def
    const v = parseInt(a[i + 1], 10)
    return Number.isFinite(v) ? v : def
  }
  return {
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),
    limit: num('--limit', 0), // 0 = no cap
  }
}

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

// Build country-name → ISO2 lookup. Includes the canonical name, the
// ISO2 code, and every alias.
function buildCountryNameMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [iso2, entry] of Object.entries(countryCentroids as any)) {
    if (typeof entry !== 'object' || !entry || iso2.startsWith('$')) continue
    const e = entry as any
    map[iso2.toLowerCase()] = iso2
    if (e.name) map[normalizeKey(e.name)] = iso2
    if (Array.isArray(e.aliases)) {
      for (const a of e.aliases) map[normalizeKey(String(a))] = iso2
    }
  }
  return map
}

// Build state-name → state-key lookup per country.
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
      if (e.name) out[iso2][normalizeKey(String(e.name))] = key
      if (Array.isArray(e.aliases)) {
        for (const al of e.aliases) out[iso2][normalizeKey(String(al))] = key
      }
    }
  }
  return out
}

async function main() {
  const args = parseArgs()
  console.log('backfill-state-centroid-coords — V11.17.83')
  console.log('Mode:  ' + (args.apply ? 'APPLY' : 'DRY-RUN'))
  console.log('Box:   lat ∈ [' + LAT_MIN + ',' + LAT_MAX + '] lng ∈ [' + LNG_MIN + ',' + LNG_MAX + ']')
  console.log('Limit: ' + (args.limit || '(no cap)'))
  console.log()

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
    process.exit(1)
  }

  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const countryNameMap = buildCountryNameMap()
  const stateNameMap = buildStateNameMap()

  // Counters
  let scanned = 0
  let candidates = 0
  let updated = 0
  let errors = 0
  let alreadyAtStateCentroid = 0 // idempotency skip
  let noStateCentroid = 0        // state we don't have in JSON
  let unknownCountry = 0         // country we don't have in JSON
  const perState: Record<string, number> = {}

  // Page through coords_synthetic=true rows in the US-center bucket.
  // Cursor on id ascending — stable + chunked.
  let lastId = ''
  while (true) {
    let q = s.from('reports')
      .select('id, slug, title, country, state_province, city, latitude, longitude, coords_synthetic')
      .eq('coords_synthetic', true)
      .not('state_province', 'is', null)
      .gte('latitude', LAT_MIN).lte('latitude', LAT_MAX)
      .gte('longitude', LNG_MIN).lte('longitude', LNG_MAX)
      .order('id', { ascending: true })
      .limit(CHUNK)
    if (lastId) q = q.gt('id', lastId) as any
    const { data, error } = await q
    if (error) {
      console.error('fetch failed: ' + error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break

    const updates: Array<{ id: string; lat: number; lng: number; stateName: string }> = []

    for (const r of data as any[]) {
      scanned++

      const countryRaw = (r.country || '').toString().trim()
      const iso2 = countryNameMap[normalizeKey(countryRaw)]
      if (!iso2) { unknownCountry++; continue }

      const stateMap = stateNameMap[iso2] || {}
      const stateRaw = (r.state_province || '').toString().trim()
      const stateKey = stateMap[normalizeKey(stateRaw)]
      if (!stateKey) { noStateCentroid++; continue }

      const stateEntry = ((stateCentroids as any)[iso2] || {})[stateKey]
      if (!stateEntry) { noStateCentroid++; continue }

      const lat = typeof r.latitude === 'number' ? r.latitude : parseFloat(String(r.latitude))
      const lng = typeof r.longitude === 'number' ? r.longitude : parseFloat(String(r.longitude))
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

      // Idempotency: if already at the state centroid (within tolerance), skip.
      const dLat = Math.abs(lat - stateEntry.lat)
      const dLng = Math.abs(lng - stateEntry.lng)
      if (dLat < STATE_TOLERANCE_DEG && dLng < STATE_TOLERANCE_DEG) {
        alreadyAtStateCentroid++
        continue
      }

      candidates++
      const tally = iso2 + '/' + stateKey + ' (' + stateEntry.name + ')'
      perState[tally] = (perState[tally] || 0) + 1

      updates.push({
        id: r.id,
        lat: stateEntry.lat,
        lng: stateEntry.lng,
        stateName: stateEntry.name,
      })

      if (args.limit > 0 && candidates >= args.limit) break
    }

    // Commit chunk
    if (args.apply && updates.length > 0) {
      for (const u of updates) {
        const { error: uerr } = await s.from('reports').update({
          latitude: u.lat,
          longitude: u.lng,
          coords_synthetic: true,
          moderation_notes: 'V11.17.83 — backfill-state-centroid-coords: US-center bucket → ' + u.stateName + ' centroid',
        }).eq('id', u.id)
        if (uerr) {
          errors++
          if (errors < 10) console.warn('  update failed for ' + u.id.substring(0, 8) + ': ' + uerr.message)
        } else {
          updated++
        }
      }
      console.log('  chunk: scanned=' + scanned + ' candidates=' + candidates + ' updated=' + updated + ' errors=' + errors)
    } else {
      console.log('  chunk: scanned=' + scanned + ' candidates=' + candidates)
    }

    lastId = data[data.length - 1].id
    if (data.length < CHUNK) break
    if (args.limit > 0 && candidates >= args.limit) break
  }

  console.log()
  console.log('========== FINAL ==========')
  console.log('Scanned:                ' + scanned)
  console.log('Candidates:             ' + candidates)
  console.log('Already at state centroid (skipped): ' + alreadyAtStateCentroid)
  console.log('No state centroid (skipped):         ' + noStateCentroid)
  console.log('Unknown country (skipped):           ' + unknownCountry)
  if (args.apply) {
    console.log('Updated:                ' + updated)
    console.log('Errors:                 ' + errors)
  } else {
    console.log('(dry-run — no updates committed; re-run with --apply)')
  }
  console.log()

  // Per-state breakdown (top 30)
  const sortedStates = Object.entries(perState).sort((a, b) => b[1] - a[1]).slice(0, 30)
  if (sortedStates.length > 0) {
    console.log('Candidates by state (top 30):')
    for (const [k, n] of sortedStates) console.log('  ' + n + '\t' + k)
  }
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
