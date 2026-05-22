import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const main = async () => {
  // Search for the two reports by title fragment
  const ids = await sb
    .from('reports')
    .select('id, slug, title, location_name, country, country_code, latitude, longitude, witness_profile, description')
    .or('title.ilike.%Jet Black Cloud%,title.ilike.%Teenage Footsteps%,title.ilike.%Disembodied Head%')
    .limit(5)
  if (ids.error) { console.error(ids.error); return }
  for (const r of ids.data || []) {
    console.log('---')
    console.log('id:', r.id)
    console.log('title:', r.title)
    console.log('location_name:', r.location_name)
    console.log('country:', r.country, '| code:', r.country_code, '| coords:', r.latitude, r.longitude)
    console.log('witness_profile:', JSON.stringify(r.witness_profile))
    console.log('body head:', String(r.description || '').substring(0, 350))
  }
}
main()
