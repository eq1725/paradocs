/**
 * Collection Detail Page
 *
 * View and manage reports within a collection
 */

import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import {
  ArrowLeft,
  Folder,
  Globe,
  Lock,
  Search,
  Filter,
  FileText,
  Calendar,
  MapPin,
  Trash2,
  Edit2,
  MoreVertical,
  Loader2,
  AlertCircle,
  ExternalLink,
  Tag,
  StickyNote
} from 'lucide-react'

interface CollectionReport {
  id: string
  user_notes: string | null
  tags: string[]
  added_at: string
  report: {
    id: string
    title: string
    slug: string
    summary: string
    category: string
    event_date: string | null
    location_name: string | null
    country: string | null
    credibility: string
    has_photo_video: boolean
  }
}

interface Collection {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string
  is_public: boolean
  report_count: number
  user_id: string
  created_at: string
  updated_at: string
  collection_reports: CollectionReport[]
}

export default function CollectionDetailPage() {
  const router = useRouter()
  const { id } = router.query

  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingNotes, setEditingNotes] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      fetchCollection()
    }
  }, [id])

  const fetchCollection = async () => {
    try {
      const res = await fetch(`/api/collections/${id}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch collection')
      }

      setCollection(data.collection)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collection')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveReport = async (reportId: string) => {
    if (!confirm('Remove this report from the collection?')) {
      return
    }

    try {
      const res = await fetch(`/api/collections/${id}/reports`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId })
      })

      if (!res.ok) {
        throw new Error('Failed to remove report')
      }

      setCollection(prev => prev ? {
        ...prev,
        report_count: prev.report_count - 1,
        collection_reports: prev.collection_reports.filter(
          cr => cr.report.id !== reportId
        )
      } : null)
    } catch (err) {
      alert('Failed to remove report')
    }
  }

  const handleUpdateNotes = async (reportId: string, notes: string) => {
    try {
      const res = await fetch(`/api/collections/${id}/reports`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          user_notes: notes
        })
      })

      if (!res.ok) {
        throw new Error('Failed to update notes')
      }

      setCollection(prev => prev ? {
        ...prev,
        collection_reports: prev.collection_reports.map(cr =>
          cr.report.id === reportId
            ? { ...cr, user_notes: notes }
            : cr
        )
      } : null)

      setEditingNotes(null)
    } catch (err) {
      alert('Failed to update notes')
    }
  }

  const filteredReports = collection?.collection_reports.filter(cr =>
    cr.report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cr.report.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cr.user_notes?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      ufo_uap: 'text-blue-400 bg-blue-400/10',
      cryptid: 'text-green-400 bg-green-400/10',
      ghost_haunting: 'text-purple-400 bg-purple-400/10',
      unexplained_event: 'text-orange-400 bg-orange-400/10',
      psychic_paranormal: 'text-pink-400 bg-pink-400/10',
      mystery_location: 'text-yellow-400 bg-yellow-400/10',
      other: 'text-gray-400 bg-gray-400/10'
    }
    return colors[category] || colors.other
  }

  const formatCategory = (category: string) => {
    return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !collection) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
            {error || 'Collection not found'}
          </h2>
          <Link
            href="/dashboard/collections"
            className="text-primary-400 hover:text-primary-300"
          >
            Back to collections
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <Head>
        <title>{collection.name} - ParaDocs Collections</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/dashboard/collections"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to collections
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: collection.color + '20' }}
              >
                <Folder className="w-7 h-7" style={{ color: collection.color }} />
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white">{collection.name}</h1>
                  {collection.is_public ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                      <Globe className="w-3 h-3" />
                      Public
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded-full">
                      <Lock className="w-3 h-3" />
                      Private
                    </span>
                  )}
                </div>

                {collection.description && (
                  <p className="text-gray-400 mt-1">{collection.description}</p>
                )}

                <p className="text-sm text-gray-500 mt-2">
                  {collection.report_count} reports
                </p>
              </div>
            </div>

            <Link
              href={`/dashboard/collections`}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Collection
            </Link>
          </div>
        </div>

        {/* Search */}
        {collection.collection_reports.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search reports in this collection..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}

        {/* Empty state */}
        {collection.collection_reports.length === 0 && (
          <div className="text-center py-12 bg-surface-800 rounded-lg border border-surface-600">
            <FileText className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              No reports in this collection
            </h3>
            <p className="text-gray-400 mb-6">
              Start adding reports from the Explore page or search results
            </p>
            <Link
              href="/explore"
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <Search className="w-5 h-5" />
              Browse Reports
            </Link>
          </div>
        )}

        {/* Reports list */}
        {filteredReports.length > 0 && (
          <div className="space-y-4">
            {filteredReports.map((cr) => (
              <div
                key={cr.id}
                className="bg-surface-800 rounded-lg border border-surface-600 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(cr.report.category)}`}>
                        {formatCategory(cr.report.category)}
                      </span>

                      {cr.report.has_photo_video && (
                        <span className="text-xs text-gray-400">📷 Has media</span>
                      )}
                    </div>

                    <Link
                      href={`/report/${cr.report.slug}`}
                      className="block group"
                    >
                      <h3 className="text-lg font-semibold text-white group-hover:text-primary-400 transition-colors">
                        {cr.report.title}
                      </h3>
                    </Link>

                    <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                      {cr.report.summary}
                    </p>

                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                      {cr.report.event_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(cr.report.event_date).toLocaleDateString()}
                        </span>
                      )}

                      {(cr.report.location_name || cr.report.country) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {cr.report.location_name || cr.report.country}
                        </span>
                      )}
                    </div>

                    {/* User notes */}
                    {editingNotes === cr.report.id ? (
                      <div className="mt-4">
                        <textarea
                          defaultValue={cr.user_notes || ''}
                          placeholder="Add your research notes..."
                          className="w-full px-3 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none text-sm"
                          rows={3}
                          id={`notes-${cr.report.id}`}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => {
                              const textarea = document.getElementById(`notes-${cr.report.id}`) as HTMLTextAreaElement
                              handleUpdateNotes(cr.report.id, textarea.value)
                            }}
                            className="btn btn-primary btn-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingNotes(null)}
                            className="btn btn-secondary btn-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : cr.user_notes ? (
                      <div
                        onClick={() => setEditingNotes(cr.report.id)}
                        className="mt-4 p-3 bg-surface-700/50 rounded-lg border border-surface-600 cursor-pointer hover:border-primary-500/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                          <StickyNote className="w-3 h-3" />
                          Your notes (click to edit)
                        </div>
                        <p className="text-sm text-gray-300">{cr.user_notes}</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingNotes(cr.report.id)}
                        className="mt-3 text-sm text-gray-400 hover:text-primary-400 flex items-center gap-1"
                      >
                        <StickyNote className="w-4 h-4" />
                        Add notes
                      </button>
                    )}

                    {/* Tags */}
                    {cr.tags && cr.tags.length > 0 && (
                      <div className="flex items-center gap-2 mt-3">
                        <Tag className="w-4 h-4 text-gray-400" />
                        {cr.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-surface-700 text-gray-300 text-xs rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/report/${cr.report.slug}`}
                      className="p-2 hover:bg-surface-700 rounded-lg text-gray-400 hover:text-white"
                      title="View report"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </Link>

                    <button
                      onClick={() => handleRemoveReport(cr.report.id)}
                      className="p-2 hover:bg-surface-700 rounded-lg text-gray-400 hover:text-red-400"
                      title="Remove from collection"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No search results */}
        {collection.collection_reports.length > 0 && filteredReports.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400">No reports match your search</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
