'use client'

// V11.18.1 — Sprint 1A-2 — FindingCard
//
// The screenshot-shareable corpus-grounded Finding artifact per V2
// roadmap §2.3. Three variants:
//   - `rail`        — 280-320px wide, fixed ~360px tall, used by
//                     PatternsRail on /lab
//   - `grid`        — fills column, taller, used by /lab/patterns
//                     static grid page
//   - `today_card`  — full-bleed swipe card sized for the Today feed
//                     (scaffolded off ClusteringCard's pattern)
//
// Helena-cleared register: no exclamation marks, no second-person, no
// clickbait, no "mysteriously" / "shocking" / "incredibly".
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
   * link. When omitted, defaults to /lab/patterns/[slug] (Sprint 2
   * detail page route; for Sprint 1 the page is a 404 unless the
   * operator publishes static detail pages — fall back to the first
   * representative report).
   */
  href?: string
  /** today_card variant uses this to play swipe-in animation. */
  isActive?: boolean
}

var EYEBROW_LABEL: Record<Finding['eyebrow_type'], string> = {
  cross_cutting_descriptor: 'Cross-Cutting Descriptor',
  temporal: 'Temporal Cluster',
  geographic: 'Geographic Cluster',
  witness_pattern: 'Witness Pattern',
  source_overlap: 'Source Overlap',
  sub_family_distribution: 'Sub-Family Distribution',
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

// ─── Category bar row ────────────────────────────────────────────────

function CategoryBar(props: { f: FindingFamilyBreakdown; variant: Variant }) {
  var f = props.f
  // Bar width = the % within that family (NOT normalized across families
  // per the brief). A 100% bar is the full bar; a 41% bar is 41% of the
  // bar's track width.
  var pctClamped = Math.max(0, Math.min(100, f.pct))
  var labelClass = props.variant === 'today_card'
    ? 'text-[13px] sm:text-[14px] text-gray-200'
    : 'text-[12px] sm:text-[13px] text-gray-200'
  var numClass = props.variant === 'today_card'
    ? 'text-[13px] sm:text-[14px] tabular-nums text-gray-300'
    : 'text-[12px] sm:text-[13px] tabular-nums text-gray-300'

  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className={labelClass + ' truncate'} title={f.family_label}>
          {f.family_label}
        </span>
        <span className={numClass}>
          {f.pct}% <span className="text-gray-500">({fmtInt(f.count)})</span>
        </span>
      </div>
      <div
        className="relative h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden"
        aria-label={f.family_label + ' ' + f.pct + ' percent'}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: pctClamped + '%',
            background: 'linear-gradient(to right, rgba(144,0,240,0.85), rgba(144,0,240,0.55))',
          }}
        />
      </div>
    </div>
  )
}

// ─── Variants ────────────────────────────────────────────────────────

