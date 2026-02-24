/**
 * Location Inferrer - Deep text analysis for extracting location from report content
 *
 * This module goes beyond simple regex parsing to:
 * 1. Extract locations from narrative text (titles, descriptions, summaries)
 * 2. Resolve landmarks, geographic features, and colloquial place names
 * 3. Detect location context from surrounding text patterns
 * 4. Handle multi-format location references (coordinates, addresses, etc.)
 * 5. Score confidence of inferred locations
 */

import { parseLocation, ParsedLocation } from './location-parser'

export interface InferredLocation {
  locationName: string
  city?: string
  stateProvince?: string
  country?: string
  latitude?: number
  longitude?: number
  confidence: number      // 0-1 confidence score
  source: LocationSource  // How the location was inferred
  rawMatch: string        // The original text that was matched
}

export type LocationSource =
  | 'coordinate_mention'     // Lat/lng found in text
  | 'explicit_place'         // "in Phoenix, AZ" pattern
  | 'landmark'               // Known landmark or geographic feature
  | 'regional_reference'     // "the Pacific Northwest", "the Bayou"
  | 'road_highway'           // "along Highway 101", "Route 66"
  | 'park_wilderness'        // "Yellowstone", "Olympic National Forest"
  | 'body_of_water'          // "Lake Erie", "Chesapeake Bay"
  | 'military_base'          // "near Area 51", "Fort Bragg"
  | 'directional_reference'  // "northern California", "southern Ohio"
  | 'contextual_clue'        // Inferred from subreddit, source, or category context

// ─── Known Landmarks & Geographic Features ────────────────────────

const LANDMARKS: Record<string, { city?: string; state?: string; country: string; lat: number; lng: number }> = {
  // UFO/Paranormal hotspots
  'area 51': { state: 'NV', country: 'United States', lat: 37.2350, lng: -115.8111 },
  'groom lake': { state: 'NV', country: 'United States', lat: 37.2350, lng: -115.8111 },
  'roswell': { city: 'Roswell', state: 'NM', country: 'United States', lat: 33.3943, lng: -104.5230 },
  'skinwalker ranch': { state: 'UT', country: 'United States', lat: 40.2589, lng: -109.8880 },
  'point pleasant': { city: 'Point Pleasant', state: 'WV', country: 'United States', lat: 38.8448, lng: -82.1371 },
  'pine barrens': { state: 'NJ', country: 'United States', lat: 39.7836, lng: -74.5906 },
  'marfa lights': { city: 'Marfa', state: 'TX', country: 'United States', lat: 30.3087, lng: -104.0213 },
  'brown mountain': { state: 'NC', country: 'United States', lat: 35.8640, lng: -81.7310 },
  'bermuda triangle': { country: 'Atlantic Ocean', lat: 25.0000, lng: -71.0000 },
  'loch ness': { country: 'United Kingdom', lat: 57.3229, lng: -4.4244 },
  'rendlesham forest': { country: 'United Kingdom', lat: 52.0833, lng: 1.4333 },
  'the pentagon': { state: 'VA', country: 'United States', lat: 38.8719, lng: -77.0563 },
  'wright-patterson': { city: 'Dayton', state: 'OH', country: 'United States', lat: 39.8261, lng: -84.0484 },
  'dulce base': { state: 'NM', country: 'United States', lat: 36.9336, lng: -106.9992 },
  'mount shasta': { state: 'CA', country: 'United States', lat: 41.4092, lng: -122.1949 },
  'sedona': { city: 'Sedona', state: 'AZ', country: 'United States', lat: 34.8697, lng: -111.7610 },
  'gettysburg': { city: 'Gettysburg', state: 'PA', country: 'United States', lat: 39.8309, lng: -77.2311 },
  'salem': { city: 'Salem', state: 'MA', country: 'United States', lat: 42.5195, lng: -70.8967 },
  'mothman': { city: 'Point Pleasant', state: 'WV', country: 'United States', lat: 38.8448, lng: -82.1371 },

  // National parks / wilderness (frequent cryptid/UFO reports)
  'yellowstone': { state: 'WY', country: 'United States', lat: 44.4280, lng: -110.5885 },
  'yosemite': { state: 'CA', country: 'United States', lat: 37.8651, lng: -119.5383 },
  'everglades': { state: 'FL', country: 'United States', lat: 25.2867, lng: -80.8987 },
  'olympic national': { state: 'WA', country: 'United States', lat: 47.8021, lng: -123.6044 },
  'great smoky': { state: 'TN', country: 'United States', lat: 35.6118, lng: -83.4895 },
  'appalachian trail': { country: 'United States', lat: 37.5000, lng: -79.5000 },
  'pacific crest trail': { country: 'United States', lat: 40.0000, lng: -121.0000 },
  'denali': { state: 'AK', country: 'United States', lat: 63.0695, lng: -151.0074 },
  'grand canyon': { state: 'AZ', country: 'United States', lat: 36.1069, lng: -112.1129 },
  'death valley': { state: 'CA', country: 'United States', lat: 36.5054, lng: -117.0794 },
  'big bend': { state: 'TX', country: 'United States', lat: 29.2498, lng: -103.2502 },
  'glacier national': { state: 'MT', country: 'United States', lat: 48.7596, lng: -113.7870 },
  'redwood': { state: 'CA', country: 'United States', lat: 41.3029, lng: -124.0046 },
  'crater lake': { state: 'OR', country: 'United States', lat: 42.8684, lng: -122.1685 },
  'big sur': { state: 'CA', country: 'United States', lat: 36.2704, lng: -121.8081 },
  'black hills': { state: 'SD', country: 'United States', lat: 43.8554, lng: -103.4590 },
  'ozarks': { state: 'MO', country: 'United States', lat: 36.6500, lng: -92.5000 },

  // Bodies of water
  'lake erie': { country: 'United States', lat: 42.1740, lng: -81.0000 },
  'lake michigan': { country: 'United States', lat: 43.6167, lng: -87.0000 },
  'lake superior': { country: 'United States', lat: 47.5000, lng: -88.0000 },
  'lake tahoe': { state: 'CA', country: 'United States', lat: 39.0968, lng: -120.0324 },
  'lake champlain': { state: 'VT', country: 'United States', lat: 44.5335, lng: -73.3370 },
  'chesapeake bay': { state: 'MD', country: 'United States', lat: 37.8000, lng: -76.1000 },
  'puget sound': { state: 'WA', country: 'United States', lat: 47.5000, lng: -122.5000 },
  'mississippi river': { country: 'United States', lat: 32.3547, lng: -90.8782 },
  'ohio river': { country: 'United States', lat: 38.6000, lng: -84.0000 },
  'columbia river': { state: 'OR', country: 'United States', lat: 46.2000, lng: -123.0000 },
}

