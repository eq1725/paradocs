/**
 * EnvironmentalContext Component
 *
 * Displays astronomical and environmental conditions at the time of a sighting
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
}

export default function EnvironmentalContext({ reportSlug, className }: Props) {
  const [data, setData] = useState<EnvironmentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

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

  const getIntensityColor = (intensity: string) => {
    switch (intensity) {
      case 'peak': return 'text-yellow-400'
      case 'high': return 'text-orange-400'
      case 'moderate': return 'text-blue-400'
      default: return 'text-gray-400'
    }
  }

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
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Astronomical conditions at time of sighting
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5">
        {/* Moon Phase */}
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-2xl mb-1">{data.moonPhase.emoji}</div>
          <div className="text-xs text-white font-medium">{data.moonPhase.phase}</div>
          <div className="text-xs text-gray-500">{data.moonPhase.illumination}% lit</div>
        </div>

        {/* Time of Day */}
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-2xl mb-1">{data.timeOfDay.emoji}</div>
          <div className="text-xs text-white font-medium">{data.timeOfDay.period}</div>
          <div className="text-xs text-gray-500">{data.season}</div>
        </div>

        {/* Meteor Showers */}
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-2xl mb-1">☄️</div>
          <div className="text-xs text-white font-medium">
            {data.meteorShowers.length > 0 ? 'Showers Active' : 'No Showers'}
          </div>
          <div className="text-xs text-gray-500">
            {data.meteorShowers.length > 0
              ? data.meteorShowers.map(s => s.name).join(', ')
              : 'Clear period'
            }
          </div>
        </div>

        {/* Witching Hour */}
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-2xl mb-1">{data.isWitchingHour ? '👻' : '⏰'}</div>
          <div className="text-xs text-white font-medium">
            {data.isWitchingHour ? 'Witching Hour' : 'Standard Time'}
          </div>
          <div className="text-xs text-gray-500">
            {data.eventTime || 'Time unknown'}
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
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sun className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-white font-medium">Visibility</span>
            </div>
            <p className="text-sm text-gray-400 pl-6">{data.timeOfDay.visibility}</p>
          </div>

          {/* Satellite Information */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Satellite className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-white font-medium">Possible Satellite Activity</span>
            </div>
            <div className="space-y-2 pl-6">
              {data.possibleSatellites.slice(0, 2).map((sat) => (
                <div key={sat.name} className="text-sm">
                  <span className="text-gray-300 font-medium">{sat.name}:</span>
                  <span className="text-gray-500 ml-1">{sat.appearance}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Analysis Notes */}
          {data.analysisNotes.length > 0 && (
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-amber-400 font-medium">Analysis Notes</span>
              </div>
              <ul className="space-y-1 pl-6">
                {data.analysisNotes.map((note, i) => (
                  <li key={i} className="text-sm text-gray-400">• {note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Expand prompt */}
      {!expanded && data.analysisNotes.length > 0 && (
        <div className="px-4 pb-3 pt-1">
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            {data.analysisNotes.length} analysis note{data.analysisNotes.length !== 1 ? 's' : ''} available
          </button>
        </div>
      )}
    </div>
  )
}
