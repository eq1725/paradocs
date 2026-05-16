'use client'

/**
 * /admin/source-takedown — B0.5 admin tool.
 *
 * Lets the admin pull all ingested reports from a given source_type
 * in one operation. Use cases: source ToS changes (Reddit/YouTube),
 * rights-holder bulk takedown request, adapter quality regression.
 *
 * Flow:
 *   1. Page loads → fetch per-source counts of ingested reports
 *   2. Admin picks a source from the dropdown
 *   3. Preview pane shows count + per-status breakdown
 *   4. Admin types a reason (required) and clicks Archive
 *   5. Confirmation modal: "Archive N reports? This is reversible
 *      via direct DB query but UI doesn't expose un-archive."
 *   6. On confirm: POST → server archives + logs to source_takedown_log
 *
 * SWC: var + function() form.
 */

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { AlertTriangle, ArrowLeft, Loader2, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'

interface SourceCount {
  source_type: string
  total: number
  by_status: Record<string, number>
}

export default function SourceTakedownPage() {
  var router = useRouter()
  var [authChecked, setAuthChecked] = useState(false)
  var [allowed, setAllowed] = useState(false)
  var [sources, setSources] = useState<SourceCount[]>([])
  var [loading, setLoading] = useState(false)
  var [selected, setSelected] = useState<string>('')
  var [reason, setReason] = useState<string>('')
  var [showConfirm, setShowConfirm] = useState(false)
  var [submitting, setSubmitting] = useState(false)
  var [result, setResult] = useState<{ ok: boolean; affected?: number; error?: string; note?: string } | null>(null)

  useEffect(function () {
    supabase.auth.getSession().then(function (r) {
      var session = r.data.session
      if (!session) {
        setAuthChecked(true)
        setAllowed(false)
        return
      }
      var email = session.user?.email
      if (email === 'williamschaseh@gmail.com') {
        setAllowed(true)
      }
      setAuthChecked(true)
    })
  }, [])

  function loadCounts() {
    setLoading(true)
    setResult(null)
    supabase.auth.getSession().then(function (r) {
      var token = r.data.session?.access_token
      if (!token) {
        setLoading(false)
        return
      }
      fetch('/api/admin/source-takedown', {
        headers: { Authorization: 'Bearer ' + token },
      })
        .then(function (resp) { return resp.ok ? resp.json() : Promise.reject(new Error('Fetch failed')) })
        .then(function (data) { setSources(data.sources || []) })
        .catch(function (err) { console.error(err); setSources([]) })
        .finally(function () { setLoading(false) })
    })
  }

  useEffect(function () {
    if (allowed) loadCounts()
  }, [allowed])

  async function executeTakedown() {
    setSubmitting(true)
    setResult(null)
    try {
      var session = (await supabase.auth.getSession()).data.session
      if (!session) throw new Error('Not authenticated')
      var resp = await fetch('/api/admin/source-takedown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ source_type: selected, reason: reason.trim() }),
      })
      var data = await resp.json()
      if (!resp.ok) {
        setResult({ ok: false, error: data.error || 'Takedown failed' })
      } else {
        setResult({ ok: true, affected: data.affected, note: data.note })
        // Refresh counts so the UI reflects post-takedown state
        loadCounts()
        setSelected('')
        setReason('')
      }
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || 'Unexpected error' })
    } finally {
      setSubmitting(false)
      setShowConfirm(false)
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-white mb-2">Admin access required</h1>
          <p className="text-sm text-gray-400">This page is restricted to the platform admin.</p>
        </div>
      </div>
    )
  }

  var selectedSource = sources.find(function (s) { return s.source_type === selected })

  return (
    <>
      <Head>
        <title>Source Takedown · Admin · Paradocs</title>
      </Head>
      <div className="min-h-screen bg-gray-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Admin
          </Link>

          <div className="mb-8">
            <p className="text-[11px] font-semibold tracking-widest uppercase text-amber-400 mb-1">Destructive action · audited</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Source Takedown</h1>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed max-w-2xl">
              Archives every ingested report from a selected source in one operation.
              Use when a source&apos;s ToS changes, a rights-holder issues a bulk takedown,
              or an adapter regression needs to be rolled back. Every action is logged to
              <code className="text-purple-300 mx-1">source_takedown_log</code> with the
              admin user, timestamp, count, and reason. Reversible only via direct DB
              query.
            </p>
          </div>

          {/* Source picker + preview */}
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-5 sm:p-6 mb-6">
            <h2 className="text-sm font-semibold text-white mb-4">1. Pick a source</h2>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading source counts…
              </div>
            ) : sources.length === 0 ? (
              <p className="text-sm text-gray-400">No ingested reports in the database yet. Once ingestion starts, sources will appear here.</p>
            ) : (
              <>
                <select
                  value={selected}
                  onChange={function (e) { setSelected(e.target.value); setResult(null) }}
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">— select a source —</option>
                  {sources.map(function (s) {
                    return (
                      <option key={s.source_type} value={s.source_type}>
                        {s.source_type} &nbsp;·&nbsp; {s.total.toLocaleString()} reports
                      </option>
                    )
                  })}
                </select>

                {selectedSource && (
                  <div className="mt-4 p-4 bg-amber-950/20 border border-amber-900/40 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-white font-medium mb-1">
                          {selectedSource.total.toLocaleString()} ingested reports from <code className="text-amber-300">{selectedSource.source_type}</code> will be archived.
                        </p>
                        <p className="text-xs text-gray-400 mb-2">
                          Current status breakdown:
                        </p>
                        <ul className="text-xs text-gray-300 space-y-1 ml-1">
                          {Object.entries(selectedSource.by_status).map(function ([status, count]) {
                            return (
                              <li key={status}>
                                <span className="font-mono text-gray-400">{status}</span> &nbsp;·&nbsp; {count.toLocaleString()}
                              </li>
                            )
                          })}
                        </ul>
                        <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
                          Already-archived rows are skipped. Only active rows are flipped to <code>status=&apos;archived&apos;</code>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Reason + confirm */}
          {selected && (
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-5 sm:p-6 mb-6">
              <h2 className="text-sm font-semibold text-white mb-1">2. Reason for takedown</h2>
              <p className="text-xs text-gray-400 mb-3">Written to the audit log. Be specific — future-you will appreciate the context.</p>
              <textarea
                value={reason}
                onChange={function (e) { setReason(e.target.value) }}
                placeholder="e.g. Reddit ToS update 2026-XX-XX requires removal of pre-2023 API archive data. Counsel directive ref #..."
                rows={3}
                className="w-full bg-gray-900/80 border border-gray-700 rounded-lg p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 leading-relaxed"
              />
              <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={function () { setSelected(''); setReason('') }}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={function () { setShowConfirm(true) }}
                  disabled={!reason.trim() || reason.trim().length < 10}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Archive {selectedSource ? selectedSource.total.toLocaleString() : ''} reports
                </button>
              </div>
              {reason.trim().length > 0 && reason.trim().length < 10 && (
                <p className="text-[11px] text-amber-300 mt-2">Add a few more words so the audit log has useful context.</p>
              )}
            </div>
          )}

          {/* Result banner */}
          {result && (
            <div className={classNames(
              'rounded-xl p-4 border',
              result.ok
                ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-200'
                : 'bg-red-950/20 border-red-900/40 text-red-200'
            )}>
              {result.ok ? (
                <p className="text-sm">
                  {typeof result.affected === 'number' && result.affected > 0
                    ? 'Archived ' + result.affected.toLocaleString() + ' reports successfully. Audit log written.'
                    : (result.note || 'Operation completed with no rows affected.')}
                </p>
              ) : (
                <p className="text-sm">Takedown failed: {result.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Confirmation modal */}
        {showConfirm && selectedSource && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={function () { if (!submitting) setShowConfirm(false) }}
          >
            <div
              className="w-full max-w-md bg-gray-900 border border-red-900/40 rounded-2xl p-6 sm:p-7"
              onClick={function (e) { e.stopPropagation() }}
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-red-600/15 rounded-lg flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">Confirm takedown</h3>
                  <p className="text-sm text-gray-400 mt-0.5">
                    This archives <strong className="text-white">{selectedSource.total.toLocaleString()}</strong> ingested reports from <code className="text-red-300">{selectedSource.source_type}</code>.
                    Reversible only via direct DB query. Audit log entry will name you as the operator.
                  </p>
                </div>
              </div>

              <div className="bg-black/30 rounded-lg p-3 mb-5 max-h-24 overflow-y-auto">
                <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Reason (will be logged)</p>
                <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{reason.trim()}</p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={function () { setShowConfirm(false) }}
                  disabled={submitting}
                  className="px-5 py-2.5 text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeTakedown}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Archiving…
                    </>
                  ) : (
                    'Archive ' + selectedSource.total.toLocaleString() + ' reports'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
