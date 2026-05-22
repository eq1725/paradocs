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
  // V10.9.D.6 — Peek tuned per visual review.
  //   100px (original): ~50px of dead space below visible content.
  //   56px (V10.9.D.5): too tight — stat line + Explore link clipped
  //     under the bottom nav bar. Only the drag handle showed.
  //   78px (this rev): handle (~22) + stat line (~28) + 28px buffer.
  //     Fits content with breathing room, no dead space below it.
  peek: 78,
  half: 360,  // report card
  full: 0,    // calculated dynamically via fullHeight
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

  // V10.9.D.4 — Full-snap height per Chase's clarification.
  //
  // Target layout (from his desktop-mobile screenshot):
  //   - Map/Browse/Search tabs visible at top
  //   - Small map gap below tabs (~40px) so the user sees a strip of
  //     map and knows the map is still underneath
  //   - X button at top-right of the drawer
  //   - Year/period row + slider + filter content below
  //
  // Sizing budget:
  //   chrome above wrapper:    safe-area + 56 header + 48 tabs ≈ 165
  //   visible map gap:         40
  //   bottom anchor (sheet):   56
  //   ────────────────────────────────────
  //   total taken from vh:     261
  //
  // Drawer height = window.innerHeight - 261. On a 866px viewport
  // that's 605px (≈ 0.70 vh). On a 970px viewport (Chase's narrow
  // desktop screenshot) that's 709px. Drawer top in viewport ≈
  // y=205 in both cases — right where Chase's screenshot shows it.
  const TOP_CHROME = 165         // safe-area + header + tabs
  const MAP_GAP = 40             // visible map strip above the drawer
  const BOTTOM_INSET = 56        // sheet's bottom anchor (above bottom-nav)
  const fullHeight = typeof window !== 'undefined'
    ? Math.max(400, window.innerHeight - TOP_CHROME - MAP_GAP - BOTTOM_INSET)
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

  // V10.9.D.4 — In 'full' state the drawer fits cleanly in the visible
  // area below the tabs (with a ~40px map strip above). The drag
  // chrome lives at the natural top of the drawer:
  //   - Drag handle (small horizontal bar, centered) — tappable to
  //     cycle snaps
  //   - X dismiss button — top-right corner of the drawer
  //   - Stat line ("40 sightings mapped") — hidden in 'full' state
  //     because it's redundant when the full filter UI is on screen
  const isFull = snap === 'full'

  return (
    <div
      ref={sheetRef}
      // V11.15.0 — Conditional bottom offset. MobileBottomTabs is
      // md:hidden (only renders below 768px), so above that breakpoint
      // there's no global nav at the bottom — the previous fixed
      // bottom-[56px] left a 56px black gap on tablet width. Now:
      //   - <md (mobile): bottom-[56px] to stack above MobileBottomTabs
      //   - md+ (tablet+, before lg breakpoint): bottom-0
      className="absolute bottom-[56px] md:bottom-0 left-0 right-0 bg-gray-950/95 backdrop-blur-md border-t border-gray-800/50 rounded-t-2xl z-30 lg:hidden"
      style={{
        height: currentHeight,
        transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
      }}
    >
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

        {/* V10.9.D.4 — X dismiss button restored to the drawer's
            top-right (since the drawer now fits in the visible area,
            this is naturally where the user expects it). One-tap
            collapse to peek. */}
        {isFull && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSnapChange('peek')
            }}
            className="absolute top-2 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        )}

        {/* Stat line — peek/half only. In 'full' state it's hidden so
            the year/period row sits cleanly right below the drag
            handle + X button. */}
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
      {/* V10.9.D.4 — content area sizing.
          peek/half: drag zone is ~56px (handle + stat line)
          full:      drag zone is ~32px (just handle, stat hidden) */}
      <div
        ref={contentRef}
        className="overflow-y-auto px-4"
        style={{ height: isFull ? `calc(100% - 32px)` : `calc(100% - 56px)` }}
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
