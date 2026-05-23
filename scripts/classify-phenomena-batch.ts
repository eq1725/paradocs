#!/usr/bin/env tsx
/**
 * V11.15.2 — Haiku-batch phenomenon classifier (Option B: many-to-many).
 *
 * For each approved report not yet linked to a phenomenon, asks Haiku
 * 4.5 (via Anthropic Batch API) for a primary + up to 2 secondary
 * phenomenon matches from that category's encyclopedia entries.
 *
 * Persistence:
 *   - report_phenomena junction table — one row per (report, phenomenon)
 *     pair with is_primary flag and tagged_by='ai_primary' / 'ai_secondary'.
 *   - reports.phenomenon_type_id — denormalized primary pointer for
 *     backward-compatible single-FK callsites.
 *
 * Drain-safe: writes only to report_phenomena (new rows) and to
 * reports.phenomenon_type_id (a column the drain doesn't touch).
 * No row contention with the pending_review worker.
 *
 * Cost projection: with prompt caching kicking in after the first
 * request per category, ~$0.0005/report × 97k ≈ $50 actual.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *
 *   tsx scripts/classify-phenomena-batch.ts --category cryptids --dry-run
 *   tsx scripts/classify-phenomena-batch.ts --category cryptids --limit 100
 *   tsx scripts/classify-phenomena-batch.ts --category cryptids
 *   tsx scripts/classify-phenomena-batch.ts --all
 */

import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY missing from env')
  process.exit(1)
}

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 150  // small JSON object
const TEMPERATURE = 0.1
const BATCH_API_URL = 'https://api.anthropic.com/v1/messages/batches'

const HAIKU_INPUT_BATCH = 0.5         // $/M tokens
const HAIKU_OUTPUT_BATCH = 2.5
const HAIKU_CACHE_WRITE_BATCH = 0.625  // 1.25× input
const HAIKU_CACHE_READ_BATCH = 0.05    // 10% of input

const CATEGORIES = [
  'ufos_aliens',
  'cryptids',
  'ghosts_hauntings',
  'psychic_phenomena',
  'consciousness_practices',
  'psychological_experiences',
  'perception_sensory',
  'religion_mythology',
  'esoteric_practices',
]

interface CliArgs {
  category: string | null
  all: boolean
  dryRun: boolean
  limit: number
  pollIntervalSec: number
  maxWaitSec: number
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    category: null,
    all: false,
    dryRun: false,
    limit: 0,
    pollIntervalSec: 30,
    maxWaitSec: 5400,
  }
  const argv = process.argv
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--category') { args.category = argv[++i] }
    else if (a === '--all') { args.all = true }
    else if (a === '--dry-run') { args.dryRun = true }
    else if (a === '--limit') { args.limit = parseInt(argv[++i], 10) || 0 }
    else if (a === '--poll-interval') { args.pollIntervalSec = parseInt(argv[++i], 10) || 30 }
    else if (a === '--max-wait') { args.maxWaitSec = parseInt(argv[++i], 10) || 5400 }
    else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/classify-phenomena-batch.ts [--category X | --all] [--limit N] [--dry-run]')
      process.exit(0)
    }
  }
  if (!args.category && !args.all) {
    console.error('Specify --category <name> or --all')
    process.exit(1)
  }
  return args
}

interface Phenomenon {
  id: string                    // phenomena.id (encyclopedia entry)
  slug: string
  name: string
  aliases: string[] | null
  ai_summary: string | null
}

