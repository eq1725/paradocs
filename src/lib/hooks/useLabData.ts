'use client'

/**
 * useLabData — shared data hook for every Lab tab.
 *
 * Fetches /api/constellation/user-map once and derives:
 *   - normalizedMapData: entries with external → inferred categories
 *   - aiConnections:     pairwise emergent connections
 *   - insights:          library-wide text insights (AI patterns)
 *   - caseFiles:         the user's case files with counts
 *   - newInsights:       insights whose referenced entries arrived since
 *                        the user's last visit (localStorage tracked)
 *
 * Lifted to LabPage so Saves / Cases / Map share one network request and
 * one computation. Tab switches don't refetch.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { EntryNode, UserMapData, CaseFile } from '@/lib/constellation-types'
import {
  CONSTELLATION_NODES,
  detectEmergentConnections,
  detectInsights,
  inferCategoryFromTags,
  type Insight,
  type EmergentConnection,
} from '@/lib/constellation-data'

export interface LabData {
  /** True while the initial user-map fetch is in-flight */
  loading: boolean
  /** Raw payload from /api/constellation/user-map (after client normalization) */
  userMapData: UserMapData | null
  /** Pairwise AI-detected connections */
  aiConnections: EmergentConnection[]
  /** Library-wide readable insights */
  insights: Insight[]
  /** Insights new since the user's last visit (empty if first visit) */
  newInsights: Insight[]
  /** User's case files with artifact counts */
  caseFiles: CaseFile[]
  /** Trigger a full re-fetch (e.g. after creating/saving something) */
  refresh: () => void
  /** How many times we've refreshed in this session — useful for debug / keying */
  refreshKey: number
}

const LAST_VISIT_KEY = 'paradocs_lab_last_visit_ms'

export function useLabData(): LabData {
  const [userMapData, setUserMapData] = useState<UserMapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastVisitMs, setLastVisitMs] = useState<number | null>(null)

  // One-shot: read last-visit timestamp and immediately stamp "now" so the
  // next session computes "new since" from this moment.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_VISIT_KEY)
      const prev = raw ? parseInt(raw, 10) : NaN
      if (!isNaN(prev)) setLastVisitMs(prev)
      localStorage.setItem(LAST_VISIT_KEY, String(Date.now()))
    } catch {
      /* localStorage unavailable, fine */
    }
  }, [])

  // Fetch user-map. Re-runs when refreshKey changes.
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const sessionResult = await supabase.auth.getSession()
        const token = sessionResult.data.session?.access_token
        if (!token) {
          if (!cancelled) setLoading(false)
          return
        }
        const res = await fetch('/api/constellation/user-map', {
          headers: { Authorization: 'Bearer ' + token },
        })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setUserMapData(data)
        }
      } catch (err) {
        console.error('[useLabData] fetch failed', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey])

  // Normalize external-category entries into their inferred phenomena
  // segment so category filters + insights treat them correctly.
  const normalizedMapData = useMemo<UserMapData | null>(() => {
    if (!userMapData) return null
    const valid = new Set(CONSTELLATION_NODES.map(n => n.id as string))
    const normalized = userMapData.entryNodes.map(e => {
      if (valid.has(e.category)) return e
      return { ...e, category: inferCategoryFromTags(e.tags || []) }
    })
    const stats: Record<string, { entries: number; verdicts: Record<string, number> }> = {}
    for (const n of normalized) {
      if (!stats[n.category]) stats[n.category] = { entries: 0, verdicts: {} }
      stats[n.category].entries++
      stats[n.category].verdicts[n.verdict] = (stats[n.category].verdicts[n.verdict] || 0) + 1
    }
    return { ...userMapData, entryNodes: normalized, categoryStats: stats }
  }, [userMapData])

  // Derive AI connections + insights from real (non-ghost) entries.
  const realEntries = useMemo(() => {
    if (!normalizedMapData) return [] as EntryNode[]
    return normalizedMapData.entryNodes.filter(e => !e.isGhost)
  }, [normalizedMapData])

  const aiConnections = useMemo(() => {
    return detectEmergentConnections(realEntries.map(e => ({
      id: e.id,
      category: e.category,
      verdict: e.verdict,
      tags: e.tags || [],
      eventDate: e.eventDate,
      locationName: e.locationName,
    })))
  }, [realEntries])

  const insights = useMemo(() => {
    return detectInsights(realEntries.map(e => ({
      id: e.id,
      category: e.category,
      verdict: e.verdict,
      tags: e.tags || [],
      eventDate: e.eventDate,
      locationName: e.locationName,
      latitude: e.latitude ?? null,
      longitude: e.longitude ?? null,
      loggedAt: e.loggedAt ?? null,
      title: e.name ?? null,
    })))
  }, [realEntries])

  const newInsights = useMemo(() => {
    if (!lastVisitMs) return []
    const entryById: Record<string, EntryNode> = {}
    for (const n of realEntries) entryById[n.id] = n
    return insights.filter(ins => ins.entryIds.some(id => {
      const e = entryById[id]
      if (!e) return false
      const t = new Date(e.loggedAt).getTime()
      return !isNaN(t) && t > (lastVisitMs as number)
    }))
  }, [insights, realEntries, lastVisitMs])

  const caseFiles = useMemo<CaseFile[]>(() => {
    return (normalizedMapData as any)?.caseFiles || []
  }, [normalizedMapData])

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  return {
    loading,
    userMapData: normalizedMapData,
    aiConnections,
    insights,
    newInsights,
    caseFiles,
    refresh,
    refreshKey,
  }
}
