'use client'

/**
 * PatternsLane — the primary patterns surface at the top of the Saves tab.
 *
 * Layout:
 *   - Mobile: horizontal snap-scroller, one card visible at a time.
 *   - Desktop: responsive grid, 2-3 cards per row, matching the visual
 *     weight of the entry-card grid below so the section reads as a
 *     first-class band rather than an afterthought.
 *
 * Content:
 *   - Library insights from detectInsights (historical waves, tag
 *     co-occurrence, geographic density, temporal clusters).
 *   - Related reports from /api/constellation/related-reports — unsaved
 *     items from the global Paradocs feed that match the user's research
 *     footprint.
 *
 * A "See all" expand/collapse keeps the default view to 2 rows (~6 cards)
 * so the section doesn't crowd out the user's own saves.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import PatternCard from './PatternCard'
import type { Insight } from '@/lib/constellation-data'
import type { RelatedReport, RelatedReportsResponse } from '@/pages/api/constellation/related-reports'

interface PatternsLaneProps {
  insights: Insight[]
  onHighlight: (entryIds: string[]) => void
  /** Bump to force a related-reports refetch (after a save, etc.) */
  refreshKey?: number
}

const DEFAULT_VISIBLE = 6 // two rows of three on desktop

export default function PatternsLane({ insights, onHighlight, refreshKey = 0 }: PatternsLaneProps) {
  const [relatedReports, setRelatedReports] = useState<RelatedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const fetchSeq = useRef(0)

  useEffect(() => {
    const seq = ++fetchSeq.current
    let cancelled = false
    async function run() {
      setLoading(true)
      try {
        const sess = await supabase.auth.getSession()
        const token = sess.data.session?.access_token
        if (!token) return
        const res = await fetch('/api/constellation/related-reports', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const json: RelatedReportsResponse = await res.json()
        if (cancelled || seq !== fetchSeq.current) return
        setRelatedReports(json.reports || [])
      } catch {
        // Silently no-op — the lane just shows insights if related-reports fails.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [refreshKey])

  const hasInsights = insights.length > 0
  const hasRelated = relatedReports.length > 0
  const totalCount = insights.length + relatedReports.length

  // Nothing to show and we're done fetching — don't take up any space.
  if (!loading && !hasInsights && !hasRelated) return null

  // Build unified card list: insights first (more relevant to user), then related reports
  const allCards = [
    ...insights.map(ins => ({ kind: 'insight' as const, data: ins, key: `ins-${ins.id}` })),
    ...relatedReports.map(r => ({ kind: 'related' as const, data: r, key: `rel-${r.id}` })),
  ]

  const visibleCards = expanded ? allCards : allCards.slice(0, DEFAULT_VISIBLE)
  const hiddenCount = allCards.length - visibleCards.length

  return (
    <section
      className="mb-6 rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/[0.04] via-white/[0.02] to-transparent p-4 sm:p-5"
      aria-label="Patterns and related reports"
    >
      <header className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-md bg-cyan-500/15">
          <Sparkles className="w-4 h-4 text-cyan-300" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white leading-tight">
            Patterns & related reports
          </h2>
          <p className="text-[11px] text-gray-400 leading-tight mt-0.5">
            Historical context, emergent signals, and unsaved reports that match your research
          </p>
        </div>
        <div className="flex-1" />
        {loading && <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />}
        {totalCount > 0 && (
          <span className="text-[11px] text-gray-400 tabular-nums">
            {totalCount}
          </span>
        )}
      </header>

      {/* Desktop: responsive grid. Mobile: horizontal snap-scroller. */}
      <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {visibleCards.map(card =>
          card.kind === 'insight' ? (
            <PatternCard
              key={card.key}
              kind="insight"
              insight={card.data}
              onHighlight={onHighlight}
            />
          ) : (
            <PatternCard key={card.key} kind="related_report" report={card.data} />
          ),
        )}
        {loading && visibleCards.length === 0 && (
          <>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="h-[140px] rounded-xl border border-white/5 bg-white/[0.03] animate-pulse"
              />
            ))}
          </>
        )}
      </div>

      {/* Mobile-only horizontal scroller */}
      <div className="sm:hidden flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-1 px-1 py-0.5">
        {allCards.map(card => (
          <div key={card.key} className="flex-shrink-0 snap-start w-[85%] max-w-[320px]">
            {card.kind === 'insight' ? (
              <PatternCard
                kind="insight"
                insight={card.data}
                onHighlight={onHighlight}
              />
            ) : (
              <PatternCard kind="related_report" report={card.data} />
            )}
          </div>
        ))}
        {loading && allCards.length === 0 && (
          <>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="flex-shrink-0 snap-start w-[280px] h-[140px] rounded-xl border border-white/5 bg-white/[0.03] animate-pulse"
              />
            ))}
          </>
        )}
      </div>

      {/* Expand / collapse toggle (desktop only — mobile scrolls horizontally) */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="hidden sm:inline-flex mt-3 items-center gap-1 text-[11px] font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
        >
          Show {hiddenCount} more
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}
      {expanded && allCards.length > DEFAULT_VISIBLE && (
        <button
          onClick={() => setExpanded(false)}
          className="hidden sm:inline-flex mt-3 items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-white transition-colors"
        >
          Show less
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      )}
    </section>
  )
}
