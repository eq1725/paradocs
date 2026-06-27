// Geocoding service — dual provider with automatic fallback
// Primary: MapTiler Geocoding API (if key has geocoding access)
// Fallback: Nominatim / OpenStreetMap (free, no key required)
// Falls back gracefully: city → state/province → country

// V11.17.83 — state-centroid fallback. When the caller asked for a
// state-level (or finer) match but the geocoder only returned a
// country-level result, we treat that as a miss for the requested
// precision and fall back to the static state-centroid table instead
// of writing the country centroid to the DB (which would visually
// place a New York report in Kansas — the exact bug that prompted
// this revision; see scripts/audit-state-coord-mismatch.ts).
import stateCentroids from '../ingestion/utils/state-centroids.json'
import countryCentroids from '../ingestion/utils/country-centroids.json'

// V11.17.6 — accuracy field exposes the geocoder's place_type so the
// caller can set location_precision honestly. Without this, callers
// were stamping precision='exact' on a state-centroid result. Values
// map to MapTiler/Nominatim place_type categories.
export type GeocodeAccuracy = 'address' | 'street' | 'locality' | 'region' | 'country';
interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
  confidence: number; // 0-1 based on result relevance
  accuracy: GeocodeAccuracy;
}

interface MapTilerFeature {
  center: [number, number]; // [longitude, latitude]
  place_name: string;
  relevance: number;
  place_type: string[];
  geometry?: { coordinates: [number, number] };
}

interface MapTilerResponse {
  features: MapTilerFeature[];
}

// In-memory cache to avoid repeated requests for identical locations
// At scale, the same city appears in many reports — cache prevents redundant API calls
var geocodeCache = new Map<string, GeocodingResult | null>();

// MapTiler API key — V11.17.20 env precedence (aligned with
// src/lib/ingestion/utils/normalize-location.ts):
//   1. MAPTILER_GEOCODING_KEY — server-side key with geocoding scope, no
//      Allowed-Origins restriction (preferred for backend calls).
//   2. MAPTILER_API_KEY — generic server-side key (fallback).
//   3. NEXT_PUBLIC_MAPTILER_KEY — browser map-tiles key. Often has
//      Origin/Referrer restrictions configured at MapTiler Cloud which
//      cause 403 on server-side calls (the exact failure mode that
//      caused the NUFORC Nominatim 429 cascade earlier in V11.17.x).
//   4. MAPTILER_KEY — legacy alias.
function getMapTilerKey(): string | null {
  return process.env.MAPTILER_GEOCODING_KEY
    || process.env.MAPTILER_API_KEY
    || process.env.NEXT_PUBLIC_MAPTILER_KEY
    || process.env.MAPTILER_KEY
    || null;
}

/**
 * Geocode using Nominatim (OpenStreetMap) — free, no API key required.
 * Rate limit: 1 request/second. User-Agent required by Nominatim policy.
 */
