/**
 * MapFilterPanel — Collapsible filter drawer
 * Desktop: left side panel, toggleable
 * Mobile: rendered inside bottom sheet full state
 *
 * V11.17.10 — Search + Category chips extracted as
 * <MapPinnedFilterChips/>. MapBottomSheet renders that sub-component
 * pinned above its scrollable content in 'full' state so the user
 * can search/filter while scrolling the report breakdown/list below.
 */

import React from 'react'
import { Search, X, ChevronLeft, RotateCcw } from 'lucide-react'
import { CATEGORY_CONFIG, COUNTRIES } from '@/lib/constants'
import { PhenomenonCategory } from '@/lib/database.types'
import { MapFilters, DEFAULT_FILTERS } from './mapStyles'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import CountryTypeahead from './CountryTypeahead'

interface MapFilterPanelProps {
  filters: MapFilters
  onFilterChange: <K extends keyof MapFilters>(key: K, value: MapFilters[K]) => void
  onReset: () => void
  filteredCount: number
  totalCount: number
  /** If true, renders inline (for bottom sheet). If false, renders as drawer. */
  inline?: boolean
  onClose?: () => void
  /** V11.15.1 — Top countries by report count (for CountryTypeahead's
   *  default suggestions). Optional; falls back to alphabetical. */
  rankedCountries?: Array<{ code?: string; name: string; total: number }>
  /** V11.17.10 — When true, omits Search + Category chips (because
   *  MapBottomSheet renders them as a pinned header above the
   *  scrollable content). Defaults to false (everything inline). */
  omitPinnedSection?: boolean
}

const categories = (Object.entries(CATEGORY_CONFIG) as [PhenomenonCategory, typeof CATEGORY_CONFIG[PhenomenonCategory]][]).filter(function(e) { return !e[1].hidden })

/**
 * V11.17.10 — Pinned filter chips (Search + Categories) extracted as
 * its own component so MapBottomSheet can render it as a sticky
 * header above the scrollable content area in 'full' state.
 */
interface MapPinnedFilterChipsProps {
  filters: MapFilters
  onFilterChange: <K extends keyof MapFilters>(key: K, value: MapFilters[K]) => void
}

