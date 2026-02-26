'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Search, Grid3X3, List, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, AlertTriangle, MapPin, Tag, ArrowUp, X } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

interface QuickFacts {
  origin?: string
  first_documented?: string
  classification?: string
  danger_level?: string
  typical_encounter?: string
  evidence_types?: string
  active_period?: string
  notable_feature?: string
  cultural_significance?: string
}

interface Phenomenon {
  id: string
  name: string
  slug: string
  category: string
  icon: string
  ai_summary: string | null
  report_count: number
  primary_image_url: string | null
  aliases: string[]
  ai_quick_facts?: QuickFacts | null
}

// Category-specific gradient backgrounds for entries without images
const CATEGORY_GRADIENTS: Record<string, string> = {
  cryptids: 'from-emerald-950 via-gray-900 to-gray-950',
  ufos_aliens: 'from-indigo-950 via-gray-900 to-gray-950',
  ghosts_hauntings: 'from-slate-900 via-purple-950/50 to-gray-950',
  psychic_phenomena: 'from-violet-950 via-gray-900 to-gray-950',
  consciousness_practices: 'from-amber-950/80 via-gray-900 to-gray-950',
  psychological_experiences: 'from-cyan-950 via-gray-900 to-gray-950',
  biological_factors: 'from-rose-950 via-gray-900 to-gray-950',
  perception_sensory: 'from-orange-950 via-gray-900 to-gray-950',
  religion_mythology: 'from-yellow-950/80 via-gray-900 to-gray-950',
  esoteric_practices: 'from-fuchsia-950 via-gray-900 to-gray-950',
  combination: 'from-teal-950 via-gray-900 to-gray-950',
}

const DANGER_COLORS: Record<string, { bg: string; text: string }> = {
  'Low': { bg: 'bg-green-900/60', text: 'text-green-400' },
  'Moderate': { bg: 'bg-yellow-900/60', text: 'text-yellow-400' },
  'High': { bg: 'bg-orange-900/60', text: 'text-orange-400' },
  'Extreme': { bg: 'bg-red-900/60', text: 'text-red-400' },
  'Unknown': { bg: 'bg-gray-800/60', text: 'text-gray-400' },
  'Varies': { bg: 'bg-purple-900/60', text: 'text-purple-400' },
}

const DANGER_SORT_ORDER: Record<string, number> = {
  'Extreme': 0, 'High': 1, 'Moderate': 2, 'Low': 3, 'Varies': 4, 'Unknown': 5
}

type ViewMode = 'grid' | 'list'
type SortBy = 'name_asc' | 'name_desc' | 'reports' | 'danger'

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'name_asc', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'reports', label: 'Most Reports' },
  { value: 'danger', label: 'Danger Level' },
]

const ITEMS_PER_PAGE = 24
const ALPHABET = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const CATEGORY_ORDER = [
  'cryptids',
  'ufos_aliens',
  'ghosts_hauntings',
  'psychic_phenomena',
  'consciousness_practices',
  'psychological_experiences',
  'biological_factors',
  'perception_sensory',
  'religion_mythology',
  'esoteric_practices',
  'combination',
]

function sortPhenomena(items: Phenomenon[], sortBy: SortBy): Phenomenon[] {
  const sorted = [...items]
  switch (sortBy) {
    case 'name_asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    case 'name_desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name))
    case 'reports':
      return sorted.sort((a, b) => b.report_count - a.report_count || a.name.localeCompare(b.name))
    case 'danger': {
      return sorted.sort((a, b) => {
        const aKey = a.ai_quick_facts?.danger_level?.split(' ')?.[0] || 'Unknown'
        const bKey = b.ai_quick_facts?.danger_level?.split(' ')?.[0] || 'Unknown'
        const aOrder = DANGER_SORT_ORDER[aKey] ?? 5
        const bOrder = DANGER_SORT_ORDER[bKey] ?? 5
        return aOrder - bOrder || a.name.localeCompare(b.name)
      })
    }
    default:
      return sorted
  }
}

function getLetterForName(name: string): string {
  const first = name.charAt(0).toUpperCase()
  return /[A-Z]/.test(first) ? first : '#'
}

