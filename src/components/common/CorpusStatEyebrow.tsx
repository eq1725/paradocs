'use client'

// V11.18.x — CorpusStatEyebrow
//
// A small documentary-register line mounted at the top of /discover,
// /explore, and /lab. Replaces the hardcoded "200,000+" copy that used
// to sit in EmptyDossier / LabPromo / Today header fallback stats.
//
// Per UI_SHIPPING_ROADMAP_V2 Sprint 1A additions: a single one-line
// archival cue that grounds every front-door tab in the catalogue's
// real size. SWR-style fetch from /api/public/stats; falls back to a
// hardcoded "200,000+" while the count is loading or unavailable.
//
// Editorial register: austere, archival. Never spooky, never
// promotional. Helena-cleared copy.
//
// SWC: var + function() per repo convention.

import React, { useEffect, useState } from 'react'

interface CorpusStats {
  catalogued_accounts_display: string
  catalogued_accounts: number
}

var FALLBACK_DISPLAY = '200,000+'

export function CorpusStatEyebrow() {
  var [display, setDisplay] = useState<string>(FALLBACK_DISPLAY)

  useEffect(function () {
    var cancelled = false
    fetch('/api/public/stats')
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (data: CorpusStats | null) {
        if (cancelled || !data) return
        var label = data.catalogued_accounts_display
        if (label && typeof label === 'string') setDisplay(label)
      })
      .catch(function () { /* keep fallback */ })
    return function () { cancelled = true }
  }, [])

  return (
    <div className="w-full">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-2 text-center">
        <p
          className="text-[10.5px] sm:text-[11px] font-sans font-normal text-gray-500 tracking-wide leading-relaxed"
          aria-label="Archive size"
        >
          {'Across ' + display + ' catalogued accounts. — Paradocs Archive'}
        </p>
      </div>
      {/* hairline divider */}
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-px bg-white/[0.06]" />
      </div>
    </div>
  )
}

export default CorpusStatEyebrow
