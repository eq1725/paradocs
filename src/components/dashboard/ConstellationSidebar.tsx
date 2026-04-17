'use client'

/**
 * ConstellationSidebar — Category filter for the cosmic-web map.
 *
 * Renders in two layouts:
 *   - `panel`  (desktop): compact vertical list floating at the top-right
 *                of the map as an overlay. Click a row → filters the map.
 *   - `pill`   (mobile): horizontal scrollable pill strip below the map.
 *                Smaller footprint, better for thumb reach.
 *
 * Either way, clicking a row calls onCategoryClick(id) which sets the
 * selectedCategory in the parent. The canvas renderer dims non-matching
 * stars + filaments when that's set. Clicking the same row again clears
 * the filter (onCategoryClick(null)).
 */

import React, { useMemo } from 'react'
import { X as XIcon } from 'lucide-react'
import { CONSTELLATION_NODES } from '@/lib/constellation-data'
import type { UserMapData } from '@/lib/constellation-types'
import { classNames } from '@/lib/utils'

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

interface ConstellationSidebarProps {
  userMapData: UserMapData | null
  selectedCategory?: string | null
  onCategoryClick?: (categoryId: string | null) => void
  /** Rendering mode. Default: 'panel' (desktop overlay). */
  layout?: 'panel' | 'pill'
}

export default function ConstellationSidebar({
  userMapData,
  selectedCategory,
  onCategoryClick,
  layout = 'panel',
}: ConstellationSidebarProps) {
  const rows = useMemo(() => {
    const stats = userMapData?.categoryStats || {}
    return CONSTELLATION_NODES
      .map(node => ({
        id: node.id,
        label: node.label,
        icon: node.icon,
        color: CATEGORY_GLOW[node.id] || '#666666',
        count: stats[node.id]?.entries || 0,
      }))
      // Only show categories with saved stars in this layout — reduces chrome
      // for new users and makes the affordance feel "earned." Power users
      // will see the full list grow as they save across domains.
      .filter(row => row.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [userMapData])

  const totalEntries = userMapData?.stats?.totalEntries || 0
  const isFiltered = !!selectedCategory

  // No categories yet — render nothing (the teaser CTA takes over).
  if (rows.length === 0) return null

  const handleClick = (id: string) => {
    if (!onCategoryClick) return
    onCategoryClick(selectedCategory === id ? null : id)
  }

  if (layout === 'pill') {
    // Mobile: horizontal scrollable pill strip. Sits below the map.
    return (
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 py-1">
        {isFiltered && (
          <button
            onClick={() => onCategoryClick?.(null)}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-gray-300 hover:bg-white/10 transition-colors"
          >
            <XIcon className="w-3 h-3" />
            Clear
          </button>
        )}
        {rows.map(row => {
          const active = selectedCategory === row.id
          return (
            <button
              key={row.id}
              onClick={() => handleClick(row.id)}
              className={classNames(
                'flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors whitespace-nowrap',
                active
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-white/[0.03] border-white/5 text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'
              )}
              style={active ? { boxShadow: `0 0 0 1px ${row.color}80, 0 0 10px ${row.color}40` } : undefined}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: row.color, boxShadow: `0 0 5px ${row.color}` }}
              />
              <span>{row.label}</span>
              <span className={classNames(
                'text-[10px] tabular-nums',
                active ? 'text-white/80' : 'text-gray-500'
              )}>
                {row.count}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  // Desktop: glass panel overlay floating at the top-right of the map.
  return (
    <div className="bg-black/45 backdrop-blur-md border border-white/5 rounded-xl overflow-hidden w-[220px] shadow-2xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          {isFiltered ? 'Filtering by' : 'Categories'}
        </span>
        {isFiltered && (
          <button
            onClick={() => onCategoryClick?.(null)}
            className="text-[10px] text-gray-500 hover:text-white transition-colors flex items-center gap-0.5"
          >
            <XIcon className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>
      <ul className="py-1 max-h-[360px] overflow-y-auto">
        {rows.map(row => {
          const active = selectedCategory === row.id
          return (
            <li key={row.id}>
              <button
                onClick={() => handleClick(row.id)}
                className={classNames(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
                  active
                    ? 'bg-white/5'
                    : 'hover:bg-white/[0.035]'
                )}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: row.color,
                    boxShadow: `0 0 6px ${row.color}, 0 0 12px ${row.color}40`,
                  }}
                />
                <span className={classNames(
                  'text-xs truncate flex-1',
                  active ? 'text-white font-medium' : 'text-gray-300'
                )}>
                  {row.label}
                </span>
                <span className="text-[10px] tabular-nums text-gray-500 flex-shrink-0">
                  {row.count}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="px-3 py-1.5 border-t border-white/5">
        <span className="text-[10px] text-gray-600">
          {totalEntries} total · tap to filter
        </span>
      </div>
    </div>
  )
}
