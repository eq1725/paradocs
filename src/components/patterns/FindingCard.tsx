'use client'

// V11.18.19 — Sprint 1G — FindingCard prose-first reorder + visual
// consistency with normal report cards.
//
// Per founder review (V11.18.19): the V11.18.18 Gaia voice rewrite
// landed the prose, but the layout still reads as data-first. Gaia
// readers don't care about percentages on the card — they want the
// qualitative finding stated plainly, and the data is for the click-
// down. Reorder:
//   - eyebrow → headline → INTERPRETIVE PROSE (the wow, leads the
//     read) → secondary data zone (collapsible "See the numbers" on
//     today_card / grid; hidden entirely on rail) → footer.
//   - drop the heavy brand-purple top + bottom hairlines on the
//     today_card variant — they read as ad-chrome rather than as a
//     documentary artifact. Subtle border + dark surface only, same
//     visual register as a normal report card. Left-edge brand-purple
//     accent retained at lower opacity as the only identifying mark.
//
// V11.18.2 — Sprint 1A polish — FindingCard
//
// Editorial / data-illustration redesign of the corpus-grounded Finding
// artifact (V2 roadmap §2.3). Same three variants:
//   - `rail`        — compact horizontal-rail unit (~300px wide) used by
//                     PatternsRail on /lab on mobile; ALSO used in the
//                     V11.18.19 PatternsRail desktop 2-col grid variant
//                     (sized to the cell rather than scrolled past).
//   - `grid`        — fills column on /lab/patterns static grid page; the
//                     full FindingCard with data zone available behind the
//                     "See the numbers" disclosure.
//   - `today_card`  — full-bleed swipe card sized for the Today feed,
//                     prose-led, data behind a collapsible disclosure.
//
// Visual register (founder pass — June 2026):
//   - Documentary / archival, not promotional. No exclamation, no spooky,
//     no playful gradients, no second-person body voice (the personalized
//     overlay slab is the one exception per V2 §2.3).
//   - V11.18.19 — Prose-led: the interpretive sentence is now the visual
//     anchor on every variant. The hero % + per-family bars + denominator
//     live behind a "See the numbers" disclosure on today_card and grid;
//     rail hides them entirely. This preserves data for researchers
//     without leading the card with it.
//   - Eyebrow is small-caps hairline-underlined, not a filled pill.
//   - Footer cites "Source: Paradocs Archive · NNN,NNN accounts"
//     with a thin vertical rule for gravitas.
//
// Copy fixes — Sprint 1A polish:
//   - Eyebrow label "Cross-Cutting Descriptor" -> "Across Phenomena"
//   - Family slug "perception-sensory" -> "Sleep Paralysis & Perception"
//   - Family slug "haunting" -> "Hauntings"
//   - Family slug "UFO" -> "UFO Sightings"
//   - Footer "From the catalogue · NNN accounts" -> "Source: Paradocs
//     Archive · NNN accounts"
//   - The denominator label string from the DB ("Across NNN accounts in
//     three phen families.") is replaced at render-time with a clean
//     "Across NNN documented accounts." (drops the "phen families"
//     vocabulary, which read database-y in founder testing).
//
// The personalized overlay ONLY renders when `user_overlay != null
// && matches >= 1`. Roadmap V2 §2.3 + R1 — fabricating an overlay is
// brand-cratering; the API endpoint is the source of truth.
//
// SWC: var + function() per repo convention.

import React from 'react'
import Link from 'next/link'
import {
  ArrowRight, ChevronDown, ChevronUp,
  Ghost, Eye, Brain, Sparkles, Atom, Moon, Footprints, Radio, Church,
  Circle, Share2, Check,
} from 'lucide-react'

export interface FindingFamilyBreakdown {
  family_slug: string
  family_label: string
  count: number
  total_in_family: number
  pct: number
}

export interface UserOverlay {
  matches: number
  total: number
  traits_matched: string[]
}

// V11.18.12 — Sprint 1E. The Today FindingCard substance zone now
// renders an excerpt slab — title + location + date + 2-3 sentence
// preview of the first representative report. The preview is fetched
// server-side at /api/lab/patterns/list (or in discover.tsx's
// getServerSideProps) so it lands on initial paint. Null when the
// Finding has no representative reports — the slab is then suppressed
// (the card never has a void; the headline + hero stat + bars + footer
// fill the viewport on their own).
export interface RepresentativeReportPreview {
  id: string
  slug: string
  title: string | null
  location_text: string | null
  event_date: string | null
  preview_text: string | null
  category: string | null
}

export interface Finding {
  id: string
  slug: string
  eyebrow_type:
    | 'cross_cutting_descriptor'
    | 'temporal'
    | 'geographic'
    | 'witness_pattern'
    | 'source_overlap'
    | 'sub_family_distribution'
  headline: string
  descriptor: string
  phen_families: FindingFamilyBreakdown[]
  denominator_n: number
  denominator_n_label: string
  interpretive_sentence: string
  representative_report_ids?: string[] | null
  // V11.18.12 — Sprint 1E. Substance-slab data for the today_card
  // variant. Optional + nullable because the rail / grid variants
  // don't render it, and because the catalogue may have rows with no
  // representative reports.
  representative_report_preview?: RepresentativeReportPreview | null
  user_overlay?: UserOverlay | null
}

type Variant = 'rail' | 'grid' | 'today_card'

