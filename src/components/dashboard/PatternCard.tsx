'use client'

/**
 * PatternCard — the single canonical card component for patterns and
 * recommendations in the Lab. Every pattern surface (top-of-feed lane,
 * Case-file-scoped strip, mid-list interleave) renders through this so
 * the visual vocabulary stays consistent.
 *
 * Two content modes:
 *   1. Library insight — derived from the user's own saves via
 *      detectInsights (historical waves, tag co-occurrence, geographic
 *      density, temporal clusters, category concentration).
 *   2. Related report — an unsaved report from the global Paradocs feed
 *      that matches the user's research footprint.
 *
 * We purposely don't emit two component shells — a single card with a
 * leading icon chip, a short headline, a one-line body, and a single
 * primary action is all that's needed, and unifying the shell is the
 * point of this refactor.
 */

import React from 'react'
import Link from 'next/link'
import {
  Waves, MapPin, Calendar, Star, GitBranch, Sparkles, Crosshair, ArrowRight, BookMarked,
} from 'lucide-react'
import type { Insight, InsightType } from '@/lib/constellation-data'
import type { RelatedReport } from '@/pages/api/constellation/related-reports'
import { classNames } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────
// Shared style table — icon + color scheme keyed by insight type.
// ─────────────────────────────────────────────────────────────────

const TYPE_STYLE: Record<InsightType | 'related_report', {
  icon: React.ComponentType<{ className?: string }>
  accent: string
  bg: string
  chipBg: string
  chipText: string
}> = {
  historical_wave: {
    icon: Waves,
    accent: 'text-cyan-300',
    bg: 'bg-gradient-to-br from-cyan-500/10 to-cyan-500/0 border-cyan-500/25',
    chipBg: 'bg-cyan-500/15',
    chipText: 'text-cyan-200',
  },
  tag_cooccurrence: {
    icon: GitBranch,
    accent: 'text-fuchsia-300',
    bg: 'bg-gradient-to-br from-fuchsia-500/10 to-fuchsia-500/0 border-fuchsia-500/25',
    chipBg: 'bg-fuchsia-500/15',
    chipText: 'text-fuchsia-200',
  },
  geographic_density: {
    icon: MapPin,
    accent: 'text-sky-300',
    bg: 'bg-gradient-to-br from-sky-500/10 to-sky-500/0 border-sky-500/25',
    chipBg: 'bg-sky-500/15',
    chipText: 'text-sky-200',
  },
  temporal_cluster: {
    icon: Calendar,
    accent: 'text-violet-300',
    bg: 'bg-gradient-to-br from-violet-500/10 to-violet-500/0 border-violet-500/25',
    chipBg: 'bg-violet-500/15',
    chipText: 'text-violet-200',
  },
  category_compelling: {
    icon: Star,
    accent: 'text-amber-300',
    bg: 'bg-gradient-to-br from-amber-500/10 to-amber-500/0 border-amber-500/25',
    chipBg: 'bg-amber-500/15',
    chipText: 'text-amber-200',
  },
  related_report: {
    icon: BookMarked,
    accent: 'text-emerald-300',
    bg: 'bg-gradient-to-br from-emerald-500/10 to-emerald-500/0 border-emerald-500/25',
    chipBg: 'bg-emerald-500/15',
    chipText: 'text-emerald-200',
  },
}

// ─────────────────────────────────────────────────────────────────
// Insight card (patterns derived from the user's own library)
// ─────────────────────────────────────────────────────────────────

interface PatternCardInsightProps {
  kind: 'insight'
  insight: Insight
  onHighlight: (entryIds: string[]) => void
  /** When true, renders wider/taller for the top-of-page lane */
  compact?: boolean
}

interface PatternCardRelatedProps {
  kind: 'related_report'
  report: RelatedReport
  compact?: boolean
}

export type PatternCardProps = PatternCardInsightProps | PatternCardRelatedProps

