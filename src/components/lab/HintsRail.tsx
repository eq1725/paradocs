// V11.17.65 — HintsRail.
//
// A stacked rail of rendered Hint cards rendered into the Lab Story tab.
// Fetches /api/lab/hints on mount, displays up to 6 cards, logs
// impressions on mount + on dismiss + on CTA click.
//
// Card design (per the build brief):
//   - Title (Changa One brand font, bold, one line)
//   - Body (1-2 sentences, regular weight)
//   - CTA button using the existing brand-purple primary tokens
//   - Dismiss X button (writes to /api/lab/hints/impression)
//   - Category-color accent strip on the left edge (uses
//     paranormal.<family> tokens already in tailwind.config.js)

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { X } from 'lucide-react'
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

  var dismiss = useCallback(function (id: string) {
    setDismissed(function (prev) {
      var next: Record<string, boolean> = {}
      Object.keys(prev).forEach(function (k) { next[k] = prev[k] })
      next[id] = true
      return next
    })
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (session) logImpression(id, 'dismissed', session.access_token)
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
                <div className="flex items-start justify-between gap-3">
                  <h4
                    className="font-brand text-base sm:text-lg leading-tight text-white"
                    style={{ fontFamily: "'Changa One', Changa, system-ui, sans-serif" }}
                  >
                    {h.title}
                  </h4>
                  <button
                    type="button"
                    onClick={function () { dismiss(h.id) }}
                    aria-label="Dismiss"
                    className="shrink-0 -mt-1 -mr-1 p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="mt-2 text-sm text-gray-300 leading-relaxed">{h.body}</p>
                {h.cta.target.kind !== 'noop' && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={function () { clickCta(h) }}
                      disabled={!href && h.cta.target.kind !== 'mutual_match_invite'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {h.cta.label}
                    </button>
                  </div>
                )}
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
