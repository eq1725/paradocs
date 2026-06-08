#!/usr/bin/env tsx
/**
 * Regen flagged narratives — Copyright Sprint 2
 *
 * Date:   2026-06-08
 * Sprint: Copyright Sprint 2
 * Related:
 *   - scripts/flag-paraphrased-narratives.ts (produces input JSON)
 *   - src/lib/services/consolidated-ai.service.ts (Haiku payload shape)
 *   - scripts/batch-ingest-worker.ts (cribbed from for Batch API mechanics)
 *   - docs/HAIKU_NARRATIVE_DERIVATIVE_AUDIT.md (§5 — R1+R2+(c) backfill)
 *   - docs/COPYRIGHT_SPRINT_2_NOTES.md (operator runbook)
 *
 * Reads outputs/flagged-paraphrase-rows.json (produced by
 * flag-paraphrased-narratives.ts) and regenerates each flagged
 * narrative via Anthropic Batch API (50% discount, 24h SLA).
 *
 * The new narrative is generated with the post-Sprint-1 prompt — by
 * the time Sprint 2 ships, the consolidated-ai.service.ts
 * CONSOLIDATED_SYSTEM_PROMPT already carries the explicit anti-paraphrase
 * rule (Sprint-1 deliverable R1). This script does not edit the prompt;
 * it just re-runs Haiku against the current prompt.
 *
 * Cost (per audit §6, option c):
 *   ~$0.0025 per report at Haiku Batch API rates (input cached + output
 *   ~600 tok). 75,000-85,000 expected flagged rows → $190-$215 total.
 *
 * IDEMPOTENT + RESUMABLE:
 *   The migration 20260608_narrative_regenerated_at.sql adds a column
 *   that this script stamps on every successful regen. On re-run, rows
 *   whose narrative_regenerated_at >= the flag-run timestamp are
 *   skipped (we don't waste Haiku $$$ re-doing what already shipped).
 *
 *   --resume <batch_id> jumps directly to the polling phase for a
 *   batch that's still mid-flight (Anthropic SLA is up to 24h).
 *
 * COEXISTENCE:
 *   The Batch API submission is a single HTTP call; the polling phase
 *   only reads. The persistence phase writes to reports.paradocs_narrative
 *   + narrative_regenerated_at + paradocs_analysis_generated_at — all
 *   columns that NUFORC ingest doesn't UPDATE on existing rows (only
 *   re-ingests touch them, and even then they overwrite with a fresh
 *   Haiku output anyway). Classifier-drain writes disjoint columns. Safe.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/regen-flagged-narratives.ts            # dry-run (cost estimate)
 *   npx tsx scripts/regen-flagged-narratives.ts --apply    # submit batch + poll + write
 *   npx tsx scripts/regen-flagged-narratives.ts --resume msgbatch_abc123  # poll only
 *
 * SWC style: var + function() form.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import {
  CONSOLIDATED_SYSTEM_PROMPT,
  buildConsolidatedUserPrompt,
  persistConsolidatedResult,
} from '../src/lib/services/consolidated-ai.service'

// ─────────────────────────────────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────────────────────────────────

var apply = process.argv.includes('--apply')
var dryRun = !apply
var yes = process.argv.includes('--yes') || process.argv.includes('-y')
var resumeArg = process.argv.find(function (a) { return a.indexOf('--resume') === 0 })
var resumeBatchId: string | null = null
if (resumeArg) {
  // --resume=foo or --resume foo
  if (resumeArg.indexOf('=') !== -1) resumeBatchId = resumeArg.split('=')[1]
  else {
    var idx = process.argv.indexOf(resumeArg)
    if (idx >= 0 && idx + 1 < process.argv.length) resumeBatchId = process.argv[idx + 1]
  }
}
var pollIntervalArg = process.argv.find(function (a) { return a.indexOf('--poll-interval=') === 0 })
var POLL_INTERVAL_SEC = pollIntervalArg ? parseInt(pollIntervalArg.split('=')[1], 10) : 60
var maxWaitArg = process.argv.find(function (a) { return a.indexOf('--max-wait=') === 0 })
var MAX_WAIT_SEC = maxWaitArg ? parseInt(maxWaitArg.split('=')[1], 10) : 26 * 3600  // 26h covers the 24h SLA

// ─────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────

var HAIKU_MODEL = 'claude-haiku-4-5-20251001'
var MAX_TOKENS = 2500
var TEMPERATURE = 0.4

// Batch API discounted Haiku 4.5 prices
var HAIKU_INPUT_USD_PER_M_BATCH = 0.5
var HAIKU_OUTPUT_USD_PER_M_BATCH = 2.5
var HAIKU_CACHE_WRITE_BATCH = 0.625
var HAIKU_CACHE_READ_BATCH = 0.05

var BATCH_API_URL = 'https://api.anthropic.com/v1/messages/batches'
var FLAGGED_JSON_PATH = path.resolve(__dirname, '..', 'outputs', 'flagged-paraphrase-rows.json')
var RUN_STATE_PATH = path.resolve(__dirname, '..', 'outputs', 'regen-flagged-narratives.run.json')

// ─────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────

interface FlaggedRow {
  id: string
  slug: string | null
  source_label: string | null
  source_type: string | null
  fivegramOverlap: number
  sevengramMaxRun: number
}

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

interface BatchResultRow {
  custom_id: string
  result: {
    type: 'succeeded' | 'errored' | 'canceled' | 'expired'
    message?: any
    error?: { type: string; message: string }
  }
}

// ─────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────

function stripLoneSurrogates(s: string | null | undefined): string {
  if (s == null) return ''
  return s
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

function sanitizeReportForBatch(report: any): any {
  var clean: any = Object.assign({}, report)
  var fields = ['title', 'summary', 'description', 'location_name',
                'country', 'state_province', 'city', 'source_label']
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i]
    if (typeof clean[f] === 'string') clean[f] = stripLoneSurrogates(clean[f])
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

async function submitBatch(requests: BatchRequest[], apiKey: string): Promise<{ batch_id: string } | { error: string }> {
  var resp = await fetch(BATCH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
    body: JSON.stringify({ requests: requests }),
  })
  if (!resp.ok) {
    var errText = await resp.text().catch(function () { return '' })
    return { error: 'submit ' + resp.status + ': ' + errText.substring(0, 500) }
  }
  var data: any = await resp.json()
  if (!data.id) return { error: 'response missing id field' }
  return { batch_id: data.id }
}

async function getBatchStatus(batchId: string, apiKey: string): Promise<BatchStatus | { error: string }> {
  var resp = await fetch(BATCH_API_URL + '/' + batchId, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
  })
  if (!resp.ok) {
    var errText = await resp.text().catch(function () { return '' })
    return { error: 'status ' + resp.status + ': ' + errText.substring(0, 300) }
  }
  return await resp.json() as BatchStatus
}

async function fetchBatchResults(resultsUrl: string, apiKey: string): Promise<BatchResultRow[]> {
  var resp = await fetch(resultsUrl, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
  })
  if (!resp.ok) throw new Error('results fetch ' + resp.status)
  var text = await resp.text()
  var rows: BatchResultRow[] = []
  var lines = text.split('\n')
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (!line) continue
    try { rows.push(JSON.parse(line)) }
    catch (_e) { /* skip unparseable */ }
  }
  return rows
}

