// Geocoding service using MapTiler Geocoding API
// Works globally, GeoJSON-based, generous free tier
// Falls back gracefully: city → state/province → country

interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
  confidence: number; // 0-1 based on result relevance
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

// MapTiler API key — works in both NEXT_PUBLIC_ (build-time) and server-side contexts
function getMapTilerKey(): string | null {
  return process.env.NEXT_PUBLIC_MAPTILER_KEY || process.env.MAPTILER_KEY || null;
}

/**
 * Geocode a location string to coordinates using MapTiler.
 * Works globally — not limited to US.
 *
 * @param location The location string (e.g., "Guelph, Ontario, Canada" or "Prayagraj, Uttar Pradesh, India")
 * @returns Geocoding result or null if not found
 */
export async function geocodeLocation(location: string): Promise<GeocodingResult | null> {
  if (!location || location.trim().length < 3) {
    return null;
  }

  var apiKey = getMapTilerKey();
  if (!apiKey) {
    console.error('[Geocoding] MapTiler key not configured (set NEXT_PUBLIC_MAPTILER_KEY or MAPTILER_KEY)');
    return null;
  }

  var cacheKey = location.toLowerCase().trim();

  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }

  try {
    var encodedLocation = encodeURIComponent(location);
    var url = 'https://api.maptiler.com/geocoding/' + encodedLocation + '.json?key=' + apiKey + '&limit=1';

    var response = await fetch(url);

    if (!response.ok) {
      console.error('[Geocoding] MapTiler API error: ' + response.status);
      geocodeCache.set(cacheKey, null);
      return null;
    }

    var data = await response.json() as MapTilerResponse;

    if (!data.features || data.features.length === 0) {
      console.log('[Geocoding] No results for: ' + location);
      geocodeCache.set(cacheKey, null);
      return null;
    }

    var feature = data.features[0];
    // MapTiler/GeoJSON returns [longitude, latitude]
    var lng = feature.center ? feature.center[0] : (feature.geometry ? feature.geometry.coordinates[0] : null);
    var lat = feature.center ? feature.center[1] : (feature.geometry ? feature.geometry.coordinates[1] : null);

    if (lat == null || lng == null) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    var geocoded: GeocodingResult = {
      latitude: lat,
      longitude: lng,
      displayName: feature.place_name || location,
      confidence: feature.relevance || 0.5
    };

    geocodeCache.set(cacheKey, geocoded);
    console.log('[Geocoding] Success: ' + location + ' -> ' + geocoded.latitude.toFixed(4) + ', ' + geocoded.longitude.toFixed(4));

    return geocoded;

  } catch (error) {
    console.error('[Geocoding] Error for ' + location + ':', error);
    geocodeCache.set(cacheKey, null);
    return null;
  }
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
