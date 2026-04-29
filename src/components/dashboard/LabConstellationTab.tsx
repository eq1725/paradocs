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

      var res = await fetch('/api/constellation/match?' + params.toString(), {
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
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6" style={{ minHeight: 'calc(100vh - 180px)' }}>
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
      <div
        className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6"
        style={{ height: 'calc(100vh - 120px)', minHeight: '500px' }}
      >
        <ConstellationReveal
          userExperience={userExperience}
          matches={matches}
          totalExperiences={totalExperiences}
          startAtMap={!showReveal}
          onPaywall={function() {
            setShowPaywall(true)
          }}
          onNotify={function() {
            setShowPaywall(true)
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
      </div>
    )
  }

  return null
}
