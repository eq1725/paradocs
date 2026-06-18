/**
 * refresh-region-counts.ts — keeps the map choropleth (report_region_counts MV)
 * fresh. The batch ingest scripts call refresh_region_counts(), but the
 * continuous CA daemon doesn't, so this is run on a daily schedule as insurance.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/refresh-region-counts.ts
 */
import * as path from 'path'
async function main() {
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const r = await sb.rpc('refresh_region_counts')
  const c = (await sb.from('report_region_counts').select('country_code', { count: 'exact', head: true })).count
  console.log('refresh_region_counts: ' + (r.error ? 'ERR ' + r.error.message : 'ok') + ' | report_region_counts rows: ' + c)
  if (r.error) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
