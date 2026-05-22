#!/usr/bin/env tsx
/**
 * V11.14.8 — Drain-pending loop.
 *
 * Runs scripts/batch-ingest-worker.ts repeatedly until the queue of
 * pending_review reports without paradocs_narrative is empty. Each
 * iteration handles up to 5000 reports (Supabase's PostgREST cap on
 * a single query). With 99k pending after the 100k mass run, this
 * means ~20 sequential iterations.
 *
 * Each iteration is independent: the batch worker submits an
 * Anthropic batch, polls until complete, persists results with
 * auto-promote/auto-reject, then exits. We re-query the DB count
 * after each run and stop when it hits 0.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/drain-pending-loop.ts                # drain forever
 *   tsx scripts/drain-pending-loop.ts --max-iters 5  # cap iterations
 *
 * Cost: same per-report rate as a single batch worker run
 * (~$0.003/report at batch discount). 99k reports ≈ $300.
 */

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'

interface CliArgs {
  maxIters: number
  limitPerIter: number
}

function parseArgs(argv: string[]): CliArgs {
  var args: CliArgs = { maxIters: 100, limitPerIter: 5000 }
  for (var i = 2; i < argv.length; i++) {
    var a = argv[i]
    if (a === '--max-iters') { args.maxIters = parseInt(argv[++i], 10) || 100 }
    else if (a === '--limit-per-iter') { args.limitPerIter = parseInt(argv[++i], 10) || 5000 }
    else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/drain-pending-loop.ts [--max-iters N] [--limit-per-iter N]')
      process.exit(0)
    }
  }
  return args
}

async function getPendingCount(): Promise<number> {
  var sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  var res = await sb
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_review')
    .is('paradocs_narrative', null)
  return res.count || 0
}

function runBatchWorker(limitPerIter: number): Promise<number> {
  return new Promise(function (resolve) {
    var child = spawn(
      'npx',
      ['tsx', 'scripts/batch-ingest-worker.ts', '--backfill', '--limit', String(limitPerIter), '--max-wait', '3600'],
      { stdio: 'inherit', env: process.env },
    )
    child.on('exit', function (code) { resolve(code || 0) })
    child.on('error', function (err) {
      console.error('Spawn error:', err.message || err)
      resolve(1)
    })
  })
}

async function main() {
  var args = parseArgs(process.argv)
  console.log('=== Drain-pending loop ===')
  console.log('Max iterations:    ' + args.maxIters)
  console.log('Limit per iter:    ' + args.limitPerIter + ' (Supabase PostgREST cap = 5000)')

  var startCount = await getPendingCount()
  console.log('Starting pending:  ' + startCount)
  console.log('')

  if (startCount === 0) {
    console.log('Nothing to drain. Exiting.')
    return
  }

  var startTime = Date.now()
  for (var iter = 1; iter <= args.maxIters; iter++) {
    var currentCount = await getPendingCount()
    if (currentCount === 0) {
      console.log('\n══════════════════════════════════════════════════════════')
      console.log('Queue empty after iteration ' + (iter - 1) + '. Done.')
      break
    }

    var elapsedSec = Math.floor((Date.now() - startTime) / 1000)
    var elapsedMin = Math.floor(elapsedSec / 60)
    var processed = startCount - currentCount
    var avgPerIter = iter > 1 ? processed / (iter - 1) : 0
    var estIters = avgPerIter > 0 ? Math.ceil(currentCount / avgPerIter) : Math.ceil(currentCount / args.limitPerIter)
    var estMinRemaining = avgPerIter > 0 ? Math.ceil((currentCount / avgPerIter) * (elapsedMin / Math.max(1, iter - 1))) : 'unknown'

    console.log('\n══════════════════════════════════════════════════════════')
    console.log('Iteration ' + iter + '/' + args.maxIters)
    console.log('Pending now:           ' + currentCount)
    console.log('Processed so far:      ' + processed + ' (over ' + (iter - 1) + ' iters)')
    console.log('Elapsed:               ' + elapsedMin + 'm')
    console.log('Est iters remaining:   ' + estIters)
    console.log('Est time remaining:    ' + estMinRemaining + 'm')
    console.log('══════════════════════════════════════════════════════════\n')

    var code = await runBatchWorker(args.limitPerIter)
    if (code !== 0) {
      console.warn('\n[iter ' + iter + '] batch worker exited with code ' + code + ' — retrying after 30s pause')
      await new Promise(function (r) { setTimeout(r, 30_000) })
    }
  }

  var finalCount = await getPendingCount()
  var totalSec = Math.floor((Date.now() - startTime) / 1000)

  // V11.14.8.2 — refresh report_region_counts materialized view so the
  // choropleth + region-totals panel reflect the freshly-drained
  // reports. The view filters on status='approved' AND country_code IS
  // NOT NULL; new auto-promoted reports from the drain land in
  // 'approved' but the view doesn't pick them up until refreshed.
  console.log('\nRefreshing report_region_counts materialized view...')
  var sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  var refresh = await sb.rpc('refresh_region_counts')
  if (refresh.error) {
    console.warn('  refresh error (non-fatal): ' + refresh.error.message)
  } else {
    console.log('  ✓ region counts refreshed (choropleth + panel now current)')
  }

  console.log('\n══════════════════════════════════════════════════════════')
  console.log('Drain loop complete')
  console.log('  Started with:  ' + startCount + ' pending')
  console.log('  Ended with:    ' + finalCount + ' pending')
  console.log('  Drained:       ' + (startCount - finalCount))
  console.log('  Wall time:     ' + Math.floor(totalSec / 60) + 'm ' + (totalSec % 60) + 's')
  console.log('══════════════════════════════════════════════════════════')
}

main().catch(function (e) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})
