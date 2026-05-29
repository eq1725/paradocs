'use client'

/**
 * ClusteringCard — V11.17.41 redesign (panel: Maya/Jordan/Lena/Sam).
 *
 * Memo: docs/CLUSTER_CARD_REDESIGN_PANEL.md
 *
 * v1 (this rev) ships:
 *   - Left-aligned editorial composition (matches Phenomenon Spotlight)
 *   - Corner pill carries the type label ("Geographic cluster" / "Recent
 *     burst" / "Category trend" / "Milestone")
 *   - Headline in Changa 600, body in Changa 400, hairline rule before
 *     meta footer
 *   - Left-edge accent rail (4px brand-purple, ~20% opacity) replaces
 *     the prior wash + dotgrid
 *   - Whole-card tap target; chevron in the meta footer instead of a
 *     "View Reports" pill
 *
 * v2 (also this rev) adds:
 *   - body sentence is now the API's `body` field, which the cluster
 *     route synthesises from a Haiku "finding" generator when there's
 *     enough signal (linked reports' shared locale, time, etc). Falls
 *     back to a quiet templated sentence when Haiku is unavailable.
 *   - Optional `baseline_text` second line ("Twice the usual week",
 *     etc) when the cluster type supports it and the data is
 *     defensible. Renders just below the body sentence, italicised
 *     in muted gray. Skipped on milestones.
 *
 * Explicitly NOT in this rev (deferred per panel):
 *   - Per-type emoji or per-type colour theming
 *   - "Trending Pattern" badge (the corner pill already self-identifies)
 *   - Giant numeric hero (count appears once, inside the headline)
 *   - Pill CTA button (whole-card link + chevron is sufficient)
 *
 * SWC compliant: var + function() form.
 */

import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export interface ClusterCardData {
  item_type: 'cluster'
  id: string
  cluster_type: 'geographic_cluster' | 'temporal_burst' | 'category_trend' | 'milestone'
  // V11.17.41 — Eyebrow label per panel memo. Examples:
  //   "Geographic cluster", "Recent burst", "Category trend", "Milestone"
  type_label: string
  // V11.17.41 — Headline is now the templated fact sentence
  // ("196 UFO reports from California this week."). Number is embedded
  // in the sentence; no separate numeric hero block.
  headline: string
  // V11.17.41 — Body is the "finding" sentence. v2 uses Haiku to
  // synthesise this from the linked reports' shared characteristics
  // when possible ("Most cluster around the Central Valley and the
  // coast south of Monterey."). Falls back to a quiet templated line.
  body: string
  // V11.17.41 — Optional baseline sentence ("Twice the usual week.")
  // surfaced only when the cluster type supports it (temporal_burst,
  // sometimes geographic_cluster) AND we have enough history to make
  // the claim defensible.
  baseline_text?: string
  // V11.17.41 — Human-readable category label ("UFOs & Aliens", not
  // the slug). Computed server-side so client doesn't need to look up
  // CATEGORY_CONFIG.
  category: string
  category_label: string
  report_count: number
  time_range: string
  location_summary?: string
  linked_report_ids: string[]
  // V8-era field. Kept for the legacy fallback path; not rendered.
  headline_legacy?: string
  subheadline_legacy?: string
}

interface ClusteringCardProps {
  item: ClusterCardData
  isActive: boolean
}

// V11.17.41 — fallback labels if the API doesn't emit type_label (e.g.
// during the brief window between server deploy and the consumer
// receiving the new shape).
var TYPE_LABEL_FALLBACK: Record<string, string> = {
  geographic_cluster: 'Geographic cluster',
  temporal_burst: 'Recent burst',
  category_trend: 'Category trend',
  milestone: 'Milestone',
}

export function ClusteringCard(props: ClusteringCardProps) {
  var item = props.item
  var typeLabel = item.type_label || TYPE_LABEL_FALLBACK[item.cluster_type] || 'Cluster'
  var categoryLabel = item.category_label || item.category
  var isMilestone = item.cluster_type === 'milestone'
  var href = '/explore?category=' + encodeURIComponent(item.category)

  // V11.17.41 — Backwards-compat: older API responses may not yet
  // emit `headline` / `body` in the new shape. Fall back to the
  // legacy templated fields so the card renders sensibly during a
  // staggered deploy window.
  var displayHeadline = item.headline || item.headline_legacy || ''
  var displayBody = item.body || item.subheadline_legacy || ''

  return (
    <Link
      href={href}
      className="block h-full w-full relative overflow-hidden bg-gray-950 group"
      role="article"
      aria-label={typeLabel + ': ' + displayHeadline}
    >
      {/* Left-edge accent rail — single brand-purple bar, no wash.
          Replaces the prior gradient + dotgrid surface. */}
      <div
        className="absolute top-0 bottom-0 left-0 w-1 pointer-events-none"
        style={{ background: 'linear-gradient(to right, rgba(144,0,240,0.55), rgba(144,0,240,0))', width: '60px' }}
        aria-hidden="true"
      />
      <div
        className="absolute top-0 bottom-0 left-0 w-1 pointer-events-none"
        style={{ background: '#9000F0' }}
        aria-hidden="true"
      />

      {/* Three-block left-aligned content. Padding mirrors the
          Phenomenon Spotlight card; mt-auto on the footer pins it to
          the bottom regardless of headline length. */}
      <div className={
        'relative z-10 h-full flex flex-col px-7 sm:px-10 transition-all duration-700 ' +
        'pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-[calc(80px+env(safe-area-inset-bottom,0px)+1.25rem)] md:pb-8 ' +
        (props.isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')
      }>
        {/* Eyebrow row — corner pill self-identifier. Optional small
            accent dot before milestones, per the panel memo. */}
        <div className="inline-flex items-center self-start gap-2 mb-7">
          {isMilestone && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: '#9000F0' }}
              aria-hidden="true"
            />
          )}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-[10px] font-sans font-semibold uppercase tracking-[0.14em] text-purple-200/90">
            {typeLabel}
          </span>
        </div>

        {/* Headline — the templated fact. Number is inside the sentence. */}
        <h2 className="font-display text-[26px] sm:text-[30px] font-semibold text-white leading-[1.2] tracking-[-0.005em] max-w-[22ch] mb-4">
          {displayHeadline}
        </h2>

        {/* Body — the shape sentence ("finding"). Cream-tinted gray. */}
        {displayBody && (
          <p className="font-display text-[15px] sm:text-[16px] font-normal text-gray-300/85 leading-[1.55] max-w-[34ch] mb-2">
            {displayBody}
          </p>
        )}

        {/* Optional baseline line — italic, dimmer, sits beneath body.
            Only rendered when the API emitted it (temporal_burst with
            enough trailing history; sometimes geographic_cluster). */}
        {item.baseline_text && (
          <p className="font-display text-[13.5px] sm:text-[14px] font-normal text-gray-400/70 leading-snug italic mb-3 max-w-[34ch]">
            {item.baseline_text}
          </p>
        )}

        {/* Hairline rule + meta footer pinned to the bottom. */}
        <div className="mt-auto">
          <div className="border-t border-white/[0.07] pt-4 flex items-center gap-1.5 text-[12px] font-sans font-medium text-gray-400 group-hover:text-gray-200 transition-colors">
            <span className="truncate">{categoryLabel}</span>
            {item.location_summary && (
              <>
                <span className="text-gray-600">·</span>
                <span className="truncate">{item.location_summary}</span>
              </>
            )}
            <span className="text-gray-600">·</span>
            <span className="truncate">{item.time_range}</span>
            <span className="flex-1" />
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          </div>
        </div>
      </div>
    </Link>
  )
}
