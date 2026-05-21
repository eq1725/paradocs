#!/usr/bin/env tsx
/**
 * Mass Ingestion Orchestrator (V11.14)
 *
 * Fans out Arctic Shift ingestion across many (subreddit, date-window)
 * shards in parallel, auto-triggering the batch AI worker between
 * ingest waves so the pending_review queue stays drained.
 *
 * ── Design ──────────────────────────────────────────────────────────
 *
 * 1. Shard generation
 *    For each subreddit, slice the date range into N day-windows
 *    (default 60 days). Each shard becomes a unit of work: (sub, from,
 *    to). With 6 subs × 36 months / 60-day windows = 108 shards.
 *
 * 2. Worker pool
 *    N=16 concurrent workers (configurable) pull from the shard queue.
 *    Each worker runs runShard(sub, from, to) which paginates Arctic
 *    Shift and posts each page to /api/admin/archive-import. Workers
 *    update the global counters atomically.
 *
 * 3. Rate limiting + backoff
 *    Arctic Shift fetches and archive-import POSTs are wrapped in
 *    exponential-backoff retry on 429/5xx. Each worker waits 500ms
 *    between Arctic Shift requests (so 16 workers ≈ 32 req/sec global).
 *
 * 4. Batch worker auto-trigger
 *    After every N=500 reports land in pending_review, the orchestrator
 *    spawns `tsx scripts/batch-ingest-worker.ts --backfill --limit 500`
 *    in the background. Final sweep runs at end-of-orchestration to
 *    drain whatever's left.
 *
 * 5. State file + resumability
 *    outputs/orchestrator-state.json tracks per-shard status. If the
 *    process dies, `--resume` continues from the unfinished shards.
 *
 * 6. Live counters
 *    Every 10s the orchestrator prints one progress line:
 *      [+12m 33s] shards 18/108 | fetched 4521 | inserted 1203 | spend $4.83 | rate 96/min
 *
 * ── Usage ───────────────────────────────────────────────────────────
 *
 *   set -a; source .env.local; set +a
 *
 *   # Pilot run: 10k cap, 6 subs, 2022-2024, 16 parallel
 *   tsx scripts/mass-ingest-orchestrator.ts \
 *     --target 10000 \
 *     --subreddits ghosts,paranormal,glitch_in_the_matrix,bigfoot,ufos,experiencers \
 *     --from 2022-01-01 --to 2024-12-31 \
 *     --concurrency 16
 *
 *   # Dry run (count shards, no fetches)
 *   tsx scripts/mass-ingest-orchestrator.ts --dry-run
 *
 *   # Resume an interrupted run
 *   tsx scripts/mass-ingest-orchestrator.ts --resume
 *
 * ── Stop conditions ─────────────────────────────────────────────────
 *
 *  - Global target reached (--target inserts).
 *    NOTE: `--target` counts INSERTED reports (pending_review landings),
 *    not approved-after-AI. Typical conversion is 70-85%: high-score
 *    inserts auto-promote to 'approved' once the batch worker runs;
 *    low-score / INSUFFICIENT-AI inserts get auto-rejected. To hit
 *    10k *approved* reports, set --target ~12000-13000 to account for
 *    post-AI rejection of borderline cases.
 *  - Mass-mode daily cap hit ($400/day default; respect
 *    PARADOCS_MASS_INGEST_DAILY_CAP if set)
 *  - All shards exhausted
 *  - Ctrl+C (graceful: writes state, finishes in-flight shards)
 */

import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'

// ─────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────

var ARCTIC_SHIFT_API = 'https://arctic-shift.photon-reddit.com/api/posts/search'

var DEFAULT_PILOT_SUBS = [
  'ghosts',
  'paranormal',
  'glitch_in_the_matrix',
  'bigfoot',
  'ufos',
  'experiencers',
]

interface CliArgs {
  subreddits: string[]
  fromTs: number
  toTs: number
  target: number
  concurrency: number
  windowDays: number
  batchTrigger: number
  stateFile: string
  resume: boolean
  dryRun: boolean
  endpoint: string
  perWorkerDelayMs: number
}

