import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
async function main() {
  const slugs = ['astral-projection', 'lucid-dreaming', 'out-of-body-experience',
    'near-death-experience', 'shared-death-experience', 'after-death-communication',
    'remote-viewing', 'premonition']
  const { data } = await supabase
    .from('phenomena')
    .select('slug, name, ai_summary, display_blurb')
    .in('slug', slugs)
  for (const r of data || []) {
    console.log(`\n--- ${r.slug} (${r.name}) ---`)
    console.log('ai_summary:', r.ai_summary)
    console.log('display_blurb:', r.display_blurb)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
