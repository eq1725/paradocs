'use client'

/**
 * /circles/[id] — V10 Phase 4.B
 *
 * Circle thread + roster. Polls /messages every 8s. Roster
 * collapsed by default into a header strip; tap to expand
 * the full member list with avatars. Leave + Mute affordances
 * in a header menu.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Send, Loader2, Users, MoreVertical, LogOut, BellOff, Bell } from 'lucide-react'

interface Message {
  id: string
  sender_id: string
  body: string
  status: 'approved' | 'pending' | 'rejected'
  moderation_reason: string | null
  created_at: string
  author: {
    username: string | null
    display_name: string | null
    avatar_url: string | null
  }
}

interface Member {
  user_id: string
  role: string
  joined_at: string
  last_active_at: string | null
  is_me: boolean
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface Circle {
  id: string
  name: string | null
  status: string
  member_count: number
  active_count: number
}

export default function CircleThreadPage() {
  var router = useRouter()
  var idParam = String(router.query.id || '')
  var [circle, setCircle] = useState<Circle | null>(null)
  var [members, setMembers] = useState<Member[]>([])
  var [me, setMe] = useState<{ role: string; muted_until: string | null } | null>(null)
  var [messages, setMessages] = useState<Message[]>([])
  var [loading, setLoading] = useState(true)
  var [signedIn, setSignedIn] = useState(false)
  var [userId, setUserId] = useState<string | null>(null)
  var [body, setBody] = useState('')
  var [sending, setSending] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [moderationReject, setModerationReject] = useState<string | null>(null)
  var [showRoster, setShowRoster] = useState(false)
  var [showMenu, setShowMenu] = useState(false)
  var listEndRef = useRef<HTMLDivElement | null>(null)

  var loadCircleAndRoster = useCallback(function (token: string) {
    return fetch('/api/circles/' + idParam, { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Failed to load circle')) })
      .then(function (data) {
        setCircle(data.circle)
        setMembers(data.members || [])
        setMe(data.me || null)
      })
  }, [idParam])

  var loadMessages = useCallback(function (token: string) {
    return fetch('/api/circles/' + idParam + '/messages', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Failed to load thread')) })
      .then(function (data) { setMessages(data.messages || []) })
  }, [idParam])

  useEffect(function () {
    if (!idParam) return
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session) { setSignedIn(false); setLoading(false); return }
      setSignedIn(true)
      setUserId(session.user.id)
      var token = session.access_token
      Promise.all([loadCircleAndRoster(token), loadMessages(token)])
        .catch(function (e) { setError(e.message || 'Failed to load') })
        .finally(function () { setLoading(false) })
      var interval = setInterval(function () {
        supabase.auth.getSession().then(function (s2) {
          var sess = s2.data.session
          if (sess) loadMessages(sess.access_token).catch(function () {})
        })
      }, 8000)
      return function () { clearInterval(interval) }
    })
  }, [idParam, loadCircleAndRoster, loadMessages])

  useEffect(function () {
    if (listEndRef.current) listEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    var trimmed = body.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    setModerationReject(null)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session ? s.data.session.access_token : null
      if (!token) { setError('Sign in to send'); return }
      var resp = await fetch('/api/circles/' + idParam + '/messages', {
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
        // Refetch the thread so author profile is hydrated.
        await loadMessages(token)
        setBody('')
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setSending(false)
    }
  }

  async function leave() {
    if (!confirm('Leave this circle? You can\'t rejoin the same circle for 30 days.')) return
    var s = await supabase.auth.getSession()
    var token = s.data.session ? s.data.session.access_token : null
    if (!token) return
    var resp = await fetch('/api/circles/' + idParam + '/leave', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    })
    if (resp.ok) router.push('/circles')
  }

  async function toggleMute() {
    var s = await supabase.auth.getSession()
    var token = s.data.session ? s.data.session.access_token : null
    if (!token) return
    var muted = me && me.muted_until && new Date(me.muted_until).getTime() > Date.now()
    var days = muted ? 0 : 30
    var resp = await fetch('/api/circles/' + idParam + '/mute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ days: days }),
    })
    if (resp.ok) {
      var data = await resp.json()
      setMe(function (prev) { return { role: prev ? prev.role : 'member', muted_until: data.muted_until } })
      setShowMenu(false)
    }
  }

  var isMuted = me && me.muted_until && new Date(me.muted_until).getTime() > Date.now()

  return (
    <>
      <Head><title>{(circle && circle.name) || 'Circle'} · Paradocs</title></Head>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 text-white flex flex-col" style={{ minHeight: 'calc(100dvh - 100px)' }}>
        <div className="flex items-center justify-between mb-4">
          <Link href="/circles" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          {signedIn && (
            <div className="relative">
              <button
                type="button"
                onClick={function () { setShowMenu(function (p) { return !p }) }}
                aria-label="Circle options"
                className="p-1.5 rounded-md hover:bg-white/5 text-gray-400 hover:text-white"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-1 w-44 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-10 overflow-hidden">
                  <button
                    onClick={toggleMute}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2"
                  >
                    {isMuted ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                    {isMuted ? 'Unmute notifications' : 'Mute for 30 days'}
                  </button>
                  <button
                    onClick={leave}
                    className="w-full text-left px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Leave circle
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {!signedIn && !loading ? (
          <p className="text-sm text-gray-400">Sign in to view this circle.</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-12 flex-1"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : circle ? (
          <>
            <div className="mb-3">
              <h1 className="text-xl font-bold">{circle.name || 'Experiencer Circle'}</h1>
              <button
                onClick={function () { setShowRoster(function (p) { return !p }) }}
                className="text-[11px] text-gray-400 hover:text-gray-200 inline-flex items-center gap-1 mt-1"
              >
                <Users className="w-3 h-3" />
                {circle.member_count} member{circle.member_count === 1 ? '' : 's'} · {circle.active_count} active this week
                <span className="ml-1 text-purple-300 underline">{showRoster ? 'Hide' : 'View'}</span>
              </button>
            </div>

            {showRoster && (
              <div className="mb-4 p-3 bg-gray-900/40 border border-gray-800/60 rounded-xl">
                <ul className="flex flex-wrap gap-2">
                  {members.map(function (m) {
                    var label = m.display_name || m.username || 'Anonymous'
                    return (
                      <li key={m.user_id} className="inline-flex items-center gap-1.5 bg-gray-800/60 rounded-full px-2 py-1 text-[11px] text-gray-200">
                        <span className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                          {m.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px]">{(label[0] || '?').toUpperCase()}</span>
                          )}
                        </span>
                        <span>{label}{m.is_me ? ' (you)' : ''}</span>
                        {m.role === 'moderator' && <span className="text-purple-300 text-[9px] uppercase tracking-widest">Mod</span>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
              {messages.length === 0 ? (
                <p className="text-sm text-gray-500 italic text-center py-12">No messages yet. Start the conversation.</p>
              ) : (
                messages.map(function (m) {
                  var mine = m.sender_id === userId
                  var name = m.author.display_name || m.author.username || 'Anonymous'
                  return (
                    <div key={m.id} className={'flex gap-2 ' + (mine ? 'justify-end' : 'justify-start')}>
                      {!mine && (
                        <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center text-[10px] text-gray-400 mt-1">
                          {m.author.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.author.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (name[0] || '?').toUpperCase()
                          )}
                        </div>
                      )}
                      <div className={
                        'max-w-[75%] rounded-xl px-3 py-2 ' +
                        (m.status === 'rejected'
                          ? 'bg-amber-950/30 border border-amber-800/40 text-amber-100'
                          : mine
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-800 text-gray-100')
                      }>
                        {!mine && <p className="text-[10px] font-semibold text-gray-400 mb-0.5">{name}</p>}
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

            <form onSubmit={sendMessage} className="flex gap-2">
              <input
                type="text"
                value={body}
                onChange={function (e) { setBody(e.target.value) }}
                placeholder="Message your circle…"
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
            {moderationReject && (
              <p className="text-[11px] text-amber-300 mt-2">{moderationReject}</p>
            )}
          </>
        ) : null}
      </div>
    </>
  )
}
