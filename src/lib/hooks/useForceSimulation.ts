/**
 * useForceSimulation — Organic cosmic-web force simulation for the
 * constellation map.
 *
 * Each entry is a star node. Each star has a "home" category with a soft
 * gravity well at a hand-placed normalized position (from CONSTELLATION_NODES).
 * Tag and user connections create link forces that can pull cross-tagged
 * stars into bridge positions between categories — this is how the
 * "cosmic filament" topology emerges.
 *
 * Design principle: nothing about a star's position is pinned. The layout is
 * emergent from the interaction of gravity wells, link pulls, and repulsion.
 * When the user adds a new connection, the graph visibly reorganizes.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
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
  /** True for teaser-galaxy ghost nodes — dimmed + untappable */
  isGhost?: boolean
  // Simulation fields
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
  // Computed
  radius: number
  // Number of filaments touching this node (tag + user connections combined).
  // The renderer uses this for size/brightness hierarchy — well-connected stars
  // are larger and brighter, creating natural visual focal points.
  connectionCount: number
}

export interface SimEdge {
  source: string
  target: string
  type: 'tag' | 'user' | 'ai'
  label?: string
  strength: number
}

export interface CategoryCenter {
  id: string
  label: string
  icon: string
  color: string
  glowColor: string
  x: number
  y: number
  entryCount: number
}

interface UseForceSimulationProps {
  entries: EntryNode[]
  tagConnections: Array<{ tag: string; entryIds: string[] }>
  userConnections: Array<{ id: string; entryAId: string; entryBId: string; annotation?: string }>
  /**
   * AI / emergent connections surfaced by the pattern detector. These render
   * as cyan dashed filaments and don't require any user action.
   */
  aiConnections?: Array<{ source: string; target: string; strength: number; reasons: string[] }>
  width: number
  height: number
  onTick?: () => void
}

// ── Geometry helpers ──

/**
 * Convert the hand-placed normalized (0-1) positions in CONSTELLATION_NODES
 * into canvas pixel coordinates. Uses padding so category wells never sit on
 * the viewport edge (which would make their nebula clouds clip awkwardly).
 */
function buildCategoryCenters(width: number, height: number, entries: EntryNode[]): CategoryCenter[] {
  const categoryCounts: Record<string, number> = {}
  entries.forEach(e => {
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1
  })

  const pad = Math.min(width, height) * 0.14

  return CONSTELLATION_NODES.map(node => ({
    id: node.id,
    label: node.label,
    icon: node.icon,
    color: node.color,
    glowColor: node.glowColor,
    x: pad + node.x * (width - 2 * pad),
    y: pad + node.y * (height - 2 * pad),
    entryCount: categoryCounts[node.id] || 0,
  }))
}

function getNodeRadius(entry: EntryNode, connectionCount: number): number {
  // Base size + modest bump for compelling verdict + scaled bump for connections.
  // Capped so super-connected stars don't crowd out the field.
  let r = 4.5
  if (entry.verdict === 'compelling') r += 1
  r += Math.min(connectionCount * 0.4, 3.5)
  return r
}

/**
 * Build the sim nodes. Initial positions are jittered around each star's
 * category gravity well — a consistent starting point prevents the wild
 * "explosion" animation that happens if nodes start at (0,0) or at random.
 */
function buildSimNodes(
  entries: EntryNode[],
  centers: CategoryCenter[],
  edges: SimEdge[],
  width: number,
  height: number
): SimNode[] {
  const centerMap = new Map(centers.map(c => [c.id, c]))
  const fallback = centerMap.get('combination')

  // Count connections per node so we can size/weight them for rendering.
  const connCount = new Map<string, number>()
  for (const e of edges) {
    connCount.set(e.source, (connCount.get(e.source) || 0) + 1)
    connCount.set(e.target, (connCount.get(e.target) || 0) + 1)
  }

  return entries.map((entry, i) => {
    const resolved = centerMap.get(entry.category) || fallback
    const cx = resolved?.x ?? width / 2
    const cy = resolved?.y ?? height / 2
    // Golden-angle scatter so nodes from the same category don't start
    // stacked on the same radial line.
    const angle = i * 2.399963 // golden angle in radians
    const dist = 20 + Math.random() * 60

    const connections = connCount.get(entry.id) || 0

    return {
      id: entry.id,
      reportId: entry.reportId,
      name: entry.name,
      slug: entry.slug,
      category: entry.category,
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
      isGhost: entry.isGhost,
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      radius: getNodeRadius(entry, connections),
      connectionCount: connections,
    }
  })
}

/**
 * Build edges from tag groups, AI-detected patterns, and user-drawn
 * connections. Deduped across types with a precedence order:
 *   user-drawn > ai > tag
 * (user-drawn is most intentional; tag is weakest signal so it loses ties).
 */
