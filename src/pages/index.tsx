'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { Search, ArrowRight, MapPin, TrendingUp, Users, FileText, Compass, Map as MapIcon, BarChart3, Sparkles, Eye, ChevronRight, Send, Globe, Shield, MessageCircle, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType } from '@/lib/database.types'
import { Phenomenon } from '@/lib/services/phenomena.service'
import { CATEGORY_CONFIG } from '@/lib/constants'
import ReportCard from '@/components/ReportCard'
import ImageWithFallback from '@/components/ImageWithFallback'
import { TrendingPatternsWidget } from '@/components/patterns'
import { hasCompletedOnboarding } from '@/components/OnboardingTour'
import { useABTest } from '@/lib/ab-testing'
import FourPillars from '@/components/homepage/FourPillars'
import AIPreview from '@/components/homepage/AIPreview'
import DashboardPreview from '@/components/homepage/DashboardPreview'
import DiscoverPreview from '@/components/homepage/DiscoverPreview'

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

const DEFAULT_STATS = { total: 258000, thisMonth: 1000, locations: 14 }
const STATS_CACHE_KEY = 'paradocs_homepage_stats'

function getCachedStats() {
  if (typeof window === 'undefined') return DEFAULT_STATS
  try {
    const cached = localStorage.getItem(STATS_CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (parsed.total > 0) return parsed
    }
  } catch (e) {}
  return DEFAULT_STATS
}

function setCachedStats(stats: { total: number; thisMonth: number; locations: number }) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(stats)) } catch (e) {}
}

// Animated count-up hook
function useCountUp(target: number, duration: number = 2000, start: boolean = true) {
  const [count, setCount] = useState(0)
  const startTime = useRef<number | null>(null)
  const rafId = useRef<number>(0)

  useEffect(() => {
    if (!start || target <= 0) return
    startTime.current = null
    
    function animate(timestamp: number) {
      if (!startTime.current) startTime.current = timestamp
      const progress = Math.min((timestamp - startTime.current) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setCount(Math.floor(eased * target))
      if (progress < 1) rafId.current = requestAnimationFrame(animate)
    }
    
    rafId.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId.current)
  }, [target, duration, start])

  return count
}

// Ghost card preview data type
interface PreviewCard {
  title: string
  location: string
  phenomenon: string
  category: string
  slug: string
  teaser: string
}

// Cinematic spotlight story
interface SpotlightStory {
  id: string
  title: string
  slug: string
  teaser: string
  location: string
  eventDate: string
  witnessCount: number
  hasEvidence: boolean
  hasMedia: boolean
  category: string
  phenomenon: string
  imageUrl: string | null
  imageCaption: string | null
}

interface FeaturedInvestigation {
  id: string
  case_group: string
  title: string
  subtitle: string | null
  editorial_blurb: string
  hero_image_url: string | null
  hero_image_caption: string | null
  showcase_slug: string
  report_count: number
  category: string | null
  location_label: string | null
  date_label: string | null
  stories: Array<{ id: string; title: string; slug: string; teaser: string; imageUrl: string | null }>
}

