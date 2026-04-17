'use client'

/**
 * InsightsPanel — readable card feed of library-wide patterns.
 *
 * This is where the constellation stops being a visualization and starts
 * being a research tool. Each card summarizes an AI-detected pattern in
 * plain text ("5 of your saves share #military") and exposes a "Highlight"
 * action that tells the parent to open the first matching save for the
 * pattern so the user can investigate the concrete evidence.
 *
 * Two layouts:
 *   - `panel` (desktop): floating bottom-right of the map, compact vertical
 *                list of up to 6 cards. Collapsible via a header toggle.
 *   - `drawer` (mobile): pull-up from the bottom of the Lab tab. Closed
 *                state shows a single "N patterns" pill; open state shows
 *                the card stack at ~60vh tall.
 */

import React, { useState } from 'react'
import {
  Sparkles, ChevronUp, ChevronDown, MapPin, Calendar, Tag, Zap, Star, Crosshair,
} from 'lucide-react'
import type { Insight } from '@/lib/constellation-data'
import { classNames } from '@/lib/utils'

interface InsightsPanelProps {
  insights: Insight[]
  onHighlight: (entryIds: string[]) => void
  layout?: 'panel' | 'drawer'
}

// Icon + accent color per insight type — subtle but useful at a glance
const TYPE_STYLE: Record<Insight['type'], { icon: React.ComponentType<{ className?: string }>; accent: string; bg: string }> = {
  tag_cluster:         { icon: Tag,       accent: 'text-amber-300',  bg: 'bg-amber-500/10 border-amber-500/20' },
  location_cluster:    { icon: MapPin,    accent: 'text-sky-300',    bg: 'bg-sky-500/10 border-sky-500/20' },
  temporal_cluster:    { icon: Calendar,  accent: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/20' },
  category_compelling: { icon: Star,      accent: 'text-yellow-300', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  cross_category:      { icon: Zap,       accent: 'text-cyan-300',   bg: 'bg-cyan-500/10 border-cyan-500/20' },
}

export default function InsightsPanel({ insights, onHighlight, layout = 'panel' }: InsightsPanelProps) {
  // Desktop: expanded by default (~260 wide). Mobile: closed by default.
  const [open, setOpen] = useState(layout === 'panel')

  if (!insights || insights.length === 0) return null

  const topInsights = insights.slice(0, 6)

  if (layout === 'drawer') {
    // Mobile pull-up drawer — fixed to the viewport so it floats above any
    // scroll content. Closed = just a pill.
    return (
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
        <div className="pointer-events-auto bg-black/80 backdrop-blur-md border-t border-white/10 rounded-t-2xl transition-transform">
          {/* Drag handle / header */}
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span className="text-xs font-semibold text-white">
                {insights.length} pattern{insights.length === 1 ? '' : 's'}
              </span>
              {!open && (
                <span className="text-[10px] text-gray-500 truncate ml-1">
                  — {insights[0].title}
                </span>
              )}
            </div>
            {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
          </button>

          {open && (
            <div className="px-3 pb-3 max-h-[55vh] overflow-y-auto space-y-2">
              {topInsights.map(ins => (
                <InsightCard key={ins.id} insight={ins} onHighlight={onHighlight} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Desktop floating panel — bottom-right of the map
  return (
    <div className="hidden sm:flex flex-col gap-0 bg-black/55 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden w-[280px] shadow-2xl">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between px-3 py-2 border-b border-white/5 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
          <span className="text-[11px] font-semibold text-white tracking-wide">
            Patterns ({insights.length})
          </span>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronUp className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {open && (
        <div className="p-2 space-y-1.5 max-h-[340px] overflow-y-auto">
          {topInsights.map(ins => (
            <InsightCard key={ins.id} insight={ins} onHighlight={onHighlight} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Single insight card (used in both layouts) ──

function InsightCard({ insight, onHighlight }: { insight: Insight; onHighlight: (ids: string[]) => void }) {
  const style = TYPE_STYLE[insight.type] || TYPE_STYLE.tag_cluster
  const Icon = style.icon

  return (
    <div className={classNames(
      'rounded-lg border p-2.5 transition-colors',
      style.bg
    )}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex-shrink-0">
          <Icon className={classNames('w-3.5 h-3.5', style.accent)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-white leading-tight">
            {insight.title}
          </div>
          <p className="text-[10px] text-gray-400 mt-1 leading-snug line-clamp-3">
            {insight.body}
          </p>
          <button
            onClick={() => onHighlight(insight.entryIds)}
            className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-cyan-300/90 hover:text-cyan-200 transition-colors"
          >
            <Crosshair className="w-3 h-3" />
            Show matching saves
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * InsightCardInline — same card, but designed to interleave with entry
 * cards in the List view. Slightly different padding and emphasis so it
 * doesn't visually dominate the flow of saved entries.
 */
export function InsightCardInline({ insight, onHighlight }: { insight: Insight; onHighlight: (ids: string[]) => void }) {
  const style = TYPE_STYLE[insight.type] || TYPE_STYLE.tag_cluster
  const Icon = style.icon

  return (
    <div className={classNames(
      'rounded-xl border p-3 relative',
      style.bg
    )}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 p-1.5 rounded-md bg-white/5">
          <Icon className={classNames('w-4 h-4', style.accent)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold mb-1">
            <Sparkles className={classNames('w-2.5 h-2.5', style.accent)} />
            <span className={style.accent}>Pattern detected</span>
          </div>
          <div className="text-sm font-semibold text-white leading-tight">
            {insight.title}
          </div>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            {insight.body}
          </p>
          <button
            onClick={() => onHighlight(insight.entryIds)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
          >
            <Crosshair className="w-3 h-3" />
            Show matching saves
          </button>
        </div>
      </div>
    </div>
  )
}
