#!/usr/bin/env tsx
/**
 * V11.14.7 — Sweep existing pending_review queue through the new
 * tightened policy.
 *
 * After dropping the pending_review bucket from the ingest pipeline,
 * the existing ~1526 pending reports need a one-time re-evaluation:
 *   - Reports with narrative + pull_quote populated AND a smart-
 *     promote-worthy signal (date + location, first-person, etc.)
 *     → status='approved' (auto-publish).
 *   - Reports without narrative (AI never ran or returned INSUFFICIENT)
 *     → status='rejected'.
 *   - Reports with narrative but score+content signals too weak even
 *     under the new policy → status='rejected'.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/sweep-pending-review.ts --dry-run
 *   tsx scripts/sweep-pending-review.ts
 */

import { createClient } from '@supabase/supabase-js'
import {
  assessQuality,
  smartReEvaluate,
} from '../src/lib/ingestion/filters'

var dryRun = process.argv.includes('--dry-run')

async function main() {
  var sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('=== V11.14.7 Pending-review sweep ===')
  console.log('Mode: ' + (dryRun ? 'DRY RUN (no writes)' : 'APPLYING UPDATES'))

  // Paginate over all pending_review reports
  var rows: any[] = []
  var pageSize = 1000
  var offset = 0
  var fetched = pageSize
  while (fetched === pageSize) {
    var page = await sb
      .from('reports')
      .select('id, slug, title, description, source_type, source_label, location_name, country, event_date, category, paradocs_narrative, paradocs_assessment, metadata')
      .eq('status', 'pending_review')
      .neq('source_type', 'user_submission')
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (page.error) {
      console.error('Query failed:', page.error.message)
      process.exit(1)
    }
    var pageRows = page.data || []
    rows.push.apply(rows, pageRows)
    fetched = pageRows.length
    offset += pageSize
    if (offset > 100000) break
  }

  console.log('Pending reports to sweep: ' + rows.length)
  if (rows.length === 0) {
    console.log('Nothing to do.')
    return
  }

  var stats = {
    promoted: 0,
    rejected_no_ai: 0,
    rejected_no_promote: 0,
    rejected_insufficient: 0,
    update_failed: 0,
  }

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    var narr = row.paradocs_narrative
    var pq = row.paradocs_assessment?.pull_quote
    var hasNarrative = !!(narr && String(narr).trim() && narr !== 'INSUFFICIENT')
    var hasPullQuote = !!(pq && String(pq).trim() && pq !== 'INSUFFICIENT')

    // No AI yet OR AI returned INSUFFICIENT — reject
    if (!hasNarrative || !hasPullQuote) {
      var rejectKind = !hasNarrative && !hasPullQuote ? 'rejected_insufficient' : 'rejected_no_ai'
      if (!dryRun) {
        var r = await sb.from('reports').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', row.id)
        if (r.error) { stats.update_failed++; console.warn('  fail: ' + row.slug + ' — ' + r.error.message); continue }
      }
      stats[rejectKind as 'rejected_no_ai']++
      continue
    }

    // Re-score: run assessQuality with current fields, then check smart re-eval
    var qres = assessQuality(
      {
        title: row.title,
        description: row.description,
        source_type: row.source_type,
        location_name: row.location_name,
        event_date: row.event_date,
        category: row.category,
      } as any,
      row.metadata || {},
    )
    if (!qres.passed || !qres.qualityScore) {
      // Filter says no — reject
      if (!dryRun) {
        await sb.from('reports').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', row.id)
      }
      stats.rejected_no_promote++
      continue
    }

    var reeval = smartReEvaluate(qres.qualityScore, {
      title: row.title,
      description: row.description,
      source_type: row.source_type,
      location_name: row.location_name,
      event_date: row.event_date,
      category: row.category,
    })

    if (reeval.promote) {
      if (!dryRun) {
        var p = await sb.from('reports').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', row.id)
        if (p.error) { stats.update_failed++; console.warn('  fail: ' + row.slug + ' — ' + p.error.message); continue }
      }
      stats.promoted++
      if (stats.promoted <= 30) {
        console.log('  ↑ ' + row.slug + ' — ' + reeval.reason)
      }
    } else {
      if (!dryRun) {
        await sb.from('reports').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', row.id)
      }
      stats.rejected_no_promote++
    }
  }

  console.log('')
  console.log('=== Summary ===')
  console.log('Promoted (status=approved):           ' + stats.promoted)
  console.log('Rejected — no AI / partial AI output: ' + stats.rejected_no_ai)
  console.log('Rejected — AI INSUFFICIENT:           ' + stats.rejected_insufficient)
  console.log('Rejected — no promote signal:         ' + stats.rejected_no_promote)
  console.log('Update failures:                      ' + stats.update_failed)
}

main().catch(function (e) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})
