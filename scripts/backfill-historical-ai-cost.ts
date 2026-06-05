#!/usr/bin/env tsx
/**
 * V11.17.86 — Historical AI cost backfill.
 *
 * PURPOSE
 *   paradocs_narrative_cost_log only captured the consolidated-narrative
 *   path (and consolidated-batch from V11.14 onward). Founder paid ~$900
 *   to Anthropic between June 1 and June 5; the table only accounts for
 *   ~$310 of that. The missing ~$590 of spend came from paths that called
 *   Haiku/Sonnet but never wrote to the cost log:
 *
 *     classifier-primary (batch)
 *     classifier-verify  (Haiku live, per-candidate)
 *     tag-verify         (engine.ts gate)
 *     report-insights    (Sonnet)
 *     ai-insights        (Sonnet)
 *     rewrite-pipeline   (Sonnet, two passes)
 *     ai-tagger          (Sonnet + vision)
 *     other small services
 *
 *   V11.17.84 wired all of these into ai-cost-logger so going FORWARD the
 *   log is accurate. This script writes ESTIMATED rows back into the log
 *   so the /admin cost panel "by_day" chart shows real history going back
 *   to June 1.
 *
 * METHODOLOGY
 *   For each (day, service) pair, derive a volume signal from existing DB
 *   tables where one exists, multiply by an estimated cost-per-call, and
 *   insert ONE summary row per pair into paradocs_narrative_cost_log.
 *
 *   Volume signals (measured):
 *     classifier-primary : count(report_phenomena) per day (one classifier
 *                          call per inserted phenomenon link)
 *     classifier-verify  : count(report_phenomena) × 1.5 (per-candidate
 *                          verification ratio from V11.17.84 audit)
 *     tag-verify         : count(reports created) × 0.3 verify-call ratio
 *                          (engine.ts only fires verify on candidate-tag
 *                          gates, not every ingest)
 *     report-insights    : count(reports with paradocs_assessment NOT NULL)
 *                          inserted per day
 *     ai-insights        : same shape as report-insights (similar volume)
 *     rewrite-pipeline   : count(ai_rewrite_audit) per day (each row is
 *                          one rewrite call)
 *     ai-tagger          : count(reports with has_photo_video=true)
 *                          inserted per day
 *     other-small        : flat allocation across days
 *
 *   Where the measured signal returns zero (e.g. ai_rewrite_audit was
 *   empty in the window) the script falls back to the V11.17.84 audit
 *   estimate spread evenly across days. Comments mark which is which.
 *
 *   All inserted rows are CLEARLY marked as estimates:
 *     model      = '<original> (backfill-estimate)'
 *     request_id = 'backfill-V11.17.86-<service>-<YYYY-MM-DD>'
 *     reason     = 'historical-backfill (estimate, not measured)'
 *
 *   created_at is set to noon UTC of the day so the row lands cleanly in
 *   the by-day bucket of the cost-summary endpoint.
 *
 * IDEMPOTENCY
 *   Before inserting a row for (day, service) the script checks for an
 *   existing row whose request_id matches the V11.17.86 backfill marker.
 *   Safe to re-run; will skip already-backfilled (day, service) pairs.
 *
 * SAFETY
 *   Default mode is --dry-run. Must pass --apply to actually insert.
 *   Backfill rows are easy to delete in bulk:
 *     DELETE FROM paradocs_narrative_cost_log
 *     WHERE request_id LIKE 'backfill-V11.17.86-%';
 *
 * USAGE
 *   cd paradocs && set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-historical-ai-cost.ts \
 *     --dry-run --from 2026-06-01 --to 2026-06-05
 *   npx tsx scripts/backfill-historical-ai-cost.ts \
 *     --apply --from 2026-06-01 --to 2026-06-05
 */

import { createClient } from '@supabase/supabase-js'

// ─── CLI args ──────────────────────────────────────────────────────────

interface CliArgs {
  apply: boolean
  dryRun: boolean
  from: string
  to: string
}

