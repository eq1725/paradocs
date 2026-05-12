'use client'

/**
 * ReportBelowFold — V10.4 Phase 2.3
 *
 * The collapsed-by-default lower section of the new report
 * page. Three sub-sections behind one disclosure each so casual
 * mobile users see a clean page; power-users expand what they
 * want.
 *
 *   1. Paradocs Analysis
 *      - Pull quote (italic blockquote)
 *      - Alternative explanations (was "mundane_explanations")
 *      Credibility signal is DROPPED per Chase's V10.4 call —
 *      we no longer surface that field anywhere on the page.
 *
 *   2. Related reports — up to 5, no duplicate of the chip
 *      cluster's category-filter link. Subsumes KeepExploring.
 *
 *   3. Comments — existing ReportComments component.
 *
 * Each section is a native <details>/<summary> so users without
 * JS still get the disclosure. JS upgrades the chevron + smooth
 * height transition.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown, MessageSquare, BookOpen, Sparkles,
  CircleCheck, CircleAlert, CircleHelp,
} from 'lucide-react'

const ReportComments = (() => {
  try {
    // Dynamic require so server bundle doesn't pull it when not needed.
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

export interface ReportBelowFoldProps {
  reportSlug: string
  pullQuote?: string | null
  alternativeExplanations?: AlternativeExplanation[]
  relatedReports?: RelatedReport[]
  className?: string
}

export default function ReportBelowFold(props: ReportBelowFoldProps) {
  const hasAnalysis =
    (props.pullQuote && props.pullQuote.trim().length > 0) ||
    (props.alternativeExplanations && props.alternativeExplanations.length > 0)
  const hasRelated = (props.relatedReports || []).length > 0

  if (!hasAnalysis && !hasRelated && !ReportComments) return null

  return (
    <section className={'space-y-3 ' + (props.className || '')}>
      {hasAnalysis && (
        <Disclosure
          title="Paradocs analysis"
          icon={Sparkles}
          subtle="Editorial framing, alternative explanations"
          variant="analysis"
        >
          <AnalysisInner
            pullQuote={props.pullQuote || null}
            alternativeExplanations={props.alternativeExplanations || []}
          />
        </Disclosure>
      )}

      {hasRelated && (
        <Disclosure
          id="related-reports"
          title="Related reports"
          icon={BookOpen}
          subtle={(props.relatedReports || []).length + ' nearby cases'}
          variant="related"
        >
          <RelatedInner items={props.relatedReports || []} />
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

type DisclosureVariant = 'analysis' | 'related' | 'discussion'

const VARIANT_STYLES: Record<DisclosureVariant, {
  container: string
  iconTint: string
  iconBg: string
}> = {
  // V10.5 — Premium gradient border for Analysis. It's the substance
  // of the page; this signals "tap me, this is the depth".
  analysis: {
    container: 'rounded-xl border border-purple-700/40 bg-gradient-to-br from-purple-950/40 via-gray-900/60 to-gray-900/40 overflow-hidden ring-1 ring-purple-500/10',
    iconTint: 'text-purple-300',
    iconBg: 'bg-purple-600/20 border border-purple-500/40',
  },
  // Discovery feel for Related — cyan accent matches the chip
  // palette used elsewhere in the app for cross-disciplinary links.
  related: {
    container: 'rounded-xl border border-cyan-700/30 bg-cyan-950/[0.04] overflow-hidden',
    iconTint: 'text-cyan-300',
    iconBg: 'bg-cyan-600/15 border border-cyan-500/30',
  },
  // Chat treatment for Discussion — neutral but with the speech-
  // bubble icon highlighted.
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

function AnalysisInner(props: { pullQuote: string | null; alternativeExplanations: AlternativeExplanation[] }) {
  // V10.5 — pull quote is now rendered INLINE above the source block
  // (see ReportPullQuote) so it isn't gated behind this disclosure.
  // We keep the prop in the signature for backward compat but only
  // render it as a small reminder up top when the disclosure opens.
  return (
    <div className="space-y-4">
      {props.alternativeExplanations.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
            Alternative explanations
          </p>
          <ul className="space-y-2.5">
            {props.alternativeExplanations.map((ae, i) => (
              <li key={i} className="rounded-lg bg-gray-950/40 border border-gray-800/60 p-3">
                <div className="flex items-start gap-2">
                  {ae.likelihood && <LikelihoodBadge likelihood={ae.likelihood} />}
                  <p className="text-sm text-white leading-snug font-medium flex-1 min-w-0">
                    {ae.explanation}
                  </p>
                </div>
                {ae.reasoning && (
                  <p className="text-[12px] text-gray-400 leading-relaxed mt-1.5">{ae.reasoning}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function LikelihoodBadge({ likelihood }: { likelihood: 'high' | 'medium' | 'low' }) {
  // V10.5 — color + icon encoding. Previous treatment had medium and
  // low looking nearly identical (both gray). Now:
  //   High   = red CircleCheck (strong-evidence — rare per the
  //            paradocs-analysis prompt's "high is RARE" rule)
  //   Medium = amber CircleHelp (plausible but not directly evidenced)
  //   Low    = slate CircleAlert (worth listing but details argue
  //            against it)
  const config = {
    high:   { tint: 'bg-rose-500/20 border-rose-500/50 text-rose-200',     Icon: CircleCheck },
    medium: { tint: 'bg-amber-500/15 border-amber-500/40 text-amber-200', Icon: CircleHelp },
    low:    { tint: 'bg-slate-500/15 border-slate-500/30 text-slate-300', Icon: CircleAlert },
  }[likelihood]
  const Icon = config.Icon
  return (
    <span
      className={'inline-flex items-center gap-1 flex-shrink-0 mt-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ' + config.tint}
      aria-label={'Likelihood: ' + likelihood}
    >
      <Icon className="w-2.5 h-2.5" />
      {likelihood}
    </span>
  )
}

// ── Related section ─────────────────────────────────────────

function RelatedInner(props: { items: RelatedReport[] }) {
  return (
    <ul className="space-y-1.5">
      {props.items.slice(0, 5).map(r => (
        <li key={r.id}>
          <Link
            href={'/report/' + r.slug}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
          >
            {r.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.thumbnail_url}
                alt=""
                className="w-12 h-12 rounded-md object-cover bg-gray-900 flex-shrink-0 border border-gray-800"
                loading="lazy"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="w-12 h-12 rounded-md bg-gray-900 border border-gray-800 flex-shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white font-medium truncate group-hover:text-purple-200 transition-colors">
                {r.title}
              </p>
              <p className="text-[11px] text-gray-500 truncate">
                {[r.category, r.location_name, r.event_date].filter(Boolean).join(' · ')}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
