#!/usr/bin/env tsx
/**
 * V11.17.41 — YouTube ingestion quality audit.
 *
 * Surface: during CITD-week QA the operator caught 4 YouTube-comment
 * reports that the Haiku-rewrite layer had turned into fluent feed_hooks
 * despite containing zero anomalous content — perceptual-phenomenon
 * explainers, hiking misadventures, wildlife encounters. The
 * pre-publish pattern set is the cheap pre-filter; this script is the
 * intelligence layer that flags the subtler slips.
 *
 * Algorithm:
 *   1. Find approved reports with source_type='youtube'
 *   2. Haiku batch evaluates each against an "anomalous content
 *      actually present?" rubric
 *   3. Dry-run reports the would-archive count + per-bucket samples
 *   4. --apply flips status='archived' on confirmed mundane content
 *
 * Cost:
 *   ~$0.0035 per candidate (Haiku batch, 50% batch discount).
 *   Typical YouTube source pool est. 5–15k → $18–53 worst case.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *
 *   # Scope (count candidates only)
 *   npx tsx scripts/audit-youtube-anomaly-content.ts --dry-run
 *
 *   # Full sample-with-Haiku dry run (sees confidence dist + samples)
 *   npx tsx scripts/audit-youtube-anomaly-content.ts --dry-run --sample 200
 *
 *   # Apply — archives confirmed non-anomalous YouTube reports
 *   npx tsx scripts/audit-youtube-anomaly-content.ts --apply
 *
 *   # Restrict to a single source video (precision iteration)
 *   npx tsx scripts/audit-youtube-anomaly-content.ts --dry-run \
 *     --source-url-contains "watch?v=RxixM-WuV0Y"
 *
 * Safety:
 *   - Default DRY-RUN (no DB writes)
 *   - --apply only flips status='approved' → 'archived'. Reversible.
 *   - Idempotent: re-runs skip already-archived rows.
 *   - Never deletes rows, never modifies content fields.
 */

import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const BATCH_API_URL = 'https://api.anthropic.com/v1/messages/batches'

const CLASSIFIER_PROMPT_VERSION = 'youtube-anomaly-v1'

interface Args {
  dryRun: boolean
  apply: boolean
  limit: number | null
  sample: number | null
  sourceUrlContains: string | null
  batchSize: number
  parallelBatches: number
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  const flag = (n: string, def: string | null = null) => { const i = a.indexOf(n); return i < 0 ? def : a[i + 1] }
  const bool = (n: string) => a.indexOf(n) >= 0
  return {
    dryRun: bool('--dry-run') || !bool('--apply'),
    apply: bool('--apply'),
    limit: flag('--limit') ? parseInt(flag('--limit')!) : null,
    sample: flag('--sample') ? parseInt(flag('--sample')!) : null,
    sourceUrlContains: flag('--source-url-contains'),
    batchSize: parseInt(flag('--batch-size', '100') || '100'),
    parallelBatches: parseInt(flag('--parallel-batches', '8') || '8'),
  }
}

interface Candidate {
  id: string
  title: string
  description: string
  feed_hook: string | null
  source_url: string | null
  source_label: string | null
  category: string | null
}

async function findCandidates(sb: SupabaseClient, args: Args): Promise<Candidate[]> {
  const out: Candidate[] = []
  const page = 1000
  let from = 0
  while (true) {
    let q = sb
      .from('reports')
      .select('id, title, description, feed_hook, source_url, source_label, category')
      .eq('status', 'approved')
      .eq('source_type', 'youtube')
      .order('created_at', { ascending: false })
      .range(from, from + page - 1)
    if (args.sourceUrlContains) q = q.ilike('source_url', '%' + args.sourceUrlContains + '%')
    const { data, error } = await q
    if (error) throw new Error('candidate query: ' + error.message)
    if (!data || data.length === 0) break
    for (const r of data) {
      out.push({
        id: r.id,
        title: r.title || '',
        description: r.description || '',
        feed_hook: r.feed_hook,
        source_url: r.source_url,
        source_label: r.source_label,
        category: r.category,
      })
      if (args.limit && out.length >= args.limit) return out
    }
    from += page
    if (data.length < page) break
  }
  return out
}

