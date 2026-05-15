'use client'

/**
 * LabConstellationTab — Constellation V2 wrapper for the Lab
 *
 * If the user has submitted at least one report, shows the Constellation
 * visualization centered on their most recent submission. If they haven't
 * submitted anything yet, shows the ExperienceOnboarding flow inline.
 *
 * After first submission via onboarding, transitions to the Constellation
 * reveal animation.
 *
 * SWC: Uses var + function(){} for compatibility.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { getApiBase } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { ChevronDown, MapPin, Calendar, ExternalLink, Users, Camera, Plus, User as UserIcon } from 'lucide-react'

// Dynamic imports for SSR-incompatible components
var ConstellationReveal = dynamic(
  function() { return import('@/components/constellation/ConstellationReveal') },
  { ssr: false }
)
var ExperienceOnboarding = dynamic(
  function() { return import('@/components/constellation/ExperienceOnboarding') },
  { ssr: false }
)
var PaywallModal = dynamic(
  function() { return import('@/components/constellation/PaywallModal') },
  { ssr: false }
)

import type { MatchedReport, UserExperience } from '@/components/constellation/ConstellationReveal'
import type { ExperienceData } from '@/components/constellation/ExperienceOnboarding'
import RadarVisualization, { CATEGORY_COLORS, CATEGORY_LABELS } from '@/components/radar/RadarVisualization'

export default function LabConstellationTab() {
  var router = useRouter()
  var [loading, setLoading] = useState(true)
  var [hasSubmission, setHasSubmission] = useState(false)
  var [userExperience, setUserExperience] = useState<UserExperience | null>(null)
  var [matches, setMatches] = useState<MatchedReport[]>([])
  var [totalExperiences, setTotalExperiences] = useState(0)
  var [showReveal, setShowReveal] = useState(false)
  var [showPaywall, setShowPaywall] = useState(false)
  var [notifyToast, setNotifyToast] = useState<string | null>(null)
  var [userEmail, setUserEmail] = useState('')

  // Check if user has any submissions and load their latest
  useEffect(function() {
    async function loadData() {
      var sessionResult = await supabase.auth.getSession()
      var session = sessionResult.data.session
      if (!session) {
        setLoading(false)
        return
      }
      if (session.user.email) setUserEmail(session.user.email)

      // Check for user's most recent submission
      var { data: userReports } = await supabase
        .from('reports')
        .select(`
          id, title, slug, category, description, summary,
          location_description, city, state_province, country,
          latitude, longitude, event_date,
          phenomenon_type:phenomenon_types(name)
        `)
        .eq('submitted_by', session.user.id)
        .eq('source_type', 'user_submission')
        .order('created_at', { ascending: false })
        .limit(1)

      if (userReports && userReports.length > 0) {
        var report = userReports[0]
        var exp: UserExperience = {
          id: report.id,
          type_name: (report as any).phenomenon_type?.name || report.category || '',
          category: report.category || '',
          location: [report.city, report.state_province].filter(Boolean).join(', ') || report.location_description || 'Unknown',
          latitude: report.latitude || 30.08,
          longitude: report.longitude || -94.10,
          year: report.event_date ? new Date(report.event_date).getFullYear() : new Date().getFullYear(),
          description: report.description || report.summary || '',
        }
        setUserExperience(exp)
        setHasSubmission(true)

        // Fetch matches from the constellation match API
        await fetchMatches(report.id, report.category, report.latitude, report.longitude, report.description || report.summary || '', session.access_token)
      }

      setLoading(false)
    }
    loadData()
  }, [])

  var fetchMatches = useCallback(async function(
    reportId: string,
    category: string | null,
    lat: number | null,
    lng: number | null,
    description: string,
    token: string,
  ) {
    try {
      var params = new URLSearchParams()
      if (reportId) params.set('report_id', reportId)
      if (category) params.set('category', category)
      if (lat) params.set('lat', String(lat))
      if (lng) params.set('lng', String(lng))
      if (description) params.set('description', description.slice(0, 500))

      var res = await fetch(getApiBase() + '/api/constellation/match?' + params.toString(), {
        headers: { Authorization: 'Bearer ' + token },
      })

      if (res.ok) {
        var data = await res.json()
        setMatches(data.matches || [])
        setTotalExperiences(data.stats?.total_database || 0)
      }
    } catch (err) {
      console.error('Constellation match error:', err)
    }
  }, [])

  // Handle onboarding completion — user just submitted their first experience
  var handleOnboardingComplete = useCallback(async function(
    reportId: string,
    slug: string,
    formData: ExperienceData
  ) {
    var exp: UserExperience = {
      id: reportId,
      type_name: formData.typeName,
      category: formData.category,
      location: [formData.city, formData.stateProvince].filter(Boolean).join(', ') || 'Unknown',
      latitude: formData.latitude ? parseFloat(formData.latitude) : 30.08,
      longitude: formData.longitude ? parseFloat(formData.longitude) : -94.10,
      year: formData.eventDate ? new Date(formData.eventDate).getFullYear() : new Date().getFullYear(),
      description: formData.description,
    }
    setUserExperience(exp)
    setHasSubmission(true)

    // Fetch matches for the newly submitted report
    var sessionResult = await supabase.auth.getSession()
    var token = sessionResult.data.session?.access_token || ''
    await fetchMatches(
      reportId,
      formData.category,
      formData.latitude ? parseFloat(formData.latitude) : null,
      formData.longitude ? parseFloat(formData.longitude) : null,
      formData.description,
      token
    )

    // Show the constellation reveal animation
    setShowReveal(true)
  }, [fetchMatches])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // No submissions yet — show the experience onboarding flow
  if (!hasSubmission && !showReveal) {
    return (
      <div className="" style={{ minHeight: 'calc(100dvh - 180px)' }}>
        <ExperienceOnboarding
          onComplete={handleOnboardingComplete}
          onSkip={function() {
            // Let them browse — switch to Saves tab
            router.replace('/lab?tab=saves', undefined, { shallow: true })
          }}
        />
      </div>
    )
  }

  // Has submission — V9.11.5 #16 polished RADAR view.
  // Replaces the older ConstellationReveal fullscreen experience with
  // an information-dense RADAR (distance=score, angle=category,
  // color=category, size=score, pulse=recency) + working filter chips.
  if (userExperience) {
    return <PolishedRadarView
      userExperience={userExperience}
      matches={matches}
      totalExperiences={totalExperiences}
      userEmail={userEmail}
      router={router}
    />
  }

  return null
}

// ── New polished RADAR view (V9.11.5 #16) ────────────────────────────────────

/**
 * V9.11.5 #30 — Compact event-date formatter for inline match
 * previews. Examples: "Mar 1972", "Aug 12, 1997". If parsing
 * fails (string is empty / non-date / placeholder), returns ''.
 */
