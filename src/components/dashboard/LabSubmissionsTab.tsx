'use client'

/**
 * LabSubmissionsTab — User-submitted reports surface for the Lab.
 *
 * Shows all reports the logged-in user has submitted via /submit,
 * with status indicators (pending, approved, rejected), search,
 * and pagination. Uses /api/user/reports endpoint.
 */

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Clock, CheckCircle, XCircle, AlertTriangle, Search,
  ChevronLeft, ChevronRight, ExternalLink, PlusCircle, Send,
  Eye, FileText,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { PhenomenonCategory } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'

interface SubmittedReport {
  id: string
  title: string
  slug: string
  status: string
  category: PhenomenonCategory
  location_description: string | null
  event_date: string | null
  created_at: string
  updated_at: string
  view_count: number
  credibility: string | null
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

var STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string; bg: string }> = {
  pending: {
    label: 'Pending Review',
    icon: Clock,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10 border-amber-400/20',
  },
  pending_review: {
    label: 'In Review',
    icon: Eye,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10 border-blue-400/20',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle,
    color: 'text-green-400',
    bg: 'bg-green-400/10 border-green-400/20',
  },
  published: {
    label: 'Published',
    icon: CheckCircle,
    color: 'text-green-400',
    bg: 'bg-green-400/10 border-green-400/20',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-400/10 border-red-400/20',
  },
  flagged: {
    label: 'Flagged',
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-400/10 border-orange-400/20',
  },
}

export default function LabSubmissionsTab() {
  var [reports, setReports] = useState<SubmittedReport[]>([])
  var [loading, setLoading] = useState(true)
  var [pagination, setPagination] = useState<PaginationInfo | null>(null)
  var [page, setPage] = useState(1)
  var [statusFilter, setStatusFilter] = useState('all')
  var [searchInput, setSearchInput] = useState('')
  var [search, setSearch] = useState('')

  var fetchReports = useCallback(async function () {
    setLoading(true)
    try {
      var sessionResult = await supabase.auth.getSession()
      var token = sessionResult.data.session?.access_token
      if (!token) {
        setLoading(false)
        return
      }

      var params = new URLSearchParams({
        page: String(page),
        limit: '10',
        sort: 'created_at',
        order: 'desc',
      })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)

      var res = await fetch('/api/user/reports?' + params.toString(), {
        headers: { Authorization: 'Bearer ' + token },
      })

      if (res.ok) {
        var data = await res.json()
        setReports(data.reports || [])
        setPagination(data.pagination || null)
      }
    } catch (err) {
      console.error('Error fetching submissions:', err)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, search])

  useEffect(function () {
    fetchReports()
  }, [fetchReports])

  var handleSearch = function (e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  var handleStatusChange = function (status: string) {
    setStatusFilter(status)
    setPage(1)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div>
      {/* Filters row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search your submissions..."
              value={searchInput}
              onChange={function (e) { setSearchInput(e.target.value) }}
              className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-600 transition-colors"
            />
          </div>
        </form>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {['all', 'pending', 'approved', 'rejected'].map(function (s) {
            var isActive = statusFilter === s
            return (
              <button
                key={s}
                onClick={function () { handleStatusChange(s) }}
                className={classNames(
                  'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border',
                  isActive
                    ? 'bg-primary-600/20 border-primary-600/40 text-primary-400'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-300 hover:border-gray-700'
                )}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            )
          })}
        </div>

        {/* Submit new */}
        <Link
          href="/submit"
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 transition-colors whitespace-nowrap"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="hidden sm:inline">New Report</span>
        </Link>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <EmptyState hasFilters={statusFilter !== 'all' || search !== ''} />
      ) : (
        <>
          {/* Report cards */}
          <div className="space-y-3">
            {reports.map(function (report) {
              var statusConf = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending
              var StatusIcon = statusConf.icon
              var catConfig = CATEGORY_CONFIG[report.category]
              var isPublished = report.status === 'approved' || report.status === 'published'

              return (
                <div
                  key={report.id}
                  className="p-4 bg-gray-900/80 border border-gray-800 rounded-xl hover:border-gray-700 transition-all"
                >
                  <div className="flex items-start gap-3">
                    {/* Category icon */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: (catConfig?.color || '#6366f1') + '20' }}
                    >
                      <CategoryIcon category={report.category} size={20} />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-white line-clamp-1">
                            {report.title}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">
                              Submitted {formatDate(report.created_at)}
                            </span>
                            {report.event_date && (
                              <>
                                <span className="text-xs text-gray-700">&middot;</span>
                                <span className="text-xs text-gray-500">
                                  Event: {formatDate(report.event_date)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Status badge */}
                        <div
                          className={classNames(
                            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0',
                            statusConf.bg,
                            statusConf.color
                          )}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {statusConf.label}
                        </div>
                      </div>

                      {/* Category label + view link */}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-500">
                          {catConfig?.label || report.category}
                        </span>
                        {report.view_count > 0 && (
                          <>
                            <span className="text-xs text-gray-700">&middot;</span>
                            <span className="text-xs text-gray-500">
                              {report.view_count} view{report.view_count !== 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                        {isPublished && report.slug && (
                          <Link
                            href={'/report/' + report.slug}
                            className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 ml-auto"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View published
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <span className="text-xs text-gray-500">
                {pagination.total} submission{pagination.total !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={function () { setPage(Math.max(1, page - 1)) }}
                  disabled={page <= 1}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-400">
                  {page} / {pagination.totalPages}
                </span>
                <button
                  onClick={function () { setPage(Math.min(pagination!.totalPages, page + 1)) }}
                  disabled={!pagination.hasMore}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <div className="text-center py-16">
        <Search className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No matching submissions</h3>
        <p className="text-sm text-gray-400">Try adjusting your search or filter criteria.</p>
      </div>
    )
  }

  return (
    <div className="text-center py-16">
      <Send className="w-12 h-12 text-gray-600 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-white mb-2">No submissions yet</h3>
      <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">
        Share your paranormal experience with the community. Once submitted,
        you can track its review status right here.
      </p>
      <Link
        href="/submit"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 transition-colors"
      >
        <PlusCircle className="w-4 h-4" />
        Submit your first report
      </Link>
    </div>
  )
}
