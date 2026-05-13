'use client'

/**
 * ReportBelowFold — V10.6
 *
 * Collapsed-by-default lower section of the report page. Two
 * sub-sections (down from three after V10.6 consolidations):
 *
 *   1. Paradocs analysis
 *      - Through multiple lenses (frames — 2-3 equal-weighted
 *        interpretive lenses, NO ranking, NO debunking)
 *      - Worth chasing (open questions — 1-2 inquiry-voice
 *        questions to argue about)
 *      - Pull quote rendered INLINE above the source block,
 *        not in this disclosure.
 *
 *   2. Discussion — existing ReportComments
 *
 * V10.6 dropped:
 *   - The Related Reports accordion (now rendered as a visible
 *     5-card grid in the main flow by ReportRelatedReports.tsx).
 *   - The "Alternative explanations" + likelihood badges
 *     pattern entirely (Chase: "we are not in the business of
 *     trying to prove something was something else").
 *
 * Backward compat: when an existing report has only legacy
 * `mundane_explanations` and no `frames` yet, the analysis
 * section shows a small "Editorial framing being refreshed"
 * note instead of debunking copy. New reports + backfilled
 * reports use the frames + questions shape.
 */

import React, { useState } from 'react'
import {
  ChevronDown, MessageSquare, Sparkles,
} from 'lucide-react'

const ReportComments = (() => {
  try {
    return require('./ReportComments').default
  } catch {
    return null
  }
})()

export interface AlternativeExplanation {
  explanation: string
  likelihood?: 'high' | 'medium' | 'low'
  reasoning?: string
}

export interface RelatedReport {
  id: string
  slug: string
  title: string
  category?: string | null
  location_name?: string | null
  event_date?: string | null
  thumbnail_url?: string | null
}

export interface ReportFrame {
  label: string
  body: string
}

export interface ReportBelowFoldProps {
  reportSlug: string
  pullQuote?: string | null
  /** V10.6 — equal-weighted interpretive lenses. */
  frames?: ReportFrame[]
  /** V10.6 — open questions to chase. */
  openQuestions?: string[]
  /** V10.6 — legacy field. Only consulted as a "regen pending" fallback. */
  alternativeExplanations?: AlternativeExplanation[]
  /** Deprecated — kept in props for caller compat but no longer rendered. */
  relatedReports?: RelatedReport[]
  className?: string
}

export default function ReportBelowFold(props: ReportBelowFoldProps) {
  const hasFrames = (props.frames || []).length > 0
  const hasQuestions = (props.openQuestions || []).length > 0
  const hasLegacyAlt = !hasFrames && !hasQuestions && (props.alternativeExplanations || []).length > 0
  const hasAnalysis = hasFrames || hasQuestions || hasLegacyAlt

  if (!hasAnalysis && !ReportComments) return null

  return (
    <section className={'space-y-3 ' + (props.className || '')}>
      {hasAnalysis && (
        <Disclosure
          title="Paradocs analysis"
          icon={Sparkles}
          subtle={hasFrames ? 'Multiple lenses · open questions' : 'Editorial framing'}
          variant="analysis"
        >
          <AnalysisInner
            frames={props.frames || []}
            openQuestions={props.openQuestions || []}
            legacyExplanations={hasLegacyAlt ? (props.alternativeExplanations || []) : []}
          />
        </Disclosure>
      )}

      {ReportComments && (
        <Disclosure
          title="Discussion"
          icon={MessageSquare}
          subtle="Add your perspective"
          variant="discussion"
        >
          <div className="pt-2">
            <ReportComments slug={props.reportSlug} />
          </div>
        </Disclosure>
      )}
    </section>
  )
}

// ── Disclosure shell ────────────────────────────────────────

type DisclosureVariant = 'analysis' | 'discussion'

const VARIANT_STYLES: Record<DisclosureVariant, {
  container: string
  iconTint: string
  iconBg: string
}> = {
  analysis: {
    container: 'rounded-xl border border-purple-700/40 bg-gradient-to-br from-purple-950/40 via-gray-900/60 to-gray-900/40 overflow-hidden ring-1 ring-purple-500/10',
    iconTint: 'text-purple-300',
    iconBg: 'bg-purple-600/20 border border-purple-500/40',
  },
  discussion: {
    container: 'rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden',
    iconTint: 'text-gray-300',
    iconBg: 'bg-gray-800 border border-gray-700',
  },
}

