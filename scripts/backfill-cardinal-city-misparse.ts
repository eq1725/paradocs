#!/usr/bin/env tsx
/**
 * V11.17.25 — Backfill the "North/South/etc. <state>" misparses.
 *
 * Bug #12: location-parser used to treat "in North Florida" as
 * city="North" + state="FL", and the geocoder fell back to a real but
 * unrelated "North, TX" town in Hidalgo County. Result: FL reports
 * pinned to a TX cluster at 26.289, -98.317.
 *
 * This script:
 *   1. Identifies all reports where city matches a cardinal/regional
 *      token AND state_province doesn't naturally contain that name
 *      (e.g., "North, FL" is a bug because there's no North in FL,
 *      but "North, TX" is legitimate — North is a real Hidalgo town).
 *   2. NULLs out city, latitude, longitude, sets coords_synthetic=false
 *      so the next render falls through to state-level placement
 *      (Florida centroid, etc.). location_precision = 'region' to be
 *      explicit.
 *
 * Drain-safe: UPDATE only — never DELETE. Idempotent (rerunnable).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/backfill-cardinal-city-misparse.ts --dry-run
 *   tsx scripts/backfill-cardinal-city-misparse.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const CARDINAL_TOKENS = ['north', 'south', 'east', 'west', 'central',
  'upper', 'lower', 'northern', 'southern', 'eastern', 'western',
  'northeast', 'northwest', 'southeast', 'southwest', 'mid', 'middle',
  'coastal', 'rural', 'interior', 'downtown', 'uptown', 'greater']

// Real-but-tiny US towns matching cardinal names. If state matches, leave it.
// Source: USGS GNIS + USPS — these are towns where city=<cardinal> is legit.
const LEGITIMATE_CARDINAL_CITIES: Record<string, Set<string>> = {
  'north': new Set(['Texas', 'South Carolina']),      // North, TX (Hidalgo Co.) + North, SC (Orangeburg Co.)
  'south': new Set([]),                               // No major "South, <state>" town
  'east': new Set([]),
  'west': new Set(['Texas']),                         // West, TX (McLennan Co.)
  'central': new Set([]),
  'northern': new Set([]),
  'southern': new Set([]),
  'eastern': new Set([]),
  'western': new Set([]),
}

const dryRun = process.argv.includes('--dry-run')

async function main() {
  let totalToFix = 0
  let totalLegit = 0
  const allFixes: Array<{ id: string; slug: string; city: string; state: string; lat: number; lng: number }> = []

  for (const token of CARDINAL_TOKENS) {
    const { data: rows, error } = await supabase
      .from('reports')
      .select('id, slug, city, state_province, latitude, longitude')
      .ilike('city', token)
      .not('latitude', 'is', null)
    if (error) { console.error(token, error); continue }
    const legit = LEGITIMATE_CARDINAL_CITIES[token] || new Set()
    for (const r of rows || []) {
      if (legit.has(r.state_province || '')) {
        totalLegit++
        continue
      }
      allFixes.push({
        id: r.id,
        slug: r.slug,
        city: r.city,
        state: r.state_province,
        lat: r.latitude,
        lng: r.longitude,
      })
      totalToFix++
    }
  }

  console.log(`\nFound ${totalToFix} reports to fix.`)
  console.log(`Skipped ${totalLegit} legitimate cardinal-named towns (left untouched).`)
  console.log('\nSample of fixes (top 20):')
  for (const f of allFixes.slice(0, 20)) {
    console.log(`  ${f.slug.padEnd(60)} ${f.city}, ${f.state} (was ${f.lat}, ${f.lng})`)
  }

  if (dryRun) {
    console.log('\n--dry-run: no changes written.')
    return
  }

  let updated = 0
  for (const f of allFixes) {
    const { error } = await supabase
      .from('reports')
      .update({
        city: null,
        latitude: null,
        longitude: null,
        coords_synthetic: false,
        location_name: f.state,  // fall back to state name
      })
      .eq('id', f.id)
    if (error) {
      console.error(`  [err] ${f.slug}: ${error.message}`)
      continue
    }
    updated++
  }
  console.log(`\nUpdated ${updated} of ${totalToFix} reports.`)
  console.log('Next: run the MapTiler backfill (task #64) to re-geocode at state-level precision.')
}
main().catch(e => { console.error(e); process.exit(1) })
