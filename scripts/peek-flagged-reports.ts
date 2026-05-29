#!/usr/bin/env tsx
/**
 * One-shot inspect of the 4 operator-flagged reports — pull their
 * full row so we can see what location fields they actually have,
 * why the map header is rendering Africa, and verify source.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/peek-flagged-reports.ts
 */
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const TITLES = [
  'UFO researcher reports their YouTube algorithm shifted',  // partial — feed_hook fragment
  'Invisible Trails in Open Desert',
  'Hiker Loses Keys During Florida Heat',
  'Charging Bull Elephant Pursues Safari Vehicle',
]

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  for (const titleFrag of TITLES) {
    const { data, error } = await sb
      .from('reports')
      .select('id, slug, title, status, source_type, source_url, source_label, country, country_code, state_province, location_name, latitude, longitude, coords_synthetic, category, feed_hook, created_at, metadata')
      .ilike('title', '%' + titleFrag + '%')
      .limit(3)
    if (error) { console.error(titleFrag, error.message); continue }
    if (!data || data.length === 0) {
      // Try matching against feed_hook for the algorithm one
      const { data: hookData } = await sb
        .from('reports')
        .select('id, slug, title, status, source_type, source_url, source_label, country, country_code, state_province, location_name, latitude, longitude, coords_synthetic, category, feed_hook, created_at, metadata')
        .ilike('feed_hook', '%' + titleFrag + '%')
        .limit(3)
      if (hookData && hookData.length > 0) {
        for (const r of hookData) {
          dump(r, 'matched via feed_hook')
        }
        continue
      }
      console.log(`\n[${titleFrag}] no match`)
      continue
    }
    for (const r of data) dump(r, 'matched via title')
  }
}

function dump(r: any, how: string) {
  console.log('\n=========================')
  console.log(`(${how})`)
  console.log('  id:           ' + r.id)
  console.log('  slug:         ' + r.slug)
  console.log('  title:        ' + r.title)
  console.log('  status:       ' + r.status)
  console.log('  category:     ' + r.category)
  console.log('  source_type:  ' + r.source_type)
  console.log('  source_url:   ' + r.source_url)
  console.log('  source_label: ' + r.source_label)
  console.log('  country:      ' + r.country + '   country_code: ' + r.country_code)
  console.log('  state_prov:   ' + r.state_province)
  console.log('  location_name:' + r.location_name)
  console.log('  lat/lng:      ' + r.latitude + ' / ' + r.longitude + '   synthetic=' + r.coords_synthetic)
  console.log('  created_at:   ' + r.created_at)
  console.log('  feed_hook:    ' + (r.feed_hook ? String(r.feed_hook).slice(0, 240) : '(null)'))
  if (r.metadata) {
    const md = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata
    console.log('  metadata.location_precision: ' + (md.location_precision || '(none)'))
    console.log('  metadata.source_excerpt:     ' + (md.source_excerpt ? String(md.source_excerpt).slice(0, 200) : '(none)'))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
