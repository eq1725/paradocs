import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const main = async () => {
  const ids = [
    '3d67033d-179e-49cb-887b-0f6b495e3a76',
    'aa4f1779-3cd6-48af-b9ef-4b5a42c9c901',
    'b83223ec-45ba-43ce-8a2e-f85353a52ae7',
  ]
  const { data, error } = await sb
    .from('reports')
    .select('id, slug, title, status, source_label, location_name, country, country_code, latitude, longitude, coords_synthetic, event_date, event_date_precision, paradocs_narrative, paradocs_assessment, metadata')
    .in('id', ids)
  if (error) { console.error(error); return }
  for (const r of data || []) {
    const pq = r.paradocs_assessment?.pull_quote || null
    const frames = r.paradocs_assessment?.frames || []
    console.log('---')
    console.log('id:', r.id)
    console.log('slug:', r.slug)
    console.log('status:', r.status)
    console.log('title:', (r.title || '').substring(0, 90))
    console.log('location:', r.location_name, '| country:', r.country, '| code:', r.country_code, '| synth:', r.coords_synthetic)
    console.log('coords:', r.latitude, r.longitude)
    console.log('event_date:', r.event_date, '(precision:', r.event_date_precision, ')')
    console.log('score:', r.metadata?.quality_score, '/ score_status:', r.metadata?.score_status)
    console.log('pull_quote:', pq ? String(pq).substring(0, 140) : '(null)')
    console.log('narrative head:', r.paradocs_narrative ? String(r.paradocs_narrative).substring(0, 140) : '(null)')
    console.log('frames:', Array.isArray(frames) ? frames.map((f: any) => f.label || f.title || f).join(' | ') : '(none)')
    console.log('public URL:', 'https://www.discoverparadocs.com/report/' + r.slug)
  }
}
main()
