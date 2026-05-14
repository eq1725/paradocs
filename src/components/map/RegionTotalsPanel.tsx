'use client'

/**
 * RegionTotalsPanel — V10.9.A
 *
 * Floating overlay on the explore-map that shows aggregated counts
 * of reports whose location is country/state-precision only (i.e.
 * coords_synthetic=true). These reports DO NOT appear as pins on
 * the map — pinning them at shared centroids would create
 * misleading clusters (the V10.8.I "57 at Kansas" bug).
 *
 * The panel makes those reports visible as honest aggregate counts
 * without pretending to know their precise location. Click a row
 * to filter the map (and the rest of /explore) by that country.
 *
 * Design rationale (V10.9 SME panel):
 *   - Honesty: never pin a synthetic centroid as if it were a real spot.
 *   - Density: surface "the data exists" without occupying valuable
 *     map real estate. Compact collapsible panel, top-right.
 *   - Future-ready: this panel is the entry point. V10.9.B layers
 *     a country/state choropleth on top of the same data source
 *     (the report_region_counts materialized view) without breaking
 *     this UI.
 */

import React, { useState } from 'react'
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react'
import type { RegionBucket } from './useViewportData'

interface RegionTotalsPanelProps {
  buckets: RegionBucket[]
  total: number
  /** Called when the user clicks a country row — toggles country filter. */
  onCountryClick?: (countryCode: string, countryName: string) => void
  /** Currently active country filter (for highlighting). */
  activeCountry?: string | null
}

export default function RegionTotalsPanel({
  buckets,
  total,
  onCountryClick,
  activeCountry,
}: RegionTotalsPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (total === 0) return null

  // Top 8 by count. Remainder summarized as "+ N more".
  const visible = buckets.slice(0, 8)
  const remaining = buckets.length - visible.length
  const remainingCount = buckets.slice(8).reduce((acc, b) => acc + b.total, 0)

  return (
    <div
      className="absolute top-3 right-3 z-20 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl bg-gray-950/85 backdrop-blur-md border border-gray-800 shadow-xl overflow-hidden"
      role="region"
      aria-label="Region totals for low-precision reports"
    >
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-900/60 transition-colors text-left"
        aria-expanded={!collapsed}
      >
        <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
            Region totals
          </div>
          <div className="text-xs text-gray-300">
            {total.toLocaleString()} report{total === 1 ? '' : 's'} without precise location
          </div>
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
        )}
      </button>

      {!collapsed && (
        <div className="border-t border-gray-800/60 max-h-80 overflow-y-auto">
          {visible.map(b => {
            const isActive = activeCountry === b.code || activeCountry === b.name
            return (
              <button
                key={b.code}
                onClick={() => onCountryClick?.(b.code, b.name)}
                className={
                  'w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors text-left ' +
                  (isActive
                    ? 'bg-purple-900/30 text-white'
                    : 'text-gray-300 hover:bg-gray-900/60 hover:text-white')
                }
              >
                <span className="truncate">{b.name}</span>
                <span className="font-mono text-[11px] text-gray-400 tabular-nums shrink-0">
                  {b.total.toLocaleString()}
                </span>
              </button>
            )
          })}
          {remaining > 0 && (
            <div className="px-3 py-1.5 text-[11px] text-gray-500 italic border-t border-gray-800/40">
              + {remaining} more region{remaining === 1 ? '' : 's'} ({remainingCount.toLocaleString()} report{remainingCount === 1 ? '' : 's'})
            </div>
          )}
          <div className="px-3 py-2 text-[10px] text-gray-500 border-t border-gray-800/40 leading-snug">
            These reports specify only a country or state. They&rsquo;re counted here instead of pinned to avoid false clustering at region centroids.
          </div>
        </div>
      )}
    </div>
  )
}
