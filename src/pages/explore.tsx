'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { Search, SlidersHorizontal, X, ChevronDown, Sparkles, ArrowRight, TrendingUp, MapPin, Heart, Clock, ChevronLeft, ChevronRight as ChevronRightIcon, Bookmark, Eye, ThumbsUp, BookOpen, UserPlus, Bell, Library, LogIn } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType, PhenomenonCategory, CredibilityLevel, ContentType } from '@/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG, CONTENT_TYPE_CONFIG, COUNTRIES } from '@/lib/constants'
import CategoryFilter from '@/components/CategoryFilter'
import SubcategoryFilter from '@/components/SubcategoryFilter'
import ReportCard from '@/components/ReportCard'
import { classNames, formatRelativeDate } from '@/lib/utils'
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
  location_name?: string | null
  source_type?: string | null
  source_label?: string | null
  has_photo_video?: boolean
  has_physical_evidence?: boolean
  phenomenon_type?: { name: string; category: string; slug: string } | null
}

interface FeedPhenomenon {
  id: string
  name: string
  slug: string
  category: string
  icon: string
  ai_summary: string | null
  ai_quick_facts: any | null
  primary_image_url: string | null
  report_count: number
  aliases: string[] | null
}

interface FeedSection {
  id: string
  title: string
  subtitle: string
  type: 'reports' | 'phenomena' | 'mixed'
  reports?: FeedReport[]
  phenomena?: FeedPhenomenon[]
}

