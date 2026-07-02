'use client'

/**
 * OnThisWeekRail — desktop-only left sidebar on /discover.
 *
 * V11.18.17 — Desktop 3-column layout fix. Pre-V11.18.17 the
 * discover viewport on ≥1024px showed a ~512px center column
 * surrounded by empty margins on either side. The right side
 * already had a CONNECTED CASES sidebar (V10.7.E.23) but the
 * left side was barren. This rail fills the left column with
 * the 6 most-recent approved reports — a documentary-register
 * "what landed in the archive this week" surface.
 *
 * Data source: /api/homepage/recent-reports (already powers
 * the marketing homepage ticker — same endpoint, same fields,
 * different presentation).
 *
 * Visual register:
 *   - Hairline borders
 *   - 4px category accent stripe on the left edge of each card
 *   - Small thumbnail-less rows (Apple-aligned, content-rich)
 *   - Sticky positioning so the rail stays visible while the
 *     center feed scrolls.
 *
 * SWC: var, function expressions, string concat — no const/let,
 * no arrow functions in JSX, no template literals.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { CATEGORY_CONFIG } from '@/lib/constants'

// Mirror of CATEGORY_COLORS in /discover so the rail and the
// feed cards use the same hairline accents per category.
var CATEGORY_COLORS: Record<string, string> = {
  ufos_aliens: '#4fc3f7',
  cryptids: '#a5d6a7',
  ghosts_hauntings: '#ce93d8',
  psychic_phenomena: '#b39ddb',
  consciousness_practices: '#ffb74d',
  psychological_experiences: '#80deea',
  perception_sensory: '#ffcc80',
  religion_mythology: '#fff176',
  esoteric_practices: '#f48fb1',
}

interface RecentReport {
  id: string
  title: string
  slug: string
  category: string | null
  location_name: string | null
  country: string | null
  summary: string | null
  created_at: string
}

function formatRelative(iso: string): string {
  if (!iso) return ''
  var then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  var now = Date.now()
  var diffH = Math.max(0, Math.floor((now - then) / 3600000))
  if (diffH < 1) return 'just now'
  if (diffH < 24) return diffH + 'h ago'
  var diffD = Math.floor(diffH / 24)
  if (diffD === 1) return '1d ago'
  if (diffD < 7) return diffD + 'd ago'
  return Math.floor(diffD / 7) + 'w ago'
}

export function OnThisWeekRail() {
  var [reports, setReports] = useState<RecentReport[]>([])
  var [loading, setLoading] = useState(true)

  useEffect(function () {
    var aborted = false
    // V11.38 P0-5 — diverse=1 applies category + location caps so an
    // ingest burst (e.g. BFRO) can't fill all 6 slots with one
    // category/state. See APP_EXPERIENCE_PANEL_REVIEW.md §1.4.
    fetch('/api/homepage/recent-reports?limit=6&diverse=1')
      .then(function (res) { return res.ok ? res.json() : null })
      .then(function (data) {
        if (aborted) return
        if (data && Array.isArray(data.reports)) {
          setReports(data.reports as RecentReport[])
        }
      })
      .catch(function () {})
      .finally(function () { if (!aborted) setLoading(false) })
    return function () { aborted = true }
  }, [])

  return (
    <aside
      className="hidden lg:flex flex-col w-[280px] xl:w-[300px] border-r border-gray-800/50 bg-gray-950 overflow-hidden"
      aria-label="Recently catalogued"
    >
      {/* Header — mirrors the Connected Cases header opposite for
          visual symmetry across the 3-column layout. */}
      <div className="px-5 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-primary-300">{'◉'}</span>
            <span className="text-[10px] text-gray-400 font-sans font-medium uppercase tracking-wider">
              On this week
            </span>
          </div>
          <span className="text-[10px] text-gray-600 font-sans">
            {reports.length > 0 ? 'New' : ''}
          </span>
        </div>
      </div>

      {/* Card stack — internally scrollable so the rail can host
          more rows than the viewport without forcing the row to
          grow taller than the centred card pane (which would
          push the center card off-screen on shorter laptops). */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
        {loading && reports.length === 0 && (
          <>
            <div className="today-skeleton h-[68px] rounded-xl" />
            <div className="today-skeleton h-[68px] rounded-xl" />
            <div className="today-skeleton h-[68px] rounded-xl" />
            <div className="today-skeleton h-[68px] rounded-xl" />
          </>
        )}

        {!loading && reports.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-xs font-sans">No recent reports loaded yet</p>
          </div>
        )}

        {reports.map(function (r) {
          var cat = r.category || ''
          var catColor = CATEGORY_COLORS[cat] || '#b39ddb'
          var catConfig = CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG]
          var catLabel = catConfig?.label || (cat ? cat.replace(/_/g, ' ') : '')
          var loc = r.location_name || r.country || ''
          var rel = formatRelative(r.created_at)
          var metaParts: string[] = []
          if (loc) metaParts.push(loc)
          if (rel) metaParts.push(rel)
          var meta = metaParts.join(' · ')

          return (
            <Link
              key={r.id}
              href={'/report/' + r.slug}
              className="block bg-white/[0.025] border border-white/[0.07] rounded-xl px-3.5 py-3 transition-colors hover:bg-white/[0.05] cursor-pointer"
              style={{ borderLeft: '3px solid ' + catColor }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-[9px] font-sans font-semibold uppercase tracking-wider"
                  style={{ color: catColor }}
                >
                  {catLabel}
                </span>
                {meta && (
                  <span className="text-[9px] text-gray-400 font-sans truncate">
                    {meta}
                  </span>
                )}
              </div>
              <p className="text-sm font-display font-semibold text-gray-200 leading-snug line-clamp-2">
                {r.title}
              </p>
            </Link>
          )
        })}
      </div>

      {/* Footer link — keeps the rail anchored visually and
          gives the user a way to dive into the wider archive. */}
      {!loading && reports.length > 0 && (
        <div className="px-5 py-3 border-t border-white/5 flex-shrink-0">
          <Link
            href="/explore"
            className="text-[11px] text-gray-400 hover:text-primary-300 font-sans transition-colors"
          >
            {'Browse the full archive →'}
          </Link>
        </div>
      )}
    </aside>
  )
}

export default OnThisWeekRail
