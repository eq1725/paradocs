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
import { ChevronDown, ChevronRight, MapPin, Calendar, ExternalLink, Users, Camera, Plus, User as UserIcon, Activity, Trash2, Loader2, X as XIcon } from 'lucide-react'
import Link from 'next/link'
import CategoryIcon from '@/components/ui/CategoryIcon'

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
import { CATEGORY_CONFIG } from '@/lib/constants'
import { Pencil } from 'lucide-react'
import EditReportModal from './EditReportModal'

/**
 * Panel-feedback (May 2026 — 5th round). Resolve a category slug to
 * a human-readable label. Falls through to a Title-Cased version of
 * the slug if the category isn't in CATEGORY_CONFIG.
 */
function resolveCategoryLabel(slug: string | null | undefined): string {
  if (!slug) return ''
  var conf = (CATEGORY_CONFIG as any)[slug]
  if (conf && conf.label) return conf.label
  // Fallback: title-case the slug ("ufos_aliens" → "UFOs Aliens")
  return slug.split('_').map(function (s: string) {
    return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
  }).join(' ')
}

/**
 * Panel-feedback (May 2026 — 5th round). Resolve the EVENT year for
 * display. Prefers event_date (exact), falls back to event_date_raw
 * (year/decade/month-only modes), then returns null rather than
 * defaulting to the current year (which was misleading users into
 * thinking their 1999 report happened in 2026).
 */
function resolveEventYear(r: any): number | null {
  if (!r) return null
  if (r.event_date) {
    try {
      var y = new Date(r.event_date).getFullYear()
      if (!isNaN(y) && y > 1800 && y < 2200) return y
    } catch {}
  }
  if (r.event_date_raw) {
    var m = String(r.event_date_raw).match(/(\d{4})/)
    if (m) {
      var y2 = parseInt(m[1], 10)
      if (!isNaN(y2) && y2 > 1800 && y2 < 2200) return y2
    }
  }
  return null
}

