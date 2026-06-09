// V11.17.65 — HintsRail.
//
// A stacked rail of rendered Hint cards rendered into the Lab Story tab.
// Fetches /api/lab/hints on mount, displays up to 6 cards, logs
// impressions on mount + on dismiss + on CTA click.
//
// V11.18.x — per UI_SHIPPING_ROADMAP_V2 Sprint 1A additions: each Hint
// card now offers three resolve actions in the bottom-right —
// Accept / Save / Not mine. Tap (mobile) or hover (desktop tooltip)
// to act. Any resolution POSTs to /api/lab/hints/[id]/resolve and
// removes the card from the rail locally; the server filters resolved
// hints from subsequent fetches.
//
// Card design (per the build brief):
//   - Title (Changa One brand font, bold, one line)
//   - Body (1-2 sentences, regular weight)
//   - CTA button using the existing brand-purple primary tokens
//   - V11.18.x: Resolve trio in the bottom-right corner.
//   - Category-color accent strip on the left edge (uses
//     paranormal.<family> tokens already in tailwind.config.js)

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { Check, Bookmark, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface RenderedHint {
  id: string
  category: string
  hint_type: string
  title: string
  body: string
  cta: {
    label: string
    target:
      | { kind: 'phen_page'; slug: string }
      | { kind: 'add_detail'; field: string }
      | { kind: 'mutual_match_invite'; match_id_placeholder: true }
      | { kind: 'related_reports_view'; filter_token: string }
      | { kind: 'archive_curiosity'; topic_slug: string }
      | { kind: 'noop' }
  }
  tier_visibility: string
  freshness_policy: string
  cross_category: boolean
  bound_tokens: Record<string, number | string>
}

interface HintsRailProps {
  /** Optional title above the rail. Defaults to "From the catalogue". */
  heading?: string
}

// Map phen-family to the existing tailwind paranormal-* color tokens
// for the left-edge accent strip. Generic families fall back to brand
// purple so the rail stays visually anchored to Lab.
function categoryAccentColor(category: string): string {
  switch (category) {
    case 'ufos_aliens': return '#22c55e' // paranormal.ufo
    case 'cryptids': return '#f59e0b' // paranormal.cryptid
    case 'ghosts_hauntings': return '#a855f7' // paranormal.ghost
    case 'psychological_experiences': return '#ef4444' // paranormal.unexplained
    case 'psychic_phenomena': return '#3b82f6' // paranormal.psychic
    case 'esoteric_practices': return '#14b8a6' // paranormal.location
    case 'consciousness_practices': return '#9000F0'
    case 'perception_sensory': return '#9000F0'
    case 'cross_category': return '#9000F0'
    case 'general':
    default:
      return '#9000F0'
  }
}

/**
 * Resolve a Hint's CTA target into an href the card's button can use.
 * Returns null for noop / mutual_match_invite (rendered as a label
 * with no navigation; the named-match flow is staged separately).
 */
function hintCtaHref(cta: RenderedHint['cta']): string | null {
  switch (cta.target.kind) {
    case 'phen_page':
      return '/phenomena/' + encodeURIComponent(cta.target.slug)
    case 'add_detail':
      return '/lab?tab=story&add=' + encodeURIComponent(cta.target.field)
    case 'related_reports_view':
      return '/explore?filter=' + encodeURIComponent(cta.target.filter_token)
    case 'archive_curiosity':
      return '/explore?topic=' + encodeURIComponent(cta.target.topic_slug)
    case 'mutual_match_invite':
    case 'noop':
    default:
      return null
  }
}

export default function HintsRail(props: HintsRailProps) {
  var router = useRouter()
  var [hints, setHints] = useState<RenderedHint[] | null>(null)
  var [loading, setLoading] = useState(true)
  var [dismissed, setDismissed] = useState<Record<string, boolean>>({})

  // Fetch on mount.
  useEffect(function () {
    var cancelled = false
    function load() {
      setLoading(true)
      supabase.auth.getSession().then(function (s) {
        var session = s.data.session
        if (!session) {
          if (!cancelled) {
            setHints([])
            setLoading(false)
          }
          return
        }
        var accessToken: string = session.access_token
        fetch('/api/lab/hints', {
          headers: { Authorization: 'Bearer ' + accessToken },
        })
          .then(function (r) { return r.ok ? r.json() : { hints: [] } })
          .then(function (payload) {
            if (cancelled) return
            var list: RenderedHint[] = (payload && payload.hints) || []
            setHints(list)
            // Log 'shown' impressions in parallel — best-effort.
            list.forEach(function (h) { logImpression(h.id, 'shown', accessToken) })
          })
          .catch(function () {
            if (!cancelled) setHints([])
          })
          .finally(function () {
            if (!cancelled) setLoading(false)
          })
      })
    }
    load()
    return function () { cancelled = true }
  }, [])

  // V11.18.x — generalized resolve handler. Calls the new
  // /api/lab/hints/[id]/resolve endpoint and hides the card locally.
  // Best-effort: a failed POST still removes the card from the view
  // so the user never sees a stuck card.
  var resolveHint = useCallback(function (id: string, resolution: 'accept' | 'save' | 'dismiss') {
    setDismissed(function (prev) {
      var next: Record<string, boolean> = {}
      Object.keys(prev).forEach(function (k) { next[k] = prev[k] })
      next[id] = true
      return next
    })
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session) return
      // Persist the resolution.
      try {
        fetch('/api/lab/hints/' + encodeURIComponent(id) + '/resolve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + session.access_token,
          },
          body: JSON.stringify({ resolution: resolution }),
        }).catch(function () { /* fire-and-forget */ })
      } catch (_e) { /* defensive */ }
      // Continue to log the dismiss impression so existing analytics
      // dashboards (which read lab_hint_impressions) still see the
      // close action regardless of resolution kind.
      if (resolution === 'dismiss') {
        logImpression(id, 'dismissed', session.access_token)
      }
    })
  }, [])

  var clickCta = useCallback(function (h: RenderedHint) {
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (session) logImpression(h.id, 'cta_clicked', session.access_token)
      var href = hintCtaHref(h.cta)
      if (href) router.push(href)
    })
  }, [router])

  if (loading) {
    return (
      <div className="my-6 flex items-center justify-center py-6">
        <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!hints || hints.length === 0) return null

  var visible = hints.filter(function (h) { return !dismissed[h.id] })
  if (visible.length === 0) return null

  return (
    <div className="my-6">
      <div className="mb-3 px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {props.heading || 'From the catalogue'}
        </h3>
      </div>
      <div className="flex flex-col gap-3">
        {visible.map(function (h) {
          var accent = categoryAccentColor(h.category)
          var href = hintCtaHref(h.cta)
          return (
            <div
              key={h.id}
              className="relative flex items-stretch overflow-hidden rounded-lg border border-gray-800 bg-gray-900/40"
            >
              {/* category accent strip */}
              <div
                aria-hidden="true"
                style={{ width: 4, background: accent }}
              />
              <div className="flex-1 p-4">
                <h4
                  className="font-brand text-base sm:text-lg leading-tight text-white"
                  style={{ fontFamily: "'Changa One', Changa, system-ui, sans-serif" }}
                >
                  {h.title}
                </h4>
                <p className="mt-2 text-sm text-gray-300 leading-relaxed">{h.body}</p>
                {/* Footer row: CTA on the left, resolve trio on the right.
                    V11.18.x — Accept / Save / Not mine actions per
                    UI_SHIPPING_ROADMAP_V2 Sprint 1A. Mobile-first: each
                    button is at least 32px tall, sits comfortably in the
                    thumb zone. Desktop adds tooltips via the title attr. */}
                <div className="mt-3 flex items-end justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    {h.cta.target.kind !== 'noop' && (
                      <button
                        type="button"
                        onClick={function () { clickCta(h) }}
                        disabled={!href && h.cta.target.kind !== 'mutual_match_invite'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {h.cta.label}
                      </button>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-1 flex-shrink-0"
                    role="group"
                    aria-label="Resolve this hint"
                  >
                    <button
                      type="button"
                      onClick={function () { resolveHint(h.id, 'accept') }}
                      title="Accept — this matches my record"
                      aria-label="Accept"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-gray-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Accept</span>
                    </button>
                    <button
                      type="button"
                      onClick={function () { resolveHint(h.id, 'save') }}
                      title="Save for later"
                      aria-label="Save"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-gray-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Save</span>
                    </button>
                    <button
                      type="button"
                      onClick={function () { resolveHint(h.id, 'dismiss') }}
                      title="Not mine — dismiss"
                      aria-label="Not mine"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Not mine</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function logImpression(hintId: string, event: 'shown' | 'cta_clicked' | 'dismissed', token: string) {
  try {
    fetch('/api/lab/hints/impression', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ hint_id: hintId, event: event }),
    }).catch(function () { /* fire-and-forget */ })
  } catch (_e) {
    /* defensive */
  }
}
