'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

/**
 * Category slideshow — full-width, one image at a time with crossfade.
 * Auto-advances every 3 seconds, pauses on hover/touch.
 * Each slide links to explore browse filtered by that category.
 *
 * Art assets in /public/categories/ as @2x PNGs (~1473x391).
 */

var categories = [
  { slug: 'ufos_aliens', image: '/categories/ufo-aliens.png' },
  { slug: 'cryptids', image: '/categories/cryptids.png' },
  { slug: 'ghosts_hauntings', image: '/categories/ghosts-hauntings.png' },
  { slug: 'psychic_phenomena', image: '/categories/psychic-phenomena.png' },
  { slug: 'esoteric_practices', image: '/categories/esoteric-practices.png' },
  { slug: 'religion_mythology', image: '/categories/religion-mythology.png' },
  { slug: 'consciousness_practices', image: '/categories/consciousness-practices.png' },
  { slug: 'psychological_experiences', image: '/categories/psychological-experiences.png' },
]

var INTERVAL = 3000 /* ms between slides */

export default function QuickNavStrip() {
  var [activeIndex, setActiveIndex] = useState(0)
  var [isPaused, setIsPaused] = useState(false)
  var timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  var advance = useCallback(function() {
    setActiveIndex(function(prev) {
      return (prev + 1) % categories.length
    })
  }, [])

  /* Auto-advance timer */
  useEffect(function() {
    if (isPaused) return

    timerRef.current = setTimeout(advance, INTERVAL)

    return function() {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [activeIndex, isPaused, advance])

  function goToSlide(index: number) {
    setActiveIndex(index)
    /* Reset the timer when user clicks a dot */
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  return (
    <section className="py-4 md:py-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-xs uppercase tracking-widest text-gray-500 font-medium mb-3 text-center">
          Explore by category
        </p>
        <div
          className="relative overflow-hidden rounded-2xl border border-white/10"
          style={{ aspectRatio: '3.77 / 1' }}
          onMouseEnter={function() { setIsPaused(true) }}
          onMouseLeave={function() { setIsPaused(false) }}
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
                <img
                  src={cat.image}
                  alt=""
                  className="w-full h-full object-cover"
                  loading={i < 2 ? 'eager' : 'lazy'}
                  draggable={false}
                />
                {/* Subtle gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
              </Link>
            )
          })}

          {/* Dot indicators */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            {categories.map(function(cat, i) {
              var isActive = i === activeIndex
              return (
                <button
                  key={cat.slug}
                  onClick={function() { goToSlide(i) }}
                  className={'rounded-full transition-all duration-300 ' + (isActive ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40 hover:bg-white/60')}
                  aria-label={'Go to category ' + (i + 1)}
                />
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
