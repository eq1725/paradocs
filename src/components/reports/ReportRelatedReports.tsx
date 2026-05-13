'use client'

/**
 * ReportRelatedReports — V10.6
 *
 * Single visible grid of related reports. Replaces the V10.5
 * split where Related Reports was rendered both as an above-fold
 * 3-card preview AND a below-fold accordion (Chase: "essentially
 * the same thing").
 *
 * Up to 5 cards rendered inline. Each card:
 *   • Real thumbnail when present
 *   • Category-themed gradient + icon when thumbnail is null
 *     (most index reports don't have hero images)
 *   • Title, category, location, event date
 *   • Hover affordance
 *
 * Mobile: single column. Tablet+: 2-up. Desktop: 2-up (since the
 * side rail is gone and the main column is now 768px wide).
 */

import React from 'react'
import Link from 'next/link'
import { BookOpen, MapPin, Calendar } from 'lucide-react'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { CATEGORY_CONFIG } from '@/lib/constants'
import type { PhenomenonCategory } from '@/lib/database.types'
import type { RelatedReport } from './ReportBelowFold'

// V10.6 — category color palette mirrors RadarVisualization /
// SourceBlock so the gradient placeholder matches the chip color
// the user already saw on the report header.
const CATEGORY_TINT: Record<string, { from: string; to: string; ring: string }> = {
  ufos_aliens:               { from: 'from-emerald-900/40',  to: 'to-gray-950', ring: 'ring-emerald-500/30' },
  cryptids:                  { from: 'from-amber-900/40',    to: 'to-gray-950', ring: 'ring-amber-500/30' },
  ghosts_hauntings:          { from: 'from-purple-900/40',   to: 'to-gray-950', ring: 'ring-purple-500/30' },
  psychic_phenomena:         { from: 'from-sky-900/40',      to: 'to-gray-950', ring: 'ring-sky-500/30' },
  consciousness_practices:   { from: 'from-indigo-900/40',   to: 'to-gray-950', ring: 'ring-indigo-500/30' },
  psychological_experiences: { from: 'from-pink-900/40',     to: 'to-gray-950', ring: 'ring-pink-500/30' },
  biological_factors:        { from: 'from-violet-900/40',   to: 'to-gray-950', ring: 'ring-violet-500/30' },
  perception_sensory:        { from: 'from-cyan-900/40',     to: 'to-gray-950', ring: 'ring-cyan-500/30' },
  religion_mythology:        { from: 'from-orange-900/40',   to: 'to-gray-950', ring: 'ring-orange-500/30' },
  esoteric_practices:        { from: 'from-lime-900/40',     to: 'to-gray-950', ring: 'ring-lime-500/30' },
  combination:               { from: 'from-slate-900/40',    to: 'to-gray-950', ring: 'ring-slate-500/30' },
  other:                     { from: 'from-slate-900/40',    to: 'to-gray-950', ring: 'ring-slate-500/30' },
}

export interface ReportRelatedReportsProps {
  items: RelatedReport[]
  className?: string
}

export default function ReportRelatedReports({ items, className }: ReportRelatedReportsProps) {
  if (!items || items.length === 0) return null
  const list = items.slice(0, 4)

  // V10.6.24 — derive a category-anchored header label from the
  // first related report. getStaticProps picks all 4 related items
  // from the same category as the current report, so items[0].category
  // is a faithful anchor. Turns generic 'Related reports' into a
  // specific 'More <Category> reports' navigation pattern.
  const anchorCategory = (list[0] && list[0].category) || null
  const anchorConfig = anchorCategory ? (CATEGORY_CONFIG as any)[anchorCategory] : null
  const anchorLabel = (anchorConfig && anchorConfig.label) || null
  const heading = anchorLabel ? 'More ' + anchorLabel + ' reports' : 'Related reports'
  const exploreHref = anchorCategory ? '/explore?category=' + encodeURIComponent(anchorCategory) : null

  return (
    <section className={className || ''} aria-label="Related reports">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-semibold text-white">
            {heading}
            <span className="text-gray-500 font-normal"> · {list.length} showing</span>
          </h2>
        </div>
        {exploreHref && (
          <Link
            href={exploreHref}
            className="text-xs text-purple-300 hover:text-purple-200 font-medium inline-flex items-center gap-1 transition-colors"
          >
            See all
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {list.map(r => (
          <RelatedCard key={r.id} report={r} />
        ))}
      </div>
    </section>
  )
}

// ── Subcomponents ───────────────────────────────────────────

function RelatedCard({ report }: { report: RelatedReport }) {
  const tint = CATEGORY_TINT[report.category || 'combination'] || CATEGORY_TINT.combination

  // V10.6.1 — richer card sub-line. Was previously a slug-style
  // join ("psychic_phenomena · United Kingdom") which looked
  // technical. New shape uses friendly category label as a kicker
  // and a separate meta line with location + date icons.
  const categoryConfig = (CATEGORY_CONFIG as any)[report.category || 'combination']
  const categoryLabel = (categoryConfig && categoryConfig.label) || ''
  const dateStr = formatEventDate(report.event_date)
  const locationStr = report.location_name && report.location_name.trim() ? report.location_name.trim() : null

  return (
    <Link
      href={'/report/' + report.slug}
      className="group flex items-stretch gap-3 p-2.5 rounded-xl bg-gray-900/50 hover:bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors min-h-[84px]"
    >
      {/* Thumbnail or category-gradient placeholder */}
      <div
        className={
          'relative w-16 h-16 rounded-lg flex-shrink-0 overflow-hidden border border-gray-800 bg-gradient-to-br ' +
          tint.from + ' ' + tint.to
        }
      >
        {report.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={report.thumbnail_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-60">
            <CategoryIcon category={(report.category || 'combination') as PhenomenonCategory} size={28} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        {categoryLabel && (
          <p className="text-[9px] uppercase tracking-widest font-semibold text-gray-500 leading-tight">
            {categoryLabel}
          </p>
        )}
        <h3 className="text-[13px] font-medium text-white leading-snug line-clamp-2 group-hover:text-purple-200 transition-colors">
          {report.title}
        </h3>
        {(locationStr || dateStr) && (
          <div className="flex items-center gap-2.5 text-[11px] text-gray-400 mt-0.5">
            {locationStr && (
              <span className="inline-flex items-center gap-1 min-w-0 truncate">
                <MapPin className="w-2.5 h-2.5 text-emerald-400/70 flex-shrink-0" />
                <span className="truncate">{locationStr}</span>
              </span>
            )}
            {dateStr && (
              <span className="inline-flex items-center gap-1 flex-shrink-0">
                <Calendar className="w-2.5 h-2.5 text-amber-400/70" />
                {dateStr}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// V10.6.1 — better formatting than just-the-year. Surfaces month
// when we have it (Mar 1972) and falls back to year-only or null.
function formatEventDate(raw?: string | null): string | null {
  if (!raw) return null
  const t = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split('-').map(Number)
    // Sentinel: -01-01 with no real day usually means year-only.
    if (m === 1 && d === 1) return String(y)
    return MONTHS[m - 1] + ' ' + y
  }
  if (/^\d{4}-\d{2}$/.test(t)) {
    const [y, m] = t.split('-').map(Number)
    return MONTHS[m - 1] + ' ' + y
  }
  if (/^\d{4}$/.test(t)) return t
  return null
}
