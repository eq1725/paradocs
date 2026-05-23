'use client'

/**
 * PhenomenonFilterBar — V11.15.3
 *
 * Sticky chip bar that sits below the hero on /phenomena/[slug].
 * Four filters: Sort, Country, Decade, Search.
 *
 * Mobile-first:
 *   - Chips → MobileBottomSheet on tap (chip dropdown breaks past
 *     viewport on phones).
 *   - Search chip swaps to inline text input on tap.
 *   - Active chips render filled (cyan) so state is visible without
 *     opening the sheet.
 *   - "Clear all" appears when any filter is active.
 *
 * Accessibility:
 *   - 44px min tap targets via padding (chip looks ~30px tall).
 *   - aria-label on each chip includes the active value.
 *   - The parent component owns the live-region announcer.
 *   - Reduced-motion is handled inside MobileBottomSheet.
 *
 * URL state:
 *   - This component is dumb. It calls onChange with the new filter
 *     state and lets the parent push the query params.
 */

import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { MobileBottomSheet } from '@/components/mobile/MobileBottomSheet'
import { classNames } from '@/lib/utils'

export interface PhenomenonFilters {
  sort: SortValue
  country: string | null
  decade: DecadeValue | null
  search: string
}

export type SortValue = 'confidence' | 'newest' | 'oldest' | 'popular' | 'most_viewed'
export type DecadeValue = '2020s' | '2010s' | '2000s' | '1990s' | '1980s' | '1970s' | 'earlier'

export const DEFAULT_FILTERS: PhenomenonFilters = {
  sort: 'confidence',
  country: null,
  decade: null,
  search: '',
}

interface PhenomenonFilterBarProps {
  filters: PhenomenonFilters
  onChange: (next: PhenomenonFilters) => void
  /** Facet counts from /api/phenomena/[slug]/facets. Optional — chips
   *  still render without them; counts just don't show. */
  facets?: { countries: Record<string, number>; decades: Record<string, number> }
  /** Total count for the active filter set (parent computes). */
  resultCount?: number
  className?: string
}

const SORT_OPTIONS: { value: SortValue; label: string; sublabel?: string }[] = [
  { value: 'confidence', label: 'Best match', sublabel: 'AI-ranked' },
  { value: 'newest', label: 'Newest event' },
  { value: 'oldest', label: 'Oldest event' },
  { value: 'most_viewed', label: 'Most viewed' },
  { value: 'popular', label: 'Most discussed' },
]

const SORT_LABEL_SHORT: Record<SortValue, string> = {
  confidence: 'Best match',
  newest: 'Newest',
  oldest: 'Oldest',
  popular: 'Discussed',
  most_viewed: 'Viewed',
}

const DECADE_OPTIONS: { value: DecadeValue; label: string }[] = [
  { value: '2020s', label: '2020s' },
  { value: '2010s', label: '2010s' },
  { value: '2000s', label: '2000s' },
  { value: '1990s', label: '1990s' },
  { value: '1980s', label: '1980s' },
  { value: '1970s', label: '1970s' },
  { value: 'earlier', label: 'Pre-1970' },
]

type SheetKind = 'sort' | 'country' | 'decade' | null

