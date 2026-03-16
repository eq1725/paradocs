/**
 * MapBottomSheet — Mobile-only 3-snap-point bottom sheet
 * Peek: stat bar + timeline area
 * Half: selected report card
 * Full: filters + report list
 */

import React, { useCallback, useRef, useEffect, useState } from 'react'
import { MapFilters, ReportProperties, CATEGORY_COLORS, CATEGORY_ICONS } from './mapStyles'
import { PhenomenonCategory } from '@/lib/database.types'
import MapReportCard from './MapReportCard'
import MapFilterPanel from './MapFilterPanel'

type SnapPoint = 'peek' | 'half' | 'full'

const SNAP_HEIGHTS = {
  peek: 80,   // just the drag handle + stat line
  half: 340,  // report card
  full: 0,    // calculated as vh * 0.85
}

interface MapBottomSheetProps {
  snap: SnapPoint
  onSnapChange: (snap: SnapPoint) => void
  selectedReport: ReportProperties | null
  onCloseReport: () => void
  filters: MapFilters
  onFilterChange: <K extends keyof MapFilters>(key: K, value: MapFilters[K]) => void
  onResetFilters: () => void
  filteredCount: number
  totalCount: number
  categoryCounts?: Record<string, number>
  topCountries?: { name: string; count: number }[]
}

