/**
 * V10.8.C normalize-location test suite.
 *
 * Run:
 *   npx ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' scripts/test-normalize-location.ts
 *
 * Fixtures cover the four-step pipeline:
 *   1. Country alias folding (USA, U.S.A., America, Britain, UK → canonical)
 *   2. State/province validation (US states, CA provinces, UK home nations)
 *   3. Geocoding ladder fallback (city → state centroid → country centroid → unknown)
 *   4. Range / sanity gates ((0,0)-without-country, out-of-range)
 *
 * A mock geocoder lets us assert behavior without hitting the network.
 */

import {
  normalizeLocation,
  RawLocation,
  NormalizedLocation,
  MapTilerGeocodeFn,
  GeocodeCacheLike,
} from '../src/lib/ingestion/utils/normalize-location'

type ExpectedShape = Partial<NormalizedLocation>

interface Fixture {
  name: string
  raw: RawLocation
  geocodeFn?: MapTilerGeocodeFn
  cache?: GeocodeCacheLike
  expected: ExpectedShape
}

// Mock geocoder: returns a fixed coord for "Sedona", null otherwise.
const mockGeocoder: MapTilerGeocodeFn = async function (query) {
  if (/sedona/i.test(query)) return { lat: 34.8697, lng: -111.7610, accuracy: 'locality' }
  if (/london/i.test(query)) return { lat: 51.5074, lng: -0.1278, accuracy: 'locality' }
  return null
}

// In-memory geocode cache for tests.
function makeMemCache(): GeocodeCacheLike & { _map: Map<string, any> } {
  const map = new Map<string, any>()
  return {
    _map: map,
    async get(key) {
      return map.get(key) || null
    },
    async set(key, lat, lng, accuracy) {
      map.set(key, { lat, lng, accuracy })
    },
  }
}

