import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const main = async () => {
  const slug = process.argv[2]
  if (!slug) { console.error('usage: check-report.ts <slug>'); process.exit(1) }
  const { data } = await sb
    .from('reports')
    .select('id, slug, title, description')
    .eq('slug', slug)
    .single()
  if (!data) { console.log('not found'); return }
  console.log('title:', data.title)
  const desc = String(data.description || '')
  // Show any line mentioning british/english/scottish/welsh/uk/britain/england/scotland/wales
  const lines = desc.split(/\n+/)
  console.log('\n--- relevant lines ---')
  for (const ln of lines) {
    if (/\b(britain|british|england|english|scotland|scottish|wales|welsh|uk|united\s+kingdom)\b/i.test(ln)) {
      console.log('>>', ln.substring(0, 200))
    }
  }
}
main()
