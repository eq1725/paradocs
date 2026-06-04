'use client'

// V11.17.69 - Tier 2B
//
// RadarSurface — per LAB_PANEL_REVIEW_V3 §5, this wraps the existing
// RadarVisualization with three scope-clarity affordances the panel
// flagged as missing in the prior /lab build:
//
//   1. Permanent scope eyebrow above the dial. Names the user's anchor
//      experience, the phenomenon scope, and the geographic scope in
//      ONE line so the reader never has to wonder "what am I looking
//      at?".
//   2. "What's not shown" tooltip — small (i) icon in the eyebrow row;
//      tap to surface the three exclusions (other phen families,
//      outside-radius reports, sub-threshold matches).
//   3. "Widen the view" pill below the dial. Tap to relax the filter
//      one step (nearby → all, etc.).
//
// IMPORTANT: this is a focused categorical lens, NOT the geographic
// surface. The GeographicSurface (real MapLibre map) is the spatial
// truth; RadarSurface is the abstract / categorical lens. Per V3 §5
// the two are complementary.
//
// This component does NOT own the underlying RadarVisualization
// (already in /components/radar/RadarVisualization.tsx); it just
// provides the eyebrow/tooltip/widen-pill chrome.

import React, { useState } from 'react'
import { Info, Search } from 'lucide-react'
import RadarVisualization, { CATEGORY_LABELS } from '@/components/radar/RadarVisualization'
import type { RadarMatch, RadarUser } from '@/components/radar/RadarVisualization'

interface RadarSurfaceProps {
  /** Matches surfaced from the constellation match RPC. */
  matches: RadarMatch[]
  /** User's location, for the haversine "nearby" filter. */
  user: RadarUser
  /**
   * Anchor experience descriptor — used in the eyebrow.
   * Example: "1998 Lumberton triangle".
   */
  anchorLabel: string
  /**
   * Phenomenon family slug for the eyebrow scope. Mapped to
   * CATEGORY_LABELS for display ("UFOs" / "Ghosts" / etc.).
   */
  phenFamily: string
  /**
   * Total number of related reports in the full unrestricted
   * archive query — used in the "widen the view" pill copy:
   * "Showing 14 of 132 related reports."
   */
  totalRelated?: number
  /** Optional click handler when a match dot is tapped. */
  onMatchClick?: (m: RadarMatch) => void
  /** Optional click handler when the YOU center is tapped. */
  onCenterClick?: () => void
  /** Tier of the current viewer — gates depth-add affordances. */
  tier?: 'free' | 'basic' | 'pro' | null
}

type Filter = 'all' | 'high' | 'nearby'

function describeScopeClauses(filter: Filter, phenFamilyLabel: string, anchorLabel: string): string {
  // Three-clause sentence per V3 §5 panel guidance:
  //   "Reports matching your 1998 Lumberton triangle — UFO-shape
  //    phenomena, all decades, North America."
  var anchorClause = anchorLabel ? 'your ' + anchorLabel : 'your account'
  var phenClause = phenFamilyLabel + ' phenomena'
  var scopeClause = 'all decades'
  if (filter === 'high') scopeClause = 'strong matches only'
  else if (filter === 'nearby') scopeClause = 'within ~500 miles'
  return 'Reports matching ' + anchorClause + ' — ' + phenClause + ', ' + scopeClause + '.'
}