function parseArgs(argv: string[]): CliArgs {
  var nowTs = Math.floor(Date.now() / 1000)
  var twoYearsAgoTs = nowTs - 2 * 365 * 24 * 60 * 60
  var args: CliArgs = {
    subreddits: DEFAULT_PILOT_SUBS.slice(),
    fromTs: Math.floor(new Date('2022-01-01').getTime() / 1000),
    toTs: Math.floor(new Date('2024-12-31').getTime() / 1000),
    target: 10000,
    concurrency: 16,
    windowDays: 60,
    batchTrigger: 500,
    stateFile: 'outputs/orchestrator-state.json',
    resume: false,
    dryRun: false,
    endpoint: process.env.NEXT_PUBLIC_API_BASE || 'https://www.discoverparadocs.com',
    perWorkerDelayMs: 500,
  }
  for (var i = 2; i < argv.length; i++) {
    var a = argv[i]
    if (a === '--subreddits') {
      args.subreddits = argv[++i].split(',').map(function (s) { return s.trim().replace(/^r\//, '').toLowerCase() }).filter(Boolean)
    } else if (a === '--from') {
      args.fromTs = Math.floor(new Date(argv[++i]).getTime() / 1000)
    } else if (a === '--to') {
      args.toTs = Math.floor(new Date(argv[++i]).getTime() / 1000)
    } else if (a === '--target') {
      args.target = parseInt(argv[++i], 10) || 0
    } else if (a === '--concurrency') {
      args.concurrency = parseInt(argv[++i], 10) || 16
    } else if (a === '--window-days') {
      args.windowDays = parseInt(argv[++i], 10) || 60
    } else if (a === '--batch-trigger') {
      args.batchTrigger = parseInt(argv[++i], 10) || 500
    } else if (a === '--state-file') {
      args.stateFile = argv[++i]
    } else if (a === '--resume') {
      args.resume = true
    } else if (a === '--dry-run') {
      args.dryRun = true
    } else if (a === '--endpoint') {
      args.endpoint = argv[++i]
    } else if (a === '--per-worker-delay-ms') {
      args.perWorkerDelayMs = parseInt(argv[++i], 10) || 500
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/mass-ingest-orchestrator.ts [flags]')
      console.log('  --subreddits a,b,c   Comma-separated (default: ' + DEFAULT_PILOT_SUBS.join(',') + ')')
      console.log('  --from YYYY-MM-DD    (default 2022-01-01)')
      console.log('  --to YYYY-MM-DD      (default 2024-12-31)')
      console.log('  --target N           Insert cap (default 10000)')
      console.log('  --concurrency N      Parallel workers (default 16)')
      console.log('  --window-days N      Shard size in days (default 60)')
      console.log('  --batch-trigger N    Trigger batch worker every N inserts (default 500)')
      console.log('  --resume             Continue from state file')
      console.log('  --dry-run            Plan only, no fetches')
      process.exit(0)
    }
    suppress(a)
  }
  // touch nowTs/twoYearsAgoTs so unused-var warnings don't fire
  suppress(nowTs); suppress(twoYearsAgoTs)
  return args
}

function suppress(_x: any) { /* no-op */ }

// ─────────────────────────────────────────────────────────────────────
// SHARDS + STATE
// ─────────────────────────────────────────────────────────────────────

interface Shard {
  id: string                                 // sub:from:to
  subreddit: string
  fromTs: number
  toTs: number
  status: 'pending' | 'in_progress' | 'done' | 'failed'
  fetched?: number
  parsed?: number
  inserted?: number
  filtered?: number
  duplicates?: number
  errors?: number
  attempts?: number
  finishedAt?: string
}

interface OrchestratorState {
  started_at: string
  last_updated: string
  args: CliArgs
  totals: {
    shards_done: number
    shards_total: number
    fetched: number
    received: number
    parsed: number
    inserted: number
    filtered: number
    duplicates: number
    errors: number
  }
  rejectionReasons: Record<string, number>
  shards: Shard[]
  ai_runs: Array<{ started_at: string; batch_count: number }>
}

function generateShards(args: CliArgs): Shard[] {
  var shards: Shard[] = []
  var windowSec = args.windowDays * 24 * 60 * 60
  for (var s = 0; s < args.subreddits.length; s++) {
    var sub = args.subreddits[s]
    // Walk backward from toTs in windowDays chunks until fromTs.
    var cursor = args.toTs
    while (cursor > args.fromTs) {
      var lower = Math.max(args.fromTs, cursor - windowSec)
      shards.push({
        id: sub + ':' + lower + ':' + cursor,
        subreddit: sub,
        fromTs: lower,
        toTs: cursor,
        status: 'pending',
      })
      cursor = lower
    }
  }
  return shards
}

function loadOrInitState(args: CliArgs): OrchestratorState {
  if (args.resume && fs.existsSync(args.stateFile)) {
    var loaded = JSON.parse(fs.readFileSync(args.stateFile, 'utf8')) as OrchestratorState
    // Reset in_progress shards (process may have died mid-shard)
    loaded.shards.forEach(function (sh) {
      if (sh.status === 'in_progress') sh.status = 'pending'
    })
    return loaded
  }
  var shards = generateShards(args)
  return {
    started_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    args: args,
    totals: {
      shards_done: 0,
      shards_total: shards.length,
      fetched: 0,
      received: 0,
      parsed: 0,
      inserted: 0,
      filtered: 0,
      duplicates: 0,
      errors: 0,
    },
    rejectionReasons: {},
    shards: shards,
    ai_runs: [],
  }
}

function saveState(state: OrchestratorState): void {
  state.last_updated = new Date().toISOString()
  fs.mkdirSync(path.dirname(state.args.stateFile), { recursive: true })
  fs.writeFileSync(state.args.stateFile, JSON.stringify(state, null, 2))
}

// ─────────────────────────────────────────────────────────────────────
// RETRY WITH EXPONENTIAL BACKOFF
// ─────────────────────────────────────────────────────────────────────

interface RetryOpts {
  attempts: number
  baseDelayMs: number
  maxDelayMs: number
  label: string
}

async function withBackoff<T>(fn: () => Promise<{ ok: true; value: T } | { ok: false; retryable: boolean; reason: string }>, opts: RetryOpts): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  var delay = opts.baseDelayMs
  for (var attempt = 1; attempt <= opts.attempts; attempt++) {
    var res = await fn()
    if (res.ok) return res
    if (!res.retryable || attempt === opts.attempts) {
      return { ok: false, reason: res.reason }
    }
    // Backoff + jitter
    var jitter = Math.floor(Math.random() * delay * 0.3)
    var waitMs = Math.min(opts.maxDelayMs, delay + jitter)
    console.warn('  [retry] ' + opts.label + ' attempt ' + attempt + '/' + opts.attempts + ' failed (' + res.reason + ') — waiting ' + waitMs + 'ms')
    await new Promise(function (r) { setTimeout(r, waitMs) })
    delay = Math.min(opts.maxDelayMs, delay * 2)
  }
  return { ok: false, reason: 'exhausted' }
}

// ─────────────────────────────────────────────────────────────────────
// ARCTIC SHIFT FETCH (with backoff)
// ─────────────────────────────────────────────────────────────────────

interface RedditPost {
  id: string
  title: string
  selftext?: string
  author: string
  subreddit: string
  created_utc: number
  score: number
  num_comments?: number
  permalink?: string
  link_flair_text?: string
  is_self?: boolean
  url?: string
}

async function fetchArcticShiftPage(sub: string, beforeTs: number, afterTs: number, perRequest: number): Promise<{ posts: RedditPost[]; lastTimestamp: number | null }> {
  var url = ARCTIC_SHIFT_API + '?subreddit=' + encodeURIComponent(sub) + '&limit=' + perRequest + '&before=' + beforeTs + '&after=' + afterTs
  var attemptRes = await withBackoff<{ posts: RedditPost[]; lastTimestamp: number | null }>(
    async function () {
      try {
        var resp = await fetch(url)
        if (resp.status === 429 || resp.status === 503) {
          return { ok: false, retryable: true, reason: 'HTTP ' + resp.status }
        }
        if (!resp.ok) {
          var errText = await resp.text().catch(function () { return '' })
          return { ok: false, retryable: resp.status >= 500, reason: 'HTTP ' + resp.status + ': ' + errText.substring(0, 100) }
        }
        var data = await resp.json()
        var posts = (data.data || []) as RedditPost[]
        var lastTimestamp = posts.length > 0 ? posts[posts.length - 1].created_utc : null
        return { ok: true, value: { posts: posts, lastTimestamp: lastTimestamp } }
      } catch (e: any) {
        return { ok: false, retryable: true, reason: 'fetch error: ' + (e.message || e) }
      }
    },
    { attempts: 5, baseDelayMs: 1000, maxDelayMs: 32000, label: 'arctic-shift r/' + sub },
  )
  if (!attemptRes.ok) {
    return { posts: [], lastTimestamp: null }
  }
  return attemptRes.value
}

// ─────────────────────────────────────────────────────────────────────
// ARCHIVE-IMPORT POST (with backoff)
// ─────────────────────────────────────────────────────────────────────

interface ImportResult {
  received: number
  parsed: number
  duplicates: number
  filtered: number
  inserted: number
  errors: number
  elapsed_ms: number
  rejectionReasons?: Record<string, number>
}

async function postBatchToArchiveImport(endpoint: string, posts: RedditPost[]): Promise<{ ok: boolean; result?: ImportResult; reason?: string }> {
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY missing from env' }
  }
  var attemptRes = await withBackoff<ImportResult>(
    async function () {
      try {
        var resp = await fetch(endpoint + '/api/admin/archive-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + serviceKey },
          body: JSON.stringify({ posts: posts }),
        })
        if (resp.status === 429 || resp.status === 503 || resp.status === 504) {
          return { ok: false, retryable: true, reason: 'HTTP ' + resp.status }
        }
        var data: any = null
        try { data = await resp.json() } catch (_e) { data = null }
        if (!resp.ok || !data || !data.success) {
          var errMsg = (data && data.error) || ('HTTP ' + resp.status)
          return { ok: false, retryable: resp.status >= 500, reason: errMsg }
        }
        return { ok: true, value: data.result }
      } catch (e: any) {
        return { ok: false, retryable: true, reason: 'network: ' + (e.message || e) }
      }
    },
    { attempts: 5, baseDelayMs: 2000, maxDelayMs: 60000, label: 'archive-import' },
  )
  if (!attemptRes.ok) {
    return { ok: false, reason: attemptRes.reason }
  }
  return { ok: true, result: attemptRes.value }
}