export function MapPinnedFilterChips({ filters, onFilterChange }: MapPinnedFilterChipsProps) {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={filters.searchQuery}
          onChange={(e) => onFilterChange('searchQuery', e.target.value)}
          placeholder="Search reports..."
          className="w-full pl-9 pr-3 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25"
        />
        {filters.searchQuery && (
          <button
            onClick={() => onFilterChange('searchQuery', '')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Categories — horizontal scroll chip rail so it stays a single
          row even with all 7 categories. touch-pan-x lets the rail
          scroll horizontally without triggering the sheet's vertical
          drag-to-dismiss capture. */}
      <div
        className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1"
        style={{ touchAction: 'pan-x' }}
      >
        <button
          onClick={() => onFilterChange('category', null)}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
            !filters.category
              ? 'bg-white text-gray-900'
              : 'bg-white/10 text-gray-300 hover:bg-white/15 hover:text-white'
          }`}
        >
          All
        </button>
        {categories.map(([key, config]) => (
          <button
            key={key}
            onClick={() => onFilterChange('category', filters.category === key ? null : key)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              filters.category === key
                ? `${config.bgColor} ${config.color} ring-2 ring-current`
                : 'bg-white/10 text-gray-300 hover:bg-white/15 hover:text-white'
            }`}
          >
            <CategoryIcon category={key} size={14} />
            {config.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function MapFilterPanel({
  filters,
  onFilterChange,
  onReset,
  filteredCount,
  totalCount,
  inline = false,
  onClose,
  rankedCountries,
  omitPinnedSection = false,
}: MapFilterPanelProps) {
  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)

  // V11.15.1 — Restructured layout:
  //   - Scrollable middle: filter controls (search/categories/country/checkbox)
  //   - Sticky footer: Reset button + filter count (always visible, no
  //     scroll-to-find). Per SME panel Persona C (mobile UX): sticky
  //     bottom Reset is the Airbnb/Zillow pattern; bottom-pinned action
  //     bars don't move and don't compete with content scroll.
  //
  // V11.17.10 — When omitPinnedSection is true, Search + Category
  // chips are skipped here (parent renders them as a pinned sheet
  // header). Only Country + Has Evidence remain in the scrollable body.
  const filterControls = (
    <div className="space-y-5">
      {!omitPinnedSection && (
        <>
          {/* Search */}
          <div>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={filters.searchQuery}
                onChange={(e) => onFilterChange('searchQuery', e.target.value)}
                placeholder="Search reports..."
                className="w-full pl-9 pr-3 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25"
              />
              {filters.searchQuery && (
                <button
                  onClick={() => onFilterChange('searchQuery', '')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Categories */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onFilterChange('category', null)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  !filters.category
                    ? 'bg-white text-gray-900'
                    : 'bg-white/10 text-gray-300 hover:bg-white/15 hover:text-white'
                }`}
              >
                All
              </button>
              {categories.map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => onFilterChange('category', filters.category === key ? null : key)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                    filters.category === key
                      ? `${config.bgColor} ${config.color} ring-2 ring-current`
                      : 'bg-white/10 text-gray-300 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  <CategoryIcon category={key} size={18} />
                  {config.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Country (V11.15.1 — searchable typeahead replacing 200-option select) */}
      <div>
        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Country
        </label>
        <CountryTypeahead
          value={filters.country}
          onChange={(name) => onFilterChange('country', name)}
          allCountries={COUNTRIES}
          rankedCountries={rankedCountries}
          placeholder="Search countries..."
        />
      </div>

      {/* Has Evidence */}
      <label className="flex items-center gap-2.5 cursor-pointer group">
        <input
          type="checkbox"
          checked={filters.hasEvidence}
          onChange={(e) => onFilterChange('hasEvidence', e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500/25"
        />
        <span className="text-sm text-gray-400 group-hover:text-white transition-colors">
          Has evidence
        </span>
      </label>

    </div>
  )

  // V11.15.1 — Sticky footer with Reset button + count. Shows below
  // the scrollable filter list in both inline (bottom sheet) and
  // drawer (desktop) modes. Always visible regardless of scroll.
  const stickyFooter = (
    <div className="flex-shrink-0 border-t border-white/10 bg-gray-950/95 backdrop-blur-md px-4 py-3 space-y-2">
      <button
        onClick={onReset}
        disabled={!hasActiveFilters}
        className={
          'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ' +
          (hasActiveFilters
            ? 'bg-purple-500/20 hover:bg-purple-500/30 active:bg-purple-500/40 text-purple-100 hover:text-white'
            : 'bg-white/5 text-gray-600 cursor-not-allowed')
        }
      >
        <RotateCcw size={14} />
        {hasActiveFilters ? 'Reset all filters' : 'No filters active'}
      </button>
      <div className="text-xs text-gray-500 text-center tabular-nums">
        {filteredCount === totalCount
          ? totalCount.toLocaleString() + ' locations mapped'
          : filteredCount.toLocaleString() + ' of ' + totalCount.toLocaleString() + ' shown'}
      </div>
    </div>
  )

  // Inline mode: filter controls + sticky footer (for bottom sheet)
  if (inline) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {filterControls}
        </div>
        {stickyFooter}
      </div>
    )
  }

  // Drawer mode: wrap in a panel
  return (
    <div className="h-full flex flex-col bg-gray-950/95 backdrop-blur-md border-r border-gray-800/50 w-[320px]">
      {/* Drawer header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/50">
        <h2 className="text-sm font-semibold text-white">Filters</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1 transition-colors"
          aria-label="Close filters"
        >
          <ChevronLeft size={18} />
        </button>
      </div>
      {/* Drawer body (scrollable) */}
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
        {filterControls}
      </div>
      {/* Sticky footer */}
      {stickyFooter}
    </div>
  )
}