function buildPrompt(c: Candidate): string {
  return `You are auditing a Paradocs report record for whether it actually describes a paranormal / anomalous / unexplained personal experience.

Paradocs only archives FIRST-PERSON OR CLOSE-WITNESS accounts of experiences that the witness perceived as anomalous, paranormal, unexplained, or supernatural. The following are NOT anomalous experiences and should be rejected:

  - mundane hiking, navigation, dehydration, or outdoor misadventure stories
  - wildlife encounters (charging animals, snake bites, etc.) where the danger is the animal, not anything unexplained
  - perceptual-quirk explainers (e.g. "trails become invisible from the side") — these describe normal optics, not anomalies
  - platform / algorithm / media-bias complaints (YouTube recommendations, censorship)
  - opinion pieces, theory posts, news summaries, advice requests
  - product reviews, equipment troubleshooting, "how do I..." questions

The following ARE anomalous experiences and should be kept:
  - UFO sightings, encounters with non-human entities, missing time
  - apparitions, hauntings, poltergeist activity, witnessed phenomena
  - precognitive dreams that came true, telepathy, OBE, NDE
  - sleep paralysis with sensed presence, witness sketches of cryptids
  - cases where a coincidence felt strongly anomalous to the witness

TITLE:
${c.title}

AI-GENERATED FEED HOOK (Paradocs's rewrite of the source text):
${c.feed_hook || '(none)'}

DESCRIPTION (first 1500 chars):
${(c.description || '').slice(0, 1500)}

CATEGORY ASSIGNED: ${c.category || '(none)'}
SOURCE: ${c.source_label || ''} — ${c.source_url || ''}

Question: Does this record describe an actual anomalous / paranormal / unexplained experience that Paradocs should archive?

Respond JSON only (no markdown fences):
{
  "anomalous": "yes" | "no",
  "confidence": 0.0-1.0,
  "reason": "<one sentence — required even when anomalous=yes>",
  "genre": "<if anomalous=no, classify: hiking_misadventure | wildlife_encounter | perceptual_quirk | platform_complaint | opinion_theory | advice_request | product_review | news_summary | other_mundane | other>"
}

Be STRICT on the keep side — false negatives are recoverable (we can re-include later), false positives clutter the archive.`
}

interface BatchRequest {
  custom_id: string
  params: {
    model: string
    max_tokens: number
    messages: Array<{ role: string; content: string }>
  }
}

async function submitBatch(cands: Candidate[]): Promise<string> {
  const requests: BatchRequest[] = cands.map(c => ({
    custom_id: c.id,
    params: {
      model: HAIKU_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: buildPrompt(c) }],
    },
  }))
  const resp = await fetch(BATCH_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })
  if (!resp.ok) throw new Error('batch submit: ' + resp.status + ' — ' + await resp.text())
  const data: any = await resp.json()
  return data.id
}

async function pollBatch(batchId: string, maxWaitSec = 3600): Promise<any[]> {
  const start = Date.now()
  let lastLog = 0
  while (true) {
    const elapsed = Math.floor((Date.now() - start) / 1000)
    if (elapsed > maxWaitSec) throw new Error('batch poll timed out')
    if (elapsed - lastLog >= 30) {
      console.log('  [+' + elapsed + 's] polling ' + batchId.substring(0, 28) + '...')
      lastLog = elapsed
    }
    const resp = await fetch(BATCH_API_URL + '/' + batchId, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'message-batches-2024-09-24',
      },
    })
    if (!resp.ok) throw new Error('batch poll: ' + resp.status)
    const data: any = await resp.json()
    if (data.processing_status === 'ended') {
      const r = await fetch(data.results_url, {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'message-batches-2024-09-24',
        },
      })
      return (await r.text()).split('\n').filter(Boolean).map(line => JSON.parse(line))
    }
    await new Promise(r => setTimeout(r, 30_000))
  }
}

interface Verdict {
  id: string
  candidate: Candidate
  anomalous: 'yes' | 'no' | 'error'
  confidence: number
  reason: string
  genre: string | null
}

function parseVerdicts(results: any[], byId: Map<string, Candidate>): Verdict[] {
  const out: Verdict[] = []
  for (const r of results) {
    const id = r.custom_id
    const c = byId.get(id)
    if (!c) continue
    const body = r.result?.message?.content?.[0]?.text || ''
    try {
      const m = body.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('no json')
      const j = JSON.parse(m[0])
      out.push({
        id,
        candidate: c,
        anomalous: j.anomalous === 'yes' ? 'yes' : (j.anomalous === 'no' ? 'no' : 'error'),
        confidence: typeof j.confidence === 'number' ? j.confidence : 0,
        reason: typeof j.reason === 'string' ? j.reason : '',
        genre: typeof j.genre === 'string' ? j.genre : null,
      })
    } catch (_e) {
      out.push({ id, candidate: c, anomalous: 'error', confidence: 0, reason: 'parse_error', genre: null })
    }
  }
  return out
}

async function applyArchives(sb: SupabaseClient, archives: Verdict[]): Promise<{ ok: number; err: number }> {
  let ok = 0, err = 0
  for (let i = 0; i < archives.length; i += 100) {
    const chunk = archives.slice(i, i + 100)
    const ids = chunk.map(v => v.id)
    const { error } = await sb
      .from('reports')
      .update({ status: 'archived' })
      .in('id', ids)
      .eq('status', 'approved')  // safety: don't re-flip already-flipped rows
    if (error) { err += chunk.length; console.error('  archive chunk error:', error.message) }
    else ok += chunk.length
  }
  return { ok, err }
}

