'use client'

/**
 * /connections — V9.13 Phase 3.C
 *
 * Inbox + active connections list. Two stacked sections:
 *   1. Pending incoming requests — Accept / Decline buttons inline
 *   2. Active connections — tap to open the thread at /connections/[id]
 *
 * Auth-gated; signed-out users get a sign-in CTA.
 *
 * SWC compat: var + function() form.
 */

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { Users, Inbox, Check, X, Loader2, MessageCircle, ArrowRight } from 'lucide-react'

interface PendingRequest {
  id: string
  created_at: string
  intro_message: string
  about_report: string | null
  from: {
    user_id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
  }
}

interface ConnectionRow {
  connection_id: string
  is_active: boolean
  created_at: string
  other_user_id: string
  other_username: string | null
  other_display_name: string | null
  other_avatar_url: string | null
}

export default function ConnectionsInboxPage() {
  var router = useRouter()
  var [loading, setLoading] = useState(true)
  var [signedIn, setSignedIn] = useState(false)
  var [requests, setRequests] = useState<PendingRequest[]>([])
  var [connections, setConnections] = useState<ConnectionRow[]>([])
  var [busyId, setBusyId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session) { setSignedIn(false); setLoading(false); return }
      setSignedIn(true)
      fetch('/api/connections/inbox', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Failed to load')) })
        .then(function (data) {
          setRequests(data.requests || [])
          setConnections(data.connections || [])
        })
        .catch(function () {})
        .finally(function () { setLoading(false) })
    })
  }

  useEffect(function () { load() }, [])

  async function respond(requestId: string, action: 'accept' | 'decline') {
    setBusyId(requestId)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session ? s.data.session.access_token : null
      if (!token) return
      var resp = await fetch('/api/connections/' + requestId + '/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: action }),
      })
      var data = await resp.json()
      if (resp.ok) {
        if (action === 'accept' && data.connection_id) {
          router.push('/connections/' + data.connection_id)
          return
        }
        load()
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Head>
        <title>Connections · Paradocs</title>
      </Head>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 text-white">
        <div className="flex items-center gap-2 mb-6">
          <Users className="w-5 h-5 text-purple-300" />
          <h1 className="text-2xl font-bold">Connections</h1>
        </div>

        {!signedIn && !loading ? (
          <div className="p-6 bg-gray-900/50 border border-gray-800/60 rounded-xl text-center">
            <p className="text-sm text-gray-300 mb-3">Sign in to see your inbox.</p>
            <Link href="/login?redirect=%2Fconnections" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold">Sign in</Link>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        ) : (
          <>
            {/* Pending requests */}
            <section className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <Inbox className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400">
                  Incoming requests
                  {requests.length > 0 && <span className="text-purple-400 font-normal"> · {requests.length}</span>}
                </h2>
              </div>
              {requests.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No pending requests.</p>
              ) : (
                <ul className="space-y-3">
                  {requests.map(function (r) {
                    var name = r.from.display_name || r.from.username || 'A fellow experiencer'
                    return (
                      <li key={r.id} className="p-4 bg-gray-900/50 border border-gray-800/60 rounded-xl">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center text-sm text-gray-400">
                            {r.from.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.from.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              (name[0] || '?').toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white">{name} wants to connect</p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {new Date(r.created_at).toLocaleDateString()}
                            </p>
                            <blockquote className="mt-2 text-sm text-gray-200 italic border-l-2 border-purple-500/50 pl-3 whitespace-pre-line">
                              {r.intro_message}
                            </blockquote>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-white/5">
                          <button
                            type="button"
                            onClick={function () { respond(r.id, 'decline') }}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium disabled:opacity-40"
                          >
                            <X className="w-3 h-3" /> Decline
                          </button>
                          <button
                            type="button"
                            onClick={function () { respond(r.id, 'accept') }}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold disabled:opacity-40"
                          >
                            {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Accept
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Active connections */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <MessageCircle className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400">
                  Active
                  {connections.length > 0 && <span className="text-purple-400 font-normal"> · {connections.length}</span>}
                </h2>
              </div>
              {connections.length === 0 ? (
                <p className="text-sm text-gray-500 italic">
                  No connections yet. Reach out to someone from the &ldquo;People like you&rdquo; card in your{' '}
                  <Link href="/lab?tab=signal" className="text-purple-300 hover:text-purple-200 underline">Your Signal</Link> tab.
                </p>
              ) : (
                <ul className="space-y-2">
                  {connections.map(function (c) {
                    var name = c.other_display_name || c.other_username || 'A connection'
                    return (
                      <li key={c.connection_id}>
                        <Link
                          href={'/connections/' + c.connection_id}
                          className="flex items-center gap-3 p-3 bg-gray-900/50 border border-gray-800/60 rounded-xl hover:border-purple-500/40 transition-colors"
                        >
                          <div className="w-9 h-9 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center text-sm text-gray-400">
                            {c.other_avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.other_avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              (name[0] || '?').toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white truncate">{name}</p>
                            <p className="text-[11px] text-gray-500">Connected {new Date(c.created_at).toLocaleDateString()}</p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-gray-500" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </>
  )
}
