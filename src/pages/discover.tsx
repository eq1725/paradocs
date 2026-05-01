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
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import {
  PhenomenonCard,
  TextReportCard,
  MediaReportCard,
} from '@/components/discover/DiscoverCards'
import type { FeedItemV2, PhenomenonItem, ReportItem } from '@/components/discover/DiscoverCards'
import { ClusteringCard } from '@/components/discover/ClusteringCard'
import type { ClusterCardData } from '@/components/discover/ClusteringCard'
import { OnThisDateCard } from '@/components/discover/OnThisDateCard'
import type { OnThisDateData } from '@/components/discover/OnThisDateCard'
import { ResearchHubPromo } from '@/components/discover/ResearchHubPromo'
import type { PromoCardData } from '@/components/discover/ResearchHubPromo'
import { CaseViewGate } from '@/components/discover/CaseViewGate'
import { TopicOnboarding, isOnboardingComplete, getOnboardingTopics } from '@/components/discover/TopicOnboarding'
import { RabbitHolePanel } from '@/components/discover/RabbitHolePanel'
import type { RabbitHoleCard } from '@/components/discover/RabbitHolePanel'
import { DetailView } from '@/components/discover/DetailView'
import { Constellation } from '@/components/discover/Constellation'
import { TodayHeader } from '@/components/discover/TodayHeader'
import type { TodayLens } from '@/components/discover/TodayHeader'
import { GestureTutorial, isGestureTutorialComplete, resetGestureTutorial } from '@/components/discover/GestureTutorial'
import { EndOfFeedCard } from '@/components/discover/EndOfFeedCard'
import { SkeletonCard } from '@/components/discover/SkeletonCard'
import { useFeedEvents } from '@/lib/hooks/useFeedEvents'
import { useSessionContext } from '@/lib/hooks/useSessionContext'
import { useGateStatus } from '@/lib/hooks/useGateStatus'
import { useTodaySaves } from '@/lib/hooks/useTodaySaves'
import { setTodayReturnMarker } from '@/lib/hooks/useTodayReturn'
import { useABTest } from '@/lib/ab-testing'
import { CATEGORY_CONFIG } from '@/lib/constants'
import CategoryIcon from '@/components/ui/CategoryIcon'
import type { PhenomenonCategory } from '@/lib/database.types'

// Extended feed item type that includes new card types
type ExtendedFeedItem = FeedItemV2 | ClusterCardData | OnThisDateData | PromoCardData

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Category color hex map (duplicated from cards for inline use)
var CATEGORY_COLORS: Record<string, string> = {
  ufos_aliens: '#4fc3f7',
  cryptids: '#a5d6a7',
  ghosts_hauntings: '#ce93d8',
  psychic_phenomena: '#b39ddb',
  consciousness_practices: '#ffb74d',
  psychological_experiences: '#80deea',
  biological_factors: '#ef9a9a',
  perception_sensory: '#ffcc80',
  religion_mythology: '#fff176',
  esoteric_practices: '#f48fb1',
  combination: '#80cbc4',
}

// Promo dismissal tracking — panel review #15 (tier-aware promo)
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
      if (it.item_type === 'cluster' || it.item_type === 'on_this_date' || it.item_type === 'promo') return true
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
      if (it.item_type === 'on_this_date' || it.item_type === 'promo') return true
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

