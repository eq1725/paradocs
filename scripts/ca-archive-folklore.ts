#!/usr/bin/env tsx
/**
 * ca-archive-folklore.ts — V11.25
 *
 * Archive Chronicling-America pending_review rows flagged as retold folklore
 * (metadata.genre_flags.retold_folklore === true). These are legends /
 * retellings without a first-hand (or clear third-hand) witness — they don't
 * fit the "genuine experience" schema, and several are pre-tranche (1800s).
 * Founder decision (Jun 2026): archive them rather than publish.
 *
 * Status-only change (pending_review → archived). Fully reversible from the
 * snapshot — NOT a delete.
 *
 * USAGE
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/ca-archive-folklore.ts            # DRY RUN (count + sample)
 *   npx tsx scripts/ca-archive-folklore.ts --apply
 *   npx tsx scripts/ca-archive-folklore.ts --revert   # restore prior statuses
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const SNAP = path.resolve(process.cwd(), 'outputs/ca-folklore-archive-snapshot.json')

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')

  if (revert) {
    if (!fs.existsSync(SNAP)) {
      console.log('[ca-archive-folklore] no snapshot at ' + SNAP + ' — nothing to revert.')
      return
    }
    const snap: { rows: { id: string; status: string }[] } = JSON.parse(fs.readFileSync(SNAP, 'utf8'))
    console.log('[ca-archive-folklore] REVERT ' + snap.rows.length + ' rows to prior status…')
    let n = 0
    for (const r of snap.rows) {
      const { error } = await sb.from('reports').update({ status: r.status }).eq('id', r.id)
      if (!error) n++
    }
    console.log('[ca-archive-folklore] reverted ' + n + '/' + snap.rows.length)
    return
  }

  // Gather pending CA rows; filter to retold_folklore in JS (nested JSON).
  const targets: { id: string; title: string; status: string }[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await sb.from('reports')
      .select('id,title,status,metadata')
      .eq('source_type', 'chronicling-america')
      .eq('status', 'pending_review')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) { console.error('[ca-archive-folklore] query error:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    for (const r of data as any[]) {
      const gf = (r.metadata && r.metadata.genre_flags) || {}
      if (gf.retold_folklore === true) targets.push({ id: r.id, title: r.title, status: r.status })
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  console.log('=== CA archive-folklore ' + (apply ? '(APPLY)' : '(DRY RUN)') + ' ===')
  console.log('retold_folklore pending rows: ' + targets.length)
  console.log('sample:')
  targets.slice(0, 8).forEach(t => console.log('  • ' + (t.title || '(no title)')))

  if (!apply) {
    console.log('\nDRY RUN — no writes. Re-run with --apply to archive (reversible via --revert).')
    return
  }

  // Snapshot prior statuses for revert, then archive.
  fs.mkdirSync(path.dirname(SNAP), { recursive: true })
  fs.writeFileSync(SNAP, JSON.stringify({ rows: targets.map(t => ({ id: t.id, status: t.status })) }, null, 2))

  let archived = 0
  for (const t of targets) {
    const { error } = await sb.from('reports')
      .update({ status: 'archived' })
      .eq('id', t.id)
    if (!error) archived++
    else console.error('  archive failed ' + t.id + ': ' + error.message)
  }
  console.log('\narchived ' + archived + '/' + targets.length + ' | snapshot: ' + SNAP + ' (revert with --revert)')
}

main().catch(e => { console.error('fatal', e?.message || e); process.exit(1) })
