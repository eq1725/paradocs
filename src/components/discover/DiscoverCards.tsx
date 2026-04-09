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
 * Typography: Inter (font-sans) body, Space Grotesk (font-display) headings.
 * Colors: primary-500 (#9000F0) accent, gray-900 backgrounds.
 * Matches site-wide styling from tailwind.config + globals.css.
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
//  Category color map (hex values for accent stripe / inline color)
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

// =========================================================================
//  Shared: Credibility tag pills
// =========================================================================

function CredibilityTags(props: { tags: string[] }) {
  if (!props.tags || props.tags.length === 0) return null
  return (
    <div className="flex gap-1.5 md:gap-2 flex-wrap flex-shrink-0">
      {props.tags.map(function (tag, i) {
        return (
          <span key={i} className="text-[10px] md:text-[11px] px-2.5 md:px-3 py-0.5 md:py-1 rounded-full border border-white/10 text-gray-400 font-sans font-medium">
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
    <div className="flex gap-6 md:gap-8 flex-shrink-0">
      {props.items.map(function (item, i) {
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <span className="text-xl md:text-2xl font-display font-bold" style={{ color: props.color }}>
              {item.value}
            </span>
            <span className="text-[9px] md:text-[10px] text-gray-500 font-sans font-medium uppercase tracking-wider">
              {item.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// =========================================================================
//  Shared: Read Case button
// =========================================================================

function ReadCaseButton(props: { onExpand: () => void }) {
  return (
    <button
      onClick={props.onExpand}
      className="w-full md:w-auto md:px-8 py-2.5 md:py-3 rounded-lg border border-white/10 bg-white/[0.03] text-gray-400 text-xs md:text-sm font-sans font-medium uppercase tracking-widest hover:bg-white/[0.06] hover:text-gray-300 transition-colors flex-shrink-0 cursor-pointer"
    >
      {'\u25BC Read Case'}
    </button>
  )
}

// =========================================================================
//  Shared: Bottom stats bar
// =========================================================================

function BottomStatsBar(props: { left: string, right: string }) {
  return (
    <div className="flex items-center justify-between mt-auto">
      <span className="text-[10px] text-gray-600 font-sans">{props.left}</span>
      <span className="text-[10px] text-gray-700 font-sans">{props.right}</span>
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
  var qf = item.ai_quick_facts

  // Build case type badge parts
  var badgeParts: string[] = []
  badgeParts.push(config?.label || item.category)
  if (item.first_reported_date) {
    var yearMatch = item.first_reported_date.match(/\d{4}/)
    if (yearMatch) badgeParts.push(yearMatch[0])
  }
  if (item.primary_regions && item.primary_regions.length > 0) {
    badgeParts.push(item.primary_regions[0])
  }

  // Credibility signals
  var credSignals: string[] = []
  if (qf?.evidence_types) credSignals.push(qf.evidence_types)
  if (qf?.classification) credSignals.push(qf.classification)
  if (item.report_count > 5) credSignals.push(item.report_count + ' reports')

  // Tension stats
  var tensionItems: { value: string | number, label: string }[] = []
  if (item.report_count > 0) tensionItems.push({ value: item.report_count, label: 'reports' })
  if (qf?.danger_level) tensionItems.push({ value: qf.danger_level.split(' ')[0], label: 'danger' })

  var displayText = item.feed_hook || item.ai_summary || ''

  return (
    <div className={'flex flex-col gap-4 md:gap-5 h-full font-sans' + (props.expanded ? ' overflow-y-auto' : ' overflow-hidden')}>
      {/* Case type badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] md:text-xs font-semibold uppercase tracking-widest" style={{ color: catColor }}>
            {(config?.icon || '') + ' ' + badgeParts.join(' \u00B7 ')}
          </span>
          {item.report_count > 20 && (
            <span className="text-[9px] bg-primary-500/15 text-primary-400 px-2 py-0.5 rounded-full font-medium">
              trending
            </span>
          )}
        </div>
      </div>

      {/* Location + meta */}
      <p className="text-[11px] text-gray-500 font-sans">
        {(item.primary_regions ? item.primary_regions.join(', ') : 'Global') + (qf?.classification ? ' \u00B7 ' + qf.classification : '')}
      </p>

      {/* Large bold opener — font-display for headlines */}
      <h2 className="text-lg sm:text-xl md:text-2xl lg:text-[1.7rem] font-display font-bold text-white leading-snug">
        {displayText || item.name}
      </h2>

      {/* Credibility signals */}
      <CredibilityTags tags={credSignals} />

      {/* Tension stats */}
      {tensionItems.length > 0 && (
        <StatsRow items={tensionItems} color={catColor} />
      )}

      {/* Read Case / Expanded */}
      {!props.expanded ? (
        <ReadCaseButton onExpand={props.onExpand} />
      ) : (
        <>
          <div className="h-px bg-white/[0.07] flex-shrink-0" />

          {/* Description — prefer ai_description (richer) over ai_summary (often mirrors hook) */}
          <p className="text-sm text-gray-400 leading-relaxed font-sans">
            {item.ai_description || item.ai_summary || 'No additional information available.'}
          </p>

          {/* Quick facts strip */}
          {qf && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-3 px-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex-shrink-0">
              {qf.first_documented && (
                <div className="flex flex-col">
                  <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">First documented</span>
                  <span className="text-xs text-gray-300 font-sans">{qf.first_documented}</span>
                </div>
              )}
              {qf.origin && (
                <div className="flex flex-col">
                  <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Origin</span>
                  <span className="text-xs text-gray-300 font-sans">{qf.origin}</span>
                </div>
              )}
              {qf.typical_encounter && (
                <div className="flex flex-col">
                  <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Typical encounter</span>
                  <span className="text-xs text-gray-300 font-sans">{qf.typical_encounter}</span>
                </div>
              )}
              {qf.danger_level && (
                <div className="flex flex-col">
                  <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Danger level</span>
                  <span className="text-xs text-gray-300 font-sans">{qf.danger_level}</span>
                </div>
              )}
              {qf.notable_feature && (
                <div className="flex flex-col col-span-2">
                  <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Notable feature</span>
                  <span className="text-xs text-gray-300 font-sans">{qf.notable_feature}</span>
                </div>
              )}
            </div>
          )}

          {/* Aliases */}
          {item.aliases && item.aliases.length > 0 && (
            <p className="text-[11px] text-gray-500 font-sans flex-shrink-0">
              {'Also known as: ' + item.aliases.slice(0, 4).join(', ')}
            </p>
          )}

          <Link
            href={'/phenomena/' + item.slug}
            className="inline-flex items-center gap-2 text-sm font-sans font-medium text-primary-400 hover:text-primary-300 transition-colors flex-shrink-0"
          >
            {'View Full Case \u2192'}
          </Link>
          <Constellation />
          <div className="h-5" />
        </>
      )}

      {/* Bottom bar */}
      {!props.expanded && (
        <BottomStatsBar
          left={item.report_count > 0 ? '\u2661 ' + item.report_count + ' reports' : ''}
          right={qf?.first_documented || ''}
        />
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

  // Badge parts
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
  if (locationStr) badgeParts.push(locationStr.length > 20 ? locationStr.substring(0, 18) + '\u2026' : locationStr)

  // Credibility
  var credSignals: string[] = []
  if (item.credibility === 'high') credSignals.push('High Credibility')
  if (item.has_physical_evidence) credSignals.push('Physical Evidence')
  if (item.source_label) credSignals.push(item.source_label)
  if (item.phenomenon_type) credSignals.push(item.phenomenon_type.name)

  var tagLine = ''
  if (item.source_type) tagLine = item.source_type
  if (item.content_type) tagLine = tagLine ? tagLine + ' \u00B7 ' + item.content_type : item.content_type

  var displayText = item.feed_hook || item.summary || ''

  // Stats
  var tensionItems: { value: string | number, label: string }[] = []
  if (item.upvotes > 0) tensionItems.push({ value: item.upvotes, label: 'upvotes' })
  if (item.view_count > 0) tensionItems.push({ value: item.view_count > 999 ? Math.round(item.view_count / 100) / 10 + 'k' : item.view_count, label: 'views' })
  if (item.comment_count > 0) tensionItems.push({ value: item.comment_count, label: 'comments' })

  return (
    <div className={'flex flex-col gap-4 md:gap-5 h-full font-sans' + (props.expanded ? ' overflow-y-auto' : ' overflow-hidden')}>
      {/* Case type badge */}
      <span className="text-[10px] md:text-xs font-semibold uppercase tracking-widest" style={{ color: catColor }}>
        {(config?.icon || '') + ' ' + badgeParts.join(' \u00B7 ')}
      </span>

      {/* Location */}
      <p className="text-[11px] md:text-xs text-gray-500 font-sans">
        {(locationStr || 'Unknown location') + (tagLine ? ' \u00B7 ' + tagLine : '')}
      </p>

      {/* Large bold opener */}
      <h2 className="text-lg sm:text-xl md:text-2xl lg:text-[1.7rem] font-display font-bold text-white leading-snug">
        {displayText || item.title}
      </h2>

      {/* Credibility */}
      <CredibilityTags tags={credSignals} />

      {/* Stats */}
      {tensionItems.length > 0 && (
        <StatsRow items={tensionItems} color={catColor} />
      )}

      {/* Read Case / Expanded */}
      {!props.expanded ? (
        <ReadCaseButton onExpand={props.onExpand} />
      ) : (
        <>
          <div className="h-px bg-white/[0.07] flex-shrink-0" />

          {/* Summary — use feed_hook for link-only sources to avoid showing raw source text */}
          <p className="text-sm text-gray-400 leading-relaxed font-sans">
            {(['bfro', 'nuforc', 'nderf'].indexOf(item.source_type || '') !== -1)
              ? (item.feed_hook || 'View the full report for details.')
              : (item.summary || 'No additional details available.')}
          </p>

          {/* Evidence & context strip */}
          {(item.has_physical_evidence || item.credibility === 'high' || item.source_label || item.event_date || item.phenomenon_type) && (
            <div className="flex flex-col gap-2 py-3 px-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex-shrink-0">
              {/* Evidence indicators */}
              {(item.has_physical_evidence || item.credibility === 'high') && (
                <div className="flex items-center gap-3">
                  {item.credibility === 'high' && (
                    <span className="text-[10px] text-emerald-400 font-sans font-medium">{'\u2713 High credibility'}</span>
                  )}
                  {item.has_physical_evidence && (
                    <span className="text-[10px] text-amber-400 font-sans font-medium">{'\u25C6 Physical evidence'}</span>
                  )}
                </div>
              )}
              {/* Details row */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {item.event_date && (
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Date</span>
                    <span className="text-xs text-gray-300 font-sans">{new Date(item.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </div>
                )}
                {item.source_label && (
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Source</span>
                    <span className="text-xs text-gray-300 font-sans">{item.source_label}</span>
                  </div>
                )}
                {item.content_type && (
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Type</span>
                    <span className="text-xs text-gray-300 font-sans">{item.content_type.replace(/_/g, ' ')}</span>
                  </div>
                )}
              </div>
              {/* Connected phenomenon */}
              {item.phenomenon_type && (
                <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04]">
                  <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Linked to</span>
                  <span className="text-[11px] text-primary-400 font-sans font-medium">{item.phenomenon_type.name}</span>
                </div>
              )}
            </div>
          )}

          <Link
            href={'/report/' + item.slug}
            className="inline-flex items-center gap-2 text-sm font-sans font-medium text-primary-400 hover:text-primary-300 transition-colors flex-shrink-0"
          >
            {'View Full Report \u2192'}
          </Link>
          <Constellation />
          <div className="h-5" />
        </>
      )}

      {/* Bottom bar */}
      {!props.expanded && (
        <BottomStatsBar
          left={item.upvotes > 0 ? '\u2661 ' + item.upvotes.toLocaleString() : ''}
          right={item.event_date ? new Date(item.event_date).getFullYear().toString() : ''}
        />
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
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'

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
  if (locationStr) badgeParts.push(locationStr.length > 20 ? locationStr.substring(0, 18) + '\u2026' : locationStr)

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
    <div className={'flex flex-col gap-4 md:gap-5 h-full font-sans' + (props.expanded ? ' overflow-y-auto' : ' overflow-hidden')}>
      {/* Case type badge + evidence marker */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] md:text-xs font-semibold uppercase tracking-widest" style={{ color: catColor }}>
          {(config?.icon || '') + ' ' + badgeParts.join(' \u00B7 ')}
        </span>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-sans font-semibold uppercase tracking-wider">
          Evidence
        </span>
      </div>

      {/* Location */}
      <p className="text-[11px] text-gray-500 font-sans">
        {locationStr || 'Unknown location'}
      </p>

      {/* Large bold opener */}
      <h2 className="text-lg sm:text-xl md:text-2xl lg:text-[1.7rem] font-display font-bold text-white leading-snug">
        {displayText || item.title}
      </h2>

      {/* Credibility */}
      <CredibilityTags tags={credSignals} />

      {/* Stats */}
      {tensionItems.length > 0 && (
        <StatsRow items={tensionItems} color={catColor} />
      )}

      {/* Read Case / Expanded */}
      {!props.expanded ? (
        <ReadCaseButton onExpand={props.onExpand} />
      ) : (
        <>
          <div className="h-px bg-white/[0.07] flex-shrink-0" />
          {/* Media thumbnail */}
          {item.primary_media && (item.primary_media.thumbnail_url || item.primary_media.url) && (
            <div className="rounded-lg overflow-hidden flex-shrink-0">
              <img
                src={item.primary_media.thumbnail_url || item.primary_media.url}
                alt={item.primary_media.caption || ''}
                className="w-full h-44 object-cover opacity-80"
                referrerPolicy="no-referrer"
              />
              {item.primary_media.caption && (
                <p className="text-[10px] text-gray-500 font-sans pt-1.5">{item.primary_media.caption}</p>
              )}
            </div>
          )}
          <p className="text-sm text-gray-400 leading-relaxed font-sans">
            {(['bfro', 'nuforc', 'nderf'].indexOf(item.source_type || '') !== -1)
              ? (item.feed_hook || 'View the full report for details.')
              : (item.summary || 'No additional details available.')}
          </p>

          {/* Evidence & context strip */}
          {(item.has_physical_evidence || item.credibility === 'high' || item.source_label || item.event_date || item.phenomenon_type) && (
            <div className="flex flex-col gap-2 py-3 px-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex-shrink-0">
              {(item.has_physical_evidence || item.credibility === 'high') && (
                <div className="flex items-center gap-3">
                  {item.credibility === 'high' && (
                    <span className="text-[10px] text-emerald-400 font-sans font-medium">{'\u2713 High credibility'}</span>
                  )}
                  {item.has_physical_evidence && (
                    <span className="text-[10px] text-amber-400 font-sans font-medium">{'\u25C6 Physical evidence'}</span>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {item.event_date && (
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Date</span>
                    <span className="text-xs text-gray-300 font-sans">{new Date(item.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </div>
                )}
                {item.source_label && (
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Source</span>
                    <span className="text-xs text-gray-300 font-sans">{item.source_label}</span>
                  </div>
                )}
                {item.content_type && (
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Type</span>
                    <span className="text-xs text-gray-300 font-sans">{item.content_type.replace(/_/g, ' ')}</span>
                  </div>
                )}
              </div>
              {item.phenomenon_type && (
                <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04]">
                  <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Linked to</span>
                  <span className="text-[11px] text-primary-400 font-sans font-medium">{item.phenomenon_type.name}</span>
                </div>
              )}
            </div>
          )}

          <Link
            href={'/report/' + item.slug}
            className="inline-flex items-center gap-2 text-sm font-sans font-medium text-primary-400 hover:text-primary-300 transition-colors flex-shrink-0"
          >
            {'View Full Report \u2192'}
          </Link>
          <Constellation />
          <div className="h-5" />
        </>
      )}

      {/* Bottom bar */}
      {!props.expanded && (
        <BottomStatsBar
          left={item.upvotes > 0 ? '\u2661 ' + item.upvotes.toLocaleString() : ''}
          right={item.event_date ? new Date(item.event_date).getFullYear().toString() : ''}
        />
      )}
    </div>
  )
}
