/**
 * My Reports Dashboard Page
 *
 * Shows all reports submitted by the current user with filtering and pagination.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useToast } from '@/components/Toast'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  FileText,
  Search,
  Filter,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Edit,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  SortAsc,
  SortDesc
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { supabase } from '@/lib/supabase'

interface Report {
  id: string
  title: string
  slug: string
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  category: string
  location_description: string
  event_date: string
  created_at: string
  updated_at: string
  view_count: number
  credibility_score: number
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

const statusConfig = {
  draft: { icon: AlertCircle, color: 'text-gray-400', bg: 'bg-gray-800', label: 'Draft' },
  pending: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-900/30', label: 'Pending' },
  approved: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/30', label: 'Approved' },
  rejected: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/30', label: 'Rejected' }
}

function ReportRow({ report, onDelete }: { report: Report; onDelete: (id: string) => void }) {
  const config = statusConfig[report.status] || statusConfig.draft
  const StatusIcon = config.icon

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-900/50 transition-colors">
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.bg}`}>
            <StatusIcon className={`w-4 h-4 ${config.color}`} />
          </div>
          <div className="min-w-0">
            <Link
              href={`/report/${report.slug}`}
              className="text-white font-medium hover:text-purple-400 transition-colors block truncate max-w-md"
            >
              {report.title}
            </Link>
            <p className="text-sm text-gray-500 truncate max-w-md">
              {report.location_description || 'No location'}
            </p>
          </div>
        </div>
      </td>
      <td className="py-4 px-4">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-gray-300 capitalize">
          {report.category?.replace(/_/g, ' ') || 'Uncategorized'}
        </span>
      </td>
      <td className="py-4 px-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
          <StatusIcon className="w-3 h-3" />
          {config.label}
        </span>
      </td>
      <td className="py-4 px-4 text-gray-400 text-sm">
        {formatDate(report.created_at)}
      </td>
      <td className="py-4 px-4">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Eye className="w-4 h-4" />
          {report.view_count || 0}
        </div>
      </td>
      <td className="py-4 px-4">
        <div className="flex items-center gap-2">
          <Link
            href={`/report/${report.slug}`}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="View Report"
          >
            <Eye className="w-4 h-4" />
          </Link>
          {report.status === 'draft' && (
            <Link
              href={`/report/${report.slug}/edit`}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title="Edit Report"
            >
              <Edit className="w-4 h-4" />
            </Link>
          )}
          {report.status === 'draft' && (
            <button
              onClick={() => onDelete(report.id)}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
              title="Delete Report"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function MyReportsPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const { canSubmitReport } = useSubscription()
  const [reports, setReports] = useState<Report[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        sort: sortField,
        order: sortOrder,
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(searchQuery && { search: searchQuery })
      })

      const response = await fetch(`/api/user/reports?${params}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch reports')
      }

      const data = await response.json()
      setReports(data.reports)
      setPagination(data.pagination)
    } catch (err) {
      console.error('Error fetching reports:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [router, currentPage, statusFilter, searchQuery, sortField, sortOrder])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const handleDelete = async (reportId: string) => {
    if (!confirm('Are you sure you want to delete this draft report?')) {
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { error } = await supabase
        .from('reports')
        .delete()
        .eq('id', reportId)
        .eq('submitted_by', session.user.id)
        .eq('status', 'draft')

      if (error) throw error

      showToast('success', 'Report deleted')
      // Refresh the list
      fetchReports()
    } catch (err) {
      console.error('Error deleting report:', err)
      showToast('error', 'Failed to delete report')
    }
  }

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
    setCurrentPage(1)
  }

  const SortIcon = sortOrder === 'asc' ? SortAsc : SortDesc

  return (
    <DashboardLayout title="My Reports">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-gray-400">
            Manage your submitted paranormal reports
          </p>
        </div>
        <Link
          href="/submit"
          className={`
            inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
            ${canSubmitReport
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }
          `}
          onClick={(e) => !canSubmitReport && e.preventDefault()}
        >
          <Plus className="w-5 h-5" />
          New Report
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Status Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-10 pr-8 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white appearance-none focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8">
            <div className="animate-pulse space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-16 bg-gray-800 rounded" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-white font-medium mb-2">Error Loading Reports</p>
            <p className="text-gray-400">{error}</p>
            <button
              onClick={fetchReports}
              className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-white font-medium mb-2">No Reports Found</p>
            <p className="text-gray-400 mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : "You haven't submitted any reports yet"}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Link
                href="/submit"
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5" />
                Submit Your First Report
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-950">
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">
                      <button
                        onClick={() => toggleSort('title')}
                        className="flex items-center gap-1 hover:text-white transition-colors"
                      >
                        Report
                        {sortField === 'title' && <SortIcon className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Category</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">
                      <button
                        onClick={() => toggleSort('status')}
                        className="flex items-center gap-1 hover:text-white transition-colors"
                      >
                        Status
                        {sortField === 'status' && <SortIcon className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">
                      <button
                        onClick={() => toggleSort('created_at')}
                        className="flex items-center gap-1 hover:text-white transition-colors"
                      >
                        Date
                        {sortField === 'created_at' && <SortIcon className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">
                      <button
                        onClick={() => toggleSort('view_count')}
                        className="flex items-center gap-1 hover:text-white transition-colors"
                      >
                        Views
                        {sortField === 'view_count' && <SortIcon className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(report => (
                    <ReportRow
                      key={report.id}
                      report={report}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-800">
                <p className="text-xs sm:text-sm text-gray-400 text-center sm:text-left">
                  Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-gray-400 text-sm">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={!pagination.hasMore}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
