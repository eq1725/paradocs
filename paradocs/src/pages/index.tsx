'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import {
  Search, ArrowRight, MapPin, TrendingUp, Users,
  FileText, Compass, Map as MapIcon, BarChart3
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import ReportCard from '@/components/ReportCard'

export default function Home() {
  const [featuredReports, setFeaturedReports] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  const [recentReports, setRecentReports] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  const [stats, setStats] = useState({ total: 0, thisMonth: 0, locations: 0 })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
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

      // Stats
      const { count: total } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')

      const thisMonth = new Date()
      thisMonth.setDate(1)
      const { count: monthly } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')
        .gte('created_at', thisMonth.toISOString())

      const { data: countries } = await supabase
        .from('reports')
        .select('country')
        .eq('status', 'approved')
        .not('country', 'is', null)

      const uniqueCountries = new Set(countries?.map(r => r.country)).size

      setFeaturedReports(featured || [])
      setRecentReports(recent || [])
      setStats({
        total: total || 0,
        thisMonth: monthly || 0,
        locations: uniqueCountries
      })
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
        <title>ParaDocs - The World's Largest Paranormal Database</title>
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
      <section className="py-16 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-display font-bold text-white">
              Explore by Category
            </h2>
            <Link
              href="/explore"
              className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.map(([key, config]) => (
              <Link
                key={key}
                href={`/explore?category=${key}`}
                className="glass-card p-6 text-center hover:scale-105 transition-transform group"
              >
                <span className="text-4xl block mb-3 group-hover:scale-110 transition-transform">
                  {config.icon}
                </span>
                <h3 className="font-medium text-white text-sm">{config.label}</h3>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Reports */}
      {featuredReports.length > 0 && (
        <section className="py-16 border-t border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-display font-bold text-white">
                Featured Reports
              </h2>
              <Link
                href="/explore?featured=true"
                className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredReports.map((report) => (
                <ReportCard key={report.id} report={report} variant="featured" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent Reports */}
      <section className="py-16 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-display font-bold text-white">
              Recent Reports
            </h2>
            <Link
              href="/explore"
              className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {loading ? (
            <div className="grid md:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="glass-card p-5 h-32 skeleton" />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {recentReports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-16 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6">
            <Link href="/explore" className="glass-card p-8 group">
              <Compass className="w-10 h-10 text-primary-400 mb-4" />
              <h3 className="text-xl font-display font-semibold text-white group-hover:text-primary-400 transition-colors">
                Explore Database
              </h3>
              <p className="mt-2 text-gray-400 text-sm">
                Browse thousands of documented paranormal encounters with powerful filters.
              </p>
            </Link>
            <Link href="/map" className="glass-card p-8 group">
              <MapIcon className="w-10 h-10 text-green-400 mb-4" />
              <h3 className="text-xl font-display font-semibold text-white group-hover:text-green-400 transition-colors">
                Interactive Map
              </h3>
              <p className="mt-2 text-gray-400 text-sm">
                Visualize sightings and encounters on a global interactive map.
              </p>
            </Link>
            <Link href="/analytics" className="glass-card p-8 group">
              <BarChart3 className="w-10 h-10 text-purple-400 mb-4" />
              <h3 className="text-xl font-display font-semibold text-white group-hover:text-purple-400 transition-colors">
                Data Analytics
              </h3>
              <p className="mt-2 text-gray-400 text-sm">
                Discover patterns and trends across all paranormal phenomena.
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-white">
            Have a Report to Share?
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Witnessed something unexplainable? Contribute to the world's most comprehensive
            paranormal database. Your experience matters.
          </p>
          <Link
            href="/submit"
            className="mt-8 inline-flex btn btn-primary text-lg px-8 py-4"
          >
            <FileText className="w-5 h-5" />
            Submit a Report
          </Link>
        </div>
      </section>
    </>
  )
}
