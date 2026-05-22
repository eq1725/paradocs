/**
 * ChoroplethLegend — V11.15.0
 *
 * On-map legend explaining the choropleth color encoding. Renders a
 * compact 5-step gradient with count thresholds so users can decode
 * country tint at a glance.
 *
 * SME panel finding F4: "No legend explaining what colors mean."
 * This component fixes that. Mobile-friendly: collapses to a single
 * row of dots + min/max labels on screens < 640px wide.
 */

import React from 'react'

interface ChoroplethLegendProps {
  /** Quantile thresholds [q20, q40, q60, q80, max] from useChoroplethData. */
  quantiles: number[]
  /** True when the choropleth layer is active. Component hides otherwise. */
  visible: boolean
  /** Optional title; defaults to "Report density by country". */
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
  if (!visible || !quantiles || quantiles.length < 5) return null

  // Compute the 5 buckets' display ranges from the quantiles.
  // quantiles[i] is the upper bound (inclusive) for bucket i.
  const buckets: Array<{ lo: number; hi: number; color: string }> = [
    { lo: 1,                       hi: quantiles[0], color: BUCKET_COLORS[0] },
    { lo: quantiles[0] + 1,        hi: quantiles[1], color: BUCKET_COLORS[1] },
    { lo: quantiles[1] + 1,        hi: quantiles[2], color: BUCKET_COLORS[2] },
    { lo: quantiles[2] + 1,        hi: quantiles[3], color: BUCKET_COLORS[3] },
    { lo: quantiles[3] + 1,        hi: quantiles[4], color: BUCKET_COLORS[4] },
  ]

  return (
    <div
      role="img"
      aria-label={(title || 'Report density by country') + ': legend showing 5 tiers from ' + formatNum(buckets[0].lo) + ' to ' + formatNum(buckets[4].hi) + ' reports.'}
      className="absolute bottom-20 left-4 z-10 bg-gray-900/85 backdrop-blur-md border border-white/10 rounded-lg px-3 py-2.5 text-[11px] text-gray-300 shadow-lg lg:bottom-6 lg:max-w-[200px] pointer-events-none select-none"
    >
      <div className="font-medium text-gray-200 mb-1.5">{title || 'Reports per country'}</div>
      {/* Desktop: stacked rows */}
      <div className="hidden sm:flex flex-col gap-1">
        {buckets.map(function (b, i) {
          return (
            <div key={i} className="flex items-center gap-2">
              <span
                className="inline-block w-4 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: b.color }}
              />
              <span className="tabular-nums text-gray-400">{formatRange(b.lo, b.hi)}</span>
            </div>
          )
        })}
      </div>
      {/* Mobile: compact horizontal */}
      <div className="flex sm:hidden items-center gap-1">
        {buckets.map(function (b, i) {
          return (
            <span
              key={i}
              className="inline-block w-5 h-2.5 first:rounded-l-sm last:rounded-r-sm"
              style={{ backgroundColor: b.color }}
              title={formatRange(b.lo, b.hi) + ' reports'}
            />
          )
        })}
        <span className="ml-2 text-[10px] text-gray-500 tabular-nums">
          {formatNum(buckets[0].lo)} – {formatNum(buckets[4].hi)}
        </span>
      </div>
    </div>
  )
}
