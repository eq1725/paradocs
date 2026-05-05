'use client'

/**
 * TodayHeader — page header for /discover (Today).
 *
 * V7.4 — applied panel-review Tier 1 + Tier 2 simultaneously.
 *
 * Tier 1 changes:
 *   - Utility row (feedback flash, streak chip, search, view-as-list,
 *     ?-shortcuts) is now hidden on mobile (`hidden md:flex`). On
 *     mobile the streak relocates to the card chrome cluster (top-
 *     right of TodayCardShell), and search lives in the global app
 *     bar's search icon. View-as-list and ? are desktop-only by intent.
 *   - Lens + category strip padding tightened from py-2 → py-1.5.
 *
 * Tier 2 changes:
 *   - Two parallel chip strips (lens + category) collapsed into ONE
 *     ordered horizontal strip with an em-dash divider visually
 *     separating the lens chips (left) from the category chips
 *     (right). One chip style; active state differs by axis (lens =
 *     primary-tinted, category = bold white fill).
 *   - role="tablist" + role="tab" + aria-selected on every chip for
 *     proper assistive-tech semantics.
 *   - Selecting a category resets lens to 'all' (and selecting a lens
 *     preserves the category) — eliminates the lens × category
 *     combinatorial trap the IA panelist flagged.
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
import { Search, X, LayoutGrid, ChevronDown } from 'lucide-react'
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
  /** Optional streak count — passed through to the card chrome on
   *  mobile via discover.tsx. The header itself only renders the
   *  streak chip on md+ in the utility row. */
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
  var [topicsOpen, setTopicsOpen] = useState(false)
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

  // Tier 2: Selecting a category resets lens to 'all' (handled in
  // the parent's onCategoryChange so the reset is atomic — single
  // state batch, single loadFeed). Selecting a lens preserves the
  // current category.
  function handleLensClick(lensKey: TodayLens) {
    props.onLensChange(lensKey)
  }
  function handleCategoryClick(catKey: string | null) {
    props.onCategoryChange(catKey)
  }

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

      {/* V8.1 — Topics pill (left, opens bottom sheet) + horizontally
          scrollable lens chips (right). Replaces the V7.4 unified
          horizontal strip — that design hid the categories behind a
          horizontal-scroll gesture that users wouldn't discover. The
          Topics pill is now the most-prominent filter affordance, with
          an explicit chevron signaling "tap to choose topic." Lens
          chips remain inline for quick access since they're rarely
          changed. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex items-center gap-2 py-1.5">
          {/* Topics pill — tappable, opens bottom sheet */}
          <button
            type="button"
            onClick={function () { setTopicsOpen(true) }}
            aria-haspopup="dialog"
            aria-expanded={topicsOpen}
            aria-label={props.category
              ? 'Topic: ' + (CATEGORY_CONFIG[props.category as PhenomenonCategory]?.label || props.category) + ' — tap to change'
              : 'Choose a topic'}
            className={
              'flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-sans font-semibold transition-colors border ' +
              (props.category
                ? 'bg-primary-500/20 border-primary-400/50 text-primary-200 hover:bg-primary-500/30'
                : 'bg-white/[0.06] border-white/15 text-white hover:bg-white/[0.10]')
            }
          >
            {props.category ? (
              <>
                <CategoryIcon category={props.category as PhenomenonCategory} size={11} />
                <span>{CATEGORY_CONFIG[props.category as PhenomenonCategory]?.label || props.category}</span>
                <span
                  role="button"
                  aria-label="Clear topic filter"
                  onClick={function (e) { e.stopPropagation(); handleCategoryClick(null) }}
                  className="ml-0.5 inline-flex w-3.5 h-3.5 items-center justify-center rounded-full hover:bg-white/15 cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              </>
            ) : (
              <>
                <span>{'All Topics'}</span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </>
            )}
          </button>

          {/* Vertical separator between Topics pill and lens chips */}
          <span aria-hidden="true" className="flex-shrink-0 block w-px h-4 bg-white/10 mx-0.5" />

          {/* Lens chips — primary-tinted active state. Scrollable
              within their own container if they overflow on narrow
              screens; fade-mask hints at horizontal overflow. */}
          <div
            role="tablist"
            aria-label="Filter view"
            className="flex items-center gap-2 overflow-x-auto scrollbar-hide today-fade-mask-r min-w-0 flex-1"
          >
            {LENSES.map(function (lens) {
              var isActive = props.lens === lens.key
              return (
                <button
                  key={'lens-' + lens.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={function () { handleLensClick(lens.key) }}
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
      </div>

      {/* V8.1 — Topics bottom-sheet picker. Opens from the bottom on
          mobile (iOS-style drawer), centers on tablet+. Lists every
          category with an icon. Tap selects + closes; tap "All topics"
          clears. Tap backdrop or ✕ closes without changing. */}
      {topicsOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={function () { setTopicsOpen(false) }}
          role="dialog"
          aria-modal="true"
          aria-label="Choose topic"
        >
          <div
            className="w-full md:max-w-md bg-gray-950 border-t md:border md:rounded-2xl border-white/10 shadow-2xl overflow-hidden"
            onClick={function (e) { e.stopPropagation() }}
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)' }}
          >
            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-[15px] font-sans font-semibold text-white">{'Choose a topic'}</h2>
                <p className="text-[11px] font-sans text-gray-400 mt-0.5">{'Filter today’s feed by what interests you'}</p>
              </div>
              <button
                type="button"
                onClick={function () { setTopicsOpen(false) }}
                aria-label="Close"
                className="w-8 h-8 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* All topics row */}
            <button
              type="button"
              onClick={function () { handleCategoryClick(null); setTopicsOpen(false) }}
              className={
                'w-full flex items-center justify-between px-5 py-3 text-left transition-colors ' +
                (props.category === null
                  ? 'bg-primary-500/15 text-primary-200'
                  : 'text-white hover:bg-white/5')
              }
            >
              <span className="text-[14px] font-sans font-medium">{'All topics'}</span>
              {props.category === null && (
                <span className="text-[11px] font-sans text-primary-300">{'✓ Selected'}</span>
              )}
            </button>

            <div className="border-t border-white/5" />

            {/* Category list */}
            <div className="max-h-[60vh] overflow-y-auto">
              {CATEGORY_KEYS.map(function (cat) {
                var cfg = CATEGORY_CONFIG[cat]
                if (!cfg) return null
                var isActive = props.category === cat
                return (
                  <button
                    key={'topic-' + cat}
                    type="button"
                    onClick={function () { handleCategoryClick(cat); setTopicsOpen(false) }}
                    className={
                      'w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ' +
                      (isActive
                        ? 'bg-primary-500/15 text-primary-200'
                        : 'text-white hover:bg-white/5')
                    }
                  >
                    <span className="flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-full bg-white/[0.04] border border-white/10">
                      <CategoryIcon category={cat} size={14} />
                    </span>
                    <span className="flex-1 text-[14px] font-sans font-medium">{cfg.label}</span>
                    {isActive && (
                      <span className="text-[11px] font-sans text-primary-300">{'✓'}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* V7.4 — Utility row is now md+ only. On mobile the streak
          chip moves into the card chrome (TodayCardShell), search
          lives in the global app bar, and view-as-list / ? are
          desktop conveniences. This saves ~28px of mobile chrome
          and matches the Apple-News chrome budget the panel
          recommended.

          Desktop still gets the full utility row with feedback flash,
          streak link, search, view-as-list, grid mode, and shortcut
          hint. */}
      <div className="hidden md:block max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2 pt-1">
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
          {/* Streak chip — desktop only. Mobile reads it from card chrome. */}
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
            className="inline-flex text-[10px] font-sans font-medium text-gray-500 hover:text-primary-300 transition-colors flex-shrink-0"
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
                'inline-flex w-5 h-5 items-center justify-center rounded-full border text-[10px] hover:text-white hover:bg-white/5 transition-colors flex-shrink-0 ' +
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