export default function PatternCard(props: PatternCardProps) {
  if (props.kind === 'related_report') return <RelatedReportCard {...props} />
  return <InsightPatternCard {...props} />
}

function InsightPatternCard({ insight, onHighlight, compact }: PatternCardInsightProps) {
  const style = TYPE_STYLE[insight.type] || TYPE_STYLE.temporal_cluster
  const Icon = style.icon

  return (
    <article
      className={classNames(
        'rounded-xl border backdrop-blur-sm transition-colors',
        compact ? 'p-3 min-w-[260px]' : 'p-3.5 min-w-[280px] sm:min-w-[320px]',
        style.bg,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 p-1.5 rounded-md bg-white/5">
          <Icon className={classNames('w-4 h-4', style.accent)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className={classNames('w-2.5 h-2.5', style.accent)} />
            <span className={classNames('text-[10px] uppercase tracking-wider font-semibold', style.accent)}>
              Pattern detected
            </span>
            {insight.badge && (
              <span className={classNames(
                'text-[9px] font-medium px-1.5 py-0.5 rounded',
                style.chipBg,
                style.chipText,
              )}>
                {insight.badge}
              </span>
            )}
          </div>
          <h3 className={classNames(
            'font-semibold text-white leading-snug',
            compact ? 'text-xs' : 'text-sm',
          )}>
            {insight.title}
          </h3>
          <p className={classNames(
            'text-gray-400 leading-relaxed mt-1',
            compact ? 'text-[11px] line-clamp-3' : 'text-xs line-clamp-3',
          )}>
            {insight.body}
          </p>
          <button
            onClick={() => onHighlight(insight.entryIds)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
          >
            <Crosshair className="w-3 h-3" />
            {insight.entryIds.length === 1
              ? 'Show matching save'
              : `Show ${insight.entryIds.length} matching saves`}
          </button>
        </div>
      </div>
    </article>
  )
}

function RelatedReportCard({ report, compact }: PatternCardRelatedProps) {
  const style = TYPE_STYLE.related_report
  const Icon = style.icon

  // Match reason in natural-language form
  const reason = (() => {
    switch (report.matchReason) {
      case 'category': return `Matches your interest in ${report.matchLabel}`
      case 'location': return `Near reports you've saved in ${report.matchLabel}`
      case 'tag':      return `Tagged #${report.matchLabel}`
      default:         return 'Related to your research'
    }
  })()

  const eventYear = report.eventDate ? new Date(report.eventDate).getFullYear() : null

  return (
    <article
      className={classNames(
        'rounded-xl border backdrop-blur-sm transition-colors',
        compact ? 'p-3 min-w-[260px]' : 'p-3.5 min-w-[280px] sm:min-w-[320px]',
        style.bg,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 p-1.5 rounded-md bg-white/5">
          <Icon className={classNames('w-4 h-4', style.accent)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className={classNames('w-2.5 h-2.5', style.accent)} />
            <span className={classNames('text-[10px] uppercase tracking-wider font-semibold', style.accent)}>
              New on Paradocs
            </span>
            {eventYear && (
              <span className={classNames(
                'text-[9px] font-medium px-1.5 py-0.5 rounded',
                style.chipBg,
                style.chipText,
              )}>
                {eventYear}
              </span>
            )}
          </div>
          <h3 className={classNames(
            'font-semibold text-white leading-snug line-clamp-2',
            compact ? 'text-xs' : 'text-sm',
          )}>
            {report.title}
          </h3>
          {report.summary && (
            <p className={classNames(
              'text-gray-400 leading-relaxed mt-1 line-clamp-2',
              compact ? 'text-[11px]' : 'text-xs',
            )}>
              {report.summary}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-500 truncate">{reason}</span>
            <Link
              href={`/report/${report.slug}`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300 hover:text-emerald-200 transition-colors whitespace-nowrap"
            >
              Read
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}
