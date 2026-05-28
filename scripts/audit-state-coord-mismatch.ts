#!/usr/bin/env tsx
/**
 * Audit approved reports where state_province is set but the stored
 * coordinates sit at the COUNTRY centroid (not the state centroid).
 *
 * V11.17.39 — operator spot-check flagged a California report
 * ("Three Roommates Receive Identical Mystery Group Text") whose
 * map header showed a blip in the center of the USA (Kansas-ish)
 * rather than California. Cause: the report was ingested before the
 * V10.8.C normalizeLocation chain was hardened, or the geocoder fell
 * through past the state-centroid step. Either way the coords now
 * point to US country centroid (39.5, -98.5) despite
 * state_province='California' being correctly extracted.
 *
 * Detection:
 *   status='approved' AND state_province IS NOT NULL AND
 *   coords are within ±1° of the report's country centroid AND
 *   state-centroid lookup succeeds (we have a known centroid to swap in)
 *
 * Update:
 *   lat/lng → state centroid from src/lib/ingestion/utils/state-centroids.json
 *   coords_synthetic = true (these are centroid fallbacks)
 *
 * Default DRY-RUN. Use --apply to commit.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-state-coord-mismatch.ts --dry-run
 *   npx tsx scripts/audit-state-coord-mismatch.ts --apply
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import countryCentroids from '../src/lib/ingestion/utils/country-centroids.json'
import stateCentroids from '../src/lib/ingestion/utils/state-centroids.json'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const COUNTRY_TOLERANCE_DEG = 1.0  // ~111km — coords this close to country centroid are almost certainly the centroid

function parseArgs() {
  const a = process.argv.slice(2)
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),
  }
}

// Build country-name → ISO2 lookup from country-centroids aliases.
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
      if (e.name) out[iso2][String(e.name).toLowerCase()] = key
    }
  }
  return out
}

async function main() {
  const args = parseArgs()
  console.log('Audit state-coord mismatch — V11.17.39')
  console.log('Mode:', args.apply ? 'APPLY' : 'DRY-RUN')
  console.log()

  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const countryNameMap = buildCountryNameMap()
  const stateNameMap = buildStateNameMap()

  // Page through approved reports with state_province + coords set.
  const candidates: any[] = []
  let lastId = ''
  let scanned = 0
  while (true) {
    let q = s.from('reports')
      .select('id, slug, title, country, state_province, city, latitude, longitude, coords_synthetic')
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
      // Resolve country → ISO2
      const countryRaw = (r.country || '').toString().toLowerCase().trim()
      if (!countryRaw) continue
      const iso2 = countryNameMap[countryRaw]
      if (!iso2) continue
      const countryEntry = (countryCentroids as any)[iso2]
      if (!countryEntry) continue

      const lat = typeof r.latitude === 'number' ? r.latitude : parseFloat(String(r.latitude))
      const lng = typeof r.longitude === 'number' ? r.longitude : parseFloat(String(r.longitude))
      if (isNaN(lat) || isNaN(lng)) continue

      // Are coords near country centroid?
      const dLat = Math.abs(lat - countryEntry.lat)
      const dLng = Math.abs(lng - countryEntry.lng)
      if (dLat > COUNTRY_TOLERANCE_DEG || dLng > COUNTRY_TOLERANCE_DEG) continue  // coords look real

      // We need a state centroid to swap in. Look up by state name.
      const stateMap = stateNameMap[iso2] || {}
      const stateRaw = (r.state_province || '').toString().toLowerCase().trim()
      const stateKey = stateMap[stateRaw]
      if (!stateKey) continue  // unknown state — leave alone, MapTiler is supposed to handle long-tail

      const stateEntry = ((stateCentroids as any)[iso2] || {})[stateKey]
      if (!stateEntry) continue

      candidates.push({
        id: r.id,
        slug: r.slug,
        title: r.title,
        country: r.country,
        state_province: r.state_province,
        oldLat: lat,
        oldLng: lng,
        newLat: stateEntry.lat,
        newLng: stateEntry.lng,
        iso2,
        stateKey,
        stateName: stateEntry.name,
      })
    }
    lastId = data[data.length - 1].id
    if (scanned % 5000 === 0) console.log('  scanned: ' + scanned + ' / mismatches: ' + candidates.length)
    if (data.length < 1000) break
  }

  console.log()
  console.log('Scanned:    ' + scanned)
  console.log('Mismatched: ' + candidates.length)
  console.log()

  // Per-state breakdown
  const perState: Record<string, number> = {}
  for (const c of candidates) {
    const key = c.iso2 + '/' + c.stateKey + ' (' + c.stateName + ')'
    perState[key] = (perState[key] || 0) + 1
  }
  console.log('By state (top 30):')
  const sortedStates = Object.entries(perState).sort((a, b) => b[1] - a[1]).slice(0, 30)
  for (const [k, n] of sortedStates) console.log('  ' + n + '\t' + k)
  console.log()

  // Sample
  console.log('Sample (30):')
  for (const c of candidates.slice(0, 30)) {
    console.log('  ' + c.id.substring(0, 8) + ' | ' + (c.title || '').substring(0, 70))
    console.log('       ' + c.country + ' / ' + c.state_province +
      ' | old=(' + c.oldLat.toFixed(3) + ',' + c.oldLng.toFixed(3) + ')' +
      ' → new=(' + c.newLat.toFixed(3) + ',' + c.newLng.toFixed(3) + ')')
  }
  console.log()

  if (args.dryRun) {
    console.log('Dry-run complete. Re-run with --apply to update ' + candidates.length + ' reports.')
    return
  }
  if (candidates.length === 0) { console.log('Nothing to update.'); return }

  let updated = 0
  let errors = 0
  for (const c of candidates) {
    const { error } = await s.from('reports').update({
      latitude: c.newLat,
      longitude: c.newLng,
      coords_synthetic: true,
      moderation_notes: 'V11.17.39 — coord audit: country centroid → state centroid (' + c.stateName + ')',
    }).eq('id', c.id)
    if (error) { errors++; continue }
    updated++
    if (updated % 100 === 0) console.log('  updated: ' + updated + '/' + candidates.length)
  }

  console.log()
  console.log('========== FINAL ==========')
  console.log('Updated: ' + updated)
  console.log('Errors:  ' + errors)
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