interface FindingCardProps {
  finding: Finding
  variant?: Variant
  /**
   * Optional explicit href for the "See representative reports" footer
   * link. When omitted, defaults to the first representative report
   * when available; otherwise to /lab/patterns.
   */
  href?: string
  /** today_card variant uses this to play swipe-in animation. */
  isActive?: boolean
  /**
   * V11.18.19 — Sprint 1G. When true on the `rail` variant, the card
   * uses the desktop-grid shape — w-full + max-height + line-clamped
   * prose — so the same card body can ride either the mobile
   * horizontal scroll OR the desktop 2-column grid that PatternsRail
   * switches to at ≥1024px. Ignored on other variants.
   */
  desktopGrid?: boolean
}

// V11.18.2 — Sprint 1A polish. Eyebrow copy upgrade. Database stores
// `eyebrow_type` as a slug; we render natural-language labels here so
// the UI doesn't expose taxonomy vocabulary ("Cross-Cutting Descriptor"
// read database-y in founder testing). All copy is Helena-cleared.
var EYEBROW_LABEL: Record<Finding['eyebrow_type'], string> = {
  cross_cutting_descriptor: 'Across Phenomena',
  temporal: 'A Temporal Pattern',
  geographic: 'A Geographic Pattern',
  witness_pattern: 'A Witness Pattern',
  source_overlap: 'A Source Overlap',
  sub_family_distribution: 'Within a Phenomenon',
}

// V11.18.2 — Sprint 1A polish. Family-label upgrade map.
//
// The catalogue's `phen_families[].family_label` comes from
// `humanizeFamily()` in data-query-executor.ts, which returns short
// operator-facing strings like "perception-sensory", "haunting", "UFO".
// Those read as taxonomy jargon to common users. This map renders the
// editorial / natural-language form. Keys cover both the slug form and
// the humanizeFamily() output form so we tolerate either upstream.
// Unmapped labels fall through unchanged (defensive — never blank).
var FAMILY_LABEL_OVERRIDES: Record<string, string> = {
  // humanizeFamily() outputs (current DB content)
  'cryptid': 'Cryptid Encounters',
  'UFO': 'UFO Sightings',
  'haunting': 'Hauntings',
  'psychic': 'Psychic Phenomena',
  'esoteric': 'Esoteric Practices',
  'consciousness': 'Consciousness Practices',
  'perception-sensory': 'Sleep Paralysis & Perception',
  'psychological': 'Near-Death & Psychological',
  'religion/mythology': 'Religion & Mythology',
  // Raw category slugs (defensive — if upstream ever stores slugs)
  'cryptids': 'Cryptid Encounters',
  'ufos_aliens': 'UFO Sightings',
  'ghosts_hauntings': 'Hauntings',
  'psychic_phenomena': 'Psychic Phenomena',
  'esoteric_practices': 'Esoteric Practices',
  'consciousness_practices': 'Consciousness Practices',
  'perception_sensory': 'Sleep Paralysis & Perception',
  'psychological_experiences': 'Near-Death & Psychological',
  'religion_mythology': 'Religion & Mythology',
}

function prettyFamilyLabel(f: FindingFamilyBreakdown): string {
  // Prefer slug-keyed override (most stable), then label-keyed override,
  // then fall through to whatever the API returned (so we never render
  // blank).
  var bySlug = FAMILY_LABEL_OVERRIDES[f.family_slug]
  if (bySlug) return bySlug
  var byLabel = FAMILY_LABEL_OVERRIDES[f.family_label]
  if (byLabel) return byLabel
  return f.family_label || f.family_slug || ''
}

function resolveHref(finding: Finding, override?: string): string {
  if (override) return override
  // V11.18.8 — Sprint 1D fixes. Route the footer CTA to the per-Finding
  // detail page at /lab/patterns/[slug]. Sprint 1A–1C routed the CTA
  // to the first representative report (because the detail page did
  // not exist yet); Sprint 1D builds the click-down scholarly layer
  // and migrates all three card variants (rail, grid, today_card) to
  // route here. Representative reports are linked from within the
  // detail page, one click deeper, with title + location + date.
  //
  // CTA label updated from "See reports →" to "Read more →" — the
  // destination is a Finding detail page (prose + breakdown +
  // commentary), NOT a representative report. "See reports →" was
  // misleading per founder review; "Read more →" is two words, neutral,
  // documentary register, and accurately describes the destination
  // (more context, more data, more sources on the same Finding).
  if (finding && finding.slug) {
    return '/lab/patterns/' + encodeURIComponent(String(finding.slug))
  }
  // Defensive fallback if a Finding ever lacks a slug — link to the
  // grid index so the surface never produces a dead-end.
  return '/lab/patterns'
}

// Format big numerals with US grouping; the corpus is internationally
// sourced but the Helena style sheet asks for plain "12,420" not
// "12.420" / "12 420" / "12k".
function fmtInt(n: number): string {
  if (!isFinite(n)) return '0'
  return Math.round(n).toLocaleString('en-US')
}

