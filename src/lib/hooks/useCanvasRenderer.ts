/**
 * useCanvasRenderer — Cosmic-web renderer for the constellation map.
 *
 * Visual model: a deep-space network where nodes are galaxies/neurons and
 * connections are cosmic filaments / synaptic pathways. Heavy use of
 * additive blending (`globalCompositeOperation = 'lighter'`) so overlapping
 * glows blossom into bright cores — the technique that separates "OK glow"
 * from "actual light."
 *
 * Layer order (back to front):
 *   1. Deep-space gradient background
 *   2. Far parallax dust (slow drift, large dim gas clouds)
 *   3. Fixed background starfield (twinkling)
 *   4. Near parallax dust (fast drift, small bright specks)
 *   5. Category nebulae (soft diffuse glows at each gravity well)
 *   6. Filaments (bezier curves, glow aura + bright core, additive)
 *   7. Node glow auras (largest, softest, additive)
 *   8. Node mid halos (category-tinted, additive)
 *   9. Node cores (verdict-colored)
 *  10. Node center highlights (white)
 *  11. Neural impulses traveling along filaments (additive, time-limited)
 *  12. Diffraction spikes (compelling + active stars only)
 *  13. Hover/selection labels
 *
 * Respects prefers-reduced-motion — all ambient animation pauses.
 */

import { useCallback, useEffect, useRef } from 'react'
import type { SimNode, SimEdge, CategoryCenter } from './useForceSimulation'

// ── Color palette ──

const VERDICT_COLORS: Record<string, string> = {
  compelling: '#fbbf24',    // amber
  inconclusive: '#60a5fa',  // blue
  skeptical: '#9ca3af',     // gray
  needs_info: '#a78bfa',    // purple
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

// ── Dust particle system ──
//
// Two parallax layers create depth: far dust drifts slowly with low alpha,
// near dust drifts faster with higher alpha. Both wrap around the canvas
// edges so the field feels infinite.

interface DustParticle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
  hue: string
}

function generateDust(count: number, fast: boolean): DustParticle[] {
  const speed = fast ? 0.12 : 0.035
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * speed,
    vy: (Math.random() - 0.5) * speed,
    size: fast ? 0.8 + Math.random() * 1.2 : 0.4 + Math.random() * 1.0,
    alpha: fast ? 0.25 + Math.random() * 0.3 : 0.08 + Math.random() * 0.15,
    hue: Math.random() < 0.5
      ? 'rgba(168, 139, 255, {a})'       // violet
      : 'rgba(120, 175, 255, {a})',      // blue
  }))
}

// ── Background starfield (fixed positions, only twinkle) ──

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
    size: Math.random() * 1.2 + 0.3,
    alpha: Math.random() * 0.45 + 0.15,
    twinkleSpeed: Math.random() * 0.0015 + 0.0005,
    twinklePhase: Math.random() * Math.PI * 2,
  }))
}

// ── Render state ──

/**
 * A single neural impulse animation. Many can be active at once — hover
 * fires short light impulses, select fires a big one, an ambient cycle
 * fires slow gentle ones. Each decays independently.
 */
export interface Impulse {
  originId: string
  startMs: number
  /** 0-1 brightness multiplier. Hover ≈ 0.4, select ≈ 1.0, ambient ≈ 0.3 */
  intensity: number
  /** ms; renderer fades the pulse over this window */
  duration: number
}

export interface RenderState {
  transform: { x: number; y: number; k: number }
  hoveredNodeId: string | null
  selectedNodeId: string | null
  highlightedTag: string | null
  /** Category filter — if set, non-matching nodes + filaments dim to ~12% alpha */
  selectedCategory: string | null
  /** Wall-clock ms, used for all time-based animation (prefers stable across framerate) */
  time: number
  /** All active neural impulses. Renderer skips expired ones automatically. */
  impulses: Impulse[]
  /** Respect prefers-reduced-motion — disables all ambient motion */
  reducedMotion: boolean
}

