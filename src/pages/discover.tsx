'use client'

/**
 * /discover — Gesture-based card feed (Phase 4)
 *
 * Replaces CSS snap-scroll with custom touch gesture handling:
 *   - Swipe UP    → next card in feed (TikTok muscle memory)
 *   - Swipe DOWN  → rabbit hole panel slides up with related cases
 *   - Swipe LEFT  → dismiss, flashes "Dismissed", advances
 *   - Swipe RIGHT → save, flashes "✦ Saved" in gold
 *   - Tap "Read Case" → expands summary + blurred Constellation paywall
 *
 * All infrastructure preserved: feed-v2 API, behavioral tracking,
 * onboarding, gating, special card injection, session context.
 *
 * SWC-compatible: var, function expressions, string concat.
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
import { MobileBottomTabs } from '@/components/mobile/MobileBottomTabs'
import { useFeedEvents } from '@/lib/hooks/useFeedEvents'
import { useSessionContext } from '@/lib/hooks/useSessionContext'
import { useGateStatus } from '@/lib/hooks/useGateStatus'
import { CATEGORY_CONFIG } from '@/lib/constants'

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

export default function DiscoverPage() {
  var router = useRouter()

  // --- Feed state ---
  var [items, setItems] = useState<ExtendedFeedItem[]>([])
  var [loading, setLoading] = useState(true)
  var sessionSeed = useRef(Math.floor(Math.random() * 2147483647))
  var [loadingMore, setLoadingMore] = useState(false)
  var [hasMore, setHasMore] = useState(true)
  var [totalAvailable, setTotalAvailable] = useState(0)
  var [feedOffset, setFeedOffset] = useState(0)
  var loadingRef = useRef(false)

  // --- Card index + gesture state ---
  var [idx, setIdx] = useState(0)
  var [expanded, setExpanded] = useState(false)
  var [rabbitOpen, setRabbitOpen] = useState(false)
  var [detailCard, setDetailCard] = useState<RabbitHoleCard | null>(null)
  var [saved, setSaved] = useState<Set<string>>(function () { return new Set() })
  var [swipeAnim, setSwipeAnim] = useState<string | null>(null)
  var [feedbackLabel, setFeedbackLabel] = useState<string | null>(null)
  var touchStart = useRef<{ x: number; y: number } | null>(null)
  var animating = useRef(false)

  // --- Auth ---
  var [user, setUser] = useState<any>(null)

  // --- Onboarding ---
  var [showOnboarding, setShowOnboarding] = useState(false)
  var [onboardingTopics, setOnboardingTopics] = useState<string[]>([])

  // --- Related cards cache (for rabbit hole) ---
  var [relatedCache, setRelatedCache] = useState<Record<string, FeedItemV2[]>>({})
  var relatedLoadingRef = useRef<Record<string, boolean>>({})

  // --- Behavioral hooks ---
  var feedEvents = useFeedEvents(user?.id || null)
  var sessionCtx = useSessionContext()
  var gateStatus = useGateStatus(user?.id || null)

  // --- Dwell tracking ---
  var dwellStartRef = useRef<number>(Date.now())
  var [maxSeen, setMaxSeen] = useState(0)

  // --- Signup prompt ---
  var [showSignupPrompt, setShowSignupPrompt] = useState(false)
  var [signupDismissed, setSignupDismissed] = useState(false)

  // Pending special cards
  var pendingSpecialCards = useRef<{ card: ExtendedFeedItem; position: number }[]>([])
  var specialCardsInjected = useRef(false)

  // =========================================================================
  //  Auth
  // =========================================================================
  useEffect(function () {
    supabase.auth.getSession().then(function (result) {
      setUser(result.data.session?.user || null)
    })
    var sub = supabase.auth.onAuthStateChange(function (_event, session) {
      setUser(session?.user || null)
    })
    return function () { sub.data.subscription.unsubscribe() }
  }, [])

  // =========================================================================
  //  Onboarding
  // =========================================================================
  useEffect(function () {
    if (!isOnboardingComplete()) {
      setShowOnboarding(true)
    } else {
      setOnboardingTopics(getOnboardingTopics())
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
    if (onboardingTopics.length > 0) {
      params.set('onboarding_topics', onboardingTopics.join(','))
    }
    var sessionAff = sessionCtx.getSessionAffinityParam()
    if (sessionAff) params.set('session_affinity', sessionAff)

    fetch('/api/discover/feed-v2?' + params.toString())
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data.items && data.items.length > 0) {
          setItems(function (prev) {
            var existingIds = new Set(prev.map(function (p) { return p.id }))
            var newItems = data.items.filter(function (item: ExtendedFeedItem) {
              return !existingIds.has(item.id)
            })
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
      var promoCard: PromoCardData = {
        item_type: 'promo',
        id: 'promo-research-hub-1',
        promo_type: 'research_hub',
      }
      pendingSpecialCards.current.push({ card: promoCard, position: 14 })
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
    if (items.length === 0) return
    var activeItem = items[idx]
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
  }, [idx, items.length])

  // =========================================================================
  //  Behavioral tracking
  // =========================================================================
  useEffect(function () {
    if (items.length === 0) return
    var item = items[idx]
    if (!item) return

    // Track impression
    feedEvents.trackImpression(item.id, item.item_type, (item as any).category || '')
    dwellStartRef.current = Date.now()

    // Track max seen
    if (idx > maxSeen) setMaxSeen(idx)

    // Update session depth
    sessionCtx.recordImpression()
    gateStatus.updateSessionDepth(sessionCtx.sessionDepth)

    // Prefetch more if near end
    if (idx >= items.length - 5 && hasMore && !loadingRef.current) {
      loadFeed(feedOffset)
    }

    return function () {
      // Track dwell on leave
      var duration = Date.now() - dwellStartRef.current
      if (item) {
        feedEvents.trackDwell(item.id, item.item_type, (item as any).category || '', duration)
      }
    }
  }, [idx, items.length])

  // Signup gate at card 6
  useEffect(function () {
    if (!user && !signupDismissed && idx === 5) {
      setShowSignupPrompt(true)
    }
  }, [idx, user, signupDismissed])

  // =========================================================================
  //  Gesture: flash label
  // =========================================================================
  function flash(label: string) {
    setFeedbackLabel(label)
    setTimeout(function () { setFeedbackLabel(null) }, 900)
  }

  // =========================================================================
  //  Gesture: next card
  // =========================================================================
  var nextCard = useCallback(function () {
    if (animating.current || idx >= items.length - 1) return
    animating.current = true
    setSwipeAnim('up')
    setExpanded(false)
    setTimeout(function () {
      setIdx(function (i) { return i + 1 })
      setSwipeAnim(null)
      animating.current = false
    }, 230)
  }, [idx, items.length])

  // =========================================================================
  //  Gesture: previous card
  // =========================================================================
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
  //  Touch handlers
  // =========================================================================
  function handleTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current || rabbitOpen || detailCard) return
    var dx = e.changedTouches[0].clientX - touchStart.current.x
    var dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null

    if (Math.abs(dy) > Math.abs(dx)) {
      // Vertical swipe
      if (dy < -45) nextCard()                     // swipe UP → next
      if (dy > 45) setRabbitOpen(true)             // swipe DOWN → rabbit hole
    } else {
      // Horizontal swipe
      if (Math.abs(dx) < 50) return
      if (dx < 0) {
        // swipe LEFT → dismiss
        flash('Dismissed')
        nextCard()
        var item = items[idx]
        if (item) {
          feedEvents.trackTap(item.id, item.item_type, (item as any).category || '')
        }
      } else {
        // swipe RIGHT → save
        var currentItem = items[idx]
        if (currentItem) {
          setSaved(function (s) {
            var n = new Set(s)
            n.add(currentItem.id)
            return n
          })
          feedEvents.trackSave(currentItem.id, currentItem.item_type, (currentItem as any).category || '')
        }
        flash('\u2726 Saved')
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
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        prevCard()
      } else if (e.key === 'ArrowDown' || e.key === 'j' || e.key === ' ') {
        e.preventDefault()
        nextCard()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        flash('Dismissed')
        nextCard()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        var currentItem = items[idx]
        if (currentItem) {
          setSaved(function (s) { var n = new Set(s); n.add(currentItem.id); return n })
        }
        flash('\u2726 Saved')
      } else if (e.key === 'Enter') {
        e.preventDefault()
        setExpanded(true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (expanded) setExpanded(false)
        else if (rabbitOpen) setRabbitOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return function () { window.removeEventListener('keydown', handleKey) }
  }, [idx, items.length, expanded, rabbitOpen, detailCard, nextCard, prevCard])

  // =========================================================================
  //  Onboarding handler
  // =========================================================================
  function handleOnboardingComplete(topics: string[]) {
    setOnboardingTopics(topics)
    setShowOnboarding(false)
  }

  // =========================================================================
  //  Card tap handler
  // =========================================================================
  function handleCardTap(item: ExtendedFeedItem) {
    feedEvents.trackTap(item.id, item.item_type, (item as any).category || '')
    if ((item as any).category) {
      sessionCtx.recordTap((item as any).category)
    }
  }

  // =========================================================================
  //  Build rabbit hole cards from related cache
  // =========================================================================
  function getRabbitHoleCards(): RabbitHoleCard[] {
    var card = items[idx]
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
        if (rep.credibility === 'high') credibility.push('High Credibility')
        if (rep.has_photo_video) credibility.push('Photo/Video')
        if (rep.has_physical_evidence) credibility.push('Physical Evidence')
      }

      return {
        id: r.id,
        item_type: r.item_type,
        category: cat,
        categoryColor: catColor,
        location: location,
        year: year,
        tag: tag,
        headline: headline,
        summary: summary,
        credibility: credibility,
      }
    })
  }

  // =========================================================================
  //  Current card state
  // =========================================================================
  var card = items[idx]
  var isSaved = card ? saved.has(card.id) : false
  var catColor = card ? CATEGORY_COLORS[(card as any).category || ''] || '#b39ddb' : '#b39ddb'

  // Card animation style
  var cardStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    padding: '22px 22px 20px',
    transition: 'transform 0.23s cubic-bezier(0.4,0,0.2,1), opacity 0.23s ease',
    transform: swipeAnim === 'up' ? 'translateY(-52px)' : swipeAnim === 'down' ? 'translateY(52px)' : 'translateY(0)',
    opacity: swipeAnim ? 0 : 1,
    overflowY: 'hidden',
  }

  var setShowSignupPromptCb = useCallback(function (show: boolean) {
    setShowSignupPrompt(show)
  }, [])

  // =========================================================================
  //  Render card by type
  // =========================================================================
  function renderCardContent() {
    if (!card) return null

    // Special card types render their own full-screen layouts
    if (card.item_type === 'cluster') {
      return <ClusteringCard item={card as ClusterCardData} isActive={true} />
    }
    if (card.item_type === 'on_this_date') {
      return <OnThisDateCard item={card as OnThisDateData} isActive={true} />
    }
    if (card.item_type === 'promo') {
      return <ResearchHubPromo isActive={true} />
    }

    // Gate check
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

    // Standard cards
    if (card.item_type === 'phenomenon') {
      return (
        <PhenomenonCard
          item={card as PhenomenonItem}
          index={idx}
          isActive={true}
          expanded={expanded}
          onExpand={function () { setExpanded(true) }}
          user={user}
          onShowSignup={setShowSignupPromptCb}
        />
      )
    }

    var report = card as ReportItem
    if (report.has_photo_video) {
      return (
        <MediaReportCard
          item={report}
          index={idx}
          isActive={true}
          expanded={expanded}
          onExpand={function () { setExpanded(true) }}
          user={user}
          onShowSignup={setShowSignupPromptCb}
        />
      )
    }

    return (
      <TextReportCard
        item={report}
        index={idx}
        isActive={true}
        expanded={expanded}
        onExpand={function () { setExpanded(true) }}
        user={user}
        onShowSignup={setShowSignupPromptCb}
      />
    )
  }

  // =========================================================================
  //  Desktop sidebar: keyboard hints
  // =========================================================================
  var [showShortcuts, setShowShortcuts] = useState(true)

  // =========================================================================
  //  Responsive helpers
  // =========================================================================
  var rabbitHoleCards = getRabbitHoleCards()

  // =========================================================================
  //  Loading state
  // =========================================================================
  if (loading && !showOnboarding) {
    return (
      <>
        <Head>
          <title>Discover - Paradocs</title>
        </Head>
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4" />
            <p className="text-gray-400 text-lg font-sans">Loading stories...</p>
          </div>
        </div>
      </>
    )
  }

  // =========================================================================
  //  Progress percentage
  // =========================================================================
  var progressPct = totalAvailable > 0 ? ((idx + 1) / totalAvailable * 100) + '%' : items.length > 0 ? ((idx + 1) / items.length * 100) + '%' : '0%'
  var counterText = (idx + 1) + ' / ' + (totalAvailable > 0 ? totalAvailable : items.length)

  // =========================================================================
  //  Main render
  // =========================================================================
  return (
    <>
      <Head>
        <title>Discover - Paradocs</title>
        <meta name="description" content="Scroll through the world's most fascinating paranormal phenomena and firsthand reports. Cryptids, UFOs, ghosts, and unexplained events." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      {/* Onboarding overlay */}
      {showOnboarding && (
        <TopicOnboarding
          onComplete={handleOnboardingComplete}
          userId={user?.id}
        />
      )}

      <div className="min-h-screen bg-gray-950 flex flex-col">
        {/* ================================================================
            Fixed header — full width, responsive padding
            ================================================================ */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-lg border-b border-gray-800 safe-area-pt">
          <div className="flex items-center justify-between h-14 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Link href="/">
                <span className="font-sans font-black text-xl text-white tracking-tight whitespace-nowrap">
                  Paradocs<span style={{color:'#9000F0'}}>.</span>
                </span>
              </Link>
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                Discover
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Feedback label */}
              {feedbackLabel && (
                <span className={
                  'text-xs font-medium animate-fade-in ' +
                  (feedbackLabel.indexOf('\u2726') >= 0 ? 'text-primary-400' : 'text-gray-400')
                }>
                  {feedbackLabel}
                </span>
              )}
              {/* Card counter */}
              <span className="text-xs text-gray-500 bg-white/5 px-2.5 py-1 rounded-full font-medium">
                {counterText}
              </span>
              {/* Desktop nav links */}
              <div className="hidden md:flex items-center gap-4 ml-3">
                <Link href="/explore" className="text-xs text-gray-500 hover:text-gray-300 transition-colors font-sans">Explore</Link>
                <Link href="/map" className="text-xs text-gray-500 hover:text-gray-300 transition-colors font-sans">Map</Link>
                <Link href="/phenomena" className="text-xs text-gray-500 hover:text-gray-300 transition-colors font-sans">Encyclopedia</Link>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-gray-900">
            <div
              className="h-full bg-primary-500 transition-all duration-300"
              style={{ width: progressPct }}
            />
          </div>
        </div>

        {/* ================================================================
            Main content — responsive layout
            Mobile: full-screen card
            Tablet: centered column
            Desktop: two-pane (card + sidebar)
            ================================================================ */}
        <div className="flex-1 flex">
          {/* ---- Card feed pane ---- */}
          <div
            className="flex-1 relative overflow-hidden cursor-grab lg:max-w-2xl lg:mx-auto xl:mx-0 xl:max-w-none xl:flex-1"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            {/* Category accent stripe */}
            <div
              className="absolute left-0 top-0 bottom-0 w-[3px] opacity-50 z-10 transition-colors duration-400"
              style={{ background: catColor }}
            />

            {/* Main card — padding clears header and bottom nav (mobile) */}
            <div
              className="absolute inset-0 px-5 sm:px-6 md:px-8 lg:px-10 mobile-content-pb md:pb-8 overflow-y-auto transition-all duration-200"
              style={{
                paddingTop: 'calc(4.5rem + env(safe-area-inset-top, 0px))',
                transform: swipeAnim === 'up' ? 'translateY(-52px)' : swipeAnim === 'down' ? 'translateY(52px)' : 'translateY(0)',
                opacity: swipeAnim ? 0 : 1,
              }}
            >
              {renderCardContent()}
            </div>

            {/* Desktop keyboard shortcuts — pinned to bottom of card pane */}
            {showShortcuts && (
              <div className="hidden md:block absolute bottom-0 left-0 right-0 z-20 bg-gray-950/90 backdrop-blur-sm border-t border-white/5 px-8 lg:px-10 py-3">
                <div className="flex items-center gap-6">
                  <span className="text-[10px] text-gray-500 font-sans font-medium uppercase tracking-wider flex-shrink-0">Shortcuts</span>
                  {[
                    { key: '\u2191\u2193', action: 'Navigate' },
                    { key: '\u2192', action: 'Save' },
                    { key: '\u2190', action: 'Dismiss' },
                    { key: 'Enter', action: 'Expand' },
                    { key: 'Esc', action: 'Close' },
                  ].map(function (s) {
                    return (
                      <div key={s.key} className="flex items-center gap-1.5">
                        <kbd className="text-[10px] bg-white/[0.05] border border-white/10 px-1.5 py-0.5 rounded text-gray-400 font-mono">{s.key}</kbd>
                        <span className="text-[10px] text-gray-500 font-sans">{s.action}</span>
                      </div>
                    )
                  })}
                  <button onClick={function () { setShowShortcuts(false) }} className="ml-auto text-gray-600 hover:text-gray-400 text-xs transition-colors flex-shrink-0">{'\u2715'}</button>
                </div>
              </div>
            )}

            {/* Mobile gesture hints (only on small screens, first 3 cards) */}
            {!expanded && !rabbitOpen && !detailCard && idx < 3 && (
              <div className="md:hidden">
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] text-white/[0.06] font-sans" style={{ writingMode: 'vertical-lr' as const }}>
                  {'\u2192 save'}
                </div>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-white/[0.06] font-sans" style={{ writingMode: 'vertical-lr' as const }}>
                  {'\u2190 dismiss'}
                </div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[8px] text-white/[0.06] font-sans">
                  {'\u2193 rabbit hole'}
                </div>
              </div>
            )}

            {/* Rabbit hole panel (mobile: overlay, desktop: in sidebar) */}
            <div className="xl:hidden">
              {rabbitOpen && (
                <RabbitHolePanel
                  cards={rabbitHoleCards}
                  color={catColor}
                  onClose={function () { setRabbitOpen(false) }}
                  onSelect={function (c) { setDetailCard(c) }}
                />
              )}
              {detailCard && (
                <DetailView
                  card={detailCard}
                  onBack={function () { setDetailCard(null) }}
                />
              )}
            </div>
          </div>

          {/* ---- Desktop sidebar (xl+) ---- */}
          <div className="hidden xl:flex flex-col w-[380px] border-l border-gray-800/50 bg-gray-950 overflow-hidden main-content-pt">
            {/* Sidebar header */}
            <div className="px-5 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: catColor }}>{'\u25C9'}</span>
                  <span className="text-[10px] text-gray-400 font-sans font-medium uppercase tracking-wider">
                    Connected cases
                  </span>
                </div>
                <span className="text-[10px] text-gray-600 font-sans">
                  {rabbitHoleCards.length > 0 ? rabbitHoleCards.length + ' related' : ''}
                </span>
              </div>
            </div>

            {/* Related cards list */}
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
                          {(catConfig?.icon || '') + ' ' + (catConfig?.label || c.category)}
                        </span>
                        <span className="text-[9px] text-gray-500 font-sans">
                          {c.location + (c.tag ? ' \u00B7 ' + c.tag : '')}
                        </span>
                      </div>
                      <p className="text-sm font-display font-semibold text-gray-200 leading-snug mb-1.5">
                        {c.headline}
                      </p>
                      {c.credibility && c.credibility.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {c.credibility.map(function (tag, j) {
                            return (
                              <span key={j} className="text-[8px] px-2 py-0.5 rounded-full border border-white/[0.08] text-gray-500 font-sans">
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
                  <p className="text-gray-600 text-xs font-sans">No related cases loaded yet</p>
                </div>
              )}
              <div className="mt-2"><Constellation /></div>
            </div>

          </div>
        </div>

        {/* Detail view overlay (desktop: centered modal instead of panel) */}
        {detailCard && (
          <div className="hidden xl:flex fixed inset-0 z-[60] items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg max-h-[80vh] bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden flex flex-col">
              <div className="px-5 py-4 flex items-center justify-between flex-shrink-0 border-b border-white/5">
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider" style={{ color: detailCard.categoryColor }}>
                  {detailCard.category + ' \u00B7 ' + detailCard.year}
                </span>
                <button
                  onClick={function () { setDetailCard(null) }}
                  className="text-gray-500 hover:text-gray-300 text-xs font-sans font-medium uppercase tracking-wider px-2 py-1 transition-colors"
                >
                  {'\u2715 Close'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <p className="text-[11px] text-gray-500 font-sans mb-3">
                  {detailCard.location + (detailCard.tag ? ' \u00B7 ' + detailCard.tag : '')}
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
                <p className="text-sm text-gray-400 leading-relaxed font-sans">{detailCard.summary}</p>
                <div className="mt-5"><Constellation /></div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile bottom tabs (hidden on desktop) */}
        <MobileBottomTabs />
      </div>

      {/* Signup prompt overlay */}
      {showSignupPrompt && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-6">
          <div className="w-full md:max-w-sm bg-gray-900 border-t md:border border-gray-700 rounded-t-2xl md:rounded-2xl p-6 text-center relative">
            <div className="flex justify-center mb-3 md:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>
            <button
              onClick={function () { setShowSignupPrompt(false); setSignupDismissed(true) }}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
            >
              {'\u2715'}
            </button>
            <div className="text-3xl mb-3">{'\u2726'}</div>
            <h3 className="text-xl font-display font-bold text-white mb-2">Down the rabbit hole?</h3>
            <p className="text-gray-400 text-sm font-sans mb-5">
              Create a free account to save entries, get personalized recommendations, and submit your own sightings.
            </p>
            <Link
              href="/login"
              className="block w-full py-3 bg-primary-600 hover:bg-primary-500 active:bg-primary-500 text-white rounded-full font-medium transition-colors mb-3"
            >
              Create Free Account
            </Link>
            <button
              onClick={function () { setShowSignupPrompt(false); setSignupDismissed(true) }}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors py-2"
            >
              Keep scrolling
            </button>
          </div>
        </div>
      )}

      {/* Keyframe styles for slide-up panels */}
      <style>{'\
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }\
      '}</style>
    </>
  )
}
