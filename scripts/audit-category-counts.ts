#!/usr/bin/env tsx
/**
 * Ground-truth audit of /Browse-by-Category counts on the Phenomena
 * tab. UI showed religion_mythology = 1 which is suspicious; this
 * script counts rows in the reports table directly to confirm.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-category-counts.ts
 */
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const CATEGORIES = [
  'ufos_aliens',
  'cryptids',
  'ghosts_hauntings',
  'psychic_phenomena',
  'consciousness_practices',
  'psychological_experiences',
  'perception_sensory',
  'religion_mythology',
  'esoteric_practices',
]

// What the UI is currently showing (from the screenshot)
const UI_COUNTS: Record<string, number> = {
  ufos_aliens: 22965,
  cryptids: 3209,
  ghosts_hauntings: 56379,
  psychic_phenomena: 4099,
  consciousness_practices: 9095,
  psychological_experiences: 32866,
  perception_sensory: 290,
  religion_mythology: 1,
  esoteric_practices: 3951,
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 1. Approved count per category (the canonical "browse" number)
  console.log('=== Approved reports by category ===')
  console.log('cat'.padEnd(28) + 'DB'.padStart(8) + 'UI'.padStart(8) + 'delta'.padStart(10))
  let dbTotal = 0
  let uiTotal = 0
  for (const cat of CATEGORIES) {
    const { count, error } = await sb
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('category', cat)
    if (error) { console.error('  ' + cat + ' err: ' + error.message); continue }
    const dbN = count || 0
    const uiN = UI_COUNTS[cat] || 0
    const delta = dbN - uiN
    const marker = Math.abs(delta) > 5 ? '  ← mismatch' : ''
    console.log(cat.padEnd(28) + String(dbN).padStart(8) + String(uiN).padStart(8) + String(delta).padStart(10) + marker)
    dbTotal += dbN
    uiTotal += uiN
  }
  console.log('-'.repeat(54))
  console.log('total'.padEnd(28) + String(dbTotal).padStart(8) + String(uiTotal).padStart(8) + String(dbTotal - uiTotal).padStart(10))

  // 2. Total approved (sanity check vs category sum)
  const { count: allCount } = await sb
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
  console.log('\nAll approved (any category): ' + (allCount || 0))
  console.log('Sum of per-cat approved:     ' + dbTotal)
  console.log('Gap (uncategorized / other): ' + ((allCount || 0) - dbTotal))

  // 3. Distinct category values present in approved reports — catches
  //    drift like 'religion-mythology' vs 'religion_mythology' or a
  //    new value not in the canonical list above.
  console.log('\n=== Distinct category values in approved reports (top 20) ===')
  // Supabase doesn't have a DISTINCT helper, so paginate and dedupe.
  const seen: Record<string, number> = {}
  let from = 0
  const page = 1000
  while (true) {
    const { data } = await sb
      .from('reports')
      .select('category')
      .eq('status', 'approved')
      .range(from, from + page - 1)
    if (!data || data.length === 0) break
    for (const r of data) {
      const c = (r as any).category || '(null)'
      seen[c] = (seen[c] || 0) + 1
    }
    if (data.length < page) break
    from += page
  }
  const sorted = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 20)
  for (const [c, n] of sorted) {
    const marker = CATEGORIES.indexOf(c) === -1 && c !== '(null)' ? '  ← NOT in canonical list' : ''
    console.log('  ' + String(n).padStart(8) + '  ' + c + marker)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
