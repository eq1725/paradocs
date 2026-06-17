/**
 * scrub-skeptical-copy.ts — V11.18.38
 *
 * Regenerates the `ai_theories` text for phenomena whose generated copy
 * carries skeptic-VERDICT framing ("not real", "just a hallucination", "no
 * evidence", "misidentification/hoax/mass hysteria" as dismissals). Root
 * cause: the original generator prompt (phenomena.service.ts) asked for
 * "explanations from both believers and skeptics … hoaxes", so the model
 * editorialized toward debunking. This rewrites them in the documentary-but-
 * AFFIRMING house voice: explanations across a spectrum (natural, psychological,
 * cultural, paranormal) presented as perspectives — never a verdict that the
 * experience isn't real. A conventional explanation may appear as ONE lens
 * among several, framed neutrally; it is never the lead or the conclusion.
 *
 * Worst-traffic-first: reads outputs/skeptical-copy-flagged.json (ranked by
 * report_count). --top N to do the highest-traffic N. Re-checks output against
 * a skeptic-verdict lexicon and flags any that still trip it. Reversible.
 *
 * USAGE
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/scrub-skeptical-copy.ts --top 3           # DRY RUN, show before→after
 *   npx tsx scripts/scrub-skeptical-copy.ts --top 25 --apply
 *   npx tsx scripts/scrub-skeptical-copy.ts --apply           # all flagged
 *   npx tsx scripts/scrub-skeptical-copy.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'

const HAIKU = 'claude-haiku-4-5-20251001'
const SNAP = path.resolve(process.cwd(), 'outputs/skeptical-copy-scrub-snapshot.json')
const FLAGGED = path.resolve(process.cwd(), 'outputs/skeptical-copy-flagged.json')
// verdict-style phrases that must NOT appear as the framing (used to re-verify)
const VERDICT = /\b(not real|isn['’]?t real|wasn['’]?t real|merely|just a hallucination|no (scientific |credible )?evidence|debunk|hoax|mass hysteria|simply misidentif|nothing more than|can be dismissed|fabricat)/i

const PROMPT = (name: string, category: string, summary: string, theories: string) => `You are an editor for Paradocs, a documentary archive of anomalous first-person experiences. Rewrite the THEORIES / EXPLANATIONS section for the phenomenon "${name}" (${category}).

VOICE: documentary and scholarly, but AFFIRMING of the experiencer — the account is treated as a real, sincerely reported experience. The honest throughline is "we don't know yet": make the open question explicit ("what produces this is not understood", "no single explanation has accounted for it"). Curiosity over conclusion.

HARD RULES:
- Present the explanation types — natural/scientific, psychological, cultural/historical, and paranormal/anomalous — as PERSPECTIVES with ROUGHLY EQUAL weight and space. Do NOT lead with, privilege, or spend more words on the scientific/conventional explanation than on the others; it is one idea among equals, not the default.
- NEVER state or imply the experience "isn't real", was "just"/"merely" a hallucination, or that there is "no evidence" as a conclusion.
- Do not editorialize toward debunking (no "hoax", "misidentification", "mass hysteria" as dismissals). A mundane account may appear as one proposed explanation among several, framed neutrally ("some suggest…", "others propose…"), never as the lead or the verdict.
- No credulous/guru drift either — do not assert the paranormal explanation is proven. Hold the gap: the explanations span a spectrum and the experience remains genuinely reported and unresolved.
- Preserve well-documented facts already present; invent no dates, names, or studies.
- 2–3 short paragraphs, plain encyclopedic English. Return ONLY the rewritten text — no preamble, no JSON, no headings.

SUMMARY: ${summary || '(none)'}
EXISTING THEORIES (rebalance, do not dismiss): ${theories || '(none)'}`

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')
  const topI = process.argv.indexOf('--top')
  const top = topI >= 0 ? parseInt(process.argv[topI + 1], 10) : 0
  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }

  if (revert) {
    if (!fs.existsSync(SNAP)) { console.error('no snapshot'); process.exit(1) }
    const rows = JSON.parse(fs.readFileSync(SNAP, 'utf8')).rows || []
    for (const r of rows) await sb.from('phenomena').update({ ai_theories: r.ai_theories }).eq('id', r.id)
    console.log('[scrub] reverted ' + rows.length); return
  }

  let flagged: any[] = JSON.parse(fs.readFileSync(FLAGGED, 'utf8'))
  flagged.sort((a, b) => (b.report_count || 0) - (a.report_count || 0))
  if (top > 0) flagged = flagged.slice(0, top)

  // Resumable: load prior snapshot, skip phenomena already scrubbed, append.
  const snap: any[] = (apply && fs.existsSync(SNAP)) ? (JSON.parse(fs.readFileSync(SNAP, 'utf8')).rows || []) : []
  const doneIds = new Set(snap.map((r: any) => r.id))
  console.log('[scrub] ' + flagged.length + ' candidates (' + (apply ? 'APPLY' : 'DRY RUN') + ', worst-traffic first)' + (doneIds.size ? ' — resuming, ' + doneIds.size + ' already scrubbed' : ''))

  const { Anthropic } = await import('@anthropic-ai/sdk')
  const ai = new Anthropic({ apiKey: key })
  let done = 0, stillFlagged = 0
  for (const f of flagged) {
    const cur = await sb.from('phenomena').select('id,name,category,ai_summary,ai_theories').eq('name', f.name).eq('category', f.category).limit(1)
    const p = cur.data && cur.data[0]; if (!p) continue
    if (apply && doneIds.has(p.id)) continue   // resume: already scrubbed
    let out = ''
    try {
      const resp = await ai.messages.create({ model: HAIKU, max_tokens: 900, messages: [{ role: 'user', content: PROMPT(p.name, p.category, p.ai_summary, p.ai_theories) }] })
      out = (resp.content || []).map((c: any) => c.text || '').join('').trim()
    } catch (e: any) { console.warn('  AI err ' + p.name + ': ' + (e?.message || e)); continue }
    const tripped = VERDICT.test(out)
    if (tripped) stillFlagged++
    if (!apply && done < 4) {
      console.log('\n──── ' + p.name + ' (' + p.category + ', rc=' + (f.report_count || 0) + ') ────')
      console.log('BEFORE: ' + String(p.ai_theories || '').slice(0, 260).replace(/\s+/g, ' '))
      console.log('AFTER:  ' + out.slice(0, 320).replace(/\s+/g, ' ') + (tripped ? '   ⚠ still trips verdict-lexicon' : '   ✓ clean'))
    }
    if (apply) {
      snap.push({ id: p.id, ai_theories: p.ai_theories })
      const u = await sb.from('phenomena').update({ ai_theories: out }).eq('id', p.id)
      if (!u.error) done++
    } else { done++ }
  }
  if (apply) {
    fs.mkdirSync(path.dirname(SNAP), { recursive: true }); fs.writeFileSync(SNAP, JSON.stringify({ savedAt: new Date().toISOString(), rows: snap }, null, 0))
    console.log('\n[scrub] rewrote ' + done + ' phenomena (' + stillFlagged + ' still tripped lexicon — review). Revert: --revert')
  } else {
    console.log('\n[scrub] DRY RUN processed ' + done + ' (' + stillFlagged + ' would still trip lexicon). --apply to write (reversible).')
  }
}
main().catch(e => { console.error('[scrub] unhandled:', e); process.exit(1) })
