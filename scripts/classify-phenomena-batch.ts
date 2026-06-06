#!/usr/bin/env tsx
/**
 * V11.15.2 — Haiku-batch phenomenon classifier (Option B: many-to-many).
 * V11.17.90 — classifier cost optimizations.
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
 * V11.17.90 — cost optimizations (in priority order):
 *   B. Classifier prompt now asks for per-candidate confidence (0-1).
 *   C. Verification is SKIPPED for candidates with confidence >= 0.92.
 *      The V11.17.54 hallucination safety net remains for low/mid
 *      confidence candidates — we just trust the classifier when it's
 *      sure. Expected verify-skip rate: ~50% of all candidates.
 *   A. Surviving verify calls are now BATCHED (Anthropic Batch API,
 *      50% off) via a second-pass batch submission per chunk. The old
 *      sync per-candidate verify was the dominant cost driver
 *      (~3 sync Haiku calls per report × $0.0005 = $0.0015/report).
 *   E. Already-implemented — the script filters out reports with ANY
 *      existing junction row before classifying (see existingLinks).
 *
 * Projected per-report cost:
 *   classifier-primary (batched, cached): ~$0.00015
 *   classifier-verify (batched, ~1.5 candidates surviving conf gate):
 *     ~$0.00025 × 1.5 = $0.000375
 *   total: ~$0.0005-0.0009 per report (was $0.027 sync, $0.005 batched).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *
 *   tsx scripts/classify-phenomena-batch.ts --category cryptids --dry-run
 *   tsx scripts/classify-phenomena-batch.ts --category cryptids --limit 100
 *   tsx scripts/classify-phenomena-batch.ts --category cryptids
 *   tsx scripts/classify-phenomena-batch.ts --all
 *
 *   # V11.17.90 — disable confidence-gate verify-skip (defensive, full
 *   # verification for every candidate). Useful when validating new phens.
 *   tsx scripts/classify-phenomena-batch.ts --category cryptids --no-verify-skip
 */

import { createClient } from '@supabase/supabase-js'
import { buildVerifyPrompt } from '../src/lib/services/tag-verification.service'
import { logAiUsage } from '../src/lib/services/ai-cost-logger'

// V11.17.90 — Confidence threshold for skipping the verify gate.
// Set above the default classifier "I'm pretty sure" floor (~0.85) so
// only candidates the model is highly confident about bypass the
// hallucination check. Validated below 0.92 in the smoke harness
// (false-positive rate stayed under 2% of skipped candidates).
var VERIFY_SKIP_CONFIDENCE = 0.92

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY missing from env')
  process.exit(1)
}

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 200  // small JSON object — bumped from 150 for V11.17.90 confidence fields
const VERIFY_MAX_TOKENS = 200
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
  // V11.17.90 — disable confidence-gate verify-skip. Defensive flag for
  // first-run validation on new phen categories. Default false (gate ON).
  noVerifySkip: boolean
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    category: null,
    all: false,
    dryRun: false,
    limit: 0,
    pollIntervalSec: 30,
    maxWaitSec: 5400,
    noVerifySkip: false,
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
    else if (a === '--no-verify-skip') { args.noVerifySkip = true }
    else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/classify-phenomena-batch.ts [--category X | --all] [--limit N] [--dry-run] [--no-verify-skip]')
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
  category: string | null
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
  lines.push('8. CONFIDENCE: assign each phenomenon a confidence score 0.0-1.0.')
  lines.push('   - 0.95-1.0 = report explicitly names/describes the phenomenon canonically (e.g. "I saw Bigfoot in the woods")')
  lines.push('   - 0.85-0.94 = strong semantic match, canonical pattern is clearly present')
  lines.push('   - 0.65-0.84 = good match, some canonical features present but ambiguous')
  lines.push('   - 0.40-0.64 = plausible cross-reference, partial features only')
  lines.push('   - <0.40 = do not include the phenomenon')
  lines.push('   Be honest. Downstream code skips the verification gate when confidence >= 0.92, so over-claiming will let mistags through.')
  lines.push('')
  lines.push('OUTPUT FORMAT (strict JSON, single line, no other text):')
  lines.push('{"primary": {"slug": "slug-here", "confidence": 0.95}, "secondary": [{"slug": "slug2", "confidence": 0.7}, {"slug": "slug3", "confidence": 0.6}]}')
  lines.push('OR with no secondaries:')
  lines.push('{"primary": {"slug": "slug-here", "confidence": 0.9}, "secondary": []}')
  lines.push('OR with no match at all:')
  lines.push('{"primary": null, "secondary": []}')
  lines.push('')
  lines.push('LEGACY-COMPATIBLE INPUT NOTE: older catalog parsers may emit strings instead of objects (e.g. "primary": "slug-here"). The new object form is required — always include confidence.')
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
  // V11.17.54 — count of (report, phen) pairs the verification gate
  // dropped before junction insert. See verifyTag call below.
  verifierDropped: number
  // V11.17.90 — count of candidates that bypassed the verify gate
  // because classifier confidence was >= VERIFY_SKIP_CONFIDENCE.
  verifySkipped: number
  // V11.17.90 — count of candidates that DID need verification (and
  // thus were submitted to the verify batch).
  verifyBatched: number
  cost: number
  junctionWrites: number
  reportsUpdated: number
}

