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
import { BookOpen } from 'lucide-react'
import CategoryIcon from '@/components/ui/CategoryIcon'
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
  const list = items.slice(0, 5)

  return (
    <section className={className || ''} aria-label="Related reports">
      <header className="flex items-center gap-2 mb-3">
        <BookOpen className="w-4 h-4 text-purple-400" />
        <h2 className="text-sm font-semibold text-white">
          Related reports
          <span className="text-gray-500 font-normal"> · {list.length} nearby</span>
        </h2>
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
  const sub = [report.location_name, formatYear(report.event_date)].filter(Boolean).join(' · ')

  return (
    <Link
      href={'/report/' + report.slug}
      className="group flex items-stretch gap-3 p-2.5 rounded-xl bg-gray-900/50 hover:bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors min-h-[80px]"
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
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h3 className="text-[13px] font-medium text-white leading-snug line-clamp-2 group-hover:text-purple-200 transition-colors">
          {report.title}
        </h3>
        {sub && (
          <p className="text-[11px] text-gray-500 mt-1 truncate">
            {sub}
          </p>
        )}
      </div>
    </Link>
  )
}

function formatYear(raw?: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/^(\d{4})/)
  return m ? m[1] : null
}
