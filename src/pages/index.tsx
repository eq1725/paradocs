'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import { Search } from 'lucide-react'
import { useABTest } from '@/lib/ab-testing'
import QuickNavStrip from '@/components/homepage/QuickNavStrip'
import FeedShowcase from '@/components/homepage/FeedShowcase'
import MapShowcase from '@/components/homepage/MapShowcase'
import AIInsight from '@/components/homepage/AIInsight'
import LabShowcase from '@/components/homepage/LabShowcase'
import HowItWorks from '@/components/homepage/HowItWorks'
import DataProofCTA from '@/components/homepage/DataProofCTA'

/* Rotating search placeholder queries — real examples that model depth */
var SEARCH_EXAMPLES = [
  'triangle UFOs over the Hudson Valley',
  'shadow people in old houses',
  'strange lights near military bases',
  'Bigfoot sightings in the Pacific Northwest',
  'missing time on rural highways',
  'orbs captured on security cameras',
  'encounters along the 37th parallel',
]

var TYPE_SPEED = 60   /* ms per character typed */
var DELETE_SPEED = 30  /* ms per character deleted */
var PAUSE_AFTER_TYPE = 2500 /* ms to hold the completed query */
var PAUSE_AFTER_DELETE = 400 /* ms pause before typing next */

/**
 * Animated placeholder text that types, pauses, deletes, and cycles
 * through example queries. Returns the current display string.
 * Stops animating when the user focuses the input (isFocused = true).
 */
