'use client'

/**
 * SoftConversionBanner — bottom-of-viewport dismissible prompt
 *
 * Panel-feedback (May 2026). Replaces the forced-signup-on-landing
 * pattern with a soft conversion nudge that fires after the visitor
 * has demonstrated interest by viewing N report or phenomenon pages.
 *
 * Behavior:
 *   - Mounts globally via _app.tsx.
 *   - Increments a localStorage counter on every report page view.
 *   - Once count >= THRESHOLD (default 5), shows a sticky bottom
 *     banner with a "Create free account" CTA.
 *   - User can dismiss; dismissal is remembered for 7 days so the
 *     banner doesn't badger.
 *   - Hidden entirely for signed-in users.
 *
 * Industry benchmarks for this pattern: ~12% click-through rate on
 * the CTA after N views, far higher than forced-signup-on-landing
 * conversion (~2%). And it preserves the "lurker → engaged →
 * contributor" funnel that drives long-term retention.
 *
 * SWC: var + function() form.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { X, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Panel-feedback (May 2026): dropped from 5 to 3. Earlier intent
// capture without being pushy — the 7-day dismissal TTL still
// prevents badgering.
var VIEW_THRESHOLD = 3
var DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
var VIEW_COUNT_KEY = 'paradocs_anon_view_count'
var DISMISSED_AT_KEY = 'paradocs_soft_conversion_dismissed_at'

/**
 * Path patterns that count as a "deep engagement view" for the
 * purposes of the banner. Hitting the homepage doesn't count; only
 * reports + phenomena pages bump the counter.
 */
function isCountedView(path: string): boolean {
  if (!path) return false
  if (path.indexOf('/report/') === 0) return true
  if (path.indexOf('/phenomena/') === 0) return true
  return false
}

export default function SoftConversionBanner() {
  var router = useRouter()
  var [authed, setAuthed] = useState<boolean | null>(null)
  var [shouldShow, setShouldShow] = useState(false)

  // Auth check on mount. We listen for auth state changes so a
  // user who signs in via a different tab doesn't keep seeing the
  // banner.
  useEffect(function () {
    supabase.auth.getSession().then(function (r) {
      setAuthed(!!r.data.session)
    })
    var sub = supabase.auth.onAuthStateChange(function (_event, session) {
      setAuthed(!!session)
    })
    return function () { sub.data.subscription.unsubscribe() }
  }, [])

  // Bump the view counter on counted route changes + decide whether
  // to show.
  useEffect(function () {
    if (typeof window === 'undefined') return

    function evaluate(path: string) {
      if (!isCountedView(path)) {
        // Not a counted view; just re-evaluate visibility without bumping.
        setShouldShow(shouldDisplay())
        return
      }
      try {
        var current = parseInt(localStorage.getItem(VIEW_COUNT_KEY) || '0', 10) || 0
        localStorage.setItem(VIEW_COUNT_KEY, String(current + 1))
      } catch {}
      setShouldShow(shouldDisplay())
    }

    function shouldDisplay(): boolean {
      try {
        var count = parseInt(localStorage.getItem(VIEW_COUNT_KEY) || '0', 10) || 0
        if (count < VIEW_THRESHOLD) return false
        var dismissedAt = parseInt(localStorage.getItem(DISMISSED_AT_KEY) || '0', 10) || 0
        if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return false
        return true
      } catch {
        return false
      }
    }

    // Initial evaluate on mount.
    evaluate(router.asPath)

    function handleRouteChange(path: string) { evaluate(path) }
    router.events.on('routeChangeComplete', handleRouteChange)
    return function () { router.events.off('routeChangeComplete', handleRouteChange) }
  }, [router])

  function dismiss() {
    try { localStorage.setItem(DISMISSED_AT_KEY, String(Date.now())) } catch {}
    setShouldShow(false)
    try {
      var posthog = require('@/lib/posthog')
      posthog.capture('soft_conversion_banner_dismiss')
    } catch {}
  }

  function trackClick() {
    try {
      var posthog = require('@/lib/posthog')
      posthog.capture('soft_conversion_banner_click')
    } catch {}
  }

  // Hide for signed-in users and while we're still checking.
  if (authed === null || authed === true) return null
  if (!shouldShow) return null

  return (
    <div
      role="region"
      aria-label="Sign up prompt"
      className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 sm:pb-4 pointer-events-none"
    >
      <div className="mx-auto max-w-lg pointer-events-auto">
        <div className="relative rounded-2xl border border-purple-700/40 bg-gradient-to-br from-purple-950/95 to-gray-950/95 backdrop-blur-lg shadow-2xl shadow-purple-900/40 p-4 pr-10">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute top-2.5 right-2.5 p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 inline-flex w-9 h-9 rounded-full bg-purple-600/30 border border-purple-500/30 items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-snug">
                You&rsquo;ve been reading for a bit.
              </p>
              <p className="text-xs text-gray-300 mt-0.5 leading-relaxed">
                Create a free account to save reports, see patterns that match your interests, and share your own experiences.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <Link
                  href="/start"
                  onClick={trackClick}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors"
                >
                  Create free account
                </Link>
                <button
                  type="button"
                  onClick={dismiss}
                  className="text-xs text-gray-400 hover:text-gray-200 px-1"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
