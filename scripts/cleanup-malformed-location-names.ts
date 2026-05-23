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
}

function isMalformed(s: string): boolean {
  if (s.length > 80) return true
  if (s.includes('\n')) return true
  if (s.includes('.')) return true // sentence-ending punctuation
  if (s.includes('!') || s.includes('?')) return true
  return false
}

// Extract the trailing place from a malformed string. Returns null
// if the tail doesn't look like a real place.
function extractTail(s: string, known: { countries: Set<string>; states: Set<string> }): string | null {
  // Split on commas; the last 2-4 segments should be the place tail.
  const parts = s.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return null

  // Find the last segment that looks like a known country.
  // Walk backwards.
  let countryIdx = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    if (known.countries.has(parts[i].toLowerCase())) {
      countryIdx = i
      break
    }
  }
  if (countryIdx === -1) return null

  // The state should be 1 segment before the country.
  const stateIdx = countryIdx - 1
  if (stateIdx < 0) return null
  const stateRaw = parts[stateIdx]
  const stateLower = stateRaw.toLowerCase()
  // Accept 2-letter US code OR longer state/region name (the geocoder
  // will sort out which). If it's a country directly preceded by
  // garbage, just emit "State, Country" — that's already an
  // improvement and will resolve to a region centroid honestly.
  const isUsState = stateRaw.length === 2 && known.states.has(stateLower)

  // The city should be 1 segment before the state — but it might be
  // glued to body text ("...in the beautiful state of Maine" → "...
  // beautiful state of Maine, ME, United States"). Take only the
  // last word(s) of the city segment, up to ~30 chars, then strip
  // leading body-junk.
  const cityIdx = stateIdx - 1
  let citySegment = cityIdx >= 0 ? parts[cityIdx] : ''
  // Strip likely body-content: keep only the rightmost word group
  // that doesn't include verbs / sentence endings. Heuristic: take
  // the last 1-3 capitalized tokens at the end of the segment.
  citySegment = citySegment.replace(/[.!?]/g, '').trim()
  // Take last 1-4 words; drop if they're clearly sentence verbs.
  const cityWords = citySegment.split(/\s+/).slice(-4)
  // Trim leading lowercase words (body) until we hit a capitalized
  // token (likely the start of a city name).
  while (cityWords.length > 0 && cityWords[0] && /^[a-z]/.test(cityWords[0])) {
    cityWords.shift()
  }
  const cityClean = cityWords.join(' ').trim()

  // Build the cleaned tail.
  const out = [cityClean, stateRaw, parts[countryIdx]].filter(Boolean).join(', ')
  // Final sanity: cleaned tail should be reasonably short.
  if (out.length > 80) return null
  if (out.length < 4) return null
  return out
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
      .select('id, location_name')
      .eq('status', 'approved')
      .not('location_name', 'is', null)
  )
  console.log('  loaded ' + rows.length + ' reports')

  type Fix = { id: string; before: string; after: string }
  const fixes: Fix[] = []
  let scanned = 0
  let malformedNoExtraction = 0

  for (const r of rows) {
    const original = (r.location_name || '').trim()
    if (!isMalformed(original)) continue
    scanned++
    const cleaned = extractTail(original, known)
    if (!cleaned) {
      malformedNoExtraction++
      continue
    }
    if (cleaned === original) continue // unchanged
    fixes.push({ id: r.id, before: original, after: cleaned })
  }

  console.log('\nResults:')
  console.log('  Malformed strings detected: ' + scanned)
  console.log('    Extracted clean tail:    ' + fixes.length)
  console.log('    Unrecoverable:           ' + malformedNoExtraction)

  console.log('\nSample fixes:')
  fixes.slice(0, 15).forEach(f => {
    const before = f.before.length > 70 ? f.before.substring(0, 67) + '...' : f.before
    console.log('  [' + f.id.substring(0, 8) + '] "' + before.replace(/\n/g, ' / ') + '" → "' + f.after + '"')
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
