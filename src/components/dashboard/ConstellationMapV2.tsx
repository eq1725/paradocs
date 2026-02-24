'use client'

/**
 * ConstellationMapV2 — Interactive, content-driven star map.
 *
 * Each logged report is a star node. Stars cluster into nebulae by category.
 * Connections form from shared tags and user-drawn links.
 * Fully zoomable, pannable, and touch-friendly.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ZoomIn, ZoomOut, Maximize2, Sparkles, Compass, Star } from 'lucide-react'
import Link from 'next/link'
import { useForceSimulation, SimNode } from '@/lib/hooks/useForceSimulation'
import { useCanvasRenderer, RenderState } from '@/lib/hooks/useCanvasRenderer'
import { useMapInteractions, Transform } from '@/lib/hooks/useMapInteractions'
import type { EntryNode, UserMapData } from '@/pages/dashboard/constellation'

interface ConstellationMapV2Props {
  userMapData: UserMapData | null
  onSelectEntry: (entry: EntryNode | null) => void
  selectedEntryId?: string | null
}

export default function ConstellationMapV2({
  userMapData,
  onSelectEntry,
  selectedEntryId,
}: ConstellationMapV2Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const timeRef = useRef(0)

  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null)
  const [highlightedTag, setHighlightedTag] = useState<string | null>(null)

  const entries = userMapData?.entryNodes || []
  const tagConnections = userMapData?.tagConnections || []
  const userConnections = (userMapData?.userConnections || []).map(c => ({
    id: c.id,
    entryAId: c.entryAId,
    entryBId: c.entryBId,
    annotation: c.annotation,
  }))

  // ── Responsive sizing ──
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) {
        setDimensions({ width, height })
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // ── Force simulation ──
  const { nodes, edges, centers, simulation, reheat } = useForceSimulation({
    entries,
    tagConnections,
    userConnections,
    width: dimensions.width,
    height: dimensions.height,
    onTick: () => {}, // rendering handled in animation loop
  })

  // ── Canvas renderer ──
  const { draw, hitTest } = useCanvasRenderer({
    width: dimensions.width,
    height: dimensions.height,
  })

  // ── Interactions ──
  const handleTransformChange = useCallback((t: Transform) => {
    setTransform(t)
  }, [])

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
    // Change cursor
    if (canvasRef.current) {
      canvasRef.current.style.cursor = hit ? 'pointer' : 'grab'
    }
  }, [hitTest, nodes, transform.k])

  const handleBackgroundClick = useCallback(() => {
    onSelectEntry(null)
  }, [onSelectEntry])

  const { zoomIn, zoomOut, resetZoom, centerOn } = useMapInteractions({
    canvasRef,
    width: dimensions.width,
    height: dimensions.height,
    onTransformChange: handleTransformChange,
    onNodeClick: handleNodeClick,
    onNodeHover: handleNodeHover,
    onBackgroundClick: handleBackgroundClick,
  })

  // ── Canvas sizing (handle DPR) ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = dimensions.width * dpr
    canvas.height = dimensions.height * dpr
    canvas.style.width = `${dimensions.width}px`
    canvas.style.height = `${dimensions.height}px`
  }, [dimensions])

  // ── Animation loop ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let running = true

    const animate = () => {
      if (!running) return
      timeRef.current++

      const state: RenderState = {
        transform,
        hoveredNodeId: hoveredNode?.id || null,
        selectedNodeId: selectedEntryId || null,
        highlightedTag,
        time: timeRef.current,
      }

      draw(ctx, nodes.current, edges.current, centers.current, state)
      animFrameRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      running = false
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [draw, transform, hoveredNode, selectedEntryId, highlightedTag])

  // ── Empty state ──
  if (entries.length === 0) {
    return (
      <div ref={containerRef} className="w-full relative" style={{ height: 'clamp(320px, 55vh, 600px)' }}>
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-[#0d0d24] to-gray-950 rounded-2xl overflow-hidden">
          {/* Placeholder star field */}
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: 80 }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-white animate-pulse"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  width: `${Math.random() * 2 + 0.5}px`,
                  height: `${Math.random() * 2 + 0.5}px`,
                  opacity: Math.random() * 0.5 + 0.1,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${2 + Math.random() * 3}s`,
                }}
              />
            ))}
          </div>

          {/* Empty state CTA */}
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-6">
            <div className="text-5xl mb-4">🔭</div>
            <h3 className="text-white font-semibold text-lg mb-2">Your Constellation Awaits</h3>
            <p className="text-gray-400 text-sm text-center max-w-md mb-6">
              Start exploring reports and logging them to your constellation.
              Each report becomes a star, and patterns will emerge as your research grows.
            </p>
            <div className="flex gap-3">
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Browse Reports
              </Link>
              <Link
                href="/discover"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors"
              >
                <Compass className="w-4 h-4" />
                Discover
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Main map ──
  return (
    <div ref={containerRef} className="w-full relative" style={{ height: 'clamp(320px, 55vh, 600px)' }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-2xl"
        style={{ touchAction: 'none' }}
      />

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
        <button
          onClick={zoomIn}
          className="w-8 h-8 bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-500 transition-all"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={zoomOut}
          className="w-8 h-8 bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-500 transition-all"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={resetZoom}
          className="w-8 h-8 bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-500 transition-all"
          title="Reset view"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Hover tooltip */}
      {hoveredNode && !selectedEntryId && (
        <div
          className="absolute pointer-events-none z-20 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg px-3 py-2 text-xs max-w-[200px]"
          style={{
            left: Math.min(
              dimensions.width - 210,
              Math.max(10, hoveredNode.x! * transform.k + transform.x + 15)
            ),
            top: Math.min(
              dimensions.height - 60,
              Math.max(10, hoveredNode.y! * transform.k + transform.y - 10)
            ),
          }}
        >
          <div className="text-white font-medium truncate">{hoveredNode.name}</div>
          <div className="text-gray-400 mt-0.5">
            {VERDICT_LABELS[hoveredNode.verdict] || 'Logged'} · {hoveredNode.tags.length} tags
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-lg px-2.5 py-2 text-[10px] sm:text-xs space-y-1 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]" />
          <span className="text-gray-300">Compelling</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_4px_rgba(96,165,250,0.6)]" />
          <span className="text-gray-300">Inconclusive</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-gray-400">Skeptical</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-400" />
          <span className="text-gray-400">Need More Info</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-px bg-green-400/60" />
          <span className="text-gray-500">Connection</span>
        </div>
      </div>

      {/* Node count */}
      <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 text-[10px] text-gray-600 z-10">
        {entries.length} {entries.length === 1 ? 'star' : 'stars'} · {transform.k.toFixed(1)}x
      </div>
    </div>
  )
}

const VERDICT_LABELS: Record<string, string> = {
  compelling: '⭐ Compelling',
  inconclusive: '🔵 Inconclusive',
  skeptical: '⚪ Skeptical',
  needs_info: '🟣 Needs Info',
}
