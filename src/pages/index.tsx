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
import LiveActivityTicker from '@/components/homepage/LiveActivityTicker'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/* V11.17.3 — Broadened rotation. Mix of dramatic events and subtle
 * personal moments. The placeholder is the second most-read element
 * on the page after the headline; it carries inclusion signal *before*
 * the visitor reads any other copy. The original list was all big
 * paranormal events, which implicitly told visitors with only "small"
 * moments that this place wasn't for them. */
var SEARCH_EXAMPLES = [
  'triangle UFOs over the Hudson Valley',
  'the feeling someone was watching you',
  'shadow people in old houses',
  'a dream that came true the next morning',
  'strange lights near military bases',
  'the room that always felt off',
  'missing time on rural highways',
  'the day the dog wouldn’t go upstairs',
  'Bigfoot sightings in the Pacific Northwest',
  'déjà vu that wouldn’t go away',
  'orbs captured on security cameras',
  'the moment you just knew',
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

// V11.17.3 — Round 3 mass-market recalibration.
//
// The hero uses an inclusion-list pattern (three short lines, each
// rendered on its own row) with a punchline beneath that resolves the
// setup. The previous V11.17 hero ("What did you see?") implicitly
// gated on having seen something — the broadened audience here is
// anyone who's had ONE small strange thing (a feeling, a dream that
// came true, a room that felt off). The verb-list does the
// inclusion work; the punchline does the recognition.
//
// "headlineLines" → rendered as separate `<span className="block">`
// elements so the visitor's eye lands on each line independently.
// "punchline" → smaller display weight beneath, the answer to the
// setup. "subheadline" → product description in plain language,
// drops "paranormal" (too gated) in favor of "the moments that don't
// quite fit." "trustLine" → demonstration of breadth, mixing the
// dramatic and the subtle.
interface HeroContent {
  headlineLines: string[]
  punchline: string
  subheadline: string
  trustLine: string
}
var HERO_VARIANTS: Record<string, HeroContent> = {
  X: {
    headlineLines: [
      'You saw something.',
      'Or you felt something.',
      'Or you just know.',
    ],
    punchline: "You’re not the only one.",
    subheadline: "Paradocs is where the moments that don’t quite fit get written down — yours, and tens of thousands of other people’s. Sightings, feelings, dreams, coincidences. The things you’d hesitate to mention at dinner. Find your moment. See who else has had one.",
    trustLine: "UFOs, ghosts, déjà vu, missing time, the dream that came true, the room that always felt off — all of it belongs here.",
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
        <title>Paradocs \u2014 You\u2019re not the only one.</title>
        <meta name="description" content="Paradocs is where the moments that don\u2019t quite fit get written down \u2014 sightings, feelings, dreams, coincidences. Tens of thousands of first-person accounts (UFOs, ghosts, cryptids, NDEs, d\u00e9j\u00e0 vu, and more), and a place to find your own story among them." />
        <meta property="og:title" content="Paradocs \u2014 You\u2019re not the only one." />
        <meta property="og:description" content="Where the moments that don\u2019t quite fit get written down. Sightings, feelings, dreams, coincidences. Tens of thousands of first-person accounts." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.discoverparadocs.com" />
        <meta property="og:image" content="https://www.discoverparadocs.com/og-home.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Paradocs \u2014 You\u2019re not the only one." />
        <meta name="twitter:description" content="Where the moments that don\u2019t quite fit get written down. Sightings, feelings, dreams, coincidences. Tens of thousands of first-person accounts." />
        <link rel="canonical" href="https://www.discoverparadocs.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Paradocs',
            url: 'https://www.discoverparadocs.com',
            description: "Where the moments that don't quite fit get written down \u2014 sightings, feelings, dreams, coincidences. First-person paranormal accounts and the place to share your own.",
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

            {/* V11.17.3 — Multi-line inclusion-list headline.
                Each line on its own row, sized to keep the cluster
                inside ~1 mobile viewport. The punchline beneath
                resolves the setup: setup-poses-the-list,
                punchline-says-you-belong. */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-bold text-white leading-[1.15]">
              {heroContent.headlineLines.map(function(line, i) {
                return (
                  <span key={i} className="block">{line}</span>
                )
              })}
            </h1>
            <p className="mt-4 sm:mt-5 text-lg sm:text-xl md:text-2xl font-display font-semibold text-primary-400 leading-tight">
              {heroContent.punchline}
            </p>
            <p className="mt-6 text-base md:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
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

            {/* V11.17.3 — CTA rewrite per Round 3 panel (Riku/Sora).
                The hero no longer asks for signup — that ask was a
                commitment gate 5 seconds after landing. Instead the
                primary CTA invites exploration ("See what others have
                shared") and links to /discover. The first signup ask
                drops to after FeedShowcase, where the visitor has
                already seen value. */}
            <div className="mt-8 flex flex-col items-center justify-center gap-2">
              <Link
                href="/discover"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary-500 hover:bg-primary-400 text-white text-sm font-semibold transition-colors"
              >
                See what others have shared
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/start"
                className="inline-flex items-center justify-center px-2 py-1.5 text-[13px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
              >
                or add your own &rarr;
              </Link>
            </div>

            {/* V11.17.3 — trust line moved BELOW CTAs (Maya's mobile
                fold concern) and rewritten as a demonstration of
                breadth, mixing the dramatic and the subtle. */}
            <p className="mt-6 text-sm text-gray-400 max-w-2xl mx-auto leading-relaxed">
              {heroContent.trustLine}
            </p>

          </div>
        </div>
      </section>

      {/* === SECTION 2: Quick Nav Strip === */}
      <QuickNavStrip />

      {/* V11.17.3 — Live activity ticker (Elena's recommendation).
          Shows the 3-5 most-recent approved reports — proof of life
          that this is an active community, not a static archive.
          Renders nothing if the fetch errors or returns 0 (no
          empty-state UI on the marketing page). */}
      <LiveActivityTicker />

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
