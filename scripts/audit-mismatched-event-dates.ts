#!/usr/bin/env tsx
/**
 * Audit approved reports where the extracted event_date is implausibly
 * far before the source post date — usually because the AI grabbed a
 * building's construction year, a referenced historical event, or a
 * date from an inset quote, rather than the witness's actual
 * experience date.
 *
 * V11.17.39 — operator spot-check flagged a Tasmanian report with
 * "GHOSTS & HAUNTINGS · 1855" on the Today feed badge. The report
 * narrates a current witness experience in a 170-year-old building;
 * the AI extracted "1855" (construction year) as event_date instead
 * of the modern experience date. We shipped a render-side suppression
 * for badges where (created_at_year - event_date_year) > 100 AND
 * source_type ∈ ('reddit', 'youtube'), but that's a defensive layer —
 * the underlying data is still wrong.
 *
 * This script does the data-layer cleanup.
 *
 * Detection:
 *   status='approved' AND event_date IS NOT NULL AND
 *   source_type IN ('reddit', 'youtube') AND
 *   (year(created_at) - year(event_date)) > 100
 *
 * Haiku classifier verdict for each candidate:
 *   - "keep"    : date is correct — the witness IS describing a
 *                 historical event from that era (rare but legitimate)
 *   - "null"    : no reliable date in source → null out event_date
 *                 + event_date_precision
 *   - "correct" : provide a corrected year (1900-current_year),
 *                 typically the witness experience date
 *
 * Default DRY-RUN. Use --apply to commit.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-mismatched-event-dates.ts --dry-run
 *   npx tsx scripts/audit-mismatched-event-dates.ts --apply
 *   npx tsx scripts/audit-mismatched-event-dates.ts --apply --limit 100
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

const HAIKU_PROMPT = `You audit Paradocs (a paranormal-experience platform) reports to detect MIS-EXTRACTED event dates. The system has flagged this report because the stored event_date is more than 100 years older than the source post — a strong signal the AI confused a building's construction year, a historical reference, or an inset quote for the actual witness experience date.

Decide which is true:

  - "keep"    : the date is correct. The witness IS describing a genuinely historical event from that era. Rare but legitimate (e.g. a family member's recovered account, an oral history, a recovered diary entry). Only choose this when the report text makes the historical setting unambiguous — e.g. "my great-grandfather wrote in his journal in 1873 that he saw..."

  - "null"    : the report has no reliable event date. The AI grabbed a number from context (building age, historical reference, source publication year, a referenced famous case). Set event_date to null.

  - "correct" : the report DOES describe a real experience, but the stored year is wrong. Provide the year the witness actually experienced the event. If the report says "since moving in five years ago" + source posted in 2024 → 2019-ish. If "in my childhood" + age clues → estimate. If only a decade is clear, use the decade midpoint year (e.g. "in the 80s" → 1985).

Conservative bias: when between "null" and "correct", prefer "null" unless the witness experience date is genuinely recoverable. We'd rather show no date than guess.

Respond with valid JSON only (no markdown):
{
  "verdict": "keep" | "null" | "correct",
  "corrected_year": <integer between 1900 and current year, ONLY when verdict="correct">,
  "confidence": "high" | "medium" | "low",
  "reason": "<one sentence>"
}`

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string | null = null): string | null { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),
    limit: parseInt(flag('--limit', '0') || '0'),
    concurrency: parseInt(flag('--concurrency', '8') || '8'),
  }
}

interface Candidate {
  id: string
  slug: string
  title: string
  summary: string | null
  description: string | null
  event_date: string
  event_date_year: number
  source_created_year: number
  year_gap: number
  source_type: string
  _verdict?: { verdict: string; corrected_year?: number; confidence: string; reason: string }
}

async function classify(anth: Anthropic, c: Candidate): Promise<Candidate['_verdict'] | null> {
  try {
    const userBlock =
      'TITLE: ' + c.title + '\n' +
      'STORED event_date: ' + c.event_date + ' (year=' + c.event_date_year + ')\n' +
      'SOURCE created_at year: ' + c.source_created_year + '\n' +
      'GAP: ' + c.year_gap + ' years\n' +
      'SOURCE type: ' + c.source_type + '\n\n' +
      'SUMMARY: ' + (c.summary || '').substring(0, 1000) + '\n\n' +
      'DESCRIPTION (first 2000 chars): ' + (c.description || '').substring(0, 2000)
    const resp = await anth.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 220,
      system: HAIKU_PROMPT,
      messages: [{ role: 'user', content: userBlock }],
    })
    const block = resp.content[0]
    if (block.type !== 'text') return null
    const cleaned = block.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(cleaned)
  } catch (_e) { return null }
}

async function main() {
  const args = parseArgs()
  console.log('Audit mismatched event_dates — V11.17.39')
  console.log('Mode:', args.apply ? 'APPLY' : 'DRY-RUN')
  console.log()

  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }
  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  // Page through approved reddit + youtube reports with non-null
  // event_date. The year-gap filter is done JS-side because PostgREST
  // doesn't expose EXTRACT(YEAR) cleanly.
  console.log('Fetching candidates (approved + reddit/youtube + event_date set)...')
  const candidates: Candidate[] = []
  let lastId = ''
  let scanned = 0
  while (true) {
    let q = s.from('reports')
      .select('id, slug, title, summary, description, event_date, created_at, source_type, status')
      .eq('status', 'approved')
      .in('source_type', ['reddit', 'youtube'])
      .not('event_date', 'is', null)
      .order('id', { ascending: true })
      .limit(1000)
    if (lastId) q = q.gt('id', lastId) as any
    const { data, error } = await q
    if (error) { console.error('fetch failed:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    for (const r of data as any[]) {
      scanned++
      const m = String(r.event_date || '').match(/(\d{4})/)
      if (!m) continue
      const eventYear = parseInt(m[1], 10)
      const sourceYear = r.created_at ? new Date(r.created_at).getFullYear() : new Date().getFullYear()
      const gap = sourceYear - eventYear
      if (gap > 100) {
        candidates.push({
          id: r.id,
          slug: r.slug,
          title: r.title || '',
          summary: r.summary,
          description: r.description,
          event_date: r.event_date,
          event_date_year: eventYear,
          source_created_year: sourceYear,
          year_gap: gap,
          source_type: r.source_type,
        })
      }
    }
    lastId = data[data.length - 1].id
    if (scanned % 5000 === 0) console.log('  scanned: ' + scanned + ' / candidates: ' + candidates.length)
    if (data.length < 1000) break
  }
  console.log()
  console.log('Scanned: ' + scanned)
  console.log('Candidates (gap > 100y):', candidates.length)
  if (candidates.length === 0) { console.log('Nothing to audit.'); return }

  const cap = args.limit > 0 ? Math.min(args.limit, candidates.length) : candidates.length
  const sample = candidates.slice(0, cap)
  console.log('Will Haiku-classify:        ', sample.length)
  console.log()

  // Concurrent worker pool
  const toKeep: Candidate[] = []
  const toNull: Candidate[] = []
  const toCorrect: Candidate[] = []
  const failed: Candidate[] = []
  let processed = 0
  const startMs = Date.now()

  const queue = sample.slice()
  async function worker() {
    while (queue.length > 0) {
      const c = queue.shift()
      if (!c) break
      const v = await classify(anth, c)
      if (!v) { failed.push(c) }
      else {
        c._verdict = v
        if (v.verdict === 'keep') toKeep.push(c)
        else if (v.verdict === 'null') toNull.push(c)
        else if (v.verdict === 'correct' && typeof v.corrected_year === 'number') toCorrect.push(c)
        else failed.push(c)
      }
      processed++
      if (processed % 50 === 0) {
        const elapsedSec = (Date.now() - startMs) / 1000
        const rate = processed / elapsedSec
        const eta = Math.floor((sample.length - processed) / Math.max(rate, 0.01))
        console.log('[+' + Math.floor(elapsedSec) + 's] ' + processed + '/' + sample.length +
          ' keep=' + toKeep.length + ' null=' + toNull.length + ' correct=' + toCorrect.length +
          ' rate=' + rate.toFixed(1) + '/s eta=' + Math.floor(eta / 60) + 'm')
      }
    }
  }
  const workers: Promise<void>[] = []
  for (let w = 0; w < args.concurrency; w++) workers.push(worker())
  await Promise.all(workers)

  console.log()
  console.log('=== Pre-flight ===')
  console.log('keep    (date is correct):  ' + toKeep.length)
  console.log('null    (no reliable date): ' + toNull.length)
  console.log('correct (fix year):         ' + toCorrect.length)
  console.log('Haiku-failed:               ' + failed.length)
  console.log()

  // Random sample so the operator can confidence-check before --apply
  function shuffle<T>(arr: T[]): T[] {
    const a = arr.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function printSample(label: string, list: Candidate[], n: number) {
    if (list.length === 0) return
    console.log(label + ' sample (' + Math.min(n, list.length) + ' random):')
    for (const c of shuffle(list).slice(0, n)) {
      console.log('  ' + c.id.substring(0, 8) + ' | year=' + c.event_date_year + ' source=' + c.source_created_year + ' gap=' + c.year_gap + ' | ' + c.title.substring(0, 70))
      if (c._verdict) {
        const extra = c._verdict.verdict === 'correct' ? ' → ' + c._verdict.corrected_year : ''
        console.log('       [' + c._verdict.confidence + extra + '] ' + (c._verdict.reason || '').substring(0, 120))
      }
    }
    console.log()
  }
  printSample('KEEP', toKeep, 15)
  printSample('NULL', toNull, 30)
  printSample('CORRECT', toCorrect, 30)

  if (args.dryRun) {
    console.log('Dry-run complete. Re-run with --apply to update ' + (toNull.length + toCorrect.length) + ' reports.')
    return
  }

  if (toNull.length === 0 && toCorrect.length === 0) {
    console.log('Nothing to update.')
    return
  }

  // Apply nulls in batches.
  const BATCH = 100
  let archived = 0
  let errors = 0
  for (let i = 0; i < toNull.length; i += BATCH) {
    const batch = toNull.slice(i, i + BATCH)
    const ids = batch.map(c => c.id)
    const { error } = await s.from('reports').update({
      event_date: null,
      event_date_precision: null,
      moderation_notes: 'V11.17.39 — event_date audit: null (no reliable date in source)',
    }).in('id', ids)
    if (error) { errors += batch.length; continue }
    archived += batch.length
    console.log('  null batch ' + Math.floor(i / BATCH + 1) + ': ' + batch.length + ' updated')
  }

  // Apply corrections one at a time (each row has a different year).
  let corrected = 0
  for (const c of toCorrect) {
    if (!c._verdict || typeof c._verdict.corrected_year !== 'number') continue
    const newDate = String(c._verdict.corrected_year) + '-01-01'
    const { error } = await s.from('reports').update({
      event_date: newDate,
      event_date_precision: 'year',
      moderation_notes: 'V11.17.39 — event_date audit: corrected from ' + c.event_date_year + ' to ' + c._verdict.corrected_year,
    }).eq('id', c.id)
    if (error) { errors++; continue }
    corrected++
    if (corrected % 50 === 0) console.log('  corrected: ' + corrected + '/' + toCorrect.length)
  }

  console.log()
  console.log('========== FINAL ==========')
  console.log('Nulled out:  ' + archived)
  console.log('Corrected:   ' + corrected)
  console.log('Errors:      ' + errors)
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