// ─── Regional References ────────────────────────────────────────

const REGIONAL_REFERENCES: Record<string, { state?: string; country: string; lat: number; lng: number }> = {
  'pacific northwest': { country: 'United States', lat: 47.0, lng: -122.0 },
  'the northwest': { country: 'United States', lat: 47.0, lng: -122.0 },
  'new england': { country: 'United States', lat: 42.5, lng: -71.5 },
  'the south': { country: 'United States', lat: 33.5, lng: -86.0 },
  'deep south': { country: 'United States', lat: 32.5, lng: -87.0 },
  'the midwest': { country: 'United States', lat: 41.0, lng: -89.0 },
  'the heartland': { country: 'United States', lat: 39.0, lng: -98.0 },
  'the plains': { country: 'United States', lat: 40.0, lng: -100.0 },
  'great plains': { country: 'United States', lat: 40.0, lng: -100.0 },
  'four corners': { country: 'United States', lat: 36.999, lng: -109.045 },
  'tristate area': { country: 'United States', lat: 40.7, lng: -74.0 },
  'tri-state': { country: 'United States', lat: 40.7, lng: -74.0 },
  'the bayou': { state: 'LA', country: 'United States', lat: 30.0, lng: -91.0 },
  'silicon valley': { state: 'CA', country: 'United States', lat: 37.387, lng: -122.058 },
  'the ozarks': { state: 'MO', country: 'United States', lat: 36.65, lng: -92.5 },
  'appalachia': { country: 'United States', lat: 37.5, lng: -80.5 },
  'the rockies': { country: 'United States', lat: 39.5, lng: -106.0 },
  'rocky mountains': { country: 'United States', lat: 39.5, lng: -106.0 },
  'blue ridge': { country: 'United States', lat: 36.0, lng: -81.0 },
  'blue ridge mountains': { country: 'United States', lat: 36.0, lng: -81.0 },
  'the cascades': { country: 'United States', lat: 46.0, lng: -121.5 },
  'cascade range': { country: 'United States', lat: 46.0, lng: -121.5 },
  'the desert southwest': { country: 'United States', lat: 34.0, lng: -111.0 },
  'texas hill country': { state: 'TX', country: 'United States', lat: 30.5, lng: -98.5 },
  'florida keys': { state: 'FL', country: 'United States', lat: 24.6, lng: -81.5 },
  'outer banks': { state: 'NC', country: 'United States', lat: 35.5, lng: -75.5 },
  'the panhandle': { state: 'FL', country: 'United States', lat: 30.5, lng: -86.5 },
  'hudson valley': { state: 'NY', country: 'United States', lat: 41.5, lng: -74.0 },
  'san joaquin valley': { state: 'CA', country: 'United States', lat: 36.7, lng: -119.8 },
  'central valley': { state: 'CA', country: 'United States', lat: 37.0, lng: -120.0 },
  'high desert': { state: 'CA', country: 'United States', lat: 34.5, lng: -117.3 },
  'mojave': { state: 'CA', country: 'United States', lat: 35.0, lng: -117.5 },
  'mojave desert': { state: 'CA', country: 'United States', lat: 35.0, lng: -117.5 },
}

