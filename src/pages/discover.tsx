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
import { BottomNav } from '@/components/discover/BottomNav'
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
  //  Loading state
  // =========================================================================
  if (loading && !showOnboarding) {
    return (
      <>
        <Head>
          <title>Discover - Paradocs</title>
        </Head>
        <div style={{ minHeight: '100vh', background: '#030306', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, border: '2px solid transparent', borderBottomColor: '#9000F0', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>Loading stories...</p>
          </div>
        </div>
      </>
    )
  }

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

      <div style={{
        minHeight: '100vh',
        background: '#030306',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Phone frame (on desktop acts as constraining viewport) */}
        <div style={{
          width: '100%',
          maxWidth: 430,
          height: '100vh',
          maxHeight: 932,
          background: '#09090f',
          borderRadius: 0,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Status bar area */}
          <div style={{ padding: 'max(14px, env(safe-area-inset-top)) 26px 0', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Courier New',monospace" }}>
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>{'\u2022\u2022\u2022'}</span>
          </div>

          {/* Header */}
          <div style={{
            padding: '8px 22px 11px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#d4af37', fontFamily: "system-ui,-apple-system,sans-serif" }}>
                Paradocs<span style={{ color: '#9000F0' }}>.</span>
              </span>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)', letterSpacing: 1, fontFamily: "'Courier New',monospace" }}>
                DISCOVER
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Feedback label */}
              {feedbackLabel && (
                <span style={{
                  fontSize: 10,
                  fontFamily: "'Courier New',monospace",
                  color: feedbackLabel.indexOf('\u2726') >= 0 ? '#d4af37' : 'rgba(255,255,255,0.4)',
                  animation: 'fadeIn 0.15s ease',
                }}>
                  {feedbackLabel}
                </span>
              )}
              {/* Card counter */}
              <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.22)', cursor: 'pointer' }}>
                {'\u2630'}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ padding: '7px 22px 0', display: 'flex', gap: 4, flexShrink: 0, zIndex: 5 }}>
            {items.length > 0 && items.slice(0, Math.min(items.length, 20)).map(function (_, i) {
              return (
                <div key={i} style={{
                  height: 2,
                  flex: 1,
                  borderRadius: 2,
                  background: i === idx ? '#d4af37' : i < idx ? 'rgba(212,175,55,0.28)' : 'rgba(255,255,255,0.06)',
                  transition: 'background 0.3s',
                }} />
              )
            })}
          </div>

          {/* Card area */}
          <div
            style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'grab' }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            {/* Category accent stripe */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 2.5,
              background: catColor,
              opacity: 0.5,
              zIndex: 5,
              transition: 'background 0.4s',
            }} />

            {/* Main card */}
            <div style={cardStyle}>
              {renderCardContent()}
            </div>

            {/* Gesture hints */}
            {!expanded && !rabbitOpen && (
              <>
                <div style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 8, color: 'rgba(255,255,255,0.08)', fontFamily: "'Courier New',monospace", writingMode: 'vertical-lr' as const }}>
                  {'\u2192 save'}
                </div>
                <div style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 8, color: 'rgba(255,255,255,0.08)', fontFamily: "'Courier New',monospace", writingMode: 'vertical-lr' as const }}>
                  {'\u2190 dismiss'}
                </div>
                <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontSize: 8, color: 'rgba(255,255,255,0.08)', fontFamily: "'Courier New',monospace" }}>
                  {'\u2193 rabbit hole'}
                </div>
              </>
            )}

            {/* Rabbit hole panel */}
            {rabbitOpen && (
              <RabbitHolePanel
                cards={getRabbitHoleCards()}
                color={catColor}
                onClose={function () { setRabbitOpen(false) }}
                onSelect={function (c) { setDetailCard(c) }}
              />
            )}

            {/* Detail view */}
            {detailCard && (
              <DetailView
                card={detailCard}
                onBack={function () { setDetailCard(null) }}
              />
            )}
          </div>

          {/* Bottom nav */}
          <BottomNav active="discover" />

          {/* Legend (only on first card) */}
          {idx === 0 && !expanded && !rabbitOpen && !detailCard && (
            <div style={{
              position: 'absolute',
              bottom: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 14,
              opacity: 0.16,
              zIndex: 5,
              whiteSpace: 'nowrap' as const,
            }}>
              {[
                { key: '\u2191 swipe', label: 'next' },
                { key: '\u2193 swipe', label: 'rabbit hole' },
                { key: '\u2190 swipe', label: 'dismiss' },
                { key: '\u2192 swipe', label: 'save' },
                { key: 'tap', label: 'expand' },
              ].map(function (item) {
                return (
                  <div key={item.key} style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.16)', fontFamily: "'Courier New',monospace" }}>
                    <span style={{ color: 'rgba(255,255,255,0.28)' }}>{item.key}</span>
                    {' \u00B7 ' + item.label}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Signup prompt overlay */}
      {showSignupPrompt && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}>
          <div style={{
            width: '100%',
            maxWidth: 430,
            background: '#111118',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px 16px 0 0',
            padding: 24,
            textAlign: 'center',
          }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 24, marginBottom: 8 }}>{'\u2726'}</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 8 }}>Down the rabbit hole?</h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
              Create a free account to save entries, get personalized recommendations, and submit your own sightings.
            </p>
            <Link
              href="/login"
              style={{
                display: 'block',
                width: '100%',
                padding: '12px 0',
                background: '#9000F0',
                color: 'white',
                borderRadius: 24,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: 'none',
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              Create Free Account
            </Link>
            <button
              onClick={function () { setShowSignupPrompt(false); setSignupDismissed(true) }}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.35)',
                fontSize: 14,
                cursor: 'pointer',
                padding: '8px 0',
              }}
            >
              Keep scrolling
            </button>
          </div>
        </div>
      )}

      {/* Global keyframe styles */}
      <style>{'\
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }\
        @keyframes fadeIn { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }\
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }\
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}\
        ::-webkit-scrollbar{display:none;}\
        button:focus{outline:none;}\
      '}</style>
    </>
  )
}
