/**
 * Phenomenon Pulse - Live Activity Monitor
 *
 * A real-time visualization showing:
 * - Live activity feed with animated entries
 * - Activity pulse visualization
 * - Trending categories
 * - Recent activity summary
 */

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Activity,
  TrendingUp,
  Clock,
  Zap,
  Eye,
  MapPin,
  ChevronRight,
  Sparkles
} from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import type { PhenomenonCategory } from '@/lib/database.types'

// Hex colors for use in inline styles
const CATEGORY_COLORS: Record<PhenomenonCategory, string> = {
  ufos_aliens: '#22c55e',
  cryptids: '#f59e0b',
  ghosts_hauntings: '#a855f7',
  psychic_phenomena: '#3b82f6',
  consciousness_practices: '#6366f1',
  psychological_experiences: '#ec4899',
  biological_factors: '#10b981',
  perception_sensory: '#06b6d4',
  religion_mythology: '#eab308',
  esoteric_practices: '#8b5cf6',
  combination: '#6b7280',
}

interface RecentReport {
  id: string
  title: string
  slug: string
  category: PhenomenonCategory
  location_name?: string
  country?: string
  created_at: string
  view_count: number
}

interface PhenomenonPulseProps {
  recentActivity: RecentReport[]
  last24hReports: number
  last7dReports: number
  categoryBreakdown: { category: string; count: number }[]
}

export default function PhenomenonPulse({
  recentActivity,
  last24hReports,
  last7dReports,
  categoryBreakdown,
}: PhenomenonPulseProps) {
  const [visibleItems, setVisibleItems] = useState<number[]>([])
  const [pulseActive, setPulseActive] = useState(true)

  // Animate items appearing one by one
  useEffect(() => {
    const timers: NodeJS.Timeout[] = []
    recentActivity.forEach((_, index) => {
      const timer = setTimeout(() => {
        setVisibleItems(prev => [...prev, index])
      }, index * 150)
      timers.push(timer)
    })
    return () => timers.forEach(t => clearTimeout(t))
  }, [recentActivity])

  // Pulse animation toggle
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseActive(prev => !prev)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  // Get top 3 trending categories (most reports)
  const trendingCategories = categoryBreakdown.slice(0, 3)

  return (
    <div className="glass-card overflow-hidden">
      {/* Header with pulse indicator */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-600/20 flex items-center justify-center ${pulseActive ? 'animate-pulse' : ''}`}>
                <Activity className="w-5 h-5 text-green-400" />
              </div>
              <div className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 ${pulseActive ? 'animate-ping' : ''}`} />
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                Phenomenon Pulse
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-normal">
                  LIVE
                </span>
              </h2>
              <p className="text-sm text-gray-400">Real-time activity monitor</p>
            </div>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center p-3 rounded-lg bg-white/5">
            <div className="flex items-center justify-center gap-1 text-amber-400 mb-1">
              <Zap className="w-4 h-4" />
              <span className="text-lg font-bold">{last24hReports}</span>
            </div>
            <span className="text-xs text-gray-400">Last 24h</span>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5">
            <div className="flex items-center justify-center gap-1 text-blue-400 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-lg font-bold">{last7dReports}</span>
            </div>
            <span className="text-xs text-gray-400">Last 7 days</span>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5">
            <div className="flex items-center justify-center gap-1 text-purple-400 mb-1">
              <Eye className="w-4 h-4" />
              <span className="text-lg font-bold">{recentActivity.reduce((sum, r) => sum + (r.view_count || 0), 0).toLocaleString()}</span>
            </div>
            <span className="text-xs text-gray-400">Recent views</span>
          </div>
        </div>
      </div>

      {/* Trending Categories */}
      <div className="px-6 py-4 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-white">Trending Now</span>
        </div>
        <div className="flex gap-2">
          {trendingCategories.map((cat, i) => {
            const config = CATEGORY_CONFIG[cat.category as PhenomenonCategory]
            return (
              <div
                key={cat.category}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"
              >
                <span className="text-base">{config?.icon || '📋'}</span>
                <span className="text-sm text-gray-300">{config?.label || cat.category}</span>
                <span className="text-xs text-gray-500">({cat.count})</span>
                {i === 0 && <span className="text-xs text-amber-400">🔥</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Live Activity Feed */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-white">Latest Activity</span>
          </div>
          <Link
            href="/explore"
            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
          >
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="space-y-2">
          {recentActivity.slice(0, 6).map((report, index) => {
            const config = CATEGORY_CONFIG[report.category]
            const isVisible = visibleItems.includes(index)

            return (
              <Link
                key={report.id}
                href={`/report/${report.slug}`}
                className={`block p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-300 border border-transparent hover:border-white/10 ${
                  isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                }`}
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                    style={{ backgroundColor: `${CATEGORY_COLORS[report.category]}20` }}
                  >
                    {config?.icon || '📋'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-white truncate">
                      {report.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      {report.location_name && (
                        <span className="text-xs text-gray-400 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3" />
                          {report.location_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-gray-500">{getTimeAgo(report.created_at)}</span>
                    {report.view_count > 0 && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <Eye className="w-3 h-3" />
                        {report.view_count}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {recentActivity.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
          </div>
        )}
      </div>
    </div>
  )
}
