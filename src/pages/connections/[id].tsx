'use client'

/**
 * /connections/[id] — V9.13 Phase 3.C
 *
 * Thread view for one established connection. Polls /messages
 * every 8 seconds for new messages (V1 simplicity; can upgrade to
 * realtime via Supabase channels later). Author can edit / soft-
 * delete their own messages (Phase 2 — not exposed in UI yet).
 *
 * SWC compat: var + function() form.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Send, Loader2, AlertCircle, Lock } from 'lucide-react'

interface Message {
  id: string
  sender_id: string
  body: string
  status: 'approved' | 'pending' | 'rejected'
  moderation_reason: string | null
  read_at: string | null
  created_at: string
}

export default function ConnectionThreadPage() {
  var router = useRouter()
  var idParam = String(router.query.id || '')
  var [messages, setMessages] = useState<Message[]>([])
  var [loading, setLoading] = useState(true)
  var [signedIn, setSignedIn] = useState(false)
  var [userId, setUserId] = useState<string | null>(null)
  var [body, setBody] = useState('')
  var [sending, setSending] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [active, setActive] = useState(true)
  var [moderationReject, setModerationReject] = useState<string | null>(null)
  var listEndRef = useRef<HTMLDivElement | null>(null)

  var load = useCallback(function () {
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session) { setSignedIn(false); setLoading(false); return }
      setSignedIn(true)
      setUserId(session.user.id)
      fetch('/api/connections/' + idParam + '/messages', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Failed to load thread')) })
        .then(function (data) {
          setMessages(data.messages || [])
          setActive(!!data.connection_active)
        })
        .catch(function (e) { setError(e.message || 'Failed to load') })
        .finally(function () { setLoading(false) })
    })
  }, [idParam])

  useEffect(function () {
    if (!idParam) return
    load()
    var interval = setInterval(load, 8000)
    return function () { clearInterval(interval) }
  }, [idParam, load])

  // Auto-scroll to the bottom when new messages arrive.
  useEffect(function () {
    if (listEndRef.current) listEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    var trimmed = body.trim()
    if (trimmed.length < 1 || sending) return
    setSending(true)
    setError(null)
    setModerationReject(null)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session ? s.data.session.access_token : null
      if (!token) { setError('Sign in to send'); setSending(false); return }
      var resp = await fetch('/api/connections/' + idParam + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ body: trimmed }),
      })
      var data = await resp.json()
      if (!resp.ok) {
        setError(data.error || 'Failed to send')
      } else if (data.message && data.message.status === 'rejected') {
        setModerationReject(data.message.moderation_reason || 'Your message didn’t pass review.')
      } else if (data.message) {
        setMessages(function (prev) { return prev.concat([data.message]) })
        setBody('')
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Head><title>Conversation · Paradocs</title></Head>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 text-white flex flex-col" style={{ minHeight: 'calc(100dvh - 100px)' }}>
        <Link href="/connections" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to connections
        </Link>

        {!signedIn && !loading ? (
          <p className="text-sm text-gray-400">Sign in to view this conversation.</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-12 flex-1"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <>
            <div className="bg-gray-900/30 border border-gray-800/60 rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-gray-400">
              <Lock className="w-3 h-3 text-purple-400" />
              <span>Private conversation. Both parties moderated for abuse and doxxing.</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
              {messages.length === 0 ? (
                <p className="text-sm text-gray-500 italic text-center py-12">No messages yet.</p>
              ) : (
                messages.map(function (m) {
                  var mine = m.sender_id === userId
                  return (
                    <div key={m.id} className={'flex ' + (mine ? 'justify-end' : 'justify-start')}>
                      <div className={
                        'max-w-[80%] rounded-xl px-3 py-2 ' +
                        (m.status === 'rejected'
                          ? 'bg-amber-950/30 border border-amber-800/40 text-amber-100'
                          : mine
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-800 text-gray-100')
                      }>
                        <p className="text-sm whitespace-pre-line leading-relaxed">{m.body}</p>
                        {m.status === 'rejected' && (
                          <p className="text-[10px] mt-1 opacity-80">
                            Not sent — didn’t pass review{m.moderation_reason ? ': ' + m.moderation_reason : '.'}
                          </p>
                        )}
                        <p className={'text-[10px] mt-1 ' + (mine ? 'text-purple-200/70' : 'text-gray-400')}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={listEndRef} />
            </div>

            {active ? (
              <form onSubmit={sendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={body}
                  onChange={function (e) { setBody(e.target.value) }}
                  placeholder="Message…"
                  maxLength={2000}
                  className="flex-1 bg-gray-900/80 border border-gray-700 rounded-full px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  disabled={sending || body.trim().length < 1}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white"
                  aria-label="Send"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            ) : (
              <div className="text-center text-xs text-gray-500 italic py-3 border-t border-white/5">
                This connection is no longer active.
              </div>
            )}
            {moderationReject && (
              <p className="text-[11px] text-amber-300 mt-2 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" /> {moderationReject}
              </p>
            )}
          </>
        )}
      </div>
    </>
  )
}
