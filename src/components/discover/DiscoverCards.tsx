'use client'

/**
 * Phase 4 Discover Card Templates — Typography-First Visual Hierarchy
 *
 * Redesigned for the gesture-based feed (no CSS snap-scroll).
 * Cards use typography and layout as the visual layer:
 *
 *   1. Case type badge (UFO · 1976 · Iran) — scannable identity
 *   2. Credibility signal (Military witness · Radar corroboration) — trust
 *   3. Tension stat (3 witnesses · No explanation) — urgency
 *   4. Large bold opener line — headline treatment
 *   5. "Read Case" button → expands summary + Constellation paywall
 *
 * Three card types: PhenomenonCard, TextReportCard, MediaReportCard
 * All accept an `expanded` prop + `onExpand` callback for inline expand.
 *
 * SWC-compatible: var, function expressions, string concat only.
 */

import React, { useState } from 'react'
import Link from 'next/link'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'
import { Constellation } from './Constellation'

// =========================================================================
//  Shared types
// =========================================================================

interface QuickFacts {
  origin?: string
  first_documented?: string
  classification?: string
  danger_level?: string
  typical_encounter?: string
  evidence_types?: string
  active_period?: string
  notable_feature?: string
  cultural_significance?: string
}

export interface PhenomenonItem {
  item_type: 'phenomenon'
  id: string
  name: string
  slug: string
  category: string
  icon: string
  ai_summary: string | null
  ai_description: string | null
  ai_quick_facts: QuickFacts | null
  feed_hook: string | null
  primary_image_url: string | null
  report_count: number
  primary_regions: string[] | null
  first_reported_date: string | null
  aliases: string[] | null
}

export interface ReportMedia {
  type: string
  url: string
  thumbnail_url: string | null
  caption: string | null
}

export interface ReportItem {
  item_type: 'report'
  id: string
  title: string
  slug: string
  summary: string | null
  feed_hook: string | null
  category: string
  country: string | null
  city: string | null
  state_province: string | null
  event_date: string | null
  credibility: string | null
  upvotes: number
  view_count: number
  comment_count: number
  has_photo_video: boolean
  has_physical_evidence: boolean
  content_type: string | null
  location_name: string | null
  source_type: string | null
  source_label: string | null
  created_at: string
  phenomenon_type: { name: string; slug: string; category: string } | null
  primary_media: ReportMedia | null
  associated_image_url: string | null
  associated_image_source: string | null
}

export type FeedItemV2 = PhenomenonItem | ReportItem

// =========================================================================
//  Category color map (hex values for inline styles)
// =========================================================================

var CATEGORY_COLORS: Record<string, string> = {
  ufos_aliens: '#4fc3f7',
  cryptids: '#a5d6a7',
  ghosts_hauntings: '#ce93d8',
  psychic_phenomena: '#b39ddb',
  consciousness_practices: '#ffb74d',
  psychological_experiences: '#80deea',
  biological_factors: '#ef9a9a',
  perception_sensory: '#ffcc80',
  religion_mythology: '#fff176',
  esoteric_practices: '#f48fb1',
  combination: '#80cbc4',
}

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

/** Simple hash for deterministic variety */
function hashString(str: string): number {
  var hash = 0
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

// =========================================================================
//  Shared: Credibility tag pills
// =========================================================================

function CredibilityTags(props: { tags: string[], color: string }) {
  if (!props.tags || props.tags.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const, flexShrink: 0 }}>
      {props.tags.map(function (tag, i) {
        return (
          <span key={i} style={{
            fontSize: 7.5,
            padding: '2px 9px',
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.35)',
            fontFamily: "'Courier New',monospace",
            letterSpacing: 0.8,
          }}>
            {tag}
          </span>
        )
      })}
    </div>
  )
}

// =========================================================================
//  Shared: Stats row (witnesses, documents, depth)
// =========================================================================

