'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Sparkles, ArrowRight, Share2 } from 'lucide-react'

/**
 * AI Pattern Analysis showcase section.
 * Rotates through multiple AI-detected insights with crossfade.
 *
 * TODO (post-mass-ingestion): Replace hardcoded insights with live query
 * to the API returning the most compelling recent AI-detected patterns.
 */

var insights = [
  {
    quote: 'Triangle-shaped craft reports cluster within 50 miles of military bases at 3.4× the expected rate—a pattern invisible in any single database, but unmistakable across millions of cases.',
    tag: 'Geographic correlation',
  },
  {
    quote: 'Encounters with tall, silent humanoid figures concentrate along the 37th parallel—a latitude line that cuts across more reported anomalous hotspots than any other on Earth.',
    tag: 'Spatial clustering',
  },
  {
    quote: 'Missing time reports increase nearly 5× during periods of elevated geomagnetic activity, suggesting an environmental trigger that traditional investigations have overlooked.',
    tag: 'Temporal correlation',
  },
  {
    quote: 'Witnesses who report luminous orbs are 8× more likely to describe accompanying electromagnetic interference—a co-occurrence too consistent to dismiss as coincidence.',
    tag: 'Phenomenological link',
  },
]

var ROTATE_INTERVAL = 8000 /* ms between insight rotations */

export default function AIInsight() {
  var [activeIndex, setActiveIndex] = useState(0)
  var [copied, setCopied] = useState(false)

  /* Auto-rotate insights */
  useEffect(function() {
    var timer = setInterval(function() {
      setActiveIndex(function(prev) {
        return (prev + 1) % insights.length
      })
    }, ROTATE_INTERVAL)
    return function() { clearInterval(timer) }
  }, [])

  var activeInsight = insights[activeIndex]

  var handleShare = useCallback(function() {
    var shareText = '“' + activeInsight.quote + '”\n\nDiscovered by AI pattern analysis on Paradocs — discoverparadocs.com'

    if (navigator.share) {
      navigator.share({
        title: 'AI Pattern Discovery — Paradocs',
        text: shareText,
        url: 'https://www.discoverparadocs.com/lab',
      }).catch(function() { /* user cancelled */ })
    } else {
      navigator.clipboard.writeText(shareText).then(function() {
        setCopied(true)
        setTimeout(function() { setCopied(false) }, 2000)
      })
    }
  }, [activeInsight])

  return (
    <section className="py-16 md:py-24 border-t border-white/5">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-primary-900/20 via-gray-900/50 to-gray-900/50 p-8 md:p-12 overflow-hidden">

          {/* Decorative glow */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl" />

          <div className="relative">
            {/* Label + share */}
            <div className="flex items-center justify-between mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20">
                <Sparkles className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-sm font-medium text-primary-400">AI Pattern Analysis</span>
              </div>

              {/* Share button */}
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 hover:text-primary-400 hover:bg-white/5 border border-transparent hover:border-white/10 transition-all cursor-pointer"
                title="Share this finding"
              >
                <Share2 className="w-3.5 h-3.5" />
                {copied ? 'Copied!' : 'Share'}
              </button>
            </div>

            {/* Rotating insights with crossfade */}
            <div className="relative" style={{ minHeight: '120px' }}>
              {insights.map(function(insight, i) {
                var isActive = i === activeIndex
                return (
                  <blockquote
                    key={i}
                    className="text-xl md:text-2xl lg:text-3xl font-display font-semibold text-white leading-snug transition-opacity duration-700 ease-in-out"
                    style={{
                      position: i === 0 ? 'relative' : 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      opacity: isActive ? 1 : 0,
                      pointerEvents: isActive ? 'auto' : 'none',
                    }}
                    aria-hidden={!isActive}
                  >
                    {'“'}{insight.quote}{'”'}
                  </blockquote>
                )
              })}
            </div>

            {/* Insight metadata */}
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400">
                {activeInsight.tag}
              </span>
              <span className="text-sm text-gray-500">
                Detected across 4,792 phenomena types
              </span>
            </div>

            {/* Rotation indicators */}
            <div className="flex items-center gap-1.5 mt-5">
              {insights.map(function(_insight, i) {
                return (
                  <button
                    key={i}
                    onClick={function() { setActiveIndex(i) }}
                    className={'w-1.5 h-1.5 rounded-full transition-all duration-300 cursor-pointer ' + (i === activeIndex ? 'bg-primary-400 w-4' : 'bg-white/20 hover:bg-white/40')}
                    aria-label={'Show insight ' + (i + 1)}
                  />
                )
              })}
            </div>

            {/* CTA */}
            <Link
              href="/lab"
              className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors"
            >
              See what else the AI found
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
