/**
 * sweep-dream-meta.ts — V11.20.4  (TARGETED CLEAN)
 *
 * Scope (founder decision): KEEP dreams / lucid dreaming / astral / NDEs —
 * they're in-scope consciousness experiences. Remove ONLY the clearly-bad,
 * regardless of source: editorial/meta commentary that isn't a report,
 * fiction / creative writing, and violent/harmful content describing the
 * author harming someone (not an anomalous experience).
 *
 * Pattern-filters candidates on specific markers (NOT 'dream'/'astral'/
 * 'suicide', which would catch in-scope NDEs etc.), gates through Haiku,
 * archives clear removals (status → 'archived', reversible via snapshot).
 * Time-boxed + resumable. Gather phase is cached so it survives the cap.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/sweep-dream-meta.ts            # gather (cached) then DRY RUN gate
 *   npx tsx scripts/sweep-dream-meta.ts --apply    # loop until remaining:0
 *   npx tsx scripts/sweep-dream-meta.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'

const HAIKU = 'claude-haiku-4-5-20251001'
const SNAP = path.resolve(process.cwd(), 'outputs/dream-meta-sweep-snapshot.json')
const CAND = path.resolve(process.cwd(), 'outputs/dream-meta-candidates.json')
const CACHE = path.resolve(process.cwd(), 'outputs/dream-meta-processed.json')
const START = Date.now()
const GATHER_DEADLINE = START + 22000
const DEADLINE = START + 34000
const POOL = 10

// Specific, high-signal markers (description). Deliberately exclude
// 'dream'/'astral'/'suicide'/'note:' — too broad / would catch in-scope
// NDE + consciousness content.
const MARKERS = [
  // editorial / meta commentary about the writing itself
  'i write my dreams', 'i modified this', 'i edited this', 'might not make sense',
  'may not make sense', 'grammatically', 'not sure if this counts', 'i changed some details',
  // fiction / creative writing
  'this is fiction', 'this is a story', 'creative writing', 'i made this up',
  'made this up', 'just a story', 'fictional', 'wrote this story', 'a story i wrote',
  // violent / harmful content describing the author harming someone
  'i killed', 'i murdered', 'i raped', 'i molested', 'i stabbed', 'i strangled',
]

const PROMPT = (title: string, body: string) => `Paradocs is a public archive of anomalous experiences (paranormal/unexplained events). Be very conservative — KEEP almost everything. The following ALL count as KEEP:
- first-person accounts; AND second-hand accounts the author is relaying ("a story my friend/instructor/grandmother told me");
- historical, news, or third-party archival accounts of anomalous events;
- dreams, lucid dreams, astral projection, out-of-body and near-death experiences (including after a suicide attempt);
- a real sighting/encounter even if the author also asks a question about it.

Answer REMOVE ONLY in these narrow cases:
- (a) fiction or creative writing the author invented / made up (e.g. "this is a story I wrote", "this is fictional");
- (b) a PURE meta post, discussion, or question that recounts NO experience at all (e.g. "can someone clarify X", "looking for an account I once saw", "do you believe in ghosts?") — if any real or relayed experience is present, KEEP;
- (c) a first-person confession of the author killing or seriously harming a real person, presented as a disturbing real act rather than a witnessed anomalous event.

If there is ANY genuine or relayed experience, answer KEEP. Only answer REMOVE for clear cases in (a)/(b)/(c).

TITLE: ${title}
BODY: ${(body || '').slice(0, 700)}

Answer with ONLY one word: KEEP or REMOVE.`

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const anth = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let snap: any = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : { rows: [] }
  if (revert) {
    console.log('[sweep] REVERT ' + snap.rows.length + ' reports → approved')
    for (let i = 0; i < snap.rows.length; i += 100) {
      for (const r of snap.rows.slice(i, i + 100)) await sb.from('reports').update({ status: r.status }).eq('id', r.id)
    }
    console.log('[sweep] reverted'); return
  }

  // ---- Gather phase (cached, resumable across runs) ----
  let cand: any = fs.existsSync(CAND) ? JSON.parse(fs.readFileSync(CAND, 'utf8')) : { doneMarkers: [], rows: [] }
  const haveIds = new Set<string>(cand.rows.map((r: any) => r.id))
  const doneM = new Set<string>(cand.doneMarkers)
  const saveCand = () => { fs.mkdirSync(path.dirname(CAND), { recursive: true }); fs.writeFileSync(CAND, JSON.stringify(cand)) }

  for (const m of MARKERS) {
    if (doneM.has(m)) continue
    if (Date.now() > GATHER_DEADLINE) break
    let from = 0
    while (true) {
      const r = await sb.from('reports')
        .select('id,title,summary,description,category,metadata')
        .eq('status', 'approved')
        .ilike('description', '%' + m + '%')
        .range(from, from + 999)
      if (r.error) { console.error('[gather] "' + m + '" error:', r.error.message); break }
      const rows = r.data || []
      for (const row of rows) { if (!haveIds.has(row.id)) { haveIds.add(row.id); cand.rows.push(row) } }
      if (rows.length < 1000) break
      from += 1000
      if (Date.now() > GATHER_DEADLINE) break
    }
    doneM.add(m); cand.doneMarkers = [...doneM]; saveCand()
  }

  const gatherComplete = MARKERS.every(m => doneM.has(m))
  console.log('=== dream/meta/harmful TARGETED sweep ===')
  console.log('gather: ' + doneM.size + '/' + MARKERS.length + ' markers done | candidates so far: ' + cand.rows.length)
  if (!gatherComplete) {
    console.log('gather incomplete — re-run the same command to continue gathering before gating.')
    return
  }

  // ---- Gate phase ----
  const processed = new Set<string>(fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : [])
  const todo = cand.rows.filter((c: any) => !processed.has(c.id))
  console.log('mode: ' + (apply ? 'APPLY' : 'DRY RUN') + ' | candidates: ' + cand.rows.length + ' | already processed: ' + processed.size + ' | remaining: ' + todo.length)

  // Would-archive report (persists across dry-run passes for review).
  const REPORT = path.resolve(process.cwd(), 'outputs/dream-meta-would-archive.json')
  const wa: Record<string, any> = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, 'utf8')) : {}

  let cursor = 0, archived = 0, kept = 0, sinceFlush = 0
  const flush = () => { fs.writeFileSync(SNAP, JSON.stringify(snap)); fs.writeFileSync(CACHE, JSON.stringify([...processed])); fs.writeFileSync(REPORT, JSON.stringify(wa)) }
  async function worker() {
    while (cursor < todo.length && Date.now() < DEADLINE) {
      const r = todo[cursor++]
      let verdict = 'KEEP'
      try {
        const resp = await anth.messages.create({ model: HAIKU, max_tokens: 6, messages: [{ role: 'user', content: PROMPT(r.title, r.description || r.summary) }] })
        verdict = (resp.content || []).map((c: any) => c.text || '').join('').trim().toUpperCase()
      } catch (e: any) { continue }
      if (verdict.startsWith('REMOVE')) {
        wa[r.id] = { id: r.id, category: r.category, title: r.title, snippet: (r.description || r.summary || '').slice(0, 160) }
        if (apply) {
          snap.rows.push({ id: r.id, status: 'approved' })
          await sb.from('reports').update({ status: 'archived', metadata: { ...(r.metadata || {}), qa_removed: 'dream_meta_harmful', qa_removed_at: new Date().toISOString() } }).eq('id', r.id)
          processed.add(r.id) // applied — don't reprocess
        }
        archived++
      } else { processed.add(r.id); kept++ }
      if (++sinceFlush >= 15) { flush(); sinceFlush = 0 }
    }
  }
  await Promise.all(Array.from({ length: POOL }, () => worker()))
  flush()
  console.log('\nwould-archive titles this run (see ' + path.basename(REPORT) + ' for full list of ' + Object.keys(wa).length + '):')
  for (const k of Object.keys(wa).slice(-30)) console.log('  ARCHIVE  [' + wa[k].category + '] ' + (wa[k].title || '').slice(0, 80))
  console.log('\nthis run → ' + (apply ? 'archived ' : 'would-archive ') + archived + ' | kept ' + kept + ' | processed this run ' + (archived + kept) + ' | remaining ' + Math.max(0, todo.length - (archived + kept)))
  if (!apply) console.log('DRY RUN — re-run with --apply to archive (reversible: --revert).')
}
main().catch(e => { console.error('[sweep] unhandled:', e); process.exit(1) })
