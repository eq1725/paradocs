'use client'

/**
 * LabProgressTracker — top-of-Lab strip showing growth + streak.
 *
 * The "you've built something" signal. Three stats:
 *   1. Total saves (+ delta over last 30 days, as a chevron)
 *   2. Current streak (consecutive days with any save)
 *   3. Inline SVG sparkline of saves-per-day for the last 30 days
 *
 * All data is derived from the entries' loggedAt timestamps — no extra
 * server round-trip. Tiny footprint on mobile (two-column on small, three
 * horizontal stats on desktop).
 */

import React, { useMemo } from 'react'
import { TrendingUp, Flame, ArrowUp, Minus } from 'lucide-react'
import type { EntryNode } from '@/lib/constellation-types'

interface LabProgressTrackerProps {
  entries: EntryNode[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export default function LabProgressTracker({ entries }: LabProgressTrackerProps) {
  const stats = useMemo(() => {
    const real = entries.filter(e => !e.isGhost)
    const now = Date.now()
    const startDay = new Date(); startDay.setHours(0, 0, 0, 0)
    const startTs = startDay.getTime()

    // Bucket saves by day over the last 30 days (today is bucket[29]).
    const buckets = new Array(30).fill(0) as number[]
    const daySavesSet = new Set<number>() // day indices (0 = today) with any save

    for (const e of real) {
      const t = new Date(e.loggedAt).getTime()
      if (isNaN(t)) continue
      const daysAgo = Math.floor((startTs + DAY_MS - t) / DAY_MS)
      if (daysAgo >= 0 && daysAgo < 30) {
        const idx = 29 - daysAgo
        if (idx >= 0 && idx < 30) buckets[idx] = (buckets[idx] || 0) + 1
      }
      // Track day offsets for streak calc (all time, not just 30 days)
      const dayDiff = Math.floor((startTs + DAY_MS - t) / DAY_MS)
      if (dayDiff >= 0) daySavesSet.add(dayDiff)
    }

    // Delta: count in last 30 days
    const delta30d = buckets.reduce((s, v) => s + v, 0)
    const totalBefore = real.length - delta30d

    // Streak: count consecutive days starting today (or yesterday) backward
    // while each day has at least one save. Starts at 0 if today empty AND
    // yesterday empty — otherwise counts back from whichever is active.
    let streak = 0
    const startProbe = daySavesSet.has(0) ? 0 : daySavesSet.has(1) ? 1 : -1
    if (startProbe >= 0) {
      let d = startProbe
      while (daySavesSet.has(d)) { streak++; d++ }
    }

    return {
      total: real.length,
      delta30d,
      totalBefore,
      buckets,
      streak,
    }
  }, [entries])

  // Percent change vs. prior period — used for the up/flat indicator.
  const changeLabel = stats.totalBefore === 0
    ? (stats.delta30d > 0 ? 'first saves' : 'none yet')
    : `+${stats.delta30d} in 30 days`

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-gradient-to-r from-gray-900/70 via-gray-900/40 to-gray-900/70 border border-gray-800 rounded-xl p-3 sm:p-4">
      {/* Total saves */}
      <div className="flex flex-col">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Total saves</div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-xl sm:text-2xl font-bold text-white tabular-nums">{stats.total}</span>
          <span className={
            stats.delta30d > 0
              ? 'inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-400'
              : 'inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-500'
          }>
            {stats.delta30d > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
            {changeLabel}
          </span>
        </div>
      </div>

      {/* Streak */}
      <div className="flex flex-col">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Streak</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Flame className={stats.streak > 0 ? 'w-4 h-4 sm:w-5 sm:h-5 text-orange-400' : 'w-4 h-4 sm:w-5 sm:h-5 text-gray-600'} />
          <span className="text-xl sm:text-2xl font-bold text-white tabular-nums">{stats.streak}</span>
          <span className="text-[10px] text-gray-500 leading-none pb-0.5">
            {stats.streak === 1 ? 'day' : 'days'}
          </span>
        </div>
      </div>

      {/* Sparkline */}
      <div className="flex flex-col">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1">
          <TrendingUp className="w-2.5 h-2.5" />
          Last 30 days
        </div>
        <Sparkline buckets={stats.buckets} className="mt-1 h-8 sm:h-10" />
      </div>
    </div>
  )
}

// ── Inline SVG sparkline ──

function Sparkline({ buckets, className }: { buckets: number[]; className?: string }) {
  // Normalize to 0-1 for plotting. If all zero, render a flat dim baseline.
  const max = Math.max(1, ...buckets)
  const points = buckets.map((v, i) => {
    const x = (i / (buckets.length - 1)) * 100
    const y = 100 - (v / max) * 100
    return `${x},${y}`
  }).join(' ')

  // Area polygon = sparkline + bottom-right + bottom-left (closes the shape).
  const areaPoints = `0,100 ${points} 100,100`

  const hasData = buckets.some(v => v > 0)

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label="Saves over the last 30 days"
    >
      <defs>
        <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity={hasData ? 0.5 : 0.05} />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill="url(#sparkline-fill)" points={areaPoints} />
      <polyline
        fill="none"
        stroke={hasData ? '#c084fc' : '#4b5563'}
        strokeWidth={hasData ? '2' : '1.5'}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
