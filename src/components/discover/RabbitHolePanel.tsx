'use client'

/**
 * RabbitHolePanel — slide-up panel showing related cases
 *
 * Triggered by swiping DOWN on a card. Slides up from the bottom
 * with a spring animation. Each related case is a tappable row
 * that can open a DetailView overlay.
 *
 * SWC-compatible: var, function expressions, string concat.
 */

import React from 'react'
import { Constellation } from './Constellation'
import { CATEGORY_CONFIG } from '@/lib/constants'

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

export interface RabbitHoleCard {
  id: string
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
    <div style={{
      position: 'absolute',
      inset: 0,
      background: '#07070e',
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
      animation: 'slideUp 0.3s cubic-bezier(0.32,0,0.15,1)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: props.color }}>{'\u25C9'}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontFamily: "'Courier New',monospace", letterSpacing: 1, textTransform: 'uppercase' as const }}>
            Connected cases
          </span>
        </div>
        <button onClick={props.onClose} style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.28)',
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: "'Courier New',monospace",
          letterSpacing: 1,
          padding: '4px 6px',
        }}>
          {'\u2191 BACK'}
        </button>
      </div>

      {/* Cards list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {props.cards.map(function (c, i) {
          var catConfig = CATEGORY_CONFIG[c.category as keyof typeof CATEGORY_CONFIG]
          var icon = CAT_ICON[c.category] || '\uD83D\uDD0D'

          return (
            <button
              key={c.id}
              onClick={function () { props.onSelect(c) }}
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderLeft: '2.5px solid ' + c.categoryColor,
                borderRadius: 10,
                padding: '13px 14px',
                cursor: 'pointer',
                textAlign: 'left' as const,
                animation: 'fadeIn 0.2s ease ' + (i * 0.06) + 's both',
              }}
            >
              {/* Category + location */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <span style={{ fontSize: 7.5, letterSpacing: 2, color: c.categoryColor, fontFamily: "'Courier New',monospace", textTransform: 'uppercase' as const }}>
                  {icon + ' ' + (catConfig?.label || c.category)}
                </span>
                <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.22)', fontFamily: "'Courier New',monospace" }}>
                  {c.location + ' \u00B7 ' + c.tag}
                </span>
              </div>

              {/* Headline */}
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.42, color: '#ede9e3', marginBottom: 6 }}>
                {c.headline}
              </div>

              {/* Credibility tags */}
              {c.credibility && c.credibility.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                  {c.credibility.map(function (tag, j) {
                    return (
                      <span key={j} style={{
                        fontSize: 7,
                        padding: '2px 7px',
                        borderRadius: 20,
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.3)',
                        fontFamily: "'Courier New',monospace",
                        letterSpacing: 0.8,
                      }}>
                        {tag}
                      </span>
                    )
                  })}
                </div>
              )}
            </button>
          )
        })}
        <div style={{ marginTop: 4 }}><Constellation /></div>
        <div style={{ height: 10 }} />
      </div>
    </div>
  )
}
