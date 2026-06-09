'use client'

// V11.18.1 — Sprint 1A-2 — PatternsRail.
//
// Replaces the retired `CrossExperienceHeader` slot on /lab (My Record)
// per V2 roadmap §5.3. Fetches /api/lab/patterns/list?limit=5 and
// renders a horizontal scroll-x rail of FindingCards (rail variant).
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
      var url = '/api/lab/patterns/list?limit=5'
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
      <div className="mb-3 px-1">
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
      <div
        className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory"
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
    </section>
  )
}
