/**
 * deprecate-verdict-phenomena.ts — V11.18.36
 *
 * Removes "this wasn't real" verdict-style phenomena that contradict the
 * editorial line (see docs/SME_PANEL_REVIEW_PHENOMENA_AND_AUTOAPPROVE.md):
 *   Psychosocial Hypothesis, Mass Hysteria, Truman Show Delusion,
 *   Gang Stalking Delusion, Confabulation.
 *
 * Per founder decision: re-classify the tagged reports to a REAL phenomenon
 * first; take down (archive) only the ones that can't be re-classified.
 * Mechanism:
 *   1. Delete the verdict junction links (report_phenomena rows → these 5).
 *      - Reports that ALSO have a real phenomenon link keep it (~918): no loss.
 *      - Reports left with NO link (~300) are stamped metadata.reclassify_origin
 *        ='verdict_deprecation' so the nightly classifier re-tags them to an
 *        ACTIVE phenomenon, and a later take-down sweep archives any that stay
 *        unlinked (run scripts with --takedown-sweep after the classifier).
 *   2. Archive the 5 verdict phenomena (status='archived') so they vanish
 *      from all surfaces and can't be re-tagged.
 *
 * Reversible: snapshots deleted links + phenomena statuses + stamped report ids
 * to outputs/verdict-deprecation-snapshot.json; --revert restores them.
 *
 * USAGE
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/deprecate-verdict-phenomena.ts            # DRY RUN
 *   npx tsx scripts/deprecate-verdict-phenomena.ts --apply
 *   npx tsx scripts/deprecate-verdict-phenomena.ts --takedown-sweep   # after classifier re-run
 *   npx tsx scripts/deprecate-verdict-phenomena.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'

const NAMES = ['Psychosocial Hypothesis', 'Mass Hysteria', 'Truman Show Delusion', 'Gang Stalking Delusion', 'Confabulation']
const SNAP = path.resolve(process.cwd(), 'outputs/verdict-deprecation-snapshot.json')

async function main() {
  const apply = process.argv.includes('--apply')
  const sweep = process.argv.includes('--takedown-sweep')
  const revert = process.argv.includes('--revert')
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  if (revert) {
    if (!fs.existsSync(SNAP)) { console.error('no snapshot'); process.exit(1) }
    const s = JSON.parse(fs.readFileSync(SNAP, 'utf8'))
    console.log('[verdict] REVERT: re-inserting ' + s.links.length + ' links, restoring ' + s.phenomena.length + ' phenomena…')
    for (let i = 0; i < s.links.length; i += 500) await sb.from('report_phenomena').insert(s.links.slice(i, i + 500))
    for (const p of s.phenomena) await sb.from('phenomena').update({ status: p.status, report_count: p.report_count }).eq('id', p.id)
    console.log('[verdict] reverted. (Re-run the metadata/take-down revert manually if a sweep was applied.)')
    return
  }

  const phRes = await sb.from('phenomena').select('id,name,status,report_count').in('name', NAMES)
  const phenomena = phRes.data || []
  const ids = phenomena.map(p => p.id)

  // ── TAKE-DOWN SWEEP: archive verdict-origin reports still unlinked ──
  if (sweep) {
    const stamped = await sb.from('reports').select('id').filter('metadata->>reclassify_origin', 'eq', 'verdict_deprecation').eq('status', 'approved')
    const cand = (stamped.data || []).map((r: any) => r.id)
    let stillUnlinked: string[] = []
    for (let i = 0; i < cand.length; i += 200) {
      const batch = cand.slice(i, i + 200)
      const lk = await sb.from('report_phenomena').select('report_id').in('report_id', batch)
      const linked = new Set((lk.data || []).map((r: any) => r.report_id))
      stillUnlinked.push(...batch.filter(id => !linked.has(id)))
    }
    console.log('[verdict] take-down sweep: ' + cand.length + ' verdict-origin reports, ' + stillUnlinked.length + ' still unlinked after reclassification')
    if (!apply) { console.log('DRY RUN — re-run --takedown-sweep --apply to archive the ' + stillUnlinked.length + ' unreclassifiable.'); return }
    for (let i = 0; i < stillUnlinked.length; i += 500)
      await sb.from('reports').update({ status: 'archived', updated_at: new Date().toISOString() }).in('id', stillUnlinked.slice(i, i + 500))
    console.log('[verdict] archived ' + stillUnlinked.length + ' unreclassifiable reports.')
    return
  }

  // ── Gather verdict junction links ──────────────────────────────────
  let links: any[] = [], from = 0
  while (true) {
    const r = await sb.from('report_phenomena').select('*').in('phenomenon_id', ids).range(from, from + 999)
    const rows = r.data || []; links.push(...rows); if (rows.length < 1000) break; from += 1000
  }
  const reportIds = [...new Set(links.map(l => l.report_id))]
  // which reports have an alternate (non-verdict) link?
  const haveAlt = new Set<string>()
  for (let i = 0; i < reportIds.length; i += 200) {
    const r = await sb.from('report_phenomena').select('report_id,phenomenon_id').in('report_id', reportIds.slice(i, i + 200))
    for (const row of (r.data || [])) if (!ids.includes(row.phenomenon_id)) haveAlt.add(row.report_id)
  }
  const verdictOnly = reportIds.filter(id => !haveAlt.has(id))

  console.log('=== deprecate verdict phenomena ' + (apply ? '(APPLY)' : '(DRY RUN)') + ' ===')
  phenomena.forEach(p => console.log('  ' + p.name + '  rc=' + p.report_count + '  status=' + p.status))
  console.log('verdict junction links to delete: ' + links.length)
  console.log('distinct reports affected:        ' + reportIds.length)
  console.log('  keep real phenomenon (drop verdict tag only): ' + haveAlt.size)
  console.log('  verdict-only → reclassify, else take down:    ' + verdictOnly.length)

  if (!apply) { console.log('\nDRY RUN — --apply to delete links, stamp verdict-only for reclassification, and archive the 5 phenomena.'); return }

  // snapshot for revert
  fs.mkdirSync(path.dirname(SNAP), { recursive: true })
  fs.writeFileSync(SNAP, JSON.stringify({ savedAt: new Date().toISOString(), links, phenomena, verdictOnly }, null, 0))

  // delete verdict links
  let del = 0
  for (const id of ids) { const r = await sb.from('report_phenomena').delete().eq('phenomenon_id', id); if (!r.error) del++ }
  console.log('[verdict] deleted verdict links for ' + del + '/' + ids.length + ' phenomena')

  // stamp verdict-only reports so the classifier re-tags them + sweep can find them
  let stamped = 0
  for (let i = 0; i < verdictOnly.length; i += 100) {
    const batch = verdictOnly.slice(i, i + 100)
    const cur = await sb.from('reports').select('id,metadata').in('id', batch)
    for (const row of (cur.data || []) as any[]) {
      const meta = { ...(row.metadata || {}), reclassify_origin: 'verdict_deprecation' }
      const r = await sb.from('reports').update({ metadata: meta }).eq('id', row.id); if (!r.error) stamped++
    }
  }
  console.log('[verdict] stamped ' + stamped + ' verdict-only reports for reclassification')

  // archive the phenomena
  for (const id of ids) await sb.from('phenomena').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id)
  console.log('[verdict] archived ' + ids.length + ' verdict phenomena')
  console.log('\nNext: let the nightly classifier re-tag the ' + verdictOnly.length + ' stamped reports, then run --takedown-sweep --apply to archive any still unlinked.')
}

main().catch(e => { console.error('[verdict] unhandled:', e); process.exit(1) })