export default function RadarSurface(props: RadarSurfaceProps) {
  var [filter, setFilter] = useState<Filter>('all')
  var [showTooltip, setShowTooltip] = useState(false)

  var phenFamilyLabel = CATEGORY_LABELS[props.phenFamily] || 'this category'

  // V3 §5 affordance #3 — "Showing X of Y related reports. Widen the view"
  var visibleCount = props.matches.length
  var canWiden = filter !== 'all'

  function widenView() {
    // Step-up: nearby → all; high → all. Always lands at 'all'.
    setFilter('all')
  }

  function chipClass(active: boolean) {
    return 'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium uppercase tracking-wider transition-colors border ' +
      (active
        ? 'bg-purple-600/30 border-purple-500/60 text-white'
        : 'bg-gray-900/40 border-gray-700/60 text-gray-400 hover:text-gray-200')
  }

  return (
    <section
      aria-label="Categorical lens — abstract view of related accounts"
      className="rounded-2xl border border-gray-800/60 bg-gray-950/40 p-4 sm:p-5"
    >
      {/* V3 §5 affordance #1 — permanent scope eyebrow. */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-[0.22em] uppercase text-purple-300 mb-1">
            Categorical lens
          </p>
          <p className="text-xs text-gray-300 leading-relaxed">
            {describeScopeClauses(filter, phenFamilyLabel, props.anchorLabel)}
          </p>
        </div>
        {/* V3 §5 affordance #2 — "What's not shown" (i) tooltip. */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            aria-label="What's not shown in this view"
            aria-expanded={showTooltip}
            onClick={function () { setShowTooltip(function (v) { return !v }) }}
            className="p-1 rounded-md text-gray-500 hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
          {showTooltip && (
            <div
              role="dialog"
              aria-label="What's not shown"
              className="absolute right-0 top-7 z-30 w-72 rounded-xl border border-purple-500/40 bg-gray-950 shadow-2xl p-3"
              onMouseLeave={function () { setShowTooltip(false) }}
            >
              <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-300 mb-1.5">
                What&rsquo;s not shown
              </p>
              <ul className="text-xs text-gray-300 leading-relaxed space-y-1.5 list-disc list-inside">
                <li>Reports from other phenomena (ghosts, cryptids, etc.).</li>
                <li>Reports outside the selected radius or filter.</li>
                <li>Reports the matcher rated below the relevance threshold.</li>
              </ul>
              <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                Tap <span className="text-purple-300 font-semibold">Widen the view</span> below to relax the filter, or open the embedded map above for the spatial picture.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* The actual dial. */}
      <div className="flex justify-center mb-3">
        <RadarVisualization
          mode="idle"
          matches={props.matches}
          user={props.user}
          filter={filter}
          size={360}
          centerLabel="YOU"
          onMatchClick={props.onMatchClick}
          onCenterClick={props.onCenterClick}
        />
      </div>

      {/* Filter chips — kept tight; the previous "Strong matches"
          chip was removed in PR-4-a (Bug #91). */}
      <div className="flex justify-center gap-2 mb-2 flex-wrap">
        <button type="button" onClick={function () { setFilter('all') }} className={chipClass(filter === 'all')}>
          All reports
        </button>
        <button type="button" onClick={function () { setFilter('nearby') }} className={chipClass(filter === 'nearby')}>
          Nearby
        </button>
      </div>

      {/* V3 §5 affordance #3 — "Widen the view" pill. */}
      {(props.totalRelated && visibleCount < props.totalRelated) || canWiden ? (
        <div className="flex justify-center mt-3">
          <button
            type="button"
            onClick={widenView}
            disabled={!canWiden && (!props.totalRelated || visibleCount >= (props.totalRelated || 0))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-600/15 border border-purple-500/40 text-xs font-medium text-purple-200 hover:bg-purple-600/25 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Search className="w-3.5 h-3.5" />
            {props.totalRelated && visibleCount < props.totalRelated
              ? <>Showing {visibleCount} of {props.totalRelated} related reports &middot; Widen the view</>
              : <>Widen the view</>
            }
          </button>
        </div>
      ) : null}

      {/* Empty-cluster honest copy per V2 §5 last paragraph. */}
      {visibleCount === 0 && (
        <p className="text-xs text-gray-400 text-center mt-4 leading-relaxed max-w-sm mx-auto">
          No close matches yet in this view. As the Archive grows, related
          accounts will surface here.
        </p>
      )}
    </section>
  )
}