export default function LabConstellationTab() {
  var router = useRouter()
  var [loading, setLoading] = useState(true)
  var [hasSubmission, setHasSubmission] = useState(false)
  // V10.15 Phase C — load ALL non-deleted user submissions, not just
  // the most recent. allReports holds the raw rows; focusedIdx picks
  // which one drives the constellation; userExperience is derived.
  // The user can flip between submissions via the switcher pills,
  // and the focused submission's id is mirrored to the URL
  // (?focus=reportId) so the embedded YourSignalTab can pick it up.
  var [allReports, setAllReports] = useState<any[]>([])
  var [focusedIdx, setFocusedIdx] = useState<number>(0)
  var [userExperience, setUserExperience] = useState<UserExperience | null>(null)
  var [matches, setMatches] = useState<MatchedReport[]>([])
  var [totalExperiences, setTotalExperiences] = useState(0)
  var [showReveal, setShowReveal] = useState(false)
  var [showPaywall, setShowPaywall] = useState(false)
  var [notifyToast, setNotifyToast] = useState<string | null>(null)
  var [userEmail, setUserEmail] = useState('')

  // V10.15 — load all non-deleted user submissions on mount.
  useEffect(function() {
    async function loadData() {
      var sessionResult = await supabase.auth.getSession()
      var session = sessionResult.data.session
      if (!session) {
        setLoading(false)
        return
      }
      if (session.user.email) setUserEmail(session.user.email)

      var { data: userReports } = await supabase
        .from('reports')
        .select(`
          id, title, slug, category, description, summary,
          location_description, city, state_province, country,
          latitude, longitude, event_date, event_date_raw, event_date_precision, created_at,
          phenomenon_type:phenomenon_types(name)
        `)
        .eq('submitted_by', session.user.id)
        .eq('source_type', 'user_submission')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false })
        .limit(50)

      if (userReports && userReports.length > 0) {
        setAllReports(userReports)
        setHasSubmission(true)

        // V10.15 — honor ?focus=reportId from URL on first load so
        // deep links from email digests / push notifications can
        // open a specific submission.
        var focusFromUrl = router.query.focus as string
        var initialIdx = 0
        if (focusFromUrl) {
          var found = userReports.findIndex(function(r: any) { return r.id === focusFromUrl })
          if (found >= 0) initialIdx = found
        }
        setFocusedIdx(initialIdx)

        // Build the UserExperience from the focused report.
        var report = userReports[initialIdx]
        var resolvedYear0 = resolveEventYear(report)
        var exp: UserExperience = {
          id: report.id,
          // Panel-feedback (May 2026 — 5th round): use friendly
          // category label instead of raw slug as the fallback when
          // the user didn't pick a specific phenomenon_type.
          type_name: (report as any).phenomenon_type?.name || resolveCategoryLabel(report.category) || 'Your experience',
          category: report.category || '',
          location: [report.city, report.state_province].filter(Boolean).join(', ') || report.location_description || 'Unknown',
          latitude: report.latitude || 30.08,
          longitude: report.longitude || -94.10,
          // Panel-feedback (May 2026 — 5th round): resolveEventYear
          // prefers event_date, falls back to event_date_raw, returns
          // null (not current year) so we don't lie about when the
          // event happened.
          year: resolvedYear0 != null ? resolvedYear0 : (new Date().getFullYear() as any),
          description: report.description || report.summary || '',
        }
        // If we couldn't resolve a year, mark the field so the UI
        // can render "Date unknown" instead of a misleading number.
        if (resolvedYear0 == null) (exp as any).year_unknown = true
        setUserExperience(exp)

        // Fetch matches for the focused report.
        await fetchMatches(report.id, report.category, report.latitude, report.longitude, report.description || report.summary || '', session.access_token)
      }

      setLoading(false)
    }
    loadData()
  }, [])

  // V10.15 — when focusedIdx changes, rebuild userExperience and
  // refetch matches against the newly focused report. Also mirror
  // the focus to the URL so the embedded YourSignalTab can read it.
  useEffect(function() {
    if (allReports.length === 0) return
    var report = allReports[focusedIdx]
    if (!report) return
    var resolvedYear = resolveEventYear(report)
    var exp: UserExperience = {
      id: report.id,
      type_name: (report as any).phenomenon_type?.name || resolveCategoryLabel(report.category) || 'Your experience',
      category: report.category || '',
      location: [report.city, report.state_province].filter(Boolean).join(', ') || report.location_description || 'Unknown',
      latitude: report.latitude || 30.08,
      longitude: report.longitude || -94.10,
      year: resolvedYear != null ? resolvedYear : (new Date().getFullYear() as any),
      description: report.description || report.summary || '',
    }
    if (resolvedYear == null) (exp as any).year_unknown = true
    setUserExperience(exp)
    supabase.auth.getSession().then(function(s) {
      var token = s.data.session?.access_token || ''
      if (!token) return
      fetchMatches(report.id, report.category, report.latitude, report.longitude, report.description || report.summary || '', token)
    })
    // Mirror focus to URL (shallow). YourSignalTab will pick it up.
    var nextQuery = Object.assign({}, router.query, { focus: report.id })
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true })
    // V10.15 — fire PostHog event so we can measure how often users
    // actually use the multi-submission switcher (and whether the
    // option is even surfaced to enough users to matter).
    try {
      var posthog = require('@/lib/posthog')
      posthog.capture('story_focus_change', { report_index: focusedIdx, total_reports: allReports.length })
    } catch (_e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIdx, allReports.length])

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

  // No submissions yet — V10.x panel-feedback (May 2026):
  // The old ExperienceOnboarding Q&A picker ("What did you notice first?")
  // was dead-clicking for users with no reports because its filters had
  // nothing to filter against. Removed. The YourSignalTab empty state
  // renders directly below this component and carries the "Your Signal
  // grows with your story" headline + the "Share your first experience"
  // CTA. We return null here so the page reads as a single, clean
  // empty state rather than two stacked dead zones.
  if (!hasSubmission && !showReveal) {
    return null
  }

  // V10.16 Phase E.1 — handler when a submission is deleted from
  // the Manage panel. Removes the row from local state, refocuses
  // safely, and if it was the user's last submission, flips back
  // to the onboarding state.
  function handleSubmissionDeleted(deletedId: string) {
    setAllReports(function (prev) {
      var next = prev.filter(function (r) { return r.id !== deletedId })
      if (next.length === 0) {
        // No submissions left — return to onboarding state.
        setHasSubmission(false)
        setUserExperience(null)
        setMatches([])
      } else {
        // Refocus: if the deleted submission was focused or earlier
        // in the list, the index might now point past the array end
        // or to a different row. Clamp to a valid index.
        setFocusedIdx(function (current) {
          // If the deleted index was the focused one, prefer staying
          // at the same numeric index (so the user sees the next
          // submission in line). Clamp to next.length - 1.
          var deletedIdx = prev.findIndex(function (r) { return r.id === deletedId })
          if (deletedIdx === -1) return Math.min(current, next.length - 1)
          if (current === deletedIdx) return Math.min(current, next.length - 1)
          if (current > deletedIdx) return current - 1
          return current
        })
      }
      return next
    })
  }

  // Has submission — V9.11.5 #16 polished RADAR view.
  // V10.15 — wrapped with the multi-submission switcher pill row
  // when the user has more than one submission. The switcher lets
  // them flip the RADAR + the embedded SIGNAL focus between any of
  // their submissions; the focused report ID is mirrored to the URL.
  // V10.16 Phase E.1 — switcher ALWAYS renders (even with one
  // submission) so the Manage affordance is reachable. Was hidden
  // for single-submission users in V10.15.
  if (userExperience) {
    return (
      <>
        <SubmissionSwitcher
          reports={allReports}
          focusedIdx={focusedIdx}
          onFocus={setFocusedIdx}
          onDeleted={handleSubmissionDeleted}
          onEdited={function () {
            // Panel-feedback (May 2026 — 5th round): refetch user's
            // reports after an edit from the Manage panel so any
            // pill labels / focused-report fields reflect the new
            // values immediately.
            supabase.auth.getSession().then(function (s) {
              var session = s.data.session
              if (!session) return
              supabase
                .from('reports')
                .select(`
                  id, title, slug, category, description, summary,
                  location_description, city, state_province, country,
                  latitude, longitude, event_date, event_date_raw, event_date_precision, created_at,
                  phenomenon_type:phenomenon_types(name)
                `)
                .eq('submitted_by', session.user.id)
                .eq('source_type', 'user_submission')
                .neq('status', 'deleted')
                .order('created_at', { ascending: false })
                .limit(50)
                .then(function (r: any) {
                  if (r.data && r.data.length > 0) setAllReports(r.data)
                })
            })
          }}
        />
        <PolishedRadarView
          userExperience={userExperience}
          matches={matches}
          totalExperiences={totalExperiences}
          userEmail={userEmail}
          router={router}
          reportRaw={allReports[focusedIdx] || null}
          onReportEdited={function () {
            // After a successful edit, refetch the user's reports
            // so the card reflects the changes.
            supabase.auth.getSession().then(function (s) {
              var session = s.data.session
              if (!session) return
              supabase
                .from('reports')
                .select(`
                  id, title, slug, category, description, summary,
                  location_description, city, state_province, country,
                  latitude, longitude, event_date, event_date_raw, event_date_precision, created_at,
                  phenomenon_type:phenomenon_types(name)
                `)
                .eq('submitted_by', session.user.id)
                .eq('source_type', 'user_submission')
                .neq('status', 'deleted')
                .order('created_at', { ascending: false })
                .limit(50)
                .then(function (r: any) {
                  if (r.data && r.data.length > 0) {
                    setAllReports(r.data)
                    // Refresh userExperience from the same focused index.
                    var idx = Math.min(focusedIdx, r.data.length - 1)
                    var report = r.data[idx]
                    var resolved = resolveEventYear(report)
                    var nextExp: UserExperience = {
                      id: report.id,
                      type_name: (report as any).phenomenon_type?.name || resolveCategoryLabel(report.category) || 'Your experience',
                      category: report.category || '',
                      location: [report.city, report.state_province].filter(Boolean).join(', ') || report.location_description || 'Unknown',
                      latitude: report.latitude || 30.08,
                      longitude: report.longitude || -94.10,
                      year: resolved != null ? resolved : (new Date().getFullYear() as any),
                      description: report.description || report.summary || '',
                    }
                    if (resolved == null) (nextExp as any).year_unknown = true
                    setUserExperience(nextExp)
                  }
                })
            })
          }}
        />
      </>
    )
  }

  return null
}

