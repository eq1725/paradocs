'use client'

/**
 * OnThisDateCard — Historical "on this date" card for the Discover feed.
 *
 * V11.18.59 — Unified into the shared "insight card" visual system used by the
 * Cluster and Finding cards (dark bg, 1px brand-purple left rail, 180deg
 * darkening gradient, purple eyebrow pill, #9000F0 hero accent). Previously it
 * used a bespoke amber/orange scheme that read as a different design language.
 * Also supports both phenomenon and report items (item.kind / item.href) so the
 * card can surface a notable historical report when no phenomenon matches today.
 *
 * SWC compliant: var, function expressions, string concat
 */

import React from 'react'
import Link from 'next/link'
import { Calendar, ChevronRight } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import CategoryIcon from '@/components/ui/CategoryIcon'
import type { PhenomenonCategory } from '@/lib/database.types'

export interface OnThisDateData {
  item_type: 'on_this_date'
  kind?: 'phenomenon' | 'report'
  id: string
  name: string
  slug: string
  href?: string
  category: string
  ai_summary: string | null
  event_year: number
  first_reported_date: string
}

interface OnThisDateCardProps {
  item: OnThisDateData
  isActive: boolean
}

export function OnThisDateCard(props: OnThisDateCardProps) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var categoryLabel = config ? config.label : item.category
  var categoryKey = item.category as PhenomenonCategory

  var yearsAgo = new Date().getFullYear() - item.event_year
  var yearsText = yearsAgo === 1 ? '1 year ago' : yearsAgo + ' years ago'

  var monthDay = ''
  try {
    var d = new Date(item.first_reported_date)
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    monthDay = months[d.getMonth()] + ' ' + d.getDate()
  } catch (e) {
    monthDay = 'Today'
  }

  var href = item.href || (item.kind === 'report' ? '/report/' + item.slug : '/phenomena/' + item.slug)
  var ctaText = item.kind === 'report' ? 'Read the account' : 'Read the full story'

  return (
    <div className="h-full w-full relative overflow-hidden bg-gray-950" role="article" aria-label="On this date card">
      {/* Shared insight-card chrome: 1px brand-purple left rail + 180deg
          darkening gradient (matches ClusteringCard / FindingCard). */}
      <div
        className="absolute top-0 bottom-0 left-0 w-px pointer-events-none"
        style={{ background: 'rgba(144,0,240,0.35)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, transparent 0%, transparent 55%, rgba(0,0,0,0.28) 100%)' }}
      />

      <div className={
        'relative z-10 h-full flex flex-col items-center justify-center px-6 sm:px-10 text-center transition-all duration-700 ' +
        'pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-[calc(80px+env(safe-area-inset-bottom,0px)+24px)] md:pb-8 ' +
        (props.isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')
      }>
        {/* Eyebrow pill — same style as the Cluster card eyebrow */}
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-[10px] font-sans font-semibold uppercase tracking-[0.14em] text-purple-200/90">
            <Calendar className="w-3 h-3" />
            On This Date
          </span>
        </div>

        {/* Year callout — brand-purple hero accent (matches cluster hero glyph) */}
        <div className="mb-3">
          <span className="font-display font-semibold leading-none tracking-tight" style={{ color: '#9000F0', fontSize: 'clamp(56px, 16vw, 76px)' }}>{item.event_year}</span>
        </div>

        {/* Date subtitle — quiet small-caps, like the cluster trailing line */}
        <p className="font-sans text-[10.5px] uppercase tracking-[0.18em] text-gray-400 mb-6">
          {monthDay + ' — ' + yearsText}
        </p>

        {/* Title */}
        <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white mb-3 max-w-md leading-tight tracking-[-0.005em]">
          {item.name}
        </h2>

        {/* Category badge */}
        <div className="flex items-center gap-1.5 mb-4">
          <CategoryIcon category={categoryKey} size={14} />
          <span className="text-xs text-gray-400 font-medium">{categoryLabel}</span>
        </div>

        {/* Summary */}
        {item.ai_summary && (
          <p className="text-gray-300 text-sm sm:text-base mb-8 max-w-sm leading-relaxed line-clamp-4">
            {item.ai_summary}
          </p>
        )}

        {/* CTA — brand-purple (no longer amber) */}
        <Link
          href={href}
          className="inline-flex items-center gap-2 px-6 py-3 text-white rounded-full font-medium transition-colors text-sm"
          style={{ background: '#9000F0' }}
        >
          <span>{ctaText}</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
