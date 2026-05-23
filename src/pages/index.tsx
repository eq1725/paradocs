'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Search } from 'lucide-react'
import { useABTest } from '@/lib/ab-testing'
import { supabase } from '@/lib/supabase'
import QuickNavStrip from '@/components/homepage/QuickNavStrip'
import FeedShowcase from '@/components/homepage/FeedShowcase'
import MapShowcase from '@/components/homepage/MapShowcase'
// V11.17 — AIInsight component retired (function absorbed into LabShowcase).
import LabShowcase from '@/components/homepage/LabShowcase'
import HowItWorks from '@/components/homepage/HowItWorks'
import DataProofCTA from '@/components/homepage/DataProofCTA'
import InlineSignupCTA from '@/components/homepage/InlineSignupCTA'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

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
// V11.17 — single canonical hero copy retiring the AI-coded A/B variants.
// Kept variable name VARIANTS for the consumer signature; only key 'X' is used.
var HERO_VARIANTS: Record<string, { headline: string; subheadline: string }> = {
  X: {
    headline: 'What did you see?',
    subheadline: 'Paradocs is the Index of first-person paranormal accounts — UFOs, hauntings, cryptids, NDEs, and more. Tens of thousands of reports gathered from across the web, organized so patterns are visible. Search the Index. Add your own. See how it connects.',
  },
}
// Legacy variants below preserved as comments for posthog-funnel context;
// fall-through ensures any incoming A/B/C/D/E variant resolves to X.
var _LEGACY_HERO_VARIANTS: Record<string, { headline: string; subheadline: string }> = {
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
    // Panel-feedback (May 2026 \u2014 2nd round): trimmed the unverifiable
    // "millions" claim for pre-launch honesty. Specific, concrete.
    subheadline: 'A growing archive of first-person paranormal reports, AI-powered pattern analysis, and tools for casual browsers and serious investigators alike.',
  },
}

