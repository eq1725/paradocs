'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Check, X, ChevronLeft, ChevronRight, ExternalLink, Eye, Filter, ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { classNames } from '@/lib/utils'
import type { User } from '@supabase/supabase-js'

interface ReviewReport {
  id: string
  title: string
  slug: string
  description: string
  summary: string | null
  category: string
  location_name: string | null
  event_date: string | null
  source_type: string
  source_url: string | null
  source_label: string | null
  original_report_id: string | null
  status: string
  credibility: string | null
  paradocs_assessment: any
  paradocs_narrative: string | null
  created_at: string
  tags: string[]
}

interface ReviewStats {
  pending: number
  pending_review: number
  approved: number
  rejected: number
  flagged: number
  by_source: Record<string, number>
}

var SOURCE_LABELS: Record<string, string> = {
  nuforc: 'NUFORC',
  bfro: 'BFRO',
  reddit: 'Reddit',
  'reddit-v2': 'Reddit v2',
  wikipedia: 'Wikipedia',
  youtube: 'YouTube',
  news: 'News',
  erowid: 'Erowid',
  nderf: 'NDERF',
  iands: 'IANDS',
  shadowlands: 'Shadowlands',
  ghostsofamerica: 'Ghosts of America',
  curated: 'Curated',
  user_submission: 'User Submission',
}

var CATEGORY_LABELS: Record<string, string> = {
  ufos_aliens: 'UFOs & Aliens',
  cryptids: 'Cryptids',
  ghosts_hauntings: 'Ghosts & Hauntings',
  psychic_phenomena: 'Psychic Phenomena',
  consciousness_practices: 'Consciousness',
  psychological_experiences: 'Psychological',
  biological_factors: 'Biological',
  perception_sensory: 'Perception',
  religion_mythology: 'Religion & Mythology',
  esoteric_practices: 'Esoteric',
  combination: 'Multi-Disciplinary'
}

// Source-specific quality thresholds (mirrors quality-filter.ts)
var THRESHOLDS: Record<string, { approve: number; review: number }> = {
  nuforc: { approve: 60, review: 40 },
  bfro: { approve: 60, review: 40 },
  mufon: { approve: 60, review: 40 },
  reddit: { approve: 70, review: 45 },
  'reddit-v2': { approve: 70, review: 45 },
  news: { approve: 65, review: 45 },
  erowid: { approve: 70, review: 50 },
  nderf: { approve: 55, review: 35 },
  iands: { approve: 55, review: 35 },
  wikipedia: { approve: 50, review: 30 },
  shadowlands: { approve: 50, review: 30 },
  ghostsofamerica: { approve: 50, review: 30 },
  government: { approve: 50, review: 30 }
}

function getThresholds(sourceType: string) {
  return THRESHOLDS[sourceType] || { approve: 70, review: 40 }
}

