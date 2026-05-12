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

  return (
    <div className="space-y-5">
      {props.frames.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-purple-300/80 mb-3">
            Through multiple lenses
          </p>
          <ul className="space-y-4">
            {props.frames.map((f, i) => (
              <li key={i} className="border-l-2 border-purple-500/30 pl-3">
                <h4 className="text-[13px] font-semibold text-white leading-tight mb-1">
                  {f.label}
                </h4>
                <p className="text-sm text-gray-200 leading-relaxed">
                  {f.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.openQuestions.length > 0 && (
        <div className="pt-2 border-t border-white/[0.05]">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-amber-300/80 mb-3">
            Worth chasing
          </p>
          <ul className="space-y-2">
            {props.openQuestions.map((q, i) => (
              <li key={i} className="text-sm text-gray-200 leading-relaxed">
                <span className="text-amber-300/70 mr-2">→</span>
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
