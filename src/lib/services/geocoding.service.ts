// Geocoding service using Mapbox Geocoding API
// Fast, accurate, and allows up to 100k requests/month free

interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
  confidence: number; // 0-1 based on result relevance
}

interface MapboxFeature {
  center: [number, number]; // [longitude, latitude]
  place_name: string;
  relevance: number;
  place_type: string[];
}

interface MapboxResponse {
  features: MapboxFeature[];
}

// In-memory cache to avoid repeated requests
const geocodeCache = new Map<string, GeocodingResult | null>();

// Mapbox API key from environment
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/**
 * Geocode a location string to coordinates using Mapbox
 * @param location The location string (e.g., "San Francisco, California, USA")
 * @returns Geocoding result or null if not found
 */
export async function geocodeLocation(location: string): Promise<GeocodingResult | null> {
  if (!location || location.trim().length < 3) {
    return null;
  }

  if (!MAPBOX_TOKEN) {
    console.error('[Geocoding] Mapbox token not configured');
    return null;
  }

  const cacheKey = location.toLowerCase().trim();

  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }

  try {
    const encodedLocation = encodeURIComponent(location);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedLocation}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=place,locality,neighborhood,address,poi`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Geocoding] Mapbox API error: ${response.status}`);
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const data: MapboxResponse = await response.json();

    if (!data.features || data.features.length === 0) {
      console.log(`[Geocoding] No results for: ${location}`);
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const feature = data.features[0];
    const geocoded: GeocodingResult = {
      latitude: feature.center[1],  // Mapbox returns [lng, lat]
      longitude: feature.center[0],
      displayName: feature.place_name,
      confidence: feature.relevance || 0.5
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
