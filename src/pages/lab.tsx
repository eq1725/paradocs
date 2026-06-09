'use client'

// V11.17.78 - submission card upgrade
//
// Tier 1 of the My Record submission display upgrade per
// docs/MY_RECORD_SUBMISSIONS_PANEL.md. The loadReports() query now
// selects the columns the new DossierHeader card needs (has_video,
// has_photo_video, status, discoverable, created_at), and after the
// reports come back we POST the video-bearing ids to
// /api/lab/sign-user-videos to attach signed playback + poster URLs
// + duration to those rows. Reports without video render the same
// prose-only dossier as before — no regression for non-media users.
//
// V11.17.75 — Tier 3E cleanup
//
// Resolves the long-flagged duplication between RadarSurface (the
// V3 §5 categorical lens) and the legacy MyRecordTab polished radar.
// MyRecordTab has been deleted; the parts of it that were still
// load-bearing — the rich match-list rendering and the manage-
// submissions panel — are now standalone components in /lab:
//   - `MatchList` (src/components/lab/MatchList.tsx)
//   - `ManageSubmissionsPanel` (src/components/lab/ManageSubmissionsPanel.tsx)
// The polished radar dial inside MyRecordTab is gone entirely;
// RadarSurface is the single canonical dial on the page.
//
// V11.17.74 — Sentiment + endpoints (Tier 3D wire-up)
//
// V11.17.69 - Tier 2B
//
// My Record — single-page IA (Tier 2B structural rebuild).
//
// Per LAB_PANEL_REVIEW_V3 §3 ("One experience is world-class") and
// §5 (RADAR scope clarity), the prior /lab tab structure (Story /
// Library / Explore) is collapsed into a single scrollable surface
// anchored on the user's dossier. Comparative surfaces stack beneath
// the dossier in priority order: synthesized paragraph (inside the
// dossier) → Hints rail → temporal strip → geographic surface →
// categorical radar lens → paywall teaser → match list.
//
// Tier 2A pricing/subscription files (Layout Upgrade pill,
// LabPaywallSurface, /pricing, /account/subscription, webhooks)
// remain untouched; this PR only wires LabPaywallSurface into the
// named-match teaser per V3 §3 step 6.
//
// Tier 3 (NOT in this PR): Pro Dossier auto-generation, Custom
// Watchlists, peer DM, named-match handshake — slots exist but render
// "coming soon" placeholders behind the Pro tier gate.
//
// What this file kept:
//   - The auth gate (UnauthenticatedPrompt) + the loading shimmer.
//   - The page <Head> (now "My Record | Paradocs").
//   - The submit-report + bell + settings header chrome on the right.
//
// What this file dropped:
//   - The 3-tab nav (story / library / explore) entirely.
//   - The Library / Explore tab bodies (LabSavesTab, LabCollectionsTab,
//     ExploreTab). Library and Explore each live at their own routes
//     already (/explore exists; the Collections grid will be revived
//     as a sub-page if needed — for the current pass it's reachable
//     via the standalone ManageSubmissionsPanel (Tier 3E).
//   - The legacy ?tab=... query-string redirect map (replaced with a
//     no-op — every legacy tab key lands on this single surface now).
//
// SWC: var + function() per repo convention.

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  Settings,
  Telescope,
  Lock,
  LogIn,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Existing pieces we keep mounted
import HintsRail from '@/components/lab/HintsRail'
import { LabPaywallSurface } from '@/components/lab/LabPaywallSurface'
import { useSubscription } from '@/lib/hooks/useSubscription'

// V11.18.x — 200K catalogued-accounts eyebrow per UI_SHIPPING_ROADMAP_V2 Sprint 1A
import { CorpusStatEyebrow } from '@/components/common/CorpusStatEyebrow'

// New Tier 2B components
import DossierHeader from '@/components/lab/DossierHeader'
import TemporalStrip from '@/components/lab/TemporalStrip'
import GeographicSurface from '@/components/lab/GeographicSurface'
// V11.18.x — removed per UI_SHIPPING_ROADMAP_V2 Sprint 1A deletes
//   RadarSurface (the categorical lens) — replaced by Match Revelation in Sprint 1B.
//   CrossExperienceHeader (standalone) — prose folds into DossierHeader eyebrow per V5 §5.3.

