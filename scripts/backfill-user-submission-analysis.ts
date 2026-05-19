#!/usr/bin/env tsx
/**
 * One-off backfill: regenerate paradocs_assessment + paradocs_narrative
 * + feed_hook for approved user_submission reports that don't have
 * analysis yet.
 *
 * Round 5 used a fire-and-forget HTTP trigger from /publish to kick
 * off the Sonnet analysis on a separate function. That was unreliable
 * on Vercel (parent function returned before TCP was initiated), so
 * the first batch of user video submissions has status=approved but
 * no paradocs_assessment, no feed_hook, no paradocs_narrative — and
 * the report page renders the "Paradocs is analyzing this account…"
 * placeholder forever.
 *
 * Round 6 fixed the publish flow to run the analysis synchronously.
 * This script handles the rows that were stranded in between.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
 *   tsx scripts/backfill-user-submission-analysis.ts
 *
 *   Optional: REPORT_ID=<uuid> to backfill a single specific report.
 *   Optional: DRY_RUN=1 to list candidates without running Sonnet.
 *
 * SWC: var + function() form.
 */

import { createClient } from '@supabase/supabase-js'
// Use the retry orchestrator, not generateAndSaveDirect — when a
// field fails claim-check the orchestrator does a corrective retry
// instead of silently blanking the field. Matches what /publish does.
import { generateAndSaveParadocsAnalysis } from '../src/lib/services/paradocs-analysis.service'

async function main() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY')
    process.exit(1)
  }

  var supabase = createClient(supabaseUrl, supabaseKey)
  var dryRun = process.env.DRY_RUN === '1'
  var singleId = process.env.REPORT_ID || null

  var query = supabase
    .from('reports')
    .select('id, slug, title, source_type, has_video, status, created_at, paradocs_narrative')
    .eq('status', 'approved')
    .eq('source_type', 'user_submission')
    .is('paradocs_narrative', null)
    .order('created_at', { ascending: true })

  if (singleId) {
    query = supabase
      .from('reports')
      .select('id, slug, title, source_type, has_video, status, created_at, paradocs_narrative')
      .eq('id', singleId)
  }

  var { data: rows, error } = await query
  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }
  if (!rows || rows.length === 0) {
    console.log('Nothing to backfill.')
    return
  }

  console.log('Found ' + rows.length + ' candidate(s):')
  rows.forEach(function (r: any) {
    console.log('  ' + r.id + ' — ' + (r.title || '(no title)') + (r.has_video ? ' [VIDEO]' : ''))
  })

  if (dryRun) {
    console.log('\nDRY_RUN=1 — exiting without running Sonnet.')
    return
  }

  var ok = 0
  var failed = 0
  for (var i = 0; i < rows.length; i++) {
    var row: any = rows[i]
    console.log('\n[' + (i + 1) + '/' + rows.length + '] Generating for ' + row.id + '…')
    try {
      var saved = await generateAndSaveParadocsAnalysis(row.id)
      if (saved) {
        console.log('  ✓ saved')
        ok++
      } else {
        console.warn('  ✗ returned false')
        failed++
      }
    } catch (e: any) {
      console.warn('  ✗ threw:', e?.message || e)
      failed++
    }
  }

  console.log('\nDone. ' + ok + ' saved, ' + failed + ' failed.')
}

main().catch(function (e: any) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})
