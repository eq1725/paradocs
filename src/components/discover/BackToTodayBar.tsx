'use client'

/**
 * BackToTodayBar — sticky top bar shown on /report/[slug] and /phenomena/[slug]
 * when the user followed a "View Full Report" / "View Full Case" link from the
 * Today gesture feed.
 *
 * Reads the sessionStorage marker set by useTodayReturn.setTodayReturnMarker,
 * renders a "← Back to Today" link, and clears the marker on dismiss.
 *
 * SWC: var, function expressions, string concat only.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { getTodayReturnMarker, clearTodayReturnMarker } from '@/lib/hooks/useTodayReturn'

export function BackToTodayBar() {
  var [visible, setVisible] = useState(false)
  var [marker, setMarker] = useState<{ idx: number, total: number } | null>(null)

  useEffect(function () {
    var m = getTodayReturnMarker()
    if (m) {
      setMarker({ idx: m.idx, total: m.total })
      setVisible(true)
    }
  }, [])

  if (!visible || !marker) return null

  return (
    <div className="sticky-below-header bg-primary-950/85 backdrop-blur-md border-b border-primary-500/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-9">
        <Link
          href="/discover"
          className="inline-flex items-center gap-2 text-[12px] font-sans font-medium text-primary-300 hover:text-primary-200 transition-colors"
          onClick={function () {
            // Don't clear marker — /discover may want to restore position.
          }}
        >
          <span aria-hidden="true">{'←'}</span>
          Back to Today
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400 font-sans font-medium tabular-nums hidden sm:inline">
            {'You were on ' + (marker.idx + 1) + ' / ' + marker.total}
          </span>
          <button
            onClick={function () {
              clearTodayReturnMarker()
              setVisible(false)
            }}
            className="text-gray-400 hover:text-gray-200 text-[12px] transition-colors"
            aria-label="Dismiss back-to-Today banner"
          >
            {'✕'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BackToTodayBar