function Disclosure(props: {
  id?: string
  title: string
  subtle?: string
  icon: React.ComponentType<{ className?: string }>
  variant?: DisclosureVariant
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const Icon = props.icon
  const styles = VARIANT_STYLES[props.variant || 'discussion']
  return (
    <details
      id={props.id}
      className={'group ' + styles.container}
      onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="list-none flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none hover:bg-white/[0.03] transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={'inline-flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 ' + styles.iconBg}>
            <Icon className={'w-3.5 h-3.5 ' + styles.iconTint} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white leading-tight truncate">{props.title}</h3>
            {props.subtle && (
              <p className="text-[11px] text-gray-500 leading-tight truncate">{props.subtle}</p>
            )}
          </div>
        </div>
        <ChevronDown
          className={'w-4 h-4 text-gray-500 flex-shrink-0 transition-transform duration-200 ' + (open ? 'rotate-180' : '')}
        />
      </summary>
      <div className="px-4 pb-4 pt-2 border-t border-white/[0.05]">
        {props.children}
      </div>
    </details>
  )
}

// ── Analysis section ────────────────────────────────────────

function AnalysisInner(props: {
  frames: ReportFrame[]
  openQuestions: string[]
  legacyExplanations: AlternativeExplanation[]
}) {
  // V10.6 — when a report has not yet been regenerated through
  // the new pipeline, frames + open_questions will both be
  // empty. Surface a tiny notice rather than fall back to the
  // debunking-pattern legacy view.
  const hasNewShape = props.frames.length > 0 || props.openQuestions.length > 0

  if (!hasNewShape) {
    return (
      <p className="text-[12px] text-gray-500 italic leading-relaxed">
        Editorial framing for this case is being refreshed under our new
        multi-lens approach. Check back shortly.
      </p>
    )
  }

  // V10.6.5 — visual rewrite for mass-market readability per panel.
  //   - Each frame gets a numbered colored dot (1, 2, 3) anchoring
  //     the title so the eye finds the structure in a single glance.
  //   - Frame label rendered as a small uppercase kicker, then a
  //     bold one-line "insight" pulled from the body's first
  //     sentence, then the rest of the body in a slightly muted
  //     gray. (We split client-side rather than schema-changing so
  //     existing rows render fine.)
  //   - Whitespace bumped between frames.
  //   - "Worth chasing" cards now have a card treatment with the
  //     arrow inset, not inline, so each question feels like its
  //     own object you could tap on.
  //
  // Frame palette rotates through purple / cyan / amber — visually
  // distinct enough that you remember "lens 1 was the purple one"
  // even after scrolling away.
  const FRAME_TINTS: Array<{ dot: string; border: string; ring: string }> = [
    { dot: 'bg-purple-500', border: 'border-purple-500/40', ring: 'ring-purple-500/30' },
    { dot: 'bg-cyan-400',   border: 'border-cyan-400/40',   ring: 'ring-cyan-400/30' },
    { dot: 'bg-amber-400',  border: 'border-amber-400/40',  ring: 'ring-amber-400/30' },
  ]

  // V10.6.20 — Analysis visual polish:
  //   - Card-per-frame treatment instead of bare left-border list.
  //     Each lens reads as a discrete object you could swipe or tap,
  //     not floating prose. Subtle tinted-fill matching the frame's
  //     palette + same-tint left edge accent.
  //   - Bigger, more readable label kicker (text-[11px] → text-xs
  //     uppercase) for clearer hierarchy.
  //   - Number-dot moved INSIDE the card, smaller, paired with the
  //     label on one line, so the card content stays clean.
  //   - "Worth chasing" gets the same card treatment but amber-tinted
  //     so it visually distinguishes from the lens cards.
  return (
    <div className="space-y-6">
      {props.frames.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest font-semibold text-purple-300/80 mb-4">
            Through multiple lenses
          </p>
          <ul className="space-y-3">
            {props.frames.map((f, i) => {
              const tint = FRAME_TINTS[i % FRAME_TINTS.length]
              const insight = firstSentence(f.body)
              const rest = f.body.length > insight.length ? f.body.slice(insight.length).trim() : ''
              return (
                <li
                  key={i}
                  className={'relative rounded-xl bg-gray-900/40 border border-gray-800 overflow-hidden'}
                >
                  {/* Left edge accent in the tint color */}
                  <div className={'absolute left-0 top-0 bottom-0 w-1 ' + tint.dot} aria-hidden="true" />
                  <div className="p-4 pl-5">
                    {/* Header row: numbered dot + uppercase label kicker */}
                    <div className="flex items-center gap-2.5 mb-2">
                      <span
                        className={
                          'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-gray-950 ' +
                          tint.dot
                        }
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                      <p className="text-[11px] uppercase tracking-[0.14em] font-bold text-gray-300">
                        {f.label}
                      </p>
                    </div>
                    {/* Insight line — the hero sentence per lens */}
                    <p className="text-[15px] font-semibold text-white leading-snug mb-2">
                      {insight}
                    </p>
                    {/* Supporting context — muted to keep insight as the eye target */}
                    {rest && (
                      <p className="text-[14px] text-gray-300 leading-relaxed">
                        {rest}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {props.openQuestions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest font-semibold text-amber-300/80 mb-3">
            Worth chasing
          </p>
          <ul className="space-y-2">
            {props.openQuestions.map((q, i) => (
              <li
                key={i}
                className="relative rounded-xl bg-amber-950/15 border border-amber-700/25 overflow-hidden"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400/70" aria-hidden="true" />
                <div className="flex items-start gap-3 p-3.5 pl-5">
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-bold mt-0.5">
                    ?
                  </span>
                  <p className="text-[14px] text-gray-100 leading-relaxed pt-1">{q}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Pull off the first sentence from a paragraph. Handles ".", "?", "!"
// followed by a space + capital letter (or end of string). Falls back
// to the whole string if no sentence boundary is found.
function firstSentence(text: string): string {
  if (!text) return ''
  const trimmed = text.trim()
  const m = trimmed.match(/^.+?[.!?](?=\s+[A-Z]|$)/)
  return m ? m[0] : trimmed
}
