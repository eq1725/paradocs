#!/usr/bin/env tsx
/**
 * V11.17.99 — Backfill reports whose location_name/city begins with a
 * prepositional phrase ("Over X", "Near X", "South of X", "Between X
 * and Y", etc.).
 *
 * Bug surfaced by the founder on the report
 *   triangle-sighting-in-over-toledo-bend-lake-texas-2022-08-07-dthoah
 * where location_name="Over Toledo bend lake, Texas" geocoded to
 * (30.07, -93.90) — Beaumont/Port Arthur area — instead of the actual
 * Toledo Bend Reservoir at (31.57, -93.79). MapTiler couldn't parse
 * "Over Toledo bend lake" so it fuzzy-matched a "Toledo Bend" landform
 * at a wrong centroid 150mi south of the lake.
 *
 * Strategy:
 *   1. Pull reports whose city OR location_name starts with a
 *      preposition the geocoder can't parse.
 *   2. Re-run through geocodeStructuredLocation — V11.17.99 will
 *      strip the prefix and either land on a clean locality/region
 *      hit OR fall back to the state centroid honestly.
 *   3. UPDATE lat/lng + coords_synthetic when the new result differs.
 *
 * Idempotent. Has --dry-run for review.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/backfill-prepositional-locations.ts --dry-run
 *   tsx scripts/backfill-prepositional-locations.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import {
  geocodeStructuredLocation,
  stripPrepositionalPrefix,
} from '../src/lib/services/geocoding.service'
import type { StructuredGeocodeResult } from '../src/lib/services/geocoding.service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const dryRun = process.argv.includes('--dry-run')
const verbose = process.argv.includes('--verbose')

// Prefixes we sweep on. Same list as the regex in geocoding.service.ts.
const PATTERNS = [
  'Over ',
  'Above ',
  'Near ',
  'Outside ',
  'Just outside ',
  'Just north of ',
  'Just south of ',
  'Just east of ',
  'Just west of ',
  'South of ',
  'North of ',
  'East of ',
  'West of ',
  'Between ',
]

interface ReportRow {
  id: string
  slug: string
  title: string | null
  location_name: string | null
  city: string | null
  state_province: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  coords_synthetic: boolean | null
}

async function collectCandidates(): Promise<ReportRow[]> {
  const byId = new Map<string, ReportRow>()
  const fields =
    'id, slug, title, location_name, city, state_province, country, latitude, longitude, coords_synthetic'
  for (const p of PATTERNS) {
    // location_name path
    const { data: a, error: ea } = await supabase
      .from('reports')
      .select(fields)
      .ilike('location_name', p + '%')
      .limit(1000)
    if (ea) console.error('[' + p + '] location_name query:', ea.message)
    for (const r of a || []) byId.set(r.id, r as ReportRow)

    // city path — submitter often crammed the preposition into the city slot
    const { data: b, error: eb } = await supabase
      .from('reports')
      .select(fields)
      .ilike('city', p + '%')
      .limit(1000)
    if (eb) console.error('[' + p + '] city query:', eb.message)
    for (const r of b || []) byId.set(r.id, r as ReportRow)
  }
  return Array.from(byId.values())
}

function approxEqual(a: number | null, b: number | null, eps = 0.001): boolean {
  if (a == null || b == null) return a === b
  return Math.abs(a - b) < eps
}

interface UpdatePlan {
  report: ReportRow
  newLat: number
  newLng: number
  newSynthetic: boolean
  newLocationName: string | null
  source: string
}

async function main() {
  console.log('V11.17.99 — prepositional-location backfill ' + (dryRun ? '[DRY RUN]' : '[APPLY]'))
  console.log('')

  const rows = await collectCandidates()
  console.log('Found ' + rows.length + ' candidate reports across all prefixes.')
  console.log('')

  const plans: UpdatePlan[] = []
  let unchanged = 0
  let nullResult = 0
  let cleared = 0
  let improved = 0

  for (const r of rows) {
    // Re-run the geocoder via the V11.17.99 structured path. It will
    // strip the prefix internally and either return a clean hit or fall
    // back to the state centroid.
    let result: StructuredGeocodeResult | null = null
    try {
      result = await geocodeStructuredLocation({
        city: r.city,
        state: r.state_province,
        country: r.country,
        location_name: r.location_name,
      })
    } catch (e: any) {
      console.error('  [err] ' + r.slug + ': ' + (e?.message || e))
      continue
    }

    if (!result) {
      nullResult++
      if (verbose) console.log('  [null] ' + r.slug + ' (' + r.location_name + ')')
      continue
    }

    // Compare to existing coords. If the new coords match within ~111m, skip.
    const lat = result.latitude
    const lng = result.longitude
    if (approxEqual(lat, r.latitude) && approxEqual(lng, r.longitude)) {
      unchanged++
      if (verbose) console.log('  [same] ' + r.slug + ' -> (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')')
      continue
    }

    // Also normalize the location_name: strip the preposition so the
    // displayed text matches what we actually geocoded. Preserve casing
    // by using the same string slice as the original.
    let newLocationName: string | null = r.location_name
    if (r.location_name) {
      const strip = stripPrepositionalPrefix(r.location_name)
      if (strip.stripped) {
        newLocationName = strip.cleaned || r.location_name
      }
    }

    plans.push({
      report: r,
      newLat: lat,
      newLng: lng,
      newSynthetic: !!result.synthetic,
      newLocationName: newLocationName,
      source: result.source,
    })
    if (result.synthetic) cleared++
    else improved++
  }

  console.log('Re-geocoded ' + rows.length + ' rows:')
  console.log('  ' + plans.length + ' will change')
  console.log('    -> ' + improved + ' moved to a new specific match')
  console.log('    -> ' + cleared + ' cleared to state centroid (coords_synthetic=true)')
  console.log('  ' + unchanged + ' unchanged (new result matched existing within ~111m)')
  console.log('  ' + nullResult + ' returned null (no usable result; left alone)')
  console.log('')
  console.log('Sample plan (top 15):')
  for (const p of plans.slice(0, 15)) {
    const r = p.report
    const before =
      'before=(' +
      (r.latitude != null ? r.latitude.toFixed(4) : 'null') +
      ', ' +
      (r.longitude != null ? r.longitude.toFixed(4) : 'null') +
      ')'
    const after =
      'after=(' + p.newLat.toFixed(4) + ', ' + p.newLng.toFixed(4) + ', synth=' + p.newSynthetic + ')'
    console.log('  ' + r.slug.padEnd(70) + ' ' + before + ' -> ' + after + '  [' + p.source + ']')
  }
  console.log('')

  if (dryRun) {
    console.log('--dry-run: no changes written.')
    return
  }

  let updated = 0
  let errCount = 0
  for (const p of plans) {
    const update: Record<string, unknown> = {
      latitude: p.newLat,
      longitude: p.newLng,
      coords_synthetic: p.newSynthetic,
    }
    if (p.newLocationName && p.newLocationName !== p.report.location_name) {
      update.location_name = p.newLocationName
    }
    if (p.newSynthetic) {
      // Honest precision when we degraded to a centroid.
      update.location_precision = 'region'
    }
    const { error } = await supabase.from('reports').update(update).eq('id', p.report.id)
    if (error) {
      errCount++
      console.error('  [err] ' + p.report.slug + ': ' + error.message)
      continue
    }
    updated++
  }
  console.log('')
  console.log('Updated ' + updated + ' of ' + plans.length + ' reports (' + errCount + ' errors).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
