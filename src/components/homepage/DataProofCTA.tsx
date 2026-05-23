'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { LogIn, ArrowRight } from 'lucide-react'
import InstallPrompt from '@/components/InstallPrompt'

/**
 * Animated counter that counts up from 0 when it scrolls into view.
 * Uses IntersectionObserver to trigger once.
 */
function AnimatedCounter({ target, duration, suffix, label }: {
  target: number
  duration: number
  suffix?: string
  label: string
}) {
  var [count, setCount] = useState(0)
  var [hasAnimated, setHasAnimated] = useState(false)
  var ref = useRef<HTMLDivElement>(null)

  useEffect(function() {
    if (!ref.current) return

    var observer = new IntersectionObserver(
      function(entries) {
        if (entries[0].isIntersecting && !hasAnimated) {
          setHasAnimated(true)
          var startTime = Date.now()
          var animate = function() {
            var elapsed = Date.now() - startTime
            var progress = Math.min(elapsed / duration, 1)
            /* Ease out cubic */
            var eased = 1 - Math.pow(1 - progress, 3)
            setCount(Math.floor(eased * target))
            if (progress < 1) {
              requestAnimationFrame(animate)
            } else {
              setCount(target)
            }
          }
          requestAnimationFrame(animate)
        }
      },
      { threshold: 0.3 }
    )

    observer.observe(ref.current)

    return function() { observer.disconnect() }
  }, [hasAnimated, target, duration])

  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl md:text-4xl font-display font-bold text-white">
        {count.toLocaleString()}{suffix || ''}
      </div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  )
}

/**
 * Data proof counters + final CTA section.
 *
 * V11.17.4 — Brand-confident 4-fact stat block per Round 4 panel.
 * Counts are fetched client-side (so the animation triggers correctly
 * on scroll-into-view); fallback values keep the section readable if
 * the API call fails. Each label uses the brand-confident frame:
 *   "98,427 first-person accounts. 47 source archives.
 *    1,463 distinct phenomena. One archive."
 *
 * The fourth "tile" — "One archive" — is intentionally not a number.
 * It's the category claim disguised as a stat. Pinterest does this
 * with "1 place for your ideas."
 */
interface HomepageCounts {
  reports: number
  sources: number
  phenomena: number
}

export default function DataProofCTA() {
  var [counts, setCounts] = useState<HomepageCounts>({
    reports: 98000,
    sources: 47,
    phenomena: 1463,
  })

  /* Fetch live counts from the homepage-stats endpoint. The hero
   * already gets these via getStaticProps (ISR), but this component
   * needs them client-side so the AnimatedCounter targets are
   * correct when the section scrolls into view. */
  useEffect(function() {
    fetch('/api/homepage/stats')
      .then(function(res) { return res.ok ? res.json() : null })
      .then(function(data) {
        if (!data) return
        setCounts({
          reports: typeof data.reports === 'number' ? data.reports : 98000,
          sources: typeof data.sources === 'number' ? data.sources : 47,
          phenomena: typeof data.phenomena === 'number' ? data.phenomena : 1463,
        })
      })
      .catch(function() { /* fallback values stand */ })
  }, [])

  return (
    <section className="py-16 md:py-24 border-t border-white/5 bg-gradient-to-b from-transparent to-primary-900/10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* V11.17.4 — Four-fact brand-confidence stat block. The
            fourth tile is the category claim ("One archive."). */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 mb-16">
          <AnimatedCounter target={counts.reports} duration={2000} label="first-person accounts" />
          <AnimatedCounter target={counts.sources} duration={1500} label="source archives" />
          <AnimatedCounter target={counts.phenomena} duration={1800} label="distinct phenomena" />
          <div className="text-center">
            <div className="text-3xl md:text-4xl font-display font-bold text-white">One</div>
            <div className="text-sm text-gray-500 mt-1">archive</div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white">
            Start exploring for free
          </h2>
          <p className="mt-3 text-gray-400">
            Search what others have seen. Save what matches you. Add your own. No credit card required.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/start"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary-500 hover:bg-primary-400 text-white font-semibold transition-colors text-base"
            >
              <LogIn className="w-5 h-5" />
              Create free account
            </Link>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-white/15 text-gray-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
            >
              Browse without an account
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {/* PWA install prompt — mobile only, below CTA buttons */}
          <InstallPrompt />
        </div>
      </div>
    </section>
  )
}
