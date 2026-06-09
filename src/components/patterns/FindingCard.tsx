'use client'

// V11.18.2 — Sprint 1A polish — FindingCard
//
// Editorial / data-illustration redesign of the corpus-grounded Finding
// artifact (V2 roadmap §2.3). Same three variants:
//   - `rail`        — compact horizontal-rail unit (~300px wide) used by
//                     PatternsRail on /lab
//   - `grid`        — fills column on /lab/patterns static grid page; all
//                     three family stats fully visible
//   - `today_card`  — full-bleed swipe card sized for the Today feed,
//                     hero stat treatment, hairline brand-purple top + bottom
//                     borders to differentiate from report cards
//
// Visual register (founder pass — June 2026):
//   - Documentary / archival, not promotional. No exclamation, no spooky,
//     no playful gradients, no second-person body voice (the personalized
//     overlay slab is the one exception per V2 §2.3).
//   - Hero stat treatment per variant: the LARGEST family % is rendered
//     numerically large (Spotify Wrapped reference); secondary families
//     are smaller bars beneath.
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
import { ArrowRight } from 'lucide-react'

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
  // Sprint 1 has no per-finding detail page yet. Route to the first
  // representative report when available; otherwise route to the
  // Patterns index page (still useful — surfaces the rail/grid).
  if (Array.isArray(finding.representative_report_ids) && finding.representative_report_ids.length > 0) {
    return '/reports/' + encodeURIComponent(String(finding.representative_report_ids[0]))
  }
  return '/lab/patterns'
}

