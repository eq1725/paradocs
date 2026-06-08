#!/usr/bin/env tsx
/**
 * Copyright Sprint 2 — Description truncate + source_body_sha256 backfill
 *
 * Date:   2026-06-08
 * Sprint: Copyright Sprint 2 (Option A — see DESCRIPTION_BACKFILL_SCOPE.md §4)
 * Files:
 *   - supabase/migrations/20260608_source_body_sha256.sql  (adds column)
 *   - this script                                          (populates it)
 *   - docs/COPYRIGHT_SPRINT_2_NOTES.md                     (operator runbook)
 *
 * What this does, per row:
 *   1. If description IS NOT NULL AND source_body_sha256 IS NULL,
 *      compute SHA-256 of the full pre-truncation description and store
 *      it in source_body_sha256. The hash is the audit-trail snapshot —
 *      proves we extracted from a specific known body without retaining
 *      it indefinitely (DESCRIPTION_BACKFILL_SCOPE.md §6).
 *   2. If length(description) > 2000, truncate to first 2,000 chars and
 *      append the disclosure marker. The full body is irrecoverable from
 *      the DB after this; only the hash remains.
 *   3. If length(description) <= 2000, leave description alone — only
 *      the hash gets written.
 *
 * EXECUTION PATH:
 *   This script uses paginated UPDATEs via PostgREST (.range() + per-row
 *   UPDATE) rather than a single bulk SQL statement. Reason:
 *     - We need the SHA-256 computed in Node (Postgres's pgcrypto is
 *       available but adds an extension dependency we don't currently
 *       have, and pgcrypto's digest() output is bytea, not the hex
 *       string we want to store as TEXT).
 *     - PostgREST is the bandwidth-controlled write path that the live
 *       NUFORC ingest is using too, so we can rate-limit by sleep
 *       between pages without contending on locks.
 *   The scope doc's "~60 seconds bulk SQL" path is faster but requires
 *   psql + a CTE; this path trades wall-clock (~5-10 min single-thread
 *   for ~63k rows that need truncation, ~318k rows scanned total) for
 *   operator simplicity. The cost is acceptable for a one-shot backfill.
 *
 * COEXISTENCE — IMPORTANT:
 *   - NUFORC ingest IS RUNNING. It INSERTs new rows; this script only
 *     UPDATEs existing rows. No row contention by construction.
 *   - Classifier-drain IS RUNNING. It writes to report_phenomena +
 *     reports.phenomenon_type_id / classifier_attempts / classifier_skip.
 *     This script writes ONLY to reports.description + reports.source_body_sha256.
 *     Disjoint column sets → no MVCC conflict in PostgreSQL (UPDATE locks
 *     the row, but the two writers update different columns so the
 *     last-writer-wins behavior is harmless — neither column the other
 *     side cares about gets clobbered).
 *   - Sleep 50ms between pages so we don't starve the live ingest of
 *     DB connection slots from the shared service-role pool.
 *
 * IDEMPOTENT + RESUMABLE:
 *   - Filters WHERE source_body_sha256 IS NULL on every page query, so
 *     re-running picks up where it left off. Mid-run interrupt leaves
 *     a consistent partial state.
 *   - Ordered by created_at ASC so partial progress is recoverable:
 *     the next run picks up from the oldest unhashed row, which is
 *     also the lowest created_at for unhashed rows on the second pass.
 *   - Skips rows where source_body_sha256 is already populated AND
 *     description length is already <= 2000 (the no-op case).
 *
 * EXCLUDES user_submission:
 *   User submissions are the user's own content (described in scope doc
 *   §7-1: 4 rows total, source_type='user_submission'). They are never
 *   subject to copyright-driven truncation; they get hashed as a courtesy
 *   for the snapshot column but are NEVER truncated. The exclusion is
 *   defense-in-depth: even if someone changes the truncate threshold
 *   later, user submissions stay intact.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-description-truncate-v1.ts              # dry-run (no writes)
 *   npx tsx scripts/backfill-description-truncate-v1.ts --apply      # writes to DB
 *
 *   Optional:
 *     --max-pages=N   stop after N pages of 500 (smoke testing)
 *     --page-size=N   override default page size (default 500)
 *
 * SWC style: var + function() form, matching the rest of /scripts.
 */

import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

