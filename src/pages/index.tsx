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
import { useABTest } from '@/lib/ab-testing'

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

export default function Home() {
  // A/B Test: Hero headline variants
  const heroAB = useABTest('hero_headline_v1', ['control', 'variant_b']);

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
        .select('title, location_name, summary, slug, phenomenon_types(name, category)')
        .eq('status', 'approved')
        .not('summary', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5)

      if (topReports) {
        setPreviewCards(topReports.map((r: any) => ({
          title: r.title || 'Untitled Report',
          location: r.location_name || 'Unknown Location',
          phenomenon: r.phenomenon_types?.name || 'Unknown',
          category: r.phenomenon_types?.category || '',
          slug: r.slug || '',
          teaser: (r.summary || '').substring(0, 120) + '...'
        })))
      }

      const statsResponse = await fetch('/api/public/stats')
      const statsData = statsResponse.ok ? await statsResponse.json() : { total: 0, thisMonth: 0, countries: 0 }

      // Get approximate user count
      const { count: uCount } = await supabase
        .from('profiles')
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 relative">
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
              {heroAB.variant === 'control' ? (
                <>Have You Experienced Something{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-purple-400">
                  You Can&apos;t Explain?
                </span></>
              ) : (
                <>The World&apos;s Largest Database of{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-purple-400">
                  Unexplained Encounters
                </span></>
              )}
            </h1>
            <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
              {heroAB.variant === 'control'
                ? "You\u2019re not alone. Explore 878+ documented encounters across 14 countries \u2014 and share your own."
                : "878+ documented encounters across 14 countries. Search, explore, and contribute to the unknown."}
            </p>

            {/* Dual CTA buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/explore"
                onClick={function() { heroAB.trackClick('start_exploring'); }}
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

      {/* Ghost Card Preview Carousel */}
      {previewCards.length > 0 && (
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
                      isActive
                        ? 'opacity-100 scale-100 translate-y-0 z-20'
                        : isPrev
                        ? 'opacity-40 scale-95 -translate-y-4 z-10'
                        : 'opacity-40 scale-95 translate-y-4 z-10'
                    }`}
                  >
                    <div className="glass-card p-5 sm:p-6 border border-white/10 hover:border-primary-500/30 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-300 text-xs font-medium">
                              {card.phenomenon}
                            </span>
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {card.location}
                            </span>
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
            {/* Dots indicator */}
            <div className="flex justify-center gap-2 mt-2">
              {previewCards.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActivePreview(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === activePreview ? 'bg-primary-400 w-6' : 'bg-white/20 hover:bg-white/40'
                  }`}
                />
              ))}
            </div>
          </div>
        </section>
      )}

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