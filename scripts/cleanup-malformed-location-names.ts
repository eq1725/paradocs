#!/usr/bin/env tsx
/**
 * V11.17.8 — Cleanup pass for reports whose location_name field has
 * report body / title content leaked into it.
 *
 * The malformed pattern looks like:
 *   "Museum Barn Confronts Staff Member\n\nI work at a museum about
 *    farming in Upstate, NY, United States"
 *
 * What we want is just "Upstate, NY, United States" or better,
 * "Upstate, NY" — the trailing "City|Region, ST, Country" pattern
 * that the original ingestor was trying to capture.
 *
 * Strategy:
 *   1. Detect malformed strings — heuristic: length > 80 chars OR
 *      contains a newline OR contains a sentence-end punctuation
 *      before the comma-separated tail.
 *   2. Extract the last 3-4 comma-separated tokens — the "place,
 *      state, country" tail.
 *   3. Verify the extracted tail looks like a real place by checking
 *      whether the last token matches a known country (from
 *      country-centroids.json) or the 2nd-to-last matches a known
 *      US state code.
 *   4. Update location_name to the cleaned tail.
 *
 * Drain-safe + classifier-safe: only writes reports.location_name +
 * updated_at. Does NOT touch coords, status, or any other field. The
 * map render is unaffected until the report is also re-geocoded.
 *
 * After this runs, the regeocode script can be re-run to upgrade
 * these reports from 'region' → 'city' precision now that their
 * location_name is parseable.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/cleanup-malformed-location-names.ts --dry-run
 *   tsx scripts/cleanup-malformed-location-names.ts
 */

import { createClient } from '@supabase/supabase-js'
import countryCentroids from '../src/lib/ingestion/utils/country-centroids.json'

const DRY = process.argv.includes('--dry-run')

// Build known-country + known-state-code sets for verification.
function buildKnownPlaceSets(): { countries: Set<string>; states: Set<string> } {
  const countries = new Set<string>()
  for (const code in countryCentroids) {
    if (code.startsWith('$')) continue
    const c = (countryCentroids as any)[code]
    if (c && typeof c.name === 'string') countries.add(c.name.toLowerCase())
    if (Array.isArray(c?.aliases)) {
      for (const a of c.aliases) {
        if (typeof a === 'string') countries.add(a.toLowerCase())
      }
    }
  }
  // Add common US-style country aliases that the data uses.
  countries.add('united states')
  countries.add('usa')
  countries.add('u.s.a.')
  countries.add('u.s.')
  countries.add('us')
  // US state two-letter codes — used in "City, NY" patterns.
  const states = new Set<string>([
    'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy','dc',
  ])
  return { countries, states }
}

interface ReportRow {
  id: string
  location_name: string | null
  city: string | null
  state_province: string | null
  country: string | null
}

function isMalformed(s: string): boolean {
  if (s.length > 80) return true
  if (s.includes('\n')) return true
  if (s.includes('!') || s.includes('?')) return true
  // V11.17.8.1 — Periods alone don't mean malformed ("St. Louis, MO"
  // is a real city name with a clean abbreviation). Only flag the
  // period case when the string is long enough that the period
  // probably signals a sentence end inside leaked body content.
  if (s.length > 50 && s.includes('.')) return true
  return false
}

