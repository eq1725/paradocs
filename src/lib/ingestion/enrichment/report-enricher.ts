// Report Enrichment Pipeline
// Runs AFTER adapter scrape, BEFORE quality scoring
// Extracts and fills in missing structured data from description text
//
// CRITICAL RULE: We NEVER fabricate data. Every enriched field must be
// directly extracted from or clearly stated in the source text.
// If we can't find it, we leave it null. Period.

import { ScrapedReport } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface EnrichmentResult {
  report: ScrapedReport;
  enrichments: EnrichmentLog;
}

export interface EnrichmentLog {
  dateExtracted: boolean;
  dateSource: string | null;         // What text the date was extracted from
  locationExtracted: boolean;
  locationSource: string | null;     // What text the location was extracted from
  geocoded: boolean;
  geocodeSource: string | null;      // What location string was geocoded
  precisionCorrected: boolean;
  fieldsEnriched: string[];          // List of fields that were filled in
}

function emptyLog(): EnrichmentLog {
  return {
    dateExtracted: false,
    dateSource: null,
    locationExtracted: false,
    locationSource: null,
    geocoded: false,
    geocodeSource: null,
    precisionCorrected: false,
    fieldsEnriched: []
  };
}

// ============================================================================
// DATE EXTRACTION
// Extracts event dates from description text when adapter didn't provide one
// Only extracts clearly stated dates — never guesses
// ============================================================================

// Patterns that indicate when something happened (not when it was reported)
var DATE_PATTERNS: Array<{ pattern: RegExp; precision: 'exact' | 'month' | 'year' | 'estimated'; extract: (match: RegExpMatchArray) => string | null }> = [
  // "on January 15, 2019" / "on March 3rd, 2020"
  {
    pattern: /\b(?:on|around|about)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/i,
    precision: 'exact',
    extract: function(m) { return formatDate(m[3], monthToNum(m[1]), m[2]); }
  },
  // "January 15, 2019" at start of sentence or after punctuation
  {
    pattern: /(?:^|[.!?]\s+)(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/i,
    precision: 'exact',
    extract: function(m) { return formatDate(m[3], monthToNum(m[1]), m[2]); }
  },
  // "12/25/2019" or "12-25-2019"
  {
    pattern: /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/,
    precision: 'exact',
    extract: function(m) {
      var month = parseInt(m[1]);
      var day = parseInt(m[2]);
      var year = parseInt(m[3]);
      if (month > 12) { var tmp = month; month = day; day = tmp; } // Handle DD/MM/YYYY
      if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2030) return null;
      return formatDate(String(year), String(month), String(day));
    }
  },
  // "2019-01-25"
  {
    pattern: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    precision: 'exact',
    extract: function(m) {
      var year = parseInt(m[1]);
      var month = parseInt(m[2]);
      var day = parseInt(m[3]);
      if (year < 1900 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) return null;
      return m[0];
    }
  },
  // "in January 2019" / "during March 2020"
  {
    pattern: /\b(?:in|during|around)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:of\s+)?(\d{4})\b/i,
    precision: 'month',
    extract: function(m) { return formatDate(m[2], monthToNum(m[1])); }
  },
  // "back in 2019" / "in the summer of 2015" / "around 2003"
  {
    pattern: /\b(?:back in|in|around|circa|during)\s+(?:the\s+)?(?:summer|winter|spring|fall|autumn|early|late|mid)?\s*(?:of\s+)?(\d{4})\b/i,
    precision: 'year',
    extract: function(m) {
      var year = parseInt(m[1]);
      if (year < 1900 || year > 2030) return null;
      return year + '-01-01';
    }
  },
  // "this happened in 2019" / "I was 15 in 2004"
  {
    pattern: /\b(?:happened|occurred|was|took place)\s+(?:in|around|about)\s+(\d{4})\b/i,
    precision: 'year',
    extract: function(m) {
      var year = parseInt(m[1]);
      if (year < 1900 || year > 2030) return null;
      return year + '-01-01';
    }
  },
  // "when I was X years old" — NOT extractable without birth year, skip
  // "a few years ago" / "last summer" — too vague, skip
];

var MONTH_MAP: Record<string, string> = {
  'january': '01', 'february': '02', 'march': '03', 'april': '04',
  'may': '05', 'june': '06', 'july': '07', 'august': '08',
  'september': '09', 'october': '10', 'november': '11', 'december': '12'
};