function useAnimatedPlaceholder(isFocused: boolean) {
  var [text, setText] = useState('')
  var indexRef = useRef(0)
  var phaseRef = useRef<'typing' | 'pausing' | 'deleting' | 'waiting'>('typing')
  var charRef = useRef(0)
  var timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  var tick = useCallback(function() {
    var query = SEARCH_EXAMPLES[indexRef.current]
    var phase = phaseRef.current

    if (phase === 'typing') {
      charRef.current++
      setText(query.slice(0, charRef.current))
      if (charRef.current >= query.length) {
        phaseRef.current = 'pausing'
        timerRef.current = setTimeout(tick, PAUSE_AFTER_TYPE)
      } else {
        timerRef.current = setTimeout(tick, TYPE_SPEED)
      }
    } else if (phase === 'pausing') {
      phaseRef.current = 'deleting'
      timerRef.current = setTimeout(tick, DELETE_SPEED)
    } else if (phase === 'deleting') {
      charRef.current--
      setText(query.slice(0, charRef.current))
      if (charRef.current <= 0) {
        phaseRef.current = 'waiting'
        indexRef.current = (indexRef.current + 1) % SEARCH_EXAMPLES.length
        timerRef.current = setTimeout(tick, PAUSE_AFTER_DELETE)
      } else {
        timerRef.current = setTimeout(tick, DELETE_SPEED)
      }
    } else if (phase === 'waiting') {
      phaseRef.current = 'typing'
      timerRef.current = setTimeout(tick, TYPE_SPEED)
    }
  }, [])

  useEffect(function() {
    if (isFocused) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    /* Reset and start */
    phaseRef.current = 'typing'
    charRef.current = 0
    setText('')
    timerRef.current = setTimeout(tick, 600)
    return function() {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isFocused, tick])

  return text
}

// Hero headline variants — must match admin/ab-testing.tsx variant table
var HERO_VARIANTS: Record<string, { headline: string; subheadline: string }> = {
  A: {
    headline: 'Have You Experienced Something You Can\u2019t Explain?',
    subheadline: 'The world\u2019s most comprehensive paranormal database. AI-powered search, pattern detection, and research tools across millions of reports.',
  },
  B: {
    headline: 'The World\u2019s Largest Paranormal Database',
    subheadline: 'Millions of reports aggregated from across the web. AI-filtered, searchable, mapped, and cross-referenced for emergent patterns.',
  },
  C: {
    headline: 'Every Report. Every Pattern. Every Connection.',
    subheadline: 'We aggregate millions of paranormal reports, filter them through world-class AI, and surface the patterns no one else can see.',
  },
  D: {
    headline: 'Join the Researchers Tracking What Can\u2019t Be Explained',
    subheadline: 'Build case files, cross-reference evidence, and discover patterns across the world\u2019s largest paranormal database\u2014with AI, not just intuition.',
  },
  E: {
    headline: 'Something Strange Is Happening \u2014 And We\u2019re Documenting It',
    subheadline: 'Millions of paranormal reports. AI-powered analysis. Research tools for everyone from casual browsers to professional investigators.',
  },
}

export default function Home() {
  // A/B test for hero headline — 5 variants defined in admin/ab-testing.tsx
  var heroTest = useABTest('hero_headline', ['A', 'B', 'C', 'D', 'E'])
  var heroContent = HERO_VARIANTS[heroTest.variant] || HERO_VARIANTS.B

  var [searchQuery, setSearchQuery] = useState('')
  var [isSearchFocused, setIsSearchFocused] = useState(false)
  var animatedPlaceholder = useAnimatedPlaceholder(isSearchFocused || searchQuery.length > 0)

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      heroTest.trackConversion('search')
      window.location.href = '/explore?mode=search&q=' + encodeURIComponent(searchQuery)
    }
  }

  return (
    <>
      <Head>
        <title>Paradocs - The World{'\u2019'}s Largest Paranormal Database</title>
        <meta name="description" content="The world's largest paranormal database. AI-powered search and pattern detection across millions of reports. UFO sightings, cryptid encounters, ghost reports, and unexplained events." />
        <meta property="og:title" content="Paradocs - The World's Largest Paranormal Database" />
        <meta property="og:description" content="AI-powered search and pattern detection across millions of paranormal reports." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://beta.discoverparadocs.com" />
        <meta property="og:image" content="https://beta.discoverparadocs.com/og-home.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Paradocs - The World's Largest Paranormal Database" />
        <meta name="twitter:description" content="AI-powered search and pattern detection across millions of paranormal reports." />
        <link rel="canonical" href="https://beta.discoverparadocs.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Paradocs',
            url: 'https://beta.discoverparadocs.com',
            description: 'The world\'s largest database of paranormal phenomena.',
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: 'https://beta.discoverparadocs.com/search?q={search_term_string}'
              },
              'query-input': 'required name=search_term_string'
            }
          }) }}
        />
      </Head>

      {/* === SECTION 1: Hero === */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-900/20 via-transparent to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 md:pt-24 pb-10 md:pb-14 relative">
          <div className="text-center max-w-3xl mx-auto">

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold text-white leading-tight">
              {heroContent.headline}
            </h1>
            <p className="mt-6 text-base md:text-lg text-gray-400 max-w-2xl mx-auto">
              {heroContent.subheadline}
            </p>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="mt-10 max-w-xl mx-auto">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary-400 transition-colors" />
                <input
                  type="text"
                  placeholder={animatedPlaceholder || 'Search...'}
                  value={searchQuery}
                  onChange={function(e) { setSearchQuery(e.target.value) }}
                  onFocus={function() { setIsSearchFocused(true) }}
                  onBlur={function() { setIsSearchFocused(false) }}
                  className="w-full pl-12 pr-28 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/40 text-base"
                />
                <button
                  type="submit"
                  onClick={function() { heroTest.trackClick('search') }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 bg-primary-500 hover:bg-primary-400 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  Search
                </button>
              </div>
            </form>

            {/* Trust line */}
            <p className="mt-6 text-base font-medium tracking-wide text-gray-400">
              <span className="text-primary-400">Millions</span> of real experiences across <span className="text-primary-400">4,792</span> phenomena types
            </p>

          </div>
        </div>
      </section>

      {/* === SECTION 2: Quick Nav Strip === */}
      <QuickNavStrip />

      {/* === SECTION 3: AI Pattern Insight === */}
      <AIInsight />

      {/* === SECTION 4: Feed Showcase === */}
      <FeedShowcase />

      {/* === SECTION 5: Map Showcase === */}
      <MapShowcase />

      {/* === SECTION 6: Lab / Investigate Showcase === */}
      <LabShowcase />

      {/* === SECTION 7: How It Works + FAQ === */}
      <HowItWorks />

      {/* === SECTION 8: Data Proof + CTA === */}
      <DataProofCTA />
    </>
  )
}
