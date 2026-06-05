'use client'

// V11.17.72 - Custom Watchlists
//
// WatchlistMatchCard — single match preview used in WatchlistsRail
// and in the in-app digest list.
//
// Documentary register: report title + dateline + dismiss/view-report
// actions. No emoji, no exclamation marks, no gamified copy.

import React, { useState, useCallback } from 'react'
import Link from 'next/link'
import { ExternalLink, X, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export interface WatchlistMatchCardReport {
  id: string
  slug?: string | null
  title?: string | null
  summary?: string | null
  category?: string | null
  city?: string | null
  state_province?: string | null
  country?: string | null
  event_date?: string | null
}

export interface WatchlistMatchCardData {
  id: number
  match_confidence: number
  matched_at: string
  dismissed?: boolean
  report: WatchlistMatchCardReport | null
}

interface WatchlistMatchCardProps {
  match: WatchlistMatchCardData
  /** Called after a successful dismiss so the parent can drop the row. */
  onDismissed?: (matchId: number) => void
  /** Suppress dismiss button (for the read-only digest view). */
  readOnly?: boolean
}

export function WatchlistMatchCard(props: WatchlistMatchCardProps) {
  var [busy, setBusy] = useState(false)
  var [dismissed, setDismissed] = useState(!!props.match.dismissed)

  var dismissHandler = useCallback(async function () {
    if (busy || dismissed) return
    setBusy(true)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) { setBusy(false); return }
      var resp = await fetch('/api/lab/watchlists/matches/' + props.match.id + '/dismiss', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      })
      if (resp.ok) {
        setDismissed(true)
        if (props.onDismissed) props.onDismissed(props.match.id)
      }
    } catch (_e) { /* ignore */ }
    setBusy(false)
  }, [busy, dismissed, props])

  if (dismissed) return null

  var rep = props.match.report
  if (!rep) return null

  var loc = [rep.city, rep.state_province, rep.country].filter(Boolean).join(', ')
  var eventDate = rep.event_date
    ? new Date(rep.event_date).toISOString().slice(0, 10)
    : 'undated'
  var href = '/report/' + (rep.slug || rep.id)
  var confPct = Math.round((props.match.match_confidence || 0) * 100)

  return (
    <div className="relative rounded-xl border border-purple-500/10 bg-gray-950/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link href={href} className="block group">
            <p className="text-sm font-semibold text-gray-100 group-hover:text-purple-200 line-clamp-2 leading-snug">
              {rep.title || 'Untitled report'}
            </p>
          </Link>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-gray-500">
            <span>{eventDate}</span>
            {loc && (
              <>
                <span aria-hidden>&middot;</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {loc}
                </span>
              </>
            )}
            <span aria-hidden>&middot;</span>
            <span className="text-purple-300/80">confidence {confPct}%</span>
          </div>
          {rep.summary && (
            <p className="mt-2 text-xs text-gray-400 line-clamp-2 leading-relaxed">
              {rep.summary}
            </p>
          )}
          <div className="mt-2">
            <Link
              href={href}
              className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200"
            >
              View report
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
        {!props.readOnly && (
          <button
            type="button"
            onClick={dismissHandler}
            disabled={busy}
            aria-label="Dismiss match"
            className="p-1.5 rounded-full text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

export default WatchlistMatchCard
