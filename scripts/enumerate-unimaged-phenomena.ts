#!/usr/bin/env tsx
/**
 * V11.17.40 — One-shot enumeration of phenomena with no canonical
 * image. Used to scope backlog #5 (eyewitness-sketch image source).
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/enumerate-unimaged-phenomena.ts
 */

import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // "Unimaged" = no primary_image_url. We also include rows where the
  // url is set but blank, just in case.
  const { data, error } = await sb
    .from('phenomena')
    .select('slug, name, category, report_count, primary_image_url, image_review_score, ai_summary')
    .eq('status', 'active')
    .or('primary_image_url.is.null,primary_image_url.eq.')
    .order('category', { ascending: true })
    .order('report_count', { ascending: false })

  if (error) {
    console.error('ERROR:', error.message)
    process.exit(1)
  }
  const rows = data || []

  console.log('Total unimaged active phenomena: ' + rows.length)
  console.log()

  // Group by category
  const byCat: Record<string, typeof rows> = {}
  for (const r of rows) {
    const c = r.category || '(none)'
    if (!byCat[c]) byCat[c] = []
    byCat[c].push(r)
  }

  for (const cat of Object.keys(byCat).sort()) {
    const items = byCat[cat]
    const totalReports = items.reduce((s, i) => s + (i.report_count || 0), 0)
    console.log(`\n=== ${cat} — ${items.length} phens, ${totalReports} report-links ===`)
    for (const r of items) {
      console.log(`  ${String(r.report_count || 0).padStart(5)} | ${r.slug.padEnd(40)} | ${r.name}`)
    }
  }

  // Per-category summary
  console.log()
  console.log('=== Summary by category ===')
  const sorted = Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)
  for (const [cat, items] of sorted) {
    const totalReports = items.reduce((s, i) => s + (i.report_count || 0), 0)
    console.log(`  ${cat.padEnd(28)} ${String(items.length).padStart(3)} phens   ${totalReports} report-links`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
