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
import { ChevronDown, MessageSquare, BookOpen, Sparkles } from 'lucide-react'

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
        <Disclosure title="Paradocs analysis" icon={Sparkles} subtle="Editorial framing, alternative explanations">
          <AnalysisInner
            pullQuote={props.pullQuote || null}
            alternativeExplanations={props.alternativeExplanations || []}
          />
        </Disclosure>
      )}

      {hasRelated && (
        <Disclosure title="Related reports" icon={BookOpen} subtle={(props.relatedReports || []).length + ' nearby cases'}>
          <RelatedInner items={props.relatedReports || []} />
        </Disclosure>
      )}

      {ReportComments && (
        <Disclosure title="Discussion" icon={MessageSquare} subtle="Add your perspective">
          <div className="pt-2">
            <ReportComments slug={props.reportSlug} />
          </div>
        </Disclosure>
      )}
    </section>
  )
}

// ── Disclosure shell ────────────────────────────────────────

function Disclosure(props: {
  title: string
  subtle?: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const Icon = props.icon
  return (
    <details
      className="group rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden"
      onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="list-none flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none hover:bg-gray-900/60 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-purple-400 flex-shrink-0" />
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
      <div className="px-4 pb-4 pt-2 border-t border-gray-800/60">
        {props.children}
      </div>
    </details>
  )
}

// ── Analysis section ────────────────────────────────────────

function AnalysisInner(props: { pullQuote: string | null; alternativeExplanations: AlternativeExplanation[] }) {
  return (
    <div className="space-y-4">
      {props.pullQuote && (
        <blockquote className="border-l-2 border-purple-500/50 pl-3 italic text-gray-200 text-sm leading-relaxed">
          &ldquo;{props.pullQuote}&rdquo;
        </blockquote>
      )}
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
  const tint =
    likelihood === 'high'   ? 'bg-amber-500/20 border-amber-500/40 text-amber-200' :
    likelihood === 'medium' ? 'bg-gray-700 border-gray-600 text-gray-200' :
                              'bg-gray-800/60 border-gray-700 text-gray-400'
  return (
    <span className={'inline-flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ' + tint}>
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