type SortOption = 'newest' | 'oldest' | 'popular' | 'most_viewed'

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
      // Auto-switch to Browse view when filter params are present in URL
      if (cat || q || c || cred || feat === 'true') {
        setActiveView('browse')
      }
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

  // Auth state for soft-wall prompts
  var [user, setUser] = useState<any>(null)
  useEffect(function() {
    supabase.auth.getSession().then(function(result) {
      setUser(result.data.session?.user || null)
    })
    var { data: sub } = supabase.auth.onAuthStateChange(function(_event, session) {
      setUser(session?.user || null)
    })
    return function() { sub.subscription.unsubscribe() }
  }, [])

  // Fetch personalized feed
  useEffect(function() {
    async function fetchFeed() {
      setFeedLoading(true)
      try {
        // Pass auth token if available so API can personalize
        var headers: Record<string, string> = {}
        var sessionResult = await supabase.auth.getSession()
        if (sessionResult.data.session?.access_token) {
          headers['Authorization'] = 'Bearer ' + sessionResult.data.session.access_token
        }
        var res = await fetch('/api/feed/personalized', { headers: headers })
        if (res.ok) {
          var data = await res.json()
          // Filter sections that have content (reports OR phenomena)
          var validSections = (data.sections || []).filter(function(s: FeedSection) {
            return (s.reports && s.reports.length > 0) || (s.phenomena && s.phenomena.length > 0)
          })
          setFeedSections(validSections)
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

  function getSectionIcon(id: string) {
    if (id === 'for_you') return <Sparkles className="w-5 h-5 text-primary-400" />
    if (id === 'trending') return <TrendingUp className="w-5 h-5 text-orange-400" />
    if (id === 'near_you') return <MapPin className="w-5 h-5 text-blue-400" />
    if (id === 'because_saved') return <Heart className="w-5 h-5 text-pink-400" />
    if (id === 'recent') return <Clock className="w-5 h-5 text-emerald-400" />
    if (id === 'spotlight') return <BookOpen className="w-5 h-5 text-purple-400" />
    if (id.startsWith('category_')) return <Library className="w-5 h-5 text-amber-400" />
    return <Sparkles className="w-5 h-5 text-gray-400" />
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <h1 className="text-lg sm:text-3xl font-display font-bold text-white">Explore</h1>
            <p className="text-[11px] sm:text-sm text-gray-500 flex items-center gap-1.5">
              <span className="tabular-nums font-medium text-gray-400">{totalCount.toLocaleString()}</span>
              <span className="hidden sm:inline">documented encounters</span>
              <span className="sm:hidden">encounters</span>
            </p>
          </div>
          {/* View Toggle — inline with title on mobile */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            <button
              onClick={() => setActiveView('feed')}
              className={classNames(
                'px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5',
                activeView === 'feed'
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
              )}
            >
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Discover
            </button>
            <button
              onClick={() => setActiveView('browse')}
              className={classNames(
                'px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap',
                activeView === 'browse'
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
              )}
            >
              <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Browse
            </button>
          </div>
        </div>

        {/* Pattern Insights Banner — compact on mobile */}
        <Link
          href="/insights"
          className="block mb-4 sm:mb-6 px-3 py-2.5 sm:p-4 glass-card bg-gradient-to-r from-primary-900/20 to-purple-900/20 border border-primary-500/15 hover:border-primary-500/40 transition-all group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Sparkles className="w-4 h-4 text-primary-400 flex-shrink-0" />
              <span className="font-medium text-white text-sm truncate">Pattern Insights</span>
              <span className="hidden sm:inline text-xs text-gray-500">AI-detected patterns & clusters</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-primary-400 group-hover:translate-x-1 transition-all flex-shrink-0" />
          </div>
        </Link>

        {/* === FEED VIEW === */}
        {activeView === 'feed' && (
          <div className="space-y-6 sm:space-y-10">
            {feedLoading ? (
              <div className="space-y-8">
                {/* Spotlight skeleton */}
                <div>
                  <div className="h-6 w-56 skeleton rounded mb-4" />
                  <div className="flex gap-4 overflow-hidden">
                    {[1,2,3].map(function(j) { return (
                      <div key={j} className="min-w-[240px] sm:min-w-[280px] h-56 skeleton rounded-xl flex-shrink-0" />
                    )})}
                  </div>
                </div>
                {/* Report section skeletons */}
                {[1,2].map(function(i) { return (
                  <div key={i}>
                    <div className="h-6 w-48 skeleton rounded mb-4" />
                    <div className="flex gap-4 overflow-hidden">
                      {[1,2,3,4].map(function(j) { return (
                        <div key={j} className="min-w-[280px] h-44 skeleton rounded-xl flex-shrink-0" />
                      )})}
                    </div>
                  </div>
                )})}
              </div>
            ) : feedSections.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No content available right now. Check back soon!</p>
                <button onClick={function() { setActiveView('browse') }} className="mt-3 text-primary-400 hover:text-primary-300 text-sm">
                  Browse all reports instead
                </button>
              </div>
            ) : (
              <>
                {feedSections.map(function(section, sectionIndex) {
                  return (
                    <React.Fragment key={section.id}>
                      {/* Soft-wall signup card — injected after 2nd section for anonymous users */}
                      {sectionIndex === 2 && !user && (
                        <div className="relative overflow-hidden rounded-2xl border border-primary-500/20 bg-gradient-to-br from-primary-950/60 via-gray-900 to-purple-950/40 p-6 sm:p-8">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
                          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                            <div className="flex-1">
                              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Enjoying what you see?</h3>
                              <p className="text-sm text-gray-400 max-w-lg">
                                Create a free account to save reports, get personalized recommendations, and receive weekly digests of new discoveries.
                              </p>
                            </div>
                            <Link
                              href="/login"
                              className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-full font-medium text-sm transition-colors whitespace-nowrap flex-shrink-0"
                            >
                              <UserPlus className="w-4 h-4" />
                              Create Free Account
                            </Link>
                          </div>
                          <div className="relative flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1.5"><Bookmark className="w-3.5 h-3.5" /> Save reports</span>
                            <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Personalized feed</span>
                            <span className="flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Weekly digest</span>
                          </div>
                        </div>
                      )}

                      <div className="group/section">
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                          <div className="flex items-center gap-2.5">
                            {getSectionIcon(section.id)}
                            <div>
                              <h2 className="text-base sm:text-lg font-semibold text-white">{section.title}</h2>
                              <p className="text-xs text-gray-500">{section.subtitle}</p>
                            </div>
                          </div>
                          <div className="hidden sm:flex gap-1 opacity-0 group-hover/section:opacity-100 transition-opacity">
                            <button onClick={function() { scrollContainer('feed-' + section.id, 'left') }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400">
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button onClick={function() { scrollContainer('feed-' + section.id, 'right') }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400">
                              <ChevronRightIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* === PHENOMENA SPOTLIGHT SECTION === */}
                        {section.type === 'phenomena' && section.phenomena && (
                          <div className="relative">
                            <div id={'feed-' + section.id} className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory pr-8">
                              {section.phenomena.map(function(item) {
                                var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
                                var hasImage = item.primary_image_url && item.primary_image_url.indexOf('default-cryptid') === -1
                                return (
                                  <Link
                                    key={item.id}
                                    href={'/phenomena/' + item.slug}
                                    className="min-w-[75vw] sm:min-w-[260px] max-w-[80vw] sm:max-w-[280px] flex-shrink-0 snap-start group/card relative overflow-hidden rounded-xl border border-white/10 hover:border-primary-500/30 transition-all"
                                  >
                                    {/* Card image or gradient background */}
                                    {hasImage ? (
                                      <div className="relative h-44 sm:h-48 overflow-hidden">
                                        <img
                                          src={item.primary_image_url!}
                                          alt=""
                                          className="absolute inset-0 w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
                                          referrerPolicy="no-referrer"
                                          loading="lazy"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent" />
                                      </div>
                                    ) : (
                                      <div className={classNames('relative h-44 sm:h-48 flex items-center justify-center', config.bgColor)}>
                                        <span className="text-6xl opacity-40 group-hover/card:scale-110 transition-transform">{item.icon || config.icon}</span>
                                        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/30 to-transparent" />
                                      </div>
                                    )}
                                    {/* Content overlay at bottom of image */}
                                    <div className="absolute bottom-0 left-0 right-0 p-4">
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <span className={classNames('text-xs px-2 py-0.5 rounded-full font-medium', config.bgColor, config.color)}>
                                          {config.icon} {config.label}
                                        </span>
                                        {item.report_count > 0 && (
                                          <span className="text-[11px] text-gray-400">{item.report_count} reports</span>
                                        )}
                                      </div>
                                      <h3 className="font-semibold text-white text-base sm:text-lg line-clamp-1 group-hover/card:text-primary-300 transition-colors">{item.name}</h3>
                                      {item.ai_summary && (
                                        <p className="text-xs text-gray-400 line-clamp-2 mt-1 leading-relaxed">{item.ai_summary}</p>
                                      )}
                                    </div>
                                  </Link>
                                )
                              })}
                              {/* "See all" card at end */}
                              <Link
                                href="/encyclopedia"
                                className="min-w-[50vw] sm:min-w-[180px] flex-shrink-0 snap-start flex flex-col items-center justify-center rounded-xl border border-white/10 hover:border-primary-500/30 bg-white/[0.02] hover:bg-white/[0.04] transition-all gap-3 px-6"
                              >
                                <BookOpen className="w-8 h-8 text-primary-400" />
                                <span className="text-sm font-medium text-primary-400">Browse Encyclopedia</span>
                                <span className="text-xs text-gray-500">4,792 phenomena</span>
                              </Link>
                            </div>
                            <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[#0a0a1a] to-transparent pointer-events-none" />
                          </div>
                        )}

                        {/* === REPORT SECTION (upgraded cards) === */}
                        {section.type === 'reports' && section.reports && (
                          <div className="relative">
                            <div id={'feed-' + section.id} className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory pr-8">
                              {section.reports.map(function(report) {
                                var catConfig = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
                                var credConfig = report.credibility ? (CREDIBILITY_CONFIG as any)[report.credibility] : null
                                var locationParts = [report.city || report.location_name, report.state_province, report.country].filter(Boolean)
                                var locationStr = locationParts.length > 0 ? locationParts.slice(0, 2).join(', ') : null

                                return (
                                  <Link
                                    key={report.id}
                                    href={'/report/' + report.slug}
                                    className="min-w-[270px] sm:min-w-[310px] max-w-[290px] sm:max-w-[330px] flex-shrink-0 snap-start glass-card p-4 sm:p-5 hover:border-primary-500/30 transition-all group/card flex flex-col"
                                  >
                                    {/* Top row: category icon + badges */}
                                    <div className="flex items-start gap-3 mb-2.5">
                                      <div className={classNames('w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0', catConfig.bgColor)}>
                                        {catConfig.icon}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className={classNames('text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-medium', catConfig.bgColor, catConfig.color)}>
                                            {catConfig.label}
                                          </span>
                                          {credConfig && (
                                            <span className={classNames('text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-medium', credConfig.bgColor, credConfig.color)}>
                                              {credConfig.label}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {/* Save button — soft-wall for anonymous */}
                                      {!user && (
                                        <button
                                          onClick={function(e) {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            router.push('/login?reason=save&redirect=' + encodeURIComponent('/explore'))
                                          }}
                                          className="p-1.5 rounded-lg text-gray-600 hover:text-primary-400 hover:bg-white/5 transition-colors flex-shrink-0"
                                          title="Sign in to save"
                                        >
                                          <Bookmark className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>

                                    {/* Title */}
                                    <h3 className="font-medium text-white text-sm line-clamp-2 mb-1.5 group-hover/card:text-primary-300 transition-colors">{report.title}</h3>

                                    {/* Summary */}
                                    {report.summary && (
                                      <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{report.summary}</p>
                                    )}

                                    {/* Bottom metadata */}
                                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 mt-auto pt-2 border-t border-white/5">
                                      {locationStr && (
                                        <span className="flex items-center gap-1 truncate max-w-[140px]">
                                          <MapPin className="w-3 h-3 flex-shrink-0" />
                                          {locationStr}
                                        </span>
                                      )}
                                      {report.event_date && (
                                        <span className="flex items-center gap-1">
                                          <Clock className="w-3 h-3 flex-shrink-0" />
                                          {new Date(report.event_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                        </span>
                                      )}
                                      {report.view_count > 0 && (
                                        <span className="flex items-center gap-1">
                                          <Eye className="w-3 h-3" />
                                          {report.view_count}
                                        </span>
                                      )}
                                      {report.upvotes > 0 && (
                                        <span className="flex items-center gap-1">
                                          <ThumbsUp className="w-3 h-3" />
                                          {report.upvotes}
                                        </span>
                                      )}
                                    </div>
                                  </Link>
                                )
                              })}
                            </div>
                            <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[#0a0a1a] to-transparent pointer-events-none" />
                          </div>
                        )}
                      </div>
                    </React.Fragment>
                  )
                })}

                {/* Bottom CTA for anonymous users — after all sections */}
                {!user && (
                  <div className="text-center py-6 sm:py-8">
                    <p className="text-sm text-gray-500 mb-3">Want to see reports tailored to your interests?</p>
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary-500/30 text-white rounded-full font-medium text-sm transition-all"
                    >
                      <LogIn className="w-4 h-4" />
                      Sign in for personalized recommendations
                    </Link>
                  </div>
                )}
              </>
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
  )
}