function parseArgs(argv: string[]): CliArgs {
  var today = new Date().toISOString().slice(0, 10)
  var args: CliArgs = {
    apply: false,
    dryRun: true,
    from: '2026-06-01',
    to: today,
  }
  for (var i = 2; i < argv.length; i++) {
    var a = argv[i]
    if (a === '--apply') { args.apply = true; args.dryRun = false }
    else if (a === '--dry-run') { args.dryRun = true; args.apply = false }
    else if (a === '--from') { args.from = argv[++i] }
    else if (a === '--to') { args.to = argv[++i] }
    else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/backfill-historical-ai-cost.ts [--dry-run | --apply] [--from YYYY-MM-DD] [--to YYYY-MM-DD]')
      process.exit(0)
    }
  }
  return args
}

// ─── Service definitions ───────────────────────────────────────────────
//
// Per-service estimated cost-per-call + average token shape. These come
// from the V11.17.84 reconciliation memo (docs/COST_RECONCILIATION_NOTES.md).
// The "audit" estimates are the 7-day totals from the memo; we use them as
// the fallback when the volume signal returns zero.

interface ServiceSpec {
  service: string
  model: string
  // Estimated USD per call. Used together with the measured volume signal.
  costPerCall: number
  // Average input/output tokens per call. Used to populate the
  // input_tokens / output_tokens columns so the row "looks right" in
  // the cost-summary breakdown.
  avgInputTokens: number
  avgOutputTokens: number
  // Source signal explanation (printed in the dry-run output).
  signalLabel: string
  // V11.17.84 7-day total from the audit memo, used as a sanity bound
  // and as the fallback divisor when the measured signal is zero.
  auditTotalUsd: number
}

var SERVICES: ServiceSpec[] = [
  {
    service: 'classifier-primary',
    model: 'claude-haiku-4-5-20251001-batch',
    costPerCall: 0.0005,
    avgInputTokens: 800,
    avgOutputTokens: 120,
    signalLabel: 'report_phenomena rows inserted',
    auditTotalUsd: 50,
  },
  {
    service: 'classifier-verify',
    model: 'claude-haiku-4-5-20251001',
    costPerCall: 0.0005,
    avgInputTokens: 600,
    avgOutputTokens: 80,
    signalLabel: 'report_phenomena rows × 1.5 verification ratio',
    auditTotalUsd: 75,
  },
  {
    service: 'tag-verify',
    model: 'claude-haiku-4-5-20251001',
    costPerCall: 0.0005,
    avgInputTokens: 500,
    avgOutputTokens: 60,
    signalLabel: 'reports created × 0.3 verify-call ratio',
    auditTotalUsd: 25,
  },
  {
    service: 'report-insights',
    model: 'claude-sonnet-4-5-20250929',
    costPerCall: 0.004,
    avgInputTokens: 1200,
    avgOutputTokens: 250,
    signalLabel: 'reports with paradocs_assessment NOT NULL',
    auditTotalUsd: 15,
  },
  {
    service: 'ai-insights',
    model: 'claude-sonnet-4-5-20250929',
    costPerCall: 0.004,
    avgInputTokens: 1200,
    avgOutputTokens: 250,
    signalLabel: 'reports with paradocs_assessment NOT NULL (mirrored)',
    auditTotalUsd: 15,
  },
  {
    service: 'rewrite-pipeline',
    model: 'claude-sonnet-4-5-20250929',
    costPerCall: 0.005,
    avgInputTokens: 1500,
    avgOutputTokens: 300,
    signalLabel: 'ai_rewrite_audit rows',
    auditTotalUsd: 20,
  },
  {
    service: 'ai-tagger',
    model: 'claude-sonnet-4-5-20250929',
    costPerCall: 0.01,
    avgInputTokens: 1800,
    avgOutputTokens: 200,
    signalLabel: 'reports with has_photo_video=true',
    auditTotalUsd: 10,
  },
  {
    service: 'other-small',
    model: 'claude-haiku-4-5-20251001',
    costPerCall: 0.0008,
    avgInputTokens: 400,
    avgOutputTokens: 80,
    signalLabel: 'flat allocation (location-extract + cluster-finding + ai-title + ' +
                 'text-moderation + video-transcribe + onboarding-title + synthesized-paragraph)',
    auditTotalUsd: 5,
  },
]

