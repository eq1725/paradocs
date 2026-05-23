'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Search } from 'lucide-react'
import { useABTest } from '@/lib/ab-testing'
import { supabase } from '@/lib/supabase'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import type { GetStaticProps } from 'next'
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

// V11.17.4 — Round 4 brand-confidence pivot.
//
// Round 3's 3-line inclusion hero was warm but didn't claim the
// category. Round 4 compresses to a single-line brand-confident
// claim ("the home of the unexplained"), backs it immediately
// with the scale claim (world's largest archive, dynamic 98K+
// stat), and folds the Round 3 "you're not the only one" voice
// into the LiveActivityTicker eyebrow + one InlineSignupCTA.
//
// The {STAT_REPORTS} token is replaced server-side with the
// current approved-reports count, fetched via getStaticProps with
// hourly ISR (revalidate: 3600). So the page redeploys the number
// once an hour without a runtime DB hit.
//
// Brand pattern reference: Pinterest "Find your inspiration" +
// 100M-pins claim. Strava "where athletes track activities" +
// 100M-athlete claim. Spotify "Music for everyone" + 100M-song
// claim. Few-word headline + immediate category-scale assertion.
interface HeroContent {
  headline: string
  subheadlineTemplate: (statReports: string) => string
}
var HERO_VARIANTS: Record<string, HeroContent> = {
  X: {
    headline: 'The home of the unexplained.',
    subheadlineTemplate: function(statReports) {
      return "The world’s largest archive of first-person paranormal accounts — sightings, feelings, dreams, coincidences. " + statReports + " stories and growing. See who else has seen what you saw. Or share yours."
    },
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

interface HomePageStats {
  reports: number      // approved reports
  sources: number      // distinct source archives surfaced to user
  phenomena: number    // active phenomena entries
}

interface HomeProps {
  stats: HomePageStats
}

export default function Home(props: HomeProps) {
  var stats = props.stats || { reports: 98000, sources: 47, phenomena: 1463 }
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
        <title>Paradocs \u2014 The home of the unexplained.</title>
        <meta name="description" content="The world's largest archive of first-person paranormal accounts. Sightings, feelings, dreams, coincidences \u2014 tens of thousands of stories from people who've seen, felt, or experienced something they couldn't quite explain. Search what you've seen. Add your own." />
        <meta property="og:title" content="Paradocs \u2014 The home of the unexplained." />
        <meta property="og:description" content="The world's largest archive of first-person paranormal accounts. Sightings, feelings, dreams, coincidences. Search what you've seen. Add your own." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.discoverparadocs.com" />
        <meta property="og:image" content="https://www.discoverparadocs.com/og-home.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Paradocs \u2014 The home of the unexplained." />
        <meta name="twitter:description" content="The world's largest archive of first-person paranormal accounts. Sightings, feelings, dreams, coincidences. Search what you've seen. Add your own." />
        <link rel="canonical" href="https://www.discoverparadocs.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Paradocs',
            url: 'https://www.discoverparadocs.com',
            description: "The world's largest archive of first-person paranormal accounts. Sightings, feelings, dreams, coincidences from people who couldn't quite explain what they experienced.",
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

            {/* V11.17.4 — Brand-confident single-line headline.
                Few words, definite article, category claim. Pattern
                ref: Spotify "Music for everyone", Pinterest "Find
                your inspiration", Strava "where athletes track
                activities". The subhead immediately backs the brand
                claim with the world's-largest assertion + dynamic
                report count (refreshes hourly via ISR). */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold text-white leading-[1.05] tracking-tight">
              {heroContent.headline}
            </h1>
            <p className="mt-6 text-base md:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
              {heroContent.subheadlineTemplate(stats.reports.toLocaleString())}
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2.5 bg-primary-500 hover:bg-primary-400 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  See what&rsquo;s there
                </button>
              </div>
            </form>

            {/* V11.17.4 — Tighter CTA. Primary uses parallel
                construction with the hero's "see/seen" thread.
                Secondary stays low-friction. The trust line
                Round 3 had below CTAs is gone — the new subhead
                already lists the breadth (sightings, feelings,
                dreams, coincidences) so the trust line was doing
                duplicate work. */}
            <div className="mt-8 flex flex-col items-center justify-center gap-2">
              <Link
                href="/discover"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary-500 hover:bg-primary-400 text-white text-sm font-semibold transition-colors"
              >
                See what others have seen
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/start"
                className="inline-flex items-center justify-center px-2 py-1.5 text-[13px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
              >
                or add your own &rarr;
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* V11.17.4 — Live activity ticker moved above QuickNav per
          Riku/Elena (Round 4). First scroll-into-view should land
          on real activity, not a sub-nav. Eyebrow carries the
          "you're not the only one" Round 3 line as a recurring
          tagline. */}
      <LiveActivityTicker />

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
        headline="You're not the only one — see who else has seen what you saw."
        subhead="Create a free account to bookmark cases, follow regions and phenomena, and add your own experience to the archive."
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

// V11.17.4 — Hourly-refreshing stats via Next ISR.
//
// `getStaticProps` runs at build time AND every 3600s thereafter
// (on first request after the revalidate window expires). That gives
// us numbers that auto-update as the corpus grows, without a runtime
// DB hit on every visitor page-load.
//
// Fallback: if Supabase is unreachable at revalidate time, the
// previous static page keeps serving. Hard-coded fallback values
// inside Home() handle the edge case where stats is absent.
export var getStaticProps: GetStaticProps<HomeProps> = async function () {
  var fallback: HomePageStats = { reports: 98000, sources: 47, phenomena: 1463 }
  var url = process.env.NEXT_PUBLIC_SUPABASE_URL
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return { props: { stats: fallback }, revalidate: 3600 }
  }
  try {
    var sb = createSupabaseAdmin(url, key, { auth: { persistSession: false } })
    var [reportsRes, phenomenaRes] = await Promise.all([
      sb.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      sb.from('phenomena').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ])
    var stats: HomePageStats = {
      reports: reportsRes.count || fallback.reports,
      // `sources` is a content-curated number (count of distinct
      // archives surfaced to the user — NUFORC, MUFON, BFRO, Arctic
      // Shift subreddits aggregated as one, historical archives, etc.).
      // Not a single DB query. Bump this when we add a new source.
      sources: 47,
      phenomena: phenomenaRes.count || fallback.phenomena,
    }
    return { props: { stats: stats }, revalidate: 3600 }
  } catch (e) {
    console.warn('[homepage getStaticProps] stats fetch failed; using fallback:', (e as any)?.message || e)
    return { props: { stats: fallback }, revalidate: 3600 }
  }
}