// V11.18.12 — Sprint 1E. Editorial date format matched to the detail
// page (lab/patterns/[slug].tsx fmtDate): "Mar 14, 2003". Quiet, US-
// short, no relative time on the FindingCard substance slab — the
// reunion / shadow figure findings are inherently undated stretches,
// so "5 days ago" reads wrong; an absolute date reads documentary.
function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    var d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// V11.18.2 — Sprint 1A polish. The DB `denominator_n_label` reads
// "Across 142,116 accounts in three phen families." — the "phen
// families" tail is taxonomy jargon and was specifically flagged by
// the founder. Reformat at render time without a migration so existing
// rows look right immediately; future seeds should emit clean copy.
function prettyDenominatorLabel(f: Finding): string {
  return 'Across ' + fmtInt(f.denominator_n) + ' documented accounts.'
}

// Pick the largest family for hero treatment. Defensive against empty
// arrays (returns null and variants fall back to bar-only layout).
function pickHero(families: FindingFamilyBreakdown[]): FindingFamilyBreakdown | null {
  if (!Array.isArray(families) || families.length === 0) return null
  var best = families[0]
  for (var i = 1; i < families.length; i++) {
    if (families[i].pct > best.pct) best = families[i]
  }
  return best
}

// ─── Family icon set (Sprint 1C — right-side card affordance) ─────
//
// V11.18.6 — Sprint 1C. Founder feedback: "we could make more use of
// the blank space on the right side of the card." Per the Sprint 1C
// brief, three options were considered:
//   A. sparkline of count-over-time (real history needed)
//   B. condensed phenomenon-family icon set (this one)
//   C. mini histogram of category breakdown
//
// Picked B because:
//   - zero new data dependency (icons read from existing phen_families)
//   - fits documentary register (small, hairline-styled, no chart chrome)
//   - doesn't compete with the headline or the hero stat
//   - reinforces the cross-family scope (the whole point of a Finding)
//   - degrades gracefully when only two families are present
//
// Renders on `today_card` + `grid` variants. Skipped on `rail` — at
// 300px wide the rail card is too tight to share the top row with
// both the eyebrow and three icons; the brand-purple top hairline
// already does the "this is a Patterns artifact" work there.
//
// Mapping is intentionally short — each family gets one Lucide icon
// at 16px (today_card) or 14px (grid). Unmapped families fall back to
// a small empty Circle so the row never collapses or shows broken
// icons. The icons share the muted gray tone the secondary copy uses
// so they read as ambient context, not as an action affordance.
//
// Accessibility: the icon set is wrapped in a div with role="img"
// and an aria-label naming the three families ("Across Hauntings,
// UFO Sightings, Cryptid Encounters"); the icons themselves are
// aria-hidden. Screen readers read the label, not the SVGs.

// Type-loose to accept Lucide's ForwardRefExoticComponent shape without
// fighting LucideProps/SVG ref types — the consumer only ever passes
// `className` + `strokeWidth`, which all Lucide icons support.
type IconComponent = React.ComponentType<any>

var FAMILY_ICON_OVERRIDES: Record<string, IconComponent> = {
  // humanizeFamily() outputs
  'cryptid': Footprints,
  'UFO': Radio,
  'haunting': Ghost,
  'psychic': Sparkles,
  'esoteric': Sparkles,
  'consciousness': Brain,
  'perception-sensory': Moon,
  'psychological': Brain,
  'religion/mythology': Church,
  // Raw category slugs
  'cryptids': Footprints,
  'ufos_aliens': Radio,
  'ghosts_hauntings': Ghost,
  'psychic_phenomena': Sparkles,
  'esoteric_practices': Sparkles,
  'consciousness_practices': Brain,
  'perception_sensory': Moon,
  'psychological_experiences': Brain,
  'religion_mythology': Church,
}

function iconForFamily(f: FindingFamilyBreakdown): IconComponent {
  var bySlug = FAMILY_ICON_OVERRIDES[f.family_slug]
  if (bySlug) return bySlug
  var byLabel = FAMILY_ICON_OVERRIDES[f.family_label]
  if (byLabel) return byLabel
  // Fall back to a generic atomic-orbit icon for unmapped families.
  return Atom as unknown as IconComponent
}

function FamilyIconSet(props: { families: FindingFamilyBreakdown[]; variant: Variant }) {
  var fams = (props.families || []).slice(0, 3)
  if (fams.length === 0) return null
  var iconCls =
    props.variant === 'today_card'
      ? 'w-4 h-4 text-gray-400'
      : 'w-[14px] h-[14px] text-gray-400'
  var labels = fams.map(prettyFamilyLabel)
  var ariaLabel = 'Across ' + labels.join(', ')
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex items-center gap-1.5 shrink-0"
    >
      {fams.map(function (f, idx) {
        var Icon = iconForFamily(f)
        return (
          <span
            key={f.family_slug + '-' + idx}
            aria-hidden="true"
            title={prettyFamilyLabel(f)}
            className={
              'inline-flex items-center justify-center rounded-md border border-white/[0.08] ' +
              (props.variant === 'today_card'
                ? 'w-7 h-7 bg-white/[0.025]'
                : 'w-6 h-6 bg-white/[0.025]')
            }
          >
            {/* Fallback if icon resolution returned null/undefined. */}
            {Icon ? <Icon className={iconCls} strokeWidth={1.5} /> : <Circle className={iconCls} strokeWidth={1.5} />}
          </span>
        )
      })}
    </div>
  )
}

// ─── Eyebrow (small-caps, hairline-underlined) ───────────────────────

