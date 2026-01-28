import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { CATEGORY_CONFIG } from '@/lib/constants'
import {
  Calendar,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  MapPin,
  Clock,
  TrendingUp,
  Eye
} from 'lucide-react'

interface TimelineEvent {
  id: string
  report_id: string | null
  event_date: string
  title: string
  description: string
  location_name: string | null
  category: string
  significance_score: number
  report_slug?: string
}

interface TimelineStats {
  total_events: number
  events_by_category: Record<string, number>
  events_by_year: Record<string, number>
  peak_period: {
    start: string
    end: string
    count: number
  }
}

type Granularity = 'day' | 'month' | 'year'

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [stats, setStats] = useState<TimelineStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [category, setCategory] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    fetchTimeline()
  }, [granularity, category, year, page])

  async function fetchTimeline() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        granularity,
        limit: '50',
        offset: String((page - 1) * 50)
      })

      if (category) params.append('category', category)

      // Set date range based on year
      params.append('start_date', `${year}-01-01`)
      params.append('end_date', `${year}-12-31`)

      const response = await fetch(`/api/timeline?${params}`)
      if (response.ok) {
        const data = await response.json()
        setEvents(data.events || [])
        setStats(data.stats || null)
        setHasMore((data.events?.length || 0) === 50)
      }
    } catch (error) {
      console.error('Failed to fetch timeline:', error)
    } finally {
      setLoading(false)
    }
  }

  // Group events by date
  const groupedEvents = events.reduce((acc, event) => {
    const dateKey = granularity === 'year'
      ? event.event_date.substring(0, 4)
      : granularity === 'month'
        ? event.event_date.substring(0, 7)
        : event.event_date.substring(0, 10)

    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(event)
    return acc
  }, {} as Record<string, TimelineEvent[]>)

  const sortedDates = Object.keys(groupedEvents).sort((a, b) => b.localeCompare(a))

  const categories = Object.entries(CATEGORY_CONFIG)
  const years = Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - i)

  function formatDateLabel(dateKey: string): string {
    if (granularity === 'year') {
      return dateKey
    } else if (granularity === 'month') {
      const [y, m] = dateKey.split('-')
      const date = new Date(parseInt(y), parseInt(m) - 1)
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    } else {
      const date = new Date(dateKey)
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    }
  }

  function getSignificanceColor(score: number): string {
    if (score >= 8) return 'bg-red-500'
    if (score >= 6) return 'bg-orange-500'
    if (score >= 4) return 'bg-yellow-500'
    return 'bg-blue-500'
  }

  return (
    <Layout>
      <Head>
        <title>Timeline | ParaDocs</title>
        <meta
          name="description"
          content="Explore the chronological history of paranormal events and sightings."
        />
      </Head>

      <div className="py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-4">
            Paranormal Timeline
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Explore the chronological history of documented paranormal phenomena,
            from ancient encounters to recent sightings.
          </p>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="glass-card p-4 text-center">
              <Calendar className="w-6 h-6 text-primary-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{stats.total_events}</p>
              <p className="text-sm text-gray-400">Total Events</p>
            </div>
            <div className="glass-card p-4 text-center">
              <TrendingUp className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">
                {Object.keys(stats.events_by_category).length}
              </p>
              <p className="text-sm text-gray-400">Categories</p>
            </div>
            <div className="glass-card p-4 text-center">
              <Clock className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">
                {Object.keys(stats.events_by_year).length}
              </p>
              <p className="text-sm text-gray-400">Years Covered</p>
            </div>
            {stats.peak_period && (
              <div className="glass-card p-4 text-center">
                <Eye className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{stats.peak_period.count}</p>
                <p className="text-sm text-gray-400">Peak Activity</p>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="glass-card p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Filters:</span>
            </div>

            {/* Year selector */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYear(y => y - 1)}
                className="p-1 hover:bg-white/10 rounded"
              >
                <ChevronLeft className="w-4 h-4 text-gray-400" />
              </button>
              <select
                value={year}
                onChange={(e) => { setYear(parseInt(e.target.value)); setPage(1) }}
                className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button
                onClick={() => setYear(y => Math.min(y + 1, new Date().getFullYear()))}
                className="p-1 hover:bg-white/10 rounded"
              >
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Granularity */}
            <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1">
              <button
                onClick={() => { setGranularity('day'); setPage(1) }}
                className={`px-3 py-1 text-sm rounded ${
                  granularity === 'day' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setGranularity('month'); setPage(1) }}
                className={`px-3 py-1 text-sm rounded ${
                  granularity === 'month' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => { setGranularity('year'); setPage(1) }}
                className={`px-3 py-1 text-sm rounded ${
                  granularity === 'year' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>

            {/* Category filter */}
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1) }}
              className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Categories</option>
              {categories.map(([key, config]) => (
                <option key={key} value={key}>
                  {config.icon} {config.label}
                </option>
              ))}
            </select>

            <span className="text-sm text-gray-500 ml-auto">
              {events.length} events
            </span>
          </div>
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              No Events Found
            </h3>
            <p className="text-gray-400">
              No events match your current filters. Try adjusting the year or category.
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary-500 via-purple-500 to-cyan-500" />

            {/* Events */}
            <div className="space-y-8">
              {sortedDates.map((dateKey, dateIndex) => (
                <div key={dateKey} className="relative">
                  {/* Date marker */}
                  <div className="flex items-center mb-4">
                    <div className="md:w-1/2 md:pr-8 md:text-right hidden md:block">
                      {dateIndex % 2 === 0 && (
                        <h3 className="text-lg font-display font-semibold text-white">
                          {formatDateLabel(dateKey)}
                        </h3>
                      )}
                    </div>
                    <div className="absolute left-4 md:left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary-500 border-4 border-gray-900 z-10" />
                    <div className="md:w-1/2 md:pl-8 pl-10">
                      {(dateIndex % 2 === 1 || true) && (
                        <h3 className="text-lg font-display font-semibold text-white md:hidden">
                          {formatDateLabel(dateKey)}
                        </h3>
                      )}
                      {dateIndex % 2 === 1 && (
                        <h3 className="text-lg font-display font-semibold text-white hidden md:block">
                          {formatDateLabel(dateKey)}
                        </h3>
                      )}
                    </div>
                  </div>

                  {/* Events for this date */}
                  <div className="pl-10 md:pl-0 space-y-3">
                    {groupedEvents[dateKey].map((event, eventIndex) => {
                      const categoryConfig = CATEGORY_CONFIG[event.category as keyof typeof CATEGORY_CONFIG]
                      const isLeft = dateIndex % 2 === 0

                      return (
                        <div
                          key={event.id}
                          className={`md:flex ${isLeft ? 'md:flex-row' : 'md:flex-row-reverse'}`}
                        >
                          <div className={`md:w-1/2 ${isLeft ? 'md:pr-12' : 'md:pl-12'}`}>
                            <div className="glass-card p-4 hover:border-primary-500/50 transition-colors group">
                              <div className="flex items-start gap-3">
                                <div className={`w-2 h-2 rounded-full mt-2 ${getSignificanceColor(event.significance_score)}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-lg">{categoryConfig?.icon || '📋'}</span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">
                                      {categoryConfig?.label || event.category}
                                    </span>
                                  </div>
                                  <h4 className="font-medium text-white group-hover:text-primary-400 transition-colors">
                                    {event.report_slug ? (
                                      <Link href={`/report/${event.report_slug}`}>
                                        {event.title}
                                      </Link>
                                    ) : (
                                      event.title
                                    )}
                                  </h4>
                                  {event.description && (
                                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                                      {event.description}
                                    </p>
                                  )}
                                  {event.location_name && (
                                    <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                                      <MapPin className="w-3 h-3" />
                                      {event.location_name}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="hidden md:block md:w-1/2" />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex justify-center gap-4 mt-8">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="flex items-center text-gray-400">
                Page {page}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
                className="btn btn-secondary disabled:opacity-50"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
