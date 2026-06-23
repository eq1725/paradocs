#!/usr/bin/env tsx
/**
 * ca-narrate-pass.ts — V11.20.10
 *
 * Narrate-only backfill for Chronicling-America (CA) pending_review reports
 * that lack a paradocs_narrative. This is the backlog bottleneck:
 * scripts/ca-auto-approve.ts HOLDS rows with reason 'no_narrative' because
 * the publish gate REQUIRES paradocs_narrative. This pass fills that field
 * (and the sibling AI fields) so auto-approve can promote them.
 *
 * VOICE / PROMPT REUSE (critical — do NOT invent a new voice):
 *   This script reuses the SAME generator the live ingestion path and the
 *   batch worker use, so CA narratives match the rest of the corpus:
 *     - CONSOLIDATED_SYSTEM_PROMPT      (src/lib/services/consolidated-ai.service.ts)
 *     - buildConsolidatedUserPrompt(r)  (same module)
 *     - persistConsolidatedResult(...)  (same module — writes paradocs_narrative
 *       from parsed.analysis, plus feed_hook, answer_line, paradocs_assessment,
 *       witness_profile, title/slug refresh, model marker)
 *   The ONLY difference vs batch-ingest-worker.ts --no-promote is transport:
 *   this makes synchronous single-shot Haiku calls (same model, same prompt,
 *   same caching) so it can run time-boxed inside the ingest daemon instead
 *   of waiting up to 24h for the Batch API. It does NOT change report status —
 *   ca-auto-approve.ts remains the sole promoter.
 *
 * SELECTION:
 *   status='pending_review' AND source_type='chronicling-america'
 *   AND (paradocs_narrative IS NULL OR '')
 *   AND NOT metadata.genre_flags.period_sensitive===true   (stays held)
 *   AND NOT metadata.genre_flags.retold_folklore===true     (stays held — folklore
 *       stays out of the live archive per founder decision; don't waste spend)
 *   (fiction_suspected / advertisement holds are left to the gate; we still
 *    skip narrating period_sensitive + retold_folklore here to avoid spend.)
 *
 * RESUMABLE + TIME-BOXED + COST-AWARE:
 *   - candidate snapshot cached in outputs/ (resumable gather)
 *   - processed-id cache in outputs/ (skip already-narrated rows across runs)
 *   - per-run time box (RUN_BUDGET_SEC, default 50s) so repeated daemon calls
 *     drain the backlog in chunks and always exit cleanly
 *   - per-run cost ceiling (MAX_COST_USD env, default 5) — stops submitting
 *     when the run's accumulated spend reaches the cap
 *   - POOL concurrency for throughput
 *
 * USAGE
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/ca-narrate-pass.ts                 # DRY RUN: count + samples + cost est (<=3 Haiku calls)
 *   npx tsx scripts/ca-narrate-pass.ts --apply         # narrate a time-boxed chunk, write to DB, resumable
 *   MAX_COST_USD=10 RUN_BUDGET_SEC=120 npx tsx scripts/ca-narrate-pass.ts --apply
 *   npx tsx scripts/ca-narrate-pass.ts --reset-cache   # clear candidate + processed caches
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  CONSOLIDATED_SYSTEM_PROMPT,
  buildConsolidatedUserPrompt,
  persistConsolidatedResult,
} from '../src/lib/services/consolidated-ai.service'

// ── Config ──────────────────────────────────────────────────────────
const HAIKU = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 2500
const TEMPERATURE = 0.4

// Haiku 4.5 single-shot (non-batch) pricing, $/M tokens. Mirrors
// consolidated-ai.service.ts (input 1.0, output 5.0, cache write 1.25x,
// cache read 0.10x).
const IN_PER_M = 1.0
const OUT_PER_M = 5.0
const CACHE_WRITE_PER_M = 1.25
const CACHE_READ_PER_M = 0.10

const CAND = path.resolve(process.cwd(), 'outputs/ca-narrate-candidates.json')
const PROC = path.resolve(process.cwd(), 'outputs/ca-narrate-processed.json')
const START = Date.now()

const RUN_BUDGET_SEC = parseInt(process.env.RUN_BUDGET_SEC || '50', 10)
const GATHER_DEADLINE = START + Math.min(20000, RUN_BUDGET_SEC * 1000)
const DEADLINE = START + RUN_BUDGET_SEC * 1000
const POOL = parseInt(process.env.NARRATE_POOL || '6', 10)
const MAX_COST_USD = parseFloat(process.env.MAX_COST_USD || '5')

// Dry-run cost-estimate assumptions (cached system prompt; CA bodies are
// short OCR snippets so user-token + output averages run low).
const EST_USER_TOKENS = 1200
const EST_OUTPUT_TOKENS = 900

// ── Candidate gate (mirror ca-auto-approve hold reasons we don't want to spend on) ──
function needsNarrative(r: any): boolean {
  const n = r.paradocs_narrative
  return !n || String(n).trim().length === 0
}
function heldNoSpend(r: any): boolean {
  const gf = (r.metadata && r.metadata.genre_flags) || {}
  // period_sensitive + retold_folklore stay held by the gate; narrating them
  // would burn spend on rows that never publish. Skip them here.
  return gf.period_sensitive === true || gf.retold_folklore === true
}

function costFor(usage: any): number {
  const inTok = usage.input_tokens || 0
  const outTok = usage.output_tokens || 0
  const cWrite = usage.cache_creation_input_tokens || 0
  const cRead = usage.cache_read_input_tokens || 0
  return (
    (inTok / 1e6) * IN_PER_M +
    (cWrite / 1e6) * CACHE_WRITE_PER_M +
    (cRead / 1e6) * CACHE_READ_PER_M +
    (outTok / 1e6) * OUT_PER_M
  )
}

function parseConsolidatedJson(rawText: string): any | null {
  try {
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const s = cleaned.indexOf('{')
    const e = cleaned.lastIndexOf('}')
    if (s >= 0 && e > s) return JSON.parse(cleaned.substring(s, e + 1))
  } catch (_e) { /* fall through */ }
  return null
}

