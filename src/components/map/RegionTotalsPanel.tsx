'use client'

/**
 * RegionTotalsPanel — V10.9.D
 *
 * Desktop-only trigger + popover for the "region totals" data
 * (aggregated counts of reports whose coords are country/state
 * centroid fallbacks — they don't appear as pins; they're surfaced
 * here as honest aggregate counts).
 *
 * SME panel consensus (V10.9.D):
 *   - Demote from always-visible chrome to a secondary tool. Map is
 *     the hero; this is a glanceable+expandable supporting control.
 *   - Trigger lives in the existing right-rail control stack so it
 *     reads as "another map tool" — same visual language as
 *     basemap/heatmap/regions/locate buttons.
 *   - Trigger is a pin icon with a small count badge ("57") so the
 *     data is glanceable before opening.
 *   - Popover anchored leftward of the rail, brand-styled.
 *   - Three close paths: outside-click, ESC, explicit X button.
 *   - Hidden entirely when total = 0 (no chrome when nothing to show).
 *
 * Mobile: this component renders nothing — region totals live inside
 * MapBottomSheet on mobile (V10.9.C).
 */

import React, { useEffect, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
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
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // V10.9.D — close on outside-click + ESC. Stays open across
  // bucket updates / category filter changes (intentional —
  // re-fetches shouldn't bounce the panel closed mid-interaction).
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // No data, no chrome.
  if (total === 0) return null

  // Top 8 by count. Remainder summarized as "+ N more".
  const visible = buckets.slice(0, 8)
  const remaining = buckets.length - visible.length
  const remainingCount = buckets.slice(8).reduce((acc, b) => acc + b.total, 0)

  // Compact count format for the badge.
  const badgeText = total >= 10000
    ? Math.round(total / 1000).toString() + 'K'
    : total >= 1000
    ? (Math.round(total / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'K'
    : total.toString()

  return (
    // V10.9.D.1 — positioned ABOVE the existing 5-button MapControls
    // stack which lives at lg:bottom-[90px] and runs up to ~bottom-330px.
    // The pin trigger sits at bottom-[340px] with matching right-6 so
    // it reads as part of the same right-rail column rather than a
    // separate floating element. Earlier positioning at bottom-[200px]
    // collided with the regions toggle and left the count badge
    // bleeding past the right edge.
    <div
      ref={containerRef}
      className="hidden lg:block absolute lg:bottom-[340px] lg:right-6 z-20"
    >
      {/* Trigger button — visual language matches MapControls stack.
          40x40 round button with brand-purple count badge. The pin
          icon hints at the underlying data domain. */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={
          'relative flex items-center justify-center w-10 h-10 rounded-lg backdrop-blur-sm border shadow-lg transition-all ' +
          (open
            ? 'bg-purple-600/90 border-purple-500/50 text-white'
            : 'bg-gray-900/90 border-gray-700/50 text-gray-300 hover:text-white hover:bg-gray-800')
        }
        title={total.toLocaleString() + ' reports without precise location'}
        aria-label={'Region totals: ' + total.toLocaleString() + ' reports without precise location'}
        aria-expanded={open}
      >
        <MapPin size={18} />
        <span
          className={
            'absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center shadow-md ' +
            (open
              ? 'bg-white text-purple-700'
              : 'bg-purple-600 text-white border border-gray-950/40')
          }
          aria-hidden="true"
        >
          {badgeText}
        </span>
      </button>

      {/* Popover — anchored leftward of the trigger so it floats
          into the map area without clipping the right edge. */}
      {open && (
        <div
          role="dialog"
          aria-label="Region totals detail"
          className="absolute right-12 bottom-0 w-72 max-w-[calc(100vw-5rem)] rounded-xl bg-gray-950/95 backdrop-blur-md border border-gray-800 shadow-2xl overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-800/60">
            <MapPin className="w-4 h-4 text-purple-400 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Region totals
              </div>
              <div className="text-xs text-gray-300">
                {total.toLocaleString()} report{total === 1 ? '' : 's'} without precise location
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-white hover:bg-gray-800/70 transition-colors shrink-0"
              aria-label="Close region totals panel"
            >
              <X size={14} />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {visible.map(b => {
              const isActive = activeCountry === b.code || activeCountry === b.name
              return (
                <button
                  key={b.code}
                  onClick={() => onCountryClick?.(b.code, b.name)}
                  className={
                    'w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors text-left ' +
                    (isActive
                      ? 'bg-purple-900/40 text-white'
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
        </div>
      )}
    </div>
  )
}
