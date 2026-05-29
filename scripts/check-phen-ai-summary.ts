import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // List distinct categories that exist
  const { data: cats } = await supabase
    .from('phenomena')
    .select('category')
    .not('category', 'is', null)
  const uniq = Array.from(new Set((cats || []).map(r => r.category))).sort()
  console.log('=== Distinct categories ===')
  for (const c of uniq) console.log('  ', c)

  // All NULL ai_summary, sorted by category
  const { data: nulls } = await supabase
    .from('phenomena')
    .select('slug, name, category, report_count, ai_summary, display_blurb')
    .is('ai_summary', null)
    .order('report_count', { ascending: false })
    .limit(50)
  console.log(`\n=== All NULL ai_summary (top 50 by report_count) ===`)
  for (const r of nulls || []) {
    console.log(`  [${r.category}]  ${r.slug}  rc=${r.report_count}  blurb=${r.display_blurb ? 'OK' : 'NULL'}`)
  }
  const { count: totalNull } = await supabase
    .from('phenomena')
    .select('*', { count: 'exact', head: true })
    .is('ai_summary', null)
  const { count: totalAll } = await supabase
    .from('phenomena')
    .select('*', { count: 'exact', head: true })
  console.log(`\n=== TOTAL: ${totalNull}/${totalAll} phenomena have NULL ai_summary ===`)
}
main().catch(e => { console.error(e); process.exit(1) })
