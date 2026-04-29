'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Category slideshow — full-width, one image at a time with crossfade.
 * Auto-advances every 3 seconds, pauses on hover/touch.
 * Each slide links to explore browse filtered by that category.
 * Desktop: subtle chevron arrows on hover for manual navigation.
 *
 * Art assets in /public/categories/ as @2x PNGs (~1473x391).
 */

var categories = [
  { slug: 'ufos_aliens', image: '/categories/ufo-aliens.png', webp: '/categories/ufo-aliens.webp' },
  { slug: 'cryptids', image: '/categories/cryptids.png', webp: '/categories/cryptids.webp' },
  { slug: 'ghosts_hauntings', image: '/categories/ghosts-hauntings.png', webp: '/categories/ghosts-hauntings.webp' },
  { slug: 'psychic_phenomena', image: '/categories/psychic-phenomena.png', webp: '/categories/psychic-phenomena.webp' },
  { slug: 'esoteric_practices', image: '/categories/esoteric-practices.png', webp: '/categories/esoteric-practices.webp' },
  { slug: 'religion_mythology', image: '/categories/religion-mythology.png', webp: '/categories/religion-mythology.webp' },
  { slug: 'consciousness_practices', image: '/categories/consciousness-practices.png', webp: '/categories/consciousness-practices.webp' },
  { slug: 'psychological_experiences', image: '/categories/psychological-experiences.png', webp: '/categories/psychological-experiences.webp' },
]

var INTERVAL = 3000 /* ms between slides */

export default function QuickNavStrip() {
  var [activeIndex, setActiveIndex] = useState(0)
  var [isPaused, setIsPaused] = useState(false)
  var [isHovered, setIsHovered] = useState(false)
  var timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  var advance = useCallback(function() {
    setActiveIndex(function(prev) {
      return (prev + 1) % categories.length
    })
  }, [])

  var goBack = useCallback(function() {
    setActiveIndex(function(prev) {
      return (prev - 1 + categories.length) % categories.length
    })
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  var goForward = useCallback(function() {
    setActiveIndex(function(prev) {
      return (prev + 1) % categories.length
    })
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  /* Auto-advance timer */
  useEffect(function() {
    if (isPaused) return

    timerRef.current = setTimeout(advance, INTERVAL)

    return function() {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [activeIndex, isPaused, advance])

  return (
    <section className="py-4 md:py-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-xs uppercase tracking-widest text-gray-500 font-medium mb-3 text-center">
          Explore by category
        </p>
        <div
          className="relative overflow-hidden rounded-2xl border border-white/10 group"
          style={{ aspectRatio: '3.77 / 1' }}
          onMouseEnter={function() { setIsPaused(true); setIsHovered(true) }}
          onMouseLeave={function() { setIsPaused(false); setIsHovered(false) }}
          onTouchStart={function() { setIsPaused(true) }}
          onTouchEnd={function() { setIsPaused(false) }}
        >
          {/* Stacked slides with crossfade */}
          {categories.map(function(cat, i) {
            var isActive = i === activeIndex
            return (
              <Link
                key={cat.slug}
                href={'/explore?mode=browse&category=' + cat.slug}
                className="absolute inset-0 block transition-opacity duration-700 ease-in-out"
                style={{
                  opacity: isActive ? 1 : 0,
                  pointerEvents: isActive ? 'auto' : 'none',
                  zIndex: isActive ? 1 : 0,
                }}
                aria-hidden={!isActive}
                tabIndex={isActive ? 0 : -1}
              >
                <picture>
                  <source srcSet={cat.webp} type="image/webp" />
                  <img
                    src={cat.image}
                    alt=""
                    className="w-full h-full object-cover"
                    loading={i < 2 ? 'eager' : 'lazy'}
                    draggable={false}
                  />
                </picture>
                {/* Subtle gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
              </Link>
            )
          })}

          {/* Chevron arrows — visible on desktop hover only */}
          <button
            onClick={function(e) { e.preventDefault(); goBack() }}
            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/60 transition-all duration-300 opacity-0 group-hover:opacity-100 cursor-pointer"
            aria-label="Previous category"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={function(e) { e.preventDefault(); goForward() }}
            className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/60 transition-all duration-300 opacity-0 group-hover:opacity-100 cursor-pointer"
            aria-label="Next category"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Slide position indicator — thin bar at bottom */}
          <div className="absolute bottom-0 left-0 right-0 z-10 h-0.5 bg-white/10">
            <div
              className="h-full bg-white/50 transition-all duration-700 ease-in-out"
              style={{
                width: (100 / categories.length) + '%',
                marginLeft: (activeIndex * 100 / categories.length) + '%',
              }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