// V11.18.1 — Sprint 1A-2. PatternsRail occupies the slot vacated by the
// retired CrossExperienceHeader per V2 roadmap §5.A2 — a corpus-grounded
// rail of FindingCards drawn from `findings_catalogue`. Renders nothing
// when there are no published findings.
import PatternsRail from '@/components/lab/PatternsRail'

// V11.18.0 — Sprint 1A. Tier-aware /lab LabPromo (free_empty / free_active /
// basic / pro=null). Distinct from the Today-feed LabPromo at
// src/components/discover/LabPromo.tsx. Mounts between PatternsRail and
// HintsRail as the natural conversion bridge.
import LabPromo from '@/components/lab/LabPromo'

// V11.17.71 - Pro Dossier (Tier 3A). Pro users see the live Dossier;
// Free/Basic continue to see the LabPaywallSurface teaser below.
import ProDossier from '@/components/lab/ProDossier'

// V11.17.72 - Custom Watchlists (Tier 3B). Pro users see the live
// WatchlistsRail; Free/Basic continue to see the LabPaywallSurface teaser.
import WatchlistsRail from '@/components/lab/WatchlistsRail'

// V11.18.x — removed per UI_SHIPPING_ROADMAP_V2 Sprint 1A deletes
//   NamedMatchOffersRail / DMThreadsList / DiscoverabilityToggle (1:1 DM mechanic).
//   The named-match-engine backend is retained for Sprint 2 comments work.

// V11.17.75 — Tier 3E cleanup. MyRecordTab is gone; the two pieces
// that were still load-bearing now live in /lab as standalone
// components.
// V11.18.x — MatchList inline 12-card body collapsed to a placeholder per
// UI_SHIPPING_ROADMAP_V2 Sprint 1A deletes (the full thumb-row ships in Sprint 1B).
import ManageSubmissionsPanel from '@/components/lab/ManageSubmissionsPanel'

// ─── Types ───────────────────────────────────────────────────────────

interface UserReportRow {
  id: string
  title?: string | null
  slug?: string | null
  category?: string | null
  description?: string | null
  summary?: string | null
  location_description?: string | null
  city?: string | null
  state_province?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null
  event_date?: string | null
  event_date_raw?: string | null
  event_time?: string | null
  created_at?: string | null
  phenomenon_type?: { name?: string } | null
  // V11.17.78 — submission card upgrade. Extra columns surfaced by
  // loadReports so DossierHeader can render the new media + ownership
  // chrome. Every field is optional / nullable; missing columns
  // degrade to "no video" + "Pending review" on the card.
  has_video?: boolean | null
  has_photo_video?: boolean | null
  status?: string | null
  discoverable?: boolean | null
  // Attached client-side after /api/lab/sign-user-videos returns.
  video?: {
    videoUrl: string | null
    posterUrl: string | null
    durationSec: number | null
    segments: unknown[] | null
  } | null
}