async function main() {
  const apply = process.argv.includes('--apply')
  const resetCache = process.argv.includes('--reset-cache')

  const d = await import('dotenv'); d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const { createClient } = await import('@supabase/supabase-js')
  const { Anthropic } = await import('@anthropic-ai/sdk')

  if (resetCache) {
    for (const f of [CAND, PROC]) if (fs.existsSync(f)) fs.unlinkSync(f)
    console.log('[ca-narrate] caches cleared (' + path.basename(CAND) + ', ' + path.basename(PROC) + ')')
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('[ca-narrate] missing Supabase creds — source .env.local'); process.exit(1) }
  if (!process.env.ANTHROPIC_API_KEY) { console.error('[ca-narrate] missing ANTHROPIC_API_KEY — source .env.local'); process.exit(1) }
  const sb = createClient(url, key)
  const anth = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // ── Gather pending CA needing narrative (cached, resumable) ──────────
  let cand: any = fs.existsSync(CAND) ? JSON.parse(fs.readFileSync(CAND, 'utf8')) : { complete: false, page: 0, rows: [] }
  if (!cand.complete) {
    const have = new Set(cand.rows.map((r: any) => r.id))
    while (Date.now() < GATHER_DEADLINE) {
      const from = cand.page * 1000
      const r = await sb.from('reports')
        // Same column set persistConsolidatedResult's siblings need + the
        // gate fields. buildConsolidatedUserPrompt reads title/category/
        // location/country/state/city/event_date/source_type/source_label/
        // description.
        .select('id,title,summary,description,category,location_name,country,state_province,city,event_date,source_type,source_label,tags,paradocs_narrative,metadata,status')
        // V11.20.10 — backfill narrative for CA rows missing it whether they
        // are still pending OR already approved (the relevance gate published
        // ~6,500 narrative-less rows; founder chose narrative-required quality,
        // so those live rows need narratives too).
        .in('status', ['approved', 'pending_review']).eq('source_type', 'chronicling-america')
        .order('created_at', { ascending: true }).range(from, from + 999)
      if (r.error) { console.error('[gather]', r.error.message); break }
      const rows = r.data || []
      for (const row of rows) {
        if (have.has(row.id)) continue
        if (!needsNarrative(row)) continue
        if (heldNoSpend(row)) continue
        have.add(row.id); cand.rows.push(row)
      }
      cand.page++
      if (rows.length < 1000) { cand.complete = true; break }
    }
    fs.mkdirSync(path.dirname(CAND), { recursive: true }); fs.writeFileSync(CAND, JSON.stringify(cand))
    if (!cand.complete) { console.log('[ca-narrate] gather: ' + cand.rows.length + ' candidates so far (incomplete) — re-run to continue.'); return }
  }

  const processed = new Set<string>(fs.existsSync(PROC) ? JSON.parse(fs.readFileSync(PROC, 'utf8')) : [])
  const todo = cand.rows.filter((c: any) => !processed.has(c.id))

  console.log('=== CA narrate pass (' + (apply ? 'APPLY' : 'DRY RUN') + ') ===')
  console.log('CA pending needing narrative: ' + cand.rows.length + ' | already narrated (cache): ' + processed.size + ' | remaining: ' + todo.length)

  // ── DRY RUN: count + cost estimate + <=3 sample narratives, no writes ──
  if (!apply) {
    const estSystemTokens = Math.ceil(CONSOLIDATED_SYSTEM_PROMPT.length / 4)
    const perFirst = (EST_USER_TOKENS / 1e6) * IN_PER_M + (estSystemTokens / 1e6) * CACHE_WRITE_PER_M + (EST_OUTPUT_TOKENS / 1e6) * OUT_PER_M
    const perCached = (EST_USER_TOKENS / 1e6) * IN_PER_M + (estSystemTokens / 1e6) * CACHE_READ_PER_M + (EST_OUTPUT_TOKENS / 1e6) * OUT_PER_M
    const n = todo.length
    const estTotal = n > 0 ? perFirst + perCached * (n - 1) : 0
    console.log('\n--- cost estimate (single-shot Haiku, cached system prompt) ---')
    console.log('est system tokens (cached):     ~' + estSystemTokens)
    console.log('est per report (cache read):    $' + perCached.toFixed(5))
    console.log('est TOTAL for ' + n + ' rows:        $' + estTotal.toFixed(2))

    // Generate up to 3 real samples so the operator can eyeball the voice.
    const sampleN = Math.min(3, todo.length)
    if (sampleN > 0) {
      console.log('\n--- ' + sampleN + ' sample narrative(s) (live Haiku, not persisted) ---')
      for (let i = 0; i < sampleN; i++) {
        const r = todo[i]
        try {
          const resp = await anth.messages.create({
            model: HAIKU, max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
            system: [{ type: 'text', text: CONSOLIDATED_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }] as any,
            messages: [{ role: 'user', content: buildConsolidatedUserPrompt(r) }],
          })
          const raw = (resp.content || []).map((c: any) => c.text || '').join('')
          const parsed = parseConsolidatedJson(raw)
          const narrative = parsed && parsed.analysis ? String(parsed.analysis) : '(parse failed)'
          console.log('\n[' + (i + 1) + '] ' + String(r.title || '(untitled)').slice(0, 70))
          console.log('    title→ ' + (parsed && parsed.title ? parsed.title : '(none)'))
          console.log('    narrative→ ' + narrative.replace(/\n+/g, ' ').slice(0, 420) + (narrative.length > 420 ? '…' : ''))
        } catch (e: any) {
          console.log('\n[' + (i + 1) + '] sample call failed: ' + (e?.message || e))
        }
      }
    }
    console.log('\nDRY RUN — no DB writes. Run with --apply to narrate a time-boxed chunk (resumable, cost-capped at $' + MAX_COST_USD.toFixed(2) + '/run).')
    return
  }

  // ── APPLY: time-boxed, cost-capped, concurrent narrate + persist ──────
  let cursor = 0, done = 0, parseFail = 0, persistFail = 0, runCost = 0, capped = false, sinceFlush = 0
  const flush = () => fs.writeFileSync(PROC, JSON.stringify(Array.from(processed)))

  async function worker() {
    while (cursor < todo.length && Date.now() < DEADLINE && !capped) {
      if (runCost >= MAX_COST_USD) { capped = true; break }
      const r = todo[cursor++]
      let parsed: any = null, costThis = 0
      try {
        const resp = await anth.messages.create({
          model: HAIKU, max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
          system: [{ type: 'text', text: CONSOLIDATED_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }] as any,
          messages: [{ role: 'user', content: buildConsolidatedUserPrompt(r) }],
        })
        costThis = costFor((resp as any).usage || {})
        runCost += costThis
        const raw = (resp.content || []).map((c: any) => c.text || '').join('')
        parsed = parseConsolidatedJson(raw)
      } catch (e: any) {
        // transient API error — leave unprocessed so a later run retries it
        continue
      }
      if (!parsed || !parsed.analysis || String(parsed.analysis).trim() === '' || String(parsed.analysis).trim().toUpperCase() === 'INSUFFICIENT') {
        // No usable narrative. Mark processed so we don't keep paying for the
        // same un-narratable row; the gate keeps it held as 'no_narrative'.
        parseFail++; processed.add(r.id)
        if (++sinceFlush >= 20) { flush(); sinceFlush = 0 }
        continue
      }
      // Reuse the canonical persistence path (writes paradocs_narrative from
      // parsed.analysis + feed_hook/answer_line/assessment/witness_profile +
      // title/slug refresh). Marker 'consolidated-ca-narrate' for cost audit.
      const saved = await persistConsolidatedResult(sb, r.id, parsed, r.category || null, r.title || null, 'consolidated-ca-narrate')
      if (!saved.ok) { persistFail++; continue }
      // Best-effort cost log (same table the live/batch paths use).
      try {
        await sb.from('paradocs_narrative_cost_log').insert({
          service: 'consolidated-narrative', report_id: r.id,
          model: HAIKU + ' (consolidated-ca-narrate)', cost_usd: costThis,
          status: 'completed', reason: null,
        })
      } catch (_e) { /* non-fatal */ }
      done++; processed.add(r.id)
      if (++sinceFlush >= 20) { flush(); sinceFlush = 0 }
    }
  }

  await Promise.all(Array.from({ length: POOL }, () => worker()))
  flush()

  console.log('\nthis run → narrated ' + done + ' | parse/insufficient ' + parseFail + ' | persist-fail ' + persistFail)
  console.log('run cost: $' + runCost.toFixed(4) + (capped ? ' (HIT MAX_COST_USD=$' + MAX_COST_USD.toFixed(2) + ')' : '') + ' | elapsed ' + Math.round((Date.now() - START) / 1000) + 's')
  const remaining = cand.rows.length - processed.size
  console.log('remaining candidates: ' + remaining + (remaining > 0 ? ' — re-run --apply to continue (resumable).' : ' — backlog narrated; run ca-auto-approve.ts --apply to promote.'))
}

main().catch(e => { console.error('[ca-narrate] unhandled:', e); process.exit(1) })