export default function ReportReview() {
  var router = useRouter()
  var _user = useState<User | null>(null)
  var user = _user[0]
  var setUser = _user[1]
  var _authLoading = useState(true)
  var authLoading = _authLoading[0]
  var setAuthLoading = _authLoading[1]
  var _isAdmin = useState(false)
  var isAdmin = _isAdmin[0]
  var setIsAdmin = _isAdmin[1]
  var _reports = useState<ReviewReport[]>([])
  var reports = _reports[0]
  var setReports = _reports[1]
  var _stats = useState<ReviewStats | null>(null)
  var stats = _stats[0]
  var setStats = _stats[1]
  var _loading = useState(true)
  var loading = _loading[0]
  var setLoading = _loading[1]
  var _page = useState(1)
  var page = _page[0]
  var setPage = _page[1]
  var _total = useState(0)
  var total = _total[0]
  var setTotal = _total[1]
  var _statusFilter = useState('pending')
  var statusFilter = _statusFilter[0]
  var setStatusFilter = _statusFilter[1]
  var _sourceFilter = useState('')
  var sourceFilter = _sourceFilter[0]
  var setSourceFilter = _sourceFilter[1]
  var _selected = useState<Set<string>>(new Set())
  var selected = _selected[0]
  var setSelected = _selected[1]
  var _expanded = useState<string | null>(null)
  var expanded = _expanded[0]
  var setExpanded = _expanded[1]
  var _actionLoading = useState(false)
  var actionLoading = _actionLoading[0]
  var setActionLoading = _actionLoading[1]
  var _message = useState<{ type: string; text: string } | null>(null)
  var message = _message[0]
  var setMessage = _message[1]
  var LIMIT = 20

  // Auth
  useEffect(function() {
    async function getUser() {
      var result = await supabase.auth.getSession()
      setUser(result.data.session?.user ?? null)
      setAuthLoading(false)
    }
    getUser()
    var sub = supabase.auth.onAuthStateChange(function(_event, session) {
      setUser(session?.user ?? null)
    })
    return function() { sub.data.subscription.unsubscribe() }
  }, [])

  useEffect(function() {
    async function checkAdmin() {
      if (!user) {
        if (!authLoading) router.push('/login?redirect=/admin/report-review')
        return
      }
      if (user.email !== 'williamschaseh@gmail.com') {
        router.push('/')
        return
      }
      var profileResult = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profileResult.data?.role !== 'admin') {
        router.push('/')
        return
      }
      setIsAdmin(true)
    }
    checkAdmin()
  }, [user, authLoading, router])

  // Load data
  useEffect(function() {
    if (isAdmin) loadReports()
  }, [isAdmin, page, statusFilter, sourceFilter])

  async function loadReports() {
    setLoading(true)
    try {
      var session = await supabase.auth.getSession()
      var token = session.data.session?.access_token || ''
      var url = '/api/admin/report-review?status=' + statusFilter + '&page=' + page + '&limit=' + LIMIT
      if (sourceFilter) url = url + '&source=' + sourceFilter
      var response = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      var data = await response.json()
      setReports(data.reports || [])
      setTotal(data.total || 0)
      setStats(data.stats || null)
    } catch (err) {
      console.error('Failed to load reports:', err)
    }
    setLoading(false)
  }

  async function handleAction(action: string, ids: string[]) {
    if (ids.length === 0) return
    setActionLoading(true)
    try {
      var session = await supabase.auth.getSession()
      var token = session.data.session?.access_token || ''
      var response = await fetch('/api/admin/report-review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ action: action, reportIds: ids })
      })
      var data = await response.json()
      if (data.success) {
        setMessage({ type: 'success', text: data.count + ' report(s) ' + action + 'd successfully' })
        setSelected(new Set())
        loadReports()
      } else {
        setMessage({ type: 'error', text: data.error || 'Action failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' })
    }
    setActionLoading(false)
    setTimeout(function() { setMessage(null) }, 4000)
  }

  function toggleSelect(id: string) {
    var next = new Set(selected)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelected(next)
  }

  function toggleSelectAll() {
    if (selected.size === reports.length) {
      setSelected(new Set())
    } else {
      var all = new Set<string>()
      for (var i = 0; i < reports.length; i++) {
        all.add(reports[i].id)
      }
      setSelected(all)
    }
  }

  function getReviewReason(report: ReviewReport): string {
    var assessment = report.paradocs_assessment
    if (!assessment) return 'Quality score below auto-approve threshold for ' + (SOURCE_LABELS[report.source_type] || report.source_type)

    var credScore = typeof assessment === 'string' ? null : assessment.credibility_score
    var thresholds = getThresholds(report.source_type)

    var reasons: string[] = []

    if (credScore !== null && credScore !== undefined) {
      reasons.push('Credibility score: ' + credScore + '/100 (needs ' + thresholds.approve + '+ for auto-approve)')
    }

    if (assessment.credibility_reasoning) {
      reasons.push(assessment.credibility_reasoning)
    }

    if (assessment.credibility_factors) {
      var negFactors = assessment.credibility_factors.filter(function(f: any) {
        return f.impact === 'negative' || f.impact === 'strongly_negative'
      })
      if (negFactors.length > 0) {
        var factorNames = negFactors.map(function(f: any) { return f.name }).join(', ')
        reasons.push('Negative factors: ' + factorNames)
      }
    }

    if (reasons.length === 0) {
      return 'Score between review (' + thresholds.review + ') and approve (' + thresholds.approve + ') thresholds'
    }

    return reasons.join(' — ')
  }

  function formatDate(dateStr: string) {
    var d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // --- Render ---
  if (authLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  var totalPages = Math.ceil(total / LIMIT)

  return (
    <>
      <Head>
        <title>Report Review - Paradocs Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-950 text-white">
        {/* Header */}
        <div className="border-b border-gray-800 bg-gray-900/50">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/admin" className="text-gray-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                  <h1 className="text-xl font-semibold">Report Review</h1>
                  <p className="text-sm text-gray-400">Review, approve, or reject reports</p>
                </div>
              </div>
              {stats && (
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-yellow-400" />
                    <span className="text-yellow-400 font-medium">{(stats.pending || 0) + (stats.pending_review || 0)}</span>
                    <span className="text-gray-500">pending</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 font-medium">{stats.approved}</span>
                    <span className="text-gray-500">approved</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 font-medium">{stats.rejected}</span>
                    <span className="text-gray-500">rejected</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Message */}
          {message && (
            <div className={classNames(
              'mb-4 px-4 py-3 rounded-lg text-sm',
              message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            )}>
              {message.text}
            </div>
          )}

          {/* Filters & Actions Bar */}
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {/* Status filter */}
              <div className="flex rounded-lg overflow-hidden border border-gray-700">
                {(['pending', 'approved', 'rejected'] as const).map(function(s) {
                  return (
                    <button
                      key={s}
                      onClick={function() { setStatusFilter(s); setPage(1); setSelected(new Set()) }}
                      className={classNames(
                        'px-3 py-1.5 text-xs font-medium transition-colors',
                        statusFilter === s ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                      )}
                    >
                      {s === 'pending' ? 'Pending' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  )
                })}
              </div>

              {/* Source filter */}
              <select
                value={sourceFilter}
                onChange={function(e) { setSourceFilter(e.target.value); setPage(1) }}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
              >
                <option value="">All sources</option>
                {stats && Object.keys(stats.by_source).sort().map(function(src) {
                  return (
                    <option key={src} value={src}>
                      {(SOURCE_LABELS[src] || src) + ' (' + stats.by_source[src] + ')'}
                    </option>
                  )
                })}
              </select>

              <span className="text-xs text-gray-500">{total} report{total !== 1 ? 's' : ''}</span>
            </div>

            {/* Bulk actions */}
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{selected.size} selected</span>
                <button
                  onClick={function() { handleAction('approve', Array.from(selected)) }}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  Approve ({selected.size})
                </button>
                <button
                  onClick={function() { handleAction('reject', Array.from(selected)) }}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  Reject ({selected.size})
                </button>
              </div>
            )}
          </div>

          {/* Reports List */}
          {loading ? (
            <div className="text-center py-20 text-gray-500">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-20">
              <CheckCircle className="w-12 h-12 text-green-500/30 mx-auto mb-3" />
              <p className="text-gray-400">No reports to review in this category</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Select all */}
              <div className="flex items-center gap-3 px-4 py-2 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={selected.size === reports.length && reports.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                />
                <span>Select all on this page</span>
              </div>

              {reports.map(function(report) {
                var isExpanded = expanded === report.id
                var assessment = report.paradocs_assessment
                if (typeof assessment === 'string') {
                  try { assessment = JSON.parse(assessment) } catch(e) { assessment = null }
                }
                var credScore = assessment ? assessment.credibility_score : null
                var thresholds = getThresholds(report.source_type)
                var reviewReason = getReviewReason(report)

                return (
                  <div key={report.id} className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden">
                    {/* Report Row */}
                    <div className="flex items-start gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(report.id)}
                        onChange={function() { toggleSelect(report.id) }}
                        className="mt-1 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                      />

                      <div className="flex-1 min-w-0 cursor-pointer" onClick={function() { setExpanded(isExpanded ? null : report.id) }}>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-white truncate">{report.title}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{SOURCE_LABELS[report.source_type] || report.source_type}</span>
                          <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{CATEGORY_LABELS[report.category] || report.category}</span>
                          {report.location_name && <span>{report.location_name}</span>}
                          {report.event_date && <span>{formatDate(report.event_date)}</span>}
                          {credScore !== null && (
                            <span className={classNames(
                              'px-1.5 py-0.5 rounded font-medium',
                              credScore >= thresholds.approve ? 'bg-green-500/10 text-green-400' :
                              credScore >= thresholds.review ? 'bg-yellow-500/10 text-yellow-400' :
                              'bg-red-500/10 text-red-400'
                            )}>
                              {'Score: ' + credScore + '/100'}
                            </span>
                          )}
                          <span className="text-gray-600">{'Ingested ' + formatDate(report.created_at)}</span>
                        </div>

                        {/* Review reason — always shown */}
                        <div className="mt-2 flex items-start gap-1.5 text-xs text-yellow-500/80">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{reviewReason}</span>
                        </div>
                      </div>

                      {/* Quick actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {report.source_url && (
                          <a
                            href={report.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
                            title="View original source"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <Link
                          href={'/report/' + report.slug}
                          target="_blank"
                          className="p-1.5 rounded hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
                          title="Preview on site"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={function() { handleAction('approve', [report.id]) }}
                          disabled={actionLoading}
                          className="p-1.5 rounded hover:bg-green-500/20 text-gray-500 hover:text-green-400 transition-colors disabled:opacity-50"
                          title="Approve"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={function() { handleAction('reject', [report.id]) }}
                          disabled={actionLoading}
                          className="p-1.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Reject"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-gray-800 px-4 py-4 bg-gray-900/80">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Left: Report content */}
                          <div>
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Description</h4>
                            <p className="text-sm text-gray-300 leading-relaxed mb-4 max-h-48 overflow-y-auto">
                              {report.description || 'No description'}
                            </p>
                            {report.summary && report.summary !== report.description && (
                              <>
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Summary</h4>
                                <p className="text-sm text-gray-400 mb-4">{report.summary}</p>
                              </>
                            )}
                            {report.paradocs_narrative && (
                              <>
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Paradocs Analysis</h4>
                                <p className="text-sm text-gray-300 leading-relaxed max-h-48 overflow-y-auto">{report.paradocs_narrative}</p>
                              </>
                            )}
                          </div>

                          {/* Right: Assessment details */}
                          <div>
                            {assessment && (
                              <>
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Credibility Assessment</h4>

                                {/* Score bar */}
                                {credScore !== null && (
                                  <div className="mb-4">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-sm text-gray-300">{'Score: ' + credScore + '/100'}</span>
                                      <span className="text-xs text-gray-500">{'Auto-approve at ' + thresholds.approve + '+'}</span>
                                    </div>
                                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                      <div
                                        className={classNames(
                                          'h-full rounded-full transition-all',
                                          credScore >= thresholds.approve ? 'bg-green-500' :
                                          credScore >= thresholds.review ? 'bg-yellow-500' :
                                          'bg-red-500'
                                        )}
                                        style={{ width: credScore + '%' }}
                                      />
                                    </div>
                                    <div className="flex justify-between mt-1 text-[10px] text-gray-600">
                                      <span>Reject &lt;{thresholds.review}</span>
                                      <span>Review {thresholds.review}-{thresholds.approve - 1}</span>
                                      <span>Approve {thresholds.approve}+</span>
                                    </div>
                                  </div>
                                )}

                                {assessment.credibility_reasoning && (
                                  <p className="text-sm text-gray-400 mb-3">{assessment.credibility_reasoning}</p>
                                )}

                                {/* Credibility factors */}
                                {assessment.credibility_factors && assessment.credibility_factors.length > 0 && (
                                  <div className="space-y-1.5 mb-4">
                                    <h5 className="text-xs font-medium text-gray-500 mb-1">Factors</h5>
                                    {assessment.credibility_factors.map(function(f: any, idx: number) {
                                      var isPositive = f.impact === 'positive' || f.impact === 'strongly_positive'
                                      return (
                                        <div key={idx} className="flex items-start gap-2 text-xs">
                                          <span className={isPositive ? 'text-green-400 mt-0.5' : 'text-red-400 mt-0.5'}>
                                            {isPositive ? '●' : '●'}
                                          </span>
                                          <div>
                                            <span className="font-medium text-gray-300">{f.name}: </span>
                                            <span className="text-gray-500">{f.description}</span>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}

                                {/* Mundane explanations */}
                                {assessment.mundane_explanations && assessment.mundane_explanations.length > 0 && (
                                  <div className="mb-4">
                                    <h5 className="text-xs font-medium text-gray-500 mb-1">Alternative Explanations</h5>
                                    {assessment.mundane_explanations.map(function(m: any, idx: number) {
                                      return (
                                        <div key={idx} className="text-xs text-gray-400 mb-1">
                                          <span className={classNames(
                                            'px-1 py-0.5 rounded mr-1.5 text-[10px]',
                                            m.likelihood === 'high' ? 'bg-red-500/10 text-red-400' :
                                            m.likelihood === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                                            'bg-gray-800 text-gray-500'
                                          )}>
                                            {m.likelihood}
                                          </span>
                                          {m.explanation}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </>
                            )}

                            {/* Metadata */}
                            <div className="border-t border-gray-800 pt-3 mt-3 space-y-1 text-xs text-gray-500">
                              <div><span className="text-gray-600">Source:</span> {SOURCE_LABELS[report.source_type] || report.source_type}</div>
                              <div><span className="text-gray-600">Description length:</span> {report.description ? report.description.length + ' chars' : 'None'}</div>
                              {report.tags && report.tags.length > 0 && (
                                <div><span className="text-gray-600">Tags:</span> {report.tags.join(', ')}</div>
                              )}
                              {report.original_report_id && (
                                <div><span className="text-gray-600">Original ID:</span> {report.original_report_id}</div>
                              )}
                            </div>

                            {/* Action buttons in expanded view */}
                            <div className="flex gap-2 mt-4">
                              <button
                                onClick={function() { handleAction('approve', [report.id]) }}
                                disabled={actionLoading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50"
                              >
                                <Check className="w-4 h-4" />
                                Approve
                              </button>
                              <button
                                onClick={function() { handleAction('reject', [report.id]) }}
                                disabled={actionLoading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
                              >
                                <X className="w-4 h-4" />
                                Reject
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6 text-sm">
              <button
                onClick={function() { setPage(Math.max(1, page - 1)) }}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-gray-500">
                {'Page ' + page + ' of ' + totalPages}
              </span>
              <button
                onClick={function() { setPage(Math.min(totalPages, page + 1)) }}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
