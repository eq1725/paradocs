/**
 * useCanvasRenderer — Canvas drawing logic for the constellation star map.
 *
 * Renders background stars, dust patches, category nebulae, entry star nodes,
 * connection lines, and category labels. Drawing detail scales with zoom level.
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
  const smallCount = Math.floor(count * 0.75)
  const largeCount = count - smallCount

  const smallStars: BgStar[] = Array.from({ length: smallCount }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: Math.random() * 1.2 + 0.3,
    alpha: Math.random() * 0.5 + 0.15,
    twinkleSpeed: Math.random() * 0.025 + 0.008,
    twinklePhase: Math.random() * Math.PI * 2,
  }))

  const largeStars: BgStar[] = Array.from({ length: largeCount }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: Math.random() * 1.5 + 1.5,
    alpha: Math.random() * 0.3 + 0.3,
    twinkleSpeed: Math.random() * 0.015 + 0.005,
    twinklePhase: Math.random() * Math.PI * 2,
  }))

  return [...smallStars, ...largeStars]
}

// ── Dust Patches (fixed positions, very subtle background nebula) ──

const DUST_PATCHES = [
  { x: 0.2, y: 0.3, color: '#8b5cf6', baseAlpha: 0.015 },
  { x: 0.7, y: 0.15, color: '#3b82f6', baseAlpha: 0.012 },
  { x: 0.15, y: 0.75, color: '#ec4899', baseAlpha: 0.01 },
  { x: 0.85, y: 0.6, color: '#06b6d4', baseAlpha: 0.012 },
  { x: 0.5, y: 0.5, color: '#f97316', baseAlpha: 0.008 },
]

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
  const bgStarsRef = useRef<BgStar[]>(generateBgStars(380))
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

    // Background stars + dust patches (fixed, don't move with zoom)
    drawBackgroundStars(ctx, width, height, time)

    // Apply zoom transform for all world-space content
    ctx.save()
    ctx.translate(transform.x, transform.y)
    ctx.scale(zoom, zoom)

    // Color ring: 11 category arcs around the outer edge. Replaces the old
    // "floating emoji clouds" — the ring is now the primary category affordance.
    drawCategoryRing(ctx, centers, zoom, time)

    // Subtle brand glyph at the center of the ring, behind everything else.
    drawCenterGlyph(ctx, width, height, zoom)

    // Tag connection edges (subtle, drawn behind nodes)
    drawEdges(ctx, nodes, edges, zoom, highlightedTag, selectedNodeId, 'tag')

    // Entry star nodes
    drawNodes(ctx, nodes, zoom, time, hoveredNodeId, selectedNodeId, highlightedTag)

    // User connection edges (prominent, drawn on top of nodes so they're always visible)
    drawEdges(ctx, nodes, edges, zoom, highlightedTag, selectedNodeId, 'user')

    ctx.restore()
    ctx.restore()
  }, [width, height])

  // ── Drawing Functions ──

  function drawBackgroundStars(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
    // Subtle dust nebula patches (very low alpha, slow breathing)
    DUST_PATCHES.forEach(patch => {
      const x = patch.x * w
      const y = patch.y * h
      const radius = 150 + Math.sin(time * 0.001) * 20

      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
      const alpha = patch.baseAlpha * (0.8 + 0.2 * Math.sin(time * 0.0008))
      grad.addColorStop(0, hexToRGBA(patch.color, alpha * 2))
      grad.addColorStop(0.5, hexToRGBA(patch.color, alpha))
      grad.addColorStop(1, hexToRGBA(patch.color, 0))

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    })

    // Individual background stars
    const stars = bgStarsRef.current
    stars.forEach(star => {
      const twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase)
      const alpha = star.alpha * (0.6 + 0.4 * twinkle)
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.beginPath()
      ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  /**
   * Paint the outer color ring — 11 arcs, one per phenomena category.
   * Replaces the old scattered nebula clouds. Each arc is tinted with the
   * category's CATEGORY_GLOW color. Category labels render inside the arc
   * following its curvature (like a clock face with words instead of numbers).
   *
   * Segments with zero logged entries render at reduced saturation so the
   * ring visually encodes "where the user has investigated" vs. empty territory.
   */
  function drawCategoryRing(
    ctx: CanvasRenderingContext2D,
    centers: CategoryCenter[],
    zoom: number,
    time: number
  ) {
    if (centers.length === 0) return

    // All centers share the same ring geometry — pull from the first entry.
    const first = centers[0]
    const cx = first.x - Math.cos(first.angleRad) * first.ringRadius
    const cy = first.y - Math.sin(first.angleRad) * first.ringRadius
    const rOuter = first.ringOuterRadius
    const rInner = first.ringInnerRadius
    const rMid = (rOuter + rInner) / 2
    const bandWidth = rOuter - rInner

    centers.forEach(center => {
      const color = CATEGORY_GLOW[center.id] || '#666666'
      const isActive = center.entryCount > 0

      // Arc bounds (start/end angles). Subtract a hair from each side so
      // segments don't quite touch — creates thin divider lines naturally.
      const halfArc = center.arcWidthRad / 2
      const gap = 0.004 // ~0.23° gap
      const startA = center.angleRad - halfArc + gap
      const endA = center.angleRad + halfArc - gap

      // Band alpha: saturated for active categories, faint for empty ones.
      // Active categories also get a subtle pulse synced to time.
      const baseAlpha = isActive ? 0.55 : 0.12
      const pulse = isActive ? 0.1 * Math.sin(time * 0.006) : 0
      const bandAlpha = Math.max(0.08, Math.min(0.75, baseAlpha + pulse))

      // Build a radial gradient from inner→outer so the ring has depth.
      const grad = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter)
      grad.addColorStop(0.0, hexToRGBA(color, bandAlpha * 0.5))
      grad.addColorStop(0.5, hexToRGBA(color, bandAlpha))
      grad.addColorStop(1.0, hexToRGBA(color, bandAlpha * 0.6))

      // Draw the arc segment as a donut wedge
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, rOuter, startA, endA)
      ctx.arc(cx, cy, rInner, endA, startA, true)
      ctx.closePath()
      ctx.fill()

      // Inner rim highlight — a thin bright line on the inner edge of the arc
      // makes the ring look like it's illuminating the field inside.
      ctx.strokeStyle = hexToRGBA(color, isActive ? 0.75 : 0.18)
      ctx.lineWidth = Math.max(1.5, 2 / zoom)
      ctx.beginPath()
      ctx.arc(cx, cy, rInner, startA, endA)
      ctx.stroke()
    })

    // Category labels — text follows the arc's curvature, centered in each segment.
    // Only render when zoomed in enough to be legible (avoid clutter at low zoom).
    if (zoom < 0.55) return

    centers.forEach(center => {
      const label = center.label
      const isActive = center.entryCount > 0
      const textAlpha = isActive ? 0.95 : 0.35

      // Position text at ring mid-radius, following the arc.
      const fontSize = Math.max(9, Math.min(12, 11 / zoom))
      ctx.font = `600 ${fontSize}px 'Space Grotesk', Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Text curves along the arc. Compute arc length of the label and
      // space characters proportionally.
      const a = center.angleRad
      // For labels on the bottom half of the ring (angle between 0 and π),
      // we flip the text so it's not upside-down.
      const flip = a > 0 && a < Math.PI
      const labelR = flip ? rMid - bandWidth * 0.12 : rMid + bandWidth * 0.12

      ctx.save()
      ctx.translate(cx + Math.cos(a) * labelR, cy + Math.sin(a) * labelR)
      ctx.rotate(a + (flip ? -Math.PI / 2 : Math.PI / 2))
      // Text shadow for readability
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
      ctx.fillText(label, 0.5, 0.5)
      ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`
      ctx.fillText(label, 0, 0)
      ctx.restore()

      // Entry count badge just inside the ring, on the node-facing edge.
      if (isActive) {
        const countR = rInner - bandWidth * 0.4
        const countFont = Math.max(8, Math.min(10, 9 / zoom))
        ctx.font = `500 ${countFont}px Inter, system-ui, sans-serif`
        ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha * 0.65})`
        ctx.fillText(
          String(center.entryCount),
          cx + Math.cos(a) * countR,
          cy + Math.sin(a) * countR
        )
      }
    })
  }

  /**
   * Subtle Paradocs brand glyph at the ring's center — acts as a visual
   * anchor (like the grey "W" in Wikipedia's Science Communities vis).
   * Kept very low-opacity so it fades into the background without competing
   * with the stars.
   */
  function drawCenterGlyph(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    zoom: number
  ) {
    const cx = w / 2
    const cy = h / 2
    const minDim = Math.min(w, h)
    const size = minDim * 0.14

    // Soft glow disc
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 1.2)
    glow.addColorStop(0, 'rgba(139, 92, 246, 0.08)') // violet
    glow.addColorStop(1, 'rgba(139, 92, 246, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, size * 1.2, 0, Math.PI * 2)
    ctx.fill()

    // Paradocs-style star glyph: two crossed soft diamonds forming a compass rose.
    // Rendered at low opacity so it reads as a watermark, not a focal point.
    ctx.save()
    ctx.globalAlpha = 0.22
    ctx.fillStyle = '#a78bfa' // violet-300

    // Vertical diamond
    ctx.beginPath()
    ctx.moveTo(cx, cy - size)
    ctx.lineTo(cx + size * 0.18, cy)
    ctx.lineTo(cx, cy + size)
    ctx.lineTo(cx - size * 0.18, cy)
    ctx.closePath()
    ctx.fill()

    // Horizontal diamond
    ctx.beginPath()
    ctx.moveTo(cx - size, cy)
    ctx.lineTo(cx, cy - size * 0.18)
    ctx.lineTo(cx + size, cy)
    ctx.lineTo(cx, cy + size * 0.18)
    ctx.closePath()
    ctx.fill()

    // Center dot
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(1.5, size * 0.06), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  function drawEdges(
    ctx: CanvasRenderingContext2D,
    nodes: SimNode[],
    edges: SimEdge[],
    zoom: number,
    highlightedTag: string | null,
    selectedNodeId: string | null,
    typeFilter?: 'tag' | 'user'
  ) {
    // Skip edges at very low zoom (too cluttered)
    if (zoom < 0.4) return

    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    edges.forEach(edge => {
      // Filter by type if specified
      if (typeFilter && edge.type !== typeFilter) return
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
        // User-drawn connections: prominent green with glow aura
        alpha = isHighlighted ? 0.9 : 0.55
        lineWidth = isHighlighted ? 3 : 2
        color = '#22c55e' // green

        // Glow aura behind user connections
        ctx.strokeStyle = hexToRGBA(color, isHighlighted ? 0.35 : 0.2)
        ctx.lineWidth = (lineWidth * 3.5) / zoom
        ctx.beginPath()
        ctx.moveTo(source.x!, source.y!)
        ctx.lineTo(target.x!, target.y!)
        ctx.stroke()
      } else {
        // Tag connections: subtle, more visible when highlighted
        alpha = isHighlighted ? 0.6 : 0.08
        lineWidth = isHighlighted ? 1.5 : 0.5
        const sourceColor = CATEGORY_GLOW[source.category] || '#888888'
        color = source.category === target.category ? sourceColor : '#888888'
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
      // External (user-added) stars render smaller and dimmer than Paradocs
      // reports — a visual hint that this is Layer 2 content.
      const isExternal = !!node.sourceType && node.sourceType !== 'paradocs_report'
      const externalScale = isExternal ? 0.75 : 1.0
      const r = (node.radius * externalScale) / Math.max(zoom, 0.5)

      const isHovered = node.id === hoveredId
      const isSelected = node.id === selectedId
      const isTagHighlighted = highlightedTag && node.tags.includes(highlightedTag)
      const isActive = isHovered || isSelected || isTagHighlighted

      const verdictColor = VERDICT_COLORS[node.verdict] || '#9ca3af'
      const catGlow = CATEGORY_GLOW[node.category] || '#666666'

      // Glow effect for active nodes
      if (isActive) {
        const glowR = r * 5
        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR)
        glow.addColorStop(0, hexToRGBA(verdictColor, 0.5))
        glow.addColorStop(0.5, hexToRGBA(verdictColor, 0.15))
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

      // External artifacts render at reduced alpha so the eye immediately
      // distinguishes user-sourced content (Layer 2) from Paradocs-curated
      // content (Layer 1). Active/hover states still go full brightness.
      if (isExternal && !isActive) {
        ctx.save()
        ctx.globalAlpha = 0.65
      }

      // Draw enhanced star with multi-layer glow, diffraction spikes, and twinkle
      drawEnhancedStar(ctx, x, y, displayR, verdictColor, catGlow, !!isActive, time, node.verdict, node.id)

      if (isExternal && !isActive) {
        ctx.restore()
      }

      // Hover-only label: show name only when hovered or selected
      if (isActive) {
        const fontSize = Math.max(10, Math.min(13, 12 / zoom))
        ctx.font = `600 ${fontSize}px 'Space Grotesk', Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        const label = node.name.length > 28 ? node.name.slice(0, 26) + '…' : node.name
        const textY = y + displayR + 6 / zoom

        // Text shadow for readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillText(label, x + 0.5 / zoom, textY + 0.5 / zoom)

        // Label text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.fillText(label, x, textY)
      }
    })
  }

  // (drawCategoryLabels removed — labels now render as part of the ring above.
  // The old floating emoji + text at each category center was the thing that
  // made the map feel like a Slack thread. Ring labels replaced it.)

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

