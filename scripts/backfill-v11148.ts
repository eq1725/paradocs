#!/usr/bin/env tsx
/**
 * V11.14.8 — Combined backfill: location + witness_profile.
 *
 * Two backfill passes in one script, each independent of the other:
 *
 * (1) LOCATION refresh
 *     - For every approved + pending_review report (any source_type
 *       except user_submission), re-run parseLocation on title+body.
 *     - If parseLocation gives a more authoritative answer than what's
 *       currently in the row, update. Specifically:
 *         a. Row has country=null and parseLocation finds anything → fill.
 *         b. Row has international country (Ireland, Italy, etc.) but
 *            parseLocation now says United States → flip to US (V11.14.8
 *            Irish-witness/Texas-event fix).
 *         c. Otherwise leave alone (existing specific US locations
 *            should not be downgraded).
 *     - Runs normalizeLocation downstream to get country_code + coords.
 *
 * (2) WITNESS_PROFILE normalization
 *     - For every report with a non-empty witness_profile, run
 *       normalizeAgeRange / normalizeGender / normalizeState (extracted
 *       from V11.14.8 persistConsolidatedResult logic).
 *     - If any value changed, update. Captures Haiku slip-ups where
 *       raw "16" went through instead of "teen" bucket.
 *
 * Both passes paginate around Supabase's 5000-row PostgREST cap.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/backfill-v11148.ts --dry-run   # preview
 *   tsx scripts/backfill-v11148.ts             # apply
 *   tsx scripts/backfill-v11148.ts --pass location-only
 *   tsx scripts/backfill-v11148.ts --pass witness-only
 */

import { createClient } from '@supabase/supabase-js'
import { parseLocation } from '../src/lib/ingestion/utils/location-parser'
import {
  normalizeLocation,
  geocodeWithFallback,
  makeSupabaseGeocodeCache,
} from '../src/lib/ingestion/utils/normalize-location'

var dryRun = process.argv.includes('--dry-run')
var passArgIdx = process.argv.indexOf('--pass')
var pass = passArgIdx >= 0 ? process.argv[passArgIdx + 1] : 'both'  // both | location-only | witness-only

// ─────────────────────────────────────────────────────────────────────
// Witness-profile normalizers (mirrors V11.14.8 persistConsolidatedResult)
// ─────────────────────────────────────────────────────────────────────

function normalizeAgeRange(raw: any): string {
  if (typeof raw !== 'string') return 'unspecified'
  var trimmed = raw.trim().toLowerCase()
  var VALID = ['child', 'teen', '18-29', '30-49', '50-69', '70+', 'unspecified']
  if (VALID.indexOf(trimmed) !== -1) return trimmed
  var numMatch = trimmed.match(/^(\d{1,3})(?:\s*[fm]|\s*y(?:ears?)?|\s*old)?$/)
  if (numMatch) {
    var n = parseInt(numMatch[1], 10)
    if (n >= 0 && n <= 12) return 'child'
    if (n >= 13 && n <= 17) return 'teen'
    if (n >= 18 && n <= 29) return '18-29'
    if (n >= 30 && n <= 49) return '30-49'
    if (n >= 50 && n <= 69) return '50-69'
    if (n >= 70 && n <= 120) return '70+'
  }
  var rangeMatch = trimmed.match(/(\d{1,3})\s*(?:s|-|to|–)/)
  if (rangeMatch) {
    var rn = parseInt(rangeMatch[1], 10)
    if (rn >= 0 && rn <= 12) return 'child'
    if (rn >= 13 && rn <= 17) return 'teen'
    if (rn >= 18 && rn <= 29) return '18-29'
    if (rn >= 30 && rn <= 49) return '30-49'
    if (rn >= 50 && rn <= 69) return '50-69'
    if (rn >= 70) return '70+'
  }
  if (/\b(kid|child|toddler|infant|baby|preschool|elementary)\b/.test(trimmed)) return 'child'
  if (/\b(teen|teenager|adolescent|high\s+school|middle\s+school)\b/.test(trimmed)) return 'teen'
  if (/\b(twent|college|young\s+adult)\b/.test(trimmed)) return '18-29'
  if (/\b(thirt|fort)\b/.test(trimmed)) return '30-49'
  if (/\b(fift|sixt)\b/.test(trimmed)) return '50-69'
  if (/\b(senior|elder|retir|old\s+age|sevent|eight|ninet|nonagenarian)\b/.test(trimmed)) return '70+'
  return 'unspecified'
}

function normalizeGender(raw: any): string {
  if (typeof raw !== 'string') return 'unspecified'
  var t = raw.trim().toLowerCase()
  if (t === 'male' || t === 'female' || t === 'nonbinary' || t === 'unspecified') return t
  if (/^\d+\s*m$/.test(t) || t === 'm' || t === 'man' || t === 'boy' || t === 'masculine') return 'male'
  if (/^\d+\s*f$/.test(t) || t === 'f' || t === 'woman' || t === 'girl' || t === 'feminine') return 'female'
  if (t === 'nb' || t === 'non-binary' || t === 'non binary') return 'nonbinary'
  return 'unspecified'
}