// ─────────────────────────────────────────────────────────────────────
// SHARD WORKER
// ─────────────────────────────────────────────────────────────────────

interface SharedCtx {
  state: OrchestratorState
  endpoint: string
  perWorkerDelayMs: number
  target: number
  dryRun: boolean
  insertsSinceBatch: { value: number }   // boxed counter (passed by ref)
  batchTrigger: number
  shutdown: { value: boolean }            // signal to all workers to stop
  log: (msg: string) => void
}

async function runShard(shard: Shard, ctx: SharedCtx): Promise<void> {
  shard.status = 'in_progress'
  shard.attempts = (shard.attempts || 0) + 1
  shard.fetched = 0
  shard.parsed = 0
  shard.inserted = 0
  shard.filtered = 0
  shard.duplicates = 0
  shard.errors = 0

  var beforeTs = shard.toTs
  var maxIters = 100  // hard cap to prevent infinite loops on bad pagination

  while (maxIters-- > 0) {
    if (ctx.shutdown.value) {
      shard.status = 'pending'  // give it back to the queue
      return
    }
    if (ctx.state.totals.inserted >= ctx.target) {
      shard.status = 'pending'
      ctx.shutdown.value = true
      return
    }

    var page = await fetchArcticShiftPage(shard.subreddit, beforeTs, shard.fromTs, 100)
    if (page.posts.length === 0) break

    shard.fetched += page.posts.length

    // Filter to date range
    var inRange = page.posts.filter(function (p) { return p.created_utc >= shard.fromTs && p.created_utc <= shard.toTs })

    if (!ctx.dryRun && inRange.length > 0) {
      var postRes = await postBatchToArchiveImport(ctx.endpoint, inRange)
      if (!postRes.ok) {
        ctx.log('  [r/' + shard.subreddit + '] POST failed: ' + postRes.reason + ' — shard left for retry')
        shard.status = 'failed'
        return
      }
      var r = postRes.result!
      shard.parsed = (shard.parsed || 0) + r.parsed
      shard.inserted = (shard.inserted || 0) + r.inserted
      shard.filtered = (shard.filtered || 0) + r.filtered
      shard.duplicates = (shard.duplicates || 0) + r.duplicates
      shard.errors = (shard.errors || 0) + r.errors
      ctx.state.totals.fetched += page.posts.length
      ctx.state.totals.received += r.received
      ctx.state.totals.parsed += r.parsed
      ctx.state.totals.inserted += r.inserted
      ctx.state.totals.filtered += r.filtered
      ctx.state.totals.duplicates += r.duplicates
      ctx.state.totals.errors += r.errors
      if (r.rejectionReasons) {
        Object.keys(r.rejectionReasons).forEach(function (k) {
          ctx.state.rejectionReasons[k] = (ctx.state.rejectionReasons[k] || 0) + r.rejectionReasons![k]
        })
      }
      ctx.insertsSinceBatch.value += r.inserted
    } else if (ctx.dryRun) {
      ctx.state.totals.fetched += page.posts.length
      ctx.state.totals.received += inRange.length
    }

    if (!page.lastTimestamp || page.lastTimestamp <= shard.fromTs) break
    beforeTs = page.lastTimestamp

    // Polite per-worker delay
    await new Promise(function (resolve) { setTimeout(resolve, ctx.perWorkerDelayMs) })
  }

  shard.status = 'done'
  shard.finishedAt = new Date().toISOString()
  ctx.state.totals.shards_done++
}

