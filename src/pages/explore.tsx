'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { Search, SlidersHorizontal, X, ChevronDown, Sparkles, ArrowRight, TrendingUp, MapPin, Heart, Clock, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType, PhenomenonCategory, CredibilityLevel, ContentType } from 'A/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG, CONTENT_TYPE_CONFIG, COUNTRIES } from '@/lib/constants'
import CategoryFilter from '@/components/CategoryFilter'
import SubcategoryFilter from '@/components/SubcategoryFilter'
import ReportCard from '@/components/ReportCard'
import { classNames } from 'A/lib/utils'
import AskTheUnknown from '@/components/AskTheUnknown'
import WelcomeOnboarding, { hasCompletedWelcome } from '@/components/WelcomeOnboarding'

interface FeedReport {
  id: string
  title: string
  slug: string
  summary: string | null
  category: string
  country: string | null
  city: string | null
  state_province: string | null
  event_date: string | null
  credibility: string | null
  upvotes: number
  view_count: number
  comment_count: number
  created_at: string
  phenomenon_type?: { name: string; category: string; slug: string } | null
}

interface FeedSection {
  id: string
  title: string
  subtitle: string
  reports: FeedReport[]
}

type SortOption = 'newest' | 'oldest' | 'popular' | "most_viewed'