function formatEventDate(raw: string): string {
  if (!raw) return ''
  var d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  var hasDay = raw.length >= 10 // ISO YYYY-MM-DD has a real day
  if (hasDay) return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear()
  return months[d.getUTCMonth()] + ' ' + d.getUTCFullYear()
}

function PolishedRadarView(props: {
  userExperience: UserExperience
  matches: MatchedReport[]
  totalExperiences: number
  userEmail: string
  router: any
}) {
  var [filter, setFilter] = useState<'all' | 'high' | 'nearby'>('all')
  var [notifyToast, setNotifyToast] = useState<string | null>(null)
  // V9.11.5 #30 — inline match preview state. Clicking a dot or
  // card expands the corresponding card in place rather than
  // navigating away. Same UX on mobile + desktop.
  var [expandedId, setExpandedId] = useState<string | null>(null)
  // V9.11.5 #31 — own-report expand state. Mirrors expandedId but
  // for the user's own "YOU" report; lives above the filter chips
  // so users always know what they shared.
  var [ownExpanded, setOwnExpanded] = useState(false)
  var cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  var ownCardRef = useRef<HTMLDivElement | null>(null)

  // V9.11.5 #30 — Nearby in MILES for US-majority demographic.
  // Earth radius 3959 mi; 500 mi captures regional clusters
  // (cryptid corridors, UFO hotspot zones) better than 310 mi
  // (the mathematical conversion of the prior 500 km default).
  var NEARBY_RADIUS_MI = 500

  // Apply filter to compute the visible-match count.
  var visibleMatches = (function () {
    if (filter === 'high') return props.matches.filter(function (m: any) { return m.match_score >= 0.5 })
    if (filter === 'nearby') {
      if (typeof props.userExperience.latitude !== 'number' || typeof props.userExperience.longitude !== 'number') return []
      return props.matches.filter(function (m: any) {
        if (typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return false
        var R = 3959 // Earth radius in miles
        var dLat = (m.latitude - (props.userExperience.latitude as number)) * Math.PI / 180
        var dLng = (m.longitude - (props.userExperience.longitude as number)) * Math.PI / 180
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((props.userExperience.latitude as number) * Math.PI / 180) *
          Math.cos((m.latitude as number) * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2)
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= NEARBY_RADIUS_MI
      })
    }
    return props.matches
  })()

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

  // V9.11.5 #30 — Filter explainer caption. Always visible below
  // the chip strip; updates based on selected filter so users
  // never have to guess what each filter actually does or what
  // dimensions are being matched against.
  var filterCaption = (function () {
    if (filter === 'high') return 'High Match: similarity score ≥ 50% across phenomenon type, location, time period, and description.'
    if (filter === 'nearby') return 'Nearby: reports within ' + NEARBY_RADIUS_MI + ' miles of your experience location.'
    return 'Every match in your RADAR, ranked by overall similarity to your experience.'
  })()

  // V9.11.5 #31 — YOU dot click handler. Expands the user's own
  // report card and scrolls to it. Same affordance pattern as the
  // match-card clicks so users learn one mental model.
  function handleOwnOpen() {
    setOwnExpanded(function (prev) { return !prev })
    setTimeout(function () {
      if (ownCardRef.current) ownCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 80)
  }

  // V9.11.5 #31 — derived display fields for the user's own report.
  // userExperience.type_name is the phenomenology label they picked
  // (e.g. "UFO Sighting"); falls back to category if missing.
  var ownTitle = props.userExperience.type_name || props.userExperience.category || 'Your experience'
  var ownDescription = (props.userExperience.description || '').trim()
  var ownSnippet = ownDescription.length > 240
    ? ownDescription.substring(0, 240).trim() + '…'
    : ownDescription
  var ownLocation = props.userExperience.location || ''
  var ownYear = props.userExperience.year ? String(props.userExperience.year) : ''

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <div className="flex justify-center mb-3">
        <RadarVisualization
          mode="idle"
          matches={props.matches.map(function (m: any) {
            return {
              id: m.id,
              title: m.title,
              slug: m.slug,
              category: m.category,
              match_score: m.match_score,
              latitude: m.latitude,
              longitude: m.longitude,
              created_at: m.created_at,
            }
          })}
          user={{
            latitude: props.userExperience.latitude,
            longitude: props.userExperience.longitude,
          }}
          filter={filter}
          size={420}
          centerLabel="YOU"
          onMatchClick={function (m) { handleMatchOpen(m.id) }}
          onCenterClick={handleOwnOpen}
        />
      </div>

      {/* V10.2.1 — Category color legend. Each dot's color encodes its
          phenomenon category; without this row users see "pink dots and
          yellow dots" with no idea what the difference means. We show
          ONLY the categories present in the user's current matches —
          keeps the legend short and personally relevant (no point
          listing UFOs if none of their matches are UFOs). */}
      {(function () {
        var presentCategories: string[] = []
        var seen: Record<string, boolean> = {}
        props.matches.forEach(function (m: any) {
          if (m.category && !seen[m.category]) {
            seen[m.category] = true
            presentCategories.push(m.category)
          }
        })
        if (presentCategories.length === 0) return null
        return (
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mb-5 px-2">
            {presentCategories.map(function (cat) {
              var color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.combination
              var label = CATEGORY_LABELS[cat] || cat
              return (
                <span key={cat} className="inline-flex items-center gap-1.5 text-[10px] text-gray-400">
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: color,
                      flexShrink: 0,
                    }}
                  />
                  {label}
                </span>
              )
            })}
          </div>
        )
      })()}

      {/* V9.11.5 #31 / V10.13.1 — "Share another experience" inline
          CTA. Routes to /start (the consolidated submit funnel) so
          experienced users get the same flow regardless of which
          entry point they used (cold onboarding, Cases tab submit,
          or this RADAR button). /start now detects experienced users
          and skips the welcome / category-picker steps. */}
      <div className="flex justify-center mb-5">
        <a
          href="/start"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600/15 border border-purple-500/40 text-sm text-purple-200 hover:bg-purple-600/25 hover:text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          Share another experience
        </a>
      </div>

      {/* V9.11.5 #31 — Your Report card. Always visible above the
          filter chips; expandable for the full description and
          facts. Clicking the YOU dot on the radar also expands
          this card and scrolls it into view. */}
      <div
        ref={ownCardRef}
        className={
          'bg-purple-950/15 border rounded-xl mb-5 transition-colors ' +
          (ownExpanded ? 'border-purple-500/60' : 'border-purple-800/40 hover:border-purple-600/60')
        }
      >
        <button
          type="button"
          onClick={handleOwnOpen}
          aria-expanded={ownExpanded}
          className="w-full text-left p-3 flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <UserIcon className="w-4 h-4 text-purple-200" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-400 mb-0.5">
              Your report
            </p>
            <p className="text-sm font-medium text-white truncate">{ownTitle}</p>
            {!ownExpanded && ownSnippet && (
              <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">
                {ownSnippet}
              </p>
            )}
          </div>
          <ChevronDown
            className={
              'w-4 h-4 text-gray-400 flex-shrink-0 mt-1.5 transition-transform duration-200 ' +
              (ownExpanded ? 'rotate-180' : '')
            }
          />
        </button>

        {ownExpanded && (
          <div className="px-3 pb-3 pt-1 border-t border-purple-800/40 space-y-3">
            {ownDescription && (
              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">
                &ldquo;{ownDescription}&rdquo;
              </p>
            )}
            {(ownLocation || ownYear) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-400">
                {ownLocation && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {ownLocation}
                  </span>
                )}
                {ownYear && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {ownYear}
                  </span>
                )}
              </div>
            )}
            <p className="text-[11px] text-gray-500 leading-relaxed">
              This is the report we&rsquo;re matching against. To edit it or share another
              experience, use the buttons above.
            </p>
          </div>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex justify-center gap-2 mb-2 flex-wrap">
        <button type="button" onClick={function () { setFilter('all') }} className={chipClass(filter === 'all')}>
          All reports
        </button>
        <button type="button" onClick={function () { setFilter('high') }} className={chipClass(filter === 'high')}>
          High match
        </button>
        <button type="button" onClick={function () { setFilter('nearby') }} className={chipClass(filter === 'nearby')}>
          Nearby
        </button>
      </div>

      {/* V9.11.5 #30 — Filter explainer caption */}
      <p className="text-[11px] text-gray-500 text-center mb-5 leading-relaxed max-w-md mx-auto px-2">
        {filterCaption}
      </p>

      {/* Match-count + ambient stats */}
      <div className="flex items-center justify-between gap-3 mb-4 px-1">
        <p className="text-sm text-gray-300">
          <span className="font-semibold text-white">{visibleMatches.length}</span> {visibleMatches.length === 1 ? 'match' : 'matches'}
          <span className="text-gray-500"> · across {props.totalExperiences.toLocaleString()} reports</span>
        </p>
        <button
          type="button"
          onClick={function () {
            if (notifyToast) return
            if (props.userEmail) {
              fetch(getApiBase() + '/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: props.userEmail, source: 'radar_notify' }),
              }).catch(function () {})
            }
            setNotifyToast('We\'ll ping you when new matches arrive.')
            setTimeout(function () { setNotifyToast(null) }, 3500)
          }}
          className="text-xs text-purple-300 hover:text-purple-200 transition-colors"
        >
          Notify me of new matches
        </button>
      </div>

      {/* Match list (filtered) — V9.11.5 #30 inline expansion */}
      <div className="space-y-2">
        {visibleMatches.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-500">
            {filter === 'nearby'
              ? 'No matches within ' + NEARBY_RADIUS_MI + ' miles. Try All or High match.'
              : filter === 'high'
                ? 'No matches with similarity ≥ 50%. Try All.'
                : 'Listening for matches across the archive…'}
          </div>
        )}
        {visibleMatches.slice(0, 12).map(function (m: any) {
          var isOpen = expandedId === m.id
          var dimensions = (Array.isArray(m.match_dimensions) ? m.match_dimensions : []) as any[]
          var snippet = (m.summary || m.description || '').trim()
          if (snippet.length > 240) snippet = snippet.substring(0, 240).trim() + '…'
          var locationStr = m.location_description ||
            ([m.city, m.state_province, m.country].filter(function (s: string | null) { return !!s }).join(', '))
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
                  <p className="text-sm font-medium text-white truncate">{m.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {Math.round(m.match_score * 100)}% match
                    {dimensions.length > 0 && (
                      <> &middot; {dimensions.map(function (d: any) {
                        return typeof d === 'string' ? d : (d && d.label) || ''
                      }).filter(function (s: string) { return !!s }).join(', ')}</>
                    )}
                  </p>
                </div>
                <ChevronDown
                  className={
                    'w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5 transition-transform duration-200 ' +
                    (isOpen ? 'rotate-180' : '')
                  }
                />
              </button>

              {/* Expansion panel */}
              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-gray-800/60 space-y-3">
                  {snippet && (
                    <p className="text-sm text-gray-200 leading-relaxed">
                      &ldquo;{snippet}&rdquo;
                    </p>
                  )}

                  {/* Per-dimension match breakdown */}
                  {dimensions.length > 0 && (
                    <div className="space-y-1.5">
                      {dimensions.slice(0, 4).map(function (d: any, i: number) {
                        if (typeof d === 'string') return null
                        var pct = Math.round((d.score || 0) * 100)
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-400 w-32 flex-shrink-0 truncate">{d.label}</span>
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

                  {/* Facts row */}
                  {(locationStr || dateStr || m.witness_count || m.has_photo_video) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-400">
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
                      {m.witness_count && m.witness_count > 0 && (
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
                  )}

                  {/* View full report */}
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
        <a
          href="/submit"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-purple-600/20 border border-purple-500/40 text-purple-200 text-sm font-medium hover:bg-purple-600/30 transition-colors"
        >
          + Add another experience
        </a>
        <p className="text-[11px] text-gray-500">Each report sharpens your RADAR.</p>
      </div>

      {notifyToast && (
        <div style={{
          position: 'fixed', bottom: 'max(24px, env(safe-area-inset-bottom, 0px))',
          left: 0, right: 0, display: 'flex', justifyContent: 'center',
          zIndex: 9999, pointerEvents: 'none',
        }}>
          <div style={{
            background: '#1a1a33', border: '1px solid rgba(20,184,166,.3)',
            borderRadius: '12px', padding: '12px 20px',
            display: 'flex', alignItems: 'center', gap: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,.5)',
            pointerEvents: 'auto',
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#14b8a6', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: '#f1f1f8', whiteSpace: 'nowrap' }}>{notifyToast}</span>
          </div>
        </div>
      )}
    </div>
  )
}
