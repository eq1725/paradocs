'use client'

import React from 'react'
import { PhenomenonCategory } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

interface CategoryFilterProps {
  selected: PhenomenonCategory | 'all'
  onChange: (category: PhenomenonCategory | 'all') => void
  showCounts?: boolean
  counts?: Record<PhenomenonCategory, number>
}

export default function CategoryFilter({
  selected,
  onChange,
  showCounts = false,
  counts
}: CategoryFilterProps) {
  const categories = Object.entries(CATEGORY_CONFIG) as [PhenomenonCategory, typeof CATEGORY_CONFIG[PhenomenonCategory]][]

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mb-2 scrollbar-hide sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mb-0">
      <button
        onClick={() => onChange('all')}
        className={classNames(
          'px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-all shrink-0',
          selected === 'all'
            ? 'bg-white text-gray-900'
            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
        )}
      >
        All
        {showCounts && counts && (
          <span className="ml-2 text-xs opacity-60">
            {Object.values(counts).reduce((a, b) => a + b, 0)}
          </span>
        )}
      </button>
      {categories.map(([key, config]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={classNames(
            'px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 sm:gap-2 shrink-0',
            selected === key
              ? `${config.bgColor} ${config.color} ring-1 ring-current`
              : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
          )}
        >
          <span className="text-base sm:text-sm">{config.icon}</span>
          <span className="hidden sm:inline">{config.label}</span>
          {showCounts && counts && counts[key] > 0 && (
            <span className="text-xs opacity-60">{counts[key]}</span>
          )}
        </button>
      ))}
    </div>
  )
}
