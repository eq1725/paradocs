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

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Search, X, LayoutGrid } from 'lucide-react'
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
  // V2 panel review additions
  /** Optional streak count — when > 0, shows a streak chip top-right */
  streakDays?: number
  /** Native search overlay value (controlled) */
  searchQuery?: string
  /** Search query change handler */
  onSearchQueryChange?: (q: string) => void
  // V5-next additions
  /** Toggle to open desktop grid mode overlay (3x3 card preview) */
  onToggleGrid?: () => void
}) {
  var router = useRouter()
  var [searchOpen, setSearchOpen] = useState(false)
  var [shortcutsPulsed, setShortcutsPulsed] = useState(false)
  var searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(function () {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [searchOpen])

  // V5: pulse the "?" once per session to advertise keyboard shortcuts on
  // desktop where they're otherwise undiscoverable.
  useEffect(function () {
    if (!props.showShortcutsToggle) return
    if (typeof window === 'undefined') return
    try {
      var KEY = 'today_shortcut_pulsed_v1'
      if (sessionStorage.getItem(KEY) === '1') return
      // Defer slightly so the user can't possibly miss it.
      var t = setTimeout(function () {
        setShortcutsPulsed(true)
        sessionStorage.setItem(KEY, '1')
        setTimeout(function () { setShortcutsPulsed(false) }, 2400)
      }, 1500)
      return function () { clearTimeout(t) }
    } catch (e) {}
  }, [props.showShortcutsToggle])

  function closeSearch() {
    setSearchOpen(false)
    if (props.onSearchQueryChange) props.onSearchQueryChange('')
  }

  // V4 QA: progress bar + X/total counter removed. They were anti-features
  // for the Gaia cohort — "1/4853" reads as homework, not exploration. The
  // streak chip + Today's Lead badge + lens chips already carry the
  // daily-rhythm signal.

  // Build a "View as list →" target preserving current lens/category
  var browseQuery: string[] = []
  if (props.category) browseQuery.push('category=' + encodeURIComponent(props.category))
  if (props.lens && props.lens !== 'all') browseQuery.push('lens=' + encodeURIComponent(props.lens))
  var browseHref = '/explore' + (browseQuery.length > 0 ? '?' + browseQuery.join('&') : '')

  return (
    // V6.7: bg opacity 0.85 → 0.97 so card content scrolling under the
    // sticky header doesn't bleed through visually. Backdrop-blur stays on.
    <div className="sticky-below-header bg-gray-950/97 backdrop-blur-md border-b border-white/5">
      {/* sr-only h1 for accessibility + SEO */}
      <h1 className="sr-only">Today — Paradocs</h1>

      {/* Lens chip strip — wrapped in fade-mask to hint at horizontal scroll */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2 today-fade-mask-r">
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

      {/* Category chip strip — also wrapped in fade-mask */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 today-fade-mask-r">
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

      {/* V4 QA: simplified utility row — feedback flash + streak chip + search +
          view-as-list + (?) shortcuts toggle. No progress bar, no X/total counter.
          The row stays tiny when nothing is happening (just the search icon
          and view-as-list link). */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2 pt-1">
        <div className="flex items-center justify-end gap-3 min-h-[20px]">
          {/* Feedback flash zone — aria-live polite for screen readers */}
          <span
            aria-live="polite"
            aria-atomic="true"
            className={
              'text-[11px] font-medium font-sans truncate transition-opacity duration-200 mr-auto ' +
              (props.feedbackLabel ? 'opacity-100 max-w-[180px]' : 'opacity-0 max-w-0 overflow-hidden')
            }
            style={{
              color: props.feedbackLabel && props.feedbackLabel.indexOf('✦') >= 0
                ? '#FFD166'
                : props.feedbackLabel && props.feedbackLabel.indexOf('♡') >= 0
                  ? '#FF6B9D'
                  : '#D1D5DB',
            }}
          >
            {props.feedbackLabel || ''}
          </span>
          {/* Streak chip — V5: now tappable, opens Lab streak history. */}
          {(typeof props.streakDays === 'number' && props.streakDays >= 2) ? (
            <Link
              href="/lab?tab=streak"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-[10px] font-sans font-semibold text-amber-300 hover:bg-amber-500/25 transition-colors flex-shrink-0"
              title={props.streakDays + ' day streak — view streak history'}
            >
              <span aria-hidden="true">{'🔥'}</span>
              {props.streakDays}
            </Link>
          ) : null}
          {/* Inline search button — opens overlay; doesn't navigate away */}
          {props.onSearchQueryChange ? (
            <button
              onClick={function () { setSearchOpen(true) }}
              className="inline-flex w-6 h-6 items-center justify-center rounded-full border border-white/10 text-[10px] text-gray-400 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
              aria-label="Search Today"
              title="Search Today"
            >
              <Search className="w-3 h-3" />
            </button>
          ) : null}
          <Link
            href={browseHref}
            className="hidden sm:inline-flex text-[10px] font-sans font-medium text-gray-500 hover:text-primary-300 transition-colors flex-shrink-0"
          >
            {'View as list →'}
          </Link>
          {/* Grid mode toggle — desktop / lg+ only (V5 #D8) */}
          {props.onToggleGrid ? (
            <button
              onClick={props.onToggleGrid}
              className="hidden lg:inline-flex w-6 h-6 items-center justify-center rounded-full border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
              aria-label="Open grid view"
              title="Open grid view"
            >
              <LayoutGrid className="w-3 h-3" />
            </button>
          ) : null}
          {props.showShortcutsToggle ? (
            <button
              onClick={props.onToggleShortcuts}
              className={
                'hidden md:inline-flex w-5 h-5 items-center justify-center rounded-full border text-[10px] hover:text-white hover:bg-white/5 transition-colors flex-shrink-0 ' +
                (shortcutsPulsed
                  ? 'border-primary-400/60 text-primary-300 today-shortcut-pulse'
                  : 'border-white/10 text-gray-500')
              }
              aria-label="Show keyboard shortcuts"
              title="Keyboard shortcuts"
            >
              {'?'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Native search overlay — V2 panel review #13. Filters Today in place
          via the searchQuery prop instead of routing out to /explore. */}
      {searchOpen && (
        <div className="absolute inset-x-0 top-0 z-40 bg-gray-950/97 backdrop-blur-md border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              inputMode="search"
              placeholder="Search today’s feed..."
              value={props.searchQuery || ''}
              onChange={function (e) {
                if (props.onSearchQueryChange) props.onSearchQueryChange(e.target.value)
              }}
              onKeyDown={function (e) {
                if (e.key === 'Escape') closeSearch()
              }}
              className="flex-1 bg-transparent text-[14px] text-white placeholder-gray-500 font-sans outline-none border-none"
            />
            {(props.searchQuery && props.searchQuery.length > 0) && (
              <button
                onClick={function () { if (props.onSearchQueryChange) props.onSearchQueryChange('') }}
                aria-label="Clear search"
                className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={closeSearch}
              className="text-[12px] font-sans text-gray-400 hover:text-white transition-colors flex-shrink-0 px-1"
              aria-label="Close search"
            >
              {'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default TodayHeader
