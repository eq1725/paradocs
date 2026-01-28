/**
 * Cross-Reference / Correlations API
 * GET /api/reports/[id]/correlations - Get external correlations for a report
 * POST /api/reports/[id]/correlations - Fetch and store correlations
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

interface Correlation {
  type: string
  data_source: string
  data: Record<string, any>
  score: number
  notes: string
}

// Lunar phase calculation (simplified)
function getLunarPhase(date: Date): { phase: string; illumination: number } {
  // Known new moon: Jan 6, 2000
  const knownNewMoon = new Date(2000, 0, 6).getTime()
  const lunarCycle = 29.53058867 // days

  const daysSinceNew = (date.getTime() - knownNewMoon) / (1000 * 60 * 60 * 24)
  const cyclePosition = (daysSinceNew % lunarCycle) / lunarCycle

  let phase: string
  let illumination: number

  if (cyclePosition < 0.0625) {
    phase = 'new_moon'
    illumination = cyclePosition * 16 * 50
  } else if (cyclePosition < 0.1875) {
    phase = 'waxing_crescent'
    illumination = 12.5 + (cyclePosition - 0.0625) * 8 * 50
  } else if (cyclePosition < 0.3125) {
    phase = 'first_quarter'
    illumination = 25 + (cyclePosition - 0.1875) * 8 * 50
  } else if (cyclePosition < 0.4375) {
    phase = 'waxing_gibbous'
    illumination = 50 + (cyclePosition - 0.3125) * 8 * 50
  } else if (cyclePosition < 0.5625) {
    phase = 'full_moon'
    illumination = 100 - Math.abs(cyclePosition - 0.5) * 16 * 50
  } else if (cyclePosition < 0.6875) {
    phase = 'waning_gibbous'
    illumination = 75 - (cyclePosition - 0.5625) * 8 * 50
  } else if (cyclePosition < 0.8125) {
    phase = 'last_quarter'
    illumination = 50 - (cyclePosition - 0.6875) * 8 * 50
  } else if (cyclePosition < 0.9375) {
    phase = 'waning_crescent'
    illumination = 25 - (cyclePosition - 0.8125) * 8 * 50
  } else {
    phase = 'new_moon'
    illumination = (1 - cyclePosition) * 16 * 50
  }

  return { phase, illumination: Math.round(illumination) }
}

// Calculate solar activity proxy (simplified based on 11-year cycle)
function getSolarActivity(date: Date): { cycle_phase: string; activity_level: string } {
  // Solar cycle 25 started December 2019
  const cycleStart = new Date(2019, 11, 1).getTime()
  const cycleLength = 11 * 365.25 * 24 * 60 * 60 * 1000 // 11 years in ms

  const position = ((date.getTime() - cycleStart) % cycleLength) / cycleLength

  let phase: string
  let level: string

  if (position < 0.2) {
    phase = 'minimum'
    level = 'low'
  } else if (position < 0.4) {
    phase = 'ascending'
    level = 'moderate'
  } else if (position < 0.5) {
    phase = 'maximum'
    level = 'high'
  } else if (position < 0.7) {
    phase = 'descending'
    level = 'moderate'
  } else {
    phase = 'approaching_minimum'
    level = 'low'
  }

  return { cycle_phase: phase, activity_level: level }
}

// Get day of week and check for patterns
function getTemporalPatterns(date: Date, time: string | null): Record<string, any> {
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()]
  const month = date.getMonth() + 1
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))

  let timeOfDay = 'unknown'
  let isWitchingHour = false

  if (time) {
    const hour = parseInt(time.split(':')[0])
    if (hour >= 6 && hour < 12) timeOfDay = 'morning'
    else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon'
    else if (hour >= 18 && hour < 21) timeOfDay = 'evening'
    else timeOfDay = 'night'

    // "Witching hour" - 3 AM
    isWitchingHour = hour >= 2 && hour <= 4
  }

  // Check for significant dates
  const isEquinox = (month === 3 && Math.abs(dayOfYear - 80) <= 2) ||
                    (month === 9 && Math.abs(dayOfYear - 266) <= 2)
  const isSolstice = (month === 6 && Math.abs(dayOfYear - 172) <= 2) ||
                     (month === 12 && Math.abs(dayOfYear - 355) <= 2)
  const isHalloween = month === 10 && date.getDate() === 31
  const isFridayThe13th = dayOfWeek === 'Friday' && date.getDate() === 13

  return {
    day_of_week: dayOfWeek,
    month,
    time_of_day: timeOfDay,
    is_witching_hour: isWitchingHour,
    is_equinox: isEquinox,
    is_solstice: isSolstice,
    is_halloween: isHalloween,
    is_friday_13th: isFridayThe13th,
    is_weekend: dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday',
  }
}

// Estimate weather based on season and location (simplified)
function getSeasonalContext(date: Date, latitude: number | null): Record<string, any> {
  const month = date.getMonth()
  const isNorthernHemisphere = !latitude || latitude >= 0

  let season: string
  if (isNorthernHemisphere) {
    if (month >= 2 && month <= 4) season = 'spring'
    else if (month >= 5 && month <= 7) season = 'summer'
    else if (month >= 8 && month <= 10) season = 'autumn'
    else season = 'winter'
  } else {
    if (month >= 2 && month <= 4) season = 'autumn'
    else if (month >= 5 && month <= 7) season = 'winter'
    else if (month >= 8 && month <= 10) season = 'spring'
    else season = 'summer'
  }

  // Daylight estimation (rough)
  const daylightHours = isNorthernHemisphere
    ? 12 + 4 * Math.sin((month - 2) * Math.PI / 6)
    : 12 - 4 * Math.sin((month - 2) * Math.PI / 6)

  return {
    season,
    estimated_daylight_hours: Math.round(daylightHours),
    hemisphere: isNorthernHemisphere ? 'northern' : 'southern',
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Report ID is required' })
  }

  const supabase = createServerClient()

  if (req.method === 'GET') {
    // Return existing correlations
    try {
      const { data: correlations, error } = await supabase
        .from('external_correlations')
        .select('*')
        .eq('report_id', id)

      if (error) throw error

      return res.status(200).json({
        report_id: id,
        correlations: correlations || [],
      })

    } catch (error) {
      console.error('Get correlations error:', error)
      return res.status(500).json({ error: 'Failed to fetch correlations' })
    }
  }

  if (req.method === 'POST') {
    // Generate and store correlations
    try {
      // Get the report
      const { data: report, error: reportError } = await supabase
        .from('reports')
        .select('*')
        .eq('id', id)
        .single()

      if (reportError || !report) {
        return res.status(404).json({ error: 'Report not found' })
      }

      const reportDate = report.date_of_encounter ? new Date(report.date_of_encounter) : null

      if (!reportDate) {
        return res.status(400).json({ error: 'Report has no date for correlation analysis' })
      }

      const correlations: Correlation[] = []

      // 1. Lunar phase correlation
      const lunar = getLunarPhase(reportDate)
      const lunarScore = lunar.phase === 'full_moon' ? 80 :
                         lunar.phase === 'new_moon' ? 70 :
                         lunar.illumination > 75 ? 60 : 40

      correlations.push({
        type: 'lunar',
        data_source: 'calculated',
        data: {
          phase: lunar.phase,
          illumination_percent: lunar.illumination,
          phase_display: lunar.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        },
        score: lunarScore,
        notes: lunar.phase === 'full_moon'
          ? 'Full moon - historically associated with increased paranormal activity'
          : lunar.phase === 'new_moon'
            ? 'New moon - darkness may contribute to sightings'
            : `Moon ${lunar.illumination}% illuminated`,
      })

      // 2. Solar activity correlation
      const solar = getSolarActivity(reportDate)
      correlations.push({
        type: 'solar',
        data_source: 'calculated',
        data: solar,
        score: solar.activity_level === 'high' ? 70 : solar.activity_level === 'moderate' ? 50 : 30,
        notes: `Solar cycle in ${solar.cycle_phase} phase with ${solar.activity_level} activity`,
      })

      // 3. Temporal patterns
      const temporal = getTemporalPatterns(reportDate, report.time_of_encounter)
      let temporalScore = 30

      if (temporal.is_witching_hour) temporalScore += 30
      if (temporal.time_of_day === 'night') temporalScore += 20
      if (temporal.is_halloween) temporalScore += 20
      if (temporal.is_friday_13th) temporalScore += 15
      if (temporal.is_equinox || temporal.is_solstice) temporalScore += 15

      const significantDates = []
      if (temporal.is_witching_hour) significantDates.push('witching hour (3 AM)')
      if (temporal.is_halloween) significantDates.push('Halloween')
      if (temporal.is_friday_13th) significantDates.push('Friday the 13th')
      if (temporal.is_equinox) significantDates.push('equinox')
      if (temporal.is_solstice) significantDates.push('solstice')

      correlations.push({
        type: 'temporal',
        data_source: 'calculated',
        data: temporal,
        score: Math.min(temporalScore, 100),
        notes: significantDates.length > 0
          ? `Notable timing: ${significantDates.join(', ')}`
          : `${temporal.day_of_week}, ${temporal.time_of_day}`,
      })

      // 4. Seasonal context
      const seasonal = getSeasonalContext(reportDate, report.latitude)
      correlations.push({
        type: 'seasonal',
        data_source: 'calculated',
        data: seasonal,
        score: 50,
        notes: `${seasonal.season.charAt(0).toUpperCase() + seasonal.season.slice(1)} in ${seasonal.hemisphere} hemisphere, ~${seasonal.estimated_daylight_hours} hours of daylight`,
      })

      // 5. Geographic context (if coordinates available)
      if (report.latitude && report.longitude) {
        const geoContext: Record<string, any> = {
          coordinates: { lat: report.latitude, lng: report.longitude },
          estimated_elevation: 'unknown', // Would need elevation API
          nearest_water: 'unknown', // Would need geographic data
        }

        // Check if near significant locations (simplified)
        const significantLocations = [
          { name: 'Area 51', lat: 37.24, lng: -115.81, radius: 50 },
          { name: 'Bermuda Triangle', lat: 25.0, lng: -71.0, radius: 500 },
          { name: 'Skinwalker Ranch', lat: 40.26, lng: -109.89, radius: 20 },
          { name: 'Roswell', lat: 33.39, lng: -104.52, radius: 30 },
        ]

        const nearbySignificant = significantLocations.filter(loc => {
          const distance = calculateDistance(report.latitude, report.longitude, loc.lat, loc.lng)
          return distance <= loc.radius
        })

        if (nearbySignificant.length > 0) {
          geoContext.near_significant_location = nearbySignificant.map(l => l.name)
        }

        correlations.push({
          type: 'geographic',
          data_source: 'calculated',
          data: geoContext,
          score: nearbySignificant.length > 0 ? 80 : 40,
          notes: nearbySignificant.length > 0
            ? `Near significant location(s): ${nearbySignificant.map(l => l.name).join(', ')}`
            : 'Standard geographic location',
        })
      }

      // Store correlations
      for (const corr of correlations) {
        await supabase.from('external_correlations').upsert({
          report_id: id,
          correlation_type: corr.type,
          data_source: corr.data_source,
          correlation_data: corr.data,
          correlation_score: corr.score,
          notes: corr.notes,
          fetched_at: new Date().toISOString(),
        }, {
          onConflict: 'report_id,correlation_type',
        })
      }

      // Calculate overall correlation score
      const avgScore = correlations.reduce((sum, c) => sum + c.score, 0) / correlations.length

      return res.status(200).json({
        report_id: id,
        correlations: correlations.map(c => ({
          type: c.type,
          data: c.data,
          score: c.score,
          notes: c.notes,
        })),
        overall_score: Math.round(avgScore),
        analysis_date: new Date().toISOString(),
      })

    } catch (error) {
      console.error('Generate correlations error:', error)
      return res.status(500).json({ error: 'Failed to generate correlations' })
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({ error: `Method ${req.method} not allowed` })
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
