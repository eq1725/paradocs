'use client'

/**
 * SavesSwipeView — V10.4 Phase 3
 *
 * Mobile-first replacement for the Lab → Saves grid. Vertical
 * feed of full-width cards with per-card horizontal swipe
 * gestures:
 *
 *   tap       → open NodeDetailPanel (legacy behavior)
 *   swipe ←   → unsave with undo toast (5s window)
 *   swipe →   → open NodeDetailPanel (same as tap, but
 *                discoverable as a deliberate gesture)
 *
 * Visual feedback during drag: red overlay revealed on left,
 * purple on right. Past 100px, the action commits on release.
 *
 * Desktop (>= 640px) collapses to a 2-up grid with the same
 * cards; horizontal-drag still works (with mouse) but tapping
 * is the primary affordance there.
 *
 * Handles QA #3 + #4 (delete affordance on Saves cards) in the
 * same stroke as the swipe redesign — no separate trash button
 * needed on the card since swipe-left covers it, and the
 * NodeDetailPanel trash is preserved for explicit confirms.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar, MapPin, FileText, Users, Sparkles, Trash2, Eye, RotateCcw,
} from 'lucide-react'
import type { EntryNode } from '@/lib/constellation-types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import type { PhenomenonCategory } from '@/lib/database.types'
import CategoryIcon from '@/components/ui/CategoryIcon'
import { unsaveEntry, resaveEntry, type UnsaveTarget } from '@/lib/saves/unsave'

// Distance the touch must travel before we COMMIT the action on release.
const COMMIT_THRESHOLD = 100
// Distance below which the touch is treated as a tap, not a drag.
const TAP_SLOP = 6
// Maximum horizontal travel before we cap the visual offset
// (so a runaway drag doesn't push the card off the page).
const MAX_DRAG = 180

export interface SavesSwipeViewProps {
  entries: EntryNode[]
  /** Open the NodeDetailPanel for a given entry. */
  onSelectEntry: (entry: EntryNode) => void
  /** Called after an unsave commits (parent refetches). */
  onUnsaved: () => void
  /** Render-time hint: layout grid breakpoint. Default: 2-up on sm+. */
  gridClassName?: string
  className?: string
}

interface UndoState {
  entry: EntryNode
  /** ID of the timeout that finalizes the unsave (no-undo). */
  finalizeTimer: number
}

