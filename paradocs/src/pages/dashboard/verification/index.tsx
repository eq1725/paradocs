/**
 * Expert Verification Workflow Dashboard
 *
 * Allows moderators to review and process verification requests
 */

import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
// Layout wrapper is provided by _app.tsx
import { supabase } from '@/lib/supabase'
import {
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  User,
  Calendar,
  ExternalLink,
  ChevronRight,
  Loader2,
  Filter,
  MessageSquare,
  Eye,
  Camera,
  MapPin,
  Microscope
} from 'lucide-react'

interface VerificationRequest {
  id: string
  report_id: string
  requester_id: string
  request_type: string
  evidence_description: string
  supporting_links: string[]
  status: string
  reviewer_notes: string | null
  reviewed_at: string | null
  created_at: string
  report: {
    id: string
    title: string
    slug: string
    category: string
    credibility: string
  }
  requester: {
    id: string
    username: string
    display_name: string | null
  }
  reviewer: {
    id: string
    username: string
    display_name: string | null
  } | null
}

const REQUEST_TYPE_INFO: Record<string, { icon: any; label: string; color: string }> = {
  evidence_verification: { icon: Eye, label: 'Evidence Verification', color: 'blue' },
  witness_interview: { icon: User, label: 'Witness Interview', color: 'green' },
  location_survey: { icon: MapPin, label: 'Location Survey', color: 'amber' },
  expert_analysis: { icon: Microscope, label: 'Expert Analysis', color: 'purple' },
  media_authentication: { icon: Camera, label: 'Media Authentication', color: 'pink' },
}

const STATUS_INFO: Record<string, { icon: any; label: string; color: string }> = {
  pending: { icon: Clock, label: 'Pending Review', color: 'amber' },
  in_review: { icon: Eye, label: 'In Review', color: 'blue' },
  needs_more_info: { icon: AlertTriangle, label: 'Needs More Info', color: 'orange' },
  approved: { icon: CheckCircle, label: 'Approved', color: 'green' },
  rejected: { icon: XCircle, label: 'Rejected', color: 'red' },
}

export default function VerificationDashboard() {
  const [requests, setRequests] = useState<VerificationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [newCredibility, setNewCredibility] = useState('high')
  const [submitting, setSubmitting] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    checkUserRole()
  }, [])

  useEffect(() => {
    if (userRole === 'moderator' || userRole === 'admin') {
      fetchRequests()
    }
  }, [statusFilter, userRole])

  async function checkUserRole() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      setUserRole(profile?.role || null)
      if (profile?.role !== 'moderator' && profile?.role !== 'admin') {
        setError('Access denied. Moderator privileges required.')
        setLoading(false)
      }
    } else {
      setError('Please sign in to access this page')
      setLoading(false)
    }
  }

  async function fetchRequests() {
    setLoading(true)
    try {
      const response = await fetch(`/api/verification?status=${statusFilter}`)
      if (response.ok) {
        const data = await response.json()
        setRequests(data.requests)
      } else {
        setError('Failed to load verification requests')
      }
    } catch (err) {
      setError('Failed to load verification requests')
    } finally {
      setLoading(false)
    }
  }

  async function handleReview(status: string) {
    if (!selectedRequest) return

    setSubmitting(true)
    try {
      const response = await fetch(`/api/verification/${selectedRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          reviewer_notes: reviewNotes,
          new_credibility: status === 'approved' ? newCredibility : undefined,
        }),
      })

      if (response.ok) {
        setSelectedRequest(null)
        setReviewNotes('')
        fetchRequests()
      } else {
        alert('Failed to update request')
      }
    } catch (err) {
      alert('Failed to update request')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (error && !requests.length) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Access Restricted</h1>
            <p className="text-gray-400">{error}</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>Verification Dashboard | ParaDocs</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-purple-400" />
              Expert Verification
            </h1>
            <p className="text-gray-400 mt-1">Review and process verification requests</p>
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {Object.entries(STATUS_INFO).map(([status, info]) => {
            const Icon = info.icon
            const isActive = statusFilter === status
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/50'
                    : 'bg-surface-800 text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {info.label}
              </button>
            )
          })}
        </div>

        {/* Requests List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Filter className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Requests Found</h3>
            <p className="text-gray-400">No verification requests with status "{STATUS_INFO[statusFilter]?.label}"</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {requests.map((request) => {
              const typeInfo = REQUEST_TYPE_INFO[request.request_type]
              const statusInfo = STATUS_INFO[request.status]
              const TypeIcon = typeInfo?.icon || FileText
              const StatusIcon = statusInfo?.icon || Clock

              return (
                <div
                  key={request.id}
                  className="glass-card p-6 hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => setSelectedRequest(request)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="p-2 rounded-lg bg-purple-500/20">
                          <TypeIcon className="w-5 h-5 text-purple-400" />
                        </span>
                        <div>
                          <h3 className="font-semibold text-white">{typeInfo?.label || request.request_type}</h3>
                          <p className="text-sm text-gray-400">Request #{request.id.slice(0, 8)}</p>
                        </div>
                      </div>

                      <Link
                        href={`/report/${request.report?.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 mb-3"
                      >
                        <FileText className="w-4 h-4" />
                        {request.report?.title}
                        <ExternalLink className="w-3 h-3" />
                      </Link>

                      {request.evidence_description && (
                        <p className="text-sm text-gray-400 line-clamp-2 mb-3">
                          {request.evidence_description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {request.requester?.display_name || request.requester?.username}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(request.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400">
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo?.label}
                      </span>
                      <ChevronRight className="w-5 h-5 text-gray-500" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Review Modal */}
        {selectedRequest && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">Review Verification Request</h2>
                  <button
                    onClick={() => setSelectedRequest(null)}
                    className="text-gray-400 hover:text-white"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Request Details */}
                  <div className="bg-white/5 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Request Type</h3>
                    <p className="text-white">{REQUEST_TYPE_INFO[selectedRequest.request_type]?.label}</p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Report</h3>
                    <Link
                      href={`/report/${selectedRequest.report?.slug}`}
                      target="_blank"
                      className="text-primary-400 hover:text-primary-300 flex items-center gap-2"
                    >
                      {selectedRequest.report?.title}
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                    <p className="text-sm text-gray-400 mt-1">
                      Current credibility: <span className="text-white capitalize">{selectedRequest.report?.credibility}</span>
                    </p>
                  </div>

                  {selectedRequest.evidence_description && (
                    <div className="bg-white/5 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-gray-400 mb-2">Evidence Description</h3>
                      <p className="text-white">{selectedRequest.evidence_description}</p>
                    </div>
                  )}

                  {selectedRequest.supporting_links?.length > 0 && (
                    <div className="bg-white/5 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-gray-400 mb-2">Supporting Links</h3>
                      <ul className="space-y-1">
                        {selectedRequest.supporting_links.map((link, i) => (
                          <li key={i}>
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1"
                            >
                              {link}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Review Form */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Reviewer Notes
                    </label>
                    <textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Add notes about your review..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      New Credibility (if approved)
                    </label>
                    <select
                      value={newCredibility}
                      onChange={(e) => setNewCredibility(e.target.value)}
                      className="w-full px-4 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white"
                    >
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="confirmed">Confirmed (Expert Verified)</option>
                    </select>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleReview('approved')}
                      disabled={submitting}
                      className="flex-1 btn bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve
                    </button>
                    <button
                      onClick={() => handleReview('needs_more_info')}
                      disabled={submitting}
                      className="flex-1 btn bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                      Need Info
                    </button>
                    <button
                      onClick={() => handleReview('rejected')}
                      disabled={submitting}
                      className="flex-1 btn bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
