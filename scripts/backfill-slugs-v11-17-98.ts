#!/usr/bin/env tsx
/**
 * V11.17.98 — Stale-slug backfill + alias registration.
 *
 * Background:
 *   V11.17.98 added slug regeneration to persistConsolidatedResult so
 *   freshly ingested reports get a slug derived from the Haiku-rewritten
 *   title (with the 8-char hash suffix preserved). Reports ingested
 *   BEFORE V11.17.98 still carry a slug derived from the raw adapter
 *   title — typically a chopped first-sentence narrative like
 *   "christmas-2017-i-was-visiting-family-in-sedona-..." instead of the
 *   clean headline ("massive-underground-boom-shakes-sedona-...").
 *
 * What this script does:
 *   1. Page through reports (status='approved') in batches of 500 via
 *      .range() to bypass PostgREST's 5,000-row cap.
 *   2. For each row, compute what slug the live ingestion path WOULD
 *      generate from the current title using the shared helper
 *      `computeRefreshedSlug` exported from consolidated-ai.service.
 *   3. Skip rows where new slug === current slug (no change needed —
 *      most rows either pre-date the rewriter or have idempotent slugs).
 *   4. For the rest:
 *        - INSERT old slug into report_slug_aliases (ON CONFLICT DO
 *          NOTHING — a prior backfill pass or a Haiku rewrite at
 *          ingestion time may have already registered it).
 *        - UPDATE reports.slug to the new value.
 *
 * Safety:
 *   - Default mode is --dry-run. The --apply flag is REQUIRED for any
 *     write. The DB never gets touched without it.
 *   - The 8-char hash suffix is preserved, so report identity (used by
 *     analytics, saved bookmarks, dossier matches, etc.) is stable.
 *   - Old URLs keep working via 301 redirects from the alias table
 *     (handled in src/pages/report/[slug].tsx getStaticProps).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/backfill-slugs-v11-17-98.ts              # dry-run
 *   tsx scripts/backfill-slugs-v11-17-98.ts --apply      # write
 *
 *   Optional:
 *     --sample-size=20   how many old→new pairs to print (default 10)
 *     --max-pages=N      stop after N pages of 500 (smoke testing)
 *
 * SWC style: var + function() form, matching the rest of /scripts.
 */

import { createClient } from '@supabase/supabase-js'
import { computeRefreshedSlug } from '../src/lib/services/consolidated-ai.service'

var dryRun = !process.argv.includes('--apply')
var sampleSizeArg = process.argv.find(function (a) { return a.indexOf('--sample-size=') === 0 })
var SAMPLE_SIZE = sampleSizeArg ? parseInt(sampleSizeArg.split('=')[1], 10) : 10
var maxPagesArg = process.argv.find(function (a) { return a.indexOf('--max-pages=') === 0 })
var MAX_PAGES = maxPagesArg ? parseInt(maxPagesArg.split('=')[1], 10) : Number.POSITIVE_INFINITY

var PAGE_SIZE = 500

interface ReportRow {
  id: string
  slug: string | null
  title: string | null
}

interface UpdateCandidate {
  id: string
  oldSlug: string
  newSlug: string
  title: string
}

