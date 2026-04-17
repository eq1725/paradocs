/**
 * useForceSimulation — D3 force simulation for the constellation star map.
 *
 * Entry nodes are attracted to their category's gravity well (center point).
 * Same-category nodes repel each other slightly to spread into a "nebula."
 * Cross-category edges (shared tags, user connections) pull linked nodes together.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import * as d3 from 'd3'
import { CONSTELLATION_NODES } from '@/lib/constellation-data'
import type { EntryNode } from '@/lib/constellation-types'

// ── Types ──

export interface SimNode extends d3.SimulationNodeDatum {
  id: string
  reportId: string
  name: string
  slug: string
  category: string
  imageUrl: string | null
  locationName: string | null
  eventDate: string | null
  summary: string | null
  note: string
  verdict: string
  tags: string[]
  loggedAt: string
  // Source-type for external artifacts (youtube, reddit, etc.). Undefined or
  // 'paradocs_report' for Paradocs-curated entries.
  sourceType?: string
  externalUrl?: string | null
  // Simulation fields
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
  // Ring-layout targets — stable per-node position inside its category arc.
  // d3.forceX/forceY pull toward these so stars stay strictly inside their
  // segment while collision + charge forces spread them apart visually.
  targetX: number
  targetY: number
  // Computed
  radius: number
}

export interface SimEdge {
  source: string
  target: string
  type: 'tag' | 'user' | 'ai'
  label?: string // tag name or annotation
  strength: number // 0-1
}

export interface CategoryCenter {
  id: string
  label: string
  icon: string
  color: string
  glowColor: string
  x: number
  y: number
  // Polar ring metadata — used by the canvas renderer to paint arc segments
  angleRad: number      // angular position on the ring (radians, 0 = right, CCW)
  arcWidthRad: number   // angular width of this category's arc
  ringRadius: number    // distance from canvas center to category center
  ringOuterRadius: number  // outer edge of the colored ring
  ringInnerRadius: number  // inner edge of the colored ring
  entryCount: number
}

interface UseForceSimulationProps {
  entries: EntryNode[]
  tagConnections: Array<{ tag: string; entryIds: string[] }>
  userConnections: Array<{ id: string; entryAId: string; entryBId: string; annotation?: string }>
  width: number
  height: number
  onTick?: () => void
}

// ── Ring Layout ──
// The Wikipedia Science Communities-style layout puts 11 category arcs around
// a ring. Order is tuned for color coherence (blue → violet → purple → pink →
// orange → amber → green → teal → cyan → slate → back to blue) so adjacent
// arcs don't clash and the wheel reads as a continuous spectrum.
const RING_ORDER: string[] = [
  'psychic_phenomena',        // blue          (12 o'clock / top)
  'consciousness_practices',  // violet
  'esoteric_practices',       // indigo
  'ghosts_hauntings',         // purple
  'psychological_experiences',// pink
  'religion_mythology',       // orange        (6 o'clock / bottom)
  'cryptids',                 // amber
  'ufos_aliens',              // green
  'biological_factors',       // teal
  'perception_sensory',       // cyan
  'combination',              // slate         (wraps back to blue)
]

/**
 * Compute the polar ring geometry for the current canvas size.
 * The ring "radius" refers to where category centers live (where stars orbit).
 * The outer/inner ring radii bound the colored arc band on screen.
 */
function ringGeometry(width: number, height: number) {
  const cx = width / 2
  const cy = height / 2
  const minDim = Math.min(width, height)
  // Stars orbit at ~30% of the canvas radius
  const ringRadius = minDim * 0.30
  // Colored ring band sits further out, ~40% of canvas radius
  const ringOuterRadius = minDim * 0.46
  const ringInnerRadius = minDim * 0.40
  return { cx, cy, ringRadius, ringOuterRadius, ringInnerRadius }
}

/**
 * Build category centers in polar ring order.
 * Starts at -π/2 (12 o'clock) and distributes 11 slots clockwise.
 */
