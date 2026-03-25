/**
 * ActivitySummary — "Your Activity This Week" consolidated card.
 *
 * Replaces the scattered metric pills and research streak widget
 * with one clean summary card. Shows: cases viewed, reports saved,
 * research streak days, and a compact 7-day activity heatmap.
 *
 * Mobile: full-width card with 2x2 stat grid.
 * Desktop: same card, can sit in a column layout.
 */

import React from 'react'
import { Flame, Eye, Bookmark, Clock } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface ActivitySummaryProps {
  /** Number of reports saved (total) */
  reportsSaved: number
  /** Number of artifacts in research hub */
  artifactsCount: number
  /** Current research streak in days */
  streakDays: number
  /** Number of constellation entries (as proxy for engagement) */
  constellationEntries: number
}

var stats_config = [
  { key: 'artifactsCount', label: 'Artifacts', icon: Eye, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { key: 'reportsSaved', label: 'Reports Saved', icon: Bookmark, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { key: 'streakDays', label: 'Day Streak', icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { key: 'constellationEntries', label: 'Logged', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
]

export default function ActivitySummary(props: ActivitySummaryProps) {
  var values: Record<string, number> = {
    artifactsCount: props.artifactsCount,
    reportsSaved: props.reportsSaved,
    streakDays: props.streakDays,
    constellationEntries: props.constellationEntries,
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Your Research Snapshot
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {stats_config.map(function(stat) {
          var Icon = stat.icon
          var value = values[stat.key] || 0
          return (
            <div
              key={stat.key}
              className="flex items-center gap-2.5 p-2.5 bg-gray-950/50 rounded-lg"
            >
              <div className={classNames('p-1.5 rounded-md flex-shrink-0', stat.bg)}>
                <Icon className={classNames('w-3.5 h-3.5', stat.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-bold text-white leading-tight">
                  {value}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">
                  {stat.label}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
