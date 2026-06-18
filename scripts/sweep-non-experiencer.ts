/**
 * sweep-non-experiencer.ts — V11.18.43
 *
 * QA sweep: Paradocs archives anomalous FIRST-PERSON EXPERIENCES. Some ingested
 * Reddit posts (esp. r/witchcraft) are NOT experiences — they're spell REQUESTS,
 * how-to/advice, questions, or discussion. This gates candidate reports through
 * Haiku and archives the non-experiencer ones (status → 'archived', reversible).
 *
 * Candidate filters:
 *   --filter markers     reddit posts whose title matches request/advice markers (default)
 *   --filter witchcraft  ALL r/witchcraft reddit posts (the deep sweep)
 *
 * Gate keeps anything that is a genuine experience OR ambiguous; archives only
 * clear non-experiencer posts. Reversible via snapshot. Time-boxed + resumable.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/sweep-non-experiencer.ts --filter markers            # DRY RUN (shows gate decisions)
 *   npx tsx scripts/sweep-non-experiencer.ts --filter markers --apply
 *   npx tsx scripts/sweep-non-experiencer.ts --filter witchcraft --apply # loop until remaining:0
 *   npx tsx scripts/sweep-non-experiencer.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'

const HAIKU = 'claude-haiku-4-5-20251001'
const SNAP = path.resolve(process.cwd(), 'outputs/non-experiencer-sweep-snapshot.json')
const CACHE = path.resolve(process.cwd(), 'outputs/non-experiencer-processed.json') // ids gated + KEPT (skip next run)
const DEADLINE = Date.now() + 34000
const POOL = 10

const MARKERS = ['spell request', 'seeks spell', 'seeking spell', 'seeks a spell', 'seeks ritual', 'seeks protection', 'request for a spell', 'looking for a spell', 'can someone', 'does anyone have', '[request]', 'i need a spell', 'need a spell', 'requesting', 'help crafting', 'help me craft', 'recommend a spell', 'in search of', 'spell needed', 'seeks charm', 'seeks spellwork', 'seeks spell work']

const PROMPT = (title: string, body: string) => `Paradocs is an archive of anomalous FIRST-PERSON EXPERIENCES (someone recounting a paranormal/anomalous event they personally witnessed or lived through).

Classify this Reddit post as exactly one word:
- EXPERIENCE — a first-person account of an anomalous/paranormal experience or event the author witnessed or lived through (even if it also mentions a ritual, as long as the core is a recounted experience/outcome).
- REQUEST — NOT an experience: a request for a spell, a how-to / advice / tutorial, a question seeking help or recommendations, a discussion/opinion/meta post, or selling.

If genuinely unclear, answer EXPERIENCE (we only remove clear non-experiences).

TITLE: ${title}
BODY: ${(body || '').slice(0, 700)}

Answer with ONLY one word: EXPERIENCE or REQUEST.`

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')
  const fi = process.argv.indexOf('--filter')
  const filter = fi >= 0 ? process.argv[fi + 1] : 'markers'
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

  // candidates
  let q = sb.from('reports').select('id,title,summary,description,category,source_label,metadata').eq('status', 'approved').eq('source_type', 'reddit')
  if (filter === 'witchcraft') q = q.ilike('source_label', '%witchcraft%')
  else q = q.or(MARKERS.map(m => `title.ilike.%${m}%`).join(','))
  const cand: any[] = []
  let from = 0
  while (true) { const r = await q.range(from, from + 999); const rows = r.data || []; cand.push(...rows); if (rows.length < 1000) break; from += 1000 }

  const processed = new Set<string>(fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : [])
  const todo = cand.filter(c => !processed.has(c.id))
  console.log('=== non-experiencer sweep (' + filter + ', ' + (apply ? 'APPLY' : 'DRY RUN') + ') ===')
  console.log('candidates: ' + cand.length + ' | already processed: ' + processed.size + ' | remaining: ' + todo.length)

  let cursor = 0, archived = 0, kept = 0, sinceFlush = 0
  const samples: string[] = []
  const flush = () => {
    fs.mkdirSync(path.dirname(SNAP), { recursive: true })
    fs.writeFileSync(SNAP, JSON.stringify(snap)); fs.writeFileSync(CACHE, JSON.stringify([...processed]))
  }
  async function worker() {
    while (cursor < todo.length && Date.now() < DEADLINE) {
      const r = todo[cursor++]
      let verdict = 'EXPERIENCE'
      try {
        const resp = await anth.messages.create({ model: HAIKU, max_tokens: 6, messages: [{ role: 'user', content: PROMPT(r.title, r.description || r.summary) }] })
        verdict = (resp.content || []).map((c: any) => c.text || '').join('').trim().toUpperCase()
      } catch (e: any) { continue } // leave for next run
      if (verdict.startsWith('REQUEST')) {
        if (samples.length < 25) samples.push('  ARCHIVE  [' + r.category + '] ' + r.title)
        if (apply) {
          snap.rows.push({ id: r.id, status: 'approved' })
          await sb.from('reports').update({ status: 'archived', metadata: { ...(r.metadata || {}), qa_removed: 'non_experiencer', qa_removed_at: new Date().toISOString() } }).eq('id', r.id)
        }
        archived++
      } else { processed.add(r.id); kept++; if (samples.length < 25) samples.push('  keep     [' + r.category + '] ' + r.title) }
      if (apply && ++sinceFlush >= 15) { flush(); sinceFlush = 0 }
    }
  }
  await Promise.all(Array.from({ length: POOL }, () => worker()))
  if (apply) flush()
  console.log('\nsample decisions:'); for (const s of samples.slice(0, 25)) console.log(s)
  console.log('\nthis run → ' + (apply ? 'archived ' : 'would-archive ') + archived + ' | kept ' + kept + ' | remaining ' + (todo.length - cursor < 0 ? 0 : todo.length - (archived + kept)))
  if (!apply) console.log('DRY RUN — re-run with --apply to archive (reversible: --revert).')
}
function deadlineBase() { return Date.now() }
main().catch(e => { console.error('[sweep] unhandled:', e); process.exit(1) })
