#!/usr/bin/env tsx
/**
 * V11.14 — Batch AI worker
 *
 * Uses Anthropic's Message Batches API (50% discount, 24h max latency)
 * to run consolidated Haiku calls on a backlog of reports that need AI
 * generation. Cuts per-report cost from ~$0.005-0.007 down to
 * ~$0.0025-0.0035.
 *
 * Modes:
 *   --backfill          (default) Find reports with status='pending_review'
 *                       AND paradocs_narrative IS NULL, batch them.
 *                       Useful for retrofitting accumulated pending queue
 *                       at 50% off.
 *   --status <s>        Override the status filter (default 'pending_review').
 *                       Common alternatives: 'approved' (re-run on already-
 *                       approved reports), 'rejected' (give them another
 *                       chance via batch).
 *   --limit <n>         Max reports per batch (default 100; max 100,000).
 *   --dry-run           Show what WOULD be submitted but don't actually
 *                       call the API. Prints estimated cost.
 *   --poll-interval <s> Seconds between status polls (default 30).
 *   --max-wait <s>      Max time to wait for batch to complete
 *                       (default 3600 = 1 hour). If batch isn't ready,
 *                       prints the batch_id so you can resume later.
 *   --resume <batch_id> Skip submission; just poll an existing batch.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/batch-ingest-worker.ts --backfill --limit 50
 *   tsx scripts/batch-ingest-worker.ts --resume msgbatch_01abc...
 *
 * Daily cost cap:
 *   This worker respects PARADOCS_MASS_INGEST_DAILY_CAP env var
 *   (default $200/day). If today's batch spend exceeds the cap, no
 *   new batches are submitted; existing in-flight batches continue.
 *
 * Cost log:
 *   Each completed report writes to paradocs_narrative_cost_log with
 *   model marked '(consolidated-batch)' for easy filtering. cost_usd
 *   reflects the 50% batch discount.
 */

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import {
  CONSOLIDATED_SYSTEM_PROMPT,
  buildConsolidatedUserPrompt,
  persistConsolidatedResult,
} from '../src/lib/services/consolidated-ai.service'
import { findMetaInAiOutput } from '../src/lib/ingestion/filters/meta-commentary-detector'

// ─────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────

var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY missing from env. Source .env.local first.')
  process.exit(1)
}

var HAIKU_MODEL = 'claude-haiku-4-5-20251001'
var MAX_TOKENS = 2500
var TEMPERATURE = 0.4

// Anthropic pricing (Haiku 4.5) — batch API gets 50% off
var HAIKU_INPUT_USD_PER_M_BATCH = 0.5
var HAIKU_OUTPUT_USD_PER_M_BATCH = 2.5
var HAIKU_CACHE_WRITE_BATCH = 0.625    // 1.25 × 0.5
var HAIKU_CACHE_READ_BATCH = 0.05      // 0.10 × 0.5

var BATCH_API_URL = 'https://api.anthropic.com/v1/messages/batches'

// ─────────────────────────────────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  backfill: boolean
  status: string
  limit: number
  dryRun: boolean
  pollIntervalSec: number
  maxWaitSec: number
  resumeBatchId: string | null
  noClassify: boolean
  offset: number  // V11.17.63 — for parallel-drain partitioning
}

function parseArgs(argv: string[]): CliArgs {
  var args: CliArgs = {
    backfill: true,
    status: 'pending_review',
    limit: 100,
    dryRun: false,
    pollIntervalSec: 30,
    maxWaitSec: 3600,
    resumeBatchId: null,
    noClassify: false,
    offset: 0,
  }
  for (var i = 2; i < argv.length; i++) {
    var a = argv[i]
    if (a === '--backfill') args.backfill = true
    else if (a === '--status') { args.status = argv[++i] }
    else if (a === '--limit') { args.limit = parseInt(argv[++i], 10) || 100 }
    else if (a === '--offset') { args.offset = parseInt(argv[++i], 10) || 0 }
    else if (a === '--dry-run') { args.dryRun = true }
    else if (a === '--poll-interval') { args.pollIntervalSec = parseInt(argv[++i], 10) || 30 }
    else if (a === '--max-wait') { args.maxWaitSec = parseInt(argv[++i], 10) || 3600 }
    else if (a === '--resume') { args.resumeBatchId = argv[++i]; args.backfill = false }
    else if (a === '--no-classify') { args.noClassify = true }
    else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/batch-ingest-worker.ts [--backfill] [--status <s>] [--limit <n>] [--offset <n>] [--dry-run] [--poll-interval <s>] [--max-wait <s>] [--resume <batch_id>]')
      process.exit(0)
    }
  }
  return args
}

// ─────────────────────────────────────────────────────────────────────
// DAILY COST CAP (mass-ingest specific)
// ─────────────────────────────────────────────────────────────────────

function getMassIngestDailyCap(): number {
  var raw = process.env.PARADOCS_MASS_INGEST_DAILY_CAP
  if (!raw) return 200.0
  var n = parseFloat(raw)
  return isNaN(n) || n < 0 ? 200.0 : n
}

