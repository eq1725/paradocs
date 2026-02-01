'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType, PhenomenonCategory, CredibilityLevel } from '@/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG, COUNTRIES } from '@/lib/constants'
import CategoryFilter from '@/components/CategoryFilter'
import SubcategoryFilter from '@/components/SubcategoryFilter'
import ReportCard from '@/components/ReportCard'
import { classNames } from '@/lib/utils'

type SortOption = 'newest' | 'oldest' | 'popular' | 'most_viewed'

export default function ExplorePage() {
  const router = useRouter()
  const [reports, setReports] = useState<Partial<Report>[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const perPage = 12

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
  const [featured, setFeatured] = useState(false)

  // Initialize from URL params
  useEffect(() => {
    if (router.isReady) {
      const { category: cat, q, country: c, credibility: cred, featured: feat } = router.query
      if (cat && typeof cat === 'string') setCategory(cat as PhenomenonCategory)
      if (q && typeof q === 'string') setSearchQuery(q)
      if (c && typeof c === 'string') setCountry(c)
      if (cred && typeof cred === 'string') setCredibility(cred as CredibilityLevel)
      if (feat === 'true') setFeatured(true)
    }
  }, [router.isReady, router.query])

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      // Select fields needed for ReportCard - skip count for performance on large datasets
      let query = supabase
        .from('reports')
        .select('id,title,slug,summary,category,country,city,state_province,event_date,credibility,upvotes,view_count,comment_count,has_photo_video,has_physical_evidence,featured,location_name,source_type,source_label,created_at')
        .eq('status', 'approved')

      // Apply filters
      if (category !== 'all') {
        query = query.eq('category', category)
      }
      // Multi-category filter (from subcategory panel)
      if (selectedCategories.length > 0) {
        query = query.in('category', selectedCategories)
      }
      // Filter by specific phenomenon types
      if (selectedTypes.length > 0) {
        query = query.in('phenomenon_type_id', selectedTypes)
      }
      if (searchQuery) {
        query = query.textSearch('search_vector', searchQuery)
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
      if (featured) {
        query = query.eq('featured', true)
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
      // Use estimated count for large dataset - exact count causes timeout
      // Will show "250,000+" for unfiltered, or use data length + offset for filtered
      const hasFilters = category !== 'all' || selectedCategories.length > 0 ||
        selectedTypes.length > 0 || searchQuery || country || credibility ||
        dateFrom || dateTo || hasEvidence || featured
      if (hasFilters) {
        // For filtered queries, estimate based on results
        const estimatedMore = (data?.length || 0) === perPage ? 1000 : 0
        setTotalCount((page - 1) * perPage + (data?.length || 0) + estimatedMore)
      } else {
        // Use known approximate count for unfiltered
        setTotalCount(250000)
      }
    } catch (error) {
      console.error('Error loading reports:', error)
    } finally {
      setLoading(false)
    }
  }, [category, selectedCategories, selectedTypes, searchQuery, country, credibility, dateFrom, dateTo, sort, hasEvidence, featured, page])

  useEffect(() => {
    loadReports()
  }, [loadReports])

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
    setFeatured(false)
    setSort('newest')
    setPage(1)
  }

  const hasActiveFilters = category !== 'all' || selectedCategories.length > 0 ||
    selectedTypes.length > 0 || searchQuery || country || credibility ||
    dateFrom || dateTo || hasEvidence || featured

  const totalPages = Math.ceil(totalCount / perPage)

  return (
    <>
      <Head>
        <title>Explore Paranormal Reports - Paradocs</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-white">Explore Reports</h1>
          <p className="mt-2 text-gray-400">
            Browse {totalCount.toLocaleString()} documented paranormal encounters
          </p>
        </div>

        {/* Category Filter */}
        <div className="mb-6">
          <CategoryFilter
            selected={category}
            onChange={(cat) => { setCategory(cat); setPage(1) }}
          />
        </div>

        {/* Search and Filter Bar */}
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
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-white" />
              )}
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

        {/* Expanded Filters */}
        {showFilters && (
          <div className="glass-card p-6 mb-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-white">Advanced Filters</h3>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  Clear all
                </button>
              )}
            </div>

            {/* Subcategory Filter - full width */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Filter by Phenomenon Type</label>
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
                <select
                  value={country}
                  onChange={(e) => { setCountry(e.target.value); setPage(1) }}
                  className="w-full"
                >
                  <option value="">All countries</option>
                  {COUNTRIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Credibility</label>
                <select
                  value={credibility}
                  onChange={(e) => { setCredibility(e.target.value as CredibilityLevel); setPage(1) }}
                  className="w-full"
                >
                  <option value="">Any credibility</option>
                  {Object.entries(CREDIBILITY_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasEvidence}
                  onChange={(e) => { setHasEvidence(e.target.checked); setPage(1) }}
                  className="rounded bg-white/5 border-white/20"
                />
                <span className="text-sm text-gray-300">Has evidence</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => { setFeatured(e.target.checked); setPage(1) }}
                  className="rounded bg-white/5 border-white/20"
                />
                <span className="text-sm text-gray-300">Featured only</span>
              </label>
            </div>
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="grid md:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="glass-card p-5 h-32 skeleton" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400">No reports found matching your criteria.</p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 text-primary-400 hover:text-primary-300"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              {reports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-secondary disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="flex items-center px-4 text-gray-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn btn-secondary disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
