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

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { getApiBase } from '@/lib/utils'
import dynamic from 'next/dynamic'

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
import RadarVisualization from '@/components/radar/RadarVisualization'

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

function PolishedRadarView(props: {
  userExperience: UserExperience
  matches: MatchedReport[]
  totalExperiences: number
  userEmail: string
  router: any
}) {
  var [filter, setFilter] = useState<'all' | 'high' | 'nearby'>('all')
  var [notifyToast, setNotifyToast] = useState<string | null>(null)

  // Apply filter to compute the visible-match count.
  var visibleMatches = (function () {
    if (filter === 'high') return props.matches.filter(function (m: any) { return m.match_score >= 0.5 })
    if (filter === 'nearby') {
      if (typeof props.userExperience.latitude !== 'number' || typeof props.userExperience.longitude !== 'number') return []
      return props.matches.filter(function (m: any) {
        if (typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return false
        var R = 6371
        var dLat = (m.latitude - (props.userExperience.latitude as number)) * Math.PI / 180
        var dLng = (m.longitude - (props.userExperience.longitude as number)) * Math.PI / 180
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((props.userExperience.latitude as number) * Math.PI / 180) *
          Math.cos((m.latitude as number) * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2)
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= 500
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

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <div className="flex justify-center mb-6">
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
          onMatchClick={function (m) {
            if (typeof window !== 'undefined') window.location.href = '/report/' + m.slug
          }}
        />
      </div>

      {/* Filter chips */}
      <div className="flex justify-center gap-2 mb-4 flex-wrap">
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

      {/* Match list (filtered) */}
      <div className="space-y-2">
        {visibleMatches.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-500">
            {filter === 'nearby'
              ? 'No matches within 500km. Try All or High match.'
              : filter === 'high'
                ? 'No matches with score ≥ 50%. Try All.'
                : 'Listening for matches across the archive…'}
          </div>
        )}
        {visibleMatches.slice(0, 12).map(function (m: any) {
          return (
            <a
              key={m.id}
              href={'/report/' + m.slug}
              className="block p-3 bg-gray-900/60 border border-gray-800/60 rounded-xl hover:border-purple-500/40 transition-colors"
            >
              <p className="text-sm font-medium text-white truncate">{m.title}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {Math.round(m.match_score * 100)}% match
                {Array.isArray(m.match_dimensions) && m.match_dimensions.length > 0 && (
                  <> · {m.match_dimensions.map(function (d: any) {
                    return typeof d === 'string' ? d : (d && d.label) || ''
                  }).filter(function (s: string) { return !!s }).join(', ')}</>
                )}
              </p>
            </a>
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