async function getTodaysBatchSpend(supabase: any): Promise<number> {
  try {
    var todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    var result = await supabase
      .from('paradocs_narrative_cost_log')
      .select('cost_usd, model')
      .gte('created_at', todayStart.toISOString())
    if (result.error || !result.data) return 0
    var total = 0
    result.data.forEach(function (r: any) {
      // Only count batch entries against the mass-mode cap; live
      // single-shot calls are accounted under the separate $50/day cap.
      if (r.model && String(r.model).indexOf('batch') !== -1) {
        total += parseFloat(r.cost_usd || 0)
      }
    })
    return total
  } catch (_e) {
    return 0
  }
}

// ─────────────────────────────────────────────────────────────────────
// BATCH SUBMISSION
// ─────────────────────────────────────────────────────────────────────

interface BatchRequest {
  custom_id: string
  params: {
    model: string
    max_tokens: number
    system: Array<{ type: string; text: string; cache_control?: { type: string } }>
    messages: Array<{ role: string; content: string }>
    temperature: number
  }
}

// V11.17.77 — Unicode surrogate-pair sanitizer.
// Reddit (and some YouTube) ingest occasionally carries orphan UTF-16
// surrogate halves in report text — a high surrogate (U+D800–U+DBFF)
// without its required low surrogate (U+DC00–U+DFFF), or vice versa.
// JSON.stringify happily serializes these as \uD83D etc., but Anthropic's
// JSON parser rejects the entire batch with:
//   "no low surrogate in string: line 1 column X"
// One bad character in a 5,000-report batch kills all 5,000. This
// sanitizer strips orphan halves before serialization. Well-formed
// surrogate pairs (valid emoji, CJK supplementary, etc.) are preserved.
function stripLoneSurrogates(s: string | null | undefined): string {
  if (s == null) return ''
  return s
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

function sanitizeReportForBatch(report: any): any {
  // Defensive clone — never mutate the caller's report object.
  var clean: any = Object.assign({}, report)
  var fields = ['title', 'summary', 'description', 'location_name',
                'country', 'state_province', 'city', 'source_label']
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i]
    if (typeof clean[f] === 'string') {
      clean[f] = stripLoneSurrogates(clean[f])
    }
  }
  // tags is string[]; sanitize each.
  if (Array.isArray(clean.tags)) {
    clean.tags = clean.tags.map(function (t: any) {
      return typeof t === 'string' ? stripLoneSurrogates(t) : t
    })
  }
  return clean
}

function buildBatchRequest(report: any): BatchRequest {
  var safeReport = sanitizeReportForBatch(report)
  return {
    custom_id: safeReport.id,
    params: {
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: CONSOLIDATED_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: buildConsolidatedUserPrompt(safeReport) }],
      temperature: TEMPERATURE,
    },
  }
}

// V11.17.81 — orphan-surrogate strippers used by submitBatch().
//
// stripOrphanSurrogatesString: walks a string's UTF-16 code units, drops
// any orphan high (D800-DBFF) or low (DC00-DFFF) surrogate, preserves
// well-formed pairs intact.
function stripOrphanSurrogatesString(s: string): string {
  var out = ''
  for (var i = 0; i < s.length; i++) {
    var code = s.charCodeAt(i)
    // high surrogate
    if (code >= 0xD800 && code <= 0xDBFF) {
      var next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0
      if (next >= 0xDC00 && next <= 0xDFFF) {
        out += s[i] + s[i + 1]
        i++
      }
      // else: orphan high — drop
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      // orphan low — drop
    } else {
      out += s[i]
    }
  }
  return out
}

// deepStripOrphanSurrogates: recursively walks any JSON-serializable value
// and sanitizes every string. Arrays / plain objects are cloned with
// sanitized children. Other values pass through unchanged.
function deepStripOrphanSurrogates(v: any): any {
  if (v == null) return v
  if (typeof v === 'string') return stripOrphanSurrogatesString(v)
  if (Array.isArray(v)) return v.map(deepStripOrphanSurrogates)
  if (typeof v === 'object') {
    var out: any = {}
    for (var k in v) {
      if (Object.prototype.hasOwnProperty.call(v, k)) {
        out[k] = deepStripOrphanSurrogates(v[k])
      }
    }
    return out
  }
  return v
}

// stripOrphanSurrogateEscapes: defensive second pass on the serialized
// JSON text. JSON.stringify emits orphan surrogates as literal "\uXXXX"
// escape sequences. Strip orphan high-surrogate escapes (not followed by
// a low-surrogate escape) and orphan low-surrogate escapes (not preceded
// by a high-surrogate escape).
function stripOrphanSurrogateEscapes(json: string): string {
  return json
    .replace(/\\u[dD][89aAbB][0-9a-fA-F]{2}(?!\\u[dD][cCdDeEfF][0-9a-fA-F]{2})/g, '')
    .replace(/(?<!\\u[dD][89aAbB][0-9a-fA-F]{2})\\u[dD][cCdDeEfF][0-9a-fA-F]{2}/g, '')
}

