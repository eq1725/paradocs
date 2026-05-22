/**
 * ChoroplethLegend — V11.15.1 (final)
 *
 * Compact gradient pill in the top-left of the map area. Tap to
 * expand a popover with help text. Shows only the color gradient
 * (no specific numeric ranges) because:
 *
 *   - The choropleth colors come from a materialized view of
 *     per-country counts.
 *   - The cluster pin numbers come from a live per-report query.
 *   - Both are correct in their own units, but the units differ
 *     (country totals vs geographic-cluster sums). Displaying
 *     specific tier numbers in the legend implies they match what
 *     the user sees on the pins — they don't.
 *
 * Decision: show the gradient direction (Fewer → More) with no
 * numeric tier labels. Always correct regardless of materialized
 * view freshness. If users want exact per-country counts they can
 * click a country (V11.15.2 P2 — country tooltip on hover).
 */

import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, X } from 'lucide-react'

interface ChoroplethLegendProps {
  /** True when the choropleth layer is active. Component hides otherwise. */
  visible: boolean
  /** Quantile thresholds (still passed in case future versions want them). */
  quantiles?: number[]
  /** Optional title; defaults to "Reports per country". */
  title?: string
}

// 5-tier teal→indigo gradient (mirrors fill-color step expression in MapContainer).
const BUCKET_COLORS = ['#c7e9b4', '#7fcdbb', '#41b6c4', '#2c7fb8', '#253494']

export default function ChoroplethLegend({ visible, title }: ChoroplethLegendProps) {
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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

  if (!visible) return null

  return (
    <div
      ref={containerRef}
      className="absolute top-16 left-4 lg:top-20 lg:left-6 z-10"
    >
      {/* Compact pill */}
      <button
        type="button"
        onClick={function() { setExpanded(function(v) { return !v }) }}
        className={
          'flex items-center gap-2 bg-gray-900/85 backdrop-blur-md border border-white/10 rounded-full px-2.5 py-1.5 text-[11px] text-gray-300 shadow-lg hover:bg-gray-900/95 hover:border-white/20 transition-colors ' +
          (expanded ? 'ring-1 ring-cyan-400/40' : '')
        }
        aria-expanded={expanded}
        aria-label={(title || 'Reports per country') + ': color legend. Fewer reports = lighter teal; more reports = darker indigo. Tap for details.'}
      >
        <span className="hidden sm:inline text-gray-400 font-medium">
          {title || 'Reports'}
        </span>
        <span className="text-[10px] text-gray-500 hidden sm:inline">Fewer</span>
        {/* Gradient strip */}
        <span className="flex">
          {BUCKET_COLORS.map(function (color, i) {
            return (
              <span
                key={i}
                className="inline-block w-3.5 h-3 first:rounded-l-sm last:rounded-r-sm"
                style={{ backgroundColor: color }}
              />
            )
          })}
        </span>
        <span className="text-[10px] text-gray-500 hidden sm:inline">More</span>
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
          className="absolute top-full left-0 mt-2 bg-gray-900/95 backdrop-blur-md border border-white/15 rounded-xl px-3.5 py-3 text-[12px] text-gray-200 shadow-2xl min-w-[200px] max-w-[260px]"
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
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Fewer</span>
            <span className="flex flex-1">
              {BUCKET_COLORS.map(function (color, i) {
                return (
                  <span
                    key={i}
                    className="inline-block flex-1 h-3 first:rounded-l-sm last:rounded-r-sm"
                    style={{ backgroundColor: color }}
                  />
                )
              })}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-gray-500">More</span>
          </div>
          <div className="text-[11px] text-gray-400 leading-relaxed">
            Country color indicates relative report count among approved reports. Cluster numbers on the map show reports at each geographic point.
          </div>
          <div className="text-[10px] text-gray-500 mt-2 pt-2 border-t border-white/5">
            Toggle the layer off via the Map icon on the right.
          </div>
        </div>
      )}
    </div>
  )
}
