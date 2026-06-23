/**
 * polish-examples.ts — V11.20.6
 *
 * Takes the EXCELLENT+GOOD real first-person candidates from
 * curate-examples.json and lightly copy-edits each into a clean,
 * self-contained excerpt for the "Others shared" onboarding showcase:
 * strips forum preambles/meta, fixes grammar, trims to a tight excerpt,
 * and produces BOTH a short and a long version. Preserves the author's
 * first-person voice and facts — invents nothing.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/polish-examples.ts          # polish (resumable)
 *   npx tsx scripts/polish-examples.ts --report # print polished short/long by category
 */
import * as fs from 'fs'
import * as path from 'path'

const HAIKU = 'claude-haiku-4-5-20251001'
const IN = path.resolve(process.cwd(), 'outputs/curated-examples.json')
const OUT = path.resolve(process.cwd(), 'outputs/curated-final.json')
const DEADLINE = Date.now() + 36000
const POOL = 8

const PROMPT = (raw: string) => `This is a REAL first-person paranormal/anomalous experience report from an online forum. It may have rough grammar, a forum preamble, or be truncated mid-sentence.

Rewrite it as a clean, self-contained excerpt for an "Others shared" showcase on a welcome screen. Rules:
- Keep the author's FIRST-PERSON voice ("I", "we", "my").
- CAPTURE THE ACTUAL EXPERIENCE — what was seen, heard, or felt — not just the setup. The excerpt must contain the concrete anomalous detail (e.g. "a tall shadow stood at the foot of my bed", "three lights moved in formation"), NOT a vague tease like "something I can't explain happened."
- Preserve the actual facts. DO NOT invent or add details — only use what's in the report.
- Remove forum preambles and meta ("Hi everyone", "my first post", "sorry for the formatting", "thank god I found this sub").
- Light grammar/spelling cleanup only.
- Keep it inviting and brand-safe.

Return ONLY valid JSON, no prose:
{"short":"<one vivid complete sentence, max 160 chars>","long":"<2-3 complete sentences, max 340 chars>"}

REPORT:
${(raw || '').slice(0, 900)}`

function parseJson(txt: string): { short: string; long: string } | null {
  try {
    const m = txt.match(/\{[\s\S]*\}/)
    if (!m) return null
    const o = JSON.parse(m[0])
    if (o && typeof o.short === 'string' && typeof o.long === 'string') return { short: o.short.trim(), long: o.long.trim() }
  } catch {}
  return null
}

async function main() {
  const reportOnly = process.argv.includes('--report')
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const anth = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const src = JSON.parse(fs.readFileSync(IN, 'utf8'))
  const pool = (src.cands || []).filter((c: any) => c.rating === 'EXCELLENT' || c.rating === 'GOOD')

  let out: any[] = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : []
  const done = new Set(out.map((o: any) => o.id))
  const save = () => fs.writeFileSync(OUT, JSON.stringify(out, null, 2))

  if (reportOnly) {
    const byCat: Record<string, any[]> = {}
    out.forEach(o => { (byCat[o.category] ||= []).push(o) })
    console.log('polished: ' + out.length)
    for (const cat of Object.keys(byCat)) {
      console.log('\n### ' + cat + ' (' + byCat[cat].length + ')')
      byCat[cat].forEach((o, i) => console.log('  ' + (i + 1) + '. SHORT: ' + o.short + '\n     LONG:  ' + o.long))
    }
    return
  }

  const todo = pool.filter((c: any) => !done.has(c.id))
  console.log('polishing ' + todo.length + ' of ' + pool.length + ' (already done ' + done.size + ')')
  let cursor = 0, n = 0, sinceFlush = 0
  async function worker() {
    while (cursor < todo.length && Date.now() < DEADLINE) {
      const c = todo[cursor++]
      try {
        // Polish from the FULL description (the summary is often just the
        // truncated preamble before the actual experience).
        let source = c.summary
        try {
          const rr = await sb.from('reports').select('description,summary').eq('id', c.id).single()
          if (rr.data && (rr.data.description || rr.data.summary)) source = rr.data.description || rr.data.summary
        } catch {}
        const resp = await anth.messages.create({ model: HAIKU, max_tokens: 300, messages: [{ role: 'user', content: PROMPT(source) }] })
        const txt = (resp.content || []).map((x: any) => x.text || '').join('')
        const p = parseJson(txt)
        if (p && p.short && p.long) { out.push({ id: c.id, category: c.category, rating: c.rating, short: p.short, long: p.long }); n++ }
      } catch { continue }
      if (++sinceFlush >= 6) { save(); sinceFlush = 0 }
    }
  }
  await Promise.all(Array.from({ length: POOL }, () => worker()))
  save()
  console.log('polished this run: ' + n + ' | total ' + out.length + '/' + pool.length)
  if (out.length < pool.length) console.log('re-run to finish. Then: npx tsx scripts/polish-examples.ts --report')
}
main().catch(e => { console.error('[polish] unhandled:', e); process.exit(1) })
