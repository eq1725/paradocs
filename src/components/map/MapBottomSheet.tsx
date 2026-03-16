/**
 * MapBottomSheet — Mobile-only 3-snap-point bottom sheet
 * Peek: stat bar + timeline area
 * Half: selected report card
 * Full: filters + report list
 */

import React, { useCallback, useRef, useEffect, useState } from 'react'
import { MapFilters, ReportProperties } from './mapStyles'
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

  // ─── Drag handling ─────────────────────────────────────────
  const handleDragStart = useCallback(
    (clientY: number) => {
      dragStartY.current = clientY
      dragStartHeight.current = currentHeight
      setIsDragging(true)
    },
    [currentHeight]
  )

  const handleDragMove = useCallback(
    (clientY: number) => {
      if (!isDragging) return
      const dy = dragStartY.current - clientY
      const newHeight = Math.max(
        SNAP_HEIGHTS.peek,
        Math.min(fullHeight, dragStartHeight.current + dy)
      )
      setCurrentHeight(newHeight)
    },
    [isDragging, fullHeight]
  )

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)

    // Snap to nearest
    const peekDist = Math.abs(currentHeight - SNAP_HEIGHTS.peek)
    const halfDist = Math.abs(currentHeight - SNAP_HEIGHTS.half)
    const fullDist = Math.abs(currentHeight - fullHeight)

    const minDist = Math.min(peekDist, halfDist, fullDist)
    if (minDist === peekDist) onSnapChange('peek')
    else if (minDist === halfDist) onSnapChange('half')
    else onSnapChange('full')
  }, [currentHeight, fullHeight, onSnapChange])

  // Touch events
  const onTouchStart = (e: React.TouchEvent) => handleDragStart(e.touches[0].clientY)
  const onTouchMove = (e: React.TouchEvent) => handleDragMove(e.touches[0].clientY)
  const onTouchEnd = () => handleDragEnd()

  // Mouse events (for desktop testing)
  const onMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientY)
    const onMouseMove = (me: MouseEvent) => handleDragMove(me.clientY)
    const onMouseUp = () => {
      handleDragEnd()
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
      {/* Drag handle */}
      <div
        className="flex justify-center pt-2.5 pb-2 cursor-grab active:cursor-grabbing touch-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
      >
        <div className="w-10 h-1 bg-gray-600 rounded-full" />
      </div>

      {/* Content */}
      <div className="overflow-y-auto h-[calc(100%-28px)] px-4">
        {/* Peek state: stat line */}
        <div className="flex items-center justify-between text-xs text-gray-400 pb-2">
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
        </div>

        {/* Half state: report card */}
        {snap !== 'peek' && selectedReport && (
          <div className="pb-4">
            <MapReportCard report={selectedReport} onClose={onCloseReport} />
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
