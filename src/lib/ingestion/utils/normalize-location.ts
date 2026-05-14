/**
 * normalizeLocation — V10.8.C unified location normalizer.
 *
 * Replaces ad-hoc per-adapter / render-side location handling with one
 * cascading pipeline. Every report row that flows through the engine
 * comes out the other side with:
 *
 *   - country folded to its canonical name (US/USA/America → "United States")
 *   - country_code populated (ISO 3166-1 alpha-2)
 *   - latitude/longitude either preserved (if the adapter supplied
 *     precise coords), geocoded via MapTiler (if city+state were
 *     supplied), or filled from a centroid fallback
 *   - location_precision set to one of 'exact' | 'city' | 'region' |
 *     'country' | 'unknown'
 *   - coords_synthetic flagged true when coords came from a centroid
 *     fallback (so the map can render fuzzy markers without re-deriving
 *     the heuristic on every render — see ReportPageV2 cleanup commit)
 *
 * Pipeline order:
 *   1. Country alias normalization. "USA", "U.S.A.", "America" all
 *      fold to "United States" + country_code='US'. Looks up
 *      country-centroids.json for the canonical mapping.
 *   2. State/province validation. If the state isn't in the country's
 *      known subdivisions (US/CA/UK/AU first-class), null it out so
 *      we don't write "Texas, Mexico" to the DB. The validator's
 *      LOC_STATE_COUNTRY_MISMATCH warning still fires upstream.
 *   3. Geocoding ladder (top→bottom, first hit wins):
 *        a. Valid lat/lng provided   → keep, precision='exact'
 *        b. city + state + country   → MapTiler geocode (cached)
 *                                       precision='city', synthetic=false
 *        c. state + country          → state centroid (synthetic)
 *                                       precision='region', synthetic=true
 *        d. country only             → country centroid (synthetic)
 *                                       precision='country', synthetic=true
 *        e. nothing usable           → precision='unknown'
 *   4. Range validation. Reject (lat,lng) outside [-90,90]×[-180,180].
 *      Reject (0,0) when no country was supplied (parsing-bug signal —
 *      LOC_COORDS_ORIGIN warning fires too).
 *
 * MapTiler integration is optional — when no API key is configured
 * (or the geocoder='none' option is passed) the city-precision path
 * falls through to state/country centroids. This keeps the function
 * pure in tests.
 *
 * Geocode cache contract: { get(key), set(key, lat, lng, accuracy) }.
 * Cache key shape: 'city|state|country' lowercased with commas
 * collapsed. The engine wires this to a Supabase-backed cache; tests
 * use an in-memory Map.
 */

// JSON imports work with TypeScript via the `resolveJsonModule: true`
// flag the project already sets in tsconfig.
import countryCentroids from './country-centroids.json'
import stateCentroids from './state-centroids.json'

export type LocationPrecision = 'exact' | 'city' | 'region' | 'country' | 'unknown'

export type GeocodeAccuracy =
  | 'point'        // street-level or sharper
  | 'address'      // building / parcel
  | 'street'       // street segment
  | 'locality'     // city / town / village
  | 'region'       // state / province
  | 'country'

export interface NormalizedLocation {
  city: string | null
  state_province: string | null
  country: string | null         // canonical name, e.g. "United States"
  country_code: string | null    // ISO 3166-1 alpha-2, e.g. "US"
  location_name: string | null
  latitude: number | null
  longitude: number | null
  location_precision: LocationPrecision
  /** True when coords came from a centroid fallback rather than a precise geocode. */
  coords_synthetic: boolean
}

