#!/usr/bin/env tsx
/**
 * Arctic Shift Bulk Import — V11.14 rewrite
 *
 * Fetches Reddit archive posts from Arctic Shift and POSTs them to
 * /api/admin/archive-import on the deployed Paradocs instance. The
 * endpoint runs each post through the V11.14 filter pipeline (META/
 * NON_EXPERIENCE/DESCRIPTION_LEAD/SPAM/FICTION/PII redactor/location
 * enricher/quality scorer) and inserts surviving posts at
 * status='pending_review'. AI generation happens separately via
 * scripts/batch-ingest-worker.ts at 50% off.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/arctic-shift-bulk-import.ts --subreddit r/ufos --from 2024-01-01 --to 2024-02-01
 *   tsx scripts/arctic-shift-bulk-import.ts --subreddit r/glitch_in_the_matrix --limit 500
 *   tsx scripts/arctic-shift-bulk-import.ts --subreddit r/ghosts --from 2024-06-01 --dry-run
 *
 * CLI args:
 *   --subreddit <r/X>  Required. The subreddit slug (with or without r/).
 *   --from <YYYY-MM-DD>  Start of date range (default: 2 years ago).
 *   --to <YYYY-MM-DD>    End of date range (default: today).
 *   --limit <n>          Max total posts to import (default: unlimited).
 *   --batch-size <n>     Posts per archive-import request (default: 500,
 *                        max 1000).
 *   --dry-run            Fetch and count but don't POST.
 *   --endpoint <url>     Override target (default uses NEXT_PUBLIC_API_BASE
 *                        env var if set, else https://www.discoverparadocs.com).
 *
 * Sharding:
 *   Multiple instances can run in parallel against different subreddits
 *   or different date ranges of the same subreddit without collision:
 *     terminal 1: --subreddit r/ufos --from 2024-01-01 --to 2024-03-31
 *     terminal 2: --subreddit r/ufos --from 2024-04-01 --to 2024-06-30
 *     terminal 3: --subreddit r/cryptids --from 2024-01-01 --to 2024-12-31
 *   The archive-import endpoint hash-dedups against existing
 *   original_report_ids so any overlap is silently skipped.
 *
 * Progress log:
 *   Writes to outputs/arctic-shift-<subreddit>-<from>-<timestamp>.log
 *   so a Ctrl-C run can be resumed (re-run with same args; dedup
 *   handles the overlap).
 */

import * as fs from 'fs'
import * as path from 'path'

var ARCTIC_SHIFT_API = 'https://arctic-shift.photon-reddit.com/api/posts/search'

// ─────────────────────────────────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  subreddit: string
  fromTs: number  // unix seconds; 0 = unbounded
  toTs: number    // unix seconds; 0 = unbounded (now)
  limit: number   // 0 = unlimited
  batchSize: number
  dryRun: boolean
  endpoint: string
}

function parseArgs(argv: string[]): CliArgs {
  var args: CliArgs = {
    subreddit: '',
    fromTs: 0,
    toTs: 0,
    limit: 0,
    batchSize: 500,
    dryRun: false,
    endpoint: process.env.NEXT_PUBLIC_API_BASE || 'https://www.discoverparadocs.com',
  }
  for (var i = 2; i < argv.length; i++) {
    var a = argv[i]
    if (a === '--subreddit') {
      args.subreddit = argv[++i].replace(/^r\//, '')
    } else if (a === '--from') {
      args.fromTs = Math.floor(new Date(argv[++i]).getTime() / 1000)
    } else if (a === '--to') {
      args.toTs = Math.floor(new Date(argv[++i]).getTime() / 1000)
    } else if (a === '--limit') {
      args.limit = parseInt(argv[++i], 10) || 0
    } else if (a === '--batch-size') {
      args.batchSize = Math.min(1000, parseInt(argv[++i], 10) || 500)
    } else if (a === '--dry-run') {
      args.dryRun = true
    } else if (a === '--endpoint') {
      args.endpoint = argv[++i]
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/arctic-shift-bulk-import.ts --subreddit <r/X> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--limit N] [--batch-size N] [--dry-run] [--endpoint URL]')
      process.exit(0)
    }
  }
  if (!args.subreddit) {
    console.error('--subreddit is required')
    process.exit(1)
  }
  return args
}

// ─────────────────────────────────────────────────────────────────────
// ARCTIC SHIFT FETCH
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

async function fetchPage(subreddit: string, before: number | null, fromTs: number, limit: number): Promise<{ posts: RedditPost[]; lastTimestamp: number | null }> {
  var url = ARCTIC_SHIFT_API + '?subreddit=' + encodeURIComponent(subreddit) + '&limit=' + limit + '&sort=created_utc:desc'
  if (before) url += '&created_utc=<' + before
  if (fromTs) url += '&created_utc=>' + fromTs
  try {
    var resp = await fetch(url)
    if (!resp.ok) {
      console.warn('[arctic-shift] fetch ' + resp.status + ' for ' + subreddit)
      return { posts: [], lastTimestamp: null }
    }
    var data = await resp.json()
    var posts = (data.data || []) as RedditPost[]
    var lastTimestamp = posts.length > 0 ? posts[posts.length - 1].created_utc : null
    return { posts: posts, lastTimestamp: lastTimestamp }
  } catch (e: any) {
    console.warn('[arctic-shift] fetch error: ' + (e.message || e))
    return { posts: [], lastTimestamp: null }
  }
}

// ─────────────────────────────────────────────────────────────────────
// ARCHIVE-IMPORT POST
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

