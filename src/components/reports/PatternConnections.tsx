/**
 * PatternConnections Component
 *
 * Displays patterns that contain this report
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, TrendingUp, MapPin, Clock, ChevronRight } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface Pattern {
  id: string
  pattern_type: string
  status: string
  ai_title: string | null
  ai_summary: string | null
  confidence_score: number
  significance_score: number
  report_count: number
  relevance_score: number
}

interface Props {
  reportSlug: string
  className?: string
}

const PATTERN_ICONS: Record<string, React.ReactNode> = {
  geographic_cluster: <MapPin className="w-4 h-4" />,
  temporal_anomaly: <Clock className="w-4 h-4" />,
  flap_wave: <TrendingUp className="w-4 h-4" />,
  default: <Activity className="w-4 h-4" />
}

const PATTERN_LABELS: Record<string, string> = {
  geographic_cluster: 'Geographic Cluster',
  temporal_anomaly: 'Temporal Spike',
  flap_wave: 'Activity Wave',
  characteristic_correlation: 'Correlation',
  regional_concentration: 'Regional Hotspot',
  seasonal_pattern: 'Seasonal Pattern',
  time_of_day_pattern: 'Time Pattern',
  date_correlation: 'Date Pattern'
}

export default function PatternConnections({ reportSlug, className }: Props) {
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPatterns()
  }, [reportSlug])

  async function fetchPatterns() {
    try {
      const res = await fetch(`/api/reports/${reportSlug}/patterns`)
      if (!res.ok) {
        throw new Error('Failed to fetch patterns')
      }
      const data = await res.json()
      setPatterns(data.patterns || [])
    } catch (err) {
      setError('Failed to load patterns')
      console.error('Error fetching patterns:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={classNames('glass-card p-4', className)}>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-primary-400" />
          <h4 className="text-sm font-medium text-white">Pattern Connections</h4>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-16 bg-white/5 rounded-lg" />
          <div className="h-16 bg-white/5 rounded-lg" />
        </div>
      </div>
    )
  }

  if (error || patterns.length === 0) {
    return null // Don't show section if no patterns
  }

  return (
    <div className={classNames('glass-card p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary-400" />
          <h4 className="text-sm font-medium text-white">Pattern Connections</h4>
        </div>
        <span className="text-xs text-gray-500">
          {patterns.length} active pattern{patterns.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {patterns.slice(0, 3).map((pattern) => (
          <Link
            key={pattern.id}
            href={`/insights/patterns/${pattern.id}`}
            className="block bg-white/5 hover:bg-white/10 rounded-lg p-3 transition-colors group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-primary-400 mt-0.5">
                  {PATTERN_ICONS[pattern.pattern_type] || PATTERN_ICONS.default}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">
                    {pattern.ai_title || PATTERN_LABELS[pattern.pattern_type] || 'Pattern'}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span>{pattern.report_count} reports</span>
                    <span>•</span>
                    <span className={classNames(
                      pattern.status === 'emerging' ? 'text-amber-400' :
                        pattern.status === 'active' ? 'text-green-400' : 'text-gray-400'
                    )}>
                      {pattern.status}
                    </span>
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors flex-shrink-0 mt-1" />
            </div>

            {/* Relevance indicator */}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full"
                  style={{ width: `${pattern.relevance_score * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">
                {Math.round(pattern.relevance_score * 100)}% match
              </span>
            </div>
          </Link>
        ))}
      </div>

      {patterns.length > 3 && (
        <Link
          href="/insights"
          className="block text-center text-sm text-primary-400 hover:text-primary-300 mt-3"
        >
          View all patterns →
        </Link>
      )}
    </div>
  )
}
