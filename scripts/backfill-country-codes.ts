/**
 * backfill-country-codes.ts — V11.18.53
 *
 * ~14k approved reports have a `country` name but no `country_code`, so they
 * never join to map polygons (the choropleth/region layer ignores them). This
 * maps country name → ISO 3166-1 alpha-2 and fills country_code (NULL only),
 * then refreshes report_region_counts so they appear on the map.
 *
 * Mapping: an alias table (sub-national + common variants) first, then
 * i18n-iso-countries for standard names. Non-countries (Europe, "Unspecified",
 * continents) are skipped and logged. Reversible via snapshot.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-country-codes.ts            # DRY RUN
 *   npx tsx scripts/backfill-country-codes.ts --apply
 *   npx tsx scripts/backfill-country-codes.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'
const countries = require('i18n-iso-countries')
countries.registerLocale(require('i18n-iso-countries/langs/en.json'))

const SNAP = path.resolve(process.cwd(), 'outputs/country-code-backfill-snapshot.json')

// Aliases / sub-national / variants i18n-iso-countries won't resolve on its own.
const ALIAS: Record<string, string | null> = {
  'uk': 'GB', 'u.k.': 'GB', 'great britain': 'GB', 'britain': 'GB',
  'england': 'GB', 'scotland': 'GB', 'wales': 'GB', 'northern ireland': 'GB',
  'usa': 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'america': 'US', 'united states of america': 'US',
  'russia': 'RU', 'south korea': 'KR', 'north korea': 'KP', 'korea': 'KR',
  'czech republic': 'CZ', 'czechia': 'CZ', 'vietnam': 'VN', 'laos': 'LA',
  'iran': 'IR', 'syria': 'SY', 'venezuela': 'VE', 'bolivia': 'BO', 'tanzania': 'TZ',
  'moldova': 'MD', 'turkey': 'TR', 'uae': 'AE', 'united arab emirates': 'AE',
  // explicit non-countries → skip
  'europe': null, 'asia': null, 'africa': null, 'north america': null, 'south america': null,
  'central america': null, 'eastern europe': null, 'western europe': null, 'central europe': null,
  'scandinavia': null, 'caribbean': null, 'middle east': null, 'oceania': null, 'balkans': null,
  'unspecified': null, 'unknown': null, 'n/a': null, 'other': null, 'various': null, 'international': null,
}

function resolve(name: string): string | null {
  const key = name.trim().toLowerCase()
  if (key in ALIAS) return ALIAS[key]
  const code = countries.getAlpha2Code(name.trim(), 'en')
  return code || null
}

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  if (revert) {
    if (!fs.existsSync(SNAP)) { console.error('no snapshot'); process.exit(1) }
    const ids: string[] = JSON.parse(fs.readFileSync(SNAP, 'utf8')).ids || []
    console.log('[cc] REVERT ' + ids.length + ' reports → country_code NULL')
    for (let i = 0; i < ids.length; i += 500) await sb.from('reports').update({ country_code: null }).in('id', ids.slice(i, i + 500))
    console.log('[cc] reverted'); return
  }

  // fetch all approved rows missing country_code
  let rows: any[] = [], from = 0
  while (true) {
    const r = await sb.from('reports').select('id,country').eq('status', 'approved').is('country_code', null).not('country', 'is', null).range(from, from + 999)
    const d2 = r.data || []; rows.push(...d2); if (d2.length < 1000) break; from += 1000
  }
  // group ids by resolved ISO; collect unmapped
  const byIso: Record<string, string[]> = {}
  const unmapped: Record<string, number> = {}
  for (const r of rows) {
    const iso = resolve(r.country)
    if (!iso) { unmapped[r.country] = (unmapped[r.country] || 0) + 1; continue }
    ;(byIso[iso] = byIso[iso] || []).push(r.id)
  }
  const isoKeys = Object.keys(byIso).sort((a, b) => byIso[b].length - byIso[a].length)
  const mappedTotal = isoKeys.reduce((n, k) => n + byIso[k].length, 0)
  const unmappedTotal = Object.values(unmapped).reduce((n, c) => n + c, 0)

  console.log('=== country_code backfill ' + (apply ? '(APPLY)' : '(DRY RUN)') + ' ===')
  console.log('candidates: ' + rows.length + ' | mappable: ' + mappedTotal + ' (' + isoKeys.length + ' countries) | unmappable: ' + unmappedTotal)
  console.log('top mapped: ' + isoKeys.slice(0, 12).map(k => k + ':' + byIso[k].length).join(', '))
  const un = Object.keys(unmapped).sort((a, b) => unmapped[b] - unmapped[a])
  console.log('top unmapped (skipped): ' + un.slice(0, 15).map(k => k + ':' + unmapped[k]).join(', '))

  if (!apply) { console.log('\nDRY RUN — re-run with --apply to write (reversible: --revert).'); return }

  const snapIds: string[] = []
  let done = 0
  for (const iso of isoKeys) {
    const ids = byIso[iso]
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      const u = await sb.from('reports').update({ country_code: iso }).in('id', chunk)
      if (!u.error) { snapIds.push(...chunk); done += chunk.length }
      else console.error('  err ' + iso + ': ' + u.error.message)
    }
  }
  fs.mkdirSync(path.dirname(SNAP), { recursive: true }); fs.writeFileSync(SNAP, JSON.stringify({ savedAt: new Date().toISOString(), ids: snapIds }))
  console.log('updated country_code on ' + done + ' reports (snapshot → --revert)')
  const rf = await sb.rpc('refresh_region_counts')
  console.log('refresh_region_counts: ' + (rf.error ? 'ERR ' + rf.error.message : 'ok'))
}
main().catch(e => { console.error('[cc] unhandled:', e); process.exit(1) })
