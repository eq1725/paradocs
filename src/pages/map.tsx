'use client'

import React, { useState, useCallback, useMemo } from 'react'
import Head from 'next/head'
import dynamic from 'next/dynamic'
import { Filter, X, Loader, AlertCircle } from 'lucide-react'
import { useMapState } from '@/components/map/useMapState'
import { useViewportData } from '@/components/map/useViewportData'
import { ReportProperties } from '@/components/map/mapStyles'
import MapControls from '@/components/map/MapControls'
import MapFilterPanel from '@/components/map/MapFilterPanel'
import MapBottomSheet from '@/components/map/MapBottomSheet'
import MapReportCard from '@/components/map/MapReportCard'

// Dynamic import to avoid SSR issues with MapLibre GL (WebGL)
const MapContainer = dynamic(
  () => import('@/components/map/MapContainer'),
  { ssr: false, loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-950">
      <Loader className="animate-spin text-gray-500" size={24} />
    </div>
  )}
)

type BottomSheetSnap = 'peek' | 'half' | 'full'

export default function MapPage() {
  // ─── State ─────────────────────────────────────────────────
  const {
    filters,
    setFilter,
    setFilters,
    resetFilters,
    heatmapActive,
    setHeatmapActive,
    selectedReportId,
    setSelectedReportId,
  } = useMapState()

  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null)
  const [zoom, setZoom] = useState(2.2)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [bottomSheetSnap, setBottomSheetSnap] = useState<BottomSheetSnap>('peek')

  const {
    features,
    allPointsGeoJSON,
    totalReports,
    filteredCount,
    categoryCounts,
    topCountries,
    dataBounds,
    loading,
    error,
    supercluster,
    getReport,
  } = useViewportData(filters, bounds, zoom)

  // ─── Derived ───────────────────────────────────────────────
  const selectedReport: ReportProperties | null = useMemo(() => {
    if (!selectedReportId) return null
    return getReport(selectedReportId) || null
  }, [selectedReportId, getReport])

  // ─── Handlers ──────────────────────────────────────────────
  const handleViewportChange = useCallback(
    (newBounds: [number, number, number, number], newZoom: number) => {
      setBounds(newBounds)
      setZoom(newZoom)
    },
    []
  )

  const handleSelectReport = useCallback(
    (id: string) => {
      setSelectedReportId(id)
      setBottomSheetSnap('half')
    },
    [setSelectedReportId]
  )

  const handleCloseReport = useCallback(() => {
    setSelectedReportId(null)
    setBottomSheetSnap('peek')
  }, [setSelectedReportId])

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // MapContainer will need to expose flyTo — for now this is a placeholder
        // We'll enhance this in Phase 2
      },
      () => {
        // Silently fail
      }
    )
  }, [])

  const handleToggleHeatmap = useCallback(() => {
    setHeatmapActive(!heatmapActive)
  }, [heatmapActive, setHeatmapActive])

  return (
    <>
      <Head>
        <title>Interactive Map - Paradocs</title>
        <meta name="description" content="Explore paranormal sightings, encounters, and phenomena on an interactive global map. Filter by category, credibility, date, and location." />
      </Head>

      <div className="fixed inset-0 top-[56px] bg-gray-950">
        {/* ─── Map fills entire viewport ─── */}
        <MapContainer
          features={features}
          allPoints={allPointsGeoJSON}
          supercluster={supercluster}
          heatmapActive={heatmapActive}
          selectedReportId={selectedReportId}
          onSelectReport={handleSelectReport}
          onViewportChange={handleViewportChange}
          dataBounds={dataBounds}
        />

        {/* ─── Loading overlay ─── */}
        {loading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 bg-gray-900/90 backdrop-blur-sm rounded-full border border-gray-700/50">
            <Loader className="animate-spin text-purple-400" size={14} />
            <span className="text-xs text-gray-300">Loading map data...</span>
          </div>
        )}

        {/* ─── Error banner ─── */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-red-900/90 backdrop-blur-sm rounded-lg border border-red-700/50">
            <AlertCircle size={14} className="text-red-400" />
            <span className="text-xs text-red-200">{error}</span>
          </div>
        )}

        {/* ─── Desktop: Filter panel toggle ─── */}
        <button
          onClick={() => setFilterPanelOpen(!filterPanelOpen)}
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

        {/* ─── Desktop: Filter panel drawer ─── */}
        {filterPanelOpen && (
          <div className="hidden lg:block absolute top-0 left-0 bottom-0 z-20">
            <MapFilterPanel
              filters={filters}
              onFilterChange={setFilter}
              onReset={resetFilters}
              filteredCount={filteredCount}
              totalCount={totalReports}
              onClose={() => setFilterPanelOpen(false)}
            />
          </div>
        )}

        {/* ─── Desktop: Selected report panel ─── */}
        {selectedReport && (
          <div className="hidden lg:block absolute top-4 right-16 z-20 w-[340px]">
            <MapReportCard report={selectedReport} onClose={handleCloseReport} />
          </div>
        )}

        {/* ─── Map controls ─── */}
        <MapControls
          heatmapActive={heatmapActive}
          onToggleHeatmap={handleToggleHeatmap}
          onLocateMe={handleLocateMe}
          className="absolute bottom-4 right-4 z-20 lg:bottom-6 lg:right-6 max-lg:bottom-[150px]"
        />

        {/* ─── Mobile: Filter button ─── */}
        <button
          onClick={() => {
            setBottomSheetSnap('full')
          }}
          className="lg:hidden absolute top-4 right-4 z-20 flex items-center justify-center w-10 h-10 bg-gray-900/90 backdrop-blur-sm border border-gray-700/50 rounded-lg text-gray-300 shadow-lg"
          aria-label="Open filters"
        >
          <Filter size={18} />
        </button>

        {/* ─── Mobile: Stat bar (when bottom sheet is peek) ─── */}
        {!loading && (
          <div className="lg:hidden absolute top-4 left-4 right-16 z-20">
            <div className="px-3 py-1.5 bg-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-700/50">
              <span className="text-xs text-gray-300">
                {filteredCount === totalReports
                  ? `${totalReports.toLocaleString()} sightings`
                  : `${filteredCount.toLocaleString()} of ${totalReports.toLocaleString()}`}
              </span>
            </div>
          </div>
        )}

        {/* ─── Mobile: Bottom sheet ─── */}
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
        />
      </div>
    </>
  )
}