async function postBatchToArchiveImport(endpoint: string, posts: RedditPost[]): Promise<{ ok: boolean; result?: ImportResult; error?: string }> {
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing from env' }
  }
  try {
    var resp = await fetch(endpoint + '/api/admin/archive-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Endpoint accepts service-role bearer for admin auth
        'Authorization': 'Bearer ' + serviceKey,
      },
      body: JSON.stringify({ posts: posts }),
    })
    var data = await resp.json()
    if (!resp.ok || !data.success) {
      return { ok: false, error: data.error || ('HTTP ' + resp.status) }
    }
    return { ok: true, result: data.result }
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) }
  }
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function main() {
  var args = parseArgs(process.argv)

  // Default date range: last 2 years to now
  var nowTs = Math.floor(Date.now() / 1000)
  var fromTs = args.fromTs || (nowTs - 2 * 365 * 24 * 60 * 60)
  var toTs = args.toTs || nowTs

  console.log('=== Arctic Shift Bulk Import (V11.14) ===')
  console.log('Subreddit:   r/' + args.subreddit)
  console.log('Date range:  ' + new Date(fromTs * 1000).toISOString() + ' → ' + new Date(toTs * 1000).toISOString())
  console.log('Limit:       ' + (args.limit || 'unlimited'))
  console.log('Batch size:  ' + args.batchSize + ' posts/request')
  console.log('Endpoint:    ' + args.endpoint + '/api/admin/archive-import')
  console.log('Dry run:     ' + args.dryRun)
  console.log('')

  // Progress log
  fs.mkdirSync('outputs', { recursive: true })
  var logPath = path.join('outputs', 'arctic-shift-' + args.subreddit + '-' + new Date(fromTs * 1000).toISOString().substring(0, 10) + '-' + Date.now() + '.log')
  var logStream = fs.createWriteStream(logPath, { flags: 'a' })
  function log(msg: string) {
    console.log(msg)
    logStream.write(new Date().toISOString() + ' ' + msg + '\n')
  }

  log('Progress log: ' + logPath)

  // Aggregate totals across all batches
  var grand = {
    fetched: 0,
    received: 0,
    parsed: 0,
    duplicates: 0,
    filtered: 0,
    inserted: 0,
    errors: 0,
    rejectionReasons: {} as Record<string, number>,
  }

  // Paginate Arctic Shift descending from `toTs`
  var beforeTs: number | null = toTs
  var batchNum = 0
  while (true) {
    batchNum++
    log('Batch ' + batchNum + ': fetching from Arctic Shift (before=' + new Date(beforeTs! * 1000).toISOString() + ')...')

    var fetchLimit = args.batchSize
    if (args.limit && (args.limit - grand.fetched) < fetchLimit) {
      fetchLimit = args.limit - grand.fetched
      if (fetchLimit <= 0) break
    }

    var { posts, lastTimestamp } = await fetchPage(args.subreddit, beforeTs, fromTs, fetchLimit)
    if (posts.length === 0) {
      log('  (no more posts; reached end of subreddit history or date range)')
      break
    }
    grand.fetched += posts.length

    // Filter to date range (Arctic Shift sometimes returns posts outside the range we asked for)
    posts = posts.filter(function (p) { return p.created_utc >= fromTs && p.created_utc <= toTs })

    log('  Fetched ' + posts.length + ' posts in range (oldest: ' + new Date(lastTimestamp! * 1000).toISOString() + ')')

    if (!args.dryRun) {
      var postResult = await postBatchToArchiveImport(args.endpoint, posts)
      if (!postResult.ok) {
        log('  POST failed: ' + postResult.error + ' — STOPPING.')
        break
      }
      var r = postResult.result!
      grand.received += r.received
      grand.parsed += r.parsed
      grand.duplicates += r.duplicates
      grand.filtered += r.filtered
      grand.inserted += r.inserted
      grand.errors += r.errors
      if (r.rejectionReasons) {
        Object.keys(r.rejectionReasons).forEach(function (k) {
          grand.rejectionReasons[k] = (grand.rejectionReasons[k] || 0) + r.rejectionReasons![k]
        })
      }
      log('  Imported: ' + r.inserted + ' inserted, ' + r.filtered + ' filtered, ' + r.duplicates + ' duplicates, ' + r.errors + ' errors (took ' + r.elapsed_ms + 'ms)')
    } else {
      log('  DRY RUN — skipped POST')
      grand.received += posts.length
    }

    if (!lastTimestamp || lastTimestamp <= fromTs) {
      log('  (reached date-range lower bound)')
      break
    }
    if (args.limit && grand.fetched >= args.limit) {
      log('  (reached --limit ' + args.limit + ')')
      break
    }
    beforeTs = lastTimestamp

    // Polite delay between Arctic Shift requests
    await new Promise(function (resolve) { setTimeout(resolve, 500) })
  }

  log('')
  log('========== FINAL ==========')
  log('Fetched from Arctic Shift: ' + grand.fetched)
  log('Received by endpoint:      ' + grand.received)
  log('Parsed:                    ' + grand.parsed)
  log('Inserted (pending_review): ' + grand.inserted)
  log('Filtered (quality reject): ' + grand.filtered)
  log('Duplicates (hash-skipped): ' + grand.duplicates)
  log('Errors:                    ' + grand.errors)
  if (Object.keys(grand.rejectionReasons).length > 0) {
    log('')
    log('Top rejection reasons:')
    var pairs = Object.entries(grand.rejectionReasons).sort(function (a, b) { return b[1] - a[1] }).slice(0, 10)
    pairs.forEach(function (p) {
      log('  ' + p[1] + '  ' + p[0])
    })
  }
  log('')
  log('Next step: run batch worker to generate AI for these reports:')
  log('  npx tsx scripts/batch-ingest-worker.ts --backfill --limit 1000')

  logStream.end()
}

main().catch(function (e) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})
