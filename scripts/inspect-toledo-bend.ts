#!/usr/bin/env tsx
/**
 * Diagnostic: inspect the Toledo Bend report row and probe MapTiler for
 * various query variants so we can pick the variant that pins to the
 * real ~31.5N, -93.7W reservoir on the TX/LA border.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/inspect-toledo-bend.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { stripPrepositionalPrefix } from '../src/lib/services/geocoding.service'

const SLUG = 'triangle-sighting-in-over-toledo-bend-lake-texas-2022-08-07-dthoah'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function getMapTilerKey(): string | null {
  return (
    process.env.MAPTILER_GEOCODING_KEY ||
    process.env.MAPTILER_API_KEY ||
    process.env.NEXT_PUBLIC_MAPTILER_KEY ||
    process.env.MAPTILER_KEY ||
    null
  )
}

interface MapTilerFeature {
  center: [number, number]
  place_name: string
  relevance: number
  place_type: string[]
}
interface MapTilerResponse {
  features: MapTilerFeature[]
}

async function probeMapTiler(query: string, apiKey: string, limit = 3): Promise<void> {
  const url =
    'https://api.maptiler.com/geocoding/' +
    encodeURIComponent(query) +
    '.json?key=' +
    apiKey +
    '&limit=' +
    limit
  const res = await fetch(url)
  console.log('--- query: ' + JSON.stringify(query) + ' (status ' + res.status + ')')
  if (!res.ok) {
    console.log('  ERROR ' + res.status + ': ' + (await res.text()).slice(0, 200))
    return
  }
  const data = (await res.json()) as MapTilerResponse
  if (!data.features || data.features.length === 0) {
    console.log('  (no features)')
    return
  }
  for (let i = 0; i < data.features.length; i++) {
    const f = data.features[i]
    const lng = f.center?.[0]
    const lat = f.center?.[1]
    console.log(
      '  [' +
        i +
        '] lat=' +
        (lat != null ? lat.toFixed(4) : 'null') +
        ' lng=' +
        (lng != null ? lng.toFixed(4) : 'null') +
        ' relevance=' +
        (f.relevance ?? 'n/a') +
        ' place_type=[' +
        (f.place_type || []).join(',') +
        '] name=' +
        JSON.stringify(f.place_name),
    )
  }
}

async function main() {
  console.log('=== Step 1: DB row ===')
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('slug', SLUG)
    .maybeSingle()
  if (error) {
    console.error('DB error:', error.message)
    process.exit(1)
  }
  if (!data) {
    console.error('No report found for slug:', SLUG)
    process.exit(1)
  }
  // Print every column whose name contains location/geo/coord/lat/lng/source/precision/updated
  const interesting = Object.keys(data)
    .filter((k) =>
      /^(id|slug|title|location|city|state|country|lat|long|coord|geo|precision|source|enrich|updated|created)/i.test(
        k,
      ),
    )
    .sort()
  for (const k of interesting) {
    const v = (data as Record<string, unknown>)[k]
    console.log('  ' + k.padEnd(28) + ' = ' + JSON.stringify(v))
  }

  console.log('')
  console.log('=== Step 2: stripPrepositionalPrefix() on the stored values ===')
  const stripLoc = stripPrepositionalPrefix(String(data.location_name || ''))
  const stripCity = stripPrepositionalPrefix(String(data.city || ''))
  console.log('  location_name strip:', JSON.stringify(stripLoc))
  console.log('  city          strip:', JSON.stringify(stripCity))

  console.log('')
  console.log('=== Step 3: MapTiler probes ===')
  const apiKey = getMapTilerKey()
  if (!apiKey) {
    console.error('No MapTiler API key in env. Looked for MAPTILER_GEOCODING_KEY, MAPTILER_API_KEY, NEXT_PUBLIC_MAPTILER_KEY, MAPTILER_KEY.')
    process.exit(1)
  }
  console.log('  (using key prefix: ' + apiKey.slice(0, 6) + '...)')
  const variants = [
    'Over Toledo bend lake, Texas',
    'Toledo bend lake, Texas',
    'Toledo Bend Reservoir',
    'Toledo Bend Lake',
    'Toledo Bend, Texas',
    'Toledo Bend Reservoir, Texas',
    'Toledo Bend Reservoir Texas',
    'Toledo Bend Reservoir, Louisiana',
  ]
  for (const v of variants) {
    await probeMapTiler(v, apiKey, 3)
    await new Promise((r) => setTimeout(r, 150))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
