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

  // Determine event year for date-aware filtering
  const eventYear = data.eventDate ? new Date(data.eventDate).getFullYear() : null

  // Filter satellites by era — Starlink didn't exist before 2019, ISS before 1998
  const relevantSatellites = data.possibleSatellites.filter(sat => {
    if (!eventYear) return true
    if (sat.name === 'Starlink' && eventYear < 2019) return false
    if (sat.name === 'ISS' && eventYear < 1998) return false
    if (sat.name === 'Iridium Flares' && eventYear < 1997) return false
    return true
  })

  // Filter analysis notes — remove satellite note if pre-satellite era
  const relevantNotes = data.analysisNotes.filter(note => {
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
          {data.eventDate
            ? `Astronomical conditions on ${new Date(data.eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
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
