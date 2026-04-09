/**
 * EnvironmentalContext Component
 *
 * Displays astronomical and environmental conditions at the time of a sighting.
 * Date-aware: adjusts satellite info and analysis notes based on event era.
 */

import React, { useEffect, useState } from 'react'
import {
  Moon, Star, Sun, Clock, CloudSun, Satellite, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react'
import { classNames } from '@/lib/utils'

function formatEventTime(time24: string): string {
  var parts = time24.match(/^(\d{1,2}):(\d{2})/)
  if (!parts) return time24
  var h = parseInt(parts[1], 10)
  var m = parts[2]
  var suffix = h >= 12 ? 'PM' : 'AM'
  var h12 = h % 12
  if (h12 === 0) h12 = 12
  return h12 + ':' + m + ' ' + suffix
}

interface MeteorShower {
  name: string
  isActive: boolean
  daysToPeak: number
  rate: number
  radiant: string
  intensity: 'low' | 'moderate' | 'high' | 'peak'
}

interface SatelliteInfo {
  name: string
  description: string
  appearance: string
}

interface EnvironmentData {
  reportId: string
  eventDate: string | null
  eventTime: string | null
  moonPhase: {
    phase: string
    illumination: number
    emoji: string
    description: string
  }
  meteorShowers: MeteorShower[]
  timeOfDay: {
    period: string
    emoji: string
    visibility: string
  }
  isWitchingHour: boolean
  season: string
  possibleSatellites: SatelliteInfo[]
  analysisNotes: string[]
}

interface Props {
  reportSlug: string
  className?: string
  /** Controlled expand state — when provided, component uses this instead of internal state */
  isExpanded?: boolean
  /** Callback when user toggles expand — required when isExpanded is provided */
  onToggleExpand?: () => void
}

export default function EnvironmentalContext({ reportSlug, className, isExpanded, onToggleExpand }: Props) {
  const [data, setData] = useState<EnvironmentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [internalExpanded, setInternalExpanded] = useState(false)

  // Support both controlled and uncontrolled modes
  const expanded = isExpanded !== undefined ? isExpanded : internalExpanded

  useEffect(() => {
    fetchEnvironmentData()
  }, [reportSlug])

  async function fetchEnvironmentData() {
    try {
      const res = await fetch(`/api/reports/${reportSlug}/environment`)
      if (!res.ok) {
        throw new Error('Failed to fetch environmental data')
      }
      const result = await res.json()
      setData(result)
    } catch (err) {
      console.error('Error fetching environmental data:', err)
      setError('Unable to load environmental context')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={classNames('glass-card p-4', className)}>
        <div className="flex items-center gap-2 mb-3">
          <CloudSun className="w-4 h-4 text-primary-400" />
          <h4 className="text-sm font-medium text-white">Environmental Context</h4>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-white/10 rounded w-3/4" />
          <div className="h-4 bg-white/10 rounded w-1/2" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return null
  }

  // Field context mode: no astronomical data, but terrain/habitat info from source
  if (!(data as any).dataAvailable && (data as any).fieldContextAvailable) {
    const fc = (data as any).fieldContext
    const terrainLabels: Record<string, { emoji: string; label: string }> = {
      'forest': { emoji: '🌲', label: 'Forest' },
      'mountainous': { emoji: '⛰️', label: 'Mountain' },
      'swamp': { emoji: '🌿', label: 'Wetland' },
      'near-water': { emoji: '💧', label: 'Near Water' },
      'remote': { emoji: '🏕️', label: 'Remote' },
      'residential': { emoji: '🏘️', label: 'Residential' },
      'rural': { emoji: '🌾', label: 'Rural' },
    }
    const activityLabels: Record<string, { emoji: string; label: string }> = {
      'camping': { emoji: '⛺', label: 'Camping' },
      'hunting': { emoji: '🎯', label: 'Hunting' },
      'hiking': { emoji: '🥾', label: 'Hiking' },
      'driving': { emoji: '🚗', label: 'Driving' },
      'fishing': { emoji: '🎣', label: 'Fishing' },
    }
    const seasonEmoji: Record<string, string> = {
      'Summer': '☀️', 'Winter': '❄️', 'Spring': '🌱', 'Fall': '🍂', 'Unknown': '🌍'
    }
    const timeEmoji: Record<string, string> = {
      'Night': '🌙', 'Day': '☀️', 'Dusk/Evening': '🌅', 'Dawn/Morning': '🌄', 'Afternoon': '🌤️', 'Unknown': '🕐'
    }

    return (
      <div className={classNames('glass-card overflow-hidden', className)}>
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CloudSun className="w-4 h-4 text-primary-400" />
              <h4 className="text-sm font-medium text-white">Field Conditions</h4>
            </div>
            <button
              onClick={() => { if (onToggleExpand) { onToggleExpand() } else { setInternalExpanded(prev => !prev) } }}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Terrain and conditions at time of encounter</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-px bg-white/5">
          {/* Season */}
          <div className="bg-gray-900/50 p-3 text-center">
            <div className="text-2xl mb-1">{seasonEmoji[fc.season] || '🌍'}</div>
            <div className="text-xs text-white font-medium">{fc.season !== 'Unknown' ? fc.season : 'Season Unknown'}</div>
            <div className="text-xs text-gray-500">{fc.timeOfDay !== 'Unknown' ? fc.timeOfDay : 'Time unknown'}</div>
          </div>

          {/* Primary Terrain */}
          <div className="bg-gray-900/50 p-3 text-center">
            <div className="text-2xl mb-1">{fc.terrainTags.length > 0 ? (terrainLabels[fc.terrainTags[0]]?.emoji || '🌍') : '🌍'}</div>
            <div className="text-xs text-white font-medium">{fc.terrainTags.length > 0 ? (terrainLabels[fc.terrainTags[0]]?.label || fc.terrainTags[0]) : 'Terrain Unknown'}</div>
            <div className="text-xs text-gray-500">{fc.terrainTags.length > 1 ? (terrainLabels[fc.terrainTags[1]]?.label || fc.terrainTags[1]) : 'No secondary terrain'}</div>
          </div>

          {/* Activity */}
          <div className="bg-gray-900/50 p-3 text-center">
            <div className="text-2xl mb-1">{fc.activityTags.length > 0 ? (activityLabels[fc.activityTags[0]]?.emoji || '🏕️') : '👤'}</div>
            <div className="text-xs text-white font-medium">{fc.activityTags.length > 0 ? (activityLabels[fc.activityTags[0]]?.label || fc.activityTags[0]) : 'Activity Unknown'}</div>
            <div className="text-xs text-gray-500">Witness activity</div>
          </div>

          {/* Time of Day */}
          <div className="bg-gray-900/50 p-3 text-center">
            <div className="text-2xl mb-1">{timeEmoji[fc.timeOfDay] || '🕐'}</div>
            <div className="text-xs text-white font-medium">{fc.timeOfDay !== 'Unknown' ? fc.timeOfDay : 'Time Unknown'}</div>
            <div className="text-xs text-gray-500">{(data as any).eventTime ? formatEventTime((data as any).eventTime) : 'Time of encounter'}</div>
          </div>
        </div>

        {/* Expanded: Environment section from source */}
        {expanded && (fc.environment || fc.timeAndConditions) && (
          <div className="p-4 space-y-3 border-t border-white/10">
            {fc.environment && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Moon className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-300">Setting</span>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed pl-6">{fc.environment}</p>
              </div>
            )}
            {fc.timeAndConditions && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-300">Conditions</span>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed pl-6">{fc.timeAndConditions}</p>
              </div>
            )}
            {fc.terrainTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-6">
                {fc.terrainTags.map((tag: string) => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-gray-400">
                    {terrainLabels[tag]?.emoji || ''} {terrainLabels[tag]?.label || tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // No data at all — hide panel
  if (!(data as any).dataAvailable) {
    return null
  }

  // Parse event date WITHOUT timezone shift — "2026-04-01" should stay April 1,
  // not become March 31 due to UTC midnight interpretation in local timezone.
  // Split the ISO date string and construct with explicit year/month/day.
  function parseLocalDate(dateStr: string): Date {
    const parts = dateStr.split('-')
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  }

  const eventDateLocal = data.eventDate ? parseLocalDate(data.eventDate) : null

  // Determine event year for date-aware filtering
  const eventYear = eventDateLocal ? eventDateLocal.getFullYear() : null

  // Filter satellites by era — Starlink didn't exist before 2019, ISS before 1998
  const relevantSatellites = (data.possibleSatellites || []).filter(sat => {
    if (!eventYear) return true
    if (sat.name === 'Starlink' && eventYear < 2019) return false
    if (sat.name === 'ISS' && eventYear < 1998) return false
    if (sat.name === 'Iridium Flares' && eventYear < 1997) return false
    return true
  })

  // Filter analysis notes — remove satellite note if pre-satellite era
  const relevantNotes = (data.analysisNotes || []).filter(note => {
    if (eventYear && eventYear < 1957 && note.toLowerCase().includes('satellite')) return false
    return true
  })

  // Add era-specific note for historical cases
  if (eventYear && eventYear < 1957) {
    relevantNotes.push('Pre-satellite era — no artificial satellites were in orbit at this time')
  }

  const getIntensityColor = (intensity: string) => {
    switch (intensity) {
      case 'peak': return 'text-yellow-400'
      case 'high': return 'text-orange-400'
      case 'moderate': return 'text-blue-400'
      default: return 'text-gray-400'
    }
  }

  // Handle unknown time gracefully
  const timeIsUnknown = data.timeOfDay.period === 'Unknown'

  return (
    <div className={classNames('glass-card overflow-hidden', className)}>
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudSun className="w-4 h-4 text-primary-400" />
            <h4 className="text-sm font-medium text-white">Environmental Context</h4>
          </div>
          <button
            onClick={() => { if (onToggleExpand) { onToggleExpand() } else { setInternalExpanded(prev => !prev) } }}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {eventDateLocal
            ? `Astronomical conditions on ${eventDateLocal.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
            : 'Astronomical conditions at time of sighting'
          }
        </p>
      </div>

      {/* Quick Stats — always 2 cols for stability */}
      <div className="grid grid-cols-2 gap-px bg-white/5">
        {/* Moon Phase */}
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-2xl mb-1">{data.moonPhase.emoji}</div>
          <div className="text-xs text-white font-medium truncate">{data.moonPhase.phase}</div>
          <div className="text-xs text-gray-500">{data.moonPhase.illumination}% lit</div>
        </div>

        {/* Season */}
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-2xl mb-1">
            {data.season === 'Summer' ? '☀️' : data.season === 'Winter' ? '❄️' : data.season === 'Spring' ? '🌱' : '🍂'}
          </div>
          <div className="text-xs text-white font-medium">{data.season}</div>
          <div className="text-xs text-gray-500">
            {timeIsUnknown ? 'Time not recorded' : data.timeOfDay.period}
          </div>
        </div>

        {/* Meteor Showers */}
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-2xl mb-1">
            {data.meteorShowers.length > 0 ? '☄️' : '✨'}
          </div>
          <div className="text-xs text-white font-medium truncate">
            {data.meteorShowers.length > 0
              ? data.meteorShowers[0].name
              : 'No Showers'
            }
          </div>
          <div className="text-xs text-gray-500 truncate">
            {data.meteorShowers.length > 0
              ? `${data.meteorShowers[0].intensity} activity`
              : 'Clear period'
            }
          </div>
        </div>

        {/* Sky Conditions / Satellite Era */}
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-2xl mb-1">
            {eventYear && eventYear < 1957 ? '🌌' : timeIsUnknown ? '🌙' : data.timeOfDay.emoji}
          </div>
          <div className="text-xs text-white font-medium truncate">
            {eventYear && eventYear < 1957
              ? 'Pre-Satellite Era'
              : relevantSatellites.length > 0
                ? `${relevantSatellites.length} Sat. Types`
                : 'Clear Skies'
            }
          </div>
          <div className="text-xs text-gray-500 truncate">
            {eventYear && eventYear < 1957
              ? 'No artificial objects'
              : data.isWitchingHour ? 'Witching hour' : (timeIsUnknown ? 'Visibility unknown' : data.timeOfDay.visibility.split(' - ')[0])
            }
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="p-4 space-y-4 border-t border-white/10">
          {/* Moon Details */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Moon className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-white font-medium">Lunar Conditions</span>
            </div>
            <p className="text-sm text-gray-400 pl-6">{data.moonPhase.description}</p>
          </div>

          {/* Meteor Showers */}
          {data.meteorShowers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-white font-medium">Active Meteor Showers</span>
              </div>
              <div className="space-y-2 pl-6">
                {data.meteorShowers.map((shower) => (
                  <div key={shower.name} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{shower.name}</span>
                    <div className="flex items-center gap-3">
                      <span className={classNames('text-xs', getIntensityColor(shower.intensity))}>
                        {shower.intensity.charAt(0).toUpperCase() + shower.intensity.slice(1)}
                      </span>
                      <span className="text-xs text-gray-500">~{shower.rate}/hr</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visibility Conditions */}
          {!timeIsUnknown && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sun className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-white font-medium">Visibility</span>
              </div>
              <p className="text-sm text-gray-400 pl-6">{data.timeOfDay.visibility}</p>
            </div>
          )}

          {/* Satellite Information — only show if relevant to era */}
          {relevantSatellites.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Satellite className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-white font-medium">Possible Satellite Activity</span>
              </div>
              <div className="space-y-2 pl-6">
                {relevantSatellites.slice(0, 2).map((sat) => (
                  <div key={sat.name} className="text-sm">
                    <span className="text-gray-300 font-medium">{sat.name}:</span>
                    <span className="text-gray-500 ml-1">{sat.appearance}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analysis Notes */}
          {relevantNotes.length > 0 && (
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-amber-400 font-medium">Analysis Notes</span>
              </div>
              <ul className="space-y-1 pl-6">
                {relevantNotes.map((note, i) => (
                  <li key={i} className="text-sm text-gray-400">{'\u2022'} {note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Expand prompt */}
      {!expanded && relevantNotes.length > 0 && (
        <div className="px-4 pb-3 pt-1">
          <button
            onClick={() => { if (onToggleExpand) { onToggleExpand() } else { setInternalExpanded(true) } }}
            className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            {relevantNotes.length} analysis note{relevantNotes.length !== 1 ? 's' : ''} available
          </button>
        </div>
      )}
    </div>
  )
}
