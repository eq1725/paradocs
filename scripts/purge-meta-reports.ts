#!/usr/bin/env tsx
/**
 * V11.15.4 — Purge meta-commentary / non-experience reports.
 *
 * Three-pass cleanup of the ~103k approved corpus:
 *
 *   PASS 1 (cheap regex)
 *     Scan title + summary + analysis + pull_quote for known patterns
 *     that indicate the report isn't a first-person paranormal
 *     experience. Patterns live in
 *     src/lib/ingestion/filters/meta-commentary-detector.ts.
 *     Output: candidate set with the matching phrase noted.
 *
 *   PASS 2 (AI auto-review)
 *     Send each candidate to Haiku via the Batch API with a single
 *     binary question: KEEP (first-person witness account) or REJECT
 *     (commentary / opinion / news synthesis / solicitation /
 *     off-topic). Prompt caching makes this cheap (~$0.0003/report).
 *     Output: per-candidate decision.
 *
 *   PASS 3 (apply + reconcile)
 *     For every REJECT, UPDATE reports SET status='rejected'.
 *     Junction rows in report_phenomena aren't deleted — they're
 *     filtered out by report.status='approved' downstream.
 *     Then trigger the reconcile-phenomena-counts logic so the
 *     denormalized counter on phenomena.report_count stays accurate.
 *
 * Drain-safe: only writes reports.status and phenomena.report_count.
 * Does NOT touch the report_phenomena junction.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/purge-meta-reports.ts --dry-run       # pass 1 only
 *   tsx scripts/purge-meta-reports.ts --no-ai         # pass 1 + apply (regex only, no AI confirm)
 *   tsx scripts/purge-meta-reports.ts                 # full three-pass run
 *   tsx scripts/purge-meta-reports.ts --limit 1000    # cap candidates for testing
 */

import { createClient } from '@supabase/supabase-js'
import {
  findMetaCommentaryPhrase,
  findPreAiRejectPattern,
} from '../src/lib/ingestion/filters/meta-commentary-detector'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const BATCH_API_URL = 'https://api.anthropic.com/v1/messages/batches'
const HAIKU_INPUT_BATCH = 0.5
const HAIKU_OUTPUT_BATCH = 2.5
const HAIKU_CACHE_WRITE_BATCH = 0.625
const HAIKU_CACHE_READ_BATCH = 0.05

const argv = process.argv
const DRY = argv.includes('--dry-run')
const NO_AI = argv.includes('--no-ai')
const LIMIT_IDX = argv.indexOf('--limit')
const LIMIT = LIMIT_IDX >= 0 ? parseInt(argv[LIMIT_IDX + 1], 10) || 0 : 0

interface Candidate {
  id: string
  title: string | null
  summary: string | null
  paradocs_narrative: string | null
  pull_quote: string | null
  feed_hook: string | null
  description: string | null
  category: string | null
  matchedFrom: 'pre_ai' | 'post_ai'
  matchedPhrase: string
}

async function fetchAllRows<T = any>(query: any, pageSize = 1000): Promise<T[]> {
  const all: T[] = []
  let offset = 0
  while (true) {
    const res = await query.range(offset, offset + pageSize - 1)
    if (res.error) throw new Error(res.error.message)
    const rows = res.data || []
    all.push(...(rows as any))
    if (rows.length < pageSize) break
    offset += pageSize
    if (offset > 500000) break
  }
  return all
}

