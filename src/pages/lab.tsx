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

import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  ArrowRight,
  MapPin,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'
import { capture, getFeatureFlag } from '@/lib/posthog'
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

  // V10.10 — fire signal_tab_open exactly once per mount, after the
  // payload is in hand so we can include the delta-line state as
  // properties (drives the "did the delta line correlate with
  // return-engagement" analysis).
  useEffect(function () {
    if (loading) return
    if (!data) return
    var slv = data.since_last_visit || {}
    var prior = slv.previous_visited_at ? new Date(slv.previous_visited_at).getTime() : null
    var sinceDays = prior ? Math.round((Date.now() - prior) / (1000 * 60 * 60 * 24)) : null
    capture('signal_tab_open', {
      has_report: !!data.has_report,
      is_first_visit: !!slv.is_first_visit,
      since_last_visit_days: sinceDays,
      new_in_cluster: slv.new_in_cluster || 0,
      new_in_archive: slv.new_in_archive || 0,
      new_peers_opted_in: slv.new_peers_opted_in || 0,
      had_delta_to_show: ((slv.new_in_cluster || 0) + (slv.new_peers_opted_in || 0)) > 0,
    })
  }, [loading, data])

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

  // V10.9 Signal Reframe — pick the strongest non-skipped card to be
  // the hero. V10.12 — Did You Know retired; peer_questions takes
  // its slot in the eligibility ladder (last fallback because cluster/
  // fingerprint/context all carry a personal count, while
  // peer_questions is about other people's behavior).
  //
  // V10.10.x feature flag: signal-hero-pick-strategy lets us A/B
  // test alternate orderings (fingerprint-first or context-first) vs
  // the cluster-first default. The flag override only fires when the
  // chosen variant has data; we always fall back to the default
  // heuristic so a flag misconfiguration can't yield an empty hero.
  var heroCard: { kind: 'cluster' | 'fingerprint' | 'context' | 'peer_questions'; data: any } = (function () {
    var cl = data.cluster
    var fp = data.fingerprint
    var ctx = data.context
    var pq = data.peer_questions

    var hasCluster = cl && !cl.skipped && (cl.nearby_count || 0) >= 1
    var hasFingerprint = !!(fp && fp.primary_count)
    var hasContext = !!(ctx && !ctx.skipped)
    var hasPeerQ = !!(pq && pq.questions && pq.questions.length > 0)

    var flagVariant = getFeatureFlag('signal-hero-pick-strategy')
    if (flagVariant === 'fingerprint' && hasFingerprint) return { kind: 'fingerprint', data: fp }
    if (flagVariant === 'context' && hasContext) return { kind: 'context', data: ctx }

    // Default cluster-first heuristic.
    if (hasCluster) return { kind: 'cluster', data: cl }
    if (hasFingerprint) return { kind: 'fingerprint', data: fp }
    if (hasContext) return { kind: 'context', data: ctx }
    if (hasPeerQ) return { kind: 'peer_questions', data: pq }
    return { kind: 'cluster', data: cl } // last-resort empty cluster, will render its skipped state
  })()

  // V10.10.x feature flag: signal-ask-placement lets us A/B test the
  // audit's "Ask above the cards" decision against the legacy
  // "Ask below the cards" layout. Default = above-cards (current).
  var askPlacement = getFeatureFlag('signal-ask-placement')
  var askBelow = askPlacement === 'below-cards'

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* V10.9 — header (kicker simplified to remove "Personalized
          patterns…" jargon; that's what the cards already say). */}
      <div>
        <h2 className="text-xl font-bold text-white">Your Signal</h2>
      </div>

      {/* V10.9 — "Since you last visited" delta line. Single most
          important addition: gives every visit a return reason and
          surfaces archive growth visibly. Falls back to a guidance
          line on first visit / no archive change. */}
      <SinceLastVisitLine sinceLastVisit={data.since_last_visit} hasReport={true} />

      {/* V10.9 — single hero card. Picked algorithmically for
          novelty / specificity. Fills the screen on mobile so the
          first viewport always carries one strong, parseable signal. */}
      <HeroCardSlot heroCard={heroCard} reportId={data.report_id} feedback={data.feedback} />

      {/* V10.9 — Ask the Unknown placement controlled by feature flag
          signal-ask-placement. Default ('above-cards') puts it here,
          directly under the hero — engagement data from analogous Q&A
          surfaces shows the input box must appear in the first
          viewport. Variant ('below-cards') moves it under the
          accordion to A/B test the audit's hypothesis. */}
      {!askBelow && <AskTheUnknown />}

      {/* V10.9 — peer card (full width). Kept above the accordion
          because "X people share this signature" is the strongest
          articulation of the brand promise (you're not alone). */}
      <PeopleLikeYouCard data={data.peers} />

      {/* V10.9 — expandable "More signals" strip with the cards
          NOT picked as hero. Collapsed by default on mobile to keep
          the first viewport tight; one tap to expand. */}
      <MoreSignalsAccordion
        heroKind={heroCard.kind}
        data={data}
        reportId={data.report_id}
        feedback={data.feedback}
      />

      {/* Ask the Unknown — alternate placement (below-cards variant). */}
      {askBelow && <AskTheUnknown />}

      {/* V10.9 Phase 2 — surface push-notification opt-in AND
          Resend-backed email digest opt-in side by side. Push is
          higher-fidelity (cluster growth alerts within hours) but
          requires a supported browser; email is universal but
          weekly-cadence by default. Together they cover every
          reactivation channel.
          V10.12.1 — email card receives initial state from API
          response so the toggle reflects persisted preference on
          page load (was previously always rendering as off). */}
      <SignalAlertsOptInCard />
      <SignalEmailDigestCard initialPrefs={data.email_prefs || null} />

      {/* V10.9 Phase 3 — surface the existing year-in-review API as
          an explorable highlight. Shipped collapsed by default to
          avoid competing with the active deltas above. */}
      <YearInReviewEntry />

      <p className="text-[11px] text-gray-500 text-center pt-2 leading-relaxed">
        Your Signal updates as new reports land in the archive. The thumbs
        on each card tune what shows up next time.
      </p>
    </div>
  )
}