// --- Alphabet Bar Component ---
function AlphabetBar({
  items,
  activeLetter,
  onSelectLetter,
}: {
  items: Phenomenon[]
  activeLetter: string | null
  onSelectLetter: (letter: string | null) => void
}) {
  const availableLetters = useMemo(() => {
    const set = new Set<string>()
    items.forEach(p => set.add(getLetterForName(p.name)))
    return set
  }, [items])

  return (
    <div className="flex flex-wrap gap-0.5 sm:gap-1 py-2">
      {ALPHABET.map(letter => {
        const hasItems = availableLetters.has(letter)
        const isActive = activeLetter === letter
        return (
          <button
            key={letter}
            onClick={() => hasItems ? onSelectLetter(isActive ? null : letter) : undefined}
            disabled={!hasItems}
            className={classNames(
              'w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded text-xs sm:text-sm font-medium transition-all',
              isActive
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                : hasItems
                  ? 'text-gray-300 hover:bg-gray-800 hover:text-white cursor-pointer'
                  : 'text-gray-700 cursor-default'
            )}
          >
            {letter}
          </button>
        )
      })}
      {activeLetter && (
        <button
          onClick={() => onSelectLetter(null)}
          className="ml-1 px-2 h-7 sm:h-8 flex items-center gap-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  )
}

// --- Back to Top Button ---
function BackToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 400)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 z-20 w-11 h-11 flex items-center justify-center rounded-full bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-500 transition-all hover:scale-110"
      aria-label="Back to top"
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  )
}

