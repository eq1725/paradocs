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
import { Heart, Loader2 } from 'lucide-react'

interface Props {
  slug: string
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

  var label = (function () {
    if (resonated) return 'You felt this too'
    if (count === 0) return 'I had something like this'
    if (count === 1) return '1 person felt this too'
    return count.toLocaleString() + ' people felt this too'
  })()

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || loading}
      aria-pressed={resonated}
      aria-label={resonated ? 'Remove your resonance' : 'Mark that this resonates with your experience'}
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
