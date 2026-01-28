import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
// Layout wrapper is provided by _app.tsx
import { CATEGORY_CONFIG } from '@/lib/constants'
import {
  MapPin,
  Filter,
  Loader2,
  Flame,
  TrendingUp,
  Calendar,
  Eye,
  ChevronRight,
  AlertTriangle,
  Zap
} from 'lucide-react'

interface Hotspot {
  id: string
  name: string
  description: string | null
  center_lat: number
  center_lng: number
  radius_km: number
  report_count: number
  intensity_score: number
  primary_category: string | null
  category_breakdown: Record<string, number>
  first_report_date: string | null
  last_report_date: string | null
  is_active: boolean
}

export default function HotspotsPage() {
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null)
  const [categoryFilter, setCategory] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [sortBy, setSortBy] = useState<'intensity' | 'reports' | 'recent'>('intensity')

  useEffect(() => {
    fetchHotspots()
  }, [categoryFilter, activeOnly])

  async function fetchHotspots() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (categoryFilter) params.append('category', categoryFilter)
      if (activeOnly) params.append('active_only', 'true')

      const response = await fetch(`/api/hotspots?${params}`)
      if (response.ok) {
        const data = await response.json()
        setHotspots(data.hotspots || [])
      }
    } catch (error) {
      console.error('Failed to fetch hotspots:', error)
    } finally {
      setLoading(false)
    }
  }

  // Sort hotspots
  const sortedHotspots = [...hotspots].sort((a, b) => {
    if (sortBy === 'intensity') return b.intensity_score - a.intensity_score
    if (sortBy === 'reports') return b.report_count - a.report_count
    if (sortBy === 'recent') {
      const aDate = a.last_report_date ? new Date(a.last_report_date).getTime() : 0
      const bDate = b.last_report_date ? new Date(b.last_report_date).getTime() : 0
      return bDate - aDate
    }
    return 0
  })

  const categories = Object.entries(CATEGORY_CONFIG)

  function getIntensityColor(score: number): string {
    if (score >= 80) return 'from-red-600 to-orange-500'
    if (score >= 60) return 'from-orange-500 to-yellow-500'
    if (score >= 40) return 'from-yellow-500 to-green-500'
    return 'from-green-500 to-cyan-500'
  }

  function getIntensityLabel(score: number): string {
    if (score >= 80) return 'Critical'
    if (score >= 60) return 'High'
    if (score >= 40) return 'Moderate'
    return 'Low'
  }

  function formatLocation(lat: number, lng: number): string {
    const latDir = lat >= 0 ? 'N' : 'S'
    const lngDir = lng >= 0 ? 'E' : 'W'
    return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lng).toFixed(2)}°${lngDir}`
  }

  // Stats
  const activeHotspots = hotspots.filter(h => h.is_active).length
  const avgIntensity = hotspots.length > 0
    ? Math.round(hotspots.reduce((sum, h) => sum + h.intensity_score, 0) / hotspots.length)
    : 0
  const totalReports = hotspots.reduce((sum, h) => sum + h.report_count, 0)

  return (
    <>
      <Head>
        <title>Hotspots | ParaDocs</title>
        <meta
          name="description"
          content="Discover geographic hotspots of paranormal activity around the world."
        />
      </Head>

      <div className="py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-4">
            Activity Hotspots
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Geographic concentrations of paranormal activity detected through AI clustering
            analysis of thousands of reports.
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="glass-card p-4 text-center">
            <MapPin className="w-6 h-6 text-primary-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{hotspots.length}</p>
            <p className="text-sm text-gray-400">Total Hotspots</p>
          </div>
          <div className="glass-card p-4 text-center">
            <Flame className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{activeHotspots}</p>
            <p className="text-sm text-gray-400">Active Now</p>
          </div>
          <div className="glass-card p-4 text-center">
            <Zap className="w-6 h-6 text-amber-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{avgIntensity}%</p>
            <p className="text-sm text-gray-400">Avg Intensity</p>
          </div>
          <div className="glass-card p-4 text-center">
            <Eye className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{totalReports.toLocaleString()}</p>
            <p className="text-sm text-gray-400">Total Reports</p>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Filters:</span>
            </div>

            {/* Category filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Categories</option>
              {categories.map(([key, config]) => (
                <option key={key} value={key}>
                  {config.icon} {config.label}
                </option>
              ))}
            </select>

            {/* Active toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-300">Active only</span>
            </label>

            {/* Sort */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-gray-400">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="intensity">Intensity</option>
                <option value="reports">Report Count</option>
                <option value="recent">Most Recent</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          </div>
        ) : hotspots.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <MapPin className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              No Hotspots Found
            </h3>
            <p className="text-gray-400">
              No hotspots match your current filters. Try adjusting your search criteria.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Hotspot List */}
            <div className="space-y-4">
              {sortedHotspots.map((hotspot) => {
                const categoryConfig = hotspot.primary_category
                  ? CATEGORY_CONFIG[hotspot.primary_category as keyof typeof CATEGORY_CONFIG]
                  : null

                return (
                  <div
                    key={hotspot.id}
                    onClick={() => setSelectedHotspot(hotspot)}
                    className={`glass-card p-4 cursor-pointer transition-all hover:scale-[1.02] ${
                      selectedHotspot?.id === hotspot.id ? 'ring-2 ring-primary-500' : ''
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Intensity indicator */}
                      <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${getIntensityColor(hotspot.intensity_score)} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-2xl font-bold text-white">
                          {Math.round(hotspot.intensity_score)}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {hotspot.is_active && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                              Active
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">
                            {getIntensityLabel(hotspot.intensity_score)}
                          </span>
                        </div>

                        <h3 className="font-display font-semibold text-white text-lg">
                          {hotspot.name || `Hotspot #${hotspot.id.slice(0, 8)}`}
                        </h3>

                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {formatLocation(hotspot.center_lat, hotspot.center_lng)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {hotspot.report_count} reports
                          </span>
                          <span className="flex items-center gap-1">
                            {categoryConfig?.icon || '📍'}
                            {categoryConfig?.label || 'Mixed'}
                          </span>
                        </div>

                        {hotspot.description && (
                          <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                            {hotspot.description}
                          </p>
                        )}
                      </div>

                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Detail Panel */}
            <div className="lg:sticky lg:top-24 h-fit">
              {selectedHotspot ? (
                <div className="glass-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-display font-bold text-white">
                      {selectedHotspot.name || `Hotspot Details`}
                    </h2>
                    {selectedHotspot.is_active && (
                      <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400">
                        <AlertTriangle className="w-3 h-3" />
                        Active Hotspot
                      </span>
                    )}
                  </div>

                  {/* Intensity meter */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-400">Intensity Score</span>
                      <span className="text-white font-medium">
                        {Math.round(selectedHotspot.intensity_score)}%
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${getIntensityColor(selectedHotspot.intensity_score)}`}
                        style={{ width: `${selectedHotspot.intensity_score}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-1">Total Reports</p>
                      <p className="text-xl font-bold text-white">{selectedHotspot.report_count}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-1">Radius</p>
                      <p className="text-xl font-bold text-white">{selectedHotspot.radius_km} km</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-1">First Report</p>
                      <p className="text-sm font-medium text-white">
                        {selectedHotspot.first_report_date
                          ? new Date(selectedHotspot.first_report_date).toLocaleDateString()
                          : 'Unknown'}
                      </p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-1">Last Report</p>
                      <p className="text-sm font-medium text-white">
                        {selectedHotspot.last_report_date
                          ? new Date(selectedHotspot.last_report_date).toLocaleDateString()
                          : 'Unknown'}
                      </p>
                    </div>
                  </div>

                  {/* Category breakdown */}
                  {selectedHotspot.category_breakdown && Object.keys(selectedHotspot.category_breakdown).length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-white mb-3">Category Breakdown</h3>
                      <div className="space-y-2">
                        {Object.entries(selectedHotspot.category_breakdown)
                          .sort(([, a], [, b]) => b - a)
                          .map(([cat, count]) => {
                            const config = CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG]
                            const percentage = Math.round((count / selectedHotspot.report_count) * 100)
                            return (
                              <div key={cat} className="flex items-center gap-2">
                                <span className="text-lg">{config?.icon || '📋'}</span>
                                <span className="text-sm text-gray-300 flex-1">
                                  {config?.label || cat}
                                </span>
                                <span className="text-sm text-gray-400">{count}</span>
                                <div className="w-20 h-1.5 rounded-full bg-gray-800">
                                  <div
                                    className="h-full rounded-full bg-primary-500"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}

                  {/* Location */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-white mb-2">Location</h3>
                    <p className="text-gray-400">
                      {formatLocation(selectedHotspot.center_lat, selectedHotspot.center_lng)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <Link
                      href={`/map?lat=${selectedHotspot.center_lat}&lng=${selectedHotspot.center_lng}&zoom=10`}
                      className="btn btn-primary flex-1"
                    >
                      <MapPin className="w-4 h-4" />
                      View on Map
                    </Link>
                    <Link
                      href={`/explore?lat=${selectedHotspot.center_lat}&lng=${selectedHotspot.center_lng}&radius=${selectedHotspot.radius_km}`}
                      className="btn btn-secondary flex-1"
                    >
                      <Eye className="w-4 h-4" />
                      Browse Reports
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="glass-card p-12 text-center">
                  <MapPin className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">
                    Select a Hotspot
                  </h3>
                  <p className="text-gray-400">
                    Click on a hotspot from the list to view detailed information.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