// ── Enhanced Star Rendering ──

/**
 * Draw a realistic star node with diffraction spikes, multi-layer glow, and twinkle.
 *
 * Rendering order (back to front):
 * 1. Very soft outer halo (largest, very transparent)
 * 2. Medium glow layer (category color)
 * 3. Bright core body (verdict color with twinkle)
 * 4. Diffraction spikes (compelling/active stars only)
 * 5. Center highlight (white)
 */
function drawEnhancedStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseRadius: number,
  verdictColor: string,
  catGlow: string,
  isActive: boolean,
  time: number,
  verdict: string,
  nodeId: string
) {
  // Per-star twinkle: deterministic phase from node ID
  const phase = (hashString(nodeId) % 1000) / 1000 * Math.PI * 2
  const twinkle = Math.sin(time * 0.04 + phase) * 0.25 + 0.75 // 0.5 to 1.0

  // Layer 1: Outer halo (very soft, large)
  const outerHaloR = baseRadius * 3.5
  const outerGrad = ctx.createRadialGradient(x, y, 0, x, y, outerHaloR)
  outerGrad.addColorStop(0, hexToRGBA(verdictColor, 0.08 * twinkle))
  outerGrad.addColorStop(0.5, hexToRGBA(verdictColor, 0.02))
  outerGrad.addColorStop(1, hexToRGBA(verdictColor, 0))
  ctx.fillStyle = outerGrad
  ctx.beginPath()
  ctx.arc(x, y, outerHaloR, 0, Math.PI * 2)
  ctx.fill()

  // Layer 2: Medium glow (category color)
  const medGlowR = baseRadius * 2.2
  const medGrad = ctx.createRadialGradient(x, y, baseRadius * 0.7, x, y, medGlowR)
  medGrad.addColorStop(0, hexToRGBA(catGlow, 0.2 * twinkle))
  medGrad.addColorStop(0.6, hexToRGBA(catGlow, 0.05))
  medGrad.addColorStop(1, hexToRGBA(catGlow, 0))
  ctx.fillStyle = medGrad
  ctx.beginPath()
  ctx.arc(x, y, medGlowR, 0, Math.PI * 2)
  ctx.fill()

  // Layer 3: Bright core (verdict color with twinkle)
  const coreAlpha = 0.85 * twinkle
  ctx.fillStyle = hexToRGBA(verdictColor, coreAlpha)
  ctx.beginPath()
  ctx.arc(x, y, baseRadius, 0, Math.PI * 2)
  ctx.fill()

  // Layer 4: Diffraction spikes (compelling stars or active nodes)
  if (isActive || verdict === 'compelling') {
    const spikeLen = baseRadius * (isActive ? 3.0 : 2.5)
    const spikeW = baseRadius * 0.2
    const spikeAlpha = (isActive ? 0.6 : 0.4) * twinkle

    ctx.save()
    ctx.globalAlpha = spikeAlpha
    ctx.fillStyle = '#ffffff'

    // Horizontal spike (tapered)
    ctx.beginPath()
    ctx.moveTo(x - spikeLen, y)
    ctx.lineTo(x - spikeW, y - spikeW * 0.5)
    ctx.lineTo(x + spikeW, y - spikeW * 0.5)
    ctx.lineTo(x + spikeLen, y)
    ctx.lineTo(x + spikeW, y + spikeW * 0.5)
    ctx.lineTo(x - spikeW, y + spikeW * 0.5)
    ctx.closePath()
    ctx.fill()

    // Vertical spike (tapered)
    ctx.beginPath()
    ctx.moveTo(x, y - spikeLen)
    ctx.lineTo(x - spikeW * 0.5, y - spikeW)
    ctx.lineTo(x - spikeW * 0.5, y + spikeW)
    ctx.lineTo(x, y + spikeLen)
    ctx.lineTo(x + spikeW * 0.5, y + spikeW)
    ctx.lineTo(x + spikeW * 0.5, y - spikeW)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  // Layer 5: Bright center dot
  const centerAlpha = (0.7 + 0.2 * twinkle) * (isActive ? 1.0 : 0.8)
  ctx.fillStyle = `rgba(255, 255, 255, ${centerAlpha})`
  ctx.beginPath()
  ctx.arc(x, y, baseRadius * 0.35, 0, Math.PI * 2)
  ctx.fill()
}

// ── Utility Functions ──

function hexToRGBA(hex: string, alpha: number): string {
  if (!hex || hex.length < 4) return 'rgba(128, 128, 128, ' + alpha + ')'
  // Support 3-char hex (#abc -> #aabbcc)
  if (hex.length === 4) {
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
  }
  var r = parseInt(hex.slice(1, 3), 16)
  var g = parseInt(hex.slice(3, 5), 16)
  var b = parseInt(hex.slice(5, 7), 16)
  if (isNaN(r)) r = 128
  if (isNaN(g)) g = 128
  if (isNaN(b)) b = 128
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
}

/** Deterministic hash for per-node twinkle phase */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

/** Shift hue of a hex color by degrees (for nebula color variation) */
function shiftHue(hex: string, degrees: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  h = ((h * 360 + degrees) % 360) / 360

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p2 = 2 * l - q2
  const rr = Math.round(hue2rgb(p2, q2, h + 1 / 3) * 255)
  const gg = Math.round(hue2rgb(p2, q2, h) * 255)
  const bb = Math.round(hue2rgb(p2, q2, h - 1 / 3) * 255)

  return '#' + [rr, gg, bb].map(x => x.toString(16).padStart(2, '0')).join('')
}

/** Linear interpolation between two hex colors */
function lerpColor(hex1: string, hex2: string, t: number): string {
  const r1 = parseInt(hex1.slice(1, 3), 16)
  const g1 = parseInt(hex1.slice(3, 5), 16)
  const b1 = parseInt(hex1.slice(5, 7), 16)
  const r2 = parseInt(hex2.slice(1, 3), 16)
  const g2 = parseInt(hex2.slice(3, 5), 16)
  const b2 = parseInt(hex2.slice(5, 7), 16)

  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)

  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}