function buildSystemPrompt(category: string, phenomena: Phenomenon[]): string {
  const lines: string[] = []
  lines.push('You are a paranormal phenomenon classifier for the Paradocs corpus.')
  lines.push('')
  lines.push('TASK: Given a witness report, identify the phenomena from the catalog below that best match.')
  lines.push('')
  lines.push('RULES:')
  lines.push('1. Read the report carefully. The witness describes an event — your job is to find the phenomena that best fit, by SEMANTIC MEANING not just keyword presence.')
  lines.push('2. "I lost an hour driving home" matches Missing Time even if those exact words aren\'t there.')
  lines.push('3. Aliases are common alternative names. Use them as match signals.')
  lines.push('4. PRIMARY: the single best-fit phenomenon. Required if any match is reasonable.')
  lines.push('5. SECONDARY: up to 2 ADDITIONAL phenomena that the report also significantly relates to. Cross-references are valuable — a Sleep Paralysis story that also describes a Shadow Person should list both.')
  lines.push('6. If NO phenomenon clearly fits (e.g. a generic story with no specific features), set primary=null.')
  lines.push('7. Be precise. Use only slugs that appear in the catalog below — do not invent slugs.')
  lines.push('')
  lines.push('OUTPUT FORMAT (strict JSON, single line, no other text):')
  lines.push('{"primary": "slug-here", "secondary": ["slug2", "slug3"]}')
  lines.push('OR with no secondaries:')
  lines.push('{"primary": "slug-here", "secondary": []}')
  lines.push('OR with no match at all:')
  lines.push('{"primary": null, "secondary": []}')
  lines.push('')
  lines.push('====================================================================')
  lines.push('CATALOG — category: ' + category)
  lines.push('====================================================================')
  lines.push('')
  for (const p of phenomena) {
    const aliasStr = (p.aliases && p.aliases.length > 0)
      ? ' [aka: ' + p.aliases.slice(0, 6).join(', ') + ']'
      : ''
    const summary = (p.ai_summary || '').replace(/\n/g, ' ').substring(0, 140)
    lines.push('- ' + p.slug + ' | ' + p.name + aliasStr)
    if (summary) lines.push('    ' + summary)
  }
  lines.push('')
  lines.push('====================================================================')
  lines.push('Read the user-submitted report below. Return JSON only — no other text.')
  lines.push('====================================================================')
  return lines.join('\n')
}

function buildUserPrompt(report: any): string {
  const lines: string[] = []
  lines.push('Title: ' + (report.title || '(no title)'))
  if (report.feed_hook) lines.push('Hook: ' + report.feed_hook)
  if (report.summary) lines.push('Summary: ' + report.summary)
  if (report.description) {
    const desc = (report.description || '').substring(0, 1200)
    lines.push('')
    lines.push('Excerpt:')
    lines.push(desc)
  }
  return lines.join('\n')
}

async function submitBatch(requests: any[]): Promise<{ batch_id: string } | { error: string }> {
  const resp = await fetch(BATCH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
    body: JSON.stringify({ requests }),
  })
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    return { error: 'submit ' + resp.status + ': ' + txt.substring(0, 300) }
  }
  const data = await resp.json()
  if (!data.id) return { error: 'response missing id' }
  return { batch_id: data.id }
}

async function getBatchStatus(batchId: string): Promise<any> {
  const resp = await fetch(BATCH_API_URL + '/' + batchId, {
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
  })
  return resp.json()
}

async function fetchBatchResults(url: string): Promise<any[]> {
  const resp = await fetch(url, {
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
  })
  const text = await resp.text()
  const rows: any[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try { rows.push(JSON.parse(trimmed)) } catch (_e) {}
  }
  return rows
}

async function fetchAllRows<T = any>(query: any, pageSize = 1000): Promise<T[]> {
  const all: T[] = []
  let offset = 0
  while (true) {
    const res = await query.range(offset, offset + pageSize - 1)
    if (res.error) throw new Error(res.error.message)
    const rows = res.data || []
    all.push.apply(all, rows as any)
    if (rows.length < pageSize) break
    offset += pageSize
    if (offset > 200000) break
  }
  return all
}

interface PersistStats {
  matched: number
  primaryOnly: number
  primaryPlusSecondaries: number
  nullMatched: number
  hallucinatedSlugs: number
  cost: number
  junctionWrites: number
  reportsUpdated: number
}

