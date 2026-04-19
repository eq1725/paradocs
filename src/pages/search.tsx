'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { Search, X, Filter, TrendingUp, MapPin, Calendar, Shield, ArrowRight, Loader2, Sparkles, Bookmark, Bell, Brain } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType, PhenomenonCategory } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import ReportCard from '@/components/ReportCard'
import SubcategoryFilter from '@/components/SubcategoryFilter'
import { classNames } from '@/lib/utils'
import CategoryIcon from '@/components/ui/CategoryIcon'

interface FulltextResult {
  id: string
  title: string
  slug: string
  summary: string
  category: string
  country: string | null
  city: string | null
  state_province: string | null
  latitude: number | null
  longitude: number | null
  location_name: string | null
  event_date: string | null
  credibility: string
  upvotes: number
  created_at: string
  rank: number
}

interface SearchFilters {
  categories: PhenomenonCategory[]
  phenomenonTypes: string[]
  hasEvidence: boolean
  dateFrom: string
  dateTo: string
}

interface AutocompleteItem {
  type: 'phenomenon' | 'location' | 'suggestion'
  label: string
  query: string
  icon: string
}

export default function SearchPage() {
  var router = useRouter()
  var { q } = router.query

  var [query, setQuery] = useState('')
  var [results, setResults] = useState<FulltextResult[]>([])
  var [fallbackResults, setFallbackResults] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  var [loading, setLoading] = useState(false)
  var [searched, setSearched] = useState(false)
  var [showFilters, setShowFilters] = useState(false)
  var [categoryFacets, setCategoryFacets] = useState<Record<string, number>>({})
  var [resultCount, setResultCount] = useState(0)
  var [searchMode, setSearchMode] = useState<'simple' | 'phrase'>('simple')

  // Autocomplete state
  var [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([])
  var [showAutocomplete, setShowAutocomplete] = useState(false)
  var [autocompleteLoading, setAutocompleteLoading] = useState(false)
  var autocompleteTimeout = useRef<NodeJS.Timeout | null>(null)
  var inputRef = useRef<HTMLInputElement>(null)

  // AI related patterns
  var [relatedPatterns, setRelatedPatterns] = useState<any[]>([])
  var [relatedLoading, setRelatedLoading] = useState(false)
  // Save search
  var [searchSaved, setSearchSaved] = useState(false)
  var [isLoggedIn, setIsLoggedIn] = useState(false)

  // Check auth state for save search
  useEffect(function() {
    supabase.auth.getSession().then(function(res) {
      if (res.data.session) setIsLoggedIn(true)
    })
  }, [])

  var [filters, setFilters] = useState<SearchFilters>({
    categories: [],
    phenomenonTypes: [],
    hasEvidence: false,
    dateFrom: '',
    dateTo: ''
  })

  useEffect(function() {
    if (q && typeof q === 'string') {
      setQuery(q)
      performSearch(q)
    }
  }, [q])

  // Debounced autocomplete
  var fetchAutocomplete = useCallback(function(term: string) {
    if (autocompleteTimeout.current) {
      clearTimeout(autocompleteTimeout.current)
    }
    if (term.length < 2) {
      setAutocompleteItems([])
      setShowAutocomplete(false)
      return
    }
    autocompleteTimeout.current = setTimeout(async function() {
      setAutocompleteLoading(true)
      try {
        // Search phenomena names for autocomplete suggestions
        var res = await supabase
          .from('phenomena')
          .select('name, slug, category')
          .ilike('name', '%' + term + '%')
          .limit(5)

        var items: AutocompleteItem[] = []
        if (res.data) {
          res.data.forEach(function(p: any) {
            var config = CATEGORY_CONFIG[p.category as keyof typeof CATEGORY_CONFIG]
            items.push({
              type: 'phenomenon',
              label: p.name,
              query: p.name,
              icon: config ? config.icon : '\u2728'
            })
          })
        }
        // Add the raw search as first option
        items.unshift({
          type: 'suggestion',
          label: 'Search for "' + term + '"',
          query: term,
          icon: '\uD83D\uDD0D'
        })
        setAutocompleteItems(items)
        setShowAutocomplete(items.length > 0)
      } catch (e) {
        // Silently fail autocomplete
      } finally {
        setAutocompleteLoading(false)
      }
    }, 250)
  }, [])

  // Perform search using fulltext API with fallback to ILIKE
  async function performSearch(searchQuery: string) {
    if (!searchQuery.trim()) return

    setLoading(true)
    setSearched(true)
    setShowAutocomplete(false)
    setFallbackResults([])

    try {
      // Try the fulltext search API first (uses ts_rank for proper ranking)
      var apiUrl = '/api/search/fulltext?q=' + encodeURIComponent(searchQuery.trim()) +
        '&mode=' + searchMode +
        '&limit=100'

      if (filters.categories.length === 1) {
        apiUrl = apiUrl + '&category=' + filters.categories[0]
      }

      var resp = await fetch(apiUrl)

      if (resp.ok) {
        var data = await resp.json()
        var reports = data.reports || []

        // Apply client-side filters that the API doesn't support
        if (filters.categories.length > 1) {
          reports = reports.filter(function(r: FulltextResult) {
            return filters.categories.includes(r.category as PhenomenonCategory)
          })
        }
        if (filters.hasEvidence) {
          // Fulltext results don't include evidence fields, so we note this
          // For now, evidence filter works best with the fallback
        }
        if (filters.dateFrom) {
          reports = reports.filter(function(r: FulltextResult) {
            return r.event_date && r.event_date >= filters.dateFrom
          })
        }
        if (filters.dateTo) {
          reports = reports.filter(function(r: FulltextResult) {
            return r.event_date && r.event_date <= filters.dateTo
          })
        }

        setResults(reports)
        setResultCount(reports.length)

        // Calculate category facets
        var facets: Record<string, number> = {}
        reports.forEach(function(report: FulltextResult) {
          facets[report.category] = (facets[report.category] || 0) + 1
        })
        setCategoryFacets(facets)
      } else {
        // Fallback to ILIKE if fulltext API fails
        await performFallbackSearch(searchQuery)
      }
    } catch (error) {
      console.error('Search error, falling back:', error)
      await performFallbackSearch(searchQuery)
      // Fetch AI related patterns in parallel (non-blocking)
      setRelatedLoading(true)
      fetch('/api/ai/related?query=' + encodeURIComponent(searchQuery.trim()))
        .then(function(r) { return r.ok ? r.json() : null })
        .then(function(data) {
          if (data) {
            var patterns = (data.related_reports || []).concat(data.related_phenomena || []).slice(0, 4)
            setRelatedPatterns(patterns)
          }
        })
        .catch(function() { /* non-critical */ })
        .finally(function() { setRelatedLoading(false) })

    } finally {
      setLoading(false)
    }
  }

  // Fallback search using ILIKE (original method)
  async function performFallbackSearch(searchQuery: string) {
    try {
      var sanitized = searchQuery.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
      var words = sanitized.split(' ').filter(Boolean)
      var pattern = '%' + words.join('%') + '%'

      var queryBuilder = supabase
        .from('reports')
        .select('*, phenomenon_type:phenomenon_types(*)')
        .eq('status', 'approved')
        .or('title.ilike.' + pattern + ',summary.ilike.' + pattern)

      if (filters.categories.length > 0) {
        queryBuilder = queryBuilder.in('category', filters.categories)
      }
      if (filters.phenomenonTypes.length > 0) {
        queryBuilder = queryBuilder.in('phenomenon_type_id', filters.phenomenonTypes)
      }
      if (filters.hasEvidence) {
        queryBuilder = queryBuilder.or('has_physical_evidence.eq.true,has_photo_video.eq.true')
      }
      if (filters.dateFrom) {
        queryBuilder = queryBuilder.gte('event_date', filters.dateFrom)
      }
      if (filters.dateTo) {
        queryBuilder = queryBuilder.lte('event_date', filters.dateTo)
      }

      var { data, error } = await queryBuilder
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error

      setFallbackResults(data || [])
      setResults([])
      setResultCount((data || []).length)

      var facets: Record<string, number> = {};
      (data || []).forEach(function(report: any) {
        facets[report.category] = (facets[report.category] || 0) + 1
      })
      setCategoryFacets(facets)
    } catch (error) {
      console.error('Fallback search error:', error)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      router.push('/search?q=' + encodeURIComponent(query), undefined, { shallow: true })
      performSearch(query)
    }
  }

  function handleAutocompleteSelect(item: AutocompleteItem) {
    setQuery(item.query)
    setShowAutocomplete(false)
    router.push('/search?q=' + encodeURIComponent(item.query), undefined, { shallow: true })
    performSearch(item.query)
  }

  function clearSearch() {
    setQuery('')
    setResults([])
    setFallbackResults([])
    setSearched(false)
    setCategoryFacets({})
    setResultCount(0)
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
    var newCategories = filters.categories.includes(category)
      ? filters.categories.filter(function(c) { return c !== category })
      : filters.categories.concat([category])
    setFilters(function(prev) { return Object.assign({}, prev, { categories: newCategories }) })
  }

  var hasActiveFilters = filters.categories.length > 0 ||
    filters.phenomenonTypes.length > 0 ||
    filters.hasEvidence ||
    filters.dateFrom ||
    filters.dateTo

  // Re-search when filters change
  useEffect(function() {
    if (query && searched) {
      performSearch(query)
    }
  }, [filters])

  var popularSearches = [
    'UFO triangle',
    'Bigfoot tracks',
    'ghost apparition',
    'strange lights',
    'Roswell incident',
    'telepathy',
    'near death experience',
    'cryptid sighting'
  ]

  // Close autocomplete on click outside
  useEffect(function() {
    function handleClick(e: MouseEvent) {
      var target = e.target as HTMLElement
      if (!target.closest('.search-autocomplete-container')) {
        setShowAutocomplete(false)
      }
    }
    document.addEventListener('click', handleClick)
    return function() { document.removeEventListener('click', handleClick) }
  }, [])

  return (
    <>
      <Head>
        <title>{q ? 'Search: ' + q + ' - Paradocs' : 'Advanced Search - Paradocs'}</title>
        <meta name="description" content={q ? 'Search results for "' + q + '" in the Paradocs paranormal database.' : 'AI-powered search across the world\'s largest paranormal database with advanced filtering.'} />
        <meta name="robots" content="noindex" />
      </Head>

      <div className="max-w-7xl mx-auto px-4 py-5 sm:py-8 pb-20 sm:pb-8">
        <h1 className="text-xl sm:text-3xl font-display font-bold text-white mb-1 sm:mb-2 flex items-center gap-2">
          <Search className="w-6 h-6 sm:w-8 sm:h-8 text-primary-400" />
          AI-Powered Search
        </h1>
        <p className="text-gray-400 text-sm sm:text-base mb-5 sm:mb-8">
          Search across the entire Paradocs database with AI-ranked results and pattern detection
        </p>

        {/* Search form with autocomplete */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 search-autocomplete-container">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 z-10" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={function(e) {
                  setQuery(e.target.value)
                  fetchAutocomplete(e.target.value)
                }}
                onFocus={function() {
                  if (autocompleteItems.length > 0 && query.length >= 2) {
                    setShowAutocomplete(true)
                  }
                }}
                placeholder="Search reports, phenomena, locations..."
                className="w-full pl-12 pr-12 py-3 sm:py-4 text-base sm:text-lg"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded z-10"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              )}

              {/* Autocomplete dropdown */}
              {showAutocomplete && autocompleteItems.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900/95 backdrop-blur border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {autocompleteItems.map(function(item, i) {
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={function() { handleAutocompleteSelect(item) }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
                      >
                        <span className="text-lg shrink-0">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-white block truncate">{item.label}</span>
                          {item.type === 'phenomenon' && (
                            <span className="text-xs text-gray-500">Phenomenon</span>
                          )}
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-600 shrink-0" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={function() { setShowFilters(!showFilters) }}
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

          {/* Search mode toggle */}
          {searched && (
            <div className="flex items-center gap-3 mt-3">
              <span className="text-xs text-gray-500">Mode:</span>
              <button
                type="button"
                onClick={function() {
                  setSearchMode('simple')
                  if (query) performSearch(query)
                }}
                className={classNames(
                  'text-xs px-2.5 py-1 rounded-full transition-colors',
                  searchMode === 'simple' ? 'bg-primary-500/20 text-primary-300' : 'text-gray-500 hover:text-gray-300'
                )}
              >
                Keywords
              </button>
              <button
                type="button"
                onClick={function() {
                  setSearchMode('phrase')
                  if (query) performSearch(query)
                }}
                className={classNames(
                  'text-xs px-2.5 py-1 rounded-full transition-colors',
                  searchMode === 'phrase' ? 'bg-primary-500/20 text-primary-300' : 'text-gray-500 hover:text-gray-300'
                )}
              >
                Exact Phrase
              </button>
            </div>
          )}
        </form>

        {/* Filters panel */}
        {showFilters && (
          <div className="glass-card p-4 sm:p-6 mb-6 animate-fade-in">
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
                  onCategoriesChange={function(cats) { setFilters(function(prev) { return Object.assign({}, prev, { categories: cats }) }) }}
                  onTypesChange={function(types) { setFilters(function(prev) { return Object.assign({}, prev, { phenomenonTypes: types }) }) }}
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
                      onChange={function(e) { setFilters(function(prev) { return Object.assign({}, prev, { dateFrom: e.target.value }) }) }}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Date To</label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={function(e) { setFilters(function(prev) { return Object.assign({}, prev, { dateTo: e.target.value }) }) }}
                      className="w-full"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.hasEvidence}
                    onChange={function(e) { setFilters(function(prev) { return Object.assign({}, prev, { hasEvidence: e.target.checked }) }) }}
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
                <div className="flex items-center gap-3 mb-4">
                  <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
                  <span className="text-gray-400 text-sm">Searching...</span>
                </div>
                {[0, 1, 2, 3, 4].map(function(i) {
                  return <div key={i} className="glass-card p-5 h-32 skeleton" />
                })}
              </div>
            ) : searched ? (
              resultCount > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-400">
                      {'Found ' + resultCount + ' result' + (resultCount !== 1 ? 's' : '') + ' for \u201C' + q + '\u201D'}
                    </p>
                    <div className="flex items-center gap-3">
                      {results.length > 0 && (
                        <span className="text-xs text-gray-600 hidden sm:inline">Ranked by relevance</span>
                      )}
                      {/* Save Search (Phase 3 item 15) */}
                      {isLoggedIn ? (
                        <button
                          type="button"
                          onClick={function() { setSearchSaved(true) }}
                          className={classNames(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                            searchSaved ? 'bg-primary-500/20 text-primary-400' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                          )}
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          {searchSaved ? 'Saved' : 'Save Search'}
                        </button>
                      ) : (
                        <Link
                          href={'/login?reason=save&redirect=' + encodeURIComponent('/search?q=' + encodeURIComponent(String(q || '')))}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <Bell className="w-3.5 h-3.5" />
                          Get alerts
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* AI Related Patterns (Phase 3 item 13) */}
                  {relatedPatterns.length > 0 && (
                    <div className="mb-6 p-4 rounded-xl bg-primary-500/5 border border-primary-500/10">
                      <div className="flex items-center gap-2 mb-3">
                        <Brain className="w-4 h-4 text-primary-400" />
                        <span className="text-sm font-medium text-primary-300">AI Found Related Patterns</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {relatedPatterns.map(function(pattern, i) {
                          return (
                            <Link
                              key={i}
                              href={pattern.slug ? ('/report/' + pattern.slug) : (pattern.source_table === 'phenomenon' ? ('/phenomena/' + pattern.slug) : '/insights')}
                              className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-primary-500/20 transition-all group"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-primary-400 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-sm text-white font-medium truncate group-hover:text-primary-300 transition-colors">
                                  {pattern.title || pattern.name || 'Related pattern'}
                                </div>
                                {pattern.snippet && (
                                  <div className="text-xs text-gray-500 line-clamp-1 mt-0.5">{pattern.snippet}</div>
                                )}
                                {pattern.similarity && (
                                  <span className="text-[10px] text-primary-400/70">{Math.round(pattern.similarity * 100) + '% match'}</span>
                                )}
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Category facets */}
                  {Object.keys(categoryFacets).length > 1 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                      {Object.entries(categoryFacets)
                        .sort(function(a, b) { return b[1] - a[1] })
                        .map(function(entry) {
                          var cat = entry[0]
                          var count = entry[1]
                          var config = CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
                          var isSelected = filters.categories.includes(cat as PhenomenonCategory)
                          return (
                            <button
                              key={cat}
                              onClick={function() { toggleCategoryFilter(cat as PhenomenonCategory) }}
                              className={classNames(
                                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors',
                                isSelected
                                  ? config.bgColor + ' ' + config.color
                                  : 'bg-white/5 text-gray-300 hover:bg-white/10'
                              )}
                            >
                              <CategoryIcon category={cat as PhenomenonCategory} size={14} />
                              <span>{config.label}</span>
                              <span className="text-xs opacity-60">{'(' + count + ')'}</span>
                            </button>
                          )
                        })}
                    </div>
                  )}

                  {/* Fulltext results (ranked) */}
                  {results.length > 0 && (
                    <div className="space-y-3">
                      {results.map(function(report) {
                        var config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
                        return (
                          <Link
                            key={report.id}
                            href={'/report/' + report.slug}
                            className="block glass-card p-4 sm:p-5 border border-white/5 hover:border-primary-500/30 hover:bg-white/[0.02] transition-all group"
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-xl shrink-0 mt-0.5"><CategoryIcon category={report.category as PhenomenonCategory} size={20} /></span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={'text-xs font-medium px-2 py-0.5 rounded-full ' + config.bgColor + ' ' + config.color}>
                                    {config.label}
                                  </span>
                                  {report.credibility && (
                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                      <Shield className="w-3 h-3" />
                                      {report.credibility}
                                    </span>
                                  )}
                                </div>
                                <h3 className="text-base font-display font-semibold text-white group-hover:text-primary-300 transition-colors">
                                  {report.title}
                                </h3>
                                {report.summary && (
                                  <p className="text-sm text-gray-400 mt-1.5 line-clamp-2">{report.summary}</p>
                                )}
                                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                                  {report.location_name && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" /> {report.location_name}
                                    </span>
                                  )}
                                  {report.event_date && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(report.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-primary-400 shrink-0 mt-1 transition-colors" />
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}

                  {/* Fallback results (ILIKE, unranked) */}
                  {fallbackResults.length > 0 && (
                    <div className="space-y-4">
                      {fallbackResults.map(function(report) {
                        return <ReportCard key={report.id} report={report} />
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-10 sm:py-16">
                  <p className="text-gray-400 text-sm sm:text-base mb-4">
                    {'No results found for \u201C' + q + '\u201D'}
                  </p>
                  <p className="text-sm text-gray-500 mb-6">
                    Try different keywords, check your spelling, or remove filters
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {['UFO sighting', 'ghost encounter', 'Bigfoot'].map(function(term) {
                      return (
                        <button
                          key={term}
                          onClick={function() {
                            setQuery(term)
                            router.push('/search?q=' + encodeURIComponent(term), undefined, { shallow: true })
                            performSearch(term)
                          }}
                          className="px-3.5 py-2 rounded-full bg-white/5 text-gray-300 hover:bg-white/10 text-sm"
                        >
                          {'Try "' + term + '"'}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-4">
                    <Link href="/explore" className="text-sm text-primary-400 hover:text-primary-300 flex items-center justify-center gap-1">
                      Browse all reports <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )
            ) : (
              <div className="text-center py-10 sm:py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-500/10 border border-primary-500/20 mb-5">
                  <Search className="w-7 h-7 text-primary-400" />
                </div>
                <p className="text-gray-400 text-sm sm:text-base mb-4 sm:mb-6">
                  Search across the entire Paradocs database
                </p>
                <div>
                  <p className="text-sm text-gray-500 mb-3 flex items-center justify-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Popular searches
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {popularSearches.map(function(term) {
                      return (
                        <button
                          key={term}
                          onClick={function() {
                            setQuery(term)
                            router.push('/search?q=' + encodeURIComponent(term), undefined, { shallow: true })
                            performSearch(term)
                          }}
                          className="px-3.5 sm:px-4 py-2.5 sm:py-2 rounded-full bg-white/5 text-gray-300 hover:bg-white/10 active:bg-white/15 text-sm"
                        >
                          {term}
                        </button>
                      )
                    })}
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
