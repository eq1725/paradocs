'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  BookOpen, Plus, Search, Filter, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import JournalEntryCard from '@/components/dashboard/JournalEntryCard'
import {
  JournalEntry,
  JournalEntryType,
  ENTRY_TYPE_CONFIG,
  listEntries,
} from '@/lib/services/journal.service'
import { classNames } from '@/lib/utils'

const ITEMS_PER_PAGE = 10

export default function JournalListPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<JournalEntryType | ''>('')
  const [searchInput, setSearchInput] = useState('')

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    const result = await listEntries({
      page,
      limit: ITEMS_PER_PAGE,
      entry_type: typeFilter || undefined,
      search: search || undefined,
    })
    setEntries(result.entries)
    setTotal(result.total)
    setLoading(false)
  }, [page, typeFilter, search])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const handleTypeFilter = (type: JournalEntryType | '') => {
    setTypeFilter(type)
    setPage(1)
  }

  return (
    <DashboardLayout title="Investigation Journal">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400 shrink-0" />
              <span>Investigation Journal</span>
            </h2>
            {/* Desktop button */}
            <Link
              href="/dashboard/journal/new"
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium text-sm transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Entry
            </Link>
          </div>
          <p className="text-gray-400 text-sm">
            {total > 0
              ? `${total} ${total === 1 ? 'entry' : 'entries'} in your research log`
              : 'Your personal research notebook'
            }
          </p>
          {/* Mobile: full-width button */}
          <Link
            href="/dashboard/journal/new"
            className="sm:hidden flex items-center justify-center gap-2 w-full mt-3 px-4 py-3 bg-primary-600 active:bg-primary-500 text-white rounded-xl font-medium text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Entry
          </Link>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search journal entries..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500/50"
            />
          </form>

          {/* Type filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            <button
              onClick={() => handleTypeFilter('')}
              className={classNames(
                'px-3 py-2.5 sm:py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
                !typeFilter
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
              )}
            >
              All
            </button>
            {(Object.entries(ENTRY_TYPE_CONFIG) as [JournalEntryType, typeof ENTRY_TYPE_CONFIG[JournalEntryType]][]).map(([type, config]) => (
              <button
                key={type}
                onClick={() => handleTypeFilter(type)}
                className={classNames(
                  'px-3 py-2.5 sm:py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
                  typeFilter === type
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                )}
              >
                {config.icon} {config.label}
              </button>
            ))}
          </div>
        </div>

        {/* Entries list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 bg-gray-900 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : entries.length > 0 ? (
          <>
            <div className="space-y-3">
              {entries.map(entry => (
                <JournalEntryCard key={entry.id} entry={entry} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-gray-500 text-sm">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-10 sm:py-16 px-4">
            <BookOpen className="w-12 h-12 sm:w-16 sm:h-16 text-gray-700 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-white text-base sm:text-lg font-semibold mb-2">
              {search || typeFilter ? 'No matching entries' : 'Start Your Research Journal'}
            </h3>
            <p className="text-gray-400 text-xs sm:text-sm max-w-sm mx-auto mb-5 sm:mb-6">
              {search || typeFilter
                ? 'Try adjusting your search or filters.'
                : 'Record observations, track hypotheses, and build a personal knowledge base that grows with your research.'
              }
            </p>
            {!search && !typeFilter && (
              <Link
                href="/dashboard/journal/new"
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-500 active:bg-primary-500 text-white rounded-xl sm:rounded-lg font-medium text-sm transition-colors"
              >
                <Plus className="w-5 h-5" />
                Create Your First Entry
              </Link>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
