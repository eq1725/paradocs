/**
 * useCanvasRenderer — Canvas drawing logic for the constellation star map.
 *
 * Renders background stars, category nebulae, entry star nodes, connection lines,
 * and labels. Drawing detail scales with zoom level.
 */

import { useCallback, useRef } from 'react'
import type { SimNode, SimEdge, CategoryCenter } from './useForceSimulation'

// ── Color Constants ──

const VERDICT_COLORS: Record<string, string> = {
  compelling: '#fbbf24',   // amber-400
  inconclusive: '#60a5fa', // blue-400
  skeptical: '#9ca3af',    // gray-400
  needs_info: '#a78bfa',   // purple-400
}

const CATEGORY_GLOW: Record<string, string> = {
  ufos_aliens: '#22c55e',
  cryptids: '#f59e0b',
  ghosts_hauntings: '#a855f7',
  psychic_phenomena: '#3b82f6',
  consciousness_practices: '#8b5cf6',
  psychological_experiences: '#ec4899',
  biological_factors: '#14b8a6',
  perception_sensory: '#06b6d4',
  religion_mythology: '#f97316',
  esoteric_practices: '#6366f1',
  combination: '#64748b',
}

// ── Background Stars ──

interface BgStar {
  x: number
  y: number
  size: number
  alpha: number
  twinkleSpeed: number
  twinklePhase: number
}

function generateBgStars(count: number): BgStar[] {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: Math.random() * 1.5 + 0.3,
    alpha: Math.random() * 0.6 + 0.2,
    twinkleSpeed: Math.random() * 0.02 + 0.005,
    twinklePhase: Math.random() * Math.PI * 2,
  }))
}

// ── Types ──

export interface RenderState {
  transform: { x: number; y: number; k: number } // d3 zoom transform
  hoveredNodeId: string | null
  selectedNodeId: string | null
  highlightedTag: string | null
  time: number // animation frame count
}

interface UseCanvasRendererProps {
  width: number
  height: number
}