async function classifyCategory(
  sb: any,
  category: string,
  args: CliArgs,
): Promise<PersistStats> {
  console.log('\n══════════════════════════════════════════════════════════')
  console.log('CATEGORY: ' + category)
  console.log('══════════════════════════════════════════════════════════')

  const phenomena = await fetchAllRows<Phenomenon>(
    sb.from('phenomena')
      .select('id, slug, name, aliases, ai_summary')
      .eq('status', 'active')
      .eq('category', category)
  )
  console.log('Phenomena in this category: ' + phenomena.length)
  if (phenomena.length === 0) {
    return { matched: 0, primaryOnly: 0, primaryPlusSecondaries: 0, nullMatched: 0, hallucinatedSlugs: 0, cost: 0, junctionWrites: 0, reportsUpdated: 0 }
  }
  // Lookup: slug → phenomena.id. The reports.phenomenon_type_id column
  // is FK'd to phenomena.id (constraint reports_phenomenon_type_id_fkey),
  // so we use the encyclopedia entry id directly — NOT the phenomena
  // table's own phenomenon_type_id column, which is almost always null.
  const slugLookup = new Map<string, { phenomenonId: string }>()
  for (const p of phenomena) {
    slugLookup.set(p.slug, { phenomenonId: p.id })
  }

  // Load approved reports needing classification — reports that DON'T
  // already have any row in report_phenomena (so we don't re-classify).
  // Easiest implementation: fetch all approved reports in this category,
  // then filter out ones with existing junction rows.
  console.log('Loading approved reports in category...')
  let repQuery = sb.from('reports')
    .select('id, title, summary, feed_hook, description')
    .eq('status', 'approved')
    .eq('category', category)
    .order('created_at', { ascending: true })
  if (args.limit > 0) repQuery = repQuery.limit(args.limit)
  const reports = args.limit > 0
    ? (await repQuery).data || []
    : await fetchAllRows<any>(repQuery)
  console.log('  loaded ' + reports.length + ' approved reports')

  // Filter to reports without ANY existing junction row.
  // PostgREST builds URL with the IDs inline; 1000 UUIDs at ~37 chars
  // each = 37k char URL, beyond practical limits. Chunk at 100.
  console.log('Filtering to reports without existing phenomenon links...')
  const existingLinks = new Set<string>()
  const reportIds = reports.map((r: any) => r.id)
  const LINK_CHECK_CHUNK = 100
  for (let i = 0; i < reportIds.length; i += LINK_CHECK_CHUNK) {
    const chunk = reportIds.slice(i, i + LINK_CHECK_CHUNK)
    const res = await sb.from('report_phenomena').select('report_id').in('report_id', chunk)
    if (res.error) {
      console.error('  link-check error: ' + res.error.message)
      continue
    }
    for (const r of (res.data || [])) existingLinks.add(r.report_id)
  }
  const toClassify = reports.filter((r: any) => !existingLinks.has(r.id))
  console.log('  ' + toClassify.length + ' reports to classify (excluding ' + (reports.length - toClassify.length) + ' already-linked)')
  if (toClassify.length === 0) {
    return { matched: 0, primaryOnly: 0, primaryPlusSecondaries: 0, nullMatched: 0, hallucinatedSlugs: 0, cost: 0, junctionWrites: 0, reportsUpdated: 0 }
  }

  const systemPrompt = buildSystemPrompt(category, phenomena)
  const sysTokens = Math.ceil(systemPrompt.length / 4)
  console.log('System prompt size: ~' + sysTokens + ' tokens')

  // Cost estimate (with caching after 1st request)
  const avgUserTokens = 400
  const avgOutputTokens = 25
  const cacheWriteCost = sysTokens / 1e6 * HAIKU_CACHE_WRITE_BATCH
  const cacheReadPerReq = sysTokens / 1e6 * HAIKU_CACHE_READ_BATCH
  const userPerReq = avgUserTokens / 1e6 * HAIKU_INPUT_BATCH
  const outputPerReq = avgOutputTokens / 1e6 * HAIKU_OUTPUT_BATCH
  const firstReqCost = cacheWriteCost + userPerReq + outputPerReq
  const cachedReqCost = cacheReadPerReq + userPerReq + outputPerReq
  const estTotal = firstReqCost + cachedReqCost * (toClassify.length - 1)
  console.log('Estimated cost (with caching): $' + estTotal.toFixed(4))
  console.log('  First req:                   $' + firstReqCost.toFixed(6))
  console.log('  Cached req (each):           $' + cachedReqCost.toFixed(6))

  if (args.dryRun) {
    console.log('DRY RUN — would submit ' + toClassify.length + ' requests')
    return { matched: 0, primaryOnly: 0, primaryPlusSecondaries: 0, nullMatched: 0, hallucinatedSlugs: 0, cost: estTotal, junctionWrites: 0, reportsUpdated: 0 }
  }

  // Build batch requests
  const batchReqs = toClassify.map(function(r: any): any {
    return {
      custom_id: r.id,
      params: {
        model: HAIKU_MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUserPrompt(r) }],
        temperature: TEMPERATURE,
      },
    }
  })

  // V11.15.4 fix — the system prompt with the phenomena catalog is
  // ~11k tokens (~44KB serialized). Each batch request carries its own
  // copy of that prompt in the JSON payload, even with cache_control
  // (cache_control affects what Anthropic charges and what they
  // process, NOT what the client sends over the wire). So a single
  // submission of 50k requests would JSON.stringify to ~2.2 GB, well
  // past Node's ~512MB practical string limit and the HTTP body cap.
  // Cap chunks at 4000 → ~175MB payload, fits comfortably under both.
  const CHUNK_SIZE = 4000
  const chunks: any[][] = []
  for (let i = 0; i < batchReqs.length; i += CHUNK_SIZE) {
    chunks.push(batchReqs.slice(i, i + CHUNK_SIZE))
  }

  const stats: PersistStats = {
    matched: 0, primaryOnly: 0, primaryPlusSecondaries: 0, nullMatched: 0,
    hallucinatedSlugs: 0, cost: 0, junctionWrites: 0, reportsUpdated: 0,
  }

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci]
    console.log('\nChunk ' + (ci + 1) + '/' + chunks.length + ': submitting ' + chunk.length + ' requests...')
    const sub = await submitBatch(chunk)
    if ('error' in sub) {
      console.error('  submit failed: ' + sub.error)
      continue
    }
    const batchId = sub.batch_id
    console.log('  batch_id: ' + batchId)

    const start = Date.now()
    while (true) {
      if (Date.now() - start > args.maxWaitSec * 1000) {
        console.warn('  max wait reached; batch_id ' + batchId + ' left in flight')
        break
      }
      await new Promise(function (r) { setTimeout(r, args.pollIntervalSec * 1000) })
      const status = await getBatchStatus(batchId)
      const c = status.request_counts || {}
      const el = Math.round((Date.now() - start) / 1000)
      console.log('  [+' + el + 's] status=' + status.processing_status + ' processing=' + (c.processing || 0) + ' succeeded=' + (c.succeeded || 0) + ' errored=' + (c.errored || 0))
      if (status.processing_status === 'ended') {
        if (!status.results_url) { console.error('  no results_url'); break }
        const results = await fetchBatchResults(status.results_url)
        console.log('  Got ' + results.length + ' result rows. Persisting...')

        for (const row of results) {
          if (row.result?.type !== 'succeeded') continue
          const text = row.result.message?.content?.[0]?.text
          if (!text) continue
          let parsed: any = null
          try {
            const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
            const s = cleaned.indexOf('{')
            const e = cleaned.lastIndexOf('}')
            if (s >= 0 && e > s) parsed = JSON.parse(cleaned.substring(s, e + 1))
          } catch (_e) {}

          const usage = row.result.message?.usage || {}
          stats.cost +=
            (usage.input_tokens || 0) / 1e6 * HAIKU_INPUT_BATCH +
            (usage.cache_creation_input_tokens || 0) / 1e6 * HAIKU_CACHE_WRITE_BATCH +
            (usage.cache_read_input_tokens || 0) / 1e6 * HAIKU_CACHE_READ_BATCH +
            (usage.output_tokens || 0) / 1e6 * HAIKU_OUTPUT_BATCH

          if (!parsed || (parsed.primary == null && (!Array.isArray(parsed.secondary) || parsed.secondary.length === 0))) {
            stats.nullMatched++
            continue
          }
          const primarySlug: string | null = parsed.primary
          const secondarySlugs: string[] = Array.isArray(parsed.secondary) ? parsed.secondary.slice(0, 2) : []

          // Resolve slugs → phenomenon_ids. Drop hallucinated.
          const links: Array<{ phenomenonId: string; isPrimary: boolean; taggedBy: string }> = []
          if (primarySlug) {
            const lookup = slugLookup.get(primarySlug)
            if (lookup) {
              links.push({ phenomenonId: lookup.phenomenonId, isPrimary: true, taggedBy: 'ai_primary' })
            } else {
              stats.hallucinatedSlugs++
            }
          }
          for (const s of secondarySlugs) {
            const lookup = slugLookup.get(s)
            if (lookup) {
              links.push({ phenomenonId: lookup.phenomenonId, isPrimary: false, taggedBy: 'ai_secondary' })
            } else {
              stats.hallucinatedSlugs++
            }
          }

          if (links.length === 0) {
            stats.nullMatched++
            continue
          }
          stats.matched++
          if (links.length === 1 && links[0].isPrimary) stats.primaryOnly++
          else if (links.length > 1) stats.primaryPlusSecondaries++

          // Insert into junction (upsert to handle re-runs)
          for (const link of links) {
            const ins = await sb.from('report_phenomena').upsert({
              report_id: row.custom_id,
              phenomenon_id: link.phenomenonId,
              is_primary: link.isPrimary,
              tagged_by: link.taggedBy,
              confidence: link.isPrimary ? 0.9 : 0.6,
            }, { onConflict: 'report_id,phenomenon_id' })
            if (!ins.error) stats.junctionWrites++
          }
          // Note: reports.phenomenon_type_id is NOT updated — its FK
          // targets phenomenon_types.id (a separate legacy table) and
          // most phenomena rows don't have a phenomenon_type_id mapping.
          // The encyclopedia page now reads from report_phenomena.
        }
        break
      }
    }
  }

  console.log('\n--- Category ' + category + ' summary ---')
  console.log('  Reports matched:                   ' + stats.matched)
  console.log('    primary only:                    ' + stats.primaryOnly)
  console.log('    primary + secondaries:           ' + stats.primaryPlusSecondaries)
  console.log('  No match (Haiku returned null):    ' + stats.nullMatched)
  console.log('  Hallucinated slugs (dropped):      ' + stats.hallucinatedSlugs)
  console.log('  Junction rows written:             ' + stats.junctionWrites)
  console.log('  Reports.phenomenon_type_id updated:' + stats.reportsUpdated)
  console.log('  Actual cost:                       $' + stats.cost.toFixed(4))

  return stats
}