function RailLayout(props: { finding: Finding; href: string }) {
  var f = props.finding
  var overlay = f.user_overlay && f.user_overlay.matches >= 1 ? f.user_overlay : null
  return (
    <article
      className={
        'relative flex flex-col w-[280px] sm:w-[320px] min-h-[360px] shrink-0 ' +
        'rounded-xl border border-gray-800 bg-gray-950/60 overflow-hidden'
      }
      aria-label={'Finding: ' + f.headline}
    >
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-0 w-[3px]"
        style={{ background: '#9000F0' }}
      />
      <div className="flex flex-col gap-3 p-4 pb-3">
        <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-gray-400">
          {EYEBROW_LABEL[f.eyebrow_type]}
        </p>
        <h3
          className="text-[17px] sm:text-[18px] leading-snug text-white"
          style={{ fontFamily: "'Changa One', Changa, system-ui, sans-serif" }}
        >
          {f.headline}
        </h3>
        <div className="mt-1">
          {f.phen_families.map(function (fam) {
            return <CategoryBar key={fam.family_slug} f={fam} variant="rail" />
          })}
        </div>
        <p className="text-[11px] sm:text-[12px] italic leading-snug text-gray-400">
          {f.denominator_n_label}
        </p>
        <p className="text-[12px] sm:text-[13px] text-gray-300 leading-relaxed">
          {f.interpretive_sentence}
        </p>
        {overlay && <PersonalizedOverlay overlay={overlay} compact />}
      </div>
      <div className="mt-auto px-4 pb-4 pt-2 border-t border-white/[0.04]">
        <Link
          href={props.href}
          className="inline-flex items-center gap-1.5 min-h-[44px] -my-2 py-2 text-[12px] font-medium text-purple-300 hover:text-purple-200 transition-colors"
        >
          See representative reports
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
        'bg-gray-950/60 overflow-hidden'
      }
      aria-label={'Finding: ' + f.headline}
    >
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-0 w-1"
        style={{ background: '#9000F0' }}
      />
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <p className="text-[10px] sm:text-[11px] font-semibold tracking-[0.20em] uppercase text-gray-400">
          {EYEBROW_LABEL[f.eyebrow_type]}
        </p>
        <h3
          className="text-[19px] sm:text-[21px] leading-snug text-white"
          style={{ fontFamily: "'Changa One', Changa, system-ui, sans-serif" }}
        >
          {f.headline}
        </h3>
        <div className="mt-1">
          {f.phen_families.map(function (fam) {
            return <CategoryBar key={fam.family_slug} f={fam} variant="grid" />
          })}
        </div>
        <p className="text-[12px] italic leading-snug text-gray-400">
          {f.denominator_n_label}
        </p>
        <p className="text-[13px] sm:text-[14px] text-gray-300 leading-relaxed">
          {f.interpretive_sentence}
        </p>
        {overlay && <PersonalizedOverlay overlay={overlay} />}
        <div className="pt-3 border-t border-white/[0.05]">
          <Link
            href={props.href}
            className="inline-flex items-center gap-1.5 min-h-[44px] -my-2 py-2 text-[13px] font-medium text-purple-300 hover:text-purple-200 transition-colors"
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
  var overlay = f.user_overlay && f.user_overlay.matches >= 1 ? f.user_overlay : null
  return (
    <Link
      href={props.href}
      className="block h-full w-full relative overflow-hidden bg-gray-950 group"
      role="article"
      aria-label={'Finding: ' + f.headline}
    >
      {/* Hairline edge marker — V2 cross-surface decision. Distinct
          from report cards via 1px purple top + bottom borders. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: '#9000F0' }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ background: '#9000F0' }}
      />
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-0 w-1 pointer-events-none"
        style={{ background: '#9000F0' }}
      />

      <div className={
        'relative z-10 h-full flex flex-col px-7 sm:px-10 transition-all duration-700 ' +
        'pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] ' +
        'pb-[calc(80px+env(safe-area-inset-bottom,0px)+1.25rem)] md:pb-8 ' +
        (props.isActive === false ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0')
      }>
        <div className="inline-flex items-center self-start gap-2 mb-6">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-[10px] font-sans font-semibold uppercase tracking-[0.14em] text-purple-200/90">
            {EYEBROW_LABEL[f.eyebrow_type]}
          </span>
        </div>

        <h2 className="font-display text-[24px] sm:text-[28px] font-semibold text-white leading-[1.2] tracking-[-0.005em] max-w-[24ch] mb-5">
          {f.headline}
        </h2>

        <div className="mb-4 max-w-[34ch]">
          {f.phen_families.map(function (fam) {
            return <CategoryBar key={fam.family_slug} f={fam} variant="today_card" />
          })}
        </div>

        <p className="text-[13px] italic leading-snug text-gray-400 max-w-[34ch] mb-3">
          {f.denominator_n_label}
        </p>

        <p className="text-[14px] sm:text-[15px] text-gray-300 leading-relaxed max-w-[34ch] mb-3">
          {f.interpretive_sentence}
        </p>

        {overlay && (
          <div className="max-w-[34ch] mb-2">
            <PersonalizedOverlay overlay={overlay} />
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-white/[0.07] flex items-center gap-1.5 text-[12px] font-sans font-medium text-gray-400 group-hover:text-gray-200 transition-colors">
          <span className="truncate">From the catalogue</span>
          <span className="text-gray-600">·</span>
          <span className="truncate">{fmtInt(f.denominator_n)} accounts</span>
          <span className="flex-1" />
          <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
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
  var sentence = o.matches + ' of your ' + o.total + ' account' +
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