async function submitBatch(requests: BatchRequest[]): Promise<{ batch_id: string } | { error: string }> {
  // V11.17.81 — Unicode sanitization, finally correct.
  //
  // What I got wrong in V11.17.80:
  //   JSON.stringify SERIALIZES orphan surrogates as ASCII escape sequences
  //   (literal text "\uD800") in the output, NOT as raw UTF-16 code units.
  //   So my prior regex that looked for code-unit surrogates in the post-
  //   stringify string never matched. Same column number error every run
  //   because the orphan slipped through unscathed.
  //
  // Two-layer fix that's actually correct:
  //   1. Deep-sanitize EVERY string value in the request tree before
  //      JSON.stringify. Recursive walk, regardless of field name. This
  //      catches orphans before they have a chance to be escaped.
  //   2. Post-stringify, also strip any remaining orphan ESCAPE SEQUENCES
  //      (literal "\uXXXX" text) — defensive coverage in case a string
  //      somehow gets reinterpreted between sanitize and stringify.
  var cleanRequests = deepStripOrphanSurrogates(requests)
  var bodyStr = JSON.stringify({ requests: cleanRequests })
  bodyStr = stripOrphanSurrogateEscapes(bodyStr)

  var resp = await fetch(BATCH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
    body: bodyStr,
  })

  if (!resp.ok) {
    var errText = await resp.text().catch(function () { return '' })
    return { error: 'submit ' + resp.status + ': ' + errText.substring(0, 500) }
  }
  var data = await resp.json()
  if (!data.id) return { error: 'response missing id field' }
  return { batch_id: data.id }
}

interface BatchStatus {
  id: string
  processing_status: 'in_progress' | 'canceling' | 'ended'
  request_counts: {
    processing: number
    succeeded: number
    errored: number
    canceled: number
    expired: number
  }
  results_url: string | null
  ended_at: string | null
}

async function getBatchStatus(batchId: string): Promise<BatchStatus | { error: string }> {
  var resp = await fetch(BATCH_API_URL + '/' + batchId, {
    method: 'GET',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
  })
  if (!resp.ok) {
    var errText = await resp.text().catch(function () { return '' })
    return { error: 'status ' + resp.status + ': ' + errText.substring(0, 300) }
  }
  return await resp.json()
}

interface BatchResultRow {
  custom_id: string
  result: {
    type: 'succeeded' | 'errored' | 'canceled' | 'expired'
    message?: any
    error?: { type: string; message: string }
  }
}