// Extract the trailing place from a malformed string. Returns null
// if the tail doesn't look like a real place. Anchors on either the
// last known-country segment OR the last 2-letter US-state code.
function extractTail(s: string, known: { countries: Set<string>; states: Set<string> }): string | null {
  // V11.17.8.1 — If the string has a newline, the real location lives
  // in the POST-newline portion (the pre-newline part is the report
  // title that leaked in). Take everything after the LAST newline.
  let working = s
  if (working.includes('\n')) {
    const lastNl = working.lastIndexOf('\n')
    working = working.substring(lastNl + 1).trim()
    if (!working) return null
  }
  // Also strip leading "In " / "Near " / "Around " — those are
  // narrative prepositions, not part of the city name.
  working = working.replace(/^(?:in|near|around|outside|just\s+outside)\s+/i, '').trim()

  const parts = working.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return null

  // Try country anchor first (walk backwards).
  let countryIdx = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    if (known.countries.has(parts[i].toLowerCase())) {
      countryIdx = i
      break
    }
  }

  // If no country found, try state anchor — check if the LAST segment
  // is a 2-letter US state code.
  let stateIdx = -1
  let stateRaw = ''
  let hasCountry = false
  if (countryIdx >= 0) {
    hasCountry = true
    stateIdx = countryIdx - 1
    if (stateIdx >= 0) stateRaw = parts[stateIdx]
  } else {
    const lastIdx = parts.length - 1
    const lastSegLower = parts[lastIdx].toLowerCase()
    if (parts[lastIdx].length === 2 && known.states.has(lastSegLower)) {
      stateIdx = lastIdx
      stateRaw = parts[stateIdx]
    } else {
      // Couldn't anchor on country OR state — give up.
      return null
    }
  }
  if (stateIdx < 0 || !stateRaw) return null

  // The city should be 1 segment before the state — extract the
  // rightmost capitalized words.
  const cityIdx = stateIdx - 1
  let citySegment = cityIdx >= 0 ? parts[cityIdx] : ''
  citySegment = citySegment.replace(/[.!?]/g, '').trim()

  // V11.17.8.1 — Strip narrative prefixes that commonly leak into
  // the location segment ("I live in Sacramento" → "Sacramento").
  // Apply BEFORE word-splitting so multi-word phrases catch.
  const NARRATIVE_PREFIXES: RegExp[] = [
    /^.*?\b(?:i|we|she|he|they|my\s+wife\s+and\s+i|my\s+husband\s+and\s+i|my\s+family|my\s+girlfriend\s+and\s+i|my\s+boyfriend\s+and\s+i)\s+(?:live|lived|work|worked|grew\s+up|stayed|stay|am|was|were)\s+(?:in|at|near|around|outside|just\s+outside)\s+/i,
    /^.*?\b(?:in|near|around|outside|just\s+outside|just\s+off|right\s+outside)\s+(?:the\s+)?(?:beautiful|small|tiny|big|huge|rural|busy)?\s*(?:town\s+of|city\s+of|state\s+of|village\s+of)\s+/i,
  ]
  for (const re of NARRATIVE_PREFIXES) {
    citySegment = citySegment.replace(re, '').trim()
  }

  const cityWords = citySegment.split(/\s+/).slice(-4)
  while (cityWords.length > 0 && cityWords[0] && /^[a-z]/.test(cityWords[0])) {
    cityWords.shift()
  }
  const cityClean = cityWords.join(' ').trim()

  // V11.17.8.1 — Sanity-check cityClean. Reject if any of:
  //   - contains a stop-word ("along", "the", "of", verbs)
  //   - all-caps fragment ("HAPPEN TODAY SAT M") — real cities aren't
  //   - contains a 1-letter token (typically truncated junk)
  //   - longer than 30 chars (real cities are short)
  // When the city portion fails the sanity, emit just "State[, Country]"
  // which is still an improvement over the original malformed string.
  const CITY_STOPWORDS = ['along', 'around', 'near', 'outside', 'the', 'of', 'and', 'with', 'into', 'from', 'through', 'across', 'read', 'saw', 'said', 'told', 'live', 'lived', 'work', 'worked', 'happen', 'note', 'today', 'happened']
  const cityWordsArr = cityClean.split(/\s+/).filter(Boolean)
  const cityLower = cityClean.toLowerCase()
  const cityHasStopword = cityClean.length > 0 && (
    CITY_STOPWORDS.some(w => cityLower.split(/\s+/).includes(w))
  )
  const cityAllCaps = cityClean.length > 0 && cityClean === cityClean.toUpperCase() && /[A-Z]/.test(cityClean)
  const cityHasShortToken = cityWordsArr.some(w => w.length === 1)
  const cityTooLong = cityClean.length > 30
  const cityIsBad = cityHasStopword || cityAllCaps || cityHasShortToken || cityTooLong

  const tailSegments: string[] = []
  if (cityClean && !cityIsBad) tailSegments.push(cityClean)
  tailSegments.push(stateRaw)
  if (hasCountry) tailSegments.push(parts[countryIdx])
  const out = tailSegments.filter(Boolean).join(', ')

  if (out.length > 80) return null
  if (out.length < 4) return null
  if (out.length >= s.length) return null
  return out
}

