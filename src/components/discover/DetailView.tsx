'use client'

/**
 * DetailView — full-screen overlay for expanded case detail
 *
 * Opened from RabbitHolePanel when a related case is tapped.
 * Uses site typography and colors (Inter, Space Grotesk, primary-500).
 *
 * SWC-compatible: var, function expressions, string concat.
 */

import React from 'react'
import { Constellation } from './Constellation'
import { CATEGORY_CONFIG } from '@/lib/constants'
import type { RabbitHoleCard } from './RabbitHolePanel'

export function DetailView(props: {
  card: RabbitHoleCard
  onBack: () => void
}) {
  var card = props.card
  var catConfig = CATEGORY_CONFIG[card.category as keyof typeof CATEGORY_CONFIG]

  return (
    <div className="absolute inset-0 bg-gray-950 z-30 flex flex-col animate-slide-up">
      {/* Drag handle */}
      <div className="py-3 flex justify-center flex-shrink-0">
        <div className="w-8 h-0.5 rounded-full bg-gray-700" />
      </div>

      {/* Header */}
      <div className="px-5 pb-3 flex items-center justify-between flex-shrink-0 border-b border-white/5">
        <span className="text-[10px] font-sans font-semibold uppercase tracking-wider" style={{ color: card.categoryColor }}>
          {(catConfig?.icon || '') + ' ' + (catConfig?.label || card.category) + ' \u00B7 ' + card.year}
        </span>
        <button
          onClick={props.onBack}
          className="text-gray-500 hover:text-gray-300 text-xs font-sans font-medium uppercase tracking-wider px-2 py-1 transition-colors"
        >
          {'\u2190 Back'}
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Location + tag */}
        <p className="text-[11px] text-gray-500 font-sans mb-3">
          {card.location + (card.tag ? ' \u00B7 ' + card.tag : '')}
        </p>

        {/* Headline */}
        <h2 className="text-lg font-display font-bold text-white leading-snug mb-3">
          {card.headline}
        </h2>

        {/* Credibility tags */}
        {card.credibility && card.credibility.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-4">
            {card.credibility.map(function (c, i) {
              return (
                <span key={i} className="text-[10px] px-2.5 py-0.5 rounded-full border border-white/10 text-gray-400 font-sans font-medium">
                  {c}
                </span>
              )
            })}
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-white/[0.07] mb-4" />

        {/* Summary */}
        <p className="text-sm text-gray-400 leading-relaxed font-sans">
          {card.summary}
        </p>

        {/* Constellation paywall */}
        <div className="mt-5">
          <Constellation />
        </div>
        <div className="h-6" />
      </div>
    </div>
  )
}