export default function SavesSwipeView({
  entries,
  onSelectEntry,
  onUnsaved,
  gridClassName = 'grid grid-cols-1 sm:grid-cols-2 gap-3',
  className,
}: SavesSwipeViewProps) {
  // Track which entries are currently in their "undo" window so
  // we can hide them from the live list and surface the toast.
  const [pendingUndo, setPendingUndo] = useState<UndoState[]>([])
  // Track the visually-removed entries so we don't show them in
  // the feed while their undo window is open. Keyed by entry.id.
  const pendingIds = useMemo(() => new Set(pendingUndo.map(u => u.entry.id)), [pendingUndo])

  const visibleEntries = useMemo(
    () => entries.filter(e => !pendingIds.has(e.id)),
    [entries, pendingIds],
  )

  // Clean up pending timers if the component unmounts mid-undo.
  useEffect(() => {
    return () => {
      for (const u of pendingUndo) clearTimeout(u.finalizeTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Commit unsave: actually call the API, then refresh ────
  const commitUnsave = useCallback(async (entry: EntryNode) => {
    const target = entryToTarget(entry)
    const result = await unsaveEntry(target)
    if (!result.ok) {
      // Restore visually — the entry was never actually removed.
      setPendingUndo(prev => prev.filter(u => u.entry.id !== entry.id))
      console.warn('[SavesSwipeView] unsave failed:', result.error)
      return
    }
    onUnsaved()
    setPendingUndo(prev => prev.filter(u => u.entry.id !== entry.id))
  }, [onUnsaved])

  // ── Start the swipe-left → unsave flow with a 5s undo window
  const startUnsaveFlow = useCallback((entry: EntryNode) => {
    // Schedule the commit 5 seconds out. If user taps Undo
    // before then, we cancel the timeout and never call the API.
    const finalizeTimer = window.setTimeout(() => {
      commitUnsave(entry)
    }, 5000)
    setPendingUndo(prev => [...prev, { entry, finalizeTimer }])
  }, [commitUnsave])

  // ── Undo: cancel the pending commit, restore the entry ────
  const handleUndo = useCallback((entryId: string) => {
    setPendingUndo(prev => {
      const target = prev.find(u => u.entry.id === entryId)
      if (target) clearTimeout(target.finalizeTimer)
      return prev.filter(u => u.entry.id !== entryId)
    })
  }, [])

  return (
    <div className={className}>
      <div className={gridClassName}>
        {visibleEntries.map(entry => (
          <SwipeCard
            key={entry.id}
            entry={entry}
            onTap={() => onSelectEntry(entry)}
            onSwipeRight={() => onSelectEntry(entry)}
            onSwipeLeft={() => startUnsaveFlow(entry)}
          />
        ))}
      </div>

      {/* Undo toast bar — bottom-centered, one toast per pending
          unsave. Multiple stack vertically. */}
      <UndoStack pending={pendingUndo} onUndo={handleUndo} />
    </div>
  )
}

// ── SwipeCard ────────────────────────────────────────────────

function SwipeCard(props: {
  entry: EntryNode
  onTap: () => void
  onSwipeLeft: () => void
  onSwipeRight: () => void
}) {
  const { entry, onTap, onSwipeLeft, onSwipeRight } = props

  const [dragX, setDragX] = useState(0)
  const [animating, setAnimating] = useState(false)
  const startXRef = useRef<number | null>(null)
  const startYRef = useRef<number | null>(null)
  const lockedAxisRef = useRef<'x' | 'y' | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (animating) return
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    lockedAxisRef.current = null
    setAnimating(false)
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }, [animating])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (startXRef.current === null || startYRef.current === null) return
    const dx = e.clientX - startXRef.current
    const dy = e.clientY - startYRef.current

    // Decide axis on first significant movement so we don't
    // hijack vertical scroll.
    if (!lockedAxisRef.current) {
      if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return
      lockedAxisRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (lockedAxisRef.current === 'y') {
        // Let the page handle vertical scrolling. Cancel the drag.
        startXRef.current = null
        startYRef.current = null
        return
      }
    }

    if (lockedAxisRef.current === 'x') {
      // Cap the drag so a runaway drag doesn't push the card off.
      const capped = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dx))
      setDragX(capped)
      // Prevent vertical scroll once we've claimed the X gesture.
      if ((e as any).preventDefault) (e as any).preventDefault()
    }
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (startXRef.current === null) {
      // We bailed (vertical scroll) — nothing to do.
      return
    }
    const dx = e.clientX - startXRef.current
    startXRef.current = null
    startYRef.current = null
    lockedAxisRef.current = null

    // Tap (no significant drag) → onTap
    if (Math.abs(dx) < TAP_SLOP) {
      setDragX(0)
      onTap()
      return
    }

    if (dx <= -COMMIT_THRESHOLD) {
      // Commit swipe-left → unsave. Animate the card off-screen.
      setAnimating(true)
      setDragX(-MAX_DRAG * 2)
      window.setTimeout(() => {
        onSwipeLeft()
        // The parent's pendingUndo state will pull this card from
        // visibleEntries, so the transform state doesn't matter
        // after this. But reset for safety.
        setDragX(0)
        setAnimating(false)
      }, 200)
    } else if (dx >= COMMIT_THRESHOLD) {
      // Commit swipe-right → open detail. Snap back after
      // triggering so we don't strand the card off-axis.
      onSwipeRight()
      setAnimating(true)
      setDragX(0)
      window.setTimeout(() => setAnimating(false), 200)
    } else {
      // Didn't pass threshold — snap back.
      setAnimating(true)
      setDragX(0)
      window.setTimeout(() => setAnimating(false), 200)
    }
  }, [onTap, onSwipeLeft, onSwipeRight])

  const onPointerCancel = useCallback(() => {
    startXRef.current = null
    startYRef.current = null
    lockedAxisRef.current = null
    setAnimating(true)
    setDragX(0)
    window.setTimeout(() => setAnimating(false), 200)
  }, [])

  // Action-reveal overlays — the colored backdrop visible BEHIND
  // the card as it moves out of the way.
  const leftReveal = dragX < 0
  const revealOpacity = Math.min(1, Math.abs(dragX) / COMMIT_THRESHOLD)

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Left action backdrop (unsave) */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-end pr-4 bg-rose-600/30 border border-rose-500/50"
        style={{ opacity: leftReveal ? revealOpacity : 0 }}
      >
        <div className="flex items-center gap-1.5 text-rose-100">
          <Trash2 className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Unsave</span>
        </div>
      </div>

      {/* Right action backdrop (open) */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-start pl-4 bg-purple-600/25 border border-purple-500/50"
        style={{ opacity: !leftReveal && dragX > 0 ? revealOpacity : 0 }}
      >
        <div className="flex items-center gap-1.5 text-purple-100">
          <Eye className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Open</span>
        </div>
      </div>

      {/* The card itself, draggable */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="relative bg-gray-950 border border-gray-800 rounded-xl overflow-hidden touch-pan-y select-none cursor-grab active:cursor-grabbing"
        style={{
          transform: 'translateX(' + dragX + 'px)',
          transition: animating ? 'transform 200ms ease-out' : 'none',
        }}
      >
        <CardBody entry={entry} />
      </div>
    </div>
  )
}