function monthToNum(month: string): string {
  return MONTH_MAP[month.toLowerCase()] || '01';
}

function formatDate(year: string, month: string, day?: string): string {
  var y = String(year).padStart(4, '0');
  var m = String(parseInt(month)).padStart(2, '0');
  if (day) {
    var d = String(parseInt(day)).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return y + '-' + m + '-01';
}

/**
 * Extract event date from description text.
 * Only extracts clearly stated dates. Never guesses or infers.
 * Returns null if no clear date found.
 */
export function extractDateFromText(text: string): { date: string; precision: 'exact' | 'month' | 'year' | 'estimated'; source: string } | null {
  if (!text || text.length < 20) return null;

  for (var i = 0; i < DATE_PATTERNS.length; i++) {
    var pattern = DATE_PATTERNS[i];
    var match = text.match(pattern.pattern);
    if (match) {
      var date = pattern.extract(match);
      if (date) {
        return {
          date: date,
          precision: pattern.precision,
          source: match[0].trim()
        };
      }
    }
  }

  return null;
}

// ============================================================================
// LOCATION EXTRACTION
// Extracts location from description text when adapter didn't provide one
// Only extracts clearly stated locations — never guesses
// ============================================================================

// US state names and abbreviations
var US_STATES: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC'
};

var STATE_ABBREVS = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
  'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);

