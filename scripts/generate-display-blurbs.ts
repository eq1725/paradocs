#!/usr/bin/env tsx
/**
 * V11.17.11 — Haiku batch generator for phenomena.display_blurb.
 *
 * For each phenomenon whose display_blurb is NULL (or --refresh forces
 * the whole table), asks Claude Haiku 4.5 via the Anthropic Batch API
 * for a ≤140-char definitional 1-sentence blurb optimized for the
 * encyclopedia tile card. Persists to phenomena.display_blurb +
 * display_blurb_at timestamp.
 *
 * Output shape (Wikipedia + App Store + Netflix lead-sentence pattern):
 *   - Defines the entity: "The Adlet are humanoid creatures from
 *     Inuit mythology — half-human, half-dog predators that hunt
 *     across Arctic snow."
 *   - 1 sentence, ≤140 chars
 *   - No hedging ("said to be", "supposedly", "alleged")
 *   - No marketing fluff — encyclopedic, neutral tone
 *   - Avoids restating the entry name where possible
 *
 * Cost:
 *   ~4,500 phenomena × (200 input + 60 output tokens) at batch pricing
 *   ≈ $8 one-time. Subsequent drain runs only re-process newly-created
 *   entries, so steady-state cost is pennies/day.
 *
 * Safety:
 *   - Drain-safe: only writes phenomena.display_blurb / display_blurb_at.
 *     Never touches reports, junction tables, or pending_review.
 *   - Idempotent: scripts can be re-run; only updates rows where
 *     display_blurb is NULL unless --refresh is passed.
 *   - Length-validated: each Haiku response is enforced to ≤180 chars
 *     (matches the DB CHECK constraint). Anything longer is trimmed at
 *     the last sentence boundary that fits.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *
 *   tsx scripts/generate-display-blurbs.ts --dry-run --limit 5
 *   tsx scripts/generate-display-blurbs.ts --limit 100
 *   tsx scripts/generate-display-blurbs.ts                  # all missing
 *   tsx scripts/generate-display-blurbs.ts --refresh        # regenerate all
 */

import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY missing from env')
  process.exit(1)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL or SERVICE_ROLE_KEY missing from env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 200
const TEMPERATURE = 0.2
const MAX_BLURB_CHARS = 180  // matches DB CHECK constraint
const TARGET_BLURB_CHARS = 140  // soft budget for prompt
const BATCH_API_URL = 'https://api.anthropic.com/v1/messages/batches'
const CHUNK_SIZE = 4000  // V8 string limit safety, mirrors classify-phenomena-batch

// Batch API pricing (Haiku 4.5, 50% discount vs sync)
const HAIKU_INPUT_BATCH = 0.5  // $/M tokens
const HAIKU_OUTPUT_BATCH = 2.5

interface CliArgs {
  dryRun: boolean
  limit: number
  refresh: boolean
  pollIntervalSec: number
  maxWaitSec: number
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    limit: 0,
    refresh: false,
    pollIntervalSec: 30,
    maxWaitSec: 5400,
  }
  const argv = process.argv
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true
    else if (argv[i] === '--refresh') args.refresh = true
    else if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10)
    else if (argv[i] === '--poll') args.pollIntervalSec = parseInt(argv[++i], 10)
    else if (argv[i] === '--max-wait') args.maxWaitSec = parseInt(argv[++i], 10)
  }
  return args
}

interface PhenomenonRow {
  id: string
  name: string
  category: string
  ai_summary: string | null
  aliases: string[] | null
}

async function fetchPhenomena(refresh: boolean, limit: number): Promise<PhenomenonRow[]> {
  const rows: PhenomenonRow[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    let q = supabase
      .from('phenomena')
      .select('id,name,category,ai_summary,aliases')
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (!refresh) q = q.is('display_blurb', null)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...(data as PhenomenonRow[]))
    if (data.length < PAGE) break
    if (limit > 0 && rows.length >= limit) break
    from += PAGE
  }
  if (limit > 0 && rows.length > limit) rows.length = limit
  return rows
}