// ─── Volume queries ────────────────────────────────────────────────────
//
// Each returns a Map<YYYY-MM-DD, number> of measured call volume for that
// service on that day. When the table is empty / missing the function
// returns an empty map and the caller falls back to the audit estimate
// spread evenly across days.

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function eachDay(fromIso: string, toIso: string): string[] {
  var out: string[] = []
  var start = new Date(fromIso + 'T00:00:00Z')
  var end = new Date(toIso + 'T00:00:00Z')
  for (var d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(dayKey(d))
  }
  return out
}

async function countByDay(
  supabase: any,
  table: string,
  fromIso: string,
  toIso: string,
  extraFilter?: (q: any) => any,
): Promise<Map<string, number>> {
  // One head:true count query per day. Vastly faster than pulling
  // 100k+ rows just to bucket by date — the count uses a single
  // index-only aggregate on the server.
  var out = new Map<string, number>()
  try {
    var days = eachDay(fromIso, toIso)
    for (var i = 0; i < days.length; i++) {
      var day = days[i]
      var dayStart = day + 'T00:00:00Z'
      var dayEnd = day + 'T23:59:59Z'
      var q: any = supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
      if (extraFilter) q = extraFilter(q)
      var res = await q
      if (res.error) {
        console.warn('[volume] ' + table + ' (' + day + ') query error: ' + res.error.message)
        continue
      }
      var n = typeof res.count === 'number' ? res.count : 0
      if (n > 0) out.set(day, n)
    }
  } catch (e: any) {
    console.warn('[volume] ' + table + ' threw: ' + (e?.message || e))
  }
  return out
}

async function volumeFor(
  service: string,
  supabase: any,
  fromIso: string,
  toIso: string,
): Promise<Map<string, number>> {
  if (service === 'classifier-primary') {
    return countByDay(supabase, 'report_phenomena', fromIso, toIso)
  }
  if (service === 'classifier-verify') {
    var base = await countByDay(supabase, 'report_phenomena', fromIso, toIso)
    // 1.5 verify calls per phenomenon link (V11.17.84 audit ratio).
    var scaled = new Map<string, number>()
    base.forEach(function (n, d) { scaled.set(d, Math.round(n * 1.5)) })
    return scaled
  }
  if (service === 'tag-verify') {
    var reports = await countByDay(supabase, 'reports', fromIso, toIso)
    // ~5 candidate tags per report, but most short-circuit on the cache /
    // local matcher; the V11.17.84 audit pegs net Haiku-fired ratio at
    // ~0.3 per report.
    var scaled2 = new Map<string, number>()
    reports.forEach(function (n2, d2) { scaled2.set(d2, Math.round(n2 * 0.3)) })
    return scaled2
  }
  if (service === 'report-insights' || service === 'ai-insights') {
    // No clean signal — paradocs_assessment is populated by the
    // consolidated-narrative path as a side effect, not by the
    // report-insights / ai-insights services themselves. Counting
    // reports with paradocs_assessment NOT NULL overcounts by ~100x.
    // Fall back to the V11.17.84 audit estimate spread across days.
    return new Map()
  }
  if (service === 'rewrite-pipeline') {
    return countByDay(supabase, 'ai_rewrite_audit', fromIso, toIso)
  }
  if (service === 'ai-tagger') {
    return countByDay(supabase, 'reports', fromIso, toIso, function (q: any) {
      return q.eq('has_photo_video', true)
    })
  }
  // other-small — no measured signal, fall back to audit estimate.
  return new Map()
}

// ─── Idempotency check ─────────────────────────────────────────────────

