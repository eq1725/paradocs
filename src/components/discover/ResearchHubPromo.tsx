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
import { Sparkles, Network, Compass, Lightbulb, ChevronRight } from 'lucide-react'

export interface PromoCardData {
  item_type: 'promo'
  id: string
  promo_type: 'research_hub'
}

interface ResearchHubPromoProps {
  isActive: boolean
}

// Three concrete benefits replace the V2 blurred placeholder preview.
// Gaia-cohort feedback: the placeholder read as "draft," not as a value
// proposition. These are the actual things Research Hub does.
var BENEFITS = [
  { icon: Network,   label: 'Cross-reference', detail: 'Connect cases across categories, regions, decades' },
  { icon: Compass,   label: 'Pattern detection', detail: 'AI finds emergent patterns across millions of reports' },
  { icon: Lightbulb, label: 'Build constellations', detail: 'Save your own case files, share with researchers' },
]

export function ResearchHubPromo(props: ResearchHubPromoProps) {
  return (
    <div className="h-full w-full relative overflow-hidden bg-gray-950" role="article" aria-label="Promotion: Research Hub">
      {/* Top-corner label pill */}
      <div className="absolute top-3 left-3 z-20">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-[10px] font-sans font-semibold uppercase tracking-wider text-indigo-200">
          From Paradocs
        </span>
      </div>

      {/* Gradient background — slightly richer than V2 */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/55 via-gray-950 to-purple-950/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_25%,rgba(99,102,241,0.15),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_75%,rgba(168,85,247,0.10),transparent_55%)]" />

      {/* Content — V3 panel review: top-aligned (not centered) so the
          eye lands on the headline first. Concrete benefit chips replace
          the blurred-card placeholder. */}
      <div className={
        'relative z-10 h-full flex flex-col items-center px-6 sm:px-10 transition-all duration-700 ' +
        'pt-[calc(env(safe-area-inset-top,0px)+18vh)] pb-[calc(80px+env(safe-area-inset-bottom,0px)+24px)] md:pb-8 ' +
        (props.isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')
      }>
        {/* Section label */}
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Research Hub</span>
        </div>

        {/* Headline */}
        <h2 className="text-2xl sm:text-3xl font-display font-bold text-white text-center mb-3 max-w-md leading-tight">
          Cases connect. Patterns emerge.
        </h2>

        <p className="text-gray-300 text-center text-sm sm:text-base mb-7 max-w-sm leading-relaxed">
          Take any case in Paradocs and trace its connections across the entire archive.
        </p>

        {/* Three concrete benefit chips — replacing V2 blurred placeholder */}
        <div className="flex flex-col gap-2.5 w-full max-w-sm mb-7">
          {BENEFITS.map(function (b, i) {
            var Icon = b.icon
            return (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-sm"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-indigo-300" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] text-white font-sans font-semibold leading-tight">{b.label}</div>
                  <div className="text-[11px] text-gray-400 font-sans leading-snug mt-0.5">{b.detail}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* CTA */}
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-medium transition-colors text-sm shadow-lg shadow-indigo-900/40"
        >
          <span>Unlock Research Hub</span>
          <ChevronRight className="w-4 h-4" />
        </Link>

        <p className="text-[11px] text-gray-500 mt-3 text-center">
          {'Included with Core ($5.99/mo) · Free 7-day trial'}
        </p>
      </div>
    </div>
  )
}
