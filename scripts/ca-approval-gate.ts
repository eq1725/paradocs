/**
 * ca-approval-gate.ts — V11.20.9
 *
 * Clears the Chronicling-America pending_review backlog against the
 * founder's criteria: KEEP any article (first- OR third-person/historical)
 * that actually describes a paranormal / supernatural / anomalous
 * experience or event under our phenomena schema; SKIP everything else
 * (skeptical debunkings with no genuine phenomenon, opinion/editorial,
 * advertisements, unrelated news, explicit fiction, non-anomalous filler).
 *
 * KEEP  → status 'approved'.  SKIP → status 'archived' (qa_skip reason).
 * Both are status changes, snapshotted for --revert. Time-boxed + resumable.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/ca-approval-gate.ts            # gather (cached) then DRY RUN
 *   npx tsx scripts/ca-approval-gate.ts --apply    # loop until remaining:0
 *   npx tsx scripts/ca-approval-gate.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'

const HAIKU = 'claude-haiku-4-5-20251001'
const SNAP = path.resolve(process.cwd(), 'outputs/ca-approval-snapshot.json')
const CAND = path.resolve(process.cwd(), 'outputs/ca-approval-candidates.json')
const PROC = path.resolve(process.cwd(), 'outputs/ca-approval-processed.json')
const SKIPREP = path.resolve(process.cwd(), 'outputs/ca-approval-skips.json')
const START = Date.now()
const GATHER_DEADLINE = START + 20000
const DEADLINE = START + 34000
const POOL = 10

const PROMPT = (title: string, body: string) => `Paradocs archives reports of PARANORMAL / SUPERNATURAL / ANOMALOUS experiences and events — ghosts and hauntings, apparitions, UFOs/UAP, cryptids, psychic phenomena, visions, premonitions, out-of-body and near-death experiences, and similar. Articles may be FIRST-PERSON or THIRD-PERSON / historical newspaper accounts — both are fine.

Default to KEEP. Classify this article:
- KEEP — it conveys a paranormal/supernatural/anomalous phenomenon or experience: a haunting, apparition/ghost, UFO/UAP, unexplained cryptid, vision, premonition, out-of-body or near-death experience, or similar. First-person OR third-person/legendary accounts both count. A reputed haunted house, a recounted ghost legend, or a brief account all count as KEEP.
- SKIP only in these clear cases: (a) it is debunked or revealed as fraud/hoax (e.g. "staged photo admitted", "no evidence found", "turned out to be"); (b) the phenomenon has a clear ORDINARY explanation even if dramatically framed — a known ordinary animal (a normal wolf, bear, owl, rabbit), an optical effect (reflection, shadow, Brocken spectre), or a living person mistaken for a ghost; (c) it recounts NO phenomenon at all — pure opinion/editorial/advertisement, or explicit fiction.

When unsure, KEEP. Only SKIP when it clearly fits (a), (b), or (c). Example: "a gray wolf that killed dozens" is just a wolf → SKIP; "a giant ape apparition" or "dungeon wailing attributed to spirits" are unexplained → KEEP.

TITLE: ${title}
BODY: ${(body || '').slice(0, 800)}

Answer with ONLY one word: KEEP or SKIP.`

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
    console.log('[gate] REVERT ' + snap.rows.length + ' reports → ' + 'pending_review')
    for (let i = 0; i < snap.rows.length; i += 100) {
      for (const r of snap.rows.slice(i, i + 100)) await sb.from('reports').update({ status: r.status }).eq('id', r.id)
    }
    console.log('[gate] reverted'); return
  }

  // ---- Gather pending CA (cached, resumable) ----
  let cand: any = fs.existsSync(CAND) ? JSON.parse(fs.readFileSync(CAND, 'utf8')) : { complete: false, page: 0, rows: [] }
  if (!cand.complete) {
    const have = new Set(cand.rows.map((r: any) => r.id))
    while (Date.now() < GATHER_DEADLINE) {
      const from = cand.page * 1000
      const r = await sb.from('reports').select('id,title,summary,description,category')
        .eq('status', 'pending_review').eq('source_type', 'chronicling-america')
        .order('created_at', { ascending: true }).range(from, from + 999)
      if (r.error) { console.error('[gather]', r.error.message); break }
      const rows = r.data || []
      for (const row of rows) if (!have.has(row.id)) { have.add(row.id); cand.rows.push(row) }
      cand.page++
      if (rows.length < 1000) { cand.complete = true; break }
    }
    fs.mkdirSync(path.dirname(CAND), { recursive: true }); fs.writeFileSync(CAND, JSON.stringify(cand))
    if (!cand.complete) { console.log('gather: ' + cand.rows.length + ' so far (incomplete) — re-run to continue.'); return }
  }

  const processed = new Set<string>(fs.existsSync(PROC) ? JSON.parse(fs.readFileSync(PROC, 'utf8')) : [])
  const skips: Record<string, any> = fs.existsSync(SKIPREP) ? JSON.parse(fs.readFileSync(SKIPREP, 'utf8')) : {}
  const todo = cand.rows.filter((c: any) => !processed.has(c.id))
  console.log('=== CA approval gate (' + (apply ? 'APPLY' : 'DRY RUN') + ') ===')
  console.log('CA pending candidates: ' + cand.rows.length + ' | processed: ' + processed.size + ' | remaining: ' + todo.length)

  let cursor = 0, keep = 0, skip = 0, sinceFlush = 0
  const flush = () => {
    fs.writeFileSync(PROC, JSON.stringify([...processed]))
    fs.writeFileSync(SKIPREP, JSON.stringify(skips))
    if (apply) fs.writeFileSync(SNAP, JSON.stringify(snap))
  }
  async function worker() {
    while (cursor < todo.length && Date.now() < DEADLINE) {
      const r = todo[cursor++]
      let v = 'KEEP'
      try {
        const resp = await anth.messages.create({ model: HAIKU, max_tokens: 4, messages: [{ role: 'user', content: PROMPT(r.title, r.description || r.summary) }] })
        v = (resp.content || []).map((c: any) => c.text || '').join('').trim().toUpperCase()
      } catch { continue }
      const isSkip = v.startsWith('SKIP')
      if (isSkip) { skips[r.id] = { id: r.id, category: r.category, title: r.title, snippet: (r.description || r.summary || '').replace(/\s+/g, ' ').slice(0, 140) }; skip++ }
      else keep++
      if (apply) {
        snap.rows.push({ id: r.id, status: 'pending_review' })
        await sb.from('reports').update({ status: isSkip ? 'archived' : 'approved' }).eq('id', r.id)
      }
      processed.add(r.id)
      if (++sinceFlush >= 20) { flush(); sinceFlush = 0 }
    }
  }
  await Promise.all(Array.from({ length: POOL }, () => worker()))
  flush()
  console.log('\nthis run → ' + (apply ? '' : 'would ') + 'KEEP(approve) ' + keep + ' | ' + (apply ? '' : 'would ') + 'SKIP(archive) ' + skip + ' | processed this run ' + (keep + skip))
  console.log('total skips recorded: ' + Object.keys(skips).length + '  (see ' + path.basename(SKIPREP) + ')')
  console.log('sample SKIP decisions:')
  for (const k of Object.keys(skips).slice(-15)) console.log('  SKIP [' + skips[k].category + '] ' + (skips[k].title || '').slice(0, 75))
  if (!apply) console.log('\nDRY RUN — re-run to gate more; then --apply (reversible: --revert).')
}
main().catch(e => { console.error('[gate] unhandled:', e); process.exit(1) })