function summarizeVerdicts(verdicts: Verdict[]) {
  const keep = verdicts.filter(v => v.anomalous === 'yes')
  const archive = verdicts.filter(v => v.anomalous === 'no' && v.confidence >= 0.7)
  const lowConf = verdicts.filter(v => v.anomalous === 'no' && v.confidence < 0.7)
  const errs = verdicts.filter(v => v.anomalous === 'error')

  console.log('\n=== Verdicts ===')
  console.log('  keep (yes):              ' + keep.length)
  console.log('  archive (no, conf>=0.7): ' + archive.length)
  console.log('  low-confidence (no <0.7):' + lowConf.length)
  console.log('  errors / unparseable:    ' + errs.length)

  // Genre breakdown
  const genres: Record<string, number> = {}
  for (const v of archive) {
    const g = v.genre || 'unclassified'
    genres[g] = (genres[g] || 0) + 1
  }
  console.log('\n=== Archive genre breakdown ===')
  for (const [g, n] of Object.entries(genres).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + g.padEnd(28) + ' ' + n)
  }

  // Samples
  console.log('\n=== Archive samples (random 10) ===')
  const sample = archive.slice().sort(() => Math.random() - 0.5).slice(0, 10)
  for (const v of sample) {
    console.log('  • [' + (v.genre || '?') + '] ' + v.candidate.title.slice(0, 80))
    console.log('    └ ' + v.reason.slice(0, 120))
  }
  console.log('\n=== KEEP samples (random 5 — verify these are real) ===')
  const keepSample = keep.slice().sort(() => Math.random() - 0.5).slice(0, 5)
  for (const v of keepSample) {
    console.log('  ✓ ' + v.candidate.title.slice(0, 80))
    console.log('    └ ' + v.reason.slice(0, 120))
  }

  return { keep, archive, lowConf, errs }
}

async function main() {
  const args = parseArgs()
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  console.log('YouTube anomaly-content audit — V11.17.41')
  console.log('Mode: ' + (args.apply ? 'APPLY' : 'DRY-RUN'))
  if (args.sourceUrlContains) console.log('Filter: source_url contains "' + args.sourceUrlContains + '"')
  if (args.limit) console.log('Limit: ' + args.limit)
  if (args.sample) console.log('Sample size: ' + args.sample)

  console.log('\nFinding candidates...')
  let candidates = await findCandidates(sb, args)
  console.log('Found ' + candidates.length + ' approved YouTube reports.')

  if (args.sample && candidates.length > args.sample) {
    candidates = candidates.sort(() => Math.random() - 0.5).slice(0, args.sample)
    console.log('Sampled down to ' + candidates.length + ' for cost-bounded dry-run.')
  }

  if (candidates.length === 0) {
    console.log('No candidates. Done.')
    return
  }

  const estCost = (candidates.length * 0.0035).toFixed(2)
  console.log('Estimated Haiku batch cost: $' + estCost)

  if (args.dryRun && !args.sample) {
    console.log('\nDry-run with no --sample: counted candidates only, skipping Haiku.')
    console.log('Re-run with --sample <N> to see Haiku verdicts on a random subset,')
    console.log('or --apply to run Haiku on all and archive failures.')
    return
  }

  console.log('\nSubmitting to Haiku batch...')

  const byId = new Map<string, Candidate>()
  for (const c of candidates) byId.set(c.id, c)

  const chunks: Candidate[][] = []
  for (let i = 0; i < candidates.length; i += args.batchSize) chunks.push(candidates.slice(i, i + args.batchSize))
  console.log('Processing ' + chunks.length + ' batches with up to ' + args.parallelBatches + ' in flight...')

  const allVerdicts: Verdict[] = []
  let nextIdx = 0
  const inflight = new Set<Promise<void>>()

  async function pipeline(idx: number, chunk: Candidate[]) {
    const label = '[batch ' + (idx + 1) + '/' + chunks.length + ']'
    console.log(label + ' submitting ' + chunk.length + '...')
    const batchId = await submitBatch(chunk)
    console.log(label + ' submitted: ' + batchId)
    const results = await pollBatch(batchId)
    const verdicts = parseVerdicts(results, byId)
    allVerdicts.push(...verdicts)
    const keep = verdicts.filter(v => v.anomalous === 'yes').length
    const arch = verdicts.filter(v => v.anomalous === 'no' && v.confidence >= 0.7).length
    console.log(label + ' done: keep=' + keep + ' archive=' + arch + ' (running: ' + allVerdicts.length + '/' + candidates.length + ')')
  }

  while (nextIdx < chunks.length || inflight.size > 0) {
    while (inflight.size < args.parallelBatches && nextIdx < chunks.length) {
      const idx = nextIdx++
      const p = pipeline(idx, chunks[idx])
        .catch(e => console.error('[batch ' + (idx + 1) + '] FAILED: ' + (e?.message || e)))
        .finally(() => { inflight.delete(p) })
      inflight.add(p)
    }
    if (inflight.size > 0) await Promise.race(inflight)
  }

  const { archive } = summarizeVerdicts(allVerdicts)

  if (args.apply && archive.length > 0) {
    console.log('\nApplying — archiving ' + archive.length + ' reports...')
    const { ok, err } = await applyArchives(sb, archive)
    console.log('  archived: ' + ok)
    console.log('  errors:   ' + err)
  } else if (args.dryRun) {
    console.log('\nDry-run — no DB changes.')
  }

  console.log('\nDone.')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
