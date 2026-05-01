'use client'

/**
 * TodayHeader — page header for /discover (Today).
 *
 * Replaces the old 36px counter strip with a real header that includes:
 *   - sr-only h1 ("Today") for SEO + a11y
 *   - lens chip strip (All / Trending / On This Date / Photo & Video / Recent)
 *   - category chip strip (full set, scrollable)
 *   - segmented progress bar (8 segments) + "N / Total" counter
 *   - "View as list →" link to /explore preserving lens
 *   - feedback flash zone (aria-live for "Saved" / "Dismissed" / "More like this")
 *
 * URL parameters honored:
 *   ?lens=trending|recent|on-this-date|photo-video
 *   ?category=ufos_aliens|cryptids|...
 *
 * Sticky-below-header so it stays visible during scrolling.
 *
 * SWC: var, function expressions, string concat only.
 */

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { CATEGORY_CONFIG } from '@/lib/constants'
import CategoryIcon from '@/components/ui/CategoryIcon'
import type { PhenomenonCategory } from '@/lib/database.types'

export type TodayLens = 'all' | 'trending' | 'on-this-date' | 'photo-video' | 'recent'

interface LensSpec {
  key: TodayLens
  label: string
}

// Panel-review note: "Photo + Video" is renamed to "With Evidence" because
// the index doesn't republish source media (BFRO/NUFORC/NDERF/OBERF are
// link-only). The lens now matches reports with `has_physical_evidence` OR
// `has_photo_video AND we have local media`. See applyLens() in discover.tsx.
var LENSES: LensSpec[] = [
  { key: 'all',          label: 'All' },
  { key: 'trending',     label: 'Trending' },
  { key: 'on-this-date', label: 'On this day' },
  { key: 'photo-video',  label: 'With Evidence' },
  { key: 'recent',       label: 'Recent' },
]

var CATEGORY_KEYS: PhenomenonCategory[] = [
  'ufos_aliens',
  'cryptids',
  'ghosts_hauntings',
  'psychic_phenomena',
  'psychological_experiences',
  'consciousness_practices',
  'religion_mythology',
  'esoteric_practices',
  'perception_sensory',
  'biological_factors',
  'combination',
]

export function TodayHeader(props: {
  idx: number
  total: number
  lens: TodayLens
  category: string | null
  onLensChange: (lens: TodayLens) => void
  onCategoryChange: (cat: string | null) => void
  feedbackLabel: string | null
  showShortcutsToggle?: boolean
  onToggleShortcuts?: () => void
}) {
  var router = useRouter()

  var counter = props.total > 0
    ? (Math.min(props.idx + 1, props.total)) + ' / ' + props.total
    : (props.idx + 1).toString()

  // Build a "View as list →" target preserving current lens/category
  var browseQuery: string[] = []
  if (props.category) browseQuery.push('category=' + encodeURIComponent(props.category))
  if (props.lens && props.lens !== 'all') browseQuery.push('lens=' + encodeURIComponent(props.lens))
  var browseHref = '/explore' + (browseQuery.length > 0 ? '?' + browseQuery.join('&') : '')

  // Segmented progress bar — first 8 segments
  var SEGMENTS = 8
  var filled = props.total > 0 ? Math.min(SEGMENTS, Math.round(((props.idx + 1) / props.total) * SEGMENTS)) : 0

  return (
    <div className="sticky-below-header bg-gray-950/85 backdrop-blur-md border-b border-white/5">
      {/* sr-only h1 for accessibility + SEO */}
      <h1 className="sr-only">Today — Paradocs</h1>

      {/* Lens chip strip */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2">
          {LENSES.map(function (lens) {
            var isActive = props.lens === lens.key
            return (
              <button
                key={lens.key}
                onClick={function () { props.onLensChange(lens.key) }}
                className={
                  'flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-sans font-medium transition-colors border ' +
                  (isActive
                    ? 'bg-primary-500/15 border-primary-500/40 text-primary-300'
                    : 'bg-white/[0.03] border-white/10 text-gray-400 hover:bg-white/[0.06] hover:text-gray-200')
                }
              >
                {lens.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Category chip strip */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          <button
            onClick={function () { props.onCategoryChange(null) }}
            className={
              'flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-sans font-medium transition-colors border ' +
              (props.category === null
                ? 'bg-white/10 border-white/20 text-white'
                : 'bg-white/[0.03] border-white/10 text-gray-500 hover:bg-white/[0.06] hover:text-gray-300')
            }
          >
            All categories
          </button>
          {CATEGORY_KEYS.map(function (cat) {
            var cfg = CATEGORY_CONFIG[cat]
            if (!cfg) return null
            var isActive = props.category === cat
            return (
              <button
                key={cat}
                onClick={function () { props.onCategoryChange(cat) }}
                className={
                  'flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-sans font-medium transition-colors border inline-flex items-center gap-1 ' +
                  (isActive
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-white/[0.03] border-white/10 text-gray-400 hover:bg-white/[0.06] hover:text-gray-200')
                }
              >
                <CategoryIcon category={cat} size={11} />
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Combined: progress bar + inline counter + feedback flash + view-as-list + ? toggle.
          Collapses what was a separate 36px counter row (panel review #2) — saves chrome height. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2">
        <div className="flex items-center gap-3">
          <div
            className="flex gap-1 flex-1 min-w-0"
            role="progressbar"
            aria-valuenow={props.idx + 1}
            aria-valuemin={1}
            aria-valuemax={props.total || 1}
            aria-label="Today progress"
          >
            {Array.from({ length: SEGMENTS }).map(function (_, i) {
              var isFilled = i < filled
              return (
                <span
                  key={i}
                  className={'h-[3px] flex-1 rounded-full transition-colors duration-300 ' + (isFilled ? 'bg-primary-500' : 'bg-white/10')}
                />
              )
            })}
          </div>
          {/* Feedback flash zone — aria-live polite for screen readers.
              NOTE: was 'hidden xs:inline' but Tailwind has no default xs:
              breakpoint, so the span was permanently invisible — saves
              were firing but feedback was never shown (May 2026 fix). */}
          <span
            aria-live="polite"
            aria-atomic="true"
            className={
              'text-[10px] font-medium font-sans truncate transition-opacity duration-200 ' +
              (props.feedbackLabel ? 'opacity-100 max-w-[140px]' : 'opacity-0 max-w-0 overflow-hidden')
            }
            style={{
              color: props.feedbackLabel && props.feedbackLabel.indexOf('✦') >= 0
                ? '#FFD166'
                : props.feedbackLabel && props.feedbackLabel.indexOf('♡') >= 0
                  ? '#FF6B9D'
                  : '#9CA3AF',
            }}
          >
            {props.feedbackLabel || ''}
          </span>
          <Link
            href={browseHref}
            className="hidden sm:inline-flex text-[10px] font-sans font-medium text-gray-500 hover:text-primary-300 transition-colors flex-shrink-0"
          >
            {'View as list →'}
          </Link>
          <span className="text-[10px] text-gray-400 font-sans font-medium tabular-nums flex-shrink-0">
            {counter}
          </span>
          {props.showShortcutsToggle && (
            <button
              onClick={props.onToggleShortcuts}
              className="hidden md:inline-flex w-5 h-5 items-center justify-center rounded-full border border-white/10 text-[10px] text-gray-500 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
              aria-label="Show keyboard shortcuts"
              title="Keyboard shortcuts"
            >
              {'?'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default TodayHeader
