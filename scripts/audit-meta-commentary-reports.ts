#!/usr/bin/env tsx
/**
 * Audit existing approved reports for third-party meta-commentary that
 * shouldn't appear in the experience feed.
 *
 * V11.17.39 — operator spot-check flagged "Community members debate
 * whether recent video releases and media coverage represent the major
 * UAP disclosure..." as a Today-feed surface bug. Investigation found
 * a broader class of approved reports that are commentary about UFO
 * discourse, community drama, news coverage, or public figure
 * statements — NOT first-person experiences.
 *
 * Examples found in DB:
 *   - "Corbell Video Fulfills Promised UAP Disclosure"
 *   - "Disclosure Redefined as Acknowledgment Alone"
 *   - "Iraq Footage Sparks Debate Over Camera Artifacts"
 *   - "Prominent Voices Fall Silent on UFO Disclosure"
 *   - "Coordinated Accounts Target UFO Community Figures"
 *   - "Deaths in the UFO Research Community, 1949–1996"
 *
 * Strategy:
 *   1. Pre-filter approved Reddit reports by keywords likely to be
 *      meta-commentary (debate/discuss/disclosure/community/researcher
 *      /sparks/silent/etc.)
 *   2. Haiku verifies each: is this a first-person experience report
 *      OR third-party commentary/analysis?
 *   3. Archive Haiku-confirmed commentary, keep first-person reports.
 *
 * Default DRY-RUN. Run with --apply to actually archive.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-meta-commentary-reports.ts --dry-run
 *   npx tsx scripts/audit-meta-commentary-reports.ts --apply
 *   npx tsx scripts/audit-meta-commentary-reports.ts --apply --limit 200
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

// Pre-filter pattern: candidate reports likely to be meta-commentary.
// Keep generous — Haiku makes the final call.
const SUSPECT_PATTERNS_TITLE = [
  'debate', 'discuss', 'sparks', 'silent', 'silence', 'community',
  'researcher', 'researchers', 'disclosure', 'analysis', 'examines',
  'documents', 'fulfills', 'redefined', 'scrutiny', 'narrative',
  'coordinated', 'targets', 'questions raised', 'fall silent',
  'commentary', 'controversy', 'theoretical framework', 'congressional',
  'pentagon', 'senate', 'briefing', 'hearing', 'whistleblower',
  'discusses', 'interview', 'announces', 'reveals',
]

const HAIKU_PROMPT = `You audit Paradocs (a paranormal-experience platform) reports to distinguish FIRST-PERSON EXPERIENCE REPORTS from THIRD-PARTY COMMENTARY/ANALYSIS.

KEEP — first-person experience reports:
  - "I saw a triangular UFO over my house in 2007"
  - "My grandmother appeared to me three days after she died"
  - "I was paralyzed in bed with a shadow figure at the foot"
  - "We three witnesses saw lights hovering for 30 minutes"
  - "I experienced an OBE during cardiac arrest"
  - Witness recollections, even decades old, even with secondhand framing
  - Reports that retell what a witness experienced or saw

ARCHIVE — third-party commentary / analysis / discourse:
  - "Community debates whether disclosure is happening"
  - "Researchers fall silent on UAP claims"
  - "Iraq footage sparks debate over camera artifacts"
  - "[Public figure] discusses [topic] on podcast"
  - "Analysis of recent disclosure timeline"
  - "Theoretical framework for UAP/NHI contact"
  - "Pentagon hearing reveals..."
  - News/journalism about UFO topic
  - Op-ed-style argument about the community, disclosure, evidence
  - Anything WITHOUT a witness narrating their own first-hand experience

Edge cases:
  - "I watched [X] documentary and now believe..." — KEEP (witness's response is first-person)
  - "A researcher I trust says..." — ARCHIVE (third-party narrative)
  - "Witnesses debate close-range encounter" — could go either way; if the report is about witnesses' OWN debate from inside the encounter, KEEP; if commentary about a separate dispute, ARCHIVE

Respond with valid JSON only (no markdown):
{
  "verdict": "keep" | "archive",
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

async function classify(anth: Anthropic, title: string, summary: string): Promise<{ verdict: string; confidence: string; reason: string } | null> {
  try {
    const resp = await anth.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: HAIKU_PROMPT,
      messages: [{ role: 'user', content: 'TITLE: ' + title + '\n\nSUMMARY: ' + summary.substring(0, 1500) }],
    })
    const block = resp.content[0]
    if (block.type !== 'text') return null
    const cleaned = block.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(cleaned)
  } catch (_e) { return null }
}

async function main() {
  const args = parseArgs()
  console.log('Audit meta-commentary reports — V11.17.39')
  console.log('Mode:', args.apply ? 'APPLY' : 'DRY-RUN')
  console.log()

  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }
  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  // Build OR clause for title pre-filter (Supabase doesn't natively OR
  // ilike on many terms — we pull broader and filter in JS).
  console.log('Fetching candidate approved Reddit reports (title-based pre-filter)...')

  // Page through with id-cursor
  const candidates: any[] = []
  let lastId = ''
  while (true) {
    let q = s.from('reports')
      .select('id, slug, title, summary, description, status, category, source_type')
      .eq('status', 'approved')
      .eq('source_type', 'reddit')
      .order('id', { ascending: true })
      .limit(1000)
    if (lastId) q = q.gt('id', lastId) as any
    const { data, error } = await q
    if (error) { console.error('fetch failed:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    // JS-side pre-filter by suspect title keywords
    for (const r of data as any[]) {
      const titleLower = (r.title || '').toLowerCase()
      if (SUSPECT_PATTERNS_TITLE.some(p => titleLower.includes(p))) {
        candidates.push(r)
      }
    }
    lastId = data[data.length - 1].id
    if (data.length < 1000) break
  }

  const cap = args.limit > 0 ? Math.min(args.limit, candidates.length) : candidates.length
  const sample = candidates.slice(0, cap)
  console.log('Suspect candidates (passed title prefilter):', candidates.length)
  console.log('Will Haiku-classify:                          ', sample.length)
  console.log()

  // Concurrent worker pool
  const toArchive: any[] = []
  const toKeep: any[] = []
  const failed: any[] = []
  let processed = 0
  const startMs = Date.now()

  const queue = sample.slice()
  async function worker() {
    while (queue.length > 0) {
      const r = queue.shift()
      if (!r) break
      const verdict = await classify(anth, r.title || '', r.summary || r.description || '')
      if (!verdict) {
        failed.push(r)
      } else if (verdict.verdict === 'archive' && verdict.confidence === 'high') {
        toArchive.push({ ...r, _verdict: verdict })
      } else {
        toKeep.push({ ...r, _verdict: verdict })
      }
      processed++
      if (processed % 50 === 0) {
        const elapsedSec = (Date.now() - startMs) / 1000
        const rate = processed / elapsedSec
        const eta = Math.floor((sample.length - processed) / rate)
        console.log('[+' + Math.floor(elapsedSec) + 's] ' + processed + '/' + sample.length +
          ' archive=' + toArchive.length + ' keep=' + toKeep.length + ' rate=' + rate.toFixed(1) + '/s eta=' + Math.floor(eta / 60) + 'm')
      }
    }
  }
  const workers = []
  for (let w = 0; w < args.concurrency; w++) workers.push(worker())
  await Promise.all(workers)

  console.log()
  console.log('=== Pre-flight ===')
  console.log('Will archive (high-conf):  ' + toArchive.length)
  console.log('Keep (first-person/uncertain): ' + toKeep.length)
  console.log('Haiku-failed:              ' + failed.length)
  console.log()
  console.log('Sample archive (first 20):')
  for (const r of toArchive.slice(0, 20)) {
    console.log('  ' + r.id.substring(0, 8) + ' | ' + (r.title || '').substring(0, 80))
    if (r._verdict?.reason) console.log('       reason: ' + r._verdict.reason.substring(0, 120))
  }
  if (toArchive.length > 20) console.log('  ... ' + (toArchive.length - 20) + ' more')
  console.log()

  if (args.dryRun) {
    console.log('Dry-run complete. Re-run with --apply to archive ' + toArchive.length + ' commentary reports.')
    return
  }

  if (toArchive.length === 0) {
    console.log('Nothing to archive.')
    return
  }

  // Apply archives in batches of 100
  const BATCH = 100
  let archived = 0
  let errors = 0
  for (let i = 0; i < toArchive.length; i += BATCH) {
    const batch = toArchive.slice(i, i + BATCH)
    const ids = batch.map(r => r.id)
    const { error } = await s.from('reports').update({
      status: 'archived',
      moderation_notes: 'V11.17.39 — meta-commentary audit: third-party analysis/discourse, not first-person experience',
    }).in('id', ids)
    if (error) { errors += batch.length; continue }
    archived += batch.length
    console.log('  batch ' + Math.floor(i / BATCH + 1) + ': ' + batch.length + ' archived')
  }

  console.log()
  console.log('========== FINAL ==========')
  console.log('Archived: ' + archived)
  console.log('Errors:   ' + errors)
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
