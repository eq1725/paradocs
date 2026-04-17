'use client'

/**
 * ConstellationMapV2 — Cosmic-web star map.
 *
 * Renders the user's research universe as an organic network of glowing
 * nodes connected by filaments (cosmic-web / neural-net aesthetic).
 *
 * Key features:
 *   - Teaser-galaxy blend for users with <5 real saves (so the canvas never
 *     looks empty)
 *   - Category filter dimming (non-matching stars fade)
 *   - Fullscreen immersive mode (takes over the viewport, hides all chrome)
 *   - Neural-impulse animation when a node is selected (pulses travel along
 *     filaments to all connected nodes)
 *   - prefers-reduced-motion support — disables all ambient motion
 */

import React, { useEffect, useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import { ZoomIn, ZoomOut, Maximize2, Sparkles, Compass, Maximize, Minimize } from 'lucide-react'
import Link from 'next/link'
import { useForceSimulation, SimNode } from '@/lib/hooks/useForceSimulation'
import { useCanvasRenderer, RenderState, Impulse } from '@/lib/hooks/useCanvasRenderer'
import { useMapInteractions, Transform } from '@/lib/hooks/useMapInteractions'
import type { EntryNode, UserMapData } from '@/lib/constellation-types'
import {
  getTeaserGhosts,
  getTeaserTagConnections,
  TEASER_THRESHOLD,
} from '@/lib/constellation-teaser'

interface ConstellationMapV2Props {
  userMapData: UserMapData | null
  onSelectEntry: (entry: EntryNode | null) => void
  selectedEntryId?: string | null
  /** Category filter — if set, dims non-matching stars + filaments */
  selectedCategory?: string | null
  /** Fullscreen immersive mode */
  isImmersive?: boolean
  onToggleImmersive?: () => void
  /**
   * Arbitrary overlay content rendered absolutely at the top-right of the
   * canvas container — used for the desktop sidebar. Hidden automatically
   * below the sm breakpoint so mobile can show a dedicated pill strip.
   */
  overlay?: React.ReactNode
  /** Precomputed AI connections so parent + child share the same detection. */
  aiConnections?: Array<{ source: string; target: string; strength: number; reasons: string[] }>
  /** Called when the insights panel wants to pan the camera — returns via ref instead. */
}

/** Imperative handle exposed to parents for pan/highlight control. */
export interface ConstellationMapHandle {
  /** Pan + zoom to fit the given entries, pulse each one visibly */
  highlightEntries: (entryIds: string[]) => void
}

function ConstellationMapV2Inner({
  userMapData,
  onSelectEntry,
  selectedEntryId,
  selectedCategory = null,
  isImmersive = false,
  onToggleImmersive,
  overlay,
  aiConnections: aiConnectionsProp = [],
}: ConstellationMapV2Props, ref: React.Ref<ConstellationMapHandle>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)

  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null)
  const [highlightedTag] = useState<string | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  // ── Detect prefers-reduced-motion ──
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener?.('change', handler)
    return () => mq.removeEventListener?.('change', handler)
  }, [])

  // ── Blend real entries with teaser ghosts when the user has <5 saves ──
  const realEntries = userMapData?.entryNodes || []
  const realTagConnections = userMapData?.tagConnections || []
  const realCount = realEntries.length
  const shouldTeaser = realCount < TEASER_THRESHOLD

  const { entries, tagConnections } = useMemo(() => {
    if (!shouldTeaser) {
      return { entries: realEntries, tagConnections: realTagConnections }
    }
    // Ghosts go first (drawn behind), real stars layer on top
    const ghosts = getTeaserGhosts()
    const ghostTags = getTeaserTagConnections()
    return {
      entries: [...ghosts, ...realEntries],
      tagConnections: [...ghostTags, ...realTagConnections],
    }
  }, [realEntries, realTagConnections, shouldTeaser])

  const userConnections = useMemo(() =>
    (userMapData?.userConnections || []).map(c => ({
      id: c.id,
      entryAId: c.entryAId,
      entryBId: c.entryBId,
      annotation: c.annotation,
    })),
    [userMapData?.userConnections]
  )

  // AI connections are computed in the parent (MapTab) against the real
  // entries only — teaser ghosts don't generate pattern insights. Passed
  // down here so the force simulation and renderer can draw them.
  const aiConnections = aiConnectionsProp

  // ── Responsive sizing ──
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(rEntries => {
      const { width, height } = rEntries[0].contentRect
      if (width > 0 && height > 0) {
        setDimensions({ width, height })
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [isImmersive])

  // ── Force simulation ──
  const { nodes, edges, centers } = useForceSimulation({
    entries,
    tagConnections,
    userConnections,
    aiConnections,
    width: dimensions.width,
    height: dimensions.height,
    onTick: () => {},
  })

  // ── Canvas renderer ──
  const { draw, hitTest } = useCanvasRenderer({
    width: dimensions.width,
    height: dimensions.height,
  })

  // ── Interactions ──
  const handleTransformChange = useCallback((t: Transform) => { setTransform(t) }, [])

  const handleNodeClick = useCallback((worldX: number, worldY: number) => {
    const hit = hitTest(worldX, worldY, nodes.current, transform.k)
    if (hit) {
      const entry = entries.find(e => e.id === hit.id)
      onSelectEntry(entry || null)
    } else {
      onSelectEntry(null)
    }
  }, [entries, hitTest, nodes, onSelectEntry, transform.k])

  const handleNodeHover = useCallback((worldX: number, worldY: number) => {
    const hit = hitTest(worldX, worldY, nodes.current, transform.k)
    setHoveredNode(hit)
    if (canvasRef.current) {
      canvasRef.current.style.cursor = hit ? 'pointer' : 'grab'
    }
  }, [hitTest, nodes, transform.k])

  const handleBackgroundClick = useCallback(() => { onSelectEntry(null) }, [onSelectEntry])

  const { zoomIn, zoomOut, resetZoom, centerOn } = useMapInteractions({
    canvasRef,
    width: dimensions.width,
    height: dimensions.height,
    onTransformChange: handleTransformChange,
    onNodeClick: handleNodeClick,
    onNodeHover: handleNodeHover,
    onBackgroundClick: handleBackgroundClick,
  })

  // ── Canvas sizing (DPR-aware) ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = dimensions.width * dpr
    canvas.height = dimensions.height * dpr
    canvas.style.width = `${dimensions.width}px`
    canvas.style.height = `${dimensions.height}px`
  }, [dimensions])

  // ── Neural impulse queue ──
  // Three sources spawn impulses:
  //   - selectedEntryId change → strong impulse (intensity 1.0, 850ms)
  //   - hoveredNode change   → light impulse (intensity 0.4, 550ms)
  //   - ambient cycle        → faint random impulse (intensity 0.3, 700ms)
  // All three can coexist on the same frame. Expired impulses prune every
  // ~300ms so the array stays short.
  const impulsesRef = useRef<Impulse[]>([])

  const pushImpulse = useCallback((originId: string, intensity: number, duration: number) => {
    // Avoid stacking duplicate impulses on the same node within the same
    // animation window — the repeated overlap looks glitchy.
    const now = performance.now()
    const existing = impulsesRef.current.find(i => i.originId === originId && now - i.startMs < 200)
    if (existing) return
    impulsesRef.current = [
      ...impulsesRef.current.filter(i => now - i.startMs < i.duration + 100),
      { originId, intensity, duration, startMs: now },
    ]
  }, [])

  // Select impulse
  useEffect(() => {
    if (!selectedEntryId) return
    pushImpulse(selectedEntryId, 1.0, 850)
  }, [selectedEntryId, pushImpulse])

  // Imperative handle — lets the InsightsPanel pan the camera to a group of
  // stars and pulse them. Implementation: compute the bounding box of the
  // matching nodes, call centerOn with a scale chosen to fit with padding,
  // then push a strong impulse on each so they visibly "wake up."
  useImperativeHandle(ref, () => ({
    highlightEntries(entryIds: string[]) {
      if (!entryIds.length) return
      const matching = nodes.current.filter(n => entryIds.includes(n.id))
      if (matching.length === 0) return

      // Bounding box in world space
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const n of matching) {
        const nx = n.x!, ny = n.y!
        if (nx < minX) minX = nx
        if (nx > maxX) maxX = nx
        if (ny < minY) minY = ny
        if (ny > maxY) maxY = ny
      }
      const cxBox = (minX + maxX) / 2
      const cyBox = (minY + maxY) / 2
      const w = Math.max(maxX - minX, 120)
      const h = Math.max(maxY - minY, 120)
      // Scale so the bbox fits in ~60% of the viewport (padding for breathing room)
      const sx = (dimensions.width * 0.6) / w
      const sy = (dimensions.height * 0.6) / h
      const scale = Math.max(0.6, Math.min(2.5, Math.min(sx, sy)))

      centerOn(cxBox, cyBox, scale, 600)

      // Fire a strong impulse on each highlighted star after a short delay
      // so the pulse lands mid-pan (maxes out attention).
      setTimeout(() => {
        matching.forEach(n => pushImpulse(n.id, 1.0, 900))
      }, 250)
    },
  }), [nodes, dimensions.width, dimensions.height, centerOn, pushImpulse])

  // Hover impulse — only for real (non-ghost) nodes. Skipped when the user
  // has reduced-motion on.
  useEffect(() => {
    if (!hoveredNode || hoveredNode.isGhost || reducedMotion) return
    pushImpulse(hoveredNode.id, 0.4, 550)
  }, [hoveredNode, pushImpulse, reducedMotion])

  // Ambient impulse cycle — every 8–12s pick a random node (real or ghost
  // in teaser mode) and fire a faint pulse. Gives the galaxy a "thinking"
  // feel without the user having to interact.
  useEffect(() => {
    if (reducedMotion) return
    let cancelled = false
    const scheduleNext = () => {
      if (cancelled) return
      const delay = 8000 + Math.random() * 4000
      setTimeout(() => {
        if (cancelled) return
        const pool = nodes.current
        if (pool.length > 0) {
          const pick = pool[Math.floor(Math.random() * pool.length)]
          pushImpulse(pick.id, 0.3, 700)
        }
        scheduleNext()
      }, delay)
    }
    scheduleNext()
    return () => { cancelled = true }
  }, [reducedMotion, nodes, pushImpulse])

  // ── Refs for stable animation loop ──
  const transformRef = useRef(transform)
  const hoveredNodeRef = useRef<SimNode | null>(hoveredNode)
  const selectedEntryIdRef = useRef<string | null | undefined>(selectedEntryId)
  const highlightedTagRef = useRef<string | null>(highlightedTag)
  const selectedCategoryRef = useRef<string | null>(selectedCategory)
  const reducedMotionRef = useRef(reducedMotion)
  useEffect(() => { transformRef.current = transform }, [transform])
  useEffect(() => { hoveredNodeRef.current = hoveredNode }, [hoveredNode])
  useEffect(() => { selectedEntryIdRef.current = selectedEntryId }, [selectedEntryId])
  useEffect(() => { highlightedTagRef.current = highlightedTag }, [highlightedTag])
  useEffect(() => { selectedCategoryRef.current = selectedCategory }, [selectedCategory])
  useEffect(() => { reducedMotionRef.current = reducedMotion }, [reducedMotion])

  // ── Animation loop ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let running = true

    const animate = () => {
      if (!running) return
      const nowMs = performance.now()

      // Prune expired impulses once per frame so the array stays short.
      if (impulsesRef.current.length > 0) {
        impulsesRef.current = impulsesRef.current.filter(
          i => nowMs - i.startMs < i.duration + 100
        )
      }

      const state: RenderState = {
        transform: transformRef.current,
        hoveredNodeId: hoveredNodeRef.current?.id || null,
        selectedNodeId: selectedEntryIdRef.current || null,
        highlightedTag: highlightedTagRef.current,
        selectedCategory: selectedCategoryRef.current,
        time: nowMs,
        impulses: impulsesRef.current,
        reducedMotion: reducedMotionRef.current,
      }

      draw(ctx, nodes.current, edges.current, centers.current, state)
      animFrameRef.current = requestAnimationFrame(animate)
    }

    animate()
    return () => {
      running = false
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [draw, entries.length])

  // ── Escape key exits immersive ──
  useEffect(() => {
    if (!isImmersive || !onToggleImmersive) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggleImmersive()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isImmersive, onToggleImmersive])

  // ── Truly empty state (0 real saves, teaser still renders in canvas) ──
  // We still render the canvas + ghost galaxy but overlay a strong CTA on top.
  const showTeaserCTA = shouldTeaser
  const savesRemaining = Math.max(0, TEASER_THRESHOLD - realCount)

  // ── Container styling ──
  const containerClass = isImmersive
    ? 'fixed inset-0 z-50 bg-black'
    : 'relative w-full rounded-2xl overflow-hidden'
  const containerStyle: React.CSSProperties = isImmersive
    ? {}
    : { height: 'clamp(360px, 62vh, 720px)' }

  return (
    <div ref={containerRef} className={containerClass} style={containerStyle}>
      <canvas
        ref={canvasRef}
        className={isImmersive ? 'block w-full h-full' : 'block w-full h-full rounded-2xl'}
        style={{ touchAction: 'none' }}
      />

      {/* Zoom controls — stacked top-right */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 z-20">
        <button
          onClick={zoomIn}
          className="w-9 h-9 bg-black/55 backdrop-blur-md border border-white/10 rounded-lg flex items-center justify-center text-gray-300 hover:text-white hover:border-white/20 transition-all"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={zoomOut}
          className="w-9 h-9 bg-black/55 backdrop-blur-md border border-white/10 rounded-lg flex items-center justify-center text-gray-300 hover:text-white hover:border-white/20 transition-all"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={resetZoom}
          className="w-9 h-9 bg-black/55 backdrop-blur-md border border-white/10 rounded-lg flex items-center justify-center text-gray-300 hover:text-white hover:border-white/20 transition-all"
          title="Reset view"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        {/* Fullscreen toggle */}
        {onToggleImmersive && (
          <button
            onClick={onToggleImmersive}
            className="w-9 h-9 bg-black/55 backdrop-blur-md border border-white/10 rounded-lg flex items-center justify-center text-gray-300 hover:text-white hover:border-white/20 transition-all"
            title={isImmersive ? 'Exit fullscreen' : 'Fullscreen galaxy view'}
          >
            {isImmersive ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Overlay slot — sidebar, legends, etc. Hidden on mobile (sm and down).
          Anchored top-left so zoom controls (top-right) have room to breathe. */}
      {overlay && (
        <div className="hidden sm:block absolute top-3 left-3 z-20">
          {overlay}
        </div>
      )}

      {/* Hover tooltip (skipped for ghosts because ghosts can't be hovered) */}
      {hoveredNode && !selectedEntryId && !hoveredNode.isGhost && (
        <div
          className="absolute pointer-events-none z-30 bg-black/75 backdrop-blur-md border border-white/10 rounded-lg px-3 py-1.5 text-xs max-w-[220px]"
          style={{
            left: Math.min(
              dimensions.width - 230,
              Math.max(10, hoveredNode.x! * transform.k + transform.x + 16)
            ),
            top: Math.min(
              dimensions.height - 48,
              Math.max(10, hoveredNode.y! * transform.k + transform.y - 10)
            ),
          }}
        >
          <div className="text-white font-medium truncate leading-tight">{hoveredNode.name}</div>
          {hoveredNode.tags.length > 0 && (
            <div className="text-gray-400 text-[10px] mt-0.5">
              {hoveredNode.tags.slice(0, 3).map(t => '#' + t).join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Teaser CTA overlay — floats over the ghost galaxy */}
      {showTeaserCTA && !isImmersive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="pointer-events-auto bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl px-5 py-4 max-w-[340px] text-center">
            <div className="text-3xl mb-2">🌌</div>
            <h3 className="text-white font-semibold text-sm mb-1">
              {realCount === 0 ? 'A preview of your universe' : 'Keep building'}
            </h3>
            <p className="text-gray-400 text-xs leading-relaxed mb-3">
              {realCount === 0
                ? 'Save reports or paste links to start lighting up real stars. Right now you\'re seeing ghost constellations — yours will replace them.'
                : `Save ${savesRemaining} more ${savesRemaining === 1 ? 'source' : 'sources'} to claim the full galaxy.`}
            </p>
            <div className="flex gap-2 justify-center">
              <Link
                href="/discover"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-primary-600 hover:bg-primary-500 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Browse feed
              </Link>
              <Link
                href="/explore"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 bg-white/5 hover:bg-white/10 transition-colors"
              >
                <Compass className="w-3.5 h-3.5" />
                Explore
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Bottom-left meter — stars + zoom indicator. Compact for mobile. */}
      <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-md border border-white/5 rounded-md px-2 py-1 text-[10px] text-gray-400 z-10">
        {realCount} {realCount === 1 ? 'star' : 'stars'} · {transform.k.toFixed(1)}x
      </div>
    </div>
  )
}

// Wrap in forwardRef so callers can grab the imperative handle for pan-to-highlight.
const ConstellationMapV2 = forwardRef<ConstellationMapHandle, ConstellationMapV2Props>(ConstellationMapV2Inner)
ConstellationMapV2.displayName = 'ConstellationMapV2'
export default ConstellationMapV2