/**
 * V10.9 Phase 2 — Signal-alerts opt-in card.
 *
 * Surfaces the existing /api/cron/signal-alerts machinery to users.
 * Three states based on Notification.permission:
 *   - 'default' — show CTA to enable push notifications.
 *   - 'granted' — show confirmation + threshold copy.
 *   - 'denied' — show how-to-re-enable instructions (browser
 *     settings > site permissions).
 *   - 'unsupported' — hide the card entirely (iOS Safari pre-16.4,
 *     etc.) so we don't promise something we can't deliver.
 *
 * Subscribed users can disable via the same toggle in a follow-up
 * commit; today it's an opt-in-only surface.
 */
function SignalAlertsOptInCard() {
  var [permission, setPermission] = useState<NotificationPermission | 'unsupported' | 'unknown'>('unknown')
  // V10.12.1 — track *active subscription* separately from
  // permission. permission='granted' just means the user said yes
  // at some point; the actual push subscription can be torn down
  // (this device, this app reinstall, or by the user clicking off).
  // Only when both are true do we render the "alerts on" state with
  // a toggle to turn off; otherwise we render the enable CTA.
  var [subscribed, setSubscribed] = useState<boolean | null>(null) // null = loading
  var [busy, setBusy] = useState(false)
  var [message, setMessage] = useState<string | null>(null)

  useEffect(function () {
    // Lazy-import client helper since it touches `window`.
    import('@/lib/pushNotifications').then(function (mod) {
      setPermission(mod.getPushPermissionState())
      // Inspect the actual subscription on this device.
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(function (reg) {
          return reg.pushManager.getSubscription()
        }).then(function (sub) {
          setSubscribed(!!sub)
        }).catch(function () { setSubscribed(false) })
      } else {
        setSubscribed(false)
      }
    })
  }, [])

  function handleEnable() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    import('@/lib/pushNotifications').then(function (mod) {
      mod.requestPushSubscription({ topics: ['your_signal'] }).then(function (result) {
        if (result.subscribed) {
          setPermission('granted')
          setSubscribed(true)
          setMessage('Notifications on — we’ll ping you when 3+ new reports land in your cluster.')
          capture('signal_alerts_optin', { outcome: 'subscribed' })
        } else if (result.unsupported) {
          setPermission('unsupported')
          capture('signal_alerts_optin', { outcome: 'unsupported' })
        } else if (result.denied) {
          setPermission('denied')
          setSubscribed(false)
          setMessage('Permission was denied. You can re-enable in your browser settings under site permissions.')
          capture('signal_alerts_optin', { outcome: 'denied' })
        } else {
          setMessage(result.error || 'Couldn’t enable notifications.')
          capture('signal_alerts_optin', { outcome: 'error', error: result.error || null })
        }
      }).finally(function () { setBusy(false) })
    })
  }

  // V10.12.1 — turn alerts OFF without leaving the tab. Calls the
  // existing unsubscribeFromPush() helper which tears down the
  // browser-side subscription via PushManager. Server-side cleanup
  // happens on the next 410 Gone (signal-alerts cron will get a
  // 410 on the dead endpoint and mark is_active=false). We don't
  // call any server endpoint synchronously — the browser unsubscribe
  // is the source of truth.
  function handleDisable() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    import('@/lib/pushNotifications').then(function (mod) {
      mod.unsubscribeFromPush().then(function (ok) {
        if (ok) {
          setSubscribed(false)
          setMessage('Signal alerts turned off. Your push subscription on this device has been removed.')
          capture('signal_alerts_optin', { outcome: 'unsubscribed' })
        } else {
          setMessage('Couldn’t turn off alerts. Try refreshing and trying again.')
        }
      }).finally(function () { setBusy(false) })
    })
  }

  if (permission === 'unsupported' || permission === 'unknown' || subscribed === null) return null

  // V10.12.1 — derive the visible state explicitly. Only one of
  // {enableButton, toggleOn, deniedMessage} renders at a time.
  var showToggleOn = (permission === 'granted' && subscribed === true)
  var showEnableButton = !showToggleOn && (permission === 'default' || (permission === 'granted' && subscribed === false))
  var showDeniedMessage = (permission === 'denied')

  return (
    <div className="rounded-xl border border-purple-800/40 bg-purple-950/15 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 inline-flex w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 items-center justify-center">
          <Sparkles className="w-4 h-4 text-purple-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">
              {showToggleOn ? 'Signal alerts are on' : 'Get a ping when your signal grows'}
            </p>
            {/* V10.12.1 — toggle replaces the old "alerts are on" copy
                with no off path. Same toggle UX as the email card
                below for consistency. */}
            {showToggleOn && (
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={true}
                  onChange={function () { handleDisable() }}
                  disabled={busy}
                  className="sr-only peer"
                />
                <span className="relative w-9 h-5 bg-purple-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform after:translate-x-4" />
              </label>
            )}
          </div>
          <p className="text-xs text-gray-300 mt-1 leading-relaxed">
            {showToggleOn
              ? 'We’ll notify you when 3+ new reports join your cluster, no more than once every 3 days. Toggle off to turn this off on this device.'
              : showDeniedMessage
                ? 'Push permission was denied. Re-enable in your browser site permissions.'
                : 'Get a quiet, low-volume notification when 3+ new cases share your signature. Capped at one alert per 3 days.'}
          </p>
          {message && (
            <p className="text-[11px] text-amber-200 mt-1.5">{message}</p>
          )}
          {showEnableButton && (
            <button
              type="button"
              onClick={handleEnable}
              disabled={busy}
              className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Enable signal alerts
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * V10.9 Phase 2 — Resend-backed email digest opt-in.
 *
 * Always available (no browser-feature dependency, unlike push).
 * Toggle persists to signal_user_visits.email_digest_enabled.
 * Cadence picker lets the user choose daily vs weekly.
 *
 * Defensive: if the supporting table is missing (migration pending),
 * the toggle returns 503 and we surface the message inline rather
 * than crashing.
 */
function SignalEmailDigestCard(props: { initialPrefs: { enabled: boolean; cadence: 'daily' | 'weekly' } | null }) {
  // V10.12.1 — hydrate from the API-returned initialPrefs so the
  // toggle reflects the persisted state on every page load. Was
  // previously always rendering as off because the component
  // initialized state to false without consulting the server.
  var [enabled, setEnabled] = useState<boolean | null>(
    props.initialPrefs ? props.initialPrefs.enabled : null
  )
  var [cadence, setCadence] = useState<'daily' | 'weekly'>(
    (props.initialPrefs && props.initialPrefs.cadence) || 'weekly'
  )
  var [busy, setBusy] = useState(false)
  var [message, setMessage] = useState<string | null>(null)

  useEffect(function () {
    // If initialPrefs arrives later (e.g. parent's data fetch
    // finishes after this component mounts), sync to it. Idempotent.
    if (props.initialPrefs) {
      setEnabled(props.initialPrefs.enabled)
      setCadence(props.initialPrefs.cadence)
    } else if (enabled === null) {
      // Fallback if the parent never passes prefs (defensive — old
      // call sites won't crash).
      setEnabled(false)
    }
  }, [props.initialPrefs && props.initialPrefs.enabled, props.initialPrefs && props.initialPrefs.cadence])

  function persist(nextEnabled: boolean, nextCadence: 'daily' | 'weekly') {
    if (busy) return
    setBusy(true)
    setMessage(null)
    var prevEnabled = enabled
    setEnabled(nextEnabled)
    setCadence(nextCadence)
    supabase.auth.getSession().then(function (s) {
      var token = s.data.session ? s.data.session.access_token : null
      if (!token) {
        setEnabled(prevEnabled)
        setMessage('Sign in to manage email preferences.')
        setBusy(false)
        return
      }
      fetch('/api/lab/your-signal/email-prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ enabled: nextEnabled, cadence: nextCadence }),
      })
        .then(function (r) {
          if (r.status === 503) {
            setEnabled(prevEnabled)
            setMessage('Email digest will be available shortly — the database is being set up.')
            capture('signal_email_optin', { outcome: 'unavailable', enabled: nextEnabled, cadence: nextCadence })
            return
          }
          if (!r.ok) {
            setEnabled(prevEnabled)
            setMessage('Could not save preferences. Try again in a moment.')
            capture('signal_email_optin', { outcome: 'error', status: r.status, enabled: nextEnabled, cadence: nextCadence })
          } else {
            setMessage(nextEnabled
              ? 'Email digest on — sent ' + (nextCadence === 'daily' ? 'daily' : 'weekly') + ' when there\'s activity.'
              : 'Email digest off.')
            capture('signal_email_optin', { outcome: 'saved', enabled: nextEnabled, cadence: nextCadence })
          }
        })
        .catch(function () {
          setEnabled(prevEnabled)
          setMessage('Network error. Try again in a moment.')
        })
        .finally(function () { setBusy(false) })
    })
  }

  if (enabled === null) {
    // Loading shimmer to avoid layout jump.
    return (
      <div id="email-prefs" className="rounded-xl border border-gray-800/60 bg-gray-900/30 px-4 py-3 h-[88px] animate-pulse" />
    )
  }

  return (
    <div id="email-prefs" className="rounded-xl border border-gray-800/60 bg-gray-900/30 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 inline-flex w-8 h-8 rounded-lg bg-gray-700/30 border border-gray-600/30 items-center justify-center">
          <Send className="w-4 h-4 text-gray-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Email digest</p>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!enabled}
                onChange={function (e) { persist(e.target.checked, cadence) }}
                disabled={busy}
                className="sr-only peer"
              />
              <span className="relative w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-purple-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
            </label>
          </div>
          <p className="text-xs text-gray-300 mt-1 leading-relaxed">
            {enabled
              ? 'You\'ll get a Resend digest when new cases land in your cluster — never empty, never daily-by-default.'
              : 'Turn on to get a quiet email when new cases land in your cluster. Universal (works on any device).'}
          </p>
          {enabled && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-gray-400">Cadence:</span>
              <button
                type="button"
                onClick={function () { persist(true, 'weekly') }}
                disabled={busy}
                className={'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ' +
                  (cadence === 'weekly' ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40' : 'bg-gray-800/50 text-gray-400 border border-gray-700/50 hover:text-gray-200')}
              >Weekly</button>
              <button
                type="button"
                onClick={function () { persist(true, 'daily') }}
                disabled={busy}
                className={'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ' +
                  (cadence === 'daily' ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40' : 'bg-gray-800/50 text-gray-400 border border-gray-700/50 hover:text-gray-200')}
              >Daily</button>
            </div>
          )}
          {message && <p className="text-[11px] text-gray-400 mt-2">{message}</p>}
        </div>
      </div>
    </div>
  )
}

/**
 * V10.9 Phase 3 — Year-in-review entry card.
 *
 * The /api/lab/year-in-review/[year] endpoint already exists. This
 * card is the user-facing entry point: a quiet "see your year on
 * Paradocs" link that takes the user to the existing reveal page.
 * Only shows for years where there's enough archive density to make
 * the reveal worth viewing.
 */
function YearInReviewEntry() {
  // Default to last full year, falling back to current year — the
  // existing endpoint handles either.
  var now = new Date()
  var year = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear()
  return (
    <Link
      href={'/lab/year/' + year}
      className="block rounded-xl border border-gray-800/60 bg-gray-900/30 hover:bg-gray-900/50 px-4 py-3 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{year} on Paradocs</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
            See the patterns the archive surfaced this year, and where your story sits inside them.
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </div>
    </Link>
  )
}

/**
 * V10.9 Signal Reframe — "Since you last visited" delta line.
 *
 * The single most important Phase 1 addition. Three outputs:
 *   - First visit ever: "Welcome — your Signal grows with the archive."
 *   - Has prior visit + meaningful change: "Since Tuesday: 4 new cases
 *     share your signature; 1 within 200 miles."
 *   - Has prior visit + no change: honest "Nothing new in your signal
 *     yet — your archive contributions are still resonating."
 *
 * The honesty matters — the brand promise ("you're not alone") is
 * undermined by faking activity that didn't happen.
 */
function SinceLastVisitLine(props: { sinceLastVisit: any; hasReport: boolean }) {
  var s = props.sinceLastVisit
  if (!props.hasReport || !s) return null

  // First visit — frame as a welcome, not a delta.
  if (s.is_first_visit) {
    return (
      <div className="text-sm text-gray-300 bg-purple-950/15 border border-purple-800/40 rounded-lg px-4 py-3 leading-relaxed">
        <span className="text-purple-300 font-semibold">Welcome to your Signal.</span>{' '}
        It will grow as new reports land in the archive — check back to see what changes.
      </div>
    )
  }

  var prior = s.previous_visited_at ? new Date(s.previous_visited_at) : null
  var sinceLabel = prior ? formatSinceLabel(prior) : 'last time'

  var totalNew = (s.new_in_cluster || 0) + (s.new_peers_opted_in || 0)

  if (totalNew === 0) {
    // Honest empty state — encourages return without faking activity.
    return (
      <div className="text-sm text-gray-300 bg-gray-900/40 border border-gray-800/60 rounded-lg px-4 py-3 leading-relaxed">
        <span className="text-gray-100 font-medium">Nothing new in your signal yet</span>
        <span className="text-gray-400">
          {' — the archive grew by ' + (s.new_in_archive || 0) + ' reports since '+ sinceLabel +', but none matched your cluster. Add another experience and your signal will sharpen.'}
        </span>
      </div>
    )
  }

  // V10.13 Phase B — chip pattern instead of sentence prose.
  // Counts pop visually as brand-purple pills; user can scan in <1s.
  // Labels use abbreviated copy that fits inside chip width on mobile.
  return (
    <div className="bg-purple-950/20 border border-purple-700/40 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-3 h-3 text-purple-300 flex-shrink-0" />
        <span className="text-[10px] font-semibold tracking-widest uppercase text-purple-300">
          Since {sinceLabel}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {s.new_in_cluster && s.new_in_cluster > 0 ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-600/25 border border-purple-500/40 text-xs font-semibold text-purple-100">
            <span className="text-purple-200">+{s.new_in_cluster}</span>
            <span className="text-purple-100/80 font-normal">in your cluster</span>
          </span>
        ) : null}
        {s.new_peers_opted_in && s.new_peers_opted_in > 0 ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-600/15 border border-purple-500/30 text-xs font-semibold text-purple-100">
            <span className="text-purple-200">+{s.new_peers_opted_in}</span>
            <span className="text-purple-100/80 font-normal">{s.new_peers_opted_in === 1 ? 'peer opened up' : 'peers opened up'}</span>
          </span>
        ) : null}
        {s.new_in_archive && s.new_in_archive > 0 && (!s.new_in_cluster || s.new_in_cluster === 0) ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-700/30 border border-gray-600/40 text-xs font-medium text-gray-200">
            <span className="text-gray-100">+{s.new_in_archive}</span>
            <span className="text-gray-300 font-normal">in the archive</span>
          </span>
        ) : null}
      </div>
    </div>
  )
}

function formatSinceLabel(prior: Date): string {
  var now = Date.now()
  var diffMs = now - prior.getTime()
  var diffMin = Math.floor(diffMs / 60000)
  var diffHr = Math.floor(diffMin / 60)
  var diffDay = Math.floor(diffHr / 24)
  if (diffMin < 60) return 'a moment ago'
  if (diffHr < 24) return diffHr + (diffHr === 1 ? ' hour ago' : ' hours ago')
  if (diffDay < 7) {
    // Use the weekday name if recent: "since Tuesday"
    return prior.toLocaleDateString('en-US', { weekday: 'long' })
  }
  if (diffDay < 30) return diffDay + ' days ago'
  return prior.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * V10.9 Signal Reframe — single hero card slot.
 *
 * Renders whichever card kind was picked by the heuristic in
 * YourSignalTab as the "hero." Wraps the existing card components
 * so we don't fork the per-card content — just the position +
 * visual weight (taller padding, highlight border).
 */
function HeroCardSlot(props: { heroCard: { kind: string; data: any }; reportId: string; feedback: any }) {
  var fb = props.feedback || {}
  // V10.13 Phase B — per-hero-type visual treatment so the slot
  // doesn't always look the same. Each hero kind gets a unique
  // gradient and accent color that subtly hints at the data inside.
  // Spotify Wrapped's principle: each tile should feel visually
  // distinct, not template-identical.
  var heroBg: Record<string, string> = {
    cluster:        'from-purple-900/30 via-purple-950/30 to-fuchsia-900/20 border-purple-600/40',
    fingerprint:    'from-cyan-900/25 via-purple-950/25 to-purple-900/30 border-cyan-600/30',
    context:        'from-indigo-900/30 via-purple-950/25 to-purple-900/30 border-indigo-500/40',
    peer_questions: 'from-rose-900/20 via-purple-950/30 to-purple-900/30 border-rose-500/30',
  }
  var bgClass = heroBg[props.heroCard.kind] || heroBg.cluster
  return (
    <div className={'rounded-xl border bg-gradient-to-br p-1 ' + bgClass}>
      {props.heroCard.kind === 'cluster' && (
        <ClusterCard data={props.heroCard.data} reportId={props.reportId} initialRating={fb.cluster || null} />
      )}
      {props.heroCard.kind === 'fingerprint' && (
        <FingerprintCard data={props.heroCard.data} reportId={props.reportId} initialRating={fb.fingerprint || null} />
      )}
      {props.heroCard.kind === 'context' && (
        <ContextCard data={props.heroCard.data} reportId={props.reportId} initialRating={fb.context || null} />
      )}
      {props.heroCard.kind === 'peer_questions' && (
        <PeerQuestionsCard data={props.heroCard.data} reportId={props.reportId} initialRating={fb.peer_questions || null} />
      )}
    </div>
  )
}

/**
 * V10.9 Signal Reframe — accordion of demoted cards.
 *
 * Collapsed by default. On expand, renders the three cards NOT
 * picked as hero in a 1-col mobile / 2-col desktop grid. Keeps the
 * Signal panel tight on first paint while preserving access to the
 * full insight set for engaged users.
 */
function MoreSignalsAccordion(props: { heroKind: string; data: any; reportId: string; feedback: any }) {
  var [open, setOpen] = useState(false)
  var fb = props.feedback || {}
  var nonHero: Array<{ kind: string; node: React.ReactNode }> = []
  if (props.heroKind !== 'fingerprint') {
    nonHero.push({ kind: 'fingerprint', node: <FingerprintCard data={props.data.fingerprint} reportId={props.reportId} initialRating={fb.fingerprint || null} /> })
  }
  if (props.heroKind !== 'cluster') {
    nonHero.push({ kind: 'cluster', node: <ClusterCard data={props.data.cluster} reportId={props.reportId} initialRating={fb.cluster || null} /> })
  }
  if (props.heroKind !== 'context') {
    nonHero.push({ kind: 'context', node: <ContextCard data={props.data.context} reportId={props.reportId} initialRating={fb.context || null} /> })
  }
  if (props.heroKind !== 'peer_questions') {
    nonHero.push({ kind: 'peer_questions', node: <PeerQuestionsCard data={props.data.peer_questions} reportId={props.reportId} initialRating={fb.peer_questions || null} /> })
  }
  if (nonHero.length === 0) return null
  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/30">
      <button
        type="button"
        onClick={function () { setOpen(!open) }}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-200 hover:text-white transition-colors"
      >
        <span className="font-medium">More signals</span>
        <span className="text-xs text-gray-500">{open ? 'Hide' : 'Show ' + nonHero.length}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 pt-0">
          {nonHero.map(function (c) { return <div key={c.kind}>{c.node}</div> })}
        </div>
      )}
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
    // V10.10 — fire submit BEFORE the request so we capture intent
    // even if the answer never returns. Question text deliberately
    // not in props (privacy: would land in the user's PostHog
    // person profile and the session replay).
    capture('ask_unknown_submit', { question_length: q.length })
    var startedAt = Date.now()
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
        capture('ask_unknown_answer_received', {
          ok: false,
          status: resp.status,
          latency_ms: Date.now() - startedAt,
        })
      } else {
        setAnswer(data.answer)
        setCitations(data.citations || [])
        setRefused(!!data.refused)
        capture('ask_unknown_answer_received', {
          ok: true,
          refused: !!data.refused,
          has_citations: Array.isArray(data.citations) && data.citations.length > 0,
          citation_count: Array.isArray(data.citations) ? data.citations.length : 0,
          answer_length: typeof data.answer === 'string' ? data.answer.length : 0,
          latency_ms: Date.now() - startedAt,
        })
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
      capture('ask_unknown_answer_received', {
        ok: false,
        network_error: true,
        latency_ms: Date.now() - startedAt,
      })
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

type CardType = 'fingerprint' | 'cluster' | 'did_you_know' | 'context' | 'peer_questions'
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
    // V10.10 — capture optimistically (matches what the user sees).
    // If the API fails we'll revert UI state but the analytics event
    // still fires — preference signal is the user's intent, not the
    // server's persistence outcome.
    capture('signal_card_thumbs', { card_type: props.cardType, rating: next })
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

/**
 * V10.9 Signal Reframe — SignalCardShell now uses dwell-triggered
 * thumbs instead of always-visible. The thumbs row only appears
 * after the user has dwelled on the card for 3+ seconds (visibility
 * tracked via IntersectionObserver). Two reasons:
 *   1. UX — five always-visible thumb rows on a dashboard creates
 *      ratings fatigue and noisy data (random taps).
 *   2. ML data quality — dwell-triggered ratings come from users
 *      who actually engaged with the content, so the preference
 *      signal is interpretable.
 *
 * Pattern is from Snap / Pinterest / TikTok dwell-prompts.
 *
 * V10.9 — also fixed kicker color contrast (was text-gray-400 which
 * fails WCAG AA at 10px on dark; now text-gray-200 for non-highlight,
 * text-purple-300 for highlight — both pass at small sizes).
 */
function SignalCardShell(props: {
  kicker: string
  highlight?: boolean
  reportId?: string
  cardType?: CardType
  initialRating?: Rating
  trailingTag?: React.ReactNode
  children: React.ReactNode
}) {
  var ref = useRef<HTMLDivElement | null>(null)
  var [thumbsVisible, setThumbsVisible] = useState(!!props.initialRating)

  useEffect(function () {
    if (thumbsVisible) return // already shown (initial rating present); nothing to do
    if (!ref.current || typeof IntersectionObserver === 'undefined') return
    var dwellTimer: any = null
    var dwellFired = false
    var io = new IntersectionObserver(function (entries) {
      var e = entries[0]
      if (e && e.isIntersecting && e.intersectionRatio >= 0.5) {
        if (!dwellTimer) {
          dwellTimer = setTimeout(function () {
            setThumbsVisible(true)
            // V10.10 — signal_card_dwell_3s fires here, the moment we
            // promote the thumbs row from hidden → visible. This is
            // the single most reliable engagement signal on the
            // surface (random scroll-by traffic doesn't dwell).
            if (!dwellFired && props.cardType) {
              dwellFired = true
              capture('signal_card_dwell_3s', { card_type: props.cardType })
            }
          }, 3000)
        }
      } else {
        if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null }
      }
    }, { threshold: [0, 0.5, 1] })
    io.observe(ref.current)
    return function () {
      io.disconnect()
      if (dwellTimer) clearTimeout(dwellTimer)
    }
  }, [thumbsVisible, props.cardType])

  return (
    <div
      ref={ref}
      className={
        'rounded-xl border p-4 flex flex-col ' +
        (props.highlight
          ? 'bg-purple-950/15 border-purple-800/40'
          : 'bg-gray-900/40 border-gray-800/60')
      }
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          {props.highlight && <Sparkles className="w-3 h-3 text-purple-300" />}
          <p className={
            'text-[10px] font-semibold tracking-widest uppercase ' +
            // V10.9 — bumped contrast: text-gray-400 / text-purple-400
            // both fail WCAG AA at this size on dark; text-gray-200 /
            // text-purple-300 pass.
            (props.highlight ? 'text-purple-300' : 'text-gray-200')
          }>
            {props.kicker}
          </p>
        </div>
        {props.trailingTag}
      </div>
      <div className="flex-1">{props.children}</div>
      {props.reportId && props.cardType && thumbsVisible && (
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
      <SignalCardShell kicker="What your story shares with others" reportId={props.reportId} cardType="fingerprint" initialRating={props.initialRating}>
        <p className="text-sm text-gray-300 leading-snug">
          Your report joins the archive. As more reports cluster around its
          phenomenon type, your fingerprint will sharpen.
        </p>
      </SignalCardShell>
    )
  }
  return (
    <SignalCardShell kicker="What your story shares with others" reportId={props.reportId} cardType="fingerprint" initialRating={props.initialRating}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
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
        </div>
        {/* V10.13 Phase B — fingerprint radial. Four-axis spider plot
            shows which dimensions overlap with the archive. Visual at
            a glance: shape itself encodes the user's identity in
            archive terms, no reading required. */}
        <FingerprintRadial
          typeCount={d.type_count || 0}
          categoryCount={d.category_count || 0}
          evidenceCount={d.has_evidence ? (d.evidence_count || 0) : 0}
          witnessCount={d.many_witnesses ? 1 : 0}
        />
      </div>
    </SignalCardShell>
  )
}

/**
 * V10.13 Phase B — tiny SVG spider plot for the fingerprint card.
 * Four axes: phenomenon type match, category match, evidence,
 * multiple witnesses. Each axis is normalized to a soft logarithmic
 * scale so a count of 1 shows up but doesn't dominate.
 *
 * Pure SVG, no charting library, ~80 lines including geometry.
 */
function FingerprintRadial(props: { typeCount: number; categoryCount: number; evidenceCount: number; witnessCount: number }) {
  // log(1+x)/log(1+max) normalization so small overlaps are visible
  // but big ones don't blow out the plot.
  function norm(v: number, max: number): number {
    if (max <= 0) return 0
    return Math.log(1 + Math.max(0, v)) / Math.log(1 + max)
  }
  // Reference scale — tune to typical archive size. ~10k reports per
  // axis is the working ceiling; will need to widen as the archive grows.
  var MAX = 10000
  var values = [
    norm(props.typeCount,     MAX),
    norm(props.categoryCount, MAX),
    norm(props.evidenceCount, MAX),
    norm(props.witnessCount,  10),
  ]
  var size = 64
  var cx = size / 2
  var cy = size / 2
  var radius = (size / 2) - 4
  // Compute polygon points (4 axes, evenly spaced starting at top).
  function pointAt(idx: number, scale: number): [number, number] {
    var angle = (-Math.PI / 2) + (idx * 2 * Math.PI / 4)
    var r = radius * Math.max(0.04, scale) // floor so empty doesn't degenerate
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]
  }
  var dataPoints = values.map(function (v, i) { return pointAt(i, v) })
  var dataPath = dataPoints.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1] }).join('') + 'Z'
  // Background guide rings.
  function ringPoints(scale: number): string {
    return [0,1,2,3].map(function (i) {
      var p = pointAt(i, scale)
      return (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]
    }).join('') + 'Z'
  }
  return (
    <svg
      viewBox={'0 0 ' + size + ' ' + size}
      className="flex-shrink-0 w-16 h-16"
      aria-label="Fingerprint signature radial"
    >
      <path d={ringPoints(1)} fill="rgba(168, 85, 247, 0.05)" stroke="rgba(168, 85, 247, 0.2)" strokeWidth="0.5" />
      <path d={ringPoints(0.66)} fill="none" stroke="rgba(168, 85, 247, 0.15)" strokeWidth="0.5" />
      <path d={ringPoints(0.33)} fill="none" stroke="rgba(168, 85, 247, 0.1)" strokeWidth="0.5" />
      {/* Axis lines */}
      {[0,1,2,3].map(function (i) {
        var p = pointAt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="rgba(168, 85, 247, 0.15)" strokeWidth="0.5" />
      })}
      {/* Data polygon */}
      <path d={dataPath} fill="rgba(168, 85, 247, 0.5)" stroke="rgb(196, 181, 253)" strokeWidth="1" />
      {/* Vertex dots */}
      {dataPoints.map(function (p, i) { return (
        <circle key={i} cx={p[0]} cy={p[1]} r="1.5" fill="rgb(221, 214, 254)" />
      )})}
    </svg>
  )
}