export default function DiscoverPage() {
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
    setTimeout(function () { loadFeed(0) }, 0)
  }
  function handleCategoryChange(next: string | null) {
    setCategoryFilter(next)
    pushQuery(lens, next)
    setIdx(0)
    setItems([])
    setFeedOffset(0)
    setHasMore(true)
    specialCardsInjected.current = false
    pendingSpecialCards.current = []
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

  // Filtered view of items based on the active lens.
  // V2 panel review: also applies a client-side search filter when the user
  // has opened the search overlay and entered a query.
  var lensFiltered = applyLens(items, lens)
  var displayItems = (function () {
    var q = (searchQuery || '').trim().toLowerCase()
    if (!q) return lensFiltered
    return lensFiltered.filter(function (it) {
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
  })()

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

  // --- Streak (for header chip, V2 #12) ---
  var [streakDays, setStreakDays] = useState<number>(0)
  // searchQuery state lives near the top of the component (above displayItems)

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
  var pendingSpecialCards = useRef<{ card: ExtendedFeedItem; position: number }[]>([])
  var specialCardsInjected = useRef(false)

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
    Promise.resolve(
      supabase.from('profiles').select('subscription_tier').eq('id', uid).single()
    )
      .then(function (r: any) {
        var t = r?.data?.subscription_tier || 'free'
        setUserTier(t)
      })
      .catch(function () { /* tier read failed, leave default */ })
  }

  // Pull streak data for the header chip (best-effort; quiet on failure).
  useEffect(function () {
    if (!user?.id) { setStreakDays(0); return }
    var aborted = false
    fetch('/api/user/streak')
      .then(function (res) { return res.ok ? res.json() : null })
      .then(function (data) {
        if (aborted) return
        if (data && data.streak && typeof data.streak.current_streak === 'number') {
          setStreakDays(data.streak.current_streak)
        }
      })
      .catch(function () {})
    return function () { aborted = true }
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

    fetch('/api/discover/feed-v2?' + params.toString())
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data.items && data.items.length > 0) {
          setItems(function (prev) {
            var existingIds = new Set(prev.map(function (p) { return p.id }))
            var newItems = data.items.filter(function (item: ExtendedFeedItem) { return !existingIds.has(item.id) })
            return offset > 0 ? (prev as ExtendedFeedItem[]).concat(newItems) : data.items
          })
          setFeedOffset(data.nextOffset || offset + data.items.length)
          setHasMore(data.hasMore)
          setTotalAvailable(data.totalAvailable || 0)
          if (offset === 0) fetchSpecialCards()
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

    fetches.push(
      fetch('/api/discover/on-this-date')
        .then(function (res) { return res.ok ? res.json() : null })
        .then(function (data) {
          if (data && data.items && data.items.length > 0) {
            pendingSpecialCards.current.push({ card: data.items[0] as OnThisDateData, position: 2 })
          }
        })
        .catch(function () {})
    )

    fetches.push(
      fetch('/api/discover/clusters')
        .then(function (res) { return res.ok ? res.json() : null })
        .then(function (data) {
          if (data && data.clusters && data.clusters.length > 0) {
            var clusterCard: ClusterCardData = Object.assign({}, data.clusters[0], { item_type: 'cluster' as const })
            pendingSpecialCards.current.push({ card: clusterCard, position: 8 })
          }
        })
        .catch(function () {})
    )

    Promise.all(fetches).then(function () {
      var promoSkip = userTier === 'pro' || userTier === 'enterprise' || getPromoDismissals() >= 2
      if (!promoSkip) {
        // Vary position by ±3 within session seed for variety
        var jitter = (sessionSeed.current % 7) - 3   // -3..+3
        var promoPos = Math.max(11, 14 + jitter)
        var promoCard: PromoCardData = {
          item_type: 'promo',
          id: 'promo-research-hub-1',
          promo_type: 'research_hub',
        }
        pendingSpecialCards.current.push({ card: promoCard, position: promoPos })
      }
      pendingSpecialCards.current.sort(function (a, b) { return b.position - a.position })

      setItems(function (prev) {
        var arr = prev.slice()
        pendingSpecialCards.current.forEach(function (entry) {
          var insertAt = Math.min(entry.position, arr.length)
          arr.splice(insertAt, 0, entry.card)
        })
        specialCardsInjected.current = true
        return arr
      })
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
    saves.persistSave(item.id, item.item_type)
    feedEvents.trackSave(item.id, item.item_type, (item as any).category || '')
    haptic(35)
    flash('✦ Saved')
    // Save → Lab celebration loop (panel review #20). Every 5 saves shows a
    // transient toast with category breakdown.
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
  }

  function haptic(ms: number) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { (navigator as any).vibrate(ms) } catch (_) {}
    }
  }

  function doDismiss(item: ExtendedFeedItem) {
    feedEvents.trackDismiss(item.id, item.item_type, (item as any).category || '')
    if (item.item_type === 'promo') bumpPromoDismissals()
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

    // If the long-press already fired ("More like this"), don't ALSO trigger
    // a save/dismiss on the same touchend — but still allow vertical-swipe
    // navigation if the motion was big.
    if (firedLong && Math.abs(dx) < 60 && Math.abs(dy) < 60) return

    var SWIPE_THRESHOLD = 35  // was 50 — more forgiving for short flicks
    if (Math.abs(dy) > Math.abs(dx)) {
      if (dy < -SWIPE_THRESHOLD) nextCard()
      else if (dy > SWIPE_THRESHOLD) setRabbitOpen(true)
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

    if (card.item_type === 'cluster') return <ClusteringCard item={card as ClusterCardData} isActive={true} />
    if (card.item_type === 'on_this_date') return <OnThisDateCard item={card as OnThisDateData} isActive={true} />
    if (card.item_type === 'promo') return <ResearchHubPromo isActive={true} />

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
          isTodaysLead={leadFlag} whyReason={why} nextCatColor={nextColor}
        />
      )
    }

    var report = card as ReportItem
    if (report.has_photo_video) {
      return (
        <MediaReportCard
          item={report} index={idx} isActive={true}
          expanded={expanded} onExpand={handleExpand}
          onCollapse={handleCollapse}
          user={user} onShowSignup={setShowSignupPromptCb}
          isSaved={savedNow} onSave={saveCb} onShare={shareCb}
          isTodaysLead={leadFlag} whyReason={why} nextCatColor={nextColor}
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
        isTodaysLead={leadFlag} whyReason={why} nextCatColor={nextColor}
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
          searchQuery={searchQuery}
          onSearchQueryChange={function (q: string) {
            setSearchQuery(q)
            // Reset position so search results start at the top
            if (idx !== 0) setIdx(0)
          }}
        />

        {/* Main content */}
        <div className="flex-1 flex">
          {/* Card pane — capped width at xl per panel review #14.
              touch-action: pan-y tells iOS Safari to handle vertical pan
              natively (so reading scrolls inner content) but leave
              horizontal touches to React's onTouch* handlers. Without
              this, horizontal swipes can be silently consumed by iOS
              when an ancestor has overflow-y-auto. */}
          <div
            className="flex-1 relative overflow-hidden cursor-grab lg:max-w-2xl lg:mx-auto xl:mx-auto xl:max-w-3xl"
            style={{ touchAction: 'pan-y' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
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
                <button
                  type="button"
                  onClick={function () {
                    var item = displayItems[idx]
                    if (item) doDismiss(item)
                    nextCard()
                  }}
                  aria-label="Dismiss this case (left)"
                  className="hidden md:block absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors today-chevron-pulse"
                >
                  <span className="text-xl">{'‹'}</span>
                </button>
                <button
                  type="button"
                  onClick={function () {
                    var item = displayItems[idx]
                    if (item) doSave(item)
                  }}
                  aria-label="Save this case (right)"
                  className="hidden md:block absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full text-white/30 hover:text-amber-300 hover:bg-white/5 transition-colors today-chevron-pulse"
                >
                  <span className="text-xl">{'›'}</span>
                </button>
                <button
                  type="button"
                  onClick={function () { setRabbitOpen(true) }}
                  aria-label="Open rabbit hole (related cases)"
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-sans font-medium text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                >
                  {'↓ Connected cases'}
                </button>
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

            {/* Rabbit hole + detail (mobile + lg) */}
            <div className="xl:hidden">
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

          {/* Connected cases sidebar — now at lg: (panel review #13) */}
          <div className="hidden xl:flex flex-col w-[380px] border-l border-gray-800/50 bg-gray-950 overflow-hidden">
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

        {/* Detail view overlay (desktop modal) — Constellation removed for paywall consolidation */}
        {detailCard && (
          <div className="hidden xl:flex fixed inset-0 z-[60] items-center justify-center bg-black/60 backdrop-blur-sm">
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
              href="/login?redirect=/discover"
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

      {/* Save → Lab celebration toast (V2 panel review #20) */}
      {celebrationToast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[55] pointer-events-none" style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="px-4 py-2.5 rounded-full bg-primary-600/95 backdrop-blur-md border border-primary-400/40 shadow-xl text-white text-[13px] font-sans font-medium today-streak-glow">
            {celebrationToast}
          </div>
        </div>
      )}

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
