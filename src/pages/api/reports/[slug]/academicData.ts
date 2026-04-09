/**
 * Academic Observation Data API
 *
 * Returns structured observation data for academic/research purposes
 * Extracts key details from report and any associated academic_observations record
 * Updated: Jan 29, 2026
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Countries that use imperial units (mph) by default
var IMPERIAL_COUNTRIES = ['united states', 'usa', 'us', 'united kingdom', 'uk', 'myanmar', 'liberia']

function isImperialCountry(country: string | null): boolean {
  if (!country) return true // Default to imperial (most NUFORC reports are US)
  var c = country.toLowerCase().trim()
  for (var i = 0; i < IMPERIAL_COUNTRIES.length; i++) {
    if (c === IMPERIAL_COUNTRIES[i] || c.indexOf(IMPERIAL_COUNTRIES[i]) !== -1) return true
  }
  return false
}

// Extract structured data from report description using patterns
function extractObservationDetails(report: any) {
  var description = report.description || ''
  var descLower = description.toLowerCase()

  // ---- Duration ----
  // First try source metadata (NUFORC stores "5 minutes", "30 seconds" etc.)
  var durationSeconds: number | null = null
  var meta = (report as any).metadata || {}
  var durationSource = meta.duration || ''
  if (durationSource) {
    var srcDurMatch = durationSource.match(/(\d+)\s*(second|minute|hour|min|sec|hr)s?/i)
    if (srcDurMatch) {
      var srcDurVal = parseInt(srcDurMatch[1])
      var srcDurUnit = srcDurMatch[2].toLowerCase()
      if (srcDurUnit.startsWith('sec')) durationSeconds = srcDurVal
      else if (srcDurUnit.startsWith('min')) durationSeconds = srcDurVal * 60
      else if (srcDurUnit.startsWith('hour') || srcDurUnit.startsWith('hr')) durationSeconds = srcDurVal * 3600
    }
  }
  // Fallback: NLP extract from description
  if (!durationSeconds) {
    var durationMatch = descLower.match(/(\d+)\s*(second|minute|hour|min|sec|hr)s?/i)
    if (durationMatch) {
      var durValue = parseInt(durationMatch[1])
      var durUnit = durationMatch[2].toLowerCase()
      if (durUnit.startsWith('sec')) durationSeconds = durValue
      else if (durUnit.startsWith('min')) durationSeconds = durValue * 60
      else if (durUnit.startsWith('hour') || durUnit.startsWith('hr')) durationSeconds = durValue * 3600
    }
  }

  // ---- Shape ----
  // First check source metadata (NUFORC stores shape as structured field)
  var detectedShape: string | null = null
  if (meta.shape && typeof meta.shape === 'string' && meta.shape.trim()) {
    var srcShape = meta.shape.trim()
    detectedShape = srcShape.charAt(0).toUpperCase() + srcShape.slice(1).toLowerCase()
  }
  // Fallback: NLP extract from description
  if (!detectedShape) {
    var shapes = ['disc', 'saucer', 'triangle', 'triangular', 'sphere', 'spherical', 'orb', 'oval',
      'cigar', 'cylinder', 'rectangular', 'diamond', 'chevron', 'boomerang', 'light', 'formation',
      'disk', 'tic-tac', 'tic tac', 'fireball', 'star-like', 'cross', 'cube', 'ring', 'egg']
    for (var si = 0; si < shapes.length; si++) {
      if (descLower.indexOf(shapes[si]) !== -1) {
        var s = shapes[si]
        detectedShape = s.charAt(0).toUpperCase() + s.slice(1)
        break
      }
    }
  }

  // ---- Colors ----
  var colors = ['red', 'orange', 'yellow', 'green', 'blue', 'white', 'silver', 'metallic',
    'glowing', 'bright', 'dim', 'pulsating', 'multicolored', 'purple', 'golden', 'amber', 'crimson']
  // Use word-boundary regex to avoid substring matches (e.g. "red" in "disappeared")
  var detectedColors: string[] = []
  for (var cri = 0; cri < colors.length; cri++) {
    var colorRegex = new RegExp('\\b' + colors[cri] + '\\b', 'i')
    if (colorRegex.test(descLower)) detectedColors.push(colors[cri])
  }

  // ---- Motion type ----
  // Both UFO and cryptid motion patterns
  var motions = [
    // Cryptid-specific (check first for BFRO accuracy)
    'walking', 'running', 'bipedal', 'upright', 'crawling', 'crouching',
    'standing', 'fleeing', 'charging', 'stalking', 'circling',
    // UFO-specific
    'hovering', 'stationary', 'moving', 'fast', 'slow', 'erratic', 'zigzag',
    'ascending', 'descending', 'disappeared', 'vanished', 'darting', 'gliding', 'pulsing',
    'spinning', 'rotating', 'wobbling', 'accelerat'
  ]
  var detectedMotion: string | null = null
  for (var mi = 0; mi < motions.length; mi++) {
    if (descLower.indexOf(motions[mi]) !== -1) {
      detectedMotion = motions[mi]
      // Normalize partial matches
      if (detectedMotion === 'accelerat') detectedMotion = 'accelerating'
      if (detectedMotion === 'bipedal' || detectedMotion === 'upright') detectedMotion = 'bipedal/upright'
      break
    }
  }

  // ---- Speed extraction with unit inference ----
  var detectedSpeed: string | null = null
  // Patterns: "100 mph", "200 km/h", "going 100+", "about 50 miles per hour", "roughly 300"
  var speedPatterns = [
    /(\d[\d,]*\.?\d*)\+?\s*(mph|miles?\s*per\s*hour|mi\/h)/i,
    /(\d[\d,]*\.?\d*)\+?\s*(km\/h|kmh|kph|kilometers?\s*per\s*hour|kilometres?\s*per\s*hour)/i,
    /(\d[\d,]*\.?\d*)\+?\s*(knots?|kts?)/i,
    /(?:speed|going|moving|traveling|travelling|flew|clocked)\s*(?:at|of|around|about|roughly|approximately|over)?\s*(\d[\d,]*\.?\d*)\+?/i,
    /(\d[\d,]*\.?\d*)\+?\s*(?:speed|fast)/i
  ]
  for (var spi = 0; spi < speedPatterns.length; spi++) {
    var speedMatch = descLower.match(speedPatterns[spi])
    if (speedMatch) {
      // Find the numeric group
      var speedNum = ''
      var speedUnit = ''
      if (spi <= 2) {
        // Explicit unit patterns
        speedNum = speedMatch[1].replace(/,/g, '')
        if (spi === 0) speedUnit = 'mph'
        else if (spi === 1) speedUnit = 'km/h'
        else if (spi === 2) speedUnit = 'knots'
      } else {
        // No explicit unit — infer from country
        speedNum = (speedMatch[3] || speedMatch[1] || '').replace(/,/g, '')
        speedUnit = isImperialCountry(report.country) ? 'mph' : 'km/h'
      }
      if (speedNum && parseInt(speedNum) > 0) {
        // Check for "+" indicator in original text
        var plusIndicator = description.indexOf(speedNum + '+') !== -1 ? '+' : ''
        detectedSpeed = speedNum + plusIndicator + ' ' + speedUnit
      }
      break
    }
  }

  // ---- Event time extraction ----
  var detectedEventTime: string | null = null
  // Try explicit time patterns: "at 10:30 PM", "around 9pm", "approximately 2:15 am", "21:30"
  var timePatterns = [
    /(?:at|around|about|approximately|roughly|near)\s+(\d{1,2}:\d{2})\s*(am|pm|a\.m\.|p\.m\.)/i,
    /(\d{1,2}:\d{2})\s*(am|pm|a\.m\.|p\.m\.)/i,
    /(?:at|around|about|approximately)\s+(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/i,
    /(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/i,
    /(\d{2}:\d{2})\s*(?:hours?|hrs?|h\b)/i,
    /(\d{2}:\d{2})(?:\s|,|\.|$)/
  ]
  for (var tpi = 0; tpi < timePatterns.length; tpi++) {
    var timeMatch = description.match(timePatterns[tpi])
    if (timeMatch) {
      var timeStr = timeMatch[1]
      var ampm = (timeMatch[2] || '').replace(/\./g, '').toLowerCase()
      if (ampm) {
        detectedEventTime = timeStr + ' ' + ampm.toUpperCase()
      } else {
        // 24-hour format
        var hh = parseInt(timeStr.split(':')[0])
        if (hh >= 0 && hh <= 23) {
          detectedEventTime = timeStr
        }
      }
      break
    }
  }
  // Also check for general time-of-day references if no specific time found
  if (!detectedEventTime) {
    var todPatterns = [
      { pattern: /\b(early\s+morning|predawn|before\s+dawn)\b/i, value: 'early morning' },
      { pattern: /\b(dawn|sunrise|daybreak)\b/i, value: 'dawn' },
      { pattern: /\b(morning)\b/i, value: 'morning' },
      { pattern: /\b(noon|midday|lunchtime)\b/i, value: 'midday' },
      { pattern: /\b(afternoon)\b/i, value: 'afternoon' },
      { pattern: /\b(dusk|sunset|sundown|twilight)\b/i, value: 'dusk' },
      { pattern: /\b(evening)\b/i, value: 'evening' },
      { pattern: /\b(night|nighttime|late\s+night|midnight|middle\s+of\s+the\s+night)\b/i, value: 'night' }
    ]
    for (var tdi = 0; tdi < todPatterns.length; tdi++) {
      if (todPatterns[tdi].pattern.test(descLower)) {
        detectedEventTime = todPatterns[tdi].value
        break
      }
    }
  }

  // ---- Sound ----
  var sound: string | null = null
  if (descLower.indexOf('silent') !== -1 || descLower.indexOf('no sound') !== -1 || descLower.indexOf('no noise') !== -1 || descLower.indexOf('made no') !== -1) {
    sound = 'silent'
  } else if (descLower.indexOf('howl') !== -1 || descLower.indexOf('howling') !== -1) {
    sound = 'howling'
  } else if (descLower.indexOf('scream') !== -1 || descLower.indexOf('shriek') !== -1 || descLower.indexOf('screech') !== -1) {
    sound = 'screaming/shrieking'
  } else if (descLower.indexOf('vocalization') !== -1 || descLower.indexOf('vocaliz') !== -1 || descLower.indexOf('whoop') !== -1 || descLower.indexOf('chatter') !== -1) {
    sound = 'vocalization'
  } else if (descLower.indexOf('wood knock') !== -1 || descLower.indexOf('tree knock') !== -1 || descLower.indexOf('knocking') !== -1 || descLower.indexOf('knock on') !== -1) {
    sound = 'knocking/wood knock'
  } else if (descLower.indexOf('growl') !== -1 || descLower.indexOf('grunt') !== -1 || descLower.indexOf('snarl') !== -1) {
    sound = 'growling/grunting'
  } else if (descLower.indexOf('humming') !== -1 || descLower.indexOf(' hum ') !== -1 || descLower.indexOf('hum.') !== -1) {
    sound = 'humming'
  } else if (descLower.indexOf('buzzing') !== -1 || descLower.indexOf('buzz') !== -1) {
    sound = 'buzzing'
  } else if (descLower.indexOf('roaring') !== -1 || descLower.indexOf('loud') !== -1 || descLower.indexOf('rumbl') !== -1) {
    sound = 'loud'
  } else if (descLower.indexOf('whoosh') !== -1 || descLower.indexOf('whirr') !== -1 || descLower.indexOf('whir') !== -1) {
    sound = 'whirring'
  } else if (descLower.indexOf('clicking') !== -1 || descLower.indexOf('beep') !== -1) {
    sound = 'clicking/beeping'
  } else if (descLower.indexOf('footstep') !== -1 || descLower.indexOf('foot step') !== -1 || descLower.indexOf('crashing through') !== -1 || descLower.indexOf('branch') !== -1 && descLower.indexOf('break') !== -1) {
    sound = 'footsteps/movement'
  }

  // ---- Witness count (expanded patterns) ----
  var witnessCount = report.witness_count || 1
  // Companion/partner patterns — each implies at least 2
  var companionPatterns = [
    'my wife', 'my husband', 'my spouse', 'my partner', 'my girlfriend', 'my boyfriend',
    'my fiancé', 'my fiancee', 'my fiance', 'my son', 'my daughter', 'my brother', 'my sister',
    'my mother', 'my father', 'my mom', 'my dad', 'my friend', 'my buddy', 'my neighbor',
    'my neighbour', 'my coworker', 'my co-worker', 'my colleague',
    'we saw', 'we observed', 'we noticed', 'we watched', 'we were',
    'we both', 'both of us', 'the two of us', 'my family',
    'and i saw', 'and i were', 'and i both'
  ]
  var companionFound = false
  for (var ci = 0; ci < companionPatterns.length; ci++) {
    if (descLower.indexOf(companionPatterns[ci]) !== -1) {
      companionFound = true
      break
    }
  }
  if (companionFound) {
    witnessCount = Math.max(witnessCount, 2)
  }
  // Check for group patterns that imply 3+
  var groupPatterns = [
    'my family and', 'several of us', 'group of', 'three of us', 'four of us',
    'five of us', 'all of us', 'everyone saw', 'whole family'
  ]
  for (var gi = 0; gi < groupPatterns.length; gi++) {
    if (descLower.indexOf(groupPatterns[gi]) !== -1) {
      witnessCount = Math.max(witnessCount, 3)
      break
    }
  }
  // Explicit number mentions: "3 witnesses", "witnessed by 4 people"
  var witnessNumMatch = descLower.match(/(\d+)\s*(?:witness|people\s+saw|of\s+us|observers)/i)
  if (witnessNumMatch) {
    var wNum = parseInt(witnessNumMatch[1])
    if (wNum > 0 && wNum < 100) witnessCount = Math.max(witnessCount, wNum)
  }

  // ---- Direction extraction ----
  var detectedDirection: string | null = null
  var directions = [
    { pattern: /\b(north\s*(?:east|west)?|south\s*(?:east|west)?|east(?:ward)?|west(?:ward)?)\b/i, group: 1 },
    { pattern: /\bheading\s+(north|south|east|west|ne|nw|se|sw)\b/i, group: 1 },
    { pattern: /\bmoving\s+(?:to\s+the\s+)?(north|south|east|west)\b/i, group: 1 }
  ]
  for (var di = 0; di < directions.length; di++) {
    var dirMatch = descLower.match(directions[di].pattern)
    if (dirMatch && dirMatch[directions[di].group]) {
      var dirStr = dirMatch[directions[di].group].trim()
      detectedDirection = dirStr.charAt(0).toUpperCase() + dirStr.slice(1)
      break
    }
  }

  // ---- Altitude extraction ----
  var detectedAltitude: string | null = null
  var altPatterns = [
    /(\d[\d,]*)\s*(feet|ft|meters|metres|m)\s*(?:high|altitude|above|up|in\s+the\s+air)/i,
    /(?:altitude|height|elevation)\s*(?:of|at|about|around)?\s*(\d[\d,]*)\s*(feet|ft|meters|metres|m)/i,
    /\b(tree\s*(?:top|line)|rooftop|low\s+altitude|high\s+altitude|cloud\s+level)\b/i
  ]
  for (var ai = 0; ai < altPatterns.length; ai++) {
    var altMatch = description.match(altPatterns[ai])
    if (altMatch) {
      if (ai <= 1) {
        var altNum = (altMatch[ai === 0 ? 1 : 2] || altMatch[1]).replace(/,/g, '')
        var altUnit = (altMatch[ai === 0 ? 2 : 3] || altMatch[2] || 'ft').toLowerCase()
        if (altUnit === 'm' || altUnit.startsWith('meter') || altUnit.startsWith('metre')) {
          detectedAltitude = altNum + ' m'
        } else {
          detectedAltitude = altNum + ' ft'
        }
      } else {
        detectedAltitude = altMatch[1]
      }
      break
    }
  }

  // ---- Brightness extraction ----
  var detectedBrightness: string | null = null
  var brightnessTerms = [
    { pattern: /\bbright\s+as\s+(?:the\s+)?(sun|moon|star|venus|jupiter)\b/i, label: null },
    { pattern: /\b(extremely|very|incredibly|intensely)\s+bright\b/i, label: 'very bright' },
    { pattern: /\b(blinding|brilliant)\b/i, label: 'blinding' },
    { pattern: /\b(faintly?\s+glow|dim\s+light|barely\s+visible)\b/i, label: 'faint' },
    { pattern: /\b(steady\s+glow|soft\s+glow|gentle\s+light)\b/i, label: 'soft glow' },
    { pattern: /\b(bright|luminous)\b/i, label: 'bright' }
  ]
  for (var bi = 0; bi < brightnessTerms.length; bi++) {
    var bMatch = description.match(brightnessTerms[bi].pattern)
    if (bMatch) {
      detectedBrightness = brightnessTerms[bi].label || ('bright as ' + bMatch[1].toLowerCase())
      break
    }
  }

  // ---- Official report detection ----
  var isOfficialReport = false
  var officialSources = ['nuforc', 'bfro', 'mufon', 'nicap', 'geipan', 'narcap']
  var srcType = (report.source_type || '').toLowerCase()
  for (var oi = 0; oi < officialSources.length; oi++) {
    if (srcType.indexOf(officialSources[oi]) !== -1) {
      isOfficialReport = true
      break
    }
  }

  // ---- Creature/Object count ----
  // Only use count from structured source data (e.g. BFRO fields, curated data).
  // Never infer creature count from NLP/description text — too unreliable.
  var detectedObjectCount: number | null = null
  var objectCountExact = false

  // ---- Location type inference for field-research reports ----
  var detectedLocationType: string | null = null
  var locTypePatterns = [
    { pattern: /\b(forest|woods|woodland|timber)\b/i, label: 'Forest/Woodland' },
    { pattern: /\b(mountain|ridge|hill|summit|peak)\b/i, label: 'Mountain/Highland' },
    { pattern: /\b(swamp|marsh|bog|wetland)\b/i, label: 'Wetland/Swamp' },
    { pattern: /\b(lake|river|creek|stream|pond|waterway|shore|beach)\b/i, label: 'Near water' },
    { pattern: /\b(trail|path|road|highway|interstate)\b/i, label: 'Trail/Road' },
    { pattern: /\b(campsite|campground|camp)\b/i, label: 'Campground' },
    { pattern: /\b(cabin|house|home|residential|property|yard|backyard)\b/i, label: 'Residential' },
    { pattern: /\b(field|meadow|pasture|farmland|farm|ranch)\b/i, label: 'Rural/Agricultural' },
    { pattern: /\b(park|state park|national park|preserve|refuge)\b/i, label: 'Park/Preserve' },
    { pattern: /\b(desert|canyon|gorge|ravine)\b/i, label: 'Desert/Canyon' }
  ]
  for (var lti = 0; lti < locTypePatterns.length; lti++) {
    if (locTypePatterns[lti].pattern.test(descLower)) {
      detectedLocationType = locTypePatterns[lti].label
      break
    }
  }

  return {
    durationSeconds: durationSeconds,
    detectedShape: detectedShape,
    detectedColors: detectedColors,
    detectedMotion: detectedMotion,
    sound: sound,
    witnessCount: witnessCount,
    detectedSpeed: detectedSpeed,
    detectedEventTime: detectedEventTime,
    detectedDirection: detectedDirection,
    detectedAltitude: detectedAltitude,
    detectedBrightness: detectedBrightness,
    isOfficialReport: isOfficialReport,
    detectedObjectCount: detectedObjectCount,
    objectCountExact: objectCountExact,
    detectedLocationType: detectedLocationType
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Report slug is required' })
  }

  try {
    // Get report data - include metadata JSON for adapter-specific fields
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select(`
        id, title, slug, description, summary,
        event_date, event_time,
        location_name, state_province, country, latitude, longitude,
        witness_count,
        has_photo_video, has_physical_evidence, has_official_report,
        tags, category, source_type, source_url,
        credibility, created_at, metadata
      `)
      .eq('slug', slug)
      .eq('status', 'approved')
      .single()

    if (reportError || !report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // Try to get academic observation record if exists
    const { data: academicData } = await supabase
      .from('academic_observations')
      .select('*')
      .eq('report_id', report.id)
      .single()

    // Extract additional details from description
    const extracted = extractObservationDetails(report)

    // Source-specific metadata (NUFORC, BFRO, etc. store structured fields here)
    var meta = (report as any).metadata || {}

    // Format event_time for display: "15:45" → "3:45 PM", pass through non-standard
    var formattedEventTime: string | null = null
    if (report.event_time) {
      var etMatch = String(report.event_time).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
      if (etMatch) {
        var h = parseInt(etMatch[1], 10)
        var m = etMatch[2]
        var period = h >= 12 ? 'PM' : 'AM'
        var h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
        formattedEventTime = h12 + ':' + m + ' ' + period
      } else {
        formattedEventTime = report.event_time
      }
    }

    // Infer location type from BFRO/field-research metadata
    var inferredLocationType: string | null = null
    if (meta.environment) {
      var envLower = meta.environment.toLowerCase()
      if (/\b(forest|woods|woodland|timber)\b/.test(envLower)) inferredLocationType = 'Forest/Woodland'
      else if (/\b(mountain|ridge|hill)\b/.test(envLower)) inferredLocationType = 'Mountain/Highland'
      else if (/\b(swamp|marsh|bog|wetland)\b/.test(envLower)) inferredLocationType = 'Wetland/Swamp'
      else if (/\b(lake|river|creek|stream)\b/.test(envLower)) inferredLocationType = 'Near water'
      else if (/\b(residential|suburban|neighborhood)\b/.test(envLower)) inferredLocationType = 'Residential'
      else if (/\b(rural|farm|ranch|field|pasture)\b/.test(envLower)) inferredLocationType = 'Rural/Agricultural'
      else if (/\b(park|preserve|refuge)\b/.test(envLower)) inferredLocationType = 'Park/Preserve'
    }

    // Helper: get NUFORC metadata speed with unit inference
    // NUFORC "Estimated Speed" can be: "100+", "1000 - 2000 mph i guess, with distance in mind",
    // or descriptive text like "disappeared from my view in about 4 to 6 seconds".
    // We extract just the clean numeric (or range) + unit, discarding trailing commentary.
    var sourceSpeed: string | null = null
    if (meta.estimatedSpeed) {
      var rawSpeed = String(meta.estimatedSpeed).trim()
      // Only process if the value starts with a number
      var hasNumericSpeed = /^\d/.test(rawSpeed)
      if (hasNumericSpeed) {
        // Try to extract a clean speed: number(+range) + optional unit
        // Matches: "100+", "100", "1000 - 2000", "1000-2000 mph", "250 km/h"
        var cleanMatch = rawSpeed.match(/^(\d[\d,]*\.?\d*)\+?\s*(?:-\s*(\d[\d,]*\.?\d*)\+?)?\s*(mph|miles?\s*per\s*hour|km\/h|kmh|kph|knots?|kts?)?/i)
        if (cleanMatch) {
          var speedLow = (cleanMatch[1] || '').replace(/,/g, '')
          var speedHigh = cleanMatch[2] ? cleanMatch[2].replace(/,/g, '') : null
          var explicitUnit = cleanMatch[3] || ''

          // Normalize unit
          var speedUnit = ''
          if (/mph|miles?\s*per\s*hour/i.test(explicitUnit)) {
            speedUnit = 'mph'
          } else if (/km|kph/i.test(explicitUnit)) {
            speedUnit = 'km/h'
          } else if (/knot|kts?/i.test(explicitUnit)) {
            speedUnit = 'knots'
          } else {
            // No explicit unit — infer from country
            speedUnit = isImperialCountry(report.country) ? 'mph' : 'km/h'
          }

          // Check for "+" indicator in original text
          var hasPlus = rawSpeed.indexOf(speedLow + '+') !== -1

          if (speedHigh) {
            sourceSpeed = speedLow + '-' + speedHigh + ' ' + speedUnit
          } else {
            sourceSpeed = speedLow + (hasPlus ? '+' : '') + ' ' + speedUnit
          }
        }
      }
      // If non-numeric, skip — the description regex extraction will handle what it can
    }

    // Build the structured academic data response
    const structuredData = {
      // Core Identification
      caseId: report.id,
      caseSlug: report.slug,
      title: report.title,

      // Temporal Data
      temporal: {
        eventDate: report.event_date,
        eventTime: formattedEventTime || extracted.detectedEventTime || null,
        timeApproximate: !report.event_time && !!extracted.detectedEventTime,
        durationSeconds: academicData?.observation_duration_seconds || extracted.durationSeconds,
        durationText: null,
        timeCertainty: academicData?.time_certainty || (report.event_time ? 'reported' : (extracted.detectedEventTime ? 'extracted' : 'unknown')),
        reportedAt: report.created_at
      },

      // Location Data
      location: {
        name: report.location_name,
        stateProvince: report.state_province,
        country: report.country,
        coordinates: report.latitude && report.longitude ? {
          latitude: report.latitude,
          longitude: report.longitude,
          precision: 'approximate' // Most reports use city-level coords
        } : null,
        locationType: academicData?.observation_location_type || inferredLocationType || extracted.detectedLocationType || null
      },

      // Observer Information
      observer: {
        witnessCount: academicData?.other_witnesses_count || extracted.witnessCount,
        experienceLevel: academicData?.observer_experience_level || null,
        visualAids: academicData?.observer_visual_aids || null,
        physicalState: academicData?.observer_physical_state || null,
        emotionalState: academicData?.observer_emotional_state || null
      },

      // Object Characteristics
      phenomenon: {
        objectCount: academicData?.object_count || null,
        objectCountExact: !!(academicData?.object_count),
        shape: academicData?.object_shape || extracted.detectedShape,
        colors: academicData?.object_color || (meta.color ? [meta.color] : (extracted.detectedColors.length > 0 ? extracted.detectedColors : null)),
        brightness: academicData?.object_brightness || extracted.detectedBrightness,
        sound: academicData?.object_sound || extracted.sound,
        sizeApparent: academicData?.object_size_apparent || null,
        sizeEstimated: academicData?.object_size_estimated || meta.estimatedSize || null,
        speed: sourceSpeed || extracted.detectedSpeed,
        characteristics: meta.characteristics || null
      },

      // Motion Characteristics
      motion: {
        type: academicData?.motion_type || extracted.detectedMotion,
        speedApparent: academicData?.motion_speed_apparent || sourceSpeed || extracted.detectedSpeed,
        direction: academicData?.motion_direction || meta.directionFromViewer || extracted.detectedDirection,
        altitudeApparent: academicData?.motion_altitude_apparent || extracted.detectedAltitude,
        angleOfElevation: meta.angleOfElevation || null,
        closestDistance: meta.closestDistance || null,
        maneuvers: academicData?.motion_maneuvers || null
      },

      // Environmental Conditions
      environment: {
        weather: academicData?.weather_conditions || (meta.timeAndConditions ? meta.timeAndConditions : null),
        ambientLighting: academicData?.ambient_lighting || null,
        lightPollution: academicData?.urban_light_pollution || null,
        terrain: academicData?.terrain_description || (meta.environment ? meta.environment : null)
      },

      // Evidence & Documentation
      documentation: {
        hasPhotoVideo: report.has_photo_video || false,
        hasPhysicalEvidence: report.has_physical_evidence || false,
        hasOfficialReport: report.has_official_report || extracted.isOfficialReport || false,
        officialSource: extracted.isOfficialReport ? (report.source_type || '').toUpperCase() : null,
        evidenceSummary: null,
        methods: academicData?.documentation_methods || null,
        timing: academicData?.documentation_timing || null
      },

      // Physical Effects
      effects: {
        onObserver: academicData?.physical_effects_observer || null,
        onEnvironment: academicData?.physical_effects_environment || null,
        physicalEvidenceCollected: academicData?.physical_evidence_collected || false,
        evidenceDescription: academicData?.physical_evidence_description || null
      },

      // Data Quality Metrics
      quality: {
        dataQualityScore: academicData?.data_quality_score || null,
        completenessScore: academicData?.completeness_score || null,
        credibilityScore: report.credibility || null,
        sourceType: report.source_type,
        sourceUrl: report.source_url,
        collectionMethod: academicData?.collection_method || 'self-reported'
      },

      // Classification
      classification: {
        category: report.category,
        phenomenonLabel: report.category === 'cryptids' ? 'Creature' : 'Object',
        tags: report.tags || []
      },

      // Raw Data Access
      rawDescription: report.description,
      rawSummary: report.summary,

      // Metadata
      metadata: {
        hasStructuredData: !!academicData,
        lastUpdated: academicData?.last_updated_at || report.created_at,
        dataCollector: academicData?.data_collector_id || null
      }
    }

    // Category-aware field suppression: remove UFO-specific fields from cryptid reports
    // Shape (disc/triangle/orb), brightness (glowing), altitude, speed, angle of elevation
    // are aerial-phenomenon concepts that don't apply to cryptid field reports.
    // Colors are suppressed because current NLP picks up context words, not creature descriptions.
    if (report.category === 'cryptids') {
      structuredData.phenomenon.shape = null
      structuredData.phenomenon.brightness = null
      structuredData.phenomenon.speed = null
      structuredData.phenomenon.colors = null
      structuredData.motion.altitudeApparent = null
      structuredData.motion.angleOfElevation = null
      structuredData.motion.speedApparent = null

      // Check if detected motion is actually describing the witness, not the creature
      // e.g. "I was walking" should not produce motion: "walking" for the creature
      if (extracted.detectedMotion) {
        var motionWord = extracted.detectedMotion.toLowerCase()
        if (motionWord === 'bipedal/upright') motionWord = 'bipedal'
        var witnessMotionContexts = [
          'i was ' + motionWord, 'i started ' + motionWord, 'we were ' + motionWord,
          'while ' + motionWord, 'i went ' + motionWord, 'as i ' + motionWord,
          'i had been ' + motionWord, 'we had been ' + motionWord
        ]
        var descCheck = (report.description || '').toLowerCase()
        var isWitnessMotion = false
        for (var wmi = 0; wmi < witnessMotionContexts.length; wmi++) {
          if (descCheck.indexOf(witnessMotionContexts[wmi]) !== -1) {
            isWitnessMotion = true
            break
          }
        }
        if (isWitnessMotion) {
          structuredData.motion.type = null
        }
      }
    }

    return res.status(200).json(structuredData)
  } catch (error) {
    console.error('Error fetching academic data:', error)
    return res.status(500).json({ error: 'Failed to fetch academic data' })
  }
}
