/**
 * find-replacements.ts — V11.20.8
 *
 * Finds fresh, strong first-person example candidates to replace weak ones
 * in the onboarding carousel. Pulls from first-person sources (excluding
 * IDs already curated), and in ONE Haiku call per candidate both judges
 * and polishes: keeps only vivid first-person anomalous experiences and
 * rewrites them into clean short/long excerpts. Outputs options for review.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/find-replacements.ts          # find (resumable)
 *   npx tsx scripts/find-replacements.ts --report
 */
import * as fs from 'fs'
import * as path from 'path'

const HAIKU = 'claude-haiku-4-5-20251001'
const USED = path.resolve(process.cwd(), 'outputs/curated-final.json')
const OUT = path.resolve(process.cwd(), 'outputs/replacement-options.json')
const DEADLINE = Date.now() + 36000
const POOL = 8
const TARGET = 8
// Lean toward the thin categories (ghosts/religion) but allow strong ones anywhere.
const CATEGORIES = ['ghosts_hauntings', 'religion_mythology', 'cryptids', 'psychic_phenomena', 'consciousness_practices', 'ufos_aliens']
const SOURCES = ['reddit', 'nuforc', 'nderf', 'oberf']

const PROMPT = (cat: string, raw: string) => `This is a forum post in the "${cat}" category of a paranormal-experience archive. Decide if it is an EXCELLENT example for a welcome-screen carousel, and if so, polish it.

KEEP it ONLY if it is: a vivid FIRST-PERSON account ("I", "we") of an anomalous/paranormal experience the author personally had; self-contained; brand-safe; NOT third-person/second-hand ("my friend told me"), NOT a question/meta/discussion, NOT disturbing/harmful (no poisoning, possession-by-harm, violence, medical emergencies).

If KEEP, rewrite into a clean self-contained excerpt that CAPTURES THE ACTUAL EXPERIENCE (what was seen/heard/felt) — invent nothing, trim preambles, light grammar cleanup.

Return ONLY JSON:
{"keep": true|false, "short": "<one vivid sentence <=160 chars>", "long": "<2-3 sentences <=340 chars>"}
(If keep is false, short/long may be empty.)

POST:
${(raw || '').slice(0, 1000)}`

function parseJson(txt: string): any {
  try { const m = txt.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null }
}

async function main() {
  const reportOnly = process.argv.includes('--report')
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const anth = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let state: { gathered: boolean; cands: any[]; kept: any[]; doneIds: string[] } =
    fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { gathered: false, cands: [], kept: [], doneIds: [] }
  const save = () => fs.writeFileSync(OUT, JSON.stringify(state, null, 2))

  if (reportOnly) {
    console.log('KEPT replacement options: ' + state.kept.length)
    state.kept.forEach((o, i) => console.log('\n' + (i + 1) + '. [' + o.category + ']\n   SHORT: ' + o.short + '\n   LONG:  ' + o.long))
    return
  }

  if (!state.gathered) {
    const used = new Set<string>((JSON.parse(fs.readFileSync(USED, 'utf8')) || []).map((o: any) => o.id))
    for (const cat of CATEGORIES) {
      const r = await sb.from('reports').select('id,description,summary,category')
        .eq('status', 'approved').eq('category', cat).in('source_type', SOURCES)
        .not('description', 'is', null).limit(120)
      if (r.error) { console.error('[gather]', cat, r.error.message); continue }
      const strong = (r.data || []).filter((x: any) => !used.has(x.id) && (x.description || '').length > 600).slice(0, 14)
      for (const row of strong) state.cands.push({ id: row.id, category: row.category, description: row.description })
    }
    state.gathered = true; save()
    console.log('gathered ' + state.cands.length + ' fresh candidates')
  }

  const done = new Set(state.doneIds)
  const todo = state.cands.filter(c => !done.has(c.id))
  let cursor = 0, sinceFlush = 0
  async function worker() {
    while (cursor < todo.length && Date.now() < DEADLINE && state.kept.length < TARGET) {
      const c = todo[cursor++]
      try {
        const resp = await anth.messages.create({ model: HAIKU, max_tokens: 320, messages: [{ role: 'user', content: PROMPT(c.category, c.description) }] })
        const o = parseJson((resp.content || []).map((x: any) => x.text || '').join(''))
        state.doneIds.push(c.id)
        if (o && o.keep && o.short && o.long) state.kept.push({ id: c.id, category: c.category, short: String(o.short).trim(), long: String(o.long).trim() })
      } catch { continue }
      if (++sinceFlush >= 6) { save(); sinceFlush = 0 }
    }
  }
  await Promise.all(Array.from({ length: POOL }, () => worker()))
  save()
  console.log('kept ' + state.kept.length + ' / target ' + TARGET + ' | judged ' + state.doneIds.length + '/' + state.cands.length)
  if (state.kept.length < TARGET && state.doneIds.length < state.cands.length) console.log('re-run to continue. Then: --report')
}
main().catch(e => { console.error('[find] unhandled:', e); process.exit(1) })