// ─── Directional State References ─────────────────────────────────

const DIRECTIONAL_PATTERNS: Array<{
  pattern: RegExp
  extractor: (match: RegExpMatchArray) => { direction: string; state: string } | null
}> = [
  {
    pattern: /\b(northern|southern|eastern|western|central|northeast|northwest|southeast|southwest|north|south|east|west|rural|suburban|upstate|downstate)\s+(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new\s+hampshire|new\s+jersey|new\s+mexico|new\s+york|north\s+carolina|north\s+dakota|ohio|oklahoma|oregon|pennsylvania|rhode\s+island|south\s+carolina|south\s+dakota|tennessee|texas|utah|vermont|virginia|washington|west\s+virginia|wisconsin|wyoming)\b/i,
    extractor: (match) => ({ direction: match[1], state: match[2] })
  }
]

// ─── Highway & Road Patterns ──────────────────────────────────────

const HIGHWAY_PATTERNS: Array<{ pattern: RegExp; extractor: (match: RegExpMatchArray) => string }> = [
  { pattern: /\b(?:along|on|near|off)\s+(?:I-|Interstate\s+)(\d+)\b/i, extractor: (m) => `Interstate ${m[1]}` },
  { pattern: /\b(?:along|on|near|off)\s+(?:US-?|US Route\s+|Route\s+)(\d+)\b/i, extractor: (m) => `US Route ${m[1]}` },
  { pattern: /\b(?:along|on|near|off)\s+(?:Highway|Hwy)\s+(\d+)\b/i, extractor: (m) => `Highway ${m[1]}` },
]

// ─── Coordinate Extraction ─────────────────────────────────────────

const COORDINATE_PATTERNS = [
  // Decimal degrees: 37.7749, -122.4194 or 37.7749°N 122.4194°W
  /(-?\d{1,3}\.\d{2,8})[°]?\s*[NS]?\s*[,\s]+\s*(-?\d{1,3}\.\d{2,8})[°]?\s*[EW]?/,
  // DMS: 37°46'30"N 122°25'10"W
  /(\d{1,3})°\s*(\d{1,2})['']\s*(\d{1,2}(?:\.\d+)?)[""]\s*([NS])\s*[\s,]+\s*(\d{1,3})°\s*(\d{1,2})['']\s*(\d{1,2}(?:\.\d+)?)[""]\s*([EW])/,
]

// ─── State Name to Code Mapping ──────────────────────────────────

const STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY',
}

// ─── Main Inference Function ────────────────────────────────────

/**
 * Infer location from report text using multiple extraction strategies.
 * Returns the best inferred location or null if nothing found.
 *
 * Strategies (in priority order):
 * 1. Embedded coordinates in text
 * 2. Explicit place mentions ("in Phoenix, AZ")
 * 3. Known landmarks and paranormal hotspots
 * 4. National parks and wilderness areas
 * 5. Bodies of water
 * 6. Regional references ("Pacific Northwest")
 * 7. Directional state references ("northern California")
 * 8. Highway/road references
 */
