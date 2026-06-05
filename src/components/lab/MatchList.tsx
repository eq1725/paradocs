'use client'

// V11.17.75 - Tier 3E cleanup
//
// MatchList — extracted from the legacy MyRecordTab.tsx as part of
// the Tier 3E split. Renders the rich, inline-expandable list of
// related-account cards (with filter chips, witness-adjacency callout,
// new-match alerts opt-in card, "Strong" glyph, per-dimension match
// breakdown, location + date facts, "view full report" links).
//
// The legacy polished-radar dial that used to sit ABOVE this list in
// MyRecordTab is intentionally dropped — `RadarSurface` (the V3 §5
// categorical lens) is now the canonical dial on /lab. Per the Tier
// 2B open question, founder picked Tier 3 to remove the duplication.
//
// This component is purely presentational over a `matches` payload:
// no Supabase calls, no fetch. The parent (`lab.tsx`) loads matches
// from `/api/constellation/match` and passes them down. The Submission
// Switcher is no longer here either — DossierHeader owns submission
// focus now (Tier 2B).
//
// SWC: var + function() form. Named export + default export so
// existing import styles keep working.

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  MapPin,
  Calendar,
  ExternalLink,
  Users,
  Camera,
  Bell,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Per-match row shape returned by `/api/constellation/match`. We keep
 * the type loose (matches the legacy `any[]` usage inside MyRecordTab)
 * because the RPC surfaces a number of optional enrichments
 * (corroborated, match_dimensions, witness_count, has_photo_video,
 * city/state/country, summary, event_date) that aren't all in the
 * RadarMatch type.
 */
export interface MatchListMatch {
  id: string
  title: string
  slug: string
  category?: string | null
  match_score: number
  match_dimensions?: Array<{ label: string; score: number } | string> | null
  corroborated?: boolean | null
  latitude?: number | null
  longitude?: number | null
  city?: string | null
  state_province?: string | null
  country?: string | null
  location_description?: string | null
  event_date?: string | null
  summary?: string | null
  description?: string | null
  witness_count?: number | null
  has_photo_video?: boolean | null
}

export interface MatchListProps {
  /** Matches surfaced by the constellation match RPC for the focused experience. */
  matches: MatchListMatch[]
  /** Total reports the matcher considered — drives the "X · across N reports" line. */
  totalDatabase: number
  /** User location for the "Nearby" filter (haversine within NEARBY_RADIUS_MI). */
  userLat?: number | null
  userLng?: number | null
  /** Signed-in user's email — drives the new-match alerts opt-in card. Null for anon. */
  userEmail?: string | null
  /** Focused experience id — used as the alerts-card storage scope. */
  focusedReportId?: string | null
}

// V9.11.5 #30 — Nearby in MILES for US-majority demographic.
var NEARBY_RADIUS_MI = 500

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * V9.11.5 #30 — Compact event-date formatter for inline match previews.
 * Returns "" for unparseable inputs so the calling code can skip the
 * date row entirely instead of rendering "Invalid Date".
 */
function formatEventDate(raw: string): string {
  if (!raw) return ''
  var d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  var hasDay = raw.length >= 10
  if (hasDay) return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear()
  return months[d.getUTCMonth()] + ' ' + d.getUTCFullYear()
}

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  var R = 3959
  var dLat = (lat2 - lat1) * Math.PI / 180
  var dLng = (lng2 - lng1) * Math.PI / 180
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── New-match alerts card ───────────────────────────────────────────

/**
 * V11.17.34 PR-4-b — NewMatchAlertsCard. Mobile-first card above the
 * match list. DEFAULTS TO ON for signed-in users (email channel).
 * State persists to localStorage immediately and to
 * /api/user/notify-prefs for cross-device sync (with a 503 fallback
 * if the migration hasn't landed in the target environment).
 *
 * V11.17.75 — copied verbatim from MyRecordTab (Tier 3E extraction);
 * behavior preserved.
 */
