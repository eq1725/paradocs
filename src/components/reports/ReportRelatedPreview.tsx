'use client'

/**
 * ReportRelatedPreview — V10.5
 *
 * 3-card horizontal preview of related reports, always visible
 * above the below-fold accordion. Casual readers see the natural
 * "read next" loop without having to tap into an accordion.
 *
 * Pulled out of ReportBelowFold so the preview can render
 * inline-above-fold while the full N-item list stays in the
 * collapsible Related Reports disclosure below.
 */

import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { RelatedReport } from './ReportBelowFold'

export interface ReportRelatedPreviewProps {
  items: RelatedReport[]
  /** Optional: scroll-target id of the full accordion (for the "view all" link). */
  fullSectionAnchor?: string
  className?: string
}

export default function ReportRelatedPreview({ items, fullSectionAnchor, className }: ReportRelatedPreviewProps) {
  if (!items || items.length === 0) return null
  const preview = items.slice(0, 3)
  const total = items.length

  return (
    <section className={'my-6 ' + (className || '')} aria-label="Related reports preview">
      <header className="flex items-center justify-between gap-2 mb-3 px-0.5">
        <h2 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
          Read next
        </h2>
        {total > 3 && fullSectionAnchor && (
          <a
            href={'#' + fullSectionAnchor}
            className="inline-flex items-center gap-0.5 text-[11px] text-purple-300 hover:text-purple-200 transition-colors"
          >
            View all {total}
            <ChevronRight className="w-3 h-3" />
          </a>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {preview.map(r => (
          <Link
            key={r.id}
            href={'/report/' + r.slug}
            className="group block rounded-xl bg-gray-900/50 border border-gray-800 hover:border-gray-700 hover:bg-gray-900 p-3 transition-colors"
          >
            <div className="flex items-start gap-2 mb-1">
              {r.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.thumbnail_url}
                  alt=""
                  className="w-10 h-10 rounded-md object-cover bg-gray-900 flex-shrink-0 border border-gray-800"
                  loading="lazy"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="w-10 h-10 rounded-md bg-gradient-to-br from-purple-900/40 to-gray-900 border border-gray-800 flex-shrink-0" aria-hidden />
              )}
              <h3 className="text-[13px] font-medium text-white leading-snug line-clamp-2 group-hover:text-purple-200 transition-colors">
                {r.title}
              </h3>
            </div>
            <p className="text-[10px] text-gray-500 truncate">
              {[r.category, r.location_name, r.event_date].filter(Boolean).join(' · ')}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}
