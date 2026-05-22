/**
 * ChoroplethLegend — V11.15.0 (revised)
 *
 * Compact pill positioned in the top-left of the map area, below the
 * Filters button. Default state is a single horizontal strip showing
 * 5 color swatches + min/max counts — minimal footprint, scannable at
 * a glance. Tap (or hover on desktop) expands to a full popover with
 * each bucket's range labeled.
 *
 * Positioning rationale:
 *   - bottom-left clashed with the time-range slider on desktop and
 *     the bottom sheet on mobile/tablet
 *   - top-right is the map controls toolbar
 *   - top-left below the Filters button is the only consistently-clear
 *     area across breakpoints
 *
 * Mobile-first behavior:
 *   - Compact pill (collapsed) by default → low visual cost
 *   - Tap to expand → full bucket breakdown
 *   - Outside-tap or X button to collapse
 *   - When expanded on mobile, popover stays within map area (doesn't
 *     spill into bottom sheet)
 */

import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, X } from 'lucide-react'

interface ChoroplethLegendProps {
  /** Quantile thresholds [q20, q40, q60, q80, max] from useChoroplethData. */
  quantiles: number[]
  /** True when the choropleth layer is active. Component hides otherwise. */
  visible: boolean
  /** Optional title; defaults to "Reports per country". */
  title?: string
}

// Mirror of the fill-color step expression in MapContainer. Keep in
// sync: 5 buckets, light teal → dark indigo.
const BUCKET_COLORS = ['#c7e9b4', '#7fcdbb', '#41b6c4', '#2c7fb8', '#253494']

function formatRange(lo: number, hi: number): string {
  if (lo === hi) return formatNum(lo)
  return formatNum(lo) + '–' + formatNum(hi)
}

function formatNum(n: number): string {
  if (n >= 1000) return Math.round(n / 100) / 10 + 'k'
  return String(n)
}

export default function ChoroplethLegend({ quantiles, visible, title }: ChoroplethLegendProps) {
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Click-outside / Escape handlers to dismiss the expanded popover.
  useEffect(function() {
    if (!expanded) return
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return function () {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [expanded])

  if (!visible || !quantiles || quantiles.length < 5) return null

  // V11.15.1 — Build buckets, then collapse degenerate tiers.
  // When a category filter narrows the data so many countries share
  // the same low count (e.g. 80% of countries have count=3), the
  // percentile thresholds collapse and adjacent tiers render with
  // lo > hi ("4-3"). We detect that and merge consecutive tiers
  // whose ranges would otherwise be invalid. End result: fewer
  // tiers, but every tier has a real, non-degenerate range.
  const rawBuckets: Array<{ lo: number; hi: number; color: string }> = [
    { lo: 1,                       hi: quantiles[0], color: BUCKET_COLORS[0] },
    { lo: quantiles[0] + 1,        hi: quantiles[1], color: BUCKET_COLORS[1] },
    { lo: quantiles[1] + 1,        hi: quantiles[2], color: BUCKET_COLORS[2] },
    { lo: quantiles[2] + 1,        hi: quantiles[3], color: BUCKET_COLORS[3] },
    { lo: quantiles[3] + 1,        hi: quantiles[4], color: BUCKET_COLORS[4] },
  ]
  const buckets: Array<{ lo: number; hi: number; color: string }> = []
  for (const b of rawBuckets) {
    if (b.hi < b.lo) continue  // degenerate — skip
    // If the new bucket has the same lo as the last accepted bucket,
    // merge: extend the previous hi to cover this bucket's range and
    // bump the color forward so the gradient still progresses.
    const last = buckets[buckets.length - 1]
    if (last && b.lo <= last.hi + 1) {
      last.hi = Math.max(last.hi, b.hi)
      last.color = b.color  // adopt the darker tier's color
    } else {
      buckets.push({ ...b })
    }
  }
  if (buckets.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="absolute top-16 left-4 lg:top-20 lg:left-6 z-10"
    >
      {/* Compact pill (collapsed state) */}
      <button
        type="button"
        onClick={function() { setExpanded(function(v) { return !v }) }}
        className={
          'flex items-center gap-2 bg-gray-900/85 backdrop-blur-md border border-white/10 rounded-full px-2.5 py-1.5 text-[11px] text-gray-300 shadow-lg hover:bg-gray-900/95 hover:border-white/20 transition-colors ' +
          (expanded ? 'ring-1 ring-cyan-400/40' : '')
        }
        aria-expanded={expanded}
        aria-label={(title || 'Reports per country') + ': legend with 5 tiers from ' + formatNum(buckets[0].lo) + ' to ' + formatNum(buckets[4].hi) + ' reports. Tap to expand.'}
      >
        <span className="hidden sm:inline text-gray-400 font-medium">
          {title || 'Reports'}
        </span>
        {/* 5 swatches in a strip */}
        <span className="flex">
          {buckets.map(function (b, i) {
            return (
              <span
                key={i}
                className="inline-block w-3.5 h-3 first:rounded-l-sm last:rounded-r-sm"
                style={{ backgroundColor: b.color }}
              />
            )
          })}
        </span>
        <span className="tabular-nums text-gray-400 text-[10px]">
          {formatNum(buckets[0].lo)}–{formatNum(buckets[4].hi)}
        </span>
        <ChevronDown
          size={12}
          className={'text-gray-500 transition-transform ' + (expanded ? 'rotate-180' : '')}
        />
      </button>

      {/* Expanded popover */}
      {expanded && (
        <div
          role="dialog"
          aria-label={(title || 'Reports per country') + ' legend details'}
          className="absolute top-full left-0 mt-2 bg-gray-900/95 backdrop-blur-md border border-white/15 rounded-xl px-3.5 py-3 text-[12px] text-gray-200 shadow-2xl min-w-[180px]"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium text-gray-100">{title || 'Reports per country'}</div>
            <button
              onClick={function() { setExpanded(false) }}
              className="text-gray-500 hover:text-white -mr-1 -mt-0.5 p-0.5"
              aria-label="Close legend"
            >
              <X size={13} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {buckets.map(function (b, i) {
              return (
                <div key={i} className="flex items-center gap-2.5">
                  <span
                    className="inline-block w-5 h-3.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: b.color }}
                  />
                  <span className="tabular-nums text-gray-300">{formatRange(b.lo, b.hi)}</span>
                </div>
              )
            })}
          </div>
          <div className="text-[10px] text-gray-500 mt-2.5 pt-2.5 border-t border-white/5">
            5 tiers by report-count rank. Toggle off via Map icon on the right.
          </div>
        </div>
      )}
    </div>
  )
}
