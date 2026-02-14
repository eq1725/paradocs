/**
 * Saved Reports Dashboard Page
 *
 * Shows reports the user has bookmarked/saved for later reference.
 */

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Bookmark,
  BookmarkMinus,
  Search,
  ExternalLink,
  Eye,
  Calendar,
  MapPin,
  AlertCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { UsageMeter } from '@/components/dashboard/UsageMeter'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { supabase } from '@/lib/supabase'

interface SavedReport {
  saved_id: string
  saved_at: string
  id: string
  title: string
  slug: string
  status: string
  category: string
  location_description: string
  event_date: string
  created_at: string
  view_count: number
  credibility: string
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

function SavedReportCard({
  report,
  onRemove
}: {
  report: SavedReport
  onRemove: (savedId: string) => void
}) {
  const [removing, setRemoving] = useState(false)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const handleRemove = async () => {
    setRemoving(true)
    await onRemove(report.saved_id)
    setRemoving(false)
  }

  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <Link
            href={`/report/${report.slug}`}
            className="text-lg font-semibold text-white hover:text-purple-400 transition-colors block truncate"
          >
            {report.title}
          </Link>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-gray-300 capitalize mt-2">
            {report.category?.replace(/_/g, ' ') || 'Uncategorized'}
          </span>
        </div>
        <button
          onClick={handleRemove}
          disabled={removing}
          className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          title="Remove from saved"
        >
          <BookmarkMinus className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-2 mb-4">
        {report.location_description && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <MapPin className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{report.location_description}</span>
          </div>
        )}
        {report.event_date && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Calendar className="w-4 h-4 flex-shrink-0" />
            <span>Event: {formatDate(report.event_date)}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Bookmark className="w-4 h-4 flex-shrink-0" />
          <span>Saved: {formatDate(report.saved_at)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-800">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Eye className="w-4 h-4" />
            {report.view_count || 0} views
          </span>
        </div>
        <Link
          href={`/report/${report.slug}`}
          className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition-colors"
        >
          View Report
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}

export default function SavedReportsPage() {
  const router = useRouter()
  const { canSaveReport, usage, limits } = useSubscription()
  const [reports, setReports] = useState<SavedReport[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const fetchSavedReports = useCallback(async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '12'
      })

      const response = await fetch(`/api/user/saved?${params}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch saved reports')
      }

      const data = await response.json()
      setReports(data.reports)
      setPagination(data.pagination)
    } catch (err) {
      console.error('Error fetching saved reports:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [router, currentPage])

  useEffect(() => {
    fetchSavedReports()
  }, [fetchSavedReports])

  const handleRemove = async (savedId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/user/saved', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ saved_id: savedId })
      })

      if (!response.ok) {
        throw new Error('Failed to remove saved report')
      }

      // Remove from local state
      setReports(prev => prev.filter(r => r.saved_id !== savedId))
      if (pagination) {
        setPagination({
          ...pagination,
          total: pagination.total - 1
        })
      }
    } catch (err) {
      console.error('Error removing saved report:', err)
      alert('Failed to remove saved report')
    }
  }

  // Filter reports client-side for search
  const filteredReports = searchQuery
    ? reports.filter(r =>
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.location_description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : reports

  return (
    <DashboardLayout title="Saved Reports">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
        <div>
          <p className="text-gray-400">
            Reports you've bookmarked for quick access
          </p>
        </div>

        {/* Usage info */}
        <div className="w-full lg:w-72">
          <UsageMeter
            label="Saved Reports"
            current={pagination?.total || 0}
            limit={limits?.saved_reports_max || 10}
            icon={<Bookmark className="w-4 h-4" />}
            size="sm"
          />
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <input
          type="text"
          placeholder="Search saved reports..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-64 bg-gray-900 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-gray-900 rounded-xl">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white font-medium mb-2">Error Loading Saved Reports</p>
          <p className="text-gray-400">{error}</p>
          <button
            onClick={fetchSavedReports}
            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-8 text-center bg-gray-900 rounded-xl">
          <Bookmark className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-white font-medium mb-2">
            {searchQuery ? 'No Matching Reports' : 'No Saved Reports'}
          </p>
          <p className="text-gray-400 mb-4">
            {searchQuery
              ? 'Try a different search term'
              : 'Save reports from the browse page to access them quickly here'}
          </p>
          {!searchQuery && (
            <Link
              href="/reports"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
            >
              Browse Reports
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredReports.map(report => (
              <SavedReportCard
                key={report.saved_id}
                report={report}
                onRemove={handleRemove}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && !searchQuery && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
                Previous
              </button>
              <span className="text-gray-400">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={!pagination.hasMore}
                className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  )
}
