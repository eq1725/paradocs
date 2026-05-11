'use client'

/**
 * /circles — V10 Phase 4.B
 *
 * The signed-in user's Match Circles. Renders the list with
 * member counts + last-activity timestamps + a tap-into-thread
 * affordance.
 */

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Users, Activity, Loader2, ArrowRight } from 'lucide-react'

interface CircleRow {
  circle_id: string
  name: string | null
  member_count: number
  active_count: number
  last_message_at: string | null
  joined_at: string
}

export default function MyCirclesPage() {
  var [loading, setLoading] = useState(true)
  var [signedIn, setSignedIn] = useState(false)
  var [circles, setCircles] = useState<CircleRow[]>([])

  useEffect(function () {
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session) { setSignedIn(false); setLoading(false); return }
      setSignedIn(true)
      fetch('/api/circles', { headers: { Authorization: 'Bearer ' + session.access_token } })
        .then(function (r) { return r.ok ? r.json() : null })
        .then(function (data) { setCircles((data && data.circles) || []) })
        .finally(function () { setLoading(false) })
    })
  }, [])

  function lastActiveLabel(iso: string | null): string {
    if (!iso) return 'No activity yet'
    var diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago'
    return new Date(iso).toLocaleDateString()
  }

  return (
    <>
      <Head><title>Match Circles · Paradocs</title></Head>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-5 h-5 text-purple-300" />
          <h1 className="text-2xl font-bold">Match Circles</h1>
        </div>
        <p className="text-sm text-gray-400 mb-8 leading-relaxed">
          Small auto-curated groups of experiencers who share your fingerprint. Each circle holds 5–10 members.
        </p>

        {!signedIn && !loading ? (
          <div className="p-6 bg-gray-900/50 border border-gray-800/60 rounded-xl text-center">
            <p className="text-sm text-gray-300 mb-3">Sign in to see your circles.</p>
            <Link href="/login?redirect=%2Fcircles" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold">Sign in</Link>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
        ) : circles.length === 0 ? (
          <div className="p-6 bg-gray-900/50 border border-gray-800/60 rounded-xl">
            <p className="text-sm text-gray-300 leading-relaxed mb-3">
              You&rsquo;re not in any circles yet. Once you opt into peer matching from the post-RADAR screen and you&rsquo;ve shared a report,
              our nightly curation will place you into a circle with up to 9 other experiencers who share your phenomenon&rsquo;s fingerprint.
            </p>
            <Link href="/lab?tab=signal" className="inline-flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200 underline">
              Open Your Signal →
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {circles.map(function (c) {
              var label = c.name || 'Experiencer Circle'
              return (
                <li key={c.circle_id}>
                  <Link
                    href={'/circles/' + c.circle_id}
                    className="block p-4 bg-gray-900/50 border border-gray-800/60 rounded-xl hover:border-purple-500/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">{label}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {c.member_count} member{c.member_count === 1 ? '' : 's'}
                          </span>
                          <span className="text-gray-700">·</span>
                          <span>{c.active_count} active this week</span>
                          <span className="text-gray-700">·</span>
                          <span>Last activity {lastActiveLabel(c.last_message_at)}</span>
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