// ─── PASS 1: regex scan ───────────────────────────────────────────────
async function scanCorpus(sb: any): Promise<Candidate[]> {
  console.log('\n══════════════════════════════════════════════════════════')
  console.log('PASS 1 — Regex scan of approved corpus')
  console.log('══════════════════════════════════════════════════════════')

  console.log('Loading approved reports...')
  // Schema notes: AI narrative lives in `paradocs_narrative` (text),
  // pull_quote is nested inside `paradocs_assessment` (JSONB). Both are
  // populated by consolidated-ai.service persistConsolidatedResult.
  const rows = await fetchAllRows<any>(
    sb.from('reports')
      .select('id, title, summary, paradocs_narrative, paradocs_assessment, feed_hook, description, category, status')
      .eq('status', 'approved')
  )
  console.log('  loaded ' + rows.length + ' approved reports')

  const candidates: Candidate[] = []
  let preAiHits = 0
  let postAiHits = 0

  for (const r of rows) {
    // Extract pull_quote from the JSONB paradocs_assessment if present.
    const pullQuote: string | null =
      r.paradocs_assessment && typeof r.paradocs_assessment === 'object'
        ? (r.paradocs_assessment.pull_quote || null)
        : null

    // POST-AI: look at the AI's own admission phrases first (highest signal)
    const aiFields = [r.summary, r.paradocs_narrative, pullQuote, r.feed_hook]
    let postHit: string | null = null
    for (const f of aiFields) {
      if (typeof f === 'string') {
        const hit = findMetaCommentaryPhrase(f)
        if (hit) { postHit = hit; break }
      }
    }
    if (postHit) {
      candidates.push({
        id: r.id, title: r.title, summary: r.summary, paradocs_narrative: r.paradocs_narrative,
        pull_quote: pullQuote, feed_hook: r.feed_hook, description: r.description,
        category: r.category, matchedFrom: 'post_ai', matchedPhrase: postHit,
      })
      postAiHits++
      continue
    }

    // PRE-AI: scan raw title + description for solicitation/news/meta patterns
    const raw = (r.title || '') + '\n' + (r.description || '').substring(0, 2000)
    const preHit = findPreAiRejectPattern(raw)
    if (preHit) {
      candidates.push({
        id: r.id, title: r.title, summary: r.summary, paradocs_narrative: r.paradocs_narrative,
        pull_quote: pullQuote, feed_hook: r.feed_hook, description: r.description,
        category: r.category, matchedFrom: 'pre_ai', matchedPhrase: preHit,
      })
      preAiHits++
    }
  }

  console.log('\nPass 1 results:')
  console.log('  Total candidates:    ' + candidates.length)
  console.log('  Post-AI self-flag:   ' + postAiHits + ' (high confidence)')
  console.log('  Pre-AI pattern:      ' + preAiHits + ' (medium confidence)')

  // Top 10 sample
  console.log('\nSample candidates:')
  candidates.slice(0, 10).forEach((c, i) => {
    const title = (c.title || '').substring(0, 60)
    console.log('  [' + (i + 1) + ']  (' + c.matchedFrom + ') "' + c.matchedPhrase + '"')
    console.log('       ' + title)
  })

  return LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates
}