function Eyebrow(props: { type: Finding['eyebrow_type']; size?: 'sm' | 'md' }) {
  var sz = props.size || 'sm'
  var cls =
    'inline-block self-start uppercase font-sans font-semibold ' +
    'tracking-[0.22em] text-gray-300 ' +
    (sz === 'md' ? 'text-[11px] sm:text-[12px] ' : 'text-[10px] sm:text-[11px] ') +
    'pb-1.5 border-b border-white/[0.18]'
  return (
    <span className={cls} aria-label="Section label">
      {EYEBROW_LABEL[props.type]}
    </span>
  )
}

// ─── Footer citation (with Paradocs Archive wordmark + hairline rule) ─

function FooterCitation(props: { denominator_n: number; variant: Variant }) {
  var v = props.variant
  // Sizing tier varies per variant; the structure is identical.
  var textCls =
    v === 'today_card'
      ? 'text-[12px] sm:text-[12.5px] text-gray-400'
      : v === 'grid'
      ? 'text-[11.5px] sm:text-[12px] text-gray-400'
      : 'text-[11px] sm:text-[11.5px] text-gray-400'
  return (
    <div className={'flex items-center gap-2.5 ' + textCls}>
      <span className="font-sans font-semibold uppercase tracking-[0.16em] text-gray-300">
        Paradocs Archive
      </span>
      <span aria-hidden="true" className="inline-block h-3 w-px bg-white/[0.18]" />
      <span className="font-sans tabular-nums">
        {fmtInt(props.denominator_n)} accounts
      </span>
    </div>
  )
}

// ─── Category bar row (secondary families) ───────────────────────────

function CategoryBar(props: { f: FindingFamilyBreakdown; variant: Variant; muted?: boolean }) {
  var f = props.f
  var pctClamped = Math.max(0, Math.min(100, f.pct))
  var labelClass =
    props.variant === 'today_card'
      ? 'text-[13px] sm:text-[14px] text-gray-200'
      : 'text-[12px] sm:text-[13px] text-gray-200'
  var pctNumClass =
    props.variant === 'today_card'
      ? 'text-[14px] sm:text-[15px] font-sans font-semibold tabular-nums text-white'
      : 'text-[13px] sm:text-[14px] font-sans font-semibold tabular-nums text-white'
  // Muted variant for secondaries beneath a hero stat — slightly dimmed
  // bar fill so the hero reads as the primary.
  var barFill = props.muted
    ? 'linear-gradient(to right, rgba(144,0,240,0.55), rgba(144,0,240,0.25))'
    : 'linear-gradient(to right, rgba(144,0,240,0.95), rgba(144,0,240,0.55))'
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex items-end justify-between gap-3 mb-1">
        <span className={labelClass + ' truncate'} title={prettyFamilyLabel(f)}>
          {prettyFamilyLabel(f)}
        </span>
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className={pctNumClass}>{f.pct}%</span>
          <span className="text-[11px] sm:text-[12px] tabular-nums text-gray-500">
            ({fmtInt(f.count)})
          </span>
        </div>
      </div>
      <div
        className="relative h-[3px] w-full overflow-hidden border-y border-white/[0.06]"
        style={{ background: 'rgba(255,255,255,0.04)' }}
        aria-label={prettyFamilyLabel(f) + ' ' + f.pct + ' percent'}
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: pctClamped + '%', background: barFill }}
        />
      </div>
    </div>
  )
}

// ─── Hero stat block (large numeric display, used by rail + today_card)

function HeroStat(props: { hero: FindingFamilyBreakdown; variant: Variant }) {
  var f = props.hero
  var v = props.variant
  // 40-60px hero per spec — slightly smaller on rail so the headline
  // still leads, slightly larger on today_card where the card is
  // viewport-height.
  var numClass =
    v === 'today_card'
      ? 'font-display text-[56px] sm:text-[64px] leading-none font-semibold tracking-tight'
      : v === 'grid'
      ? 'font-display text-[44px] sm:text-[52px] leading-none font-semibold tracking-tight'
      : 'font-display text-[40px] sm:text-[44px] leading-none font-semibold tracking-tight'
  return (
    <div className="flex items-baseline gap-3">
      <span className={numClass} style={{ color: '#9000F0' }}>
        {f.pct}%
      </span>
      <span className="text-[12px] sm:text-[13px] text-gray-300 leading-snug">
        of <span className="text-gray-100">{prettyFamilyLabel(f)}</span>
        <br />
        <span className="text-gray-500 tabular-nums">
          ({fmtInt(f.count)} of {fmtInt(f.total_in_family)})
        </span>
      </span>
    </div>
  )
}

// ─── Share button (today_card only — Sprint 1E founder pick) ────────
//
// V11.18.12 — Sprint 1E. Founder pick #2 — share affordance lives on
// the FindingCard today_card only (NOT ClusteringCard; that's a Sprint
// 1F or later decision). The button uses navigator.share() with a
// graceful clipboard fallback, then a hand-rolled "Copied" state for
// 1.6s so the user sees the success state. The share TEXT is the
// headline; the URL is the canonical /lab/patterns/<slug>.
//
// Placement: top-right of the card, mirroring the eyebrow's left
// position in zone A. The button is a separate hit target inside the
// card-level <Link>; we stop event propagation so taps don't
// double-fire as "open the detail page."
//
// SSR-safe — all browser-API checks happen inside the handler so the
// component renders on first paint without a window guard.