async function geocodeWithNominatim(location: string): Promise<GeocodingResult | null> {
  try {
    var encodedLocation = encodeURIComponent(location);
    var url = 'https://nominatim.openstreetmap.org/search?q=' + encodedLocation + '&format=json&limit=1&addressdetails=1';

    var response = await fetch(url, {
      headers: {
        'User-Agent': 'Paradocs/1.0 (www.discoverparadocs.com)'
      }
    });

    if (!response.ok) {
      console.error('[Geocoding] Nominatim API error: ' + response.status);
      return null;
    }

    // V11.17.6 — typed loose enough to read class/type/address for
    // accuracy mapping (Nominatim returns these alongside lat/lon).
    var data = await response.json() as Array<{
      lat: string;
      lon: string;
      display_name: string;
      importance: number;
      class?: string;
      type?: string;
      admin_level?: number | string;
      address?: { admin_level?: number | string; country?: string };
    }>;

    if (!data || data.length === 0) {
      return null;
    }

    var result = data[0];
    var lat = parseFloat(result.lat);
    var lng = parseFloat(result.lon);

    if (isNaN(lat) || isNaN(lng)) {
      return null;
    }

    // V11.17.6 — Nominatim returns class/type fields; map to accuracy.
    // type=city|town|village|hamlet|suburb → locality
    // type=administrative + class=boundary → region or country
    var nomClass: string = result.class || ''
    var nomType: string = result.type || ''
    var accuracy: GeocodeAccuracy = 'locality'
    if (nomClass === 'place' && (nomType === 'city' || nomType === 'town' || nomType === 'village' || nomType === 'hamlet' || nomType === 'suburb' || nomType === 'neighbourhood')) {
      accuracy = 'locality'
    } else if (nomClass === 'highway') {
      accuracy = 'street'
    } else if (nomClass === 'boundary' && nomType === 'administrative') {
      // admin_level distinguishes country vs region; 2=country, 4=state/province
      const lvl = Number(result.address?.admin_level || result.admin_level || 0)
      accuracy = lvl <= 2 ? 'country' : 'region'
    } else if (nomType === 'country' || result.address?.country === result.display_name) {
      accuracy = 'country'
    } else if (nomType === 'state' || nomType === 'province' || nomType === 'region') {
      accuracy = 'region'
    }

    return {
      latitude: lat,
      longitude: lng,
      displayName: result.display_name || location,
      confidence: Math.min(result.importance || 0.5, 1.0),
      accuracy: accuracy,
    };
  } catch (error) {
    console.error('[Geocoding] Nominatim error for ' + location + ':', error);
    return null;
  }
}

/**
 * Geocode using MapTiler Geocoding API (requires geocoding-enabled key).
 */
async function geocodeWithMapTiler(location: string, apiKey: string): Promise<GeocodingResult | null> {
  try {
    var encodedLocation = encodeURIComponent(location);
    var url = 'https://api.maptiler.com/geocoding/' + encodedLocation + '.json?key=' + apiKey + '&limit=1';

    var response = await fetch(url);

    if (!response.ok) {
      // 403 means the key doesn't have geocoding access — not a transient error
      if (response.status === 403) {
        console.warn('[Geocoding] MapTiler key lacks geocoding permission (403). Falling back to Nominatim.');
      } else {
        console.error('[Geocoding] MapTiler API error: ' + response.status);
      }
      return null;
    }

    var data = await response.json() as MapTilerResponse;

    if (!data.features || data.features.length === 0) {
      return null;
    }

    var feature = data.features[0];
    var lng = feature.center ? feature.center[0] : (feature.geometry ? feature.geometry.coordinates[0] : null);
    var lat = feature.center ? feature.center[1] : (feature.geometry ? feature.geometry.coordinates[1] : null);

    if (lat == null || lng == null) {
      return null;
    }

    // V11.17.6 — map MapTiler's place_type to our GeocodeAccuracy.
    // 'address' / 'street' / 'locality' (city-accurate)
    // 'region' (state/province centroid)
    // 'country' (country centroid)
    var pt: string[] = feature.place_type || [];
    var accuracy: GeocodeAccuracy = 'locality';
    if (pt.includes('address') || pt.includes('poi')) accuracy = 'address';
    else if (pt.includes('street')) accuracy = 'street';
    else if (pt.includes('municipality') || pt.includes('locality') || pt.includes('city')) accuracy = 'locality';
    else if (pt.includes('region')) accuracy = 'region';
    else if (pt.includes('country')) accuracy = 'country';

    return {
      latitude: lat,
      longitude: lng,
      displayName: feature.place_name || location,
      confidence: feature.relevance || 0.5,
      accuracy: accuracy,
    };
  } catch (error) {
    console.error('[Geocoding] MapTiler error for ' + location + ':', error);
    return null;
  }
}

// Track whether MapTiler geocoding has failed with 403 — skip it for the rest of the session
var mapTilerDisabled = false;

/**
 * Geocode a location string to coordinates.
 * Tries MapTiler first (if key configured and not disabled), falls back to Nominatim.
 * Works globally — not limited to US.
 *
 * @param location The location string (e.g., "Guelph, Ontario, Canada" or "Prayagraj, Uttar Pradesh, India")
 * @returns Geocoding result or null if not found
 */
