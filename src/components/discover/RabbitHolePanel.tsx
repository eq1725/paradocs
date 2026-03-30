'use client'

/**
 * RabbitHolePanel — slide-up panel showing related cases
 *
 * Triggered by swiping DOWN on a card. Slides up from the bottom.
 * Uses site typography (Inter body, Space Grotesk headings) and
 * color system (primary-500, gray-900, border-white/5).
 *
 * SWC-compatible: var, function expressions, string concat.
 */

import React from 'react'
import Link from 'next/link'
import { Constellation } from './Constellation'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

export interface RabbitHoleCard {
  id: string
  slug: string
  item_type: string
  category: string
  categoryColor: string
  location: string
  year: string
  tag: string
  headline: string
  summary: string
  credibility: string[]
}

export function RabbitHolePanel(props: {
  cards: RabbitHoleCard[]
  color: string
  onClose: () => void
  onSelect: (card: RabbitHoleCard) => void
}) {
  return (
    <div className="absolute inset-0 bg-gray-950 z-20 flex flex-col animate-slide-up">
      {/* Drag handle */}
      <div className="py-3 flex justify-center flex-shrink-0">
        <div className="w-8 h-0.5 rounded-full bg-gray-700" />
      </div>

      {/* Header */}
      <div className="px-5 pb-3 flex items-center justify-between flex-shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: props.color }}>{'\u25C9'}</span>
          <span className="text-[10px] text-gray-400 font-sans font-medium uppercase tracking-wider">
            Connected cases
          </span>
        </div>
        <button
          onClick={props.onClose}
          className="text-gray-500 hover:text-gray-300 text-xs font-sans font-medium uppercase tracking-wider px-2 py-1 transition-colors"
        >
          {'\u2191 Back'}
        </button>
      </div>

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
        {props.cards.map(function (c, i) {
          var catConfig = CATEGORY_CONFIG[c.category as keyof typeof CATEGORY_CONFIG]

          return (
            <button
              key={c.id}
              onClick={function () { props.onSelect(c) }}
              className="bg-white/[0.025] border border-white/[0.07] rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-white/[0.05] cursor-pointer"
              style={{ borderLeft: '3px solid ' + c.categoryColor, animationDelay: (i * 0.06) + 's' }}
            >
              {/* Category + location */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[9px] font-sans font-semibold uppercase tracking-wider" style={{ color: c.categoryColor }}>
                  {(catConfig?.icon || '') + ' ' + (catConfig?.label || c.category)}
                </span>
                <span className="text-[9px] text-gray-500 font-sans">
                  {c.location + (c.tag ? ' \u00B7 ' + c.tag : '')}
                </span>
              </div>

              {/* Headline */}
              <p className="text-sm font-display font-semibold text-gray-200 leading-snug mb-1.5">
                {c.headline}
              </p>

              {/* Credibility tags */}
              {c.credibility && c.credibility.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {c.credibility.map(function (tag, j) {
                    return (
                      <span key={j} className="text-[8px] px-2 py-0.5 rounded-full border border-white/[0.08] text-gray-500 font-sans">
                        {tag}
                      </span>
                    )
                  })}
                </div>
              )}
            </button>
          )
        })}
        <div className="mt-2"><Constellation /></div>
        <div className="h-3" />
      </div>
    </div>
  )
}