function buildSimEdges(
  tagConns: Array<{ tag: string; entryIds: string[] }>,
  userConns: Array<{ id: string; entryAId: string; entryBId: string; annotation?: string }>,
  aiConns: Array<{ source: string; target: string; strength: number; reasons: string[] }>
): SimEdge[] {
  const edges: SimEdge[] = []
  const seen = new Map<string, number>() // pair key → index in edges[]

  const pairKey = (a: string, b: string) => [a, b].sort().join('--')

  // Tag edges first (lowest precedence).
  tagConns.forEach(tc => {
    if (tc.entryIds.length > 8) return
    // Strength proportional to how "exclusive" the tag is — rare shared
    // tags signal tighter bonds than super-common ones.
    const strength = Math.max(0.25, 0.7 - tc.entryIds.length * 0.06)
    for (let i = 0; i < tc.entryIds.length; i++) {
      for (let j = i + 1; j < tc.entryIds.length; j++) {
        const key = pairKey(tc.entryIds[i], tc.entryIds[j])
        if (seen.has(key)) continue
        seen.set(key, edges.length)
        edges.push({
          source: tc.entryIds[i],
          target: tc.entryIds[j],
          type: 'tag',
          label: tc.tag,
          strength,
        })
      }
    }
  })

  // AI edges (higher precedence than tag). Replace tag edge if same pair.
  aiConns.forEach(ai => {
    const key = pairKey(ai.source, ai.target)
    const existingIdx = seen.get(key)
    const newEdge: SimEdge = {
      source: ai.source,
      target: ai.target,
      type: 'ai',
      label: ai.reasons.join(' · '),
      strength: ai.strength,
    }
    if (existingIdx !== undefined) {
      edges[existingIdx] = newEdge
    } else {
      seen.set(key, edges.length)
      edges.push(newEdge)
    }
  })

  // User-drawn edges (highest precedence). Replace anything else for same pair.
  userConns.forEach(uc => {
    const key = pairKey(uc.entryAId, uc.entryBId)
    const existingIdx = seen.get(key)
    const newEdge: SimEdge = {
      source: uc.entryAId,
      target: uc.entryBId,
      type: 'user',
      label: uc.annotation,
      strength: 0.95,
    }
    if (existingIdx !== undefined) {
      edges[existingIdx] = newEdge
    } else {
      seen.set(key, edges.length)
      edges.push(newEdge)
    }
  })

  return edges
}

// ── Hook ──

export function useForceSimulation({
  entries,
  tagConnections,
  userConnections,
  aiConnections = [],
  width,
  height,
  onTick,
}: UseForceSimulationProps) {
  const simulationRef = useRef<d3.Simulation<SimNode, SimEdge> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<SimEdge[]>([])
  const centersRef = useRef<CategoryCenter[]>([])
  const [settled, setSettled] = useState(false)

  // Memoize the edges build so we can feed it to buildSimNodes without
  // rebuilding twice.
  const edges = useMemo(
    () => buildSimEdges(tagConnections, userConnections, aiConnections),
    [tagConnections, userConnections, aiConnections]
  )

  useEffect(() => {
    if (width < 10 || height < 10) return

    const centers = buildCategoryCenters(width, height, entries)
    const nodes = buildSimNodes(entries, centers, edges, width, height)

    centersRef.current = centers
    nodesRef.current = nodes
    edgesRef.current = edges

    if (simulationRef.current) {
      simulationRef.current.stop()
    }

    const centerMap = new Map(centers.map(c => [c.id, c]))
    const cx = width / 2
    const cy = height / 2
    const maxR = Math.min(width, height) * 0.48
    // Viewport padding — keep nodes from drifting off the canvas edge.
    const pad = Math.min(width, height) * 0.04

    const simulation = d3.forceSimulation<SimNode>(nodes)
      // Soft category gravity wells — weak pull so link forces can still
      // deform the layout. This is what creates "filament bridges" between
      // categories where cross-tagged stars live.
      .force('categoryX', d3.forceX<SimNode>(d => centerMap.get(d.category)?.x || cx).strength(0.045))
      .force('categoryY', d3.forceY<SimNode>(d => centerMap.get(d.category)?.y || cy).strength(0.045))
      // Repel nodes so clusters spread into a nebula-shaped cloud rather
      // than a tight clump. distanceMax capped so distant nodes don't
      // influence each other and drag the whole graph to the center.
      .force('charge', d3.forceManyBody<SimNode>().strength(-60).distanceMax(220))
      // Collision detection — stars don't overlap. Slightly larger radius
      // than the visual radius so the glow aura has breathing room.
      .force('collide', d3.forceCollide<SimNode>(d => d.radius + 5).strength(0.9))
      // Link force — the key mechanic. Strong enough to visibly drag
      // cross-tagged stars into bridges between categories.
      .force('link', d3.forceLink<SimNode, SimEdge>(edges as any)
        .id(d => d.id)
        .distance(d => {
          const e = d as SimEdge
          return e.type === 'user' ? 80 : e.type === 'ai' ? 95 : 115
        })
        .strength(d => {
          const e = d as SimEdge
          // Hierarchy: user-drawn is intentional (strong), AI is inferred
          // (medium), tag is weak signal.
          if (e.type === 'user') return 0.3
          if (e.type === 'ai')   return 0.22 * e.strength
          return 0.12 * e.strength
        })
      )
      // Radial cap — circular viewport boundary. Softer than a rectangle
      // because the cosmic-web reads as circular.
      .force('bounds', () => {
        nodes.forEach(node => {
          const dx = node.x! - cx
          const dy = node.y! - cy
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d > maxR) {
            const s = maxR / d
            node.x = cx + dx * s
            node.y = cy + dy * s
            if (node.vx != null) node.vx *= 0.5
            if (node.vy != null) node.vy *= 0.5
          }
          // Rectangle pad as a second-line defense for extreme aspect ratios.
          if (node.x! < pad) node.x = pad
          if (node.x! > width - pad) node.x = width - pad
          if (node.y! < pad) node.y = pad
          if (node.y! > height - pad) node.y = height - pad
        })
      })
      .alphaDecay(0.018)
      .velocityDecay(0.5)
      .on('tick', () => { onTick?.() })
      .on('end', () => { setSettled(true) })

    simulationRef.current = simulation
    setSettled(false)

    return () => { simulation.stop() }
  }, [entries, edges, width, height])

  const reheat = useCallback((alpha = 0.3) => {
    simulationRef.current?.alpha(alpha).restart()
    setSettled(false)
  }, [])

  const fixNode = useCallback((nodeId: string, x: number, y: number) => {
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (node) {
      node.fx = x
      node.fy = y
    }
  }, [])

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