export default function PhenomenaPage() {
  const router = useRouter()
  const [phenomena, setPhenomena] = useState<Phenomenon[]>([])
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortBy>('name_asc')
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [activeLetter, setActiveLetter] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showMoreCounts, setShowMoreCounts] = useState<Record<string, number>>({})
  const categoryRefs = useRef<Record<string, HTMLElement | null>>({})
  const navRef = useRef<HTMLDivElement>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // --- URL State: Initialize from query params ---
  useEffect(() => {
    if (!router.isReady) return
    const q = router.query
    if (q.search && typeof q.search === 'string') setSearchQuery(q.search)
    if (q.category && typeof q.category === 'string') setSelectedCategory(q.category)
    if (q.view && (q.view === 'grid' || q.view === 'list')) setViewMode(q.view as ViewMode)
    if (q.sort && typeof q.sort === 'string') {
      const valid: SortBy[] = ['name_asc', 'name_desc', 'reports', 'danger']
      if (valid.includes(q.sort as SortBy)) setSortBy(q.sort as SortBy)
    }
    if (q.letter && typeof q.letter === 'string') setActiveLetter(q.letter)
    if (q.page && typeof q.page === 'string') setCurrentPage(Math.max(1, parseInt(q.page) || 1))
    setInitialized(true)
  }, [router.isReady])

  // --- URL State: Sync state changes to URL ---
  useEffect(() => {
    if (!initialized) return
    const params: Record<string, string> = {}
    if (searchQuery) params.search = searchQuery
    if (selectedCategory !== 'all') params.category = selectedCategory
    if (viewMode !== 'grid') params.view = viewMode
    if (sortBy !== 'name_asc') params.sort = sortBy
    if (activeLetter) params.letter = activeLetter
    if (selectedCategory !== 'all' && currentPage > 1) params.page = String(currentPage)

    const queryString = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    const newPath = queryString ? `/phenomena?${queryString}` : '/phenomena'
    const currentPath = router.asPath.split('?')[0] + (Object.keys(router.query).length ? '?' + Object.entries(router.query).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : '')

    if (newPath !== router.asPath) {
      router.replace(newPath, undefined, { shallow: true })
    }
  }, [searchQuery, selectedCategory, viewMode, sortBy, activeLetter, currentPage, initialized])

  // Reset pagination and letter filter on category/search change
  useEffect(() => {
    setCurrentPage(1)
    setShowMoreCounts({})
  }, [selectedCategory, searchQuery, sortBy])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeLetter])

  // Check if nav bar can scroll in either direction
  const updateNavScrollState = useCallback(() => {
    var el = navRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  // Scroll the nav bar by a fixed amount
  const scrollNav = useCallback(function(direction: 'left' | 'right') {
    var el = navRef.current
    if (!el) return
    var amount = direction === 'left' ? -200 : 200
    el.scrollBy({ left: amount, behavior: 'smooth' })
  }, [])

  // Mouse wheel horizontal scroll on the nav bar
  useEffect(function() {
    var el = navRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el!.scrollLeft += e.deltaY
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scroll', updateNavScrollState)
    var timer = setTimeout(updateNavScrollState, 100)
    return function() {
      el!.removeEventListener('wheel', onWheel)
      el!.removeEventListener('scroll', updateNavScrollState)
      clearTimeout(timer)
    }
  }, [phenomena, selectedCategory, searchQuery, updateNavScrollState])

  // Auto-scroll the active pill into view in the nav bar
  useEffect(function() {
    if (!activeCategory || !navRef.current) return
    var buttons = navRef.current.querySelectorAll('button')
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute('data-cat') === activeCategory) {
        buttons[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
        break
      }
    }
  }, [activeCategory])

  // Scroll to a category section, expanding it if collapsed
  const scrollToCategory = useCallback((cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      next.delete(cat)
      return next
    })
    setTimeout(() => {
      const el = categoryRefs.current[cat]
      if (el) {
        const stickyOffset = 140
        const top = el.getBoundingClientRect().top + window.scrollY - stickyOffset
        window.scrollTo({ top, behavior: 'smooth' })
      }
    }, 50)
  }, [])

  // Track which category is currently in view
  useEffect(() => {
    if (selectedCategory !== 'all') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cat = entry.target.getAttribute('data-category')
            if (cat) setActiveCategory(cat)
          }
        }
      },
      { rootMargin: '-160px 0px -60% 0px', threshold: 0 }
    )
    Object.values(categoryRefs.current).forEach(el => {
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [phenomena, selectedCategory, searchQuery])

  function toggleCategory(cat: string) {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  function expandAll() {
    setCollapsedCategories(new Set())
  }

  function collapseAll() {
    setCollapsedCategories(new Set(CATEGORY_ORDER))
  }

  function handleShowMore(category: string) {
    setShowMoreCounts(prev => ({
      ...prev,
      [category]: (prev[category] || 1) + 1
    }))
  }

  useEffect(() => {
    loadPhenomena()
  }, [])

  async function loadPhenomena() {
    try {
      const res = await fetch('/api/phenomena')
      const data = await res.json()
      setPhenomena(data.phenomena || [])
    } catch (error) {
      console.error('Error loading phenomena:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter phenomena
  const filteredPhenomena = useMemo(() => {
    return phenomena.filter(p => {
      const matchesSearch = searchQuery === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.aliases?.some(a => a.toLowerCase().includes(searchQuery.toLowerCase())) ||
        p.ai_summary?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory

      const matchesLetter = !activeLetter || getLetterForName(p.name) === activeLetter

      return matchesSearch && matchesCategory && matchesLetter
    })
  }, [phenomena, searchQuery, selectedCategory, activeLetter])

  // Sort + group
  const sortedFiltered = useMemo(() => sortPhenomena(filteredPhenomena, sortBy), [filteredPhenomena, sortBy])

  const groupedPhenomena = useMemo(() => {
    return CATEGORY_ORDER.reduce((acc, cat) => {
      const items = sortedFiltered.filter(p => p.category === cat)
      if (items.length > 0) {
        acc[cat] = items
      }
      return acc
    }, {} as Record<string, Phenomenon[]>)
  }, [sortedFiltered])

  // Pagination for single-category view
  const totalPages = selectedCategory !== 'all' ? Math.ceil(sortedFiltered.length / ITEMS_PER_PAGE) : 1
  const paginatedItems = selectedCategory !== 'all'
    ? sortedFiltered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
    : sortedFiltered

  // Result count text
  const resultCountText = useMemo(() => {
    const total = phenomena.length
    const shown = filteredPhenomena.length
    if (searchQuery && selectedCategory !== 'all') {
      const catLabel = CATEGORY_CONFIG[selectedCategory as keyof typeof CATEGORY_CONFIG]?.label || selectedCategory
      return `${shown} result${shown !== 1 ? 's' : ''} for "${searchQuery}" in ${catLabel}`
    }
    if (searchQuery) {
      return `${shown} result${shown !== 1 ? 's' : ''} for "${searchQuery}"`
    }
    if (activeLetter && selectedCategory !== 'all') {
      const catLabel = CATEGORY_CONFIG[selectedCategory as keyof typeof CATEGORY_CONFIG]?.label || selectedCategory
      return `${shown} phenomena starting with "${activeLetter}" in ${catLabel}`
    }
    if (activeLetter) {
      return `${shown} phenomena starting with "${activeLetter}"`
    }
    if (selectedCategory !== 'all') {
      const catLabel = CATEGORY_CONFIG[selectedCategory as keyof typeof CATEGORY_CONFIG]?.label || selectedCategory
      return `${shown} phenomena in ${catLabel}`
    }
    return `${total.toLocaleString()} phenomena across ${Object.keys(groupedPhenomena).length} categories`
  }, [phenomena.length, filteredPhenomena.length, searchQuery, selectedCategory, activeLetter, groupedPhenomena])

  return (
    <>
      <Head>
        <title>Phenomena Encyclopedia - Paradocs</title>
        <meta name="description" content="Explore our comprehensive encyclopedia of paranormal phenomena, cryptids, UFOs, and unexplained events." />
      </Head>

      <div className="min-h-screen bg-gray-950">
        {/* Header */}
        <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h1 className="text-4xl font-bold text-white mb-4">
              Phenomena Encyclopedia
            </h1>
            <p className="text-lg text-gray-400 max-w-3xl">
              Explore our comprehensive database of paranormal phenomena, from cryptids like Bigfoot and Mothman
              to UFO classifications and haunting types. Each entry includes detailed descriptions,
              historical context, and links to related reports.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              {/* Search */}
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search phenomena..."
                  className="w-full pl-10 pr-9 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex gap-2 sm:gap-3 items-center w-full sm:w-auto flex-wrap">
                {/* Category Filter */}
                <select
                  value={selectedCategory}
                  onChange={(e) => { setSelectedCategory(e.target.value); setActiveLetter(null) }}
                  className="flex-1 sm:flex-initial px-3 sm:px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">All Categories</option>
                  {CATEGORY_ORDER.map(cat => (
                    <option key={cat} value={cat}>
                      {CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG]?.icon} {CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG]?.label}
                    </option>
                  ))}
                </select>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {SORT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                {/* View Toggle */}
                <div className="flex bg-gray-800 rounded-lg p-1 shrink-0">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={classNames(
                      'p-2 rounded transition-colors',
                      viewMode === 'grid' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    )}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={classNames(
                      'p-2 rounded transition-colors',
                      viewMode === 'list' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    )}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Category Quick Nav - scrollable pills for jump-to-section */}
          {selectedCategory === 'all' && Object.keys(groupedPhenomena).length > 1 && (
            <div className="border-t border-gray-800/50">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="relative flex items-center">
                  {/* Left scroll arrow */}
                  {canScrollLeft && (
                    <button
                      onClick={() => scrollNav('left')}
                      className="absolute left-0 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-gray-800/90 border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors shadow-lg backdrop-blur-sm -ml-1"
                      aria-label="Scroll categories left"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}

                  {/* Left fade gradient */}
                  {canScrollLeft && (
                    <div className="absolute left-6 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-900/95 to-transparent z-[5] pointer-events-none" />
                  )}

                  <div ref={navRef} className="flex gap-1.5 py-2 overflow-x-auto scrollbar-hide scroll-smooth mx-1">
                    {Object.entries(groupedPhenomena).map(([category, items]) => {
                      const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]
                      const isActive = activeCategory === category
                      return (
                        <button
                          key={category}
                          data-cat={category}
                          onClick={() => scrollToCategory(category)}
                          className={classNames(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 shrink-0',
                            isActive
                              ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                              : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-white'
                          )}
                        >
                          <span className="text-sm">{config?.icon}</span>
                          <span className="hidden sm:inline">{config?.label}</span>
                          <span className={classNames(
                            'px-1.5 py-0.5 rounded-full text-[10px] leading-none',
                            isActive ? 'bg-purple-500/50 text-purple-100' : 'bg-gray-700/80 text-gray-500'
                          )}>
                            {items.length}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Right fade gradient */}
                  {canScrollRight && (
                    <div className="absolute right-6 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-900/95 to-transparent z-[5] pointer-events-none" />
                  )}

                  {/* Right scroll arrow */}
                  {canScrollRight && (
                    <button
                      onClick={() => scrollNav('right')}
                      className="absolute right-0 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-gray-800/90 border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors shadow-lg backdrop-blur-sm -mr-1"
                      aria-label="Scroll categories right"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Result Count */}
          {!loading && phenomena.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{resultCountText}</p>
              {(searchQuery || activeLetter || selectedCategory !== 'all' || sortBy !== 'name_asc') && (
                <button
                  onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setSortBy('name_asc'); setActiveLetter(null); setCurrentPage(1) }}
                  className="text-xs text-gray-500 hover:text-purple-400 transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Reset filters
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            </div>
          ) : filteredPhenomena.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-400 text-lg">No phenomena found matching your search.</p>
              {(searchQuery || activeLetter) && (
                <button
                  onClick={() => { setSearchQuery(''); setActiveLetter(null) }}
                  className="mt-3 text-sm text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : selectedCategory === 'all' ? (
            // Grouped view when showing all categories
            <div className="space-y-4">
              {/* Expand/Collapse All controls */}
              <div className="flex items-center justify-end gap-3 mb-2">
                <button
                  onClick={expandAll}
                  className="text-sm text-gray-400 hover:text-purple-400 transition-colors flex items-center gap-1"
                >
                  <ChevronDown className="w-4 h-4" />
                  Expand All
                </button>
                <span className="text-gray-700">|</span>
                <button
                  onClick={collapseAll}
                  className="text-sm text-gray-400 hover:text-purple-400 transition-colors flex items-center gap-1"
                >
                  <ChevronUp className="w-4 h-4" />
                  Collapse All
                </button>
              </div>

              {Object.entries(groupedPhenomena).map(([category, items]) => {
                const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]
                const isCollapsed = collapsedCategories.has(category)
                const showCount = (showMoreCounts[category] || 1) * ITEMS_PER_PAGE
                const visibleItems = items.slice(0, showCount)
                const hasMore = items.length > showCount
                return (
                  <section
                    key={category}
                    ref={(el) => { categoryRefs.current[category] = el }}
                    data-category={category}
                    className="border border-gray-800 rounded-xl overflow-hidden"
                  >
                    {/* Clickable category header */}
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-gray-900/80 hover:bg-gray-800/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{config?.icon}</span>
                        <h2 className="text-xl font-bold text-white">{config?.label}</h2>
                        <span className="text-gray-500 text-sm">({items.length})</span>
                      </div>
                      <ChevronDown
                        className={classNames(
                          'w-5 h-5 text-gray-400 transition-transform duration-200',
                          isCollapsed ? '-rotate-90' : 'rotate-0'
                        )}
                      />
                    </button>

                    {/* Collapsible content */}
                    {!isCollapsed && (
                      <div className="p-4 pt-2">
                        {/* A-Z bar for large categories */}
                        {items.length > 20 && (
                          <AlphabetBar
                            items={items}
                            activeLetter={activeLetter}
                            onSelectLetter={setActiveLetter}
                          />
                        )}

                        {viewMode === 'grid' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {visibleItems.map(phenomenon => (
                              <PhenomenonCard key={phenomenon.id} phenomenon={phenomenon} />
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {visibleItems.map(phenomenon => (
                              <PhenomenonListItem key={phenomenon.id} phenomenon={phenomenon} />
                            ))}
                          </div>
                        )}

                        {/* Show More button */}
                        {hasMore && (
                          <div className="flex justify-center mt-6">
                            <button
                              onClick={() => handleShowMore(category)}
                              className="px-6 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-700 hover:border-gray-600 transition-all"
                            >
                              Show More ({items.length - showCount} remaining)
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          ) : (
            // Single category view with A-Z bar and pagination
            <div>
              {/* A-Z bar for single category */}
              {sortedFiltered.length > 20 && (
                <AlphabetBar
                  items={phenomena.filter(p => p.category === selectedCategory)}
                  activeLetter={activeLetter}
                  onSelectLetter={setActiveLetter}
                />
              )}

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {paginatedItems.map(phenomenon => (
                    <PhenomenonCard key={phenomenon.id} phenomenon={phenomenon} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {paginatedItems.map(phenomenon => (
                    <PhenomenonListItem key={phenomenon.id} phenomenon={phenomenon} />
                  ))}
                </div>
              )}

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className={classNames(
                      'px-3 py-2 rounded-lg text-sm border transition-colors',
                      currentPage <= 1
                        ? 'border-gray-800 text-gray-600 cursor-not-allowed'
                        : 'border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800'
                    )}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      // Show first, last, current, and neighbors
                      if (page === 1 || page === totalPages) return true
                      if (Math.abs(page - currentPage) <= 1) return true
                      return false
                    })
                    .reduce((acc, page, idx, arr) => {
                      // Insert ellipsis gaps
                      if (idx > 0 && page - arr[idx - 1] > 1) {
                        acc.push(-arr[idx - 1]) // negative = ellipsis marker
                      }
                      acc.push(page)
                      return acc
                    }, [] as number[])
                    .map((page, idx) => {
                      if (page < 0) {
                        return <span key={`ellipsis-${idx}`} className="px-2 text-gray-600">...</span>
                      }
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={classNames(
                            'w-9 h-9 rounded-lg text-sm font-medium transition-colors',
                            page === currentPage
                              ? 'bg-purple-600 text-white'
                              : 'text-gray-400 hover:text-white hover:bg-gray-800'
                          )}
                        >
                          {page}
                        </button>
                      )
                    })}

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className={classNames(
                      'px-3 py-2 rounded-lg text-sm border transition-colors',
                      currentPage >= totalPages
                        ? 'border-gray-800 text-gray-600 cursor-not-allowed'
                        : 'border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800'
                    )}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <span className="ml-2 text-sm text-gray-500">
                    Page {currentPage} of {totalPages}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Back to Top button */}
        <BackToTopButton />
      </div>
    </>
  )
}

function PhenomenonCard({ phenomenon }: { phenomenon: Phenomenon }) {
  const config = CATEGORY_CONFIG[phenomenon.category as keyof typeof CATEGORY_CONFIG]
  const [imgError, setImgError] = useState(false)
  const gradient = CATEGORY_GRADIENTS[phenomenon.category] || 'from-gray-800 to-gray-900'
  const qf = phenomenon.ai_quick_facts
  const hasImage = phenomenon.primary_image_url && !imgError

  // Normalize danger level for color lookup
  const dangerKey = qf?.danger_level?.split(' ')?.[0] || ''
  const dangerStyle = DANGER_COLORS[dangerKey] || null

  return (
    <Link href={`/phenomena/${phenomenon.slug}`}>
      <div className="group bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 hover:scale-[1.02]">
        {/* Image area */}
        <div className={classNames(
          'aspect-video relative overflow-hidden',
          !hasImage ? `bg-gradient-to-br ${gradient}` : ''
        )}>
          {hasImage ? (
            <img
              src={phenomenon.primary_image_url!}
              alt={phenomenon.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <span className="text-5xl opacity-40 group-hover:opacity-60 group-hover:scale-110 transition-all duration-300">
                {phenomenon.icon || config?.icon}
              </span>
              <span className="text-xs text-gray-500 uppercase tracking-widest font-medium">
                {config?.label}
              </span>
            </div>
          )}

          {/* Quick fact pills overlaid on image */}
          {qf && (
            <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5">
              {dangerStyle && qf.danger_level && (
                <span className={classNames(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-sm',
                  dangerStyle.bg, dangerStyle.text
                )}>
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {qf.danger_level.split(' ')[0]}
                </span>
              )}
              {qf.classification && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-900/70 text-gray-300 backdrop-blur-sm">
                  <Tag className="w-2.5 h-2.5" />
                  {qf.classification.length > 20 ? qf.classification.substring(0, 18) + '...' : qf.classification}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors leading-tight">
              {phenomenon.name}
            </h3>
            <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
          </div>

          {phenomenon.ai_summary && (
            <p className="text-sm text-gray-400 line-clamp-2 mb-3 leading-relaxed">
              {phenomenon.ai_summary}
            </p>
          )}

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={classNames(
                'px-2 py-1 rounded-full',
                config?.bgColor || 'bg-gray-800',
                config?.color || 'text-gray-400'
              )}>
                {config?.label}
              </span>
              {qf?.origin && (
                <span className="hidden sm:inline-flex items-center gap-1 text-gray-500">
                  <MapPin className="w-3 h-3" />
                  {qf.origin.length > 15 ? qf.origin.substring(0, 13) + '...' : qf.origin}
                </span>
              )}
            </div>
            <span className="text-gray-500">
              {phenomenon.report_count} report{phenomenon.report_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function PhenomenonListItem({ phenomenon }: { phenomenon: Phenomenon }) {
  const config = CATEGORY_CONFIG[phenomenon.category as keyof typeof CATEGORY_CONFIG]

  return (
    <Link href={`/phenomena/${phenomenon.slug}`}>
      <div className="group flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-purple-500/50 transition-all">
        {/* Icon */}
        <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-gray-800 rounded-lg shrink-0">
          <span className="text-xl sm:text-2xl">{phenomenon.icon || config?.icon}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium group-hover:text-purple-400 transition-colors text-sm sm:text-base">
            {phenomenon.name}
          </h3>
          {phenomenon.ai_summary && (
            <p className="text-xs sm:text-sm text-gray-400 truncate">
              {phenomenon.ai_summary}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 shrink-0">
          <span className="hidden sm:inline">{phenomenon.report_count} reports</span>
          <span className="sm:hidden">{phenomenon.report_count}</span>
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:text-purple-400 transition-colors" />
        </div>
      </div>
    </Link>
  )
}