function StatsRow(props: { items: { value: string | number, label: string }[], color: string }) {
  return (
    <div style={{ display: 'flex', gap: 18, flexShrink: 0 }}>
      {props.items.map(function (item, i) {
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: props.color, fontFamily: "system-ui,-apple-system,sans-serif" }}>
              {item.value}
            </span>
            <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.28)', fontFamily: "'Courier New',monospace", textTransform: 'uppercase' as const, letterSpacing: 1 }}>
              {item.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// =========================================================================
//  1. PhenomenonCard — encyclopedia entry, typography-first
// =========================================================================

export function PhenomenonCard(props: {
  item: PhenomenonItem
  index: number
  isActive: boolean
  expanded: boolean
  onExpand: () => void
  user: any
  onShowSignup: (show: boolean) => void
}) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'
  var icon = CAT_ICON[item.category] || '\uD83D\uDD0D'
  var qf = item.ai_quick_facts

  // Build case type badge
  var badgeParts: string[] = []
  badgeParts.push(config?.label || item.category)
  if (item.first_reported_date) {
    var yearMatch = item.first_reported_date.match(/\d{4}/)
    if (yearMatch) badgeParts.push(yearMatch[0])
  }
  if (item.primary_regions && item.primary_regions.length > 0) {
    badgeParts.push(item.primary_regions[0])
  }

  // Build credibility signals from quick facts
  var credSignals: string[] = []
  if (qf?.evidence_types) credSignals.push(qf.evidence_types)
  if (qf?.classification) credSignals.push(qf.classification)
  if (item.report_count > 5) credSignals.push(item.report_count + ' reports')

  // Tension stat
  var tensionItems: { value: string | number, label: string }[] = []
  if (item.report_count > 0) tensionItems.push({ value: item.report_count, label: 'reports' })
  if (qf?.danger_level) tensionItems.push({ value: qf.danger_level.split(' ')[0], label: 'danger' })

  // Display text: hook or summary
  var displayText = item.feed_hook || item.ai_summary || ''

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      height: '100%',
      overflowY: props.expanded ? 'auto' : 'hidden',
    }}>
      {/* Case type badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 9, letterSpacing: 2.5, color: catColor, fontFamily: "'Courier New',monospace", textTransform: 'uppercase' as const }}>
            {icon + ' ' + badgeParts.join(' \u00B7 ')}
          </span>
          {item.report_count > 20 && (
            <span style={{ fontSize: 7.5, background: 'rgba(212,175,55,0.11)', color: '#d4af37', padding: '1px 7px', borderRadius: 10, fontFamily: "'Courier New',monospace", letterSpacing: 0.5 }}>
              trending
            </span>
          )}
        </div>
      </div>

      {/* Location + tag */}
      <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.35)', fontFamily: "'Courier New',monospace" }}>
        {'\u25C9 ' + (item.primary_regions ? item.primary_regions.join(', ') : 'Global') + (qf?.classification ? ' \u00B7 ' + qf.classification : '')}
      </div>

      {/* Large bold opener */}
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.45, color: '#f2f0eb', fontFamily: "system-ui,-apple-system,sans-serif" }}>
        {displayText || item.name}
      </div>

      {/* Credibility signals */}
      <CredibilityTags tags={credSignals} color={catColor} />

      {/* Stats */}
      {tensionItems.length > 0 && (
        <StatsRow items={tensionItems} color={catColor} />
      )}

      {/* Read Case button */}
      {!props.expanded && (
        <button onClick={props.onExpand} style={{
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          padding: '9px 0',
          color: 'rgba(255,255,255,0.35)',
          fontSize: 9.5,
          fontFamily: "'Courier New',monospace",
          letterSpacing: 2,
          textTransform: 'uppercase' as const,
          cursor: 'pointer',
          flexShrink: 0,
        }}>
          {'\u25BC Read Case'}
        </button>
      )}

      {/* Expanded content */}
      {props.expanded && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />
          <div style={{ fontSize: 13, lineHeight: 1.8, color: 'rgba(255,255,255,0.65)', fontFamily: "'Courier New',monospace" }}>
            {item.ai_summary || item.ai_description || 'No additional information available.'}
          </div>
          <Constellation />
          <div style={{ height: 20 }} />
        </>
      )}

      {/* Bottom stats bar (when not expanded) */}
      {!props.expanded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.2)' }}>
            <span>{'\u2661'}</span>
            <span style={{ fontSize: 8, fontFamily: "'Courier New',monospace" }}>
              {item.report_count + ' reports'}
            </span>
          </div>
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.13)', fontFamily: "'Courier New',monospace" }}>
            {qf?.first_documented || ''}
          </span>
        </div>
      )}
    </div>
  )
}

// =========================================================================
//  2. TextReportCard — experiencer report, text-focused
// =========================================================================

