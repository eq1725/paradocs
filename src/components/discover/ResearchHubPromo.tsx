'use client'

/**
 * ResearchHubPromo — Feed promo card for Research Hub subscription upsell.
 *
 * Blurred preview of Research Hub UI with CTA.
 * Injected every 15-20 cards in the feed.
 *
 * SWC compliant: var, function expressions, string concat
 */

import React from 'react'
import Link from 'next/link'
import { Sparkles, Search, Globe, ChevronRight } from 'lucide-react'

export interface PromoCardData {
  item_type: 'promo'
  id: string
  promo_type: 'research_hub'
}

interface ResearchHubPromoProps {
  isActive: boolean
}

export function ResearchHubPromo(props: ResearchHubPromoProps) {
  return (
    <div className="h-screen w-full relative overflow-hidden bg-gray-950">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(99,102,241,0.10),transparent_60%)]" />

      <div className={
        'relative z-10 h-full flex flex-col items-center justify-center px-6 sm:px-10 transition-all duration-700 ' +
        (props.isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')
      }>
        {/* Blurred Research Hub preview */}
        <div className="w-full max-w-md mb-8">
          <div className="filter blur-sm pointer-events-none select-none">
            <div className="bg-gray-900/60 rounded-xl border border-gray-800 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                  <Search className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <div className="h-3 bg-white/15 rounded w-32 mb-1" />
                  <div className="h-2 bg-white/8 rounded w-20" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="h-2.5 bg-purple-500/20 rounded w-16 mb-2" />
                  <div className="h-2 bg-white/8 rounded w-full mb-1" />
                  <div className="h-2 bg-white/5 rounded w-3/4" />
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="h-2.5 bg-blue-500/20 rounded w-20 mb-2" />
                  <div className="h-2 bg-white/8 rounded w-full mb-1" />
                  <div className="h-2 bg-white/5 rounded w-2/3" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Globe className="w-3 h-3 text-gray-600" />
                <div className="h-2 bg-white/5 rounded w-40" />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Research Hub</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-3 max-w-md">
          Go deeper with AI-powered research
        </h2>

        <p className="text-gray-400 text-center text-sm sm:text-base mb-8 max-w-sm leading-relaxed">
          Cross-reference reports, discover hidden patterns, and build your own investigation constellation.
        </p>

        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-medium transition-colors text-sm"
        >
          <span>Unlock Research Hub</span>
          <ChevronRight className="w-4 h-4" />
        </Link>

        <p className="text-xs text-gray-600 mt-3 text-center">
          Included with Core ($5.99/mo) and Pro ($14.99/mo)
        </p>
      </div>
    </div>
  )
}