// ─── PASS 2: AI auto-review ───────────────────────────────────────────
async function reviewCandidatesAi(candidates: Candidate[]): Promise<Map<string, 'KEEP' | 'REJECT'>> {
  console.log('\n══════════════════════════════════════════════════════════')
  console.log('PASS 2 — AI auto-review (' + candidates.length + ' candidates)')
  console.log('══════════════════════════════════════════════════════════')

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY missing from env')
    process.exit(1)
  }

  const systemPrompt = [
    'You are reviewing reports for inclusion in Paradocs — an encyclopedia of FIRST-PERSON paranormal experience accounts.',
    '',
    'Your task: decide whether each report belongs in the encyclopedia or should be rejected.',
    '',
    'KEEP if the report is:',
    '  - A first-person account of a paranormal/unexplained experience the witness or someone they know observed',
    '  - A description of a specific incident, encounter, sighting, or experience',
    '  - Even brief or imperfect first-person accounts',
    '',
    'REJECT if the report is:',
    '  - A solicitation ("seeking witnesses for my podcast", "interview series", "for our documentary")',
    '  - Historical news synthesis ("ABC News documented", "1947 radio report", citing media coverage)',
    '  - Meta-commentary about the UFO/UAP/disclosure debate or community',
    '  - Opinion/critique/argument ("a user reframes", "the source presents an argument", "calls out advocates")',
    '  - Synthesis of multiple claims ("connects X testimony with Y mummies and Z documentation")',
    '  - A relationship, mental health, or personal-life post with no paranormal experience',
    '  - A general question or discussion prompt ("does anyone know", "thoughts on")',
    '  - Off-topic to paranormal subject matter entirely',
    '',
    'OUTPUT FORMAT (strict JSON, single line, no other text):',
    '{"decision": "KEEP"}',
    'OR',
    '{"decision": "REJECT", "reason": "short reason"}',
  ].join('\n')

  // Build batch requests
  const reqs = candidates.map(c => ({
    custom_id: c.id,
    params: {
      model: HAIKU_MODEL,
      max_tokens: 80,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          'Title: ' + (c.title || '(no title)'),
          'Category: ' + (c.category || '(none)'),
          c.summary ? 'Summary: ' + c.summary.substring(0, 600) : '',
          c.paradocs_narrative ? 'Narrative excerpt: ' + c.paradocs_narrative.substring(0, 600) : '',
          c.pull_quote ? 'Pull quote: ' + c.pull_quote.substring(0, 300) : '',
        ].filter(Boolean).join('\n\n'),
      }],
      temperature: 0.1,
    },
  }))

  // Chunk at 50k (Anthropic batch cap)
  const CHUNK = 50000
  const decisions = new Map<string, 'KEEP' | 'REJECT'>()
  let cost = 0

  for (let ci = 0; ci < reqs.length; ci += CHUNK) {
    const chunk = reqs.slice(ci, ci + CHUNK)
    console.log('\nSubmitting batch ' + (ci / CHUNK + 1) + ' (' + chunk.length + ' requests)...')
    const subResp = await fetch(BATCH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'message-batches-2024-09-24',
      },
      body: JSON.stringify({ requests: chunk }),
    })
    if (!subResp.ok) {
      console.error('  submit failed: ' + subResp.status + ' ' + (await subResp.text()).substring(0, 300))
      continue
    }
    const subData = await subResp.json()
    const batchId = subData.id
    console.log('  batch_id: ' + batchId)

    // Poll
    const start = Date.now()
    let resultsUrl: string | null = null
    while (Date.now() - start < 5400 * 1000) {
      await new Promise(r => setTimeout(r, 30000))
      const stResp = await fetch(BATCH_API_URL + '/' + batchId, {
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'message-batches-2024-09-24' },
      })
      const st = await stResp.json()
      const c = st.request_counts || {}
      const el = Math.round((Date.now() - start) / 1000)
      console.log('  [+' + el + 's] status=' + st.processing_status + ' succeeded=' + (c.succeeded || 0) + ' errored=' + (c.errored || 0))
      if (st.processing_status === 'ended') {
        resultsUrl = st.results_url
        break
      }
    }
    if (!resultsUrl) { console.warn('  batch did not complete in time; skipping chunk'); continue }

    // Fetch + parse results
    const rResp = await fetch(resultsUrl, {
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'message-batches-2024-09-24' },
    })
    const text = await rResp.text()
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let row: any
      try { row = JSON.parse(trimmed) } catch { continue }
      if (row.result?.type !== 'succeeded') continue
      const out = row.result.message?.content?.[0]?.text
      if (!out) continue
      let parsed: any
      try {
        const s = out.indexOf('{')
        const e = out.lastIndexOf('}')
        if (s >= 0 && e > s) parsed = JSON.parse(out.substring(s, e + 1))
      } catch { continue }
      const decision = parsed?.decision === 'REJECT' ? 'REJECT' : 'KEEP'
      decisions.set(row.custom_id, decision)
      const u = row.result.message?.usage || {}
      cost +=
        (u.input_tokens || 0) / 1e6 * HAIKU_INPUT_BATCH +
        (u.cache_creation_input_tokens || 0) / 1e6 * HAIKU_CACHE_WRITE_BATCH +
        (u.cache_read_input_tokens || 0) / 1e6 * HAIKU_CACHE_READ_BATCH +
        (u.output_tokens || 0) / 1e6 * HAIKU_OUTPUT_BATCH
    }
  }

  let kept = 0
  let rejected = 0
  decisions.forEach(v => { if (v === 'KEEP') kept++; else rejected++ })
  console.log('\nPass 2 results:')
  console.log('  AI decisions returned: ' + decisions.size + '/' + candidates.length)
  console.log('  KEEP:   ' + kept)
  console.log('  REJECT: ' + rejected)
  console.log('  Cost:   $' + cost.toFixed(4))

  return decisions
}

