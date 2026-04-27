'use client'

import React, { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Category carousel — replaces the old pill-button nav strip.
 * Shows category art banners in a horizontally-scrolling strip.
 * Each card links to the explore page filtered to that category.
 *
 * Art assets live in /public/categories/ as @2x PNGs (~1473x391).
 * Displayed at ~240x64 CSS size for a compact, Netflix-style row.
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
  var [canScrollLeft, setCanScrollLeft] = useState(false)
  var [canScrollRight, setCanScrollRight] = useState(false)

  function checkScroll() {
    var el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }

  useEffect(function() {
    checkScroll()
    var el = scrollRef.current
    if (el) {
      el.addEventListener('scroll', checkScroll, { passive: true })
      window.addEventListener('resize', checkScroll)
    }
    return function() {
      if (el) el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [])

  function scroll(direction: 'left' | 'right') {
    var el = scrollRef.current
    if (!el) return
    var distance = el.clientWidth * 0.7
    el.scrollBy({ left: direction === 'left' ? -distance : distance, behavior: 'smooth' })
  }

  return (
    <section className="py-6 md:py-8 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Desktop scroll arrows */}
        {canScrollLeft && (
          <button
            onClick={function() { scroll('left') }}
            className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-black/60 backdrop-blur border border-white/10 text-white hover:bg-black/80 transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={function() { scroll('right') }}
            className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-black/60 backdrop-blur border border-white/10 text-white hover:bg-black/80 transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Scrollable row */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {categories.map(function(cat) {
            return (
              <Link
                key={cat.slug}
                href={'/explore?mode=browse&category=' + cat.slug}
                className="flex-shrink-0 snap-start group relative overflow-hidden rounded-xl border border-white/10 hover:border-white/25 transition-all duration-300"
                style={{ width: '240px', height: '64px' }}
              >
                {/* Category art */}
                <img
                  src={cat.image}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
