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
 * Typography: Inter (font-sans) body, Changa (font-display) headings.
 * Colors: primary-500 (#9000F0) accent, gray-900 backgrounds.
 * Matches site-wide styling from tailwind.config + globals.css.
 *
 * SWC-compatible: var, function expressions, string concat only.
 */

import React, { useState } from 'react'
import Link from 'next/link'
import { CATEGORY_CONFIG } from '@/lib/constants'
import CategoryIcon from '@/components/ui/CategoryIcon'
import type { PhenomenonCategory } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { deriveCaseProfile, nderfToCaseProfile, type CaseProfile } from '@/lib/caseProfile'
import SourceBadge from '@/components/SourceBadge'
import TodayCardShell from './TodayCardShell'

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
//  Shared: sentence-boundary truncation
//  Truncates at the nearest sentence end (.) or comma after `min` chars,
//  falling back to a hard cut + ellipsis if none found before `max`.
//  Used everywhere a body excerpt is shown on a card to avoid mid-word
//  cutoffs like "spatiotempor..." (panel review V2 fix).
// =========================================================================
function truncateAtSentence(text: string, min: number = 100, max: number = 220): string {
  if (!text) return ''
  if (text.length <= max) return text
  var window = text.slice(0, max)
  // Prefer ". " over comma. Walk backward from max to find a sentence end.
  var lastPeriod = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '))
  if (lastPeriod > min) return text.slice(0, lastPeriod + 1)
  var lastComma = window.lastIndexOf(', ')
  if (lastComma > min) return text.slice(0, lastComma) + '\u2026'
  return window.trimEnd() + '\u2026'
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
  function truncate(s: string): string {
    if (!s) return ''
    if (s.length <= 60) return s
    return s.slice(0, 57) + '\u2026'
  }
  return (
    <div className="flex gap-1.5 md:gap-2 flex-wrap flex-shrink-0">
      {props.tags.map(function (tag, i) {
        return (
          <span
            key={i}
            title={tag}
            className="text-[10px] md:text-[11px] px-2.5 md:px-3 py-0.5 md:py-1 rounded-full border border-white/10 text-gray-300 font-sans font-medium max-w-full truncate"
          >
            {truncate(tag)}
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

export function ReadCaseButton(props: { onExpand: () => void }) {
  return (
    <button
      onClick={props.onExpand}
      className="w-full md:w-auto md:px-8 py-2.5 md:py-3 rounded-lg border border-white/10 bg-white/[0.03] text-gray-400 text-xs md:text-sm font-sans font-medium uppercase tracking-widest hover:bg-white/[0.06] hover:text-gray-300 transition-colors flex-shrink-0 cursor-pointer"
    >
      {'\u25BC Read Case'}
    </button>
  )
}

// Symmetric collapse affordance — panel review fix for "no way to collapse
// on mobile" finding. Replaces ReadCaseButton when card is expanded.
export function CollapseButton(props: { onCollapse: () => void }) {
  return (
    <button
      onClick={props.onCollapse}
      className="w-full md:w-auto md:px-8 py-2.5 md:py-3 rounded-lg border border-white/10 bg-white/[0.03] text-gray-400 text-xs md:text-sm font-sans font-medium uppercase tracking-widest hover:bg-white/[0.06] hover:text-gray-300 transition-colors flex-shrink-0 cursor-pointer"
      aria-expanded="true"
      aria-label="Collapse this case and return to the feed"
    >
      {'▲ Collapse'}
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

// Pick a neutral header label based on the experience type stored on the
// case profile. NDERF reports are all NDEs, but OBERF covers a range
// (OBE, UFO encounter, mystical experience, STE…) and calling those
// "NDE Case Profile" is factually wrong. When no specific type is
// available we fall back to the generic "Case Profile".
function caseProfileHeaderLabel(p: NDERFCaseProfile): string {
  var t = (p.ndeType || '').trim()
  if (!t) return 'Case Profile'
  var lower = t.toLowerCase()
  // Accept any variant that explicitly mentions NDE / near-death; otherwise
  // use "{Type} Case Profile" so e.g. "UFO Encounter" → "UFO Encounter Case Profile".
  if (lower.indexOf('near-death') !== -1 || lower.indexOf('near death') !== -1 || /\bnde\b/.test(lower)) {
    return 'NDE Case Profile'
  }
  return t + ' Case Profile'
}

// Accept either a legacy NDERFCaseProfile (for NDERF/OBERF back-compat)
// or a unified CaseProfile. Callers increasingly derive a unified profile
// via `deriveCaseProfile(report)` and pass that in directly, so every
// adapter (BFRO, NUFORC, Erowid, Reddit, etc.) gets the same profile box.
export function CaseProfileChips(props: {
  profile: NDERFCaseProfile | CaseProfile,
  variant?: 'compact' | 'full',
  sourceType?: string | null,
}) {
  var variant = props.variant || 'compact'

  // Normalise to unified shape. The `kind` + `headerLabel` fields identify
  // a unified CaseProfile; anything else we treat as legacy NDERF.
  var unified: CaseProfile
  var pAny = props.profile as any
  if (pAny && typeof pAny === 'object' && 'kind' in pAny && 'headerLabel' in pAny) {
    unified = pAny as CaseProfile
  } else {
    unified = nderfToCaseProfile(pAny as NDERFCaseProfile, props.sourceType || null)
  }

  var headerLabel = unified.headerLabel
  var identity = unified.facts
  var answeredPhenomena = unified.phenomena.filter(function (x) { return x.state !== 'unknown' })
  var emotionTokens = unified.emotions

  if (identity.length === 0 && answeredPhenomena.length === 0 && emotionTokens.length === 0) return null

  // Compact variant — used on the Discover feed (horizontal density priority)
  if (variant === 'compact') {
    var allChips: { label: string, value: string }[] = identity.slice()
    answeredPhenomena.forEach(function (ph) {
      allChips.push({ label: ph.label, value: ph.state === 'yes' ? 'Yes' : 'No' })
    })
    return (
      <div className="flex flex-col gap-2 py-3 px-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex-shrink-0">
        <span className="text-[9px] text-gray-600 font-sans uppercase tracking-wider">{headerLabel}</span>
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
          {headerLabel}
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
  onCollapse?: () => void
  user: any
  onShowSignup: (show: boolean) => void
  // V2 panel review additions
  isSaved?: boolean
  onSave?: () => void
  onShare?: () => void
  isTodaysLead?: boolean
  streakDays?: number
  whyReason?: string | null
  nextCatColor?: string | null
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

  // V8 Tier 0 — Pulled the credibility chip strip and the X REPORTS /
  // danger callouts from the front-of-card per panel review. The chips
  // were definitional ("Religious texts...", "Divine spiritual entity...")
  // — three pieces of UI doing the same job as the headline. The X
  // REPORTS callout was a number without context. The danger_level
  // ("Angels: HIGH DANGER") read like a video-game stat sheet,
  // damaging editorial credibility. Tier 1 will replace these with a
  // proper WHEN | WHERE | WHAT chip strip driven by anchor_case_*
  // fields. Until then: less is more.
  var credSignals: string[] = []
  var tensionItems: { value: string | number, label: string }[] = []

  var hasHero = !!item.primary_image_url
  var displayText = item.feed_hook || item.ai_summary || ''

  return (
    <TodayCardShell
      catColor={catColor}
      nextCatColor={props.nextCatColor || null}
      heroImageUrl={item.primary_image_url || null}
      heroImageAttribution={item.primary_image_url ? 'via Wikimedia' : null}
      isSaved={props.isSaved || false}
      onSave={props.onSave || function () {}}
      onShare={props.onShare}
      isTodaysLead={props.isTodaysLead}
      streakDays={props.streakDays}
      whyReason={props.whyReason || null}
      cta={
        !props.expanded ? (
          <ReadCaseButton onExpand={props.onExpand} />
        ) : (
          <CollapseButton onCollapse={props.onCollapse || function () {}} />
        )
      }
    >
      <div role="article" aria-label={'Encyclopedia entry: ' + (item.name || 'Phenomenon')} className="flex flex-col gap-3 md:gap-4 pt-1">
        {/* Element 1 — Badge row (category + year + region, optional trending) */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[10px] md:text-xs font-semibold uppercase tracking-widest" style={{ color: catColor }}>
            <CategoryIcon category={item.category as PhenomenonCategory} size={12} />
            {' ' + badgeParts.join(' · ')}
          </span>
          {item.report_count > 20 && (
            <span className="text-[9px] bg-primary-500/15 text-primary-400 px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">
              trending
            </span>
          )}
        </div>

        {/* Element 2 — Headline (tap to expand) */}
        <h2
          onClick={!props.expanded ? props.onExpand : undefined}
          className={'font-display font-bold text-white leading-snug ' + (props.expanded ? 'text-xl md:text-2xl' : 'text-lg sm:text-xl md:text-2xl lg:text-[1.7rem] cursor-pointer today-headline-hover')}
          style={!props.expanded ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: hasHero ? 4 : 6, overflow: 'hidden' } : undefined}
        >
          {displayText || item.name}
        </h2>

        {/* V8 Tier 0 — Chip strip + tension stat callout removed.
            Tier 1 will replace with a WHEN | WHERE | WHAT chip strip
            driven by the new anchor_case_* fields. */}

        {/* Element — Body excerpt (collapsed) or full expanded view */}
        {!props.expanded ? (
          item.ai_summary && item.ai_summary !== displayText ? (
            <p className="text-sm text-gray-300 leading-relaxed font-sans">
              {truncateAtSentence(item.ai_summary, 80, 200)}
            </p>
          ) : null
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            <p className="text-sm text-gray-300 leading-relaxed font-sans">
              {item.ai_description || item.ai_summary || 'No additional information available.'}
            </p>

            {qf && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-3 px-3 rounded-lg bg-white/[0.03] border border-white/[0.06] flex-shrink-0">
                {qf.first_documented && (
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 font-sans uppercase tracking-wider">First documented</span>
                    <span className="text-xs text-gray-200 font-sans">{qf.first_documented}</span>
                  </div>
                )}
                {qf.origin && (
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 font-sans uppercase tracking-wider">Origin</span>
                    <span className="text-xs text-gray-200 font-sans">{qf.origin}</span>
                  </div>
                )}
                {qf.typical_encounter && (
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 font-sans uppercase tracking-wider">Typical encounter</span>
                    <span className="text-xs text-gray-200 font-sans">{qf.typical_encounter}</span>
                  </div>
                )}
                {/* V8 Tier 0 — danger_level row deleted. Cultural footprint
                    may replace this in a later tier; for now nothing. */}
                {qf.notable_feature && (
                  <div className="flex flex-col col-span-2">
                    <span className="text-[9px] text-gray-500 font-sans uppercase tracking-wider">Notable feature</span>
                    <span className="text-xs text-gray-200 font-sans">{qf.notable_feature}</span>
                  </div>
                )}
              </div>
            )}

            {item.aliases && item.aliases.length > 0 && (
              <p className="text-[11px] text-gray-400 font-sans">
                {'Also known as: ' + item.aliases.slice(0, 4).join(', ')}
              </p>
            )}

            <Link
              href={'/phenomena/' + item.slug}
              className="inline-flex items-center gap-2 text-sm font-sans font-medium text-primary-400 hover:text-primary-300 transition-colors"
            >
              {'View Full Case →'}
            </Link>
          </div>
        )}
      </div>
    </TodayCardShell>
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
  onCollapse?: () => void
  user: any
  onShowSignup: (show: boolean) => void
  isSaved?: boolean
  onSave?: () => void
  onShare?: () => void
  isTodaysLead?: boolean
  streakDays?: number
  whyReason?: string | null
  nextCatColor?: string | null
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

  // Credibility pills (Low/Medium/High credibility labels are intentionally
  // NOT surfaced in the UI anymore — QA/QC Apr 15 2026. See ReportCard.tsx
  // for the same decision on the list-style card.)
  var credSignals: string[] = []
  if (item.has_physical_evidence) credSignals.push('Physical Evidence')

  var hasHero = !!item.associated_image_url
  var displayText = item.feed_hook || item.summary || ''
  // Universal case profile — falls back across every adapter (NDERF, OBERF,
  // BFRO, NUFORC, Erowid, Reddit, IANDS, Ghosts, …). Returns null when the
  // underlying metadata is too thin to render anything useful.
  var unifiedProfile = deriveCaseProfile({
    source_type: item.source_type,
    metadata: item.metadata,
    category: item.category,
    has_photo_video: item.has_photo_video,
    has_physical_evidence: item.has_physical_evidence,
    event_date: item.event_date,
    event_date_precision: item.event_date_precision,
    credibility: item.credibility,
  })
  // Expanded section text: paradocs_narrative (our own analytical take) is the goal.
  // Falls back to summary only for legacy curated sources where narrative is intentionally null.
  var expandedText = item.paradocs_narrative || (isLinkOnly(item.source_type) ? '' : item.summary) || ''

  // Stats
  var tensionItems: { value: string | number, label: string }[] = []
  if (item.upvotes > 0) tensionItems.push({ value: item.upvotes, label: 'upvotes' })
  if (item.view_count > 0) tensionItems.push({ value: item.view_count > 999 ? Math.round(item.view_count / 100) / 10 + 'k' : item.view_count, label: 'views' })
  if (item.comment_count > 0) tensionItems.push({ value: item.comment_count, label: 'comments' })

  return (
    <TodayCardShell
      catColor={catColor}
      nextCatColor={props.nextCatColor || null}
      heroImageUrl={item.associated_image_url || null}
      heroImageAttribution={item.associated_image_source ? 'via ' + item.associated_image_source : null}
      isSaved={props.isSaved || false}
      onSave={props.onSave || function () {}}
      onShare={props.onShare}
      isTodaysLead={props.isTodaysLead}
      streakDays={props.streakDays}
      whyReason={props.whyReason || null}
      cta={
        !props.expanded ? (
          <ReadCaseButton onExpand={props.onExpand} />
        ) : (
          <CollapseButton onCollapse={props.onCollapse || function () {}} />
        )
      }
    >
      <div role="article" aria-label={'Eyewitness report: ' + (item.title || 'Untitled')} className="flex flex-col gap-3 md:gap-4 pt-1">
        {/* Element 1 — Badge row (category · year · location-trim) */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[10px] md:text-xs font-semibold uppercase tracking-widest" style={{ color: catColor }}>
            <CategoryIcon category={item.category as PhenomenonCategory} size={12} />
            {' ' + badgeParts.join(' · ')}
          </span>
          {item.source_type && (
            <SourceBadge
              sourceType={item.source_type}
              sourceLabel={item.source_label || undefined}
              sourceUrl={(item as any).source_url || undefined}
              variant="compact"
            />
          )}
        </div>

        {/* Element 2 — Headline (tap to expand) */}
        <h2
          onClick={!props.expanded ? props.onExpand : undefined}
          className={'font-display font-bold text-white leading-snug ' + (props.expanded ? 'text-xl md:text-2xl' : 'text-lg sm:text-xl md:text-2xl lg:text-[1.7rem] cursor-pointer today-headline-hover')}
          style={!props.expanded ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: hasHero ? 4 : 6, overflow: 'hidden' } : undefined}
        >
          {displayText || item.title}
        </h2>

        {/* Element 3 — Chip strip (evidence signals) */}
        <CredibilityTags tags={credSignals} />

        {/* Element 4 — Optional 1-stat callout */}
        {!props.expanded && tensionItems.length > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-display font-bold" style={{ color: catColor }}>
              {tensionItems[0].value}
            </span>
            <span className="text-[10px] md:text-xs text-gray-400 font-sans uppercase tracking-wider">
              {tensionItems[0].label}
            </span>
          </div>
        )}

        {/* Element 5 — Body excerpt (sentence-boundary truncation) or expanded analysis */}
        {!props.expanded ? (
          item.summary ? (
            <p className="text-sm text-gray-300 leading-relaxed font-sans">
              {truncateAtSentence(item.summary, 80, 200)}
            </p>
          ) : null
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            {expandedText ? (
              <p className="text-sm text-gray-300 leading-relaxed font-sans">{expandedText}</p>
            ) : (
              <p className="text-sm text-gray-400 italic leading-relaxed font-sans">
                {'Analysis coming soon. View the full report for source details.'}
              </p>
            )}
            {unifiedProfile && <CaseProfileChips profile={unifiedProfile} sourceType={item.source_type} />}
            <Link
              href={'/report/' + item.slug}
              className="inline-flex items-center gap-2 text-sm font-sans font-medium text-primary-400 hover:text-primary-300 transition-colors"
            >
              {'View Full Report →'}
            </Link>
          </div>
        )}
      </div>
    </TodayCardShell>
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
  onCollapse?: () => void
  user: any
  onShowSignup: (show: boolean) => void
  isSaved?: boolean
  onSave?: () => void
  onShare?: () => void
  isTodaysLead?: boolean
  streakDays?: number
  whyReason?: string | null
  nextCatColor?: string | null
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

  // Low/Medium/High credibility labels are intentionally NOT surfaced in the
  // UI anymore (QA/QC Apr 15 2026). Evidence flags are still shown because
  // they are concrete, verifiable signals rather than coarse bucketing.
  var credSignals: string[] = []
  if (item.has_photo_video) credSignals.push('Photo/Video Evidence')
  if (item.has_physical_evidence) credSignals.push('Physical Evidence')

  var hasHero = !!(item.primary_media && (item.primary_media.thumbnail_url || item.primary_media.url)) || !!item.associated_image_url
  var displayText = item.feed_hook || item.summary || ''
  var unifiedProfile = deriveCaseProfile({
    source_type: item.source_type,
    metadata: item.metadata,
    category: item.category,
    has_photo_video: item.has_photo_video,
    has_physical_evidence: item.has_physical_evidence,
    event_date: item.event_date,
    event_date_precision: item.event_date_precision,
    credibility: item.credibility,
  })
  var expandedText = item.paradocs_narrative || (isLinkOnly(item.source_type) ? '' : item.summary) || ''

  var tensionItems: { value: string | number, label: string }[] = []
  if (item.upvotes > 0) tensionItems.push({ value: item.upvotes, label: 'upvotes' })
  if (item.view_count > 0) tensionItems.push({ value: item.view_count > 999 ? Math.round(item.view_count / 100) / 10 + 'k' : item.view_count, label: 'views' })

  return (
    <TodayCardShell
      catColor={catColor}
      nextCatColor={props.nextCatColor || null}
      heroImageUrl={item.primary_media?.thumbnail_url || item.primary_media?.url || item.associated_image_url || null}
      heroImageAttribution={item.source_label ? 'via ' + item.source_label : null}
      isSaved={props.isSaved || false}
      onSave={props.onSave || function () {}}
      onShare={props.onShare}
      isTodaysLead={props.isTodaysLead}
      streakDays={props.streakDays}
      whyReason={props.whyReason || null}
      cta={
        !props.expanded ? (
          <ReadCaseButton onExpand={props.onExpand} />
        ) : (
          <CollapseButton onCollapse={props.onCollapse || function () {}} />
        )
      }
    >
      <div role="article" aria-label={'Eyewitness report with media: ' + (item.title || 'Untitled')} className="flex flex-col gap-3 md:gap-4 pt-1">
        {/* Element 1 — Badge row + amber Evidence pill */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[10px] md:text-xs font-semibold uppercase tracking-widest" style={{ color: catColor }}>
            <CategoryIcon category={item.category as PhenomenonCategory} size={12} />
            {' ' + badgeParts.join(' · ')}
          </span>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-sans font-semibold uppercase tracking-wider">
            Evidence
          </span>
          {item.source_type && (
            <SourceBadge
              sourceType={item.source_type}
              sourceLabel={item.source_label || undefined}
              sourceUrl={(item as any).source_url || undefined}
              variant="compact"
            />
          )}
        </div>

        {/* Element 2 — Headline (tap to expand) */}
        <h2
          onClick={!props.expanded ? props.onExpand : undefined}
          className={'font-display font-bold text-white leading-snug ' + (props.expanded ? 'text-xl md:text-2xl' : 'text-lg sm:text-xl md:text-2xl lg:text-[1.7rem] cursor-pointer today-headline-hover')}
          style={!props.expanded ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: hasHero ? 4 : 6, overflow: 'hidden' } : undefined}
        >
          {displayText || item.title}
        </h2>

        {/* Element 3 — Chip strip */}
        <CredibilityTags tags={credSignals} />

        {/* Element 4 — Optional 1-stat callout */}
        {!props.expanded && tensionItems.length > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-display font-bold text-amber-400">
              {tensionItems[0].value}
            </span>
            <span className="text-[10px] md:text-xs text-gray-400 font-sans uppercase tracking-wider">
              {tensionItems[0].label}
            </span>
          </div>
        )}

        {/* Element 5 — Body excerpt or expanded view (with media thumbnail) */}
        {!props.expanded ? (
          item.summary ? (
            <p className="text-sm text-gray-300 leading-relaxed font-sans">
              {truncateAtSentence(item.summary, 80, 200)}
            </p>
          ) : null
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            {item.primary_media && (item.primary_media.thumbnail_url || item.primary_media.url) && (
              <div className="rounded-lg overflow-hidden flex-shrink-0">
                <img
                  src={item.primary_media.thumbnail_url || item.primary_media.url}
                  alt={item.primary_media.caption || ''}
                  className="w-full h-44 object-cover opacity-90"
                  referrerPolicy="no-referrer"
                />
                {item.primary_media.caption && (
                  <p className="text-[10px] text-gray-400 font-sans pt-1.5">{item.primary_media.caption}</p>
                )}
              </div>
            )}
            {expandedText ? (
              <p className="text-sm text-gray-300 leading-relaxed font-sans">{expandedText}</p>
            ) : (
              <p className="text-sm text-gray-400 italic leading-relaxed font-sans">
                {'Analysis coming soon. View the full report for source details.'}
              </p>
            )}
            {unifiedProfile && <CaseProfileChips profile={unifiedProfile} sourceType={item.source_type} />}
            <Link
              href={'/report/' + item.slug}
              className="inline-flex items-center gap-2 text-sm font-sans font-medium text-primary-400 hover:text-primary-300 transition-colors"
            >
              {'View Full Report →'}
            </Link>
          </div>
        )}
      </div>
    </TodayCardShell>
  )
}
