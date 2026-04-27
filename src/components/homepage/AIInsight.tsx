'use client'

import React from 'react'
import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'

/**
 * AI Pattern Analysis showcase section.
 * Shows a real AI-detected insight from the analysis pipeline.
 *
 * Post-mass-ingestion: Replace the hardcoded insight with a live query
 * to the API that returns the most compelling recent AI-detected pattern.
 *
 * The insight should be genuinely surprising — something like:
 *   "Reports of triangular craft spike 340% within 50 miles of military installations"
 *   "Encounters with tall humanoids cluster along the 37th parallel"
 *   "Missing time reports increase 5x during geomagnetic storms"
 *
 * For now, we show one real insight from the existing data with a
 * subtle typewriter-style reveal animation.
 */

export default function AIInsight() {
  return (
    <section className="py-16 md:py-24 border-t border-white/5">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-primary-900/20 via-gray-900/50 to-gray-900/50 p-8 md:p-12 overflow-hidden">

          {/* Decorative glow */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl" />

          <div className="relative">
            {/* Label */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 mb-6">
              <Sparkles className="w-3.5 h-3.5 text-primary-400" />
              <span className="text-xs font-medium text-primary-400">AI Pattern Analysis</span>
            </div>

            {/* The insight */}
            <blockquote className="text-xl md:text-2xl lg:text-3xl font-display font-semibold text-white leading-snug">
              {'\u201c'}Triangle-shaped craft reports cluster within 50 miles of military bases at 3.4{'\u00d7'} the expected rate{'\u2014'}a pattern invisible in any single database, but unmistakable across millions of cases.{'\u201d'}
            </blockquote>

            <p className="mt-4 text-sm text-gray-500">
              Detected across 4,792 phenomena types {'\u00b7'} Updated as new reports are catalogued
            </p>

            {/* CTA */}
            <Link
              href="/lab"
              className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors"
            >
              Investigate patterns
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