const FIXTURES: Fixture[] = [
  // ── 1. Country alias folding ─────────────────────────────────────
  {
    name: 'USA folds to United States, country_code=US',
    raw: { country: 'USA' },
    expected: {
      country: 'United States',
      country_code: 'US',
      coords_synthetic: true,
      location_precision: 'country',
    },
  },
  {
    name: 'U.S.A. (dotted) folds to United States',
    raw: { country: 'U.S.A.' },
    expected: { country: 'United States', country_code: 'US' },
  },
  {
    name: 'America folds to United States',
    raw: { country: 'America' },
    expected: { country: 'United States', country_code: 'US' },
  },
  {
    name: 'UK folds to United Kingdom',
    raw: { country: 'UK' },
    expected: { country: 'United Kingdom', country_code: 'GB' },
  },
  {
    name: 'Britain folds to United Kingdom',
    raw: { country: 'Britain' },
    expected: { country: 'United Kingdom', country_code: 'GB' },
  },
  {
    name: 'country_code US (already canonical) resolves cleanly',
    raw: { country_code: 'US' },
    expected: { country: 'United States', country_code: 'US' },
  },
  {
    name: 'unknown country preserved as raw, no country_code, no centroid',
    raw: { country: 'Atlantis' },
    expected: {
      country: 'Atlantis',
      country_code: null,
      latitude: null,
      longitude: null,
      location_precision: 'unknown',
      coords_synthetic: false,
    },
  },

  // ── 2. State/province validation ────────────────────────────────
  {
    name: 'US state abbreviation (TX) resolved to Texas',
    raw: { country: 'United States', state_province: 'TX' },
    expected: {
      country: 'United States',
      country_code: 'US',
      state_province: 'Texas',
      location_precision: 'region',
      coords_synthetic: true,
    },
  },
  {
    name: 'US state full name (California) resolved canonically',
    raw: { country: 'United States', state_province: 'California' },
    expected: {
      state_province: 'California',
      location_precision: 'region',
      coords_synthetic: true,
    },
  },
  {
    name: 'CA province (ON) resolved to Ontario',
    raw: { country: 'Canada', state_province: 'ON' },
    expected: {
      country: 'Canada',
      country_code: 'CA',
      state_province: 'Ontario',
      location_precision: 'region',
    },
  },
  {
    name: 'UK home nation (Scotland) resolved canonically',
    raw: { country: 'United Kingdom', state_province: 'Scotland' },
    expected: {
      country: 'United Kingdom',
      state_province: 'Scotland',
      location_precision: 'region',
    },
  },
  {
    name: 'AU state abbreviation (NSW) resolved',
    raw: { country: 'Australia', state_province: 'NSW' },
    expected: {
      country: 'Australia',
      state_province: 'New South Wales',
      location_precision: 'region',
    },
  },
  {
    name: 'state mismatch (Ontario in United States) preserved verbatim, falls through to country centroid',
    raw: { country: 'United States', state_province: 'Ontario' },
    expected: {
      country: 'United States',
      state_province: 'Ontario',
      location_precision: 'country',
      coords_synthetic: true,
    },
  },

  // ── 3. Geocoding ladder ─────────────────────────────────────────
  {
    name: 'exact lat/lng passes through unchanged',
    raw: { country: 'United States', state_province: 'AZ', city: 'Sedona', latitude: 34.8697, longitude: -111.7610 },
    expected: {
      latitude: 34.8697,
      longitude: -111.7610,
      location_precision: 'exact',
      coords_synthetic: false,
    },
  },
  {
    name: 'city + state + country with MapTiler returns city-precision',
    raw: { country: 'United States', state_province: 'AZ', city: 'Sedona' },
    geocodeFn: mockGeocoder,
    expected: {
      city: 'Sedona',
      state_province: 'Arizona',
      latitude: 34.8697,
      longitude: -111.7610,
      location_precision: 'city',
      coords_synthetic: false,
    },
  },
  {
    name: 'city + state + country WITHOUT MapTiler falls back to state centroid',
    raw: { country: 'United States', state_province: 'AZ', city: 'Sedona' },
    expected: {
      state_province: 'Arizona',
      location_precision: 'region',
      coords_synthetic: true,
    },
  },
  {
    name: 'state + country (no city) → state centroid',
    raw: { country: 'United States', state_province: 'KS' },
    expected: {
      state_province: 'Kansas',
      location_precision: 'region',
      coords_synthetic: true,
    },
  },
  {
    name: 'country only → country centroid',
    raw: { country: 'Brazil' },
    expected: {
      country: 'Brazil',
      country_code: 'BR',
      latitude: -14.2350,
      longitude: -51.9253,
      location_precision: 'country',
      coords_synthetic: true,
    },
  },
  {
    name: 'nothing usable → all nulls, precision=unknown',
    raw: {},
    expected: {
      country: null,
      country_code: null,
      latitude: null,
      longitude: null,
      location_precision: 'unknown',
      coords_synthetic: false,
    },
  },

  // ── 4. Range / sanity gates ──────────────────────────────────────
  {
    name: '(0,0) without country drops coords',
    raw: { latitude: 0, longitude: 0 },
    expected: {
      latitude: null,
      longitude: null,
      location_precision: 'unknown',
    },
  },
  {
    name: 'latitude out-of-range falls back to country centroid',
    raw: { country: 'United States', latitude: 91 as any, longitude: 0 },
    expected: {
      country: 'United States',
      latitude: 39.8283,
      longitude: -98.5795,
      location_precision: 'country',
      coords_synthetic: true,
    },
  },

  // ── 5. Cache hit path ────────────────────────────────────────────
  {
    name: 'cache hit short-circuits the geocoder call',
    raw: { country: 'United Kingdom', state_province: 'England', city: 'London' },
    geocodeFn: (async function () { throw new Error('geocoder should not be called') }) as MapTilerGeocodeFn,
    cache: (function () {
      const c = makeMemCache()
      c._map.set('london|england|united kingdom', { lat: 51.5074, lng: -0.1278, accuracy: 'locality' })
      return c
    })(),
    expected: {
      city: 'London',
      state_province: 'England',
      country: 'United Kingdom',
      latitude: 51.5074,
      longitude: -0.1278,
      location_precision: 'city',
      coords_synthetic: false,
    },
  },
]

let pass = 0
let fail = 0
const fails: string[] = []

;(async () => {
  for (const fx of FIXTURES) {
    const result = await normalizeLocation(fx.raw, {
      geocoder: fx.geocodeFn ? 'maptiler' : 'none',
      geocodeFn: fx.geocodeFn,
      cache: fx.cache,
    })

    let ok = true
    const diffs: string[] = []
    for (const k of Object.keys(fx.expected) as (keyof NormalizedLocation)[]) {
      const want = fx.expected[k]
      const got = result[k]
      if (typeof want === 'number' && typeof got === 'number') {
        if (Math.abs(want - got) > 0.001) {
          ok = false
          diffs.push('  ' + k + ': want=' + want + ' got=' + got)
        }
      } else if (want !== got) {
        ok = false
        diffs.push('  ' + k + ': want=' + JSON.stringify(want) + ' got=' + JSON.stringify(got))
      }
    }

    if (ok) {
      process.stdout.write('.')
      pass++
    } else {
      process.stdout.write('F')
      fail++
      fails.push('[' + fx.name + ']\n' + diffs.join('\n'))
    }
  }

  console.log('')
  console.log('')
  console.log('Total: ' + FIXTURES.length + ' | Pass: ' + pass + ' | Fail: ' + fail)
  if (fails.length) {
    console.log('')
    console.log('Failures:')
    for (const f of fails) {
      console.log(f)
      console.log('')
    }
    process.exit(1)
  }
})()
