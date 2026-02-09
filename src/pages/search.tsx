'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { Search, X, Filter, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType, PhenomenonCategory } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import ReportCard from '@/components/ReportCard'
import SubcategoryFilter from '@/components/SubcategoryFilter'
import { classNames } from '@/lib/utils'

interface SearchFilters {
  categories: PhenomenonCategory[]
  phenomenonTypes: string[]
  hasEvidence: boolean
  dateFrom: string
  dateTo: string
}

export default function SearchPage() {
  const router = useRouter()
  const { q } = router.query

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [categoryFacets, setCategoryFacets] = useState<Record<string, number>>({})

  const [filters, setFilters] = useState<SearchFilters>({
    categories: [],
    phenomenonTypes: [],
    hasEvidence: false,
    dateFrom: '',
    dateTo: ''
  })

  useEffect(() => {
    if (q && typeof q === 'string') {
      setQuery(q)
      performSearch(q)
    }
  }, [q])

  async function performSearch(searchQuery: string) {
    if (!searchQuery.trim()) return

    setLoading(true)
    setSearched(true)
    try {
      let queryBuilder = supabase
        .from('reports')
        .select('*, phenomenon_type:phenomenon_types(*)')
        .eq('status', 'approved')
        .textSearch('search_vector', searchQuery)

      // Apply category filters
      if (filters.categories.length > 0) {
        queryBuilder = queryBuilder.in('category', filters.categories)
      }

      // Apply phenomenon type filters
      if (filters.phenomenonTypes.length > 0) {
        queryBuilder = queryBuilder.in('phenomenon_type_id', filters.phenomenonTypes)
      }

      // Apply evidence filter
      if (filters.hasEvidence) {
        queryBuilder = queryBuilder.or('has_physical_evidence.eq.true,has_photo_video.eq.true')
      }

      // Apply date filters
      if (filters.dateFrom) {
        queryBuilder = queryBuilder.gte('event_date', filters.dateFrom)
      }
      if (filters.dateTo) {
        queryBuilder = queryBuilder.lte('event_date', filters.dateTo)
      }

      const { data, error } = await queryBuilder
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error

      setResults(data || [])

      // Calculate category facets
      const facets: Record<string, number> = {}
      for (const report of data || []) {
        facets[report.category] = (facets[report.category] || 0) + 1
      }
      setCategoryFacets(facets)
    } catch (error) {
      console.error('Error searching:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`, undefined, { shallow: true })
      performSearch(query)
    }
  }

  function clearSearch() {
    setQuery('')
    setResults([])
    setSearched(false)
    setCategoryFacets({})
    router.push('/search', undefined, { shallow: true })
  }

  function clearFilters() {
    setFilters({
      categories: [],
      phenomenonTypes: [],
      hasEvidence: false,
      dateFrom: '',
      dateTo: ''
    })
    if (query) performSearch(query)
  }

  function toggleCategoryFilter(category: PhenomenonCategory) {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter(c => c !== category)
      : [...filters.categories, category]
    setFilters(prev => ({ ...prev, categories: newCategories }))
  }

  const hasActiveFilters = filters.categories.length > 0 ||
    filters.phenomenonTypes.length > 0 ||
    filters.hasEvidence ||
    filters.dateFrom ||
    filters.dateTo

  // Re-search when filters change
  useEffect(() => {
    if (query && searched) {
      performSearch(query)
    }
  }, [filters])

  const popularSearches = [
    'UFO triangle',
    'Bigfoot tracks',
    'ghost apparition',
    'strange lights',
    'telepathy',
    'near death experience',
    'cryptid sighting'
  ]

  return (
    <>
      <Head>
        <title>{q ? `Search: ${q}` : 'Advanced Search'} - Paradocs</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-display font-bold text-white mb-2">
          Search Paradocs
        </h1>
        <p className="text-gray-400 mb-8">
          Search across all paranormal reports with advanced filtering
        </p>

        {/* Search form */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-12 pr-12 py-4 text-lg"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={classNames(
                  'btn flex-1 sm:flex-initial',
                  showFilters || hasActiveFilters ? 'btn-primary' : 'btn-secondary'
                )}
              >
                <Filter className="w-4 h-4" />
                <span className="sm:inline">Filters</span>
                {hasActiveFilters && (
                  <span className="w-2 h-2 rounded-full bg-white" />
                )}
              </button>
              <button type="submit" className="btn btn-primary flex-1 sm:flex-initial">
                Search
              </button>
            </div>
          </div>
        </form>

        {/* Filters panel */}
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
                  Clear filters
                </button>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Subcategory filter */}
              <div>
                <SubcategoryFilter
                  selectedCategories={filters.categories}
                  selectedTypes={filters.phenomenonTypes}
                  onCategoriesChange={(cats) => setFilters(prev => ({ ...prev, categories: cats }))}
                  onTypesChange={(types) => setFilters(prev => ({ ...prev, phenomenonTypes: types }))}
                  compact
                />
              </div>

              {/* Other filters */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Date From</label>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Date To</label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                      className="w-full"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.hasEvidence}
                    onChange={(e) => setFilters(prev => ({ ...prev, hasEvidence: e.target.checked }))}
                    className="rounded bg-white/5 border-white/20"
                  />
                  <span className="text-sm text-gray-300">Has evidence (photos/physical)</span>
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-4 sm:gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Results */}
            {loading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="glass-card p-5 h-32 skeleton" />
                ))}
              </div>
            ) : searched ? (
              results.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-400">
                      Found {results.length} result{results.length !== 1 ? 's' : ''} for "{q}"
                    </p>
                  </div>

                  {/* Category facets */}
                  {Object.keys(categoryFacets).length > 1 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                      {Object.entries(categoryFacets)
                        .sort((a, b) => b[1] - a[1])
                        .map(([cat, count]) => {
                          const config = CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
                          const isSelected = filters.categories.includes(cat as PhenomenonCategory)
                          return (
                            <button
                              key={cat}
                              onClick={() => toggleCategoryFilter(cat as PhenomenonCategory)}
                              className={classNames(
                                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors',
                                isSelected
                                  ? `${config.bgColor} ${config.color}`
                                  : 'bg-white/5 text-gray-300 hover:bg-white/10'
                              )}
                            >
                              <span>{config.icon}</span>
                              <span>{config.label}</span>
                              <span className="text-xs opacity-60">({count})</span>
                            </button>
                          )
                        })}
                    </div>
                  )}

                  <div className="space-y-4">
                    {results.map((report) => (
                      <ReportCard key={report.id} report={report} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-16">
                  <p className="text-gray-400 mb-4">
                    No results found for "{q}"
                  </p>
                  <p className="text-sm text-gray-500">
                    Try different keywords or browse{' '}
                    <a href="/explore" className="text-primary-400 hover:text-primary-300">
                      all reports
                    </a>
                  </p>
                </div>
              )
            ) : (
              <div className="text-center py-16">
                <p className="text-gray-400 mb-6">
                  Enter a search term to find paranormal reports
                </p>
                <div>
                  <p className="text-sm text-gray-500 mb-3 flex items-center justify-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Popular searches
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {popularSearches.map((term) => (
                      <button
                        key={term}
                        onClick={() => {
                          setQuery(term)
                          router.push(`/search?q=${encodeURIComponent(term)}`, undefined, { shallow: true })
                          performSearch(term)
                        }}
                        className="px-4 py-2 rounded-full bg-white/5 text-gray-300 hover:bg-white/10 text-sm"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
