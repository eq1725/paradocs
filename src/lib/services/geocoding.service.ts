// Geocoding service — dual provider with automatic fallback
// Primary: MapTiler Geocoding API (if key has geocoding access)
// Fallback: Nominatim / OpenStreetMap (free, no key required)
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
 * Geocode using Nominatim (OpenStreetMap) — free, no API key required.
 * Rate limit: 1 request/second. User-Agent required by Nominatim policy.
 */
async function geocodeWithNominatim(location: string): Promise<GeocodingResult | null> {
  try {
    var encodedLocation = encodeURIComponent(location);
    var url = 'https://nominatim.openstreetmap.org/search?q=' + encodedLocation + '&format=json&limit=1&addressdetails=1';

    var response = await fetch(url, {
      headers: {
        'User-Agent': 'Paradocs/1.0 (beta.discoverparadocs.com)'
      }
    });

    if (!response.ok) {
      console.error('[Geocoding] Nominatim API error: ' + response.status);
      return null;
    }

    var data = await response.json() as Array<{
      lat: string;
      lon: string;
      display_name: string;
      importance: number;
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

    return {
      latitude: lat,
      longitude: lng,
      displayName: result.display_name || location,
      confidence: Math.min(result.importance || 0.5, 1.0)
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

    return {
      latitude: lat,
      longitude: lng,
      displayName: feature.place_name || location,
      confidence: feature.relevance || 0.5
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
