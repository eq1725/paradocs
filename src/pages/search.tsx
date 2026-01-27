'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType } from '@/lib/database.types'
import ReportCard from '@/components/ReportCard'

export default function SearchPage() {
  const router = useRouter()
  const { q } = router.query

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

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
    router.push('/search', undefined, { shallow: true })
  }

  return (
    <>
      <Head>
        <title>{q ? `Search: ${q}` : 'Search'} - ParaDocs</title>
      </Head>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-display font-bold text-white mb-8">
          Search ParaDocs
        </h1>

        {/* Search form */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for phenomena, locations, or keywords..."
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
        </form>

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
                Try different keywords or browse{' '}
                <a href="/explore" className="text-primary-400 hover:text-primary-300">
                  all reports
                </a>
              </p>
            </div>
          )
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-400">
              Enter a search term to find paranormal reports
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {['UFO', 'Bigfoot', 'ghost', 'lights', 'creature'].map((term) => (
                <button
                  key={term}
                  onClick={() => {
                    setQuery(term)
                    router.push(`/search?q=${term}`, undefined, { shallow: true })
                    performSearch(term)
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
