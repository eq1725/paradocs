#!/usr/bin/env tsx
/**
 * B0.1.exec — B1.5 adapter smoke tests
 *
 * Runs the ingestion engine for one source at a time with a small
 * record limit (default 5), then prints a per-record summary so you
 * can spot-check titles, narratives, locations, dates, and any
 * rejection reasons before authorizing mass-ingestion (B2.1+).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/b15-smoke-test.ts <source_id> [limit]
 *
 *   source_id  — name in data_sources table (e.g. 'nuforc', 'oberf',
 *                'nderf', 'reddit_paranormal', etc.). Pass 'list' to
 *                see available active sources.
 *   limit      — default 5
 *
 * Examples:
 *   tsx scripts/b15-smoke-test.ts list
 *   tsx scripts/b15-smoke-test.ts oberf 5
 *   tsx scripts/b15-smoke-test.ts nuforc 5
 *
 * Each smoke run:
 *   1. Calls runIngestion(source_id, limit) directly (no HTTP roundtrip)
 *   2. Prints job summary (inserted, updated, skipped, rejected)
 *   3. Pulls the most recent N inserted reports for that source and
 *      prints title + 200-char description preview + location + date
 *   4. Flags anything that looks wrong: missing location, missing
 *      date, suspicious title, empty narrative
 *
 * The smoke test does NOT trigger Sonnet analysis — that's controlled
 * separately. Goal here is to verify the adapter + filters produce
 * clean rows.
 *
 * SWC: var + function() form.
 */

import { createClient } from '@supabase/supabase-js'
import { runIngestion } from '../src/lib/ingestion/engine'

async function main() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  var supabase = createClient(supabaseUrl, supabaseKey)
  var argSource = (process.argv[2] || '').trim()
  var argLimit = parseInt(process.argv[3] || '5', 10) || 5

  if (!argSource || argSource === 'list') {
    var { data: sources } = await supabase
      .from('data_sources')
      .select('id, name, source_type, is_active, last_ingested_at')
      .order('source_type', { ascending: true })
    console.log('Available data sources:')
    ;(sources || []).forEach(function (s: any) {
      console.log('  ' + (s.is_active ? '●' : '○') + ' ' + s.id + ' — ' + s.name + ' (' + (s.source_type || '?') + ')'
        + (s.last_ingested_at ? ' last=' + s.last_ingested_at : ''))
    })
    console.log('\nUsage: tsx scripts/b15-smoke-test.ts <source_id> [limit]')
    return
  }

  console.log('=== B1.5 smoke test ===')
  console.log('source_id: ' + argSource)
  console.log('limit:     ' + argLimit)
  console.log('')

  console.log('Running ingestion…')
  var startedAt = Date.now()
  var result = await runIngestion(argSource, argLimit)
  var durationMs = Date.now() - startedAt

  console.log('')
  console.log('=== Job summary ===')
  console.log('  success:         ' + result.success)
  console.log('  duration:        ' + durationMs + 'ms')
  console.log('  recordsFound:    ' + result.recordsFound)
  console.log('  recordsInserted: ' + result.recordsInserted)
  console.log('  recordsUpdated:  ' + result.recordsUpdated)
  console.log('  recordsSkipped:  ' + result.recordsSkipped)
  if ((result as any).error) console.log('  error: ' + (result as any).error)
  var rejDetails: any[] = (result as any).rejectedDetails || []
  if (rejDetails.length > 0) {
    console.log('  rejected:')
    rejDetails.slice(0, 5).forEach(function (r: any) {
      console.log('    ✗ ' + (r.title || r.id || '(unknown)') + ' — ' + (r.reason || 'no reason'))
    })
  }

  // Fetch the inserted rows to eyeball
  if (result.recordsInserted > 0) {
    console.log('')
    console.log('=== Sample of inserted reports ===')
    var { data: rows } = await supabase
      .from('reports')
      .select('id, slug, title, summary, description, category, country, state_province, city, event_date, event_date_precision, source_type, source_label, created_at, latitude, longitude')
      .eq('source_type', argSource)
      .order('created_at', { ascending: false })
      .limit(argLimit)
    ;(rows || []).forEach(function (r: any, i: number) {
      console.log('')
      console.log('[' + (i + 1) + '] ' + (r.title || '(no title)'))
      console.log('    slug:        ' + r.slug)
      console.log('    category:    ' + r.category)
      console.log('    location:    ' + [r.city, r.state_province, r.country].filter(Boolean).join(', '))
      console.log('    coords:      ' + (r.latitude && r.longitude ? r.latitude + ',' + r.longitude : '(none)'))
      console.log('    event_date:  ' + (r.event_date || '(none)') + ' (' + (r.event_date_precision || '?') + ')')
      console.log('    description: ' + ((r.description || '').substring(0, 200) + (r.description && r.description.length > 200 ? '…' : '')))

      // Flag obvious problems
      var flags: string[] = []
      if (!r.city && !r.state_province && !r.country) flags.push('NO_LOCATION')
      if (!r.event_date && !((r as any).event_date_raw)) flags.push('NO_DATE')
      if (!r.description || r.description.length < 50) flags.push('SHORT_NARRATIVE')
      if ((r.title || '').length < 10) flags.push('SHORT_TITLE')
      if (flags.length > 0) console.log('    ⚠ flags:    ' + flags.join(', '))
    })
  }

  console.log('')
  console.log('=== Done ===')
  if (result.success && result.recordsInserted > 0) {
    console.log('✓ Smoke test passed — eyeball the sample above and confirm:')
    console.log('  • Titles read naturally, no placeholders or chrome text')
    console.log('  • Locations are present where the source had them')
    console.log('  • Dates parsed correctly (year/month/day precision)')
    console.log('  • Descriptions are the actual experience body, not source navigation chrome')
    console.log('  • No PII leaked (first names, addresses)')
  } else {
    console.log('✗ Smoke test failed or zero records inserted. Check logs above.')
  }
}

main().catch(function (e: any) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})
