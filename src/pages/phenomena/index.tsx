'use client'

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { Search, Grid3X3, List, ChevronRight } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

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
}

type ViewMode = 'grid' | 'list'

const CATEGORY_ORDER = [
  'cryptids',
  'ufos_aliens',
  'ghosts_hauntings',
  'psychic_phenomena',
  'consciousness_practices',
  'psychological_experiences',
  'biological_factors',
]

export default function PhenomenaPage() {
  const [phenomena, setPhenomena] = useState<Phenomenon[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

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

  // Filter and group phenomena
  const filteredPhenomena = phenomena.filter(p => {
    const matchesSearch = searchQuery === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.aliases?.some(a => a.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.ai_summary?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  // Group by category
  const groupedPhenomena = CATEGORY_ORDER.reduce((acc, cat) => {
    const items = filteredPhenomena.filter(p => p.category === cat)
    if (items.length > 0) {
      acc[cat] = items
    }
    return acc
  }, {} as Record<string, Phenomenon[]>)

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
              to UFO classifications and haunting types. Each entry includes AI-generated descriptions,
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
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex gap-2 sm:gap-4 items-center w-full sm:w-auto">
                {/* Category Filter */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="flex-1 sm:flex-initial px-3 sm:px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">All Categories</option>
                  {CATEGORY_ORDER.map(cat => (
                    <option key={cat} value={cat}>
                      {CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG]?.icon} {CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG]?.label}
                    </option>
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
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            </div>
          ) : filteredPhenomena.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-400 text-lg">No phenomena found matching your search.</p>
            </div>
          ) : selectedCategory === 'all' ? (
            // Grouped view when showing all categories
            <div className="space-y-12">
              {Object.entries(groupedPhenomena).map(([category, items]) => {
                const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]
                return (
                  <section key={category}>
                    <div className="flex items-center gap-3 mb-6">
                      <span className="text-3xl">{config?.icon}</span>
                      <h2 className="text-2xl font-bold text-white">{config?.label}</h2>
                      <span className="text-gray-500 text-sm">({items.length})</span>
                    </div>
                    {viewMode === 'grid' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {items.map(phenomenon => (
                          <PhenomenonCard key={phenomenon.id} phenomenon={phenomenon} />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {items.map(phenomenon => (
                          <PhenomenonListItem key={phenomenon.id} phenomenon={phenomenon} />
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          ) : (
            // Flat view when category is selected
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredPhenomena.map(phenomenon => (
                  <PhenomenonCard key={phenomenon.id} phenomenon={phenomenon} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPhenomena.map(phenomenon => (
                  <PhenomenonListItem key={phenomenon.id} phenomenon={phenomenon} />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </>
  )
}

function PhenomenonCard({ phenomenon }: { phenomenon: Phenomenon }) {
  const config = CATEGORY_CONFIG[phenomenon.category as keyof typeof CATEGORY_CONFIG]

  return (
    <Link href={`/phenomena/${phenomenon.slug}`}>
      <div className="group bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-purple-500/50 transition-all hover:shadow-lg hover:shadow-purple-500/10">
        {/* Image or Icon */}
        <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
          {phenomenon.primary_image_url ? (
            <img
              src={phenomenon.primary_image_url}
              alt={phenomenon.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
          ) : (
            <span className="text-6xl opacity-50 group-hover:opacity-70 transition-opacity">
              {phenomenon.icon || config?.icon}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
              {phenomenon.name}
            </h3>
            <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-purple-400 transition-colors flex-shrink-0" />
          </div>

          {phenomenon.ai_summary && (
            <p className="text-sm text-gray-400 line-clamp-2 mb-3">
              {phenomenon.ai_summary}
            </p>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className={classNames(
              'px-2 py-1 rounded-full',
              config?.bgClass || 'bg-gray-800',
              config?.textClass || 'text-gray-400'
            )}>
              {config?.label}
            </span>
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
