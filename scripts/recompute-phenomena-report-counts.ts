#!/usr/bin/env tsx
/**
 * Recompute phenomena.report_count from actual report_phenomena junction
 * rows.
 *
 * V11.17.39 — after the classifier sweep, we noticed phenomena.report_count
 * is wildly stale. E.g. near-death-experience shows report_count=0 but
 * actually has 5,067 junction rows. The classifier's
 * "Recomputing report_count for 8 affected phenomena" step only touched
 * a small subset (phenomena where THIS sweep added rows AND something
 * triggered the partial recompute).
 *
 * This script does the full sync: for every active phenomenon, count
 * the junction rows and write back. Safe to re-run; deterministic.
 *
 * Also surfaces phenomena.status='archived' rows that have non-zero
 * link counts — those are orphan junctions where a phenomenon was
 * archived without merging or relinking, so the UI hides the page
 * but reports still point there. Logs them for manual review;
 * doesn't auto-unarchive (admin decision).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/recompute-phenomena-report-counts.ts
 *   npx tsx scripts/recompute-phenomena-report-counts.ts --dry-run
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const DRY = process.argv.indexOf('--dry-run') >= 0

async function main() {
  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Page through all phenomena (id-cursor pagination, same pattern as
  // recategorize). We need ALL of them, including archived ones, so
  // we can surface orphan links.
  console.log('Fetching all phenomena rows...')
  const all: any[] = []
  let lastId = ''
  while (true) {
    let q = s.from('phenomena')
      .select('id, slug, name, status, report_count')
      .order('id', { ascending: true })
      .limit(1000)
    if (lastId) q = q.gt('id', lastId) as any
    const { data, error } = await q
    if (error) { console.error('fetch failed:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    all.push(...data)
    lastId = data[data.length - 1].id
    if (data.length < 1000) break
  }
  console.log('Loaded ' + all.length + ' phenomena rows\n')

  let updated = 0
  let unchanged = 0
  let failed = 0
  const orphans: { slug: string; name: string; status: string; count: number }[] = []
  let processed = 0

  const startMs = Date.now()
  for (const p of all) {
    const r = await s.from('report_phenomena').select('*', { count: 'exact', head: true }).eq('phenomenon_id', p.id)
    if (r.error) { failed++; continue }
    const actual = r.count || 0
    const stored = p.report_count || 0

    if (p.status !== 'active' && actual > 0) {
      orphans.push({ slug: p.slug, name: p.name, status: p.status, count: actual })
    }

    if (actual !== stored) {
      if (!DRY) {
        const { error } = await s.from('phenomena').update({ report_count: actual }).eq('id', p.id)
        if (error) { failed++; continue }
      }
      updated++
    } else {
      unchanged++
    }
    processed++

    if (processed % 200 === 0) {
      const elapsedSec = (Date.now() - startMs) / 1000
      const rate = processed / elapsedSec
      const eta = Math.floor((all.length - processed) / rate)
      console.log('[+' + Math.floor(elapsedSec) + 's] ' + processed + '/' + all.length +
        ' | updated=' + updated + ' unchanged=' + unchanged +
        ' rate=' + rate.toFixed(0) + '/s eta=' + Math.floor(eta / 60) + 'm')
    }
  }

  console.log('\n========== FINAL ==========')
  console.log('Total phenomena:  ' + all.length)
  console.log('Updated:          ' + updated)
  console.log('Unchanged:        ' + unchanged)
  console.log('Failed:           ' + failed)
  console.log()

  if (orphans.length > 0) {
    console.log('========== ORPHAN LINKS — manual review needed ==========')
    console.log('These phenomena are NOT active but have non-zero report links:')
    console.log()
    orphans.sort((a, b) => b.count - a.count)
    for (const o of orphans) {
      console.log('  ' + o.count.toString().padStart(5) + ' links | status=' + o.status.padEnd(10) + ' | ' + o.slug.padEnd(40) + ' | ' + o.name)
    }
    console.log()
    console.log('Decide per row whether to:')
    console.log('  (a) un-archive (UPDATE phenomena SET status=\'active\' WHERE slug=...)')
    console.log('  (b) merge into another phenomenon + re-point junction rows')
    console.log('  (c) leave archived (the links exist but UI hides the page)')
  }
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
