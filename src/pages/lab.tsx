'use client'

/**
 * Lab Page — Session A1: UX Consolidation
 *
 * Single tabbed view replacing all /dashboard/* routes.
 * 4 horizontal tabs: Saves | Cases | Map | Notes
 *
 * Absorbs:
 * - /dashboard/saved → Saves tab
 * - /dashboard/research-hub, /dashboard/reports → Cases tab
 * - /dashboard/constellation → Map tab
 * - /dashboard/journal/* → Notes tab
 * - /dashboard/insights → inline AI insight cards in Saves
 * - /dashboard/digests → notification bell
 * - /dashboard/settings → gear icon → /profile
 *
 * Works for both authenticated and unauthenticated users.
 * SWC: Uses var + function(){} for compatibility with MobileBottomTabs imports.
 */

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  Bookmark,
  FolderOpen,
  Map as MapIcon,
  Settings,
  Bell,
  PlusCircle,
  Lock,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Telescope,
  Activity,
  Sparkles,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'
import LabSavesTab from '@/components/dashboard/LabSavesTab'
import LabCasesTab from '@/components/dashboard/LabCasesTab'
import LabMapTab from '@/components/dashboard/LabMapTab'
// LabSubmissionsTab merged into LabCasesTab — submissions show as pinned section
import LabConstellationTab from '@/components/dashboard/LabConstellationTab'
import { useLabData } from '@/lib/hooks/useLabData'
import { Star } from 'lucide-react'

// Tab definitions
// V9.11.6 — Notes tab deprecated in favor of "Your Signal" — AI-driven
// personal pattern analysis surface (4 insight cards generated from
// the user's report against the broader ingested archive). The journal
// feature is removed from the build per product call: low value in the
// current user journey vs the AI insights replacing it.
var TAB_KEYS = ['constellation', 'saves', 'cases', 'map', 'signal'] as const
type TabKey = typeof TAB_KEYS[number]

var TAB_CONFIG: Record<string, { label: string; mobileLabel?: string; icon: typeof Star }> = {
  constellation: { label: 'Radar', icon: Star },
  saves: { label: 'Saves', icon: Bookmark },
  cases: { label: 'Cases', icon: FolderOpen },
  map: { label: 'My Map', icon: MapIcon },
  signal: { label: 'Your Signal', mobileLabel: 'Signal', icon: Activity },
}