export default function ExplorePage() {
  const router = useRouter()
  const [reports, setReports] = useState<Partial<Report>[]>([])
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    if (!hasCompletedWelcome()) setShowWelcome(true)
  }, [])
  const [loading, setLoading] = useState(true)

  // Feed state
  const [feedSections, setFeedSections] = useState<FeedSection[]>([])
  const [feedLoading, setFeedLoading] = useState(true)
  const [activeView, setActiveView] = useState<'feed' | 'browse'>('feed')

  const [showFilters, setShowFilters] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [baselineCount, setBaselineCount] = useState(0)
  const [page, setPage] = useState(1)
  const perPage = 12

  useEffect(() => {
    async function fetchTotalCount() {
      try {
        const res = await fetch('/api/public/stats')
        if (res.ok) {
          const data = await res.json()
          setBaselineCount(data.total || 0)
          setTotalCount(data.total || 0)
        }
      } catch (_e) {
        setBaselineCount(0)
      }
    }
    fetchTotalCount()
  }, [])

  // Filters
  const [category, setCategory] = useState<PhenomenonCategory | 'all'>('all')
  const [selectedCategories, setSelectedCategories] = useState<PhenomenonCategory[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [country, setCountry] = useState('')
  const [credibility, setCredibility] = useState<CredibilityLevel | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState<SortOption>('newest')
  const [hasEvidence, setHasEvidence] = useState(false)
  const [hasMedia, setHasMedia] = useState(false)
  const [featured, setFeatured] = useState(false)
  const [contentType, setContentType] = useState<ContentType | 'all' | 'primary'>('primary') // 'primary' = experiencer + historical + research

  // Restore filter state from URL on mount/navigation
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (router.isReady) {
      const { category: cat, q, country: c, credibility: cred, featured: feat, sort: s, contentType: ct, page: p } = router.query
      if (cat && typeof cat === 'string') setCategory(cat as PhenomenonCategory)
      if (q && typeof q === 'string') setSearchQuery(q)
      if (c && typeof c === 'string') setCountry(c)
      if (cred && typeof cred === 'string') setCredibility(cred as CredibilityLevel)
      if (feat === 'true') setFeatured(true)
      if (s && typeof s === 'string') setSort(s as SortOption)
      if (ct && typeof ct === 'string') setContentType(ct as ContentType | 'all' | 'primary')
      if (p && typeof p === 'string') setPage(parseInt(p, 10) || 1)
      setInitialized(true)
    }
  }, [router.isReady])

  // Sync filter state to URL so browser back preserves filters
  useEffect(() => {
    if (!initialized) return
    const timeout = setTimeout(() => {
      const params: Record<string, string> = {}
      if (category !== 'all') params.category = category
      if (searchQuery) params.q = searchQuery
      if (country) params.country = country
      if (credibility) params.credibility = credibility
      if (featured) params.featured = 'true'
      if (sort !== 'newest') params.sort = sort
      if (contentType !== 'primary') params.contentType = contentType
      if (page > 1) params.page = String(page)

      router.replace({ pathname: '/explore', query: params }, undefined, { shallow: true })
    }, 300)
    return () => clearTimeout(timeout)
  }, [initialized, category, searchQuery, country, credibility, featured, sort, contentType, page])

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      // If filtering by phenomena from encyclopedia, use report_phenomena junction table
      if (selectedTypes.length > 0) {
        // Step 1: Get report IDs linked to selected phenomena
        const { data: links, error: linkError } = await supabase
          .from('report_phenomena')
          .select('report_id')
          .in('phenomenon_id', selectedTypes)

        if (linkError) throw linkError

        if (!links || links.length === 0) {
          setReports([])
          setTotalCount(0)
          setLoading(false)
          return
        }

        // Get unique report IDs
        const reportIds = [...new Set(links.map(l => l.report_id))]

        // Step 2: Query reports with those IDs
        let query = supabase
          .from('reports')
          .select('id,title,slug,summary,category,country,city,state_province,event_date,credibility,upvotes,view_count,comment_count,has_photo_video,has_physical_evidence,featured,location_name,source_type,source_label,created_at')
          .in('id', reportIds)
          .eq('status', 'approved')

        // Apply additional filters
        if (category !== 'all') {
          query = query.eq('category', category)
        }
        if (selectedCategories.length > 0) {
          query = query.in('category', selectedCategories)
        }
        if (searchQuery) {
          const words = searchQuery.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
          const pattern = `%${words.join('%')}%`
          query = query.or(`title.ilike.${pattern},summary.ilike.${pattern}`)
        }
        if (country) {
          query = query.eq('country', country)
        }
        if (credibility) {
          query = query.eq('credibility', credibility)
        }
        if (dateFrom) {
          query = query.gte('event_date', dateFrom)
        }
        if (dateTo) {
          query = query.lte('event_date', dateTo)
        }
        if (hasEvidence) {
          query = query.or('has_physical_evidence.eq.true,has_photo_video.eq.true')
        }
        if (hasMedia) {
          query = query.contains('tags', ['has-media'])
        }
        if (featured) {
          query = query.eq('featured', true)
        }
        // Content type filter (include NULL for imported records without content_type)
        if (contentType === 'primary') {
          query = query.or('content_type.in.(experiencer_report,historical_case,research_analysis),content_type.is.null')
        } else if (contentType !== 'all') {
          query = query.eq('content_type', contentType)
        }

        // Apply sorting
        switch (sort) {
          case 'oldest':
            query = query.order('event_date', { ascending: true, nullsFirst: false })
            break
          case 'popular':
            query = query.order('upvotes', { ascending: false })
            break
          case 'most_viewed':
            query = query.order('view_count', { ascending: false })
            break
          default:
            query = query.order('created_at', { ascending: false })
        }

        // Pagination
        const from = (page - 1) * perPage
        query = query.range(from, from + perPage - 1)

        const { data, error } = await query
        if (error) throw error

        setReports(data || [])
        // For phenomenon filter, use the linked count
        setTotalCount(reportIds.length)
      } else {
        // Standard query (no phenomenon filter)
        let query = supabase
          .from('reports')
          .select('id,title,slug,summary,category,country,city,state_province,event_date,credibility,upvotes,view_count,comment_count,has_photo_video,has_physical_evidence,featured,location_name,source_type,source_label,created_at')
          .eq('status', 'approved')

        if (category !== 'all') {
          query = query.eq('category', category)
        }
        if (selectedCategories.length > 0) {
          query = query.in('category', selectedCategories)
        }
        if (searchQuery) {
          const words = searchQuery.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
          const pattern = `%${words.join('%')}%`
          query = query.or(`title.ilike.${pattern},summary.ilike.${pattern}`)
        }
        if (country) {
          query = query.eq('country', country)
        }
        if (credibility) {
          query = query.eq('credibility', credibility)
        }
        if (dateFrom) {
          query = query.gte('event_date', dateFrom)
        }
        if (dateTo) {
          query = query.lte('event_date', dateTo)
        }
        if (hasEvidence) {
          query = query.or('has_physical_evidence.eq.true,has_photo_video.eq.true')
        }
        if (hasMedia) {
          query = query.contains('tags', ['has-media'])
        }
        if (featured) {
          query = query.eq('featured', true)
        }
        // Content type filter
        // 'primary' = experiencer reports + historical + research (excludes news/discussion)
        // Also include NULL content_type since imported records may not have it set yet
        if (contentType === 'primary') {
          query = query.or('content_type.in.(experiencer_report,historical_case,research_analysis),content_type.is.null')
        } else if (contentType !== 'all') {
          query = query.eq('content_type', contentType)
        }

        switch (sort) {
          case 'oldest':
            query = query.order('event_date', { ascending: true, nullsFirst: false })
            break
          case 'popular':
            query = query.order('upvotes', { ascending: false })
            break
          case 'most_viewed':
            query = query.order('view_count', { ascending: false })
            break
          default:
            query = query.order('created_at', { ascending: false })
        }

        const from = (page - 1) * perPage
        query = query.range(from, from + perPage - 1)

        const { data, error } = await query
        if (error) throw error

        setReports(data || [])
        const hasFilters = category !== 'all' || selectedCategories.length > 0 ||
          searchQuery || country || credibility || dateFrom || dateTo || hasEvidence || hasMedia || featured
        if (hasFilters || contentType !== 'primary') {
          // Get actual count for filtered queries
          try {
            let countQuery = supabase
              .from('reports')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'approved')
            if (category !== 'all') countQuery = countQuery.eq('category', category)
            if (selectedCategories.length > 0) countQuery = countQuery.in('category', selectedCategories)
            if (searchQuery) {
              const words = searchQuery.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
              const pattern = `%${words.join('%')}%`
              countQuery = countQuery.or(`title.ilike.${pattern},summary.ilike.${pattern}`)
            }
            if (country) countQuery = countQuery.eq('country', country)
            if (credibility) countQuery = countQuery.eq('credibility', credibility)
            if (dateFrom) countQuery = countQuery.gte('event_date', dateFrom)
            if (dateTo) countQuery = countQuery.lte('event_date', dateTo)
            if (hasEvidence) countQuery = countQuery.or('has_physical_evidence.eq.true,has_photo_video.eq.true')
            if (featured) countQuery = countQuery.eq('featured', true)
            if (contentType === 'primary') {
              countQuery = countQuery.or('content_type.in.(experiencer_report,historical_case,research_analysis),content_type.is.null')
            } else if (contentType !== 'all') {
              countQuery = countQuery.eq('content_type', contentType)
            }
            const { count: exactCount } = await countQuery
            setTotalCount(exactCount || 0)
          } catch (_e) {
            // Fallback to estimate if count query fails
            setTotalCount((data?.length || 0) + ((data?.length || 0) === perPage ? (page * perPage) : 0))
          }
        } else {
          setTotalCount(baselineCount)
        }
      }
    } catch (error) {
      console.error('Error loading reports:', error)
      setReports([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [category, selectedCategories, selectedTypes, searchQuery, country, credibility, dateFrom, dateTo, sort, hasEvidence, hasMedia, featured, contentType, page, baselineCount])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  // Fetch personalized feed
  useEffect(() => {
    async function fetchFeed() {
      setFeedLoading(true)
      try {
        const res = await fetch('/api/feed/personalized')
        if (res.ok) {
          const data = await res.json()
          setFeedSections(data.sections?.filter((s: FeedSection) => s.reports.length > 0) || [])
        }
      } catch (err) {
        console.error('Feed fetch error:', err)
      } finally {
        setFeedLoading(false)
      }
    }
    fetchFeed()
  }, [])

  const scrollContainer = (id: string, direction: 'left' | 'right') => {
    const el = document.getElementById(id)
    if (el) el.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' })
  }

  const getSectionIcon = (id: string) => {
    switch (id) {
      case 'for_you': return <Sparkles className="w-5 h-5 text-primary-400" />
      case 'trending': return <TrendingUp className="w-5 h-5 text-orange-400" />
      case 'near_you': return <MapPin className="w-5 h-5 text-blue-400" />
      case 'because_saved': return <Heart className="w-5 h-5 text-pink-400" />
      case 'recent': return <Clock className="w-5 h-5 text-emerald-400" />
      default: return <Sparkles className="w-5 h-5 text-gray-400" />
    }
  }

  function clearFilters() {
    setCategory('all')
    setSelectedCategories([])
    setSelectedTypes([])
    setSearchQuery('')
    setCountry('')
    setCredibility('')
    setDateFrom('')
    setDateTo('')
    setHasEvidence(false)
    setHasMedia(false)
    setFeatured(false)
    setContentType('primary')
    setSort('newest')
    setPage(1)
  }

  const hasActiveFilters = category !== 'all' || selectedCategories.length > 0 ||
    selectedTypes.length > 0 || searchQuery || country || credibility ||
    dateFrom || dateTo || hasEvidence || hasMedia || featured || contentType !== 'primary'

  const totalPages = Math.ceil(totalCount / perPage)

  return (
    <>
      <Head>
        <title>Explore Paranormal Reports - Paradocs</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-white">Explore Reports</h1>
          <p className="mt-2 text-gray-400">
            Browse {totalCount.toLocaleString()} documented paranormal encounters
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setActiveView('feed')}
            className={classNames(
              'px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2',
              activeView === 'feed'
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30 shadow-lg shadow-primary-500/10'
                : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
            )}
          >
            <Sparkles className="w-4 h-4" />
            Discover
          </button>
          <button
            onClick={() => setActiveView('browse')}
            className={classNames(
              'px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2',
              activeView === 'browse'
                ? 'bg-gradient-to-r from-primary-500 to-purple-500 text-white border border-primary-400/30 shadow-lg shadow-primary-500/20'
                : 'bg-gradient-to-r from-primary-500/20 to-purple-500/20 text-primary-300 border border-primary-500/20 hover:from-primary-500/30 hover:to-purple-500/30 hover:text-primary-200 hover:shadow-lg hover:shadow-primary-500/10'
            )}
          >
            <Search className="w-4 h-4" />
            Browse All {baselineCount > 0 && <span className="ml-0.5 text-xs opacity-75">({baselineCount.toLocaleString()})</span>}
          </button>
        </div>

        {/* Pattern Insights Banner */}
        <Link
          href="/insights"
          className="block mb-6 p-4 glass-card bg-gradient-to-r from-primary-900/30 to-purple-900/30 border border-primary-500/20 hover:border-primary-500/40 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-500/20">
                <Sparkles className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h3 className="font-medium text-white">Discover Pattern Insights</h3>
                <p className="text-sm text-gray-400">AI-detected patterns, geographic clusters & temporal anomalies</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-primary-400 group-hover:translate-x-1 transition-all" />
          </div>
        </Link>

        {/* === FEED VIEW === */}
        {activeView === 'feed' && (
          <div className="space-y-8">
            {/* Credibility Legend - helps new users understand the ratings */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-gray-500">
              <span className="font-medium text-gray-400 mr-1">Credibility Ratings:</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400"></span> Confirmed</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> High</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400"></span> Medium</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400"></span> Low</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400"></span> Unverified</span>
            </div>
            {feedLoading ? (
              <div className="space-y-6">
                {[...Array(3)].map((_, i) => (
                  <div key={i}>
                    <div className="h-6 w-48 skeleton rounded mb-3" />
                    <div className="flex gap-4 overflow-hidden">
                      {[...Array(4)].map((_, j) => (
                        <div key={j} className="glass-card p-4 min-w-[280px] h-40 skeleton rounded-lg flex-shrink-0" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : feedSections.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">Complete your profile to get personalized recommendations.</p>
                <button onClick={() => setActiveView('browse')} className="mt-3 text-primary-400 hover:text-primary-300 text-sm">
                  Browse all reports instead
                </button>
              </div>
            ) : (
              feedSections.map((section) => (
                <div key={section.id} className="group/section">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getSectionIcon(section.id)}
                      <div>
                        <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                        <p className="text-xs text-gray-500">{section.subtitle}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover/section:opacity-100 transition-opacity">
                      <button onClick={() => scrollContainer(`feed-${section.id}`, 'left')} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button onClick={() => scrollContainer(`feed-${section.id}`, 'right')} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400">
                        <ChevronRightIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <div id={`feed-${section.id}`} className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory pr-8">
                      {section.reports.map((report) => (
                        <Link key={report.id} href={`/report/${report.slug}`} className="min-w-[300px] max-w-[300px] flex-shrink-0 snap-start glass-card p-4 hover:border-primary-500/30 transition-all group/card">
                          <div className="flex items-start justify-between mb-2">
                            {report.phenomenon_type && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400 truncate max-w-[180px]">
                                {report.phenomenon_type.name}
                              </span>
                            )}
                            {report.credibility && (
                              <span
                                title={
                                  report.credibility === 'high' ? 'High credibility: Well-documented with evidence' :
                                  report.credibility === 'medium' ? 'Medium credibility: Some supporting details' :
                                  report.credibility === 'low' ? 'Low credibility: Lacks supporting evidence' :
                                  report.credibility === 'confirmed' ? 'Confirmed: Multiple sources confirm' :
                                  'Unverified: Not yet reviewed'
                                }
                                className={classNames('text-xs px-1.5 py-0.5 rounded cursor-help',
                                  report.credibility === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
                                  report.credibility === 'confirmed' ? 'bg-blue-500/20 text-blue-400' :
                                  report.credibility === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                  report.credibility === 'low' ? 'bg-red-500/20 text-red-400' :
                                  'bg-gray-500/20 text-gray-400'
                                )}>{report.credibility}</span>
                            )}
                          </div>
                          <h3 className="font-medium text-white text-sm line-clamp-2 mb-2 group-hover/card:text-primary-300 transition-colors">{report.title}</h3>
                          {report.summary && <p className="text-xs text-gray-500 line-clamp-2 mb-3">{report.summary}</p>}
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-auto">
                            {(report.city || report.country) && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                {[report.city, report.state_province, report.country].filter(Boolean).join(', ')}
                              </span>
                            )}
                            {report.upvotes > 0 && <span>{report.upvotes} reactions</span>}
                          </div>
                        </Link>
                      ))}
                    </div>
                    {/* Fade gradient on right edge to indicate scrollability */}
                    <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[#0a0a1a] to-transparent pointer-events-none" />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* === BROWSE VIEW === */}
        {activeView === 'browse' && (
          <>
          {/* Content Type Filter - Prominent toggle for report types */}
          <div className="mb-6 p-3 sm:p-4 glass-card">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-sm text-gray-400 whitespace-nowrap">Show:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setContentType('primary'); setPage(1) }}
                  className={classNames(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
                    contentType === 'primary'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                  )}
                >
                  👁️ Experiencer Reports
                </button>
                <button
                  onClick={() => { setContentType('all'); setPage(1) }}
                  className={classNames(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    contentType === 'all'
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                      : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                  )}
                >
                  All Content
                </button>
                <button
                  onClick={() => { setContentType('news_discussion'); setPage(1) }}
                  className={classNames(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
                    contentType === 'news_discussion'
                      ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                      : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                  )}
                >
                  📰 News & Discussion
                </button>
              </div>
            </div>
            {contentType === 'primary' && (
              <p className="text-xs text-gray-500 mt-2">
                Showing first-hand witness accounts, documented historical cases, and research reports
              </p>
            )}
            {contentType === 'news_discussion' && (
              <p className="text-xs text-gray-500 mt-2">
                Showing news articles, community discussions, and commentary (not first-hand accounts)
              </p>
            )}
          </div>
  
          <div className="mb-6">
            <CategoryFilter
              selected={category}
              onChange={(cat) => { setCategory(cat); setPage(1) }}
            />
          </div>
  
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                className="w-full pl-10 pr-4 py-2.5"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={classNames(
                  'btn',
                  showFilters || hasActiveFilters ? 'btn-primary' : 'btn-secondary'
                )}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-white" />}
              </button>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="popular">Most Popular</option>
                <option value="most_viewed">Most Viewed</option>
              </select>
            </div>
          </div>
  
          {showFilters && (
            <div className="glass-card p-6 mb-6 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-white">Advanced Filters</h3>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
                    <X className="w-4 h-4" />
                    Clear all
                  </button>
                )}
              </div>
  
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">Filter by Phenomenon</label>
                <SubcategoryFilter
                  selectedCategories={selectedCategories}
                  selectedTypes={selectedTypes}
                  onCategoriesChange={(cats) => { setSelectedCategories(cats); setPage(1) }}
                  onTypesChange={(types) => { setSelectedTypes(types); setPage(1) }}
                  compact
                />
              </div>
  
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Country</label>
                  <select value={country} onChange={(e) => { setCountry(e.target.value); setPage(1) }} className="w-full">
                    <option value="">All countries</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Credibility</label>
                  <select value={credibility} onChange={(e) => { setCredibility(e.target.value as CredibilityLevel); setPage(1) }} className="w-full">
                    <option value="">Any credibility</option>
                    {Object.entries(CREDIBILITY_CONFIG).map(([key, config]) => <option key={key} value={key}>{config.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Date From</label>
                  <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="w-full" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Date To</label>
                  <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="w-full" />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasEvidence} onChange={(e) => { setHasEvidence(e.target.checked); setPage(1) }} className="rounded bg-white/5 border-white/20" />
                  <span className="text-sm text-gray-300">Has evidence</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasMedia} onChange={(e) => { setHasMedia(e.target.checked); setPage(1) }} className="rounded bg-white/5 border-white/20" />
                  <span className="text-sm text-gray-300">Has photos/video</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={featured} onChange={(e) => { setFeatured(e.target.checked); setPage(1) }} className="rounded bg-white/5 border-white/20" />
                  <span className="text-sm text-gray-300">Featured only</span>
                </label>
              </div>
            </div>
          )}
  
          {loading ? (
            <div className="grid md:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="glass-card p-5 h-32 skeleton" />)}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400">No reports found matching your criteria.</p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="mt-4 text-primary-400 hover:text-primary-300">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                {reports.map((report) => <ReportCard key={report.id} report={report as any} />)}
              </div>
  
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-8">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-secondary disabled:opacity-50">
                    Previous
                  </button>
                  <span className="flex items-center px-4 text-gray-400">Page {page} of {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-secondary disabled:opacity-50">
                    Next
                  </button>
                </div>
              )}
            </>
          )}
          </>
        )}
      </div>
      {showWelcome && <WelcomeOnboarding onComplete={() => setShowWelcome(false)} />}
      <AskTheUnknown />
    </>
  
  }
  }