// Patterns that indicate location in text
var LOCATION_PATTERNS: Array<{ pattern: RegExp; extract: (match: RegExpMatchArray) => { city?: string; state?: string; location_name?: string } | null }> = [
  // "in [City], [State]" — e.g., "in Portland, Oregon"
  {
    pattern: /\b(?:in|near|outside|from|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming)\b/i,
    extract: function(m) {
      return { city: m[1].trim(), state: m[2].trim(), location_name: m[1].trim() + ', ' + m[2].trim() };
    }
  },
  // "in [City], [ST]" — e.g., "in Portland, OR"
  {
    pattern: /\b(?:in|near|outside|from|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/,
    extract: function(m) {
      if (!STATE_ABBREVS.has(m[2])) return null;
      return { city: m[1].trim(), state: m[2].trim(), location_name: m[1].trim() + ', ' + m[2].trim() };
    }
  },
  // "rural [State]" / "northern [State]" / "[State] countryside"
  {
    pattern: /\b(?:rural|northern|southern|eastern|western|central)\s+(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming)\b/i,
    extract: function(m) {
      return { state: m[1].trim(), location_name: m[0].trim() };
    }
  },
  // Standalone state: "I was living in Ohio at the time"
  {
    pattern: /\b(?:in|from|moved to|living in|visiting)\s+(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming)\b(?:\s+(?:at the time|then|when|back then))/i,
    extract: function(m) {
      return { state: m[1].trim() };
    }
  }
];

/**
 * Extract location from description text.
 * Only extracts clearly stated locations. Never guesses.
 * Returns null if no clear location found.
 */
export function extractLocationFromText(text: string): { city?: string; state?: string; location_name?: string; source: string } | null {
  if (!text || text.length < 20) return null;

  for (var i = 0; i < LOCATION_PATTERNS.length; i++) {
    var pattern = LOCATION_PATTERNS[i];
    var match = text.match(pattern.pattern);
    if (match) {
      var result = pattern.extract(match);
      if (result) {
        return {
          city: result.city,
          state: result.state,
          location_name: result.location_name,
          source: match[0].trim()
        };
      }
    }
  }

  return null;
}

// ============================================================================
// DATE PRECISION VALIDATION
// Ensures event_date_precision matches the actual date value
// ============================================================================

/**
 * Validate and correct event_date_precision based on actual date value.
 * Never upgrades precision — only downgrades if the adapter overclaimed.
 */
export function validateDatePrecision(
  eventDate: string | undefined,
  claimedPrecision: string | undefined
): 'exact' | 'month' | 'year' | 'decade' | 'estimated' | 'unknown' {
  if (!eventDate) return 'unknown';

  // Check what precision the date string actually supports
  var actualPrecision: 'exact' | 'month' | 'year' = 'year';
  if (/^\d{4}-\d{2}-\d{2}/.test(eventDate)) {
    // Has day — but is it a real day or just -01 placeholder?
    var day = parseInt(eventDate.substring(8, 10));
    var month = parseInt(eventDate.substring(5, 7));
    if (day === 1 && month === 1) {
      // Likely a year-only date padded to YYYY-01-01
      actualPrecision = 'year';
    } else if (day === 1) {
      // Likely a month-only date padded to YYYY-MM-01
      actualPrecision = 'month';
    } else {
      actualPrecision = 'exact';
    }
  } else if (/^\d{4}-\d{2}/.test(eventDate)) {
    actualPrecision = 'month';
  }

  // If claimed precision is more specific than actual, downgrade
  var precisionRank: Record<string, number> = { 'exact': 5, 'month': 4, 'year': 3, 'decade': 2, 'estimated': 1, 'unknown': 0 };
  var claimed = claimedPrecision || 'unknown';
  var claimedRank = precisionRank[claimed] || 0;
  var actualRank = precisionRank[actualPrecision] || 0;

  // Never upgrade precision, only validate or downgrade
  if (claimedRank > actualRank) {
    return actualPrecision;
  }

  // If claimed is valid and not overclaiming, keep it
  if (claimed === 'exact' || claimed === 'month' || claimed === 'year' ||
      claimed === 'decade' || claimed === 'estimated' || claimed === 'unknown') {
    return claimed as any;
  }

  return 'unknown';
}

// ============================================================================
// GEOCODING (uses existing geocoding service)
// ============================================================================

/**
 * Geocode a report's location using the existing geocoding service.
 * Only geocodes if we have location data but no coordinates.
 * Returns coordinates or null. Never fabricates coordinates.
 */
export async function geocodeReport(report: ScrapedReport): Promise<{ latitude: number; longitude: number; source: string } | null> {
  // Skip if already has coordinates
  if (report.latitude != null && report.longitude != null &&
      report.latitude !== 0 && report.longitude !== 0) {
    return null;
  }

  // Need some location data to geocode
  var locationParts: string[] = [];
  if (report.city) locationParts.push(report.city);
  if (report.state_province) locationParts.push(report.state_province);
  if (report.country) locationParts.push(report.country);

  var locationQuery = locationParts.length > 0
    ? locationParts.join(', ')
    : report.location_name || '';

  if (!locationQuery || locationQuery.length < 3) return null;

  // Use MapTiler geocoding API (we have a MapTiler key, not Mapbox)
  var maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!maptilerKey) {
    console.log('[Enrichment] No MapTiler key — skipping geocoding');
    return null;
  }

  try {
    var encodedLocation = encodeURIComponent(locationQuery);
    var url = 'https://api.maptiler.com/geocoding/' + encodedLocation + '.json?key=' + maptilerKey + '&limit=1';

    var response = await fetch(url);
    if (!response.ok) {
      console.log('[Enrichment] MapTiler geocode failed: HTTP ' + response.status);
      return null;
    }

    var data = await response.json() as any;
    if (!data.features || data.features.length === 0) {
      return null;
    }

    var feature = data.features[0];
    // MapTiler/GeoJSON returns [longitude, latitude]
    var lng = feature.center ? feature.center[0] : (feature.geometry?.coordinates?.[0]);
    var lat = feature.center ? feature.center[1] : (feature.geometry?.coordinates?.[1]);

    if (lat == null || lng == null) return null;

    return {
      latitude: lat,
      longitude: lng,
      source: locationQuery
    };
  } catch (e) {
    console.log('[Enrichment] Geocode error: ' + (e instanceof Error ? e.message : String(e)));
    return null;
  }
}

// ============================================================================
// MAIN ENRICHMENT FUNCTION
// ============================================================================

/**
 * Enrich a scraped report by extracting missing structured data from text.
 *
 * RULES:
 * - We NEVER fabricate data
 * - We only fill fields that are currently empty/null
 * - Every extraction must come from clearly stated text
 * - We log exactly what was extracted and from where
 * - If we can't find it, we leave it null
 *
 * Runs AFTER adapter, BEFORE quality scoring, so enriched data
 * improves the quality score and the report's usefulness.
 */
