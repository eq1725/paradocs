/**
 * useSessionContext — Tracks in-session category affinity and session depth.
 *
 * Stored in sessionStorage so it persists within a tab but resets on new visit.
 * The ranked feed API uses this to weight the next batch of cards:
 *   effective_affinity = (long_term * 0.4) + (session * 0.6)
 *
 * SWC compliant: var, function expressions, string concat
 */

import { useState, useCallback, useEffect, useRef } from 'react'

var STORAGE_KEY = 'paradocs_session_context'

interface SessionContext {
  categoryTaps: Record<string, number>
  totalTaps: number
  sessionStartedAt: number
  lastCategory: string | null
  sessionDepth: number
}

function defaultContext(): SessionContext {
  return {
    categoryTaps: {},
    totalTaps: 0,
    sessionStartedAt: Date.now(),
    lastCategory: null,
    sessionDepth: 0,
  }
}

function loadContext(): SessionContext {
  if (typeof window === 'undefined') return defaultContext()
  try {
    var raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as SessionContext
  } catch (e) {
    // Corrupted data
  }
  return defaultContext()
}

function saveContext(ctx: SessionContext) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx))
  } catch (e) {
    // Storage full — ignore
  }
}

export function useSessionContext() {
  var contextRef = useRef<SessionContext>(defaultContext())
  var [sessionDepth, setSessionDepth] = useState(0)

  // Load on mount
  useEffect(function () {
    contextRef.current = loadContext()
    setSessionDepth(contextRef.current.sessionDepth)
  }, [])

  var recordTap = useCallback(function (category: string) {
    var ctx = contextRef.current
    ctx.categoryTaps[category] = (ctx.categoryTaps[category] || 0) + 1
    ctx.totalTaps += 1
    ctx.lastCategory = category
    ctx.sessionDepth += 1
    saveContext(ctx)
    setSessionDepth(ctx.sessionDepth)
  }, [])

  var recordImpression = useCallback(function () {
    // Lightweight depth tracking — each unique card view counts
    var ctx = contextRef.current
    ctx.sessionDepth = Math.max(ctx.sessionDepth, ctx.sessionDepth)
    saveContext(ctx)
  }, [])

  var getSessionAffinity = useCallback(function (): Record<string, number> {
    var ctx = contextRef.current
    if (ctx.totalTaps === 0) return {}

    var affinity: Record<string, number> = {}
    var categories = Object.keys(ctx.categoryTaps)
    categories.forEach(function (cat) {
      affinity[cat] = Math.round((ctx.categoryTaps[cat] / ctx.totalTaps) * 100)
    })
    return affinity
  }, [])

  var getSessionAffinityParam = useCallback(function (): string {
    var aff = getSessionAffinity()
    var pairs = Object.keys(aff).map(function (cat) {
      return cat + ':' + aff[cat]
    })
    return pairs.join(',')
  }, [getSessionAffinity])

  var getSessionDepth = useCallback(function (): number {
    return contextRef.current.sessionDepth
  }, [])

  return {
    sessionDepth: sessionDepth,
    recordTap: recordTap,
    recordImpression: recordImpression,
    getSessionAffinity: getSessionAffinity,
    getSessionAffinityParam: getSessionAffinityParam,
    getSessionDepth: getSessionDepth,
  }
}
