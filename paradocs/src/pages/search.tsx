'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { Search, X, Sparkles, Filter, Loader2, Wand2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import ReportCard from '@/components/ReportCard'

interface ParsedFilters {
  categories?: string[]
  locations?: string[]
  start_date?: string
  end_date?: string
  has_media?: boolean
  keywords?: string[]
}

export default function SearchPage() {
  const router = useRouter()
  const { q, mode } = router.query

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [parsedFilters, setParsedFilters] = useState<ParsedFilters | null>(null)
  const [aiExplanation, setAiExplanation] = useState('')

  useEffect(() => {
    if (mode === 'ai') {
      setAiMode(true)
    }
    if (q && typeof q === 'string') {
      setQuery(q)
      if (mode === 'ai') {
        performAISearch(q)
      } else {
        performSearch(q)
      }
    }
  }, [q, mode])

  async function performSearch(searchQuery: string) {
    if (!searchQuery.trim()) return

    setLoading(true)
    setSearched(true)
    setParsedFilters(null)
    setAiExplanation('')
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*, phenomenon_type:phenomenon_types(*)')
        .eq('status', 'approved')
        .textSearch('search_vector', searchQuery)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setResults(data || [])
    } catch (error) {
      console.error('Error searching:', error)
    } finally {
      setLoading(false)
    }
  }

  async function performAISearch(searchQuery: string) {
    if (!searchQuery.trim()) return

    setLoading(true)
    setSearched(true)
    try {
      const response = await fetch('/api/search/natural', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      })

      if (response.ok) {
        const data = await response.json()
        setResults(data.results || [])
        setParsedFilters(data.parsed_filters || null)
        setAiExplanation(data.explanation || '')
      } else {
        // Fallback to regular search
        await performSearch(searchQuery)
      }
    } catch (error) {
      console.error('Error with AI search:', error)
      await performSearch(searchQuery)
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      const modeParam = aiMode ? '&mode=ai' : ''
      router.push(`/search?q=${encodeURIComponent(query)}${modeParam}`, undefined, { shallow: true })
      if (aiMode) {
        performAISearch(query)
      } else {
        performSearch(query)
      }
    }
  }

  function clearSearch() {
    setQuery('')
    setResults([])
    setSearched(false)
    setParsedFilters(null)
    setAiExplanation('')
    router.push('/search', undefined, { shallow: true })
  }

  function toggleAiMode() {
    setAiMode(!aiMode)
    if (query && searched) {
      const modeParam = !aiMode ? '&mode=ai' : ''
      router.push(`/search?q=${encodeURIComponent(query)}${modeParam}`, undefined, { shallow: true })
      if (!aiMode) {
        performAISearch(query)
      } else {
        performSearch(query)
      }
    }
  }

  const exampleQueries = aiMode
    ? [
        'UFO sightings near military bases in 2024',
        'Ghost encounters with cold spots and EMF readings',
        'Bigfoot sightings in Pacific Northwest with photos',
        'Strange lights seen by multiple witnesses'
      ]
    : ['UFO', 'Bigfoot', 'ghost', 'lights', 'creature']

  return (
    <>
      <Head>
        <title>{q ? `Search: ${q}` : 'Search'} - ParaDocs</title>
      </Head>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-display font-bold text-white">
            Search ParaDocs
          </h1>
          <button
            onClick={toggleAiMode}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              aiMode
                ? 'bg-gradient-to-r from-purple-600 to-primary-600 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {aiMode ? <Sparkles className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
            {aiMode ? 'AI Search Active' : 'Enable AI Search'}
          </button>
        </div>

        {/* AI Mode Banner */}
        {aiMode && (
          <div className="glass-card p-4 mb-6 border-purple-500/30">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-purple-400 mt-0.5" />
              <div>
                <p className="text-sm text-white font-medium">AI-Powered Natural Language Search</p>
                <p className="text-xs text-gray-400 mt-1">
                  Ask questions like "Find UFO sightings near Area 51 with photos from last year"
                  and our AI will understand and filter results automatically.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Search form */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="relative">
            {aiMode ? (
              <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
            ) : (
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={aiMode
                ? "Describe what you're looking for in plain English..."
                : "Search for phenomena, locations, or keywords..."
              }
              className={`w-full pl-12 pr-12 py-4 text-lg ${
                aiMode ? 'border-purple-500/50 focus:border-purple-500' : ''
              }`}
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
        </form>

        {/* AI Parsed Filters */}
        {aiMode && parsedFilters && Object.keys(parsedFilters).length > 0 && (
          <div className="glass-card p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-white">AI-Detected Filters</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {parsedFilters.categories?.map((cat) => {
                const config = CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG]
                return (
                  <span key={cat} className="px-2 py-1 rounded text-xs bg-primary-500/20 text-primary-400">
                    {config?.icon || '📋'} {config?.label || cat}
                  </span>
                )
              })}
              {parsedFilters.locations?.map((loc) => (
                <span key={loc} className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400">
                  📍 {loc}
                </span>
              ))}
              {parsedFilters.start_date && (
                <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">
                  📅 From: {parsedFilters.start_date}
                </span>
              )}
              {parsedFilters.end_date && (
                <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">
                  📅 To: {parsedFilters.end_date}
                </span>
              )}
              {parsedFilters.has_media && (
                <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-400">
                  📷 Has Media
                </span>
              )}
              {parsedFilters.keywords?.map((kw) => (
                <span key={kw} className="px-2 py-1 rounded text-xs bg-gray-500/20 text-gray-400">
                  🔍 {kw}
                </span>
              ))}
            </div>
            {aiExplanation && (
              <p className="text-xs text-gray-500 mt-3">{aiExplanation}</p>
            )}
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin mb-4" />
            <p className="text-gray-400">
              {aiMode ? 'AI is analyzing your query...' : 'Searching...'}
            </p>
          </div>
        ) : searched ? (
          results.length > 0 ? (
            <>
              <p className="text-gray-400 mb-6">
                Found {results.length} result{results.length !== 1 ? 's' : ''} for "{q}"
              </p>
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
                {aiMode
                  ? 'Try rephrasing your query or use simpler terms'
                  : 'Try different keywords'}{' '}
                or browse{' '}
                <a href="/explore" className="text-primary-400 hover:text-primary-300">
                  all reports
                </a>
              </p>
            </div>
          )
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-400 mb-2">
              {aiMode
                ? 'Describe what you want to find'
                : 'Enter a search term to find paranormal reports'
              }
            </p>
            <p className="text-sm text-gray-500 mb-6">
              {aiMode && 'Our AI will interpret your query and find matching reports'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {exampleQueries.map((term) => (
                <button
                  key={term}
                  onClick={() => {
                    setQuery(term)
                    const modeParam = aiMode ? '&mode=ai' : ''
                    router.push(`/search?q=${encodeURIComponent(term)}${modeParam}`, undefined, { shallow: true })
                    if (aiMode) {
                      performAISearch(term)
                    } else {
                      performSearch(term)
                    }
                  }}
                  className="px-4 py-2 rounded-full bg-white/5 text-gray-300 hover:bg-white/10 text-sm"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
