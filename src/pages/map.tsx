'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { X, ExternalLink, MapPin, Gauge, Filter, ChevronUp, ChevronDown, Loader, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonCategory, CredibilityLevel } from '@/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG, COUNTRIES } from '@/lib/constants'
import MapView from '@/components/MapView'
import CategoryFilter from '@/components/CategoryFilter'
import { formatDate, classNames } from '@/lib/utils'

interface ReportWithDistance extends Report {
  distance_miles?: number
}

type SortOption = 'distance' | 'date_recent' | 'date_old' | 'credibility'

export default function MapPage() {
  const router = useRouter()
  const [reports, setReports] = useState<ReportWithDistance[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState<ReportWithDistance | null>(null)

  // Filters
  const [category, setCategory] = useState<PhenomenonCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [credibility, setCredibility] = useState<CredibilityLevel | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [country, setCountry] = useState('')
  const [hasEvidence, setHasEvidence] = useState(false)

  // Proximity search
  const [useProximity, setUseProximity] = useState(false)
  const [proximityLoading, setProximityLoading] = useState(false)
  const [proximityError, setProximityError] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [proximityRadius, setProximityRadius] = useState(50)
  const [proximitySort, setProximitySort] = useState<SortOption>('distance')

  // UI state
  const [showFilters, setShowFilters] = useState(true)
  const [initialized, setInitialized] = useState(false)

  // Restore filter state from URL
  useEffect(() => {
    if (router.isReady) {
      const { category: cat, q, credibility: cred, country: c, dateFrom: df, dateTo: dt, hasEvidence: he, proximity, radius } = router.query
      if (cat && typeof cat === 'string') setCategory(cat as PhenomenonCategory)
      if (q && typeof q === 'string') setSearchQuery(q)
      if (cred && typeof cred === 'string') setCredibility(cred as CredibilityLevel)
      if (c && typeof c === 'string') setCountry(c)
      if (df && typeof df === 'string') setDateFrom(df)
      if (dt && typeof dt === 'string') setDateTo(dt)
      if (he === 'true') setHasEvidence(true)
      if (proximity === 'true') setUseProximity(true)
      if (radius && typeof radius === 'string') setProximityRadius(parseInt(radius, 10))
      setInitialized(true)
    }
  }, [router.isReady])

  // Sync filter state to URL
  useEffect(() => {
    if (!initialized) return
    const timeout = setTimeout(() => {
      const params: Record<string, string> = {}
      if (category !== 'all') params.category = category
      if (searchQuery) params.q = searchQuery
      if (credibility) params.credibility = credibility
      if (country) params.country = country
      if (dateFrom) params.dateFrom = dateFrom
      if )‘…Ñ•Q¼¤Á…É…µÌ¹‘…Ñ•Q¼€ô‘…Ñ•Q¼(€€€€€¥˜€¡¡…ÍÙ¥‘•¹”¤Á…É…µÌ¹¡…ÍÙ¥‘•¹”€ô€ÑÉÕ”œ(€€€€€¥˜€¡ÕÍ•AÉ½á¥µ¥Ñä¤ì(€€€€€€€Á…É…µÌ¹ÁÉ½á¥µ¥Ñä€ô€ÑÉÕ”œ(€€€€€€€Á…É…µÌ¹É…‘¥ÕÌ€ôMÑÉ¥¹œ¡ÁÉ½á¥µ¥ÑåI…‘¥ÕÌ¤(€€€€€ô(€€€€€É½ÕÑ•È¹É•Á±…”¡ìÁ…Ñ¡¹…µ”è€œ½µ…Àœ°ÅÕ•ÉäèÁ…É…µÌô°Õ¹‘•™¥¹•°ìÍ¡…±±½ÜèÑÉÕ”ô¤(€€€ô°€ÌÀÀ¤(€€€É•ÑÕÉ¸€ ¤€ôø±•…ÉQ¥µ•½ÕÐ¡Ñ¥µ•½ÕÐ¤(€ô°m¥¹¥Ñ¥…±¥é•°…Ñ•½Éä°Í•…É¡EÕ•Éä°É•‘¥‰¥±¥Ñä°½Õ¹ÑÉä°‘…Ñ•É½´°‘…Ñ•Q¼°¡…ÍÙ¥‘•¹”°ÕÍ•AÉ½á¥µ¥Ñä°ÁÉ½á¥µ¥ÑåI…‘¥ÕÍt¤((€€¼¼1½……±°•½½‘•É•Á½ÉÑÌ(€½¹ÍÐ±½…‘I•Á½ÉÑÌ€ôÕÍ•…±±‰…¬¡…Íå¹Œ€ ¤€ôøì(€€€Í•Ñ1½…‘¥¹œ¡ÑÉÕ”¤(€€€Í•ÑAÉ½á¥µ¥ÑåÉÉ½È¡¹Õll)
    try {
      let query = supabase
        .from('reports')
        .select('id,title,slug,summary,category,latitude,longitude,location_name,event_date,witness_count,credibility,country,has_physical_evidence,has_photo_video')
        .eq('status', 'approved')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      if (category !== 'all') {
        query = query.eq('category', category)
      }
      if (country) {
        query = query.eq('country', country)
      }
      if (credibility) {
        query = query.eq('credibility', credibility)
      }
      if (dateFrom) {
        query = query.gte('event_date', dateFrom)
      }
      if (dateTo) {
        query = query.lte('event_date', dateTo)
      }
      if (hasEvidence) {
        query = query.or('has_physical_evidence.eq.true,has_photo_video.eq.true')
      }

      // Order by created_at desc for efficient query
      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error

      let results = data || []

      // Apply text search filter locally if needed (for better UX)
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        results = results.filter(r =>
          r.title?.toLowerCase().includes(q) ||
          r.summary?.toLowerCase().includes(q) ||
          r.location_name?.toLowerCase().includes(q)
        )
      }

      setReports(results)
    } catch (error) {
      console.error('Error loading reports:', error)
      setProximityError('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [category, country, credibility, dateFrom, dateTo, hasEvidence, searchQuery])

  // Proximity search
  const handleNearMe = useCallback(async () => {
    setProximityLoading(true)
    setProximityError(null)

    try {
      // Get user's location
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords
            setUserLocation({ lat: latitude, lng: longitude })

            // Call proximity API
            try {
              const params = new URLSearchParams({
                lat: latitude.toString(),
                lng: longitude.toString(),
                radius: proximityRadius.toString(),
                limit: '1000'
              })
              if (category !== 'all') params.append('category', category)

              const res = await fetch(`/api/search/proximity?${params}`)
              if (!res.ok) throw new Error('Proximity search failed')

              const data = await res.json()
              setReports(data.reports || [])
              setUseProximity(true)
              setProximityLoading(false)
              setLoading(false)
            } catch (err) {
              console.error('Proximity API error:', err)
              setProximityError('Failed to fetch nearby reports')
              setProximityLoading(false)
            }
          },
          (error) => {
            console.error('Geolocation error:', error)
            setProximityError('Could not access your location. Please enable location services.')
            setProximityLoading(false)
          }
        )
      } else {
        setProximityError('Geolocation is not supported by your browser')
        setProximityLoading(false)
      }
    } catch (error) {
      console.error('Error:', error)
      setProximityError('An error occurred while accessing your location')
      setProximityLoading(false)
    }
  }, [category, proximityRadius])

  // Sort reports for proximity
  const sortedReports = useCallback(() => {
    let sorted = [...reports]

    if (useProximity && userLocation && reports.some(r => r.distance_miles)) {
      switch (proximitySort) {
        case 'distance':
          sorted.sort((a, b) => (a.distance_miles || Infinity) - (b.distance_miles || Infinity))
          break
        case 'credibility':
          const credibilityOrder: Record<CredibilityLevel, number> = {
            'confirmed': 0, 'high': 1, 'medium': 2, 'low': 3, 'unverified': 4
          }
          sorted.sort((a, b) => {
            const credA = credibilityOrder[a.credibility as CredibilityLevel] ?? 4
            const credB = credibilityOrder[b.credibility as CredibilityLevel] ?? 4
            return credA - credB
          })
          break
        case 'date_recent':
          sorted.sort((a, b) => new Date(b.event_date || '').getTime() - new Date(a.event_date || '').getTime())
          break
        case 'date_old':
          sorted.sort((a, b) => new Date(a.event_date || '').getTime() - new Date(b.event_date || '').getTime())
          break
      }
    }

    return sorted
  }, [reports, useProximity, userLocation, proximitySort])

  useEffect(() => {
    if (!useProximity) {
      loadReports()
    }
  }, [category, searchQuery, credibility, dateFrom, dateTo, country, hasEvidence])

  const categoryConfig = selectedReport ? (CATEGORY_CONFIG[selectedReport.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination) : null
  const credibilityConfig = selectedReport ? CREDIBILITY_CONFIG[selectedReport.credibility as CredibilityLevel] : null

  const activeFilterCount = [
    category !== 'all' ? 1 : 0,
    searchQuery ? 1 : 0,
    credibility ? 1 : 0,
    country ? 1 : 0,
    dateFrom ? 1 : 0,
    dateTo ? 1 : 0,
    hasEvidence ? 1 : 0,
    useProximity ? 1 : 0,
  ].filter(Boolean).length

  const displayReports = sortedReports()

  return (
    <>
      <Head>
        <title>Interactive Map - ParaDocs</title>
      </Head>

      <div className="h-[calc(100vh-4rem)] flex flex-col">
        {/* Top bar with header */}
        <div className="p-4 border-b border-white/5 bg-black/30 backdrop-blur">
          <div className="max-w-7xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-display font-bold text-white">
                  Global Sightings Map
                </h1>
                <p className="text-sm text-gray-400">
                  {displayReports.length.toLocaleString()} locations mapped
                  {useProximity && userLocation && ` â€¢ Within ${proximityRadius} miles`}
                </p>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={classNames(
                  'relative p-2 rounded-lg transition-all',
                  showFilters
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                )}
              >
                <Filter className="w-5 h-5" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex relative overflow-hidden">
          {/* Left filter panel */}
          {showFilters && (
            <div className="hidden md:flex md:w-80 flex-col border-r border-white/5 bg-black/20 backdrop-blur overflow-y-auto">
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-white">Category</h3>
                  <div className="space-y-1">
                    <CategoryFilter
                      selected={category}
                      onChange={setCategory}
                    />
                  </div>
                </div>

                {/* Text Search */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Search</label>
                  <input
                    type="text"
                    placeholder="Search title, location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50"
                  />
                </div>

                {/* Credibility Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Credibility</label>
                  <select
                    value={credibility}
                    onChange={(e) => setCredibility(e.target.value as CredibilityLevel)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50"
                  >
                    <option value="">All credibility levels</option>
                    {Object.entries(CREDIBILITY_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>{config.label}</option>
                    ))}
                  </select>
                </div>

                {/* Country Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Country</label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50"
                  >
                    <option value="">All countries</option>
                    {COUNTRIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Date Range */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Event Date Range</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50"
                    />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50"
                    />
                  </div>
                </div>

                {/* Has Evidence Toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasEvidence}
                    onChange={(e) => setHasEvidence(e.target.checked)}
                    className="rounded bg-white/5 border border-white/20"
                  />
                  <span className="text-sm text-gray-300">Has evidence</span>
                </label>

                {/* Proximity Search */}
                <div className="pt-4 border-t border-white/10">
                  <button
                    onClick={handleNearMe}
                    disabled={proximityLoading}
                    className={classNames(
                      'w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2',
                      useProximity
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:bg-primary-500/30'
                    )}
                  >
                    {proximityLoading ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Getting location...
                      </>
                    ) : (
                      <>
                        <MapPin className="w-4 h-4" />
                        Near Me
                      </>
                    )}
                  </button>

                  {useProximity && (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs text-gray-400">
                        Search radius: <span className="text-white font-semibold">{proximityRadius} miles</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="500"
                        value={proximityRadius}
                        onChange={(e) => setProximityRadius(parseInt(e.target.value, 10))}
                        className="w-full"
                      />
                      <select
                        value={proximitySort}
                        onChange={(e) => setProximitySort(e.target.value as SortOption)}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50"
                      >
                        <option value="distance">Sort by distance</option>
                        <option value="credibility">Sort by credibility</option>
                        <option value="date_recent">Sort by date (recent)</option>
                        <option value="date_old">Sort by date (old)</option>
                      </select>
                    </div>
                  )}
                </div>

                {proximityError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {proximityError}
                  </div>
                )}

                {/* Clear filters */}
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setCategory('all')
                      setSearchQuery('')
                      setCredibility('')
                      setCountry('')
                      setDateFrom('')
                      setDateTo('')
                      setHasEvidence(false)
                      setUseProximity(false)
                      setProximityError(null)
                    }}
                    className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 transition-all"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Map area */}
          <div className="flex-1 relative flex flex-col">
            {loading && !useProximity ? (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-10">
                <div className="text-gray-400 flex items-center gap-2">
                  <Loader className="w-5 h-5 animate-spin" />
                  Loading map data...
                </div>
              </div>
            ) : (
              <MapView
                reports={displayReports}
                height="100%"
                onMarkerClick={setSelectedReport}
                circle={useProximity && userLocation ? {
                  center: [userLocation.lat, userLocation.lng],
                  radiusMiles: proximityRadius
                } : undefined}
              />
            )}

            {/* Selected report panel */}
            {selectedReport && categoryConfig && (
              <div className="absolute top-4 right-4 w-full sm:w-96 glass-card p-5 animate-slide-in max-h-[calc(100vh-8rem)] overflow-y-auto">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className={classNames(
                    'w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0',
                    categoryConfig.bgColor
                  )}>
                    {categoryConfig.icon}
                  </div>
                  <div className="flex gap-2">
                    {credibilityConfig && (
                      <span className={classNames(
                        'text-xs px-2 py-1 rounded-full font-medium',
                        credibilityConfig.bgColor,
                        credibilityConfig.color
                      )}>
                        {credibilityConfig.label}
                      </span>
                    )}
                    <button
                      onClick={() => setSelectedReport(null)}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>

                <h3 className="font-semibold text-white text-base mb-2">
                  {selectedReport.title}
                </h3>

                <p className="text-sm text-gray-300 mb-3 line-clamp-4">
                  {selectedReport.summary}
                </p>

                <div className="space-y-2 text-xs text-gray-400 mb-4">
                  {selectedReport.location_name && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{selectedReport.location_name}</span>
                    </div>
                  )}
                  {selectedReport.event_date && (
                    <div className="flex items-start gap-2">
                      <span>ðŸ“…</span>
                      <span>{formatDate(selectedReport.event_date)}</span>
                    </div>
                  )}
                  {selectedReport.witness_count > 0 && (
                    <div className="flex items-start gap-2">
                      <span>ðŸ‘¥</span>
                      <span>{selectedReport.witness_count} {selectedReport.witness_count === 1 ? 'witness' : 'witnesses'}</span>
                    </div>
                  )}
                  {selectedReport.distance_miles && (
                    <div className="flex items-start gap-2">
                      <Gauge className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{selectedReport.distance_miles.toFixed(1)} miles away</span>
                    </div>
                  )}
                </div>

                <Link
                  href={`/report/${selectedReport.slug}`}
                  className="inline-flex items-center justify-center w-full gap-2 px-4 py-2.5 rounded-lg bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:bg-primary-500/30 transition-all font-medium text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Full Report
                </Link>
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-4 left-4 glass-card p-4">
              <h4 className="text-xs font-semibold text-gray-400 mb-3">Category Legend</h4>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                {Object.entries(CATEGORY_CONFIG).slice(0, 6).map(([key, config]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-lg">{config.icon}</span>
                    <span className={classNames('text-gray-400 text-xs')}>{config.label.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile filter button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="md:hidden absolute bottom-4 right-4 p-3 rounded-lg bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:bg-primary-500/30 transition-all"
            >
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile filter sheet */}
      {showFilters && (
        <div className="md:hidden fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFilters(false)} />
          <div className="relative w-full bg-gray-900 rounded-t-2xl border-t border-white/10 max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between p-4 border-b border-white/10 bg-gray-900">
              <h2 className="font-semibold text-white">Filters</h2>
              <button
                onClick={() => setShowFilters(false)}
                className="p-1 hover:bg-white/10 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">Category</h3>
                <CategoryFilter
                  selected={category}
                  onChange={setCategory}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Search</label>
                <input
                  type="text"
                  placeholder="Search title, location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Credibility</label>
                <select
                  value={credibility}
                  onChange={(e) => setCredibility(e.target.value as CredibilityLevel)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50"
                >
                  <option value="">All credibility levels</option>
                  {Object.entries(CREDIBILITY_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50"
                >
                  <option value="">All countries</option>
                  {COUNTRIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Event Date Range</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasEvidence}
                  onChange={(e) => setHasEvidence(e.target.checked)}
                  className="rounded bg-white/5 border border-white/20"
                />
                <span className="text-sm text-gray-300">Has evidence</span>
              </label>

              <div className="pt-4 border-t border-white/10">
                <button
                  onClick={handleNearMe}
                  disabled={proximityLoading}
                  className={classNames(
                    'w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2',
                    useProximity
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:bg-primary-500/30'
                  )}
                >
                  {proximityLoading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Getting location...
                    </>
                  ) : (
                    <>
                      <MapPin className="w-4 h-4" />
                      Near Me
                    </>
                  )}
                </button>

                {useProximity && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-gray-400">
                      Search radius: <span className="text-white font-semibold">{proximityRadius} miles</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="500"
                      value={proximityRadius}
                      onChange={(e) => setProximityRadius(parseInt(e.target.value, 10))}
                      className="w-full"
                    />
                    <select
                      value={proximitySort}
                      onChange={(e) => setProximitySort(e.target.value as SortOption)}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50"
                    >
                      <option value="distance">Sort by distance</option>
                      <option value="credibility">Sort by credibility</option>
                      <option value="date_recent">Sort by date (recent)</option>
                      <option value="date_old">Sort by date (old)</option>
                    </select>
                  </div>
                )}
              </div>

              {proximityError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {proximityError}
                </div>
              )}

              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setCategory('all')
                    setCategory('all')
                    setSearchQuery('')
                    setCredibility('')
                    setCountry('')
                    setDateFrom('')
                    setDateTo('')
                    setHasEvidence(false)
                    setUseProximity(false)
                    setProximityError(null)
                  }}
                  className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 transition-all"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>