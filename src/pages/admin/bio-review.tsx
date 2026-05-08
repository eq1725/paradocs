'use client'

/**
 * /admin/bio-review — V9.9.1.
 *
 * Admin queue for bios that Claude Haiku flagged as borderline
 * (moderation decision='pending'). Each row shows the user, their
 * bio text, the flag categories, and Approve/Reject buttons.
 *
 * Approve: clears the pending flag; bio stays as written.
 * Reject:  clears the bio + flags rejected. User sees the empty
 *          bio next visit and can rewrite.
 *
 * Mirrors /admin/avatar-review structurally — same AdminLayout
 * shell, same button affordances, same auth pattern.
 */

import React, { useEffect, useState } from 'react'
import { Loader2, Check, X, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { Avatar } from '@/components/AvatarSelector'

interface BioQueueItem {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  bio_moderation_categories: string[] | null
  bio_moderation_at: string | null
}

export default function BioReviewPage() {
  var [items, setItems] = useState<BioQueueItem[]>([])
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [actingOn, setActingOn] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      var { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }
      var resp = await fetch('/api/admin/bio-queue', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
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
      var resp = await fetch('/api/admin/bio-decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ user_id: userId, decision: decision }),
      })
      var data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Decision failed')
      setItems(function (prev) { return prev.filter(function (it) { return it.id !== userId }) })
      // V9.9.1 — broadcast profile-updated so any open Layout instance
      // refreshes its cached user data (only matters when the admin is
      // approving their own bio, but harmless otherwise).
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('profile-updated'))
      }
    } catch (err: any) {
      setError(err?.message || 'Action failed')
    } finally {
      setActingOn(null)
    }
  }

  return (
    <AdminLayout
      title="Bio Review"
      subtitle="Bios that Claude Haiku flagged as borderline. Approve to leave as-is, reject to clear the bio."
      narrow
    >
      <div>
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-200 text-sm mb-4">
              {error}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="p-10 bg-gray-900 rounded-xl border border-gray-800 text-center">
              <Check className="w-10 h-10 mx-auto text-emerald-400 mb-3" />
              <p className="text-white font-medium">Queue is clear.</p>
              <p className="text-sm text-gray-400 mt-1">No bios currently waiting for review.</p>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="space-y-3">
              {items.map(function (item) {
                var busy = actingOn === item.id
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl"
                  >
                    <div className="flex-shrink-0">
                      <Avatar
                        avatar={item.avatar_url}
                        fallback={item.display_name || item.username || 'U'}
                        size="lg"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {item.display_name || 'Researcher'}
                      </p>
                      {item.username && (
                        <p className="text-xs text-gray-500 truncate">@{item.username}</p>
                      )}

                      {/* Bio text — the actual content under review */}
                      <p className="mt-2 text-sm text-gray-200 whitespace-pre-wrap break-words bg-gray-950/60 border border-gray-800 rounded-lg p-3">
                        {item.bio || <span className="text-gray-500 italic">(empty)</span>}
                      </p>

                      {/* Categories */}
                      {item.bio_moderation_categories && item.bio_moderation_categories.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.bio_moderation_categories.map(function (cat, i) {
                            return (
                              <span
                                key={'cat-' + i}
                                className="inline-flex items-center px-2 py-0.5 bg-amber-500/15 text-amber-200 border border-amber-400/30 rounded-full text-[10px] font-medium uppercase tracking-wider"
                              >
                                {cat}
                              </span>
                            )
                          })}
                        </div>
                      )}

                      {item.bio_moderation_at && (
                        <p className="text-[11px] text-gray-600 mt-2">
                          Submitted {new Date(item.bio_moderation_at).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={function () { decide(item.id, 'approved') }}
                        disabled={busy}
                        aria-label={'Approve bio for ' + (item.display_name || item.username || 'user')}
                        className="inline-flex items-center justify-center gap-1.5 min-w-[88px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-full disabled:opacity-50 transition-colors"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={function () { decide(item.id, 'rejected') }}
                        disabled={busy}
                        aria-label={'Reject bio for ' + (item.display_name || item.username || 'user')}
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