export interface RawLocation {
  city?: string | null
  state_province?: string | null
  country?: string | null
  country_code?: string | null
  location_name?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface GeocodeCacheLike {
  get(key: string): Promise<{ lat: number; lng: number; accuracy?: string } | null>
  set(key: string, lat: number, lng: number, accuracy: string): Promise<void>
}

export interface MapTilerGeocodeFn {
  (
    query: string,
    countryCode?: string | null,
  ): Promise<{ lat: number; lng: number; accuracy: GeocodeAccuracy } | null>
}

export interface NormalizeLocationOptions {
  /** 'none' disables geocoding for tests. 'maptiler' uses the wired backend. */
  geocoder?: 'maptiler' | 'none'
  cache?: GeocodeCacheLike
  /** Override the MapTiler geocoder function — used by tests / mocks. */
  geocodeFn?: MapTilerGeocodeFn
}

// ── Country alias / lookup tables ─────────────────────────────────

interface CountryEntry {
  name: string
  lat: number
  lng: number
  aliases: string[]
}

interface StateEntry {
  name: string
  lat: number
  lng: number
  aliases?: string[]
}

// Build a fast "any-string → ISO2 code" map at module load time.
// Includes the canonical name, the code itself, and every alias.
const COUNTRY_BY_KEY: Record<string, string> = {}
const COUNTRY_BY_CODE: Record<string, CountryEntry> = {}

for (const code of Object.keys(countryCentroids)) {
  if (code.startsWith('$')) continue
  const entry = (countryCentroids as Record<string, unknown>)[code] as CountryEntry
  COUNTRY_BY_CODE[code] = entry
  COUNTRY_BY_KEY[code.toLowerCase()] = code
  COUNTRY_BY_KEY[normalizeKey(entry.name)] = code
  for (const alias of entry.aliases || []) {
    COUNTRY_BY_KEY[normalizeKey(alias)] = code
  }
}

// State table: country code → state key → entry. Build a per-country
// "any-string → state key" map too for fuzzy lookup.
const STATE_BY_KEY: Record<string, Record<string, string>> = {}
const STATE_BY_CODE: Record<string, Record<string, StateEntry>> = {}

for (const countryCode of Object.keys(stateCentroids)) {
  if (countryCode.startsWith('$')) continue
  const sub = (stateCentroids as Record<string, unknown>)[countryCode] as Record<string, StateEntry>
  STATE_BY_CODE[countryCode] = sub
  STATE_BY_KEY[countryCode] = {}
  for (const stateKey of Object.keys(sub)) {
    const stateEntry = sub[stateKey]
    STATE_BY_KEY[countryCode][stateKey.toLowerCase()] = stateKey
    STATE_BY_KEY[countryCode][normalizeKey(stateEntry.name)] = stateKey
    for (const alias of stateEntry.aliases || []) {
      STATE_BY_KEY[countryCode][normalizeKey(alias)] = stateKey
    }
  }
}

// ── Public entry point ────────────────────────────────────────────

export async function normalizeLocation(
  raw: RawLocation,
  options?: NormalizeLocationOptions,
): Promise<NormalizedLocation> {
  const opts = options || {}

  // ── 1. Country alias normalization ───────────────────────────────
  let countryCode: string | null = null
  let countryName: string | null = null

  if (raw.country_code) {
    const upper = String(raw.country_code).trim().toUpperCase()
    if (COUNTRY_BY_CODE[upper]) {
      countryCode = upper
      countryName = COUNTRY_BY_CODE[upper].name
    }
  }
  if (!countryCode && raw.country) {
    const resolved = COUNTRY_BY_KEY[normalizeKey(raw.country)]
    if (resolved) {
      countryCode = resolved
      countryName = COUNTRY_BY_CODE[resolved].name
    } else {
      // Unknown country — keep the raw string so we don't lose it,
      // but country_code stays null and centroid fallbacks won't fire.
      countryName = String(raw.country).trim()
    }
  }

  // ── 2. State/province validation ─────────────────────────────────
  let stateKey: string | null = null
  let stateName: string | null = null
  if (raw.state_province && countryCode && STATE_BY_KEY[countryCode]) {
    const resolved = STATE_BY_KEY[countryCode][normalizeKey(raw.state_province)]
    if (resolved) {
      stateKey = resolved
      stateName = STATE_BY_CODE[countryCode][resolved].name
    } else {
      // State doesn't match known subdivisions for this country.
      // We preserve the raw value (so the validator can surface the
      // LOC_STATE_COUNTRY_MISMATCH warning) but the centroid fallback
      // won't use it.
      stateName = String(raw.state_province).trim()
    }
  } else if (raw.state_province) {
    // Country is unknown — pass through the state string verbatim.
    stateName = String(raw.state_province).trim()
  }

  const city = raw.city ? String(raw.city).trim() : null

  // ── 3. Geocoding ladder ──────────────────────────────────────────
  let latitude: number | null = null
  let longitude: number | null = null
  let precision: LocationPrecision = 'unknown'
  let coordsSynthetic = false

  // 3a. Valid lat/lng provided
  if (isValidCoord(raw.latitude, raw.longitude)) {
    latitude = raw.latitude as number
    longitude = raw.longitude as number
    precision = 'exact'
    coordsSynthetic = false
  } else if (
    city && stateKey && countryCode &&
    opts.geocoder !== 'none' && opts.geocodeFn
  ) {
    // 3b. City + state + country → MapTiler with cache.
    const cacheKey = makeGeocodeKey(city, stateName, countryName)
    let cached: { lat: number; lng: number; accuracy?: string } | null = null
    if (opts.cache) {
      try {
        cached = await opts.cache.get(cacheKey)
      } catch (e) {
        // Cache read failure is non-fatal.
        cached = null
      }
    }
    let coord: { lat: number; lng: number; accuracy: GeocodeAccuracy } | null = null
    if (cached) {
      coord = {
        lat: cached.lat,
        lng: cached.lng,
        accuracy: (cached.accuracy as GeocodeAccuracy) || 'locality',
      }
    } else {
      try {
        coord = await opts.geocodeFn(
          [city, stateName, countryName].filter(Boolean).join(', '),
          countryCode,
        )
        if (coord && opts.cache) {
          try {
            await opts.cache.set(cacheKey, coord.lat, coord.lng, coord.accuracy)
          } catch (e) {
            // Cache write failure is non-fatal.
          }
        }
      } catch (e) {
        coord = null
      }
    }
    if (coord && isValidCoord(coord.lat, coord.lng)) {
      latitude = coord.lat
      longitude = coord.lng
      precision = coord.accuracy === 'point' || coord.accuracy === 'address' || coord.accuracy === 'street'
        ? 'exact'
        : 'city'
      coordsSynthetic = false
    }
  }

  // 3c. State + country centroid fallback (only when MapTiler didn't
  // fire or didn't return a result).
  if (latitude === null && stateKey && countryCode && STATE_BY_CODE[countryCode]?.[stateKey]) {
    const c = STATE_BY_CODE[countryCode][stateKey]
    latitude = c.lat
    longitude = c.lng
    precision = 'region'
    coordsSynthetic = true
  }

  // 3d. Country centroid fallback.
  if (latitude === null && countryCode && COUNTRY_BY_CODE[countryCode]) {
    const c = COUNTRY_BY_CODE[countryCode]
    latitude = c.lat
    longitude = c.lng
    precision = 'country'
    coordsSynthetic = true
  }

  // ── 4. Range / sanity gates ──────────────────────────────────────
  if (!isValidCoord(latitude, longitude)) {
    latitude = null
    longitude = null
    if (precision !== 'unknown') precision = 'unknown'
    coordsSynthetic = false
  }
  // (0,0) without a country is a parsing-bug signal — drop the coords.
  if (latitude === 0 && longitude === 0 && !countryName) {
    latitude = null
    longitude = null
    precision = 'unknown'
    coordsSynthetic = false
  }

  // ── 5. location_name composition ────────────────────────────────
  let locationName: string | null = raw.location_name ? String(raw.location_name).trim() : null
  if (!locationName) {
    const parts = [city, stateName, countryName].filter(Boolean) as string[]
    locationName = parts.length ? parts.join(', ') : null
  }

  return {
    city: city || null,
    state_province: stateName,
    country: countryName,
    country_code: countryCode,
    location_name: locationName,
    latitude,
    longitude,
    location_precision: precision,
    coords_synthetic: coordsSynthetic,
  }
}

// ── MapTiler geocoder ─────────────────────────────────────────────

/**
 * Default MapTiler-backed geocoder. Requires MAPTILER_API_KEY env.
 * Returns null on any non-200 response or empty result — callers
 * should fall through to centroid logic.
 *
 * Endpoint: https://api.maptiler.com/geocoding/{query}.json?key=...
 * We request limit=1 and bias by country when available.
 */
export const maptilerGeocoder: MapTilerGeocodeFn = async function (query, countryCode) {
  // Read NEXT_PUBLIC_MAPTILER_KEY first (the project already wires this
  // for client-side map tiles — same key works server-side for
  // geocoding). MAPTILER_API_KEY is supported as a fallback if a
  // future deploy wants a separate server-only key.
  const apiKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || process.env.MAPTILER_API_KEY
  if (!apiKey) return null
  const url = new URL('https://api.maptiler.com/geocoding/' + encodeURIComponent(query) + '.json')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('limit', '1')
  if (countryCode) url.searchParams.set('country', countryCode.toLowerCase())

  let resp: Response
  try {
    resp = await fetch(url.toString())
  } catch (e) {
    return null
  }
  if (!resp.ok) return null
  const data: any = await resp.json().catch(() => null)
  if (!data || !Array.isArray(data.features) || data.features.length === 0) return null

  const feat = data.features[0]
  const coords = feat.center || feat.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  // MapTiler returns [lng, lat] per GeoJSON.
  const lng = Number(coords[0])
  const lat = Number(coords[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  // Map MapTiler's place_type to our GeocodeAccuracy enum.
  const placeType: string[] = feat.place_type || []
  let accuracy: GeocodeAccuracy = 'locality'
  if (placeType.includes('address') || placeType.includes('poi')) accuracy = 'address'
  else if (placeType.includes('street')) accuracy = 'street'
  else if (placeType.includes('municipality') || placeType.includes('locality') || placeType.includes('city')) accuracy = 'locality'
  else if (placeType.includes('region')) accuracy = 'region'
  else if (placeType.includes('country')) accuracy = 'country'

  return { lat, lng, accuracy }
}

// ── Supabase-backed geocode cache ─────────────────────────────────

/**
 * Wraps the `geocode_cache` table as a GeocodeCacheLike. Caller
 * supplies a SupabaseClient. Cache is best-effort: any DB error is
 * swallowed and the function returns null / no-ops on writes.
 */
export function makeSupabaseGeocodeCache(client: any): GeocodeCacheLike {
  return {
    async get(key) {
      try {
        const { data } = await client
          .from('geocode_cache')
          .select('lat, lng, accuracy')
          .eq('query', key)
          .maybeSingle()
        if (!data) return null
        return { lat: Number(data.lat), lng: Number(data.lng), accuracy: data.accuracy }
      } catch (e) {
        return null
      }
    },
    async set(key, lat, lng, accuracy) {
      try {
        await client
          .from('geocode_cache')
          .upsert({ query: key, lat, lng, accuracy }, { onConflict: 'query' })
      } catch (e) {
        // Silently drop. Caller doesn't depend on persistence.
      }
    },
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function isValidCoord(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -90 || lat > 90) return false
  if (lng < -180 || lng > 180) return false
  return true
}

function normalizeKey(s: string): string {
  // Lowercase, strip non-alphanum, collapse whitespace. Robust to
  // "U.S.A." / "USA" / "u s a" all folding the same way.
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function makeGeocodeKey(city: string, state: string | null, country: string | null): string {
  return [city, state || '', country || '']
    .map(s => s.toLowerCase().trim())
    .join('|')
}
