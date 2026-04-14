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

export type EmotionValence = 'positive' | 'transcendent' | 'ambivalent' | 'negative'

export interface EmotionToken {
  slug: string
  label: string
  valence: EmotionValence
}

export interface NDERFCaseProfile {
  ndeType?: string
  trigger?: string
  ageAtNDE?: string
  gender?: string
  consciousnessPeak?: string
  tunnel?: 'yes' | 'no'
  light?: 'yes' | 'no'
  outOfBody?: 'yes' | 'no'
  lifeReview?: 'yes' | 'no'
  metBeings?: 'yes' | 'no'
  boundary?: 'yes' | 'no'
  alteredTime?: 'yes' | 'no'
  // Controlled-vocabulary tokens. Legacy rows may still carry a raw
  // string — the renderer ignores those.
  emotions?: EmotionToken[] | string
  aftereffectsChangedLife?: 'yes' | 'no'
  // Expanded phenomenology and interpretation (QA/QC #3, Apr 14 2026).
  // All values derive from factual yes/no or multi-choice questionnaire
  // answers — never from free-form narrative prose.
  mysticalBeing?: 'yes' | 'no'
  deceasedPresent?: 'yes' | 'no'
  otherworldly?: 'yes' | 'no'
  specialKnowledge?: 'yes' | 'no'
  futureScenes?: 'yes' | 'no'
  afterlifeAware?: 'yes' | 'no'
  memoryAccuracy?: 'yes' | 'no'
  realityBelief?: 'yes' | 'no'
  lifeChanged?: 'yes' | 'no'
}

export interface ReportItem {
  item_type: 'report'
  id: string
  title: string
  slug: string
  summary: string | null
  feed_hook: string | null
  paradocs_narrative: string | null
  category: string
  country: string | null
  city: string | null
  state_province: string | null
  event_date: string | null
  event_date_precision: string | null
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
  metadata: {
    case_profile?: NDERFCaseProfile
    [key: string]: any
  } | null
}

export type FeedItemV2 = PhenomenonItem | ReportItem

// =========================================================================
//  Link-only source helper
//  These adapters don't republish source narrative — their reports are
//  rendered with Paradocs-generated hook + analysis plus "View Full Report".
// =========================================================================

var LINK_ONLY_SOURCES = ['bfro', 'nuforc', 'nderf', 'oberf']

function isLinkOnly(sourceType: string | null): boolean {
  if (!sourceType) return false
  return LINK_ONLY_SOURCES.indexOf(sourceType) !== -1
}

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
//  Shared: Format date respecting precision (exact / month / year)
// =========================================================================