async function fetchBatchResults(resultsUrl: string): Promise<BatchResultRow[]> {
  var resp = await fetch(resultsUrl, {
    method: 'GET',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
  })
  if (!resp.ok) {
    throw new Error('results fetch ' + resp.status)
  }
  // Results come back as JSONL (one JSON object per line)
  var text = await resp.text()
  var rows: BatchResultRow[] = []
  var lines = text.split('\n')
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (!line) continue
    try {
      rows.push(JSON.parse(line))
    } catch (e) {
      console.warn('Skipping unparseable result line: ' + line.substring(0, 100))
    }
  }
  return rows
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function main() {
  var args = parseArgs(process.argv)

  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  var supabase = createClient(supabaseUrl, supabaseKey)

  // ── Cost cap pre-check ────────────────────────────────────────
  var dailyCap = getMassIngestDailyCap()
  var todaysSpend = await getTodaysBatchSpend(supabase)
  console.log('=== Batch worker ===')
  console.log('Daily cap (mass-mode): $' + dailyCap.toFixed(2))
  console.log('Today\'s batch spend:  $' + todaysSpend.toFixed(4))
  console.log('Remaining headroom:   $' + (dailyCap - todaysSpend).toFixed(4))
  if (!args.resumeBatchId && todaysSpend >= dailyCap) {
    console.error('Daily cap reached. Wait until tomorrow, raise PARADOCS_MASS_INGEST_DAILY_CAP, or pass --resume to finish an existing batch.')
    process.exit(2)
  }

  // ── Resume mode: skip submission, jump to polling ──────────────
  var batchId: string
  var submittedReports: Map<string, any> = new Map()

  if (args.resumeBatchId) {
    batchId = args.resumeBatchId
    console.log('\nResuming existing batch: ' + batchId)
    // We can't reconstruct the submitted reports without re-querying;
    // the report data is fetched per-result during persistence below.
  } else {
    // ── Backfill mode: query reports needing AI ──────────────────
    // V11.17.63 — pagination via .range() for parallel-drain partitioning.
    // Stable ordering (created_at + id) ensures different offset workers
    // see disjoint row sets without racing.
    var rangeStart = args.offset
    var rangeEnd = args.offset + args.limit - 1
    console.log('\nQuerying reports with status=\'' + args.status + '\' AND paradocs_narrative IS NULL ' +
                '(offset=' + args.offset + ' limit=' + args.limit + ' range=[' + rangeStart + ',' + rangeEnd + '])...')
    var q = supabase
      .from('reports')
      .select('id, title, summary, description, category, location_name, country, state_province, city, event_date, source_type, source_label, tags')
      .eq('status', args.status)
      .is('paradocs_narrative', null)
      // V11.18.24 — QC-hold guard. Rows flagged for founder review by
      // pd-bulk-approve (metadata.qc_flag) must NOT be swept up by the
      // backfill's pending_review auto-promote path (Path B) — they stay
      // held until a human approves them, at which point a later
      // --status approved pass generates their AI fields.
      .is('metadata->qc_flag', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeStart, rangeEnd)
    var qres = await q
    if (qres.error) {
      console.error('DB query failed: ' + qres.error.message)
      process.exit(1)
    }
    var reports = (qres.data || []) as any[]
    console.log('Found ' + reports.length + ' reports needing AI generation.')
    if (reports.length === 0) {
      console.log('Nothing to do. Exiting.')
      return
    }
    reports.forEach(function (r) { submittedReports.set(r.id, r) })

    // ── Build batch requests ──────────────────────────────────────
    var requests: BatchRequest[] = reports.map(function (r) { return buildBatchRequest(r) })

    // ── Dry-run estimate ──────────────────────────────────────────
    if (args.dryRun) {
      var estSystemTokens = Math.ceil(CONSOLIDATED_SYSTEM_PROMPT.length / 4)
      var avgUserTokens = 1500
      var avgOutputTokens = 1100
      var estCostFirst =
        avgUserTokens / 1e6 * HAIKU_INPUT_USD_PER_M_BATCH +
        estSystemTokens / 1e6 * HAIKU_CACHE_WRITE_BATCH +
        avgOutputTokens / 1e6 * HAIKU_OUTPUT_USD_PER_M_BATCH
      var estCostCached =
        avgUserTokens / 1e6 * HAIKU_INPUT_USD_PER_M_BATCH +
        estSystemTokens / 1e6 * HAIKU_CACHE_READ_BATCH +
        avgOutputTokens / 1e6 * HAIKU_OUTPUT_USD_PER_M_BATCH
      var estTotal = estCostFirst + estCostCached * (reports.length - 1)
      console.log('\n=== DRY RUN ===')
      console.log('Would submit ' + reports.length + ' requests')
      console.log('Estimated system tokens (per request, cached): ~' + estSystemTokens)
      console.log('Estimated user tokens (avg):                   ~' + avgUserTokens)
      console.log('Estimated output tokens (avg):                 ~' + avgOutputTokens)
      console.log('Estimated cost (first request, cache write):   $' + estCostFirst.toFixed(5))
      console.log('Estimated cost (subsequent, cache read):       $' + estCostCached.toFixed(5))
      console.log('Estimated TOTAL batch cost:                    $' + estTotal.toFixed(4))
      console.log('Estimated avg per report:                      $' + (estTotal / reports.length).toFixed(5))
      console.log('Daily cap headroom after this batch:           $' + (dailyCap - todaysSpend - estTotal).toFixed(4))
      console.log('\nRun without --dry-run to actually submit.')
      return
    }

    // ── Submit batch ──────────────────────────────────────────────
    console.log('\nSubmitting batch of ' + requests.length + ' requests...')
    var submitRes = await submitBatch(requests)
    if ('error' in submitRes) {
      console.error('Batch submission failed: ' + submitRes.error)
      process.exit(1)
    }
    batchId = submitRes.batch_id
    console.log('Submitted. batch_id: ' + batchId)
    console.log('You can resume polling later with: --resume ' + batchId)
  }

  // ── Poll for completion ───────────────────────────────────────
  var startTime = Date.now()
  var maxWaitMs = args.maxWaitSec * 1000
  var pollIntervalMs = args.pollIntervalSec * 1000
  console.log('\nPolling for batch completion (every ' + args.pollIntervalSec + 's, max ' + args.maxWaitSec + 's)...')
  var lastCounts: any = null
  while (true) {
    if (Date.now() - startTime > maxWaitMs) {
      console.warn('\nMax wait time reached. Batch is still processing.')
      console.warn('Resume later with: --resume ' + batchId)
      process.exit(3)
    }
    await new Promise(function (resolve) { setTimeout(resolve, pollIntervalMs) })
    var status = await getBatchStatus(batchId)
    if ('error' in status) {
      console.warn('Poll error: ' + status.error + ' — will retry')
      continue
    }
    var counts = status.request_counts
    var elapsed = Math.round((Date.now() - startTime) / 1000)
    // V11.14.5 — Always print a heartbeat each poll cycle, with a
    // (no change) tag when counts didn't move. Anthropic batches
    // typically sit at "all processing" for the first 5-15 min,
    // during which the old code printed nothing and the terminal
    // looked dead. Heartbeat gives the user confidence the worker
    // is alive.
    var changed = !lastCounts || JSON.stringify(counts) !== JSON.stringify(lastCounts)
    console.log('  [+' + elapsed + 's] status=' + status.processing_status + '  processing=' + counts.processing + '  succeeded=' + counts.succeeded + '  errored=' + counts.errored + (changed ? '' : '  (no change)'))
    lastCounts = counts
    if (status.processing_status === 'ended') {
      console.log('\nBatch complete!')
      console.log('  succeeded: ' + counts.succeeded)
      console.log('  errored:   ' + counts.errored)
      console.log('  canceled:  ' + counts.canceled)
      console.log('  expired:   ' + counts.expired)
      if (!status.results_url) {
        console.error('Batch ended but results_url is null. Check Anthropic console.')
        process.exit(1)
      }
      // ── Fetch and persist results ──────────────────────────────
      console.log('\nFetching results...')
      var rows = await fetchBatchResults(status.results_url)
      console.log('Got ' + rows.length + ' result rows. Persisting...')

      var stats = { succeeded: 0, parse_failed: 0, save_failed: 0, errored: 0, totalCost: 0 }

      for (var i = 0; i < rows.length; i++) {
        var row = rows[i]
        var reportId = row.custom_id
        if (row.result.type !== 'succeeded') {
          stats.errored++
          console.warn('  ✗ ' + reportId + ' (' + row.result.type + ')' + (row.result.error ? ' ' + row.result.error.message : ''))
          await logBatchCost(supabase, reportId, null, null, null, null, 0, 'failed', row.result.type)
          continue
        }
        var msg = row.result.message
        var rawText = msg && msg.content && msg.content[0] && msg.content[0].text
        if (!rawText) {
          stats.parse_failed++
          await logBatchCost(supabase, reportId, msg, null, null, null, 0, 'parse_failed', 'no_content')
          continue
        }
        var parsed: any = null
        try {
          var cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
          var jsonStart = cleaned.indexOf('{')
          var jsonEnd = cleaned.lastIndexOf('}')
          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            parsed = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1))
          }
        } catch (parseErr: any) {
          console.warn('  ✗ ' + reportId + ' JSON parse failed: ' + (parseErr.message || parseErr))
        }
        if (!parsed) {
          stats.parse_failed++
          await logBatchCost(supabase, reportId, msg, null, null, null, 0, 'parse_failed', 'json_parse')
          continue
        }
        // Compute batch-discounted cost from usage
        var u = msg.usage || {}
        var inTok = u.input_tokens || 0
        var outTok = u.output_tokens || 0
        var cWrite = u.cache_creation_input_tokens || 0
        var cRead = u.cache_read_input_tokens || 0
        var costUsd =
          inTok / 1e6 * HAIKU_INPUT_USD_PER_M_BATCH +
          cWrite / 1e6 * HAIKU_CACHE_WRITE_BATCH +
          cRead / 1e6 * HAIKU_CACHE_READ_BATCH +
          outTok / 1e6 * HAIKU_OUTPUT_USD_PER_M_BATCH
        stats.totalCost += costUsd

        // Fetch report (needed for fallback title + category + V11.14
        // auto-promote check via metadata.score_status)
        var existing = submittedReports.get(reportId)
        var reportCategory: string | null = null
        var fallbackTitle: string | null = null
        var reportMetadata: any = null
        if (existing) {
          reportCategory = existing.category
          fallbackTitle = existing.title
          reportMetadata = (existing as any).metadata
        }
        // Always re-fetch metadata from DB — submittedReports cache
        // doesn't carry it.
        try {
          var f = await (supabase.from('reports') as any).select('category, title, metadata').eq('id', reportId).single()
          if (f.data) {
            if (!reportCategory) reportCategory = f.data.category
            if (!fallbackTitle) fallbackTitle = f.data.title
            reportMetadata = f.data.metadata
          }
        } catch (_e) { /* non-fatal — fall back to whatever we had */ }

        // Persist via shared helper
        var saved = await persistConsolidatedResult(
          supabase,
          reportId,
          parsed,
          reportCategory,
          fallbackTitle,
          'consolidated-batch',
        )
        if (!saved.ok) {
          stats.save_failed++
          await logBatchCost(supabase, reportId, msg, inTok, outTok, cWrite, costUsd, 'failed', 'db_save')
          console.warn('  ✗ ' + reportId + ' save failed: ' + saved.error)
          continue
        }

        await logBatchCost(supabase, reportId, msg, inTok, outTok, cWrite, costUsd, 'completed', null)
        stats.succeeded++

        // V11.17.46 — Anomaly content gate (batch path).
        //
        // persistConsolidatedResult just wrote
        // paradocs_assessment.anomalous_content_check from the SAME Haiku
        // call (see consolidated-ai.service.ts ~L727). Mirror the
        // two-tier demotion logic that engine.ts applies on the live
        // ingestion path (engine.ts ~L1513, V11.17.41) so batch-ingested
        // rows get the same gate as live-ingested rows. Without this
        // check, anomalous='no' content from Reddit batch jobs auto-
        // promotes to 'approved' in Path B below.
        //
        // Two tiers:
        //   anomalous='no' AND confidence >= 0.9 → status='archived'
        //     (Haiku is unambiguous — keep out of admin queue entirely)
        //   anomalous='no' AND 0.7 <= confidence < 0.9 → leave at
        //     pending_review (do NOT auto-promote in Path B)
        //   otherwise → fall through to normal Path A/B/C logic
        //
        // Re-fetches paradocs_assessment because persistConsolidatedResult
        // wrote it to a JSONB column and we don't have an in-memory copy
        // of the normalized shape here. Best-effort: a failed read leaves
        // the row to fall through to Path B (matches engine.ts behavior).
        var anomalyAutoArchive = false
        var anomalyKeepPending = false
        try {
          var assessRes = await (supabase.from('reports') as any)
            .select('paradocs_assessment, metadata')
            .eq('id', reportId)
            .single()
          var acRaw = assessRes.data && assessRes.data.paradocs_assessment
            ? (assessRes.data.paradocs_assessment as any).anomalous_content_check
            : null
          // V11.18.25 — public-domain historical sources demote to
          // pending_review instead of silently archiving. The gate's
          // 'news_summary' genre is calibrated on firsthand web posts;
          // period newspaper/book material is INHERENTLY third-person
          // reportage, so the gate systematically over-archives genuine
          // witness-sighting reports from these sources (June 12: 319 of
          // 762 CA rows culled, ~half wrongly). A human (or the triage
          // pass) makes the final call from the review queue.
          var isPdSource = !!(assessRes.data && assessRes.data.metadata && assessRes.data.metadata.public_domain === true)
          if (acRaw && typeof acRaw === 'object') {
            var acAnomalous = typeof acRaw.anomalous === 'string' ? acRaw.anomalous : null
            var acConfidence = typeof acRaw.confidence === 'number' ? acRaw.confidence : 0
            var acGenre = typeof acRaw.genre === 'string' ? acRaw.genre : ''
            // V11.17.100 — anomaly gate tightening. Auto-archive cutoff
            // lowered 0.9 → 0.75 to match the sharper V11.17.100 Haiku
            // prompt calibration (clear-mundane cases now land at
            // 0.80-0.95 with worked examples covering loud-boom alone,
            // missing-time keepers, paired-chill keepers).
            if (acAnomalous === 'no' && acConfidence >= 0.75 && isPdSource) {
              // V11.18.25 — PD-source demotion path (see comment above).
              anomalyKeepPending = true
              try {
                var meta = (assessRes.data && assessRes.data.metadata) || {}
                var qcFlags = Array.isArray(meta.qc_flag) ? meta.qc_flag : []
                if (qcFlags.indexOf('anomaly_gate_review') < 0) qcFlags.push('anomaly_gate_review')
                await (supabase.from('reports') as any)
                  .update({ status: 'pending_review', metadata: Object.assign({}, meta, { qc_flag: qcFlags }), updated_at: new Date().toISOString() })
                  .eq('id', reportId)
                console.log('  • ' + reportId + ' demoted to pending_review (anomaly gate, PD source — genre=' + (acGenre || 'unspecified') + ' conf=' + acConfidence.toFixed(2) + ')')
              } catch (demoteErr: any) {
                console.warn('  ! ' + reportId + ' anomaly demote failed: ' + (demoteErr?.message || demoteErr))
              }
            } else if (acAnomalous === 'no' && acConfidence >= 0.75) {
              anomalyAutoArchive = true
              try {
                var archiveRes = await (supabase.from('reports') as any)
                  .update({ status: 'archived', updated_at: new Date().toISOString() })
                  .eq('id', reportId)
                if (!archiveRes.error) {
                  console.log('  ↓ ' + reportId + ' auto-archived (V11.17.100 anomaly gate — genre=' + (acGenre || 'unspecified') + ' conf=' + acConfidence.toFixed(2) + ')')
                }
              } catch (archiveErr: any) {
                console.warn('  ! ' + reportId + ' anomaly auto-archive failed: ' + (archiveErr?.message || archiveErr))
              }
            } else if (acAnomalous === 'no' && acConfidence >= 0.7 && acConfidence < 0.75) {
              anomalyKeepPending = true
              console.log('  • ' + reportId + ' kept at pending_review (V11.17.100 anomaly gate — genre=' + (acGenre || 'unspecified') + ' conf=' + acConfidence.toFixed(2) + ')')
            }
          }
        } catch (anomalyErr: any) {
          console.log('  ! ' + reportId + ' anomaly gate check failed (non-fatal): ' + (anomalyErr?.message || anomalyErr))
        }

        // V11.14 — Status transition after AI completes:
        //
        //   A) AI returned INSUFFICIENT (model couldn't make sense of
        //      the post) → status='rejected'. Don't pollute admin queue
        //      with placeholder rows. This catches edge cases where
        //      the quality filter let something through but the model
        //      itself rejected it on substance.
        //
        //   B) metadata.score_status='approved' AND narrative + pull
        //      quote populated → status='approved' (auto-publish). This
        //      is the hot path: a clean ingestion lands on the public
        //      site without admin involvement.
        //
        //   C) Otherwise (borderline score_status='pending_review')
        //      stays at pending_review for admin curation.
        var scoreStatus = reportMetadata && reportMetadata.score_status
        var hasNarrative = !!(parsed.analysis && String(parsed.analysis).trim().length > 0 && parsed.analysis !== 'INSUFFICIENT')
        var hasPullQuote = !!(parsed.pull_quote && String(parsed.pull_quote).trim().length > 0 && parsed.pull_quote !== 'INSUFFICIENT')
        var titleInsufficient = !!(parsed.title && String(parsed.title).trim().toUpperCase() === 'INSUFFICIENT')
        var aiInsufficient = titleInsufficient || (!hasNarrative && !hasPullQuote)

        // V11.15.4 — Catch AI self-flagged meta-commentary. If the AI's
        // own summary / analysis / pull_quote says the source isn't a
        // witnessed event, reject — these are forum opinions, news
        // synthesis, or solicitations, not experience reports.
        var metaHit = findMetaInAiOutput({
          summary: parsed.summary,
          analysis: parsed.analysis,
          pull_quote: parsed.pull_quote,
          feed_hook: parsed.feed_hook,
        })

        if (anomalyAutoArchive) {
          // V11.17.46 — row already archived above; skip A/B/C entirely.
        } else if (aiInsufficient || metaHit) {
          // Path A — auto-reject
          try {
            var rejectRes = await (supabase.from('reports') as any)
              .update({ status: 'rejected', updated_at: new Date().toISOString() })
              .eq('id', reportId)
            if (!rejectRes.error) {
              if (metaHit) {
                console.log('  ↓ ' + reportId + ' auto-rejected (meta: "' + metaHit.phrase + '" in ' + metaHit.field + ')')
              } else {
                console.log('  ↓ ' + reportId + ' auto-rejected (AI INSUFFICIENT)')
              }
            }
          } catch (rejectErr: any) {
            console.warn('  ! ' + reportId + ' auto-reject failed (left at pending_review): ' + (rejectErr?.message || rejectErr))
          }
        } else if (scoreStatus === 'approved' && hasNarrative && hasPullQuote && !anomalyKeepPending) {
          // Path B — auto-promote (V11.17.46: blocked when anomaly gate
          // flagged mid-confidence non-anomalous content; row stays at
          // pending_review for admin review.)
          try {
            var promoteRes = await (supabase.from('reports') as any)
              .update({ status: 'approved', updated_at: new Date().toISOString() })
              .eq('id', reportId)
            if (!promoteRes.error) {
              console.log('  ↑ ' + reportId + ' auto-promoted to approved')
            }
          } catch (promoteErr: any) {
            console.warn('  ! ' + reportId + ' auto-promote failed (left at pending_review): ' + (promoteErr?.message || promoteErr))
          }
        }
        // Path C — borderline; leave at pending_review.
      }

      console.log('\n=== Persistence summary ===')
      console.log('Succeeded:    ' + stats.succeeded)
      console.log('Parse failed: ' + stats.parse_failed)
      console.log('Save failed:  ' + stats.save_failed)
      console.log('API errored:  ' + stats.errored)
      console.log('Total batch cost: $' + stats.totalCost.toFixed(4))
      console.log('Avg per succeeded report: $' + (stats.succeeded > 0 ? (stats.totalCost / stats.succeeded).toFixed(5) : 'n/a'))

      // V11.15.4 (Stage D) — auto-classify newly-approved reports into
      // the encyclopedia so the next ingestion doesn't leave a backlog
      // of unclassified reports.
      if (!args.noClassify) {
        await spawnClassifierAfterRun(stats.succeeded)
      } else {
        console.log('\n[Auto-classify] --no-classify set — skipping post-ingestion classifier.')
      }
      return
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// V11.15.4 (Stage D) — Post-ingestion phenomenon classification
// ─────────────────────────────────────────────────────────────────────
//
// After the batch worker finishes promoting reports to status='approved',
// fire the phenomenon classifier so freshly-approved reports get linked
// into the encyclopedia automatically. The classifier filters by
// status='approved' AND skips reports that already have report_phenomena
// rows, so this is idempotent — re-running on a fully-classified corpus
// is a fast no-op.
//
// Gated by --no-classify CLI flag and PARADOCS_AUTO_CLASSIFY env var
// (set to 'false' to disable). Default: enabled.
//
// Why spawn vs. import: keeps the classifier as a self-contained CLI
// (one place to debug, one place to update Anthropic API quirks). The
// child process inherits env and writes its own log.

