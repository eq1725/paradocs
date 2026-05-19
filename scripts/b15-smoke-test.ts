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
    // data_sources schema varies — select everything and pick what
    // we know exists across versions.
    var { data: sources, error: listErr } = await supabase
      .from('data_sources')
      .select('*')
      .order('adapter_type', { ascending: true })
    if (listErr) {
      console.error('data_sources select failed:', listErr.message)
      process.exit(1)
    }
    if (!sources || sources.length === 0) {
      console.log('No rows in data_sources table.')
      return
    }
    console.log('Available data sources:')
    sources.forEach(function (s: any) {
      var name = s.name || s.label || s.adapter_type || '(unnamed)'
      var active = (s.is_active === true) ? '●' : '○'
      console.log('  ' + active + ' ' + (s.id || '(no-id)') + '  ' + name
        + '  [adapter=' + (s.adapter_type || '?') + ']'
        + (s.last_synced_at ? '  last=' + s.last_synced_at : ''))
    })
    console.log('\nUsage: tsx scripts/b15-smoke-test.ts <uuid or name-substring> [limit]')
    return
  }

  // V10.7.E.11.b — argSource may be a UUID or a name/adapter
  // substring. runIngestion expects the row's UUID. If the input
  // doesn't look like a UUID, do a fuzzy lookup against
  // data_sources.name / .adapter_type and resolve.
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(argSource)) {
    console.log('Resolving "' + argSource + '" against data_sources…')
    var { data: rows, error: lookupErr } = await supabase
      .from('data_sources')
      .select('*')
    if (lookupErr) {
      console.error('Lookup failed:', lookupErr.message)
      process.exit(1)
    }
    var lower = argSource.toLowerCase()
    var matches: any[] = (rows || []).filter(function (s: any) {
      var n = (s.name || '').toString().toLowerCase()
      var a = (s.adapter_type || '').toString().toLowerCase()
      var l = (s.label || '').toString().toLowerCase()
      return n.indexOf(lower) !== -1 || a.indexOf(lower) !== -1 || l.indexOf(lower) !== -1
    })
    if (matches.length === 0) {
      console.error('No data_sources row matched "' + argSource + '". Run `list` to see options.')
      process.exit(1)
    }
    if (matches.length > 1) {
      console.error('Ambiguous match — ' + matches.length + ' rows:')
      matches.forEach(function (m: any) {
        console.error('  ' + m.id + '  ' + (m.name || m.adapter_type))
      })
      console.error('Re-run with the exact UUID or a more specific substring.')
      process.exit(1)
    }
    var match: any = matches[0]
    console.log('Resolved → ' + match.id + ' (' + (match.name || match.adapter_type) + ')')
    argSource = match.id
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

  // Fetch the inserted rows to eyeball.
  // V10.7.E.11.b — pull by created_at >= when we started rather than
  // filtering on source_type, since argSource is now a data_sources
  // UUID and reports.source_type is the adapter's text label ('oberf',
  // 'nuforc', etc.). Anything created in the last few minutes after
  // we kicked off the job is from this run.
  if (result.recordsInserted > 0) {
    console.log('')
    console.log('=== Sample of inserted reports ===')
    var sinceIso = new Date(startedAt - 2000).toISOString() // 2s buffer
    var sampleResp = await supabase
      .from('reports')
      .select('id, slug, title, summary, description, category, country, state_province, city, event_date, event_date_precision, source_type, source_label, created_at, latitude, longitude')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(argLimit)
    var sampleRows: any[] = sampleResp.data || []
    sampleRows.forEach(function (r: any, i: number) {
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
