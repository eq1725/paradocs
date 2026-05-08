'use client'

/**
 * /admin/avatar-review — V9.7 Phase 2.
 *
 * Admin queue for pending custom avatar uploads. Each item shows the
 * pending image alongside the user's display name + username, plus
 * Approve / Reject buttons. The Rekognition score that put it in the
 * queue is shown so the admin can sanity-check the call.
 *
 * Auth: requires admin (server endpoints enforce this; client just
 * shows a 'not authorized' state if the API returns 403).
 */

import React, { useEffect, useState } from 'react'
import { Loader2, Check, X, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

interface QueueItem {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  avatar_pending_url: string | null
  avatar_moderation_score: any
  avatar_pending_uploaded_at: string | null
}

export default function AvatarReviewPage() {
  var [items, setItems] = useState<QueueItem[]>([])
  var [loading, setLoading] = useState(true)
  var [unauthorized, setUnauthorized] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [actingOn, setActingOn] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      var { data: { session } } = await supabase.auth.getSession()
      if (!session) { setUnauthorized(true); setLoading(false); return }
      var resp = await fetch('/api/admin/avatar-queue', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
      if (resp.status === 403) { setUnauthorized(true); setLoading(false); return }
      var data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Load failed')
      setItems(data.items || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(function () { load() }, [])

  async function decide(userId: string, decision: 'approved' | 'rejected') {
    setActingOn(userId)
    try {
      var { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      var resp = await fetch('/api/admin/avatar-decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ user_id: userId, decision: decision }),
      })
      var data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Decision failed')
      // Optimistically remove from list.
      setItems(function (prev) { return prev.filter(function (it) { return it.id !== userId }) })
      // V9.7.7 — broadcast a profile-updated event so the global
      // Layout (and DashboardLayout) refresh their cached user data.
      // This catches the case where an admin approves their OWN
      // pending avatar — without this, the top-nav avatar stays
      // stale until the next page-level checkUser fires.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('profile-updated'))
      }
    } catch (err: any) {
      setError(err?.message || 'Action failed')
    } finally {
      setActingOn(null)
    }
  }

  function topLabel(score: any): string {
    if (!score) return '—'
    // V9.7.5 — surface the reason field when Rekognition errored.
    // 'rekognition_error' means the scanner couldn't reach AWS, so
    // the upload is queued for human review as a safety fallback.
    // 'No flags' means Rekognition ran cleanly and found nothing —
    // those should auto-approve, so seeing them here is a bug worth
    // logging.
    if (score.reason === 'rekognition_error') {
      return 'Scanner errored — review manually'
    }
    if (!score.labels || !Array.isArray(score.labels)) return '—'
    var labels = score.labels as Array<{ Name?: string; Confidence?: number }>
    if (labels.length === 0) {
      return score.reason ? 'Reason: ' + score.reason : 'No flags (unexpected — should auto-approve)'
    }
    var top = labels.reduce(function (best, cur) {
      if (!best) return cur
      return (cur.Confidence || 0) > (best.Confidence || 0) ? cur : best
    }, labels[0])
    var conf = top.Confidence ? Math.round(top.Confidence) + '%' : ''
    return (top.Name || '?') + (conf ? ' · ' + conf : '')
  }

  return (
    <AdminLayout
      title="Avatar Review"
      subtitle="Custom avatar uploads that AWS Rekognition flagged as borderline. Approve to make visible, reject to delete."
      narrow
    >
      <div>
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          )}

          {unauthorized && (
            <div className="p-6 bg-red-950/30 border border-red-900/50 rounded-xl text-red-200">
              <AlertCircle className="w-6 h-6 mb-2" />
              <p className="font-medium">Admin access required.</p>
              <p className="text-sm text-red-300/80 mt-1">Sign in with an admin account to view this page.</p>
            </div>
          )}

          {error && !unauthorized && (
            <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-200 text-sm mb-4">
              {error}
            </div>
          )}

          {!loading && !unauthorized && !error && items.length === 0 && (
            <div className="p-10 bg-gray-900 rounded-xl border border-gray-800 text-center">
              <Check className="w-10 h-10 mx-auto text-emerald-400 mb-3" />
              <p className="text-white font-medium">Queue is clear.</p>
              <p className="text-sm text-gray-400 mt-1">No avatars currently waiting for review.</p>
            </div>
          )}

          {!loading && !unauthorized && items.length > 0 && (
            <div className="space-y-3">
              {items.map(function (item) {
                var busy = actingOn === item.id
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl"
                  >
                    {/* Pending avatar */}
                    <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
                      {item.avatar_pending_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.avatar_pending_url}
                          alt="Pending avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {item.display_name || 'Researcher'}
                      </p>
                      {item.username && (
                        <p className="text-xs text-gray-500 truncate">@{item.username}</p>
                      )}
                      <p className="text-xs text-amber-300/80 mt-1">
                        Flagged: {topLabel(item.avatar_moderation_score)}
                      </p>
                      {item.avatar_pending_uploaded_at && (
                        <p className="text-[11px] text-gray-600 mt-0.5">
                          Uploaded {new Date(item.avatar_pending_uploaded_at).toLocaleString()}
                        </p>
                      )}
                    </div>

                    {/* V9.8 T2 — bumped buttons from py-1.5 → py-2.5 to
                        clear the 44px Apple HIG touch target on mobile.
                        Operators approve dozens at a time; bigger
                        buttons mean fewer mis-taps. */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={function () { decide(item.id, 'approved') }}
                        disabled={busy}
                        aria-label={'Approve avatar for ' + (item.display_name || item.username || 'user')}
                        className="inline-flex items-center justify-center gap-1.5 min-w-[88px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-full disabled:opacity-50 transition-colors"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={function () { decide(item.id, 'rejected') }}
                        disabled={busy}
                        aria-label={'Reject avatar for ' + (item.display_name || item.username || 'user')}
                        className="inline-flex items-center justify-center gap-1.5 min-w-[88px] px-4 py-2.5 bg-red-900/40 hover:bg-red-900/60 border border-red-800/50 text-red-200 text-xs font-semibold rounded-full disabled:opacity-50 transition-colors"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        Reject
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
      </div>
    </AdminLayout>
  )
}