// Format big numerals with US grouping; the corpus is internationally
// sourced but the Helena style sheet asks for plain "12,420" not
// "12.420" / "12 420" / "12k".
function fmtInt(n: number): string {
  if (!isFinite(n)) return '0'
  return Math.round(n).toLocaleString('en-US')
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

// ─── Variants ────────────────────────────────────────────────────────

function RailLayout(props: { finding: Finding; href: string }) {
  var f = props.finding
  var hero = pickHero(f.phen_families)
  var secondaries = hero
    ? f.phen_families.filter(function (x) { return x.family_slug !== hero!.family_slug })
    : f.phen_families
  var overlay = f.user_overlay && f.user_overlay.matches >= 1 ? f.user_overlay : null
  return (
    <article
      className={
        'relative flex flex-col w-[300px] sm:w-[324px] min-h-[400px] shrink-0 ' +
        'rounded-xl border border-gray-800 bg-gray-950/70 overflow-hidden'
      }
      aria-label={'Finding: ' + f.headline}
    >
      {/* Brand-purple hairline at the top — distinguishes from neighboring rail cards. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px" style={{ background: '#9000F0' }} />

      <div className="flex flex-col gap-4 p-5 pb-4">
        <Eyebrow type={f.eyebrow_type} size="sm" />

        <h3
          className="font-display text-[20px] sm:text-[22px] leading-[1.2] tracking-tight text-white"
        >
          {f.headline}
        </h3>

        {hero && <HeroStat hero={hero} variant="rail" />}

        {secondaries.length > 0 && (
          <div className="mt-1">
            {secondaries.map(function (fam) {
              return <CategoryBar key={fam.family_slug} f={fam} variant="rail" muted />
            })}
          </div>
        )}

        <p className="text-[11.5px] sm:text-[12px] italic leading-snug text-gray-400">
          {prettyDenominatorLabel(f)}
        </p>

        <p className="text-[12.5px] sm:text-[13.5px] text-gray-300 leading-relaxed">
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
          See reports
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
      {/* Brand-purple hairline at the top, full width — editorial header rule. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px" style={{ background: '#9000F0' }} />

      <div className="flex flex-col gap-5 p-6 sm:p-7">
        <Eyebrow type={f.eyebrow_type} size="md" />

        <h3
          className="font-display text-[24px] sm:text-[28px] leading-[1.18] tracking-tight text-white"
        >
          {f.headline}
        </h3>

        {/* In grid mode all three families are visible as bars (the cell
            is wide enough), with the largest pre-promoted via sort. */}
        <div className="mt-1">
          {f.phen_families
            .slice()
            .sort(function (a, b) { return b.pct - a.pct })
            .map(function (fam, i) {
              return <CategoryBar key={fam.family_slug} f={fam} variant="grid" muted={i !== 0} />
            })}
        </div>

        <p className="text-[12px] italic leading-snug text-gray-400">
          {prettyDenominatorLabel(f)}
        </p>

        <p className="text-[13.5px] sm:text-[14.5px] text-gray-200 leading-relaxed">
          {f.interpretive_sentence}
        </p>

        {overlay && <PersonalizedOverlay overlay={overlay} />}

        <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <FooterCitation denominator_n={f.denominator_n} variant="grid" />
          <Link
            href={props.href}
            className="inline-flex items-center gap-1 min-h-[44px] -my-2 py-2 text-[12.5px] font-medium text-purple-300 hover:text-purple-200 transition-colors shrink-0"
          >
            See representative reports
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </article>
  )
}

function TodayCardLayout(props: { finding: Finding; href: string; isActive?: boolean }) {
  var f = props.finding
  var hero = pickHero(f.phen_families)
  var secondaries = hero
    ? f.phen_families.filter(function (x) { return x.family_slug !== hero!.family_slug })
    : f.phen_families
  var overlay = f.user_overlay && f.user_overlay.matches >= 1 ? f.user_overlay : null
  return (
    <Link
      href={props.href}
      className="block h-full w-full relative overflow-hidden bg-gray-950 group"
      role="article"
      aria-label={'Finding: ' + f.headline}
    >
      {/* Hairline edges — V2 cross-surface decision. Distinct from
          report cards via 1px purple top + bottom borders. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px" style={{ background: '#9000F0' }} />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px" style={{ background: '#9000F0' }} />
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-0 w-px pointer-events-none"
        style={{ background: 'rgba(144,0,240,0.45)' }}
      />

      <div
        className={
          'relative z-10 h-full flex flex-col px-7 sm:px-10 transition-all duration-700 ' +
          'pt-[calc(env(safe-area-inset-top,0px)+1.75rem)] ' +
          'pb-[calc(80px+env(safe-area-inset-bottom,0px)+1.25rem)] md:pb-8 ' +
          (props.isActive === false ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0')
        }
      >
        <div className="mb-6">
          <Eyebrow type={f.eyebrow_type} size="md" />
        </div>

        <h2 className="font-display text-[26px] sm:text-[32px] font-semibold text-white leading-[1.15] tracking-[-0.005em] max-w-[24ch] mb-6">
          {f.headline}
        </h2>

        {hero && (
          <div className="mb-5 max-w-[34ch]">
            <HeroStat hero={hero} variant="today_card" />
          </div>
        )}

        {secondaries.length > 0 && (
          <div className="mb-5 max-w-[34ch]">
            {secondaries.map(function (fam) {
              return <CategoryBar key={fam.family_slug} f={fam} variant="today_card" muted />
            })}
          </div>
        )}

        <p className="text-[13px] italic leading-snug text-gray-400 max-w-[34ch] mb-3">
          {prettyDenominatorLabel(f)}
        </p>

        <p className="text-[14.5px] sm:text-[15.5px] text-gray-200 leading-relaxed max-w-[34ch] mb-3">
          {f.interpretive_sentence}
        </p>

        {overlay && (
          <div className="max-w-[34ch] mb-2">
            <PersonalizedOverlay overlay={overlay} />
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-white/[0.07] flex items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <FooterCitation denominator_n={f.denominator_n} variant="today_card" />
          </div>
          <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 group-hover:text-gray-200 transition-colors" />
        </div>
      </div>
    </Link>
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
  return <RailLayout finding={props.finding} href={href} />
}
