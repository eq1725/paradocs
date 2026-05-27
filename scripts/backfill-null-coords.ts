#!/usr/bin/env tsx
/**
 * Backfill latitude/longitude for approved reports with location_name set
 * but lat/lng NULL.
 *
 * V11.17.39 (#64) — 4,599 approved reports have geographic context
 * (location_name / city / country) but no coordinates. Most are legacy
 * Nominatim-outage casualties (V11.17.x) — the ingestion pipeline did
 * its location-text extraction but the geocoder was rate-limited /
 * 503'd, so the row landed with text-only geography.
 *
 * Side-effect: every backfilled row gains map-pin presence on /map +
 * the Lab constellation. The Africa-header bug we shipped a UI fix
 * for earlier in this session was THIS class of report — text says
 * "Texas" but no coords. After this script runs, the text-AND-coords
 * branch fires and the map header looks right.
 *
 * Pipeline:
 *   1. Pull rows where status='approved' AND location_name SET AND
 *      latitude IS NULL.
 *   2. For each: build a query string from city + state + country (or
 *      location_name if those fields are also NULL), geocode via
 *      MapTiler (free tier covers up to 100k/mo so 4.6k is free).
 *   3. Write back latitude / longitude / location_precision; mark
 *      coords_synthetic=true if the geocoder gave us only state/country
 *      level resolution.
 *
 * Idempotent + safe — UPDATE only, no destructive operations. Resume
 * after Ctrl+C is automatic (script re-fetches NULL rows on next run).
 *
 * Cost: $0 (MapTiler free tier) + ~5min wall time at 50 geocodes/sec.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-null-coords.ts              # all 4,599
 *   npx tsx scripts/backfill-null-coords.ts --limit 50   # smoke
 *   npx tsx scripts/backfill-null-coords.ts --dry-run    # log only
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { geocodeLocation, buildLocationQuery } from '../src/lib/services/geocoding.service'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const BATCH_SIZE = 200       // rows per Supabase fetch
const CONCURRENCY = 4         // simultaneous geocodes (MapTiler tolerates well)
const REPORT_EVERY = 50       // heartbeat lines

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string): string { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    limit: parseInt(flag('--limit', '0')),
    dryRun: bool('--dry-run'),
  }
}

interface ReportRow {
  id: string
  location_name: string | null
  city: string | null
  state_province: string | null
  country: string | null
}

function precisionFromAccuracy(accuracy: string): 'exact' | 'region' | 'country' {
  if (accuracy === 'address' || accuracy === 'street' || accuracy === 'locality') return 'exact'
  if (accuracy === 'region') return 'region'
  return 'country'
}

async function processBatch(
  rows: ReportRow[],
  supabase: any,
  args: ReturnType<typeof parseArgs>,
  stats: { geocoded: number; skipped: number; failed: number },
): Promise<void> {
  await Promise.all(rows.slice(0, CONCURRENCY).map(async (row, idx) => {
    // Slice into CONCURRENCY parallel workers handling stripes of the batch.
    for (let i = idx; i < rows.length; i += CONCURRENCY) {
      await processOne(rows[i], supabase, args, stats)
    }
  }))
}

async function processOne(
  row: ReportRow,
  supabase: any,
  args: ReturnType<typeof parseArgs>,
  stats: { geocoded: number; skipped: number; failed: number },
): Promise<void> {
  // Build the best query we can. Prefer structured city/state/country
  // because geocoders disambiguate "Lumberton" much better with state
  // context. Fall back to free-form location_name only when no
  // structured fields are present.
  let query: string | null = null
  if (row.city || row.state_province || row.country) {
    query = buildLocationQuery({
      city: row.city,
      stateProvince: row.state_province,
      country: row.country,
    })
  } else if (row.location_name) {
    query = row.location_name
  }
  if (!query) {
    stats.skipped++
    return
  }

  if (args.dryRun) {
    console.log('  [DRY]', row.id.substring(0, 8), '→ would geocode "' + query + '"')
    return
  }

  const result = await geocodeLocation(query)
  if (!result) {
    stats.failed++
    return
  }

  const precision = precisionFromAccuracy(result.accuracy)
  const synthetic = precision !== 'exact'
  const update: any = {
    latitude: result.latitude,
    longitude: result.longitude,
    location_precision: precision,
    coords_synthetic: synthetic,
  }
  const { error } = await supabase.from('reports').update(update).eq('id', row.id)
  if (error) {
    stats.failed++
    console.warn('  ', row.id.substring(0, 8), '→ DB update failed:', error.message)
    return
  }
  stats.geocoded++
  if (stats.geocoded % REPORT_EVERY === 0) {
    console.log('  [+' + stats.geocoded + '] last: ' + query.substring(0, 50) +
      ' → ' + result.latitude.toFixed(3) + ',' + result.longitude.toFixed(3) + ' (' + precision + ')')
  }
}

async function main() {
  const args = parseArgs()
  console.log('Backfill NULL coords — V11.17.39 (#64)')
  console.log('args:', JSON.stringify(args))

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Headline counts
  const { count: totalNull } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .is('latitude', null)
    .not('location_name', 'is', null)
  console.log('Total NULL-coord rows (location_name set):', totalNull)

  const cap = args.limit > 0 ? args.limit : (totalNull || 0)
  console.log('Will process:', cap, '\n')

  const stats = { geocoded: 0, skipped: 0, failed: 0 }
  const startMs = Date.now()
  let offset = 0

  while (true) {
    const fetchLimit = Math.min(BATCH_SIZE, cap - (stats.geocoded + stats.skipped + stats.failed))
    if (fetchLimit <= 0) break

    const { data: rows, error } = await supabase
      .from('reports')
      .select('id, location_name, city, state_province, country')
      .eq('status', 'approved')
      .is('latitude', null)
      .not('location_name', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + fetchLimit - 1)
    if (error) { console.error('fetch failed:', error.message); break }
    if (!rows || rows.length === 0) break

    await processBatch(rows as ReportRow[], supabase, args, stats)
    offset += rows.length

    // Heartbeat
    const elapsedSec = (Date.now() - startMs) / 1000
    const rate = stats.geocoded / Math.max(1, elapsedSec)
    const remaining = cap - (stats.geocoded + stats.skipped + stats.failed)
    const etaSec = rate > 0 ? Math.floor(remaining / rate) : 0
    console.log('[+' + Math.floor(elapsedSec) + 's] geocoded=' + stats.geocoded +
      ' skipped=' + stats.skipped + ' failed=' + stats.failed +
      ' rate=' + rate.toFixed(1) + '/s eta=' + Math.floor(etaSec / 60) + 'm ' + (etaSec % 60) + 's')

    if (rows.length < fetchLimit) break
  }

  const elapsedMin = Math.floor((Date.now() - startMs) / 60000)
  const elapsedSec = Math.floor(((Date.now() - startMs) % 60000) / 1000)

  console.log('\n========== FINAL ==========')
  console.log('Elapsed:    ' + elapsedMin + 'm ' + elapsedSec + 's')
  console.log('Geocoded:   ' + stats.geocoded)
  console.log('Skipped:    ' + stats.skipped + ' (no query buildable)')
  console.log('Failed:     ' + stats.failed + ' (geocoder gave no result OR DB write failed)')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