interface UseCanvasRendererProps {
  width: number
  height: number
}

// ── Helpers ──

function hexToRGBA(hex: string, alpha: number): string {
  if (!hex || hex.length < 4) return `rgba(128, 128, 128, ${alpha})`
  if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash)
}

/** Smooth ease-in-out curve for impulse animations */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

// ── Hook ──

export function useCanvasRenderer({ width, height }: UseCanvasRendererProps) {
  // Particle counts scale with viewport area — fewer on mobile.
  // Kept in refs so the arrays survive re-renders; re-generated only when
  // the viewport crosses a size threshold.
  const isMobile = width < 640
  const bgStarsRef = useRef<BgStar[]>(generateBgStars(isMobile ? 120 : 260))
  const farDustRef = useRef<DustParticle[]>(generateDust(isMobile ? 60 : 130, false))
  const nearDustRef = useRef<DustParticle[]>(generateDust(isMobile ? 25 : 55, true))
  const dprRef = useRef(typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1)
  const lastFrameRef = useRef<number>(0)

  // Regen particles if the viewport size moved across the mobile threshold.
  // Avoids the mobile density persisting into a desktop session and vice versa.
  useEffect(() => {
    const nowMobile = width < 640
    bgStarsRef.current = generateBgStars(nowMobile ? 120 : 260)
    farDustRef.current = generateDust(nowMobile ? 60 : 130, false)
    nearDustRef.current = generateDust(nowMobile ? 25 : 55, true)
  }, [width < 640]) // eslint-disable-line react-hooks/exhaustive-deps

  const draw = useCallback((
    ctx: CanvasRenderingContext2D,
    nodes: SimNode[],
    edges: SimEdge[],
    centers: CategoryCenter[],
    state: RenderState
  ) => {
    const {
      transform, hoveredNodeId, selectedNodeId, highlightedTag,
      selectedCategory, time, impulses, reducedMotion,
    } = state
    const dpr = dprRef.current
    const zoom = transform.k

    // Compute animation time delta. If the renderer is running at stable fps,
    // this is just the ms since the last frame; used to advance dust positions.
    const dt = lastFrameRef.current > 0 ? Math.min(time - lastFrameRef.current, 64) : 16
    lastFrameRef.current = time
    const dtScale = reducedMotion ? 0 : dt / 16.67  // normalized to "frames at 60fps"

    // ── 1. Clear + gradient background ──
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.75)
    bgGrad.addColorStop(0, '#0a0a1f')
    bgGrad.addColorStop(0.5, '#07071a')
    bgGrad.addColorStop(1, '#030308')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, width, height)

    // ── 2. Far parallax dust (behind everything) ──
    drawDust(ctx, farDustRef.current, dtScale, width, height)

    // ── 3. Fixed background starfield with twinkle ──
    drawBgStars(ctx, bgStarsRef.current, width, height, time, reducedMotion)

    // ── 4. Near parallax dust (on top of stars for depth) ──
    drawDust(ctx, nearDustRef.current, dtScale, width, height)

    // World-space transform applied for everything below (zoom/pan)
    ctx.save()
    ctx.translate(transform.x, transform.y)
    ctx.scale(zoom, zoom)

    // ── 5. Category nebulae (soft glows at each gravity well) ──
    drawNebulae(ctx, centers, time, reducedMotion, selectedCategory, zoom)

    // ── 6. Filaments (ADDITIVE BLEND) ──
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    drawFilaments(ctx, nodes, edges, zoom, time, selectedNodeId, selectedCategory, highlightedTag, reducedMotion)
    ctx.restore()

    // ── 7–10. Nodes (multi-layer glow + core) ──
    drawNodes(ctx, nodes, zoom, time, hoveredNodeId, selectedNodeId, highlightedTag, selectedCategory)

    // ── 11. Neural impulses along filaments (ADDITIVE BLEND, time-bounded) ──
    if (!reducedMotion && impulses.length > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const imp of impulses) {
        drawImpulses(ctx, nodes, edges, imp, time, zoom)
      }
      ctx.restore()
    }

    // ── 13. Hover / selection labels ──
    drawLabels(ctx, nodes, zoom, hoveredNodeId, selectedNodeId)

    ctx.restore()
    ctx.restore()
  }, [width, height])

  // ── Drawing primitives ──

  function drawDust(
    ctx: CanvasRenderingContext2D,
    particles: DustParticle[],
    dtScale: number,
    w: number,
    h: number
  ) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const p of particles) {
      // Advance position & wrap. Coordinates are normalized 0-1 so they
      // scale cleanly with canvas resizes.
      p.x += (p.vx * dtScale) / Math.max(w, 1)
      p.y += (p.vy * dtScale) / Math.max(h, 1)
      if (p.x < 0) p.x += 1
      if (p.x > 1) p.x -= 1
      if (p.y < 0) p.y += 1
      if (p.y > 1) p.y -= 1

      ctx.fillStyle = p.hue.replace('{a}', String(p.alpha))
      ctx.beginPath()
      ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  function drawBgStars(
    ctx: CanvasRenderingContext2D,
    stars: BgStar[],
    w: number,
    h: number,
    time: number,
    reducedMotion: boolean
  ) {
    for (const star of stars) {
      const twinkle = reducedMotion
        ? 0
        : Math.sin(time * star.twinkleSpeed + star.twinklePhase)
      const alpha = star.alpha * (0.6 + 0.4 * twinkle)
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.beginPath()
      ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawNebulae(
    ctx: CanvasRenderingContext2D,
    centers: CategoryCenter[],
    time: number,
    reducedMotion: boolean,
    selectedCategory: string | null,
    zoom: number
  ) {
    // ── Glow pass (additive) ──
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const c of centers) {
      if (c.entryCount === 0) continue
      const selected = !selectedCategory || selectedCategory === c.id
      const color = CATEGORY_GLOW[c.id] || '#666'
      const baseR = 90 + Math.min(c.entryCount * 22, 170)
      const breathing = reducedMotion ? 0 : 0.04 * Math.sin(time * 0.0008 + hashString(c.id))
      const r = baseR * (1 + breathing)
      const maxAlpha = Math.min(0.10 + c.entryCount * 0.012, 0.18) * (selected ? 1 : 0.25)

      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r)
      grad.addColorStop(0, hexToRGBA(color, maxAlpha * 1.4))
      grad.addColorStop(0.4, hexToRGBA(color, maxAlpha * 0.5))
      grad.addColorStop(1, hexToRGBA(color, 0))
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // ── Label pass (normal blend) ──
    // Labels appear when zoomed out to help users orient, then fade as they
    // zoom in to see individual stars and the labels would become clutter.
    // Full opacity below zoom 0.7, linearly fades to 0 between 0.7 and 1.2.
    let labelAlpha = 1
    if (zoom >= 1.2) labelAlpha = 0
    else if (zoom > 0.7) labelAlpha = 1 - (zoom - 0.7) / 0.5
    if (labelAlpha <= 0.02) return

    for (const c of centers) {
      if (c.entryCount === 0) continue
      const selected = !selectedCategory || selectedCategory === c.id
      const a = labelAlpha * (selected ? 1 : 0.35)

      // Typography scales with zoom so labels stay readable even at tiny zoom.
      const iconSize = Math.max(14, Math.min(24, 20 / zoom))
      const nameSize = Math.max(10, Math.min(14, 12 / zoom))
      const countSize = Math.max(8, Math.min(11, 10 / zoom))

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Icon
      ctx.font = `${iconSize}px sans-serif`
      ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.85})`
      ctx.fillText(c.icon, c.x, c.y - iconSize * 0.6)

      // Name — soft shadow for legibility over bright nebulae
      ctx.font = `600 ${nameSize}px 'Space Grotesk', Inter, system-ui, sans-serif`
      ctx.fillStyle = `rgba(0, 0, 0, ${a * 0.55})`
      ctx.fillText(c.label, c.x + 1, c.y + iconSize * 0.4 + 1)
      ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.85})`
      ctx.fillText(c.label, c.x, c.y + iconSize * 0.4)

      // Count badge
      ctx.font = `500 ${countSize}px Inter, system-ui, sans-serif`
      ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.5})`
      ctx.fillText(
        `${c.entryCount} ${c.entryCount === 1 ? 'star' : 'stars'}`,
        c.x,
        c.y + iconSize * 0.4 + nameSize * 1.2
      )
    }
  }

  function drawFilaments(
    ctx: CanvasRenderingContext2D,
    nodes: SimNode[],
    edges: SimEdge[],
    zoom: number,
    time: number,
    selectedNodeId: string | null,
    selectedCategory: string | null,
    highlightedTag: string | null,
    reducedMotion: boolean
  ) {
    if (zoom < 0.35) return // too cluttered at extreme zoom-out
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    for (const edge of edges) {
      const src = nodeMap.get(typeof edge.source === 'string' ? edge.source : (edge.source as any).id)
      const tgt = nodeMap.get(typeof edge.target === 'string' ? edge.target : (edge.target as any).id)
      if (!src || !tgt) continue

      const isHighlighted = (
        (selectedNodeId && (src.id === selectedNodeId || tgt.id === selectedNodeId)) ||
        (highlightedTag && edge.type === 'tag' && edge.label === highlightedTag)
      )

      // Dimmed if selectedCategory is set and neither endpoint matches.
      const catDim = !!selectedCategory && src.category !== selectedCategory && tgt.category !== selectedCategory

      // Strength modulates opacity: a strong connection reads as a brighter
      // thread. Clamped so the weakest edges still faintly exist.
      const strengthBoost = 0.5 + edge.strength * 0.6

      // Style per edge type:
      //   user  → saturated green, thick, solid — intentional bond, shout it
      //   ai    → muted teal, thin solid (dash removed), subtle pulse — present
      //           but never louder than the stars themselves
      //   tag   → category-colored, thinnest, solid, most subtle
      const isUser = edge.type === 'user'
      const isAI = edge.type === 'ai'
      const baseColor = isUser
        ? '#22c55e'
        : isAI
          ? '#5eb8c4'  // desaturated teal — less "neon cyan" than #67e8f9
          : (CATEGORY_GLOW[src.category] || '#8ea2b8')

      // Baseline opacity per type. AI pulled back from 0.42 → 0.22 so it no
      // longer dominates the composition; still readable when scanned for.
      const baseByType = isUser ? 0.55 : isAI ? 0.22 : 0.14
      const activeByType = isUser ? 0.9 : isAI ? 0.7 : 0.55
      let alpha = (isHighlighted ? activeByType : baseByType) * strengthBoost
      if (catDim && !isHighlighted) alpha *= 0.15

      // AI edges pulse barely — 5% amplitude. Gives a sign of life without
      // "look at me" flashing. Phase-varied per edge so pulses aren't synced.
      if (isAI && !reducedMotion) {
        const pulsePhase = hashString(src.id + tgt.id) % 1000 / 1000 * Math.PI * 2
        const pulse = 0.05 * Math.sin(time * 0.0015 + pulsePhase)
        alpha = Math.max(0.06, alpha + pulse)
      }

      // Bezier curvature: midpoint offset perpendicular — organic, never
      // colliding as straight lines.
      const mx = (src.x + tgt.x) / 2
      const my = (src.y + tgt.y) / 2
      const dx = tgt.x - src.x
      const dy = tgt.y - src.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const curveSeed = hashString(src.id + tgt.id) % 100
      const curveScale = ((curveSeed - 50) / 50) * 0.1
      const cx = mx - (dy / len) * len * curveScale
      const cy = my + (dx / len) * len * curveScale

      // AI edges render solid now, not dashed. The hierarchy (hue + weight +
      // alpha) already tells users these are inferred; dashes were adding
      // visual noise without extra information value.
      ctx.setLineDash([])

      // Glow pass (wider, softer). AI glow is subtle — 2.4 instead of 3.2.
      const glowWidth = (isUser ? 4.5 : isAI ? 2.4 : 2.5) / Math.max(zoom, 0.5)
      ctx.strokeStyle = hexToRGBA(baseColor, alpha * 0.5)
      ctx.lineWidth = glowWidth
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(src.x, src.y)
      ctx.quadraticCurveTo(cx, cy, tgt.x, tgt.y)
      ctx.stroke()

      // Core pass (thin, bright). AI core slimmed to 0.8 — it reads as
      // "also present" instead of "primary visual element."
      const coreWidth = (isUser ? 1.3 : isAI ? 0.8 : 0.6) / Math.max(zoom, 0.5)
      ctx.strokeStyle = hexToRGBA(baseColor, Math.min(alpha * 1.4, 0.85))
      ctx.lineWidth = coreWidth
      ctx.beginPath()
      ctx.moveTo(src.x, src.y)
      ctx.quadraticCurveTo(cx, cy, tgt.x, tgt.y)
      ctx.stroke()
    }
  }

  function drawNodes(
    ctx: CanvasRenderingContext2D,
    nodes: SimNode[],
    zoom: number,
    time: number,
    hoveredId: string | null,
    selectedId: string | null,
    highlightedTag: string | null,
    selectedCategory: string | null
  ) {
    // Split draw into additive glow pass + normal core pass so cores read
    // crisply over the glow.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const node of nodes) {
      drawNodeGlow(ctx, node, zoom, time, hoveredId, selectedId, highlightedTag, selectedCategory)
    }
    ctx.restore()

    // Normal-blend core pass
    for (const node of nodes) {
      drawNodeCore(ctx, node, zoom, time, hoveredId, selectedId, highlightedTag, selectedCategory)
    }
  }

  function drawNodeGlow(
    ctx: CanvasRenderingContext2D,
    node: SimNode,
    zoom: number,
    time: number,
    hoveredId: string | null,
    selectedId: string | null,
    highlightedTag: string | null,
    selectedCategory: string | null
  ) {
    const x = node.x!
    const y = node.y!
    const isExternal = !!node.sourceType && node.sourceType !== 'paradocs_report'
    const externalScale = isExternal ? 0.78 : 1
    const isHovered = node.id === hoveredId
    const isSelected = node.id === selectedId
    const isTagHL = highlightedTag && node.tags.includes(highlightedTag)
    const isActive = isHovered || isSelected || isTagHL

    const catDim = !!selectedCategory && node.category !== selectedCategory
    const ghostFactor = node.isGhost ? 0.5 : 1
    const dimFactor = (catDim && !isActive ? 0.15 : 1) * ghostFactor

    const r = (node.radius * externalScale) / Math.max(zoom, 0.5)
    const verdictColor = VERDICT_COLORS[node.verdict] || '#9ca3af'
    const catColor = CATEGORY_GLOW[node.category] || '#666'

    // Per-node deterministic twinkle phase so stars don't breathe in unison.
    const phase = (hashString(node.id) % 1000) / 1000 * Math.PI * 2
    const twinkle = 0.75 + 0.25 * Math.sin(time * 0.002 + phase)
    const activeBoost = isActive ? 1.6 : 1

    // Layer 1: outer halo (category-tinted, very soft, very large)
    const haloR = r * 6 * activeBoost
    const haloGrad = ctx.createRadialGradient(x, y, 0, x, y, haloR)
    haloGrad.addColorStop(0, hexToRGBA(catColor, 0.12 * twinkle * dimFactor))
    haloGrad.addColorStop(0.4, hexToRGBA(catColor, 0.03 * dimFactor))
    haloGrad.addColorStop(1, hexToRGBA(catColor, 0))
    ctx.fillStyle = haloGrad
    ctx.beginPath()
    ctx.arc(x, y, haloR, 0, Math.PI * 2)
    ctx.fill()

    // Layer 2: mid aura (verdict-tinted, brighter)
    const auraR = r * 3.0 * activeBoost
    const auraGrad = ctx.createRadialGradient(x, y, 0, x, y, auraR)
    auraGrad.addColorStop(0, hexToRGBA(verdictColor, 0.35 * twinkle * dimFactor))
    auraGrad.addColorStop(0.6, hexToRGBA(verdictColor, 0.08 * dimFactor))
    auraGrad.addColorStop(1, hexToRGBA(verdictColor, 0))
    ctx.fillStyle = auraGrad
    ctx.beginPath()
    ctx.arc(x, y, auraR, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawNodeCore(
    ctx: CanvasRenderingContext2D,
    node: SimNode,
    zoom: number,
    time: number,
    hoveredId: string | null,
    selectedId: string | null,
    highlightedTag: string | null,
    selectedCategory: string | null
  ) {
    const x = node.x!
    const y = node.y!
    const isExternal = !!node.sourceType && node.sourceType !== 'paradocs_report'
    const externalScale = isExternal ? 0.78 : 1
    const isHovered = node.id === hoveredId
    const isSelected = node.id === selectedId
    const isTagHL = highlightedTag && node.tags.includes(highlightedTag)
    const isActive = isHovered || isSelected || isTagHL
    const catDim = !!selectedCategory && node.category !== selectedCategory
    const ghostFactor = node.isGhost ? 0.5 : 1
    const dimFactor = (catDim && !isActive ? 0.15 : 1) * ghostFactor

    let r = (node.radius * externalScale) / Math.max(zoom, 0.5)
    if (isSelected) r *= 1 + 0.12 * Math.sin(time * 0.008)

    const verdictColor = VERDICT_COLORS[node.verdict] || '#9ca3af'
    const phase = (hashString(node.id) % 1000) / 1000 * Math.PI * 2
    const twinkle = 0.8 + 0.2 * Math.sin(time * 0.002 + phase)

    // Slight alpha wash for externals so they read as dimmer content.
    const externalAlpha = isExternal && !isActive ? 0.78 : 1

    // Core disc (verdict color)
    ctx.fillStyle = hexToRGBA(verdictColor, 0.9 * twinkle * externalAlpha * dimFactor)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()

    // Diffraction spikes — only for compelling verdict or active state.
    if ((isActive || node.verdict === 'compelling') && dimFactor === 1) {
      drawDiffractionSpikes(ctx, x, y, r, !!isActive, twinkle)
    }

    // Center highlight dot
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.75 + 0.15 * twinkle) * externalAlpha * dimFactor})`
    ctx.beginPath()
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawDiffractionSpikes(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    isActive: boolean,
    twinkle: number
  ) {
    const spikeLen = r * (isActive ? 3.2 : 2.4)
    const spikeW = r * 0.22
    const alpha = (isActive ? 0.55 : 0.35) * twinkle
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#ffffff'

    ctx.beginPath()
    ctx.moveTo(x - spikeLen, y)
    ctx.lineTo(x - spikeW, y - spikeW * 0.4)
    ctx.lineTo(x + spikeW, y - spikeW * 0.4)
    ctx.lineTo(x + spikeLen, y)
    ctx.lineTo(x + spikeW, y + spikeW * 0.4)
    ctx.lineTo(x - spikeW, y + spikeW * 0.4)
    ctx.closePath()
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(x, y - spikeLen)
    ctx.lineTo(x - spikeW * 0.4, y - spikeW)
    ctx.lineTo(x - spikeW * 0.4, y + spikeW)
    ctx.lineTo(x, y + spikeLen)
    ctx.lineTo(x + spikeW * 0.4, y + spikeW)
    ctx.lineTo(x + spikeW * 0.4, y - spikeW)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  function drawImpulses(
    ctx: CanvasRenderingContext2D,
    nodes: SimNode[],
    edges: SimEdge[],
    imp: Impulse,
    currentMs: number,
    zoom: number
  ) {
    const elapsed = currentMs - imp.startMs
    if (elapsed > imp.duration + 80) return // animation complete; renderer will prune
    const t = Math.min(1, elapsed / imp.duration)
    const eased = easeInOut(t)

    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const origin = nodeMap.get(imp.originId)
    if (!origin) return

    for (const edge of edges) {
      const sId = typeof edge.source === 'string' ? edge.source : (edge.source as any).id
      const tId = typeof edge.target === 'string' ? edge.target : (edge.target as any).id
      if (sId !== imp.originId && tId !== imp.originId) continue
      const otherId = sId === imp.originId ? tId : sId
      const other = nodeMap.get(otherId)
      if (!other) continue

      const dx = other.x! - origin.x!
      const dy = other.y! - origin.y!
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const curveSeed = hashString(origin.id + other.id) % 100
      const curveScale = ((curveSeed - 50) / 50) * 0.1
      const mx = (origin.x! + other.x!) / 2 - (dy / len) * len * curveScale
      const my = (origin.y! + other.y!) / 2 + (dx / len) * len * curveScale

      const b = 1 - eased
      const px = b * b * origin.x! + 2 * b * eased * mx + eased * eased * other.x!
      const py = b * b * origin.y! + 2 * b * eased * my + eased * eased * other.y!

      const fadeT = t < 0.85 ? 1 : 1 - ((t - 0.85) / 0.15)
      const pulseAlpha = fadeT * imp.intensity
      const color = edge.type === 'user' ? '#22c55e' : edge.type === 'ai' ? '#67e8f9' : '#8ec5ff'

      // Scale the pulse size with intensity so hover pulses are subtler
      const coreR = (2.5 + 2 * imp.intensity) / Math.max(zoom, 0.5)
      const auraR = coreR * 4
      const grad = ctx.createRadialGradient(px, py, 0, px, py, auraR)
      grad.addColorStop(0, hexToRGBA(color, 0.95 * pulseAlpha))
      grad.addColorStop(0.5, hexToRGBA(color, 0.4 * pulseAlpha))
      grad.addColorStop(1, hexToRGBA(color, 0))
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(px, py, auraR, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * pulseAlpha})`
      ctx.beginPath()
      ctx.arc(px, py, coreR, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawLabels(
    ctx: CanvasRenderingContext2D,
    nodes: SimNode[],
    zoom: number,
    hoveredId: string | null,
    selectedId: string | null
  ) {
    for (const node of nodes) {
      if (node.isGhost) continue
      const active = node.id === hoveredId || node.id === selectedId
      if (!active) continue
      const x = node.x!
      const y = node.y!
      const r = node.radius / Math.max(zoom, 0.5)
      const fontSize = Math.max(10, Math.min(13, 12 / zoom))
      ctx.font = `600 ${fontSize}px 'Space Grotesk', Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const raw = node.name || ''
      const label = raw.length > 30 ? raw.slice(0, 28) + '…' : raw
      const ty = y + r + 8 / zoom
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
      ctx.fillText(label, x + 0.5 / zoom, ty + 0.5 / zoom)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.fillText(label, x, ty)
    }
  }

  // ── Hit test ──

  const hitTest = useCallback((
    worldX: number,
    worldY: number,
    nodes: SimNode[],
    zoom: number
  ): SimNode | null => {
    const hitRadius = Math.max(14, 22 / zoom)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      if (node.isGhost) continue // ghosts are never tappable
      const dx = worldX - node.x!
      const dy = worldY - node.y!
      if (dx * dx + dy * dy < hitRadius * hitRadius) return node
    }
    return null
  }, [])

  return { draw, hitTest }
}