// V11.17.90 — pre-verify candidate carrying classifier confidence so
// the verify-skip gate can act on it. taggedBy preserves ai_primary
// vs ai_secondary attribution through the second batch round-trip.
interface PendingCandidate {
  reportId: string
  phenomenonId: string
  isPrimary: boolean
  taggedBy: string
  phen: Phenomenon
  classifierConfidence: number
}

// V11.17.90 — Accept either the new {slug, confidence} object form
// or the legacy bare-slug string form from the classifier. Bare slugs
// default to confidence 0.85 (just below the verify-skip threshold)
// so they always pass through the verifier — preserves the
// pre-V11.17.90 safety net for legacy outputs.
function normalizeClassifierEntry(entry: any): { slug: string; confidence: number } | null {
  if (entry == null) return null
  if (typeof entry === 'string') {
    return entry.length > 0 ? { slug: entry, confidence: 0.85 } : null
  }
  if (typeof entry === 'object' && typeof entry.slug === 'string' && entry.slug.length > 0) {
    var c = typeof entry.confidence === 'number' && isFinite(entry.confidence) ? entry.confidence : 0.85
    if (c < 0) c = 0
    if (c > 1) c = 1
    return { slug: entry.slug, confidence: c }
  }
  return null
}

// V11.17.90 — Verify pass via Anthropic Batch API.
//
// Submits one batch request per (report, phen) candidate. Each
// request uses the EXACT prompt buildVerifyPrompt() emits — so
// verdicts stay drop-in compatible with the sync verifyTag() path
// engine.ts and audit scripts use.
//
// custom_id encoding: `${reportId}::${phenomenonId}` so we can route
// each result row back to the right candidate without keeping a
// separate side-channel map. The pattern matches the convention
// used in batch-ingest-worker.
//
// Cost log: each verify result row writes a 'classifier-verify'
// ledger entry. Status 'completed' for parseable verdicts,
// 'failed' for the others (fail-open behavior is identical to the
// sync path).
async function runVerifyBatch(
  sb: any,
  needsVerifyCands: PendingCandidate[],
  reportLookup: Map<string, any>,
  reportLinks: Map<string, Array<{ phenomenonId: string; isPrimary: boolean; taggedBy: string; confidence: number }>>,
  stats: PersistStats,
  args: CliArgs,
): Promise<void> {
  // Build verify requests. One candidate → one batch entry.
  var verifyReqs: any[] = []
  // Side-table keyed by custom_id for cheap candidate lookup at
  // result-parse time.
  var candIndex = new Map<string, PendingCandidate>()
  for (var i = 0; i < needsVerifyCands.length; i++) {
    var cand = needsVerifyCands[i]
    var report = reportLookup.get(cand.reportId)
    if (!report) continue
    var prompt = buildVerifyPrompt(
      {
        name: cand.phen.name,
        slug: cand.phen.slug,
        category: cand.phen.category,
        ai_summary: cand.phen.ai_summary,
      },
      {
        title: report.title ?? null,
        summary: report.summary ?? null,
        description: report.description ?? null,
      },
    )
    // Encode (reportId, phenomenonId) into custom_id. Anthropic allows
    // up to 64 chars; two UUIDs + separator = 73 chars. Use a short
    // surrogate index instead so we stay under the limit.
    var customId = 'v' + i
    candIndex.set(customId, cand)
    verifyReqs.push({
      custom_id: customId,
      params: {
        model: HAIKU_MODEL,
        max_tokens: VERIFY_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      },
    })
  }

  if (verifyReqs.length === 0) return
  stats.verifyBatched += verifyReqs.length

  // Chunk at 4000 same as the classifier-primary batch (well under
  // payload limits — verify prompts are smaller, ~2k tokens each).
  var VERIFY_CHUNK = 4000
  for (var ci = 0; ci < verifyReqs.length; ci += VERIFY_CHUNK) {
    var chunk = verifyReqs.slice(ci, ci + VERIFY_CHUNK)
    console.log('  Verify pass: submitting ' + chunk.length + ' candidates ('
      + (ci + 1) + '–' + (ci + chunk.length) + ' of ' + verifyReqs.length + ')...')
    var sub = await submitBatch(chunk)
    if ('error' in sub) {
      console.warn('  verify-batch submit failed: ' + sub.error + ' — keeping ALL candidates fail-open')
      // Fail-open: every candidate in this chunk is kept.
      for (var k = 0; k < chunk.length; k++) {
        var failCand = candIndex.get(chunk[k].custom_id)
        if (!failCand) continue
        if (!reportLinks.has(failCand.reportId)) reportLinks.set(failCand.reportId, [])
        reportLinks.get(failCand.reportId)!.push({
          phenomenonId: failCand.phenomenonId,
          isPrimary: failCand.isPrimary,
          taggedBy: failCand.taggedBy,
          confidence: Number(failCand.classifierConfidence.toFixed(2)),
        })
      }
      continue
    }
    var verifyBatchId = sub.batch_id
    console.log('  verify batch_id: ' + verifyBatchId)

    var start = Date.now()
    while (true) {
      if (Date.now() - start > args.maxWaitSec * 1000) {
        console.warn('  verify-batch max wait reached; ' + verifyBatchId + ' left in flight, fail-open keeping all candidates')
        for (var kk = 0; kk < chunk.length; kk++) {
          var stuckCand = candIndex.get(chunk[kk].custom_id)
          if (!stuckCand) continue
          if (!reportLinks.has(stuckCand.reportId)) reportLinks.set(stuckCand.reportId, [])
          reportLinks.get(stuckCand.reportId)!.push({
            phenomenonId: stuckCand.phenomenonId,
            isPrimary: stuckCand.isPrimary,
            taggedBy: stuckCand.taggedBy,
            confidence: Number(stuckCand.classifierConfidence.toFixed(2)),
          })
        }
        break
      }
      await new Promise(function (r) { setTimeout(r, args.pollIntervalSec * 1000) })
      var vStatus = await getBatchStatus(verifyBatchId)
      var vc = vStatus.request_counts || {}
      var vel = Math.round((Date.now() - start) / 1000)
      console.log('  verify [+' + vel + 's] status=' + vStatus.processing_status
        + ' succeeded=' + (vc.succeeded || 0) + ' errored=' + (vc.errored || 0))
      if (vStatus.processing_status !== 'ended') continue
      if (!vStatus.results_url) {
        console.warn('  verify-batch: no results_url, fail-open keeping all candidates')
        for (var m = 0; m < chunk.length; m++) {
          var noResCand = candIndex.get(chunk[m].custom_id)
          if (!noResCand) continue
          if (!reportLinks.has(noResCand.reportId)) reportLinks.set(noResCand.reportId, [])
          reportLinks.get(noResCand.reportId)!.push({
            phenomenonId: noResCand.phenomenonId,
            isPrimary: noResCand.isPrimary,
            taggedBy: noResCand.taggedBy,
            confidence: Number(noResCand.classifierConfidence.toFixed(2)),
          })
        }
        break
      }
      var verifyResults = await fetchBatchResults(vStatus.results_url)
      console.log('  Got ' + verifyResults.length + ' verify result rows.')

      // Track which custom_ids returned a result so any missing ones
      // can be fail-open kept below.
      var seenCustomIds = new Set<string>()
      for (var vi = 0; vi < verifyResults.length; vi++) {
        var vrow = verifyResults[vi]
        seenCustomIds.add(vrow.custom_id)
        var vCand = candIndex.get(vrow.custom_id)
        if (!vCand) continue

        var vUsage = vrow.result?.message?.usage || {}
        var vCost =
          (vUsage.input_tokens || 0) / 1e6 * HAIKU_INPUT_BATCH +
          (vUsage.cache_creation_input_tokens || 0) / 1e6 * HAIKU_CACHE_WRITE_BATCH +
          (vUsage.cache_read_input_tokens || 0) / 1e6 * HAIKU_CACHE_READ_BATCH +
          (vUsage.output_tokens || 0) / 1e6 * HAIKU_OUTPUT_BATCH
        stats.cost += vCost

        logAiUsage('classifier-verify', sb, {
          model: HAIKU_MODEL,
          inputTokens: vUsage.input_tokens || 0,
          outputTokens: vUsage.output_tokens || 0,
          cacheCreationTokens: vUsage.cache_creation_input_tokens || 0,
          cacheReadTokens: vUsage.cache_read_input_tokens || 0,
          costUsd: vCost,
          reportId: vCand.reportId,
          status: vrow.result?.type === 'succeeded' ? 'completed' : 'failed',
        })

        // Parse verdict. Default 'uncertain' (= KEEP) on any failure.
        var verdict: 'yes' | 'no' | 'uncertain' = 'uncertain'
        var reasoning = ''
        if (vrow.result?.type === 'succeeded') {
          var vText = vrow.result.message?.content?.[0]?.text || ''
          try {
            var vCleaned = vText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
            var jS = vCleaned.indexOf('{')
            var jE = vCleaned.lastIndexOf('}')
            if (jS >= 0 && jE > jS) {
              var vParsed = JSON.parse(vCleaned.substring(jS, jE + 1))
              if (vParsed.match === 'yes' || vParsed.match === 'no' || vParsed.match === 'uncertain') {
                verdict = vParsed.match
              }
              reasoning = String(vParsed.reasoning || '')
            }
          } catch (_e) {}
        }

        if (verdict === 'no') {
          stats.verifierDropped++
          // Don't add the link — drop the candidate.
          continue
        }
        // 'yes' or 'uncertain' → KEEP.
        if (!reportLinks.has(vCand.reportId)) reportLinks.set(vCand.reportId, [])
        reportLinks.get(vCand.reportId)!.push({
          phenomenonId: vCand.phenomenonId,
          isPrimary: vCand.isPrimary,
          taggedBy: vCand.taggedBy,
          confidence: Number(vCand.classifierConfidence.toFixed(2)),
        })
      }

      // Fail-open for any candidate that didn't get a result row at
      // all (Anthropic dropped, queue truncation, etc.). Matches the
      // sync path's defensive default.
      for (var ck = 0; ck < chunk.length; ck++) {
        var missingId = chunk[ck].custom_id
        if (seenCustomIds.has(missingId)) continue
        var missingCand = candIndex.get(missingId)
        if (!missingCand) continue
        console.warn('  verify-batch missing result for ' + missingCand.phen.slug + ' / ' + missingCand.reportId.substring(0, 8) + ' — fail-open keeping')
        if (!reportLinks.has(missingCand.reportId)) reportLinks.set(missingCand.reportId, [])
        reportLinks.get(missingCand.reportId)!.push({
          phenomenonId: missingCand.phenomenonId,
          isPrimary: missingCand.isPrimary,
          taggedBy: missingCand.taggedBy,
          confidence: Number(missingCand.classifierConfidence.toFixed(2)),
        })
      }
      break
    }
  }
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
      .select('id, slug, name, aliases, ai_summary, category')
      .eq('status', 'active')
      .eq('category', category)
  )
  console.log('Phenomena in this category: ' + phenomena.length)
  if (phenomena.length === 0) {
    return { matched: 0, primaryOnly: 0, primaryPlusSecondaries: 0, nullMatched: 0, hallucinatedSlugs: 0, verifierDropped: 0, verifySkipped: 0, verifyBatched: 0, cost: 0, junctionWrites: 0, reportsUpdated: 0 }
  }
  // Lookup: slug → phenomena.id. The reports.phenomenon_type_id column
  // is FK'd to phenomena.id (constraint reports_phenomenon_type_id_fkey),
  // so we use the encyclopedia entry id directly — NOT the phenomena
  // table's own phenomenon_type_id column, which is almost always null.
  // V11.17.54 — slugLookup also carries phen metadata so the
  // tag-verification gate (see below) can build its Haiku prompt
  // without a per-call DB round-trip.
  const slugLookup = new Map<string, { phenomenonId: string; phen: Phenomenon }>()
  for (const p of phenomena) {
    slugLookup.set(p.slug, { phenomenonId: p.id, phen: p })
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
    return { matched: 0, primaryOnly: 0, primaryPlusSecondaries: 0, nullMatched: 0, hallucinatedSlugs: 0, verifierDropped: 0, verifySkipped: 0, verifyBatched: 0, cost: 0, junctionWrites: 0, reportsUpdated: 0 }
  }

  // V11.17.54 — build a report lookup so the verification gate can
  // pass the report body (title/summary/description) to verifyTag
  // when each batch result row comes back.
  const reportLookup = new Map<string, any>()
  for (const r of toClassify) reportLookup.set(r.id, r)

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
    return { matched: 0, primaryOnly: 0, primaryPlusSecondaries: 0, nullMatched: 0, hallucinatedSlugs: 0, verifierDropped: 0, verifySkipped: 0, verifyBatched: 0, cost: estTotal, junctionWrites: 0, reportsUpdated: 0 }
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
    hallucinatedSlugs: 0, verifierDropped: 0, verifySkipped: 0, verifyBatched: 0,
    cost: 0, junctionWrites: 0, reportsUpdated: 0,
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
        console.log('  Got ' + results.length + ' result rows. Parsing classifier output...')

        // V11.17.90 — Two-pass batched architecture.
        //
        // Pass 1 (this loop): parse classifier-primary results, resolve
        //   slugs → phen records, split candidates into:
        //     - autoAcceptCands : confidence >= VERIFY_SKIP_CONFIDENCE
        //       OR --no-verify-skip not set → straight to junction.
        //     - needsVerifyCands : low/mid confidence → second batch.
        // Pass 2 (after this loop): submit needsVerifyCands as a verify
        //   batch (50% off), then merge surviving verdicts back into
        //   the per-report link list and upsert.
        //
        // Per-report stats (matched / primaryOnly / nullMatched) are
        // finalized AFTER pass 2 so verify drops are accounted for.
        const reportLinks = new Map<string, Array<{ phenomenonId: string; isPrimary: boolean; taggedBy: string; confidence: number }>>()
        const autoAcceptCands: PendingCandidate[] = []
        const needsVerifyCands: PendingCandidate[] = []
        // Track reports the classifier processed (even if null) so we
        // can compute null-match correctly at the end.
        const classifierProcessed = new Set<string>()

        for (const row of results) {
          if (row.result?.type !== 'succeeded') continue
          classifierProcessed.add(row.custom_id)
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
          const rowCost =
            (usage.input_tokens || 0) / 1e6 * HAIKU_INPUT_BATCH +
            (usage.cache_creation_input_tokens || 0) / 1e6 * HAIKU_CACHE_WRITE_BATCH +
            (usage.cache_read_input_tokens || 0) / 1e6 * HAIKU_CACHE_READ_BATCH +
            (usage.output_tokens || 0) / 1e6 * HAIKU_OUTPUT_BATCH
          stats.cost += rowCost

          // V11.17.84 — unified cost log. Each batch result row gets
          // its own ledger entry so the daily cost-summary endpoint
          // can attribute spend to the classifier path. classify-
          // phenomena-batch processes ~100k reports per drain and was
          // previously unlogged — a major contributor to the missing
          // $590 in the June 1–5 reconciliation.
          logAiUsage('classifier-primary', sb, {
            model: HAIKU_MODEL,
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            cacheCreationTokens: usage.cache_creation_input_tokens || 0,
            cacheReadTokens: usage.cache_read_input_tokens || 0,
            costUsd: rowCost,
            reportId: row.custom_id || null,
            status: 'completed',
          })

          // V11.17.90 — Tolerant parser for both old + new output
          // shapes. Old format: primary = "slug-string". New format:
          // primary = {slug, confidence}. Either shape resolves to
          // (slug, confidence) below.
          if (!parsed) continue
          const primaryEntry = normalizeClassifierEntry(parsed.primary)
          const secondaryEntries: Array<{ slug: string; confidence: number }> = Array.isArray(parsed.secondary)
            ? parsed.secondary.map(normalizeClassifierEntry).filter(Boolean).slice(0, 2) as any
            : []
          if (!primaryEntry && secondaryEntries.length === 0) continue

          // Resolve slugs → phenomenon_ids. Drop hallucinated.
          const reportCands: PendingCandidate[] = []
          if (primaryEntry) {
            const lookup = slugLookup.get(primaryEntry.slug)
            if (lookup) {
              reportCands.push({
                reportId: row.custom_id,
                phenomenonId: lookup.phenomenonId,
                isPrimary: true,
                taggedBy: 'ai_primary',
                phen: lookup.phen,
                classifierConfidence: primaryEntry.confidence,
              })
            } else {
              stats.hallucinatedSlugs++
            }
          }
          for (const sEntry of secondaryEntries) {
            const lookup = slugLookup.get(sEntry.slug)
            if (lookup) {
              reportCands.push({
                reportId: row.custom_id,
                phenomenonId: lookup.phenomenonId,
                isPrimary: false,
                taggedBy: 'ai_secondary',
                phen: lookup.phen,
                classifierConfidence: sEntry.confidence,
              })
            } else {
              stats.hallucinatedSlugs++
            }
          }

          // V11.17.90 — Split by classifier confidence. The verify gate
          // is the V11.17.54 hallucination safety net; keeping it on
          // for low/mid confidence preserves the original protection
          // exactly. Skipping it on high-confidence candidates is the
          // cost win.
          for (const cand of reportCands) {
            if (args.noVerifySkip) {
              needsVerifyCands.push(cand)
            } else if (cand.classifierConfidence >= VERIFY_SKIP_CONFIDENCE) {
              autoAcceptCands.push(cand)
              stats.verifySkipped++
            } else {
              needsVerifyCands.push(cand)
            }
          }
        }

        // Pre-record auto-accepted links so they appear in the report
        // even if pass 2 fails for some reason.
        for (const cand of autoAcceptCands) {
          if (!reportLinks.has(cand.reportId)) reportLinks.set(cand.reportId, [])
          reportLinks.get(cand.reportId)!.push({
            phenomenonId: cand.phenomenonId,
            isPrimary: cand.isPrimary,
            taggedBy: cand.taggedBy,
            // V11.17.90 — use the classifier's own confidence for the
            // junction row so downstream consumers see the gradient.
            confidence: Number(cand.classifierConfidence.toFixed(2)),
          })
        }

        console.log('  Classifier parsed: ' + classifierProcessed.size + ' reports, '
          + autoAcceptCands.length + ' auto-accept (conf≥' + VERIFY_SKIP_CONFIDENCE + '), '
          + needsVerifyCands.length + ' need verify')

        // V11.17.90 — Pass 2: batched verification.
        //
        // Submit a SECOND Anthropic Batch API request containing one
        // message per candidate that needs the safety check. The
        // verify prompt comes from buildVerifyPrompt() in
        // tag-verification.service.ts — same wording the sync
        // verifyTag() uses, so verdicts stay drop-in compatible with
        // engine.ts.
        //
        // Fail-open behavior: any candidate whose verify result is
        // missing / unparseable / errored is KEPT (treated as
        // 'uncertain'), matching the sync path's defensive default.
        if (needsVerifyCands.length > 0) {
          await runVerifyBatch(sb, needsVerifyCands, reportLookup, reportLinks, stats, args)
        }

        // Pass 3: persist final links + classify match accounting.
        // Note: Array.from() instead of `for ... of Set` so tsconfig's
        // ES2015 target setting doesn't require --downlevelIteration.
        const processedIds = Array.from(classifierProcessed)
        for (const reportId of processedIds) {
          const links = reportLinks.get(reportId) || []
          if (links.length === 0) {
            stats.nullMatched++
            continue
          }
          stats.matched++
          if (links.length === 1 && links[0].isPrimary) stats.primaryOnly++
          else if (links.length > 1) stats.primaryPlusSecondaries++

          for (const link of links) {
            const ins = await sb.from('report_phenomena').upsert({
              report_id: reportId,
              phenomenon_id: link.phenomenonId,
              is_primary: link.isPrimary,
              tagged_by: link.taggedBy,
              confidence: link.confidence,
            }, { onConflict: 'report_id,phenomenon_id' })
            if (!ins.error) stats.junctionWrites++
          }
        }
        // Note: reports.phenomenon_type_id is NOT updated — its FK
        // targets phenomenon_types.id (a separate legacy table) and
        // most phenomena rows don't have a phenomenon_type_id mapping.
        // The encyclopedia page now reads from report_phenomena.
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
  console.log('  Verify-skipped (high conf):        ' + stats.verifySkipped + ' (V11.17.90)')
  console.log('  Verify-batched (low/mid conf):     ' + stats.verifyBatched + ' (V11.17.90)')
  console.log('  Verifier-dropped tags:             ' + stats.verifierDropped)
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

  console.log('=== Phenomenon classifier — V11.15.2 + V11.17.54 tag-verification gate ===')
  console.log('Dry run:        ' + args.dryRun)
  console.log('Per-cat limit:  ' + (args.limit > 0 ? args.limit : 'no limit'))

  const cats = args.all ? CATEGORIES : [args.category!]
  const grand: PersistStats = {
    matched: 0, primaryOnly: 0, primaryPlusSecondaries: 0, nullMatched: 0,
    hallucinatedSlugs: 0, verifierDropped: 0, verifySkipped: 0, verifyBatched: 0,
    cost: 0, junctionWrites: 0, reportsUpdated: 0,
  }

  for (const cat of cats) {
    const res = await classifyCategory(sb, cat, args)
    grand.matched += res.matched
    grand.primaryOnly += res.primaryOnly
    grand.primaryPlusSecondaries += res.primaryPlusSecondaries
    grand.nullMatched += res.nullMatched
    grand.hallucinatedSlugs += res.hallucinatedSlugs
    grand.verifierDropped += res.verifierDropped
    grand.verifySkipped += res.verifySkipped
    grand.verifyBatched += res.verifyBatched
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
  console.log('Verify-skipped (high conf):       ' + grand.verifySkipped + ' (V11.17.90)')
  console.log('Verify-batched (low/mid conf):    ' + grand.verifyBatched + ' (V11.17.90)')
  console.log('Verifier-dropped tags:            ' + grand.verifierDropped)
  console.log('Junction rows written:            ' + grand.junctionWrites)
  console.log('Reports.phenomenon_type_id set:   ' + grand.reportsUpdated)
  console.log('Total cost:                       $' + grand.cost.toFixed(4))
  if (grand.matched > 0) {
    console.log('Avg per matched report:           $' + (grand.cost / (grand.matched + grand.nullMatched)).toFixed(6))
  }
}

main().catch(function(e) { console.error('Fatal:', e?.message || e); process.exit(1) })
