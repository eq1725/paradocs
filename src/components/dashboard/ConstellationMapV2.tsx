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
import { useForceSimulation, SimNode } from 'A/lib/hooks/useForceSimulation'
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
