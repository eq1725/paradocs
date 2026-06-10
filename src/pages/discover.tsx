'use client'

/**
 * /discover (Today) — Gesture-based card feed (Phase 4 + May 2026 panel review)
 *
 * Gestures:
 *   - Swipe UP    → next card in feed (TikTok muscle memory)
 *   - Swipe DOWN  → rabbit hole panel slides up with related cases
 *   - Swipe LEFT  → dismiss, flashes "Dismissed", advances
 *   - Swipe RIGHT → save, flashes "✦ Saved"
 *   - Long-press  → "More like this" (heart pulse, weighted into affinity)
 *   - Tap "Read Case" → expands summary + Constellation paywall
 *   - Tap "Collapse" → returns to feed view
 *
 * Panel-review changes (May 2026):
 *   - Page renamed from "Reports" → "Today" everywhere (h1, title, nav, footer)
 *   - TodayHeader replaces flat counter strip: lens + category chip strip,
 *     segmented progress bar, "View as list →" link, aria-live feedback zone
 *   - GestureTutorial replaces invisible 6%-opacity hints (first-run overlay)
 *   - Persistent low-saturation edge chevrons (tappable fallback)
 *   - Saves persist via useTodaySaves (localStorage + /api/user/saved POST)
 *   - Touch handler gated on `expanded` so swipes don't hijack reading
 *   - Auto-expand on 4s dwell (default ON, opt-out via cookie)
 *   - Long-press = "more like this" — fires feed_event_type='more_like_this'
 *   - Skeleton card replaces generic spinner
 *   - End-of-feed celebration card with streak + outbound CTAs
 *   - Tier-aware Research Hub promo (skip for Pro)
 *   - Connected cases sidebar at lg: (was xl:)
 *   - Constellation paywall consolidated to single canonical placement
 *   - Desktop shortcut bar default-collapsed, surfaced via "?" in header
 *   - Contextual signup prompt referencing current card
 *   - Sets sessionStorage marker before View Full Report navigation
 *
 * SWC: var, function expressions, string concat — no const/let, no arrow
 * functions in JSX, no template literals.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
// V11.18.10 — Sprint 1D SSR fix. Supabase service-role client used in
// getServerSideProps to pre-fetch the day's Finding so it lands in the
// initial paint of /discover instead of racing the user's swipe past
// position 4-5. Only FindingCard moves to SSR — LabPromo/OnThisDate/
// Cluster remain client-side per the surgical-fix scope.
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
// V11.17.44 — swapped from local createClient (which ran at module
// load and crashed CI builds when env vars were absent) to the lazy
// proxy in @/lib/supabase. Same anon-key client; deferred init.
import { supabase } from '@/lib/supabase'
import {
  PhenomenonCard,
  TextReportCard,
  MediaReportCard,
} from '@/components/discover/DiscoverCards'
import VideoReportCard from '@/components/discover/VideoReportCard'
import type { FeedItemV2, PhenomenonItem, ReportItem } from '@/components/discover/DiscoverCards'
import { ClusteringCard } from '@/components/discover/ClusteringCard'
import type { ClusterCardData } from '@/components/discover/ClusteringCard'
import { OnThisDateCard } from '@/components/discover/OnThisDateCard'
import type { OnThisDateData } from '@/components/discover/OnThisDateCard'
// V11.18.1 — Sprint 1A-2. FindingCard special-card injection.
// One Finding (rotated daily, deterministic for all users) lands at
// position 4 of the Today feed per V2 roadmap §5.A5. Visually marked
// with hairline purple top + bottom borders to distinguish it from
// report cards. Third-person archival voice (NOT 2nd person).
import FindingCard from '@/components/patterns/FindingCard'
import type { Finding as FindingCardData } from '@/components/patterns/FindingCard'
// V11.17.39 — Lab upsell card (replaces ResearchHubPromo).
//   - Real production RadarVisualization w/ reveal animation
//   - 5-variant headline ladder driven by /api/lab/footprint
//   - Hairline-divided benefits mapped to Library / Your Story / Explore
//   - Single-tier $5.99 footer (Pro deliberately not shown — tier
//     selection happens on /pricing after intent signal)
import { LabPromo } from '@/components/discover/LabPromo'
import type { PromoCardData } from '@/components/discover/LabPromo'
import { fetchLabPromoShouldShow, logLabPromoEvent } from '@/lib/lab-promo-telemetry'
import { CaseViewGate } from '@/components/discover/CaseViewGate'
import { TopicOnboarding, isOnboardingComplete, getOnboardingTopics } from '@/components/discover/TopicOnboarding'
import { RabbitHolePanel } from '@/components/discover/RabbitHolePanel'
import type { RabbitHoleCard } from '@/components/discover/RabbitHolePanel'
import { DetailView } from '@/components/discover/DetailView'
import { TodayHeader } from '@/components/discover/TodayHeader'
import type { TodayLens } from '@/components/discover/TodayHeader'
import { GestureTutorial, isGestureTutorialComplete, resetGestureTutorial } from '@/components/discover/GestureTutorial'
import { EndOfFeedCard } from '@/components/discover/EndOfFeedCard'
import { SkeletonCard } from '@/components/discover/SkeletonCard'
// V11.18.x — removed per UI_SHIPPING_ROADMAP_V2 Sprint 1A deletes
//   TodayGridMode (desktop grid overlay) — the toggle + overlay are gone.
// V11.18.x — 200K catalogued-accounts eyebrow per UI_SHIPPING_ROADMAP_V2 Sprint 1A additions.
import { CorpusStatEyebrow } from '@/components/common/CorpusStatEyebrow'
import { useFeedEvents } from '@/lib/hooks/useFeedEvents'
import { useSessionContext } from '@/lib/hooks/useSessionContext'
import { useGateStatus } from '@/lib/hooks/useGateStatus'
import { useTodaySaves } from '@/lib/hooks/useTodaySaves'
import { setTodayReturnMarker } from '@/lib/hooks/useTodayReturn'
import { tickAnonStreak, readAnonStreak, clearAnonStreak, isNudgeDismissedToday, dismissNudgeForToday } from '@/lib/anonStreak'
// V11.17.38 — per-visit dedup so a user who closes the tab and returns
// the same day sees a fresh slice, not the same reports they already
// scrolled past. 24h rolling localStorage Set; marked on real
// engagement (dwell >1.5s, tap, save, vote), not bare swipe-by.
import { getSeenIds, markSeen } from '@/lib/today-seen'
import { NotificationOptInPrompt, shouldAutoShowPrePrompt } from '@/components/discover/NotificationOptInPrompt'
import { useABTest } from '@/lib/ab-testing'
import { CATEGORY_CONFIG } from '@/lib/constants'
import CategoryIcon from '@/components/ui/CategoryIcon'
import type { PhenomenonCategory } from '@/lib/database.types'

// V11.18.1 — Today feed Finding card wrapper. Carries the discriminator
// `item_type: 'finding'` so applyLens + render branches can detect it.
export interface FindingFeedItem extends FindingCardData {
  item_type: 'finding'
}

// Extended feed item type that includes new card types
type ExtendedFeedItem = FeedItemV2 | ClusterCardData | OnThisDateData | PromoCardData | FindingFeedItem

// Category color hex map (duplicated from cards for inline use)
var CATEGORY_COLORS: Record<string, string> = {
  ufos_aliens: '#4fc3f7',
  cryptids: '#a5d6a7',
  ghosts_hauntings: '#ce93d8',
  psychic_phenomena: '#b39ddb',
  consciousness_practices: '#ffb74d',
  psychological_experiences: '#80deea',
  perception_sensory: '#ffcc80',
  religion_mythology: '#fff176',
  esoteric_practices: '#f48fb1',
}

// V11.17.40 — Legacy localStorage dismissal counter retained as a
// fail-open fallback ONLY. The authoritative source is now the
// /api/lab/promo/should-show endpoint (lab_promo_impressions table).
// Once the server-side cooldown logic is verified in production
// across a release cycle, this legacy gate can be removed entirely.
var PROMO_DISMISS_KEY = 'today_promo_dismissals_v1'
function getPromoDismissals(): number {
  if (typeof window === 'undefined') return 0
  try {
    var raw = localStorage.getItem(PROMO_DISMISS_KEY)
    return raw ? parseInt(raw, 10) || 0 : 0
  } catch (e) { return 0 }
}
function bumpPromoDismissals() {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(PROMO_DISMISS_KEY, String(getPromoDismissals() + 1)) } catch (e) {}
}

// V11.18.1 — Day-of-year (1-366) for the daily-rotation Finding pick.
// UTC so every user worldwide gets the same rotation on a given date.
function dayOfYear(d: Date): number {
  var start = Date.UTC(d.getUTCFullYear(), 0, 1)
  var now = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.floor((now - start) / 86400000) + 1
}

// V11.17.40 — how many promo slots to seed into the feed when
// `should_show=true`. Server still enforces the 6/week hard cap;
// this is just the client-side budget within a single session.
// Most users won't swipe past 60 cards, so 4 placements at cadence
// 12 (every 12th card) gives a comfortable upper bound.
var PROMO_SESSION_PLACEMENTS = 4

// Lens post-filter — applied client-side after feed-v2 returns the scored
// items. The category param is passed directly to feed-v2 (server-side filter).
function applyLens(items: ExtendedFeedItem[], lens: TodayLens): ExtendedFeedItem[] {
  if (lens === 'all') return items
  if (lens === 'photo-video') {
    // Renamed in UI to "With Evidence" (panel review #15). Paradocs is an
    // index — for link-only sources (BFRO/NUFORC/NDERF/OBERF) we don't
    // republish media even when has_photo_video=true on the source. Match
    // reports that either (a) have physical evidence OR (b) have media we
    // own locally (primary_media set from report_media table).
    return items.filter(function (it) {
      if (it.item_type === 'cluster' || it.item_type === 'on_this_date' || it.item_type === 'promo' || it.item_type === 'finding') return true
      if (it.item_type === 'report') {
        var r = it as ReportItem
        return r.has_physical_evidence === true
          || (r.has_photo_video === true && r.primary_media != null)
      }
      return false
    })
  }
  if (lens === 'on-this-date') {
    return items.filter(function (it) {
      // Always include the actual on-this-date cards; otherwise pick items
      // whose first_reported_date matches today's month/day (best-effort).
      // V11.18.9 — also pass through 'finding' and 'cluster' special cards.
      // Pre-V11.18.9 this branch only allow-listed 'on_this_date' + 'promo',
      // which silently stripped any FindingCard or ClusterCard that the
      // injector had splat into items[] — explaining why the FindingCard
      // never reached the render branch when the user was on the
      // 'on-this-date' lens. Consistent with the 'photo-video' branch
      // above (line 170), which already passes through all four special
      // card kinds.
      if (it.item_type === 'on_this_date' || it.item_type === 'promo'
        || it.item_type === 'finding' || it.item_type === 'cluster') return true
      var today = new Date()
      var md = (today.getMonth() + 1) + '-' + today.getDate()
      if (it.item_type === 'phenomenon') {
        var p = it as PhenomenonItem
        if (!p.first_reported_date) return false
        var d = new Date(p.first_reported_date)
        return ((d.getMonth() + 1) + '-' + d.getDate()) === md
      }
      if (it.item_type === 'report') {
        var r = it as ReportItem
        if (!r.event_date) return false
        var dd = new Date(r.event_date)
        return ((dd.getMonth() + 1) + '-' + dd.getDate()) === md
      }
      return false
    })
  }
  if (lens === 'recent') {
    // recent: lean on created_at (already weighted, but emphasize)
    return items.slice().sort(function (a, b) {
      var ac = (a as any).created_at || 0
      var bc = (b as any).created_at || 0
      return new Date(bc).getTime() - new Date(ac).getTime()
    })
  }
  if (lens === 'trending') {
    // trending: sort by upvote/view proxy where available
    return items.slice().sort(function (a, b) {
      var av = (a as any).upvotes || (a as any).report_count || 0
      var bv = (b as any).upvotes || (b as any).report_count || 0
      return bv - av
    })
  }
  return items
}

// V11.18.10 — Sprint 1D SSR fix. Props pre-fetched by getServerSideProps
// (defined at the bottom of this file). `initialFinding` is the day's
// rotated Finding row, ready to be folded into the special-card inject
// pipeline on first paint. Null when SSR couldn't reach Supabase — in
// that case fetchSpecialCards() falls through to the client-side fetch
// as before, preserving the pre-V11.18.10 behavior as a safety net.
//
// V11.18.14 — Sprint 1E follow-up. SSR-bake fix. The TikTok-grammar
// swipe component on /discover calculates its snap-points from the
// initial items[] array. When special cards were injected AFTER first
// paint (via mount useEffect / Promise.all in fetchSpecialCards), the
// swipe component's snap-points were STALE — forward swipe jumped past
// the special-card positions; they only surfaced on swipe-BACK when
// the component re-evaluated layout. Fix: pre-fetch OnThisDate alongside
// the Finding so BOTH lands in props, then bake them into items[] in
// the SAME setItems() call that loads the base feed. Snap-points are
// then computed once, correctly, from the complete array on first
// forward pass. LabPromo stays client-side (needs session + tier check).
interface DiscoverPageProps {
  initialFinding: FindingFeedItem | null
  initialOnThisDate: OnThisDateData | null
}

export default function DiscoverPage(props: DiscoverPageProps) {
  var initialFinding = props.initialFinding || null
  var initialOnThisDate = props.initialOnThisDate || null
  var router = useRouter()

  // --- URL-driven lens + category state (panel review IA fix) ---
  var [lens, setLens] = useState<TodayLens>('all')
  var [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  useEffect(function () {
    if (!router.isReady) return
    var qLens = (router.query.lens as string) || 'all'
    var validLenses: TodayLens[] = ['all', 'trending', 'on-this-date', 'photo-video', 'recent']
    if (validLenses.indexOf(qLens as TodayLens) >= 0) setLens(qLens as TodayLens)
    else setLens('all')
    var qCat = (router.query.category as string) || ''
    setCategoryFilter(qCat || null)
  }, [router.isReady, router.query.lens, router.query.category])

  // V7.5 — Reverted V7.4's lens auto-switch. applyLens('on-this-date')
  // filters the loaded feed-v2 batch by today's MM-DD, but feed-v2
  // returns items ranked by personalization, not date — so the filter
  // collapses the visible feed to ~0 cards on most days. Worse UX
  // than not switching. The on-this-date promotion now happens via
  // the special-card injection (position bumped from 2 → 1 below in
  // fetchSpecialCards) so the on-this-date phenomenon appears as the
  // 2nd card the user swipes to instead of the 3rd. That keeps the
  // daily-ritual feel without breaking the rest of the feed.

  function pushQuery(nextLens: TodayLens, nextCat: string | null) {
    var q: Record<string, string> = {}
    if (nextLens && nextLens !== 'all') q.lens = nextLens
    if (nextCat) q.category = nextCat
    router.replace({ pathname: '/discover', query: q }, undefined, { shallow: true })
  }

  function handleLensChange(next: TodayLens) {
    setLens(next)
    pushQuery(next, categoryFilter)
    // Reset position when filter changes for a clean experience
    setIdx(0)
    setItems([])
    setFeedOffset(0)
    setHasMore(true)
    specialCardsInjected.current = false
    pendingSpecialCards.current = []
    // V11.18.10 — SSR-delivered finding is a first-paint contract;
    // user-initiated lens change falls back to the client patterns/list
    // fetch in fetchSpecialCards() (pre-V11.18.10 path).
    // V11.18.14 — same reset for OnThisDate (now also SSR-baked).
    ssrFindingDelivered.current = false
    ssrOnThisDateDelivered.current = false
    setTimeout(function () { loadFeed(0) }, 0)
  }
  function handleCategoryChange(next: string | null) {
    // V7.4 Tier 2 — Selecting a category resets lens to 'all' to
    // avoid the lens × category multiplicative trap (e.g. "On this
    // day" + "Cryptids" → 1 result). This is single-state-batch so
    // we only fire one loadFeed.
    setCategoryFilter(next)
    if (lens !== 'all') setLens('all')
    pushQuery('all', next)
    setIdx(0)
    setItems([])
    setFeedOffset(0)
    setHasMore(true)
    specialCardsInjected.current = false
    pendingSpecialCards.current = []
    // V11.18.10 — same reset as handleLensChange; on category change,
    // the SSR pre-fetched Finding is no longer valid (Findings suppress
    // when categoryFilter is set anyway) and on a category-clear we
    // want the live client fetch to repopulate.
    // V11.18.14 — same reset for OnThisDate.
    ssrFindingDelivered.current = false
    ssrOnThisDateDelivered.current = false
    setTimeout(function () { loadFeed(0) }, 0)
  }

  // --- Feed state ---
  var [items, setItems] = useState<ExtendedFeedItem[]>([])
  var [loading, setLoading] = useState(true)
  var sessionSeed = useRef(Math.floor(Math.random() * 2147483647))
  var [loadingMore, setLoadingMore] = useState(false)
  var [hasMore, setHasMore] = useState(true)
  var [totalAvailable, setTotalAvailable] = useState(0)
  var [feedOffset, setFeedOffset] = useState(0)
  var loadingRef = useRef(false)

  // --- Search overlay state (V2 #13) — declared early so the displayItems
  // memo below can reference it before the rest of the state block runs. ---
  var [searchQuery, setSearchQuery] = useState('')

  // V11.17.38 — initialize once from localStorage so the first paint
  // can drop already-seen reports. Subsequent marks update both the
  // ref-backed Set (for immediate filtering on the next render) and
  // localStorage (for the next visit).
  var seenIdsRef = useRef<Set<string>>(typeof window === 'undefined' ? new Set() : getSeenIds())
  var [seenIdsVersion, setSeenIdsVersion] = useState(0)  // bump to force re-filter

  // Filtered view of items based on the active lens.
  // V2 panel review: also applies a client-side search filter when the user
  // has opened the search overlay and entered a query.
  // V11.17.38 — also filters out reports the user has seen within the
  // last 24h, so a tab-close + return shows fresh slice. Phenomenon
  // cards and special cards (cluster / on_this_date / promo) bypass
  // dedup — they're curation surfaces, not individual experiences.
  // Safety: if dedup would empty the feed, we keep the seen items so
  // the user never lands on a "nothing here" wall.
  var lensFiltered = applyLens(items, lens)
  // V11.18.9 — diagnostic logs at each filter step in the items →
  // displayItems pipeline. The render-branch log added in V11.18.8
  // (line ~1527) never fired for the FindingCard despite the inject
  // log confirming the card landed in items[]; these step-level logs
  // surface exactly which filter is stripping it on the founder's
  // device. Each log emits the count of `finding` entries in/out so
  // a single look at DevTools tells you the answer.
  var displayItems = (function () {
    void seenIdsVersion  // re-eval when version bumps
    var seen = seenIdsRef.current
    var lensFindingCount = lensFiltered.filter(function (it) { return it && it.item_type === 'finding' }).length
    var itemsFindingCount = items.filter(function (it) { return it && it.item_type === 'finding' }).length
    if (typeof window !== 'undefined' && (itemsFindingCount !== lensFindingCount || itemsFindingCount > 0)) {
      console.log('[Discover/filter:applyLens]', {
        lens: lens,
        items_in: items.length,
        items_out: lensFiltered.length,
        finding_in: itemsFindingCount,
        finding_out: lensFindingCount,
        stripped: itemsFindingCount - lensFindingCount,
      })
    }
    var afterDedup = lensFiltered.filter(function (it) {
      if (!it || !it.id) return true
      if (it.item_type !== 'report') return true
      return !seen.has(it.id)
    })
    var dedupFindingCount = afterDedup.filter(function (it) { return it && it.item_type === 'finding' }).length
    if (typeof window !== 'undefined' && (dedupFindingCount !== lensFindingCount || lensFindingCount > 0)) {
      console.log('[Discover/filter:dedup]', {
        items_in: lensFiltered.length,
        items_out: afterDedup.length,
        finding_in: lensFindingCount,
        finding_out: dedupFindingCount,
        stripped: lensFindingCount - dedupFindingCount,
        seen_size: seen.size,
      })
    }
    // Don't strand the user. If the dedup ate everything, show the
    // full list so they have something to read — they're returning
    // for more, not less.
    var base = afterDedup.length === 0 ? lensFiltered : afterDedup
    var q = (searchQuery || '').trim().toLowerCase()
    if (!q) {
      var baseFindingCount = base.filter(function (it) { return it && it.item_type === 'finding' }).length
      if (typeof window !== 'undefined' && baseFindingCount > 0) {
        var findingIdx = -1
        for (var bi = 0; bi < base.length; bi++) {
          var bit: any = base[bi]
          if (bit && bit.item_type === 'finding') { findingIdx = bi; break }
        }
        console.log('[Discover/filter:final]', {
          base_len: base.length,
          finding_count: baseFindingCount,
          finding_idx: findingIdx,
        })
      }
      return base
    }
    var afterSearch = base.filter(function (it) {
      var hay = ''
      if (it.item_type === 'phenomenon') {
        var p = it as PhenomenonItem
        hay = ((p.name || '') + ' ' + (p.feed_hook || '') + ' ' + (p.ai_summary || '') + ' ' + (p.ai_description || '') + ' ' + (p.aliases || []).join(' ')).toLowerCase()
      } else if (it.item_type === 'report') {
        var r = it as ReportItem
        hay = ((r.title || '') + ' ' + (r.feed_hook || '') + ' ' + (r.summary || '') + ' ' + (r.location_name || '') + ' ' + (r.city || '') + ' ' + (r.state_province || '') + ' ' + (r.country || '')).toLowerCase()
      } else {
        return true  // always include special cards
      }
      return hay.indexOf(q) >= 0
    })
    if (typeof window !== 'undefined') {
      var searchFindingCount = afterSearch.filter(function (it) { return it && it.item_type === 'finding' }).length
      console.log('[Discover/filter:search]', {
        query: q,
        items_in: base.length,
        items_out: afterSearch.length,
        finding_out: searchFindingCount,
      })
    }
    return afterSearch
  })()

  // V10.7.E.17 — pre-fetch every visible video card's poster JPEG
  // via <link rel="preload" as="image"> so the browser fetches them
  // in parallel as soon as the feed data lands. By the time the user
  // swipes to any video card, the <img> in VideoReportCard resolves
  // from the HTTP cache and paints instantly — no more black gap
  // between the card appearing and the first frame.
  //
  // We tag each link with data-paradocs-preload so we can clean up
  // links from prior feed pages on the next data refresh without
  // touching unrelated <link> tags Next.js / PostHog inject.
  useEffect(function () {
    if (typeof document === 'undefined') return
    // Clean up any preload tags we added previously.
    var prior = document.querySelectorAll('link[data-paradocs-preload="poster"]')
    for (var i = 0; i < prior.length; i++) {
      var node = prior[i]
      if (node.parentNode) node.parentNode.removeChild(node)
    }
    // Add a preload for each video card's poster URL.
    var added = 0
    for (var j = 0; j < displayItems.length; j++) {
      var it: any = displayItems[j]
      if (it.item_type !== 'report') continue
      var purl = it.video && it.video.poster_url
      if (!purl) continue
      var link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = purl
      link.setAttribute('data-paradocs-preload', 'poster')
      // High priority for the first 3 video posters (the user's most
      // likely next few swipes). Lower priority for the rest so we
      // don't saturate the connection on slow networks.
      if (added < 3) link.setAttribute('fetchpriority', 'high')
      document.head.appendChild(link)
      added++
    }
  }, [displayItems])

  // --- Card index + gesture state ---
  var [idx, setIdx] = useState(0)
  var [expanded, setExpanded] = useState(false)
  var [rabbitOpen, setRabbitOpen] = useState(false)
  var [detailCard, setDetailCard] = useState<RabbitHoleCard | null>(null)
  var [swipeAnim, setSwipeAnim] = useState<string | null>(null)
  var [feedbackLabel, setFeedbackLabel] = useState<string | null>(null)
  var [heartPulse, setHeartPulse] = useState(false)
  var touchStart = useRef<{ x: number; y: number; t: number } | null>(null)
  var longPressTimer = useRef<any>(null)
  var longPressFiredRef = useRef<{ v: boolean } | null>(null)
  var animating = useRef(false)

  // V11.17.38 PR-7 follow-up (Chase's video-perf flag) — prefetch the
  // actual video BYTES for the next 1-2 video cards in the feed,
  // anchored to current scroll position (idx). The feed renders one
  // card at a time, so the next video element doesn't mount until the
  // user swipes to it; without this, every swipe-to-a-video hits a
  // cold buffer + 1-3s first-frame delay.
  //
  // Strategy: <link rel="prefetch" as="video"> — browser fetches in
  // the background at low priority; when the user swipes, the <video>
  // src resolves from HTTP cache and playback starts immediately.
  // Tags carry data-paradocs-preload="video" so we evict prior
  // prefetches when idx changes (avoid keeping a queue of dead links).
  //
  // Effect is placed AFTER the idx useState declaration so TS doesn't
  // flag "used before assigned" — earlier attempt had it next to the
  // poster preload effect, which blocked Vercel build (16c749d failed).
  useEffect(function () {
    if (typeof document === 'undefined') return
    var prior = document.querySelectorAll('link[data-paradocs-preload="video"]')
    for (var i = 0; i < prior.length; i++) {
      var node = prior[i]
      if (node.parentNode) node.parentNode.removeChild(node)
    }
    var prefetched = 0
    var MAX_PREFETCH = 2
    for (var j = idx + 1; j < displayItems.length && prefetched < MAX_PREFETCH; j++) {
      var it: any = displayItems[j]
      if (it.item_type !== 'report') continue
      var vurl = it.video && it.video.playback_url
      if (!vurl) continue
      var link = document.createElement('link')
      link.rel = 'prefetch'
      link.as = 'video'
      link.href = vurl
      link.setAttribute('crossorigin', 'anonymous')
      link.setAttribute('data-paradocs-preload', 'video')
      document.head.appendChild(link)
      prefetched++
    }
  }, [displayItems, idx])

  // --- Auth ---
  var [user, setUser] = useState<any>(null)
  var [userTier, setUserTier] = useState<string | null>(null)

  // --- Onboarding + tutorial ---
  var [showOnboarding, setShowOnboarding] = useState(false)
  var [showTutorial, setShowTutorial] = useState(false)
  var [onboardingTopics, setOnboardingTopics] = useState<string[]>([])

  // --- Related cards cache (for rabbit hole) ---
  var [relatedCache, setRelatedCache] = useState<Record<string, FeedItemV2[]>>({})
  var relatedLoadingRef = useRef<Record<string, boolean>>({})

  // --- Behavioral hooks ---
  var feedEvents = useFeedEvents(user?.id || null)
  var sessionCtx = useSessionContext()
  var gateStatus = useGateStatus(user?.id || null)
  var saves = useTodaySaves(user?.id || null)

  // --- Auto-expand on dwell — DISABLED May 2026 ---
  // The 4s dwell auto-expand was conflicting with the gesture system: long
  // headlines (Pali Canon, etc.) take >4s to read, the card silently
  // expanded, and then handleTouchStart/End early-return on `expanded` to
  // prevent swipes hijacking reading mode. Net effect: gestures stopped
  // working after the first card. Keeping the placeholder ref in case we
  // re-introduce as an opt-in setting later.
  var autoExpandTimer = useRef<any>(null)

  // --- Dwell tracking ---
  var dwellStartRef = useRef<number>(Date.now())
  var [maxSeen, setMaxSeen] = useState(0)

  // --- Signup prompt (contextual) ---
  var [showSignupPrompt, setShowSignupPrompt] = useState(false)
  var [signupDismissed, setSignupDismissed] = useState(false)

  // --- Desktop keyboard shortcut overlay (default-collapsed per panel review) ---
  var [showShortcuts, setShowShortcuts] = useState(false)

  // --- Save → Lab celebration loop (V2 panel review #20) ---
  var saveCountRef = useRef(0)
  var [celebrationToast, setCelebrationToast] = useState<string | null>(null)
  // V9.4.8 — push notification opt-in pre-prompt. Triggers ONCE on
  // first save event (panel: highest-leverage intent moment). Pulls
  // a sample push_copy from the first saved phenomenon for the
  // preview card.
  var [showPushPrompt, setShowPushPrompt] = useState(false)
  var [pushPromptSample, setPushPromptSample] = useState<{ title: string; body: string } | null>(null)

  // --- Streak (for header chip, V2 #12) ---
  var [streakDays, setStreakDays] = useState<number>(0)
  // V8 — sign-in nudge dismissed for today. Persisted to localStorage
  // so the dismissal survives reloads but resurfaces tomorrow.
  var [nudgeDismissed, setNudgeDismissed] = useState<boolean>(false)
  useEffect(function () {
    setNudgeDismissed(isNudgeDismissedToday())
  }, [])
  function handleNudgeDismiss() {
    dismissNudgeForToday()
    setNudgeDismissed(true)
  }
  // searchQuery state lives near the top of the component (above displayItems)

  // V11.18.x — removed per UI_SHIPPING_ROADMAP_V2 Sprint 1A deletes
  // (TodayGridMode desktop grid overlay + toggle).

  // --- V5-next: pull-to-refresh ---
  var [pullDistance, setPullDistance] = useState(0)
  var pullStartRef = useRef<number | null>(null)
  var [refreshing, setRefreshing] = useState(false)

  // --- First-time Collapse tooltip (V2 panel review #15) ---
  var COLLAPSE_TIP_KEY = 'today_collapse_tip_v1'
  var [showCollapseTip, setShowCollapseTip] = useState(false)
  function maybeShowCollapseTip() {
    if (typeof window === 'undefined') return
    try {
      if (localStorage.getItem(COLLAPSE_TIP_KEY) !== '1') {
        setShowCollapseTip(true)
        setTimeout(function () { setShowCollapseTip(false) }, 4500)
        localStorage.setItem(COLLAPSE_TIP_KEY, '1')
      }
    } catch (e) {}
  }

  // Pending special cards
  //
  // V11.18.11 — Sprint 1D SSR fix v2. Seed the SSR-delivered FindingCard
  // SYNCHRONOUSLY in the useRef initializer (not via a mount useEffect).
  // V11.18.10 used a mount useEffect, but useEffects run AFTER the
  // first commit — meaning the existing feed-load useEffect would fire
  // loadFeed(0) → setItems → injectPendingSpecialCards with an empty
  // queue, BEFORE the seed effect ran. The Finding got stuck in
  // pendingSpecialCards.current and only appeared after a re-injection
  // (swipe-back / scroll-to-bottom). useRef initializers run during
  // render, before any useEffect, so the queue is populated before
  // the first loadFeed completes.
  //
  // V11.18.14 — SSR-bake. The FindingCard + OnThisDateCard are no
  // longer queued here — they're baked directly into items[] in
  // loadFeed(0) on the initial setItems call, eliminating the
  // snap-point staleness race. pendingSpecialCards is now used ONLY
  // for LabPromo placements (which depend on the live should-show
  // decision + cadence and must stay client-side).
  var pendingSpecialCards = useRef<{ card: ExtendedFeedItem; position: number }[]>([])
  var specialCardsInjected = useRef(false)

  // `ssrFindingDelivered` flips fetchSpecialCards() into skip-client-fetch
  // mode so we don't double-inject. The pull-to-refresh / lens-change /
  // category-change paths reset the ref so the next session re-attempts
  // via the client fetch (those paths don't re-run getServerSideProps).
  // V11.18.14 — same gate now also applies to OnThisDate.
  var ssrFindingDelivered = useRef<boolean>(initialFinding != null)
  var ssrOnThisDateDelivered = useRef<boolean>(initialOnThisDate != null)

  // Diagnostic log only — moved from V11.18.10's mount-seed useEffect.
  // No seeding logic here; that's now synchronous above.
  useEffect(function () {
    if (typeof window !== 'undefined') {
      console.log('[Discover/SSR-finding]', {
        hasInitialFinding: !!initialFinding,
        slug: initialFinding && initialFinding.slug,
        hasInitialOnThisDate: !!initialOnThisDate,
        otdId: initialOnThisDate && initialOnThisDate.id,
      })
    }
  }, [])

  // V11.18.x — removed per UI_SHIPPING_ROADMAP_V2 Sprint 1A deletes
  // (body scroll-lock on /discover was a chrome-stacking workaround for
  // a problem fixed elsewhere). Mobile + desktop now scroll natively.

  // =========================================================================
  //  Auth + tier
  // =========================================================================
  useEffect(function () {
    supabase.auth.getSession().then(function (result) {
      var u = result.data.session?.user || null
      setUser(u)
      if (u) loadUserTier(u.id)
    })
    var sub = supabase.auth.onAuthStateChange(function (_event, session) {
      var u = session?.user || null
      setUser(u)
      if (u) loadUserTier(u.id)
      else setUserTier(null)
    })
    return function () { sub.data.subscription.unsubscribe() }
  }, [])

  function loadUserTier(uid: string) {
    // .single() returns a thenable; the catch chain isn't typed so we wrap in
    // try via Promise.resolve() to keep TS happy without changing semantics.
    // V11.18.13 — Sprint 1E fixes. Swapped .single() → .maybeSingle() to
    // silence the chronic 400 GET /profiles?select=subscription_tier the
    // founder was seeing in DevTools. PostgREST returns a 4xx body when
    // .single() is called and either zero rows match OR the row exists
    // but RLS hides it; .maybeSingle() returns null on either case
    // without surfacing the request as an HTTP error. The "free" default
    // already covers the null branch in the success path below.
    Promise.resolve(
      supabase.from('profiles').select('subscription_tier').eq('id', uid).maybeSingle()
    )
      .then(function (r: any) {
        var t = r?.data?.subscription_tier || 'free'
        setUserTier(t)
      })
      .catch(function () { /* tier read failed, leave default */ })
  }

  // Pull streak data for the header chip (best-effort; quiet on failure).
  // V8 — when user is anonymous, fall back to localStorage anonymous-streak
  // tracking. tickAnonStreak ticks once per calendar day; the day-3
  // nudge UI gates display on streakDays >= 3.
  // V8.4 — when user transitions from anonymous to signed-in, migrate
  // any localStorage streak count to their server-side user_streaks
  // record via /api/user/streak-bootstrap, then clear localStorage so
  // the bootstrap doesn't fire repeatedly.
  // V11.18.13 — Sprint 1E fixes. Pass Authorization: Bearer <access_token>
  // on every server call so the server-side auth helper finds the session
  // even when the cookie jar hasn't fully hydrated yet. Without this we
  // were seeing chronic 401s from /api/user/streak + /streak-bootstrap +
  // /api/push/claim-anon-subscriptions on first-paint after sign-in —
  // the user object is set from supabase.auth.getSession() but the
  // SSR-helper cookie can lag the JS state by one tick. We also fully
  // verify session existence via supabase.auth.getSession() inside the
  // effect so we never hit the endpoints when the user has signed out
  // between mount and effect run.
  useEffect(function () {
    if (!user?.id) {
      // Anonymous — use localStorage streak
      var anonDays = tickAnonStreak()
      setStreakDays(anonDays)
      return
    }
    var aborted = false

    // V8.4 — bootstrap any anon streak first, BEFORE fetching server
    // streak. If a count was tracked client-side, migrate it.
    var pendingAnonDays = readAnonStreak()

    supabase.auth.getSession().then(function (sessionResult) {
      if (aborted) return
      var session = sessionResult && sessionResult.data ? sessionResult.data.session : null
      if (!session?.access_token) {
        // Session disappeared between mount and effect — bail silently
        // so we don't fire the auth-gated endpoints and produce 401
        // noise in the console.
        return
      }
      var authHeaders: Record<string, string> = {
        'Authorization': 'Bearer ' + session.access_token,
      }

      function fetchServerStreak() {
        return fetch('/api/user/streak', { headers: authHeaders })
          .then(function (res) { return res.ok ? res.json() : null })
          .then(function (data) {
            if (aborted) return
            if (data && data.streak && typeof data.streak.current_streak === 'number') {
              setStreakDays(data.streak.current_streak)
            }
          })
          .catch(function () {})
      }

      if (pendingAnonDays >= 1) {
        fetch('/api/user/streak-bootstrap', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders),
          body: JSON.stringify({ anon_days: pendingAnonDays }),
        })
          .then(function (res) { return res.ok ? res.json() : null })
          .then(function (_data) {
            // Whether migrated or skipped, clear localStorage so we
            // don't keep re-bootstrapping on every visit.
            clearAnonStreak()
            if (aborted) return
            // Read fresh server state after bootstrap completes.
            return fetchServerStreak()
          })
          .catch(function () {
            // Bootstrap failed — still try to fetch server streak. Don't
            // clear localStorage so a retry can happen on the next visit.
            if (!aborted) fetchServerStreak()
          })
      } else {
        fetchServerStreak()
      }

      // V9.4.9 — claim any anonymous push subscriptions for this user.
      // The anon_client_id is set the first time pushNotifications.ts
      // requests permission. If the user subscribed anonymously, then
      // signed in, this attributes their existing push_subscriptions
      // row to their user_id. Idempotent — calling on every sign-in
      // is fine; second call updates 0 rows.
      try {
        var anonClientId = (typeof window !== 'undefined')
          ? localStorage.getItem('paradocs_anon_client_id')
          : null
        if (anonClientId) {
          fetch('/api/push/claim-anon-subscriptions', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders),
            credentials: 'include',
            body: JSON.stringify({ anon_client_id: anonClientId }),
          }).catch(function () {})
        }
      } catch (e) {}
    })

    return function () { aborted = true }
  }, [user?.id])

  // V9.4.10 — push cooldown heartbeat. Fires once per /discover
  // mount to bump last_active_at on the caller's push_subscriptions
  // row(s). The send-daily-lead cron then skips subscriptions where
  // last_active_at is < 4 hours old (avoids the "I'm already
  // reading and you're pinging me" noise). Fire-and-forget; no UI.
  useEffect(function () {
    var anonClientId: string | null = null
    try {
      if (typeof window !== 'undefined') {
        anonClientId = localStorage.getItem('paradocs_anon_client_id')
      }
    } catch (e) {}
    fetch('/api/push/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ anon_client_id: anonClientId }),
    }).catch(function () {})
  }, [user?.id])

  // =========================================================================
  //  Onboarding + first-run gesture tutorial
  // =========================================================================
  useEffect(function () {
    if (!isOnboardingComplete()) {
      setShowOnboarding(true)
    } else {
      setOnboardingTopics(getOnboardingTopics())
      // After onboarding, show gesture tutorial if user hasn't seen it.
      if (!isGestureTutorialComplete()) setShowTutorial(true)
    }
  }, [])

  // =========================================================================
  //  Load feed
  // =========================================================================
  useEffect(function () {
    if (showOnboarding) return
    loadFeed(0)
  }, [showOnboarding])

  function loadFeed(offset: number) {
    if (loadingRef.current) return
    loadingRef.current = true
    if (offset > 0) setLoadingMore(true)
    else setLoading(true)

    var params = new URLSearchParams({
      limit: '15',
      offset: String(offset),
      seed: String(sessionSeed.current),
    })
    if (onboardingTopics.length > 0) params.set('onboarding_topics', onboardingTopics.join(','))
    var sessionAff = sessionCtx.getSessionAffinityParam()
    if (sessionAff) params.set('session_affinity', sessionAff)
    if (categoryFilter) params.set('category', categoryFilter)
    // Panel-feedback (May 2026 — 4th round, Tier 2 personalization):
    // pass authed user_id so the server can read saved_reports +
    // thumbs_up/down feed_events to compute per-user category weights.
    // Anonymous users fall through to the existing onboarding-only path.
    if (user?.id) params.set('user_id', user.id)

    fetch('/api/discover/feed-v2?' + params.toString())
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data.items && data.items.length > 0) {
          if (offset === 0) {
            // V11.18.14 — SSR-bake. Splice the SSR-delivered FindingCard
            // + OnThisDateCard into the initial items array BEFORE the
            // setItems call, so the swipe component's snap-points are
            // calculated once from the complete array on first paint.
            // No more async-injection race. ClusterCard data flows via
            // feed-v2 (V11.18.13's data path) so no splice needed for
            // it here. LabPromo stays in fetchSpecialCards() because
            // its placement requires tier + should-show decisions
            // that can't run server-side.
            //
            // DESC-sorted splice so tail-first inserts don't perturb
            // earlier target indices in the same pass.
            var merged: ExtendedFeedItem[] = (data.items as ExtendedFeedItem[]).slice()
            var bakeSpecials: { card: ExtendedFeedItem; position: number }[] = []
            if (ssrOnThisDateDelivered.current && initialOnThisDate && !categoryFilter) {
              bakeSpecials.push({ card: initialOnThisDate, position: 1 })
            }
            if (ssrFindingDelivered.current && initialFinding && !categoryFilter) {
              // After OnThisDate at position 1 shifts everything right,
              // the Finding's effective render position becomes 5.
              // Splice index stays 4 — we want it to occupy index 4 in
              // the pre-otd array (it'll be at index 5 in the final).
              bakeSpecials.push({ card: initialFinding, position: 4 })
            }
            bakeSpecials.sort(function (a, b) { return b.position - a.position })
            bakeSpecials.forEach(function (s) {
              var pos = Math.min(s.position, merged.length)
              merged.splice(pos, 0, s.card)
            })

            if (typeof window !== 'undefined') {
              console.log('[Discover/SSR-bake] items_bake_complete', {
                base_len: data.items.length,
                final_len: merged.length,
                finding_idx: merged.findIndex(function (i) { return i.item_type === 'finding' }),
                otd_idx: merged.findIndex(function (i) { return i.item_type === 'on_this_date' }),
                cluster_idx: merged.findIndex(function (i) { return i.item_type === 'cluster' }),
                bake_specials: bakeSpecials.map(function (b) {
                  return { type: (b.card as any).item_type, position: b.position }
                }),
              })
            }
            setItems(merged)
          } else {
            setItems(function (prev) {
              var existingIds = new Set(prev.map(function (p) { return p.id }))
              var newItems = data.items.filter(function (item: ExtendedFeedItem) { return !existingIds.has(item.id) })
              return (prev as ExtendedFeedItem[]).concat(newItems)
            })
          }
          setFeedOffset(data.nextOffset || offset + data.items.length)
          setHasMore(data.hasMore)
          setTotalAvailable(data.totalAvailable || 0)
          if (offset === 0) {
            fetchSpecialCards()
          } else {
            // V11.18.2 — Sprint 1A polish. After each subsequent
            // pagination page lands, re-attempt insertion of any
            // pending special cards whose target position now fits.
            // Before this, promos with positions beyond the first
            // page (9 / 21 / 33 / 45 with cadence=12) were all
            // clamped to arr.length on the initial inject and
            // stacked back-to-back at the tail of page 1.
            injectPendingSpecialCards()
          }
        } else {
          setHasMore(false)
        }
      })
      .catch(function (err) { console.error('[Discover] Feed error:', err) })
      .finally(function () {
        setLoading(false)
        setLoadingMore(false)
        loadingRef.current = false
      })
  }

  // =========================================================================
  //  Special card injection (clusters, on-this-date, promo)
  //  Promo position is randomized within ±3 (panel review #15) and skipped
  //  entirely for Pro users or after 2 dismissals.
  // =========================================================================
  function fetchSpecialCards() {
    if (specialCardsInjected.current) return
    var fetches: Promise<void>[] = []

    // V9.0.1 — When a category filter is active, special-card endpoints
    // must honor it. Without this, on-this-date at position 1 could
    // inject a Lucid Dreaming card when the user is filtering Cryptids.
    // Cluster cards are cross-category by design (they connect across
    // multiple phenomena/categories) — when a single category is
    // selected, we suppress cluster injection entirely rather than
    // surface mixed-category content that breaks the filter.
    var catParam = categoryFilter ? '?category=' + encodeURIComponent(categoryFilter) : ''

    // V11.18.14 — SSR-bake. OnThisDate is now pre-fetched in
    // getServerSideProps and baked into the initial items[] array in
    // loadFeed(0). Skip the client fetch when SSR delivered the card
    // to avoid double-injection. Falls through to the client fetch
    // when SSR was empty (e.g. no phenomenon matches today's MM-DD)
    // or after lens/category/pull-to-refresh resets the SSR flag.
    if (ssrOnThisDateDelivered.current) {
      console.log('[Discover/OnThisDate] SSR-delivered — skipping client on-this-date fetch')
    } else {
      fetches.push(
        fetch('/api/discover/on-this-date' + catParam)
          .then(function (res) { return res.ok ? res.json() : null })
          .then(function (data) {
            if (data && data.items && data.items.length > 0) {
              // V7.5 — bumped position 2 → 1 so the on-this-date card
              // appears as the 2nd card the user swipes to (right after
              // the Today's Lead phenomenon). This makes the daily-
              // ritual hook discoverable on the first swipe rather than
              // the third.
              pendingSpecialCards.current.push({ card: data.items[0] as OnThisDateData, position: 1 })
            }
          })
          .catch(function () {})
      )
    }

    // V11.18.1 — Sprint 1A-2. Inject one Finding card at position 4.
    // Rotation is deterministic by day-of-year mod N(published) so
    // every user sees the same Finding on the same day (Helena rule —
    // no personalization in Sprint 1; that's Sprint 2 B4).
    // Suppress when a category filter is active (Findings are
    // cross-category by construction; surfacing one inside a
    // single-category lens would break the filter contract, same
    // reasoning as cluster injection).
    //
    // V11.18.3 — Sprint 1A polish round 2. Diagnostic logging added
    // because the founder swiped through ~30 cards post-V11.18.2 and
    // never saw the shadow_figure Finding. The live API returns 1
    // published row (verified via curl), so the most likely culprits
    // are (a) stale CDN/sw.js cache serving pre-V11.18.1 JS to the
    // founder's browser, (b) the fetch failing silently, or (c) the
    // injection landing but at a different idx than expected (the
    // onThisDate position-1 splice pushes the finding from idx 4 to
    // idx 5 — the 6th card swiped to). The first two surface here;
    // (c) is documented in SPRINT_1A_POLISH_R2_NOTES.md.
    // V11.18.10 — Sprint 1D SSR fix. Skip the client patterns/list fetch
    // entirely when getServerSideProps already pre-fetched today's
    // Finding and seeded it into pendingSpecialCards.current at mount.
    // Without this guard we'd double-inject (SSR finding + client
    // finding) and the day-of-year rotation pick could differ between
    // server tick and client tick if midnight UTC fell between renders.
    if (!categoryFilter && ssrFindingDelivered.current) {
      console.log('[Discover/FindingCard] SSR-delivered — skipping client patterns/list fetch')
    } else if (!categoryFilter) {
      fetches.push(
        fetch('/api/lab/patterns/list?limit=20')
          .then(function (res) {
            if (!res.ok) {
              console.warn('[Discover/FindingCard] patterns/list non-2xx:', res.status)
              return null
            }
            return res.json()
          })
          .then(function (data) {
            if (data && Array.isArray(data.findings) && data.findings.length > 0) {
              var available: any[] = data.findings
              var doy = dayOfYear(new Date())
              var pickIdx = doy % available.length
              var f: any = available[pickIdx]
              var findingCard: FindingFeedItem = Object.assign({}, f, { item_type: 'finding' as const })
              pendingSpecialCards.current.push({ card: findingCard, position: 4 })
              console.log('[Discover/FindingCard] injected', {
                available_count: available.length,
                doy: doy,
                pickIdx: pickIdx,
                slug: f && f.slug,
                id: f && f.id,
                position: 4,
              })
            } else {
              console.warn('[Discover/FindingCard] patterns/list returned no findings', {
                hasData: !!data,
                findings: data && data.findings,
              })
            }
          })
          .catch(function (err) {
            console.warn('[Discover/FindingCard] patterns/list threw:', err && err.message)
          })
      )
    } else {
      console.log('[Discover/FindingCard] suppressed — category filter active:', categoryFilter)
    }

    // Skip cluster injection when a category is active — clusters
    // intentionally cross categories and would break the topic-filter
    // contract.
    if (!categoryFilter) {
      fetches.push(
        fetch('/api/discover/clusters')
          .then(function (res) { return res.ok ? res.json() : null })
          .then(function (data) {
            if (data && data.clusters && data.clusters.length > 0) {
              // V11.17.41 — pick a cluster from the top-N using the
              // session seed so each session sees a different one
              // instead of the same "California UFOs" card every time.
              // The API returns up to 5 clusters sorted by report_count;
              // the operator flagged that always taking clusters[0]
              // made the feed feel static. Sessions with seed=N pick
              // clusters[N % available.length].
              var available = data.clusters as ClusterCardData[]
              var pickIdx = available.length > 1 ? sessionSeed.current % available.length : 0
              var clusterCard: ClusterCardData = Object.assign({}, available[pickIdx], { item_type: 'cluster' as const })
              pendingSpecialCards.current.push({ card: clusterCard, position: 8 })
            }
          })
          .catch(function () {})
      )
    }

    Promise.all(fetches).then(async function () {
      // V11.17.40 — Backlog #4 cadence + cap + cooldown. Tier gate
      // and legacy localStorage counter remain as the fast pre-check
      // (no network round-trip for known-skip users); the server-side
      // decision adds the 6/week hard cap + 48h dismiss + 7d paywall
      // cooldowns on top.
      var tierSkip = userTier === 'pro' || userTier === 'enterprise'
      // V11.18.13 → V11.18.15 — `?preview_labpromo=1` lets founder/
      // designer QA the Today-variant LabPromo without juggling
      // a Free-tier session.
      //
      // V11.18.13 first attempted this by flipping `tierSkip` from
      // true → false, but the founder reported it still didn't render.
      // Diagnosis: the override fed back into the normal pipeline, so
      // FOUR independent gates still applied:
      //   1. `legacySkip` (`getPromoDismissals() >= 2`) — once the
      //      founder dismissed the promo twice, the localStorage
      //      counter suppressed it even when the preview flag was on.
      //   2. `/api/lab/promo/should-show` returns `should_show: false`
      //      whenever the 6/week server-side cap is hit, a 48h dismiss
      //      cooldown is active, or a 7d paywall cooldown is active.
      //   3. Even on `should_show: true`, `firstPos = max(8, cadence +
      //      jitter)` puts the promo at index ≥8, and on a 6-12 card
      //      first page that overshoots `arr.length`, so the splice
      //      path defers it to a later loadMore() — invisible without
      //      heavy scrolling.
      //   4. SSR-bake of V11.18.14 moved OnThisDate + Finding into the
      //      initial items[] array. LabPromo stayed in
      //      fetchSpecialCards() (client-side) which runs after the
      //      first paint, so any late deferral is doubly painful.
      //
      // V11.18.15 fix: when the preview flag is set, skip every gate
      // and inject ONE LabPromo card at a fixed early position (5)
      // so the founder sees it within the first swipes. Normal
      // (non-preview) navigations are completely unaffected; the
      // entire production branch below sits in `else if`.
      var previewLabPromo = router.query.preview_labpromo === '1'
      var legacySkip = getPromoDismissals() >= 2
      if (previewLabPromo) {
        console.log('[Discover/LabPromo] preview override — force-injecting at position 5, bypassing tier/legacy/should-show/cadence/cap gates')
        var previewCard: PromoCardData = {
          item_type: 'promo',
          id: 'promo-lab-preview',
          promo_type: 'research_hub',
        }
        pendingSpecialCards.current.push({ card: previewCard, position: 5 })
      } else if (!tierSkip && !legacySkip) {
        try {
          var decision = await fetchLabPromoShouldShow()
          if (decision.should_show) {
            var cadence = decision.cadence
            // Slight ±3 jitter to the first placement so two adjacent
            // sessions don't both put the promo at the same index.
            var jitter = (sessionSeed.current % 7) - 3   // -3..+3
            var firstPos = Math.max(8, cadence + jitter)
            for (var k = 0; k < PROMO_SESSION_PLACEMENTS; k++) {
              var promoPos = firstPos + (k * cadence)
              var promoCard: PromoCardData = {
                item_type: 'promo',
                id: 'promo-lab-' + (k + 1),
                promo_type: 'research_hub',
              }
              pendingSpecialCards.current.push({ card: promoCard, position: promoPos })
            }
          }
        } catch (_e) {
          // Network fail → fall back to legacy single-position behavior.
          var fbJitter = (sessionSeed.current % 7) - 3
          var fbPos = Math.max(11, 14 + fbJitter)
          var fbCard: PromoCardData = {
            item_type: 'promo',
            id: 'promo-lab-fallback',
            promo_type: 'research_hub',
          }
          pendingSpecialCards.current.push({ card: fbCard, position: fbPos })
        }
      }
      // Sort descending so splice-by-index from the tail doesn't
      // perturb earlier indices in the same pass.
      pendingSpecialCards.current.sort(function (a, b) { return b.position - a.position })

      // V11.18.2 — Sprint 1A polish. Delegate to the shared injector
      // so loadMore can re-run insertion on each subsequent page.
      injectPendingSpecialCards()
    })
  }

  // V11.18.2 — Sprint 1A polish. Shared injection routine, called once
  // from fetchSpecialCards() after the initial promo decisions land and
  // again from loadFeed() after every pagination page. The behavior
  // change versus pre-V11.18.2 is critical: instead of clamping every
  // pending position to arr.length (which caused 3 promos targeted at
  // 21/33/45 to stack at the tail of page 1 when arr.length was ~12),
  // we now insert ONLY the promos whose target position fits within the
  // current array, and leave the rest in pendingSpecialCards.current
  // for the next loadMore. specialCardsInjected.current flips to true
  // only when nothing is pending.
  function injectPendingSpecialCards() {
    if (pendingSpecialCards.current.length === 0) {
      // Nothing to insert this tick. Don't flip the injected flag —
      // the fetchSpecialCards Promise.all may still be in flight on
      // initial load, and would call us again with real entries. The
      // flag flips only when we've actually drained the pending list
      // to zero in the splice path below.
      return
    }
    setItems(function (prev) {
      var arr = (prev as ExtendedFeedItem[]).slice()
      // Sorted DESC by position so we splice tail-first without
      // invalidating earlier target indices in the same pass.
      var remaining: { card: ExtendedFeedItem; position: number }[] = []
      var inserted: { type: string; position: number }[] = []
      pendingSpecialCards.current.forEach(function (entry) {
        if (entry.position <= arr.length) {
          arr.splice(entry.position, 0, entry.card)
          inserted.push({ type: (entry.card as any).item_type || 'unknown', position: entry.position })
        } else {
          remaining.push(entry)
        }
      })
      pendingSpecialCards.current = remaining
      specialCardsInjected.current = (remaining.length === 0)
      // V11.18.3 — Sprint 1A polish round 2 diagnostic. The founder
      // reported the FindingCard never appearing; this log surfaces the
      // injection outcome (inserted vs deferred) on each call so the
      // operator can confirm via DevTools whether the finding entry
      // actually lands in `inserted` on the initial loadFeed(0) tick.
      console.log('[Discover/inject] tick', {
        arr_in_len: arr.length - inserted.length,
        arr_out_len: arr.length,
        inserted: inserted,
        deferred: remaining.map(function (r) { return { type: (r.card as any).item_type, position: r.position } }),
        all_injected: specialCardsInjected.current,
      })
      return arr
    })
  }

  // =========================================================================
  //  Fetch related cards for rabbit hole
  // =========================================================================
  useEffect(function () {
    if (displayItems.length === 0) return
    var activeItem = displayItems[idx]
    if (!activeItem) return
    if (activeItem.item_type !== 'phenomenon' && activeItem.item_type !== 'report') return
    if (relatedCache[activeItem.id] || relatedLoadingRef.current[activeItem.id]) return

    relatedLoadingRef.current[activeItem.id] = true
    var url = '/api/discover/related-cards?id=' + encodeURIComponent(activeItem.id) + '&type=' + encodeURIComponent(activeItem.item_type)
    fetch(url)
      .then(function (res) { return res.ok ? res.json() : null })
      .then(function (data) {
        if (data && data.items && data.items.length > 0) {
          setRelatedCache(function (prev) {
            var next: Record<string, FeedItemV2[]> = {}
            Object.keys(prev).forEach(function (k) { next[k] = prev[k] })
            next[activeItem.id] = data.items
            return next
          })
        }
      })
      .catch(function () {})
      .finally(function () { relatedLoadingRef.current[activeItem.id] = false })
  }, [idx, displayItems.length])

  // =========================================================================
  //  Behavioral tracking + auto-expand on dwell (A/B variant)
  // =========================================================================
  useEffect(function () {
    if (displayItems.length === 0) return
    var item = displayItems[idx]
    if (!item) return

    feedEvents.trackImpression(item.id, item.item_type, (item as any).category || '')
    dwellStartRef.current = Date.now()

    if (idx > maxSeen) setMaxSeen(idx)

    sessionCtx.recordImpression()
    gateStatus.updateSessionDepth(sessionCtx.sessionDepth)

    if (idx >= displayItems.length - 5 && hasMore && !loadingRef.current) {
      loadFeed(feedOffset)
    }

    // Auto-expand on dwell intentionally NOT firing here — see comment above
    // the autoExpandTimer ref declaration.

    return function () {
      var duration = Date.now() - dwellStartRef.current
      if (item) feedEvents.trackDwell(item.id, item.item_type, (item as any).category || '', duration)
      // V11.17.38 — mark as "seen" only after meaningful dwell
      // (>1500ms). Bare swipe-bys aren't tracked so a user who flicks
      // past a card can still find it on the next visit. We don't
      // bump the seen-version state here — the next mount picks it
      // up from localStorage, which is the case we care about.
      if (item && item.id && item.item_type === 'report' && duration >= 1500) {
        markSeen(item.id)
      }
      if (autoExpandTimer.current) {
        clearTimeout(autoExpandTimer.current)
        autoExpandTimer.current = null
      }
    }
  }, [idx, displayItems.length, rabbitOpen, detailCard, expanded])

  // Dismiss promo bump on first promo encounter (so re-rendering doesn't re-bump)
  useEffect(function () {
    var item = displayItems[idx]
    if (item && item.item_type === 'promo') {
      // No bump on view; only on explicit dismiss via swipe-left
    }
  }, [idx, displayItems])

  // Signup gate at card 6
  useEffect(function () {
    if (!user && !signupDismissed && idx === 5) setShowSignupPrompt(true)
  }, [idx, user, signupDismissed])

  // =========================================================================
  //  Gesture: flash label
  // =========================================================================
  function flash(label: string) {
    setFeedbackLabel(label)
    setTimeout(function () { setFeedbackLabel(null) }, 1100)
  }

  // =========================================================================
  //  Save / dismiss / more-like-this actions
  // =========================================================================
  function doSave(item: ExtendedFeedItem) {
    // Only reports + phenomena are persistable.
    if (item.item_type !== 'report' && item.item_type !== 'phenomenon') {
      flash('Skipped')
      return
    }
    // V4 QA: bookmark is a toggle now. If already saved, this unsaves.
    var alreadySaved = saves.isSaved(item.id)
    if (alreadySaved) {
      saves.removeSave(item.id, item.item_type)
      haptic(20)
      flash('Unsaved')
      return
    }
    saves.persistSave(item.id, item.item_type)
    feedEvents.trackSave(item.id, item.item_type, (item as any).category || '')
    if (item.item_type === 'report' && item.id) markSeen(item.id)  // V11.17.38 dedup
    haptic(35)
    flash('✦ Saved')
    // Save → Lab celebration loop. Every 5 saves shows a transient toast.
    var nextCount = saveCountRef.current + 1
    saveCountRef.current = nextCount
    if (nextCount > 0 && nextCount % 5 === 0) {
      var catLabel = (item as any).category
        ? CATEGORY_CONFIG[(item as any).category as keyof typeof CATEGORY_CONFIG]?.label
        : null
      var msg = catLabel
        ? 'You’re building a ' + catLabel + ' archive — ' + nextCount + ' cases saved'
        : nextCount + ' cases saved — visit Lab to organize'
      setCelebrationToast(msg)
      setTimeout(function () { setCelebrationToast(null) }, 4000)
    }

    // V9.4.8 — first-save trigger for the push notification opt-in
    // pre-prompt. Per panel: this is the single highest-intent moment
    // for the ask. Fires once per browser/device via localStorage
    // gate. Defers ~700ms so the bookmark-fill animation lands first
    // (the user "feels the save" before the prompt appears).
    if (nextCount === 1 && shouldAutoShowPrePrompt()) {
      var sampleTitle = (item.item_type === 'phenomenon')
        ? ((item as any).name || null)
        : ((item as any).title || null)
      var sampleBody = (item as any).push_copy
        || (item as any).anchor_case_hook
        || (item as any).feed_hook
        || null
      // Strip sentinel
      if (sampleBody && typeof sampleBody === 'string' && sampleBody.substring(0, 2) === '__') {
        sampleBody = null
      }
      setPushPromptSample({
        title: sampleTitle || 'Shadow Person',
        body: sampleBody || 'Since 1950s: 9,675 witnesses across continents report identical dark humanoid figures.',
      })
      setTimeout(function () { setShowPushPrompt(true) }, 700)
    }
  }

  function haptic(ms: number) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { (navigator as any).vibrate(ms) } catch (_) {}
    }
  }

  function doDismiss(item: ExtendedFeedItem) {
    feedEvents.trackDismiss(item.id, item.item_type, (item as any).category || '')
    if (item.item_type === 'promo') {
      bumpPromoDismissals()
      // V11.17.40 — server-side 48h dismiss cooldown. Fire-and-forget.
      logLabPromoEvent('dismissed', { promo_id: item.id }).catch(function () {})
    }
    haptic(15)
    flash('Dismissed')
  }

  function doMoreLikeThis(item: ExtendedFeedItem) {
    // Track as a separate event_type so server-side affinity can weight higher
    // than dwell/save. The useFeedEvents hook is event-type-agnostic, but the
    // server endpoint at /api/events/feed accepts arbitrary event_type strings.
    if ((feedEvents as any).trackMoreLike) {
      (feedEvents as any).trackMoreLike(item.id, item.item_type, (item as any).category || '')
    } else {
      // Fallback path: emit as save with metadata flag (server can split later)
      feedEvents.trackSave(item.id, item.item_type, (item as any).category || '')
    }
    if ((item as any).category) sessionCtx.recordTap((item as any).category)
    setHeartPulse(true)
    setTimeout(function () { setHeartPulse(false) }, 900)
    haptic(50)
    flash('♡ More like this')
  }

  // =========================================================================
  //  Gesture: next / prev
  // =========================================================================
  var nextCard = useCallback(function () {
    if (animating.current || idx >= displayItems.length - 1 + 1) {
      // Allow advancing to the synthetic end-of-feed slot when no more items
      if (idx >= displayItems.length - 1 && !hasMore) {
        setIdx(function (i) { return i + 1 })
      }
      return
    }
    animating.current = true
    setSwipeAnim('up')
    setExpanded(false)
    setTimeout(function () {
      setIdx(function (i) { return i + 1 })
      setSwipeAnim(null)
      animating.current = false
    }, 230)
  }, [idx, displayItems.length, hasMore])

  var prevCard = useCallback(function () {
    if (animating.current || idx <= 0) return
    animating.current = true
    setSwipeAnim('down')
    setExpanded(false)
    setTimeout(function () {
      setIdx(function (i) { return Math.max(0, i - 1) })
      setSwipeAnim(null)
      animating.current = false
    }, 230)
  }, [idx])

  // =========================================================================
  //  Touch handlers — gated on `expanded` (panel review fix)
  // =========================================================================
  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (expanded || rabbitOpen || detailCard) return
    if (!e.touches || e.touches.length === 0) return
    var t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() }
    // V5-next: pull-to-refresh — only enabled at idx=0 + body scrolled to top.
    if (idx === 0) {
      pullStartRef.current = t.clientY
    } else {
      pullStartRef.current = null
    }
    // Long-press → "More like this". CRITICAL: timer must NOT null out
    // touchStart.current — the original implementation did, which broke
    // any swipe that took longer than 600ms (slow horizontal swipes,
    // re-grip mid-swipe, etc.). Now the timer just fires the more-like-
    // this action; touchend still sees touchStart and decides if it was
    // a swipe vs a held tap based on movement distance.
    var longPressFired = { v: false }
    longPressFiredRef.current = longPressFired
    var item = displayItems[idx]
    if (item && (item.item_type === 'phenomenon' || item.item_type === 'report')) {
      longPressTimer.current = setTimeout(function () {
        // Only fire if the user genuinely held still (handleTouchMove
        // would have cleared this timer if they moved >8px).
        longPressFired.v = true
        doMoreLikeThis(item)
      }, 600)
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStart.current) return
    if (!e.touches || e.touches.length === 0) return
    var t = e.touches[0]
    var dx = Math.abs(t.clientX - touchStart.current.x)
    var dy = Math.abs(t.clientY - touchStart.current.y)
    // 6px threshold — slightly more forgiving on iOS where the first
    // touchmove can fire after only a few pixels of motion.
    if (dx > 6 || dy > 6) clearLongPress()
    // Pull-to-refresh: only at idx=0 with downward motion
    if (pullStartRef.current !== null && idx === 0) {
      var pullDy = t.clientY - pullStartRef.current
      if (pullDy > 0) {
        // Resistance curve so the rubber-band feel is preserved
        var resisted = Math.min(120, pullDy * 0.4)
        setPullDistance(resisted)
      }
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    clearLongPress()
    if (!touchStart.current || expanded || rabbitOpen || detailCard) return
    if (!e.changedTouches || e.changedTouches.length === 0) {
      touchStart.current = null
      return
    }
    var dx = e.changedTouches[0].clientX - touchStart.current.x
    var dy = e.changedTouches[0].clientY - touchStart.current.y
    var firedLong = longPressFiredRef.current ? longPressFiredRef.current.v : false
    touchStart.current = null

    // Pull-to-refresh trigger
    if (pullStartRef.current !== null && pullDistance >= 80) {
      pullStartRef.current = null
      setPullDistance(0)
      setRefreshing(true)
      haptic(40)
      // Reset and reload
      sessionSeed.current = Math.floor(Math.random() * 2147483647)
      setItems([])
      setIdx(0)
      setFeedOffset(0)
      setHasMore(true)
      specialCardsInjected.current = false
      pendingSpecialCards.current = []
      // V11.18.10 — pull-to-refresh re-runs loadFeed but NOT
      // getServerSideProps, so we drop back to the client patterns/list
      // fetch path. Without clearing this, the post-refresh feed would
      // silently lose its FindingCard.
      // V11.18.14 — same reset for OnThisDate.
      ssrFindingDelivered.current = false
      ssrOnThisDateDelivered.current = false
      setTimeout(function () {
        loadFeed(0)
        setTimeout(function () { setRefreshing(false) }, 600)
      }, 0)
      return
    }
    pullStartRef.current = null
    if (pullDistance > 0) setPullDistance(0)

    // If the long-press already fired ("More like this"), don't ALSO trigger
    // a save/dismiss on the same touchend — but still allow vertical-swipe
    // navigation if the motion was big.
    if (firedLong && Math.abs(dx) < 60 && Math.abs(dy) < 60) return

    var SWIPE_THRESHOLD = 35  // was 50 — more forgiving for short flicks
    if (Math.abs(dy) > Math.abs(dx)) {
      // V10.7.E.18 — TikTok-style vertical nav. Swipe down used to
      // open the rabbit-hole panel, which buried backward navigation
      // entirely — users who accidentally swiped past a card couldn't
      // recover. New model matches every short-form video feed users
      // already have muscle memory for: up = next, down = previous.
      // Rabbit-hole panel now opens via the dedicated button next to
      // the card action strip (and remains visible as the desktop
      // right-rail at lg+).
      if (dy < -SWIPE_THRESHOLD) nextCard()
      else if (dy > SWIPE_THRESHOLD) prevCard()
    } else {
      if (Math.abs(dx) < SWIPE_THRESHOLD) return
      var item = displayItems[idx]
      if (!item) return
      if (dx < 0) {
        doDismiss(item)
        nextCard()
      } else {
        doSave(item)
      }
    }
  }

  // =========================================================================
  //  Mouse wheel (desktop)
  // =========================================================================
  function handleWheel(e: React.WheelEvent) {
    if (rabbitOpen || detailCard || expanded) return
    if (e.deltaY > 35) nextCard()
    if (e.deltaY < -35) prevCard()
  }

  // =========================================================================
  //  Keyboard navigation
  // =========================================================================
  useEffect(function () {
    function handleKey(e: KeyboardEvent) {
      if (rabbitOpen || detailCard) return
      if (expanded && e.key !== 'Escape') return
      if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'w' || e.key === 'W') {
        e.preventDefault(); prevCard()
      } else if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 's' || e.key === 'S' || e.key === ' ') {
        e.preventDefault(); nextCard()
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        var dItem = displayItems[idx]
        if (dItem) doDismiss(dItem)
        nextCard()
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        var sItem = displayItems[idx]
        if (sItem) doSave(sItem)
      } else if (e.key === 'h' || e.key === 'H') {
        // "More like this"
        e.preventDefault()
        var hItem = displayItems[idx]
        if (hItem) doMoreLikeThis(hItem)
      } else if (e.key === 'Enter') {
        e.preventDefault(); setExpanded(true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (expanded) setExpanded(false)
        else if (rabbitOpen) setRabbitOpen(false)
      } else if (e.key === '?') {
        setShowShortcuts(function (v) { return !v })
      }
    }
    window.addEventListener('keydown', handleKey)
    return function () { window.removeEventListener('keydown', handleKey) }
  }, [idx, displayItems.length, expanded, rabbitOpen, detailCard, nextCard, prevCard])

  // =========================================================================
  //  Onboarding handler
  // =========================================================================
  function handleOnboardingComplete(topics: string[]) {
    setOnboardingTopics(topics)
    setShowOnboarding(false)
    if (!isGestureTutorialComplete()) setShowTutorial(true)
  }

  function handleTutorialComplete() {
    setShowTutorial(false)
  }

  // =========================================================================
  //  Card tap handler
  // =========================================================================
  function handleCardTap(item: ExtendedFeedItem) {
    feedEvents.trackTap(item.id, item.item_type, (item as any).category || '')
    if ((item as any).category) sessionCtx.recordTap((item as any).category)
    // V11.17.38 — explicit engagement = seen.
    if (item.item_type === 'report' && item.id) markSeen(item.id)
  }

  // =========================================================================
  //  Build rabbit hole cards from related cache
  // =========================================================================
  function getRabbitHoleCards(): RabbitHoleCard[] {
    var card = displayItems[idx]
    if (!card) return []
    var related = relatedCache[card.id] || []
    return related.map(function (r) {
      var isP = r.item_type === 'phenomenon'
      var p = r as PhenomenonItem
      var rep = r as ReportItem
      var cat = (r as any).category || ''
      var catColor = CATEGORY_COLORS[cat] || '#b39ddb'

      var location = ''
      var year = ''
      var tag = ''
      var headline = ''
      var summary = ''
      var credibility: string[] = []

      if (isP) {
        location = p.primary_regions ? p.primary_regions[0] || '' : ''
        var ym = p.first_reported_date ? (p.first_reported_date.match(/\d{4}/) || [''])[0] : ''
        year = ym
        headline = p.feed_hook || p.ai_summary || p.name
        summary = p.ai_summary || p.ai_description || ''
        if (p.ai_quick_facts?.classification) credibility.push(p.ai_quick_facts.classification)
        if (p.report_count > 5) credibility.push(p.report_count + ' reports')
      } else {
        var lp: string[] = []
        if (rep.city) lp.push(rep.city)
        if (rep.state_province) lp.push(rep.state_province)
        location = lp.join(', ') || rep.country || ''
        year = rep.event_date ? (rep.event_date.match(/\d{4}/) || [''])[0] : ''
        tag = rep.source_type || ''
        headline = rep.feed_hook || rep.summary || rep.title
        summary = rep.summary || ''
        if (rep.has_photo_video) credibility.push('Photo/Video')
        if (rep.has_physical_evidence) credibility.push('Physical Evidence')
      }

      return {
        id: r.id, slug: (r as any).slug || r.id, item_type: r.item_type,
        category: cat, categoryColor: catColor,
        location: location, year: year, tag: tag,
        headline: headline, summary: summary, credibility: credibility,
      }
    })
  }

  // =========================================================================
  //  Current card state
  // =========================================================================
  var card = displayItems[idx]
  var atEndOfFeed = !card && !hasMore && displayItems.length > 0
  var catColor = card ? CATEGORY_COLORS[(card as any).category || ''] || '#b39ddb' : '#b39ddb'

  var setShowSignupPromptCb = useCallback(function (show: boolean) {
    setShowSignupPrompt(show)
  }, [])

  function handleCollapse() { setExpanded(false) }

  // Tap-to-expand wrapper that also triggers the first-run Collapse tooltip
  function handleExpand() {
    setExpanded(true)
    haptic(20)
    maybeShowCollapseTip()
  }

  // Native OS share for the current card
  function handleShare(item: ExtendedFeedItem) {
    var origin = (typeof window !== 'undefined') ? window.location.origin : ''
    var slug = (item as any).slug
    if (!slug) return
    var path = item.item_type === 'phenomenon' ? '/phenomena/' : '/report/'
    var url = origin + path + slug
    var title = (item as any).name || (item as any).title || 'Paradocs case'
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        (navigator as any).share({ title: title, url: url }).catch(function () {})
      } catch (_) {}
    } else if (typeof navigator !== 'undefined' && (navigator as any).clipboard) {
      try {
        (navigator as any).clipboard.writeText(url)
        flash('Link copied')
      } catch (_) {}
    }
  }

  // "Why you're seeing this" copy generation
  function whyReasonFor(item: ExtendedFeedItem): string | null {
    if (!item) return null
    var cat = (item as any).category
    if (!cat) return null
    var catLabel = CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG]?.label || cat
    if (onboardingTopics.indexOf(cat) >= 0) {
      return 'Because you picked ' + catLabel + ' during onboarding.'
    }
    if (sessionCtx.sessionDepth >= 3) {
      return 'Trending in ' + catLabel + ' this week — surfaced based on engagement.'
    }
    return 'Recently added to ' + catLabel + '.'
  }

  // Color of the next card (for the bottom peek strip)
  function nextCatColorFor(): string | null {
    var next = displayItems[idx + 1]
    if (!next) return null
    var c = (next as any).category
    if (!c) return null
    return CATEGORY_COLORS[c] || null
  }

  // Handle View Full Report / Case clicks → set return marker
  useEffect(function () {
    function onLinkClick(e: MouseEvent) {
      var target = e.target as HTMLElement
      var anchor = target.closest('a') as HTMLAnchorElement | null
      if (!anchor || !anchor.href) return
      var href = anchor.getAttribute('href') || ''
      if (href.indexOf('/report/') === 0 || href.indexOf('/phenomena/') === 0) {
        setTodayReturnMarker(idx, totalAvailable || displayItems.length)
      }
    }
    document.addEventListener('click', onLinkClick)
    return function () { document.removeEventListener('click', onLinkClick) }
  }, [idx, totalAvailable, displayItems.length])

  // =========================================================================
  //  Render card by type
  // =========================================================================
  function renderCardContent() {
    if (atEndOfFeed) return <EndOfFeedCard cardsSeen={Math.max(idx, maxSeen, displayItems.length)} user={user} />
    if (!card) return null
    // V11.18.9 — render-entry diagnostic. The V11.18.8 finding-branch
    // log only fires when card.item_type === 'finding'. If a card with a
    // surprising item_type (e.g. undefined or a typo) is reaching render,
    // it would silently fall through every branch and render `null`. This
    // log surfaces every card the render function sees so the operator
    // can confirm in DevTools exactly which item_type lands at idx N.
    if (typeof window !== 'undefined') {
      console.log('[Discover/render-entry]', {
        idx: idx,
        item_type: (card as any).item_type,
        id: card.id,
        slug: (card as any).slug || null,
      })
    }

    if (card.item_type === 'cluster') return <ClusteringCard item={card as ClusterCardData} isActive={true} />
    if (card.item_type === 'on_this_date') return <OnThisDateCard item={card as OnThisDateData} isActive={true} />
    if (card.item_type === 'promo') return <LabPromo isActive={true} />
    if (card.item_type === 'finding') {
      // V11.18.1 — Sprint 1A-2. FindingCard as a Today special card.
      // Third-person archival voice; hairline purple top + bottom
      // borders distinguish it from report cards per V2 cross-surface
      // decision. The card itself links to the Finding detail page
      // (V11.18.8 — was: a representative report).
      //
      // V11.18.8 — Sprint 1D fixes. Render-branch diagnostic. The
      // founder reported the FindingCard never appearing despite the
      // V11.18.3 inject log confirming the card landed in the array
      // at the expected position. This log fires every time a render
      // attempt reaches the finding branch, so DevTools can confirm
      // the card actually paints (vs. silently failing inside the
      // card itself or being stripped by a downstream filter).
      var findingCardData = card as FindingCardData
      console.log('[FindingCard render]', {
        slug: findingCardData.slug,
        position: idx,
        variant: 'today_card',
        headline_preview: (findingCardData.headline || '').slice(0, 60),
      })
      return <FindingCard finding={findingCardData} variant="today_card" isActive={true} />
    }

    if (card.item_type === 'report' && gateStatus.status.isViewGated) {
      var reportItem = card as ReportItem
      return (
        <CaseViewGate
          category={reportItem.category}
          locationName={reportItem.location_name}
          linkedCount={reportItem.phenomenon_type ? 1 : 0}
          connectionCount={0}
          sessionDepth={sessionCtx.sessionDepth}
        />
      )
    }

    var why = whyReasonFor(card)
    var nextColor = nextCatColorFor()
    var leadFlag = idx === 0  // first card of the session = "Today's Lead"
    var saveCb = function () { doSave(card) }
    var shareCb = function () { handleShare(card) }
    var savedNow = saves.isSaved(card.id)

    if (card.item_type === 'phenomenon') {
      return (
        <PhenomenonCard
          item={card as PhenomenonItem} index={idx} isActive={true}
          expanded={expanded} onExpand={handleExpand}
          onCollapse={handleCollapse}
          user={user} onShowSignup={setShowSignupPromptCb}
          isSaved={savedNow} onSave={saveCb} onShare={shareCb}
          isTodaysLead={leadFlag} streakDays={streakDays} whyReason={why} nextCatColor={nextColor}
          isAnonymous={!user?.id} signInNudgeDismissed={nudgeDismissed} onSignInNudgeDismiss={handleNudgeDismiss}
        />
      )
    }

    var report = card as ReportItem
    // Panel-feedback (May 2026 — 7th round): when the report has an
    // approved user-submitted video (has_video + signed playback URL
    // joined by feed-v2), render the TikTok-style VideoReportCard
    // instead of the inline-embed treatment. Falls through to the
    // standard text/media branches when no video is attached.
    if (report.has_video && report.video?.playback_url) {
      return (
        <VideoReportCard
          item={report} index={idx} isActive={true}
          expanded={expanded} onExpand={handleExpand}
          onCollapse={handleCollapse}
          user={user} onShowSignup={setShowSignupPromptCb}
          isSaved={savedNow} onSave={saveCb} onShare={shareCb}
        />
      )
    }
    if (report.has_photo_video) {
      return (
        <MediaReportCard
          item={report} index={idx} isActive={true}
          expanded={expanded} onExpand={handleExpand}
          onCollapse={handleCollapse}
          user={user} onShowSignup={setShowSignupPromptCb}
          isSaved={savedNow} onSave={saveCb} onShare={shareCb}
          isTodaysLead={leadFlag} streakDays={streakDays} whyReason={why} nextCatColor={nextColor}
          isAnonymous={!user?.id} signInNudgeDismissed={nudgeDismissed} onSignInNudgeDismiss={handleNudgeDismiss}
        />
      )
    }
    return (
      <TextReportCard
        item={report} index={idx} isActive={true}
        expanded={expanded} onExpand={handleExpand}
        onCollapse={handleCollapse}
        user={user} onShowSignup={setShowSignupPromptCb}
        isSaved={savedNow} onSave={saveCb} onShare={shareCb}
        isTodaysLead={leadFlag} streakDays={streakDays} whyReason={why} nextCatColor={nextColor}
      />
    )
  }

  var rabbitHoleCards = getRabbitHoleCards()
  var totalForCounter = totalAvailable > 0 ? totalAvailable : displayItems.length

  // Loading state — skeleton card instead of generic spinner
  if (loading && !showOnboarding && displayItems.length === 0) {
    return (
      <>
        <Head><title>Today — Paradocs</title></Head>
        <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 4rem)' }}>
          <TodayHeader
            idx={0} total={0} lens={lens} category={categoryFilter}
            onLensChange={handleLensChange} onCategoryChange={handleCategoryChange}
            feedbackLabel={null}
            showShortcutsToggle={false}
          />
          <div className="flex-1 px-5 sm:px-6 md:px-8 lg:px-10 py-6 max-w-2xl mx-auto w-full">
            <SkeletonCard />
          </div>
        </div>
      </>
    )
  }

  // Contextual signup prompt copy
  function signupPromptBody() {
    var anchor = displayItems[idx] as any
    var cat = anchor && anchor.category ? CATEGORY_CONFIG[anchor.category as keyof typeof CATEGORY_CONFIG]?.label : null
    var loc = anchor && (anchor.location_name || anchor.city || (anchor.primary_regions && anchor.primary_regions[0])) || null
    if (cat && loc) return 'You’ve been reading about ' + cat + ' near ' + loc + '. Save this — and the four other ' + cat + ' cases you just passed — for free.'
    if (cat) return 'You’ve been reading about ' + cat + '. Create a free account to save what you find and personalize Today.'
    return 'Create a free account to save entries, get personalized recommendations, and submit your own sightings.'
  }

  return (
    <>
      <Head>
        <title>Today — Paradocs</title>
        <meta name="description" content="Today on Paradocs — scroll through the world's most fascinating paranormal phenomena and firsthand reports. Cryptids, UFOs, ghosts, and unexplained events." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      {showOnboarding && (
        <TopicOnboarding onComplete={handleOnboardingComplete} userId={user?.id} />
      )}
      {!showOnboarding && showTutorial && (
        <GestureTutorial onComplete={handleTutorialComplete} />
      )}

      <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 4rem)' }}>
        {/* V11.18.x — 200K catalogued-accounts eyebrow per
            UI_SHIPPING_ROADMAP_V2 Sprint 1A additions. Sits above
            the TodayHeader. */}
        <CorpusStatEyebrow />
        {/* Today header — replaces the old counter strip */}
        <TodayHeader
          idx={idx}
          total={totalForCounter}
          lens={lens}
          category={categoryFilter}
          onLensChange={handleLensChange}
          onCategoryChange={handleCategoryChange}
          feedbackLabel={feedbackLabel}
          showShortcutsToggle={true}
          onToggleShortcuts={function () { setShowShortcuts(function (v) { return !v }) }}
          streakDays={streakDays}
          /* V11.18.x — removed per UI_SHIPPING_ROADMAP_V2 Sprint 1A deletes
             (in-Today search overlay + desktop grid toggle). The header
             search lives in the global chrome; in-Today search is gone. */
        />

        {/* Main content
            V10.7.E.23 — explicit max-height on the row so the
            Connected Cases sidebar (whose stacked cards can total
            ~800px) doesn't force the row to grow taller than the
            available viewport. Without this cap, the row stretches
            to fit the sidebar content, the card pane's auto-margin
            centering pushes the card downward (off-screen on
            shorter laptop windows), and the in-card CTA disappears
            below the fold. The sidebar's inner div already has
            overflow-y-auto so capping the row doesn't lose content;
            it just lets the sidebar scroll internally when needed.
            On mobile (<lg) the sidebar is hidden so the cap is
            a no-op; we gate it lg+ to be safe regardless. */}
        <div className="flex-1 flex lg:max-h-[calc(100vh-6.5rem)]">
          {/* Card pane — V5-next: height-capped at md+ via today-card-pane-cap. */}
          <div
            className="flex-1 relative overflow-hidden cursor-grab lg:max-w-2xl lg:mx-auto xl:mx-auto xl:max-w-3xl today-card-pane-cap"
            style={{ touchAction: 'pan-y', overscrollBehavior: 'none' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            {/* Pull-to-refresh indicator (V5-next) — visible only when at
                idx=0 and the user is dragging down. Spinner appears once
                the threshold is reached. */}
            {(pullDistance > 0 || refreshing) && (
              <div
                className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center pointer-events-none"
                style={{
                  height: refreshing ? 60 : pullDistance,
                  transition: refreshing ? 'height 200ms' : 'none',
                }}
              >
                <div
                  className={
                    'w-7 h-7 rounded-full border-2 border-primary-400 border-t-transparent ' +
                    (refreshing ? 'animate-spin' : '')
                  }
                  style={{
                    opacity: Math.min(1, pullDistance / 80) || 1,
                    transform: 'rotate(' + (refreshing ? 0 : pullDistance * 3) + 'deg)',
                  }}
                />
              </div>
            )}
            {/* Category accent stripe */}
            <div
              className="absolute left-0 top-0 bottom-0 w-[3px] opacity-50 z-10 transition-colors duration-400"
              style={{ background: catColor }}
            />

            {/* Main card area — viewport-fit (V2 panel review). The
                TodayCardShell handles its own internal padding + sticky CTA;
                we just provide the positioning context + swipe transform.
                Transform is suppressed when prefers-reduced-motion is on. */}
            <div
              className="absolute inset-0 transition-all duration-200 motion-reduce:transition-none"
              style={{
                transform: swipeAnim === 'up' ? 'translateY(-52px)' : swipeAnim === 'down' ? 'translateY(52px)' : 'translateY(0)',
                opacity: swipeAnim ? 0 : 1,
              }}
            >
              {/* Zero-result lens empty state — V2 panel review #5 */}
              {!loading && displayItems.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="text-5xl mb-4 opacity-40">{'⊘'}</div>
                  <h2 className="text-lg font-display font-semibold text-white mb-2">
                    {'No cases match this view'}
                  </h2>
                  <p className="text-sm text-gray-400 font-sans max-w-sm mb-6">
                    {lens === 'on-this-date'
                      ? 'Nothing in our archive matches today’s date. Try All or Trending.'
                      : 'Try a different lens or category.'}
                  </p>
                  <button
                    onClick={function () { handleLensChange('all'); handleCategoryChange(null) }}
                    className="px-5 py-2.5 rounded-full bg-primary-600 hover:bg-primary-500 text-white text-sm font-sans font-medium transition-colors"
                  >
                    Show All Cases
                  </button>
                </div>
              )}
              {(loading || displayItems.length > 0 || atEndOfFeed) && renderCardContent()}
            </div>

            {/* Persistent edge chevrons — replaces 6%-opacity vertical text.
                Tappable as a fallback for users who reject swipe gestures. */}
            {!expanded && !rabbitOpen && !detailCard && !atEndOfFeed && (
              <>
                {/* Edge chevrons — V5 desktop: expand on hover into labeled
                    pills so mouse users see the action explicitly. */}
                <button
                  type="button"
                  onClick={function () {
                    var item = displayItems[idx]
                    if (item) doDismiss(item)
                    nextCard()
                  }}
                  aria-label="Dismiss this case (previous)"
                  className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 items-center gap-1.5 h-9 px-2 rounded-full text-white/40 hover:text-white hover:bg-black/40 transition-colors today-edge-chevron"
                >
                  <span className="text-xl leading-none">{'‹'}</span>
                  <span className="today-edge-chevron-label text-[11px] font-sans font-medium uppercase tracking-wider">Dismiss</span>
                </button>
                <button
                  type="button"
                  onClick={function () {
                    var item = displayItems[idx]
                    if (item) doSave(item)
                  }}
                  aria-label="Save this case"
                  className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-1.5 h-9 px-2 rounded-full text-white/40 hover:text-amber-200 hover:bg-black/40 transition-colors today-edge-chevron"
                >
                  <span className="today-edge-chevron-label text-[11px] font-sans font-medium uppercase tracking-wider">Save</span>
                  <span className="text-xl leading-none">{'›'}</span>
                </button>
                {/* V10.7.E.18 — Connected button. Floating chip on mobile/
                    tablet so the rabbit-hole panel has a discoverable entry
                    point now that we've adopted TikTok-style gestures (down
                    = previous card instead of opening the panel).
                    Gating rules:
                      - lg:hidden — desktop has the right-rail Connected Cases
                        sidebar already
                      - only when rabbitHoleCards.length > 0
                      - skip when the active card is a PhenomenonCard, since
                        those already have an in-card "Explore cases →" CTA at
                        the same approximate location — two CTAs in the same
                        slot are duplicative
                    Position: bottom-20 (80px from card pane bottom) so the
                    fixed mobile bottom nav (~64-72px tall) doesn't cover it. */}
                {rabbitHoleCards.length > 0 && card && card.item_type !== 'phenomenon' && (
                  <button
                    type="button"
                    onClick={function () { setRabbitOpen(true) }}
                    aria-label={'Open ' + rabbitHoleCards.length + ' connected case' + (rabbitHoleCards.length === 1 ? '' : 's')}
                    className="lg:hidden absolute bottom-20 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 pl-3 pr-3.5 py-1.5 rounded-full bg-gray-950/85 backdrop-blur-sm text-white text-xs font-sans font-medium shadow-lg hover:bg-gray-900/85 transition-colors border"
                    style={{ borderColor: catColor + 'AA' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: catColor }} />
                    <span>Connected</span>
                    <span className="text-white/55">·</span>
                    <span className="text-white/80">{rabbitHoleCards.length}</span>
                  </button>
                )}
              </>
            )}

            {/* "More like this" heart pulse overlay */}
            {heartPulse && (
              <div
                className="absolute left-1/2 top-1/2 today-heart-pulse pointer-events-none"
                aria-hidden="true"
                style={{ color: '#FF6B9D', fontSize: '5rem' }}
              >
                {'♡'}
              </div>
            )}

            {/* Rabbit hole + detail — V5: gated to BELOW lg (was xl), so
                tablet landscape (1180px = lg) sees the sidebar instead of
                the modal duplication. */}
            <div className="lg:hidden">
              {rabbitOpen && (
                <RabbitHolePanel
                  cards={rabbitHoleCards} color={catColor}
                  onClose={function () { setRabbitOpen(false) }}
                  onSelect={function (c) { setDetailCard(c) }}
                />
              )}
              {detailCard && (
                <DetailView card={detailCard} onBack={function () { setDetailCard(null) }} />
              )}
            </div>
          </div>

          {/* Connected cases sidebar — V5: lifted from xl:flex to lg:flex.
              Most laptops (1024–1279px) and iPad landscape (1180px) are in
              the lg band; they were previously losing the sidebar. */}
          <div className="hidden lg:flex flex-col w-[340px] xl:w-[380px] border-l border-gray-800/50 bg-gray-950 overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: catColor }}>{'◉'}</span>
                  <span className="text-[10px] text-gray-400 font-sans font-medium uppercase tracking-wider">
                    Connected cases
                  </span>
                </div>
                <span className="text-[10px] text-gray-600 font-sans">
                  {rabbitHoleCards.length > 0 ? rabbitHoleCards.length + ' related' : ''}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
              {rabbitHoleCards.length > 0 ? (
                rabbitHoleCards.map(function (c, i) {
                  var catConfig = CATEGORY_CONFIG[c.category as keyof typeof CATEGORY_CONFIG]
                  return (
                    <button
                      key={c.id}
                      onClick={function () { setDetailCard(c) }}
                      className="bg-white/[0.025] border border-white/[0.07] rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-white/[0.05] cursor-pointer"
                      style={{ borderLeft: '3px solid ' + c.categoryColor }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[9px] font-sans font-semibold uppercase tracking-wider" style={{ color: c.categoryColor }}>
                          <CategoryIcon category={c.category as PhenomenonCategory} size={10} />
                          {' ' + (catConfig?.label || c.category)}
                        </span>
                        <span className="text-[9px] text-gray-400 font-sans">
                          {c.location + (c.tag ? ' · ' + c.tag : '')}
                        </span>
                      </div>
                      <p className="text-sm font-display font-semibold text-gray-200 leading-snug mb-1.5">
                        {c.headline}
                      </p>
                      {c.credibility && c.credibility.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {c.credibility.map(function (tag, j) {
                            return (
                              <span key={j} className="text-[8px] px-2 py-0.5 rounded-full border border-white/[0.08] text-gray-400 font-sans">
                                {tag}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </button>
                  )
                })
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-xs font-sans">No related cases loaded yet</p>
                </div>
              )}
              {/* Constellation removed from sidebar (panel review fix — single canonical placement) */}
            </div>
          </div>
        </div>

        {/* Detail view overlay — V5: now at lg+ to match the sidebar move */}
        {detailCard && (
          <div className="hidden lg:flex fixed inset-0 z-[60] items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg max-h-[80vh] bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden flex flex-col">
              <div className="px-5 py-4 flex items-center justify-between flex-shrink-0 border-b border-white/5">
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider" style={{ color: detailCard.categoryColor }}>
                  {detailCard.category + ' · ' + detailCard.year}
                </span>
                <button
                  onClick={function () { setDetailCard(null) }}
                  className="text-gray-400 hover:text-gray-200 text-xs font-sans font-medium uppercase tracking-wider px-2 py-1 transition-colors"
                  aria-label="Close"
                >
                  {'✕ Close'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <p className="text-[11px] text-gray-400 font-sans mb-3">
                  {detailCard.location + (detailCard.tag ? ' · ' + detailCard.tag : '')}
                </p>
                <h2 className="text-xl font-display font-bold text-white leading-snug mb-3">
                  {detailCard.headline}
                </h2>
                {detailCard.credibility && detailCard.credibility.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-4">
                    {detailCard.credibility.map(function (c, i) {
                      return (
                        <span key={i} className="text-[10px] px-2.5 py-0.5 rounded-full border border-white/10 text-gray-400 font-sans font-medium">{c}</span>
                      )
                    })}
                  </div>
                )}
                <div className="h-px bg-white/[0.07] mb-4" />
                <p className="text-sm text-gray-300 leading-relaxed font-sans">{detailCard.summary}</p>
                <Link
                  href={(detailCard.item_type === 'phenomenon' ? '/phenomena/' : '/report/') + detailCard.slug}
                  className="inline-flex items-center gap-2 mt-4 text-sm font-sans font-medium text-primary-400 hover:text-primary-300 transition-colors"
                >
                  {detailCard.item_type === 'phenomenon' ? 'View Full Case →' : 'View Full Report →'}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop keyboard shortcuts — default-collapsed, opens via "?" in header */}
      {showShortcuts && (
        <div className="hidden md:block fixed bottom-0 left-0 right-0 z-40 bg-gray-950/90 backdrop-blur-sm border-t border-white/5 px-8 lg:px-10 py-3">
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <span className="text-[10px] text-gray-400 font-sans font-medium uppercase tracking-wider flex-shrink-0">Shortcuts</span>
            {[
              { key: 'W / ↑',     action: 'Previous' },
              { key: 'S / ↓',     action: 'Next' },
              { key: 'D / →',     action: 'Save' },
              { key: 'A / ←',     action: 'Dismiss' },
              { key: 'H',              action: 'More like this' },
              { key: 'Enter',          action: 'Expand' },
              { key: 'Esc',            action: 'Close' },
              { key: '?',              action: 'Toggle this bar' },
            ].map(function (s) {
              return (
                <div key={s.key} className="flex items-center gap-1.5">
                  <kbd className="text-[10px] bg-white/[0.05] border border-white/10 px-1.5 py-0.5 rounded text-gray-300 font-mono">{s.key}</kbd>
                  <span className="text-[10px] text-gray-400 font-sans">{s.action}</span>
                </div>
              )
            })}
            <button
              onClick={function () { setShowShortcuts(false) }}
              className="ml-auto text-gray-400 hover:text-gray-200 text-xs transition-colors flex-shrink-0"
              aria-label="Hide shortcuts"
            >
              {'✕'}
            </button>
            <button
              onClick={function () { resetGestureTutorial(); setShowTutorial(true); setShowShortcuts(false) }}
              className="text-[10px] text-gray-400 hover:text-primary-300 underline-offset-2 hover:underline transition-colors flex-shrink-0"
            >
              Replay tutorial
            </button>
          </div>
        </div>
      )}

      {/* Contextual signup prompt overlay */}
      {showSignupPrompt && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-6 safe-area-pb">
          <div className="w-full md:max-w-sm bg-gray-900 border-t md:border border-gray-700 rounded-t-2xl md:rounded-2xl p-6 text-center relative">
            <div className="flex justify-center mb-3 md:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>
            <button
              onClick={function () { setShowSignupPrompt(false); setSignupDismissed(true) }}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              {'✕'}
            </button>
            <div className="text-3xl mb-3">{'✦'}</div>
            <h3 className="text-xl font-display font-bold text-white mb-2">Down the rabbit hole?</h3>
            <p className="text-gray-300 text-sm font-sans mb-5">
              {signupPromptBody()}
            </p>
            <Link
              href="/start"
              className="block w-full py-3 bg-primary-600 hover:bg-primary-500 active:bg-primary-500 text-white rounded-full font-medium transition-colors mb-3"
            >
              Create Free Account
            </Link>
            <button
              onClick={function () { setShowSignupPrompt(false); setSignupDismissed(true) }}
              className="text-sm text-gray-400 hover:text-gray-200 transition-colors py-2"
            >
              Keep scrolling
            </button>
          </div>
        </div>
      )}

      {/* V11.18.x — removed per UI_SHIPPING_ROADMAP_V2 Sprint 1A deletes
          (TodayGridMode desktop grid overlay). */}

      {/* Save → Lab celebration toast (V2 panel review #20) */}
      {celebrationToast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[55] pointer-events-none" style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="px-4 py-2.5 rounded-full bg-primary-600/95 backdrop-blur-md border border-primary-400/40 shadow-xl text-white text-[13px] font-sans font-medium today-streak-glow">
            {celebrationToast}
          </div>
        </div>
      )}

      {/* V9.4.8 — Notification opt-in pre-prompt. Auto-fires after
          first save event (panel: highest-intent moment). One ask
          per device, ever — markPrePromptShown() on open. */}
      <NotificationOptInPrompt
        isOpen={showPushPrompt}
        onClose={function () { setShowPushPrompt(false) }}
        sampleTitle={pushPromptSample?.title || null}
        samplePushCopy={pushPromptSample?.body || null}
        onSubscribed={function () {
          flash('✦ Notifications enabled')
        }}
      />

      {/* First-run Collapse tooltip (V2 panel review #15) — appears once, only
          the first time the user expands a card */}
      {showCollapseTip && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[55] pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 200px)' }}>
          <div className="px-3.5 py-2 rounded-lg bg-gray-900/95 backdrop-blur-md border border-white/15 shadow-xl text-gray-100 text-[12px] font-sans">
            {'Tap ▲ Collapse to return to the feed'}
          </div>
        </div>
      )}

      <style>{'\
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }\
      '}</style>
    </>
  )
}

// =========================================================================
//  V11.18.10 — Sprint 1D SSR fix. Pre-fetch the day's Finding so it
//  renders in the initial paint instead of racing the user's swipe past
//  position 4–5.
//
//  Scope (deliberately narrow):
//    - ONLY the FindingCard is pre-fetched on the server. LabPromo
//      (tier-gated user state), OnThisDateCard (smaller data + lower
//      perceived race cost), and ClusteringCard (session-seeded
//      ranker) remain client-side fetches.
//    - Day-of-year rotation is deterministic from `new Date()` server-
//      side. Per V11.18.1 §5.A5, every user worldwide sees the same
//      Finding on the same UTC date — so rendering it from the server
//      tick instead of the client tick changes nothing for the user.
//    - On Supabase outage or env-not-configured, we fall through to
//      `initialFinding: null`; the client patterns/list fetch then
//      runs as the safety net (pre-V11.18.10 behavior).
//
//  Caching: short s-maxage so CDN can cache the anon shell + Finding
//  for 60s without staling the day-of-year rotation noticeably (every
//  user gets the same Finding for the whole UTC day anyway).
//
//  V11.18.14 — SSR-bake. OnThisDate is now ALSO pre-fetched here so
//  it can be baked into the initial items[] array alongside the
//  Finding. Both cards bypass the async-injection race that staled
//  the swipe component's snap-points. Pre-fetch is via an internal
//  HTTP call to the existing /api/discover/on-this-date endpoint so
//  the AI-text-date parsing logic stays in one place. LabPromo + the
//  ClusterCard remain client-side per the constraints docs/
//  FINDING_CARD_SSR_BAKE.md spells out.
// =========================================================================
export const getServerSideProps: GetServerSideProps<DiscoverPageProps> = async function (ctx) {
  var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { props: { initialFinding: null, initialOnThisDate: null } }
  }

  var initialFinding: FindingFeedItem | null = null
  try {
    var svc = createServiceClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    var res: any = await (svc.from('findings_catalogue' as any) as any)
      .select('id, slug, eyebrow_type, headline, descriptor, phen_families, denominator_n, denominator_n_label, interpretive_sentence, representative_report_ids')
      .eq('published', true)
      .order('publish_order', { ascending: true, nullsFirst: false })
      .limit(20)
    var rows: any[] = (res && res.data) || []
    if (rows.length > 0) {
      // Day-of-year rotation, UTC, same as the client dayOfYear()
      // helper above — keeps server/client picks identical when the
      // safety-net client fetch ever runs.
      var d = new Date()
      var startUtc = Date.UTC(d.getUTCFullYear(), 0, 1)
      var nowUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      var doy = Math.floor((nowUtc - startUtc) / 86400000) + 1
      var pickIdx = doy % rows.length
      var f: any = rows[pickIdx]

      // V11.18.12 — Sprint 1E. Pre-fetch the first representative
      // report's preview slab for the FindingCard substance zone. The
      // client patterns/list path also fetches this (see api/lab/
      // patterns/list.ts loadRepresentativePreviews); we duplicate the
      // join here so the SSR-delivered Finding lands fully populated
      // on first paint. Null when the catalogue row has no rep ids or
      // the lookup fails — FindingCard then suppresses the slab.
      var firstRepId: string | null = null
      if (Array.isArray(f.representative_report_ids) && f.representative_report_ids.length > 0) {
        firstRepId = String(f.representative_report_ids[0] || '')
      }
      var preview: any = null
      if (firstRepId) {
        try {
          var repRes: any = await (svc.from('reports') as any)
            .select('id, slug, title, location_text, event_date, paradocs_narrative, category')
            .eq('id', firstRepId)
            .eq('status', 'approved')
            .maybeSingle()
          var rr: any = repRes && repRes.data
          if (rr) {
            var narrative: string | null = rr.paradocs_narrative || null
            var previewText: string | null = null
            if (narrative) {
              var trimmed = String(narrative).trim()
              if (trimmed.length === 0) previewText = null
              else if (trimmed.length <= 260) previewText = trimmed
              else {
                var head = trimmed.slice(0, 260)
                var lastEnd = Math.max(
                  head.lastIndexOf('.'),
                  head.lastIndexOf('!'),
                  head.lastIndexOf('?'),
                )
                if (lastEnd >= 180) {
                  previewText = head.slice(0, lastEnd + 1).trim()
                } else {
                  var lastSpace = head.lastIndexOf(' ')
                  previewText = lastSpace >= 200
                    ? head.slice(0, lastSpace).trim() + '…'
                    : head.trim() + '…'
                }
              }
            }
            preview = {
              id: String(rr.id),
              slug: String(rr.slug || rr.id),
              title: rr.title || null,
              location_text: rr.location_text || null,
              event_date: rr.event_date || null,
              preview_text: previewText,
              category: rr.category || null,
            }
          }
        } catch (_e) {
          /* defensive — leave preview null */
        }
      }

      initialFinding = {
        id: String(f.id),
        slug: String(f.slug),
        eyebrow_type: f.eyebrow_type,
        headline: String(f.headline),
        descriptor: String(f.descriptor),
        phen_families: f.phen_families || [],
        denominator_n: Number(f.denominator_n) || 0,
        denominator_n_label: String(f.denominator_n_label || ''),
        interpretive_sentence: String(f.interpretive_sentence || ''),
        representative_report_ids: f.representative_report_ids || null,
        representative_report_preview: preview,
        user_overlay: null,
        item_type: 'finding',
      }
    }
  } catch (_e) {
    // Defensive: any server-side failure falls through to the client
    // patterns/list fetch (pre-V11.18.10 behavior preserved as the
    // safety net).
    initialFinding = null
  }

  // V11.18.14 — SSR-bake. Pre-fetch the day's OnThisDate via an
  // internal HTTP call to the existing endpoint. The AI-text-date
  // parsing logic over there is non-trivial; rather than duplicate
  // it here we reuse the endpoint so server + client see the same
  // selection rule. On failure → null; the client fetch fires as a
  // safety net (the ssrOnThisDateDelivered ref starts false in that
  // case, opening the client branch in fetchSpecialCards).
  var initialOnThisDate: OnThisDateData | null = null
  try {
    var base = process.env.NEXT_PUBLIC_SITE_URL || (
      ctx.req.headers.host
        ? (ctx.req.headers['x-forwarded-proto'] === 'https' ? 'https://' : 'http://') + ctx.req.headers.host
        : 'https://beta.discoverparadocs.com'
    )
    var otdRes: any = await fetch(base + '/api/discover/on-this-date')
    if (otdRes && otdRes.ok) {
      var otdData: any = await otdRes.json()
      if (otdData && Array.isArray(otdData.items) && otdData.items.length > 0) {
        initialOnThisDate = otdData.items[0] as OnThisDateData
      }
    }
  } catch (_e) {
    // Defensive — fall through to the client fetch in fetchSpecialCards.
    initialOnThisDate = null
  }

  // Short edge cache. The Finding for a given UTC day is stable;
  // a 60s s-maxage trims server load without staling the rotation.
  ctx.res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=60')

  return { props: { initialFinding: initialFinding, initialOnThisDate: initialOnThisDate } }
}