export default function LabPage() {
  var router = useRouter()
  var [activeTab, setActiveTab] = useState<TabKey>('constellation')
  var [isLoggedIn, setIsLoggedIn] = useState(false)
  var [userProfile, setUserProfile] = useState<any>(null)
  var [loading, setLoading] = useState(true)

  // Centralized Lab data — one fetch powers Saves / Cases / Map.
  // useLabData must be called unconditionally every render; it short-circuits
  // internally when the user isn't authenticated.
  var lab = useLabData()

  // Read tab from URL query
  useEffect(function() {
    var tabFromQuery = router.query.tab as string
    if (!tabFromQuery) return
    // V9.11.6 — backwards-compat: ?tab=notes → ?tab=signal so any
    // bookmarks / push-notification deep links from the legacy
    // journal era still land somewhere useful.
    if (tabFromQuery === 'notes') {
      setActiveTab('signal')
      router.replace({ query: { ...router.query, tab: 'signal' } }, undefined, { shallow: true })
      return
    }
    if (TAB_KEYS.includes(tabFromQuery as TabKey)) {
      setActiveTab(tabFromQuery as TabKey)
    }
  }, [router.query.tab])

  // Auth check
  useEffect(function() {
    function checkAuth() {
      supabase.auth.getSession().then(function(result) {
        var session = result.data.session
        setIsLoggedIn(!!session)
        if (session) {
          supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
            .then(function(profileResult) {
              setUserProfile(profileResult.data)
              setLoading(false)
            })
        } else {
          setLoading(false)
        }
      })
    }
    checkAuth()
    var authListener = supabase.auth.onAuthStateChange(function() {
      checkAuth()
    })
    return function() {
      authListener.data.subscription.unsubscribe()
    }
  }, [])

  // Update URL when tab changes (shallow)
  var handleTabChange = useCallback(function(tab: TabKey) {
    setActiveTab(tab)
    router.replace('/lab?tab=' + tab, undefined, { shallow: true })
  }, [router])

  // Lock scroll on mobile/tablet (<1024px) when constellation active
  useEffect(function() {
    if (activeTab !== 'constellation') return
    function lockScroll() {
      if (window.innerWidth < 1024) {
        document.documentElement.style.overflow = 'hidden'
        document.documentElement.style.height = '100%'
        document.body.style.overflow = 'hidden'
        document.body.style.height = '100%'
      } else {
        document.documentElement.style.overflow = ''
        document.documentElement.style.height = ''
        document.body.style.overflow = ''
        document.body.style.height = ''
      }
    }
    lockScroll()
    window.addEventListener('resize', lockScroll)
    return function() {
      window.removeEventListener('resize', lockScroll)
      document.documentElement.style.overflow = ''
      document.documentElement.style.height = ''
      document.body.style.overflow = ''
      document.body.style.height = ''
    }
  }, [activeTab])

  return (
    <>
      <Head>
        <title>Lab | Paradocs</title>
        <meta name="description" content="Your personal research lab — saves, case files, geographic map, and notes." />
        {activeTab === 'constellation' && (
          <style>{`footer{background:#0a0a14 !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}`}</style>
        )}
      </Head>

      <div className={activeTab === 'constellation' ? 'flex flex-col lg:block lg:h-auto' : ''}
        style={activeTab === 'constellation' ? { background: '#0a0a14', minHeight: '100dvh', paddingBottom: '24px' } : { background: '#0a0a14' }}>
        {/* Header row: title + actions — scrolls away */}
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-600/20 rounded-lg">
                <Telescope className="w-5 h-5 sm:w-6 sm:h-6 text-primary-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">Lab</h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Your personal research workspace</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Submit Report link */}
              <Link
                href="/submit"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-primary-400 bg-primary-600/10 border border-primary-600/20 hover:bg-primary-600/20 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Submit Report</span>
              </Link>

              {/* Notification bell */}
              <button
                className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Notifications — coming soon"
              >
                <Bell className="w-5 h-5" />
                {/* Future: notification badge */}
              </button>

              {/* Settings gear → profile */}
              <Link
                href="/profile"
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Tab bar — sticky below header so users can always switch tabs */}
        <div className="sticky-below-header bg-gray-950/95 backdrop-blur-lg" style={{ background: activeTab === 'constellation' ? '#0a0a14' : undefined }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className={classNames(
              'flex border-b',
              activeTab === 'constellation' ? 'border-transparent' : 'border-gray-800'
            )}>
              {TAB_KEYS.map(function(tabKey) {
                var config = TAB_CONFIG[tabKey]
                var Icon = config.icon
                var isActive = activeTab === tabKey
                return (
                  <button
                    key={tabKey}
                    onClick={function() { handleTabChange(tabKey) }}
                    className={classNames(
                      'flex-1 flex flex-col items-center gap-1 py-2.5 border-b-2 transition-colors min-w-0',
                      isActive
                        ? 'border-primary-500 text-primary-400'
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {config.mobileLabel ? (
                      <>
                        <span className="text-[10px] font-semibold tracking-wide uppercase leading-none whitespace-nowrap sm:hidden">{config.mobileLabel}</span>
                        <span className="text-[10px] font-semibold tracking-wide uppercase leading-none whitespace-nowrap hidden sm:inline">{config.label}</span>
                      </>
                    ) : (
                      <span className="text-[10px] font-semibold tracking-wide uppercase leading-none whitespace-nowrap">{config.label}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Auth gate for unauthenticated users */}
        {!isLoggedIn && !loading ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <UnauthenticatedPrompt />
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          /* Tab content — Constellation goes full-bleed; others get constrained padding */
          <div className={activeTab === 'constellation' ? 'flex-1 min-h-0' : ''}>
            {activeTab === 'constellation' && (
              <LabConstellationTab />
            )}
            {activeTab !== 'constellation' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20" style={{ minHeight: 'calc(100dvh - 200px)' }}>
                {activeTab === 'saves' && (
                  <LabSavesTab
                    loading={lab.loading}
                    userMapData={lab.userMapData}
                    aiConnections={lab.aiConnections}
                    insights={lab.insights}
                    newInsights={lab.newInsights}
                    caseFiles={lab.caseFiles}
                    onRefresh={lab.refresh}
                  />
                )}
                {activeTab === 'cases' && (
                  <LabCasesTab
                    loading={lab.loading}
                    userMapData={lab.userMapData}
                    caseFiles={lab.caseFiles}
                    aiConnections={lab.aiConnections}
                    onRefresh={lab.refresh}
                  />
                )}
                {activeTab === 'map' && (
                  <LabMapTab
                    loading={lab.loading}
                    userMapData={lab.userMapData}
                    aiConnections={lab.aiConnections}
                    caseFiles={lab.caseFiles}
                    onRefresh={lab.refresh}
                  />
                )}
                {activeTab === 'signal' && <YourSignalTab />}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/** Unauthenticated state — sign-in prompt */
function UnauthenticatedPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
      <div className="p-4 bg-primary-600/20 rounded-full mb-6">
        <Lock className="w-10 h-10 text-primary-400" />
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-3">
        Sign in to access your Lab
      </h2>
      <p className="text-gray-400 max-w-md mb-8 text-sm sm:text-base">
        Your Lab is your personal research workspace. Save reports, build case files,
        explore your evidence on a geographic map, and keep investigation notes — all in one place.
      </p>
      <Link
        href="/login"
        className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-colors"
      >
        <LogIn className="w-4 h-4" />
        Sign in to get started
      </Link>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// NOTES TAB — Journal entries with inline create/edit
// ─────────────────────────────────────────────────────────────────

/**
 * Your Signal tab — V9.11.6
 *
 * Replaces the deprecated Notes/journal tab with an AI-driven
 * personalized pattern-analysis surface. Each user sees four
 * insight cards generated from their report(s) against the
 * broader ingested archive:
 *
 *   1. Your fingerprint   — top dimensions where your report
 *                            matches the archive most strongly.
 *   2. Patterns near you  — geographic + temporal clusters your
 *                            experience fits into.
 *   3. Did you know       — single surprising AI-surfaced fact
 *                            (Sonnet, cached 7 days per report).
 *   4. Across the archive — broader pattern context that places
 *                            your report in a bigger picture.
 *
 * Phase 1.A (this commit) — tab scaffold + placeholder cards.
 * Phase 1.B (next commit) — deterministic generators for cards
 *                            1, 2, 4 + the GET /api/lab/your-signal
 *                            endpoint.
 * Phase 1.C — Sonnet integration for card 3 + caching layer +
 *              peer-connection opt-in surface at post-RADAR reveal.
 *
 * Tone rule (panel): we ALWAYS say "your report shares patterns
 * with…" never "your report exhibits…". This is documentation,
 * not diagnosis.
 */
function YourSignalTab() {
  var [data, setData] = useState<any>(null)
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)

  useEffect(function () {
    function load() {
      setLoading(true)
      setError(null)
      supabase.auth.getSession().then(function (sessionResult) {
        var session = sessionResult.data.session
        if (!session) {
          setData({ has_report: false })
          setLoading(false)
          return
        }
        fetch('/api/lab/your-signal', {
          headers: { Authorization: 'Bearer ' + session.access_token },
        })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Failed to load Your Signal')) })
          .then(function (payload) { setData(payload) })
          .catch(function (err) { setError(err.message || 'Failed to load') })
          .finally(function () { setLoading(false) })
      })
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16 max-w-md mx-auto">
        <p className="text-sm text-red-300 mb-3">{error}</p>
        <button
          onClick={function () { window.location.reload() }}
          className="text-xs text-purple-300 hover:text-purple-200 underline"
        >
          Try again
        </button>
      </div>
    )
  }

  // Empty state — turn into a growth lever rather than a dead end.
  if (!data || !data.has_report) {
    return (
      <div className="text-center py-16 max-w-md mx-auto">
        <div className="inline-flex w-12 h-12 rounded-full bg-purple-600/20 border border-purple-500/30 items-center justify-center mb-4">
          <Activity className="w-6 h-6 text-purple-300" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Your Signal grows with your story</h3>
        <p className="text-sm text-gray-400 leading-relaxed mb-6">
          Share an experience and we&rsquo;ll surface emergent patterns from across
          the archive that connect to it &mdash; geographic clusters, temporal
          rhythms, signatures that recur across thousands of reports.
        </p>
        <Link
          href="/start"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Share your first experience
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-white">Your Signal</h2>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">
          Personalized patterns surfaced from your report against the broader archive.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FingerprintCard data={data.fingerprint} />
        <ClusterCard data={data.cluster} />
        <DidYouKnowCard data={data.did_you_know} />
        <ContextCard data={data.context} />
      </div>

      <p className="text-[11px] text-gray-500 text-center pt-2">
        Your Signal regenerates when you share a new experience or when significant new reports land in the archive.
      </p>
    </div>
  )
}

// ── Card components ─────────────────────────────────────────────────

function SignalCardShell(props: {
  kicker: string
  highlight?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={
        'rounded-xl border p-4 ' +
        (props.highlight
          ? 'bg-purple-950/15 border-purple-800/40'
          : 'bg-gray-900/40 border-gray-800/60')
      }
    >
      <div className="flex items-center gap-1.5 mb-2">
        {props.highlight && <Sparkles className="w-3 h-3 text-purple-400" />}
        <p className={
          'text-[10px] font-semibold tracking-widest uppercase ' +
          (props.highlight ? 'text-purple-400' : 'text-gray-400')
        }>
          {props.kicker}
        </p>
      </div>
      {props.children}
    </div>
  )
}

function FingerprintCard(props: { data: any }) {
  var d = props.data || {}
  // Strongest signal is `primary_label` with `primary_count` other reports.
  if (!d.primary_label || !d.primary_count) {
    return (
      <SignalCardShell kicker="Your fingerprint">
        <p className="text-sm text-gray-300 leading-snug">
          Your report joins the archive. As more reports cluster around its
          phenomenon type, your fingerprint will sharpen.
        </p>
      </SignalCardShell>
    )
  }
  return (
    <SignalCardShell kicker="Your fingerprint">
      <p className="text-sm text-white leading-snug">
        Your report shares its{' '}
        <span className="font-semibold text-purple-300">{d.primary_label}</span>{' '}
        signature with{' '}
        <span className="font-semibold text-purple-300">{d.primary_count.toLocaleString()}</span>{' '}
        other report{d.primary_count === 1 ? '' : 's'} in the archive.
      </p>
      {d.has_evidence && d.evidence_count > 0 && (
        <p className="text-[11px] text-gray-400 mt-2">
          Your report also carries photo / video evidence &mdash; one of{' '}
          {d.evidence_count.toLocaleString()} evidenced reports archived.
        </p>
      )}
    </SignalCardShell>
  )
}

function ClusterCard(props: { data: any }) {
  var d = props.data || {}
  if (d.skipped) {
    return (
      <SignalCardShell kicker="Patterns near you">
        <p className="text-sm text-gray-300 leading-snug">
          {d.reason === 'no_location'
            ? 'Add a location to your report to see how your experience sits inside regional clusters.'
            : 'Not enough data near your location yet. Check back as the archive grows.'}
        </p>
      </SignalCardShell>
    )
  }
  if (!d.nearby_count) {
    return (
      <SignalCardShell kicker="Patterns near you">
        <p className="text-sm text-gray-300 leading-snug">
          Your area is sparsely documented &mdash; you may be the first to log
          an experience here. As nearby reports arrive, this card will surface
          the patterns.
        </p>
      </SignalCardShell>
    )
  }
  var yearRange = (d.year_min && d.year_max && d.year_min !== d.year_max)
    ? d.year_min + '–' + d.year_max
    : (d.year_min ? String(d.year_min) : '')
  return (
    <SignalCardShell kicker="Patterns near you">
      <p className="text-sm text-white leading-snug">
        <span className="font-semibold text-purple-300">{d.nearby_count.toLocaleString()}</span>{' '}
        report{d.nearby_count === 1 ? '' : 's'} within ~{d.radius_mi} miles of your experience
        {yearRange && (<>
          {' '}— spanning <span className="font-semibold text-purple-300">{yearRange}</span>
        </>)}.
      </p>
    </SignalCardShell>
  )
}

function DidYouKnowCard(props: { data: any }) {
  var d = props.data || {}
  // Phase 1.B placeholder — Sonnet integration lands in Phase 1.C.
  if (d.pending) {
    return (
      <SignalCardShell kicker="Did you know" highlight>
        <p className="text-sm text-gray-300 leading-snug">
          The AI is reading the archive for surprising correlations connected
          to your experience. This card lights up once a pattern emerges that
          only Paradocs can see.
        </p>
        <p className="text-[10px] text-gray-500 mt-3 italic">
          AI insight coming online soon.
        </p>
      </SignalCardShell>
    )
  }
  // Phase 1.C will provide { headline, body, supporting_count } payload.
  return (
    <SignalCardShell kicker="Did you know" highlight>
      <p className="text-sm text-white leading-snug">
        {d.headline || d.body || '—'}
      </p>
      {d.supporting_count && (
        <p className="text-[11px] text-gray-400 mt-2">
          Based on {d.supporting_count.toLocaleString()} archived reports.
        </p>
      )}
    </SignalCardShell>
  )
}

function ContextCard(props: { data: any }) {
  var d = props.data || {}
  if (d.skipped) {
    return (
      <SignalCardShell kicker="Across the archive">
        <p className="text-sm text-gray-300 leading-snug">
          {d.reason === 'insufficient_data'
            ? 'Not enough reports tagged with this phenomenon yet. As more arrive, broader patterns will surface here.'
            : 'Add a phenomenon type to your report and we’ll show you how it patterns across the wider archive.'}
        </p>
      </SignalCardShell>
    )
  }
  var label = d.peak_month_name || ''
  var pct = d.peak_share_pct || 0
  var youLine = ''
  if (d.user_month_name) {
    youLine = d.user_matches_peak
      ? 'Yours was logged in ' + d.user_month_name + ' — right inside that peak.'
      : 'Yours was logged in ' + d.user_month_name + '.'
  }
  return (
    <SignalCardShell kicker="Across the archive">
      <p className="text-sm text-white leading-snug">
        Reports like yours peak in{' '}
        <span className="font-semibold text-purple-300">{label}</span>{' '}
        <span className="text-gray-400">({pct}% of dated reports).</span>
      </p>
      {youLine && (
        <p className="text-[11px] text-gray-300 mt-2">{youLine}</p>
      )}
    </SignalCardShell>
  )
}
