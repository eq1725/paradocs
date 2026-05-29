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
  // Show any line mentioning a country-like word
  const COUNTRY_REGEX = /\b(britain|british|england|english|scotland|scottish|wales|welsh|uk|united\s+kingdom|ireland|irish|italy|italian|france|french|germany|german|spain|spanish|portugal|portuguese|netherlands|dutch|belgium|belgian|switzerland|swiss|austria|austrian|sweden|swedish|norway|norwegian|denmark|danish|finland|finnish|poland|polish|russia|russian|china|chinese|japan|japanese|korea|korean|india|indian|pakistan|pakistani|philippines|filipino|vietnam|vietnamese|thailand|thai|indonesia|indonesian|australia|australian|new\s+zealand|canada|canadian|mexico|mexican|brazil|brazilian|argentina|argentine|chile|chilean|peru|peruvian|colombia|colombian|venezuela|venezuelan|ecuador|guatemala|honduras|salvador|panama|nicaragua|costa\s+rica|cuba|cuban|jamaica|haiti|dominican|iceland|icelandic|greece|greek|turkey|turkish|israel|israeli|egypt|egyptian|morocco|south\s+africa|nigeria|kenya|ethiopia|ghana|iran|iranian|iraq|iraqi|afghanistan|afghan|saudi|emirates|lebanon|jordan|nepal|sri\s+lanka|bangladesh|cambodia|laos|myanmar|burma|mongolia|taiwan|hong\s+kong|singapore|malaysia|austria|hungary|romania|bulgaria|ukraine|belarus|czech|slovakia|serbia|croatia|slovenia)\b/i
  const lines = desc.split(/\n+/)
  console.log('\n--- relevant lines ---')
  for (const ln of lines) {
    if (COUNTRY_REGEX.test(ln)) {
      console.log('>>', ln.substring(0, 250))
    }
  }
  if (!COUNTRY_REGEX.test(desc)) {
    console.log('(no country mentions found in description; printing first 500 chars)')
    console.log(desc.substring(0, 500))
  }
}
main()
