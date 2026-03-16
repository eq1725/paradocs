/**
 * MapFilterPanel — Collapsible filter drawer
 * Desktop: left side panel, toggleable
 * Mobile: rendered inside bottom sheet full state
 */

import React from 'react'
import { Search, X, ChevronLeft, RotateCcw } from 'lucide-react'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG, COUNTRIES } from '@/lib/constants'
import { PhenomenonCategory } from '@/lib/database.types'
import { MapFilters, CATEGORY_ICONS, DEFAULT_FILTERS } from './mapStyles'

interface MapFilterPanelProps {
  filters: MapFilters
  onFilterChange: <K extends keyof MapFilters>(key: K, value: MapFilters[K]) => void
  onReset: () => void
  filteredCount: number
  totalCount: number
  /** If true, renders inline (for bottom sheet). If false, renders as drawer. */
  inline?: boolean
  onClose?: () => void
}

const categories = Object.entries(CATEGORY_CONFIG) as [PhenomenonCategory, typeof CATEGORY_CONFIG[PhenomenonCategory]][]

export default function MapFilterPanel({
  filters,
  onFilterChange,
  onReset,
  filteredCount,
  totalCount,
  inline = false,
  onClose,
}: MapFilterPanelProps) {
  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)

  const content = (
    <div className="space-y-5">
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
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onFilterChange('category', null)}
            className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !filters.category
                ? 'bg-white text-gray-900'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            All
          </button>
          {categories.map(([key, config]) => (
            <button
              key={key}
              onClick={() => onFilterChange('category', filters.category === key ? null : key)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                filters.category === key
                  ? `${config.bgColor} ${config.color} ring-1 ring-current`
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <span className="text-xs">{CATEGORY_ICONS[key]}</span>
              <span className="hidden sm:inline">{config.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Credibility */}
      <div>
        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Credibility
        </label>
        <select
          value={filters.credibility || ''}
          onChange={(e) => onFilterChange('credibility', e.target.value || null)}
          className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
        >
          <option value="">All credibility levels</option>
          {Object.entries(CREDIBILITY_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>
              {config.label}
            </option>
          ))}
        </select>
      </div>

      {/* Country */}
      <div>
        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Country
        </label>
        <select
          value={filters.country || ''}
          onChange={(e) => onFilterChange('country', e.target.value || null)}
          className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
        >
          <option value="">All countries</option>
          {COUNTRIES.map((country: string) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
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

      {/* Reset */}
      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors"
        >
          <RotateCcw size={12} />
          Reset filters
        </button>
      )}

      {/* Count */}
      <div className="text-xs text-gray-500 pt-1">
        {filteredCount === totalCount
          ? `${totalCount.toLocaleString()} locations mapped`
          : `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()} shown`}
      </div>
    </div>
  )

  // Inline mode: just return content (for bottom sheet)
  if (inline) return content

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
      {/* Drawer body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
        {content}
      </div>
    </div>
  )
}
