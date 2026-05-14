/**
 * MapBottomSheet — Mobile-only 3-snap-point bottom sheet
 * Peek: stat bar + timeline area
 * Half: selected report card
 * Full: filters + report list
 */

import React, { useCallback, useRef, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { MapFilters, ReportProperties, CATEGORY_COLORS } from './mapStyles'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { PhenomenonCategory } from '@/lib/database.types'
import MapReportCard from './MapReportCard'
import MapFilterPanel from './MapFilterPanel'
import MapTimeline from './MapTimeline'
import type { RegionBucket } from './useViewportData'

type SnapPoint = 'peek' | 'half' | 'full'

const SNAP_HEIGHTS = {
  peek: 100,  // drag handle + stat line (above nav bar)
  half: 360,  // report card
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
  dateFrom?: number | null
  dateTo?: number | null
  onDateChange?: (from: number | null, to: number | null) => void
  yearHistogram?: { year: number; count: number }[]
  /**
   * V10.9.C — region totals for synthetic-coord reports. Rendered as
   * its own section inside the sheet (mobile-only — desktop has the
   * RegionTotalsPanel floating overlay). Optional; section only
   * appears when there's at least one bucket.
   */
  regionBuckets?: RegionBucket[]
  regionTotalCount?: number
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
  dateFrom,
  dateTo,
  onDateChange,
  yearHistogram = [],
  regionBuckets = [],
  regionTotalCount = 0,
}: MapBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)
  const [currentHeight, setCurrentHeight] = useState(SNAP_HEIGHTS.peek)
  const [isDragging, setIsDragging] = useState(false)

  // V10.9.D.3 — Full-snap height per Chase's mobile review (preferred
  // layout shows the drawer extending up behind the tabs with the
  // drag chrome tucked away, slider at the top of visible content).
  //
  // Strategy: oversize the drawer so the drag zone (handle + stat
  // line) sits behind the opaque tabs/header bar. The user-visible
  // drawer fills from just-below-tabs to just-above-bottom-nav. The
  // header chrome is intentionally hidden — the dismiss path comes
  // from a floating X positioned in the visible area (added below)
  // and the existing pull-down gesture.
  //
  // 0.95 * vh on a 866px viewport = ~822px tall, drawer top renders
  // at ~y=-12 (slightly above viewport). Drag zone (~56px) hidden
  // behind tabs. Visible drawer = wrapper height = ~647px of pure
  // content. That matches screenshot 2 exactly.
  const fullHeight = typeof window !== 'undefined'
    ? Math.round(window.innerHeight * 0.95)
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
  const contentRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  // Track whether a content-area swipe-down has been "captured" as a sheet drag
  const contentDragCaptured = useRef(false)

  // ─── Snap-to-nearest helper ─────────────────────────────────
  const snapToNearest = () => {
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

  // ─── Drag-zone touch events (handle bar) ────────────────────
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
      snapToNearest()
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

  // ─── Content-area touch events: pull-down-to-dismiss ────────
  // When scrolled to the top and swiping down, drag the sheet instead of scrolling
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      dragStartY.current = e.touches[0].clientY
      dragStartHeight.current = currentHeightRef.current
      contentDragCaptured.current = false
    }

    const onTouchMove = (e: TouchEvent) => {
      const clientY = e.touches[0].clientY
      const dy = clientY - dragStartY.current // positive = swiping down

      // If content is scrolled to top and swiping down → capture as sheet drag
      if (!contentDragCaptured.current && el.scrollTop <= 0 && dy > 8) {
        contentDragCaptured.current = true
        isDraggingRef.current = true
        setIsDragging(true)
        // Reset start point to current position for smooth transition
        dragStartY.current = clientY
        dragStartHeight.current = currentHeightRef.current
      }

      if (contentDragCaptured.current) {
        e.preventDefault()
        const dragDy = dragStartY.current - clientY
        const newHeight = Math.max(
          SNAP_HEIGHTS.peek,
          Math.min(fullHeightRef.current, dragStartHeight.current + dragDy)
        )
        currentHeightRef.current = newHeight
        setCurrentHeight(newHeight)
      }
    }

    const onTouchEnd = () => {
      if (contentDragCaptured.current) {
        contentDragCaptured.current = false
        isDraggingRef.current = false
        setIsDragging(false)
        snapToNearest()
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, []) // Empty deps — all values read from refs

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

  // V10.9.D.3 — At 'full' snap, the drawer is sized to extend behind
  // the tabs/header above the wrapper. The drag handle + stat line
  // get tucked away (Chase's preferred layout). Below, the rendering
  // accounts for this:
  //   - Drag zone shrinks in 'full' state (just a bare handle, no
  //     stat line). The stat info is redundant in 'full' state since
  //     the user already sees the full filter UI.
  //   - A FLOATING X button anchors to the wrapper's TOP RIGHT
  //     (positioned absolute relative to the sheet but with a
  //     calculated offset that puts it in the visible zone) so users
  //     always have an obvious one-tap dismiss path even when the
  //     drag handle is hidden behind the tabs.
  //
  // Calculation: when snap=full, the drawer top sits at
  //   y = vh - 56 - 0.95*vh = vh*0.05 - 56 = ~-12 on a 866 viewport.
  // The visible drawer starts at the wrapper top (~163 from viewport
  // top). The X button needs to sit IN the visible zone, so we offset
  // it from the drawer's top by (163 - drawerTop) = ~175px on a
  // typical mobile viewport. Hardcoded 175 covers the typical
  // safe-area + header + tabs budget. The button has top: 175 from
  // the drawer top (which puts it just below the tabs in the visible
  // area).
  const isFull = snap === 'full'

  return (
    <div
      ref={sheetRef}
      className="absolute bottom-[56px] left-0 right-0 bg-gray-950/95 backdrop-blur-md border-t border-gray-800/50 rounded-t-2xl z-30 lg:hidden"
      style={{
        height: currentHeight,
        transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
      }}
    >
      {/* V10.9.D.3 — Floating dismiss button. Positioned relative to
          the sheet's top with an offset that puts it just below the
          tabs in the visible viewport area. Always visible in 'full'
          state regardless of where the drag zone has been pushed. */}
      {isFull && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSnapChange('peek')
          }}
          className="absolute right-3 z-50 flex items-center justify-center w-9 h-9 rounded-full bg-gray-800/95 hover:bg-gray-700 text-gray-200 hover:text-white shadow-xl transition-colors"
          style={{ top: 175 }}
          aria-label="Close panel"
        >
          <X size={18} />
        </button>
      )}

      {/* V10.9.C — drag handle made larger + obvious. Tap the handle
          to cycle peek → half → full → peek so users have a tap
          alternative to dragging. */}
      <div
        ref={dragZoneRef}
        className="cursor-grab active:cursor-grabbing touch-none select-none relative"
        onMouseDown={onMouseDown}
      >
        {/* Visual drag handle — bigger tap target, hover highlight */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (snap === 'peek') onSnapChange('half')
            else if (snap === 'half') onSnapChange('full')
            else onSnapChange('peek')
          }}
          className="w-full flex justify-center pt-3 pb-2"
          aria-label={
            snap === 'full' ? 'Collapse panel' :
            snap === 'half' ? 'Expand panel' : 'Open panel'
          }
        >
          <span className="w-12 h-1.5 bg-gray-500 hover:bg-gray-400 rounded-full transition-colors" />
        </button>

        {/* V10.9.D.3 — Stat line shown only in peek/half. In 'full'
            state the line is hidden (it's redundant when the full
            filter UI is on screen) AND the entire drag zone gets
            tucked behind the tabs/header anyway. */}
        {!isFull && (
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
        )}
      </div>

      {/* Content below drag zone */}
      {/* V10.9.D.3 — content area sizing.
          peek/half: height = drawer minus 56px drag zone. Standard.
          full:     drawer extends ~165px above the wrapper (behind
                    tabs). The content area needs top-padding so the
                    first piece of content (slider) clears the tabs
                    and starts at the visible-zone top, not behind
                    the tabs. paddingTop ~165 matches the chrome
                    above the wrapper (header + tabs + safe-area). */}
      <div
        ref={contentRef}
        className="overflow-y-auto px-4"
        style={{
          height: isFull ? `calc(100% - 28px)` : `calc(100% - 56px)`,
          paddingTop: isFull ? 165 : undefined,
        }}
      >
        {/* Half state: report card OR stats overview */}
        {snap !== 'peek' && selectedReport && (
          <div className="pb-4">
            <MapReportCard report={selectedReport} onClose={onCloseReport} />
          </div>
        )}

        {/* Empty state: timeline + category breakdown + top locations */}
        {snap !== 'peek' && !selectedReport && (
          <div className="pb-4 space-y-4">
            {/* Compact timeline */}
            {onDateChange && (
              <MapTimeline
                dateFrom={dateFrom ?? null}
                dateTo={dateTo ?? null}
                onDateChange={onDateChange}
                yearHistogram={yearHistogram}
                compact
              />
            )}

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
                    return (
                      <button
                        key={cat}
                        onClick={() => onFilterChange('category', cat as PhenomenonCategory)}
                        className="w-full flex items-center gap-2 group"
                      >
                        <span className="w-5 text-center" style={{ color }}>
                          <CategoryIcon category={cat as PhenomenonCategory} size={16} />
                        </span>
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

            {/* V10.9.C — Region totals (synthetic-coord reports). Parallel
                to Top Locations but counts reports that have country
                or state precision only — these aren't pinned on the
                map (to avoid false centroid clustering) but are counted
                here so the user sees the data exists. */}
            {regionTotalCount > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Region totals
                </h3>
                <p className="text-[11px] text-gray-500 mb-2 leading-snug">
                  {regionTotalCount.toLocaleString()} report{regionTotalCount === 1 ? '' : 's'} with country/state-only location. Tap to filter.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {regionBuckets.slice(0, 8).map((b) => (
                    <button
                      key={b.code}
                      onClick={() => onFilterChange('country', filters.country === b.name ? (null as any) : b.name)}
                      className={
                        'px-2.5 py-1 border rounded-full text-xs transition-colors ' +
                        (filters.country === b.name
                          ? 'bg-purple-900/40 border-purple-500/50 text-white'
                          : 'bg-gray-800/80 hover:bg-gray-700/80 border-gray-700/50 text-gray-300 hover:text-white')
                      }
                    >
                      {b.name} <span className="text-gray-500">{b.total.toLocaleString()}</span>
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
