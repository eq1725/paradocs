/**
 * Emerging Patterns Alert
 *
 * Shows AI-detected patterns that are emerging or active,
 * alerting users to unusual activity clusters or trends.
 */

import React from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  TrendingUp,
  MapPin,
  Calendar,
  ChevronRight,
  Radar,
  Flame,
  Clock
} from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import type { PhenomenonCategory } from '@/lib/database.types'

interface Pattern {
  id: string
  pattern_type: string
  ai_title?: string
  ai_summary?: string
  report_count: number
  confidence_score: number
  significance_score: number
  categories: string[]
  first_detected_at: string
  last_updated_at: string
  status: 'active' | 'emerging'
}

interface EmergingPatternsAlertProps {
  patterns: Pattern[]
}

const PATTERN_TYPE_CONFIG: Record<string, { icon: typeof AlertTriangle; label: string; color: string }> = {
  geographic_cluster: { icon: MapPin, label: 'Geographic Cluster', color: '#22c55e' },
  temporal_anomaly: { icon: Clock, label: 'Temporal Spike', color: '#f59e0b' },
  flap_wave: { icon: Flame, label: 'Activity Wave', color: '#ef4444' },
  seasonal_pattern: { icon: Calendar, label: 'Seasonal Pattern', color: '#3b82f6' },
  regional_concentration: { icon: Radar, label: 'Regional Focus', color: '#a855f7' },
  characteristic_correlation: { icon: TrendingUp, label: 'Correlation', color: '#14b8a6' },
}

export default function EmergingPatternsAlert({ patterns }: EmergingPatternsAlertProps) {
  if (!patterns || patterns.length === 0) {
    return null
  }

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return `${Math.floor(diffDays / 7)}w ago`
  }

  return (
    <div className="glass-card overflow-hidden border border-amber-500/20">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-amber-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              Emerging Patterns
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-normal animate-pulse">
                {patterns.length} DETECTED
              </span>
            </h2>
            <p className="text-sm text-gray-400">AI-detected anomalies and clusters</p>
          </div>
        </div>
      </div>

      {/* Pattern Cards */}
      <div className="p-4 space-y-3">
        {patterns.map((pattern) => {
          const typeConfig = PATTERN_TYPE_CONFIG[pattern.pattern_type] || {
            icon: TrendingUp,
            label: pattern.pattern_type,
            color: '#6b7280'
          }
          const TypeIcon = typeConfig.icon
          const isEmerging = pattern.status === 'emerging'

          return (
            <div
              key={pattern.id}
              className={`p-4 rounded-lg border transition-all hover:scale-[1.01] ${
                isEmerging
                  ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${typeConfig.color}20` }}
                >
                  <TypeIcon className="w-5 h-5" style={{ color: typeConfig.color }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: `${typeConfig.color}20`,
                        color: typeConfig.color
                      }}
                    >
                      {typeConfig.label}
                    </span>
                    {isEmerging && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1">
                        <Flame className="w-3 h-3" />
                        Emerging
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-medium text-white mb-1">
                    {pattern.ai_title || `${pattern.report_count} reports in cluster`}
                  </h3>

                  {pattern.ai_summary && (
                    <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                      {pattern.ai_summary}
                    </p>
                  )}

                  {/* Categories */}
                  {pattern.categories && pattern.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {pattern.categories.slice(0, 3).map((cat) => {
                        const config = CATEGORY_CONFIG[cat as PhenomenonCategory]
                        return (
                          <span
                            key={cat}
                            className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-300"
                          >
                            {config?.icon} {config?.label || cat}
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <span className="font-medium text-white">{pattern.report_count}</span> reports
                    </span>
                    <span className="flex items-center gap-1">
                      {Math.round(pattern.confidence_score * 100)}% confidence
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {getTimeAgo(pattern.first_detected_at)}
                    </span>
                  </div>

                  {/* Significance bar */}
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">Significance</span>
                      <span className="text-white font-medium">
                        {Math.round(pattern.significance_score * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pattern.significance_score * 100}%`,
                          backgroundColor: typeConfig.color
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 bg-white/[0.02]">
        <Link
          href="/insights"
          className="flex items-center justify-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
        >
          View all patterns & insights
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
