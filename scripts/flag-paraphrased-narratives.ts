#!/usr/bin/env tsx
/**
 * Flag paraphrased narratives — Copyright Sprint 2
 *
 * Date:   2026-06-08
 * Sprint: Copyright Sprint 2
 * Related:
 *   - docs/HAIKU_NARRATIVE_DERIVATIVE_AUDIT.md (§6 — backfill recommendation)
 *   - src/lib/services/narrative-paraphrase-check.ts (the pure n-gram lib)
 *   - scripts/regen-flagged-narratives.ts (the Haiku regen that consumes
 *     this script's output)
 *   - docs/COPYRIGHT_SPRINT_2_NOTES.md (operator runbook)
 *
 * What this does:
 *   For every approved report with both `paradocs_narrative` and
 *   `description`, run checkParaphrase against the narrative + source
 *   body. If flagged (5-gram > 5% OR longest verbatim run >= 7 words),
 *   record the row to the JSON output for the regen script.
 *
 * IMPORTANT — interaction with the backfill:
 *   This script must run AFTER scripts/backfill-description-truncate-v1.ts
 *   --apply (Step 3 in the runbook). The audit's overlap measurements
 *   were taken against the FULL pre-truncation description. After the
 *   backfill, `description` is capped at 2,000 chars. That truncation
 *   makes the source corpus *smaller*, which can only DECREASE the
 *   measured overlap (fewer source n-grams to match against).
 *
 *   The audit thresholds (5%/7-word) were calibrated against full bodies.
 *   Running the check against truncated bodies will UNDER-FLAG (fewer
 *   false positives, possibly some false negatives). This is the
 *   conservative direction for a litigation-defense pass — better to
 *   regenerate the obviously-bad narratives than to chase marginal
 *   cases. The Sprint-3 ingest-time path will regenerate from full
 *   bodies, so any new ingests post-Sprint-2 get the full check.
 *
 *   Pre-backfill alternative (NOT RECOMMENDED — see scope doc §4):
 *   The Sprint-1 ingest cap doesn't apply retroactively. If the operator
 *   wants the pre-truncation flag set, they can run this script BEFORE
 *   Step 3 of the runbook. The output JSON path is the same in either
 *   case.
 *
 * Output:
 *   /Users/chase/paradocs/outputs/flagged-paraphrase-rows.json
 *
 *   JSON shape:
 *     [
 *       {
 *         "id": "uuid",
 *         "slug": "report-slug-abcd1234",
 *         "source_label": "Reddit r/Paranormal",
 *         "source_type": "reddit",
 *         "fivegramOverlap": 0.0612,
 *         "sevengramMaxRun": 9
 *       },
 *       ...
 *     ]
 *
 * COEXISTENCE:
 *   Read-only. Does not write to the DB. Compatible with NUFORC ingest
 *   + classifier-drain at all times. Rate-limits with a 50ms sleep
 *   between pages to keep DB load steady.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/flag-paraphrased-narratives.ts            # writes JSON only
 *   npx tsx scripts/flag-paraphrased-narratives.ts --max-pages=5
 *
 *   This script is ALWAYS "dry-run" with respect to the DB. The
 *   --dry-run flag is accepted for symmetry with sibling scripts and
 *   is a no-op (the JSON output file is always written).
 *
 * SWC style: var + function() form.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { checkParaphrase } from '../src/lib/services/narrative-paraphrase-check'

var maxPagesArg = process.argv.find(function (a) { return a.indexOf('--max-pages=') === 0 })
var MAX_PAGES = maxPagesArg ? parseInt(maxPagesArg.split('=')[1], 10) : Number.POSITIVE_INFINITY
var pageSizeArg = process.argv.find(function (a) { return a.indexOf('--page-size=') === 0 })
var PAGE_SIZE = pageSizeArg ? parseInt(pageSizeArg.split('=')[1], 10) : 500

var SLEEP_MS_BETWEEN_PAGES = 50
var OUTPUT_PATH = path.resolve(__dirname, '..', 'outputs', 'flagged-paraphrase-rows.json')

interface ReportRow {
  id: string
  slug: string | null
  source_label: string | null
  source_type: string | null
  description: string | null
  paradocs_narrative: string | null
  created_at: string
}

interface FlaggedRow {
  id: string
  slug: string | null
  source_label: string | null
  source_type: string | null
  fivegramOverlap: number
  sevengramMaxRun: number
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

  console.log('=== Copyright Sprint 2: paraphrase flagger ===')
  console.log('Mode:        DRY (writes JSON only, no DB writes)')
  console.log('Page size:   ' + PAGE_SIZE)
  console.log('Max pages:   ' + (MAX_PAGES === Number.POSITIVE_INFINITY ? 'unlimited' : String(MAX_PAGES)))
  console.log('Thresholds:  5-gram > 5% OR longest verbatim run >= 7 words')
  console.log('Output:      ' + OUTPUT_PATH)
  console.log('')
  console.log('Coexistence: read-only on reports table. Compatible with')
  console.log('             NUFORC ingest + classifier-drain at all times.')
  console.log('')

  // Ensure output dir exists.
  var outputDir = path.dirname(OUTPUT_PATH)
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  var totalScanned = 0
  var totalSkippedNoNarrative = 0
  var totalSkippedNoDesc = 0
  var totalFlagged = 0
  var bySource = new Map<string, number>()
  var flaggedRows: FlaggedRow[] = []

  // Keyset-style pagination — read-only, so cursor by created_at is safe.
  var lastCreatedAtCursor: string | null = null
  var pageIdx = 0

  while (pageIdx < MAX_PAGES) {
    var q = sb
      .from('reports')
      .select('id, slug, source_label, source_type, description, paradocs_narrative, created_at')
      .eq('status', 'approved')
      .not('paradocs_narrative', 'is', null)
      .not('description', 'is', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (lastCreatedAtCursor) q = q.gt('created_at', lastCreatedAtCursor)

    var page = await q
    if (page.error) {
      console.error('Page ' + pageIdx + ' query failed: ' + page.error.message)
      process.exit(1)
    }

    var rows = (page.data || []) as ReportRow[]
    if (rows.length === 0) {
      console.log('No more rows to scan. Done.')
      break
    }

    var pageFlagged = 0
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i]
      totalScanned++
      if (!row.paradocs_narrative || row.paradocs_narrative.length < 50) {
        totalSkippedNoNarrative++
        continue
      }
      if (!row.description || row.description.length < 50) {
        totalSkippedNoDesc++
        continue
      }

      var m = checkParaphrase(row.paradocs_narrative, row.description)
      if (m.flagged) {
        totalFlagged++
        pageFlagged++
        var src = row.source_type || 'unknown'
        bySource.set(src, (bySource.get(src) || 0) + 1)
        flaggedRows.push({
          id: row.id,
          slug: row.slug,
          source_label: row.source_label,
          source_type: row.source_type,
          fivegramOverlap: Math.round(m.fivegramOverlap * 10000) / 10000,
          sevengramMaxRun: m.sevengramMaxRun,
        })
      }
    }

    lastCreatedAtCursor = rows[rows.length - 1].created_at

    console.log(
      '[page ' + pageIdx + '] scanned=' + rows.length +
      ' flagged=' + pageFlagged +
      '  (totals: scanned=' + totalScanned + ' flagged=' + totalFlagged + ')'
    )

    if (rows.length < PAGE_SIZE) {
      console.log('Partial page → end of candidate set. Done.')
      break
    }

    pageIdx++
    await sleep(SLEEP_MS_BETWEEN_PAGES)
  }

  // Write the JSON. Pretty-printed for easy review.
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(flaggedRows, null, 2), 'utf8')

  console.log('')
  console.log('=== Summary ===')
  console.log('Scanned:                       ' + totalScanned)
  console.log('Skipped — narrative too short: ' + totalSkippedNoNarrative)
  console.log('Skipped — description short:   ' + totalSkippedNoDesc)
  console.log('Flagged for regen:             ' + totalFlagged)
  console.log('')
  console.log('By source_type:')
  bySource.forEach(function (count, src) {
    console.log('  ' + src.padEnd(20) + ' ' + count)
  })
  console.log('')
  console.log('Output written: ' + OUTPUT_PATH)
  console.log('')
  console.log('Next step: review the JSON, then run')
  console.log('  npx tsx scripts/regen-flagged-narratives.ts            # dry-run')
  console.log('  npx tsx scripts/regen-flagged-narratives.ts --apply    # submit Batch API job')
}

main().catch(function (err) {
  console.error('Fatal: ' + (err && err.message ? err.message : err))
  process.exit(1)
})
