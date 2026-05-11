'use client'

/**
 * ReportComments — V9.12 Phase 2.D
 *
 * Public comment thread for a single report. Anyone can read;
 * signed-in users can post. New comments run through the
 * text-moderation service before publish — rejected comments are
 * shown only to their author with a "didn't pass review" note.
 *
 * V1 rendering rule: depth-0 + depth-1 only. Replies to replies
 * collapse up to the parent. Deeper nesting is V2.
 *
 * SWC compat: var + function() form.
 */

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { MessageCircle, Send, Reply, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import ResonanceButton from './ResonanceButton'

interface Author {
  user_id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface Comment {
  id: string
  parent_id: string | null
  body: string
  created_at: string
  edited_at: string | null
  author: Author
  status?: 'approved' | 'pending' | 'rejected'
  moderation_reason?: string | null
}

interface Props {
  slug: string
}

var MAX_BODY = 2000
var MIN_BODY = 1

export default function ReportComments(props: Props) {
  var [comments, setComments] = useState<Comment[]>([])
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [signedInUserId, setSignedInUserId] = useState<string | null>(null)
  var [body, setBody] = useState('')
  var [parentId, setParentId] = useState<string | null>(null)
  var [posting, setPosting] = useState(false)
  var [postError, setPostError] = useState<string | null>(null)
  var [rejectedNotice, setRejectedNotice] = useState<{ reason: string | null } | null>(null)

  var load = useCallback(function () {
    setLoading(true)
    setError(null)
    fetch('/api/reports/' + props.slug + '/comments')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Failed to load')) })
      .then(function (data) { setComments(data.comments || []) })
      .catch(function (e) { setError(e.message || 'Failed to load comments') })
      .finally(function () { setLoading(false) })
  }, [props.slug])

  useEffect(function () {
    load()
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      setSignedInUserId(session ? session.user.id : null)
    })
  }, [load])

  async function postComment(e: React.FormEvent) {
    e.preventDefault()
    if (body.trim().length < MIN_BODY) return
    setPosting(true)
    setPostError(null)
    setRejectedNotice(null)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session ? s.data.session.access_token : null
      if (!token) { setPostError('Sign in to comment.'); setPosting(false); return }
      var resp = await fetch('/api/reports/' + props.slug + '/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ body: body.trim(), parent_id: parentId }),
      })
      var data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to post')
      var newComment: Comment = data.comment
      if (newComment.status === 'rejected') {
        setRejectedNotice({ reason: newComment.moderation_reason || null })
        // Don't add to the visible thread; rejected comments aren't public.
      } else {
        setComments(function (prev) { return prev.concat([newComment]) })
      }
      setBody('')
      setParentId(null)
    } catch (e: any) {
      setPostError(e.message || 'Failed to post comment')
    } finally {
      setPosting(false)
    }
  }

  async function softDelete(id: string) {
    if (!confirm('Delete this comment?')) return
    var s = await supabase.auth.getSession()
    var token = s.data.session ? s.data.session.access_token : null
    if (!token) return
    var resp = await fetch('/api/reports/' + props.slug + '/comments/' + id, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    })
    if (resp.ok) {
      setComments(function (prev) { return prev.filter(function (c) { return c.id !== id }) })
    }
  }

  // Group: top-level + their replies (V1 depth limit = 1).
  var topLevel = comments.filter(function (c) { return !c.parent_id })
  var repliesByParent: Record<string, Comment[]> = {}
  comments.forEach(function (c) {
    if (c.parent_id) {
      if (!repliesByParent[c.parent_id]) repliesByParent[c.parent_id] = []
      repliesByParent[c.parent_id].push(c)
    }
  })
  // Flatten replies-of-replies up to their nearest depth-1 ancestor.
  topLevel.forEach(function (t) {
    var direct = repliesByParent[t.id] || []
    direct.forEach(function (child) {
      var grand = repliesByParent[child.id]
      if (grand) {
        repliesByParent[t.id] = (repliesByParent[t.id] || []).concat(grand)
      }
    })
  })

  return (
    <section className="mt-12 pt-8 border-t border-white/10">
      {/* V10 Phase 4.A — Resonance sits above the Discussion
          header so the one-tap social signal is the first thing
          users see after the article. Lower-friction than typing
          a comment; aggregates a louder social proof number. */}
      <div className="mb-6">
        <ResonanceButton slug={props.slug} />
      </div>

      <div className="flex items-center gap-2 mb-6">
        <MessageCircle className="w-5 h-5 text-purple-300" />
        <h2 className="text-lg font-semibold text-white">
          Discussion
          {comments.length > 0 && <span className="text-gray-500 font-normal"> · {comments.length}</span>}
        </h2>
      </div>

      {/* Composer */}
      {signedInUserId ? (
        <form onSubmit={postComment} className="mb-8">
          {parentId && (
            <div className="flex items-center justify-between mb-2 text-xs text-purple-300 bg-purple-950/30 border border-purple-800/40 rounded-lg px-3 py-1.5">
              <span>Replying to a comment</span>
              <button type="button" onClick={function () { setParentId(null) }} className="text-purple-200 hover:text-white">Cancel</button>
            </div>
          )}
          <textarea
            value={body}
            onChange={function (e) { setBody(e.target.value) }}
            placeholder="Add to the discussion…"
            maxLength={MAX_BODY}
            rows={3}
            className="w-full bg-gray-900/80 border border-gray-700 rounded-xl p-3 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 leading-relaxed resize-y"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-gray-500">
              {body.length} / {MAX_BODY} &middot; Comments are reviewed for abuse and doxxing.
            </p>
            <button
              type="submit"
              disabled={posting || body.trim().length < MIN_BODY}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
            >
              {posting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
          {postError && (
            <p className="text-xs text-red-300 mt-2 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" /> {postError}
            </p>
          )}
          {rejectedNotice && (
            <div className="mt-3 p-3 bg-amber-950/20 border border-amber-800/40 rounded-lg">
              <p className="text-xs text-amber-200 font-medium">Your comment didn&rsquo;t pass review.</p>
              {rejectedNotice.reason && (
                <p className="text-xs text-amber-100/70 mt-1">{rejectedNotice.reason}</p>
              )}
              <p className="text-[11px] text-amber-100/50 mt-2">
                We review for abuse, doxxing, and content targeting individuals.
                Edit and try again, or reach out at hello@discoverparadocs.com.
              </p>
            </div>
          )}
        </form>
      ) : (
        <div className="mb-8 p-4 bg-gray-900/50 border border-gray-800/60 rounded-xl text-center">
          <p className="text-sm text-gray-300 mb-2">Sign in to join the discussion.</p>
          <Link
            href={'/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors"
          >
            Sign in
          </Link>
        </div>
      )}

      {/* Thread */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : topLevel.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No comments yet. Be the first to share what you noticed.
        </p>
      ) : (
        <ul className="space-y-5">
          {topLevel.map(function (c) {
            return (
              <CommentNode
                key={c.id}
                comment={c}
                replies={repliesByParent[c.id] || []}
                signedInUserId={signedInUserId}
                onReply={function () { setParentId(c.id) }}
                onDelete={softDelete}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}

function CommentNode(props: {
  comment: Comment
  replies: Comment[]
  signedInUserId: string | null
  onReply: () => void
  onDelete: (id: string) => void
}) {
  var c = props.comment
  var isOwn = props.signedInUserId === c.author.user_id
  return (
    <li>
      <CommentRow comment={c} isOwn={isOwn} onReply={props.onReply} onDelete={props.onDelete} />
      {props.replies.length > 0 && (
        <ul className="mt-3 ml-10 space-y-3 border-l-2 border-white/5 pl-4">
          {props.replies.map(function (r) {
            return (
              <li key={r.id}>
                <CommentRow
                  comment={r}
                  isOwn={props.signedInUserId === r.author.user_id}
                  onReply={undefined}
                  onDelete={props.onDelete}
                />
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

function CommentRow(props: {
  comment: Comment
  isOwn: boolean
  onReply?: () => void
  onDelete: (id: string) => void
}) {
  var c = props.comment
  var displayName = c.author.display_name || c.author.username || 'Anonymous'
  var when = (function () {
    var d = new Date(c.created_at)
    if (isNaN(d.getTime())) return ''
    var now = Date.now()
    var diff = (now - d.getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago'
    return d.toLocaleDateString()
  })()
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center text-xs text-gray-400">
        {c.author.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.author.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          (displayName[0] || '?').toUpperCase()
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {c.author.username ? (
            <Link href={'/researcher/' + c.author.username} className="text-sm font-medium text-white hover:text-purple-300 transition-colors">
              {displayName}
            </Link>
          ) : (
            <span className="text-sm font-medium text-white">{displayName}</span>
          )}
          <span className="text-[11px] text-gray-500">{when}</span>
          {c.edited_at && <span className="text-[10px] text-gray-600">(edited)</span>}
        </div>
        <p className="text-sm text-gray-200 leading-relaxed mt-1 whitespace-pre-line break-words">{c.body}</p>
        <div className="flex items-center gap-3 mt-1.5">
          {props.onReply && (
            <button onClick={props.onReply} className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
              <Reply className="w-3 h-3" /> Reply
            </button>
          )}
          {props.isOwn && (
            <button onClick={function () { props.onDelete(c.id) }} className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-300 transition-colors">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
