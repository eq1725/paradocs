'use client'

import React, { useState } from 'react'
import Head from 'next/head'
import { Search } from 'lucide-react'
import { useABTest } from '@/lib/ab-testing'
import QuickNavStrip from '@/components/homepage/QuickNavStrip'
import FeedShowcase from '@/components/homepage/FeedShowcase'
import MapShowcase from '@/components/homepage/MapShowcase'
import AIInsight from '@/components/homepage/AIInsight'
import DataProofCTA from '@/components/homepage/DataProofCTA'

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 relative">
          <div className="text-center max-w-3xl mx-auto">

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold text-white leading-tight">
              {heroContent.headline}
            </h1>
            <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
              {heroContent.subheadline}
            </p>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="mt-10 max-w-xl mx-auto">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary-400 transition-colors" />
                <input
                  type="text"
                  placeholder="Search reports, phenomena, locations..."
                  value={searchQuery}
                  onChange={function(e) { setSearchQuery(e.target.value) }}
                  className="w-full pl-12 pr-28 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 text-base"
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
            <p className="mt-8 text-sm text-gray-400">
              <span className="text-primary-400">Millions</span> of real experiences across <span className="text-primary-400">4,792</span> phenomena types
            </p>

          </div>
        </div>
      </section>

      {/* === SECTION 2: Quick Nav Strip === */}
      <QuickNavStrip />

      {/* === SECTION 3: Feed Showcase === */}
      <FeedShowcase />

      {/* === SECTION 4: Map Showcase === */}
      <MapShowcase />

      {/* === SECTION 5: AI Pattern Insight === */}
      <AIInsight />

      {/* === SECTION 6: Data Proof + CTA === */}
      <DataProofCTA />
    </>
  )
}