export default function Home() {
  var router = useRouter()

  // V11.17 — single canonical hero. Previous 5-variant A/B test retired
  // with the "the Index" brand pivot; useABTest still called so any in-
  // flight assignments resolve cleanly to the canonical X variant.
  var heroTest = useABTest('hero_headline', ['X'])
  var heroContent = HERO_VARIANTS.X

  var [searchQuery, setSearchQuery] = useState('')
  var [isSearchFocused, setIsSearchFocused] = useState(false)
  var animatedPlaceholder = useAnimatedPlaceholder(isSearchFocused || searchQuery.length > 0)

  // Render gate: while we decide whether to redirect to /start (cold visitor)
  // or /discover (signed-in returning user), we render nothing to avoid
  // flashing the marketing page. Set to true once we've confirmed this user
  // should see the homepage.
  var [showHome, setShowHome] = useState(false)

  // Panel-feedback (May 2026) — kill the cold-visitor auto-redirect.
  //
  // Previously this hook bounced every cold visitor straight to /start,
  // forcing signup before the user understood what Paradocs was. Panel
  // review (UX/Conversion/SEO/T&S/App Store all unanimous): "browse-first
  // with soft conversion" beats "forced signup wall" on every metric.
  //
  // Behavior:
  //   - Cold + anonymous visitors see the homepage.
  //   - Signed-in returning users bounce to /discover (their feed) —
  //     matches the Twitter/Instagram/TikTok pattern.
  //   - ?force_home=1 query param overrides the signed-in bounce so
  //     authed users can revisit the marketing page (for testing,
  //     press kits, email blasts, etc.).
  useEffect(function () {
    if (typeof window === 'undefined') return
    var params = new URLSearchParams(window.location.search)
    if (params.has('force_home')) {
      setShowHome(true)
      return
    }
    supabase.auth.getSession().then(function (s) {
      if (s && s.data && s.data.session) {
        // Signed-in user — send them to their personalized feed.
        router.replace('/discover')
        return
      }
      // Cold or anonymous visitor — show the homepage.
      setShowHome(true)
    }).catch(function () {
      // Session check failed — fail open, show homepage.
      setShowHome(true)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // V10.10 — funnel step 1 of 3. landing_view fires only when the
  // marketing homepage actually renders (i.e. after the first-run
  // redirect logic above decides this visitor should see the
  // homepage rather than be bounced to /start or /discover).
  // landing_view → start_form_open (in /start) → report_submitted
  // (post-API success in /start) is the funnel chart.
  useEffect(function () {
    if (typeof window === 'undefined') return
    if (!showHome) return
    try {
      require('@/lib/posthog').capture('report_share_funnel', {
        step: 'landing_view',
        hero_variant: heroTest.variant || null,
      })
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHome])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      heroTest.trackConversion('search')
      window.location.href = '/explore?mode=search&q=' + encodeURIComponent(searchQuery)
    }
  }

  // V9.11.2 #E \u2014 render gate. If we haven't decided yet, show a tiny
  // loader (full-bleed dark) so the marketing hero doesn't flash before
  // the redirect fires. This effectively makes redirected users see
  // nothing on / instead of a quarter-second of homepage content.
  if (!showHome) {
    return (
      <div className="min-h-[100dvh] bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-400" />
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Paradocs \u2014 The Index of First-Person Paranormal Accounts</title>
        <meta name="description" content="Paradocs is the Index of first-person paranormal accounts \u2014 UFOs, hauntings, cryptids, NDEs, and more. Tens of thousands of reports gathered from across the web, organized so patterns are visible. Search, map, contribute." />
        <meta property="og:title" content="Paradocs \u2014 The Index of First-Person Paranormal Accounts" />
        <meta property="og:description" content="The Index of first-person paranormal accounts. Tens of thousands of reports gathered from across the web, organized so patterns are visible." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.discoverparadocs.com" />
        <meta property="og:image" content="https://www.discoverparadocs.com/og-home.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Paradocs \u2014 The Index of First-Person Paranormal Accounts" />
        <meta name="twitter:description" content="The Index of first-person paranormal accounts. Tens of thousands of reports gathered from across the web, organized so patterns are visible." />
        <link rel="canonical" href="https://www.discoverparadocs.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Paradocs',
            url: 'https://www.discoverparadocs.com',
            description: 'The Index of first-person paranormal accounts.',
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: 'https://www.discoverparadocs.com/search?q={search_term_string}'
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

            {/* V11.17 trust line — specific numbers (still hard-coded;
                wired to a homepage-stats endpoint in a follow-up). */}
            <p className="mt-6 text-sm sm:text-base font-medium tracking-wide text-gray-400">
              First-person reports across <span className="text-primary-400">UFOs</span>,{' '}
              <span className="text-primary-400">hauntings</span>,{' '}
              <span className="text-primary-400">cryptids</span>, NDEs, and dozens more.
            </p>

            {/* V11.17 — single primary CTA + low-friction text-link
                alternative. Replaces the dual-button pattern (panel
                consensus: dual buttons hesitate, single button + text
                link converts 1.4-2.2x in B2C consumer-content tests). */}
            <div className="mt-7 flex flex-col items-center justify-center gap-2">
              <Link
                href="/start"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary-500 hover:bg-primary-400 text-white text-sm font-semibold transition-colors"
              >
                Create free account
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/discover"
                className="inline-flex items-center justify-center px-2 py-1.5 text-[13px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
              >
                or browse without signing up &rarr;
              </Link>
            </div>
            <p className="mt-3 text-[12px] text-gray-500">
              Free forever — no card required.
            </p>

          </div>
        </div>
      </section>

      {/* === SECTION 2: Quick Nav Strip === */}
      <QuickNavStrip />

      {/* V11.17 — Lin's reorder. Concrete-before-abstract: visitor
          sees three real surfaces (Feed, Map, Lab) before any pattern-
          surfacing abstract claim. AIInsight component retired; its
          function is better served by LabShowcase's pattern story. */}
      <HowItWorks />

      {/* === SECTION 3: Feed Showcase (Today feed) === */}
      <FeedShowcase />

      {/* === SECTION 4: Map Showcase === */}
      <MapShowcase />

      {/* === SECTION 5: Lab Showcase (carries the pattern story) === */}
      <LabShowcase />

      {/* V11.17 — single mid-page CTA. Previous page had three
          InlineSignupCTAs which read as nagging on mobile; cut to
          one mid-page + one footer. This one fires at the
          highest-intent moment: visitor has just seen all three
          surfaces in motion. */}
      <InlineSignupCTA
        headline="Save reports + see the patterns that match yours."
        subhead="Create a free account to bookmark cases, follow regions and phenomena, and add your own experience to the Index."
        variant="primary"
        trackAs="homepage_inline_cta_after_showcases"
      />

      {/* === SECTION 6: Data Proof + numbers === */}
      <DataProofCTA />

      {/* V11.17 — final footer CTA. Visitors this deep are in the
          converted-or-leaving cohort — last invitation. */}
      <InlineSignupCTA
        headline="Ready to add your experience?"
        subhead="Sign up in 10 seconds — no password, no card. Just an email and a one-tap sign-in link."
        variant="primary"
        trackAs="homepage_inline_cta_footer"
      />
    </>
  )
}
