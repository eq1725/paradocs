'use client'

/**
 * /admin/video-review — Phase A admin queue for user-submitted videos
 *
 * Panel-feedback (May 2026). Lists report_videos rows where status
 * is in (pending_review, failed, ready_for_review). Admin previews
 * the video + transcript + extracted metadata, then approves
 * (status='ready') or rejects (status='rejected' with a reason).
 *
 * Auth: same admin email gate as /admin/source-takedown.
 *
 * Flow:
 *   1. GET /api/admin/videos/queue — paginated list
 *   2. Preview a row → signed URL + transcript display
 *   3. Approve / Reject → POST /api/admin/videos/[id]/decide
 *
 * SWC: var + function() form.
 */

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { ArrowLeft, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface QueueRow {
  id: string
  report_id: string
  user_id: string
  status: string
  mime_type: string
  duration_sec: number | null
  transcript: string | null
  transcript_lang: string | null
  moderation_result: any | null
  uploaded_at: string
  playback_url: string | null
  report: {
    title: string | null
    description: string | null
    slug: string | null
    category: string | null
    status: string
  } | null
}

export default function VideoReviewPage() {
  var [allowed, setAllowed] = useState<boolean | null>(null)
  var [rows, setRows] = useState<QueueRow[]>([])
  var [loading, setLoading] = useState(false)
  var [activeId, setActiveId] = useState<string | null>(null)
  var [actionId, setActionId] = useState<string | null>(null)
  var [error, setError] = useState<string | null>(null)
  var [rejectReason, setRejectReason] = useState<string>('')

  useEffect(function () {
    supabase.auth.getSession().then(function (r) {
      var email = r.data.session?.user?.email || ''
      setAllowed(email === 'williamschaseh@gmail.com')
    })
  }, [])

  function load() {
    setLoading(true)
    setError(null)
    supabase.auth.getSession().then(function (r) {
      var token = r.data.session?.access_token
      if (!token) {
        setError('Not signed in')
        setLoading(false)
        return
      }
      fetch('/api/admin/videos/queue', { headers: { Authorization: 'Bearer ' + token } })
        .then(function (resp) { return resp.ok ? resp.json() : Promise.reject(new Error('Fetch failed: ' + resp.status)) })
        .then(function (data) { setRows(data.videos || []) })
        .catch(function (err) { setError(err.message) })
        .finally(function () { setLoading(false) })
    })
  }

  useEffect(function () {
    if (allowed === true) load()
  }, [allowed])

  async function decide(id: string, action: 'approve' | 'reject') {
    setActionId(id)
    setError(null)
    var r = await supabase.auth.getSession()
    var token = r.data.session?.access_token
    if (!token) {
      setError('Not signed in')
      setActionId(null)
      return
    }
    try {
      var resp = await fetch('/api/admin/videos/' + encodeURIComponent(id) + '/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          action: action,
          reason: action === 'reject' ? rejectReason : null,
        }),
      })
      var data = await resp.json()
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Action failed')
      // Remove the decided row from the queue locally.
      setRows(function (current) { return current.filter(function (row) { return row.id !== id }) })
      setActiveId(null)
      setRejectReason('')
    } catch (e: any) {
      setError(e?.message || 'Action failed')
    } finally {
      setActionId(null)
    }
  }

  if (allowed === null) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-500 text-sm">Checking access…</div>
  }
  if (allowed === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400 text-sm">
        <div className="text-center">
          <p>Admin access required.</p>
          <Link href="/" className="text-purple-300 hover:text-purple-200 underline text-xs mt-3 inline-block">Back to home</Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Video review queue · Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200">
              <ArrowLeft className="w-4 h-4" />
              Admin home
            </Link>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 hover:text-white border border-gray-700 rounded-full"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">Video review queue</h1>
          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            User-submitted videos awaiting human approval. Approve to surface on the feed; reject (with a reason) to hide.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg border border-red-900/40 bg-red-950/30 text-sm text-red-200">
              {error}
            </div>
          )}

          {loading && rows.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
              Loading queue…
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-500">
              Queue is empty. Nice.
            </div>
          )}

          <div className="space-y-3">
            {rows.map(function (row) {
              var expanded = activeId === row.id
              return (
                <div key={row.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-amber-900/40 text-amber-200 border border-amber-700/30">
                          {row.status}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          uploaded {new Date(row.uploaded_at).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {row.duration_sec ? Math.round(row.duration_sec) + 's' : '—'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-white truncate">
                        {row.report?.title || '(no title yet)'}
                      </p>
                      <p className="mt-1 text-xs text-gray-400 line-clamp-2">
                        {row.report?.description || row.transcript || '(no transcript / description)'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={function () { setActiveId(expanded ? null : row.id) }}
                      className="text-xs text-purple-300 hover:text-purple-200 underline underline-offset-2 flex-shrink-0"
                    >
                      {expanded ? 'Collapse' : 'Review'}
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 items-start">
                      <div>
                        {row.playback_url ? (
                          <video
                            src={row.playback_url}
                            controls
                            playsInline
                            className="w-full aspect-[9/16] bg-black rounded-xl object-cover"
                          />
                        ) : (
                          <div className="w-full aspect-[9/16] bg-black rounded-xl flex items-center justify-center text-xs text-gray-500">
                            No playback URL
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        {row.transcript && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Transcript {row.transcript_lang ? '(' + row.transcript_lang + ')' : ''}</p>
                            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{row.transcript}</p>
                          </div>
                        )}
                        {row.moderation_result && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Moderation</p>
                            <pre className="text-[10px] text-gray-400 bg-gray-950/60 p-2 rounded border border-gray-800 overflow-x-auto">
                              {JSON.stringify(row.moderation_result, null, 2).slice(0, 800)}
                            </pre>
                          </div>
                        )}
                        <div className="space-y-2">
                          <textarea
                            placeholder="Rejection reason (required if rejecting)…"
                            value={activeId === row.id ? rejectReason : ''}
                            onChange={function (e) { setRejectReason(e.target.value) }}
                            rows={2}
                            className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-xs"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={function () { decide(row.id, 'approve') }}
                              disabled={actionId === row.id}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={function () { decide(row.id, 'reject') }}
                              disabled={actionId === row.id || !rejectReason.trim()}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          </div>
                          {row.report?.slug && (
                            <Link
                              href={'/report/' + row.report.slug}
                              target="_blank"
                              className="block text-center text-[11px] text-gray-400 hover:text-gray-200 underline underline-offset-2"
                            >
                              Open report page →
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