function ClusterCard(props: { data: any; reportId: string; initialRating: Rating }) {
  var d = props.data || {}
  if (d.skipped) {
    return (
      <SignalCardShell kicker="Where else this is happening" reportId={props.reportId} cardType="cluster" initialRating={props.initialRating}>
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
      <SignalCardShell kicker="Where else this is happening" reportId={props.reportId} cardType="cluster" initialRating={props.initialRating}>
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
  // V10.9 Phase 3 — cluster-contribution callout. When the user's
  // report is one of the foundational/early cases at this location,
  // surface that explicitly. The brand promise is "you're not alone";
  // the contribution callout adds "and you helped someone else
  // realize that." Highest emotional payoff in the entire surface,
  // and only fires when the data actually warrants it (≥3 cluster
  // members, top-25% or top-50% by created_at).
  var contribution = d.contribution
  return (
    <SignalCardShell kicker="Where else this is happening" reportId={props.reportId} cardType="cluster" initialRating={props.initialRating}>
      <p className="text-sm text-white leading-snug">
        <span className="font-semibold text-purple-300">{d.nearby_count.toLocaleString()}</span>{' '}
        report{d.nearby_count === 1 ? '' : 's'} within ~{d.radius_mi} miles of your experience
        {yearRange && (<>
          {' '}— spanning <span className="font-semibold text-purple-300">{yearRange}</span>
        </>)}.
      </p>
      {contribution && (contribution.is_foundational || contribution.is_early) && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-start gap-2">
            <Sparkles className={'w-3.5 h-3.5 mt-0.5 flex-shrink-0 ' + (contribution.is_foundational ? 'text-purple-300' : 'text-purple-400')} />
            <p className="text-xs text-gray-200 leading-relaxed">
              {contribution.is_foundational
                ? <>Your story is one of the <span className="font-semibold text-purple-200">foundational cases</span> at this location.{' '}
                    <span className="text-gray-400">{contribution.newer_arrivals_count} {contribution.newer_arrivals_count === 1 ? 'report has' : 'reports have'} joined since.</span></>
                : <>Your story arrived <span className="font-semibold text-purple-200">early</span> in this cluster.{' '}
                    <span className="text-gray-400">{contribution.newer_arrivals_count} {contribution.newer_arrivals_count === 1 ? 'report has' : 'reports have'} joined since.</span></>
              }
            </p>
          </div>
          {/* V10.13 Phase B — mini-timeline visualizing the user's
              position in the cluster's creation order. Bar represents
              total arrivals; the user's marker sits at the early
              position; subsequent arrivals fill to the right. */}
          <ContributionTimeline
            olderCount={contribution.older_than_count || 0}
            newerCount={contribution.newer_arrivals_count || 0}
          />
        </div>
      )}
      {/* V10.13 Phase B — link out to MY MAP filtered by this radius
          instead of embedding a duplicate map. One canonical spatial
          surface; cluster card teases it with a chip + arrow. */}
      <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-800/60 border border-gray-700/40 text-[11px] text-gray-300">
          <MapPin className="w-3 h-3 text-purple-300" />
          {d.nearby_count} cases here
        </span>
        <Link
          href={'/lab?tab=map'}
          className="text-[11px] text-purple-300 hover:text-purple-200 inline-flex items-center gap-0.5"
        >
          See on map <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </SignalCardShell>
  )
}

/**
 * V10.13 Phase B — tiny SVG bar showing where the user's report sits
 * in the cluster's creation timeline. Filled brand-purple to the left
 * (older), brand-purple-dimmed to the right (newer arrivals). User
 * marker is the brighter inflection between them.
 */
function ContributionTimeline(props: { olderCount: number; newerCount: number }) {
  var older = Math.max(0, props.olderCount)
  var newer = Math.max(0, props.newerCount)
  var total = older + newer + 1 // +1 for the user themselves
  if (total < 3) return null
  var leftPct = (older / total) * 100
  var userPct = ((older + 0.5) / total) * 100
  var rightPct = ((older + 1) / total) * 100
  return (
    <div className="mt-3 px-1">
      <div className="relative h-1.5 bg-gray-800 rounded-full overflow-hidden">
        {/* older arrivals (faded) */}
        <div
          className="absolute top-0 left-0 h-full bg-gray-600/40"
          style={{ width: leftPct + '%' }}
        />
        {/* newer arrivals (brand purple) */}
        <div
          className="absolute top-0 h-full bg-purple-500/60"
          style={{ left: rightPct + '%', width: (100 - rightPct) + '%' }}
        />
        {/* user marker — brighter pulse */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-purple-200 ring-2 ring-purple-400/60"
          style={{ left: userPct + '%' }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] text-gray-500 uppercase tracking-wide">
          {older > 0 ? older + ' before' : 'You first'}
        </span>
        <span className="text-[9px] text-gray-500 uppercase tracking-wide">
          {newer > 0 ? newer + ' after' : 'No arrivals yet'}
        </span>
      </div>
    </div>
  )
}

/**
 * V10.12 (Option C) / V10.13 Phase B — PeerQuestionsCard with
 * chat-bubble visual treatment.
 *
 * Was: bulleted list of quoted questions. Now: speech-bubble shapes
 * with subtle alternating offset and an avatar dot, so the card
 * visually says "these are conversations" instead of "here's text."
 * Pattern lifted from messaging-app glanceability research — bubble
 * shapes are parsed as dialog instantly, even in peripheral vision.
 */
function PeerQuestionsCard(props: { data: any; reportId: string; initialRating: Rating }) {
  var d = props.data || {}
  var questions: any[] = (d.questions && d.questions.length > 0) ? d.questions : []

  if (questions.length === 0) {
    return (
      <SignalCardShell kicker="What others are asking" highlight reportId={props.reportId} cardType={'peer_questions' as CardType} initialRating={props.initialRating}>
        <p className="text-sm text-gray-300 leading-snug">
          No one with a story like yours has used Ask the Unknown yet. Be the first &mdash; your question shapes what shows up here for the next reader.
        </p>
      </SignalCardShell>
    )
  }

  return (
    <SignalCardShell
      kicker="What others are asking"
      highlight
      reportId={props.reportId}
      cardType={'peer_questions' as CardType}
      initialRating={props.initialRating}
    >
      <p className="text-xs text-gray-300 mb-3">
        {(d.total_askers || 0) > 0
          ? <><span className="font-semibold text-purple-200">{d.total_askers}</span> {d.total_askers === 1 ? 'person' : 'people'} with stories like yours asked:</>
          : <>People with stories like yours asked:</>}
      </p>
      <div className="space-y-2.5">
        {questions.map(function (q: any, i: number) {
          // Alternate left/right offset for visual conversational
          // rhythm. Staggered margin gives the impression of multiple
          // voices (without using actual avatars — peers are
          // anonymized at this surface).
          var rightish = i % 2 === 1
          return (
            <div
              key={i}
              className={classNames(
                'flex items-start gap-2',
                rightish ? 'pl-4 sm:pl-8' : 'pr-4 sm:pr-8'
              )}
            >
              {/* Avatar dot — anonymized; peers are surfaced
                  aggregated, not by identity. */}
              {!rightish && (
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-600/30 border border-purple-500/40 mt-0.5" />
              )}
              <div
                className={classNames(
                  'inline-block px-3 py-2 rounded-2xl text-sm leading-snug max-w-full',
                  rightish
                    ? 'bg-purple-600/15 border border-purple-500/30 text-white rounded-br-sm'
                    : 'bg-gray-800/70 border border-gray-700/60 text-gray-100 rounded-bl-sm'
                )}
              >
                {q.text}
                {q.distinct_askers && q.distinct_askers > 1 && (
                  <span className="block text-[10px] text-gray-400 mt-0.5">
                    {q.distinct_askers} people asked similar
                  </span>
                )}
              </div>
              {rightish && (
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-700/40 border border-gray-600/40 mt-0.5" />
              )}
            </div>
          )
        })}
      </div>
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
    <SignalCardShell kicker="People who lived something like this">
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
      <SignalCardShell kicker="Where your story sits in the bigger picture" reportId={props.reportId} cardType="context" initialRating={props.initialRating}>
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
    <SignalCardShell kicker="Where your story sits in the bigger picture" reportId={props.reportId} cardType="context" initialRating={props.initialRating}>
      <p className="text-sm text-white leading-snug">
        Reports like yours peak in{' '}
        <span className="font-semibold text-purple-300">{label}</span>{' '}
        <span className="text-gray-400">({pct}% of dated reports).</span>
      </p>
      {/* V10.13 Phase B — month-of-year histogram. 12 thin bars,
          peak in brand-purple, user's month highlighted in brighter
          purple if it differs from peak. Visual at a glance: the
          card now shows the seasonal shape, not just describes it. */}
      <MonthHistogram
        peakMonthIndex={d.peak_month_index || 0}
        userMonthIndex={d.user_month_index}
        peakSharePct={pct}
      />
      {youLine && (
        <p className="text-[11px] text-gray-300 mt-2">{youLine}</p>
      )}
    </SignalCardShell>
  )
}

/**
 * V10.13 Phase B — 12-bar month histogram. We don't have full
 * per-month counts surfaced from the API yet (would need a small
 * backend change), so this is a heuristic visualization: peak month
 * gets full height, adjacent months ramp down to ~30% on a sin
 * curve, far-from-peak months stay at 15%. User's own month is
 * highlighted with a brighter accent ring even when it isn't the
 * peak. Visual purpose is "you can see the seasonal shape," not
 * pixel-accurate stats.
 */
function MonthHistogram(props: {
  peakMonthIndex: number
  userMonthIndex: number | null
  peakSharePct: number
}) {
  function barHeight(idx: number): number {
    var diff = Math.min(
      Math.abs(idx - props.peakMonthIndex),
      12 - Math.abs(idx - props.peakMonthIndex)
    )
    if (diff === 0) return 1
    if (diff === 1) return 0.7
    if (diff === 2) return 0.45
    if (diff === 3) return 0.3
    return 0.18
  }
  var monthLetters = ['J','F','M','A','M','J','J','A','S','O','N','D']
  return (
    <div className="mt-3 px-1">
      <div className="flex items-end justify-between gap-0.5 h-8">
        {[0,1,2,3,4,5,6,7,8,9,10,11].map(function (i) {
          var h = barHeight(i)
          var isPeak = i === props.peakMonthIndex
          var isUser = props.userMonthIndex === i
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              <div
                className={
                  'w-full rounded-t-sm transition-colors ' +
                  (isPeak
                    ? 'bg-purple-400'
                    : isUser
                      ? 'bg-purple-500/70 ring-1 ring-purple-300/80'
                      : 'bg-gray-700/60')
                }
                style={{ height: (h * 100) + '%' }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-0.5 mt-1">
        {monthLetters.map(function (l, i) {
          var isHighlighted = i === props.peakMonthIndex || i === props.userMonthIndex
          return (
            <span
              key={i}
              className={'flex-1 text-[8px] text-center ' + (isHighlighted ? 'text-purple-300 font-semibold' : 'text-gray-500')}
            >
              {l}
            </span>
          )
        })}
      </div>
    </div>
  )
}
