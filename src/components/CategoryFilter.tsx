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
    <div className="flex gap-3 sm:gap-2 overflow-x-auto py-1 pb-5 -my-1 -mb-5 scrollbar-hide sm:flex-wrap sm:overflow-visible sm:py-0 sm:my-0 sm:pb-0 sm:-mb-0 items-start">
      <button
        onClick={() => onChange('all')}
        className={classNames(
          'px-4 py-2 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-all shrink-0',
          selected === 'all'
            ? 'bg-white text-gray-900'
            : 'bg-white/10 text-gray-300 hover:bg-white/15 hover:text-white'
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
        <div key={key} className="flex flex-col items-center shrink-0 sm:contents">
          <button
            onClick={() => onChange(key)}
            className={classNames(
              'w-11 h-11 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-all flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 shrink-0',
              selected === key
                ? `${config.bgColor} ${config.color} ring-2 ring-current`
                : 'bg-white/10 text-gray-300 hover:bg-white/15 hover:text-white'
            )}
          >
            <span className="text-lg sm:text-sm">{config.icon}</span>
            <span className="hidden sm:inline">{config.label}</span>
            {showCounts && counts && counts[key] > 0 && (
              <span className="text-xs opacity-60">{counts[key]}</span>
            )}
          </button>
          {/* Show label below selected icon on mobile */}
          <span
            className={classNames(
              'text-[10px] mt-1 text-center max-w-[52px] truncate sm:hidden transition-opacity',
              selected === key ? 'text-white opacity-100' : 'opacity-0 h-0 mt-0'
            )}
          >
            {config.label.split(' ')[0]}
          </span>
        </div>
      ))}
    </div>
  )
}
