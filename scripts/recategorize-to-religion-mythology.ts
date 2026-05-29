#!/usr/bin/env tsx
/**
 * V11.17.41 — Re-category reports that are phenomenon-linked to a
 * religion_mythology phenomenon (djinn, exorcism, demonic-possession,
 * afterlife, the-dreamtime) but currently sit under a different
 * top-level category. Audit found 108 such reports; only 1 was
 * actually category='religion_mythology' so the Browse tile read "1".
 *
 * Rule:
 *   - Pull all active religion_mythology phenomenon ids
 *   - Find approved reports linked to any of them via report_phenomena
 *   - Update reports.category='religion_mythology' for those rows
 *
 * Safety:
 *   - Default dry-run, --apply commits
 *   - Only flips reports currently in {'ghosts_hauntings',
 *     'ufos_aliens', 'psychic_phenomena', 'psychological_experiences',
 *     'perception_sensory'} — these are the populations the audit
 *     showed. Any other current category gets logged but skipped so we
 *     don't surprise on edge cases.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/recategorize-to-religion-mythology.ts --dry-run
 *   npx tsx scripts/recategorize-to-religion-mythology.ts --apply
 */
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const SOURCE_CATEGORIES_ALLOWED = new Set([
  'ghosts_hauntings',
  'ufos_aliens',
  'psychic_phenomena',
  'psychological_experiences',
  'perception_sensory',
  'esoteric_practices',
])

async function main() {
  const apply = process.argv.indexOf('--apply') >= 0
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 1. Religion_mythology phenomena
  const { data: phens } = await sb
    .from('phenomena')
    .select('id, slug')
    .eq('category', 'religion_mythology')
    .eq('status', 'active')
  const phenIds = (phens || []).map((p) => (p as any).id)
  const slugByPhenId: Record<string, string> = {}
  for (const p of phens || []) slugByPhenId[(p as any).id] = (p as any).slug
  console.log('Religion_mythology phenomena (' + phenIds.length + '): ' + (phens || []).map((p) => (p as any).slug).join(', '))
  if (phenIds.length === 0) return

  // 2. All distinct reports linked to any of them
  const reportIds = new Set<string>()
  for (let i = 0; i < phenIds.length; i += 50) {
    const chunk = phenIds.slice(i, i + 50)
    const { data: links } = await sb.from('report_phenomena').select('report_id').in('phenomenon_id', chunk)
    for (const l of links || []) reportIds.add((l as any).report_id)
  }
  console.log('Distinct reports linked: ' + reportIds.size)

  // 3. Pull their current rows
  const rowsToUpdate: { id: string; title: string; current: string }[] = []
  const skipped: { id: string; title: string; current: string }[] = []
  const ids = Array.from(reportIds)
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    const { data: reps } = await sb
      .from('reports')
      .select('id, title, category, status')
      .in('id', chunk)
      .eq('status', 'approved')
    for (const r of reps || []) {
      const current = (r as any).category as string
      if (current === 'religion_mythology') continue  // already correct
      if (SOURCE_CATEGORIES_ALLOWED.has(current)) {
        rowsToUpdate.push({ id: (r as any).id, title: (r as any).title, current })
      } else {
        skipped.push({ id: (r as any).id, title: (r as any).title, current })
      }
    }
  }

  console.log('\nWill flip: ' + rowsToUpdate.length)
  console.log('Will skip (unexpected source category): ' + skipped.length)

  // Source-category breakdown
  const byCat: Record<string, number> = {}
  for (const r of rowsToUpdate) byCat[r.current] = (byCat[r.current] || 0) + 1
  console.log('\nFrom:')
  for (const [c, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + String(n).padStart(4) + '  ' + c)
  }

  if (skipped.length > 0) {
    console.log('\nSkipped (sample):')
    for (const r of skipped.slice(0, 10)) {
      console.log('  ' + r.id.slice(0, 8) + '  [' + r.current + ']  ' + (r.title || '').slice(0, 60))
    }
  }

  if (!apply) {
    console.log('\nDry-run — re-run with --apply to flip these ' + rowsToUpdate.length + ' rows.')
    return
  }

  console.log('\nApplying in chunks of 200...')
  let updated = 0
  for (let i = 0; i < rowsToUpdate.length; i += 200) {
    const chunk = rowsToUpdate.slice(i, i + 200)
    const chunkIds = chunk.map((r) => r.id)
    const { error, count } = await sb
      .from('reports')
      .update({ category: 'religion_mythology', updated_at: new Date().toISOString() }, { count: 'exact' })
      .in('id', chunkIds)
    if (error) { console.error('  chunk error: ' + error.message); continue }
    updated += count ?? chunk.length
    console.log('  +' + (count ?? chunk.length) + ' (running ' + updated + ')')
  }
  console.log('\nDone. Updated ' + updated + ' rows.')
}

main().catch((e) => { console.error(e); process.exit(1) })
