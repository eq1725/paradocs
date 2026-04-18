'use client'

/**
 * PatternsLane — the primary patterns surface at the top of the Saves tab.
 *
 * Horizontal scroller that interleaves insight cards (from the user's own
 * library) with related-report cards (unsaved items from the global
 * Paradocs feed that match the user's research footprint). Empty state
 * fades the whole lane out so it doesn't add visual noise when a user
 * has nothing yet.
 *
 * Behavior:
 *   - Fetches related reports on mount + when `refreshKey` changes.
 *   - Renders insight cards first (since they reflect what the user
 *     already cares about), then related reports.
 *   - Snap-scroll on mobile, mouse-wheel + drag on desktop.
 *   - "See all" button on the right opens a modal with the full list
 *     (deferred — we can add when users ask for it).
 */

import React, { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
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

export default function PatternsLane({ insights, onHighlight, refreshKey = 0 }: PatternsLaneProps) {
  const [relatedReports, setRelatedReports] = useState<RelatedReport[]>([])
  const [loading, setLoading] = useState(true)
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
  const showLane = hasInsights || hasRelated || loading

  if (!showLane) return null

  return (
    <section className="mb-4" aria-label="Patterns and related reports">
      <header className="flex items-center gap-2 mb-2 px-0.5">
        <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">
          Patterns & related reports
        </h2>
        <div className="flex-1" />
        {loading && <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />}
        <span className="text-[10px] text-gray-500 tabular-nums">
          {hasInsights || hasRelated
            ? `${insights.length + relatedReports.length}`
            : ''}
        </span>
      </header>

      {/* Horizontal scroller — snap on mobile, no snap on desktop */}
      <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory sm:snap-none -mx-1 px-1 py-1">
        {/* Insights first */}
        {insights.map(ins => (
          <div key={ins.id} className="flex-shrink-0 snap-start max-w-[320px]">
            <PatternCard kind="insight" insight={ins} onHighlight={onHighlight} />
          </div>
        ))}
        {/* Then related reports */}
        {relatedReports.map(r => (
          <div key={r.id} className="flex-shrink-0 snap-start max-w-[320px]">
            <PatternCard kind="related_report" report={r} />
          </div>
        ))}
        {/* Skeletons while loading, only if we have nothing else yet */}
        {loading && !hasInsights && !hasRelated && (
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
    </section>
  )
}