// V11.17.8.1 — Structured-field fallback. When the regex extractor
// can't produce a safe tail, prefer the row's existing city /
// state_province / country fields if any are populated. The
// structured fields are usually correct (set by parseLocation or by
// the original source adapter); only location_name was contaminated.
function structuredFallback(row: ReportRow): string | null {
  const parts = [row.city, row.state_province, row.country].filter(Boolean) as string[]
  if (parts.length === 0) return null
  const joined = parts.join(', ').trim()
  if (joined.length < 3 || joined.length > 80) return null
  // Don't overwrite if the structured fallback is the same as the
  // original (avoids no-op updates).
  if (row.location_name && joined === row.location_name.trim()) return null
  return joined
}

async function fetchAllRows<T = any>(query: any, pageSize = 1000): Promise<T[]> {
  const all: T[] = []
  let offset = 0
  while (true) {
    const res = await query.range(offset, offset + pageSize - 1)
    if (res.error) throw new Error(res.error.message)
    const rows = res.data || []
    all.push(...(rows as any))
    if (rows.length < pageSize) break
    offset += pageSize
    if (offset > 500000) break
  }
  return all
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('=== Cleanup: malformed location_name strings ===')
  console.log('Dry run: ' + DRY)

  const known = buildKnownPlaceSets()
  console.log('Known: ' + known.countries.size + ' country aliases, ' + known.states.size + ' US state codes')

  console.log('\nLoading approved reports with non-null location_name...')
  const rows = await fetchAllRows<ReportRow>(
    sb.from('reports')
      .select('id, location_name, city, state_province, country')
      .eq('status', 'approved')
      .not('location_name', 'is', null)
  )
  console.log('  loaded ' + rows.length + ' reports')

  type Fix = { id: string; before: string; after: string; source: 'extracted' | 'structured' }
  const fixes: Fix[] = []
  let scanned = 0
  let malformedNoExtraction = 0
  let viaExtraction = 0
  let viaStructured = 0

  for (const r of rows) {
    const original = (r.location_name || '').trim()
    if (!isMalformed(original)) continue
    scanned++
    // Try extraction first; if that fails, fall back to structured fields.
    let cleaned: string | null = extractTail(original, known)
    let source: 'extracted' | 'structured' = 'extracted'
    if (!cleaned) {
      cleaned = structuredFallback(r)
      source = 'structured'
    }
    if (!cleaned) {
      malformedNoExtraction++
      continue
    }
    if (cleaned === original) continue
    if (source === 'extracted') viaExtraction++
    else viaStructured++
    fixes.push({ id: r.id, before: original, after: cleaned, source })
  }

  console.log('\nResults:')
  console.log('  Malformed strings detected: ' + scanned)
  console.log('    Via tail extraction:     ' + viaExtraction)
  console.log('    Via structured fallback: ' + viaStructured)
  console.log('    Unrecoverable:           ' + malformedNoExtraction)

  console.log('\nSample fixes:')
  fixes.slice(0, 15).forEach(f => {
    const before = f.before.length > 70 ? f.before.substring(0, 67) + '...' : f.before
    console.log('  [' + f.id.substring(0, 8) + '] (' + f.source + ') "' + before.replace(/\n/g, ' / ') + '" → "' + f.after + '"')
  })

  if (DRY) {
    console.log('\nDRY RUN — no DB writes performed.')
    return
  }
  if (fixes.length === 0) {
    console.log('Nothing to update.')
    return
  }

  console.log('\nApplying location_name cleanup...')
  let written = 0
  let errors = 0
  const t0 = Date.now()
  for (const f of fixes) {
    const res = await sb.from('reports')
      .update({ location_name: f.after, updated_at: new Date().toISOString() })
      .eq('id', f.id)
    if (res.error) {
      errors++
      if (errors < 5) console.warn('  err ' + f.id.substring(0, 8) + ': ' + res.error.message)
    } else {
      written++
    }
    if (written % 100 === 0 && written > 0) {
      const el = Math.round((Date.now() - t0) / 1000)
      console.log('  +' + el + 's  written=' + written + '/' + fixes.length)
    }
  }

  const el = Math.round((Date.now() - t0) / 1000)
  console.log('\nDone in ' + el + 's')
  console.log('  Cleaned: ' + written)
  console.log('  Errors:  ' + errors)
  console.log('\nNext step: re-run regeocode to upgrade these to city precision:')
  console.log('  npx tsx scripts/regeocode-region-precision-reports.ts')
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1) })