function buildCategoryCenters(width: number, height: number, entries: EntryNode[]): CategoryCenter[] {
  const categoryCounts: Record<string, number> = {}
  entries.forEach(e => {
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1
  })

  const { cx, cy, ringRadius, ringOuterRadius, ringInnerRadius } = ringGeometry(width, height)
  const arcWidthRad = (Math.PI * 2) / RING_ORDER.length

  return RING_ORDER.map((catId, i) => {
    const node = CONSTELLATION_NODES.find(n => n.id === catId)
    if (!node) {
      // Should never happen, but fail soft
      return null
    }
    // Start at -π/2 (top of canvas) and go clockwise
    const angleRad = -Math.PI / 2 + i * arcWidthRad
    return {
      id: node.id,
      label: node.label,
      icon: node.icon,
      color: node.color,
      glowColor: node.glowColor,
      x: cx + Math.cos(angleRad) * ringRadius,
      y: cy + Math.sin(angleRad) * ringRadius,
      angleRad,
      arcWidthRad,
      ringRadius,
      ringOuterRadius,
      ringInnerRadius,
      entryCount: categoryCounts[catId] || 0,
    }
  }).filter(Boolean) as CategoryCenter[]
}

/**
 * Convert EntryNode[] to SimNode[] with initial positions inside their
 * category's arc segment. Each star gets a small angular jitter (so they
 * don't all stack on the radial line) and a small radial jitter (so they
 * don't sit on a perfect circle).
 */
function buildSimNodes(entries: EntryNode[], centers: CategoryCenter[], width: number, height: number): SimNode[] {
  const centerMap = new Map(centers.map(c => [c.id, c]))
  const { cx, cy, ringRadius } = ringGeometry(width, height)

  return entries.map((entry) => {
    const center = centerMap.get(entry.category)
    // Fallback for unmapped categories (e.g., 'external' from legacy data):
    // place them in the "combination" wedge so nothing floats in the void.
    const fallback = centerMap.get('combination')
    const resolved = center || fallback

    const a = resolved?.angleRad ?? 0
    const w = resolved?.arcWidthRad ?? 0.5
    // Keep jitter to 75% of the arc so nodes don't kiss the segment boundary
    const angleJitter = (Math.random() - 0.5) * w * 0.75
    // Radial jitter: keep stars mostly around ringRadius with some depth variation
    const radialJitter = (Math.random() - 0.4) * ringRadius * 0.5
    const r = (resolved?.ringRadius ?? ringRadius) + radialJitter

    const tx = cx + Math.cos(a + angleJitter) * r
    const ty = cy + Math.sin(a + angleJitter) * r

    return {
      id: entry.id,
      reportId: entry.reportId,
      name: entry.name,
      slug: entry.slug,
      category: resolved ? entry.category : 'combination',
      imageUrl: entry.imageUrl,
      locationName: entry.locationName,
      eventDate: entry.eventDate,
      summary: entry.summary,
      note: entry.note,
      verdict: entry.verdict,
      tags: entry.tags,
      loggedAt: entry.loggedAt,
      sourceType: entry.sourceType,
      externalUrl: entry.externalUrl,
      x: tx,
      y: ty,
      targetX: tx,
      targetY: ty,
      radius: getNodeRadius(entry),
    }
  })
}

function getNodeRadius(entry: EntryNode): number {
  // Base size + boost for more tags/connections
  let r = 5
  if (entry.tags.length > 2) r += 1
  if (entry.verdict === 'compelling') r += 1
  return r
}

// Build edges from tag connections and user-drawn connections
function buildSimEdges(
  tagConns: Array<{ tag: string; entryIds: string[] }>,
  userConns: Array<{ id: string; entryAId: string; entryBId: string; annotation?: string }>
): SimEdge[] {
  const edges: SimEdge[] = []
  const seen = new Set<string>()

  // Tag-based connections (all pairs within each tag group)
  tagConns.forEach(tc => {
    for (let i = 0; i < tc.entryIds.length; i++) {
      for (let j = i + 1; j < tc.entryIds.length; j++) {
        const key = [tc.entryIds[i], tc.entryIds[j]].sort().join('--')
        if (!seen.has(key)) {
          seen.add(key)
          edges.push({
            source: tc.entryIds[i],
            target: tc.entryIds[j],
            type: 'tag',
            label: tc.tag,
            strength: 0.3,
          })
        }
      }
    }
  })

  // User-drawn connections (prioritize over tag connections)
  userConns.forEach(uc => {
    const key = [uc.entryAId, uc.entryBId].sort().join('--')
    // Remove any existing tag edge for this pair so the user connection takes precedence
    const existingIdx = seen.has(key) ? edges.findIndex(e => {
      const s = typeof e.source === 'string' ? e.source : (e.source as any).id
      const t = typeof e.target === 'string' ? e.target : (e.target as any).id
      return [s, t].sort().join('--') === key
    }) : -1
    if (existingIdx >= 0) edges.splice(existingIdx, 1)
    seen.add(key)
    edges.push({
      source: uc.entryAId,
      target: uc.entryBId,
      type: 'user',
      label: uc.annotation,
      strength: 0.7,
    })
  })

  return edges
}