export function TextReportCard(props: {
  item: ReportItem
  index: number
  isActive: boolean
  expanded: boolean
  onExpand: () => void
  user: any
  onShowSignup: (show: boolean) => void
}) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'
  var icon = CAT_ICON[item.category] || '\uD83D\uDD0D'

  // Build case type badge
  var badgeParts: string[] = []
  badgeParts.push(config?.label || item.category)
  if (item.event_date) {
    var yearMatch = item.event_date.match(/\d{4}/)
    if (yearMatch) badgeParts.push(yearMatch[0])
  }
  var locationParts: string[] = []
  if (item.city) locationParts.push(item.city)
  if (item.state_province) locationParts.push(item.state_province)
  if (item.country) locationParts.push(item.country)
  var locationStr = locationParts.join(', ')
  if (locationStr) badgeParts.push(locationStr.length > 20 ? locationStr.substring(0, 18) + '...' : locationStr)

  // Credibility signals
  var credSignals: string[] = []
  if (item.credibility === 'high') credSignals.push('High Credibility')
  if (item.has_physical_evidence) credSignals.push('Physical Evidence')
  if (item.source_label) credSignals.push(item.source_label)
  if (item.phenomenon_type) credSignals.push(item.phenomenon_type.name)

  // Tag line
  var tagLine = ''
  if (item.source_type) tagLine = item.source_type
  if (item.content_type) tagLine = tagLine ? tagLine + ' \u00B7 ' + item.content_type : item.content_type

  // Display text
  var displayText = item.feed_hook || item.summary || ''

  // Tension stats
  var tensionItems: { value: string | number, label: string }[] = []
  if (item.upvotes > 0) tensionItems.push({ value: item.upvotes, label: 'upvotes' })
  if (item.view_count > 0) tensionItems.push({ value: item.view_count > 999 ? Math.round(item.view_count / 100) / 10 + 'k' : item.view_count, label: 'views' })
  if (item.comment_count > 0) tensionItems.push({ value: item.comment_count, label: 'comments' })

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      height: '100%',
      overflowY: props.expanded ? 'auto' : 'hidden',
    }}>
      {/* Case type badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, letterSpacing: 2.5, color: catColor, fontFamily: "'Courier New',monospace", textTransform: 'uppercase' as const }}>
          {icon + ' ' + badgeParts.join(' \u00B7 ')}
        </span>
      </div>

      {/* Location + tag */}
      <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.35)', fontFamily: "'Courier New',monospace" }}>
        {'\u25C9 ' + (locationStr || 'Unknown location') + (tagLine ? ' \u00B7 ' + tagLine : '')}
      </div>

      {/* Large bold opener — headline, not a sentence */}
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.45, color: '#f2f0eb', fontFamily: "system-ui,-apple-system,sans-serif" }}>
        {displayText || item.title}
      </div>

      {/* Credibility signals */}
      <CredibilityTags tags={credSignals} color={catColor} />

      {/* Tension stats */}
      {tensionItems.length > 0 && (
        <StatsRow items={tensionItems} color={catColor} />
      )}

      {/* Read Case button */}
      {!props.expanded && (
        <button onClick={props.onExpand} style={{
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          padding: '9px 0',
          color: 'rgba(255,255,255,0.35)',
          fontSize: 9.5,
          fontFamily: "'Courier New',monospace",
          letterSpacing: 2,
          textTransform: 'uppercase' as const,
          cursor: 'pointer',
          flexShrink: 0,
        }}>
          {'\u25BC Read Case'}
        </button>
      )}

      {/* Expanded content */}
      {props.expanded && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />
          <div style={{ fontSize: 13, lineHeight: 1.8, color: 'rgba(255,255,255,0.65)', fontFamily: "'Courier New',monospace" }}>
            {item.summary || 'No additional details available.'}
          </div>
          <Constellation />
          <div style={{ height: 20 }} />
        </>
      )}

      {/* Bottom bar */}
      {!props.expanded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.2)' }}>
            <span>{'\u2661'}</span>
            <span style={{ fontSize: 8, fontFamily: "'Courier New',monospace" }}>
              {item.upvotes > 0 ? item.upvotes.toLocaleString() : ''}
            </span>
          </div>
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.13)', fontFamily: "'Courier New',monospace" }}>
            {item.event_date ? new Date(item.event_date).getFullYear().toString() : ''}
          </span>
        </div>
      )}
    </div>
  )
}

// =========================================================================
//  3. MediaReportCard — report with photo/video evidence
// =========================================================================