function formatReportDate(dateStr: string | null, precision: string | null): string {
  if (!dateStr) return ''
  var d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  if (precision === 'year') return d.getUTCFullYear().toString()
  if (precision === 'month') return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' })
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// =========================================================================
//  Shared: NDERF Case Profile chip row
//  Rendered on expansion for NDERF reports only. Replaces the generic
//  Research Data Panel with density of actual case data.
// =========================================================================

// Valence-tinted chip styling for emotion tokens. Subtle — these are
// categorical tags, not mood-ring badges.
function emotionChipClass(valence: EmotionValence): string {
  if (valence === 'transcendent') return 'bg-indigo-500/[0.08] border-indigo-400/20 text-indigo-200'
  if (valence === 'positive') return 'bg-emerald-500/[0.07] border-emerald-400/20 text-emerald-100'
  if (valence === 'negative') return 'bg-rose-500/[0.07] border-rose-400/20 text-rose-100'
  // ambivalent
  return 'bg-amber-500/[0.06] border-amber-400/20 text-amber-100'
}

export function CaseProfileChips(props: { profile: NDERFCaseProfile, variant?: 'compact' | 'full' }) {
  var p = props.profile
  var variant = props.variant || 'compact'

  // Primary identity facts — text-value chips shown prominently.
  // NOTE: ndeType is intentionally NOT rendered here. The experience-type
  // classification (e.g. "Other Experience", "Out-of-Body Experience") is
  // kept in metadata for backend taxonomy / filtering only — surfacing it
  // on the detail page creates redundant category labeling and a
  // category-vs-classifier confusion for readers. (QA/QC #2, Apr 14 2026.)
  var identity: { label: string, value: string }[] = []
  if (p.trigger) identity.push({ label: 'Trigger', value: p.trigger })
  if (p.gender) identity.push({ label: 'Gender', value: p.gender })
  if (p.ageAtNDE) identity.push({ label: 'Age', value: p.ageAtNDE })

  // Phenomenon checklist — yes/no/unknown for each NDE feature.
  // Ordered roughly core → peripheral → aftereffects so the most commonly
  // answered features surface first in the chip grid.
  var phenomena: { label: string, state: 'yes' | 'no' | 'unknown' }[] = [
    { label: 'Out-of-body', state: p.outOfBody || 'unknown' },
    { label: 'Tunnel', state: p.tunnel || 'unknown' },
    { label: 'Brilliant light', state: p.light || 'unknown' },
    { label: 'Met beings', state: p.metBeings || 'unknown' },
    { label: 'Mystical being', state: p.mysticalBeing || 'unknown' },
    { label: 'Deceased present', state: p.deceasedPresent || 'unknown' },
    { label: 'Other realm', state: p.otherworldly || 'unknown' },
    { label: 'Life review', state: p.lifeReview || 'unknown' },
    { label: 'Special knowledge', state: p.specialKnowledge || 'unknown' },
    { label: 'Future scenes', state: p.futureScenes || 'unknown' },
    { label: 'Afterlife aware', state: p.afterlifeAware || 'unknown' },
    { label: 'Boundary', state: p.boundary || 'unknown' },
    { label: 'Altered time', state: p.alteredTime || 'unknown' },
    { label: 'Vivid memory', state: p.memoryAccuracy || 'unknown' },
    { label: 'Believes real', state: p.realityBelief || 'unknown' },
    { label: 'Life changed', state: (p.lifeChanged || p.aftereffectsChangedLife) || 'unknown' },
  ]
  // Only show phenomena that were actually answered
  var answeredPhenomena = phenomena.filter(function (x) { return x.state !== 'unknown' })

  // Emotions are always a token array now. Legacy string values are
  // ignored — we don't render verbatim experiencer prose.
  var emotionTokens: EmotionToken[] = Array.isArray(p.emotions) ? p.emotions : []

  if (identity.length === 0 && answeredPhenomena.length === 0 && emotionTokens.length === 0) return null

  // Compact variant — used on the Discover feed (horizontal density priority)
  if (variant === 'compact') {
    var allChips: { label: string, value: string }[] = identity.slice()
    answeredPhenomena.forEach(function (ph) {
      allChips.push({ label: ph.label, value: ph.state === 'yes' ? 'Yes' : 'No' })
    })
    return (
      <div className="flex flex-col gap-2 py-3 px-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex-shrink-0">
        <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">Case Profile</span>
        <div className="flex flex-wrap gap-1.5">
          {allChips.map(function (chip, i) {
            return (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.03] text-gray-300 font-sans"
              >
                <span className="text-gray-500">{chip.label}:</span>{' ' + chip.value}
              </span>
            )
          })}
        </div>
        {emotionTokens.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider mr-0.5">
              Feelings
            </span>
            {emotionTokens.map(function (tok) {
              return (
                <span
                  key={tok.slug}
                  className={classNames(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-sans border',
                    emotionChipClass(tok.valence)
                  )}
                >
                  {tok.label}
                </span>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Full variant — used on the detail page (structured, scannable)
  return (
    <div className="rounded-xl bg-gradient-to-b from-white/[0.04] to-white/[0.015] border border-white/[0.08] overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06]">
        <div className="h-1.5 w-1.5 rounded-full bg-indigo-400/70" />
        <span className="text-[11px] font-sans uppercase tracking-[0.14em] text-gray-400 font-medium">
          NDE Case Profile
        </span>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Primary identity facts — labeled grid */}
        {identity.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
            {identity.map(function (fact, i) {
              return (
                <div key={i} className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] font-sans uppercase tracking-wider text-gray-500">
                    {fact.label}
                  </span>
                  <span className="text-sm text-gray-100 font-sans font-medium truncate" title={fact.value}>
                    {fact.value}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Divider between identity and phenomena */}
        {identity.length > 0 && answeredPhenomena.length > 0 && (
          <div className="h-px bg-white/[0.06]" />
        )}

        {/* Phenomenon checklist — check/cross chips */}
        {answeredPhenomena.length > 0 && (
          <div>
            <span className="text-[10px] font-sans uppercase tracking-wider text-gray-500 mb-2 block">
              Reported Phenomena
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {answeredPhenomena.map(function (ph, i) {
                var isYes = ph.state === 'yes'
                return (
                  <div
                    key={i}
                    className={classNames(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-sans',
                      isYes
                        ? 'bg-emerald-500/[0.07] border border-emerald-500/20 text-emerald-100'
                        : 'bg-white/[0.02] border border-white/[0.06] text-gray-500'
                    )}
                  >
                    <span
                      className={classNames(
                        'flex-shrink-0 h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold',
                        isYes
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-white/[0.05] text-gray-600'
                      )}
                      aria-hidden="true"
                    >
                      {isYes ? '\u2713' : '\u2013'}
                    </span>
                    <span className={isYes ? 'text-gray-100' : 'text-gray-500'}>{ph.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Reported feelings — categorical tokens, not verbatim prose */}
        {emotionTokens.length > 0 && (
          <div className="pt-3 border-t border-white/[0.06]">
            <span className="text-[10px] font-sans uppercase tracking-wider text-gray-500 block mb-2">
              Reported Feelings
            </span>
            <div className="flex flex-wrap gap-1.5">
              {emotionTokens.map(function (tok) {
                return (
                  <span
                    key={tok.slug}
                    className={classNames(
                      'text-xs px-2.5 py-1 rounded-full font-sans border',
                      emotionChipClass(tok.valence)
                    )}
                  >
                    {tok.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>
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

  var hasLocation = !!(item.city || item.state_province || item.country || item.location_name)
  var locationParts: string[] = []
  if (item.city) locationParts.push(item.city)
  if (item.state_province) locationParts.push(item.state_province)
  if (item.country) locationParts.push(item.country)
  var locationStr = locationParts.join(', ')

  // Badge parts: category + year (if known)
  var badgeParts: string[] = []
  badgeParts.push(config?.label || item.category)
  if (item.event_date) {
    var yearMatch = item.event_date.match(/\d{4}/)
    if (yearMatch) badgeParts.push(yearMatch[0])
  }
  if (locationStr) badgeParts.push(locationStr.length > 20 ? locationStr.substring(0, 18) + '\u2026' : locationStr)

  // Meta strip now carries: location (or Unknown), formatted date, source label, type
  var metaParts: string[] = []
  metaParts.push(locationStr || 'Unknown location')
  var prettyDate = formatReportDate(item.event_date, item.event_date_precision)
  if (prettyDate) metaParts.push(prettyDate)
  if (item.source_label) metaParts.push(item.source_label)
  if (item.phenomenon_type) metaParts.push(item.phenomenon_type.name)

  // Credibility pills
  var credSignals: string[] = []
  if (item.credibility === 'high') credSignals.push('High Credibility')
  if (item.has_physical_evidence) credSignals.push('Physical Evidence')

  var displayText = item.feed_hook || item.summary || ''
  var caseProfile = (item.metadata && item.metadata.case_profile) || null
  var isNDERF = item.source_type === 'nderf' || item.source_type === 'oberf'
  // Expanded section text: paradocs_narrative (our own analytical take) is the goal.
  // Falls back to summary only for legacy curated sources where narrative is intentionally null.
  var expandedText = item.paradocs_narrative || (isLinkOnly(item.source_type) ? '' : item.summary) || ''

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

      {/* Meta strip: location \u00B7 date \u00B7 source \u00B7 phenomenon */}
      <p className="text-[11px] md:text-xs text-gray-500 font-sans">
        {metaParts.join(' \u00B7 ')}
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

          {/* Paradocs Analysis \u2014 our own longer analytical take */}
          {expandedText ? (
            <p className="text-sm text-gray-400 leading-relaxed font-sans">
              {expandedText}
            </p>
          ) : (
            <p className="text-sm text-gray-500 italic leading-relaxed font-sans">
              {'Analysis coming soon. View the full report for source details.'}
            </p>
          )}

          {/* NDERF Case Profile chips \u2014 replaces generic Research Data Panel */}
          {isNDERF && caseProfile && (
            <CaseProfileChips profile={caseProfile} />
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

  var locationParts: string[] = []
  if (item.city) locationParts.push(item.city)
  if (item.state_province) locationParts.push(item.state_province)
  if (item.country) locationParts.push(item.country)
  var locationStr = locationParts.join(', ')

  var badgeParts: string[] = []
  badgeParts.push(config?.label || item.category)
  if (item.event_date) {
    var yearMatch = item.event_date.match(/\d{4}/)
    if (yearMatch) badgeParts.push(yearMatch[0])
  }
  if (locationStr) badgeParts.push(locationStr.length > 20 ? locationStr.substring(0, 18) + '\u2026' : locationStr)

  var metaParts: string[] = []
  metaParts.push(locationStr || 'Unknown location')
  var prettyDate = formatReportDate(item.event_date, item.event_date_precision)
  if (prettyDate) metaParts.push(prettyDate)
  if (item.source_label) metaParts.push(item.source_label)

  var credSignals: string[] = []
  if (item.has_photo_video) credSignals.push('Photo/Video Evidence')
  if (item.credibility === 'high') credSignals.push('High Credibility')
  if (item.has_physical_evidence) credSignals.push('Physical Evidence')

  var displayText = item.feed_hook || item.summary || ''
  var caseProfile = (item.metadata && item.metadata.case_profile) || null
  var isNDERF = item.source_type === 'nderf' || item.source_type === 'oberf'
  var expandedText = item.paradocs_narrative || (isLinkOnly(item.source_type) ? '' : item.summary) || ''

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

      {/* Meta strip: location \u00B7 date \u00B7 source */}
      <p className="text-[11px] text-gray-500 font-sans">
        {metaParts.join(' \u00B7 ')}
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

          {/* Paradocs Analysis \u2014 our own longer analytical take */}
          {expandedText ? (
            <p className="text-sm text-gray-400 leading-relaxed font-sans">
              {expandedText}
            </p>
          ) : (
            <p className="text-sm text-gray-500 italic leading-relaxed font-sans">
              {'Analysis coming soon. View the full report for source details.'}
            </p>
          )}

          {/* NDERF Case Profile chips */}
          {isNDERF && caseProfile && (
            <CaseProfileChips profile={caseProfile} />
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
