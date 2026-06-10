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
import { FileText, Pen } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { formatLocationLabel } from '@/lib/format/location-label'
import CategoryIcon from '@/components/ui/CategoryIcon'
import type { PhenomenonCategory } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { deriveCaseProfile, nderfToCaseProfile, type CaseProfile } from '@/lib/caseProfile'
import SourceBadge from '@/components/SourceBadge'
import TodayCardShell from './TodayCardShell'
import InlineVideoPlayer from '@/components/video/InlineVideoPlayer'
import ThumbsFeedback from '@/components/feed/ThumbsFeedback'

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
  // V8 Tier 1 — anchor-case fields. anchor_case_hook is the new lead
  // (replaces feed_hook on the card when present). The three signal
  // chips are derived from anchor_when/where/witness. unresolved_tension
  // is the one-line contested-point line below the body.
  anchor_case_hook: string | null
  anchor_when: string | null
  anchor_where: string | null
  anchor_witness: string | null
  unresolved_tension: string | null
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
  // V9.0 — Anchor case fields parallel to PhenomenonItem.
  anchor_case_hook: string | null
  anchor_when: string | null
  anchor_where: string | null
  anchor_witness: string | null
  unresolved_tension: string | null
  category: string
  country: string | null
  city: string | null
  state_province: string | null
  event_date: string | null
  event_date_precision: string | null
  credibility: string | null
  upvotes: number
  // V11.17.38 — denormalized downvotes column on reports.
  // Surfaced inline via ThumbsFeedback so users see the dissent
  // count alongside the agreement count, not just an icon.
  downvotes?: number
  view_count: number
  comment_count: number
  has_photo_video: boolean
  has_physical_evidence: boolean
  // Panel-feedback (May 2026 — 3rd round): video pipeline integration.
  // When the report has an approved user-submitted video, has_video is
  // true and the `video` payload carries a signed playback URL +
  // transcript segments for inline rendering.
  has_video?: boolean | null
  video?: {
    video_id: string
    playback_url: string | null
    /** V10.7.E.7 — optional poster JPEG (sibling .jpg in Storage). */
    poster_url?: string | null
    segments: any[] | null
    duration_sec: number | null
    transcript_lang: string | null
  } | null
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
  perception_sensory: '#ffcc80',
  religion_mythology: '#fff176',
  esoteric_practices: '#f48fb1',
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

/**
 * Panel-feedback (May 2026 — 7th round): phenomenon cards are
 * category indexes, not case studies. New CTA leads to the filtered
 * /explore view rather than expanding an in-place "case". Used by
 * PhenomenonCard. Includes the live report_count so the card feels
 * like a portal to a living archive, not a static entry.
 */
export function ExplorePhenomenonButton(props: {
  slug: string
  category: string
  count: number
  label?: string
}) {
  var href = '/explore?category=' + encodeURIComponent(props.category)
  if (props.slug) href += '&phenomenon=' + encodeURIComponent(props.slug)
  var count = props.count || 0
  var label = props.label || (count > 0
    ? 'Explore ' + count.toLocaleString() + ' ' + (count === 1 ? 'case' : 'cases')
    : 'Explore cases')
  return (
    <Link
      href={href}
      onClick={function (e) { e.stopPropagation() }}
      className="inline-flex items-center justify-center gap-2 w-full px-5 py-3.5 rounded-full bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors"
    >
      <Pen className="w-4 h-4" />
      {label} →
    </Link>
  )
}