// Format category name for display
function formatCategory(cat: string): string {
  return cat
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function MapBottomSheet({
  snap,
  onSnapChange,
  selectedReport,
  onCloseReport,
  filters,
  onFilterChange,
  onResetFilters,
  filteredCount,
  totalCount,
  categoryCounts = {},
  topCountries = [],
}: MapBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)
  const [currentHeight, setCurrentHeight] = useState(SNAP_HEIGHTS.peek)
  const [isDragging, setIsDragging] = useState(false)

  // Calculate full height
  const fullHeight = typeof window !== 'undefined'
    ? Math.round(window.innerHeight * 0.85)
    : 600

  const getSnapHeight = useCallback(
    (s: SnapPoint) => {
      if (s === 'full') return fullHeight
      return SNAP_HEIGHTS[s]
    },
    [fullHeight]
  )

  // Snap to target height
  useEffect(() => {
    if (!isDragging) {
      setCurrentHeight(getSnapHeight(snap))
    }
  }, [snap, isDragging, getSnapHeight])

  // Auto-snap to half when report selected
  useEffect(() => {
    if (selectedReport && snap === 'peek') {
      onSnapChange('half')
    }
  }, [selectedReport, snap, onSnapChange])

  // ─── Refs for drag state (stable across renders) ───────────
  const currentHeightRef = useRef(currentHeight)
  currentHeightRef.current = currentHeight
  const fullHeightRef = useRef(fullHeight)
  fullHeightRef.current = fullHeight
  const onSnapChangeRef = useRef(onSnapChange)
  onSnapChangeRef.current = onSnapChange
  const dragZoneRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  // ─── Touch events with preventDefault to stop page scroll ──
  // All values read from refs so the effect never needs to re-register
  useEffect(() => {
    const el = dragZoneRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      dragStartY.current = e.touches[0].clientY
      dragStartHeight.current = currentHeightRef.current
      isDraggingRef.current = true
      setIsDragging(true)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return
      e.preventDefault()
      const clientY = e.touches[0].clientY
      const dy = dragStartY.current - clientY
      const newHeight = Math.max(
        SNAP_HEIGHTS.peek,
        Math.min(fullHeightRef.current, dragStartHeight.current + dy)
      )
      currentHeightRef.current = newHeight
      setCurrentHeight(newHeight)
    }

    const onTouchEnd = () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      setIsDragging(false)

      // Snap to nearest
      const h = currentHeightRef.current
      const fh = fullHeightRef.current
      const peekDist = Math.abs(h - SNAP_HEIGHTS.peek)
      const halfDist = Math.abs(h - SNAP_HEIGHTS.half)
      const fullDist = Math.abs(h - fh)

      const minDist = Math.min(peekDist, halfDist, fullDist)
      if (minDist === peekDist) onSnapChangeRef.current('peek')
      else if (minDist === halfDist) onSnapChangeRef.current('half')
      else onSnapChangeRef.current('full')
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, []) // Empty deps — listeners are stable, all values read from refs

  // Mouse events (for desktop testing)
  const onMouseDown = (e: React.MouseEvent) => {
    dragStartY.current = e.clientY
    dragStartHeight.current = currentHeight
    setIsDragging(true)
    isDraggingRef.current = true

    const onMouseMove = (me: MouseEvent) => {
      if (!isDraggingRef.current) return
      const dy = dragStartY.current - me.clientY
      const newHeight = Math.max(
        SNAP_HEIGHTS.peek,
        Math.min(fullHeightRef.current, dragStartHeight.current + dy)
      )
      currentHeightRef.current = newHeight
      setCurrentHeight(newHeight)
    }
    const onMouseUp = () => {
      isDraggingRef.current = false
      setIsDragging(false)
      const h = currentHeightRef.current
      const fh = fullHeightRef.current
      const peekDist = Math.abs(h - SNAP_HEIGHTS.peek)
      const halfDist = Math.abs(h - SNAP_HEIGHTS.half)
      const fullDist = Math.abs(h - fh)
      const minDist = Math.min(peekDist, halfDist, fullDist)
      if (minDist === peekDist) onSnapChangeRef.current('peek')
      else if (minDist === halfDist) onSnapChangeRef.current('half')
      else onSnapChangeRef.current('full')
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      ref={sheetRef}
      className="absolute bottom-[56px] left-0 right-0 bg-gray-950/95 backdrop-blur-md border-t border-gray-800/50 rounded-t-2xl z-30 lg:hidden"
      style={{
        height: currentHeight,
        transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
      }}
    >
      {/* Drag zone — handle + stat line, tall enough to grab easily */}
      <div
        ref={dragZoneRef}
        className="cursor-grab active:cursor-grabbing touch-none select-none"
        onMouseDown={onMouseDown}
      >
        {/* Visual drag handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* Stat line — part of the drag zone so the whole top is swipeable */}
        <div className="flex items-center justify-between text-xs text-gray-400 pb-2 px-4">
          <span>
            {filteredCount.toLocaleString()} sighting{filteredCount !== 1 ? 's' : ''} mapped
          </span>
          {selectedReport && (
            <button
              onClick={() => onSnapChange('half')}
              className="text-purple-400 font-medium"
            >
              View selected
            </button>
          )}
          {!selectedReport && snap === 'peek' && (
            <button
              onClick={() => onSnapChange('half')}
              className="text-purple-400 font-medium"
            >
              Explore
            </button>
          )}
        </div>
      </div>

      {/* Content below drag zone */}
      <div className="overflow-y-auto px-4" style={{ height: `calc(100% - 56px)` }}>
        {/* Half state: report card OR stats overview */}
        {snap !== 'peek' && selectedReport && (
          <div className="pb-4">
            <MapReportCard report={selectedReport} onClose={onCloseReport} />
          </div>
        )}

        {/* Empty state: category breakdown + top locations */}
        {snap !== 'peek' && !selectedReport && (
          <div className="pb-4 space-y-4">
            {/* Category breakdown */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                By Category
              </h3>
              <div className="space-y-1.5">
                {Object.entries(categoryCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, count]) => {
                    const pct = filteredCount > 0 ? (count / filteredCount) * 100 : 0
                    const color = CATEGORY_COLORS[cat as PhenomenonCategory] || '#9ca3af'
                    const icon = CATEGORY_ICONS[cat as PhenomenonCategory] || '📍'
                    return (
                      <button
                        key={cat}
                        onClick={() => onFilterChange('category', cat as PhenomenonCategory)}
                        className="w-full flex items-center gap-2 group"
                      >
                        <span className="text-sm w-5 text-center">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-gray-300 group-hover:text-white transition-colors truncate">
                              {formatCategory(cat)}
                            </span>
                            <span className="text-[10px] text-gray-500 ml-2 flex-shrink-0">
                              {count}
                            </span>
                          </div>
                          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      </button>
                    )
                  })}
              </div>
            </div>

            {/* Top locations */}
            {topCountries.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Top Locations
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {topCountries.map(({ name, count }) => (
                    <button
                      key={name}
                      onClick={() => onFilterChange('country', name)}
                      className="px-2.5 py-1 bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 rounded-full text-xs text-gray-300 hover:text-white transition-colors"
                    >
                      {name} <span className="text-gray-500">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Hint */}
            <p className="text-[11px] text-gray-600 text-center pt-1">
              Tap a marker on the map to view details
            </p>
          </div>
        )}

        {/* Full state: filters */}
        {snap === 'full' && (
          <div className="pb-8">
            <MapFilterPanel
              filters={filters}
              onFilterChange={onFilterChange}
              onReset={onResetFilters}
              filteredCount={filteredCount}
              totalCount={totalCount}
              inline
            />
          </div>
        )}
      </div>
    </div>
  )
}
