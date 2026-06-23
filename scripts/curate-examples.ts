/**
 * curate-examples.ts — V11.20.5
 *
 * Curates the "Others shared" onboarding examples. Gathers clean approved
 * candidates across brand-safe categories + short/long length tiers, rates
 * each EXCELLENT/GOOD/WEAK via Haiku, and writes a ranked set to
 * outputs/curated-examples.json for human review before baking into
 * /api/onboarding/examples.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/curate-examples.ts          # gather + rate (resumable; re-run until done)
 *   npx tsx scripts/curate-examples.ts --report # print the EXCELLENT shortlist
 */
import * as fs from 'fs'
import * as path from 'path'

const HAIKU = 'claude-haiku-4-5-20251001'
const OUT = path.resolve(process.cwd(), 'outputs/curated-examples.json')
const DEADLINE = Date.now() + 36000
const POOL = 10

const CATEGORIES = ['ufos_aliens', 'ghosts_hauntings', 'cryptids', 'psychic_phenomena', 'consciousness_practices', 'religion_mythology', 'esoteric_practices']
const FIRST_PERSON_SOURCES = ['reddit', 'nuforc', 'nderf', 'oberf'] // exclude historical newspaper ingestion
const PER_BUCKET = 16 // candidates to pull per (category × tier)

// Same brand-safety rejects as the live endpoint.
const REJECT = [
  /^\s*note\s*[:\-]/i, /\bi (write|record|journal) my dreams\b/i, /\bi modified|i edited|i changed this\b/i,
  /\b(might|may) not make sense\b/i, /\bgrammatical/i, /\bthis (is|was) (a |my )?dream\b/i,
  /\bthis is fiction\b/i, /\bcreative writing\b/i, /\bmade this up\b/i,
  /\b(killed|kill|murder|stabbed|suicide|self[\s-]?harm|raped?|molest|abused?)\b/i,
  /https?:\/\//i, /[\[\]]/,
]
function clean(raw: string): string | null {
  let s = (raw || '').toString().trim()
  if (!s) return null
  s = s.replace(/^\s*(?:\[[^\]]{1,40}\]\s*[-–—:]?\s*)+/g, '').trim()
  for (const re of REJECT) if (re.test(s)) return null
  const letters = s.replace(/[^A-Za-z]/g, '')
  if (letters.length > 20 && (letters.match(/[A-Z]/g) || []).length / letters.length > 0.6) return null
  if (s.length > 0 && /[a-z]/.test(s[0])) s = s[0].toUpperCase() + s.slice(1)
  return s
}

const PROMPT = (summary: string) => `You are curating example experience reports shown on the welcome screen of Paradocs, an archive of anomalous/paranormal first-hand experiences. New visitors read these to understand what to share.

Rate this single account as ONE word:
- EXCELLENT — written in the FIRST PERSON (the author recounting what happened to THEM — "I saw…", "I felt…", "we were…"); vivid, clear, self-contained, compelling; reasonably clean grammar; unmistakably a real first-hand anomalous experience; brand-safe and inviting.
- GOOD — first-person and on-topic but unremarkable or slightly rough.
- WEAK — NOT first-person (third-person/historical/news reportage, "a man reported…", "according to…"), OR second-hand ("my friend told me"), OR confusing, fragmentary, off-topic, poor grammar, meta/question, or unsettling.

A great example reads like a person sharing their own experience, not a news article about someone else.

ACCOUNT: ${summary}

Answer with ONLY one word: EXCELLENT, GOOD, or WEAK.`

async function main() {
  const reportOnly = process.argv.includes('--report')
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const anth = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  type Cand = { id: string; category: string; tier: 'short' | 'long'; summary: string; rating?: string }
  let state: { gathered: boolean; cands: Cand[] } = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { gathered: false, cands: [] }
  const save = () => { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(state, null, 2)) }

  if (reportOnly) {
    const ex = state.cands.filter(c => c.rating === 'EXCELLENT')
    const byCat: Record<string, Cand[]> = {}
    ex.forEach(c => { (byCat[c.category] ||= []).push(c) })
    console.log('EXCELLENT candidates: ' + ex.length + ' (of ' + state.cands.length + ' rated ' + state.cands.filter(c => c.rating).length + ')')
    for (const cat of CATEGORIES) {
      const list = byCat[cat] || []
      console.log('\n### ' + cat + ' (' + list.length + ')')
      list.forEach(c => console.log('  [' + c.tier + '] ' + c.summary))
    }
    return
  }

  // ---- Gather (once) ----
  if (!state.gathered) {
    const seen = new Set(state.cands.map(c => c.id))
    const tierOf = (n: number): 'short' | 'long' | null => (n >= 70 && n <= 180) ? 'short' : (n >= 181 && n <= 420) ? 'long' : null
    for (const cat of CATEGORIES) {
      // char_length() isn't filterable here, so pull a pool and bucket by
      // length in JS. Page a few hundred to find enough per tier.
      const r = await sb.from('reports')
        .select('id,summary,category')
        .eq('status', 'approved').eq('category', cat)
        .in('source_type', FIRST_PERSON_SOURCES)
        .not('summary', 'is', null)
        .limit(800)
      if (r.error) { console.error('[gather]', cat, r.error.message); continue }
      const counts: Record<string, number> = { short: 0, long: 0 }
      for (const row of (r.data || [])) {
        if (counts.short >= PER_BUCKET && counts.long >= PER_BUCKET) break
        if (seen.has(row.id)) continue
        const s = clean(row.summary || '')
        if (!s) continue
        const tier = tierOf(s.length)
        if (!tier || counts[tier] >= PER_BUCKET) continue
        seen.add(row.id); state.cands.push({ id: row.id, category: cat, tier, summary: s }); counts[tier]++
      }
    }
    state.gathered = true; save()
    console.log('gathered ' + state.cands.length + ' candidates across ' + CATEGORIES.length + ' categories × 2 tiers')
  }

  // ---- Rate (resumable) ----
  const todo = state.cands.filter(c => !c.rating)
  console.log('rating: ' + todo.length + ' remaining (of ' + state.cands.length + ')')
  let cursor = 0, done = 0, sinceFlush = 0
  async function worker() {
    while (cursor < todo.length && Date.now() < DEADLINE) {
      const c = todo[cursor++]
      try {
        const resp = await anth.messages.create({ model: HAIKU, max_tokens: 4, messages: [{ role: 'user', content: PROMPT(c.summary) }] })
        const v = (resp.content || []).map((x: any) => x.text || '').join('').trim().toUpperCase()
        c.rating = v.startsWith('EXCELLENT') ? 'EXCELLENT' : v.startsWith('GOOD') ? 'GOOD' : 'WEAK'
        done++
      } catch { continue }
      if (++sinceFlush >= 10) { save(); sinceFlush = 0 }
    }
  }
  await Promise.all(Array.from({ length: POOL }, () => worker()))
  save()
  const rated = state.cands.filter(c => c.rating).length
  const ex = state.cands.filter(c => c.rating === 'EXCELLENT').length
  console.log('rated this run: ' + done + ' | total rated ' + rated + '/' + state.cands.length + ' | EXCELLENT so far: ' + ex)
  if (rated < state.cands.length) console.log('re-run to finish rating. Then: npx tsx scripts/curate-examples.ts --report')
}
main().catch(e => { console.error('[curate] unhandled:', e); process.exit(1) })