// ── CardBody — the actual visual ────────────────────────────

function CardBody({ entry }: { entry: EntryNode }) {
  const catConfig = (CATEGORY_CONFIG as any)[entry.category]
  const catLabel = (catConfig && catConfig.label) || 'Save'
  const isExternal = !!entry.sourceType && entry.sourceType !== 'paradocs_report'
  const community = typeof entry.communitySaveCount === 'number' ? entry.communitySaveCount : 0

  return (
    <div className="flex items-stretch gap-0">
      {/* Left thumb */}
      <div className="relative w-24 sm:w-28 flex-shrink-0 bg-gray-900 overflow-hidden">
        {entry.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-950">
            <CategoryIcon category={entry.category as PhenomenonCategory} size={32} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={
            'inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ' +
            (isExternal
              ? 'bg-gray-800 border border-gray-700 text-gray-300'
              : 'bg-purple-600/15 border border-purple-500/30 text-purple-200')
          }>
            {isExternal ? (entry.sourcePlatform || 'External') : catLabel}
          </span>
          {community > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-cyan-300/80">
              <Users className="w-2.5 h-2.5" />
              {community}
            </span>
          )}
        </div>

        <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">
          {entry.name || 'Untitled source'}
        </h3>

        {entry.summary && (
          <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">
            {entry.summary}
          </p>
        )}
        {!entry.summary && entry.note && (
          <p className="text-[11px] text-gray-400 leading-snug line-clamp-2 flex items-start gap-1">
            <FileText className="w-2.5 h-2.5 text-gray-600 mt-0.5 flex-shrink-0" />
            <span>{entry.note}</span>
          </p>
        )}

        <div className="flex items-center gap-2 mt-auto text-[10px] text-gray-600">
          {entry.locationName && (
            <span className="inline-flex items-center gap-0.5 min-w-0 truncate">
              <MapPin className="w-2.5 h-2.5" />
              <span className="truncate">{entry.locationName}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-0.5 ml-auto flex-shrink-0">
            <Calendar className="w-2.5 h-2.5" />
            {new Date(entry.loggedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── UndoStack — bottom-fixed undo toast row ─────────────────

function UndoStack(props: { pending: UndoState[]; onUndo: (entryId: string) => void }) {
  if (props.pending.length === 0) return null
  return (
    <div
      className="fixed left-0 right-0 z-50 flex flex-col items-center gap-2 px-3 pointer-events-none"
      style={{ bottom: 'max(76px, env(safe-area-inset-bottom, 0px) + 76px)' }}
      aria-live="polite"
    >
      {props.pending.slice().reverse().map(p => (
        <div
          key={p.entry.id}
          className="pointer-events-auto inline-flex items-center gap-2 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-full pl-3 pr-1 py-1 shadow-lg max-w-[92vw]"
          role="status"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-300 flex-shrink-0" />
          <span className="text-xs text-white truncate">Removed “{p.entry.name || 'save'}”</span>
          <button
            type="button"
            onClick={() => props.onUndo(p.entry.id)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-semibold transition-colors flex-shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            Undo
          </button>
        </div>
      ))}
    </div>
  )
}

// ── EntryNode → UnsaveTarget mapping ────────────────────────

function entryToTarget(entry: EntryNode): UnsaveTarget {
  return {
    id: entry.id,
    isLegacyBookmark: !!(entry as any).isLegacyBookmark,
    isPhenomenonSave: (entry as any).isPhenomenonSave === true || (entry.id || '').indexOf('savedphen:') === 0,
    reportId: (entry as any).reportId || null,
    phenomenonId: (entry as any).phenomenonId || null,
    artifactId: (entry as any).artifactId || null,
  }
}

// Export the helpers callers might want to reuse.
export { entryToTarget, resaveEntry }