export async function enrichReport(report: ScrapedReport, options?: { skipGeocode?: boolean }): Promise<EnrichmentResult> {
  var log = emptyLog();
  var text = (report.description || '') + ' ' + (report.summary || '');

  // --- 1. DATE EXTRACTION ---
  // Only if adapter didn't provide an event_date
  if (!report.event_date) {
    var dateResult = extractDateFromText(text);
    if (dateResult) {
      report.event_date = dateResult.date;
      report.event_date_precision = dateResult.precision;
      log.dateExtracted = true;
      log.dateSource = dateResult.source;
      log.fieldsEnriched.push('event_date', 'event_date_precision');
      console.log('[Enrichment] Extracted date: ' + dateResult.date + ' (' + dateResult.precision + ') from: "' + dateResult.source + '"');
    }
  }

  // --- 2. DATE PRECISION VALIDATION ---
  // Always validate — even if adapter set it
  if (report.event_date) {
    var validatedPrecision = validateDatePrecision(report.event_date, report.event_date_precision);
    if (validatedPrecision !== report.event_date_precision) {
      console.log('[Enrichment] Corrected precision: ' + report.event_date_precision + ' -> ' + validatedPrecision);
      report.event_date_precision = validatedPrecision;
      log.precisionCorrected = true;
      if (log.fieldsEnriched.indexOf('event_date_precision') === -1) {
        log.fieldsEnriched.push('event_date_precision');
      }
    }
  }

  // --- 3. LOCATION EXTRACTION ---
  // Only if adapter didn't provide location data
  var hasLocation = report.city || report.state_province || report.location_name;
  if (!hasLocation) {
    var locResult = extractLocationFromText(text);
    if (locResult) {
      if (locResult.city && !report.city) {
        report.city = locResult.city;
        log.fieldsEnriched.push('city');
      }
      if (locResult.state && !report.state_province) {
        report.state_province = locResult.state;
        log.fieldsEnriched.push('state_province');
      }
      if (locResult.location_name && !report.location_name) {
        report.location_name = locResult.location_name;
        log.fieldsEnriched.push('location_name');
      }
      if (!report.country) {
        // If we found a US state, set country
        report.country = 'United States';
        log.fieldsEnriched.push('country');
      }
      log.locationExtracted = true;
      log.locationSource = locResult.source;
      console.log('[Enrichment] Extracted location: ' + (locResult.location_name || locResult.state || '') + ' from: "' + locResult.source + '"');
    }
  }

  // --- 4. GEOCODING ---
  // Only if we have location but no coordinates
  if (!options?.skipGeocode) {
    var geoResult = await geocodeReport(report);
    if (geoResult) {
      report.latitude = geoResult.latitude;
      report.longitude = geoResult.longitude;
      log.geocoded = true;
      log.geocodeSource = geoResult.source;
      log.fieldsEnriched.push('latitude', 'longitude');
      console.log('[Enrichment] Geocoded: ' + geoResult.source + ' -> ' + geoResult.latitude.toFixed(4) + ', ' + geoResult.longitude.toFixed(4));
    }
  }

  return { report: report, enrichments: log };
}

/**
 * Enrich a batch of reports. Respects geocoding rate limits.
 */
export async function enrichBatch(
  reports: ScrapedReport[],
  options?: { skipGeocode?: boolean; geocodeRateLimitMs?: number }
): Promise<EnrichmentResult[]> {
  var results: EnrichmentResult[] = [];
  var rateLimitMs = options?.geocodeRateLimitMs || 100; // 100ms between geocode calls

  for (var i = 0; i < reports.length; i++) {
    var result = await enrichReport(reports[i], { skipGeocode: options?.skipGeocode });
    results.push(result);

    // Rate limit geocoding calls
    if (result.enrichments.geocoded && i < reports.length - 1) {
      await new Promise(function(resolve) { setTimeout(resolve, rateLimitMs); });
    }
  }

  // Log summary
  var enriched = results.filter(function(r) { return r.enrichments.fieldsEnriched.length > 0; }).length;
  var geocoded = results.filter(function(r) { return r.enrichments.geocoded; }).length;
  var datesFound = results.filter(function(r) { return r.enrichments.dateExtracted; }).length;
  var locsFound = results.filter(function(r) { return r.enrichments.locationExtracted; }).length;
  console.log('[Enrichment] Batch complete: ' + enriched + '/' + reports.length + ' enriched (' +
    datesFound + ' dates, ' + locsFound + ' locations, ' + geocoded + ' geocoded)');

  return results;
}
