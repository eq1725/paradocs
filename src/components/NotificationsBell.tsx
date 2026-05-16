'use client'

/**
 * NotificationsBell — top-nav bell icon + dropdown.
 *
 * T1.9 MVP — read-only list of the user's last 10 notifications. No
 * unread state. Source: GET /api/notifications/recent which reads
 * the user_notifications table (signal-alerts cron, signal-digest-
 * email cron, trial/billing channels write in).
 *
 * Layout integration: rendered in the right section of Layout.tsx
 * (and DashboardLayout, follow-up) just before the user avatar. Only
 * visible to authenticated users.
 *
 * SWC: var + function() form for compat with the rest of the codebase.
 */

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, BellOff, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'

interface NotificationRow {
  id: string
  type: string
  title: string
  body: string | null
  link_url: string | null
  created_at: string
}

function timeAgo(iso: string): string {
  var then = new Date(iso).getTime()
  var diff = (Date.now() - then) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago'
  if (diff < 2592000) return Math.floor(diff / 604800) + 'w ago'
  return new Date(iso).toLocaleDateString()
}

export default function NotificationsBell() {
  var [open, setOpen] = useState(false)
  var [items, setItems] = useState<NotificationRow[]>([])
  var [loading, setLoading] = useState(false)
  var [hasLoaded, setHasLoaded] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var containerRef = useRef<HTMLDivElement | null>(null)

  // Lazy-fetch on first open so unauthed users / users who never click
  // the bell don't pay the network cost.
  useEffect(function () {
    if (!open || hasLoaded) return
    var cancelled = false
    setLoading(true)
    setError(null)
    ;(async function () {
      try {
        var { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          if (!cancelled) {
            setItems([])
            setHasLoaded(true)
            setLoading(false)
          }
          return
        }
        var resp = await fetch('/api/notifications/recent', {
          headers: { Authorization: 'Bearer ' + session.access_token },
        })
        if (!resp.ok) throw new Error('Failed to load')
        var data = await resp.json()
        if (!cancelled) {
          setItems(data.notifications || [])
          setHasLoaded(true)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load notifications')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return function () { cancelled = true }
  }, [open, hasLoaded])

  // Click-outside to close.
  useEffect(function () {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return function () { document.removeEventListener('mousedown', onDocClick) }
  }, [open])

  // ESC to close.
  useEffect(function () {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return function () { document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={function () { setOpen(function (o) { return !o }) }}
        className={classNames(
          'flex items-center justify-center w-10 h-10 rounded-lg transition-colors',
          open
            ? 'text-white bg-white/10'
            : 'text-gray-400 hover:text-white hover:bg-white/10'
        )}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-gray-900/98 backdrop-blur border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {items.length > 0 && (
              <span className="text-[11px] text-gray-500">{items.length} recent</span>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                Loading…
              </div>
            )}

            {!loading && error && (
              <div className="px-4 py-8 text-center text-sm text-red-300">
                {error}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="px-4 py-10 text-center">
                <BellOff className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-300 font-medium">You&apos;re all caught up</p>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                  We&apos;ll surface Signal Alerts and digest activity here as it comes in.
                </p>
              </div>
            )}

            {!loading && !error && items.length > 0 && (
              <ul className="divide-y divide-white/5">
                {items.map(function (n) {
                  var Content = (
                    <div className="px-4 py-3 hover:bg-white/[0.04] transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-white font-medium leading-snug">{n.title}</p>
                        <span className="text-[10px] text-gray-500 whitespace-nowrap mt-0.5">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">{n.body}</p>
                      )}
                      {n.link_url && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-purple-300 mt-1.5">
                          Open <ExternalLink className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  )
                  return (
                    <li key={n.id}>
                      {n.link_url ? (
                        <Link href={n.link_url} onClick={function () { setOpen(false) }} className="block">
                          {Content}
                        </Link>
                      ) : (
                        Content
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-white/10 bg-black/20 text-center">
            <Link
              href="/profile"
              onClick={function () { setOpen(false) }}
              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Notification preferences →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
