/**
 * Astronomical Service
 *
 * Provides environmental and astronomical context for paranormal reports
 * including moon phases, meteor showers, and astronomical events
 */

// Moon phase calculation
export function getMoonPhase(date: Date): {
  phase: string
  illumination: number
  emoji: string
  description: string
} {
  // Calculate moon phase using a simplified algorithm
  // Based on the synodic month (29.53059 days)
  const LUNAR_MONTH = 29.53059

  // Known new moon date (Jan 6, 2000)
  const knownNewMoon = new Date(2000, 0, 6, 18, 14, 0)
  const daysSinceNewMoon = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24)
  const currentAge = ((daysSinceNewMoon % LUNAR_MONTH) + LUNAR_MONTH) % LUNAR_MONTH

  // Calculate illumination (0-100%)
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * currentAge / LUNAR_MONTH)) / 2 * 100)

  // Determine phase name
  let phase: string
  let emoji: string
  let description: string

  if (currentAge < 1.85) {
    phase = 'New Moon'
    emoji = '🌑'
    description = 'Moon not visible - darkest skies, ideal for stargazing'
  } else if (currentAge < 7.38) {
    phase = 'Waxing Crescent'
    emoji = '🌒'
    description = 'Moon visible in evening sky after sunset'
  } else if (currentAge < 9.23) {
    phase = 'First Quarter'
    emoji = '🌓'
    description = 'Half moon visible in evening'
  } else if (currentAge < 14.77) {
    phase = 'Waxing Gibbous'
    emoji = '🌔'
    description = 'Moon becoming fuller, bright evenings'
  } else if (currentAge < 16.61) {
    phase = 'Full Moon'
    emoji = '🌕'
    description = 'Full illumination - brightest nights'
  } else if (currentAge < 22.15) {
    phase = 'Waning Gibbous'
    emoji = '🌖'
    description = 'Moon rising later, still bright'
  } else if (currentAge < 24.00) {
    phase = 'Last Quarter'
    emoji = '🌗'
    description = 'Half moon visible in morning sky'
  } else {
    phase = 'Waning Crescent'
    emoji = '🌘'
    description = 'Moon visible before dawn'
  }

  return { phase, illumination, emoji, description }
}

// Meteor shower data
const METEOR_SHOWERS = [
  { name: 'Quadrantids', peak: { month: 0, day: 3 }, duration: 4, rate: 120, radiant: 'Boötes' },
  { name: 'Lyrids', peak: { month: 3, day: 22 }, duration: 3, rate: 18, radiant: 'Lyra' },
  { name: 'Eta Aquariids', peak: { month: 4, day: 6 }, duration: 10, rate: 50, radiant: 'Aquarius' },
  { name: 'Delta Aquariids', peak: { month: 6, day: 30 }, duration: 20, rate: 20, radiant: 'Aquarius' },
  { name: 'Perseids', peak: { month: 7, day: 12 }, duration: 14, rate: 100, radiant: 'Perseus' },
  { name: 'Draconids', peak: { month: 9, day: 8 }, duration: 2, rate: 10, radiant: 'Draco' },
  { name: 'Orionids', peak: { month: 9, day: 21 }, duration: 7, rate: 20, radiant: 'Orion' },
  { name: 'Taurids', peak: { month: 10, day: 5 }, duration: 45, rate: 5, radiant: 'Taurus' },
  { name: 'Leonids', peak: { month: 10, day: 17 }, duration: 4, rate: 15, radiant: 'Leo' },
  { name: 'Geminids', peak: { month: 11, day: 14 }, duration: 6, rate: 150, radiant: 'Gemini' },
  { name: 'Ursids', peak: { month: 11, day: 22 }, duration: 3, rate: 10, radiant: 'Ursa Minor' },
]

export function getActiveMeteorShowers(date: Date): Array<{
  name: string
  isActive: boolean
  daysToPeak: number
  rate: number
  radiant: string
  intensity: 'low' | 'moderate' | 'high' | 'peak'
}> {
  const results: Array<{
    name: string
    isActive: boolean
    daysToPeak: number
    rate: number
    radiant: string
    intensity: 'low' | 'moderate' | 'high' | 'peak'
  }> = []

  const dateMonth = date.getMonth()
  const dateDay = date.getDate()

  for (const shower of METEOR_SHOWERS) {
    // Create peak date for the same year
    const peakDate = new Date(date.getFullYear(), shower.peak.month, shower.peak.day)

    // Calculate days from peak (can be negative if before peak)
    const diffTime = date.getTime() - peakDate.getTime()
    const daysToPeak = Math.round(diffTime / (1000 * 60 * 60 * 24))

    // Check if within active window (half duration before and after peak)
    const halfDuration = shower.duration / 2
    const isActive = Math.abs(daysToPeak) <= halfDuration

    if (isActive) {
      // Calculate intensity based on proximity to peak
      let intensity: 'low' | 'moderate' | 'high' | 'peak'
      const absDistance = Math.abs(daysToPeak)

      if (absDistance <= 1) {
        intensity = 'peak'
      } else if (absDistance <= halfDuration * 0.3) {
        intensity = 'high'
      } else if (absDistance <= halfDuration * 0.6) {
        intensity = 'moderate'
      } else {
        intensity = 'low'
      }

      results.push({
        name: shower.name,
        isActive: true,
        daysToPeak,
        rate: shower.rate,
        radiant: shower.radiant,
        intensity
      })
    }
  }

  return results
}

