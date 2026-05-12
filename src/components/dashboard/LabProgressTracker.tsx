'use client'

/**
 * LabProgressTracker — Research Pulse box (V10.3 redesign).
 *
 * Anchors the top of the Lab → Saves tab. Three goals:
 *   1. At-a-glance status: how big is my library, how active am I,
 *      where's my attention going.
 *   2. Promote Researcher Overlap from a static stat into a
 *      tappable social-discovery marquee. Tapping opens
 *      ResearcherOverlapSheet — the proper social mechanic
 *      built in V10.3 QA #6.
 *   3. Stay non-gamified. Research tools shouldn't feel like
 *      Duolingo; no streaks, no XP, no shame on idle days.
 *
 * V10.3 layout (was 4 equal-weight tiles in V9):
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ Research Pulse                                  [ ⌃ ]   │
 *   ├──────────────┬──────────────────────────────────────────┤
 *   │              │  ┌────────────────────────────────────┐ │
 *   │   42         │  │ ✦ 3 researchers overlap with you  →│ │
 *   │   total      │  │   2 strong · 1 notable             │ │
 *   │   saves      │  └────────────────────────────────────┘ │
 *   │              │   Last save 2 days ago · UFOs lead 30d  │
 *   └──────────────┴──────────────────────────────────────────┘
 *
 * The anchor metric (Total saves) is on the left at a much larger
 * size. The right side splits into:
 *   - Marquee row: Researcher Overlap (tappable, opens sheet)
 *   - Footnote row: recency + this-month focus, smaller treatment
 *
 * Collapsible to a single-line summary when the user wants more
 * vertical room for the feed (state persisted to localStorage).
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Bookmark, Clock, TrendingUp, Users, ChevronDown, ChevronUp,
  Sparkles, ChevronRight,
} from 'lucide-react'
import type { EntryNode } from '@/lib/constellation-types'
import { CONSTELLATION_NODES } from '@/lib/constellation-data'
import { classNames } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const ResearcherOverlapSheet = require('./ResearcherOverlapSheet').default as React.ComponentType<{
  open: boolean
  onClose: () => void
}>

interface LabProgressTrackerProps {
  entries: EntryNode[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const COLLAPSE_KEY = 'paradocs_research_pulse_collapsed'
const OVERLAP_CACHE_KEY = 'paradocs_research_pulse_overlap_v1'
const OVERLAP_CACHE_TTL = 60 * 60 * 1000 // 1h client-side cache, matches API

interface OverlapPreview {
  total: number
  strong: number
  notable: number
}

export default function LabProgressTracker({ entries }: LabProgressTrackerProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [overlapPreview, setOverlapPreview] = useState<OverlapPreview | null>(null)

  // Hydrate collapsed state from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY)
      if (raw === '1') setCollapsed(true)
    } catch { /* localStorage unavailable */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  // Lazy-load the Researcher Overlap preview counts (we show
  // them inline on the marquee tile, e.g. "3 researchers
  // overlap with you · 2 strong · 1 notable").
  // Client-side caches result with 1h TTL — matches the server
  // cache so we don't double-spend on consecutive renders.
  const loadOverlapPreview = useCallback(async function (opts?: { bypassCache?: boolean }) {
    try {
      if (!opts?.bypassCache) {
        const cached = readOverlapCache()
        if (cached) { setOverlapPreview(cached); return }
      }
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) return
      const resp = await fetch('/api/user/researcher-overlap', {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!resp.ok) return
      const payload = await resp.json()
      const matches: any[] = payload.matches || []
      const preview: OverlapPreview = {
        total: matches.length,
        strong: matches.filter(m => m.tier === 'strong').length,
        notable: matches.filter(m => m.tier === 'notable').length,
      }
      setOverlapPreview(preview)
      writeOverlapCache(preview)
    } catch {
      // Silent — the marquee falls back to "explore" copy.
    }
  }, [])

  useEffect(() => { loadOverlapPreview() }, [loadOverlapPreview])

  // When the sheet closes, refresh the preview in case the user
  // toggled visibility or sent a reach-out (which removes them
  // from the eligible list).
  useEffect(() => {
    if (!sheetOpen) loadOverlapPreview({ bypassCache: true })
  }, [sheetOpen, loadOverlapPreview])

  const stats = useMemo(() => {
    const real = entries.filter(e => !e.isGhost)
    const now = Date.now()

    // Recency.
    let lastSaveMs = 0
    for (const e of real) {
      const t = new Date(e.loggedAt).getTime()
      if (!isNaN(t) && t > lastSaveMs) lastSaveMs = t
    }
    const daysSinceLast = lastSaveMs > 0 ? Math.floor((now - lastSaveMs) / DAY_MS) : -1

    // Top category in the last 30 days.
    const monthCutoff = now - 30 * DAY_MS
    const monthlyByCategory: Record<string, number> = {}
    let monthlySaves = 0
    for (const e of real) {
      const t = new Date(e.loggedAt).getTime()
      if (isNaN(t) || t < monthCutoff) continue
      monthlyByCategory[e.category] = (monthlyByCategory[e.category] || 0) + 1
      monthlySaves++
    }
    let topCategoryId: string | null = null
    let topCategoryCount = 0
    for (const [cat, count] of Object.entries(monthlyByCategory)) {
      if (count > topCategoryCount) { topCategoryId = cat; topCategoryCount = count }
    }
    const topCategoryNode = topCategoryId
      ? CONSTELLATION_NODES.find(n => n.id === topCategoryId)
      : null

    return {
      total: real.length,
      daysSinceLast,
      monthlySaves,
      topCategoryLabel: topCategoryNode?.label || null,
      topCategoryIcon: topCategoryNode?.icon || null,
      topCategoryCount,
    }
  }, [entries])

  const recencyLabel =
    stats.daysSinceLast < 0 ? 'No saves yet' :
    stats.daysSinceLast === 0 ? 'today' :
    stats.daysSinceLast === 1 ? 'yesterday' :
    stats.daysSinceLast < 7 ? stats.daysSinceLast + ' days ago' :
    stats.daysSinceLast < 30 ? Math.floor(stats.daysSinceLast / 7) + ' weeks ago' :
    Math.floor(stats.daysSinceLast / 30) + ' months ago'

  // ── Collapsed mini-row ─────────────────────────────────────
  if (collapsed) {
    return (
      <>
        <button
          onClick={() => setCollapsed(false)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-gray-900/60 border border-gray-800 hover:border-gray-700 transition-colors text-left"
          aria-label="Expand Research Pulse"
        >
          <div className="flex items-center gap-3 text-xs text-gray-500 min-w-0">
            <span className="flex items-center gap-1 flex-shrink-0">
              <Bookmark className="w-3 h-3 text-purple-400" />
              <span className="tabular-nums text-gray-300 font-semibold">{stats.total}</span>
              <span>saves</span>
            </span>
            {overlapPreview && overlapPreview.total > 0 && (
              <span className="flex items-center gap-1 flex-shrink-0 text-cyan-300">
                <Sparkles className="w-3 h-3" />
                <span className="tabular-nums font-semibold">{overlapPreview.total}</span>
                <span>overlap</span>
              </span>
            )}
            <span className="hidden sm:flex items-center gap-1 flex-shrink-0">
              <Clock className="w-3 h-3" />
              <span>last {recencyLabel}</span>
            </span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        </button>
        <ResearcherOverlapSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      </>
    )
  }

  // ── Full expanded box ──────────────────────────────────────
  return (
    <>
      <div className="rounded-xl bg-gradient-to-br from-gray-900/80 via-gray-900/40 to-gray-900/80 border border-gray-800 p-3 sm:p-4 relative">
        <button
          onClick={() => setCollapsed(true)}
          className="absolute top-2 right-2 p-1 rounded text-gray-600 hover:text-gray-300 transition-colors"
          aria-label="Collapse Research Pulse"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Research Pulse
          </span>
        </div>

        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          {/* Anchor metric — Total saves */}
          <div className="col-span-4 sm:col-span-3 flex flex-col justify-center border-r border-gray-800 pr-3 sm:pr-4">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              <Bookmark className="w-2.5 h-2.5 text-purple-400" />
              <span>Total saves</span>
            </div>
            <div className="mt-1 font-bold text-white tabular-nums leading-none text-3xl sm:text-4xl">
              {stats.total}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">
              {stats.total === 1 ? 'item' : 'items'} in your library
            </div>
          </div>

          {/* Right column — marquee + footnote stats */}
          <div className="col-span-8 sm:col-span-9 flex flex-col gap-2 min-w-0">
            {/* Marquee — Researcher Overlap (tappable) */}
            <button
              onClick={() => setSheetOpen(true)}
              className={classNames(
                'w-full text-left rounded-lg border px-3 py-2.5 transition-all flex items-center gap-2 group',
                overlapPreview && overlapPreview.total > 0
                  ? 'bg-gradient-to-r from-cyan-500/15 via-cyan-500/10 to-purple-500/10 border-cyan-500/40 hover:border-cyan-400/60'
                  : 'bg-gray-900/40 border-gray-800 hover:border-gray-700',
              )}
              aria-label="Open Researcher Overlap"
            >
              <div className={classNames(
                'p-1.5 rounded-md flex-shrink-0',
                overlapPreview && overlapPreview.total > 0
                  ? 'bg-cyan-500/20 border border-cyan-500/40'
                  : 'bg-gray-800/60 border border-gray-700'
              )}>
                <Users className={classNames(
                  'w-3.5 h-3.5',
                  overlapPreview && overlapPreview.total > 0 ? 'text-cyan-200' : 'text-gray-500'
                )} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-cyan-400">
                    Researcher Overlap
                  </span>
                </div>
                <div className="text-xs text-white font-medium leading-tight mt-0.5 truncate">
                  {!overlapPreview ? (
                    <span className="text-gray-400">Loading overlap…</span>
                  ) : overlapPreview.total === 0 ? (
                    <span className="text-gray-400">Tap to learn how overlap works</span>
                  ) : (
                    <>
                      <span className="tabular-nums font-bold text-cyan-200">{overlapPreview.total}</span>
                      <span className="text-gray-300"> researcher{overlapPreview.total === 1 ? '' : 's'} share your signal</span>
                    </>
                  )}
                </div>
                {overlapPreview && overlapPreview.total > 0 && (
                  <div className="text-[10px] text-gray-500 leading-tight mt-0.5">
                    {overlapPreview.strong > 0 && (
                      <span className="text-cyan-300">{overlapPreview.strong} strong</span>
                    )}
                    {overlapPreview.strong > 0 && overlapPreview.notable > 0 && (
                      <span className="text-gray-600"> · </span>
                    )}
                    {overlapPreview.notable > 0 && (
                      <span>{overlapPreview.notable} notable</span>
                    )}
                  </div>
                )}
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-cyan-300 transition-colors flex-shrink-0" />
            </button>

            {/* Footnote stats row */}
            <div className="flex items-center gap-3 sm:gap-4 text-[11px] text-gray-400 px-1 min-w-0">
              <span className="flex items-center gap-1 min-w-0">
                <Clock className="w-2.5 h-2.5 text-sky-400 flex-shrink-0" />
                <span className="text-gray-500 hidden sm:inline">Last save</span>
                <span className="text-gray-300 truncate">{recencyLabel}</span>
              </span>
              {stats.topCategoryLabel && (
                <>
                  <span className="text-gray-700" aria-hidden>·</span>
                  <span className="flex items-center gap-1 min-w-0">
                    <TrendingUp className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
                    <span className="text-gray-500 hidden sm:inline">30d focus</span>
                    <span className="text-gray-300 truncate">
                      {stats.topCategoryIcon ? stats.topCategoryIcon + ' ' : ''}{stats.topCategoryLabel}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <ResearcherOverlapSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}

// ── Cache helpers ────────────────────────────────────────────

function readOverlapCache(): OverlapPreview | null {
  try {
    const raw = localStorage.getItem(OVERLAP_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > OVERLAP_CACHE_TTL) return null
    return parsed.preview
  } catch { return null }
}
function writeOverlapCache(preview: OverlapPreview) {
  try {
    localStorage.setItem(OVERLAP_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), preview }))
  } catch { /* localStorage unavailable */ }
}
