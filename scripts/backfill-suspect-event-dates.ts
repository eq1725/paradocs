#!/usr/bin/env tsx
/**
 * V11.17.82 — Backfill suspect prose-year event_dates.
 *
 * The prose-year extractor used to grab bare decade phrases ("1900s",
 * "early 1800s") that were really describing the AGE OF AN OBJECT in
 * the dream/experience (warehouse, farmhouse, truck, dress), not the
 * date the event happened. Result: thousands of modern internet posts
 * with event_date = 1902-01-01 / 1805-01-01 etc.
 *
 * Founder-flagged example: report
 * last-night-i-rode-out-the-vibrations-gl6dd5 — title literally said
 * "last night" yet event_date was 1902-01-01 because the body
 * referenced "old early 1900s warehouse looking building".
 *
 * This script:
 *   1. Queries reports where
 *        event_date_extracted_from = 'prose-year'
 *        AND event_date < 1980-01-01
 *        AND source_type IN ('reddit', 'youtube')
 *      — the highest-signal slice for false positives (modern internet
 *      content with old "year" extractions).
 *   2. Re-runs the NEW extractor against (title + description), passing
 *      source_published_at (or created_at fallback) as referenceDate so
 *      relative phrases like "last night" can resolve.
 *   3. If the new extractor returns a different result (or null),
 *      UPDATEs the row. Tracks counts: changed / cleared-to-null /
 *      new-date-found / unchanged.
 *
 * Drain-safe: UPDATE only. Idempotent (re-running on the same set is
 * a no-op because the second pass produces the same answer the first
 * pass already stored).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/backfill-suspect-event-dates.ts --dry-run
 *   tsx scripts/backfill-suspect-event-dates.ts                # apply
 *   tsx scripts/backfill-suspect-event-dates.ts --limit 100    # cap for spot-check
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { extractDate } from '../src/lib/ingestion/utils/extract-date'

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

var dryRun = process.argv.includes('--dry-run')
var limitArg = process.argv.indexOf('--limit')
var maxRows = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity
var CHUNK = 500

interface Row {
  id: string
  slug: string
  title: string | null
  description: string | null
  event_date: string | null
  event_date_precision: string | null
  source_type: string | null
  source_published_at: string | null
  created_at: string
}

async function main() {
  console.log('[V11.17.82] Backfill suspect prose-year event_dates')
  console.log(`  mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`)
  console.log(`  cap:  ${isFinite(maxRows) ? maxRows : 'all'}`)
  console.log()

  // Chunk-paginate by id (no offset — supabase caps at 1000 per page).
  var lastId: string | null = null
  var totalScanned = 0
  var totalUnchanged = 0
  var totalCleared = 0     // got null from new extractor → cleared event_date
  var totalReassigned = 0  // got different date → updated
  var totalUnchangedSame = 0
  var totalErrors = 0

  while (totalScanned < maxRows) {
    var q = supabase
      .from('reports')
      .select('id, slug, title, description, event_date, event_date_precision, source_type, source_published_at, created_at')
      .eq('event_date_extracted_from', 'prose-year')
      .lt('event_date', '1980-01-01')
      .in('source_type', ['reddit', 'youtube'])
      .order('id', { ascending: true })
      .limit(CHUNK)

    if (lastId) q = q.gt('id', lastId)

    var { data, error } = await q
    if (error) {
      console.error('  [query error]', error.message)
      break
    }
    if (!data || data.length === 0) break

    for (var row of data as Row[]) {
      totalScanned++
      if (totalScanned > maxRows) break

      var prose = (row.title || '') + '\n' + (row.description || '')
      if (!prose.trim()) {
        totalUnchanged++
        continue
      }

      var refDate = row.source_published_at || row.created_at
      var fresh = extractDate({ prose, referenceDate: refDate })

      var oldDate = row.event_date
      var newDate = fresh.date

      if (newDate === oldDate) {
        totalUnchangedSame++
        continue
      }

      // Build update payload.
      var update: Record<string, any>
      if (newDate === null) {
        update = {
          event_date: null,
          event_date_precision: 'unknown',
          event_date_extracted_from: 'none',
        }
        totalCleared++
      } else {
        update = {
          event_date: newDate,
          event_date_precision: fresh.precision,
          event_date_extracted_from: fresh.source,
        }
        totalReassigned++
      }

      if (totalScanned <= 20 || totalScanned % 500 === 0) {
        console.log(`  [${totalScanned}] ${row.slug}`)
        console.log(`           old: ${oldDate} (year)`)
        console.log(`           new: ${newDate || '(null)'} (${fresh.precision}, ${fresh.source})${fresh.matchedText ? ' from "' + fresh.matchedText + '"' : ''}`)
      }

      if (!dryRun) {
        var { error: upErr } = await supabase
          .from('reports')
          .update(update)
          .eq('id', row.id)
        if (upErr) {
          console.error(`  [err] ${row.slug}: ${upErr.message}`)
          totalErrors++
          continue
        }
      }
    }

    lastId = (data[data.length - 1] as Row).id
    if (data.length < CHUNK) break  // last page

    if (totalScanned % 2000 === 0) {
      console.log(`  ... ${totalScanned} scanned, ${totalCleared + totalReassigned} changed`)
    }
  }

  console.log()
  console.log('═══ Summary ═══')
  console.log(`  scanned:                ${totalScanned}`)
  console.log(`  unchanged (same result): ${totalUnchangedSame}`)
  console.log(`  unchanged (empty prose): ${totalUnchanged}`)
  console.log(`  cleared to NULL:        ${totalCleared}`)
  console.log(`  reassigned to new date: ${totalReassigned}`)
  console.log(`  errors:                 ${totalErrors}`)
  console.log()
  if (dryRun) {
    console.log('  --dry-run: no UPDATEs written.')
  } else {
    console.log(`  Wrote ${totalCleared + totalReassigned} updates.`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