async function confirmInteractive(message: string): Promise<boolean> {
  if (yes) return true
  if (!process.stdin.isTTY) {
    console.log('(non-interactive shell, pass --yes to confirm) — proceeding with NO')
    return false
  }
  var rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(function (resolve) {
    rl.question(message + ' [y/N] ', function (answer) {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes')
    })
  })
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var.')
    process.exit(1)
  }
  if (apply && !apiKey) {
    console.error('Missing ANTHROPIC_API_KEY env var (required for --apply).')
    process.exit(1)
  }
  var sb = createClient(supabaseUrl, serviceKey)

  console.log('=== Copyright Sprint 2: regen flagged narratives ===')
  console.log('Mode:        ' + (dryRun ? 'DRY RUN (no Haiku calls, no writes)' : 'APPLY (Batch API + writes)'))
  console.log('Input file:  ' + FLAGGED_JSON_PATH)
  console.log('Model:       ' + HAIKU_MODEL + ' (Anthropic Batch API, 50% discount)')
  console.log('Poll cycle:  every ' + POLL_INTERVAL_SEC + 's')
  console.log('Max wait:    ' + Math.round(MAX_WAIT_SEC / 3600) + 'h')
  console.log('')

  // ── Resume path ──────────────────────────────────────────────
  if (resumeBatchId) {
    console.log('Resuming polling for batch_id: ' + resumeBatchId)
    await pollAndPersist(sb, apiKey!, resumeBatchId)
    return
  }

  // ── Load flagged JSON ────────────────────────────────────────
  if (!fs.existsSync(FLAGGED_JSON_PATH)) {
    console.error('Flagged-rows JSON not found at: ' + FLAGGED_JSON_PATH)
    console.error('Run scripts/flag-paraphrased-narratives.ts first.')
    process.exit(1)
  }
  var flaggedRaw = fs.readFileSync(FLAGGED_JSON_PATH, 'utf8')
  var flagged = JSON.parse(flaggedRaw) as FlaggedRow[]
  if (!Array.isArray(flagged) || flagged.length === 0) {
    console.log('Input JSON is empty. Nothing to regen.')
    return
  }
  console.log('Loaded ' + flagged.length + ' flagged rows from JSON.')

  // ── Idempotency: skip rows already regenerated ───────────────
  // Use the file mtime as the flag-run timestamp; anything newer than
  // that on narrative_regenerated_at is the result of a prior regen
  // pass that already brought the row into compliance.
  var stat = fs.statSync(FLAGGED_JSON_PATH)
  var flagRunTs = stat.mtime.toISOString()
  console.log('Flag JSON mtime (used as resume cursor): ' + flagRunTs)

  var candidateIds = flagged.map(function (r) { return r.id })

  // Paginate the "already regenerated" lookup — IN() lists are unbounded
  // but we'll batch by 1000 to be polite to PostgREST.
  var alreadyDone = new Set<string>()
  var BATCH = 1000
  for (var off = 0; off < candidateIds.length; off += BATCH) {
    var slice = candidateIds.slice(off, off + BATCH)
    var q = await sb
      .from('reports')
      .select('id, narrative_regenerated_at')
      .in('id', slice)
      .gte('narrative_regenerated_at', flagRunTs)
    if (q.error) {
      // narrative_regenerated_at column may not exist if the migration
      // hasn't been applied; treat that as "nothing done yet."
      if (/column .*narrative_regenerated_at.* does not exist/i.test(q.error.message)) {
        console.warn('Note: narrative_regenerated_at column missing — apply the migration before --apply.')
        break
      }
      console.error('Idempotency check failed: ' + q.error.message)
      process.exit(1)
    }
    (q.data || []).forEach(function (r: any) { alreadyDone.add(r.id) })
  }
  var pending = flagged.filter(function (r) { return !alreadyDone.has(r.id) })
  console.log('Already-regenerated (skipped): ' + alreadyDone.size)
  console.log('Pending regen:                 ' + pending.length)

  if (pending.length === 0) {
    console.log('Nothing to do. Exiting.')
    return
  }

  // ── Cost estimate ────────────────────────────────────────────
  // Per-report midpoint estimate (audit §6 option c): ~$0.0025.
  // Break it out so the operator sees the assumption:
  //   - system prompt: ~6,000 tokens, cached on all but first call
  //   - user prompt:   ~1,500 tokens avg (description capped at 2k chars)
  //   - output:        ~1,100 tokens avg (full consolidated JSON)
  var estSysTokens = Math.ceil(CONSOLIDATED_SYSTEM_PROMPT.length / 4)
  var avgUserTokens = 1500
  var avgOutputTokens = 1100
  var costFirstReq = avgUserTokens / 1e6 * HAIKU_INPUT_USD_PER_M_BATCH +
    estSysTokens / 1e6 * HAIKU_CACHE_WRITE_BATCH +
    avgOutputTokens / 1e6 * HAIKU_OUTPUT_USD_PER_M_BATCH
  var costCachedReq = avgUserTokens / 1e6 * HAIKU_INPUT_USD_PER_M_BATCH +
    estSysTokens / 1e6 * HAIKU_CACHE_READ_BATCH +
    avgOutputTokens / 1e6 * HAIKU_OUTPUT_USD_PER_M_BATCH
  var estTotal = costFirstReq + costCachedReq * (pending.length - 1)
  console.log('')
  console.log('=== Cost estimate (Anthropic Batch API, 50% discount) ===')
  console.log('Per-report (first, cache write):   $' + costFirstReq.toFixed(5))
  console.log('Per-report (subsequent, cached):   $' + costCachedReq.toFixed(5))
  console.log('TOTAL estimated batch cost:        $' + estTotal.toFixed(2))
  console.log('(Audit §6 option-c benchmark:      $190-$215 for ~75-85k rows)')
  console.log('')

  if (dryRun) {
    console.log('DRY RUN — no Haiku calls submitted. Re-run with --apply to submit.')
    return
  }

  // ── Interactive confirmation ─────────────────────────────────
  var confirmed = await confirmInteractive(
    'Submit Batch API job for ' + pending.length + ' reports at est. $' + estTotal.toFixed(2) + '?',
  )
  if (!confirmed) {
    console.log('Aborted.')
    process.exit(0)
  }

  // ── Fetch report payloads needed for Haiku prompt ────────────
  console.log('')
  console.log('Fetching report payloads (' + pending.length + ' rows)...')
  var pendingIds = pending.map(function (r) { return r.id })
  var reportsMap = new Map<string, any>()
  for (var off2 = 0; off2 < pendingIds.length; off2 += BATCH) {
    var slice2 = pendingIds.slice(off2, off2 + BATCH)
    var rq = await sb
      .from('reports')
      .select('id, title, summary, description, category, location_name, country, state_province, city, event_date, source_type, source_label, tags')
      .in('id', slice2)
    if (rq.error) {
      console.error('Report fetch failed (batch ' + off2 + '): ' + rq.error.message)
      process.exit(1)
    }
    (rq.data || []).forEach(function (r: any) { reportsMap.set(r.id, r) })
  }
  console.log('Fetched ' + reportsMap.size + ' / ' + pending.length + ' report payloads.')

  // ── Build batch requests ─────────────────────────────────────
  var requests: BatchRequest[] = []
  var missingPayload = 0
  for (var i = 0; i < pending.length; i++) {
    var p = pending[i]
    var rep = reportsMap.get(p.id)
    if (!rep) { missingPayload++; continue }
    requests.push(buildBatchRequest(rep))
  }
  console.log('Built ' + requests.length + ' batch requests (' + missingPayload + ' missing-payload skips).')

  // ── Submit ───────────────────────────────────────────────────
  console.log('')
  console.log('Submitting batch to Anthropic...')
  var submitRes = await submitBatch(requests, apiKey!)
  if ('error' in submitRes) {
    console.error('Batch submission failed: ' + submitRes.error)
    process.exit(1)
  }
  var batchId = submitRes.batch_id
  console.log('Submitted. batch_id: ' + batchId)
  console.log('Resume polling later with: --resume ' + batchId)

  // Save run state so a crashed run can resume.
  fs.writeFileSync(RUN_STATE_PATH, JSON.stringify({
    batch_id: batchId,
    submitted_at: new Date().toISOString(),
    pending_count: pending.length,
    flag_run_ts: flagRunTs,
  }, null, 2), 'utf8')
  console.log('Run state written: ' + RUN_STATE_PATH)

  // ── Poll + persist ───────────────────────────────────────────
  await pollAndPersist(sb, apiKey!, batchId)
}