function normalizeState(raw: any): string {
  if (typeof raw !== 'string') return 'unspecified'
  var t = raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '')
  var VALID = ['awake_alert', 'meditation', 'drowsy_falling_asleep', 'sleeping', 'driving', 'physical_activity', 'intoxicated', 'unspecified']
  if (VALID.indexOf(t) !== -1) return t
  if (/awake/.test(t)) return 'awake_alert'
  if (/medit/.test(t)) return 'meditation'
  if (/drows|tired|falling/.test(t)) return 'drowsy_falling_asleep'
  if (/sleep|asleep|dream/.test(t)) return 'sleeping'
  if (/driv|car|highway/.test(t)) return 'driving'
  if (/exercis|workout|hiking|running|active/.test(t)) return 'physical_activity'
  if (/drunk|high|intoxic|psyched|trip/.test(t)) return 'intoxicated'
  return 'unspecified'
}

// ─────────────────────────────────────────────────────────────────────
// Paginated query
// ─────────────────────────────────────────────────────────────────────

async function paginateAll(sb: any, selectCols: string, extraFilter?: (q: any) => any): Promise<any[]> {
  var rows: any[] = []
  var pageSize = 1000
  var offset = 0
  var fetched = pageSize
  while (fetched === pageSize) {
    var q = sb
      .from('reports')
      .select(selectCols)
      .in('status', ['approved', 'pending_review'])
      .neq('source_type', 'user_submission')
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (extraFilter) q = extraFilter(q)
    var res = await q
    if (res.error) {
      console.error('Query failed (offset=' + offset + '): ' + res.error.message)
      process.exit(1)
    }
    var pageRows = (res.data || []) as any[]
    rows.push.apply(rows, pageRows)
    fetched = pageRows.length
    offset += pageSize
    if (offset > 500000) break
  }
  return rows
}

// ─────────────────────────────────────────────────────────────────────
// PASS 1 — LOCATION
// ─────────────────────────────────────────────────────────────────────

async function backfillLocation(sb: any): Promise<void> {
  console.log('\n══════════════════════════════════════════════════════════')
  console.log('PASS 1 — LOCATION refresh')
  console.log('══════════════════════════════════════════════════════════')

  var rows = await paginateAll(
    sb,
    'id, slug, title, description, country, country_code, location_name, state_province, city',
    function (q: any) { return q.not('description', 'is', null) },
  )
  console.log('Candidates: ' + rows.length)

  var stats = {
    null_to_filled: 0,
    international_to_us_flip: 0,
    unchanged: 0,
    geocode_fail: 0,
    update_fail: 0,
  }
  var sampleFlips: string[] = []

  var cache = makeSupabaseGeocodeCache(sb)

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    var text = (row.title || '') + '\n\n' + (row.description || '')
    var parsed = parseLocation(text)

    var shouldUpdate = false
    var updateKind: 'null_to_filled' | 'international_to_us_flip' | null = null

    // Case A: was null, now has a country
    if (!row.country && parsed.country) {
      shouldUpdate = true
      updateKind = 'null_to_filled'
    }
    // Case B: was international, parseLocation now flips to US (V11.14.8)
    else if (
      row.country &&
      row.country !== 'United States' &&
      parsed.country === 'United States'
    ) {
      shouldUpdate = true
      updateKind = 'international_to_us_flip'
    }

    if (!shouldUpdate) {
      stats.unchanged++
      continue
    }

    if (sampleFlips.length < 20 && updateKind === 'international_to_us_flip') {
      sampleFlips.push('  [' + row.slug + '] ' + row.country + ' → United States' + (parsed.stateProvince ? ' (' + parsed.stateProvince + ')' : ''))
    }

    if (dryRun) {
      stats[updateKind!]++
      continue
    }

    // Run normalizeLocation
    var norm: any = null
    try {
      norm = await normalizeLocation(
        {
          city: parsed.city || null,
          state_province: parsed.stateProvince || null,
          country: parsed.country!,
          country_code: null,
          location_name: parsed.locationName || parsed.country!,
          latitude: null,
          longitude: null,
        },
        { geocoder: 'maptiler', geocodeFn: geocodeWithFallback, cache: cache },
      )
    } catch (e: any) {
      stats.geocode_fail++
      continue
    }
    if (!norm) {
      stats.geocode_fail++
      continue
    }
    var updateData: any = {
      location_name: norm.location_name || parsed.locationName || parsed.country,
      country: norm.country,
      country_code: norm.country_code,
      state_province: norm.state_province,
      city: norm.city,
      latitude: norm.latitude,
      longitude: norm.longitude,
      coords_synthetic: !!norm.coords_synthetic,
      updated_at: new Date().toISOString(),
    }
    var { error: ue } = await sb.from('reports').update(updateData).eq('id', row.id)
    if (ue) {
      stats.update_fail++
      console.warn('  fail: ' + row.slug + ' — ' + ue.message)
      continue
    }
    stats[updateKind!]++
    var totalUpdated = stats.null_to_filled + stats.international_to_us_flip
    if (totalUpdated % 50 === 0) console.log('  ... ' + totalUpdated + ' updated')
  }

  console.log('')
  console.log('--- Location pass summary ---')
  console.log('Null country → filled:           ' + stats.null_to_filled)
  console.log('International → United States:   ' + stats.international_to_us_flip)
  console.log('Unchanged (correct or no match): ' + stats.unchanged)
  console.log('Geocode failures:                ' + stats.geocode_fail)
  console.log('Update failures:                 ' + stats.update_fail)
  if (sampleFlips.length > 0) {
    console.log('\nSample international→US flips:')
    sampleFlips.forEach(function (s) { console.log(s) })
  }
}