export async function geocodeLocation(location: string): Promise<GeocodingResult | null> {
  if (!location || location.trim().length < 3) {
    return null;
  }

  var cacheKey = location.toLowerCase().trim();

  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }

  var geocoded: GeocodingResult | null = null;

  // Try MapTiler first (if key available and not disabled by previous 403)
  var apiKey = getMapTilerKey();
  if (apiKey && !mapTilerDisabled) {
    geocoded = await geocodeWithMapTiler(location, apiKey);
    if (!geocoded) {
      // If MapTiler failed, check if it was a 403 and disable for future calls
      // (the 403 log message is printed inside geocodeWithMapTiler)
      mapTilerDisabled = true;
    }
  }

  // Fallback to Nominatim if MapTiler unavailable or failed
  if (!geocoded) {
    geocoded = await geocodeWithNominatim(location);
    if (geocoded) {
      console.log('[Geocoding] Nominatim success: ' + location + ' -> ' + geocoded.latitude.toFixed(4) + ', ' + geocoded.longitude.toFixed(4));
    }
  }

  if (geocoded) {
    geocodeCache.set(cacheKey, geocoded);
    console.log('[Geocoding] Success: ' + location + ' -> ' + geocoded.latitude.toFixed(4) + ', ' + geocoded.longitude.toFixed(4));
  } else {
    console.log('[Geocoding] No results for: ' + location);
    geocodeCache.set(cacheKey, null);
  }

  return geocoded;
}

/**
 * Build a location query string from components.
 * Constructs the most specific query possible for global geocoding:
 *   "City, State/Province, Country" → most precise
 *   "State/Province, Country" → fallback
 *   "Country" → last resort
 */
export function buildLocationQuery(components: {
  city?: string;
  state?: string;
  country?: string;
  location_name?: string;
}): string {
  var parts: string[] = [];

  if (components.location_name) {
    // Use location_name directly if it looks complete (has comma or multiple words)
    if (components.location_name.indexOf(',') !== -1 || components.location_name.split(' ').length >= 3) {
      return components.location_name;
    }
  }

  if (components.city) parts.push(components.city);
  if (components.state) parts.push(components.state);
  if (components.country) parts.push(components.country);

  if (parts.length === 0 && components.location_name) {
    return components.location_name;
  }

  return parts.join(', ');
}

// V11.17.99 — prepositional-prefix geocode handler
// =============================================================================
// NUFORC submitters often write the "city" field as a prepositional phrase
// describing where they were when they saw something — "Over Toledo bend lake",
// "Near Cortez", "South of Portland Oregon", "Between Ennis and Norris". The
// raw geocoder can't parse these; MapTiler either returns a far-away fuzzy
// match (the founder's flagged Toledo Bend Lake report pinned at Beaumont) or
// the wrong half of a "Between A and B" pair.
//
// This regex pulls off the leading preposition and returns the cleaned phrase
// + a flag telling the caller "this was approximate to begin with — if the
// cleaned phrase still doesn't geocode precisely, prefer the state centroid
// over inventing coordinates".
//
// Match list is anchored at start, case-insensitive, and consumes one trailing
// space so the cleaned phrase starts at the actual landmark.
//   Over X        Above X       Near X         Outside X
//   Just outside X   Just north/south/east/west of X
//   South/North/East/West of X
//   Between X (and Y)  — we keep the first place after "Between"
var PREPOSITIONAL_PREFIX_RE = /^\s*(over|above|near|outside|just\s+outside|just\s+(?:north|south|east|west)\s+of|south\s+of|north\s+of|east\s+of|west\s+of|between)\s+/i;

export interface PrepositionalStripResult {
  /** True when a prefix was detected and stripped. */
  stripped: boolean;
  /** The original location string. */
  original: string;
  /** The cleaned string with the prefix removed. Empty when no prefix matched. */
  cleaned: string;
  /** The preposition that was stripped (lowercased), e.g. "over", "between". */
  preposition: string | null;
}