function spawnClassifierAfterRun(succeeded: number): Promise<void> {
  return new Promise(function (resolve) {
    if (succeeded === 0) {
      console.log('\n[Auto-classify] No reports promoted to approved — skipping classifier.')
      resolve()
      return
    }
    if (process.env.PARADOCS_AUTO_CLASSIFY === 'false') {
      console.log('\n[Auto-classify] Disabled via PARADOCS_AUTO_CLASSIFY=false — skipping.')
      resolve()
      return
    }
    console.log('\n=== Post-ingestion phenomenon classifier (Stage D) ===')
    console.log('Promoting ' + succeeded + ' newly-approved reports into the encyclopedia.')
    console.log('Classifier filters internally to only-unlinked reports — safe to re-run.')

    var ts = Date.now()
    var logPath = path.join('outputs', 'orchestrator-classifier-' + ts + '.log')
    var out: number
    try {
      // Ensure outputs dir exists (idempotent)
      try { fs.mkdirSync('outputs', { recursive: true }) } catch (_e) { /* exists */ }
      out = fs.openSync(logPath, 'a')
    } catch (e: any) {
      console.warn('[Auto-classify] could not open log file: ' + (e?.message || e))
      resolve()
      return
    }
    console.log('Classifier log → ' + logPath)

    var child = spawn(
      'npx',
      ['tsx', 'scripts/classify-phenomena-batch.ts', '--all'],
      {
        detached: false,
        stdio: ['ignore', out, out],
        env: process.env,
      },
    )
    child.on('exit', function (code) {
      try { fs.closeSync(out) } catch (_e) { /* ignore */ }
      if (code === 0) {
        console.log('[Auto-classify] ✓ Classifier finished cleanly (log: ' + logPath + ')')
      } else {
        console.warn('[Auto-classify] ! Classifier exited with code=' + code + ' (log: ' + logPath + ')')
      }
      // V11.17.11 — Chain the display_blurb generator so any phenomena
      // newly created by admin tools (batch-create, manual seeds) get
      // their card blurb populated automatically. The script is a
      // no-op when no rows have NULL display_blurb, so this is safe
      // to call on every drain end-of-run.
      runDisplayBlurbGenerator().then(resolve, resolve)
    })
    child.on('error', function (err) {
      try { fs.closeSync(out) } catch (_e) { /* ignore */ }
      console.warn('[Auto-classify] spawn error: ' + (err.message || err))
      runDisplayBlurbGenerator().then(resolve, resolve)
    })
  })
}