function buildPrompt(p: PhenomenonRow): string {
  const aliases = p.aliases && p.aliases.length > 0 ? ` (also known as: ${p.aliases.slice(0, 3).join(', ')})` : ''
  const summary = p.ai_summary
    ? `\n\nReference (full encyclopedia summary, do NOT copy verbatim):\n"""${p.ai_summary.slice(0, 1200)}"""`
    : ''
  return `You write definitional one-sentence descriptors for an encyclopedia of paranormal phenomena. The descriptor appears on a small mobile card, so brevity and scannability matter more than completeness.

Phenomenon: ${p.name}${aliases}
Category: ${p.category}${summary}

Write ONE sentence that defines what ${p.name} is. Rules:
1. ≤${TARGET_BLURB_CHARS} characters (hard cap ${MAX_BLURB_CHARS}). Counted in characters, not words.
2. Defines the entity — what it IS, in encyclopedic neutral tone. Not "said to be" or "supposedly".
3. Lead with the type/class noun ("humanoid creature", "vampiric entity", "ritual practice"), then 1-2 distinctive details.
4. Avoid restating "${p.name}" at the start when natural — start with the descriptor noun where possible.
5. No marketing flourish, no exclamations, no hedging.
6. Plain text only. No markdown, no quotes, no leading/trailing whitespace.

Return ONLY the sentence. No preamble, no JSON, no labels.`
}

interface BatchRequest {
  custom_id: string
  params: {
    model: string
    max_tokens: number
    temperature: number
    messages: { role: 'user'; content: string }[]
  }
}

function buildBatchRequests(phenomena: PhenomenonRow[]): BatchRequest[] {
  return phenomena.map((p) => ({
    custom_id: p.id,
    params: {
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      messages: [{ role: 'user', content: buildPrompt(p) }],
    },
  }))
}

async function submitBatch(requests: BatchRequest[]): Promise<string> {
  const body = { requests }
  // Stream-serialize in chunks to dodge V8 string-length limits.
  const chunks: string[] = ['{"requests":[']
  for (let i = 0; i < requests.length; i++) {
    chunks.push(JSON.stringify(requests[i]))
    if (i < requests.length - 1) chunks.push(',')
  }
  chunks.push(']}')

  // For very large batches, write to a temp file and use fetch with that.
  // For now, smaller chunks should fit comfortably.
  const payload = chunks.join('')

  const res = await fetch(BATCH_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
      'content-type': 'application/json',
    },
    body: payload,
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Batch submit failed: ${res.status} ${errText}`)
  }
  const data = await res.json() as any
  return data.id as string
}

async function pollBatch(batchId: string, pollSec: number, maxWaitSec: number): Promise<any> {
  const start = Date.now()
  let lastStatus = ''
  while (true) {
    const res = await fetch(`${BATCH_API_URL}/${batchId}`, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'message-batches-2024-09-24',
      },
    })
    if (!res.ok) {
      throw new Error(`Batch poll failed: ${res.status} ${await res.text()}`)
    }
    const data = await res.json() as any
    if (data.processing_status !== lastStatus) {
      const counts = data.request_counts || {}
      console.log(`[poll] status=${data.processing_status} succeeded=${counts.succeeded || 0} processing=${counts.processing || 0} errored=${counts.errored || 0}`)
      lastStatus = data.processing_status
    }
    if (data.processing_status === 'ended') return data
    if (Date.now() - start > maxWaitSec * 1000) {
      throw new Error(`Batch timeout after ${maxWaitSec}s`)
    }
    await new Promise((r) => setTimeout(r, pollSec * 1000))
  }
}

async function fetchBatchResults(resultsUrl: string): Promise<Map<string, string>> {
  const res = await fetch(resultsUrl, {
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
  })
  if (!res.ok) throw new Error(`Results fetch failed: ${res.status}`)
  const text = await res.text()
  const blurbs = new Map<string, string>()
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const obj = JSON.parse(line)
      const customId = obj.custom_id
      const result = obj.result
      if (result?.type !== 'succeeded') {
        console.warn(`[results] ${customId}: ${result?.type} ${result?.error?.error?.message || ''}`)
        continue
      }
      const content = result.message?.content?.[0]?.text || ''
      const blurb = normalizeBlurb(content)
      if (blurb) blurbs.set(customId, blurb)
    } catch (err) {
      console.error('[results] parse error:', err)
    }
  }
  return blurbs
}

/** Trim quotes, collapse whitespace, enforce ≤MAX_BLURB_CHARS at sentence boundary. */
function normalizeBlurb(raw: string): string {
  let s = raw.trim()
  // Strip surrounding quotes if Haiku added them.
  s = s.replace(/^["'`]+|["'`]+$/g, '')
  // Collapse newlines and runs of whitespace.
  s = s.replace(/\s+/g, ' ').trim()
  if (s.length <= MAX_BLURB_CHARS) return s
  // Too long — trim at last sentence end within budget.
  const head = s.slice(0, MAX_BLURB_CHARS)
  const lastDot = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  if (lastDot > MAX_BLURB_CHARS * 0.5) return head.slice(0, lastDot + 1).trim()
  // Fall back to word boundary.
  const lastSpace = head.lastIndexOf(' ')
  return (lastSpace > MAX_BLURB_CHARS * 0.4 ? head.slice(0, lastSpace) : head).trim()
}

