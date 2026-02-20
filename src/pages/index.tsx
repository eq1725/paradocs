'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { Search, ArrowRight, MapPin, TrendingUp, Users, FileText, Compass, Map as MapIcon, BarChart3, Sparkles, Eye, ChevronRight, Send, Globe, Shield, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType } from '@/lib/database.types'
import { Phenomenon } from '@/lib/services/phenomena.service'
import { CATEGORY_CONFIG } from '@/lib/constants'
import ReportCard from '@/components/ReportCard'
import { TrendingPatternsWidget } from '@/components/patterns'
import { hasCompletedOnboarding } from '@/components/OnboardingTour'

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

export default function Home() {
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
  const [emailInput, setEmailInput] = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [userCount, setUserCount] = useState(0)
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
        <title>Paradocs - The World's Largest Paranormal Database</title>
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
              Where Mysteries Meet{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-purple-400">
                Discovery
              </span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
              Explore the world's largest database of paranormal phenomena. Discover UFO sightings, cryptid encounters, ghost reports, and unexplained events.
            </p>

            {/* Dual CTA buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/explore"
                className="btn btn-primary px-8 py-4 text-lg font-semibold flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                <Compass className="w-5 h-5" />
                Start Exploring
              </Link>
              <Link
                href="/submit"
                className="px-8 py-4 text-lg font-semibold flex items-center gap-2 rounded-xl border border-white/20 text-white hover:bg-white/5 transition-colors w-full sm:w-auto justify-center"
              >
                <MessageCircle className="w-5 h-5" />
                Share Your Experience
              </Link>
            </div>

            {/* Search bar - now secondary */}
            <form onSubmit={handleSearch} className="mt-8 max-w-xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search 258,000+ reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            </form>

            {/* Animated stats counter */}
            <div ref={statsRef} className={"mt-12 flex flex-wrap justify-center gap-8 md:gap-16 transition-opacity duration-700 " + (statsVisible ? "opacity-100" : "opacity-0")}>
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-display font-bold text-white tabular-nums">
                  {statsVisible ? animatedTotal.toLocaleString() : stats.total.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 flex items-center justify-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> Reports Analyzed
                </p>
              </div>
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-display font-bold text-white tabular-nums">
                  {statsVisible ? animatedLocations : stats.locations}
                </p>
                <p className="text-sm text-gray-500 flex items-center justify-center gap-1">
                  <Globe className="w-3.5 h-3.5" /> Countries
                </p>
              </div>
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-display font-bold text-white tabular-nums">
                  +{statsVisible ? animatedMonth.toLocaleString() : stats.thisMonth.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 flex items-center justify-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> This Month
                </p>
              </div>
            </div>

            {/* Tour CTA for new users */}
            {showTourCTA && (
              <div className="mt-8 animate-fade-in">
                <Link
                  href="/report/the-roswell-incident-july-1947-showcase?tour=true"
                  className="inline-flex items-center gap-3 px-6 py-3 rounded-xl text-sm font-medium text-white transition-all hover:scale-105"
                  style={{
                    background: 'rgba(91, 99, 241, 0.15)',
                    border: '1px solid rgba(91, 99, 241, 0.3)',
                  }}
                >
                  <Sparkles className="w-4 h-4 text-primary-400" />
                  <span>New here? Take a guided tour of the Roswell Incident</span>
                  <ArrowRight className="w-4 h-4 text-primary-400" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Cinematic Story Spotlight */}
      {spotlightStories.length > 0 ? (
        <section className="py-6 -mt-2 relative z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-6 rounded-full bg-primary-500" />
              <h2 className="text-lg font-display font-semibold text-white tracking-wide uppercase">
                Featured Investigation
              </h2>
            </div>

            {/* Primary Featured Story - Full-width cinematic card */}
            <Link
              href={`/report/${spotlightStories[0]?.slug}`}
              className="block group"
            >
              <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: '520px' }}>
                {/* Background Image */}
                {spotlightStories[0]?.imageUrl && (
                  <img
                    src={spotlightStories[0].imageUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.5s] group-hover:scale-[1.03]"
                    onLoad={() => setSpotlightImageLoaded(true)}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                {/* Fallback gradient when no image or loading */}
                <div className={`absolute inset-0 transition-opacity duration-700 ${
                  spotlightImageLoaded && spotlightStories[0]?.imageUrl ? 'opacity-0' : 'opacity-100'
                } bg-gradient-to-br from-primary-900 via-gray-900 to-purple-900`} />

                {/* Cinematic gradient overlays - much stronger for readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-black to-transparent" />
                {/* Vignette */}
                <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 150px 60px rgba(0,0,0,0.5)' }} />

                {/* Content overlay */}
                <div className="relative z-10 p-6 sm:p-10 md:p-14 lg:p-16 flex flex-col justify-end" style={{ minHeight: '520px' }}>
                  {/* Bottom content */}
                  <div className="max-w-2xl">
                    {spotlightStories[0]?.phenomenon && (
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest mb-4"
                        style={{ background: 'rgba(91, 99, 241, 0.3)', border: '1px solid rgba(91, 99, 241, 0.4)', color: '#c4b5fd' }}>
                        {spotlightStories[0].phenomenon}
                      </span>
                    )}

                    <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-bold text-white leading-[1.1] tracking-tight">
                      {spotlightStories[0]?.title}
                    </h2>

                    {/* Location & Date */}
                    <div className="flex flex-wrap items-center gap-4 mt-4">
                      {spotlightStories[0]?.location && (
                        <span className="flex items-center gap-2 text-sm text-gray-200">
                          <MapPin className="w-4 h-4 text-primary-400" />
                          {spotlightStories[0].location}
                        </span>
                      )}
                      {spotlightStories[0]?.eventDate && (
                        <span className="text-sm text-gray-400 before:content-['·'] before:mr-4 before:text-gray-600">
                          {spotlightStories[0].eventDate}
                        </span>
                      )}
                    </div>

                    {/* Teaser */}
                    <p className="mt-5 text-base sm:text-lg text-gray-300 line-clamp-3 leading-relaxed">
                      {spotlightStories[0]?.teaser}
                    </p>

                    {/* Evidence pills */}
                    <div className="flex flex-wrap items-center gap-2.5 mt-6">
                      {spotlightStories[0]?.witnessCount > 0 && (
                        <span className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-white font-medium"
                          style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(251,191,36,0.25)' }}>
                          <Users className="w-4 h-4 text-amber-400" />
                          {spotlightStories[0].witnessCount} Witnesses
                        </span>
                      )}
                      {spotlightStories[0]?.hasEvidence && (
                        <span className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-white font-medium"
                          style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(74,222,128,0.25)' }}>
                          <Shield className="w-4 h-4 text-green-400" />
                          Physical Evidence
                        </span>
                      )}
                      {spotlightStories[0]?.hasMedia && (
                        <span className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-white font-medium"
                          style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(96,165,250,0.25)' }}>
                          <Eye className="w-4 h-4 text-blue-400" />
                          Photos &amp; Video
                        </span>
                      )}
                    </div>

                    {/* CTA button */}
                    <div className="mt-8">
                      <span className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-primary-500 text-white font-semibold text-base shadow-lg shadow-primary-500/25 group-hover:bg-primary-400 group-hover:shadow-primary-400/30 group-hover:translate-y-[-1px] transition-all duration-300">
                        Read the Full Investigation
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>

            {/* Secondary Stories Row */}
            {spotlightStories.length > 1 && (
              <div className={`grid grid-cols-1 gap-3 mt-4 ${
                spotlightStories.length >= 4 ? 'sm:grid-cols-3' :
                spotlightStories.length === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' :
                'sm:grid-cols-2'
              } sm:gap-4`}>
                {spotlightStories.slice(1, 4).map((story, i) => (
                  <Link
                    key={story.id}
                    href={`/report/${story.slug}`}
                    className="group glass-card overflow-hidden flex flex-row sm:flex-col border border-white/5 hover:border-primary-500/30 hover:bg-white/[0.03] transition-all duration-300"
                  >
                    <div className="relative w-28 sm:w-full h-28 sm:h-44 shrink-0 overflow-hidden">
                      {story.imageUrl ? (
                        <img
                          src={story.imageUrl}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : null}
                      <div className={`absolute inset-0 flex items-center justify-center ${story.imageUrl ? 'hidden' : ''} ${
                        ['bg-gradient-to-br from-emerald-900/60 to-gray-900',
                         'bg-gradient-to-br from-purple-900/60 to-gray-900',
                         'bg-gradient-to-br from-amber-900/60 to-gray-900'][i % 3]
                      }`}>
                        <span className="text-4xl opacity-40">
                          {CATEGORY_CONFIG[story.category as keyof typeof CATEGORY_CONFIG]?.icon || '✨'}
                        </span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    </div>
                    <div className="p-3 sm:p-4 flex-1 min-w-0">
                      <span className="text-[10px] sm:text-xs font-semibold text-primary-400 uppercase tracking-wider">
                        {story.phenomenon}
                      </span>
                      <h3 className="mt-1.5 text-sm font-display font-semibold text-white line-clamp-2 group-hover:text-primary-300 transition-colors leading-snug">
                        {story.title}
                      </h3>
                      <p className="mt-2 text-xs text-gray-400 line-clamp-3 hidden sm:block leading-relaxed">
                        {story.teaser}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Read more <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : previewCards.length > 0 ? (
        /* Fallback: Ghost Card Preview Carousel (if no spotlight stories with images) */
        <section className="py-8 -mt-8 relative z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative h-48 sm:h-44">
              {previewCards.map((card, i) => {
                const isActive = i === activePreview
                const isPrev = i === (activePreview - 1 + previewCards.length) % previewCards.length
                const isNext = i === (activePreview + 1) % previewCards.length
                if (!isActive && !isPrev && !isNext) return null
                return (
                  <Link
                    key={i}
                    href={`/report/${card.slug}`}
                    className={`absolute inset-x-0 mx-auto max-w-2xl transition-all duration-700 ease-out ${
                      isActive ? 'opacity-100 scale-100 translate-y-0 z-20'
                        : isPrev ? 'opacity-40 scale-95 -translate-y-4 z-10'
                        : 'opacity-40 scale-95 translate-y-4 z-10'
                    }`}
                  >
                    <div className="glass-card p-5 sm:p-6 border border-white/10 hover:border-primary-500/30 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-300 text-xs font-medium">{card.phenomenon}</span>
                            <span className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {card.location}</span>
                          </div>
                          <h3 className="text-lg font-display font-semibold text-white truncate">{card.title}</h3>
                          <p className="mt-2 text-sm text-gray-400 line-clamp-2">{card.teaser}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-500 shrink-0 mt-1" />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
            <div className="flex justify-center gap-2 mt-2">
              {previewCards.map((_, i) => (
                <button key={i} onClick={() => setActivePreview(i)}
                  className={`w-2 h-2 rounded-full transition-all ${i === activePreview ? 'bg-primary-400 w-6' : 'bg-white/20 hover:bg-white/40'}`}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Categories Grid */}
      <section className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-display font-bold text-white">
              Explore by Category
            </h2>
            <Link href="/explore" className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {categories.map(([key, config]) => (
              <Link
                key={key}
                href={`/explore?category=${key}`}
                className="glass-card p-4 text-center hover:scale-105 transition-transform group"
              >
                <span className="text-3xl block mb-2 group-hover:scale-110 transition-transform">
                  {config.icon}
                </span>
                <h3 className="font-medium text-white text-xs sm:text-sm">{config.label}</h3>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Trending Patterns */}
      <section className="py-12 border-t border-white/5 bg-gradient-to-b from-purple-900/10 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <TrendingPatternsWidget limit={3} showHeader={true} variant="inline" />
        </div>
      </section>

      {/* Reports Section */}
      <section className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {featuredReports.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h2 className="text-xl font-display font-bold text-white">Featured Reports</h2>
                </div>
                <Link href="/explore?featured=true" className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1">
                  View all <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {featuredReports.map((report) => (
                  <ReportCard key={report.id} report={report} variant="featured" />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-bold text-white">Latest Reports</h2>
              <Link href="/explore" className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1">
                Explore all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            {loading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="glass-card p-5 h-32 skeleton" />
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentReports.map((report) => (
                  <ReportCard key={report.id} report={report} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Phenomena Encyclopedia */}
      {featuredPhenomena.length > 0 && (
        <section className="py-12 border-t border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-display font-bold text-white">Phenomena Encyclopedia</h2>
                <p className="text-gray-400 text-sm mt-1">Creatures, entities, and unexplained phenomena</p>
              </div>
              <Link href="/phenomena" className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1">
                Browse all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {featuredPhenomena.map((phenomenon) => (
                <Link
                  key={phenomenon.id}
                  href={`/phenomena/${phenomenon.slug}`}
                  className="glass-card overflow-hidden group hover:scale-105 transition-transform"
                >
                  <div className="aspect-square relative">
                    {phenomenon.primary_image_url ? (
                      <img
                        src={phenomenon.primary_image_url}
                        alt={phenomenon.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                        <span className="text-3xl">{phenomenon.icon || '\u2753'}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  </div>
                  <div className="p-2 sm:p-3">
                    <h3 className="font-medium text-white text-xs sm:text-sm truncate">{phenomenon.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">{phenomenon.report_count?.toLocaleString() || 0} reports</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Quick Links */}
      <section className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/explore" className="glass-card p-5 group flex items-start gap-4">
              <Compass className="w-8 h-8 text-primary-400 shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-white group-hover:text-primary-400 transition-colors">Explore</h3>
                <p className="mt-1 text-gray-400 text-xs hidden sm:block">Browse with powerful filters</p>
              </div>
            </Link>
            <Link href="/phenomena" className="glass-card p-5 group flex items-start gap-4">
              <Sparkles className="w-8 h-8 text-amber-400 shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-white group-hover:text-amber-400 transition-colors">Encyclopedia</h3>
                <p className="mt-1 text-gray-400 text-xs hidden sm:block">Bigfoot, Mothman & more</p>
              </div>
            </Link>
            <Link href="/map" className="glass-card p-5 group flex items-start gap-4">
              <MapIcon className="w-8 h-8 text-green-400 shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-white group-hover:text-green-400 transition-colors">Global Map</h3>
                <p className="mt-1 text-gray-400 text-xs hidden sm:block">Visualize sightings worldwide</p>
              </div>
            </Link>
            <Link href="/insights" className="glass-card p-5 group flex items-start gap-4">
              <TrendingUp className="w-8 h-8 text-purple-400 shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-white group-hover:text-purple-400 transition-colors">AI Insights</h3>
                <p className="mt-1 text-gray-400 text-xs hidden sm:block">Patterns & anomalies</p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Email Capture + CTA Section */}
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
              <span>You're in! Check your inbox for a welcome message.</span>
            </div>
          ) : (
            <form onSubmit={handleEmailSignup} className="mt-6 max-w-md mx-auto flex gap-2">
              <input
                type="email"
                placeholder="your@email.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
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

          <div className="mt-10 pt-8 border-t border-white/5">
            <h3 className="text-lg font-display font-semibold text-white">Have a Report to Share?</h3>
            <p className="mt-2 text-gray-400 text-sm">
              Witnessed something unexplainable? Your experience matters.
            </p>
            <Link href="/submit" className="mt-4 inline-flex btn btn-primary px-6 py-3">
              <FileText className="w-5 h-5" />
              Submit a Report
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}