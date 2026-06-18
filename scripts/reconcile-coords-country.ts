/**
 * reconcile-coords-country.ts — V11.18.56
 *
 * Map pins are placed by lat/lng; the choropleth colors by country_code. They
 * disagree when geocoding mis-resolved a coordinate (e.g. Jordan reports pinned
 * in Yemen). Policy (precision-first): the stated country is authoritative; the
 * coordinate is only trusted to validate/fill, never to overwrite a good country.
 *
 * Per approved report WITH coordinates, reverse-geocode lat/lng (offline,
 * @rapideditor/country-coder) and:
 *   - coord-country == country_code        → keep (consistent).
 *   - country_code missing + coord on land → set country_code = coord-country (fill).
 *   - coord-country != country_code         → NULL the coordinate (unverifiable pin);
 *                                             keep country_code; flag for re-geocode.
 *   - coord in open ocean + has country_code→ NULL the coordinate (pin at sea is wrong).
 *
 * Cursor-resumable (order by id), reversible (snapshot), flags mismatches to
 * outputs/coord-country-mismatches.json. Refreshes report_region_counts when done.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/reconcile-coords-country.ts --dry-run
 *   npx tsx scripts/reconcile-coords-country.ts --apply     # loop until "remaining: done"
 *   npx tsx scripts/reconcile-coords-country.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'
const cc = require('@rapideditor/country-coder')

const SNAP = path.resolve(process.cwd(), 'outputs/reconcile-coords-snapshot.json')
const CURSOR = path.resolve(process.cwd(), 'outputs/reconcile-coords-cursor.json')
const FLAGS = path.resolve(process.cwd(), 'outputs/coord-country-mismatches.json')
const DEADLINE_MS = 35000

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  if (revert) {
    const snap = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')).rows || [] : []
    console.log('[reconcile] REVERT ' + snap.length + ' rows')
    for (let i = 0; i < snap.length; i += 100) {
      for (const r of snap.slice(i, i + 100)) {
        await sb.from('reports').update({ country_code: r.country_code, latitude: r.latitude, longitude: r.longitude, coords_synthetic: r.coords_synthetic }).eq('id', r.id)
      }
    }
    console.log('[reconcile] reverted'); return
  }

  const cur = (apply && fs.existsSync(CURSOR)) ? JSON.parse(fs.readFileSync(CURSOR, 'utf8')) : { lastId: '', agree: 0, fill: 0, mismatch: 0, oceanNull: 0, scanned: 0 }
  const snap: any[] = (apply && fs.existsSync(SNAP)) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')).rows || [] : []
  const flags: any[] = (apply && fs.existsSync(FLAGS)) ? JSON.parse(fs.readFileSync(FLAGS, 'utf8')) : []
  const fillsByCode: Record<string, string[]> = {}
  const nullIds: string[] = []
  const deadline = Date.now() + DEADLINE_MS
  let lastId = cur.lastId || ''

  while (Date.now() < deadline) {
    let q = sb.from('reports').select('id,country_code,latitude,longitude,coords_synthetic')
      .eq('status', 'approved').not('latitude', 'is', null).order('id', { ascending: true }).limit(1000)
    if (lastId) q = q.gt('id', lastId)
    const r = await q
    const rows = r.data || []
    if (rows.length === 0) { cur.done = true; break }
    for (const x of rows) {
      cur.scanned++
      const coordC = cc.iso1A2Code([parseFloat(x.longitude), parseFloat(x.latitude)])
      const stated = x.country_code
      if (!coordC) { // coordinate not on any land (open ocean / no-country)
        if (stated) { cur.oceanNull++; if (apply) { snap.push(x); nullIds.push(x.id) } }
        continue
      }
      if (!stated) { cur.fill++; if (apply) { snap.push(x); (fillsByCode[coordC] = fillsByCode[coordC] || []).push(x.id) } ; continue }
      if (coordC === stated) { cur.agree++; continue }
      // mismatch — coordinate is the suspect
      cur.mismatch++
      if (apply) { snap.push(x); nullIds.push(x.id); flags.push({ id: x.id, country_code: stated, coord_country: coordC, latitude: x.latitude, longitude: x.longitude }) }
    }
    lastId = rows[rows.length - 1].id
    cur.lastId = lastId
    if (rows.length < 1000) { cur.done = true; break }
  }

  if (apply) {
    // fills: group by target country_code
    for (const code of Object.keys(fillsByCode)) {
      const ids = fillsByCode[code]
      for (let i = 0; i < ids.length; i += 200) await sb.from('reports').update({ country_code: code }).in('id', ids.slice(i, i + 200))
    }
    // nulls: clear unverifiable coordinates (keep country_code)
    for (let i = 0; i < nullIds.length; i += 200) await sb.from('reports').update({ latitude: null, longitude: null, coords_synthetic: false }).in('id', nullIds.slice(i, i + 200))
    fs.mkdirSync(path.dirname(SNAP), { recursive: true })
    fs.writeFileSync(SNAP, JSON.stringify({ rows: snap }))
    fs.writeFileSync(FLAGS, JSON.stringify(flags))
    fs.writeFileSync(CURSOR, JSON.stringify(cur))
  }

  console.log('=== reconcile coords↔country ' + (apply ? '(APPLY)' : '(DRY RUN sample)') + ' ===')
  console.log('scanned: ' + cur.scanned + ' | agree: ' + cur.agree + ' | filled: ' + cur.fill + ' | mismatch→nulled: ' + cur.mismatch + ' | ocean→nulled: ' + cur.oceanNull)
  console.log(cur.done ? 'remaining: done ✓' : 'remaining: more — re-run to continue (cursor @ ' + lastId.slice(0, 8) + ')')
  if (apply && cur.done) { const rf = await sb.rpc('refresh_region_counts'); console.log('refresh_region_counts: ' + (rf.error ? 'ERR ' + rf.error.message : 'ok') + ' | flagged mismatches → outputs/coord-country-mismatches.json (' + flags.length + ')') }
}
main().catch(e => { console.error('[reconcile] unhandled:', e); process.exit(1) })
