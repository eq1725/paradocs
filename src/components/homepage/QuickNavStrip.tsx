'use client'

import React, { useRef, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

/**
 * Category carousel — full-width, auto-scrolling strip of category art banners.
 * Each card links to explore browse filtered by that category.
 *
 * Art assets in /public/categories/ as @2x PNGs (~1473x391).
 * Cards duplicate to create seamless infinite scroll effect.
 * Auto-scrolls at ~30px/s, pauses on hover/touch.
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

export default function QuickNavStrip() {
  var scrollRef = useRef<HTMLDivElement>(null)
  var isPaused = useRef(false)
  var animationRef = useRef<number>(0)
  var lastTimeRef = useRef<number>(0)
  var SPEED = 30 /* pixels per second */

  /* Duplicate cards for seamless loop */
  var allCards = categories.concat(categories)

  var animate = useCallback(function(timestamp: number) {
    if (!scrollRef.current) {
      animationRef.current = requestAnimationFrame(animate)
      return
    }

    if (lastTimeRef.current === 0) {
      lastTimeRef.current = timestamp
    }

    var delta = timestamp - lastTimeRef.current
    lastTimeRef.current = timestamp

    if (!isPaused.current && delta < 100) {
      scrollRef.current.scrollLeft += (SPEED * delta) / 1000

      /* Reset to start when we've scrolled past the first set */
      var halfWidth = scrollRef.current.scrollWidth / 2
      if (scrollRef.current.scrollLeft >= halfWidth) {
        scrollRef.current.scrollLeft -= halfWidth
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(function() {
    animationRef.current = requestAnimationFrame(animate)
    return function() {
      cancelAnimationFrame(animationRef.current)
    }
  }, [animate])

  function handlePause() {
    isPaused.current = true
  }

  function handleResume() {
    isPaused.current = false
    lastTimeRef.current = 0
  }

  return (
    <section className="py-6 md:py-8">
      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onMouseEnter={handlePause}
        onMouseLeave={handleResume}
        onTouchStart={handlePause}
        onTouchEnd={handleResume}
      >
        {/* Left padding spacer for mobile */}
        <div className="flex-shrink-0 w-2 sm:w-4" />

        {allCards.map(function(cat, i) {
          return (
            <Link
              key={cat.slug + '-' + i}
              href={'/explore?mode=browse&category=' + cat.slug}
              className="flex-shrink-0 group relative overflow-hidden rounded-xl border border-white/10 hover:border-white/30 transition-all duration-300"
              style={{ width: '320px', height: '140px' }}
            >
              {/* Category art */}
              <img
                src={cat.image}
                alt=""
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading={i < 8 ? 'eager' : 'lazy'}
                draggable={false}
              />
              {/* Subtle hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-300" />
            </Link>
          )
        })}

        {/* Right padding spacer for mobile */}
        <div className="flex-shrink-0 w-2 sm:w-4" />
      </div>
    </section>
  )
}
