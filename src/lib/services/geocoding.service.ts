// Geocoding service using OpenStreetMap Nominatim (free, no API key required)
// Rate limited to 1 request per second per Nominatim usage policy

interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
  confidence: number; // 0-1 based on result importance
}

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
  importance: number;
  type: string;
  class: string;
}

// In-memory cache to avoid repeated requests
const geocodeCache = new Map<string, GeocodingResult | null>();

// Rate limiting - max 1 request per second
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds to be safe

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;

  if (elapsed < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed));
  }

  lastRequestTime = Date.now();

  return fetch(url, {
    headers: {
      'User-Agent': 'ParaDocs/1.0 (educational research; contact@example.com)',
      'Accept': 'application/json'
    }
  });
}

/**
 * Geocode a location string to coordinates
 * @param location The location string (e.g., "San Francisco, California, USA")
 * @returns Geocoding result or null if not found
 */
export async function geocodeLocation(location: string): Promise<GeocodingResult | null> {
  if (!location || location.trim().length < 3) {
    return null;
  }

  const cacheKey = location.toLowerCase().trim();

  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }

  try {
    const encodedLocation = encodeURIComponent(location);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedLocation}&format=json&limit=1&addressdetails=0`;

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      console.error(`[Geocoding] API error: ${response.status}`);
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const data: NominatimResponse[] = await response.json();

    if (!data || data.length === 0) {
      console.log(`[Geocoding] No results for: ${location}`);
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const result = data[0];
    const geocoded: GeocodingResult = {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      displayName: result.display_name,
      confidence: Math.min(result.importance || 0.5, 1)
    };

    geocodeCache.set(cacheKey, geocoded);
    console.log(`[Geocoding] Success: ${location} -> ${geocoded.latitude}, ${geocoded.longitude}`);

    return geocoded;

  } catch (error) {
    console.error(`[Geocoding] Error for ${location}:`, error);
    geocodeCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Build a location query string from components
 */
export function buildLocationQuery(components: {
  city?: string;
  state?: string;
  country?: string;
  location_name?: string;
}): string {
  const parts: string[] = [];

  if (components.location_name) {
    // Use location_name directly if it looks complete (has comma or multiple words)
    if (components.location_name.includes(',') || components.location_name.split(' ').length >= 3) {
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
 * Geocode multiple reports in batch (respecting rate limits)
 * @param reports Array of reports with location info
 * @returns Map of report IDs to geocoding results
 */
export async function batchGeocode(
  reports: Array<{
    id: string;
    city?: string;
    state_province?: string;
    country?: string;
    location_name?: string;
  }>
): Promise<Map<string, GeocodingResult>> {
  const results = new Map<string, GeocodingResult>();

  for (const report of reports) {
    const locationQuery = buildLocationQuery({
      city: report.city,
      state: report.state_province,
      country: report.country,
      location_name: report.location_name
    });

    if (!locationQuery) continue;

    const result = await geocodeLocation(locationQuery);
    if (result) {
      results.set(report.id, result);
    }
  }

  return results;
}

/**
 * Clear the geocode cache
 */
export function clearGeocodeCache(): void {
  geocodeCache.clear();
}
