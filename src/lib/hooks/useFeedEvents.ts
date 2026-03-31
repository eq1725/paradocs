/**
 * useFeedEvents — Behavioral signal collection hook for the Discover feed.
 *
 * Tracks: impression, dwell, tap, save, share, scroll_depth, swipe_related
 *
 * Implementation:
 *   - Generates session_id on first use (sessionStorage)
 *   - Batches events in memory, flushes every 5s or on page unload
 *   - Uses navigator.sendBeacon() for reliable unload delivery
 *   - Deduplicates impressions per card per session
 *   - Dwell: only recorded if > 500ms (filters scroll-throughs)
 *
 * SWC compliant: var, function expressions, string concat, no template literals
 */

import { useRef, useEffect, useCallback } from 'react'

interface FeedEvent {
  card_id: string
  card_type: string
  phenomenon_category: string
  event_type: 'impression' | 'dwell' | 'tap' | 'save' | 'share' | 'scroll_depth' | 'swipe_related' | 'dismiss'
  duration_ms?: number
  scroll_depth_pct?: number
  metadata?: Record<string, any>
}

interface BufferedEvent extends FeedEvent {
  session_id: string
  created_at: string
}

var SESSION_KEY = 'paradocs_feed_session_id'

function generateSessionId(): string {
  var ts = Date.now().toString(36)
  var rand = Math.random().toString(36).substring(2, 10)
  return ts + '-' + rand
}

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  var existing = sessionStorage.getItem(SESSION_KEY)
  if (existing) return existing
  var id = generateSessionId()
  sessionStorage.setItem(SESSION_KEY, id)
  return id
}

export function useFeedEvents(userId: string | null) {
  var bufferRef = useRef<BufferedEvent[]>([])
  var impressionSetRef = useRef<Set<string>>(new Set())
  var flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  var sessionIdRef = useRef<string>('')

  // Initialize session id
  useEffect(function () {
    sessionIdRef.current = getSessionId()
  }, [])

  // Flush buffer to API
  var flush = useCallback(function () {
    var events = bufferRef.current.splice(0)
    if (events.length === 0) return

    var payload = JSON.stringify({ events: events })

    // Try sendBeacon first (works on unload), fall back to fetch
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      var sent = navigator.sendBeacon('/api/events/feed', new Blob([payload], { type: 'application/json' }))
      if (sent) return
    }

    // Fallback: fire-and-forget fetch
    fetch('/api/events/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(function () {
      // Silent fail — events are best-effort
    })
  }, [])

  // Set up periodic flush and unload handler
  useEffect(function () {
    flushTimerRef.current = setInterval(flush, 5000)

    var handleVisChange = function () {
      if (document.visibilityState === 'hidden') flush()
    }
    var handleUnload = function () { flush() }

    document.addEventListener('visibilitychange', handleVisChange)
    window.addEventListener('beforeunload', handleUnload)

    return function () {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current)
      flush()
      document.removeEventListener('visibilitychange', handleVisChange)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [flush])

  // Queue an event into the buffer
  var queueEvent = useCallback(function (event: FeedEvent) {
    bufferRef.current.push({
      card_id: event.card_id,
      card_type: event.card_type,
      phenomenon_category: event.phenomenon_category,
      event_type: event.event_type,
      duration_ms: event.duration_ms,
      scroll_depth_pct: event.scroll_depth_pct,
      metadata: event.metadata,
      session_id: sessionIdRef.current,
      created_at: new Date().toISOString(),
    })
  }, [])

  // --- Public tracking methods ---

  var trackImpression = useCallback(function (cardId: string, cardType: string, category: string, metadata?: Record<string, any>) {
    // Deduplicate: one impression per card per session
    if (impressionSetRef.current.has(cardId)) return
    impressionSetRef.current.add(cardId)
    queueEvent({
      card_id: cardId,
      card_type: cardType,
      phenomenon_category: category,
      event_type: 'impression',
      metadata: metadata,
    })
  }, [queueEvent])

  var trackDwell = useCallback(function (cardId: string, cardType: string, category: string, durationMs: number) {
    // Only record meaningful dwells (> 500ms)
    if (durationMs < 500) return
    queueEvent({
      card_id: cardId,
      card_type: cardType,
      phenomenon_category: category,
      event_type: 'dwell',
      duration_ms: durationMs,
    })
  }, [queueEvent])

  var trackTap = useCallback(function (cardId: string, cardType: string, category: string) {
    queueEvent({
      card_id: cardId,
      card_type: cardType,
      phenomenon_category: category,
      event_type: 'tap',
    })
  }, [queueEvent])

  var trackSave = useCallback(function (cardId: string, cardType: string, category: string) {
    queueEvent({
      card_id: cardId,
      card_type: cardType,
      phenomenon_category: category,
      event_type: 'save',
    })
  }, [queueEvent])

  var trackShare = useCallback(function (cardId: string, cardType: string, category: string) {
    queueEvent({
      card_id: cardId,
      card_type: cardType,
      phenomenon_category: category,
      event_type: 'share',
    })
  }, [queueEvent])

  var trackScrollDepth = useCallback(function (cardId: string, pct: number) {
    queueEvent({
      card_id: cardId,
      card_type: 'report',
      phenomenon_category: '',
      event_type: 'scroll_depth',
      scroll_depth_pct: pct,
    })
  }, [queueEvent])

  var trackDismiss = useCallback(function (cardId: string, cardType: string, category: string) {
    queueEvent({
      card_id: cardId,
      card_type: cardType,
      phenomenon_category: category,
      event_type: 'dismiss',
    })
  }, [queueEvent])

  var trackSwipeRelated = useCallback(function (cardId: string, cardType: string, category: string) {
    queueEvent({
      card_id: cardId,
      card_type: cardType,
      phenomenon_category: category,
      event_type: 'swipe_related',
    })
  }, [queueEvent])

  return {
    trackImpression: trackImpression,
    trackDwell: trackDwell,
    trackTap: trackTap,
    trackSave: trackSave,
    trackShare: trackShare,
    trackScrollDepth: trackScrollDepth,
    trackDismiss: trackDismiss,
    trackSwipeRelated: trackSwipeRelated,
    getSessionId: function () { return sessionIdRef.current },
  }
}