export default function Home() {
  // A/B test for hero headline — 5 variants defined in admin/ab-testing.tsx
  var heroTest = useABTest('hero_headline', ['A', 'B', 'C', 'D', 'E'])
  var heroContent = HERO_VARIANTS[heroTest.variant] || HERO_VARIANTS.B

  const [featuredReports, setFeaturedReports] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  const [recentReports, setRecentReports] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  const [featuredPhenomena, setFeaturedPhenomena] = useState<Phenomenon[]>([])
  const [stats, setStats] = useState(DEFAULT_STATS)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showTourCTA, setShowTourCTA] = useState(false)
  const [statsVisible, setStatsVisible] = useState(false)
  const [previewCards, setPreviewCards] = useState<PreviewCard[]>([])
  const [activePreview, setActivePreview] = useState(0)
  const [spotlightStories, setSpotlightStories] = useState<SpotlightStory[]>([])
  const [spotlightImageLoaded, setSpotlightImageLoaded] = useState(false)
  const [featuredInvestigations, setFeaturedInvestigations] = useState<FeaturedInvestigation[]>([])
  const [featuredHeroLoaded, setFeaturedHeroLoaded] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [userCount, setUserCount] = useState(0)
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [researchItems, setResearchItems] = useState<any[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)

  const animatedTotal = useCountUp(stats.total, 2500, statsVisible)
  const animatedLocations = useCountUp(stats.locations, 1800, statsVisible)
  const animatedMonth = useCountUp(stats.thisMonth, 1500, statsVisible)

  // Intersection observer for stats animation
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStatsVisible(true) },
      { threshold: 0.3 }
    )
    if (statsRef.current) observer.observe(statsRef.current)
    return () => observer.disconnect()
  }, [])

  // Auto-rotate preview cards
  useEffect(() => {
    if (previewCards.length <= 1) return
    const interval = setInterval(() => {
      setActivePreview(prev => (prev + 1) % previewCards.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [previewCards.length])

  useEffect(() => {
    if (typeof window !== 'undefined' && !hasCompletedOnboarding()) {
      setShowTourCTA(true)
    }
  }, [])

  useEffect(() => {
    setStats(getCachedStats())
    loadData()
  }, [])

  // Fetch "Continue Your Research" items for logged-in users
  useEffect(() => {
    async function loadResearchItems() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      setIsLoggedIn(true)
      try {
        const resp = await fetch('/api/constellation/entries', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        })
        if (!resp.ok) return
        const data = await resp.json()
        if (data.entries?.length > 0) {
          setResearchItems(data.entries.slice(0, 6).map((e: any) => ({
            id: e.id,
            name: e.report?.title || 'Untitled',
            slug: e.report?.slug,
            category: e.report?.category || '',
            verdict: e.verdict,
            note: e.note,
            createdAt: e.created_at,
          })).filter((e: any) => e.slug))
        }
      } catch (err) {
        console.warn('Continue Your Research fetch failed:', err)
      }
    }
    loadResearchItems()
  }, [])

  async function loadData() {
    try {
      const { data: featured } = await supabase
        .from('reports')
        .select('*, phenomenon_type:phenomenon_types(*)')
        .eq('status', 'approved')
        .eq('featured', true)
        .order('created_at', { ascending: false })
        .limit(3)

      const { data: recent } = await supabase
        .from('reports')
        .select('*, phenomenon_type:phenomenon_types(*)')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(6)

      // Build preview cards from top reports
      const { data: topReports } = await supabase
        .from('reports')
        .select('title, location_text, summary, slug, phenomenon_types(name, category)')
        .eq('status', 'approved')
        .not('summary', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5)

      if (topReports) {
        setPreviewCards(topReports.map((r: any) => ({
          title: r.title || 'Untitled Report',
          location: r.location_text || 'Unknown Location',
          phenomenon: r.phenomenon_types?.name || 'Unknown',
          category: r.phenomenon_types?.category || '',
          slug: r.slug || '',
          teaser: (r.summary || '').substring(0, 120) + '...'
        })))
      }

      // Fetch spotlight stories - reports with media images for cinematic hero
      const { data: spotlightData } = await supabase
        .from('reports')
        .select(`
          id, title, slug, summary, location_name, event_date, witness_count,
          has_physical_evidence, has_photo_video, category,
          phenomenon_type:phenomenon_types(name),
          report_media(url, caption, media_type, is_primary)
        `)
        .eq('status', 'approved')
        .eq('has_photo_video', true)
        .order('view_count', { ascending: false })
        .limit(15)

      if (spotlightData) {
        const stories: SpotlightStory[] = spotlightData
          .map((r: any) => {
            const images = (r.report_media || []).filter((m: any) =>
              m.media_type === 'image' || m.url?.match(/\.(jpg|jpeg|png|webp|gif)/i)
            )
            const primaryImage = images.find((m: any) => m.is_primary) || images[0]
            return {
              id: r.id,
              title: r.title,
              slug: r.slug,
              teaser: (r.summary || '').substring(0, 220),
              location: r.location_name || '',
              eventDate: r.event_date
                ? new Date(r.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
                : '',
              witnessCount: r.witness_count || 0,
              hasEvidence: r.has_physical_evidence,
              hasMedia: r.has_photo_video,
              category: r.category || '',
              phenomenon: (r.phenomenon_type as any)?.name || '',
              imageUrl: primaryImage?.url || null,
              imageCaption: primaryImage?.caption || null,
            }
          })
          .filter((s: SpotlightStory) => s.imageUrl)

        // Prioritize Roswell as the lead story if present
        const roswellIdx = stories.findIndex((s) => s.slug?.includes('roswell'))
        if (roswellIdx > 0) {
          const [roswell] = stories.splice(roswellIdx, 1)
          stories.unshift(roswell)
        }
        setSpotlightStories(stories.slice(0, 4))
      }

      // Fetch editorially curated featured investigations
      try {
        const featuredResp = await fetch('/api/public/featured-investigations')
        if (featuredResp.ok) {
          const featuredData = await featuredResp.json()
          setFeaturedInvestigations(featuredData.investigations || [])
        }
      } catch (e) {
        // Silently fall back to spotlight stories
      }

      const statsResponse = await fetch('/api/public/stats')
      const statsData = statsResponse.ok ? await statsResponse.json() : { total: 0, thisMonth: 0, countries: 0 }

      // Get approximate user count
      const { count: uCount } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
      setUserCount(uCount || 0)

      const { data: phenomena } = await supabase
        .from('phenomena')
        .select('*')
        .not('primary_image_url', 'is', null)
        .order('report_count', { ascending: false })
        .limit(6)

      setFeaturedPhenomena(phenomena || [])
      setFeaturedReports(featured || [])
      setRecentReports(recent || [])

      // Fetch report counts per category for category badges
      try {
        const { data: catCounts } = await supabase
          .from('reports')
          .select('category')
          .eq('status', 'approved')
        if (catCounts) {
          const counts: Record<string, number> = {}
          catCounts.forEach((r: any) => { counts[r.category] = (counts[r.category] || 0) + 1 })
          setCategoryCounts(counts)
        }
      } catch (e) { /* non-critical */ }

      const newStats = {
        total: statsData.total || 0,
        thisMonth: statsData.thisMonth || 0,
        locations: statsData.countries || 0
      }
      setStats(newStats)
      if (newStats.total > 0) setCachedStats(newStats)
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      heroTest.trackConversion('search')
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`
    }
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!emailInput.trim() || emailSubmitting) return
    setEmailSubmitting(true)
    try {
      const res = await fetch('/api/beta-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim(), source: 'homepage_digest' })
      })
      if (res.ok) {
        setEmailSuccess(true)
        setEmailInput('')
      }
    } catch (e) {
      console.error('Email signup error:', e)
    } finally {
      setEmailSubmitting(false)
    }
  }

  const categories = Object.entries(CATEGORY_CONFIG).slice(0, 6)

  return (
    <>
      <Head>
        <title>Paradocs - The World{'\u2019'}s Largest Paranormal Database</title>
        <meta name="description" content="Explore 258,000+ paranormal reports. UFO sightings, cryptid encounters, ghost reports, and unexplained events from around the world. Search, map, and analyze the unknown." />
        <meta property="og:title" content="Paradocs - Where Mysteries Meet Discovery" />
        <meta property="og:description" content="The world's largest database of paranormal phenomena. Discover UFO sightings, cryptid encounters, ghost reports, and unexplained events." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://beta.discoverparadocs.com" />
        <meta property="og:image" content="https://beta.discoverparadocs.com/og-home.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Paradocs - Where Mysteries Meet Discovery" />
        <meta name="twitter:description" content="Explore the world's largest database of paranormal phenomena." />
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

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-900/20 via-transparent to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 relative">
          <div className="text-center max-w-4xl mx-auto">

            {/* Social proof badge */}
            {userCount > 0 && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 animate-fade-in">
                <div className="flex -space-x-2">
                  <div className="w-6 h-6 rounded-full bg-primary-500/30 border border-primary-400/50" />
                  <div className="w-6 h-6 rounded-full bg-purple-500/30 border border-purple-400/50" />
                  <div className="w-6 h-6 rounded-full bg-amber-500/30 border border-amber-400/50" />
                </div>
                <span className="text-sm text-gray-300">
                  Join <span className="text-white font-semibold">{userCount.toLocaleString()}+</span> researchers tracking the unexplained
                </span>
              </div>
            )}

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold text-white leading-tight">
              {heroContent.headline}
            </h1>
            <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
              {heroContent.subheadline}
            </p>

            {/* Search bar — primary CTA */}
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

            {/* Stats — pipeline story (Phase 3 item 20: launch-ready stats)
                Pre-ingestion: show encyclopedia + investigations + categories + AI badge
                Post-ingestion: swap first stat to "5M+ Sources Scanned" and add "[X] Reports Approved" */}
            <div ref={statsRef} className={"mt-12 flex flex-wrap justify-center gap-6 md:gap-12 transition-opacity duration-700 " + (statsVisible ? "opacity-100" : "opacity-0")}>
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-display font-bold text-white tabular-nums">
                  4,792+
                </p>
                <p className="text-sm text-gray-500 flex items-center justify-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Encyclopedia Entries
                </p>
              </div>
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-display font-bold text-white tabular-nums">
                  20+
                </p>
                <p className="text-sm text-gray-500 flex items-center justify-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> Curated Investigations
                </p>
              </div>
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-display font-bold text-white tabular-nums">
                  11
                </p>
                <p className="text-sm text-gray-500 flex items-center justify-center gap-1">
                  <Globe className="w-3.5 h-3.5" /> Phenomenon Categories
                </p>
              </div>
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-pink-400 tabular-nums">
                  AI
                </p>
                <p className="text-sm text-gray-500 flex items-center justify-center gap-1">
                  <BarChart3 className="w-3.5 h-3.5" /> Pattern Analysis
                </p>
              </div>
            </div>

            {/* Tour CTA removed — Roswell-specific, bring back when editorial content is promoted properly */}
          </div>
        </div>
      </section>

      {/* === SECTION 2: Four Pillars — "What Is Paradocs?" === */}
      <FourPillars />

      {/* === SECTION 3: Product Taste — Discover/Stories Preview === */}
      <DiscoverPreview />

      {/* === SECTION 4: Email Capture === */}
      <section className="py-16 border-t border-white/5 bg-gradient-to-b from-transparent to-primary-900/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white">
            Stay Connected to the Unknown
          </h2>
          <p className="mt-3 text-gray-400">
            Get weekly paranormal insights, trending sightings, and new discoveries delivered to your inbox.
          </p>

          {emailSuccess ? (
            <div className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300">
              <Shield className="w-5 h-5" />
              <span>You{'\u2019'}re in! Check your inbox for a welcome message.</span>
            </div>
          ) : (
            <form onSubmit={handleEmailSignup} className="mt-6 max-w-md mx-auto flex gap-2">
              <input
                type="email"
                placeholder="your@email.com"
                value={emailInput}
                onChange={function(e) { setEmailInput(e.target.value) }}
                required
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
              <button
                type="submit"
                disabled={emailSubmitting}
                className="btn btn-primary px-6 py-3 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {emailSubmitting ? '...' : 'Subscribe'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* === REMOVED SECTIONS (components preserved, removed from render) ===
          - AIPreview: bring back after mass ingestion populates real patterns
          - Inline email capture: one at bottom is enough
          - Featured Investigation (Roswell): bring back when 4+ investigations exist
          - Secondary stories row: part of Featured Investigation
          - Ghost card preview carousel: fallback, no longer needed
          - More Investigations (Rendlesham): bring back when >= 3 investigations
          - Continue Your Research: logged-in feature, belongs in dashboard
          - Categories Grid: duplicates Explore page nav
          - Recent Reports: duplicates Discover preview
          - Phenomena Encyclopedia: duplicates Encyclopedia nav
          - DashboardPreview: covered by Four Pillars Research Workspace card
          - Submit a Report CTA: power-user action, belongs on report pages
      */}
    </>
  )
}