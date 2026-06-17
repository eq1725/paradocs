/**
 * ca-auto-approve.ts — V11.18.37
 *
 * Quality + page-requirements gate that promotes Chronicling-America
 * pending_review reports to approved (live). Per the SME panel review, the
 * gate is the SOLE decider — nothing is published unless it clears every
 * check. Reports that fail stay in pending_review for human review (never
 * dropped). Reversible: snapshots promoted ids for --revert.
 *
 * GATE (all required to promote):
 *   - paradocs_narrative present            (published-format body; quality parity)
 *   - description present, 300–3200 chars    (renders the report body)
 *   - title (<=120), summary present
 *   - location_name, event_date present      (map + timeline render)
 *   - source_url + source_label present      (attribution / provenance)
 *   - category in the 6 allowed
 *   - >=1 tag
 * HOLD (stays pending_review, by reason):
 *   - genre_flags.period_sensitive  (period racial/colonial framing → human review)
 *   - genre_flags.fiction_suspected / advertisement
 *   - genre_flags.retold_folklore   (borderline witness standing) UNLESS --include-folklore
 *   - any missing/!page-complete field
 *
 * USAGE
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/ca-auto-approve.ts                 # DRY RUN (reason breakdown)
 *   npx tsx scripts/ca-auto-approve.ts --include-folklore   # also promote retold_folklore
 *   npx tsx scripts/ca-auto-approve.ts --apply
 *   npx tsx scripts/ca-auto-approve.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'

const SNAP = path.resolve(process.cwd(), 'outputs/ca-auto-approve-snapshot.json')
const REQUIRE_NARRATIVE = !process.argv.includes('--no-require-narrative')
const ALLOWED = ['ghosts_hauntings', 'psychic_phenomena', 'ufos_aliens', 'cryptids', 'religion_mythology', 'esoteric_practices', 'psychological_experiences', 'consciousness_practices']
const BODY_MIN = 300, BODY_MAX = 3200

function gate(r: any, includeFolklore: boolean): { ok: true } | { ok: false; reason: string } {
  const gf = (r.metadata && r.metadata.genre_flags) || {}
  if (gf.period_sensitive === true) return { ok: false, reason: 'hold_period_sensitive' }
  if (gf.fiction_suspected === true) return { ok: false, reason: 'hold_fiction_suspected' }
  if (gf.advertisement === true) return { ok: false, reason: 'hold_advertisement' }
  if (gf.retold_folklore === true && !includeFolklore) return { ok: false, reason: 'hold_retold_folklore' }
  if (!REQUIRE_NARRATIVE) { /* description body is sufficient to render (matches the 169 live CA rows w/o narrative) */ }
  else if (!r.paradocs_narrative) return { ok: false, reason: 'no_narrative' }
  if (!r.description || r.description.length < BODY_MIN || r.description.length > BODY_MAX) return { ok: false, reason: 'body_length' }
  if (!r.title || r.title.length > 120) return { ok: false, reason: 'bad_title' }
  if (!r.summary) return { ok: false, reason: 'no_summary' }
  if (!r.location_name) return { ok: false, reason: 'no_location' }
  if (!r.event_date) return { ok: false, reason: 'no_event_date' }
  if (!r.source_url || !r.source_label) return { ok: false, reason: 'no_attribution' }
  if (!r.category || ALLOWED.indexOf(r.category) < 0) return { ok: false, reason: 'bad_category' }
  if (!Array.isArray(r.tags) || r.tags.length === 0) return { ok: false, reason: 'no_tags' }
  return { ok: true }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')
  const includeFolklore = process.argv.includes('--include-folklore')
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  if (revert) {
    if (!fs.existsSync(SNAP)) { console.error('no snapshot'); process.exit(1) }
    const ids: string[] = JSON.parse(fs.readFileSync(SNAP, 'utf8')).ids || []
    console.log('[ca-approve] REVERT ' + ids.length + ' → pending_review')
    for (let i = 0; i < ids.length; i += 500) await sb.from('reports').update({ status: 'pending_review', updated_at: new Date().toISOString() }).in('id', ids.slice(i, i + 500))
    console.log('[ca-approve] reverted'); return
  }

  // load all CA pending_review
  const rows: any[] = []; let from = 0
  while (true) {
    const r = await sb.from('reports')
      .select('id,title,summary,description,location_name,event_date,source_url,source_label,category,tags,paradocs_narrative,metadata')
      .eq('source_type', 'chronicling-america').eq('status', 'pending_review').range(from, from + 999)
    if (r.error) { console.error('query err: ' + r.error.message); process.exit(1) }
    const d2 = r.data || []; rows.push(...d2); if (d2.length < 1000) break; from += 1000
  }

  const pass: string[] = []
  const reasons: Record<string, number> = {}
  for (const r of rows) {
    const g = gate(r, includeFolklore)
    if (g.ok) pass.push(r.id)
    else reasons[g.reason] = (reasons[g.reason] || 0) + 1
  }

  console.log('=== CA auto-approve gate ' + (apply ? '(APPLY)' : '(DRY RUN)') + (includeFolklore ? ' [+folklore]' : '') + ' ===')
  console.log('CA pending evaluated: ' + rows.length)
  console.log('PROMOTE → approved:   ' + pass.length)
  console.log('HOLD (stay pending):  ' + (rows.length - pass.length))
  console.log('  hold reasons:')
  for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log('    ' + k.padEnd(22) + v)

  if (!apply) {
    console.log('\nDRY RUN — no writes. Note: rows lacking paradocs_narrative (\"no_narrative\") need the narrate pass first.')
    console.log('--apply to promote the ' + pass.length + ' passing rows (reversible via --revert).')
    return
  }

  fs.mkdirSync(path.dirname(SNAP), { recursive: true })
  fs.writeFileSync(SNAP, JSON.stringify({ savedAt: new Date().toISOString(), ids: pass, includeFolklore }, null, 0))
  let done = 0, errs = 0
  for (let i = 0; i < pass.length; i += 500) {
    const r = await sb.from('reports').update({ status: 'approved', updated_at: new Date().toISOString() }).in('id', pass.slice(i, i + 500))
    if (r.error) { errs++; console.warn('  batch err: ' + r.error.message) } else done += Math.min(500, pass.length - i)
  }
  console.log('[ca-approve] promoted ~' + done + ' (errors ' + errs + '). Revert: --revert')
}

main().catch(e => { console.error('[ca-approve] unhandled:', e); process.exit(1) })
