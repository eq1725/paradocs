'use client'

/**
 * TodayGridMode — desktop grid overview of the Today feed.
 *
 * V5 panel review #D8. Power users on desktop want to see multiple cards
 * at once for archive-style scanning. This overlay shows a 3×3 grid of
 * mini-cards. Tapping one closes the overlay and jumps the swipe feed
 * to that index.
 *
 * Mobile: hidden (toggle is hidden via lg:inline-flex on the header).
 *
 * SWC: var, function expressions, string concat only.
 */

import React from 'react'
import { X } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import CategoryIcon from '@/components/ui/CategoryIcon'
import type { PhenomenonCategory } from '@/lib/database.types'

interface MiniItem {
  id: string
  item_type: string
  category: string
  headline: string
  hero?: string | null
  badge?: string | null
}

export function TodayGridMode(props: {
  items: MiniItem[]
  currentIdx: number
  onSelect: (idx: number) => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex flex-col"
      role="dialog"
      aria-label="Grid view"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
        <div>
          <h2 className="text-base font-display font-semibold text-white">Today — Grid view</h2>
          <p className="text-[11px] text-gray-400 font-sans">
            {props.items.length + ' cases visible · click any card to jump there'}
          </p>
        </div>
        <button
          onClick={props.onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
          aria-label="Close grid view"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {props.items.map(function (item, i) {
            var cfg = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
            var isCurrent = i === props.currentIdx
            return (
              <button
                key={item.id}
                onClick={function () { props.onSelect(i) }}
                className={
                  'group relative aspect-[4/5] rounded-xl overflow-hidden text-left transition-all duration-200 ' +
                  'border ' + (isCurrent ? 'border-primary-400 ring-2 ring-primary-500/40' : 'border-white/10 hover:border-white/30') +
                  ' bg-gray-900/60 hover:bg-gray-900/80'
                }
                aria-label={'Jump to card ' + (i + 1)}
              >
                {/* Hero backdrop */}
                {item.hero ? (
                  <div
                    className="absolute inset-0 opacity-30 group-hover:opacity-40 transition-opacity"
                    style={{
                      backgroundImage: 'url(' + item.hero + ')',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                ) : null}
                {/* Bottom-up scrim */}
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      'linear-gradient(to bottom, rgba(10,10,20,0.5) 0%, rgba(10,10,20,0.85) 100%)',
                  }}
                />

                {/* Content */}
                <div className="relative h-full flex flex-col justify-end p-3">
                  {/* Top-left current marker */}
                  {isCurrent ? (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary-500 text-white text-[9px] font-sans font-semibold uppercase tracking-wider">
                      Current
                    </span>
                  ) : null}
                  {/* Top-right index */}
                  <span className="absolute top-2 right-2 text-[10px] text-gray-400 font-mono tabular-nums">
                    {(i + 1).toString().padStart(2, '0')}
                  </span>
                  {/* Category badge */}
                  <span
                    className="text-[9px] font-sans font-semibold uppercase tracking-wider mb-1.5 inline-flex items-center gap-1"
                    style={{ color: getCategoryHex(item.category) }}
                  >
                    <CategoryIcon category={item.category as PhenomenonCategory} size={10} />
                    {cfg?.label || item.category}
                  </span>
                  {/* Headline */}
                  <p className="text-[12px] font-display font-semibold text-white leading-tight line-clamp-3">
                    {item.headline}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function getCategoryHex(cat: string): string {
  var map: Record<string, string> = {
    ufos_aliens: '#4fc3f7',
    cryptids: '#a5d6a7',
    ghosts_hauntings: '#ce93d8',
    psychic_phenomena: '#b39ddb',
    consciousness_practices: '#ffb74d',
    psychological_experiences: '#80deea',
    perception_sensory: '#ffcc80',
    religion_mythology: '#fff176',
    esoteric_practices: '#f48fb1',
  }
  return map[cat] || '#b39ddb'
}

export default TodayGridMode