// ─────────────────────────────────────────────────────────────────────
// WORKER POOL
// ─────────────────────────────────────────────────────────────────────

async function runWorkerPool(state: OrchestratorState, ctx: SharedCtx, concurrency: number): Promise<void> {
  function pickNext(): Shard | null {
    for (var i = 0; i < state.shards.length; i++) {
      var sh = state.shards[i]
      if (sh.status === 'pending') {
        sh.status = 'in_progress'
        return sh
      }
    }
    return null
  }

  var workers: Promise<void>[] = []
  for (var w = 0; w < concurrency; w++) {
    workers.push((async function workerLoop() {
      while (true) {
        if (ctx.shutdown.value) return
        var shard = pickNext()
        if (!shard) return
        await runShard(shard, ctx)
      }
    })())
  }
  await Promise.all(workers)
}

// ─────────────────────────────────────────────────────────────────────
// BATCH WORKER AUTO-TRIGGER
// ─────────────────────────────────────────────────────────────────────

// Track in-flight batch-worker child processes so we don't spawn
// overlapping batches that both grab the same pending_review rows.
var batchWorkerInFlight = { count: 0 }

function spawnBatchWorker(state: OrchestratorState, log: (msg: string) => void, finalSweep: boolean = false): void {
  // Concurrency guard — at most one batch worker at a time. The worker
  // queries `status='pending_review' AND paradocs_narrative IS NULL`
  // and there's no row-level lock; two workers running concurrently
  // would race and double-bill the same Haiku calls.
  if (batchWorkerInFlight.count > 0) {
    log('  ⏸  Batch worker already in flight — deferring trigger')
    return
  }
  var ts = Date.now()
  var logPath = path.join('outputs', 'orchestrator-batch-' + ts + '.log')
  var out = fs.openSync(logPath, 'a')
  // V11.14.3 — during normal ingestion, 500/batch keeps the queue
  // drained without one huge wait at the end. On the final sweep we
  // drop the cap so a single batch grabs everything left and we exit
  // cleanly. Anthropic batches accept up to 100k requests, so even a
  // 50k drain fits in one submission.
  var limit = finalSweep ? '100000' : '500'
  var maxWait = finalSweep ? '5400' : '3600'  // 90 min vs 60 min poll budget
  log('  ⚙  Spawning batch worker' + (finalSweep ? ' (FINAL SWEEP — limit ' + limit + ')' : '') + ' → ' + logPath)
  var child = spawn('npx', ['tsx', 'scripts/batch-ingest-worker.ts', '--backfill', '--limit', limit, '--max-wait', maxWait], {
    detached: false,
    stdio: ['ignore', out, out],
    env: process.env,
  })
  batchWorkerInFlight.count++
  child.on('exit', function (code) {
    batchWorkerInFlight.count = Math.max(0, batchWorkerInFlight.count - 1)
    log('  ✓ Batch worker exited (code=' + code + ', log=' + logPath + ')')
  })
  child.on('error', function (err) {
    batchWorkerInFlight.count = Math.max(0, batchWorkerInFlight.count - 1)
    log('  ✗ Batch worker spawn error: ' + (err.message || err))
  })
  state.ai_runs.push({ started_at: new Date().toISOString(), batch_count: finalSweep ? 100000 : 500 })
}