function ShareButton(props: { slug: string; headline: string }) {
  var [copied, setCopied] = React.useState<boolean>(false)
  var resetTimerRef = React.useRef<any>(null)
  React.useEffect(function () {
    return function () {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])

  function buildShareUrl(): string {
    var path = '/lab/patterns/' + encodeURIComponent(props.slug)
    if (typeof window === 'undefined') return path
    try {
      return window.location.origin + path
    } catch (_e) {
      return path
    }
  }

  async function onShare(e: React.MouseEvent) {
    // Stop the click from bubbling to the card-level Link.
    e.preventDefault()
    e.stopPropagation()
    var url = buildShareUrl()
    var title = props.headline
    var shareText = title
    // 1) Native share sheet (mobile primary).
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: title, text: shareText, url: url })
        return
      } catch (_err) {
        // User dismissed or share failed — fall through to clipboard.
      }
    }
    // 2) Clipboard fallback (desktop + mobile-no-share).
    var copyPayload = shareText + '\n' + url
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(copyPayload)
        setCopied(true)
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
        resetTimerRef.current = setTimeout(function () { setCopied(false) }, 1600)
        return
      } catch (_err) {
        /* clipboard blocked — last resort below */
      }
    }
    // 3) Last-ditch: textarea + execCommand. Old Safari, embedded WebViews.
    try {
      var ta = document.createElement('textarea')
      ta.value = copyPayload
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      resetTimerRef.current = setTimeout(function () { setCopied(false) }, 1600)
    } catch (_e) {
      /* swallow — share simply did not happen */
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label={copied ? 'Copied to clipboard' : 'Share this Finding'}
      className={
        'inline-flex items-center justify-center w-9 h-9 rounded-full ' +
        'border border-white/[0.10] bg-white/[0.025] ' +
        'text-gray-300 hover:text-white hover:border-white/[0.22] ' +
        'transition-colors shrink-0'
      }
    >
      {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
    </button>
  )
}

// ─── Representative report excerpt slab (today_card — Sprint 1E) ─────
//
// V11.18.12 — Sprint 1E. Fills the dead space in the today_card's
// substance zone with a quote-shaped slab pulled from the first
// representative report. Title + location · date + 2-3 sentences from
// the Helena-cleared `paradocs_narrative` (NOT raw source description).
//
// The slab is its own <Link> to /report/<slug>. Tapping it routes to
// the report page; the card-level "Read more →" still routes to the
// Finding detail page at /lab/patterns/<slug>. Two distinct hand-offs
// from one card — slab = "see the case," chevron = "see the pattern."
//
// The slab gets `e.stopPropagation()` on its own anchor so the card-
// level Link doesn't double-fire. (Anchors nested in anchors are
// non-conforming HTML, so the today_card variant uses a div wrapper
// for the outer click target rather than the Link element — see the
// TodayCardLayout for that swap.)
//
// When `preview` is null (no representative reports on the Finding,
// or the lookup failed), the slab is suppressed. The hero + headline
// + bars + footer fill the viewport on their own; the card never has
// a void.

function ReportExcerptSlab(props: { preview: RepresentativeReportPreview }) {
  var p = props.preview
  var locDate = ''
  if (p.location_text && p.event_date) {
    locDate = p.location_text + ' · ' + fmtShortDate(p.event_date)
  } else if (p.location_text) {
    locDate = p.location_text
  } else if (p.event_date) {
    locDate = fmtShortDate(p.event_date)
  }
  var href = '/report/' + encodeURIComponent(p.slug || p.id)
  function onClick(e: React.MouseEvent) {
    // Stop the card-level click from also firing — the slab navigates
    // to the report page; the chevron + card navigate to the Finding
    // detail page. Two distinct hand-offs, same card.
    e.stopPropagation()
  }
  return (
    <a
      href={href}
      onClick={onClick}
      className={
        'block rounded-lg border border-white/[0.07] bg-white/[0.025] ' +
        'px-3.5 py-3 mb-4 max-w-[34ch] ' +
        'hover:border-white/[0.18] hover:bg-white/[0.045] transition-colors'
      }
      aria-label={'Read the report: ' + (p.title || 'Untitled account')}
    >
      <div className="text-[13.5px] sm:text-[14px] text-white leading-snug font-medium line-clamp-2">
        {p.title || 'Untitled account'}
      </div>
      {locDate && (
        <div className="mt-1 text-[11px] text-gray-500 tabular-nums">
          {locDate}
        </div>
      )}
      {p.preview_text && (
        <p className="mt-2 text-[12.5px] sm:text-[13px] italic text-gray-300 leading-relaxed line-clamp-3">
          {p.preview_text}
        </p>
      )}
    </a>
  )
}

