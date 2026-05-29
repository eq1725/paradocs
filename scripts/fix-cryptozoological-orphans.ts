#!/usr/bin/env tsx
/**
 * V11.17.41 — Fix 49 reports with deprecated category='cryptozoological'.
 *
 * The "Browse by Category" tile on /explore iterates CATEGORY_CONFIG
 * which lists only the 9 canonical categories. Any report whose
 * reports.category value isn't in that list is invisible in the
 * browse UI. Audit found 49 approved rows with the deprecated
 * 'cryptozoological' value — they predate the V11.17.0 normalization
 * pass and never got swept. Re-category them to 'cryptids'.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/fix-cryptozoological-orphans.ts --dry-run
 *   npx tsx scripts/fix-cryptozoological-orphans.ts --apply
 */
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const args = process.argv.slice(2)
  const apply = args.indexOf('--apply') >= 0
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data, error } = await sb
    .from('reports')
    .select('id, slug, title, status')
    .eq('category', 'cryptozoological')
  if (error) { console.error(error); process.exit(1) }
  const rows = data || []
  console.log('Found ' + rows.length + ' rows with category=cryptozoological')
  if (rows.length === 0) return

  // Status breakdown
  const byStatus: Record<string, number> = {}
  for (const r of rows) byStatus[(r as any).status || '(null)'] = (byStatus[(r as any).status || '(null)'] || 0) + 1
  console.log('By status:')
  for (const [s, n] of Object.entries(byStatus)) console.log('  ' + s.padEnd(20) + ' ' + n)

  console.log('\nFirst 10:')
  for (const r of rows.slice(0, 10)) {
    console.log('  ' + (r as any).id.slice(0, 8) + '  ' + ((r as any).title || '').slice(0, 70))
  }

  if (!apply) {
    console.log('\nDry-run — re-run with --apply to flip category=cryptozoological → cryptids on all ' + rows.length + ' rows.')
    return
  }

  console.log('\nApplying...')
  const { error: upErr, count } = await sb
    .from('reports')
    .update({ category: 'cryptids', updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('category', 'cryptozoological')
  if (upErr) { console.error('Update error: ' + upErr.message); process.exit(1) }
  console.log('Updated: ' + (count ?? rows.length))
}

main().catch((e) => { console.error(e); process.exit(1) })
