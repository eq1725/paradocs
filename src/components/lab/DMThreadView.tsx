'use client'

// V11.17.73 — Named-Match + DM
//
// DMThreadView — a single 1:1 thread view with chronological message
// bubbles + composer. Used inside DMThreadsList as the expanded panel,
// or standalone via the parent.
//
// V1 surface:
//   - Header row: counterparty display_name, "Close" affordance, state badge
//   - Documentary system message (rendered statically since the server
//     seeds one when the thread opens; we render it inline if it's the
//     first message and is sent by the counterparty).
//   - Scrollable message list (chronological)
//   - Composer: ≤2000 char textarea, Send button, char counter, error toast
//
// Rules-of-Hooks compliance: all hooks at top; gating after.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Lock, Send, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface DMMessage {
  id: number
  sender_user_id: string
  body: string
  sent_at: string
  read_at: string | null
}

interface DMThread {
  id: string
  state: 'open' | 'closed'
  created_at: string
  last_message_at: string
  closed_at: string | null
  closed_by: string | null
  counterparty: { user_id: string; display_name: string }
  your_user_id: string
}

interface Props {
  threadId: string
  /** Optional close callback when the user closes the thread. */
  onClosed?: () => void
}

var MAX_BODY = 2000

export function DMThreadView(props: Props) {
  // All hooks first.
  var [thread, setThread] = useState<DMThread | null>(null)
  var [messages, setMessages] = useState<DMMessage[]>([])
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [body, setBody] = useState('')
  var [sending, setSending] = useState(false)
  var [closing, setClosing] = useState(false)
  var scrollerRef = useRef<HTMLDivElement | null>(null)

  var reload = useCallback(async function () {
    setLoading(true)
    setError(null)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) { setError('not_authenticated'); setLoading(false); return }
      var resp = await fetch('/api/lab/named-match/threads/' + props.threadId, {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!resp.ok) {
        var msg = 'fetch_failed'
        try { var b = await resp.json(); msg = b.error || msg } catch (_e) {}
        setError(msg); setLoading(false); return
      }
      var json = await resp.json()
      setThread(json.thread as DMThread)
      setMessages((json.messages || []) as DMMessage[])
      setLoading(false)
      // Mark unread messages from counterparty as read. Fire-and-forget.
      fetch('/api/lab/named-match/threads/' + props.threadId + '/messages/read', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      }).catch(function () { /* ignore */ })
    } catch (e: any) {
      setError(String(e && e.message || e))
      setLoading(false)
    }
  }, [props.threadId])

  useEffect(function () { reload() }, [reload])

  // Auto-scroll to bottom whenever messages change.
  useEffect(function () {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [messages.length])

  var send = useCallback(async function () {
    if (!body.trim() || sending || !thread) return
    setSending(true)
    setError(null)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) { setError('not_authenticated'); setSending(false); return }
      var resp = await fetch('/api/lab/named-match/threads/' + props.threadId + '/messages', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body }),
      })
      if (!resp.ok) {
        var msg = 'send_failed'
        try { var b = await resp.json(); msg = b.error || msg } catch (_e) {}
        setError(msg); setSending(false); return
      }
      setBody('')
      setSending(false)
      reload()
    } catch (e: any) {
      setError(String(e && e.message || e))
      setSending(false)
    }
  }, [body, sending, thread, props.threadId, reload])

  var close = useCallback(async function () {
    if (closing || !thread) return
    if (!window.confirm('Close this thread? Either party may close at any time. The thread becomes read-only for both.')) return
    setClosing(true)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) { setClosing(false); return }
      var resp = await fetch('/api/lab/named-match/threads/' + props.threadId + '/close', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      })
      if (resp.ok) {
        if (props.onClosed) props.onClosed()
        reload()
      }
      setClosing(false)
    } catch (_e) {
      setClosing(false)
    }
  }, [closing, thread, props, reload])

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/5 bg-gray-950/40 p-5">
        <div className="h-4 w-1/3 bg-white/5 rounded animate-pulse" />
      </div>
    )
  }

  if (!thread || error) {
    return (
      <div className="rounded-2xl border border-white/5 bg-gray-950/40 p-5">
        <p className="text-sm text-gray-400">Could not load this thread{error ? (': ' + error) : '.'}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-gray-950/40 flex flex-col" style={{ minHeight: 400, maxHeight: 600 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-300/90 mb-0.5">
            Private thread
          </p>
          <p className="text-sm text-white font-semibold">{thread.counterparty.display_name}</p>
        </div>
        <div className="flex items-center gap-2">
          {thread.state === 'closed' ? (
            <span className="text-xs text-gray-500 inline-flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              Closed
            </span>
          ) : (
            <button
              type="button"
              onClick={close}
              disabled={closing}
              className="text-xs text-gray-400 hover:text-white inline-flex items-center gap-1 px-2 py-1 rounded border border-white/5 hover:bg-white/5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              {closing ? 'Closing…' : 'Close thread'}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">No messages yet.</p>
        ) : (
          messages.map(function (m) {
            var fromYou = m.sender_user_id === thread!.your_user_id
            return (
              <div key={m.id} className={'flex ' + (fromYou ? 'justify-end' : 'justify-start')}>
                <div
                  className={
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ' +
                    (fromYou
                      ? 'bg-purple-600/30 border border-purple-500/30 text-purple-50'
                      : 'bg-gray-900/60 border border-white/5 text-gray-100')
                  }
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {new Date(m.sent_at).toLocaleString()}
                    {fromYou && m.read_at && <span className="ml-1.5">· read</span>}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Composer */}
      {thread.state === 'open' ? (
        <div className="px-5 py-3 border-t border-white/5">
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={function (e) { setBody(e.target.value.slice(0, MAX_BODY)) }}
              placeholder="Write a message…"
              className="flex-1 bg-gray-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/40 resize-none"
              rows={2}
              maxLength={MAX_BODY}
              onKeyDown={function (e) {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  send()
                }
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || body.trim().length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-gray-500">Text only. {MAX_BODY - body.length} characters left.</span>
            <span className="text-[10px] text-gray-500">⌘/Ctrl + Enter to send</span>
          </div>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
      ) : (
        <div className="px-5 py-3 border-t border-white/5 text-xs text-gray-500">
          This thread is closed. Messages remain readable for both contributors.
        </div>
      )}
    </div>
  )
}

export default DMThreadView
