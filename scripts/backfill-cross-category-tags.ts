/**
 * backfill-cross-category-tags.ts — V11.18.39
 *
 * One-time backfill for the cross-category gap (see
 * docs/CROSS_CATEGORY_CLASSIFICATION_DESIGN.md). The catalog-merge change in
 * classify-phenomena-batch.ts makes FUTURE / unlinked reports cross-taggable,
 * but already-linked reports stranded in another category (e.g. ~1,730 angel
 * reports filed under ghosts/psychic) won't be revisited by the unlinked-only
 * classifier. This pulls them in per universal phenomenon:
 *   candidates = approved reports in a DIFFERENT category whose title/summary/
 *   description matches the phenomenon's name/aliases AND aren't already linked
 *   → verifyTag gate (the same Haiku gate the classifier uses) → link.
 *
 * STRICT by default: only 'yes' verdicts link (cross-category is higher
 * false-positive risk than in-category). --include-uncertain to also keep
 * 'uncertain' (matches the in-category classifier's looser rule).
 *
 * USAGE (run AFTER the nightly --all classifier finishes; apply is multi-hour)
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-cross-category-tags.ts                 # DRY RUN: candidate counts only (no AI)
 *   npx tsx scripts/backfill-cross-category-tags.ts --slug angels   # one phenomenon
 *   npx tsx scripts/backfill-cross-category-tags.ts --apply
 *   npx tsx scripts/backfill-cross-category-tags.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'
import { verifyAndUpsertTag } from '../src/lib/services/tag-verification.service'

// keep in sync with UNIVERSAL_SLUGS in classify-phenomena-batch.ts
const UNIVERSAL_SLUGS = [
  'angels', 'demon', 'demonic-possession', 'marian-apparitions',
  'shadow-person', 'poltergeist', 'apparition', 'doppelganger', 'black-eyed-children',
  'near-death-experience', 'out-of-body-experience', 'astral-projection',
  'sleep-paralysis', 'missing-time', 'time-slip', 'glitch-in-the-matrix',
  'alien-abduction', 'men-in-black', 'telepathy', 'crisis-apparition', 'orbs',
]
const SNAP = path.resolve(process.cwd(), 'outputs/cross-category-backfill-snapshot.json')

function terms(name: string, aliases: string[] | null): string[] {
  return [name, ...(aliases || [])].map((t) => (t || '').trim()).filter((t) => t.length >= 4).slice(0, 8)
}

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')
  const includeUncertain = process.argv.includes('--include-uncertain')
  const allCategories = process.argv.includes('--all-categories') // also pull SAME-category matches (for zero-report phenomena)
  const slugI = process.argv.indexOf('--slug')
  const onlySlug = slugI >= 0 ? process.argv[slugI + 1] : null
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const anth = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  if (revert) {
    if (!fs.existsSync(SNAP)) { console.error('no snapshot'); process.exit(1) }
    const links = JSON.parse(fs.readFileSync(SNAP, 'utf8')).links || []
    console.log('[xcat] REVERT: removing ' + links.length + ' backfilled links')
    for (let i = 0; i < links.length; i += 200) {
      const batch = links.slice(i, i + 200)
      for (const l of batch) await sb.from('report_phenomena').delete().eq('report_id', l.report_id).eq('phenomenon_id', l.phenomenon_id)
    }
    console.log('[xcat] reverted'); return
  }

  const slugs = onlySlug ? onlySlug.split(',').map((s) => s.trim()).filter(Boolean) : UNIVERSAL_SLUGS
  const snap: any[] = (apply && fs.existsSync(SNAP)) ? (JSON.parse(fs.readFileSync(SNAP, 'utf8')).links || []) : []
  const doneSet = new Set(snap.map((l: any) => l.report_id + '|' + l.phenomenon_id))
  let totalCand = 0, linked = 0, rejected = 0, uncertain = 0

  for (const slug of slugs) {
    const phr = await sb.from('phenomena').select('id,slug,name,aliases,ai_summary,category,status').eq('slug', slug).limit(1)
    const phen = phr.data && phr.data[0]
    if (!phen || phen.status !== 'active') { console.log('  skip ' + slug + ' (not active)'); continue }

    // candidate reports in OTHER categories matching name/aliases, not yet linked.
    // V11.18.41 — per-term + per-field paginated fetch (was: one 24-clause OR over
    // ~300k reports incl. the big `description` column → Postgres statement-timeouts
    // that silently zeroed/partial'd common-word phenomena like apparition/NDE/sleep-
    // paralysis). Each statement is now a single ilike, so it stays under the timeout;
    // a timed-out page is logged + skipped (never silently zeroes the whole phenomenon).
    const candMap = new Map<string, any>()
    let timedOut = false
    for (const t of terms(phen.name, phen.aliases)) {
      for (const field of ['title', 'summary', 'description']) {
        let from = 0
        while (true) {
          let q = sb.from('reports').select('id,title,summary,description,category,city,state_province,country')
            .eq('status', 'approved').ilike(field, `%${t}%`)
          if (!allCategories) q = q.neq('category', phen.category)
          const r = await q.range(from, from + 499)
          if (r.error) { timedOut = true; console.log('  ' + slug + ' [' + field + ':"' + t + '"] err (skip page): ' + r.error.message); break }
          const rows = r.data || []; for (const row of rows) candMap.set(row.id, row)
          if (rows.length < 500) break; from += 500
        }
      }
    }
    const cand = [...candMap.values()]
    if (timedOut) console.log('  ' + slug + ' note: some pages timed out — partial candidate set (re-run to top up)')
    // exclude already-linked to this phenomenon
    const already = new Set<string>()
    const ids = cand.map((c) => c.id)
    for (let i = 0; i < ids.length; i += 100) {
      const r = await sb.from('report_phenomena').select('report_id').eq('phenomenon_id', phen.id).in('report_id', ids.slice(i, i + 100))
      for (const row of (r.data || [])) already.add(row.report_id)
    }
    const todo = cand.filter((c) => !already.has(c.id))
    totalCand += todo.length
    console.log('  ' + slug.padEnd(24) + ' candidates(cross-cat, unlinked): ' + todo.length + (todo.length ? '  [' + phen.category + ']' : ''))

    if (!apply) continue
    // V11.18.39 — concurrency pool (~8) over the verify-gate calls; each call
    // is an independent Haiku request, so this collapses wall-clock ~8x vs
    // sequential. Counters/snapshot mutations are safe (JS is single-threaded
    // between awaits). Snapshot flushed every ~200 links for resume/revert.
    const CONCURRENCY = 8
    let cursor = 0, sinceFlush = 0
    const flush = () => { fs.mkdirSync(path.dirname(SNAP), { recursive: true }); fs.writeFileSync(SNAP, JSON.stringify({ savedAt: new Date().toISOString(), links: snap }, null, 0)) }
    async function worker() {
      while (cursor < todo.length) {
        const r = todo[cursor++]
        const k = r.id + '|' + phen.id
        if (doneSet.has(k)) continue
        try {
          const res = await verifyAndUpsertTag(sb, {
            reportId: r.id, phenomenonId: phen.id, confidence: 0.7, taggedBy: 'cross-category-backfill',
            phen: { name: phen.name, slug: phen.slug, category: phen.category, ai_summary: phen.ai_summary },
            report: { title: r.title, summary: r.summary, description: r.description, city: r.city, state_province: r.state_province, country: r.country },
          }, anth)
          if (res.verdict === 'no') { rejected++; continue }
          if (res.verdict === 'uncertain' && !includeUncertain) { uncertain++; continue }
          if (res.persisted) { linked++; snap.push({ report_id: r.id, phenomenon_id: phen.id }); doneSet.add(k); if (++sinceFlush >= 200) { flush(); sinceFlush = 0 } }
        } catch (e: any) { /* gate error → skip, best-effort */ }
        if (linked % 100 === 0 && linked) process.stdout.write('\r  linked ' + linked + ' (rej ' + rejected + ', unc-skipped ' + uncertain + ')')
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    flush()
  }

  console.log('\n=== cross-category backfill ' + (apply ? '(APPLY)' : '(DRY RUN — candidate counts, no AI)') + ' ===')
  console.log('total cross-category candidates: ' + totalCand)
  if (apply) console.log('linked: ' + linked + ' | rejected by gate: ' + rejected + ' | uncertain skipped: ' + uncertain + ' (snapshot → --revert)')
  else console.log('Run --apply (after the nightly classifier finishes) to verify+link. Strict: only "yes" verdicts link; --include-uncertain to loosen.')
}
main().catch((e) => { console.error('[xcat] unhandled:', e); process.exit(1) })
