'use client'

/**
 * LiveActivityTicker — V11.17.3
 *
 * The "what's happening right now" element panel-recommended for the
 * mass-market identity-formation homepage. Shows the most recent
 * approved reports so the visitor learns *people are here* before
 * any committal interaction.
 *
 * Sourcing: GET /api/discover/feed-v2?limit=8&sort=newest. The feed
 * endpoint already returns approved reports with title, summary,
 * location, and event_date fields populated. We render a thin
 * horizontally-scrolling row on mobile and a balanced 4-card grid
 * on desktop.
 *
 * Behavior:
 *   - Initial fetch on mount
 *   - Re-fetch every 60s (silent; no skeleton flash if cached)
 *   - Mobile: snap-x scroll with 80vw cards, 3 visible + peek
 *   - Desktop: 4-column grid, max-w-6xl
 *   - "N minutes ago" relative time, updates every 30s without
 *     re-fetch (just a setInterval that bumps state)
 *
 * Visual treatment:
 *   - No section heading — this *is* the proof-of-life, headings
 *     would over-frame it. A small "right now" pulse + line is enough.
 *   - Compact cards: category color dot, hook (line-clamped), location,
 *     relative time. No images, no avatars, no engagement counts —
 *     keeps it readable and not feed-product-overloaded.
 *
 * Failure mode: if the fetch errors or returns 0, the component
 * renders nothing (no error UI on the marketing page).
 *
 * SWC compat: var + function() form.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

interface RecentReport {
  id: string
  title: string
  slug: string
  category: string
  location_name?: string | null
  country?: string | null
  created_at: string
  summary?: string | null
}

function relativeTime(iso: string, now: number): string {
  var then = Date.parse(iso)
  if (!Number.isFinite(then)) return 'recently'
  var diffMs = Math.max(0, now - then)
  var diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return diffMin + ' min ago'
  var diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return diffH + ' hr ago'
  var diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'yesterday'
  if (diffD < 7) return diffD + ' days ago'
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ReportCard({ report, now }: { report: RecentReport; now: number }) {
  var config = (CATEGORY_CONFIG as any)[report.category]
  var color = (config && config.color) || 'text-gray-400'
  var label = (config && config.label) || 'Report'
  var locText = report.location_name || report.country || ''
  return (
    <Link
      href={'/report/' + report.slug}
      className="block min-w-[78vw] sm:min-w-0 sm:flex-1 snap-start rounded-xl border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/15 transition-colors p-3.5"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={classNames('text-[11px] font-medium tracking-wide', color)}>{label}</span>
        <span className="text-[10px] text-gray-600 ml-auto tabular-nums">{relativeTime(report.created_at, now)}</span>
      </div>
      <p className="text-[13px] text-gray-200 leading-snug line-clamp-2 mb-1.5">
        {report.title}
      </p>
      {locText && (
        <p className="text-[11px] text-gray-500">{locText}</p>
      )}
    </Link>
  )
}

export default function LiveActivityTicker() {
  var [reports, setReports] = useState<RecentReport[]>([])
  var [now, setNow] = useState(function() { return Date.now() })

  // Initial fetch + 60s refresh
  useEffect(function() {
    var cancelled = false
    function load() {
      fetch('/api/homepage/recent-reports?limit=8')
        .then(function(r) { return r.ok ? r.json() : null })
        .then(function(data) {
          if (cancelled || !data) return
          var rows = data.reports
          if (!Array.isArray(rows)) return
          var clean = rows
            .filter(function(r: any) { return r && r.id && r.title && r.slug && r.created_at })
            .slice(0, 8) as RecentReport[]
          setReports(clean)
        })
        .catch(function() { /* silent — marketing page; no error UI */ })
    }
    load()
    var refresh = setInterval(load, 60_000)
    return function() { cancelled = true; clearInterval(refresh) }
  }, [])

  // Tick "now" every 30s so the "N min ago" labels update without re-fetch.
  useEffect(function() {
    var t = setInterval(function() { setNow(Date.now()) }, 30_000)
    return function() { clearInterval(t) }
  }, [])

  // If we never got reports (or fetch failed), render nothing on the
  // marketing page — a "loading…" or empty state would be worse than
  // simply omitting the section.
  if (reports.length === 0) return null

  return (
    <section className="border-t border-white/5 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Tiny "right now" tag — not a section heading; just a
            pulse that signals the data below is live. */}
        <div className="flex items-center gap-2 mb-4">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.14em] text-gray-400 font-medium">
            Right now on Paradocs — you&rsquo;re not the only one.
          </span>
        </div>

        {/* Mobile: horizontally-scrolling row with snap. Desktop: 4-col grid. */}
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-x-visible sm:px-0 sm:mx-0 no-scrollbar">
          {reports.slice(0, 4).map(function(r) {
            return <ReportCard key={r.id} report={r} now={now} />
          })}
        </div>
      </div>
    </section>
  )
}