async function persist(blurbs: Map<string, string>, dryRun: boolean): Promise<{ updated: number; failed: number }> {
  let updated = 0
  let failed = 0
  const entries = Array.from(blurbs.entries())
  const now = new Date().toISOString()
  // Update in small batches to keep network round-trips reasonable.
  for (const [id, blurb] of entries) {
    if (dryRun) {
      console.log(`[dry-run] ${id} → ${blurb.length}ch: "${blurb}"`)
      updated++
      continue
    }
    const { error } = await supabase
      .from('phenomena')
      .update({ display_blurb: blurb, display_blurb_at: now })
      .eq('id', id)
    if (error) {
      console.error(`[persist] ${id} update failed:`, error.message)
      failed++
    } else {
      updated++
    }
  }
  return { updated, failed }
}

async function main() {
  const args = parseArgs()
  console.log('args:', args)

  console.log('Fetching phenomena with missing display_blurb…')
  const phenomena = await fetchPhenomena(args.refresh, args.limit)
  console.log(`Found ${phenomena.length} phenomena to process`)
  if (phenomena.length === 0) {
    console.log('Nothing to do.')
    return
  }

  if (args.dryRun && phenomena.length <= 5) {
    // Dry-run with small N: synchronous one-shot calls so we can show output.
    for (const p of phenomena) {
      console.log(`\n[dry-run] ${p.name} (${p.category})`)
      console.log(buildPrompt(p))
    }
    return
  }

  // Process in chunks to keep submit payloads under the V8 string limit.
  let totalUpdated = 0
  let totalFailed = 0
  for (let i = 0; i < phenomena.length; i += CHUNK_SIZE) {
    const chunk = phenomena.slice(i, i + CHUNK_SIZE)
    console.log(`\nSubmitting chunk ${Math.floor(i / CHUNK_SIZE) + 1} / ${Math.ceil(phenomena.length / CHUNK_SIZE)} (${chunk.length} requests)…`)
    const requests = buildBatchRequests(chunk)
    const batchId = await submitBatch(requests)
    console.log(`  batch_id=${batchId}`)
    const result = await pollBatch(batchId, args.pollIntervalSec, args.maxWaitSec)
    const blurbs = await fetchBatchResults(result.results_url)
    console.log(`  parsed ${blurbs.size} blurbs from ${chunk.length} requests`)
    const { updated, failed } = await persist(blurbs, args.dryRun)
    totalUpdated += updated
    totalFailed += failed
  }

  // Cost estimate: rough, assumes ~200 input + ~60 output tokens/req.
  const estInputTok = phenomena.length * 200
  const estOutputTok = phenomena.length * 60
  const cost = (estInputTok / 1_000_000) * HAIKU_INPUT_BATCH + (estOutputTok / 1_000_000) * HAIKU_OUTPUT_BATCH
  console.log(`\n========================================`)
  console.log(`GRAND TOTAL`)
  console.log(`  processed:   ${phenomena.length}`)
  console.log(`  updated:     ${totalUpdated}`)
  console.log(`  failed:      ${totalFailed}`)
  console.log(`  est cost:    $${cost.toFixed(2)}`)
  console.log(`========================================`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
