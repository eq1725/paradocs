'use client'

// V11.18.1 — Sprint 1A-2 — PatternsRail.
// V11.18.19 — Sprint 1G — desktop 2-column grid treatment.
//
// Replaces the retired `CrossExperienceHeader` slot on /lab (My Record)
// per V2 roadmap §5.3. Fetches /api/lab/patterns/list?limit=6 and
// renders ONE of two shapes depending on viewport:
//
//   - Mobile  (< lg / 1024px) — horizontal scroll-x rail of FindingCards
//                                (rail variant). Unchanged from V11.18.1;
//                                horizontal scroll is the right grammar
//                                for a discovery surface on a narrow
//                                viewport.
//   - Desktop (≥ lg)          — 2-column grid of compact FindingCards.
//                                Founder review: horizontal scroll on
//                                desktop reads as clunky on the My Record
//                                page because the user has a wide canvas
//                                and would rather scan than scroll-past.
//                                The grid uses the `rail` variant in
//                                `desktopGrid` mode (prose-only, no data
//                                zone, max-height clamp, line-clamped
//                                prose), with up to 6 cards shown.
//
// When the user is authenticated, the fetch also includes
// `with_user_overlay=1` so each card can render the "N of your M
// accounts share this trait." slab when factually true.
//
// On empty / error: renders nothing. No broken-state placeholder per
// the brief — the surface should fail silent until the founder
// publishes at least one Finding.
//
// SWC: var + function() per repo convention.

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import FindingCard from '@/components/patterns/FindingCard'
import type { Finding } from '@/components/patterns/FindingCard'

export default function PatternsRail() {
  var [findings, setFindings] = useState<Finding[] | null>(null)
  var [loading, setLoading] = useState(true)

  useEffect(function () {
    var cancelled = false
    setLoading(true)
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      // V11.18.19 — Sprint 1G. Bumped limit from 5 → 6 so the desktop
      // 2-column grid renders an even three rows. Mobile still uses
      // horizontal scroll and is unaffected by the larger payload.
      var url = '/api/lab/patterns/list?limit=6'
      var headers: Record<string, string> = {}
      if (session && session.access_token) {
        url += '&with_user_overlay=1'
        headers.Authorization = 'Bearer ' + session.access_token
      }
      fetch(url, { headers: headers })
        .then(function (r) { return r.ok ? r.json() : null })
        .then(function (payload) {
          if (cancelled) return
          var list: Finding[] = (payload && payload.findings) || []
          setFindings(list)
        })
        .catch(function () {
          if (!cancelled) setFindings([])
        })
        .finally(function () {
          if (!cancelled) setLoading(false)
        })
    })
    return function () { cancelled = true }
  }, [])

  if (loading) {
    // Silent loading state — no spinner. The rail is non-blocking;
    // showing skeletons would compete with the dossier above it for
    // attention. Brief explicitly said empty / error renders nothing.
    return null
  }
  if (!findings || findings.length === 0) return null

  return (
    <section
      aria-label="Patterns from the archive"
      className="my-6"
    >
      {/*
        V11.18.3 — Sprint 1A polish round 2. Added "See all patterns →"
        link in the rail header. Founder feedback: the standalone
        /lab/patterns grid was unreachable without typing the URL — no
        nav entry existed anywhere. Letterboxd-style rail headers all
        carry a "See all" link to the full surface; this matches the
        established pattern in /lab.
      */}
      <div className="mb-3 px-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="text-white"
            style={{
              fontFamily: "'Changa One', Changa, system-ui, sans-serif",
              fontSize: '15px',
              lineHeight: 1.3,
            }}
          >
            Patterns from the archive
          </h3>
          <p className="text-[12px] text-gray-400 mt-1 leading-snug">
            Across the corpus — touched on your record when relevant.
          </p>
        </div>
        <Link
          href="/lab/patterns"
          className={
            'inline-flex items-center gap-1 shrink-0 min-h-[44px] -my-2 py-2 ' +
            'text-[12px] font-medium text-purple-300 hover:text-purple-200 ' +
            'transition-colors border-b border-purple-300/40 hover:border-purple-200/60 ' +
            'whitespace-nowrap leading-none pb-1'
          }
          aria-label="See all patterns"
        >
          See all patterns
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Mobile (< lg): horizontal scroll rail. Unchanged. */}
      <div
        className="lg:hidden flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'thin' }}
      >
        {findings.map(function (f) {
          return (
            <div key={f.id} className="snap-start">
              <FindingCard finding={f} variant="rail" />
            </div>
          )
        })}
      </div>

      {/* V11.18.19 — Sprint 1G. Desktop (≥ lg): 2-column grid. The
          founder flagged the horizontal scroll as clunky at desktop
          widths. The grid uses the same `rail` FindingCard variant in
          `desktopGrid` mode so each cell is the compact prose-only
          card with the V11.18.19 visual register. Up to 6 cards = 3
          rows × 2 columns. */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-3">
        {findings.slice(0, 6).map(function (f) {
          return (
            <FindingCard key={f.id} finding={f} variant="rail" desktopGrid />
          )
        })}
      </div>
    </section>
  )
}