// ─── PASS 3: apply + reconcile ────────────────────────────────────────
async function applyRejections(sb: any, rejectIds: string[]) {
  console.log('\n══════════════════════════════════════════════════════════')
  console.log('PASS 3 — Apply rejections (' + rejectIds.length + ' reports)')
  console.log('══════════════════════════════════════════════════════════')

  if (rejectIds.length === 0) { console.log('Nothing to reject.'); return }

  let written = 0
  let errors = 0
  const CHUNK = 100
  for (let i = 0; i < rejectIds.length; i += CHUNK) {
    const chunk = rejectIds.slice(i, i + CHUNK)
    const res = await sb.from('reports')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .in('id', chunk)
    if (res.error) { errors++; console.error('  err on chunk ' + (i / CHUNK) + ': ' + res.error.message) }
    else written += chunk.length
    if (i % 500 === 0) console.log('  ' + written + '/' + rejectIds.length + ' rejected')
  }

  console.log('  Updated: ' + written)
  console.log('  Errors:  ' + errors)

  // Reconcile phenomena.report_count so the encyclopedia browse view
  // reflects the new approved-set size.
  console.log('\nReconciling phenomena.report_count from junction...')
  const approved = await fetchAllRows<{ id: string }>(
    sb.from('reports').select('id').eq('status', 'approved')
  )
  const approvedSet = new Set(approved.map(r => r.id))
  const rp = await fetchAllRows<{ phenomenon_id: string; report_id: string }>(
    sb.from('report_phenomena').select('phenomenon_id, report_id')
  )
  const real: Record<string, number> = {}
  for (const row of rp) {
    if (approvedSet.has(row.report_id)) real[row.phenomenon_id] = (real[row.phenomenon_id] || 0) + 1
  }
  const phen = await fetchAllRows<{ id: string; name: string; report_count: number | null }>(
    sb.from('phenomena').select('id, name, report_count').eq('status', 'active')
  )
  let drifted = 0
  for (const p of phen) {
    const after = real[p.id] || 0
    if ((p.report_count || 0) === after) continue
    drifted++
    const upd = await sb.from('phenomena').update({ report_count: after }).eq('id', p.id)
    if (upd.error) console.error('  update err: ' + p.name + ': ' + upd.error.message)
  }
  console.log('  Reconciled ' + drifted + ' phenomena counts.')
}

// ─── MAIN ─────────────────────────────────────────────────────────────
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('=== Paradocs purge — meta-commentary / non-experience reports ===')
  console.log('Dry run:  ' + DRY)
  console.log('AI step:  ' + (NO_AI ? 'SKIPPED (regex-only)' : 'ENABLED'))
  console.log('Limit:    ' + (LIMIT > 0 ? LIMIT : 'no limit'))

  const candidates = await scanCorpus(sb)
  if (DRY) { console.log('\nDRY RUN — exiting before AI / writes.'); return }
  if (candidates.length === 0) { console.log('\nNo candidates — nothing to do.'); return }

  let rejectIds: string[]
  if (NO_AI) {
    rejectIds = candidates.map(c => c.id)
    console.log('\nSkipping AI review — applying all ' + rejectIds.length + ' regex matches.')
  } else {
    const decisions = await reviewCandidatesAi(candidates)
    rejectIds = []
    decisions.forEach((v, k) => { if (v === 'REJECT') rejectIds.push(k) })
    // Candidates the AI didn't decide on (timeout / parse fail): leave them alone.
  }

  await applyRejections(sb, rejectIds)

  console.log('\n══════════════════════════════════════════════════════════')
  console.log('PURGE COMPLETE')
  console.log('══════════════════════════════════════════════════════════')
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1) })