export default function PhenomenonFilterBar(props: PhenomenonFilterBarProps) {
  const { filters, onChange, facets, resultCount, className } = props
  const [openSheet, setOpenSheet] = useState<SheetKind>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchDraft, setSearchDraft] = useState(filters.search)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Sync external search changes (URL back/forward) into the draft.
  useEffect(() => { setSearchDraft(filters.search) }, [filters.search])

  // Debounced search apply.
  useEffect(() => {
    if (searchDraft === filters.search) return
    const t = setTimeout(() => onChange({ ...filters, search: searchDraft }), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft])

  function closeSearch() {
    setSearchOpen(false)
    if (!searchDraft) onChange({ ...filters, search: '' })
  }

  function clearAll() {
    setSearchDraft('')
    onChange({ ...DEFAULT_FILTERS })
  }

  const anyActive =
    filters.sort !== 'confidence' ||
    filters.country !== null ||
    filters.decade !== null ||
    filters.search.length > 0

  // Country chip label
  const countryLabel = filters.country ? `${filters.country}` : 'Country'

  // Decade chip label
  const decadeLabel = filters.decade
    ? DECADE_OPTIONS.find(d => d.value === filters.decade)?.label || 'Decade'
    : 'Decade'

  // Sort chip label — short form when active, "Sort" when default.
  const sortLabel = filters.sort === 'confidence' ? 'Sort' : SORT_LABEL_SHORT[filters.sort]
  const sortActive = filters.sort !== 'confidence'

  return (
    <div
      className={classNames(
        'sticky z-20 backdrop-blur-md bg-gray-950/85 border-b border-gray-800',
        'top-14 sm:top-16',
        className || ''
      )}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          {!searchOpen && (
            <>
              <FilterChip
                label={sortLabel}
                active={sortActive}
                onClick={() => setOpenSheet('sort')}
                ariaLabel={`Sort: ${SORT_OPTIONS.find(s => s.value === filters.sort)?.label || 'Best match'}`}
              />
              <FilterChip
                label={countryLabel}
                active={!!filters.country}
                onClick={() => setOpenSheet('country')}
                ariaLabel={filters.country ? `Country filter, current value: ${filters.country}` : 'Filter by country'}
              />
              <FilterChip
                label={decadeLabel}
                active={!!filters.decade}
                onClick={() => setOpenSheet('decade')}
                ariaLabel={filters.decade ? `Decade filter, current value: ${decadeLabel}` : 'Filter by decade'}
              />
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(true)
                  setTimeout(() => searchInputRef.current?.focus(), 0)
                }}
                aria-label="Search reports"
                className={classNames(
                  'inline-flex items-center justify-center shrink-0',
                  'h-9 min-w-[44px] px-3 rounded-full text-[13px] font-medium border transition-colors',
                  filters.search
                    ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30'
                    : 'bg-white/[0.04] text-gray-300 border-white/10 hover:bg-white/[0.08]'
                )}
              >
                <Search className="w-4 h-4" />
                {filters.search && (
                  <span className="ml-1.5 max-w-[120px] truncate">{filters.search}</span>
                )}
              </button>
              {anyActive && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="ml-auto text-[12px] text-gray-400 hover:text-white whitespace-nowrap px-2 py-2"
                >
                  Clear all
                </button>
              )}
            </>
          )}

          {searchOpen && (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeSearch()
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  placeholder="Search these reports…"
                  aria-label="Search reports"
                  className="w-full h-9 pl-9 pr-9 rounded-full text-[13px] text-white placeholder-gray-500 bg-white/[0.05] border border-white/15 focus:outline-none focus:ring-1 focus:ring-cyan-400/40 focus:border-cyan-400/40"
                />
                {searchDraft && (
                  <button
                    type="button"
                    onClick={() => { setSearchDraft(''); onChange({ ...filters, search: '' }) }}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={closeSearch}
                className="text-[13px] text-gray-400 hover:text-white px-1 py-2 shrink-0"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Result count + a11y live region. The parent passes
            resultCount in; we render it here so it lives in the
            sticky bar and stays in view. */}
        {!searchOpen && typeof resultCount === 'number' && (
          <p
            className="text-[11px] text-gray-500 tabular-nums mt-1.5"
            aria-live="polite"
          >
            {resultCount.toLocaleString()} {resultCount === 1 ? 'report' : 'reports'}
            {anyActive ? ' match these filters' : ''}
          </p>
        )}
      </div>

      {/* Sort sheet */}
      <MobileBottomSheet
        isOpen={openSheet === 'sort'}
        onClose={() => setOpenSheet(null)}
        title="Sort by"
        snapPoint="peek"
      >
        <SheetList>
          {SORT_OPTIONS.map(opt => (
            <SheetOption
              key={opt.value}
              selected={filters.sort === opt.value}
              label={opt.label}
              sublabel={opt.sublabel}
              onSelect={() => { onChange({ ...filters, sort: opt.value }); setOpenSheet(null) }}
            />
          ))}
        </SheetList>
      </MobileBottomSheet>

      {/* Country sheet */}
      <MobileBottomSheet
        isOpen={openSheet === 'country'}
        onClose={() => setOpenSheet(null)}
        title="Filter by country"
        snapPoint="half"
      >
        <SheetList>
          {filters.country && (
            <SheetOption
              selected={false}
              label="Any country"
              sublabel="Clear filter"
              onSelect={() => { onChange({ ...filters, country: null }); setOpenSheet(null) }}
            />
          )}
          {facets?.countries && Object.entries(facets.countries).map(([country, count]) => (
            <SheetOption
              key={country}
              selected={filters.country === country}
              label={country}
              sublabel={`${count.toLocaleString()} report${count === 1 ? '' : 's'}`}
              onSelect={() => { onChange({ ...filters, country }); setOpenSheet(null) }}
            />
          ))}
          {(!facets?.countries || Object.keys(facets.countries).length === 0) && (
            <p className="text-sm text-gray-500 px-1 py-6 text-center">No country data yet.</p>
          )}
        </SheetList>
      </MobileBottomSheet>

      {/* Decade sheet */}
      <MobileBottomSheet
        isOpen={openSheet === 'decade'}
        onClose={() => setOpenSheet(null)}
        title="Filter by decade"
        snapPoint="half"
      >
        <SheetList>
          {filters.decade && (
            <SheetOption
              selected={false}
              label="Any decade"
              sublabel="Clear filter"
              onSelect={() => { onChange({ ...filters, decade: null }); setOpenSheet(null) }}
            />
          )}
          {DECADE_OPTIONS.map(opt => {
            const count = facets?.decades?.[opt.value]
            if (count === 0) return null
            return (
              <SheetOption
                key={opt.value}
                selected={filters.decade === opt.value}
                label={opt.label}
                sublabel={typeof count === 'number' ? `${count.toLocaleString()} report${count === 1 ? '' : 's'}` : undefined}
                onSelect={() => { onChange({ ...filters, decade: opt.value }); setOpenSheet(null) }}
              />
            )
          })}
        </SheetList>
      </MobileBottomSheet>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────

function FilterChip(props: { label: string; active: boolean; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.ariaLabel}
      className={classNames(
        'inline-flex items-center gap-1 shrink-0',
        'h-9 px-3 rounded-full text-[13px] font-medium border transition-colors whitespace-nowrap',
        props.active
          ? 'bg-cyan-500/15 text-cyan-100 border-cyan-400/30'
          : 'bg-white/[0.04] text-gray-300 border-white/10 hover:bg-white/[0.08]'
      )}
    >
      <span>{props.label}</span>
      <ChevronDown className="w-3.5 h-3.5 opacity-60" />
    </button>
  )
}

function SheetList(props: { children: React.ReactNode }) {
  return <div className="pb-4 -mx-1">{props.children}</div>
}

function SheetOption(props: {
  label: string
  sublabel?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={classNames(
        'w-full flex items-center justify-between px-4 py-3.5 rounded-lg text-left transition-colors',
        props.selected ? 'bg-cyan-500/10' : 'hover:bg-white/[0.04]'
      )}
    >
      <div className="min-w-0">
        <div className={classNames('text-[15px]', props.selected ? 'text-cyan-100 font-medium' : 'text-gray-100')}>
          {props.label}
        </div>
        {props.sublabel && (
          <div className="text-[12px] text-gray-500 mt-0.5">{props.sublabel}</div>
        )}
      </div>
      {props.selected && (
        <div className="ml-3 w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
      )}
    </button>
  )
}