function NewMatchAlertsCard(props: { userEmail: string | null; reportId: string }) {
  var storageKey = 'paradocs:notify-new-matches:' + (props.userEmail || 'anon')
  var defaultOn = !!props.userEmail
  var [enabled, setEnabled] = useState<boolean | null>(null) // null = pre-hydration
  var [busy, setBusy] = useState(false)

  useEffect(function () {
    try {
      var v = window.localStorage.getItem(storageKey)
      if (v === '1') setEnabled(true)
      else if (v === '0') setEnabled(false)
      else setEnabled(defaultOn)
    } catch (_e) {
      setEnabled(defaultOn)
    }
  }, [storageKey, defaultOn])

  function persist(next: boolean) {
    setEnabled(next)
    try { window.localStorage.setItem(storageKey, next ? '1' : '0') } catch (_e) { /* private mode */ }
    if (!props.userEmail) return
    setBusy(true)
    supabase.auth.getSession().then(function (s: any) {
      var token = s && s.data && s.data.session ? s.data.session.access_token : null
      if (!token) { setBusy(false); return }
      fetch('/api/user/notify-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ notify_new_matches: next }),
      }).catch(function () { /* localStorage already holds the truth */ })
        .finally(function () { setBusy(false) })
    }).catch(function () { setBusy(false) })
  }

  useEffect(function () {
    if (!props.userEmail) return
    supabase.auth.getSession().then(function (s: any) {
      var token = s && s.data && s.data.session ? s.data.session.access_token : null
      if (!token) return
      fetch('/api/user/notify-prefs', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token },
      }).then(function (r) {
        if (!r.ok) return null
        return r.json()
      }).then(function (data: any) {
        if (data && typeof data.notify_new_matches === 'boolean' && !data._fallback) {
          setEnabled(data.notify_new_matches)
          try { window.localStorage.setItem(storageKey, data.notify_new_matches ? '1' : '0') } catch (_e) { /* ignore */ }
        }
      }).catch(function () { /* network blip */ })
    }).catch(function () { /* ignore */ })
  }, [props.userEmail, storageKey])

  if (!props.userEmail) {
    return (
      <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 p-3 mb-4 flex items-start gap-3">
        <Bell className="w-4 h-4 text-purple-300 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">New-match alerts</p>
          <p className="text-[12px] text-gray-400 leading-relaxed mt-0.5">
            <Link href="/signin" className="text-purple-300 hover:text-purple-200 underline underline-offset-2">Sign in</Link> to get notified when new reports strongly match yours.
          </p>
        </div>
      </div>
    )
  }

  if (enabled === null) {
    return <div className="h-[68px] mb-4" aria-hidden="true" />
  }

  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 p-3 mb-4 flex items-start gap-3">
      <Bell className={'w-4 h-4 mt-0.5 flex-shrink-0 ' + (enabled ? 'text-purple-300' : 'text-gray-500')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-white">New-match alerts</p>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? 'Turn off new-match alerts' : 'Turn on new-match alerts'}
            disabled={busy}
            onClick={function () { persist(!enabled) }}
            className={
              'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border transition-colors disabled:opacity-50 ' +
              (enabled
                ? 'bg-purple-600/70 border-purple-500'
                : 'bg-gray-800 border-gray-700')
            }
          >
            <span
              className={
                'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform mt-0.5 ' +
                (enabled ? 'translate-x-[18px]' : 'translate-x-[2px]')
              }
            />
          </button>
        </div>
        <p className="text-[12px] text-gray-400 leading-relaxed mt-1">
          {enabled
            ? <>We&rsquo;ll email you, no more than once a week, when a new report <span className="text-gray-300">strongly matches</span> yours.</>
            : <>You&rsquo;ll see new matches when you visit, but we won&rsquo;t reach out.</>
          }
        </p>
        {enabled && (
          <details className="mt-2">
            <summary className="text-[11px] text-purple-300/80 cursor-pointer hover:text-purple-200 select-none">
              Preview what you&rsquo;ll get
            </summary>
            <div className="mt-2 rounded-lg border border-gray-800/60 bg-gray-950/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Sample email</p>
              <p className="text-[12px] text-gray-200 font-medium leading-snug">
                3 new reports strongly match your Lumberton triangle
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                Sent weekly &middot; Only when &ge;2 dimensions corroborate &middot; Unsubscribe one click
              </p>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

// ─── MatchList (main) ────────────────────────────────────────────────

/**
 * V11.17.75 - Tier 3E.
 *
 * Renders the related-account list with filter chips ("All reports"
 * / "Nearby"), a witness-adjacency callout when ≥3 corroborated rows
 * are present, the new-match alerts opt-in card, and inline-
 * expandable cards (snippet + per-dimension match bars + witnesses /
 * evidence facts + "View full report" link).
 *
 * Pure presentational over its `matches` prop — same data path the
 * legacy MyRecordTab used (constellation/match RPC).
 */
export function MatchList(props: MatchListProps) {
  // V9.11.5 #30 / V11.17.34 PR-4-a — 'high' filter kept as a no-op
  // mapping to 'all' so any deep-link URL params keep working.
  var [filter, setFilter] = useState<'all' | 'high' | 'nearby'>('all')
  var [expandedId, setExpandedId] = useState<string | null>(null)
  var cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  function chipClass(active: boolean) {
    return 'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium uppercase tracking-wider transition-colors border ' +
      (active
        ? 'bg-purple-600/30 border-purple-500/60 text-white'
        : 'bg-gray-900/40 border-gray-700/60 text-gray-400 hover:text-gray-200')
  }

  function handleMatchOpen(id: string) {
    setExpandedId(function (prev) { return prev === id ? null : id })
    setTimeout(function () {
      var el = cardRefs.current[id]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 80)
  }

  // Apply filter to compute the visible-match list.
  var visibleMatches: MatchListMatch[] = (function () {
    if (filter === 'high') return props.matches
    if (filter === 'nearby') {
      if (typeof props.userLat !== 'number' || typeof props.userLng !== 'number') return []
      return props.matches.filter(function (m) {
        if (typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return false
        return haversineMi(props.userLat as number, props.userLng as number, m.latitude, m.longitude) <= NEARBY_RADIUS_MI
      })
    }
    return props.matches
  })()

  var filterCaption = (function () {
    if (filter === 'nearby') return 'Nearby: reports within ' + NEARBY_RADIUS_MI + ' miles of your experience location.'
    return 'Every related account in the pattern lens, ranked by overall similarity to your experience.'
  })()

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      {/* Filter chips */}
      <div className="flex justify-center gap-2 mb-2 flex-wrap">
        <button type="button" onClick={function () { setFilter('all') }} className={chipClass(filter === 'all')}>
          All reports
        </button>
        <button type="button" onClick={function () { setFilter('nearby') }} className={chipClass(filter === 'nearby')}>
          Nearby
        </button>
      </div>

      {/* Filter explainer caption */}
      <p className="text-[11px] text-gray-500 text-center mb-5 leading-relaxed max-w-md mx-auto px-2">
        {filterCaption}
      </p>

      {/* Match-count line */}
      <div className="flex items-center justify-between gap-3 mb-3 px-1">
        <p className="text-sm text-gray-300">
          <span className="font-semibold text-white">{visibleMatches.length}</span> {visibleMatches.length === 1 ? 'match' : 'matches'}
          <span className="text-gray-500"> &middot; across {props.totalDatabase.toLocaleString()} reports</span>
        </p>
      </div>

      {/* V11.17.38 PR-7 item 3 — Witness-adjacency callout */}
      {(function () {
        var corroborated = visibleMatches.filter(function (m) { return !!m.corroborated })
        if (corroborated.length < 3) return null
        var top = corroborated[0]
        var hint = top && (top.city || top.country) ? (top.city || top.country) : ''
        return (
          <div
            role="note"
            aria-label={corroborated.length + ' other people described something like this'}
            className="mb-3 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-3 sm:p-4"
          >
            <p className="text-[10px] uppercase tracking-wider text-amber-300/90 font-semibold mb-1">
              Witness adjacency
            </p>
            <p className="text-sm sm:text-base text-white leading-snug">
              <span className="font-bold text-amber-200">{corroborated.length}</span>{' '}
              {corroborated.length === 1 ? 'other person has described' : 'other people have described'}{' '}
              something like this.{' '}
              <span className="text-amber-100/80">None of you knew each other.</span>
            </p>
            {hint && (
              <p className="text-[11px] text-amber-200/70 mt-1">
                Including one from {hint}.
              </p>
            )}
          </div>
        )
      })()}

      {/* New-match alerts opt-in card */}
      <NewMatchAlertsCard userEmail={props.userEmail || null} reportId={props.focusedReportId || ''} />

      {/* Match list */}
      <div className="space-y-2">
        {visibleMatches.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-500">
            {filter === 'nearby'
              ? 'No matches within ' + NEARBY_RADIUS_MI + ' miles. Try All reports.'
              : 'Listening for matches across the archive…'}
          </div>
        )}
        {visibleMatches.slice(0, 12).map(function (m) {
          var isOpen = expandedId === m.id
          var dimensions = (Array.isArray(m.match_dimensions) ? m.match_dimensions : []) as Array<{ label: string; score: number } | string>
          var snippet = (m.summary || m.description || '').trim()
          if (snippet.length > 240) snippet = snippet.substring(0, 240).trim() + '…'
          var locationStr = m.location_description ||
            ([m.city, m.state_province, m.country].filter(function (s) { return !!s }).join(', '))
          var dateStr = m.event_date ? formatEventDate(m.event_date) : ''

          return (
            <div
              key={m.id}
              ref={function (el) { cardRefs.current[m.id] = el }}
              className={
                'bg-gray-900/60 border rounded-xl transition-colors ' +
                (isOpen ? 'border-purple-500/50' : 'border-gray-800/60 hover:border-gray-700/80')
              }
            >
              <button
                type="button"
                onClick={function () { handleMatchOpen(m.id) }}
                aria-expanded={isOpen}
                className="w-full text-left p-3 flex items-start gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {m.corroborated && (
                      <span
                        className="inline-flex items-center gap-0.5 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-1.5 py-0.5"
                        title="Two or more dimensions matched strongly — not just the phenomenon type."
                        aria-label="Strong match"
                      >
                        <span aria-hidden="true">&#9733;</span> Strong
                      </span>
                    )}
                    <p className="text-sm font-medium text-white truncate">{m.title}</p>
                  </div>
                  {(function () {
                    var topDim = dimensions.find(function (d) { return typeof d !== 'string' && !!(d as any).label }) as { label: string; score: number } | undefined
                    var rationale = topDim ? topDim.label : (typeof dimensions[0] === 'string' ? dimensions[0] as string : '')
                    return (
                      <p className="text-[11px] text-purple-300/90 mt-0.5">
                        <span className="text-white font-medium">{Math.round(m.match_score * 100)}%</span>
                        {rationale && <> &middot; {rationale}</>}
                      </p>
                    )
                  })()}
                  {(locationStr || dateStr) && (
                    <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      {locationStr && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {locationStr}
                        </span>
                      )}
                      {dateStr && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {dateStr}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <ChevronDown
                  className={
                    'w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5 transition-transform duration-200 ' +
                    (isOpen ? 'rotate-180' : '')
                  }
                />
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-gray-800/60 space-y-3">
                  {snippet && (
                    <p className="text-sm text-gray-200 leading-relaxed">
                      &ldquo;{snippet}&rdquo;
                    </p>
                  )}

                  {dimensions.length > 0 && (
                    <div className="space-y-1.5">
                      {dimensions.slice(0, 4).map(function (d, i) {
                        if (typeof d === 'string') return null
                        var pct = Math.round(((d as any).score || 0) * 100)
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-400 w-32 flex-shrink-0 truncate">{(d as any).label}</span>
                            <div className="flex-1 h-1.5 bg-gray-800 rounded overflow-hidden">
                              <div
                                className="h-full bg-purple-500/70"
                                style={{ width: pct + '%' }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-500 w-9 text-right">{pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {(m.witness_count || m.has_photo_video) ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-400">
                      {m.witness_count != null && m.witness_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3 h-3" /> {m.witness_count} {m.witness_count === 1 ? 'witness' : 'witnesses'}
                        </span>
                      )}
                      {m.has_photo_video && (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Camera className="w-3 h-3" /> Has evidence
                        </span>
                      )}
                    </div>
                  ) : null}

                  <a
                    href={'/report/' + m.slug}
                    className="inline-flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200 transition-colors pt-1"
                  >
                    View full report
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )
        })}
        {visibleMatches.length > 12 && (
          <p className="text-[11px] text-gray-500 text-center pt-2">
            + {visibleMatches.length - 12} more
          </p>
        )}
      </div>

      {/* Persistent "add another experience" CTA */}
      <div className="mt-6 pt-4 border-t border-gray-800/60 flex flex-col items-center gap-3">
        <Link
          href="/start"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-purple-600/20 border border-purple-500/40 text-purple-200 text-sm font-medium hover:bg-purple-600/30 transition-colors"
        >
          + Add another experience
        </Link>
        <p className="text-[11px] text-gray-500">Each report sharpens the pattern lens on your record.</p>
      </div>
    </div>
  )
}

export default MatchList
