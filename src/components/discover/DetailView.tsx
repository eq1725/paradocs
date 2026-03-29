'use client'

/**
 * DetailView — full-screen overlay for expanded case detail
 *
 * Opened from RabbitHolePanel when a related case is tapped.
 * Shows full summary, credibility tags, and Constellation paywall.
 * Slides up with spring animation.
 *
 * SWC-compatible: var, function expressions, string concat.
 */

import React from 'react'
import { Constellation } from './Constellation'
import { CATEGORY_CONFIG } from '@/lib/constants'
import type { RabbitHoleCard } from './RabbitHolePanel'

var CAT_ICON: Record<string, string> = {
  ufos_aliens: '\uD83D\uDEF8',
  cryptids: '\uD83D\uDC3E',
  ghosts_hauntings: '\uD83D\uDC7B',
  psychic_phenomena: '\uD83D\uDD2E',
  consciousness_practices: '\uD83E\uDDE0',
  psychological_experiences: '\uD83E\uDDE0',
  biological_factors: '\uD83E\uDDEC',
  perception_sensory: '\uD83D\uDC41\uFE0F',
  religion_mythology: '\u2721\uFE0F',
  esoteric_practices: '\u2728',
  combination: '\uD83C\uDF00',
}

export function DetailView(props: {
  card: RabbitHoleCard
  onBack: () => void
}) {
  var card = props.card
  var catConfig = CATEGORY_CONFIG[card.category as keyof typeof CATEGORY_CONFIG]
  var icon = CAT_ICON[card.category] || '\uD83D\uDD0D'

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: '#08080f',
      zIndex: 30,
      display: 'flex',
      flexDirection: 'column',
      animation: 'slideUp 0.26s cubic-bezier(0.32,0,0.15,1)',
    }}>
      {/* Drag handle */}
      <div style={{ padding: '14px 0 8px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: 34, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.25)' }} />
      </div>

      {/* Header */}
      <div style={{
        padding: '0 22px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{
          fontSize: 8.5,
          letterSpacing: 2,
          color: card.categoryColor,
          fontFamily: "'Courier New',monospace",
          textTransform: 'uppercase' as const,
        }}>
          {icon + ' ' + (catConfig?.label || card.category) + ' \u00B7 ' + card.year}
        </span>
        <button onClick={props.onBack} style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.28)',
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: "'Courier New',monospace",
          letterSpacing: 1,
          padding: '4px 6px',
        }}>
          {'\u2190 BACK'}
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
        {/* Location + tag */}
        <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.32)', fontFamily: "'Courier New',monospace", marginBottom: 12 }}>
          {'\u25C9 ' + card.location + ' \u00B7 ' + card.tag}
        </div>

        {/* Headline */}
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.45, color: '#f2f0eb', fontFamily: "system-ui,-apple-system,sans-serif", marginBottom: 12 }}>
          {card.headline}
        </div>

        {/* Credibility tags */}
        {card.credibility && card.credibility.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const, marginBottom: 14 }}>
            {card.credibility.map(function (c, i) {
              return (
                <span key={i} style={{
                  fontSize: 7.5,
                  padding: '2px 9px',
                  borderRadius: 20,
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: "'Courier New',monospace",
                  letterSpacing: 0.8,
                }}>
                  {c}
                </span>
              )
            })}
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 14 }} />

        {/* Summary */}
        <div style={{ fontSize: 13.5, lineHeight: 1.8, color: 'rgba(255,255,255,0.66)', fontFamily: "'Courier New',monospace" }}>
          {card.summary}
        </div>

        {/* Constellation paywall */}
        <div style={{ marginTop: 20 }}>
          <Constellation />
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}