/**
 * Detect and strip a leading prepositional phrase from a location string.
 *
 * Pure function — no I/O. Used by geocodeStructuredLocation before calling
 * the live geocoder, and by scripts/backfill-prepositional-locations.ts.
 *
 * Examples:
 *   "Over Toledo bend lake, Texas"     -> "Toledo bend lake, Texas"
 *   "Near Cortez, Colorado"            -> "Cortez, Colorado"
 *   "Between Ennis and Norris, MT"     -> "Ennis and Norris, MT"
 *   "Just outside Erie, Colorado"      -> "Erie, Colorado"
 *   "Cortez, Colorado"                 -> stripped=false
 */
export function stripPrepositionalPrefix(location: string): PrepositionalStripResult {
  if (!location || typeof location !== 'string') {
    return { stripped: false, original: location || '', cleaned: '', preposition: null };
  }
  var m = location.match(PREPOSITIONAL_PREFIX_RE);
  if (!m) {
    return { stripped: false, original: location, cleaned: location, preposition: null };
  }
  // Replace the matched prefix with an empty string; preserve the rest verbatim.
  var cleaned = location.replace(PREPOSITIONAL_PREFIX_RE, '').trim();
  // Collapse internal whitespace from the original match (e.g. "just  outside").
  var preposition = m[1].toLowerCase().replace(/\s+/g, ' ');
  return {
    stripped: true,
    original: location,
    cleaned: cleaned,
    preposition: preposition,
  };
}

/**
 * Geocode multiple reports in batch (respecting rate limits).
 * Uses in-memory cache so duplicate locations (same city) only hit the API once.
 *
 * @param reports Array of reports with location info
 * @param rateLimitMs Delay between API calls (default 100ms — MapTiler allows ~10 req/s)
 * @returns Map of report IDs to geocoding results
 */
export async function batchGeocode(
  reports: Array<{
    id: string;
    city?: string;
    state_province?: string;
    country?: string;
    location_name?: string;
  }>,
  rateLimitMs?: number
): Promise<Map<string, GeocodingResult>> {
  var results = new Map<string, GeocodingResult>();
  var delay = rateLimitMs || 100;

  for (var i = 0; i < reports.length; i++) {
    var report = reports[i];
    var locationQuery = buildLocationQuery({
      city: report.city,
      state: report.state_province,
      country: report.country,
      location_name: report.location_name
    });

    if (!locationQuery) continue;

    var result = await geocodeLocation(locationQuery);
    if (result) {
      results.set(report.id, result);
    }

    // Rate limit only for cache misses (actual API calls)
    // The cache prevents redundant calls for same location
    if (i < reports.length - 1) {
      await new Promise(function(resolve) { setTimeout(resolve, delay); });
    }
  }

  return results;
}

/**
 * Clear the geocode cache (useful between batches to free memory)
 */
export function clearGeocodeCache(): void {
  geocodeCache.clear();
}

// ============================================================================
// V11.17.83 — state-centroid fallback
// ============================================================================

// Build the country-name → ISO2 and state-name → state-key lookup tables
// once at module load (same approach as normalize-location.ts). These let
// us resolve "New York" / "NY" / "Estado de Nueva York" → centroid coords
// without an external call. Lookups are case + punctuation insensitive.
interface CountryEntry { name: string; lat: number; lng: number; aliases?: string[] }
interface StateEntry { name: string; lat: number; lng: number; aliases?: string[] }