async function main(): Promise<void> {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var.')
    process.exit(1)
  }
  var sb = createClient(supabaseUrl, serviceKey)

  console.log('=== V11.17.98 Slug-refresh backfill ===')
  console.log('Mode: ' + (dryRun ? 'DRY RUN (no writes)' : 'APPLY (will write to DB)'))
  console.log('Page size: ' + PAGE_SIZE)
  console.log('Sample size: ' + SAMPLE_SIZE)
  console.log('')

  var totalScanned = 0
  var totalSkippedNoChange = 0
  var totalSkippedNoTitle = 0
  var totalSkippedNoSlug = 0
  var totalCandidates = 0
  var totalAliasInserted = 0
  var totalSlugUpdated = 0
  var totalErrors = 0
  var sample: UpdateCandidate[] = []

  var offset = 0
  var pageIdx = 0
  while (pageIdx < MAX_PAGES) {
    var page = await sb
      .from('reports')
      .select('id, slug, title')
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (page.error) {
      console.error('Page ' + pageIdx + ' query failed: ' + page.error.message)
      process.exit(1)
    }

    var rows = (page.data || []) as ReportRow[]
    if (rows.length === 0) break

    var pageCandidates: UpdateCandidate[] = []
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i]
      totalScanned++

      if (!row.title) { totalSkippedNoTitle++; continue }
      if (!row.slug) { totalSkippedNoSlug++; continue }

      var newSlug = computeRefreshedSlug(row.slug, row.title)
      if (!newSlug) { totalSkippedNoTitle++; continue }
      if (newSlug === row.slug) { totalSkippedNoChange++; continue }

      pageCandidates.push({
        id: row.id,
        oldSlug: row.slug,
        newSlug: newSlug,
        title: row.title,
      })
    }

    totalCandidates += pageCandidates.length

    // Build a small sample for the operator to review before --apply.
    for (var s = 0; s < pageCandidates.length && sample.length < SAMPLE_SIZE; s++) {
      sample.push(pageCandidates[s])
    }

    if (!dryRun && pageCandidates.length > 0) {
      // Insert aliases first so a mid-flight crash leaves no slug
      // unreachable. Conflict on old_slug is benign — could have been
      // inserted by a prior partial run, or by a live Haiku rewrite
      // racing with this script.
      var aliasRows = pageCandidates.map(function (c): { report_id: string; old_slug: string } {
        return { report_id: c.id, old_slug: c.oldSlug }
      })
      var aliasInsert = await sb
        .from('report_slug_aliases')
        .upsert(aliasRows, { onConflict: 'old_slug', ignoreDuplicates: true })
      if (aliasInsert.error) {
        console.error('  alias insert failed (page ' + pageIdx + '): ' + aliasInsert.error.message)
        totalErrors += pageCandidates.length
      } else {
        totalAliasInserted += pageCandidates.length
      }

      // Update slugs row-by-row — no batch UPDATE in PostgREST without
      // a function, and we want per-row error isolation anyway. 500
      // sequential round-trips per page is acceptable for a one-shot
      // backfill of ~6.5k rows.
      for (var u = 0; u < pageCandidates.length; u++) {
        var cand = pageCandidates[u]
        var upd = await sb
          .from('reports')
          .update({ slug: cand.newSlug })
          .eq('id', cand.id)
        if (upd.error) {
          console.error('  slug update failed for ' + cand.id + ': ' + upd.error.message)
          totalErrors++
        } else {
          totalSlugUpdated++
        }
      }
    }

    console.log(
      '[page ' + pageIdx + '] scanned=' + rows.length +
      ' candidates=' + pageCandidates.length +
      ' running_total_candidates=' + totalCandidates,
    )

    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
    pageIdx++
  }

  console.log('')
  console.log('=== Summary ===')
  console.log('Scanned (approved reports): ' + totalScanned)
  console.log('Skipped — no title:         ' + totalSkippedNoTitle)
  console.log('Skipped — no slug:          ' + totalSkippedNoSlug)
  console.log('Skipped — slug unchanged:   ' + totalSkippedNoChange)
  console.log('To update (candidates):     ' + totalCandidates)
  if (!dryRun) {
    console.log('Aliases inserted (or skipped on conflict): ' + totalAliasInserted)
    console.log('Slugs updated:              ' + totalSlugUpdated)
    console.log('Errors:                     ' + totalErrors)
  }

  console.log('')
  console.log('=== Sample (first ' + sample.length + ' old → new) ===')
  for (var k = 0; k < sample.length; k++) {
    var c = sample[k]
    console.log(
      '  ' + (k + 1) + '. ' + c.id.substring(0, 8) +
      '\n     title: ' + c.title.substring(0, 80) +
      '\n     old:   ' + c.oldSlug +
      '\n     new:   ' + c.newSlug,
    )
  }

  if (dryRun) {
    console.log('')
    console.log('Dry run only. Re-run with --apply to write.')
  }
}

main().catch(function (err) {
  console.error('Fatal:', err)
  process.exit(1)
})
