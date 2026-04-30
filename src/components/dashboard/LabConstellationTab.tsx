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

  // Has submission — show constellation (with or without reveal animation)
  if (userExperience) {
    return (
      <div className="cv2-lab-container">
        <style>{'\
.cv2-lab-container{height:calc(100dvh - 120px);min-height:500px;}\
@media(max-width:767px){.cv2-lab-container{height:calc(100dvh - 310px);}}\
        '}</style>
        <ConstellationReveal
          userExperience={userExperience}
          matches={matches}
          totalExperiences={totalExperiences}
          startAtMap={!showReveal}
          onPaywall={function() {
            setShowPaywall(true)
          }}
          onNotify={function() {
            // Lightweight notify — quick API call + toast, no modal
            if (notifyToast) return
            if (userEmail) {
              fetch(getApiBase() + '/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userEmail, source: 'constellation_notify' }),
              }).catch(function() {})
            }
            setNotifyToast('We\'ll notify you when new matches appear.')
            setTimeout(function() { setNotifyToast(null) }, 3500)
          }}
          onShare={function() {
            if (navigator.share) {
              navigator.share({
                title: 'My Constellation — Paradocs',
                text: 'I found ' + matches.length + ' connections to my experience on Paradocs.',
                url: window.location.href,
              }).catch(function() {})
            } else if (navigator.clipboard) {
              navigator.clipboard.writeText(window.location.href)
            }
          }}
          onReset={function() {
            setShowReveal(false)
          }}
        />
        <PaywallModal
          isOpen={showPaywall}
          onClose={function() { setShowPaywall(false) }}
          userEmail={userEmail}
          unlockedCount={matches.filter(function(m) { return !m.locked }).length}
          totalMatches={matches.length}
        />
        {notifyToast && (
          <div style={{
            position: 'fixed', bottom: 'max(24px, env(safe-area-inset-bottom, 0px))',
            left: '50%', transform: 'translateX(-50%)',
            background: '#1a1a33', border: '1px solid rgba(20,184,166,.3)',
            borderRadius: '12px', padding: '12px 20px',
            display: 'flex', alignItems: 'center', gap: '10px',
            zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.5)',
            animation: 'cv2FadeUp .35s ease both',
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#14b8a6', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: '#f1f1f8', whiteSpace: 'nowrap' }}>{notifyToast}</span>
          </div>
        )}
      </div>
    )
  }

  return null
}
