#!/usr/bin/env tsx
/**
 * V11.15.2 — Local mirror of /api/cron/reconcile-phenomena-counts.
 *
 * Recomputes phenomena.report_count from the report_phenomena junction
 * filtered to approved reports, then UPDATEs rows where the cached
 * count differs from the recomputed value.
 *
 * Why use this script vs the cron endpoint:
 *   - Doesn't require an Anthropic/ADMIN_API_KEY round trip
 *   - Doesn't require waiting on a Vercel deploy
 *   - Same logic, runs against the same DB via service-role key
 *
 * Drain-safe: only writes phenomena.report_count.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/reconcile-phenomena-counts.ts --dry-run
 *   tsx scripts/reconcile-phenomena-counts.ts
 */

import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry-run')

async function fetchAllRows<T = any>(query: any, pageSize = 1000): Promise<T[]> {
  const all: T[] = []
  let offset = 0
  while (true) {
    const res = await query.range(offset, offset + pageSize - 1)
    if (res.error) throw new Error(res.error.message)
    const rows = res.data || []
    all.push.apply(all, rows as any)
    if (rows.length < pageSize) break
    offset += pageSize
    if (offset > 2000000) break
  }
  return all
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('=== Reconcile phenomena.report_count from junction ===')
  console.log('Dry run: ' + DRY)

  // 1. Approved report IDs
  console.log('\n1. Loading approved report IDs...')
  const approved = await fetchAllRows<{ id: string }>(
    sb.from('reports').select('id').eq('status', 'approved')
  )
  const approvedSet = new Set(approved.map(r => r.id))
  console.log('   ' + approvedSet.size + ' approved reports')

  // 2. All junction rows
  console.log('\n2. Loading report_phenomena rows...')
  const rp = await fetchAllRows<{ phenomenon_id: string; report_id: string }>(
    sb.from('report_phenomena').select('phenomenon_id, report_id')
  )
  console.log('   ' + rp.length + ' junction rows')

  // 3. Real counts (approved-only)
  console.log('\n3. Computing real counts...')
  const real: Record<string, number> = {}
  for (const row of rp) {
    if (approvedSet.has(row.report_id)) {
      real[row.phenomenon_id] = (real[row.phenomenon_id] || 0) + 1
    }
  }
  console.log('   ' + Object.keys(real).length + ' phenomena have at least 1 approved link')

  // 4. Current cached counts on phenomena
  console.log('\n4. Loading phenomena current counts...')
  const phen = await fetchAllRows<{ id: string; name: string; slug: string; report_count: number | null }>(
    sb.from('phenomena').select('id, name, slug, report_count').eq('status', 'active')
  )
  console.log('   ' + phen.length + ' active phenomena')

  // 5. Compute diffs
  const drift: Array<{ id: string; name: string; slug: string; before: number; after: number }> = []
  for (const p of phen) {
    const after = real[p.id] || 0
    const before = p.report_count || 0
    if (before !== after) drift.push({ id: p.id, name: p.name, slug: p.slug, before, after })
  }
  drift.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before))

  console.log('\n5. Drift report')
  console.log('   ' + drift.length + ' phenomena need their count updated')
  console.log('\n   Top 15 by absolute drift:')
  drift.slice(0, 15).forEach(d => {
    const delta = d.after - d.before
    const sign = delta >= 0 ? '+' : ''
    console.log('     ' + d.slug.padEnd(30) + ' ' + String(d.before).padStart(6) + ' → ' + String(d.after).padStart(6) + '  (' + sign + delta + ')')
  })

  if (DRY) {
    console.log('\nDRY RUN — no writes performed.')
    return
  }

  if (drift.length === 0) {
    console.log('\nNothing to update. Counts are already in sync.')
    return
  }

  console.log('\n6. Applying ' + drift.length + ' updates...')
  let written = 0
  let errors = 0
  const t0 = Date.now()
  for (const d of drift) {
    const res = await sb.from('phenomena')
      .update({ report_count: d.after })
      .eq('id', d.id)
    if (res.error) { errors++; if (errors < 5) console.error('   err: ' + d.slug + ': ' + res.error.message) }
    else written++
    if (written % 100 === 0) {
      const el = Math.round((Date.now() - t0) / 1000)
      console.log('   +' + el + 's  written=' + written + '/' + drift.length)
    }
  }
  const el = Math.round((Date.now() - t0) / 1000)
  console.log('\nDone in ' + el + 's')
  console.log('  Updated: ' + written)
  console.log('  Errors:  ' + errors)
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1) })
