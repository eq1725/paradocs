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
  ThumbsUp,
  ThumbsDown,
  Clock,
  Send,
  Loader2,
  ExternalLink,
  Users,
  Heart,
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

  // QA #1 (RE-FIX V10.2.1): the previous scroll-lock effect actively
  // overrode html/body overflow to 'hidden' on mobile whenever the
  // constellation tab was active — that's exactly what was making the
  // page un-scrollable. The lock was a leftover from when the RADAR
  // was a fullscreen fixed-height experience; now that the tab has
  // Your Report, filter caption, match list, and "Add another" CTAs
  // stacked below, the page MUST scroll. Remove the lock entirely
  // and let normal document scrolling take over. We still guarantee
  // a comfortable initial height via `minHeight: calc(100dvh - 200px)`
  // on the inner wrapper down in JSX.
  useEffect(function() {
    // Defensive cleanup: if a previous build's lock effect left any
    // overflow styles on html/body, reset them on mount so this
    // page never inherits a stuck scroll-lock from a stale SW cache.
    document.documentElement.style.overflow = ''
    document.documentElement.style.height = ''
    document.body.style.overflow = ''
    document.body.style.height = ''
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
          /* Tab content — Constellation tab is scrollable like the
             others. The previous flex-1 min-h-0 wrapper was a
             leftover from when the RADAR was fixed-height; with the
             V9.11.5 #30 inline match-preview expansion and the new
             'Your Report' card above, the tab's content can extend
             well below the viewport. QA #1 (V10.2): switched to
             pb-20 + minHeight so the page scrolls naturally on iOS
             PWA, exposing the match cards below the RADAR. */
          <div className={activeTab === 'constellation'
            ? 'pb-20'
            : ''}>
            {activeTab === 'constellation' && (
              <div style={{ minHeight: 'calc(100dvh - 200px)' }}>
                <LabConstellationTab />
              </div>
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
        <FingerprintCard data={data.fingerprint} reportId={data.report_id} initialRating={(data.feedback && data.feedback.fingerprint) || null} />
        <ClusterCard data={data.cluster} reportId={data.report_id} initialRating={(data.feedback && data.feedback.cluster) || null} />
        <DidYouKnowCard data={data.did_you_know} reportId={data.report_id} initialRating={(data.feedback && data.feedback.did_you_know) || null} />
        <ContextCard data={data.context} reportId={data.report_id} initialRating={(data.feedback && data.feedback.context) || null} />
        {/* V9.13 Phase 3.B — full-width on mobile, spans both cols
            on desktop so the peer cards have breathing room. */}
        <div className="sm:col-span-2">
          <PeopleLikeYouCard data={data.peers} />
        </div>
      </div>

      <p className="text-[11px] text-gray-500 text-center pt-2">
        Your Signal regenerates when you share a new experience or when significant new reports land in the archive.
        Your thumbs help us tune what shows up here.
      </p>

      {/* V9.13 Phase 3.A — Ask the Unknown */}
      <AskTheUnknown />
    </div>
  )
}

/**
 * V9.13 Phase 3.A — Personalized Q&A surface.
 *
 * One question at a time, Sonnet-backed, citing reports from the
 * user's matched corpus. Single-turn (no chat history); each
 * question is independent. Tonal rules + safety / off-topic
 * refusals enforced by the system prompt; the UI just renders
 * what Sonnet returns.
 */
function AskTheUnknown() {
  var [question, setQuestion] = useState('')
  var [asking, setAsking] = useState(false)
  var [answer, setAnswer] = useState<string | null>(null)
  var [citations, setCitations] = useState<Array<{ id: string; slug: string; title: string }>>([])
  var [refused, setRefused] = useState(false)
  var [error, setError] = useState<string | null>(null)

  function reset() {
    setAnswer(null)
    setCitations([])
    setRefused(false)
    setError(null)
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    var q = question.trim()
    if (q.length < 3 || asking) return
    setAsking(true)
    reset()
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session ? s.data.session.access_token : null
      if (!token) { setError('Sign in to ask.'); setAsking(false); return }
      var resp = await fetch('/api/lab/ask-the-unknown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ question: q }),
      })
      var data = await resp.json()
      if (!resp.ok) {
        setError(data.error || 'Couldn\'t reach the AI.')
      } else {
        setAnswer(data.answer)
        setCitations(data.citations || [])
        setRefused(!!data.refused)
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setAsking(false)
    }
  }

  // V9.13 — render citations inline by replacing [id] tokens with
  // numbered superscripts that link to the cited report. Sonnet
  // returns IDs in [uuid] form; we map each unique cited ID to a
  // 1-based number for readability.
  function renderAnswer(text: string): React.ReactNode {
    if (!text) return null
    var idToNumber: Record<string, number> = {}
    citations.forEach(function (c, i) { idToNumber[c.id] = i + 1 })
    var parts: React.ReactNode[] = []
    var rest = text
    var citationPattern = /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i
    var i = 0
    while (true) {
      var m = rest.match(citationPattern)
      if (!m) { parts.push(rest); break }
      var id = m[1]
      var before = rest.substring(0, m.index)
      parts.push(<span key={'t-' + i}>{before}</span>)
      var n = idToNumber[id]
      var match = citations.find(function (c) { return c.id === id })
      if (n && match) {
        parts.push(
          <a
            key={'c-' + i}
            href={'/report/' + match.slug}
            className="text-purple-300 hover:text-purple-200 align-super text-[10px] font-semibold ml-0.5"
            aria-label={'Citation ' + n + ': ' + match.title}
          >[{n}]</a>
        )
      }
      rest = rest.substring((m.index || 0) + m[0].length)
      i++
    }
    return parts
  }

  return (
    <div className="mt-2 bg-purple-950/15 border border-purple-800/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-3 h-3 text-purple-400" />
        <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-400">
          Ask the Unknown
        </p>
      </div>
      <p className="text-sm text-gray-300 leading-relaxed">
        Ask anything about your experience or how it fits across the archive. The AI cites real reports.
      </p>

      <form onSubmit={ask} className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={function (e) { setQuestion(e.target.value) }}
          placeholder="e.g. What's unusual about my report compared to others nearby?"
          maxLength={500}
          className="flex-1 bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <button
          type="submit"
          disabled={asking || question.trim().length < 3}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
        >
          {asking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{asking ? 'Asking…' : 'Ask'}</span>
        </button>
      </form>

      {error && (
        <p className="text-xs text-red-300">{error}</p>
      )}

      {answer && (
        <div className={
          'p-3 rounded-lg ' +
          (refused
            ? 'bg-amber-950/20 border border-amber-800/40 text-amber-100'
            : 'bg-gray-900/60 border border-gray-800/60')
        }>
          <p className="text-sm text-gray-100 leading-relaxed whitespace-pre-line">
            {renderAnswer(answer)}
          </p>
          {!refused && citations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500">Citations</p>
              {citations.map(function (c, i) {
                return (
                  <a
                    key={c.id}
                    href={'/report/' + c.slug}
                    className="block text-[12px] text-purple-300 hover:text-purple-200 transition-colors"
                  >
                    [{i + 1}] {c.title} <ExternalLink className="inline-block w-3 h-3 align-text-bottom" />
                  </a>
                )
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-500 leading-relaxed">
        Limited to {20} questions per day. No medical, legal, or psychiatric advice.
      </p>
    </div>
  )
}

// ── Card components ─────────────────────────────────────────────────

type CardType = 'fingerprint' | 'cluster' | 'did_you_know' | 'context'
type Rating = 'up' | 'down' | null

/**
 * V9.12 Phase 2.A — thumbs feedback row. Optimistic update (set
 * state first, hit the API in the background, roll back on error).
 * Tapping the active thumb again clears the rating ("un-rate").
 */
function ThumbsRow(props: { reportId: string; cardType: CardType; initialRating: Rating }) {
  var [rating, setRating] = useState<Rating>(props.initialRating)
  var [busy, setBusy] = useState(false)

  function setAndSend(next: Rating) {
    if (busy) return
    var prev = rating
    setRating(next)
    setBusy(true)
    supabase.auth.getSession().then(function (s) {
      var token = s.data.session ? s.data.session.access_token : null
      if (!token) { setRating(prev); setBusy(false); return }
      fetch('/api/lab/your-signal/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ report_id: props.reportId, card_type: props.cardType, rating: next }),
      })
        .then(function (r) { if (!r.ok) throw new Error('feedback save failed') })
        .catch(function () { setRating(prev) })
        .finally(function () { setBusy(false) })
    })
  }

  function onUp()   { setAndSend(rating === 'up' ? null : 'up') }
  function onDown() { setAndSend(rating === 'down' ? null : 'down') }

  return (
    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-white/5">
      <span className="text-[10px] text-gray-500 mr-1">Was this useful?</span>
      <button
        type="button"
        onClick={onUp}
        aria-label="Mark useful"
        aria-pressed={rating === 'up'}
        disabled={busy}
        className={
          'p-1.5 rounded-md transition-colors ' +
          (rating === 'up'
            ? 'text-emerald-400 bg-emerald-500/10'
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5')
        }
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onDown}
        aria-label="Mark not useful"
        aria-pressed={rating === 'down'}
        disabled={busy}
        className={
          'p-1.5 rounded-md transition-colors ' +
          (rating === 'down'
            ? 'text-red-300 bg-red-500/10'
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5')
        }
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function SignalCardShell(props: {
  kicker: string
  highlight?: boolean
  reportId?: string
  cardType?: CardType
  initialRating?: Rating
  trailingTag?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      className={
        'rounded-xl border p-4 flex flex-col ' +
        (props.highlight
          ? 'bg-purple-950/15 border-purple-800/40'
          : 'bg-gray-900/40 border-gray-800/60')
      }
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          {props.highlight && <Sparkles className="w-3 h-3 text-purple-400" />}
          <p className={
            'text-[10px] font-semibold tracking-widest uppercase ' +
            (props.highlight ? 'text-purple-400' : 'text-gray-400')
          }>
            {props.kicker}
          </p>
        </div>
        {props.trailingTag}
      </div>
      <div className="flex-1">{props.children}</div>
      {props.reportId && props.cardType && (
        <ThumbsRow reportId={props.reportId} cardType={props.cardType} initialRating={props.initialRating || null} />
      )}
    </div>
  )
}

function FingerprintCard(props: { data: any; reportId: string; initialRating: Rating }) {
  var d = props.data || {}
  // Strongest signal is `primary_label` with `primary_count` other reports.
  if (!d.primary_label || !d.primary_count) {
    return (
      <SignalCardShell kicker="Your fingerprint" reportId={props.reportId} cardType="fingerprint" initialRating={props.initialRating}>
        <p className="text-sm text-gray-300 leading-snug">
          Your report joins the archive. As more reports cluster around its
          phenomenon type, your fingerprint will sharpen.
        </p>
      </SignalCardShell>
    )
  }
  return (
    <SignalCardShell kicker="Your fingerprint" reportId={props.reportId} cardType="fingerprint" initialRating={props.initialRating}>
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

function ClusterCard(props: { data: any; reportId: string; initialRating: Rating }) {
  var d = props.data || {}
  if (d.skipped) {
    return (
      <SignalCardShell kicker="Patterns near you" reportId={props.reportId} cardType="cluster" initialRating={props.initialRating}>
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
      <SignalCardShell kicker="Patterns near you" reportId={props.reportId} cardType="cluster" initialRating={props.initialRating}>
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
    <SignalCardShell kicker="Patterns near you" reportId={props.reportId} cardType="cluster" initialRating={props.initialRating}>
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

function DidYouKnowCard(props: { data: any; reportId: string; initialRating: Rating }) {
  var d = props.data || {}
  // V9.12 Phase 2.B — show a forward-looking pill when Sonnet flagged
  // the insight as predictive (is_predictive: true). Makes it clear
  // when a "Did you know" is a *forecast* vs. a backward-looking
  // observation.
  var predictiveTag = d.is_predictive ? (
    <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-1.5 py-0.5">
      <Clock className="w-2.5 h-2.5" /> Forward-looking
    </span>
  ) : undefined

  // Phase 1.B / 1.C placeholder state — no Sonnet yet or Sonnet failed.
  if (d.pending) {
    return (
      <SignalCardShell kicker="Did you know" highlight reportId={props.reportId} cardType="did_you_know" initialRating={props.initialRating}>
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
  return (
    <SignalCardShell
      kicker="Did you know"
      highlight
      reportId={props.reportId}
      cardType="did_you_know"
      initialRating={props.initialRating}
      trailingTag={predictiveTag}
    >
      <p className="text-sm text-white leading-snug">
        {d.headline || d.body || '—'}
      </p>
      {d.supporting_context && (
        <p className="text-[11px] text-gray-400 mt-2">{d.supporting_context}</p>
      )}
      {d.supporting_count && !d.supporting_context && (
        <p className="text-[11px] text-gray-400 mt-2">
          Based on {d.supporting_count.toLocaleString()} archived reports.
        </p>
      )}
    </SignalCardShell>
  )
}

/**
 * V9.13 Phase 3.B — People Like You.
 *
 * Surfaces up to 3 opted-in peers whose reports overlap with the
 * user's. Each card has a "Reach out privately" button that opens
 * an inline composer for the intro message. Submitting sends a
 * connection_request; the recipient sees it in /connections.
 *
 * Empty-state copy is intentional: if no peers have opted in yet,
 * we don't show emptiness — we frame it as "you're early; as
 * more people like you opt in, they'll appear here."
 */
function PeopleLikeYouCard(props: { data: any }) {
  var d = props.data || {}
  var sample: any[] = Array.isArray(d.sample) ? d.sample : []
  var [composerFor, setComposerFor] = useState<string | null>(null)
  var [intro, setIntro] = useState('')
  var [sending, setSending] = useState(false)
  var [sentToUserIds, setSentToUserIds] = useState<Record<string, 'pending' | 'rejected'>>({})
  var [sendError, setSendError] = useState<string | null>(null)
  var [rejectionReason, setRejectionReason] = useState<string | null>(null)

  function openComposer(userId: string) {
    setComposerFor(userId)
    setIntro('')
    setSendError(null)
    setRejectionReason(null)
  }
  function closeComposer() {
    setComposerFor(null)
    setIntro('')
    setSendError(null)
    setRejectionReason(null)
  }

  async function send(peer: any) {
    if (intro.trim().length < 10) { setSendError('Add a few more words so they know why you’re reaching out.'); return }
    setSending(true)
    setSendError(null)
    setRejectionReason(null)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session ? s.data.session.access_token : null
      if (!token) { setSendError('Sign in to reach out.'); setSending(false); return }
      var resp = await fetch('/api/connections/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          to_user_id: peer.user_id,
          about_report: peer.report_id,
          intro_message: intro.trim(),
        }),
      })
      var dataResp = await resp.json()
      if (!resp.ok) {
        setSendError(dataResp.error || 'Failed to send request.')
      } else if (dataResp.status === 'rejected_moderation') {
        setSentToUserIds(function (prev) { var n: Record<string, 'pending' | 'rejected'> = {}; Object.keys(prev).forEach(function (k) { n[k] = prev[k] }); n[peer.user_id] = 'rejected'; return n })
        setRejectionReason(dataResp.reason || 'Your intro didn\'t pass review.')
      } else {
        setSentToUserIds(function (prev) { var n: Record<string, 'pending' | 'rejected'> = {}; Object.keys(prev).forEach(function (k) { n[k] = prev[k] }); n[peer.user_id] = 'pending'; return n })
        closeComposer()
      }
    } catch (e: any) {
      setSendError(e.message || 'Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <SignalCardShell kicker="People like you">
      {!sample.length ? (
        <p className="text-sm text-gray-300 leading-snug">
          No peers have opted into matching yet for your phenomenon. As more
          people like you opt in (from the post-RADAR screen), they&rsquo;ll
          appear here. You can also enable peer matching from your account
          settings.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-300 leading-snug mb-3">
            <span className="font-semibold text-purple-300">{d.count_opted_in_total}</span>{' '}
            {d.count_opted_in_total === 1 ? 'person has' : 'people have'} shared
            similar experiences and opted into peer matching. Here are{' '}
            {sample.length === 1 ? 'the closest match' : 'a few of the closest matches'}:
          </p>
          <ul className="space-y-2">
            {sample.map(function (peer: any) {
              var name = peer.display_name || peer.username || 'A fellow experiencer'
              var sentStatus = sentToUserIds[peer.user_id]
              return (
                <li key={peer.user_id} className="bg-gray-900/40 border border-gray-800/60 rounded-lg p-3 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center text-sm text-gray-400">
                    {peer.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={peer.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (name[0] || '?').toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{name}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      Wrote: &ldquo;{peer.report_title}&rdquo;
                    </p>
                    {composerFor === peer.user_id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={intro}
                          onChange={function (e) { setIntro(e.target.value) }}
                          placeholder="A short note about why you're reaching out…"
                          rows={3}
                          maxLength={1000}
                          className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs placeholder-gray-500 focus:outline-none focus:border-purple-500 leading-relaxed"
                        />
                        <p className="text-[10px] text-gray-500">
                          Paradocs delivers your note privately; your contact info is never shared. They can accept or decline.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={closeComposer} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1">Cancel</button>
                          <button
                            type="button"
                            onClick={function () { send(peer) }}
                            disabled={sending || intro.trim().length < 10}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold"
                          >
                            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            {sending ? 'Sending…' : 'Send'}
                          </button>
                        </div>
                        {sendError && <p className="text-[11px] text-red-300">{sendError}</p>}
                        {rejectionReason && (
                          <p className="text-[11px] text-amber-300">Didn&rsquo;t pass review: {rejectionReason}</p>
                        )}
                      </div>
                    ) : sentStatus === 'pending' ? (
                      <p className="text-[11px] text-emerald-400 mt-1 inline-flex items-center gap-1">
                        <Heart className="w-3 h-3" /> Request sent. They can accept or decline.
                      </p>
                    ) : sentStatus === 'rejected' ? (
                      <button
                        onClick={function () { openComposer(peer.user_id) }}
                        className="text-[11px] text-amber-300 hover:text-amber-200 underline mt-1"
                      >
                        Edit and resend
                      </button>
                    ) : (
                      <button
                        onClick={function () { openComposer(peer.user_id) }}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200 transition-colors"
                      >
                        <Users className="w-3 h-3" /> Reach out privately
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="text-[11px] text-gray-500 mt-3">
            Manage incoming requests at <Link href="/connections" className="text-purple-300 hover:text-purple-200 underline">Connections</Link>.
          </p>
        </>
      )}
    </SignalCardShell>
  )
}

function ContextCard(props: { data: any; reportId: string; initialRating: Rating }) {
  var d = props.data || {}
  if (d.skipped) {
    return (
      <SignalCardShell kicker="Across the archive" reportId={props.reportId} cardType="context" initialRating={props.initialRating}>
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
    <SignalCardShell kicker="Across the archive" reportId={props.reportId} cardType="context" initialRating={props.initialRating}>
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