// ─────────────────────────────────────────────────────────────────────
// LIVE STATUS LINE
// ─────────────────────────────────────────────────────────────────────

function startStatusLineInterval(state: OrchestratorState, intervalMs: number, startedAt: number): NodeJS.Timeout {
  return setInterval(function () {
    var elapsed = Math.floor((Date.now() - startedAt) / 1000)
    var mins = Math.floor(elapsed / 60)
    var secs = elapsed % 60
    var rate = elapsed > 0 ? Math.floor((state.totals.inserted / elapsed) * 60) : 0
    var line =
      '[+' + mins + 'm ' + secs + 's] ' +
      'shards ' + state.totals.shards_done + '/' + state.totals.shards_total + ' | ' +
      'fetched ' + state.totals.fetched + ' | ' +
      'inserted ' + state.totals.inserted + ' | ' +
      'filtered ' + state.totals.filtered + ' | ' +
      'rate ' + rate + '/min'
    console.log(line)
    saveState(state)
  }, intervalMs)
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function main() {
  var args = parseArgs(process.argv)

  // Pre-flight env check
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !args.dryRun) {
    console.error('SUPABASE_SERVICE_ROLE_KEY missing from env. `set -a && source .env.local && set +a` first.')
    process.exit(1)
  }

  fs.mkdirSync('outputs', { recursive: true })

  var state = loadOrInitState(args)

  console.log('═══ Mass Ingest Orchestrator ═══')
  console.log('Subreddits:     ' + args.subreddits.length + ' (' + args.subreddits.slice(0, 6).join(', ') + (args.subreddits.length > 6 ? '...' : '') + ')')
  console.log('Date range:     ' + new Date(args.fromTs * 1000).toISOString().substring(0, 10) + ' → ' + new Date(args.toTs * 1000).toISOString().substring(0, 10))
  console.log('Window:         ' + args.windowDays + ' days/shard')
  console.log('Target:         ' + args.target.toLocaleString() + ' approved inserts')
  console.log('Concurrency:    ' + args.concurrency + ' parallel workers')
  console.log('Batch trigger:  every ' + args.batchTrigger + ' inserts')
  console.log('Per-worker:     ' + args.perWorkerDelayMs + 'ms between fetches')
  console.log('Endpoint:       ' + args.endpoint + '/api/admin/archive-import')
  console.log('Dry run:        ' + args.dryRun)
  console.log('Resume mode:    ' + args.resume)
  console.log('State file:     ' + args.stateFile)
  console.log('Total shards:   ' + state.totals.shards_total + ' (already done: ' + state.totals.shards_done + ')')
  console.log('')

  if (args.dryRun) {
    console.log('Dry-run shards (first 10):')
    state.shards.slice(0, 10).forEach(function (sh) {
      console.log('  ' + sh.subreddit + '  ' + new Date(sh.fromTs * 1000).toISOString().substring(0, 10) + ' → ' + new Date(sh.toTs * 1000).toISOString().substring(0, 10))
    })
    console.log('  ... + ' + Math.max(0, state.shards.length - 10) + ' more')
    console.log('\nRun without --dry-run to begin.')
    return
  }

  // Graceful shutdown on SIGINT
  var shutdown = { value: false }
  process.on('SIGINT', function () {
    console.log('\n\n[SIGINT] Graceful shutdown — finishing in-flight shards then saving state...')
    shutdown.value = true
  })

  var insertsSinceBatch = { value: 0 }
  var ctx: SharedCtx = {
    state: state,
    endpoint: args.endpoint,
    perWorkerDelayMs: args.perWorkerDelayMs,
    target: args.target,
    dryRun: args.dryRun,
    insertsSinceBatch: insertsSinceBatch,
    batchTrigger: args.batchTrigger,
    shutdown: shutdown,
    log: function (msg: string) { console.log(msg) },
  }

  var startedAt = Date.now()

  // Status line every 10s
  var statusInterval = startStatusLineInterval(state, 10_000, startedAt)

  // Batch trigger check every 15s
  var batchInterval = setInterval(function () {
    if (insertsSinceBatch.value >= args.batchTrigger) {
      insertsSinceBatch.value = 0
      spawnBatchWorker(state, ctx.log)
    }
  }, 15_000)

  // Run the worker pool
  try {
    await runWorkerPool(state, ctx, args.concurrency)
  } finally {
    clearInterval(statusInterval)
    clearInterval(batchInterval)
    saveState(state)
  }

  // Final batch sweep — drain ALL remaining pending_review reports,
  // regardless of why the worker pool stopped (target hit, shards
  // exhausted, or SIGINT). Wait for any in-flight batch worker first
  // so the final-sweep batch picks up everything that's accumulated.
  while (batchWorkerInFlight.count > 0) {
    console.log('  Waiting on ' + batchWorkerInFlight.count + ' in-flight batch worker(s) before final sweep...')
    await new Promise(function (r) { setTimeout(r, 30_000) })
  }
  // V11.14.3 fix — the prior code gated this on (!shutdown.value &&
  // insertsSinceBatch.value > 0), which incorrectly skipped the sweep
  // whenever target-hit caused shutdown.value=true, leaving thousands
  // of reports stuck at pending_review. The right policy is: always
  // drain whatever's left after ingestion stops, unless the user
  // SIGINT-ed (in which case they may want to inspect the queue
  // before continuing). Even on SIGINT we still drain — the worker
  // is idempotent, and leaving rows half-processed is the worse
  // failure mode.
  if (insertsSinceBatch.value > 0) {
    console.log('\nFinal batch sweep for ~' + insertsSinceBatch.value + ' lingering pending_review reports...')
    console.log('Using --limit 100000 to drain in one Anthropic batch (auto-caps to queue size).')
    spawnBatchWorker(state, ctx.log, /*finalSweep=*/true)
    while (batchWorkerInFlight.count > 0) {
      await new Promise(function (r) { setTimeout(r, 15_000) })
    }
  }

  // Summary
  var elapsedSec = Math.floor((Date.now() - startedAt) / 1000)
  console.log('\n═══ FINAL ═══')
  console.log('Elapsed:               ' + Math.floor(elapsedSec / 60) + 'm ' + (elapsedSec % 60) + 's')
  console.log('Shards done:           ' + state.totals.shards_done + '/' + state.totals.shards_total)
  console.log('Fetched (Arctic Shift):' + state.totals.fetched.toLocaleString())
  console.log('Received by endpoint:  ' + state.totals.received.toLocaleString())
  console.log('Parsed:                ' + state.totals.parsed.toLocaleString())
  console.log('Inserted (pending):    ' + state.totals.inserted.toLocaleString())
  console.log('Filtered (quality):    ' + state.totals.filtered.toLocaleString())
  console.log('Duplicates:            ' + state.totals.duplicates.toLocaleString())
  console.log('Errors:                ' + state.totals.errors.toLocaleString())
  console.log('Batch worker runs:     ' + state.ai_runs.length + ' (background, check outputs/orchestrator-batch-*.log)')

  if (Object.keys(state.rejectionReasons).length > 0) {
    console.log('\nTop rejection reasons:')
    var pairs = Object.entries(state.rejectionReasons).sort(function (a, b) { return b[1] - a[1] }).slice(0, 15)
    pairs.forEach(function (p) {
      console.log('  ' + p[1].toString().padStart(5) + '  ' + p[0])
    })
  }

  console.log('\nState file: ' + args.stateFile + ' (use --resume to continue)')
  console.log('\nNext steps:')
  console.log('  1. Wait for background batch workers to finish (~5-10 min after last spawn).')
  console.log('  2. Verify: npx tsx scripts/check-pending.ts  (sample of recent inserts)')
  console.log('  3. Spot-check /explore?mode=map for new approved reports.')
}

main().catch(function (e) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})