export function inferLocation(
  title: string,
  summary: string,
  description: string,
  existingLocation?: Partial<{
    location_name: string
    city: string
    state_province: string
    country: string
    latitude: number
    longitude: number
  }>
): InferredLocation | null {
  // If we already have full coordinates, nothing to infer
  if (existingLocation?.latitude && existingLocation?.longitude) {
    return null
  }

  const searchTexts = [title || '', summary || '', description || '']
  const fullText = searchTexts.join(' ')

  if (fullText.trim().length < 10) return null

  const candidates: InferredLocation[] = []

  // Strategy 1: Extract coordinates from text
  for (const text of searchTexts) {
    const coordResult = extractCoordinates(text)
    if (coordResult) {
      candidates.push(coordResult)
    }
  }

  // Strategy 2: Explicit place mentions (use existing parser first on title/summary)
  for (const text of [title, summary]) {
    if (!text) continue
    const parsed = parseLocation(text)
    if (parsed.city || parsed.stateProvince) {
      candidates.push({
        locationName: parsed.locationName || `${parsed.city || ''}, ${parsed.stateProvince || parsed.country || ''}`.replace(/^, |, $/g, ''),
        city: parsed.city,
        stateProvince: parsed.stateProvince,
        country: parsed.country || 'United States',
        confidence: parsed.city && parsed.stateProvince ? 0.85 : 0.65,
        source: 'explicit_place',
        rawMatch: text.substring(0, 100)
      })
    }
  }

  // Strategy 3: Known landmarks
  const landmarkResult = matchLandmarks(fullText)
  if (landmarkResult) candidates.push(landmarkResult)

  // Strategy 4: Regional references
  const regionalResult = matchRegionalReferences(fullText)
  if (regionalResult) candidates.push(regionalResult)

  // Strategy 5: Directional state references
  const directionalResult = matchDirectionalReferences(fullText)
  if (directionalResult) candidates.push(directionalResult)

  // Strategy 6: Highway/road references
  const highwayResult = matchHighwayReferences(fullText)
  if (highwayResult) candidates.push(highwayResult)

  // Strategy 7: Enhanced multi-pattern extraction from description
  const descriptionLocations = extractLocationsFromNarrative(description || '')
  candidates.push(...descriptionLocations)

  // If we already have a partial location, use that as a base and enhance
  if (existingLocation?.location_name && !existingLocation.latitude) {
    // We have a location name but no coords — boost confidence of matches that align
    for (const candidate of candidates) {
      if (candidate.stateProvince && existingLocation.state_province === candidate.stateProvince) {
        candidate.confidence = Math.min(candidate.confidence + 0.1, 0.95)
      }
    }
  }

  // Sort by confidence (highest first) and return best match
  candidates.sort((a, b) => b.confidence - a.confidence)

  return candidates.length > 0 ? candidates[0] : null
}

/**
 * Batch infer locations for multiple reports
 */
export function inferLocations(
  reports: Array<{
    id: string
    title: string
    summary: string
    description: string
    location_name?: string
    city?: string
    state_province?: string
    country?: string
    latitude?: number
    longitude?: number
  }>
): Map<string, InferredLocation> {
  const results = new Map<string, InferredLocation>()

  for (const report of reports) {
    const inferred = inferLocation(
      report.title,
      report.summary,
      report.description,
      {
        location_name: report.location_name,
        city: report.city,
        state_province: report.state_province,
        country: report.country,
        latitude: report.latitude,
        longitude: report.longitude,
      }
    )

    if (inferred) {
      results.set(report.id, inferred)
    }
  }

  return results
}

// ─── Strategy Implementations ──────────────────────────────────────

function extractCoordinates(text: string): InferredLocation | null {
  // Decimal degrees
  const decimalMatch = text.match(/(-?\d{1,3}\.\d{2,8})\s*[°]?\s*([NS])?\s*[,\s]+\s*(-?\d{1,3}\.\d{2,8})\s*[°]?\s*([EW])?/)
  if (decimalMatch) {
    let lat = parseFloat(decimalMatch[1])
    let lng = parseFloat(decimalMatch[3])

    if (decimalMatch[2] === 'S') lat = -lat
    if (decimalMatch[4] === 'W') lng = -lng

    // Validate reasonable coordinates
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return {
        locationName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        latitude: lat,
        longitude: lng,
        confidence: 0.95,
        source: 'coordinate_mention',
        rawMatch: decimalMatch[0]
      }
    }
  }

  // DMS format
  const dmsMatch = text.match(/(\d{1,3})°\s*(\d{1,2})[''′]\s*(\d{1,2}(?:\.\d+)?)[""″]\s*([NS])\s*[\s,]+\s*(\d{1,3})°\s*(\d{1,2})[''′]\s*(\d{1,2}(?:\.\d+)?)[""″]\s*([EW])/)
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1]) + parseInt(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600
    let lng = parseInt(dmsMatch[5]) + parseInt(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600

    if (dmsMatch[4] === 'S') lat = -lat
    if (dmsMatch[8] === 'W') lng = -lng

    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return {
        locationName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        latitude: lat,
        longitude: lng,
        confidence: 0.95,
        source: 'coordinate_mention',
        rawMatch: dmsMatch[0]
      }
    }
  }

  return null
}

