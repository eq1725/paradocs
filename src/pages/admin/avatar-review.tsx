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
import Head from 'next/head'
import Link from 'next/link'
import { Loader2, Check, X, AlertCircle, ArrowLeft, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
    } catch (err: any) {
      setError(err?.message || 'Action failed')
    } finally {
      setActingOn(null)
    }
  }

  function topLabel(score: any): string {
    if (!score || !score.labels || !Array.isArray(score.labels)) return '—'
    var labels = score.labels as Array<{ Name?: string; Confidence?: number }>
    if (labels.length === 0) return 'No flags'
    var top = labels.reduce(function (best, cur) {
      if (!best) return cur
      return (cur.Confidence || 0) > (best.Confidence || 0) ? cur : best
    }, labels[0])
    var conf = top.Confidence ? Math.round(top.Confidence) + '%' : ''
    return (top.Name || '?') + (conf ? ' · ' + conf : '')
  }

  return (
    <>
      <Head><title>Avatar Review · Admin</title></Head>
      <div className="min-h-screen bg-gray-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to admin
          </Link>

          <div className="flex items-start gap-3 mb-8">
            <div className="p-2.5 bg-purple-600/20 rounded-lg">
              <Shield className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Avatar review queue</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                Custom avatar uploads that AWS Rekognition flagged as borderline.
                Approve to make visible, reject to delete.
              </p>
            </div>
          </div>

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

                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={function () { decide(item.id, 'approved') }}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-full disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={function () { decide(item.id, 'rejected') }}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-red-900/40 hover:bg-red-900/60 border border-red-800/50 text-red-200 text-xs font-semibold rounded-full disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        Reject
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
