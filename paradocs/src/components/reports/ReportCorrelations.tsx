import React, { useState, useEffect } from 'react'
import { Loader2, Moon, Sun, Calendar, MapPin, Clock, Compass, Thermometer } from 'lucide-react'

interface LunarData {
  phase: string
  illumination: number
  phase_angle: number
}

interface SolarData {
  activity_level: string
  cycle_position: number
}

interface TemporalPattern {
  is_witching_hour: boolean
  is_weekend: boolean
  is_equinox_period: boolean
  is_solstice_period: boolean
  is_halloween_period: boolean
  is_friday_13th: boolean
}

interface SeasonalData {
  season: string
  daylight_hours: number
}

interface GeographicContext {
  near_area_51: boolean
  near_bermuda_triangle: boolean
  near_skinwalker_ranch: boolean
  near_point_pleasant: boolean
  nearest_notable_location: string | null
  distance_km: number | null
}

interface CorrelationData {
  lunar: LunarData
  solar: SolarData
  temporal_patterns: TemporalPattern
  seasonal: SeasonalData
  geographic_context: GeographicContext
  event_date: string
}

interface ReportCorrelationsProps {
  reportId: string
}

export default function ReportCorrelations({ reportId }: ReportCorrelationsProps) {
  const [data, setData] = useState<CorrelationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetchCorrelations()
  }, [reportId])

  async function fetchCorrelations() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/reports/${reportId}/correlations`)
      if (response.ok) {
        const result = await response.json()
        setData(result.correlations)
      } else {
        setError('Failed to load correlations')
      }
    } catch (err) {
      console.error('Error fetching correlations:', err)
      setError('Failed to load correlations')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
          <Compass className="w-5 h-5 text-purple-400" />
          Environmental Correlations
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return null
  }

  const getMoonPhaseEmoji = (phase: string): string => {
    const phases: Record<string, string> = {
      'new_moon': '🌑',
      'waxing_crescent': '🌒',
      'first_quarter': '🌓',
      'waxing_gibbous': '🌔',
      'full_moon': '🌕',
      'waning_gibbous': '🌖',
      'last_quarter': '🌗',
      'waning_crescent': '🌘'
    }
    return phases[phase] || '🌙'
  }

  const formatPhaseName = (phase: string): string => {
    return phase.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  const hasNotablePatterns = data.temporal_patterns.is_witching_hour ||
    data.temporal_patterns.is_equinox_period ||
    data.temporal_patterns.is_solstice_period ||
    data.temporal_patterns.is_halloween_period ||
    data.temporal_patterns.is_friday_13th

  const hasNotableLocation = data.geographic_context.near_area_51 ||
    data.geographic_context.near_bermuda_triangle ||
    data.geographic_context.near_skinwalker_ranch ||
    data.geographic_context.near_point_pleasant

  return (
    <div className="glass-card p-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="text-lg font-display font-semibold text-white flex items-center gap-2">
          <Compass className="w-5 h-5 text-purple-400" />
          Environmental Correlations
        </h3>
        <span className="text-xs text-gray-400">
          {expanded ? 'Hide' : 'Show'} details
        </span>
      </button>

      {/* Quick summary - always visible */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {/* Lunar */}
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <div className="text-2xl mb-1">{getMoonPhaseEmoji(data.lunar.phase)}</div>
          <div className="text-xs text-gray-400">Moon Phase</div>
          <div className="text-sm text-white font-medium">
            {formatPhaseName(data.lunar.phase)}
          </div>
        </div>

        {/* Solar */}
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <Sun className={`w-6 h-6 mx-auto mb-1 ${
            data.solar.activity_level === 'high' ? 'text-orange-400' :
            data.solar.activity_level === 'moderate' ? 'text-yellow-400' :
            'text-blue-400'
          }`} />
          <div className="text-xs text-gray-400">Solar Activity</div>
          <div className="text-sm text-white font-medium capitalize">
            {data.solar.activity_level}
          </div>
        </div>

        {/* Season */}
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <Thermometer className="w-6 h-6 mx-auto mb-1 text-cyan-400" />
          <div className="text-xs text-gray-400">Season</div>
          <div className="text-sm text-white font-medium capitalize">
            {data.seasonal.season}
          </div>
        </div>

        {/* Notable */}
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <Calendar className={`w-6 h-6 mx-auto mb-1 ${hasNotablePatterns ? 'text-amber-400' : 'text-gray-500'}`} />
          <div className="text-xs text-gray-400">Notable Date</div>
          <div className="text-sm text-white font-medium">
            {hasNotablePatterns ? 'Yes' : 'Standard'}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-6 space-y-6">
          {/* Lunar Details */}
          <div>
            <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <Moon className="w-4 h-4 text-blue-400" />
              Lunar Conditions
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">Illumination</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-gray-800">
                    <div
                      className="h-full rounded-full bg-blue-400"
                      style={{ width: `${data.lunar.illumination}%` }}
                    />
                  </div>
                  <span className="text-sm text-white">{Math.round(data.lunar.illumination)}%</span>
                </div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">Phase Angle</div>
                <div className="text-lg font-medium text-white">
                  {Math.round(data.lunar.phase_angle)}°
                </div>
              </div>
            </div>
          </div>

          {/* Temporal Patterns */}
          {hasNotablePatterns && (
            <div>
              <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Notable Temporal Patterns
              </h4>
              <div className="flex flex-wrap gap-2">
                {data.temporal_patterns.is_witching_hour && (
                  <span className="px-3 py-1 rounded-full text-xs bg-purple-500/20 text-purple-400">
                    🕐 Witching Hour (3-4 AM)
                  </span>
                )}
                {data.temporal_patterns.is_equinox_period && (
                  <span className="px-3 py-1 rounded-full text-xs bg-green-500/20 text-green-400">
                    🌿 Equinox Period
                  </span>
                )}
                {data.temporal_patterns.is_solstice_period && (
                  <span className="px-3 py-1 rounded-full text-xs bg-yellow-500/20 text-yellow-400">
                    ☀️ Solstice Period
                  </span>
                )}
                {data.temporal_patterns.is_halloween_period && (
                  <span className="px-3 py-1 rounded-full text-xs bg-orange-500/20 text-orange-400">
                    🎃 Halloween Period
                  </span>
                )}
                {data.temporal_patterns.is_friday_13th && (
                  <span className="px-3 py-1 rounded-full text-xs bg-red-500/20 text-red-400">
                    💀 Friday the 13th
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Geographic Context */}
          {hasNotableLocation && (
            <div>
              <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-400" />
                Notable Proximity
              </h4>
              <div className="flex flex-wrap gap-2">
                {data.geographic_context.near_area_51 && (
                  <span className="px-3 py-1 rounded-full text-xs bg-red-500/20 text-red-400">
                    🛸 Near Area 51
                  </span>
                )}
                {data.geographic_context.near_bermuda_triangle && (
                  <span className="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400">
                    🌊 Bermuda Triangle
                  </span>
                )}
                {data.geographic_context.near_skinwalker_ranch && (
                  <span className="px-3 py-1 rounded-full text-xs bg-purple-500/20 text-purple-400">
                    👽 Near Skinwalker Ranch
                  </span>
                )}
                {data.geographic_context.near_point_pleasant && (
                  <span className="px-3 py-1 rounded-full text-xs bg-gray-500/20 text-gray-400">
                    🦇 Near Point Pleasant
                  </span>
                )}
              </div>
              {data.geographic_context.nearest_notable_location && (
                <p className="text-xs text-gray-400 mt-2">
                  Nearest notable location: {data.geographic_context.nearest_notable_location}
                  {data.geographic_context.distance_km && ` (${Math.round(data.geographic_context.distance_km)} km)`}
                </p>
              )}
            </div>
          )}

          {/* Seasonal Details */}
          <div>
            <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-cyan-400" />
              Seasonal Context
            </h4>
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Estimated Daylight</span>
                <span className="text-sm text-white">
                  ~{Math.round(data.seasonal.daylight_hours)} hours
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