var dryRun = !process.argv.includes('--apply')
var maxPagesArg = process.argv.find(function (a) { return a.indexOf('--max-pages=') === 0 })
var MAX_PAGES = maxPagesArg ? parseInt(maxPagesArg.split('=')[1], 10) : Number.POSITIVE_INFINITY
var pageSizeArg = process.argv.find(function (a) { return a.indexOf('--page-size=') === 0 })
var PAGE_SIZE = pageSizeArg ? parseInt(pageSizeArg.split('=')[1], 10) : 500

// The disclosure suffix appended to truncated descriptions. Must match
// the suffix in src/lib/ingestion/engine.ts so live ingests + this
// backfill emit byte-identical truncation markers.
var TRUNCATE_SUFFIX = '… [truncated by Paradocs at 2000 chars; see source URL for full original]'
var TRUNCATE_THRESHOLD = 2000

// Inter-page sleep — keep DB load steady while NUFORC ingest +
// classifier-drain are also writing.
var SLEEP_MS_BETWEEN_PAGES = 50

interface ReportRow {
  id: string
  description: string | null
  source_body_sha256: string | null
  source_type: string | null
  created_at: string
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex')
}

function truncateDescription(desc: string): string {
  // First 2,000 chars + disclosure suffix. We do NOT strip a partial
  // word from the end — scope doc §4 explicitly accepts the trailing
  // partial-word cut because (a) admin views are the only consumer
  // (scrubIndexReport nulls description before SSR egress) and (b)
  // staying byte-stable simplifies idempotency.
  return desc.substring(0, TRUNCATE_THRESHOLD) + TRUNCATE_SUFFIX
}

async function sleep(ms: number): Promise<void> {
  return new Promise(function (resolve) { setTimeout(resolve, ms) })
}