export function useForceSimulation({
  entries,
  tagConnections,
  userConnections,
  width,
  height,
  onTick,
}: UseForceSimulationProps) {
  const simulationRef = useRef<d3.Simulation<SimNode, SimEdge> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<SimEdge[]>([])
  const centersRef = useRef<CategoryCenter[]>([])
  const [settled, setSettled] = useState(false)

  // Rebuild simulation when data or dimensions change
  useEffect(() => {
    if (width < 10 || height < 10) return

    const centers = buildCategoryCenters(width, height, entries)
    const nodes = buildSimNodes(entries, centers, width, height)
    const edges = buildSimEdges(tagConnections, userConnections)

    centersRef.current = centers
    nodesRef.current = nodes
    edgesRef.current = edges

    // Kill previous simulation
    if (simulationRef.current) {
      simulationRef.current.stop()
    }

    const centerMap = new Map(centers.map(c => [c.id, c]))
    const { cx: canvasCx, cy: canvasCy, ringInnerRadius } = ringGeometry(width, height)

    const simulation = d3.forceSimulation<SimNode>(nodes)
      // Anchor each star to its per-node target inside the category arc.
      // High strength keeps stars in their segments — the key to the
      // "strict polar segments" layout.
      .force('targetX', d3.forceX<SimNode>(d => d.targetX).strength(0.35))
      .force('targetY', d3.forceY<SimNode>(d => d.targetY).strength(0.35))
      // Light charge for visual breathing room — targets do most of the work.
      .force('charge', d3.forceManyBody<SimNode>().strength(-18).distanceMax(140))
      // Collision detection prevents overlap with neighbours in the same arc.
      .force('collide', d3.forceCollide<SimNode>(d => d.radius + 3).strength(0.85))
      // Link force is weak so cross-category edges can't yank stars out of
      // their segment. Users still see the connection line drawn by the renderer.
      .force('link', d3.forceLink<SimNode, SimEdge>(edges as any)
        .id(d => d.id)
        .distance(110)
        .strength(d => (d as SimEdge).strength * 0.04)
      )
      // Radial cap: never let a star escape inside the colored ring band.
      // This is what makes the ring read as a clean boundary, not a suggestion.
      .force('ringCap', () => {
        const cap = ringInnerRadius - 6 // small padding so stars don't kiss the ring
        nodes.forEach(node => {
          const dx = node.x! - canvasCx
          const dy = node.y! - canvasCy
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > cap) {
            const scale = cap / dist
            node.x = canvasCx + dx * scale
            node.y = canvasCy + dy * scale
            // Also dampen outward velocity so the cap doesn't feel like a wall
            if (node.vx != null) node.vx *= 0.5
            if (node.vy != null) node.vy *= 0.5
          }
        })
      })
      .alphaDecay(0.025)
      .velocityDecay(0.45)
      .on('tick', () => {
        onTick?.()
      })
      .on('end', () => {
        setSettled(true)
      })

    simulationRef.current = simulation
    setSettled(false)

    return () => {
      simulation.stop()
    }
  }, [entries, tagConnections, userConnections, width, height])

  // Reheat simulation (e.g/, after drag)
  const reheat = useCallback((alpha = 0.3) => {
    simulationRef.current?.alpha(alpha).restart()
    setSettled(false)
  }, [])

  // Fix a node position (for dragging)
  const fixNode = useCallback((nodeId: string, x: number, y: number) => {
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (node) {
      node.fx = x
      node.fy = y
    }
  }, [])

  // Release a fixed node
  const releaseNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (node) {
      node.fx = null
      node.fy = null
    }
  }, [])

  return {
    nodes: nodesRef,
    edges: edgesRef,
    centers: centersRef,
    simulation: simulationRef,
    settled,
    reheat,
    fixNode,
    releaseNode,
  }
}