async function pollAndPersist(sb: any, apiKey: string, batchId: string): Promise<void> {
  var startTime = Date.now()
  var maxWaitMs = MAX_WAIT_SEC * 1000
  var pollMs = POLL_INTERVAL_SEC * 1000
  var lastCounts: any = null

  console.log('')
  console.log('Polling for batch completion (every ' + POLL_INTERVAL_SEC + 's, max ' + Math.round(MAX_WAIT_SEC / 3600) + 'h)...')

  while (true) {
    if (Date.now() - startTime > maxWaitMs) {
      console.warn('Max wait reached. Batch still processing — resume with --resume ' + batchId)
      process.exit(3)
    }
    await new Promise(function (r) { setTimeout(r, pollMs) })
    var st = await getBatchStatus(batchId, apiKey)
    if ('error' in st) {
      console.warn('Poll error: ' + st.error + ' — retrying')
      continue
    }
    var counts = st.request_counts
    var elapsed = Math.round((Date.now() - startTime) / 1000)
    var changed = !lastCounts || JSON.stringify(counts) !== JSON.stringify(lastCounts)
    console.log('  [+' + elapsed + 's] status=' + st.processing_status +
      '  processing=' + counts.processing +
      '  succeeded=' + counts.succeeded +
      '  errored=' + counts.errored +
      (changed ? '' : '  (no change)'))
    lastCounts = counts

    if (st.processing_status === 'ended') {
      console.log('')
      console.log('Batch complete. succeeded=' + counts.succeeded + ' errored=' + counts.errored + ' canceled=' + counts.canceled + ' expired=' + counts.expired)
      if (!st.results_url) {
        console.error('Batch ended but results_url is null. Check Anthropic console.')
        process.exit(1)
      }

      console.log('Fetching results...')
      var rows = await fetchBatchResults(st.results_url, apiKey)
      console.log('Got ' + rows.length + ' result rows. Persisting...')

      var stats = { succeeded: 0, parse_failed: 0, save_failed: 0, errored: 0 }
      var nowIso = new Date().toISOString()

      for (var i = 0; i < rows.length; i++) {
        var row = rows[i]
        var reportId = row.custom_id
        if (row.result.type !== 'succeeded') {
          stats.errored++
          console.warn('  ✗ ' + reportId + ' (' + row.result.type + ')' +
            (row.result.error ? ' ' + row.result.error.message : ''))
          continue
        }
        var msg: any = row.result.message
        var rawText = msg && msg.content && msg.content[0] && msg.content[0].text
        if (!rawText) {
          stats.parse_failed++
          continue
        }
        var parsed: any = null
        try {
          var cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
          var js = cleaned.indexOf('{')
          var je = cleaned.lastIndexOf('}')
          if (js >= 0 && je > js) parsed = JSON.parse(cleaned.substring(js, je + 1))
        } catch (_pe) { /* fall through */ }
        if (!parsed) {
          stats.parse_failed++
          console.warn('  ✗ ' + reportId + ' JSON parse failed')
          continue
        }

        // Look up category + title for persistConsolidatedResult.
        var existing: any = null
        try {
          var f = await sb.from('reports').select('category, title').eq('id', reportId).single()
          if (f.data) existing = f.data
        } catch (_lookupErr) { /* non-fatal */ }

        var saved = await persistConsolidatedResult(
          sb,
          reportId,
          parsed,
          existing ? existing.category : null,
          existing ? existing.title : null,
          'consolidated-batch-regen',
        )
        if (!saved.ok) {
          stats.save_failed++
          console.warn('  ✗ ' + reportId + ' save failed: ' + saved.error)
          continue
        }

        // Stamp the regen marker. Best-effort — if column doesn't exist
        // we log and continue (operator should have applied the
        // migration first, but the rest of the regen persists fine).
        var stampRes = await sb
          .from('reports')
          .update({ narrative_regenerated_at: nowIso })
          .eq('id', reportId)
        if (stampRes.error) {
          if (/narrative_regenerated_at.*does not exist/i.test(stampRes.error.message)) {
            // First row hits this; warn once and stop spamming logs.
            if (stats.succeeded === 0) {
              console.warn('  ! narrative_regenerated_at column missing — apply migration to enable resume tracking.')
            }
          } else {
            console.warn('  ! ' + reportId + ' stamp failed: ' + stampRes.error.message)
          }
        }
        stats.succeeded++
      }

      console.log('')
      console.log('=== Persistence summary ===')
      console.log('Succeeded:    ' + stats.succeeded)
      console.log('Errored:      ' + stats.errored)
      console.log('Parse failed: ' + stats.parse_failed)
      console.log('Save failed:  ' + stats.save_failed)
      return
    }
  }
}

main().catch(function (err) {
  console.error('Fatal: ' + (err && err.message ? err.message : err))
  process.exit(1)
})
