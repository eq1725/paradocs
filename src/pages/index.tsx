'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import {
  Search, ArrowRight, MapPin, TrendingUp, Users,
  FileText, Compass, Map as MapIcon, BarChart3, Sparkles
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType } from '@/lib/database.types'
import { Phenomenon } from '@/lib/services/phenomena.service'
import { CATEGORY_CONFIG } from '@/lib/constants'
import ReportCard from '@/components/ReportCard'
import { TrendingPatternsWidget } from '@/components/patterns'

// Default fallback stats (reasonable estimates, updated periodically)
const DEFAULT_STATS = { total: 258000, thisMonth: 1000, locations: 14 }
const STATS_CACHE_KEY = 'paradocs_homepage_stats'

function getCachedStats() {
  if (typeof window === 'undefined') return DEFAULT_STATS
  try {
    const cached = localStorage.getItem(STATS_CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      // Use cached if it has reasonable values
      if (parsed.total > 0) return parsed
    }
  } catch (e) {
    // Ignore localStorage errors
  }
  return DEFAULT_STATS
}

function setCachedStats(stats: { total: number; thisMonth: number; locations: number }) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(stats))
  } catch (e) {
    // Ignore localStorage errors
  }
}

export default function Home() {
  const [featuredReports, setFeaturedReports] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  const [recentReports, setRecentReports] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  const [featuredPhenomena, setFeaturedPhenomena] = useState<Phenomenon[]>([])
  const [stats, setStats] = useState(DEFAULT_STATS)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Load cached stats immediately on mount
  useEffect(() => {
    setStats(getCachedStats())
    loadData()
  }, [])

  async function loadData() {
    try {
      // Featured reports
      const { data: featured } = await supabase
        .from('reports')
        .select('*, phenomenon_type:phenomenon_types(*)')
        .eq('status', 'approved')
        .eq('featured', true)
        .order('created_at', { ascending: false })
        .limit(3)

      // Recent reports
      const { data: recent } = await supabase
        .from('reports')
        .select('*, phenomenon_type:phenomenon_types(*)')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(6)

      // Fetch stats from server API (handles pagination and exact counts)
      const statsResponse = await fetch('/api/public/stats')
      const statsData = statsResponse.ok ? await statsResponse.json() : { total: 0, thisMonth: 0, countries: 0 }

      // Featured phenomena for encyclopedia section
      const { data: phenomena } = await supabase
        .from('phenomena')
        .select('*')
        .not('primary_image_url', 'is', null)
        .order('report_count', { ascending: false })
        .limit(6)

      setFeaturedPhenomena(phenomena || [])
      setFeaturedReports(featured || [])
      setRecentReports(recent || [])

      // Update stats and cache for next visit
      const newStats = {
        total: statsData.total || 0,
        thisMonth: statsData.thisMonth || 0,
        locations: statsData.countries || 0
      }
      setStats(newStats)
      if (newStats.total > 0) {
        setCachedStats(newStats)
      }
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

  const categories = Object.entries(CATEGORY_CONFIG).slice(0, 6)

  return (
    <>
      <Head>
        <title>Paradocs - The World's Largest Paranormal Database</title>
      </Head>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-900/20 via-transparent to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 relative">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold text-white leading-tight">
              Where Mysteries Meet{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-purple-400">
                Discovery
              </span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
              Explore the world's largest database of paranormal phenomena.
              Discover UFO sightings, cryptid encounters, ghost reports, and unexplained events.
            </p>

            {/* Search */}
            <form onSubmit={handleSearch} className="mt-10 max-w-xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search for phenomena, locations, or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 text-lg"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-primary px-6"
                >
                  Search
                </button>
              </div>
            </form>

            {/* Quick stats */}
            <div className="mt-12 flex flex-wrap justify-center gap-8 md:gap-16">
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-display font-bold text-white">
                  {stats.total.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500">Reports</p>
              </div>
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-display font-bold text-white">
                  {stats.locations}
                </p>
                <p className="text-sm text-gray-500">Countries</p>
              </div>
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-display font-bold text-white">
                  +{stats.thisMonth}
                </p>
                <p className="text-sm text-gray-500">This Month</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Grid */}
      <section className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-display font-bold text-white">
              Explore by Category
            </h2>
            <Link
              href="/explore"
              className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
            >
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

      {/* Trending Patterns - Moved up for AI differentiation */}
      <section className="py-12 border-t border-white/5 bg-gradient-to-b from-purple-900/10 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <TrendingPatternsWidget limit={3} showHeader={true} variant="inline" />
        </div>
      </section>

      {/* Reports Section - Combined Featured + Recent */}
      <section className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Featured Reports - Highlight row */}
          {featuredReports.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h2 className="text-xl font-display font-bold text-white">
                    Featured Reports
                  </h2>
                </div>
                <Link
                  href="/explore?featured=true"
                  className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
                >
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

          {/* Recent Reports */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-bold text-white">
                Latest Reports
              </h2>
              <Link
                href="/explore"
                className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
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

      {/* Phenomena Encyclopedia - Secondary discovery */}
      {featuredPhenomena.length > 0 && (
        <section className="py-12 border-t border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-display font-bold text-white">
                  Phenomena Encyclopedia
                </h2>
                <p className="text-gray-400 text-sm mt-1">Creatures, entities, and unexplained phenomena</p>
              </div>
              <Link
                href="/phenomena"
                className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1"
              >
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
                        <span className="text-3xl">{phenomenon.icon || '❓'}</span>
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

      {/* Quick Links - Condensed */}
      <section className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/explore" className="glass-card p-5 group flex items-start gap-4">
              <Compass className="w-8 h-8 text-primary-400 shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-white group-hover:text-primary-400 transition-colors">
                  Explore
                </h3>
                <p className="mt-1 text-gray-400 text-xs hidden sm:block">
                  Browse with powerful filters
                </p>
              </div>
            </Link>
            <Link href="/phenomena" className="glass-card p-5 group flex items-start gap-4">
              <Sparkles className="w-8 h-8 text-amber-400 shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-white group-hover:text-amber-400 transition-colors">
                  Encyclopedia
                </h3>
                <p className="mt-1 text-gray-400 text-xs hidden sm:block">
                  Bigfoot, Mothman & more
                </p>
              </div>
            </Link>
            <Link href="/map" className="glass-card p-5 group flex items-start gap-4">
              <MapIcon className="w-8 h-8 text-green-400 shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-white group-hover:text-green-400 transition-colors">
                  Global Map
                </h3>
                <p className="mt-1 text-gray-400 text-xs hidden sm:block">
                  Visualize sightings worldwide
                </p>
              </div>
            </Link>
            <Link href="/insights" className="glass-card p-5 group flex items-start gap-4">
              <TrendingUp className="w-8 h-8 text-purple-400 shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-white group-hover:text-purple-400 transition-colors">
                  AI Insights
                </h3>
                <p className="mt-1 text-gray-400 text-xs hidden sm:block">
                  Patterns & anomalies
                </p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 border-t border-white/5 bg-gradient-to-b from-transparent to-primary-900/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white">
            Have a Report to Share?
          </h2>
          <p className="mt-3 text-gray-400">
            Witnessed something unexplainable? Your experience matters.
          </p>
          <Link
            href="/submit"
            className="mt-6 inline-flex btn btn-primary px-6 py-3"
          >
            <FileText className="w-5 h-5" />
            Submit a Report
          </Link>
        </div>
      </section>
    </>
  )
}
