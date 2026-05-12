'use client'

/**
 * ResonanceButton — V10 Phase 4.A
 *
 * One-tap social signal on /report/[slug]. Reads + toggles via
 * /api/reports/[slug]/resonate. Optimistic update with rollback
 * on error. Public count is always visible; signed-out users
 * can see the count but a tap routes them to /login with the
 * report path preserved.
 *
 * SWC-friendly: var + function() form.
 */

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { Heart, Loader2, ArrowRight } from 'lucide-react'

interface Props {
  slug: string
  /**
   * V10.6.2 — 'pill' is the original treatment used inside the
   * Lab and other compact contexts. 'prominent' is the new
   * above-fold bar with full-width container, larger label, and
   * a "Share your own" sub-CTA. Use 'prominent' on /report/[slug]
   * where Resonance is the page's highest-conversion social action.
   */
  variant?: 'pill' | 'prominent'
}

export default function ResonanceButton(props: Props) {
  var router = useRouter()
  var [count, setCount] = useState<number>(0)
  var [resonated, setResonated] = useState<boolean>(false)
  var [loading, setLoading] = useState<boolean>(true)
  var [busy, setBusy] = useState<boolean>(false)
  var [signedIn, setSignedIn] = useState<boolean>(false)

  var load = useCallback(function () {
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      setSignedIn(!!session)
      var headers: Record<string, string> = {}
      if (session) headers['Authorization'] = 'Bearer ' + session.access_token
      fetch('/api/reports/' + props.slug + '/resonate', { headers: headers })
        .then(function (r) { return r.ok ? r.json() : null })
        .then(function (data) {
          if (data) {
            setCount(data.count || 0)
            setResonated(!!data.resonated)
          }
        })
        .finally(function () { setLoading(false) })
    })
  }, [props.slug])

  useEffect(function () { load() }, [load])

  async function toggle() {
    if (busy) return
    if (!signedIn) {
      // Route to /login preserving the report path.
      var dest = typeof window !== 'undefined' ? window.location.pathname : '/'
      router.push('/login?redirect=' + encodeURIComponent(dest))
      return
    }
    // Optimistic update.
    var prevResonated = resonated
    var prevCount = count
    var nextResonated = !resonated
    setResonated(nextResonated)
    setCount(prevCount + (nextResonated ? 1 : -1))
    setBusy(true)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session ? s.data.session.access_token : null
      if (!token) throw new Error('No session')
      var resp = await fetch('/api/reports/' + props.slug + '/resonate', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!resp.ok) throw new Error('Failed to update')
      var data = await resp.json()
      setCount(data.count || 0)
      setResonated(!!data.resonated)
    } catch (_) {
      // Roll back.
      setResonated(prevResonated)
      setCount(prevCount)
    } finally {
      setBusy(false)
    }
  }

  // V10.6 — copy revision per Chase: "I had something like this"
  // is a fragment. Complete sentence reads more naturally.
  var label = (function () {
    if (resonated) return 'You’ve experienced this too'
    if (count === 0) return 'I’ve experienced something like this'
    if (count === 1) return '1 person has experienced this too'
    return count.toLocaleString() + ' people have experienced this too'
  })()

  // V10.6.2 — prominent bar treatment. Above-fold on the report
  // page; gives Resonance the visual weight its conversion rate
  // deserves. Below the button: a "Share your own experience"
  // link (G., growth) so the natural next action is one tap away.
  if (props.variant === 'prominent') {
    return (
      <div className="my-6 rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-950/30 via-gray-900/40 to-gray-900/40 p-4">
        <button
          type="button"
          onClick={toggle}
          disabled={busy || loading}
          aria-pressed={resonated}
          aria-label={resonated ? 'Remove your resonance' : 'Mark that this resonates with your experience'}
          title={resonated
            ? 'Tap to remove. We won’t share your name — only the aggregate count goes public.'
            : 'Tap to signal you’ve had a similar experience. Helps Paradocs surface patterns. Your name is never shared — only the count.'}
          className={
            'w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition-colors min-h-[48px] ' +
            (resonated
              ? 'bg-rose-500/25 border border-rose-400/60 text-rose-100 hover:bg-rose-500/35'
              : 'bg-rose-500/10 border border-rose-500/40 text-rose-100 hover:bg-rose-500/20')
          }
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Heart className={'w-4 h-4 ' + (resonated ? 'fill-rose-300' : '')} />
          )}
          <span>{label}</span>
        </button>
        <p className="text-[11px] text-gray-500 text-center mt-2 leading-relaxed">
          We never share your name — only the aggregate count goes public.
        </p>
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex justify-center">
          <Link
            href="/start"
            className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200 font-medium transition-colors"
          >
            Share your own experience
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || loading}
      aria-pressed={resonated}
      aria-label={resonated ? 'Remove your resonance' : 'Mark that this resonates with your experience'}
      title={resonated
        ? 'Tap to remove. We won’t share your name — only the aggregate count goes public.'
        : 'Tap to signal you’ve had a similar experience. Helps Paradocs surface patterns. Your name is never shared — only the count.'}
      className={
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ' +
        (resonated
          ? 'bg-rose-500/15 border border-rose-400/40 text-rose-200 hover:bg-rose-500/25'
          : 'bg-gray-900/50 border border-gray-700/60 text-gray-300 hover:border-rose-400/40 hover:text-rose-200')
      }
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Heart className={'w-3.5 h-3.5 ' + (resonated ? 'fill-rose-300' : '')} />
      )}
      <span>{label}</span>
    </button>
  )
}