/**
 * V10.15 Phase C / V10.16 Phase E.1 — submission switcher pill row
 * with Manage panel.
 *
 * Renders one pill per user submission for focus-switching. Tap a
 * pill to refocus RADAR + embedded SIGNAL. Always renders (even for
 * single-submission users) so the Manage affordance is reachable.
 *
 * The trailing Manage gear pill opens a slide-up panel listing all
 * submissions with edit/delete actions. This is the canonical home
 * for "manage your submitted reports" — moved off the CASES tab in
 * V10.16 because Collections (case files) is a research-workflow
 * metaphor that doesn't fit user-submitted stories.
 *
 * Mobile: pill row scrolls horizontally with snap. Desktop: wraps.
 * The Manage panel is a full-screen modal on mobile, a centered
 * dialog on desktop.
 */
function SubmissionSwitcher(props: {
  reports: any[]
  focusedIdx: number
  onFocus: (idx: number) => void
  onDeleted: (deletedId: string) => void
  onEdited?: () => void
}) {
  var [manageOpen, setManageOpen] = useState(false)
  function pillLabel(r: any): string {
    var typeName = r.phenomenon_type?.name || r.category || 'Experience'
    var year = r.event_date ? new Date(r.event_date).getFullYear() : null
    return year ? typeName + ' ' + year : typeName
  }
  return (
    <>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-1">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-3 h-3 text-purple-300" />
            <span className="text-[10px] font-semibold tracking-widest uppercase text-purple-300">
              Your {props.reports.length === 1 ? 'experience' : 'experiences (' + props.reports.length + ')'}
            </span>
          </div>
          <button
            type="button"
            onClick={function () { setManageOpen(true) }}
            className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-widest uppercase text-gray-400 hover:text-purple-300 transition-colors"
            aria-label="Manage your submissions"
          >
            Manage <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        {props.reports.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 sm:-mx-0 px-4 sm:px-0 pb-1 sm:flex-wrap snap-x snap-mandatory sm:snap-none">
            {props.reports.map(function(r: any, i: number) {
              var isActive = i === props.focusedIdx
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={function() { props.onFocus(i) }}
                  className={
                    'flex-shrink-0 snap-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ' +
                    (isActive
                      ? 'bg-purple-600/30 text-purple-100 border border-purple-500/50'
                      : 'bg-gray-900/60 text-gray-300 hover:text-white border border-gray-800/60 hover:border-purple-600/30')
                  }
                >
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-purple-300" />}
                  {pillLabel(r)}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {manageOpen && (
        <ManageSubmissionsPanel
          reports={props.reports}
          onClose={function () { setManageOpen(false) }}
          onDeleted={function (id: string) {
            props.onDeleted(id)
            if (props.reports.length <= 1) setManageOpen(false)
          }}
          onEdited={function () {
            if (props.onEdited) props.onEdited()
          }}
        />
      )}
    </>
  )
}

/**
 * V10.16 Phase E.1 — ManageSubmissionsPanel.
 *
 * Slide-up modal (mobile) / centered dialog (desktop) listing the
 * user's submissions. Each row shows title, status, date and an
 * inline two-step Delete affordance. Future: edit, restore from
 * trash, share permalink.
 *
 * Delete uses the same /api/reports/[slug]/delete endpoint as the
 * Cases tab; on success calls onDeleted(id) so the parent can drop
 * the row from its allReports state and refocus.
 *
 * Closes on backdrop tap, Escape key, or the X button.
 */
function ManageSubmissionsPanel(props: {
  reports: any[]
  onClose: () => void
  onDeleted: (id: string) => void
  onEdited?: () => void
}) {
  useEffect(function () {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') props.onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return function () {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [])
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-gray-950 border border-gray-800 sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[88dvh] flex flex-col"
        onClick={function (e) { e.stopPropagation() }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-white">Manage your submissions</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">{props.reports.length} {props.reports.length === 1 ? 'experience' : 'experiences'} shared</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close manage submissions"
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {props.reports.map(function (r: any) {
            return (
              <ManageSubmissionRow
                key={r.id}
                report={r}
                onDeleted={props.onDeleted}
                onEdited={props.onEdited}
              />
            )
          })}
        </div>
        <div className="border-t border-gray-800 px-4 py-3">
          <Link
            href="/start"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-300 hover:text-purple-200"
          >
            <Plus className="w-4 h-4" />
            Share another experience
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * V10.16 Phase E.1 — ManageSubmissionRow.
 *
 * Single row in the Manage panel. Two-step inline delete (matches
 * the iOS Mail / Notes confirm pattern). Status pill on the right.
 * Tapping the title navigates to /report/[slug] for approved
 * submissions; pending submissions stay non-navigating (status pill
 * communicates why).
 */
function ManageSubmissionRow(props: { report: any; onDeleted: (id: string) => void; onEdited?: () => void }) {
  var r = props.report
  var [confirming, setConfirming] = useState(false)
  var [busy, setBusy] = useState(false)
  var [errMsg, setErrMsg] = useState<string | null>(null)
  // Panel-feedback (May 2026 — 5th round): edit affordance per row.
  var [editOpen, setEditOpen] = useState(false)
  useEffect(function () {
    if (!confirming) return
    var t = setTimeout(function () { setConfirming(false) }, 4000)
    return function () { clearTimeout(t) }
  }, [confirming])
  function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    if (!confirming) { setConfirming(true); return }
    setBusy(true)
    setErrMsg(null)
    supabase.auth.getSession().then(function (s) {
      var token = s.data.session ? s.data.session.access_token : null
      if (!token) { setErrMsg('Sign in again to delete.'); setBusy(false); return }
      fetch('/api/reports/' + encodeURIComponent(r.slug) + '/delete', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then(function (j) { throw new Error(j.error || 'Delete failed') })
          props.onDeleted(r.id)
        })
        .catch(function (e: any) {
          setErrMsg(e.message || 'Delete failed')
          setBusy(false)
          setConfirming(false)
        })
    })
  }
  var status = (r.status || 'pending') as string
  var statusLabel = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
  var clickable = status === 'approved' || status === 'published'
  var typeLabel = r.phenomenon_type?.name || r.category || 'Experience'
  var date = r.event_date ? new Date(r.event_date).getFullYear() : (r.created_at ? new Date(r.created_at).toLocaleDateString() : '')
  return (
    <div className="rounded-lg bg-gray-900/60 border border-gray-800/60 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
          <CategoryIcon category={r.category} size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {clickable ? (
              <Link href={'/report/' + r.slug} className="text-sm font-medium text-white truncate hover:text-purple-300">
                {r.title || 'Untitled Report'}
              </Link>
            ) : (
              <span className="text-sm font-medium text-white truncate">{r.title || 'Untitled Report'}</span>
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {typeLabel}{date ? ' · ' + date : ''}
          </div>
          {errMsg && <p className="text-[10px] text-red-300 mt-1">{errMsg}</p>}
        </div>
        <span className={'flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ' +
          (status === 'approved' || status === 'published'
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
            : status === 'rejected'
              ? 'bg-red-500/10 border-red-500/40 text-red-300'
              : 'bg-amber-500/10 border-amber-500/40 text-amber-300')}>
          {statusLabel}
        </span>
        {/* Panel-feedback (May 2026 — 5th round): inline Edit per
            row in the Manage panel. Same EditReportModal as the
            Your Report card uses. */}
        <button
          type="button"
          onClick={function (e) { e.preventDefault(); e.stopPropagation(); setEditOpen(true) }}
          aria-label="Edit this submission"
          className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:text-purple-300 hover:bg-purple-500/10"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          aria-label={confirming ? 'Tap again to confirm delete' : 'Delete this submission'}
          className={
            'flex-shrink-0 inline-flex items-center justify-center transition-all ' +
            (confirming
              ? 'gap-1 px-2 py-1 rounded-md bg-red-500/15 border border-red-500/40 text-red-300 text-[10px] font-semibold'
              : 'w-7 h-7 rounded-md text-gray-500 hover:text-red-300 hover:bg-red-500/10')
          }
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : confirming ? (<><Trash2 className="w-3 h-3" /> Confirm</>) : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
      <EditReportModal
        open={editOpen}
        onClose={function () { setEditOpen(false) }}
        onSaved={function () { if (props.onEdited) props.onEdited() }}
        report={r}
      />
    </div>
  )
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
  // Panel-feedback (May 2026 — 5th round): pass the raw report so
  // the edit modal can prefill all fields. Optional so legacy
  // invocations don't break.
  reportRaw?: any
  onReportEdited?: () => void
}) {
  var [filter, setFilter] = useState<'all' | 'high' | 'nearby'>('all')
  var [notifyToast, setNotifyToast] = useState<string | null>(null)
  // Panel-feedback (May 2026 — 5th round): edit modal state.
  var [showEditModal, setShowEditModal] = useState(false)
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
  // (e.g. "UFO Sighting"); falls back to a FRIENDLY category label
  // when no phenomenon_type was selected (panel-feedback May 2026
  // 5th round — was rendering raw "ufos_aliens" slug before).
  var ownTitle = props.userExperience.type_name
    || resolveCategoryLabel(props.userExperience.category)
    || 'Your experience'
  var ownDescription = (props.userExperience.description || '').trim()
  var ownSnippet = ownDescription.length > 240
    ? ownDescription.substring(0, 240).trim() + '…'
    : ownDescription
  var ownLocation = props.userExperience.location || ''
  // Panel-feedback (May 2026 — 5th round): don't show created_at year
  // when event_date is genuinely unknown. The data layer flags this
  // via year_unknown so we can render 'Date unknown' instead of
  // lying about when the event occurred.
  var ownYearUnknown = !!(props.userExperience as any).year_unknown
  var ownYear = ownYearUnknown
    ? ''
    : (props.userExperience.year ? String(props.userExperience.year) : '')

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
              This is the report we&rsquo;re matching against.
            </p>
            {/* Panel-feedback (May 2026 — 5th round): Edit affordance.
                Opens an in-place modal; saves go through moderation
                with default auto-approve so ~95% land live without
                admin intervention. */}
            {props.reportRaw && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={function () { setShowEditModal(true) }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-700/50 text-xs font-medium text-purple-200 hover:bg-purple-600/20 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit report
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit modal — mounted once at the card level, drives via state. */}
      {props.reportRaw && (
        <EditReportModal
          open={showEditModal}
          onClose={function () { setShowEditModal(false) }}
          onSaved={function () { if (props.onReportEdited) props.onReportEdited() }}
          report={props.reportRaw}
        />
      )}

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
          href="/start"
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