// ─── "See the numbers" disclosure (V11.18.19 — Sprint 1G) ────────────
//
// V11.18.19 — Sprint 1G. The Gaia prose now leads every card. The data
// zone (hero %, per-family bars, denominator) drops behind a
// disclosure so researchers can still see the receipts without the
// card opening with a stats grid. Default collapsed; persists open
// state per-Finding inside the same render but resets on remount —
// the Today swipe deck remounts on every cycle so the cards re-open
// fresh, which the panel ratified as "the data should never lead;
// any explicit open is a research intent we honor while the card is
// visible, not across sessions."
//
// On rail variant this disclosure is suppressed entirely (no data
// zone at all per the V11.18.19 brief — rail has limited vertical
// space and the Gaia register asks for prose-only on the rail).
function NumbersDisclosure(props: {
  finding: Finding
  variant: Variant
  defaultOpen?: boolean
}) {
  var f = props.finding
  var v = props.variant
  var [open, setOpen] = React.useState<boolean>(!!props.defaultOpen)
  if (v === 'rail') return null
  var hero = pickHero(f.phen_families)
  var secondaries = hero
    ? f.phen_families.filter(function (x) { return x.family_slug !== hero!.family_slug })
    : f.phen_families
  // The button copy intentionally avoids "stats" / "data" — Gaia
  // register asks for plain English. "See the numbers" is the
  // Helena-cleared label.
  var btnLabel = open ? 'Hide the numbers' : 'See the numbers'
  var Icon = open ? ChevronUp : ChevronDown
  var btnTextSize =
    v === 'today_card'
      ? 'text-[11.5px] sm:text-[12px]'
      : 'text-[11px] sm:text-[11.5px]'
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={function (e) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(function (x) { return !x })
        }}
        aria-expanded={open}
        className={
          'inline-flex items-center gap-1.5 ' + btnTextSize + ' font-sans uppercase tracking-[0.16em] ' +
          'text-gray-500 hover:text-gray-300 transition-colors min-h-[36px] -my-1 py-1'
        }
      >
        <Icon className="w-3 h-3" />
        {btnLabel}
      </button>
      {open && (
        <div className="mt-3 max-w-[34ch]">
          {hero && (
            <div className="mb-3">
              <HeroStat hero={hero} variant={v} />
            </div>
          )}
          {secondaries.length > 0 && (
            <div className="mb-2">
              {secondaries.map(function (fam) {
                return <CategoryBar key={fam.family_slug} f={fam} variant={v} muted />
              })}
            </div>
          )}
          <p className="text-[11.5px] italic leading-snug text-gray-500">
            {prettyDenominatorLabel(f)}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Variants ────────────────────────────────────────────────────────

function RailLayout(props: { finding: Finding; href: string; desktopGrid?: boolean }) {
  var f = props.finding
  var overlay = f.user_overlay && f.user_overlay.matches >= 1 ? f.user_overlay : null
  // V11.18.19 — Sprint 1G. Rail variant goes prose-only. No hero
  // numeric, no per-family bars, no denominator italic on the card —
  // the Gaia register asks the rail to read like a small documentary
  // observation, not a study result. Researchers click into the
  // detail page for the receipts; the rail is the headline + the prose.
  //
  // V11.18.19 — Sprint 1G. `desktopGrid` flips the rail card into the
  // PatternsRail desktop 2-column-grid shape — fills its cell (w-full),
  // shorter max-height, no shrink-0, so the same card body works in
  // both the mobile horizontal scroll AND the desktop scannable grid.
  // Mobile retains the fixed 300/324px width + shrink-0 so the rail
  // scrolls horizontally as before.
  var dg = !!props.desktopGrid
  var shellSizing = dg
    ? 'w-full max-h-[260px] sm:max-h-[280px]'
    : 'w-[300px] sm:w-[324px] min-h-[280px] shrink-0'
  return (
    <article
      className={
        'relative flex flex-col ' + shellSizing + ' ' +
        'rounded-xl border border-gray-800 bg-gray-950/70 overflow-hidden'
      }
      aria-label={'Finding: ' + f.headline}
    >
      {/* V11.18.19 — Sprint 1G. Drop the heavy brand-purple top hairline;
          a subtle left-edge accent (low-opacity) carries the
          "this is a Patterns artifact" signal without the ad-chrome
          feel the founder flagged. Matches the visual register of
          normal report cards. */}
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-0 w-px pointer-events-none"
        style={{ background: 'rgba(144,0,240,0.35)' }}
      />

      <div className="flex flex-col gap-3 p-5 pb-4 min-h-0">
        <Eyebrow type={f.eyebrow_type} size="sm" />

        <h3
          className="font-display text-[18px] sm:text-[20px] leading-[1.2] tracking-tight text-white"
        >
          {f.headline}
        </h3>

        {/* V11.18.19 — Sprint 1G. Prose leads, no data zone. The
            interpretive sentence is the card on the rail. Clamp to 5
            lines on the desktop-grid shape so the cards stay scannable
            in the 2-column grid; mobile keeps the prose untruncated
            since the card height is the rail's height. */}
        <p
          className={
            'text-[13px] sm:text-[14px] text-gray-200 leading-relaxed ' +
            (dg ? 'line-clamp-5' : '')
          }
        >
          {f.interpretive_sentence}
        </p>

        {overlay && <PersonalizedOverlay overlay={overlay} compact />}
      </div>

      <div className="mt-auto px-5 pb-4 pt-3 border-t border-white/[0.05] flex items-center justify-between gap-3">
        <FooterCitation denominator_n={f.denominator_n} variant="rail" />
        <Link
          href={props.href}
          className="inline-flex items-center gap-1 min-h-[44px] -my-2 py-2 text-[12px] font-medium text-purple-300 hover:text-purple-200 transition-colors shrink-0"
        >
          Read more
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </article>
  )
}

function GridLayout(props: { finding: Finding; href: string }) {
  var f = props.finding
  var overlay = f.user_overlay && f.user_overlay.matches >= 1 ? f.user_overlay : null
  return (
    <article
      className={
        'relative flex flex-col w-full rounded-2xl border border-gray-800 ' +
        'bg-gray-950/70 overflow-hidden'
      }
      aria-label={'Finding: ' + f.headline}
    >
      {/* V11.18.19 — Sprint 1G. Drop the heavy full-width brand-purple
          top hairline. Subtle left-edge accent only — same visual
          register as a normal report card on /discover. */}
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-0 w-px pointer-events-none"
        style={{ background: 'rgba(144,0,240,0.35)' }}
      />

      <div className="flex flex-col gap-5 p-6 sm:p-7">
        {/* Sprint 1C — Eyebrow on the left, family icon set on the right.
            The flex row balances the top of the card; the icons read
            as a glance-at "this finding spans three families" affordance
            without competing with the headline below. */}
        <div className="flex items-start justify-between gap-3">
          <Eyebrow type={f.eyebrow_type} size="md" />
          <FamilyIconSet families={f.phen_families} variant="grid" />
        </div>

        <h3
          className="font-display text-[24px] sm:text-[28px] leading-[1.18] tracking-tight text-white"
        >
          {f.headline}
        </h3>

        {/* V11.18.19 — Sprint 1G. Prose leads (was: bars + denominator
            led). The interpretive sentence is the wow; the bars and the
            denominator follow behind the "See the numbers" disclosure. */}
        <p className="text-[13.5px] sm:text-[14.5px] text-gray-200 leading-relaxed">
          {f.interpretive_sentence}
        </p>

        {/* V11.18.19 — Sprint 1G. Data zone behind a disclosure. The
            grid page (/lab/patterns) is the research surface so the
            disclosure defaults closed, matching the rest of the card
            register; researchers click to open. */}
        <NumbersDisclosure finding={f} variant="grid" />

        {overlay && <PersonalizedOverlay overlay={overlay} />}

        {/*
          V11.18.3 — Sprint 1A polish round 2. Footer link copy shortened
          from "See representative reports" to "See reports" because the
          long string overflowed the right edge of grid cells on mobile
          (founder screenshot). The cell is full-width at the smallest
          break, but the FooterCitation on the left can be ~180-200px
          and the long link plus its arrow ran past the card border.
          V11.18.8 — Sprint 1D fixes. Relabeled from "See reports" to
          "Read more" — destination is the Finding detail page, NOT a
          representative report. The shorter copy still fits cleanly
          at all breaks; the flex layout keeps the citation flexible
          (min-w-0) and the link non-shrink so the link wraps only if
          the citation overflows first.
        */}
        <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <FooterCitation denominator_n={f.denominator_n} variant="grid" />
          </div>
          <Link
            href={props.href}
            className="inline-flex items-center gap-1 min-h-[44px] -my-2 py-2 text-[12.5px] font-medium text-purple-300 hover:text-purple-200 transition-colors shrink-0 whitespace-nowrap"
          >
            Read more
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </article>
  )
}

function TodayCardLayout(props: { finding: Finding; href: string; isActive?: boolean }) {
  var f = props.finding
  var overlay = f.user_overlay && f.user_overlay.matches >= 1 ? f.user_overlay : null
  // V11.18.12 — Sprint 1E. Substance-zone preview slab. Falls through
  // to null when the catalogue row has no representative_report_ids or
  // the API lookup failed; the card then suppresses the slab and lets
  // the headline + prose + rep-report excerpt + footer fill the viewport.
  var preview = f.representative_report_preview || null

  // V11.18.12 — Sprint 1E. The card has three hit targets:
  //   1. Outer card     → /lab/patterns/<slug>   (the Finding detail page)
  //   2. Substance slab → /report/<rep slug>     (the representative report)
  //   3. Share button   → navigator.share() or clipboard
  //
  // Nested <a> elements are invalid HTML, so the outer wrapper is a
  // <div> with role="link" + onClick + onKeyDown. The footer "Read more"
  // chevron uses a real Link (anchor) so middle-click / Cmd-click /
  // right-click "Open in new tab" still work for the primary chevron
  // affordance. The inner <a>s for the slab use stopPropagation so the
  // outer onClick doesn't double-fire.
  function onCardClick(e: React.MouseEvent) {
    // Don't intercept if the user opened in a new tab/window/etc.
    if (e.defaultPrevented) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if ((e as any).button && (e as any).button !== 0) return
    // The inner Link / slab anchor / share button stop propagation
    // themselves; we only land here for taps in dead card area.
    // Use the Next router via a synthetic anchor click so client-side
    // navigation still kicks in.
    var a = document.createElement('a')
    a.href = props.href
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  function onCardKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onCardClick(e as any)
    }
  }

  return (
    <div
      onClick={onCardClick}
      onKeyDown={onCardKey}
      role="link"
      tabIndex={0}
      aria-label={'Finding: ' + f.headline}
      // V11.18.13 — Sprint 1E fixes. Constrain the card to a mobile-
      // portrait grammar at tablet + desktop widths. Without the
      // sm:max-w-lg + mx-auto pair the card stretches edge-to-edge on
      // ≥640px viewports while its inner content tops out at max-w-[34ch]
      // (~510px), leaving an awkward whitespace gutter on the right.
      // The founder-approved fix per the panel memo is option B: preserve
      // the mobile grammar, just cap the card width and center it. We
      // also pad the wider viewports with a hairline outside the card
      // background so the centering reads intentional rather than
      // accidentally-empty.
      className={
        'block h-full w-full relative overflow-hidden bg-gray-950 group cursor-pointer ' +
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-purple-500/40 ' +
        'sm:max-w-lg sm:mx-auto'
      }
    >
      {/* V11.18.19 — Sprint 1G. Per founder review the heavy 1px purple
          top + bottom borders + the full top-to-bottom left+right side
          rails read as ad-chrome rather than as a documentary artifact,
          making the special card look disconnected from normal report
          cards. Drop the top + bottom hairlines entirely. Keep ONE
          quiet left-edge accent (lower opacity, narrower) as the only
          identifying mark — same visual register as the report-card
          shell on /discover. */}
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-0 w-px pointer-events-none"
        style={{ background: 'rgba(144,0,240,0.35)' }}
      />

      <div
        className={
          'relative z-10 h-full flex flex-col px-7 sm:px-10 transition-all duration-700 ' +
          'pt-[calc(env(safe-area-inset-top,0px)+1.75rem)] ' +
          'pb-[calc(80px+env(safe-area-inset-bottom,0px)+1.25rem)] md:pb-8 ' +
          (props.isActive === false ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0')
        }
      >
        {/* Sprint 1C — Eyebrow + family icons share the top row on the
            today_card variant. V11.18.12 Sprint 1E — Share button is
            absolutely positioned in the top-right so it doesn't have
            to share the row with the family icons. The family icons
            now sit beneath the share button on a second row inline
            with the eyebrow — gives the share button breathing room
            and keeps the eyebrow as the visual anchor of zone A. */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-3 min-w-0">
            <Eyebrow type={f.eyebrow_type} size="md" />
            <FamilyIconSet families={f.phen_families} variant="today_card" />
          </div>
          <ShareButton slug={f.slug} headline={f.headline} />
        </div>

        <h2 className="font-display text-[26px] sm:text-[32px] font-semibold text-white leading-[1.15] tracking-[-0.005em] max-w-[24ch] mb-5">
          {f.headline}
        </h2>

        {/* V11.18.19 — Sprint 1G. Prose-first reorder. The Gaia
            interpretive sentence now leads the read; hero %, per-family
            bars, and denominator move behind a "See the numbers"
            disclosure beneath. The card is no longer a data card with
            a prose footnote — it's a prose card with a research
            disclosure beneath. */}
        <p className="text-[15px] sm:text-[16px] text-gray-100 leading-relaxed max-w-[34ch] mb-4">
          {f.interpretive_sentence}
        </p>

        <div className="mb-4 max-w-[34ch]">
          <NumbersDisclosure finding={f} variant="today_card" />
        </div>

        {/* V11.18.12 — Sprint 1E. Substance zone — representative report
            excerpt slab. Routes to /report/<slug> (NOT the Finding
            detail page); the chevron + footer route there. Tap the
            slab to see the human case; tap the chevron to see the
            wider pattern. */}
        {preview && <ReportExcerptSlab preview={preview} />}

        {overlay && (
          <div className="max-w-[34ch] mb-2">
            <PersonalizedOverlay overlay={overlay} />
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-white/[0.07] flex items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <FooterCitation denominator_n={f.denominator_n} variant="today_card" />
          </div>
          {/* V11.18.12 — Sprint 1E. Make the chevron a real Link so
              Cmd/Ctrl/middle-click "open in new tab" still works on
              the primary action affordance. stopPropagation so the
              outer onCardClick doesn't double-navigate. */}
          <Link
            href={props.href}
            onClick={function (e) { e.stopPropagation() }}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-purple-300 hover:text-purple-200 transition-colors shrink-0 whitespace-nowrap min-h-[44px] -my-2 py-2"
          >
            Read more
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function PersonalizedOverlay(props: { overlay: UserOverlay; compact?: boolean }) {
  var o = props.overlay
  // Helena-cleared exact copy. No second-person voice for the corpus
  // body, but the personalized slab IS second-person by necessity —
  // it's literally addressing the user's own record. This is the one
  // surface where "your" is allowed (V2 §2.3 anatomy).
  var sentence =
    o.matches + ' of your ' + o.total + ' account' +
    (o.total === 1 ? '' : 's') + ' share' + (o.matches === 1 ? 's' : '') +
    ' this trait.'
  return (
    <div
      className={
        'rounded-lg border border-purple-500/30 bg-purple-950/30 ' +
        (props.compact ? 'px-3 py-2' : 'px-3.5 py-2.5')
      }
    >
      <p className={'text-purple-100 ' + (props.compact ? 'text-[12px]' : 'text-[13px]') + ' leading-snug'}>
        {sentence}
      </p>
    </div>
  )
}

// ─── Public component ───────────────────────────────────────────────

export default function FindingCard(props: FindingCardProps) {
  var variant: Variant = props.variant || 'rail'
  var href = resolveHref(props.finding, props.href)
  if (variant === 'today_card') {
    return <TodayCardLayout finding={props.finding} href={href} isActive={props.isActive !== false} />
  }
  if (variant === 'grid') {
    return <GridLayout finding={props.finding} href={href} />
  }
  return <RailLayout finding={props.finding} href={href} desktopGrid={!!props.desktopGrid} />
}