// ─────────────────────────────────────────────────────────────────────
// PASS 2 — WITNESS_PROFILE
// ─────────────────────────────────────────────────────────────────────

async function backfillWitnessProfile(sb: any): Promise<void> {
  console.log('\n══════════════════════════════════════════════════════════')
  console.log('PASS 2 — WITNESS_PROFILE normalization')
  console.log('══════════════════════════════════════════════════════════')

  var rows = await paginateAll(
    sb,
    'id, slug, witness_profile',
    function (q: any) { return q.not('witness_profile', 'is', null) },
  )
  console.log('Candidates (has witness_profile): ' + rows.length)

  var stats = {
    normalized: 0,
    unchanged: 0,
    update_fail: 0,
  }
  var sampleChanges: string[] = []

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    var wp = row.witness_profile || {}
    var normalized = {
      gender: normalizeGender(wp.gender),
      age_range: normalizeAgeRange(wp.age_range),
      occupation_category: wp.occupation_category || 'unspecified',
      state_at_event: normalizeState(wp.state_at_event),
      with_others: wp.with_others === undefined ? null : wp.with_others,
      prior_similar_experience: wp.prior_similar_experience === undefined ? null : wp.prior_similar_experience,
      confidence: typeof wp.confidence === 'number' ? wp.confidence : 0.5,
    }

    // Compare to detect change
    var changed =
      normalized.gender !== (wp.gender || 'unspecified') ||
      normalized.age_range !== (wp.age_range || 'unspecified') ||
      normalized.state_at_event !== (wp.state_at_event || 'unspecified')

    if (!changed) {
      stats.unchanged++
      continue
    }

    if (sampleChanges.length < 30) {
      var diffs: string[] = []
      if (normalized.age_range !== (wp.age_range || 'unspecified')) diffs.push('age_range: ' + wp.age_range + ' → ' + normalized.age_range)
      if (normalized.gender !== (wp.gender || 'unspecified')) diffs.push('gender: ' + wp.gender + ' → ' + normalized.gender)
      if (normalized.state_at_event !== (wp.state_at_event || 'unspecified')) diffs.push('state: ' + wp.state_at_event + ' → ' + normalized.state_at_event)
      sampleChanges.push('  [' + row.slug + '] ' + diffs.join('; '))
    }

    if (dryRun) {
      stats.normalized++
      continue
    }

    var { error: ue } = await sb
      .from('reports')
      .update({ witness_profile: normalized, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (ue) {
      stats.update_fail++
      continue
    }
    stats.normalized++
    if (stats.normalized % 100 === 0) console.log('  ... ' + stats.normalized + ' normalized')
  }

  console.log('')
  console.log('--- Witness-profile pass summary ---')
  console.log('Normalized:      ' + stats.normalized)
  console.log('Unchanged:       ' + stats.unchanged)
  console.log('Update failures: ' + stats.update_fail)
  if (sampleChanges.length > 0) {
    console.log('\nSample changes:')
    sampleChanges.forEach(function (s) { console.log(s) })
  }
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function main() {
  var sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('=== V11.14.8 Combined Backfill ===')
  console.log('Mode: ' + (dryRun ? 'DRY RUN (no writes)' : 'APPLYING UPDATES'))
  console.log('Pass: ' + pass)

  if (pass === 'both' || pass === 'location-only') {
    await backfillLocation(sb)
  }
  if (pass === 'both' || pass === 'witness-only') {
    await backfillWitnessProfile(sb)
  }

  console.log('\n══════════════════════════════════════════════════════════')
  console.log('Done.')
}

main().catch(function (e) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})
