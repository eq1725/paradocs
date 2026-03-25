'use client'

/**
 * CaseViewGate — Full-page gate screen shown after free case view limit.
 *
 * Design rules from brief:
 *   - ALWAYS reference the specific report/category
 *   - Include specific numbers (phenomena, related reports)
 *   - Pitch full subscription VALUE
 *   - Show blurred Paradocs Analysis preview
 *   - Use session depth in the pitch
 *
 * SWC compliant: var, function expressions, string concat
 */

import React from 'react'
import Link from 'next/link'
import { Lock, Sparkles, ArrowRight } from 'lucide-react'

interface CaseViewGateProps {
  category: string
  locationName: string | null
  linkedCount: number
  connectionCount: number
  sessionDepth: number
}

export function CaseViewGate(props: CaseViewGateProps) {
  var categoryDisplay = (props.category || 'paranormal').replace(/_/g, ' ')

  // Make first letter uppercase
  categoryDisplay = categoryDisplay.charAt(0).toUpperCase() + categoryDisplay.slice(1)

  var depthMessage = ''
  if (props.sessionDepth >= 5) {
    depthMessage = 'You\u2019ve explored ' + props.sessionDepth + ' cases this session \u2014 you\u2019re clearly curious. Core gives you unlimited access.'
  } else if (props.sessionDepth >= 3) {
    depthMessage = 'You\u2019ve been diving deep. Unlock unlimited access to keep exploring.'
  }

  return (
    <div className="h-screen w-full relative overflow-hidden bg-gray-950">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-950/30 via-gray-950 to-gray-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(144,0,240,0.08),transparent_60%)]" />

      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6">
        {/* Blurred preview */}
        <div className="w-full max-w-lg mb-8 relative">
          <div className="filter blur-md pointer-events-none select-none">
            <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h3 className="text-lg text-white font-semibold">Paradocs Analysis</h3>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-white/10 rounded w-full" />
                <div className="h-4 bg-white/10 rounded w-5/6" />
                <div className="h-4 bg-white/10 rounded w-4/6" />
                <div className="h-3 bg-white/5 rounded w-full mt-4" />
                <div className="h-3 bg-white/5 rounded w-3/4" />
              </div>
            </div>
          </div>
          {/* Lock overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 bg-gray-900/80 rounded-full flex items-center justify-center border border-gray-700">
              <Lock className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Heading */}
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-3">
          Keep exploring the unknown
        </h2>

        {/* Contextual copy */}
        <p className="text-gray-300 text-center mb-3 max-w-md text-sm sm:text-base leading-relaxed">
          {'This ' + categoryDisplay + ' case' + (props.locationName ? ' from ' + props.locationName : '') +
           ' connects to ' + props.linkedCount + ' phenomena and ' + props.connectionCount + ' related reports.' +
           ' Unlock unlimited access to explore every connection.'}
        </p>

        {/* Session depth message */}
        {depthMessage && (
          <p className="text-purple-300/80 text-center text-sm mb-6 max-w-md italic">
            {depthMessage}
          </p>
        )}
        {!depthMessage && <div className="mb-6" />}

        {/* CTA buttons */}
        <div className="w-full max-w-sm space-y-3">
          <Link
            href="/pricing"
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-semibold transition-colors"
          >
            <span>Start Core \u2014 $5.99/mo</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-xs text-gray-500 text-center">
            Unlimited case access, full search, AI analysis, and more
          </p>
        </div>

        {/* Dismiss */}
        <button
          className="mt-6 text-sm text-gray-600 hover:text-gray-400 transition-colors"
        >
          Continue browsing (free reports reset tomorrow)
        </button>
      </div>
    </div>
  )
}