async function alreadyBackfilled(
  supabase: any,
  service: string,
  day: string,
): Promise<boolean> {
  var marker = 'backfill-V11.17.86-' + service + '-' + day
  try {
    var res = await supabase
      .from('paradocs_narrative_cost_log')
      .select('id')
      .eq('request_id', marker)
      .limit(1)
    if (res.error) {
      console.warn('[idempotency] check error for ' + marker + ': ' + res.error.message)
      return false
    }
    return (res.data || []).length > 0
  } catch (e: any) {
    console.warn('[idempotency] threw for ' + marker + ': ' + (e?.message || e))
    return false
  }
}

// ─── Main ──────────────────────────────────────────────────────────────

interface PlannedRow {
  day: string
  service: string
  volume: number
  measured: boolean   // true if from a DB count, false if from audit-fallback
  costUsd: number
  inputTokens: number
  outputTokens: number
  model: string
  requestId: string
}

async function main() {
  var args = parseArgs(process.argv)
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  var supabase = createClient(supabaseUrl, supabaseKey)

  console.log('=== V11.17.86 historical AI cost backfill ===')
  console.log('From:    ' + args.from)
  console.log('To:      ' + args.to)
  console.log('Mode:    ' + (args.apply ? 'APPLY (will insert rows)' : 'DRY RUN (no writes)'))
  console.log('')
  console.log('NOTE: All inserted rows are ESTIMATES, not measured per-call')
  console.log('      cost. Mark every row with the V11.17.86 marker so they')
  console.log('      can be deleted in bulk later. The forward path is')
  console.log('      already wired (V11.17.84) so this script only fills')
  console.log('      the historical gap.')
  console.log('')

  // Enumerate days in the window.
  var days: string[] = eachDay(args.from, args.to)
  console.log('Days in window: ' + days.length + ' (' + days[0] + ' .. ' + days[days.length - 1] + ')')
  console.log('')

  // Pre-fetch volume signals per service.
  var volumeByService = new Map<string, Map<string, number>>()
  for (var si = 0; si < SERVICES.length; si++) {
    var spec = SERVICES[si]
    process.stdout.write('  fetching volume signal for ' + spec.service.padEnd(20) + ' ... ')
    var v = await volumeFor(spec.service, supabase, args.from, args.to)
    var total = 0
    v.forEach(function (n) { total += n })
    volumeByService.set(spec.service, v)
    console.log(total + ' total calls across window (' + v.size + ' distinct days)')
  }
  console.log('')

  // Plan rows.
  var planned: PlannedRow[] = []
  var skippedAlreadyBackfilled = 0
  for (var si2 = 0; si2 < SERVICES.length; si2++) {
    var spec2 = SERVICES[si2]
    var volMap = volumeByService.get(spec2.service) || new Map<string, number>()
    var totalMeasured = 0
    volMap.forEach(function (nn) { totalMeasured += nn })
    var auditCallsEquivalent = Math.round(spec2.auditTotalUsd / spec2.costPerCall)
    var useFallback = totalMeasured === 0
    var fallbackPerDay = useFallback ? Math.ceil(auditCallsEquivalent / days.length) : 0

    for (var di = 0; di < days.length; di++) {
      var day = days[di]
      // Idempotency: skip days already backfilled for this service.
      // Only check during --apply; the dry-run prints everything so the
      // operator can see what would happen.
      if (args.apply) {
        var exists = await alreadyBackfilled(supabase, spec2.service, day)
        if (exists) { skippedAlreadyBackfilled++; continue }
      }

      var volume = useFallback ? fallbackPerDay : (volMap.get(day) || 0)
      if (volume === 0) continue  // nothing to log for this day

      var cost = volume * spec2.costPerCall
      planned.push({
        day: day,
        service: spec2.service,
        volume: volume,
        measured: !useFallback,
        costUsd: cost,
        inputTokens: volume * spec2.avgInputTokens,
        outputTokens: volume * spec2.avgOutputTokens,
        model: spec2.model + ' (backfill-estimate)',
        requestId: 'backfill-V11.17.86-' + spec2.service + '-' + day,
      })
    }
  }

  // Summary by service.
  console.log('=== Planned rows ===')
  console.log('day        service              volume   cost      source')
  console.log('---------- -------------------- -------- --------- ---------')
  var totalCost = 0
  var byService = new Map<string, { rows: number; cost: number; measured: boolean }>()
  for (var pi = 0; pi < planned.length; pi++) {
    var p = planned[pi]
    console.log(
      p.day + ' ' +
      p.service.padEnd(20) + ' ' +
      String(p.volume).padStart(8) + ' ' +
      ('$' + p.costUsd.toFixed(4)).padStart(9) + ' ' +
      (p.measured ? 'measured' : 'audit-fallback'),
    )
    totalCost += p.costUsd
    var agg = byService.get(p.service) || { rows: 0, cost: 0, measured: p.measured }
    agg.rows++
    agg.cost += p.costUsd
    byService.set(p.service, agg)
  }
  console.log('')
  console.log('=== Per-service summary ===')
  console.log('service              rows    cost      source')
  console.log('-------------------- ------- --------- ----------------')
  byService.forEach(function (agg2, svc) {
    console.log(
      svc.padEnd(20) + ' ' +
      String(agg2.rows).padStart(7) + ' ' +
      ('$' + agg2.cost.toFixed(4)).padStart(9) + ' ' +
      (agg2.measured ? 'measured' : 'audit-fallback'),
    )
  })
  console.log('')
  console.log('TOTAL rows planned:        ' + planned.length)
  console.log('TOTAL estimated cost:      $' + totalCost.toFixed(4))
  if (args.apply) {
    console.log('Skipped (already backfilled): ' + skippedAlreadyBackfilled)
  }
  console.log('')

  if (args.dryRun) {
    console.log('Dry run complete. Re-run with --apply to insert.')
    return
  }

  // Apply mode — insert rows.
  console.log('=== Inserting rows ===')
  var inserted = 0
  var insertErrors = 0
  for (var ri = 0; ri < planned.length; ri++) {
    var row = planned[ri]
    var createdAt = row.day + 'T12:00:00Z'  // noon UTC lands cleanly in by-day bucket
    var dbRow = {
      service: row.service,
      model: row.model,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
      cache_creation_tokens: null,
      cache_read_tokens: null,
      cost_usd: row.costUsd,
      status: 'completed',
      reason: row.measured
        ? 'historical-backfill (estimate from measured volume)'
        : 'historical-backfill (estimate from V11.17.84 audit, no measured signal)',
      report_id: null,
      user_id: null,
      request_id: row.requestId,
      created_at: createdAt,
    }
    try {
      var res = await supabase.from('paradocs_narrative_cost_log').insert(dbRow)
      if (res && res.error) {
        insertErrors++
        console.warn('  ✗ ' + row.requestId + ': ' + res.error.message)
      } else {
        inserted++
      }
    } catch (e: any) {
      insertErrors++
      console.warn('  ✗ ' + row.requestId + ' threw: ' + (e?.message || e))
    }
  }

  console.log('')
  console.log('=== Apply summary ===')
  console.log('Inserted:                  ' + inserted)
  console.log('Errors:                    ' + insertErrors)
  console.log('Skipped (already backfilled): ' + skippedAlreadyBackfilled)
  console.log('Total estimated cost added: $' + totalCost.toFixed(4))
  console.log('')
  console.log('To verify:')
  console.log('  SELECT DATE(created_at) AS day, service, SUM(cost_usd) AS spend, COUNT(*) AS rows')
  console.log('  FROM paradocs_narrative_cost_log')
  console.log('  WHERE created_at >= \'' + args.from + '\' GROUP BY DATE(created_at), service')
  console.log('  ORDER BY day DESC, spend DESC;')
  console.log('')
  console.log('To delete all V11.17.86 backfill rows (if needed later):')
  console.log('  DELETE FROM paradocs_narrative_cost_log')
  console.log('  WHERE request_id LIKE \'backfill-V11.17.86-%\';')
}

main().catch(function (e) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})
