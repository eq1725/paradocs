'use client'

// V11.18.2 — Sprint 1A polish — CorpusStatEyebrow
//
// A small documentary-register strip mounted at the top of /discover,
// /explore, and /lab. Establishes corpus scale + provenance in two
// hairline-divided columns:
//
//   [ 237,000+ catalogued accounts ]  │  [ Paradocs Archive · last updated [date] ]
//
// The whole strip is a Link to /sources (the Sources & Methodology
// page shipped in Copyright Sprint 1). Tapping the eyebrow takes the
// user to the trust / methodology surface — small UX move, big trust
// payoff per the cross-surface coherence audit.
//
// Editorial register: austere, archival. Never spooky, never
// promotional. Helena-cleared copy. Mobile-first — strip stacks on
// narrow viewports.
//
// SWC: var + function() per repo convention.

import React, { useEffect, useState } from 'react'
import Link from 'next/link'

interface CorpusStats {
  catalogued_accounts_display: string
  catalogued_accounts: number
  last_updated?: string
}

var FALLBACK_DISPLAY = '237,000+'
// V11.18.2 — fall back to a static recent month if the API doesn't
// emit a last_updated value. The string is short, archival ("June
// 2026" style), and never contains a precise date so we don't fake
// freshness.
var FALLBACK_UPDATED = 'June 2026'

export function CorpusStatEyebrow() {
  var [display, setDisplay] = useState<string>(FALLBACK_DISPLAY)
  var [updated, setUpdated] = useState<string>(FALLBACK_UPDATED)

  useEffect(function () {
    var cancelled = false
    fetch('/api/public/stats')
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (data: CorpusStats | null) {
        if (cancelled || !data) return
        var label = data.catalogued_accounts_display
        if (label && typeof label === 'string') setDisplay(label)
        var last = data.last_updated
        if (last && typeof last === 'string') setUpdated(last)
      })
      .catch(function () { /* keep fallback */ })
    return function () { cancelled = true }
  }, [])

  return (
    <div className="w-full">
      <Link
        href="/sources"
        aria-label="Catalogue scale and methodology"
        className={
          'group block w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 ' +
          'pt-3 pb-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/30 rounded-sm'
        }
        style={{ borderBottom: '1px solid rgba(144,0,240,0.18)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
          {/* Primary — catalogue scale */}
          <span
            className="font-sans font-semibold uppercase tracking-[0.18em] leading-tight text-[11px] sm:text-[12px] group-hover:text-white transition-colors"
            style={{ color: '#d4d4d0' }}
          >
            <span className="tabular-nums">{display}</span>{' '}
            <span className="font-normal" style={{ color: '#a8a8a3' }}>
              catalogued accounts
            </span>
          </span>

          {/* Hairline vertical rule, side-by-side only */}
          <span
            aria-hidden="true"
            className="hidden sm:inline-block h-3 w-px"
            style={{ background: 'rgba(255,255,255,0.16)' }}
          />

          {/* Secondary — provenance + freshness */}
          <span
            className="font-sans uppercase tracking-[0.16em] leading-tight text-[10px] sm:text-[10.5px]"
            style={{ color: '#8a8a85' }}
          >
            Paradocs Archive
            <span aria-hidden="true" className="mx-1.5">·</span>
            <span className="normal-case tracking-normal">last updated {updated}</span>
          </span>
        </div>
      </Link>
    </div>
  )
}

export default CorpusStatEyebrow
