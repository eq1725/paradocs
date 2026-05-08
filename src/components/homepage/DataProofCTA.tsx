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
 * Phase 1 (launch): phenomena types, locations (dynamic), source archives
 * Phase 2 (post-ingestion): add total reports counter
 * Phase 3 (growth): add researchers counter
 */
export default function DataProofCTA() {
  var [locationCount, setLocationCount] = useState(0)

  /* Fetch dynamic location count from API */
  useEffect(function() {
    fetch('/api/stats/locations')
      .then(function(res) { return res.json() })
      .then(function(data) {
        if (data.count && data.count > 0) {
          setLocationCount(data.count)
        }
      })
      .catch(function() {
        /* Silent fail — counter just stays at 0 / won't animate */
      })
  }, [])

  return (
    <section className="py-16 md:py-24 border-t border-white/5 bg-gradient-to-b from-transparent to-primary-900/10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Animated counters */}
        <div className="grid grid-cols-3 gap-6 md:gap-12 mb-16">
          <AnimatedCounter target={4792} duration={2000} label="phenomena types" />
          {locationCount > 0 ? (
            <AnimatedCounter target={locationCount} duration={1800} label="locations" />
          ) : (
            <AnimatedCounter target={200} duration={1500} suffix="+" label="locations" />
          )}
          <AnimatedCounter target={200} duration={1500} suffix="+" label="source archives" />
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white">
            Start exploring for free
          </h2>
          <p className="mt-3 text-gray-400">
            Search the database, swipe through reports, and save what matters. No credit card required.
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