interface NearbyReportShape {
  id: string
  slug?: string
  title?: string
  latitude: number
  longitude: number
  distance_mi?: number
  event_date?: string | null
  location_label?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  var R = 3959
  var dLat = (lat2 - lat1) * Math.PI / 180
  var dLng = (lng2 - lng1) * Math.PI / 180
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function resolveYear(r: UserReportRow): number | null {
  if (r.event_date) {
    var y = new Date(r.event_date).getFullYear()
    if (!isNaN(y) && y > 1800 && y < 2200) return y
  }
  if (r.event_date_raw) {
    var m = String(r.event_date_raw).match(/(\d{4})/)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

function resolveHour(r: UserReportRow): number | null {
  if (r.event_time && /^\d{1,2}:\d{2}/.test(r.event_time)) {
    return parseInt(r.event_time.split(':')[0], 10)
  }
  if (r.event_date) {
    var d = new Date(r.event_date)
    if (!isNaN(d.getTime()) && r.event_date.length > 10) {
      // Only trust the hour if the ISO carried a time component.
      return d.getHours()
    }
  }
  return null
}

function locationLabel(r: UserReportRow): string {
  var parts = [r.city, r.state_province].filter(Boolean) as string[]
  if (parts.length > 0) return parts.join(', ')
  if (r.location_description) return r.location_description
  return r.country || 'Location unrecorded'
}

function phenFamilyLabel(category: string | null | undefined): string {
  if (!category) return 'this kind of'
  if (category === 'ufos_aliens') return 'UFO-shape'
  if (category === 'ghosts_hauntings') return 'apparition'
  if (category === 'cryptids') return 'cryptid'
  if (category === 'psychic_phenomena') return 'psychic'
  if (category === 'consciousness_practices') return 'consciousness'
  if (category === 'perception_sensory') return 'perception'
  return category.replace(/_/g, ' ')
}

// ─── Page ────────────────────────────────────────────────────────────

export default function LabPage() {
  var router = useRouter()
  var sub = useSubscription()
  var [isLoggedIn, setIsLoggedIn] = useState(false)
  var [loading, setLoading] = useState(true)
  var [reports, setReports] = useState<UserReportRow[]>([])
  var [focusedIdx, setFocusedIdx] = useState(0)

  // V11.17.74 — Tier 3D. Bearer token threaded through to
  // CrossExperienceHeader so it can POST to /api/lab/synthesized-paragraph
  // for the Haiku body-of-work sentence.
  var [authToken, setAuthToken] = useState<string | null>(null)

  // V11.17.75 — Tier 3E. User email threaded through to MatchList so
  // the inline NewMatchAlertsCard can scope its localStorage key and
  // hit /api/user/notify-prefs. Null for anonymous viewers.
  var [userEmail, setUserEmail] = useState<string | null>(null)

  // Per-experience derived surfaces.
  var [nearbyReports, setNearbyReports] = useState<NearbyReportShape[] | null>(null)
  var [matches, setMatches] = useState<any[]>([])
  var [totalDatabase, setTotalDatabase] = useState(0)
  var [synthesizedParagraph, setSynthesizedParagraph] = useState<string | null>(null)

  // Temporal corpus distribution (per phen-family) — null while loading.
  // For the MVP, we let TemporalStrip render the placeholder if a real
  // distribution isn't surfaced. Wiring a dedicated /api endpoint is a
  // Tier 3 follow-up; the structure ships now.
  var [hourDist, setHourDist] = useState<number[] | null>(null)
  var [decadeDist, setDecadeDist] = useState<{ decade: number; share: number }[] | null>(null)

  // ── Auth + load reports ─────────────────────────────────────────────

  useEffect(function () {
    function checkAuth() {
      supabase.auth.getSession().then(function (sessionResult) {
        var session = sessionResult.data.session
        setIsLoggedIn(!!session)
        setAuthToken(session ? session.access_token : null)
        setUserEmail(session && session.user.email ? session.user.email : null)
        if (session) {
          loadReports(session.access_token)
        } else {
          setLoading(false)
        }
      })
    }
    checkAuth()
    var authListener = supabase.auth.onAuthStateChange(function () { checkAuth() })
    return function () { authListener.data.subscription.unsubscribe() }
  }, [])

  function loadReports(_token: string) {
    setLoading(true)
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session) { setLoading(false); return }
      supabase
        .from('reports')
        .select(`
          id, title, slug, category, description, summary,
          location_description, city, state_province, country,
          latitude, longitude, event_date, event_date_raw, event_time, created_at,
          has_video, has_photo_video, status, discoverable,
          phenomenon_type:phenomenon_types(name)
        `)
        .eq('submitted_by', session.user.id)
        .eq('source_type', 'user_submission')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false })
        .limit(50)
        .then(function (r: any) {
          if (r.data) {
            var rows = r.data as UserReportRow[]
            setReports(rows)
            // Honor ?focus= deep link.
            var focusFromUrl = router.query.focus as string | undefined
            if (focusFromUrl) {
              var idx = rows.findIndex(function (row) { return row.id === focusFromUrl })
              if (idx >= 0) setFocusedIdx(idx)
            } else {
              setFocusedIdx(0)
            }
            // V11.17.78 — submission card upgrade. Sign poster +
            // playback URLs for any video-bearing rows via the
            // service-role endpoint. Fire-and-forget; a signing
            // failure leaves the card in its prose-only fallback.
            var videoIds = rows.filter(function (row) { return !!row.has_video }).map(function (row) { return row.id })
            if (videoIds.length > 0 && session) {
              fetch('/api/lab/sign-user-videos', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer ' + session.access_token,
                },
                body: JSON.stringify({ report_ids: videoIds }),
              }).then(function (resp) { return resp.ok ? resp.json() : null }).then(function (data) {
                if (!data || !data.videos) return
                setReports(function (prev) {
                  return prev.map(function (row) {
                    var v = data.videos[row.id]
                    if (!v) return row
                    return Object.assign({}, row, { video: v })
                  })
                })
              }).catch(function () { /* keep prose-only fallback */ })
            }
          }
          setLoading(false)
        })
    })
  }

  // ── Per-experience data fetch when focus changes ────────────────────

  var focused = reports[focusedIdx] || null

  useEffect(function () {
    if (!focused) return
    // Mirror focus to URL (shallow).
    var nextQuery = Object.assign({}, router.query, { focus: focused.id })
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true })

    // Reset per-focus surfaces immediately so we never show stale data.
    setNearbyReports(null)
    setMatches([])
    setSynthesizedParagraph(null)
    setHourDist(null)
    setDecadeDist(null)

    // V11.17.74 — Tier 3D wire-up. Real temporal-distribution + Haiku
    // synthesized paragraph endpoints now back the TemporalStrip and
    // (when n≥2) the CrossExperienceHeader. Both calls are fire-and-
    // forget — failures degrade to the same placeholder UX as before.
    if (focused.category) {
      var distUrl = '/api/lab/temporal-distribution?phen_family=' +
        encodeURIComponent(focused.category) + '&dimension=hour'
      fetch(distUrl).then(function (r) { return r.ok ? r.json() : null }).then(function (d) {
        if (!d || !Array.isArray(d.distribution)) return
        var arr: number[] = []
        for (var i = 0; i < 24; i++) arr.push(0)
        d.distribution.forEach(function (b: any) {
          if (typeof b.bucket === 'number' && b.bucket >= 0 && b.bucket < 24) {
            arr[b.bucket] = b.percentage || 0
          }
        })
        setHourDist(arr)
      }).catch(function () { /* keep placeholder */ })

      var decUrl = '/api/lab/temporal-distribution?phen_family=' +
        encodeURIComponent(focused.category) + '&dimension=decade'
      fetch(decUrl).then(function (r) { return r.ok ? r.json() : null }).then(function (d) {
        if (!d || !Array.isArray(d.distribution)) return
        var decArr: { decade: number; share: number }[] = d.distribution.map(function (b: any) {
          return { decade: b.bucket, share: b.percentage || 0 }
        })
        setDecadeDist(decArr)
      }).catch(function () { /* keep placeholder */ })
    }

    // Fetch matches via the existing constellation/match RPC.
    supabase.auth.getSession().then(function (s) {
      var token = s.data.session?.access_token
      if (!token) return
      var params = new URLSearchParams()
      params.set('report_id', focused.id)
      if (focused.category) params.set('category', focused.category)
      if (focused.latitude != null) params.set('lat', String(focused.latitude))
      if (focused.longitude != null) params.set('lng', String(focused.longitude))
      if (focused.description) params.set('description', (focused.description || '').slice(0, 500))

      fetch('/api/constellation/match?' + params.toString(), {
        headers: { Authorization: 'Bearer ' + token },
      }).then(function (resp) {
        return resp.ok ? resp.json() : null
      }).then(function (data) {
        if (!data) return
        setMatches(data.matches || [])
        setTotalDatabase((data.stats && data.stats.total_database) || 0)

        // Derive the nearby-reports list from the matches (already
        // phen-family scoped). Cap at 50 to keep the map snappy.
        if (focused.latitude != null && focused.longitude != null) {
          var nearby: NearbyReportShape[] = (data.matches || [])
            .filter(function (m: any) { return typeof m.latitude === 'number' && typeof m.longitude === 'number' })
            .map(function (m: any) {
              return {
                id: m.id,
                slug: m.slug,
                title: m.title,
                latitude: m.latitude,
                longitude: m.longitude,
                distance_mi: haversineMi(focused.latitude as number, focused.longitude as number, m.latitude, m.longitude),
                event_date: m.event_date || null,
                location_label: [m.city, m.state_province].filter(Boolean).join(', ') || m.country || '',
              }
            })
            .filter(function (m: NearbyReportShape) { return (m.distance_mi as number) <= 50 })
            .slice(0, 50)
          setNearbyReports(nearby)

          // Build a per-experience body-of-work sentence client-side
          // from the matches stats. This is the synthesized paragraph
          // surface until the dedicated Haiku endpoint lands.
          var fam = phenFamilyLabel(focused.category)
          var year = resolveYear(focused)
          var nearbyCount = nearby.length
          var totalFam = (data.matches || []).length
          var sentences: string[] = []
          if (year) {
            sentences.push(
              'Your ' + year + ' ' + locationLabel(focused) + ' ' + fam + ' account is one of '
              + Math.max(totalFam, 1) + ' related accounts in the wider Archive.'
            )
          } else {
            sentences.push(
              'Your ' + locationLabel(focused) + ' ' + fam + ' account is one of '
              + Math.max(totalFam, 1) + ' related accounts in the wider Archive.'
            )
          }
          if (nearbyCount > 0) {
            sentences.push(
              'Within 50 miles, ' + nearbyCount + ' other ' + (nearbyCount === 1 ? 'report sits' : 'reports sit')
              + ' inside your radius.'
            )
          }
          setSynthesizedParagraph(sentences.join(' '))
        } else {
          setNearbyReports([])
          setSynthesizedParagraph('Your ' + phenFamilyLabel(focused.category) + ' account joins the Archive. Add a location to surface where related reports cluster.')
        }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused && focused.id])

  // ── Derived: tier name for gating, and experience-lite list ─────────

  var tier: 'free' | 'basic' | 'pro' | null = (function () {
    var n = (sub.tierName as string | null) || null
    if (n === 'basic' || n === 'pro' || n === 'free') return n
    if (n === 'enterprise') return 'pro'
    return 'free'
  })()

  var experiencesLite = useMemo(function () {
    return reports.map(function (r) {
      return {
        id: r.id,
        category: r.category || null,
        city: r.city || null,
        state_province: r.state_province || null,
        country: r.country || null,
        event_date: r.event_date || null,
        event_time: r.event_time || null,
      }
    })
  }, [reports])

  var experiencesForDossier = useMemo(function () {
    return reports.map(function (r) {
      return {
        id: r.id,
        title: r.title || null,
        type_name: r.phenomenon_type?.name || null,
        category: r.category || null,
        city: r.city || null,
        state_province: r.state_province || null,
        country: r.country || null,
        location_description: r.location_description || null,
        event_date: r.event_date || null,
        event_date_raw: r.event_date_raw || null,
        description: r.description || null,
        summary: r.summary || null,
        resolved_year: resolveYear(r),
        // V11.17.78 — submission card upgrade. Pass the new fields
        // through so DossierHeader can render the video poster, the
        // ownership eyebrow, the status pill, and the "Read the full
        // report" CTA. All are defensive: missing values render the
        // legacy prose-only layout.
        slug: r.slug || null,
        status: r.status || null,
        created_at: r.created_at || null,
        has_video: !!r.has_video,
        has_photo_video: !!r.has_photo_video,
        discoverable: typeof r.discoverable === 'boolean' ? r.discoverable : null,
        video: r.video || null,
      }
    })
  }, [reports])

  // ── Header chrome + page shell ──────────────────────────────────────

  return (
    <>
      <Head>
        <title>My Record | Paradocs</title>
        <meta name="description" content="Your record on Paradocs — the experiences you've shared, the wider archive they sit inside, and the collections you've kept." />
      </Head>

      <div style={{ background: '#0a0a14', minHeight: '100dvh', paddingBottom: '24px' }}>
        {/* Header row — kept from the prior /lab page. */}
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-600/20 rounded-lg">
                <Telescope className="w-5 h-5 sm:w-6 sm:h-6 text-primary-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white" style={{ fontFamily: "'Changa One', system-ui, sans-serif" }}>
                  My Record
                </h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">
                  The experiences you&rsquo;ve shared and where they sit in the wider archive
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* V11.18.x — removed per UI_SHIPPING_ROADMAP_V2 Sprint 1A deletes
                  (in-lab "+ Submit" pill — moves to global chrome in Sprint 2)
                  and the duplicate notification bell (kept only on global chrome). */}
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

        {!isLoggedIn && !loading ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <UnauthenticatedPrompt />
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="pb-20">
            {/* V11.18.x — 200K catalogued-accounts eyebrow per
                UI_SHIPPING_ROADMAP_V2 Sprint 1A additions. */}
            <CorpusStatEyebrow />

            {/* ─── SECTION 1: Dossier header (the spine) ─────────────
                n-aware: n=0 → ghosted EmptyDossier; n=1 → full-bleed
                dossier; n≥2 → experience strip + focused dossier. */}
            <DossierHeader
              experiences={experiencesForDossier}
              focusedIdx={focusedIdx}
              onFocus={setFocusedIdx}
              synthesizedParagraph={focused ? synthesizedParagraph : null}
            />

            {/* V11.18.x — removed per UI_SHIPPING_ROADMAP_V2 Sprint 1A deletes
                (CrossExperienceHeader standalone — prose folds into DossierHeader
                eyebrow per V5 §5.3). */}

            {/* ─── SECTION 2: Patterns rail (V11.18.1) ───────────────
                Sprint 1A-2 — corpus-grounded Finding Cards drawn from
                `findings_catalogue`. Replaces the retired
                CrossExperienceHeader slot per V2 roadmap §5.A2. */}
            <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-2">
              <PatternsRail />
            </div>

            {/* ─── SECTION 2.5: Tier-aware LabPromo conversion bridge ──
                V11.18.0 Sprint 1A. Renders nothing for Pro users. For
                Free/Basic, surfaces the next-tier value prop in austere
                copy (no exhortation, no superlatives). Mount slot is
                between PatternsRail (user just saw cross-phenomenon
                signal) and HintsRail (user is about to see catalogue
                observations on their record) — natural conversion
                bridge without interrupting flow. */}
            <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
              <LabPromo user={{ tier: tier, account_count: reports.length }} />
            </div>

            {/* ─── SECTION 3: Hints rail ─────────────────────────────
                Stays mounted between the dossier and the comparative
                surfaces per the panel ("documentary observations from
                the catalogue, paired with the user's dossier"). */}
            <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
              <HintsRail />
            </div>

            {/* ─── SECTION 4: Temporal strip ─────────────────────────
                Always rendered when an experience is focused (gating
                is depth, not access). */}
            {focused && (
              <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
                <TemporalStrip
                  userHour={resolveHour(focused)}
                  userYear={resolveYear(focused)}
                  hourDistribution={hourDist}
                  decadeDistribution={decadeDist}
                  phenFamilyLabel={phenFamilyLabel(focused.category) + ' reports'}
                  tier={tier}
                />
              </div>
            )}

            {/* ─── SECTION 5: Geographic surface (real map) ────────── */}
            {focused && (
              <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
                <GeographicSurface
                  userLat={focused.latitude == null ? null : focused.latitude}
                  userLng={focused.longitude == null ? null : focused.longitude}
                  userLocationLabel={locationLabel(focused)}
                  radiusMiles={50}
                  nearbyReports={nearbyReports}
                  phenFamilyLabel={phenFamilyLabel(focused.category) + ' reports'}
                  corridorSentence={null}
                  tier={tier}
                />
              </div>
            )}

            {/* V11.18.x — removed per UI_SHIPPING_ROADMAP_V2 Sprint 1A deletes
                (Named-match paywall teaser, NamedMatchOffersRail, DMThreadsList,
                DiscoverabilityToggle, RadarSurface). The named-match-engine
                backend is retained for Sprint 2 comments work. */}

            {/* ─── Match revelation — thumb-row v0 ──────────────────
                V11.18.x — placeholder per UI_SHIPPING_ROADMAP_V2 Sprint 1A.
                The full Match Revelation canvas (one foregrounded match +
                two secondary + signal-ribbon) ships in Sprint 1B with the
                canvas. This placeholder retains the data-section anchor so
                analytics dashboards continue to reference it. */}
            {focused && (
              <div
                data-section="lab-constellation"
                className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6"
              >
                <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-5 sm:p-6">
                  <p className="text-[10px] font-semibold tracking-[0.22em] uppercase text-gray-500 mb-2">
                    The archive
                  </p>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    Match revelation coming in Sprint 1B.
                  </p>
                  <p className="text-[11px] text-gray-500 mt-2">
                    The archive is still indexing your account against the wider catalogue. The
                    comparison surface will appear here once the canvas ships.
                  </p>
                </div>
              </div>
            )}

            {isLoggedIn && (
              <ManageSubmissionsPanel
                onDeleted={function (deletedId) {
                  setReports(function (prev) {
                    var next = prev.filter(function (r) { return r.id !== deletedId })
                    // If we deleted the focused row, fall back to the
                    // first remaining row (or clear focus when empty).
                    if (focused && focused.id === deletedId) {
                      setFocusedIdx(0)
                    } else {
                      // Keep pointing at the same row by id, which
                      // may have shifted index.
                      var sameIdx = next.findIndex(function (r) { return focused && r.id === focused.id })
                      setFocusedIdx(sameIdx >= 0 ? sameIdx : 0)
                    }
                    return next
                  })
                }}
                onEdited={function () {
                  // Refetch reports so the focused dossier reflects
                  // any title/category/location/description changes.
                  if (authToken) loadReports(authToken)
                }}
              />
            )}

            {/* ─── SECTION 9: Pro Dossier ─────────────────────────────
                V11.17.71 — the Pro flagship per PRO_TIER_VALIDATION_V3
                §3 is now LIVE for Pro users. Free + Basic continue to
                see the LabPaywallSurface teaser. */}
            {focused && tier === 'pro' && (
              <div className="pt-6">
                <ProDossier experienceReportId={focused.id} />
              </div>
            )}
            {focused && tier !== 'pro' && (
              <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                <LabPaywallSurface
                  kicker="The Dossier"
                  body={
                    'Pro generates a structured cross-reference dossier for every experience — closest reports, phenomenology lineage, geographic and temporal neighbors, descriptor matches, contextual notes, and a rarity reading. Export as a formatted PDF or share as an image card.'
                  }
                  surface="dossier_preview"
                  upgradeTo="pro"
                />
              </div>
            )}

            {/* ─── SECTION 10: Custom Watchlists ─────────────────────
                V11.17.72 — the second Pro flagship per PRO_TIER_VALIDATION_V3
                §4 is now LIVE for Pro users. Free + Basic continue to see
                the LabPaywallSurface teaser. */}
            {tier === 'pro' && (
              <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
                <WatchlistsRail />
              </div>
            )}
            {focused && tier !== 'pro' && (
              <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
                <LabPaywallSurface
                  kicker="Custom Watchlists"
                  body={
                    'Define standing research interests — a phenomenon family within a region, a descriptor combination, a decade and shape. When matching reports land in the Archive, Pro notifies you.'
                  }
                  surface="watchlist_preview"
                  upgradeTo="pro"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Unauthenticated state ───────────────────────────────────────────

function UnauthenticatedPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
      <div className="p-4 bg-primary-600/20 rounded-full mb-6">
        <Lock className="w-10 h-10 text-primary-400" />
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-3">
        Sign in to open My Record
      </h2>
      <p className="text-gray-400 max-w-md mb-8 text-sm sm:text-base">
        My Record is the experience you share, set against the wider archive
        of 200,000+ accounts. Keep collections, follow related reports, and
        see where your account sits among the rest.
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