/**
 * V11.17.11 — Run the display_blurb generator end-of-run. Only does
 * work when phenomena.display_blurb has NULL rows; otherwise exits
 * within ~1s. Skipped entirely when PARADOCS_AUTO_BLURB=false.
 */
function runDisplayBlurbGenerator(): Promise<void> {
  return new Promise(function (resolve) {
    if (process.env.PARADOCS_AUTO_BLURB === 'false') {
      console.log('[Auto-blurb] Disabled via PARADOCS_AUTO_BLURB=false — skipping.')
      resolve()
      return
    }
    console.log('\n=== Post-classify display_blurb generator ===')
    var ts = Date.now()
    var logPath = path.join('outputs', 'orchestrator-blurb-' + ts + '.log')
    var out: number
    try {
      try { fs.mkdirSync('outputs', { recursive: true }) } catch (_e) { /* exists */ }
      out = fs.openSync(logPath, 'a')
    } catch (e: any) {
      console.warn('[Auto-blurb] could not open log: ' + (e?.message || e))
      resolve()
      return
    }
    console.log('Blurb log → ' + logPath)
    var child = spawn(
      'npx',
      ['tsx', 'scripts/generate-display-blurbs.ts'],
      {
        detached: false,
        stdio: ['ignore', out, out],
        env: process.env,
      },
    )
    child.on('exit', function (code) {
      try { fs.closeSync(out) } catch (_e) { /* ignore */ }
      if (code === 0) {
        console.log('[Auto-blurb] ✓ Generator finished cleanly (log: ' + logPath + ')')
      } else {
        console.warn('[Auto-blurb] ! Generator exited with code=' + code + ' (log: ' + logPath + ')')
      }
      resolve()
    })
    child.on('error', function (err) {
      try { fs.closeSync(out) } catch (_e) { /* ignore */ }
      console.warn('[Auto-blurb] spawn error: ' + (err.message || err))
      resolve()
    })
  })
}

async function logBatchCost(
  supabase: any,
  reportId: string,
  message: any,
  inputTokens: number | null,
  outputTokens: number | null,
  cacheCreationTokens: number | null,
  costUsd: number,
  status: 'completed' | 'failed' | 'parse_failed',
  reason: string | null,
): Promise<void> {
  try {
    await supabase.from('paradocs_narrative_cost_log').insert({
      // V11.17.84 — service column tags the batch path so the unified
      // cost-summary endpoint can attribute it correctly.
      service: 'consolidated-batch',
      report_id: reportId,
      model: HAIKU_MODEL + ' (consolidated-batch)',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_tokens: cacheCreationTokens,
      cost_usd: costUsd,
      status: status === 'completed' ? 'completed' : 'failed',
      reason: reason,
    })
  } catch (_e) { /* non-fatal */ }
}

main().catch(function (e) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})