// Check if date falls during "witching hour" (traditionally 3-4 AM)
export function isWitchingHour(time: string | null): boolean {
  if (!time) return false

  const match = time.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i)
  if (!match) return false

  let hour = parseInt(match[1])
  const ampm = match[3]?.toLowerCase()

  if (ampm === 'pm' && hour !== 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0

  return hour >= 3 && hour < 4
}

// Determine time of day category
export function getTimeOfDay(time: string | null): {
  period: string
  emoji: string
  visibility: string
} {
  if (!time) {
    return { period: 'Unknown', emoji: '❓', visibility: 'Unknown visibility conditions' }
  }

  const match = time.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i)
  if (!match) {
    return { period: 'Unknown', emoji: '❓', visibility: 'Unknown visibility conditions' }
  }

  let hour = parseInt(match[1])
  const ampm = match[3]?.toLowerCase()

  if (ampm === 'pm' && hour !== 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0

  if (hour >= 5 && hour < 7) {
    return { period: 'Dawn', emoji: '🌅', visibility: 'Transitional lighting - stars fading' }
  } else if (hour >= 7 && hour < 12) {
    return { period: 'Morning', emoji: '☀️', visibility: 'Full daylight - good visibility' }
  } else if (hour >= 12 && hour < 17) {
    return { period: 'Afternoon', emoji: '🌤️', visibility: 'Full daylight - good visibility' }
  } else if (hour >= 17 && hour < 20) {
    return { period: 'Evening', emoji: '🌆', visibility: 'Transitional lighting - dusk' }
  } else if (hour >= 20 && hour < 23) {
    return { period: 'Night', emoji: '🌙', visibility: 'Darkness - stars visible' }
  } else {
    return { period: 'Late Night', emoji: '🌌', visibility: 'Full darkness - optimal stargazing' }
  }
}

// Get season for the date and hemisphere
export function getSeason(date: Date, latitude: number): string {
  const month = date.getMonth()
  const isNorthern = latitude >= 0

  if (month >= 2 && month <= 4) {
    return isNorthern ? 'Spring' : 'Autumn'
  } else if (month >= 5 && month <= 7) {
    return isNorthern ? 'Summer' : 'Winter'
  } else if (month >= 8 && month <= 10) {
    return isNorthern ? 'Autumn' : 'Spring'
  } else {
    return isNorthern ? 'Winter' : 'Summer'
  }
}

// Known satellite constellations that could be mistaken for UFOs
export function getSatelliteInfo(): Array<{
  name: string
  description: string
  appearance: string
}> {
  return [
    {
      name: 'Starlink',
      description: 'SpaceX satellite internet constellation',
      appearance: 'Train of bright lights moving in a line, especially visible shortly after launch'
    },
    {
      name: 'ISS',
      description: 'International Space Station',
      appearance: 'Very bright steady light moving across sky, visible for several minutes'
    },
    {
      name: 'Iridium Flares',
      description: 'Communication satellites with reflective antennas',
      appearance: 'Brief bright flash lasting a few seconds'
    }
  ]
}

// Compile full environmental context
export interface EnvironmentalContext {
  moonPhase: {
    phase: string
    illumination: number
    emoji: string
    description: string
  }
  meteorShowers: Array<{
    name: string
    isActive: boolean
    daysToPeak: number
    rate: number
    radiant: string
    intensity: 'low' | 'moderate' | 'high' | 'peak'
  }>
  timeOfDay: {
    period: string
    emoji: string
    visibility: string
  }
  isWitchingHour: boolean
  season: string
  possibleSatellites: Array<{
    name: string
    description: string
    appearance: string
  }>
  analysisNotes: string[]
}

export function getEnvironmentalContext(
  eventDate: string | null,
  eventTime: string | null,
  latitude: number
): EnvironmentalContext {
  const date = eventDate ? new Date(eventDate) : new Date()

  const moonPhase = getMoonPhase(date)
  const meteorShowers = getActiveMeteorShowers(date)
  const timeOfDay = getTimeOfDay(eventTime)
  const witchingHour = isWitchingHour(eventTime)
  const season = getSeason(date, latitude)
  const satellites = getSatelliteInfo()

  // Generate analysis notes based on conditions
  const analysisNotes: string[] = []

  // Moon phase notes
  if (moonPhase.illumination < 25) {
    analysisNotes.push('Dark sky conditions (low moon illumination) would make aerial objects more visible')
  } else if (moonPhase.illumination > 75) {
    analysisNotes.push('Bright moon conditions could affect night sky visibility')
  }

  // Meteor shower notes
  if (meteorShowers.length > 0) {
    const peakShowers = meteorShowers.filter(s => s.intensity === 'peak' || s.intensity === 'high')
    if (peakShowers.length > 0) {
      analysisNotes.push(`Active meteor shower(s): ${peakShowers.map(s => s.name).join(', ')} - could explain brief light phenomena`)
    }
  }

  // Time of day notes
  if (timeOfDay.period === 'Dawn' || timeOfDay.period === 'Evening') {
    analysisNotes.push('Transitional lighting conditions can create unusual visual effects and reflections')
  }

  // Satellite visibility notes
  if (timeOfDay.period === 'Night' || timeOfDay.period === 'Late Night' ||
      timeOfDay.period === 'Dawn' || timeOfDay.period === 'Evening') {
    analysisNotes.push('Time window when satellites (Starlink, ISS) would be visible as moving lights')
  }

  return {
    moonPhase,
    meteorShowers,
    timeOfDay,
    isWitchingHour: witchingHour,
    season,
    possibleSatellites: satellites,
    analysisNotes
  }
}