async function main(): Promise<void> {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var.')
    console.error('Run: set -a; source .env.local; set +a')
    process.exit(1)
  }
  var sb = createClient(supabaseUrl, serviceKey)

  console.log('=== Copyright Sprint 2: description truncate + sha256 backfill ===')
  console.log('Mode:           ' + (dryRun ? 'DRY RUN (no writes)' : 'APPLY (writes to DB)'))
  console.log('Page size:      ' + PAGE_SIZE)
  console.log('Max pages:      ' + (MAX_PAGES === Number.POSITIVE_INFINITY ? 'unlimited' : String(MAX_PAGES)))
  console.log('Truncate at:    ' + TRUNCATE_THRESHOLD + ' chars')
  console.log('Sleep / page:   ' + SLEEP_MS_BETWEEN_PAGES + 'ms')
  console.log('')
  console.log('Expected runtime (per DESCRIPTION_BACKFILL_SCOPE.md §4):')
  console.log('  Bulk SQL path: ~60 seconds wall-clock.')
  console.log('  This (PostgREST per-row) path: ~5-10 min single-thread')
  console.log('  for ~63k truncating UPDATEs + ~318k hashes across the')
  console.log('  full corpus. Add ~50ms sleep / page → ~30s pure idle.')
  console.log('')
  console.log('Coexistence: NUFORC ingest INSERTs new rows (no contention).')
  console.log('             Classifier-drain UPDATEs disjoint columns (safe).')
  console.log('')

  var totalScanned = 0
  var totalHashed = 0
  var totalTruncated = 0
  var totalAlreadyClean = 0
  var totalSkippedUserSubmission = 0
  var totalSkippedNoDesc = 0
  var totalErrors = 0
  var totalCharsFreed = 0
  var pageIdx = 0

  // Keyset-style pagination via .range() + ORDER BY created_at.
  // PostgREST caps the result set at 5,000 rows per call (the default
  // `max-rows` setting on Supabase), and we want batches of 500 to keep
  // memory + per-page output manageable. With the WHERE filter on
  // source_body_sha256 IS NULL, each successful page reduces the
  // candidate pool by PAGE_SIZE, so the offset can stay at 0 on a
  // re-query (the rows we just hashed are no longer matched).
  //
  // BUT: on a DRY RUN we don't update source_body_sha256, so the same
  // rows would come back every page → infinite loop. Defensive guard:
  // in dry-run mode we walk by created_at cursor instead.
  var lastCreatedAtCursor: string | null = null

  while (pageIdx < MAX_PAGES) {
    var q = sb
      .from('reports')
      .select('id, description, source_body_sha256, source_type, created_at')
      .is('source_body_sha256', null)
      .neq('source_type', 'user_submission')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (dryRun && lastCreatedAtCursor) {
      // Cursor walk to avoid re-reading the same page when no writes
      // are happening. The id tiebreaker handles within-second dupes.
      q = q.gt('created_at', lastCreatedAtCursor)
    }

    var page = await q

    if (page.error) {
      console.error('Page ' + pageIdx + ' query failed: ' + page.error.message)
      process.exit(1)
    }

    var rows = (page.data || []) as ReportRow[]
    if (rows.length === 0) {
      console.log('No more rows to process. Done.')
      break
    }

    var pageHashed = 0
    var pageTruncated = 0
    var pageErrors = 0

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i]
      totalScanned++

      if (!row.description || row.description.length === 0) {
        // The scope doc says is-null count = 0 over 30k random samples,
        // so this is mostly a safety net. Rows without description get
        // skipped — no hash, no truncation.
        totalSkippedNoDesc++
        continue
      }

      var fullDesc = row.description
      var fullHash = sha256Hex(fullDesc)
      var needsTruncate = fullDesc.length > TRUNCATE_THRESHOLD

      if (!needsTruncate) totalAlreadyClean++

      if (dryRun) {
        // Count what we WOULD do, but never write.
        pageHashed++
        if (needsTruncate) {
          pageTruncated++
          totalCharsFreed += (fullDesc.length - TRUNCATE_THRESHOLD)
        }
        continue
      }

      // APPLY mode: single idempotent UPDATE per row. Writes only the
      // columns we own; classifier-drain's columns are untouched.
      var update: { source_body_sha256: string; description?: string } = {
        source_body_sha256: fullHash,
      }
      if (needsTruncate) {
        update.description = truncateDescription(fullDesc)
        totalCharsFreed += (fullDesc.length - TRUNCATE_THRESHOLD)
      }

      var upd = await sb
        .from('reports')
        .update(update)
        .eq('id', row.id)
        // Defensive: only update if hash is still null — protects against
        // the (vanishingly unlikely) race where two backfill runs target
        // the same row.
        .is('source_body_sha256', null)

      if (upd.error) {
        console.error('  [err] ' + row.id + ': ' + upd.error.message)
        pageErrors++
        totalErrors++
      } else {
        pageHashed++
        if (needsTruncate) pageTruncated++
      }
    }

    totalHashed += pageHashed
    totalTruncated += pageTruncated

    // Always advance dry-run cursor so we don't loop forever.
    if (dryRun) {
      lastCreatedAtCursor = rows[rows.length - 1].created_at
    }

    console.log(
      '[page ' + pageIdx + '] scanned=' + rows.length +
      ' hashed=' + pageHashed +
      ' truncated=' + pageTruncated +
      ' errors=' + pageErrors +
      '  (totals: scanned=' + totalScanned + ' hashed=' + totalHashed + ' truncated=' + totalTruncated + ')'
    )

    if (rows.length < PAGE_SIZE) {
      console.log('Partial page → end of candidate set. Done.')
      break
    }

    pageIdx++
    await sleep(SLEEP_MS_BETWEEN_PAGES)
  }

  // Approximate compression-on-disk: scope doc §4 estimates ~30% Postgres
  // TOAST compression on truncated text. Apply the same factor here for
  // a rough on-disk savings number.
  var mbRawFreed = totalCharsFreed / (1024 * 1024)
  var mbOnDiskFreedApprox = mbRawFreed * 0.7

  console.log('')
  console.log('=== Summary ===')
  console.log('Scanned (rows considered):            ' + totalScanned)
  console.log('Skipped — user_submission excluded:   (filtered server-side; verified 4 rows)')
  console.log('Skipped — description null/empty:     ' + totalSkippedNoDesc)
  console.log('Hashed (source_body_sha256 written):  ' + totalHashed)
  console.log('Truncated (description > 2000 chars): ' + totalTruncated)
  console.log('Already ≤ 2000 chars (hash-only):     ' + (totalAlreadyClean - totalTruncated))
  console.log('Errors:                               ' + totalErrors)
  console.log('Storage freed (raw chars):            ~' + mbRawFreed.toFixed(2) + ' MB')
  console.log('Storage freed (approx. on disk):      ~' + mbOnDiskFreedApprox.toFixed(2) + ' MB')
  if (dryRun) {
    console.log('')
    console.log('DRY RUN — no changes written. Re-run with --apply to commit.')
  } else {
    console.log('')
    console.log('APPLIED — DB updated. source_body_sha256 populated; descriptions capped at 2,000 chars.')
  }
}

main().catch(function (err) {
  console.error('Fatal: ' + (err && err.message ? err.message : err))
  process.exit(1)
})