function normalizeKey(s: string): string {
  // Mirrors normalize-location.ts — lowercase, strip non-alphanum.
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

var COUNTRY_BY_KEY: Record<string, string> = {}
var COUNTRY_BY_CODE: Record<string, CountryEntry> = {}
var STATE_BY_KEY: Record<string, Record<string, string>> = {}
var STATE_BY_CODE: Record<string, Record<string, StateEntry>> = {}

;(function buildCentroidIndex() {
  for (var code of Object.keys(countryCentroids as Record<string, unknown>)) {
    if (code.startsWith('$')) continue
    var entry = (countryCentroids as Record<string, unknown>)[code] as CountryEntry
    if (!entry || typeof entry !== 'object') continue
    COUNTRY_BY_CODE[code] = entry
    COUNTRY_BY_KEY[code.toLowerCase()] = code
    COUNTRY_BY_KEY[normalizeKey(entry.name)] = code
    for (var alias of entry.aliases || []) {
      COUNTRY_BY_KEY[normalizeKey(alias)] = code
    }
  }
  for (var countryCode of Object.keys(stateCentroids as Record<string, unknown>)) {
    if (countryCode.startsWith('$')) continue
    var sub = (stateCentroids as Record<string, unknown>)[countryCode] as Record<string, StateEntry>
    STATE_BY_CODE[countryCode] = sub
    STATE_BY_KEY[countryCode] = {}
    for (var stateKey of Object.keys(sub)) {
      var stateEntry = sub[stateKey]
      STATE_BY_KEY[countryCode][stateKey.toLowerCase()] = stateKey
      STATE_BY_KEY[countryCode][normalizeKey(stateEntry.name)] = stateKey
      for (var sAlias of stateEntry.aliases || []) {
        STATE_BY_KEY[countryCode][normalizeKey(sAlias)] = stateKey
      }
    }
  }
})()

function resolveCountryCode(country: string | null | undefined): string | null {
  if (!country) return null
  var key = normalizeKey(String(country))
  return COUNTRY_BY_KEY[key] || null
}

function resolveStateCentroid(countryCode: string | null, state: string | null | undefined): { lat: number; lng: number; name: string } | null {
  if (!countryCode || !state) return null
  var map = STATE_BY_KEY[countryCode]
  if (!map) return null
  var key = map[normalizeKey(String(state))]
  if (!key) return null
  var entry = STATE_BY_CODE[countryCode]?.[key]
  if (!entry) return null
  return { lat: entry.lat, lng: entry.lng, name: entry.name }
}

/**
 * V11.17.83 — Structured geocode with centroid fallback.
 *
 * The plain `geocodeLocation(string)` happily accepts a country-level
 * result for a query like "New York, United States" — MapTiler/Nominatim
 * sometimes match only the country portion and return its centroid
 * (39.78, -100.45 for "United States"). That coordinate then gets
 * written to the DB and surfaces as a pin in central Kansas for a New
 * York report (the founder's `odd-critter-in-the-road-last-night-ge7ofq`
 * bug).
 *
 * This wrapper takes structured fields, calls the geocoder, then:
 *   - keeps the geocode result if it's locality/region precision or
 *     finer (the requested level was actually resolved);
 *   - if a state was supplied but the geocoder degraded to 'country',
 *     drops the geocode result and uses the static state centroid
 *     instead, with synthetic=true flag for downstream coords_synthetic;
 *   - if no state but country known, leaves coords null (country-only
 *     reports surface via aggregate rails, not as map pins — same
 *     policy as report-enricher.geocodeReport's early bail).
 *
 * Returns null when no usable coordinates can be produced. Callers
 * should treat that as "leave coords null" — never invent.
 */
export interface StructuredGeocodeInput {
  city?: string | null
  state?: string | null
  country?: string | null
  location_name?: string | null
}

export interface StructuredGeocodeResult {
  latitude: number
  longitude: number
  accuracy: GeocodeAccuracy
  /** True when coords came from the centroid table (not the live geocoder). */
  synthetic: boolean
  source: string
}

export async function geocodeStructuredLocation(
  input: StructuredGeocodeInput,
): Promise<StructuredGeocodeResult | null> {
  var hasCity = !!(input.city && String(input.city).trim())
  var hasState = !!(input.state && String(input.state).trim())
  var hasCountry = !!(input.country && String(input.country).trim())

  // Country-only — never synthesize, mirrors geocodeReport policy.
  if (!hasCity && !hasState) return null

  var countryCode = resolveCountryCode(input.country)
  var stateCentroid = resolveStateCentroid(countryCode, input.state || null)

  // V11.17.99 — prepositional-prefix geocode handler.
  //
  // Submitters write "Over Toledo bend lake" or "Near Cortez" or
  // "South of Portland Oregon" in the city slot. MapTiler/Nominatim
  // can't parse "Over X" — it either returns a fuzzy match for a
  // similarly-named feature far from the user's intent (the founder's
  // flagged Toledo Bend report pinned at Beaumont, 150mi south of the
  // actual lake), or it returns the wrong half of a "Between A and B"
  // pair. Strategy:
  //   1. Detect a leading preposition in city/location_name.
  //   2. Strip it before building the query (so we geocode the actual
  //      landmark, not the prepositional phrase).
  //   3. After geocoding, distrust the result if it's not a 'locality'
  //      or finer match — fall back to state centroid instead of
  //      writing potentially wrong specific coords. The user said
  //      "near/over/south of" so a region-level pin is honest.
  var cityStrip = stripPrepositionalPrefix(input.city || '')
  var locNameStrip = stripPrepositionalPrefix(input.location_name || '')
  var hadPrefix = cityStrip.stripped || locNameStrip.stripped
  var cleanedCity = cityStrip.stripped ? cityStrip.cleaned : (input.city || undefined)
  var cleanedLocName = locNameStrip.stripped ? locNameStrip.cleaned : (input.location_name || undefined)

  var query = buildLocationQuery({
    city: cleanedCity || undefined,
    state: input.state || undefined,
    country: input.country || undefined,
    location_name: cleanedLocName || undefined,
  })

  if (!query || query.length < 3) {
    // No usable query — fall through to centroid if we have one.
    if (stateCentroid) {
      return {
        latitude: stateCentroid.lat,
        longitude: stateCentroid.lng,
        accuracy: 'region',
        synthetic: true,
        source: 'state-centroid:' + stateCentroid.name,
      }
    }
    return null
  }

  var geocoded = await geocodeLocation(query)

  // Treat country-level results as a miss when we asked for finer
  // precision — fall through to state centroid instead.
  if (geocoded) {
    var acc = geocoded.accuracy
    var degraded = acc === 'country' && (hasCity || hasState)

    // V11.17.99 — when a preposition was stripped, distrust 'address'
    // and 'street' precision. The user wasn't AT 123 Main St; they
    // were "over the lake" or "near the town". An overly-precise
    // geocoder hit on a coincidentally-named street is exactly the
    // failure mode that produced the Toledo Bend pin near Beaumont
    // (MapTiler matched "Toledo Bend Drive, Denton, TX" at locality
    // precision for the cleaned phrase; the prefix version had matched
    // a "major_landform" type at a wrong centroid). Locality/region
    // precision is the honest level for a prepositional location —
    // anything finer is fabricated specificity.
    var overspecified = hadPrefix && (acc === 'address' || acc === 'street')

    if (!degraded && !overspecified) {
      return {
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
        accuracy: acc,
        synthetic: false,
        source: hadPrefix ? (query + ' (prefix stripped)') : query,
      }
    }
    if (degraded) {
      console.log(
        '[Geocoding] V11.17.83 — geocoder returned country precision for "' + query +
        '"; falling back to state centroid (' + (stateCentroid?.name || '(none)') + ')',
      )
    } else if (overspecified) {
      console.log(
        '[Geocoding] V11.17.99 — prepositional query "' + query +
        '" got over-specific (' + acc + ') hit; falling back to state centroid (' +
        (stateCentroid?.name || '(none)') + ')',
      )
    }
  }

  if (stateCentroid) {
    return {
      latitude: stateCentroid.lat,
      longitude: stateCentroid.lng,
      accuracy: 'region',
      synthetic: true,
      source: 'state-centroid:' + stateCentroid.name,
    }
  }

  // No state centroid (e.g. unknown country or state alias not in our
  // table). Return null rather than the bad country-centroid coords.
  return null
}
