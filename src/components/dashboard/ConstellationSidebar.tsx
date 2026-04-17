'use client'

/**
 * ConstellationSidebar — Category list with counts for the ring map.
 *
 * Mirrors the Wikipedia Science Communities sidebar: searchable scrollable
 * list of categories with their glow color, label, and logged-entry count.
 *
 * Desktop: renders as a right-column companion to the map (see MapTab layout
 * in lab.tsx). Mobile: renders stacked below the map.
 *
 * Keeps Phase A scope tight — no filter-stars-on-map behavior yet. Clicking
 * a row scrolls the detail panel to that category's first entry via the
 * onCategoryClick callback if wired.
 */

import React, { useMemo, useState } from 'react'
import { Search, X as XIcon } from 'lucide-react'
import { CONSTELLATION_NODES } from '@/lib/constellation-data'
import type { UserMapData } from '@/lib/constellation-types'
import { classNames } from '@/lib/utils'

interface ConstellationSidebarProps {
  userMapData: UserMapData | null
  selectedCategory?: string | null
  onCategoryClick?: (categoryId: string | null) => void
}

// Match the CATEGORY_GLOW palette used by the canvas renderer so the sidebar
// reads as a continuation of the ring, not a separate widget.
const CATEGORY_GLOW: Record<string, string> = {
  ufos_aliens: '#22c55e',
  cryptids: '#f59e0b',
  ghosts_hauntings: '#a855f7',
  psychic_phenomena: '#3b82f6',
  consciousness_practices: '#8b5cf6',
  psychological_experiences: '#ec4899',
  biological_factors: '#14b8a6',
  perception_sensory: '#06b6d4',
  religion_mythology: '#f97316',
  esoteric_practices: '#6366f1',
  combination: '#64748b',
}

export default function ConstellationSidebar({
  userMapData,
  selectedCategory,
  onCategoryClick,
}: ConstellationSidebarProps) {
  const [query, setQuery] = useState('')

  // Build the list: every category gets a row (even if entryCount is 0) so
  // users can see the full taxonomy of what's possible to investigate.
  const rows = useMemo(() => {
    const stats = userMapData?.categoryStats || {}
    const q = query.trim().toLowerCase()
    return CONSTELLATION_NODES
      .map(node => ({
        id: node.id,
        label: node.label,
        icon: node.icon,
        description: node.description,
        color: CATEGORY_GLOW[node.id] || '#666666',
        count: stats[node.id]?.entries || 0,
      }))
      .filter(row => {
        if (!q) return true
        return (
          row.label.toLowerCase().includes(q) ||
          row.id.toLowerCase().includes(q) ||
          row.description.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => {
        // Categories with logged entries rise to the top; tie-break by label
        if (a.count !== b.count) return b.count - a.count
        return a.label.localeCompare(b.label)
      })
  }, [userMapData, query])

  const totalEntries = userMapData?.stats?.totalEntries || 0
  const maxCount = Math.max(1, ...rows.map(r => r.count))

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-white">Categories</h3>
          <span className="text-[10px] text-gray-500">{totalEntries} total</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter categories..."
            className="w-full pl-8 pr-7 py-1.5 bg-gray-900 border border-gray-800 rounded-md text-xs text-white placeholder-gray-500 focus:outline-none focus:border-primary-600/50 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Category list — scrollable within sidebar bounds */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-gray-500">
            No categories match "{query}"
          </div>
        ) : (
          <ul className="py-1">
            {rows.map(row => {
              const isSelected = selectedCategory === row.id
              const barWidth = row.count > 0 ? Math.max(8, (row.count / maxCount) * 100) : 0
              return (
                <li key={row.id}>
                  <button
                    onClick={() => {
                      if (onCategoryClick) {
                        onCategoryClick(isSelected ? null : row.id)
                      }
                    }}
                    className={classNames(
                      'w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors group',
                      isSelected
                        ? 'bg-gray-900'
                        : 'hover:bg-gray-900/60'
                    )}
                  >
                    {/* Color chip — mirrors the ring arc color */}
                    <span
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{
                        backgroundColor: row.color,
                        opacity: row.count > 0 ? 1 : 0.35,
                        boxShadow: row.count > 0 ? `0 0 6px ${row.color}40` : 'none',
                      }}
                      aria-hidden="true"
                    />

                    {/* Label + mini bar */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={classNames(
                            'text-xs truncate',
                            row.count > 0 ? 'text-gray-200' : 'text-gray-500',
                            isSelected ? 'font-semibold text-white' : 'font-medium'
                          )}
                        >
                          <span className="mr-1">{row.icon}</span>
                          {row.label}
                        </span>
                        <span
                          className={classNames(
                            'text-[10px] tabular-nums flex-shrink-0',
                            row.count > 0 ? 'text-gray-400' : 'text-gray-600'
                          )}
                        >
                          {row.count}
                        </span>
                      </div>
                      {/* Mini bar — only renders when count > 0 */}
                      {row.count > 0 && (
                        <div className="mt-1 h-0.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: row.color,
                              opacity: 0.7,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Footer hint (hidden when filtering) */}
      {!query && (
        <div className="px-4 py-2 border-t border-gray-800">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            Tap a category to highlight its segment on the ring. Tap again to clear.
          </p>
        </div>
      )}
    </div>
  )
}