export function useCanvasRenderer({ width, height }: UseCanvasRendererProps) {
  const bgStarsRef = useRef<BgStar[]>(generateBgStars(180))
  const dprRef = useRef(typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1)

  const draw = useCallback((
    ctx: CanvasRenderingContext2D,
    nodes: SimNode[],
    edges: SimEdge[],
    centers: CategoryCenter[],
    state: RenderState
  ) => {
    const { transform, hoveredNodeId, selectedNodeId, highlightedTag, time } = state
    const dpr = dprRef.current
    const zoom = transform.k

    // Clear
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height)
    bgGrad.addColorStop(0, '#0a0a1a')
    bgGrad.addColorStop(0.5, '#0d0d24')
    bgGrad.addColorStop(1, '#080818')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, width, height)

    // Background stars (fixed, don't move with zoom)
    drawBackgroundStars(ctx, width, height, time)

    // Apply zoom transform for all world-space content
    ctx.save()
    ctx.translate(transform.x, transform.y)
    ctx.scale(zoom, zoom)

    // Nebulae (category region glows)
    drawNebulae(ctx, centers, zoom, nodes)

    // Connection edges
    drawEdges(ctx, nodes, edges, zoom, highlightedTag, selectedNodeId)

    // Entry star nodes
    drawNodes(ctx, nodes, zoom, time, hoveredNodeId, selectedNodeId, highlightedTag)

    // Category labels
    drawCategoryLabels(ctx, centers, zoom)

    ctx.restore()
    ctx.restore()
  }, [width, height])

  // ── Drawing Functions ──

  function drawBackgroundStars(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
    const stars = bgStarsRef.current
    stars.forEach(star => {
      const twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase)
      const alpha = star.alpha * (0.7 + 0.3 * twinkle)
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.beginPath()
      ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  function drawNebulae(ctx: CanvasRenderingContext2D, centers: CategoryCenter[], zoom: number, nodes: SimNode[]) {
    centers.forEach(center => {
      if (center.entryCount === 0) return

      const glowColor = CATEGORY_GLOW[center.id] || '#666'
      // Nebula radius scales with entry count
      const baseRadius = 60 + Math.min(center.entryCount * 12, 120)
      const alpha = Math.min(0.08 + center.entryCount * 0.015, 0.25)

      const grad = ctx.createRadialGradient(
        center.x, center.y, 0,
        center.x, center.y, baseRadius
      )
      grad.addColorStop(0, hexToRGBA(glowColor, alpha * 1.5))
      grad.addColorStop(0.4, hexToRGBA(glowColor, alpha))
      grad.addColorStop(1, hexToRGBA(glowColor, 0))

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(center.x, center.y, baseRadius, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  function drawEdges(
    ctx: CanvasRenderingContext2D,
    nodes: SimNode[],
    edges: SimEdge[],
    zoom: number,
    highlightedTag: string | null,
    selectedNodeId: string | null
  ) {
    // Skip edges at very low zoom (too cluttered)
    if (zoom < 0.4) return

    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    edges.forEach(edge => {
      const source = nodeMap.get(typeof edge.source === 'string' ? edge.source : (edge.source as any).id)
      const target = nodeMap.get(typeof edge.target === 'string' ? edge.target : (edge.target as any).id)
      if (!source || !target) return

      const isHighlighted = (
        (highlightedTag && edge.type === 'tag' && edge.label === highlightedTag) ||
        (selectedNodeId && (source.id === selectedNodeId || target.id === selectedNodeId))
      )

      let alpha: number
      let lineWidth: number
      let color: string

      if (edge.type === 'user') {
        // User-drawn connections: always visible, bright
        alpha = isHighlighted ? 0.8 : 0.4
        lineWidth = isHighlighted ? 2 : 1.2
        color = '#22c55e' // green
      } else {
        // Tag connections: subtle, more visible when highlighted
        alpha = isHighlighted ? 0.6 : 0.12
        lineWidth = isHighlighted ? 1.5 : 0.5
        const sourceColor = CATEGORY_GLOW[source.category] || '#888'
        const targetColor = CATEGORY_GLOW[target.category] || '#888'
        color = source.category === target.category ? sourceColor : '#888'
      }

      ctx.strokeStyle = hexToRGBA(color, alpha)
      ctx.lineWidth = lineWidth / zoom
      ctx.beginPath()
      ctx.moveTo(source.x!, source.y!)
      ctx.lineTo(target.x!, target.y!)
      ctx.stroke()
    })
  }

  function drawNodes(
    ctx: CanvasRenderingContext2D,
    nodes: SimNode[],
    zoom: number,
    time: number,
    hoveredId: string | null,
    selectedId: string | null,
    highlightedTag: string | null
  ) {
    nodes.forEach(node => {
      const x = node.x!
      const y = node.y!
      const r = node.radius / Math.max(zoom, 0.5)

      const isHovered = node.id === hoveredId
      const isSelected = node.id === selectedId
      const isTagHighlighted = highlightedTag && node.tags.includes(highlightedTag)
      const isActive = isHovered || isSelected || isTagHighlighted

      const verdictColor = VERDICT_COLORS[node.verdict] || '#9ca3af'
      const catGlow = CATEGORY_GLOW[node.category] || '#666'

      // Glow effect for active nodes
      if (isActive) {
        const glowR = r * 4
        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR)
        glow.addColorStop(0, hexToRGBA(verdictColor, 0.5))
        glow.addColorStop(1, hexToRGBA(verdictColor, 0))
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(x, y, glowR, 0, Math.PI * 2)
        ctx.fill()
      }

      // Pulse animation for selected node
      let displayR = r
      if (isSelected) {
        displayR = r * (1 + 0.15 * Math.sin(time * 0.06))
      }

      // Outer glow ring
      const outerGlow = ctx.createRadialGradient(x, y, displayR * 0.5, x, y, displayR * 2)
      outerGlow.addColorStop(0, hexToRGBA(catGlow, 0.3))
      outerGlow.addColorStop(1, hexToRGBA(catGlow, 0))
      ctx.fillStyle = outerGlow
      ctx.beginPath()
      ctx.arc(x, y, displayR * 2, 0, Math.PI * 2)
      ctx.fill()

      // Main star body
      ctx.fillStyle = verdictColor
      ctx.beginPath()
      ctx.arc(x, y, displayR, 0, Math.PI * 2)
      ctx.fill()

      // Bright center
      ctx.fillStyle = `rgba(255, 255, 255, ${isActive ? 0.9 : 0.6})`
      ctx.beginPath()
      ctx.arc(x, y, displayR * 0.4, 0, Math.PI * 2)
      ctx.fill()

      // Name label (only at decent zoom or when hovered/selected)
      if (zoom > 0.8 || isActive) {
        const fontSize = Math.max(9, Math.min(12, 11 / zoom))
        ctx.font = `${isActive ? '600' : '400'} ${fontSize}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)'
        ctx.fillText(
          node.name.length > 22 ? node.name.slice(0, 20) + '…' : node.name,
          x,
          y + displayR + 4 / zoom
        )
      }
    })
  }

  function drawCategoryLabels(ctx: CanvasRenderingContext2D, centers: CategoryCenter[], zoom: number) {
    centers.forEach(center => {
      // Smooth fade: full opacity below 1.5x, fade out between 1.5x-3x, gone above 3x
      let zoomFade = 1
      if (zoom > 1.5) {
        zoomFade = Math.max(0, 1 - (zoom - 1.5) / 1.5)
      }
      if (zoomFade <= 0.01) return

      const baseAlpha = center.entryCount > 0 ? 0.7 : 0.3
      const alpha = baseAlpha * zoomFade
      const fontSize = Math.max(11, Math.min(14, 13 / zoom))

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Icon above label
      ctx.font = `${fontSize * 1.5}px sans-serif`
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.fillText(center.icon, center.x, center.y - fontSize * 1.2)

      // Label
      ctx.font = `600 ${fontSize}px 'Space Grotesk', Inter, system-ui, sans-serif`
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`
      ctx.fillText(center.label, center.x, center.y + fontSize * 0.4)

      // Entry count badge
      if (center.entryCount > 0) {
        ctx.font = `400 ${fontSize * 0.75}px Inter, system-ui, sans-serif`
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`
        ctx.fillText(`${center.entryCount} logged`, center.x, center.y + fontSize * 1.5)
      }
    })
  }

  // Hit-test: find which node is at the given world coordinates
  const hitTest = useCallback((
    worldX: number,
    worldY: number,
    nodes: SimNode[],
    zoom: number
  ): SimNode | null => {
    // Check in reverse order (top-most drawn last)
    const hitRadius = Math.max(12, 20 / zoom) // generous tap target
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      const dx = worldX - node.x!
      const dy = worldY - node.y!
      if (dx * dx + dy * dy < hitRadius * hitRadius) {
        return node
      }
    }
    return null
  }, [])

  return { draw, hitTest }
}

// ── Utility ──

function hexToRGBA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
