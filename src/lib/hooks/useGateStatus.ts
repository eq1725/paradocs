/**
 * useGateStatus — Depth gating hook.
 *
 * Tracks case views, AI search usage, Ask the Unknown usage.
 * For authenticated users: server-side in user_usage table.
 * For anonymous users: localStorage (easily bypassed — fine, they're conversion targets).
 *
 * SWC compliant: var, function expressions, string concat
 */

import { useState, useEffect, useCallback, useRef } from 'react'

var ANON_USAGE_KEY = 'paradocs_anon_usage'
var MAX_FREE_VIEWS = 3
var MAX_FREE_ASK_WEEKLY = 1

interface GateStatus {
  caseViewsToday: number
  maxFreeViews: number
  isViewGated: boolean
  aiSearchesThisMonth: number
  askTheUnknownThisWeek: number
  tier: 'anonymous' | 'free' | 'core' | 'pro' | 'enterprise'
  sessionDepth: number
  loading: boolean
}

interface AnonUsage {
  date: string
  views: number
  askWeekStart: string
  askCount: number
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function weekStartStr(): string {
  var d = new Date()
  var day = d.getDay()
  var diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  var monday = new Date(d.setDate(diff))
  return monday.toISOString().slice(0, 10)
}

function loadAnonUsage(): AnonUsage {
  if (typeof window === 'undefined') return { date: todayStr(), views: 0, askWeekStart: weekStartStr(), askCount: 0 }
  try {
    var raw = localStorage.getItem(ANON_USAGE_KEY)
    if (raw) {
      var parsed = JSON.parse(raw) as AnonUsage
      // Reset daily views if date changed
      if (parsed.date !== todayStr()) {
        parsed.date = todayStr()
        parsed.views = 0
      }
      // Reset weekly ask if week changed
      if (parsed.askWeekStart !== weekStartStr()) {
        parsed.askWeekStart = weekStartStr()
        parsed.askCount = 0
      }
      return parsed
    }
  } catch (e) {
    // Corrupted data
  }
  return { date: todayStr(), views: 0, askWeekStart: weekStartStr(), askCount: 0 }
}

function saveAnonUsage(usage: AnonUsage) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ANON_USAGE_KEY, JSON.stringify(usage))
  } catch (e) {
    // Storage full
  }
}

export function useGateStatus(userId: string | null, userTier?: string) {
  var [status, setStatus] = useState<GateStatus>({
    caseViewsToday: 0,
    maxFreeViews: MAX_FREE_VIEWS,
    isViewGated: false,
    aiSearchesThisMonth: 0,
    askTheUnknownThisWeek: 0,
    tier: 'anonymous',
    sessionDepth: 0,
    loading: true,
  })

  var anonUsageRef = useRef<AnonUsage>(loadAnonUsage())

  // Determine tier
  var tier: GateStatus['tier'] = 'anonymous'
  if (userId) {
    tier = (userTier as GateStatus['tier']) || 'free'
  }

  // Load usage on mount
  useEffect(function () {
    if (!userId) {
      // Anonymous: use localStorage
      var usage = loadAnonUsage()
      anonUsageRef.current = usage
      setStatus(function (prev) {
        return {
          caseViewsToday: usage.views,
          maxFreeViews: MAX_FREE_VIEWS,
          isViewGated: usage.views >= MAX_FREE_VIEWS,
          aiSearchesThisMonth: 0,
          askTheUnknownThisWeek: usage.askCount,
          tier: 'anonymous',
          sessionDepth: prev.sessionDepth,
          loading: false,
        }
      })
      return
    }

    // Authenticated: fetch from server
    fetch('/api/user/usage')
      .then(function (res) { return res.json() })
      .then(function (data) {
        var isPaid = tier === 'core' || tier === 'pro' || tier === 'enterprise'
        setStatus({
          caseViewsToday: data.case_views || 0,
          maxFreeViews: MAX_FREE_VIEWS,
          isViewGated: !isPaid && (data.case_views || 0) >= MAX_FREE_VIEWS,
          aiSearchesThisMonth: data.ai_searches || 0,
          askTheUnknownThisWeek: data.ask_unknown_count || 0,
          tier: tier,
          sessionDepth: 0,
          loading: false,
        })
      })
      .catch(function () {
        setStatus(function (prev) {
          return Object.assign({}, prev, { loading: false })
        })
      })
  }, [userId, tier])

  var incrementCaseView = useCallback(function (): boolean {
    var isPaid = tier === 'core' || tier === 'pro' || tier === 'enterprise'

    if (!userId) {
      // Anonymous
      var usage = anonUsageRef.current
      usage.views += 1
      saveAnonUsage(usage)
      var gated = !isPaid && usage.views >= MAX_FREE_VIEWS
      setStatus(function (prev) {
        return Object.assign({}, prev, {
          caseViewsToday: usage.views,
          isViewGated: gated,
        })
      })
      return gated
    }

    // Authenticated: fire server increment
    fetch('/api/user/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'increment_case_view' }),
    }).catch(function () {})

    setStatus(function (prev) {
      var newViews = prev.caseViewsToday + 1
      return Object.assign({}, prev, {
        caseViewsToday: newViews,
        isViewGated: !isPaid && newViews >= MAX_FREE_VIEWS,
      })
    })

    return false
  }, [userId, tier])

  var incrementAskUnknown = useCallback(function (): boolean {
    var isPaid = tier === 'core' || tier === 'pro' || tier === 'enterprise'
    if (isPaid) return false

    if (!userId) {
      var usage = anonUsageRef.current
      usage.askCount += 1
      saveAnonUsage(usage)
      setStatus(function (prev) {
        return Object.assign({}, prev, { askTheUnknownThisWeek: usage.askCount })
      })
      return usage.askCount > MAX_FREE_ASK_WEEKLY
    }

    // Authenticated
    fetch('/api/user/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'increment_ask_unknown' }),
    }).catch(function () {})

    setStatus(function (prev) {
      return Object.assign({}, prev, { askTheUnknownThisWeek: prev.askTheUnknownThisWeek + 1 })
    })

    return false
  }, [userId, tier])

  var updateSessionDepth = useCallback(function (depth: number) {
    setStatus(function (prev) {
      return Object.assign({}, prev, { sessionDepth: depth })
    })
  }, [])

  return {
    status: status,
    incrementCaseView: incrementCaseView,
    incrementAskUnknown: incrementAskUnknown,
    updateSessionDepth: updateSessionDepth,
  }
}