async function main() {
  const args = parseArgs()
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('=== Phenomenon classifier — V11.15.2 (Option B junction) ===')
  console.log('Dry run:        ' + args.dryRun)
  console.log('Per-cat limit:  ' + (args.limit > 0 ? args.limit : 'no limit'))

  const cats = args.all ? CATEGORIES : [args.category!]
  const grand: PersistStats = {
    matched: 0, primaryOnly: 0, primaryPlusSecondaries: 0, nullMatched: 0,
    hallucinatedSlugs: 0, cost: 0, junctionWrites: 0, reportsUpdated: 0,
  }

  for (const cat of cats) {
    const res = await classifyCategory(sb, cat, args)
    grand.matched += res.matched
    grand.primaryOnly += res.primaryOnly
    grand.primaryPlusSecondaries += res.primaryPlusSecondaries
    grand.nullMatched += res.nullMatched
    grand.hallucinatedSlugs += res.hallucinatedSlugs
    grand.cost += res.cost
    grand.junctionWrites += res.junctionWrites
    grand.reportsUpdated += res.reportsUpdated
  }

  console.log('\n══════════════════════════════════════════════════════════')
  console.log('GRAND TOTAL')
  console.log('══════════════════════════════════════════════════════════')
  console.log('Reports matched:                  ' + grand.matched)
  console.log('  primary only:                   ' + grand.primaryOnly)
  console.log('  primary + secondaries:          ' + grand.primaryPlusSecondaries)
  console.log('No match:                         ' + grand.nullMatched)
  console.log('Hallucinated slugs (dropped):     ' + grand.hallucinatedSlugs)
  console.log('Junction rows written:            ' + grand.junctionWrites)
  console.log('Reports.phenomenon_type_id set:   ' + grand.reportsUpdated)
  console.log('Total cost:                       $' + grand.cost.toFixed(4))
}

main().catch(function(e) { console.error('Fatal:', e?.message || e); process.exit(1) })
