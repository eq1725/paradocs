'use client'

/**
 * LabProgressTracker — research-pulse strip for the top of the Lab.
 *
 * Deliberately NOT a gamified streak/sparkline widget. Research tools
 * shouldn't feel like Duolingo. Instead, we surface domain-relevant
 * signals a researcher actually cares about:
 *
 *   1. Total saves — the anchor metric
 *   2. Recency — "last saved N days ago" (softer than a streak, avoids
 *      guilt when the user takes a break)
 *   3. Top category this month — where their attention is actually going
 *   4. Community overlap — "N researchers share URLs with you" when the
 *      flywheel convergence signal has something to say
 *
 * Collapsible via a header chevron — power users with 500 saves can
 * minimize it after the first session.
 */

import React, { useMemo, useState } from 'react'
import {
  Bookmark, Clock, TrendingUp, Users, ChevronDown, ChevronUp,
} from 'lucide-react'
import type { EntryNode } from '@/lib/constellation-types'
import { CONSTELLATION_NODES } from '@/lib/constellation-data'
import { classNames } from '@/lib/utils'

interface LabProgressTrackerProps {
  entries: EntryNode[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export default function LabProgressTracker({ entries }: LabProgressTrackerProps) {
  const [collapsed, setCollapsed] = useState(false)

  const stats = useMemo(() => {
    const real = entries.filter(e => !e.isGhost)
    const now = Date.now()

    // Recency — days since the most recent save.
    let lastSaveMs = 0
    for (const e of real) {
      const t = new Date(e.loggedAt).getTime()
      if (!isNaN(t) && t > lastSaveMs) lastSaveMs = t
    }
    const daysSinceLast = lastSaveMs > 0 ? Math.floor((now - lastSaveMs) / DAY_MS) : -1

    // Top category in the last 30 days.
    const monthCutoff = now - 30 * DAY_MS
    const monthlyByCategory: Record<string, number> = {}
    let monthlySaves = 0
    for (const e of real) {
      const t = new Date(e.loggedAt).getTime()
      if (isNaN(t) || t < monthCutoff) continue
      monthlyByCategory[e.category] = (monthlyByCategory[e.category] || 0) + 1
      monthlySaves++
    }
    let topCategoryId: string | null = null
    let topCategoryCount = 0
    for (const [cat, count] of Object.entries(monthlyByCategory)) {
      if (count > topCategoryCount) {
        topCategoryId = cat
        topCategoryCount = count
      }
    }
    const topCategoryNode = topCategoryId
      ? CONSTELLATION_NODES.find(n => n.id === topCategoryId)
      : null

    // Community overlap: sum of communitySaveCount across all external saves.
    // Each entry's communitySaveCount is already "other researchers" count.
    // We approximate "distinct other researchers" conservatively as the max
    // across entries (true distinct count needs a separate backend query).
    let maxOverlap = 0
    for (const e of real) {
      if (typeof e.communitySaveCount === 'number' && e.communitySaveCount > maxOverlap) {
        maxOverlap = e.communitySaveCount
      }
    }

    return {
      total: real.length,
      daysSinceLast,
      monthlySaves,
      topCategoryLabel: topCategoryNode?.label || null,
      topCategoryIcon: topCategoryNode?.icon || null,
      topCategoryCount,
      maxOverlap,
    }
  }, [entries])

  const recencyLabel =
    stats.daysSinceLast < 0 ? 'No saves yet' :
    stats.daysSinceLast === 0 ? 'Today' :
    stats.daysSinceLast === 1 ? 'Yesterday' :
    stats.daysSinceLast < 7 ? stats.daysSinceLast + ' days ago' :
    stats.daysSinceLast < 30 ? Math.floor(stats.daysSinceLast / 7) + ' weeks ago' :
    Math.floor(stats.daysSinceLast / 30) + ' months ago'

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-gray-900/60 border border-gray-800 hover:border-gray-700 transition-colors text-left"
        aria-label="Expand research pulse"
      >
        <div className="flex items-center gap-3 text-xs text-gray-500 min-w-0">
          <span className="flex items-center gap-1 flex-shrink-0">
            <Bookmark className="w-3 h-3 text-purple-400" />
            <span className="tabular-nums text-gray-300">{stats.total}</span>
            <span>saves</span>
          </span>
          <span className="hidden sm:flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" />
            <span>last {recencyLabel.toLowerCase()}</span>
          </span>
          {stats.topCategoryLabel && (
            <span className="hidden md:flex items-center gap-1 flex-shrink-0 truncate">
              <TrendingUp className="w-3 h-3" />
              <span>focus: {stats.topCategoryLabel}</span>
            </span>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
      </button>
    )
  }

  return (
    <div className="rounded-xl bg-gradient-to-r from-gray-900/70 via-gray-900/40 to-gray-900/70 border border-gray-800 p-3 sm:p-4 relative">
      <button
        onClick={() => setCollapsed(true)}
        className="absolute top-2 right-2 p-1 rounded text-gray-600 hover:text-gray-300 transition-colors"
        aria-label="Collapse research pulse"
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Research pulse
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Total saves */}
        <Stat
          icon={Bookmark}
          iconTint="text-purple-400"
          label="Total saves"
          value={String(stats.total)}
          hint={stats.total === 1 ? 'item' : 'items'}
        />

        {/* Recency */}
        <Stat
          icon={Clock}
          iconTint="text-sky-400"
          label="Last saved"
          value={recencyLabel}
          hint={stats.daysSinceLast >= 0 ? 'just a check-in' : 'save one to start'}
          compact
        />

        {/* Focus area this month */}
        <Stat
          icon={TrendingUp}
          iconTint="text-emerald-400"
          label="This month's focus"
          value={
            stats.topCategoryLabel
              ? (stats.topCategoryIcon ? stats.topCategoryIcon + ' ' : '') + stats.topCategoryLabel
              : 'Not enough saves yet'
          }
          hint={stats.topCategoryCount > 0 ? stats.topCategoryCount + ' this month' : undefined}
          compact
        />

        {/* Community overlap (when there's anything to report) */}
        <Stat
          icon={Users}
          iconTint="text-cyan-300"
          label="Researcher overlap"
          value={stats.maxOverlap > 0 ? '+' + stats.maxOverlap + ' others' : '—'}
          hint={stats.maxOverlap > 0 ? 'share URLs with you' : 'none found yet'}
          compact
          muted={stats.maxOverlap === 0}
        />
      </div>
    </div>
  )
}

// ── Single stat cell ──

function Stat({
  icon: Icon,
  iconTint,
  label,
  value,
  hint,
  compact,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>
  iconTint: string
  label: string
  value: string
  hint?: string
  compact?: boolean
  muted?: boolean
}) {
  return (
    <div className={classNames('flex flex-col', muted && 'opacity-60')}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
        <Icon className={classNames('w-2.5 h-2.5', iconTint)} />
        <span className="truncate">{label}</span>
      </div>
      <div className={classNames(
        'mt-0.5 font-bold text-white tabular-nums leading-tight',
        compact ? 'text-sm sm:text-base' : 'text-lg sm:text-2xl',
        'truncate'
      )}>
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-gray-500 truncate">{hint}</div>
      )}
    </div>
  )
}
