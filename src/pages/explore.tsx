'use client'

/**
 * Explore Page — Session A2: Explore Consolidation
 *
 * Three mode tabs: [Map] [Browse] [Search]
 * Absorbs: /map, /explore (old), /search, /phenomena listing, /analytics
 *
 * URL params preserved for deep linking:
 *   /explore?mode=map&lat=33&lng=-112
 *   /explore?mode=search&q=phoenix+lights
 *   /explore?mode=browse&category=ufos_aliens
 *
 * SWC: Uses var + function(){} for compatibility with existing codebase.
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Search, SlidersHorizontal, X, ChevronDown, Sparkles, ArrowRight,
  TrendingUp, MapPin, Heart, Clock, ChevronLeft, ChevronRight as ChevronRightIcon,
  Bookmark, Eye, ThumbsUp, BookOpen, UserPlus, Bell, Library, LogIn,
  Filter, Loader, AlertCircle, Map as MapIcon, Grid3X3, List,
  ChevronUp, AlertTriangle, Tag, ArrowUp, Loader2, Brain, Calendar, Shield,
  Radar, Footprints, HeartPulse, Dna, ScanEye, Moon, Layers, Zap
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType, PhenomenonCategory, CredibilityLevel, ContentType } from '@/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG, CONTENT_TYPE_CONFIG, COUNTRIES } from '@/lib/constants'
import CategoryFilter from '@/components/CategoryFilter'
import SubcategoryFilter from '@/components/SubcategoryFilter'
import ReportCard from '@/components/ReportCard'
import { classNames, formatRelativeDate } from '@/lib/utils'
import AskTheUnknown from '@/components/AskTheUnknown'
import UnifiedOnboarding, { hasCompletedUnifiedOnboarding } from '@/components/UnifiedOnboarding'
import MapSpotlightRow from '@/components/map/MapSpotlightRow'
// Map imports — dynamic to avoid SSR
import { useMapState } from '@/components/map/useMapState'
import { useViewportData } from '@/components/map/useViewportData'
import { ReportProperties } from '@/components/map/mapStyles'
import MapControls, { BasemapStyle } from '@/components/map/MapControls'
import MapFilterPanel from '@/components/map/MapFilterPanel'
import MapBottomSheet from '@/components/map/MapBottomSheet'
import MapReportCard from '@/components/map/MapReportCard'
import MapTimeline from '@/components/map/MapTimeline'

// Dynamic import to avoid SSR issues with MapLibre GL (WebGL)
var MapContainer = dynamic(
  function() { return import('@/components/map/MapContainer') },
  { ssr: false, loading: function() {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-950">
        <Loader className="animate-spin text-gray-500" size={24} />
      </div>
    )
  }}
)

// ─── Types ──────────────────────────────────────────────────

type ExploreMode = 'map' | 'browse' | 'search'
type BottomSheetSnap = 'peek' | 'half' | 'full'
type SortOption = 'newest' | 'oldest' | 'popular' | 'most_viewed'

interface FeedReport {
  id: string
  title: string
  slug: string
  summary: string | null
  category: string
  country: string | null
  city: string | null
  state_province: string | null
  event_date: string | null
  credibility: string | null
  upvotes: number
  view_count: number
  comment_count: number
  created_at: string
  location_name?: string | null
  source_type?: string | null
  source_label?: string | null
  has_photo_video?: boolean
  has_physical_evidence?: boolean
  phenomenon_type?: { name: string; category: string; slug: string } | null
}

interface FeedPhenomenon {
  id: string
  name: string
  slug: string
  category: string
  icon: string
  ai_summary: string | null
  ai_quick_facts: any | null
  primary_image_url: string | null
  report_count: number
  aliases: string[] | null
}

interface FeedSection {
  id: string
  title: string
  subtitle: string
  type: 'reports' | 'phenomena' | 'mixed'
  reports?: FeedReport[]
  phenomena?: FeedPhenomenon[]
}

interface FulltextResult {
  id: string
  title: string
  slug: string
  summary: string
  category: string
  country: string | null
  city: string | null
  state_province: string | null
  latitude: number | null
  longitude: number | null
  location_name: string | null
  event_date: string | null
  credibility: string
  upvotes: number
  created_at: string
  rank: number
}

interface SearchFilters {
  categories: PhenomenonCategory[]
  phenomenonTypes: string[]
  hasEvidence: boolean
  dateFrom: string
  dateTo: string
}

interface AutocompleteItem {
  type: 'phenomenon' | 'location' | 'suggestion'
  label: string
  query: string
  icon: string
}

// Phenomena types for Browse mode encyclopedia
interface QuickFacts {
  origin?: string
  first_documented?: string
  classification?: string
  danger_level?: string
  typical_encounter?: string
  evidence_types?: string
  active_period?: string
  notable_feature?: string
  cultural_significance?: string
}

interface PhenomenonEntry {
  id: string
  name: string
  slug: string
  category: string
  icon: string
  ai_summary: string | null
  report_count: number
  primary_image_url: string | null
  aliases: string[]
  ai_quick_facts?: QuickFacts | null
}

// Category-specific gradient backgrounds
var CATEGORY_GRADIENTS: Record<string, string> = {
  cryptids: 'from-emerald-950 via-gray-900 to-gray-950',
  ufos_aliens: 'from-indigo-950 via-gray-900 to-gray-950',
  ghosts_hauntings: 'from-slate-900 via-purple-950/50 to-gray-950',
  psychic_phenomena: 'from-violet-950 via-gray-900 to-gray-950',
  consciousness_practices: 'from-amber-950/80 via-gray-900 to-gray-950',
  psychological_experiences: 'from-cyan-950 via-gray-900 to-gray-950',
  biological_factors: 'from-rose-950 via-gray-900 to-gray-950',
  perception_sensory: 'from-orange-950 via-gray-900 to-gray-950',
  religion_mythology: 'from-yellow-950/80 via-gray-900 to-gray-950',
  esoteric_practices: 'from-fuchsia-950 via-gray-900 to-gray-950',
  combination: 'from-teal-950 via-gray-900 to-gray-950',
}

// Lucide icons per category (replacing emojis for Apple HIG consistency)
var CATEGORY_LUCIDE_ICONS: Record<string, any> = {
  ufos_aliens: Radar,
  cryptids: Footprints,
  ghosts_hauntings: Eye,
  psychic_phenomena: Zap,
  consciousness_practices: Brain,
  psychological_experiences: HeartPulse,
  biological_factors: Dna,
  perception_sensory: ScanEye,
  religion_mythology: BookOpen,
  esoteric_practices: Moon,
  combination: Layers,
}

// Accent colors for category cards (icon tint + border highlight)
var CATEGORY_ACCENT: Record<string, { icon: string; border: string; glow: string }> = {
  ufos_aliens: { icon: 'text-indigo-400', border: 'border-indigo-500/30', glow: 'group-hover:shadow-indigo-500/10' },
  cryptids: { icon: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'group-hover:shadow-emerald-500/10' },
  ghosts_hauntings: { icon: 'text-purple-400', border: 'border-purple-500/30', glow: 'group-hover:shadow-purple-500/10' },
  psychic_phenomena: { icon: 'text-violet-400', border: 'border-violet-500/30', glow: 'group-hover:shadow-violet-500/10' },
  consciousness_practices: { icon: 'text-amber-400', border: 'border-amber-500/30', glow: 'group-hover:shadow-amber-500/10' },
  psychological_experiences: { icon: 'text-cyan-400', border: 'border-cyan-500/30', glow: 'group-hover:shadow-cyan-500/10' },
  biological_factors: { icon: 'text-rose-400', border: 'border-rose-500/30', glow: 'group-hover:shadow-rose-500/10' },
  perception_sensory: { icon: 'text-orange-400', border: 'border-orange-500/30', glow: 'group-hover:shadow-orange-500/10' },
  religion_mythology: { icon: 'text-yellow-400', border: 'border-yellow-500/30', glow: 'group-hover:shadow-yellow-500/10' },
  esoteric_practices: { icon: 'text-fuchsia-400', border: 'border-fuchsia-500/30', glow: 'group-hover:shadow-fuchsia-500/10' },
  combination: { icon: 'text-teal-400', border: 'border-teal-500/30', glow: 'group-hover:shadow-teal-500/10' },
}

// ─── MODE TABS ──────────────────────────────────────────────

var MODE_TABS: { key: ExploreMode; label: string; icon: any }[] = [
  { key: 'map', label: 'Map', icon: MapIcon },
  { key: 'browse', label: 'Browse', icon: Grid3X3 },
  { key: 'search', label: 'Search', icon: Search },
]

// ─── MAIN COMPONENT ─────────────────────────────────────────

export default function ExplorePage() {
  var router = useRouter()
  var [mode, setMode] = useState<ExploreMode>('browse')
  var [initialized, setInitialized] = useState(false)
  var [showWelcome, setShowWelcome] = useState(false)

  useEffect(function() {
    if (!hasCompletedUnifiedOnboarding()) setShowWelcome(true)
  }, [])

  // Parse mode from URL on mount
  useEffect(function() {
    if (!router.isReady) return
    var modeParam = router.query.mode
    if (modeParam === 'map' || modeParam === 'browse' || modeParam === 'search') {
      setMode(modeParam)
    }
    setInitialized(true)
  }, [router.isReady])

  // Update URL when mode changes (shallow routing, no page reload)
  var handleModeChange = useCallback(function(newMode: ExploreMode) {
    setMode(newMode)
    // Preserve existing query params, update mode
    var query: Record<string, string> = { mode: newMode }
    // Carry over relevant params per mode
    if (newMode === 'map') {
      if (router.query.lat) query.lat = String(router.query.lat)
      if (router.query.lng) query.lng = String(router.query.lng)
      if (router.query.zoom) query.zoom = String(router.query.zoom)
    } else if (newMode === 'search') {
      if (router.query.q) query.q = String(router.query.q)
    } else if (newMode === 'browse') {
      if (router.query.category) query.category = String(router.query.category)
    }
    router.replace({ pathname: '/explore', query: query }, undefined, { shallow: true })
  }, [router])

  return (
    <>
      <Head>
        <title>Explore - Paradocs</title>
        <meta name="description" content="Explore paranormal reports on an interactive map, browse by category, or search the world's largest database of anomalous encounters." />
      </Head>

      {/* ─── Mode Tabs (always visible at top) ─── */}
      <div className={classNames(
        'sticky top-14 z-30 bg-gray-950/95 backdrop-blur-lg border-b border-white/5',
        mode === 'map' ? 'safe-area-pt' : ''
      )}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-1 py-2">
            {MODE_TABS.map(function(tab) {
              var Icon = tab.icon
              var isActive = mode === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={function() { handleModeChange(tab.key) }}
                  className={classNames(
                    'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                      : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── Mode Content ─── */}
      {mode === 'map' && <ExploreMapMode />}
      {mode === 'browse' && <ExploreBrowseMode />}
      {mode === 'search' && <ExploreSearchMode />}

      {showWelcome && <UnifiedOnboarding onComplete={function() { setShowWelcome(false) }} />}
      {mode !== 'map' && <AskTheUnknown />}
    </>
  )
}

// ═══════════════════════════════════════════════════════════
// MAP MODE — relocated from /map page
// ═══════════════════════════════════════════════════════════

function ExploreMapMode() {
  var router = useRouter()

  var mapState = useMapState()
  var filters = mapState.filters
  var setFilter = mapState.setFilter
  var setFilters = mapState.setFilters
  var resetFilters = mapState.resetFilters
  var heatmapActive = mapState.heatmapActive
  var setHeatmapActive = mapState.setHeatmapActive
  var selectedReportId = mapState.selectedReportId
  var setSelectedReportId = mapState.setSelectedReportId

  var [bounds, setBounds] = useState<[number, number, number, number] | null>(null)
  var [zoom, setZoom] = useState(2.2)
  var [filterPanelOpen, setFilterPanelOpen] = useState(false)
  var [bottomSheetSnap, setBottomSheetSnap] = useState<BottomSheetSnap>('peek')
  var [flyToTarget, setFlyToTarget] = useState<{ lng: number; lat: number; zoom?: number } | null>(null)
  var [basemapStyle, setBasemapStyle] = useState<BasemapStyle>('dark')

  // Deep-link support: fly to location from URL params
  useEffect(function() {
    if (!router.isReady) return
    var lat = router.query.lat
    var lng = router.query.lng
    var zoomParam = router.query.zoom
    if (lat && lng) {
      var parsedLat = parseFloat(String(lat))
      var parsedLng = parseFloat(String(lng))
      var parsedZoom = zoomParam ? parseFloat(String(zoomParam)) : 9
      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        setTimeout(function() {
          setFlyToTarget({ lat: parsedLat, lng: parsedLng, zoom: parsedZoom })
        }, 500)
      }
    }
  }, [router.isReady])

  var viewportData = useViewportData(filters, bounds, zoom)
  var features = viewportData.features
  var allPointsGeoJSON = viewportData.allPointsGeoJSON
  var totalReports = viewportData.totalReports
  var filteredCount = viewportData.filteredCount
  var categoryCounts = viewportData.categoryCounts
  var topCountries = viewportData.topCountries
  var dataBounds = viewportData.dataBounds
  var yearHistogram = viewportData.yearHistogram
  var loading = viewportData.loading
  var error = viewportData.error
  var supercluster = viewportData.supercluster
  var getReport = viewportData.getReport

  var selectedReport: ReportProperties | null = useMemo(function() {
    if (!selectedReportId) return null
    return getReport(selectedReportId) || null
  }, [selectedReportId, getReport])

  var handleViewportChange = useCallback(function(newBounds: [number, number, number, number], newZoom: number) {
    setBounds(newBounds)
    setZoom(newZoom)
  }, [])

  var handleSelectReport = useCallback(function(id: string) {
    setSelectedReportId(id)
    setBottomSheetSnap('half')
  }, [setSelectedReportId])

  var handleCloseReport = useCallback(function() {
    setSelectedReportId(null)
    setBottomSheetSnap('peek')
  }, [setSelectedReportId])

  var handleLocateMe = useCallback(function() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        setFlyToTarget({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          zoom: 5,
        })
      },
      function() { /* silently fail */ },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [])

  var handleDateChange = useCallback(function(from: number | null, to: number | null) {
    setFilters({ ...filters, dateFrom: from, dateTo: to })
  }, [filters, setFilters])

  var handleToggleHeatmap = useCallback(function() {
    setHeatmapActive(!heatmapActive)
  }, [heatmapActive, setHeatmapActive])

  return (
    <div className="fixed inset-0 bg-gray-950" style={{ top: 'calc(56px + 48px + env(safe-area-inset-top, 0px))' }}>
      {/* Map fills viewport below tabs */}
      <MapContainer
        features={features}
        allPoints={allPointsGeoJSON}
        supercluster={supercluster}
        heatmapActive={heatmapActive}
        selectedReportId={selectedReportId}
        onSelectReport={handleSelectReport}
        onViewportChange={handleViewportChange}
        dataBounds={dataBounds}
        flyToTarget={flyToTarget}
        basemapStyle={basemapStyle}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 bg-gray-900/90 backdrop-blur-sm rounded-full border border-gray-700/50">
          <Loader className="animate-spin text-purple-400" size={14} />
          <span className="text-xs text-gray-300">Loading map data...</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-red-900/90 backdrop-blur-sm rounded-lg border border-red-700/50">
          <AlertCircle size={14} className="text-red-400" />
          <span className="text-xs text-red-200">{error}</span>
        </div>
      )}

      {/* Desktop: Filter panel toggle */}
      <button
        onClick={function() { setFilterPanelOpen(!filterPanelOpen) }}
        className="hidden lg:flex absolute top-4 left-4 z-20 items-center gap-2 px-3 py-2 bg-gray-900/90 backdrop-blur-sm border border-gray-700/50 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-800 transition-all shadow-lg"
      >
        <Filter size={15} />
        <span>Filters</span>
        {filteredCount !== totalReports && (
          <span className="ml-1 px-1.5 py-0.5 bg-purple-600 text-white text-[10px] font-medium rounded-full">
            {filteredCount}
          </span>
        )}
      </button>

      {/* Desktop: Filter panel drawer */}
      {filterPanelOpen && (
        <div className="hidden lg:block absolute top-0 left-0 bottom-0 z-20">
          <MapFilterPanel
            filters={filters}
            onFilterChange={setFilter}
            onReset={resetFilters}
            filteredCount={filteredCount}
            totalCount={totalReports}
            onClose={function() { setFilterPanelOpen(false) }}
          />
        </div>
      )}

      {/* Desktop: Selected report panel */}
      {selectedReport && (
        <div className="hidden lg:block absolute top-4 right-16 z-20 w-[340px]">
          <MapReportCard report={selectedReport} onClose={handleCloseReport} />
        </div>
      )}

      {/* Desktop: Timeline bar */}
      <div className="hidden lg:block absolute bottom-0 left-0 right-0 z-20 px-16 py-3 bg-gray-950/80 backdrop-blur-sm border-t border-gray-800/30">
        <MapTimeline
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onDateChange={handleDateChange}
          yearHistogram={yearHistogram}
        />
      </div>

      {/* Map controls */}
      <MapControls
        heatmapActive={heatmapActive}
        onToggleHeatmap={handleToggleHeatmap}
        onLocateMe={handleLocateMe}
        basemapStyle={basemapStyle}
        onBasemapChange={setBasemapStyle}
        className="absolute bottom-4 right-4 z-20 lg:bottom-[90px] lg:right-6 max-lg:bottom-[150px]"
      />

      {/* Mobile: Filter button */}
      <button
        onClick={function() { setBottomSheetSnap('full') }}
        className="lg:hidden absolute top-4 right-4 z-20 flex items-center justify-center w-10 h-10 bg-gray-900/90 backdrop-blur-sm border border-gray-700/50 rounded-lg text-gray-300 shadow-lg"
        aria-label="Open filters"
      >
        <Filter size={18} />
      </button>

      {/* Mobile: Stat bar */}
      {!loading && (
        <div className="lg:hidden absolute top-4 left-4 right-16 z-20">
          <div className="px-3 py-1.5 bg-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-700/50">
            <span className="text-xs text-gray-300">
              {filteredCount === totalReports
                ? totalReports.toLocaleString() + ' sightings'
                : filteredCount.toLocaleString() + ' of ' + totalReports.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Mobile: Bottom sheet */}
      <MapBottomSheet
        snap={bottomSheetSnap}
        onSnapChange={setBottomSheetSnap}
        selectedReport={selectedReport}
        onCloseReport={handleCloseReport}
        filters={filters}
        onFilterChange={setFilter}
        onResetFilters={resetFilters}
        filteredCount={filteredCount}
        totalCount={totalReports}
        categoryCounts={categoryCounts}
        topCountries={topCountries}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onDateChange={handleDateChange}
        yearHistogram={yearHistogram}
      />
    </div>
  )
}


// ═══════════════════════════════════════════════════════════
// BROWSE MODE — category tiles → subcategory → report list
// Absorbs /explore category browsing + /phenomena encyclopedia
// ═══════════════════════════════════════════════════════════

function ExploreBrowseMode() {
  var router = useRouter()
  var [reports, setReports] = useState<Partial<Report>[]>([])
  var [loading, setLoading] = useState(true)
  var [totalCount, setTotalCount] = useState(0)
  var [baselineCount, setBaselineCount] = useState(0)
  var [page, setPage] = useState(1)
  var perPage = 12

  // View state: 'categories' (tile grid) or 'reports' (filtered list)
  var [browseView, setBrowseView] = useState<'categories' | 'reports'>('categories')

  // Phenomena browsing state
  var [phenomena, setPhenomena] = useState<PhenomenonEntry[]>([])
  var [phenomenaLoading, setPhenomenaLoading] = useState(false)
  var [selectedCategoryForPhenomena, setSelectedCategoryForPhenomena] = useState<string | null>(null)

  // Feed sections for category discover
  var [feedSections, setFeedSections] = useState<FeedSection[]>([])
  var [feedLoading, setFeedLoading] = useState(true)

  // Live category counts and latest reports for redesigned browse
  var [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  var [categoryLatestTitle, setCategoryLatestTitle] = useState<Record<string, string>>({})
  var [latestReports, setLatestReports] = useState<FeedReport[]>([])
  var [latestLoading, setLatestLoading] = useState(true)

  useEffect(function() {
    async function fetchTotalCount() {
      try {
        var res = await fetch('/api/public/stats')
        if (res.ok) {
          var data = await res.json()
          setBaselineCount(data.total || 0)
          setTotalCount(data.total || 0)
        }
      } catch (_e) {
        setBaselineCount(0)
      }
    }
    fetchTotalCount()
  }, [])

  // Fetch live category counts + latest report title per category + latest 4 reports
  useEffect(function() {
    async function fetchCategoryData() {
      setLatestLoading(true)
      try {
        // Category counts + latest title per category — one query per category
        // Using head:true count queries to avoid Supabase's default row limit
        var catKeys = Object.keys(CATEGORY_CONFIG)
        var countPromises = catKeys.map(function(cat) {
          return supabase
            .from('reports')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'approved')
            .eq('category', cat)
        })
        var latestPromises = catKeys.map(function(cat) {
          return supabase
            .from('reports')
            .select('title,category')
            .eq('status', 'approved')
            .eq('category', cat)
            .order('created_at', { ascending: false })
            .limit(1)
        })
        var countResults = await Promise.all(countPromises)
        var latestResults = await Promise.all(latestPromises)
        var counts: Record<string, number> = {}
        var latestPerCat: Record<string, string> = {}
        countResults.forEach(function(res, idx) {
          if (!res.error && typeof res.count === 'number') {
            counts[catKeys[idx]] = res.count
          }
        })
        setCategoryCounts(counts)
        latestResults.forEach(function(res, idx) {
          if (!res.error && res.data && res.data.length > 0) {
            latestPerCat[catKeys[idx]] = (res.data[0] as any).title
          }
        })
        setCategoryLatestTitle(latestPerCat)

        // Latest 4 reports across all categories
        var latestRes = await supabase
          .from('reports')
          .select('id,title,slug,summary,category,country,city,state_province,event_date,credibility,upvotes,view_count,comment_count,created_at,location_name,source_type,source_label,has_photo_video,has_physical_evidence')
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(4)
        if (!latestRes.error && latestRes.data) {
          setLatestReports(latestRes.data as FeedReport[])
        }
      } catch (err) {
        console.error('Error fetching category data:', err)
      } finally {
        setLatestLoading(false)
      }
    }
    fetchCategoryData()
  }, [])

  // Filters
  var [category, setCategory] = useState<PhenomenonCategory | 'all'>('all')
  var [selectedCategories, setSelectedCategories] = useState<PhenomenonCategory[]>([])
  var [selectedTypes, setSelectedTypes] = useState<string[]>([])
  var [searchQuery, setSearchQuery] = useState('')
  var [country, setCountry] = useState('')
  var [credibility, setCredibility] = useState<CredibilityLevel | ''>('')
  var [dateFrom, setDateFrom] = useState('')
  var [dateTo, setDateTo] = useState('')
  var [sort, setSort] = useState<SortOption>('newest')
  var [hasEvidence, setHasEvidence] = useState(false)
  var [hasMedia, setHasMedia] = useState(false)
  var [featured, setFeatured] = useState(false)
  var [contentType, setContentType] = useState<ContentType | 'all' | 'primary'>('primary')
  var [showFilters, setShowFilters] = useState(false)

  // Restore filter state from URL on mount
  useEffect(function() {
    if (!router.isReady) return
    var q = router.query
    if (q.category && typeof q.category === 'string' && q.category !== 'all') {
      setCategory(q.category as PhenomenonCategory)
      setBrowseView('reports')
    }
    if (q.q && typeof q.q === 'string') setSearchQuery(q.q)
    if (q.view === 'reports') setBrowseView('reports')
  }, [router.isReady])

  // Auth state
  var [user, setUser] = useState<any>(null)
  useEffect(function() {
    supabase.auth.getSession().then(function(result) {
      setUser(result.data.session?.user || null)
    })
    var sub = supabase.auth.onAuthStateChange(function(_event, session) {
      setUser(session?.user || null)
    })
    return function() { sub.data.subscription.unsubscribe() }
  }, [])

  // Fetch personalized feed sections
  useEffect(function() {
    async function fetchFeed() {
      setFeedLoading(true)
      try {
        var headers: Record<string, string> = {}
        var sessionResult = await supabase.auth.getSession()
        if (sessionResult.data.session?.access_token) {
          headers['Authorization'] = 'Bearer ' + sessionResult.data.session.access_token
        }
        var res = await fetch('/api/feed/personalized', { headers: headers })
        if (res.ok) {
          var data = await res.json()
          var validSections = (data.sections || []).filter(function(s: FeedSection) {
            return (s.reports && s.reports.length > 0) || (s.phenomena && s.phenomena.length > 0)
          })
          setFeedSections(validSections)
        }
      } catch (err) {
        console.error('Feed fetch error:', err)
      } finally {
        setFeedLoading(false)
      }
    }
    fetchFeed()
  }, [])

  // Load reports when in report list view
  var loadReports = useCallback(async function() {
    setLoading(true)
    try {
      if (selectedTypes.length > 0) {
        var linkRes = await supabase
          .from('report_phenomena')
          .select('report_id')
          .in('phenomenon_id', selectedTypes)
        if (linkRes.error) throw linkRes.error
        if (!linkRes.data || linkRes.data.length === 0) {
          setReports([]); setTotalCount(0); setLoading(false); return
        }
        var reportIds = Array.from(new Set(linkRes.data.map(function(l: any) { return l.report_id })))
        var query = supabase
          .from('reports')
          .select('id,title,slug,summary,category,country,city,state_province,event_date,credibility,upvotes,view_count,comment_count,has_photo_video,has_physical_evidence,featured,location_name,source_type,source_label,created_at')
          .in('id', reportIds)
          .eq('status', 'approved')
        if (category !== 'all') query = query.eq('category', category)
        if (selectedCategories.length > 0) query = query.in('category', selectedCategories)
        if (searchQuery) {
          var words = searchQuery.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
          var pattern = '%' + words.join('%') + '%'
          query = query.or('title.ilike.' + pattern + ',summary.ilike.' + pattern)
        }
        if (country) query = query.eq('country', country)
        if (credibility) query = query.eq('credibility', credibility)
        if (dateFrom) query = query.gte('event_date', dateFrom)
        if (dateTo) query = query.lte('event_date', dateTo)
        if (hasEvidence) query = query.or('has_physical_evidence.eq.true,has_photo_video.eq.true')
        if (featured) query = query.eq('featured', true)
        if (contentType === 'primary') {
          query = query.or('content_type.in.(experiencer_report,historical_case,research_analysis),content_type.is.null')
        } else if (contentType !== 'all') {
          query = query.eq('content_type', contentType)
        }
        switch (sort) {
          case 'oldest': query = query.order('event_date', { ascending: true, nullsFirst: false }); break
          case 'popular': query = query.order('upvotes', { ascending: false }); break
          case 'most_viewed': query = query.order('view_count', { ascending: false }); break
          default: query = query.order('created_at', { ascending: false })
        }
        var from = (page - 1) * perPage
        query = query.range(from, from + perPage - 1)
        var result = await query
        if (result.error) throw result.error
        setReports(result.data || [])
        setTotalCount(reportIds.length)
      } else {
        var q2 = supabase
          .from('reports')
          .select('id,title,slug,summary,category,country,city,state_province,event_date,credibility,upvotes,view_count,comment_count,has_photo_video,has_physical_evidence,featured,location_name,source_type,source_label,created_at')
          .eq('status', 'approved')
        if (category !== 'all') q2 = q2.eq('category', category)
        if (selectedCategories.length > 0) q2 = q2.in('category', selectedCategories)
        if (searchQuery) {
          var w = searchQuery.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
          var p = '%' + w.join('%') + '%'
          q2 = q2.or('title.ilike.' + p + ',summary.ilike.' + p)
        }
        if (country) q2 = q2.eq('country', country)
        if (credibility) q2 = q2.eq('credibility', credibility)
        if (dateFrom) q2 = q2.gte('event_date', dateFrom)
        if (dateTo) q2 = q2.lte('event_date', dateTo)
        if (hasEvidence) q2 = q2.or('has_physical_evidence.eq.true,has_photo_video.eq.true')
        if (featured) q2 = q2.eq('featured', true)
        if (contentType === 'primary') {
          q2 = q2.or('content_type.in.(experiencer_report,historical_case,research_analysis),content_type.is.null')
        } else if (contentType !== 'all') {
          q2 = q2.eq('content_type', contentType)
        }
        switch (sort) {
          case 'oldest': q2 = q2.order('event_date', { ascending: true, nullsFirst: false }); break
          case 'popular': q2 = q2.order('upvotes', { ascending: false }); break
          case 'most_viewed': q2 = q2.order('view_count', { ascending: false }); break
          default: q2 = q2.order('created_at', { ascending: false })
        }
        var from2 = (page - 1) * perPage
        q2 = q2.range(from2, from2 + perPage - 1)
        var result2 = await q2
        if (result2.error) throw result2.error
        setReports(result2.data || [])
        var hasFilters = category !== 'all' || selectedCategories.length > 0 ||
          searchQuery || country || credibility || dateFrom || dateTo || hasEvidence || hasMedia || featured
        if (hasFilters || contentType !== 'primary') {
          try {
            var cq = supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'approved')
            if (category !== 'all') cq = cq.eq('category', category)
            if (selectedCategories.length > 0) cq = cq.in('category', selectedCategories)
            if (searchQuery) {
              var cw = searchQuery.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
              var cp = '%' + cw.join('%') + '%'
              cq = cq.or('title.ilike.' + cp + ',summary.ilike.' + cp)
            }
            if (country) cq = cq.eq('country', country)
            if (credibility) cq = cq.eq('credibility', credibility)
            if (dateFrom) cq = cq.gte('event_date', dateFrom)
            if (dateTo) cq = cq.lte('event_date', dateTo)
            if (hasEvidence) cq = cq.or('has_physical_evidence.eq.true,has_photo_video.eq.true')
            if (featured) cq = cq.eq('featured', true)
            if (contentType === 'primary') {
              cq = cq.or('content_type.in.(experiencer_report,historical_case,research_analysis),content_type.is.null')
            } else if (contentType !== 'all') {
              cq = cq.eq('content_type', contentType)
            }
            var countResult = await cq
            setTotalCount(countResult.count || 0)
          } catch (_e2) {
            setTotalCount((result2.data?.length || 0) + ((result2.data?.length || 0) === perPage ? (page * perPage) : 0))
          }
        } else {
          setTotalCount(baselineCount)
        }
      }
    } catch (err) {
      console.error('Error loading reports:', err)
      setReports([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [category, selectedCategories, selectedTypes, searchQuery, country, credibility, dateFrom, dateTo, sort, hasEvidence, hasMedia, featured, contentType, page, baselineCount])

  useEffect(function() {
    if (browseView === 'reports') loadReports()
  }, [loadReports, browseView])

  // Load phenomena for a category
  var loadPhenomena = useCallback(async function(cat: string) {
    setPhenomenaLoading(true)
    try {
      var q = supabase
        .from('phenomena')
        .select('id,name,slug,category,icon,ai_summary,report_count,primary_image_url,aliases,ai_quick_facts')
        .eq('category', cat)
        .order('report_count', { ascending: false })
        .limit(500)
      var result = await q
      if (result.error) throw result.error
      setPhenomena(result.data || [])
    } catch (err) {
      console.error('Error loading phenomena:', err)
      setPhenomena([])
    } finally {
      setPhenomenaLoading(false)
    }
  }, [])

  function clearFilters() {
    setCategory('all')
    setSelectedCategories([])
    setSelectedTypes([])
    setSearchQuery('')
    setCountry('')
    setCredibility('')
    setDateFrom('')
    setDateTo('')
    setHasEvidence(false)
    setHasMedia(false)
    setFeatured(false)
    setContentType('primary')
    setSort('newest')
    setPage(1)
  }

  var hasActiveFilters = category !== 'all' || selectedCategories.length > 0 ||
    selectedTypes.length > 0 || searchQuery || country || credibility ||
    dateFrom || dateTo || hasEvidence || hasMedia || featured || contentType !== 'primary'

  var totalPages = Math.ceil(totalCount / perPage)

  function scrollContainer(id: string, direction: 'left' | 'right') {
    var el = document.getElementById(id)
    if (el) el.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' })
  }

  function getSectionIcon(id: string) {
    if (id === 'for_you') return <Sparkles className="w-5 h-5 text-primary-400" />
    if (id === 'trending') return <TrendingUp className="w-5 h-5 text-orange-400" />
    if (id === 'near_you') return <MapPin className="w-5 h-5 text-blue-400" />
    if (id === 'because_saved') return <Heart className="w-5 h-5 text-pink-400" />
    if (id === 'recent') return <Clock className="w-5 h-5 text-emerald-400" />
    if (id === 'spotlight') return <BookOpen className="w-5 h-5 text-purple-400" />
    if (id.startsWith('category_')) return <Library className="w-5 h-5 text-amber-400" />
    return <Sparkles className="w-5 h-5 text-gray-400" />
  }

  // Handler for tapping a category tile
  function handleCategoryTap(catKey: string) {
    setSelectedCategoryForPhenomena(catKey)
    loadPhenomena(catKey)
  }

  // Back from phenomena to category grid
  function handleBackToCategories() {
    setSelectedCategoryForPhenomena(null)
    setPhenomena([])
  }

  // Drill into reports for a category
  function handleViewReports(catKey: string) {
    setCategory(catKey as PhenomenonCategory)
    setBrowseView('reports')
    setPage(1)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* CATEGORIES VIEW — redesigned: Latest Reports → Categories → Encyclopedia → Map */}
      {browseView === 'categories' && !selectedCategoryForPhenomena && (
        <>
          {/* ─── 1. LATEST REPORTS — immediate content preview ─── */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-semibold text-white">Latest Reports</h2>
              </div>
              <button
                onClick={function() { setBrowseView('reports') }}
                className="flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300 transition-colors"
              >
                View all {baselineCount > 0 ? baselineCount.toLocaleString() : ''} reports
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {latestLoading ? (
              <div className="flex gap-3 overflow-hidden">
                {[1,2,3,4].map(function(j) { return <div key={j} className="min-w-[260px] sm:min-w-[300px] h-40 skeleton rounded-xl flex-shrink-0" /> })}
              </div>
            ) : (
              <div className="relative">
                <div id="latest-reports-scroll" className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory pr-8">
                  {latestReports.map(function(report) {
                    var catConfig = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
                    var accent = CATEGORY_ACCENT[report.category] || CATEGORY_ACCENT.combination
                    var CatIcon = CATEGORY_LUCIDE_ICONS[report.category] || Layers
                    var locationParts = [report.city || report.location_name, report.state_province].filter(Boolean)
                    var locationStr = locationParts.length > 0 ? locationParts.slice(0, 2).join(', ') : null
                    var timeAgo = formatRelativeDate(report.created_at)
                    return (
                      <Link
                        key={report.id}
                        href={'/report/' + report.slug}
                        className="min-w-[270px] sm:min-w-[310px] max-w-[290px] sm:max-w-[330px] flex-shrink-0 snap-start rounded-xl border border-white/10 hover:border-primary-500/30 bg-white/[0.02] hover:bg-white/[0.04] p-4 sm:p-5 transition-all group/card flex flex-col"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <div className={classNames('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', catConfig.bgColor)}>
                            <CatIcon className={classNames('w-4 h-4', accent.icon)} />
                          </div>
                          <span className={classNames('text-[11px] px-2 py-0.5 rounded-full font-medium', catConfig.bgColor, catConfig.color)}>{catConfig.label}</span>
                          {report.source_label && <span className="text-[11px] text-gray-500 ml-auto truncate max-w-[80px]">{report.source_label}</span>}
                        </div>
                        <h3 className="font-medium text-white text-sm line-clamp-2 mb-2 group-hover/card:text-primary-300 transition-colors">{report.title}</h3>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 mt-auto pt-2 border-t border-white/5">
                          {locationStr && <span className="flex items-center gap-1 truncate max-w-[120px]"><MapPin className="w-3 h-3 flex-shrink-0" />{locationStr}</span>}
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3 flex-shrink-0" />{timeAgo}</span>
                        </div>
                      </Link>
                    )
                  })}
                  {/* "View all" end card */}
                  <button
                    onClick={function() { setBrowseView('reports') }}
                    className="min-w-[140px] sm:min-w-[160px] flex-shrink-0 snap-start flex flex-col items-center justify-center rounded-xl border border-white/10 hover:border-primary-500/30 bg-white/[0.02] hover:bg-white/[0.04] transition-all gap-2 px-6"
                  >
                    <ArrowRight className="w-6 h-6 text-primary-400" />
                    <span className="text-sm font-medium text-primary-400">View all</span>
                    {baselineCount > 0 && <span className="text-xs text-gray-500">{baselineCount.toLocaleString()} reports</span>}
                  </button>
                </div>
                <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[#0a0a1a] to-transparent pointer-events-none" />
              </div>
            )}
          </div>

          {/* ─── 2. BROWSE BY CATEGORY — redesigned with Lucide icons + live counts ─── */}
          <div className="mb-8">
            <div className="flex items-center gap-2.5 mb-4">
              <Grid3X3 className="w-5 h-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">Browse by Category</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(CATEGORY_CONFIG).map(function(entry) {
                var key = entry[0]
                var config = entry[1]
                var CatIcon = CATEGORY_LUCIDE_ICONS[key] || Layers
                var accent = CATEGORY_ACCENT[key] || CATEGORY_ACCENT.combination
                var count = categoryCounts[key] || 0
                var latestTitle = categoryLatestTitle[key] || ''
                return (
                  <button
                    key={key}
                    onClick={function() { handleCategoryTap(key) }}
                    className={classNames(
                      'relative overflow-hidden rounded-xl p-4 sm:p-5 text-left transition-all hover:scale-[1.02] border group',
                      'bg-gradient-to-br',
                      CATEGORY_GRADIENTS[key] || 'from-gray-900 to-gray-950',
                      'border-white/10 hover:' + accent.border.replace('border-', 'border-'),
                      'hover:shadow-lg',
                      accent.glow
                    )}
                    style={{ minHeight: '6rem' }}
                  >
                    <CatIcon className={classNames('w-7 h-7 sm:w-8 sm:h-8 mb-2 transition-transform group-hover:scale-110', accent.icon)} />
                    <span className="text-sm sm:text-base font-semibold text-white block leading-tight">{config.label}</span>
                    <span className="text-xs text-gray-400 mt-1 block tabular-nums">
                      {count > 0 ? count.toLocaleString() + ' reports' : 'Explore'}
                    </span>
                    {/* Hover preview: most recent report title */}
                    {latestTitle && (
                      <span className="absolute bottom-0 left-0 right-0 px-4 py-2 text-[11px] text-gray-300 bg-gray-950/90 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity line-clamp-1 border-t border-white/5">
                        Latest: {latestTitle}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ─── 3. ENCYCLOPEDIA SPOTLIGHT (personalized feed) ─── */}
          {!feedLoading && feedSections.length > 0 && (
            <div className="space-y-6 sm:space-y-10">
              {feedSections.map(function(section, sectionIndex) {
                return (
                  <React.Fragment key={section.id}>
                    {/* Soft-wall signup after 2nd section */}
                    {sectionIndex === 2 && !user && (
                      <div className="relative overflow-hidden rounded-2xl border border-primary-500/20 bg-gradient-to-br from-primary-950/60 via-gray-900 to-purple-950/40 p-6 sm:p-8">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
                        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                          <div className="flex-1">
                            <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Enjoying what you see?</h3>
                            <p className="text-sm text-gray-400 max-w-lg">Create a free account to save reports, get personalized recommendations, and receive weekly digests of new discoveries.</p>
                          </div>
                          <Link href="/login" className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-full font-medium text-sm transition-colors whitespace-nowrap flex-shrink-0">
                            <UserPlus className="w-4 h-4" /> Create Free Account
                          </Link>
                        </div>
                      </div>
                    )}

                    <div className="group/section">
                      <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <div className="flex items-center gap-2.5">
                          {getSectionIcon(section.id)}
                          <div>
                            <h2 className="text-base sm:text-lg font-semibold text-white">{section.title}</h2>
                            <p className="text-xs text-gray-500">{section.subtitle}</p>
                          </div>
                        </div>
                        <div className="hidden sm:flex gap-1 opacity-0 group-hover/section:opacity-100 transition-opacity">
                          <button onClick={function() { scrollContainer('feed-' + section.id, 'left') }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400"><ChevronLeft className="w-4 h-4" /></button>
                          <button onClick={function() { scrollContainer('feed-' + section.id, 'right') }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400"><ChevronRightIcon className="w-4 h-4" /></button>
                        </div>
                      </div>

                      {/* Phenomena sections */}
                      {section.type === 'phenomena' && section.phenomena && (
                        <div className="relative">
                          <div id={'feed-' + section.id} className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory pr-8">
                            {section.phenomena.map(function(item) {
                              var config2 = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
                              var hasImage = item.primary_image_url && item.primary_image_url.indexOf('default-cryptid') === -1
                              return (
                                <Link key={item.id} href={'/phenomena/' + item.slug} className="min-w-[75vw] sm:min-w-[260px] max-w-[80vw] sm:max-w-[280px] flex-shrink-0 snap-start group/card relative overflow-hidden rounded-xl border border-white/10 hover:border-primary-500/30 transition-all">
                                  {hasImage ? (
                                    <div className="relative h-44 sm:h-48 overflow-hidden">
                                      <img src={item.primary_image_url!} alt="" className="absolute inset-0 w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" loading="lazy" />
                                      <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent" />
                                    </div>
                                  ) : (
                                    <div className={classNames('relative h-44 sm:h-48 flex items-center justify-center', config2.bgColor)}>
                                      <span className="text-6xl opacity-40 group-hover/card:scale-110 transition-transform">{item.icon || config2.icon}</span>
                                      <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/30 to-transparent" />
                                    </div>
                                  )}
                                  <div className="absolute bottom-0 left-0 right-0 p-4">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <span className={classNames('text-xs px-2 py-0.5 rounded-full font-medium', config2.bgColor, config2.color)}>{config2.icon} {config2.label}</span>
                                      {item.report_count > 0 && <span className="text-[11px] text-gray-400">{item.report_count} reports</span>}
                                    </div>
                                    <h3 className="font-semibold text-white text-base sm:text-lg line-clamp-1 group-hover/card:text-primary-300 transition-colors">{item.name}</h3>
                                    {item.ai_summary && <p className="text-xs text-gray-400 line-clamp-2 mt-1 leading-relaxed">{item.ai_summary}</p>}
                                  </div>
                                </Link>
                              )
                            })}
                            <Link href="/explore?mode=browse" className="min-w-[50vw] sm:min-w-[180px] flex-shrink-0 snap-start flex flex-col items-center justify-center rounded-xl border border-white/10 hover:border-primary-500/30 bg-white/[0.02] hover:bg-white/[0.04] transition-all gap-3 px-6">
                              <BookOpen className="w-8 h-8 text-primary-400" />
                              <span className="text-sm font-medium text-primary-400">Browse Encyclopedia</span>
                              <span className="text-xs text-gray-500">4,792 phenomena</span>
                            </Link>
                          </div>
                          <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[#0a0a1a] to-transparent pointer-events-none" />
                        </div>
                      )}

                      {/* Report sections */}
                      {section.type === 'reports' && section.reports && (
                        <div className="relative">
                          <div id={'feed-' + section.id} className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory pr-8">
                            {section.reports.map(function(report) {
                              var catConfig = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
                              var credConfig = report.credibility ? (CREDIBILITY_CONFIG as any)[report.credibility] : null
                              var locationParts = [report.city || report.location_name, report.state_province, report.country].filter(Boolean)
                              var locationStr = locationParts.length > 0 ? locationParts.slice(0, 2).join(', ') : null
                              return (
                                <Link key={report.id} href={'/report/' + report.slug} className="min-w-[270px] sm:min-w-[310px] max-w-[290px] sm:max-w-[330px] flex-shrink-0 snap-start glass-card p-4 sm:p-5 hover:border-primary-500/30 transition-all group/card flex flex-col">
                                  <div className="flex items-start gap-3 mb-2.5">
                                    <div className={classNames('w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0', catConfig.bgColor)}>{catConfig.icon}</div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={classNames('text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-medium', catConfig.bgColor, catConfig.color)}>{catConfig.label}</span>
                                        {credConfig && <span className={classNames('text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-medium', credConfig.bgColor, credConfig.color)}>{credConfig.label}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <h3 className="font-medium text-white text-sm line-clamp-2 mb-1.5 group-hover/card:text-primary-300 transition-colors">{report.title}</h3>
                                  {report.summary && <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{report.summary}</p>}
                                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 mt-auto pt-2 border-t border-white/5">
                                    {locationStr && <span className="flex items-center gap-1 truncate max-w-[140px]"><MapPin className="w-3 h-3 flex-shrink-0" />{locationStr}</span>}
                                    {report.event_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3 flex-shrink-0" />{new Date(report.event_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>}
                                    {report.view_count > 0 && <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{report.view_count}</span>}
                                  </div>
                                </Link>
                              )
                            })}
                          </div>
                          <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[#0a0a1a] to-transparent pointer-events-none" />
                        </div>
                      )}
                    </div>

                    {/* ─── 4. MAP SPOTLIGHT — after first feed section ─── */}
                    {sectionIndex === 0 && <MapSpotlightRow />}
                  </React.Fragment>
                )
              })}
            </div>
          )}

          {/* Map Spotlight fallback when no feed sections yet */}
          {!feedLoading && feedSections.length === 0 && <MapSpotlightRow />}

          {feedLoading && (
            <div className="space-y-8">
              <div><div className="h-6 w-56 skeleton rounded mb-4" /><div className="flex gap-4 overflow-hidden">{[1,2,3].map(function(j) { return <div key={j} className="min-w-[240px] sm:min-w-[280px] h-56 skeleton rounded-xl flex-shrink-0" /> })}</div></div>
            </div>
          )}
        </>
      )}

      {/* PHENOMENA VIEW — subcategory drill-down */}
      {browseView === 'categories' && selectedCategoryForPhenomena && (
        <>
          <button onClick={handleBackToCategories} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back to Categories
          </button>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{(CATEGORY_CONFIG as any)[selectedCategoryForPhenomena]?.icon || '🔮'}</span>
              <div>
                <h2 className="text-xl font-bold text-white">{(CATEGORY_CONFIG as any)[selectedCategoryForPhenomena]?.label || selectedCategoryForPhenomena}</h2>
                <p className="text-sm text-gray-500">{phenomena.length} phenomena</p>
              </div>
            </div>
            <button onClick={function() { handleViewReports(selectedCategoryForPhenomena!) }} className="px-4 py-2 bg-primary-500/10 border border-primary-500/20 rounded-lg text-primary-400 text-sm font-medium hover:bg-primary-500/20 transition-all">
              View Reports
            </button>
          </div>

          {phenomenaLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[1,2,3,4,5,6,7,8].map(function(i) { return <div key={i} className="h-48 skeleton rounded-xl" /> })}
            </div>
          ) : phenomena.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">No phenomena found in this category.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {phenomena.map(function(item) {
                var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
                var hasImage = item.primary_image_url && item.primary_image_url.indexOf('default-cryptid') === -1
                return (
                  <Link key={item.id} href={'/phenomena/' + item.slug} className="group/card relative overflow-hidden rounded-xl border border-white/10 hover:border-primary-500/30 transition-all">
                    {hasImage ? (
                      <div className="relative h-36 sm:h-44 overflow-hidden">
                        <img src={item.primary_image_url!} alt="" className="absolute inset-0 w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent" />
                      </div>
                    ) : (
                      <div className={classNames('relative h-36 sm:h-44 flex items-center justify-center bg-gradient-to-br', CATEGORY_GRADIENTS[item.category] || 'from-gray-900 to-gray-950')}>
                        <span className="text-4xl opacity-40 group-hover/card:scale-110 transition-transform">{item.icon || config.icon}</span>
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/30 to-transparent" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <h3 className="font-semibold text-white text-sm line-clamp-1 group-hover/card:text-primary-300 transition-colors">{item.name}</h3>
                      {item.report_count > 0 && <span className="text-[11px] text-gray-400">{item.report_count} reports</span>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* REPORTS VIEW — filtered report list */}
      {browseView === 'reports' && (
        <>
          <button onClick={function() { setBrowseView('categories'); setCategory('all'); setPage(1) }} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back to Categories
          </button>

          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {category !== 'all' ? ((CATEGORY_CONFIG as any)[category]?.label || 'Reports') : 'All Reports'}
              </h2>
              <p className="text-xs text-gray-500">
                <span className="tabular-nums font-medium text-gray-400">{totalCount.toLocaleString()}</span> encounters
              </p>
            </div>
          </div>

          {/* Content Type Filter */}
          <div className="mb-6 p-3 sm:p-4 glass-card">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-sm text-gray-400 whitespace-nowrap">Show:</span>
              <div className="flex flex-wrap gap-2">
                <button onClick={function() { setContentType('primary'); setPage(1) }} className={classNames('px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5', contentType === 'primary' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10')}>Experiencer Reports</button>
                <button onClick={function() { setContentType('all'); setPage(1) }} className={classNames('px-3 py-1.5 rounded-lg text-sm font-medium transition-all', contentType === 'all' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10')}>All Content</button>
                <button onClick={function() { setContentType('news_discussion' as any); setPage(1) }} className={classNames('px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5', contentType === 'news_discussion' ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30' : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10')}>News & Discussion</button>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <CategoryFilter selected={category} onChange={function(cat: any) { setCategory(cat); setPage(1) }} />
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="text" placeholder="Search reports..." value={searchQuery} onChange={function(e: any) { setSearchQuery(e.target.value); setPage(1) }} className="w-full pl-10 pr-4 py-2.5" />
            </div>
            <div className="flex gap-2">
              <button onClick={function() { setShowFilters(!showFilters) }} className={classNames('btn', showFilters || hasActiveFilters ? 'btn-primary' : 'btn-secondary')}>
                <SlidersHorizontal className="w-4 h-4" /> Filters {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-white" />}
              </button>
              <select value={sort} onChange={function(e: any) { setSort(e.target.value) }} className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm">
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="popular">Most Popular</option>
                <option value="most_viewed">Most Viewed</option>
              </select>
            </div>
          </div>

          {showFilters && (
            <div className="glass-card p-6 mb-6 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-white">Advanced Filters</h3>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-white flex items-center gap-1"><X className="w-4 h-4" /> Clear all</button>
                )}
              </div>
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">Filter by Phenomenon</label>
                <SubcategoryFilter selectedCategories={selectedCategories} selectedTypes={selectedTypes} onCategoriesChange={function(cats: any) { setSelectedCategories(cats); setPage(1) }} onTypesChange={function(types: any) { setSelectedTypes(types); setPage(1) }} compact />
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div><label className="block text-sm text-gray-400 mb-2">Country</label><select value={country} onChange={function(e: any) { setCountry(e.target.value); setPage(1) }} className="w-full"><option value="">All countries</option>{COUNTRIES.map(function(c: string) { return <option key={c} value={c}>{c}</option> })}</select></div>
                <div><label className="block text-sm text-gray-400 mb-2">Credibility</label><select value={credibility} onChange={function(e: any) { setCredibility(e.target.value); setPage(1) }} className="w-full"><option value="">Any credibility</option>{Object.entries(CREDIBILITY_CONFIG).map(function(entry) { return <option key={entry[0]} value={entry[0]}>{(entry[1] as any).label}</option> })}</select></div>
                <div><label className="block text-sm text-gray-400 mb-2">Date From</label><input type="date" value={dateFrom} onChange={function(e: any) { setDateFrom(e.target.value); setPage(1) }} className="w-full" /></div>
                <div><label className="block text-sm text-gray-400 mb-2">Date To</label><input type="date" value={dateTo} onChange={function(e: any) { setDateTo(e.target.value); setPage(1) }} className="w-full" /></div>
              </div>
              <div className="flex flex-wrap gap-4 mt-4">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={hasEvidence} onChange={function(e: any) { setHasEvidence(e.target.checked); setPage(1) }} className="rounded bg-white/5 border-white/20" /><span className="text-sm text-gray-300">Has evidence</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={hasMedia} onChange={function(e: any) { setHasMedia(e.target.checked); setPage(1) }} className="rounded bg-white/5 border-white/20" /><span className="text-sm text-gray-300">Has photos/video</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={featured} onChange={function(e: any) { setFeatured(e.target.checked); setPage(1) }} className="rounded bg-white/5 border-white/20" /><span className="text-sm text-gray-300">Featured only</span></label>
              </div>
            </div>
          )}

          {loading ? (
            <div className="grid md:grid-cols-2 gap-4">{[1,2,3,4,5,6].map(function(i) { return <div key={i} className="glass-card p-5 h-32 skeleton" /> })}</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400">No reports found matching your criteria.</p>
              {hasActiveFilters && <button onClick={clearFilters} className="mt-4 text-primary-400 hover:text-primary-300">Clear filters</button>}
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-4">{reports.map(function(report) { return <ReportCard key={report.id} report={report as any} /> })}</div>
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-8">
                  <button onClick={function() { setPage(Math.max(1, page - 1)) }} disabled={page === 1} className="btn btn-secondary disabled:opacity-50">Previous</button>
                  <span className="flex items-center px-4 text-gray-400">Page {page} of {totalPages}</span>
                  <button onClick={function() { setPage(Math.min(totalPages, page + 1)) }} disabled={page === totalPages} className="btn btn-secondary disabled:opacity-50">Next</button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════
// SEARCH MODE — keyword + AI search, relocated from /search
// ═══════════════════════════════════════════════════════════

function ExploreSearchMode() {
  var router = useRouter()
  var q = router.query.q

  var [query, setQuery] = useState('')
  var [results, setResults] = useState<FulltextResult[]>([])
  var [fallbackResults, setFallbackResults] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  var [loading, setLoading] = useState(false)
  var [searched, setSearched] = useState(false)
  var [showFilters, setShowFilters] = useState(false)
  var [categoryFacets, setCategoryFacets] = useState<Record<string, number>>({})
  var [resultCount, setResultCount] = useState(0)
  var [searchMode, setSearchMode] = useState<'simple' | 'phrase'>('simple')

  // Autocomplete
  var [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([])
  var [showAutocomplete, setShowAutocomplete] = useState(false)
  var [autocompleteLoading, setAutocompleteLoading] = useState(false)
  var autocompleteTimeout = useRef<NodeJS.Timeout | null>(null)
  var inputRef = useRef<HTMLInputElement>(null)

  // AI related patterns
  var [relatedPatterns, setRelatedPatterns] = useState<any[]>([])
  var [relatedLoading, setRelatedLoading] = useState(false)
  var [searchSaved, setSearchSaved] = useState(false)
  var [isLoggedIn, setIsLoggedIn] = useState(false)

  var [filters, setFilters] = useState<SearchFilters>({
    categories: [],
    phenomenonTypes: [],
    hasEvidence: false,
    dateFrom: '',
    dateTo: ''
  })

  useEffect(function() {
    supabase.auth.getSession().then(function(res) {
      if (res.data.session) setIsLoggedIn(true)
    })
  }, [])

  useEffect(function() {
    if (q && typeof q === 'string') {
      setQuery(q)
      performSearch(q)
    }
  }, [q])

  // Debounced autocomplete
  var fetchAutocomplete = useCallback(function(term: string) {
    if (autocompleteTimeout.current) clearTimeout(autocompleteTimeout.current)
    if (term.length < 2) { setAutocompleteItems([]); setShowAutocomplete(false); return }
    autocompleteTimeout.current = setTimeout(async function() {
      setAutocompleteLoading(true)
      try {
        var res = await supabase.from('phenomena').select('name, slug, category').ilike('name', '%' + term + '%').limit(5)
        var items: AutocompleteItem[] = []
        if (res.data) {
          res.data.forEach(function(p: any) {
            var config = CATEGORY_CONFIG[p.category as keyof typeof CATEGORY_CONFIG]
            items.push({ type: 'phenomenon', label: p.name, query: p.name, icon: config ? config.icon : '\u2728' })
          })
        }
        items.unshift({ type: 'suggestion', label: 'Search for "' + term + '"', query: term, icon: '\uD83D\uDD0D' })
        setAutocompleteItems(items)
        setShowAutocomplete(items.length > 0)
      } catch (e) { /* silent */ } finally { setAutocompleteLoading(false) }
    }, 250)
  }, [])

  // Perform search
  async function performSearch(searchQuery: string) {
    if (!searchQuery.trim()) return
    setLoading(true)
    setSearched(true)
    setShowAutocomplete(false)
    setFallbackResults([])

    try {
      var apiUrl = '/api/search/fulltext?q=' + encodeURIComponent(searchQuery.trim()) + '&mode=' + searchMode + '&limit=100'
      if (filters.categories.length === 1) apiUrl = apiUrl + '&category=' + filters.categories[0]
      var resp = await fetch(apiUrl)

      if (resp.ok) {
        var data = await resp.json()
        var reports = data.reports || []
        if (filters.categories.length > 1) {
          reports = reports.filter(function(r: FulltextResult) { return filters.categories.includes(r.category as PhenomenonCategory) })
        }
        if (filters.hasEvidence) {
          reports = reports.filter(function(r: any) { return r.has_physical_evidence || r.has_photo_video })
        }
        setResults(reports)
        setResultCount(reports.length)

        // Build category facets
        var facets: Record<string, number> = {}
        ;(data.reports || []).forEach(function(r: FulltextResult) {
          facets[r.category] = (facets[r.category] || 0) + 1
        })
        setCategoryFacets(facets)
      } else {
        // Fallback to ILIKE
        var fbQuery = supabase.from('reports')
          .select('*, phenomenon_type:phenomenon_types(name,category,slug)')
          .eq('status', 'approved')
          .or('title.ilike.%' + searchQuery.trim() + '%,summary.ilike.%' + searchQuery.trim() + '%')
          .order('created_at', { ascending: false })
          .limit(100)
        if (filters.categories.length > 0) fbQuery = fbQuery.in('category', filters.categories)
        var fbResult = await fbQuery
        if (fbResult.data) {
          setFallbackResults(fbResult.data as any)
          setResultCount(fbResult.data.length)
        }
      }
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setLoading(false)
    }

    // Fetch AI related patterns
    setRelatedLoading(true)
    try {
      var aiResp = await fetch('/api/ai/related?q=' + encodeURIComponent(searchQuery.trim()))
      if (aiResp.ok) {
        var aiData = await aiResp.json()
        setRelatedPatterns(aiData.patterns || [])
      }
    } catch (e) { /* silent */ } finally { setRelatedLoading(false) }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    router.replace({ pathname: '/explore', query: { mode: 'search', q: query.trim() } }, undefined, { shallow: true })
    performSearch(query.trim())
  }

  function handleAutocompleteSelect(item: AutocompleteItem) {
    setQuery(item.query)
    setShowAutocomplete(false)
    router.replace({ pathname: '/explore', query: { mode: 'search', q: item.query } }, undefined, { shallow: true })
    performSearch(item.query)
  }

  function clearSearch() {
    setQuery('')
    setResults([])
    setFallbackResults([])
    setSearched(false)
    setResultCount(0)
    setCategoryFacets({})
    setRelatedPatterns([])
    router.replace({ pathname: '/explore', query: { mode: 'search' } }, undefined, { shallow: true })
  }

  // Popular search suggestions
  var POPULAR_SEARCHES = [
    'Phoenix Lights', 'Roswell', 'Bigfoot', 'Near Death Experience',
    'Skinwalker Ranch', 'Black Triangle UFO', 'Shadow People', 'Mothman',
    'Alien Abduction', 'Poltergeist', 'Rendlesham Forest'
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Search Input */}
      <form onSubmit={handleSearchSubmit} className="relative mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search reports, phenomena, locations..."
            value={query}
            onChange={function(e) {
              setQuery(e.target.value)
              fetchAutocomplete(e.target.value)
            }}
            onFocus={function() { if (autocompleteItems.length > 0) setShowAutocomplete(true) }}
            onBlur={function() { setTimeout(function() { setShowAutocomplete(false) }, 200) }}
            className="w-full pl-12 pr-12 py-4 bg-white/5 border border-white/10 rounded-2xl text-base focus:outline-none focus:border-primary-500 focus:bg-white/[0.08] transition-colors"
          />
          {query && (
            <button type="button" onClick={clearSearch} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {showAutocomplete && autocompleteItems.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded-xl overflow-hidden z-50 shadow-xl">
            {autocompleteItems.map(function(item, i) {
              return (
                <button key={i} type="button" onClick={function() { handleAutocompleteSelect(item) }} className="w-full px-4 py-3 text-left hover:bg-white/5 flex items-center gap-3 transition-colors">
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm text-gray-300">{item.label}</span>
                  <span className="text-xs text-gray-600 ml-auto capitalize">{item.type}</span>
                </button>
              )
            })}
          </div>
        )}
      </form>

      {/* Search Mode Toggle */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          <button onClick={function() { setSearchMode('simple') }} className={classNames('px-3 py-1.5 rounded-md text-sm font-medium transition-all', searchMode === 'simple' ? 'bg-primary-500/20 text-primary-400' : 'text-gray-400 hover:text-white')}>Keywords</button>
          <button onClick={function() { setSearchMode('phrase') }} className={classNames('px-3 py-1.5 rounded-md text-sm font-medium transition-all', searchMode === 'phrase' ? 'bg-primary-500/20 text-primary-400' : 'text-gray-400 hover:text-white')}>Exact Phrase</button>
        </div>
        {searched && <span className="text-sm text-gray-500">{resultCount} results</span>}
      </div>

      {/* Category Facets — shown when results exist */}
      {searched && Object.keys(categoryFacets).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.entries(categoryFacets).sort(function(a, b) { return b[1] - a[1] }).map(function(entry) {
            var catKey = entry[0]
            var count = entry[1]
            var config = (CATEGORY_CONFIG as any)[catKey]
            if (!config) return null
            var isActive = filters.categories.includes(catKey as PhenomenonCategory)
            return (
              <button key={catKey} onClick={function() {
                var newCats = isActive
                  ? filters.categories.filter(function(c) { return c !== catKey })
                  : filters.categories.concat([catKey as PhenomenonCategory])
                setFilters({ ...filters, categories: newCats })
              }} className={classNames('px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5', isActive ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10')}>
                {config.icon} {config.label} <span className="text-gray-600">({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Not searched yet — show popular searches */}
      {!searched && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3">Popular Searches</h3>
          <div className="flex flex-wrap gap-2">
            {POPULAR_SEARCHES.map(function(term) {
              return (
                <button key={term} onClick={function() { setQuery(term); router.replace({ pathname: '/explore', query: { mode: 'search', q: term } }, undefined, { shallow: true }); performSearch(term) }} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 hover:bg-white/10 hover:border-primary-500/20 transition-all">
                  {term}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader className="animate-spin text-primary-400 mr-3" size={20} />
          <span className="text-gray-400">Searching...</span>
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <div className="space-y-4">
          {/* AI Related Patterns */}
          {relatedPatterns.length > 0 && (
            <div className="mb-6 p-4 glass-card border-primary-500/20">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary-400" />
                <span className="text-sm font-medium text-primary-400">Related Patterns</span>
              </div>
              <div className="space-y-2">
                {relatedPatterns.slice(0, 3).map(function(pat: any, i: number) {
                  return (
                    <div key={i} className="text-sm text-gray-300">
                      {pat.title || pat.description || JSON.stringify(pat)}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Fulltext results */}
          {results.length > 0 && results.map(function(report) {
            var config = (CATEGORY_CONFIG as any)[report.category] || CATEGORY_CONFIG.combination
            var locationParts = [report.city || report.location_name, report.state_province, report.country].filter(Boolean)
            return (
              <Link key={report.id} href={'/report/' + report.slug} className="block glass-card p-4 hover:border-primary-500/30 transition-all group">
                <div className="flex items-start gap-3">
                  <div className={classNames('w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0', config.bgColor)}>{config.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={classNames('text-xs px-2 py-0.5 rounded-full font-medium', config.bgColor, config.color)}>{config.label}</span>
                    </div>
                    <h3 className="font-medium text-white text-sm group-hover:text-primary-300 transition-colors line-clamp-2">{report.title}</h3>
                    {report.summary && <p className="text-xs text-gray-500 line-clamp-2 mt-1">{report.summary}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-600">
                      {locationParts.length > 0 && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{locationParts.slice(0, 2).join(', ')}</span>}
                      {report.event_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(report.event_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}

          {/* Fallback results */}
          {fallbackResults.length > 0 && fallbackResults.map(function(report: any) {
            return <ReportCard key={report.id} report={report} />
          })}

          {/* No results */}
          {results.length === 0 && fallbackResults.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No results found for "{q}"</p>
              <p className="text-sm text-gray-600 mt-2">Try different keywords or browse by category</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