export function MediaReportCard(props: {
  item: ReportItem
  index: number
  isActive: boolean
  expanded: boolean
  onExpand: () => void
  user: any
  onShowSignup: (show: boolean) => void
}) {
  // MediaReportCard uses the same layout as TextReportCard but with
  // an "Evidence" badge. The actual image display is minimal in the
  // typography-first design — images are reserved for expanded view.
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'
  var icon = CAT_ICON[item.category] || '\uD83D\uDD0D'

  var badgeParts: string[] = []
  badgeParts.push(config?.label || item.category)
  if (item.event_date) {
    var yearMatch = item.event_date.match(/\d{4}/)
    if (yearMatch) badgeParts.push(yearMatch[0])
  }
  var locationParts: string[] = []
  if (item.city) locationParts.push(item.city)
  if (item.state_province) locationParts.push(item.state_province)
  if (item.country) locationParts.push(item.country)
  var locationStr = locationParts.join(', ')
  if (locationStr) badgeParts.push(locationStr.length > 20 ? locationStr.substring(0, 18) + '...' : locationStr)

  var credSignals: string[] = []
  if (item.has_photo_video) credSignals.push('Photo/Video Evidence')
  if (item.credibility === 'high') credSignals.push('High Credibility')
  if (item.has_physical_evidence) credSignals.push('Physical Evidence')
  if (item.source_label) credSignals.push(item.source_label)

  var displayText = item.feed_hook || item.summary || ''

  var tensionItems: { value: string | number, label: string }[] = []
  if (item.upvotes > 0) tensionItems.push({ value: item.upvotes, label: 'upvotes' })
  if (item.view_count > 0) tensionItems.push({ value: item.view_count > 999 ? Math.round(item.view_count / 100) / 10 + 'k' : item.view_count, label: 'views' })

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      height: '100%',
      overflowY: props.expanded ? 'auto' : 'hidden',
    }}>
      {/* Case type badge + evidence marker */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, letterSpacing: 2.5, color: catColor, fontFamily: "'Courier New',monospace", textTransform: 'uppercase' as const }}>
          {icon + ' ' + badgeParts.join(' \u00B7 ')}
        </span>
        <span style={{
          fontSize: 7,
          padding: '2px 8px',
          borderRadius: 10,
          background: 'rgba(255,179,64,0.12)',
          color: '#ffb740',
          fontFamily: "'Courier New',monospace",
          letterSpacing: 1,
          textTransform: 'uppercase' as const,
        }}>
          Evidence
        </span>
      </div>

      {/* Location */}
      <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.35)', fontFamily: "'Courier New',monospace" }}>
        {'\u25C9 ' + (locationStr || 'Unknown location')}
      </div>

      {/* Large bold opener */}
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.45, color: '#f2f0eb', fontFamily: "system-ui,-apple-system,sans-serif" }}>
        {displayText || item.title}
      </div>

      {/* Credibility */}
      <CredibilityTags tags={credSignals} color={catColor} />

      {/* Stats */}
      {tensionItems.length > 0 && (
        <StatsRow items={tensionItems} color={catColor} />
      )}

      {/* Read Case */}
      {!props.expanded && (
        <button onClick={props.onExpand} style={{
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          padding: '9px 0',
          color: 'rgba(255,255,255,0.35)',
          fontSize: 9.5,
          fontFamily: "'Courier New',monospace",
          letterSpacing: 2,
          textTransform: 'uppercase' as const,
          cursor: 'pointer',
          flexShrink: 0,
        }}>
          {'\u25BC Read Case'}
        </button>
      )}

      {/* Expanded */}
      {props.expanded && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />
          {/* Show media thumbnail if available */}
          {item.primary_media && (item.primary_media.thumbnail_url || item.primary_media.url) && (
            <div style={{ borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
              <img
                src={item.primary_media.thumbnail_url || item.primary_media.url}
                alt={item.primary_media.caption || ''}
                style={{ width: '100%', height: 180, objectFit: 'cover', opacity: 0.8 }}
                referrerPolicy="no-referrer"
              />
              {item.primary_media.caption && (
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', fontFamily: "'Courier New',monospace", padding: '6px 0 0' }}>
                  {item.primary_media.caption}
                </div>
              )}
            </div>
          )}
          <div style={{ fontSize: 13, lineHeight: 1.8, color: 'rgba(255,255,255,0.65)', fontFamily: "'Courier New',monospace" }}>
            {item.summary || 'No additional details available.'}
          </div>
          <Constellation />
          <div style={{ height: 20 }} />
        </>
      )}

      {/* Bottom bar */}
      {!props.expanded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.2)' }}>
            <span>{'\u2661'}</span>
            <span style={{ fontSize: 8, fontFamily: "'Courier New',monospace" }}>
              {item.upvotes > 0 ? item.upvotes.toLocaleString() : ''}
            </span>
          </div>
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.13)', fontFamily: "'Courier New',monospace" }}>
            {item.event_date ? new Date(item.event_date).getFullYear().toString() : ''}
          </span>
        </div>
      )}
    </div>
  )
}
