'use client'

/**
 * InlineSignupCTA — repeatable conversion banner used between
 * homepage content sections.
 *
 * Panel-feedback (May 2026). Industry data shows CTA placement at
 * ~every 1.5 viewport heights catches the user's intent peak. We
 * sprinkle these between FeedShowcase, LabShowcase, and at the
 * footer rather than relying on a single hero button.
 *
 * Variants:
 *   primary    — bold purple button, used after high-intent surfaces
 *   secondary  — outlined button, used as a softer follow-up
 *
 * SWC: var + function() form.
 */

import React from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'

interface InlineSignupCTAProps {
  headline?: string
  subhead?: string
  variant?: 'primary' | 'secondary'
  /** PostHog event name; defaults to a generic 'inline_cta_click'. */
  trackAs?: string
}

export default function InlineSignupCTA(props: InlineSignupCTAProps) {
  var headline = props.headline || 'Add your experience to the archive.'
  var subhead = props.subhead || 'Save reports, see patterns that match your interests, and share your own story — all on a free account.'
  var variant = props.variant || 'primary'

  function trackClick() {
    try {
      var posthog = require('@/lib/posthog')
      posthog.capture(props.trackAs || 'inline_cta_click')
    } catch {}
  }

  if (variant === 'secondary') {
    return (
      <section className="py-8 md:py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-gray-800 bg-gray-950/50 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{headline}</p>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">{subhead}</p>
            </div>
            <Link
              href="/start"
              onClick={trackClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-purple-500/40 text-purple-200 hover:bg-purple-600/20 text-sm font-semibold transition-colors flex-shrink-0"
            >
              Create free account
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-10 md:py-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl border border-purple-700/40 bg-gradient-to-br from-purple-950/60 to-gray-950/80 p-6 sm:p-10 text-center overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-purple-600/20 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-purple-500/10 blur-3xl" />
          </div>
          <div className="relative">
            <div className="inline-flex w-10 h-10 rounded-full bg-purple-600/30 border border-purple-500/30 items-center justify-center mb-4">
              <Sparkles className="w-5 h-5 text-purple-200" />
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-white leading-tight">
              {headline}
            </h2>
            <p className="text-sm sm:text-base text-gray-300 mt-3 max-w-xl mx-auto leading-relaxed">
              {subhead}
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/start"
                onClick={trackClick}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
              >
                Create free account
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/discover"
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-gray-300 hover:text-white"
              >
                Or keep browsing
              </Link>
            </div>
            <p className="text-[11px] text-gray-500 mt-4">
              Free forever — no card required. Account-first, password-free sign-in.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
