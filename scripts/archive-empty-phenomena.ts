#!/usr/bin/env tsx
/**
 * One-shot bulk archive of active phenomena with zero report links.
 *
 * V11.17.39 — operator decided after reviewing the emptiness CSV that
 * the simplest threshold is: archive everything with junction_links=0
 * AND report_count_cached=0. This is the long tail of taxonomy entries
 * that have no current reports and never received any during ingestion.
 *
 * Soft-delete (status='archived') so anything can be restored later via
 * `UPDATE phenomena SET status='active' WHERE slug = '...';`
 *
 * Safety check before applying: re-queries report_phenomena junction
 * count for each candidate (don't trust the cached column alone).
 * Anything with >0 actual junction rows is excluded from the archive
 * batch as a sanity guard.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/archive-empty-phenomena.ts --dry-run
 *   npx tsx scripts/archive-empty-phenomena.ts --apply
 *   npx tsx scripts/archive-empty-phenomena.ts --apply --category cryptids
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string | null = null): string | null { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),  // default to dry-run unless --apply
    category: flag('--category'),  // optionally scope to one category
    note: flag('--note', 'V11.17.39 taxonomy round 1 — 0 junction links + 0 cached count'),
  }
}

async function main() {
  const args = parseArgs()
  console.log('Archive empty phenomena — V11.17.39')
  console.log('Mode:', args.apply ? 'APPLY' : 'DRY-RUN')
  if (args.category) console.log('Scope: category=' + args.category)
  console.log('Note:', args.note)
  console.log()

  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 1) Find candidates: status='active' AND (report_count = 0 OR NULL)
  console.log('Finding candidates (status=active, report_count=0 OR null)...')
  let q = s.from('phenomena')
    .select('id, slug, name, category, report_count')
    .eq('status', 'active')
    .or('report_count.eq.0,report_count.is.null')
  if (args.category) q = q.eq('category', args.category) as any

  // Paginate (Supabase default page cap = 1000 rows)
  const candidates: any[] = []
  let lastId = ''
  while (true) {
    let pageQ = q
    if (lastId) pageQ = pageQ.gt('id', lastId) as any
    const { data, error } = await pageQ.order('id', { ascending: true }).limit(1000) as any
    if (error) { console.error('fetch failed:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    candidates.push(...data)
    lastId = data[data.length - 1].id
    if (data.length < 1000) break
  }
  console.log('Candidates with report_count=0/null: ' + candidates.length)
  console.log()

  // 2) Sanity check: re-verify junction count for each candidate.
  // If anything has >0 real junction rows, exclude it (cache was stale).
  console.log('Sanity-checking actual junction counts (this takes ~2-3 min)...')
  const willArchive: any[] = []
  const skipped: any[] = []
  const startMs = Date.now()
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const r = await s.from('report_phenomena').select('*', { count: 'exact', head: true }).eq('phenomenon_id', c.id)
    if ((r.count || 0) === 0) {
      willArchive.push(c)
    } else {
      skipped.push({ ...c, actual_junctions: r.count })
    }
    if ((i + 1) % 200 === 0) {
      const elapsedSec = (Date.now() - startMs) / 1000
      const rate = (i + 1) / elapsedSec
      const eta = Math.floor((candidates.length - i - 1) / rate)
      console.log('  [+' + Math.floor(elapsedSec) + 's] checked=' + (i + 1) + '/' + candidates.length + ' rate=' + rate.toFixed(0) + '/s eta=' + Math.floor(eta / 60) + 'm')
    }
  }

  console.log()
  console.log('=== Pre-flight ===')
  console.log('Will archive:                ' + willArchive.length)
  console.log('Skipped (stale cache, has links): ' + skipped.length)
  if (skipped.length > 0 && skipped.length < 30) {
    console.log('  Skipped because they actually have junction rows:')
    for (const sk of skipped) {
      console.log('    ' + sk.slug.padEnd(40) + ' | ' + sk.name.padEnd(40) + ' | actual=' + sk.actual_junctions)
    }
  } else if (skipped.length >= 30) {
    console.log('  (' + skipped.length + ' rows skipped — first 30 shown)')
    for (const sk of skipped.slice(0, 30)) {
      console.log('    ' + sk.slug.padEnd(40) + ' | actual=' + sk.actual_junctions)
    }
  }
  console.log()

  // By category breakdown
  const byCat: Record<string, number> = {}
  for (const c of willArchive) byCat[c.category] = (byCat[c.category] || 0) + 1
  console.log('Will-archive by category:')
  for (const cat of Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])) {
    console.log('  ' + cat.padEnd(28) + ' ' + byCat[cat])
  }
  console.log()

  if (!args.apply) {
    console.log('Dry-run complete. Re-run with --apply to archive ' + willArchive.length + ' phenomena.')
    console.log('  npx tsx scripts/archive-empty-phenomena.ts --apply')
    return
  }

  if (willArchive.length === 0) {
    console.log('Nothing to archive.')
    return
  }

  // 3) Apply in batches of 100
  const BATCH = 100
  let archived = 0
  let errors = 0
  const auditNote = 'Archived ' + new Date().toISOString().substring(0, 10) + ': ' + args.note
  console.log('Archiving ' + willArchive.length + ' phenomena in batches of ' + BATCH + '...')
  for (let i = 0; i < willArchive.length; i += BATCH) {
    const batch = willArchive.slice(i, i + BATCH)
    const ids = batch.map(r => r.id)
    const { error } = await s.from('phenomena').update({
      status: 'archived',
      ai_history: auditNote,
    }).in('id', ids)
    if (error) {
      errors += batch.length
      console.error('  batch ' + Math.floor(i / BATCH + 1) + ' failed: ' + error.message)
    } else {
      archived += batch.length
      console.log('  batch ' + Math.floor(i / BATCH + 1) + ': ' + batch.length + ' archived (running total: ' + archived + ')')
    }
  }

  console.log()
  console.log('========== FINAL ==========')
  console.log('Archived: ' + archived)
  console.log('Errors:   ' + errors)
  console.log('Skipped:  ' + skipped.length + ' (had actual junction rows; cache was stale)')
  console.log()
  console.log('Restore any: UPDATE phenomena SET status=\'active\' WHERE slug = \'<slug>\';')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
