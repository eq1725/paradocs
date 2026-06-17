/**
 * gen-worklist-descriptions.ts — one-off. Generates image-sourcing descriptions
 * for the 100 "Needs Images" phenomena, grounded in each phenomenon's DB summary.
 * Resumable (cache) + time-boxed for the 45s sandbox cap. Loop until "remaining: 0".
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/gen-worklist-descriptions.ts
 */
import * as fs from 'fs'
import * as path from 'path'

const HAIKU = 'claude-haiku-4-5-20251001'
const CACHE = path.resolve(process.cwd(), 'outputs/worklist-desc-cache-v4.json')
const DEADLINE = Date.now() + 35000
const POOL = 6

// exact order of the "Needs Images" tab
const ORDER = ['dream-yoga','dream-visitation','breathwork','samadhi','eye-gazing','dover-demon','goatman','pukwudgie','loch-ness-monster','ozark-howler','lizard-man-of-scape-ore-swamp','agropelter','batsquatch','metoh-kangmi','champ','mokele-mbembe','ogopogo','adze','kongamato','automatic-drawing','umbanda-spirit-guide-work','visitor-spirit','residual-haunting','old-hag-syndrome','mimicking-spirit','orbs','trapped-spirit','portal-haunting','vengeful-spirit','battlefield-ghost','noppera-bo','haunted-doll','will-o-the-wisp','headless-ghost','trance-mediumship','loup-garou','yurei','wraith','ubume','rokurokubi','pontianak','abiku','dullahan','onryo','lougarou','inugami','phantom-ship','nekomata','gashadokuro','obayifo','yuki-onna','tsurube-otoshi','veridical-dream','astral-travel','non-local-consciousness','past-life-memory','sleep-paralysis','near-death-experience','missing-time','distressing-nde','the-baader-meinhof-phenomenon','deathbed-vision','prayer-experience','resurrection-experience','spontaneous-human-combustion','angels','miracles','marian-apparitions','theophany','saint-apparitions','religious-ecstasy','hypnagogic-deity-vision','holy-relics','eucharistic-miracles','beatific-vision','stigmata','incorruptible-saints','the-dreamtime','archangel-gabriel','archangel-raphael','bleeding-statues','archangel-michael','archangel-uriel','triangular-ufo','close-encounter-of-the-third-kind','grey-alien','close-encounter-of-the-fourth-kind','metallic-disc-ufo','physical-trace-evidence','alien-implant','ufo-hotspot','rod-skyfish','hybridization-program','majestic-12','hybrid-alien','gimbal-ufo','gofast-ufo','arcturian','jinn-et-interpretation','hopkinsville-goblins']

const PROMPT = (name: string, cat: string, summary: string) => `Write a single plain, encyclopedic ONE-sentence DEFINITION of what the phenomenon below IS — like a glossary or dictionary entry.

About 12-25 words. Define the term neutrally and factually; where it is a reported/claimed experience, frame it that way (e.g. "a reported experience in which…", "an alleged…"). Ground it in the reference summary. Do NOT describe an image, photo, mood, or what to depict — just define the phenomenon. No quotation marks, no preamble, no line breaks. Output ONLY the definition sentence.

Phenomenon: ${name} (${cat.replace(/_/g,' ')})
Reference summary: ${summary || '(none — use general knowledge of this phenomenon)'}`

async function main() {
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const anth = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const meta = new Map<string, any>()
  for (let i = 0; i < ORDER.length; i += 200) {
    const r = await sb.from('phenomena').select('slug,name,category,ai_summary').in('slug', ORDER.slice(i, i + 200))
    for (const p of (r.data || [])) meta.set(p.slug, p)
  }
  const cache: Record<string, string> = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {}
  const todo = ORDER.filter(s => !cache[s] && meta.has(s))
  let cursor = 0, done = 0
  async function worker() {
    while (cursor < todo.length && Date.now() < DEADLINE) {
      const slug = todo[cursor++]; const p = meta.get(slug)
      try {
        const resp = await anth.messages.create({ model: HAIKU, max_tokens: 120, messages: [{ role: 'user', content: PROMPT(p.name, p.category, p.ai_summary) }] })
        let t = (resp.content || []).map((c: any) => c.text || '').join('').trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '')
        cache[slug] = t; done++
        if (done % 8 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache))
      } catch (e: any) { /* leave for next run */ }
    }
  }
  await Promise.all(Array.from({ length: POOL }, () => worker()))
  fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache))
  const have = ORDER.filter(s => cache[s]).length
  console.log('generated this run: ' + done + ' | total have: ' + have + '/' + ORDER.length + ' | remaining: ' + (ORDER.length - have))

  if (have === ORDER.length) {
    const esc = (s: any) => { s = s == null ? '' : String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
    const csv = [['slug', 'phenomenon', 'description'].join(',')]
    const col: string[] = []
    for (const s of ORDER) { const p = meta.get(s); csv.push([s, p.name, cache[s]].map(esc).join(',')); col.push(cache[s]) }
    fs.writeFileSync(path.resolve(process.cwd(), 'worklist-descriptions.csv'), csv.join('\n'))
    fs.writeFileSync(path.resolve(process.cwd(), 'worklist-descriptions-column.txt'), col.join('\n'))
    console.log('✓ wrote worklist-descriptions.csv + worklist-descriptions-column.txt (in sheet order)')
  }
}
main().catch(e => { console.error('unhandled:', e); process.exit(1) })