function matchLandmarks(text: string): InferredLocation | null {
  const lowerText = text.toLowerCase()

  for (const [name, info] of Object.entries(LANDMARKS)) {
    const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i')
    if (regex.test(lowerText)) {
      return {
        locationName: info.city ? `${info.city}, ${info.state || info.country}` : `${capitalize(name)}, ${info.state || info.country}`,
        city: info.city,
        stateProvince: info.state,
        country: info.country,
        latitude: info.lat,
        longitude: info.lng,
        confidence: 0.85,
        source: 'landmark',
        rawMatch: name
      }
    }
  }

  return null
}

function matchRegionalReferences(text: string): InferredLocation | null {
  const lowerText = text.toLowerCase()

  for (const [name, info] of Object.entries(REGIONAL_REFERENCES)) {
    const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i')
    if (regex.test(lowerText)) {
      return {
        locationName: capitalize(name) + (info.state ? `, ${info.state}` : ''),
        stateProvince: info.state,
        country: info.country,
        latitude: info.lat,
        longitude: info.lng,
        confidence: 0.55, // Regional = lower confidence (covers large area)
        source: 'regional_reference',
        rawMatch: name
      }
    }
  }

  return null
}

function matchDirectionalReferences(text: string): InferredLocation | null {
  for (const { pattern, extractor } of DIRECTIONAL_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const result = extractor(match)
      if (result) {
        const stateCode = STATE_NAME_TO_CODE[result.state.toLowerCase().replace(/\s+/g, ' ')]
        return {
          locationName: `${capitalize(result.direction)} ${capitalize(result.state)}`,
          stateProvince: stateCode,
          country: 'United States',
          confidence: 0.60,
          source: 'directional_reference',
          rawMatch: match[0]
        }
      }
    }
  }

  return null
}

function matchHighwayReferences(text: string): InferredLocation | null {
  for (const { pattern, extractor } of HIGHWAY_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      return {
        locationName: extractor(match),
        country: 'United States',
        confidence: 0.35, // Very low - highway alone doesn't pinpoint location
        source: 'road_highway',
        rawMatch: match[0]
      }
    }
  }

  return null
}

/**
 * Extract locations from narrative text using multiple patterns.
 * Handles conversational text like "I was driving through rural Ohio when..."
 */
function extractLocationsFromNarrative(text: string): InferredLocation[] {
  const results: InferredLocation[] = []
  if (!text || text.length < 20) return results

  // Pattern: "in/near/outside/around [City], [State]"
  const cityStatePatterns = [
    /\b(?:in|near|outside|around|from|visiting|at|to)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?),\s*([A-Z]{2})\b/g,
    /\b(?:in|near|outside|around|from|visiting|at|to)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?),\s*(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming)\b/gi,
  ]

  for (const pattern of cityStatePatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const city = match[1].trim()
      const stateRaw = match[2].trim()
      const stateCode = stateRaw.length === 2 ? stateRaw.toUpperCase() : STATE_NAME_TO_CODE[stateRaw.toLowerCase().replace(/\s+/g, ' ')]

      if (stateCode) {
        results.push({
          locationName: `${city}, ${stateCode}`,
          city,
          stateProvince: stateCode,
          country: 'United States',
          confidence: 0.80,
          source: 'explicit_place',
          rawMatch: match[0]
        })
      }
    }
  }

  // Pattern: "the [Place] area" or "[Place] county"
  const areaMatch = text.match(/\bthe\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\s+(?:area|region|county|vicinity|area of)\b/i)
  if (areaMatch) {
    results.push({
      locationName: areaMatch[1].trim(),
      confidence: 0.45,
      source: 'contextual_clue',
      rawMatch: areaMatch[0]
    })
  }

  // Pattern: "my [place] in [State]" or "our home in [State]"
  const homeStateMatch = text.match(/\b(?:my|our|the)\s+(?:home|house|cabin|property|farm|ranch|backyard|neighborhood|town|city|village)\s+in\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\b/)
  if (homeStateMatch) {
    const stateName = homeStateMatch[1].toLowerCase().replace(/\s+/g, ' ')
    const stateCode = STATE_NAME_TO_CODE[stateName]
    if (stateCode) {
      results.push({
        locationName: homeStateMatch[1],
        stateProvince: stateCode,
        country: 'United States',
        confidence: 0.60,
        source: 'contextual_clue',
        rawMatch: homeStateMatch[0]
      })
    }
  }

  return results
}

// ─── Helpers ────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function capitalize(str: string): string {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}
