/**
 * MapTimeline — Dual-handle date range slider with year histogram
 *
 * Desktop: fixed bar at bottom of map viewport
 * Mobile: inside bottom sheet or compact floating bar
 *
 * Features:
 * - Dual-handle range slider (1800–2026)
 * - Era preset buttons (All Time, Pre-1900, 1900-1950, 1950-2000, 2000+)
 * - Year histogram sparkline behind the slider
 * - Debounced filter updates
 */

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import { TIMELINE } from './mapStyles'

interface MapTimelineProps {
  dateFrom: number | null
  dateTo: number | null
  onDateChange: (from: number | null, to: number | null) => void
  yearHistogram: { year: number; count: number }[]
  className?: string
  compact?: boolean // Mobile compact mode
}

const MIN_YEAR = TIMELINE.min
const MAX_YEAR = TIMELINE.max

export default function MapTimeline({
  dateFrom,
  dateTo,
  onDateChange,
  yearHistogram,
  className = '',
  compact = false,
}: MapTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'from' | 'to' | null>(null)
  const [localFrom, setLocalFrom] = useState(dateFrom ?? MIN_YEAR)
  const [localTo, setLocalTo] = useState(dateTo ?? MAX_YEAR)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Sync external changes
  useEffect(() => {
    setLocalFrom(dateFrom ?? MIN_YEAR)
    setLocalTo(dateTo ?? MAX_YEAR)
  }, [dateFrom, dateTo])

  const range = MAX_YEAR - MIN_YEAR

  // Percentage positions
  const fromPct = ((localFrom - MIN_YEAR) / range) * 100
  const toPct = ((localTo - MIN_YEAR) / range) * 100

  // Debounced update to parent
  const commitChange = useCallback(
    (from: number, to: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const newFrom = from <= MIN_YEAR ? null : from
        const newTo = to >= MAX_YEAR ? null : to
        onDateChange(newFrom, newTo)
      }, 200)
    },
    [onDateChange]
  )

  // Convert pixel position to year
  const pxToYear = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track) return MIN_YEAR
      const rect = track.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return Math.round(MIN_YEAR + pct * range)
    },
    [range]
  )

  // Pointer handlers (work for both touch and mouse)
  const handlePointerDown = useCallback(
    (handle: 'from' | 'to') => (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      setDragging(handle)
    },
    []
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return
      const year = pxToYear(e.clientX)

      if (dragging === 'from') {
        const clamped = Math.min(year, localTo - 1)
        setLocalFrom(clamped)
        commitChange(clamped, localTo)
      } else {
        const clamped = Math.max(year, localFrom + 1)
        setLocalTo(clamped)
        commitChange(localFrom, clamped)
      }
    },
    [dragging, localFrom, localTo, pxToYear, commitChange]
  )

  const handlePointerUp = useCallback(() => {
    setDragging(null)
  }, [])

  // Click on track to jump nearest handle
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      const year = pxToYear(e.clientX)
      const distFrom = Math.abs(year - localFrom)
      const distTo = Math.abs(year - localTo)

      if (distFrom <= distTo) {
        const clamped = Math.min(year, localTo - 1)
        setLocalFrom(clamped)
        commitChange(clamped, localTo)
      } else {
        const clamped = Math.max(year, localFrom + 1)
        setLocalTo(clamped)
        commitChange(localFrom, clamped)
      }
    },
    [localFrom, localTo, pxToYear, commitChange]
  )

  // Era presets
  const handleEra = useCallback(
    (from: number | null, to: number | null) => {
      const f = from ?? MIN_YEAR
      const t = to ?? MAX_YEAR
      setLocalFrom(f)
      setLocalTo(t)
      onDateChange(from, to)
    },
    [onDateChange]
  )

  // Histogram bars
  const maxCount = useMemo(
    () => Math.max(1, ...yearHistogram.map((h) => h.count)),
    [yearHistogram]
  )

  const histogramBars = useMemo(() => {
    // Bucket into decades for a cleaner sparkline
    const decades: Record<number, number> = {}
    for (const { year, count } of yearHistogram) {
      const decade = Math.floor(year / 10) * 10
      decades[decade] = (decades[decade] || 0) + count
    }
    const maxDecade = Math.max(1, ...Object.values(decades))
    const bars: { decade: number; pct: number; height: number }[] = []
    for (let d = Math.floor(MIN_YEAR / 10) * 10; d <= MAX_YEAR; d += 10) {
      const count = decades[d] || 0
      bars.push({
        decade: d,
        pct: ((d - MIN_YEAR) / range) * 100,
        height: count > 0 ? Math.max(4, (count / maxDecade) * 100) : 0,
      })
    }
    return bars
  }, [yearHistogram, range])

  const isAllTime = localFrom <= MIN_YEAR && localTo >= MAX_YEAR

  return (
    <div className={`${className}`}>
      {/* Era presets */}
      <div className={`flex items-center gap-1.5 ${compact ? 'mb-1.5' : 'mb-2'} overflow-x-auto no-scrollbar`}>
          {TIMELINE.eras.map((era) => {
            const isActive =
              (era.from === null && era.to === null && isAllTime) ||
              (era.from !== null && localFrom === era.from && era.to !== null && localTo === era.to) ||
              (era.from !== null && era.to === null && localFrom === era.from && localTo >= MAX_YEAR) ||
              (era.from === null && era.to !== null && localFrom <= MIN_YEAR && localTo === era.to)
            return (
              <button
                key={era.label}
                onClick={() => handleEra(era.from, era.to)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-700/80'
                }`}
              >
                {era.label}
              </button>
            )
          })}
      </div>

      {/* Slider track */}
      <div className="relative px-2">
        {/* Year labels */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500 tabular-nums">
            {localFrom}
          </span>
          {!isAllTime && (
            <span className="text-[10px] text-purple-400 font-medium tabular-nums">
              {localTo - localFrom} year{localTo - localFrom !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[10px] text-gray-500 tabular-nums">
            {localTo}
          </span>
        </div>

        {/* Track container */}
        <div
          ref={trackRef}
          className="relative h-8 cursor-pointer touch-none"
          onClick={handleTrackClick}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Histogram background */}
          <div className="absolute inset-x-0 bottom-1 h-5 flex items-end">
            {histogramBars.map((bar) => (
              <div
                key={bar.decade}
                className="absolute bottom-0"
                style={{
                  left: `${bar.pct}%`,
                  width: `${(10 / range) * 100}%`,
                  height: `${bar.height}%`,
                  backgroundColor:
                    bar.decade >= localFrom && bar.decade <= localTo
                      ? 'rgba(139, 92, 246, 0.25)'
                      : 'rgba(75, 85, 99, 0.15)',
                  transition: 'background-color 0.2s',
                }}
              />
            ))}
          </div>

          {/* Track line */}
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gray-700/60 rounded-full" />

          {/* Active range highlight */}
          <div
            className="absolute bottom-0 h-1 bg-purple-500/70 rounded-full"
            style={{ left: `${fromPct}%`, width: `${toPct - fromPct}%` }}
          />

          {/* From handle — large touch target wrapping visible dot */}
          <div
            className="absolute bottom-0 -translate-x-1/2 flex items-center justify-center cursor-grab active:cursor-grabbing"
            style={{ left: `${fromPct}%`, width: 44, height: 44, marginBottom: -18 }}
            onPointerDown={handlePointerDown('from')}
          >
            <div
              className={`w-4.5 h-4.5 rounded-full border-2 transition-shadow pointer-events-none ${
                dragging === 'from'
                  ? 'bg-purple-400 border-purple-300 shadow-lg shadow-purple-500/30 scale-125'
                  : 'bg-purple-500 border-purple-400 hover:shadow-md hover:shadow-purple-500/20'
              }`}
              style={{ width: 18, height: 18 }}
            />
          </div>

          {/* To handle — large touch target wrapping visible dot */}
          <div
            className="absolute bottom-0 -translate-x-1/2 flex items-center justify-center cursor-grab active:cursor-grabbing"
            style={{ left: `${toPct}%`, width: 44, height: 44, marginBottom: -18 }}
            onPointerDown={handlePointerDown('to')}
          >
            <div
              className={`rounded-full border-2 transition-shadow pointer-events-none ${
                dragging === 'to'
                  ? 'bg-purple-400 border-purple-300 shadow-lg shadow-purple-500/30 scale-125'
                  : 'bg-purple-500 border-purple-400 hover:shadow-md hover:shadow-purple-500/20'
              }`}
              style={{ width: 18, height: 18 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
