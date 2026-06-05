'use client'

// V11.17.72 - Custom Watchlists
//
// WatchlistsRail — the Pro-only in-app surface that lists the user's
// watchlists with recent matches inline. Mounted in src/pages/lab.tsx
// in place of the Watchlists paywall for Pro users.
//
// Layout:
//   - Header strip: title, "New watchlist" CTA, count badge
//   - List of watchlists, each card showing:
//     - name + criteria summary
//     - recent-match count badge
//     - pause/resume + edit buttons
//     - up to 3 recent matches inline (WatchlistMatchCard)
//     - "view all matches" link (expands per-watchlist match list)
//
// Rules-of-Hooks compliance: all hooks at top; gating after.

import React, { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Plus, Pencil, Eye, EyeOff, Mail, MailX } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import WatchlistEditor, { WatchlistRow } from './WatchlistEditor'
import WatchlistMatchCard, { WatchlistMatchCardData } from './WatchlistMatchCard'
import { summarizeCriteria } from '@/lib/lab/watchlists/criteria-schema'

interface WatchlistsRailProps {
  /** Optional cap on number of watchlists to render before "show all". */
  maxVisible?: number
}

export function WatchlistsRail(props: WatchlistsRailProps) {
  // All hooks first.
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [watchlists, setWatchlists] = useState<WatchlistRow[]>([])
  var [editorOpen, setEditorOpen] = useState(false)
  var [editorInitial, setEditorInitial] = useState<WatchlistRow | null>(null)
  var [matchesByWl, setMatchesByWl] = useState<Record<string, WatchlistMatchCardData[]>>({})
  var [matchesLoadingByWl, setMatchesLoadingByWl] = useState<Record<string, boolean>>({})
  var [expandedWl, setExpandedWl] = useState<Record<string, boolean>>({})

  var reload = useCallback(async function () {
    setLoading(true)
    setError(null)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) { setError('not_authenticated'); setLoading(false); return }
      var resp = await fetch('/api/lab/watchlists', { headers: { Authorization: 'Bearer ' + token } })
      if (resp.status === 403) { setError('pro_tier_required'); setLoading(false); return }
      if (!resp.ok) { setError('fetch_failed'); setLoading(false); return }
      var json = await resp.json()
      setWatchlists((json.watchlists || []) as WatchlistRow[])
      setLoading(false)
    } catch (e: any) {
      setError(String(e && e.message || e))
      setLoading(false)
    }
  }, [])

  useEffect(function () { reload() }, [reload])

  var fetchRecentMatches = useCallback(async function (wlId: string) {
    setMatchesLoadingByWl(function (prev) { return Object.assign({}, prev, { [wlId]: true }) })
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) return
      var resp = await fetch('/api/lab/watchlists/' + wlId + '/matches?limit=10', {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!resp.ok) return
      var json = await resp.json()
      setMatchesByWl(function (prev) {
        var next = Object.assign({}, prev)
        next[wlId] = (json.matches || []) as WatchlistMatchCardData[]
        return next
      })
    } catch (_e) { /* ignore */ }
    setMatchesLoadingByWl(function (prev) { return Object.assign({}, prev, { [wlId]: false }) })
  }, [])

  // Auto-fetch matches for watchlists with recent_match_count > 0.
  useEffect(function () {
    watchlists.forEach(function (w) {
      if ((w.recent_match_count || 0) > 0 && !matchesByWl[w.id]) {
        fetchRecentMatches(w.id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlists])

  var openCreate = useCallback(function () {
    setEditorInitial(null)
    setEditorOpen(true)
  }, [])

  var openEdit = useCallback(function (w: WatchlistRow) {
    setEditorInitial(w)
    setEditorOpen(true)
  }, [])

  var onSaved = useCallback(function (saved: WatchlistRow) {
    setEditorOpen(false)
    setWatchlists(function (prev) {
      var idx = prev.findIndex(function (w) { return w.id === saved.id })
      if (idx >= 0) {
        var next = prev.slice()
        next[idx] = Object.assign({}, prev[idx], saved)
        return next
      }
      return [saved].concat(prev)
    })
  }, [])

  var onDeleted = useCallback(function (id: string) {
    setEditorOpen(false)
    setWatchlists(function (prev) { return prev.filter(function (w) { return w.id !== id }) })
  }, [])

  var togglePause = useCallback(async function (w: WatchlistRow) {
    var s = await supabase.auth.getSession()
    var token = s.data.session?.access_token
    if (!token) return
    var paused = w.status === 'active'
    var resp = await fetch('/api/lab/watchlists/' + w.id + '/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ paused: paused }),
    })
    if (resp.ok) {
      setWatchlists(function (prev) {
        return prev.map(function (row) {
          if (row.id !== w.id) return row
          return Object.assign({}, row, { status: paused ? 'paused' : 'active' as any })
        })
      })
    }
  }, [])

  var onMatchDismissed = useCallback(function (wlId: string, matchId: number) {
    setMatchesByWl(function (prev) {
      var list = (prev[wlId] || []).filter(function (m) { return m.id !== matchId })
      var next = Object.assign({}, prev)
      next[wlId] = list
      return next
    })
    setWatchlists(function (prev) {
      return prev.map(function (row) {
        if (row.id !== wlId) return row
        var count = Math.max(0, (row.recent_match_count || 0) - 1)
        return Object.assign({}, row, { recent_match_count: count })
      })
    })
  }, [])

  // Render — gating after hooks.
  return (
    <div className="rounded-2xl border border-purple-500/15 bg-gradient-to-br from-purple-950/20 to-gray-950/40 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-300/90 mb-1">Pro flagship</p>
          <h2 className="text-lg sm:text-xl font-bold text-white" style={{ fontFamily: "'Changa One', system-ui, sans-serif" }}>
            Custom Watchlists
          </h2>
          <p className="text-xs text-gray-400 mt-1">Standing research interests. The Archive is watched on your behalf.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          New watchlist
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-gray-500">Loading watchlists…</div>
      ) : error === 'pro_tier_required' ? (
        <div className="py-6 text-center text-xs text-gray-400">Pro tier required.</div>
      ) : error ? (
        <div className="py-6 text-center text-xs text-red-300">Failed to load watchlists.</div>
      ) : watchlists.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-300 mb-1">No watchlists yet.</p>
          <p className="text-xs text-gray-500 mb-4">Define standing criteria — the Archive will notify the moment a matching report lands.</p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Create your first watchlist
          </button>
        </div>
      ) : (
        <ul className="space-y-4">
          {watchlists.slice(0, props.maxVisible || 50).map(function (w) {
            var ms = matchesByWl[w.id] || []
            var expanded = !!expandedWl[w.id]
            var showCount = expanded ? ms.length : Math.min(3, ms.length)
            var summary = summarizeCriteria(w.criteria || {})
            return (
              <li key={w.id} className="rounded-xl border border-white/5 bg-gray-950/60 p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-white">{w.name}</h3>
                      {w.status === 'paused' && (
                        <span className="text-[10px] uppercase tracking-widest text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-full px-2 py-0.5">paused</span>
                      )}
                      {(w.recent_match_count || 0) > 0 && (
                        <span className="text-[10px] uppercase tracking-widest text-purple-200 bg-purple-500/20 border border-purple-400/30 rounded-full px-2 py-0.5">
                          {w.recent_match_count} new
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{summary}</p>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        {w.notify_push ? <Bell className="w-3 h-3 text-purple-300" /> : <BellOff className="w-3 h-3" />}
                        push
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {w.notify_email_weekly ? <Mail className="w-3 h-3 text-purple-300" /> : <MailX className="w-3 h-3" />}
                        weekly email
                      </span>
                      <span>threshold {Math.round(w.match_confidence_threshold * 100)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={function () { togglePause(w) }}
                      title={w.status === 'active' ? 'Pause' : 'Resume'}
                      className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5"
                    >
                      {w.status === 'active' ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={function () { openEdit(w) }}
                      title="Edit"
                      className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Recent matches preview */}
                {ms.length > 0 && (
                  <div className="space-y-2 pt-3 border-t border-white/5">
                    {ms.slice(0, showCount).map(function (m) {
                      return (
                        <WatchlistMatchCard
                          key={m.id}
                          match={m}
                          onDismissed={function (mid) { onMatchDismissed(w.id, mid) }}
                        />
                      )
                    })}
                    {ms.length > 3 && (
                      <button
                        type="button"
                        onClick={function () {
                          setExpandedWl(function (prev) { return Object.assign({}, prev, { [w.id]: !prev[w.id] }) })
                        }}
                        className="text-xs text-purple-300 hover:text-purple-200"
                      >
                        {expanded ? 'Show fewer' : 'View all ' + ms.length + ' matches'}
                      </button>
                    )}
                  </div>
                )}
                {matchesLoadingByWl[w.id] && ms.length === 0 && (
                  <div className="pt-3 text-[11px] text-gray-500">Loading matches…</div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <WatchlistEditor
        open={editorOpen}
        initial={editorInitial}
        onClose={function () { setEditorOpen(false) }}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </div>
  )
}

export default WatchlistsRail