export function ReadCaseButton(props: { onExpand: () => void; label?: string }) {
  // V9.0: optional `label` prop lets each card type provide its own
  // verb (e.g. 'Read the Account' for reports, 'Read the Analysis'
  // for editorials). Defaults to the original phenomenon verb.
  var labelText = props.label || 'Read Case'
  return (
    <button
      onClick={props.onExpand}
      className="w-full md:w-auto md:px-8 py-2.5 md:py-3 rounded-lg border border-white/10 bg-white/[0.03] text-gray-400 text-xs md:text-sm font-sans font-medium uppercase tracking-widest hover:bg-white/[0.06] hover:text-gray-300 transition-colors flex-shrink-0 cursor-pointer"
    >
      {'\u25BC ' + labelText}
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
  isAnonymous?: boolean
  signInNudgeDismissed?: boolean
  onSignInNudgeDismiss?: () => void
}) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'
  var qf = item.ai_quick_facts

  // Build case type badge parts.
  // V11.17.38 — the badge year previously read from `first_reported_date`,
  // which is the phenomenon's historical earliest documented case (1798
  // for Poltergeist), but the card BODY describes a specific anchor case
  // from a different year (1977 Enfield). The two dates jarred against
  // each other ("GHOSTS & HAUNTINGS · 1798" header above a 1977 Enfield
  // story). Chase flagged this as a systemic header-vs-body inconsistency.
  // Fix: prefer the year of the anchor case being shown (anchor_when),
  // fall back to first_reported_date only when no anchor is set. The
  // phenomenon's historical first stays available on the detail page
  // where it has room to be properly contextualized.
  var badgeParts: string[] = []
  badgeParts.push(config?.label || item.category)
  // V11.17.41 — Year removed from the phenomenon spotlight top-line
  // badge per operator review. The V11.17.38 fix had the badge prefer
  // anchor_when over first_reported_date, which solved the "header
  // year vs body year" mismatch on phens with curated anchor cases.
  // But ~36% of active phens (238/655) still carry a wrong
  // first_reported_date from the original AI-generated phenomenon
  // batch (e.g. CE2 first_reported_date=1886, which predates Hynek's
  // CE classification by 86 years). Rather than try to clean all 238
  // dates with a Haiku sweep, we just stop surfacing any year on the
  // top line — the anchor case year is already prominent in the body
  // text and the WHEN row, where context (month, place) makes the
  // year self-evident. Top line becomes category · region.
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
  // V8 Tier 1 — anchor_case_hook is the new headline lead when present
  // (cold-open story: year + place + anonymized witness + twist).
  // Falls back to feed_hook (V6) → ai_summary for phenomena that
  // haven't been swept by the anchor-case generator yet.
  // Sentinel values starting with '__' (e.g. '__NEEDS_REVIEW__',
  // '__INACTIVE_TEMPLATE__') are catalog-management markers and must
  // never reach the user — guard treats them as absent for both the
  // headline and the chip strip.
  var anchorIsSentinel = !!item.anchor_case_hook
    && item.anchor_case_hook.length >= 2
    && item.anchor_case_hook.substring(0, 2) === '__'
  var effectiveAnchor = anchorIsSentinel ? null : item.anchor_case_hook
  var displayText = effectiveAnchor || item.feed_hook || item.ai_summary || ''

  // V9.1 — WHEN / WHERE / WHO labeled facts. Panel verdict (3.5/6) on
  // chips vs labeled lines: chips were breaking when values exceeded
  // ~2 words ("Captain and four officers, HMS Daedalus" wrapping inside
  // a pill). Labels add editorial gravitas (case-file framing) and
  // proper a11y semantics. WHO chosen over WITNESS so the parallel is
  // WHEN/WHERE/WHO — also avoids "WITNESS · 47 witnesses" doubling.
  var anchorFacts: { label: string; value: string }[] = []
  if (!anchorIsSentinel) {
    if (item.anchor_when) anchorFacts.push({ label: 'When', value: item.anchor_when })
    if (item.anchor_where) anchorFacts.push({ label: 'Where', value: item.anchor_where })
    if (item.anchor_witness) anchorFacts.push({ label: 'Who', value: item.anchor_witness })
  }

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
      isAnonymous={props.isAnonymous}
      signInNudgeDismissed={props.signInNudgeDismissed}
      onSignInNudgeDismiss={props.onSignInNudgeDismiss}
      whyReason={props.whyReason || null}
      cta={
        // Panel-feedback (May 2026 — 7th round): phenomenon cards
        // are category indexes, not case studies. CTA leads to the
        // filtered explore view with the live report count baked in
        // so it feels like a portal to a living archive.
        <ExplorePhenomenonButton
          slug={item.slug}
          category={item.category}
          count={item.report_count}
        />
      }
    >
      <div role="article" aria-label={'Phenomenon spotlight: ' + (item.name || 'Phenomenon')} className="flex flex-col gap-3 md:gap-4 pt-1">
        {/* Panel-feedback (May 2026 — 7th round): kicker that signals
            "this is a category portal, not a single case." Reduces
            misreads where users tap expecting a story and find a
            taxonomy entry. */}
        <div className="inline-flex items-center gap-2 self-start px-2.5 py-1 rounded-full bg-primary-500/15 border border-primary-500/30 text-primary-300">
          <span className="text-[9px] font-semibold uppercase tracking-widest">
            {/* V11.18.16 — final founder call. V11.18.15 trimmed the
                eyebrow to single-word "PHENOMENA" to match the tab/URL
                slug, but founder wants the editorial pairing back: the
                plural noun ("PHENOMENA", aligning with the tab) plus
                the descriptor SPOTLIGHT. So the final string is
                "PHENOMENA SPOTLIGHT" — plural form of the V11.17.41
                "PHENOMENON SPOTLIGHT" label. The aria-label and the
                internal "Phenomenon spotlight" comments still describe
                the variant's semantic name, not user-visible copy. */}
            Phenomena Spotlight
          </span>
        </div>

        {/* Element 1 — Badge row (category + year + region, optional trending). */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[10px] md:text-xs font-semibold uppercase tracking-widest text-gray-100">
            <span className="inline-flex items-center" style={{ color: catColor }}>
              <CategoryIcon category={item.category as PhenomenonCategory} size={12} />
            </span>
            <span>{badgeParts.join(' · ')}</span>
          </span>
          {item.report_count > 20 && (
            <span className="text-[9px] bg-primary-500/15 text-primary-400 px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">
              trending
            </span>
          )}
          {item.report_count > 0 && (
            <span className="text-[10px] text-gray-400 ml-auto">
              {item.report_count.toLocaleString()} {item.report_count === 1 ? 'case' : 'cases'} archived
            </span>
          )}
        </div>

        {/* V8.1.1 — Phenomenon name kicker. Panel consensus 3-0: place
            the name as a kicker between the category badge and the
            hook headline (Editorial Director, Mobile UX Lead, Visual
            Designer all explicitly recommended top placement).
            - Smaller than headline so it doesn't compete (Visual
              Designer's note).
            - Primary purple for visibility against dark hero scrim.
            - Uppercase tracking for kicker convention (Apple News /
              NYT pattern).
            - Tappable → /phenomena/{slug} (IA's note about making the
              name a navigation anchor, not just a label). */}
        {item.name && !props.expanded && (
          <Link
            href={'/phenomena/' + item.slug}
            onClick={function (e) { e.stopPropagation() }}
            className="inline-block self-start text-[18px] sm:text-[20px] md:text-[22px] font-display font-bold uppercase tracking-[0.18em] text-primary-400 hover:text-primary-300 transition-colors -mt-1 leading-tight"
          >
            {item.name}
          </Link>
        )}

        {/* Element 2 — Headline (tap to expand). V8 Tier 1.2: line clamp
            bumped from 4→5 (hero) and 6→7 (no hero) so the new cold-open
            anchor hooks aren't truncated mid-clause with "—..." after
            the source list. */}
        <h2
          onClick={!props.expanded ? props.onExpand : undefined}
          className={'font-display font-bold text-white leading-snug ' + (props.expanded ? 'text-xl md:text-2xl' : 'text-lg sm:text-xl md:text-2xl lg:text-[1.7rem] cursor-pointer today-headline-hover')}
          style={!props.expanded ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: hasHero ? 5 : 7, overflow: 'hidden' } : undefined}
        >
          {displayText || item.name}
        </h2>

        {/* V9.1 — WHEN / WHERE / WHO labeled facts. Replaces V8 chip
            strip. Uses semantic <dl><dt><dd> for assistive tech.
            Uppercase label kicker matches the phenomenon-name kicker
            treatment for visual coherence. */}
        {anchorFacts.length > 0 && (
          <dl className="flex flex-col gap-1">
            {anchorFacts.map(function (fact, ci) {
              return (
                <div key={'anchor-fact-' + ci} className="flex items-baseline gap-2 text-[13px] leading-snug">
                  <dt className="text-[10px] font-sans font-semibold uppercase tracking-widest text-gray-500 shrink-0 min-w-[3rem]">
                    {fact.label}
                  </dt>
                  <span aria-hidden="true" className="text-gray-700 shrink-0 text-[10px]">{'·'}</span>
                  <dd className="text-gray-200 font-sans">{fact.value}</dd>
                </div>
              )
            })}
          </dl>
        )}

        {/* V8 Tier 1 — "The unresolved part" line. Italic, slightly
            dimmed, sits between the headline and any body excerpt.
            Closes the curiosity gap that the hook opens. Suppressed
            when anchor field is a sentinel (no anchor case to tension
            against). */}
        {!props.expanded && !anchorIsSentinel && item.unresolved_tension && (
          <p className="text-[13px] italic font-sans text-gray-400 leading-relaxed border-l-2 border-white/15 pl-3">
            <span className="not-italic font-semibold text-gray-300 mr-1">{'The unresolved part:'}</span>
            {item.unresolved_tension}
          </p>
        )}

        {/* Element — Body excerpt (collapsed) or full expanded view.
            V8 Tier 1.2: when an anchor_case_hook is present, the hook
            and unresolved-tension lines already do the editorial job
            of the collapsed card. Showing the encyclopedic ai_summary
            below them is redundant ("Angels are spiritual beings
            described across major world religions..." restates what
            the headline already said). The summary moves to the
            expanded view only — tap READ CASE to see the full
            encyclopedic context. */}
        {!props.expanded ? (
          (!effectiveAnchor && item.ai_summary && item.ai_summary !== displayText) ? (
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
  isAnonymous?: boolean
  signInNudgeDismissed?: boolean
  onSignInNudgeDismiss?: () => void
}) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'

  // V10.8.J — canonical location label (handles city/state/country
  // dedup so "Kansas, Kansas" can never render).
  var hasLocation = !!(item.city || item.state_province || item.country || item.location_name)
  var locationStr = formatLocationLabel(item, { maxParts: 3 }) || ''

  // V11.17.41 — Badge parts simplified to category · location. Year
  // removed from the top line per operator review for cross-card-type
  // consistency with the phenomenon spotlight (which dropped the year
  // because 238 phens carry bogus first_reported_date). Even on report
  // cards where event_date is per-report data, dropping the year
  // prevents any future class of misleading-year render. The event
  // date still surfaces below in the meta strip (formatReportDate with
  // precision context) and on the report page itself.
  var badgeParts: string[] = []
  badgeParts.push(config?.label || item.category)
  if (locationStr) badgeParts.push(locationStr.length > 20 ? locationStr.substring(0, 18) + '\u2026' : locationStr)

  // Meta strip now carries: location (or Unknown), formatted date, source label, type
  var metaParts: string[] = []
  metaParts.push(locationStr || 'Unknown location')
  var prettyDate = formatReportDate(item.event_date, item.event_date_precision)
  if (prettyDate) metaParts.push(prettyDate)
  // V11.14.7 — Source label (r/X) removed from feed card meta row.
  // Subreddit detail still surfaces on the report page itself.
  if (item.phenomenon_type) metaParts.push(item.phenomenon_type.name)

  // Credibility pills (Low/Medium/High credibility labels are intentionally
  // NOT surfaced in the UI anymore — QA/QC Apr 15 2026. See ReportCard.tsx
  // for the same decision on the list-style card.)
  var credSignals: string[] = []
  if (item.has_physical_evidence) credSignals.push('Physical Evidence')

  var hasHero = !!item.associated_image_url
  // V9.0 — anchor_case_hook is the new headline lead when present
  // (cold-open story: date + place + anonymized witness + twist).
  // Falls back to feed_hook → summary → title.
  // Sentinel values starting with '__' are catalog-management markers
  // and never reach the user.
  var anchorIsSentinel = !!item.anchor_case_hook
    && item.anchor_case_hook.length >= 2
    && item.anchor_case_hook.substring(0, 2) === '__'
  var effectiveAnchor = anchorIsSentinel ? null : item.anchor_case_hook
  var displayText = effectiveAnchor || item.feed_hook || item.summary || ''

  // V9.1 — Labeled facts (was V9.0 chips). See PhenomenonCard for rationale.
  var anchorFacts: { label: string; value: string }[] = []
  if (!anchorIsSentinel) {
    if (item.anchor_when) anchorFacts.push({ label: 'When', value: item.anchor_when })
    if (item.anchor_where) anchorFacts.push({ label: 'Where', value: item.anchor_where })
    if (item.anchor_witness) anchorFacts.push({ label: 'Who', value: item.anchor_witness })
  }

  // V11.14.7 — Source-stripped kicker. Earlier versions surfaced the
  // subreddit (e.g. "EYEWITNESS · r/GHOSTS") on Today feed cards;
  // Chase removed this to keep the feed surface clean. Source detail
  // still appears on the report page itself for users who want to
  // verify provenance.
  var isEditorial = item.source_type === 'editorial' || item.source_type === 'curated'
  var kickerLabel: string
  var KickerIcon: typeof FileText
  if (isEditorial) {
    kickerLabel = 'ANALYSIS'
    KickerIcon = Pen
  } else {
    kickerLabel = 'EYEWITNESS'
    KickerIcon = FileText
  }

  // CTA verb varies by type per panel recommendation.
  var ctaVerb = isEditorial ? 'Read the Analysis' : 'Read the Account'

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
      isAnonymous={props.isAnonymous}
      signInNudgeDismissed={props.signInNudgeDismissed}
      onSignInNudgeDismiss={props.onSignInNudgeDismiss}
      whyReason={props.whyReason || null}
      cta={
        !props.expanded ? (
          <ReadCaseButton onExpand={props.onExpand} label={ctaVerb} />
        ) : (
          <CollapseButton onCollapse={props.onCollapse || function () {}} />
        )
      }
    >
      <div role="article" aria-label={(isEditorial ? 'Editorial: ' : 'Eyewitness report: ') + (item.title || 'Untitled')} className="flex flex-col gap-3 md:gap-4 pt-1">
        {/* Panel-feedback (May 2026 — 3rd round): when the report has
            an approved video, render an inline lazy-loaded vertical
            player above the badge row. The feed-v2 endpoint joins
            report_videos for has_video=true rows and includes signed
            playback URL + transcript segments. */}
        {item.has_video && item.video?.playback_url && (
          <div className="-mx-1 mb-1">
            <InlineVideoPlayer
              reportId={item.id}
              videoId={item.video.video_id}
              playbackUrl={item.video.playback_url}
              segments={item.video.segments || null}
              className="max-w-[300px] mx-auto"
            />
          </div>
        )}

        {/* Element 1 — Badge row (category · year · location-trim) +
            Tier 2 personalization thumbs. Badge on left, thumbs on
            right. Authed users vote → feed-personalization service
            picks the signal up on next /feed-v2 fetch. */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[10px] md:text-xs font-semibold uppercase tracking-widest text-gray-100">
            <span className="inline-flex items-center" style={{ color: catColor }}>
              <CategoryIcon category={item.category as PhenomenonCategory} size={12} />
            </span>
            <span>{badgeParts.join(' · ')}</span>
          </span>
          {props.user && (
            <ThumbsFeedback
              reportId={item.id}
              category={item.category}
              upvotes={item.upvotes || 0}
              downvotes={typeof item.downvotes === 'number' ? item.downvotes : 0}
              onUnauthed={function () { props.onShowSignup && props.onShowSignup(true) }}
            />
          )}
        </div>

        {/* V9.0 — Type kicker (EYEWITNESS · BFRO / ANALYSIS · PARADOCS).
            Same primary-purple styling as phenomena's name kicker but
            with a small lucide-react icon to differentiate type at a
            200ms glance. Tappable to /report/{slug}. */}
        {!props.expanded && (
          <Link
            href={'/report/' + item.slug}
            onClick={function (e) { e.stopPropagation() }}
            className="inline-flex items-center gap-1.5 self-start text-[14px] sm:text-[16px] md:text-[18px] font-display font-bold uppercase tracking-[0.18em] text-primary-400 hover:text-primary-300 transition-colors -mt-1 leading-tight"
          >
            <KickerIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={2.4} />
            <span>{kickerLabel}</span>
          </Link>
        )}

        {/* Element 2 — Headline (tap to expand) */}
        <h2
          onClick={!props.expanded ? props.onExpand : undefined}
          className={'font-display font-bold text-white leading-snug ' + (props.expanded ? 'text-xl md:text-2xl' : 'text-lg sm:text-xl md:text-2xl lg:text-[1.7rem] cursor-pointer today-headline-hover')}
          style={!props.expanded ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: hasHero ? 5 : 7, overflow: 'hidden' } : undefined}
        >
          {displayText || item.title}
        </h2>

        {/* V9.1 — WHEN / WHERE / WHO labeled facts. */}
        {anchorFacts.length > 0 && (
          <dl className="flex flex-col gap-1">
            {anchorFacts.map(function (fact, ci) {
              return (
                <div key={'report-anchor-fact-' + ci} className="flex items-baseline gap-2 text-[13px] leading-snug">
                  <dt className="text-[10px] font-sans font-semibold uppercase tracking-widest text-gray-500 shrink-0 min-w-[3rem]">
                    {fact.label}
                  </dt>
                  <span aria-hidden="true" className="text-gray-700 shrink-0 text-[10px]">{'·'}</span>
                  <dd className="text-gray-200 font-sans">{fact.value}</dd>
                </div>
              )
            })}
          </dl>
        )}

        {/* Evidence pill — kept as a pill since it's a flag, not a fact */}
        {item.has_physical_evidence && (
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-sans font-medium bg-amber-500/15 border border-amber-400/30 text-amber-300">
              Physical Evidence
            </span>
          </div>
        )}

        {/* V9.0 — "The unresolved part" line. Same treatment as phenomena. */}
        {!props.expanded && !anchorIsSentinel && item.unresolved_tension && (
          <p className="text-[13px] italic font-sans text-gray-400 leading-relaxed border-l-2 border-white/15 pl-3">
            <span className="not-italic font-semibold text-gray-300 mr-1">{'The unresolved part:'}</span>
            {item.unresolved_tension}
          </p>
        )}

        {/* Element 5 — Body excerpt (collapsed) or expanded analysis.
            V9.0: when an anchor_case_hook is present, the hook + tension
            already carry the load — suppress the redundant body excerpt
            on the collapsed view. The full narrative shows on expand. */}
        {!props.expanded ? (
          (!effectiveAnchor && item.summary) ? (
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
              {(isEditorial ? 'View Full Analysis' : 'View Full Report') + ' →'}
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
  isAnonymous?: boolean
  signInNudgeDismissed?: boolean
  onSignInNudgeDismiss?: () => void
}) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'

  var locationParts: string[] = []
  if (item.city) locationParts.push(item.city)
  if (item.state_province) locationParts.push(item.state_province)
  if (item.country) locationParts.push(item.country)
  var locationStr = locationParts.join(', ')

  // V11.17.41 — Year removed from badge per operator review (see the
  // PhenomenonSpotlight equivalent above for the rationale + history).
  // Top line is now category · location. The event date still surfaces
  // below in the meta strip with precision context and on the report
  // page itself.
  var badgeParts: string[] = []
  badgeParts.push(config?.label || item.category)
  if (locationStr) badgeParts.push(locationStr.length > 20 ? locationStr.substring(0, 18) + '\u2026' : locationStr)

  var metaParts: string[] = []
  metaParts.push(locationStr || 'Unknown location')
  var prettyDate = formatReportDate(item.event_date, item.event_date_precision)
  if (prettyDate) metaParts.push(prettyDate)
  if (item.source_label) metaParts.push(item.source_label)

  // V9.0 — anchor case fields drive the new layout.
  var anchorIsSentinel = !!item.anchor_case_hook
    && item.anchor_case_hook.length >= 2
    && item.anchor_case_hook.substring(0, 2) === '__'
  var effectiveAnchor = anchorIsSentinel ? null : item.anchor_case_hook

  var hasHero = !!(item.primary_media && (item.primary_media.thumbnail_url || item.primary_media.url)) || !!item.associated_image_url
  var displayText = effectiveAnchor || item.feed_hook || item.summary || ''

  var anchorFacts: { label: string; value: string }[] = []
  if (!anchorIsSentinel) {
    if (item.anchor_when) anchorFacts.push({ label: 'When', value: item.anchor_when })
    if (item.anchor_where) anchorFacts.push({ label: 'Where', value: item.anchor_where })
    if (item.anchor_witness) anchorFacts.push({ label: 'Who', value: item.anchor_witness })
  }

  var isEditorial = item.source_type === 'editorial' || item.source_type === 'curated'
  var kickerLabel: string
  var KickerIcon: typeof FileText
  if (isEditorial) {
    kickerLabel = 'ANALYSIS · ' + (item.source_label || 'PARADOCS').toUpperCase()
    KickerIcon = Pen
  } else {
    kickerLabel = 'EYEWITNESS · ' + (item.source_label || 'REPORT').toUpperCase()
    KickerIcon = FileText
  }
  var ctaVerb = isEditorial ? 'Read the Analysis' : 'Read the Account'

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
      isAnonymous={props.isAnonymous}
      signInNudgeDismissed={props.signInNudgeDismissed}
      onSignInNudgeDismiss={props.onSignInNudgeDismiss}
      whyReason={props.whyReason || null}
      cta={
        !props.expanded ? (
          <ReadCaseButton onExpand={props.onExpand} label={ctaVerb} />
        ) : (
          <CollapseButton onCollapse={props.onCollapse || function () {}} />
        )
      }
    >
      <div role="article" aria-label={(isEditorial ? 'Editorial: ' : 'Eyewitness report with media: ') + (item.title || 'Untitled')} className="flex flex-col gap-3 md:gap-4 pt-1">
        {/* Panel-feedback (May 2026 — 4th round): inline video player
            when has_video=true. Same render as the TextReportCard
            branch. */}
        {item.has_video && item.video?.playback_url && (
          <div className="-mx-1 mb-1">
            <InlineVideoPlayer
              reportId={item.id}
              videoId={item.video.video_id}
              playbackUrl={item.video.playback_url}
              segments={item.video.segments || null}
              className="max-w-[300px] mx-auto"
            />
          </div>
        )}

        {/* Element 1 — Badge row + amber Evidence pill + Tier 2 thumbs */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[10px] md:text-xs font-semibold uppercase tracking-widest text-gray-100">
              <span className="inline-flex items-center" style={{ color: catColor }}>
                <CategoryIcon category={item.category as PhenomenonCategory} size={12} />
              </span>
              <span>{badgeParts.join(' · ')}</span>
            </span>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-sans font-semibold uppercase tracking-wider">
              Evidence
            </span>
          </div>
          {props.user && (
            <ThumbsFeedback
              reportId={item.id}
              category={item.category}
              upvotes={item.upvotes || 0}
              downvotes={typeof item.downvotes === 'number' ? item.downvotes : 0}
              onUnauthed={function () { props.onShowSignup && props.onShowSignup(true) }}
            />
          )}
        </div>

        {/* V9.0 — Type kicker (EYEWITNESS · {source} / ANALYSIS · PARADOCS) */}
        {!props.expanded && (
          <Link
            href={'/report/' + item.slug}
            onClick={function (e) { e.stopPropagation() }}
            className="inline-flex items-center gap-1.5 self-start text-[14px] sm:text-[16px] md:text-[18px] font-display font-bold uppercase tracking-[0.18em] text-primary-400 hover:text-primary-300 transition-colors -mt-1 leading-tight"
          >
            <KickerIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={2.4} />
            <span>{kickerLabel}</span>
          </Link>
        )}

        {/* Element 2 — Headline (tap to expand) */}
        <h2
          onClick={!props.expanded ? props.onExpand : undefined}
          className={'font-display font-bold text-white leading-snug ' + (props.expanded ? 'text-xl md:text-2xl' : 'text-lg sm:text-xl md:text-2xl lg:text-[1.7rem] cursor-pointer today-headline-hover')}
          style={!props.expanded ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: hasHero ? 5 : 7, overflow: 'hidden' } : undefined}
        >
          {displayText || item.title}
        </h2>

        {/* V9.1 — WHEN / WHERE / WHO labeled facts. */}
        {anchorFacts.length > 0 && (
          <dl className="flex flex-col gap-1">
            {anchorFacts.map(function (fact, ci) {
              return (
                <div key={'media-anchor-fact-' + ci} className="flex items-baseline gap-2 text-[13px] leading-snug">
                  <dt className="text-[10px] font-sans font-semibold uppercase tracking-widest text-gray-500 shrink-0 min-w-[3rem]">
                    {fact.label}
                  </dt>
                  <span aria-hidden="true" className="text-gray-700 shrink-0 text-[10px]">{'·'}</span>
                  <dd className="text-gray-200 font-sans">{fact.value}</dd>
                </div>
              )
            })}
          </dl>
        )}

        {/* Evidence pills — kept as pills since they're flags, not facts */}
        {(item.has_photo_video || item.has_physical_evidence) && (
          <div className="flex flex-wrap gap-1.5">
            {item.has_photo_video && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-sans font-medium bg-amber-500/15 border border-amber-400/30 text-amber-300">
                Photo/Video
              </span>
            )}
            {item.has_physical_evidence && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-sans font-medium bg-amber-500/15 border border-amber-400/30 text-amber-300">
                Physical Evidence
              </span>
            )}
          </div>
        )}

        {/* V9.0 — Unresolved tension line */}
        {!props.expanded && !anchorIsSentinel && item.unresolved_tension && (
          <p className="text-[13px] italic font-sans text-gray-400 leading-relaxed border-l-2 border-white/15 pl-3">
            <span className="not-italic font-semibold text-gray-300 mr-1">{'The unresolved part:'}</span>
            {item.unresolved_tension}
          </p>
        )}

        {/* Element 5 — Body excerpt (when no anchor) or expanded view */}
        {!props.expanded ? (
          (!effectiveAnchor && item.summary) ? (
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
              {(isEditorial ? 'View Full Analysis' : 'View Full Report') + ' →'}
            </Link>
          </div>
        )}
      </div>
    </TodayCardShell>
  )
}
