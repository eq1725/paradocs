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
import type { EntryNode } from '@/pages/dashboard/constellation'

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
  // Simulation fields
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
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

// Build category center positions mapped to pixel coordinates
function buildCategoryCenters(width: number, height: number, entries: EntryNode[]): CategoryCenter[] {
  const categoryCounts: Record<string, number> = {}
  entries.forEach(e => {
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1
  })

  return CONSTELLATION_NODES.map(node => ({
    id: node.id,
    label: node.label,
    icon: node.icon,
    color: node.color,
    glowColor: node.glowColor,
    x: node.x * width,
    y: node.y * height,
    entryCount: categoryCounts[node.id] || 0,
  }))
}

// Convert EntryNode[] to SimNode[] with initial positions near their category center
function buildSimNodes(entries: EntryNode[], centers: CategoryCenter[]): SimNode[] {
  const centerMap = new Map(centers.map(c => [c.id, c]))

  return entries.map((entry, i) => {
    const center = centerMap.get(entry.category)
    // Scatter around category center with some randomness
    const angle = (i / Math.max/**
 * useForceSimulation — D3 force simulation for the constellation star map.
 *
 * Entry nodes are attracted to their category's gravity well (center point).
 * Same-category nodes repel each other slightly to spread into a "nebula."
 * Cross-category edges (shared tags, user connections) pull linked nodes together.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import * as d3 from 'd3'
import { CONSTELLATION_NODES } from '@/lib/constellation-data'
import type { EntryNode } from '@/pages/dashboard/constellation'

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
  // Simulation fields
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
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

// Build category center positions mapped to pixel coordinates
function buildCategoryCenters(width: number, height: number, entries: EntryNode[]): CategoryCenter[] {
  const categoryCounts: Record<string, number> = {}
  entries.forEach(e => {
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1
  })

  return CONSTELLATION_NODES.map(node => ({
    id: node.id,
    label: node.label,
    icon: node.icon,
    color: node.color,
    glowColor: node.glowColor,
    x: node.x * width,
    y: node.y * height,
    entryCount: categoryCounts[node.id] || 0,
  }))
}

// Convert EntryNode[] to SimNode[] with initial positions near their category center
function buildSimNodes(entries: EntryNode[], centers: CategoryCenter[]): SimNode[] {
  const centerMap = new Map(centers.map(c => [c.id, c]))

  return entries.map((entry, i) => {
    const center = centerMap.get(entry.category)
    // Scatter around category center with some randomness
    const angle = (i / Math.max(entries.length, 1)) * Math.PI * 2 + Math.random() * 0.5
    const spread = 30 + Math.random() * 60

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
      x: (center?.x || 400) + Math.cos(angle) * spread,
      y: (center?.y || 300) + Math.sin(angle) * spread,
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

  // User-drawn connections
  userConns.forEach(uc => {
    const key = [uc.entryAId, uc.entryBId].sort().join('--')
    if (!seen.has(key)) {
      seen.add(key)
    }
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
    const nodes = buildSimNodes(entries, centers)
    const edges = buildSimEdges(tagConnections, userConnections)

    centersRef.current = centers
    nodesRef.current = nodes
    edgesRef.current = edges

    // Kill previous simulation
    if (simulationRef.current) {
      simulationRef.current.stop()
    }

    const centerMap = new Map(centers.map(c => [c.id, c]))

    const simulation = d3.forceSimulation<SimNode>(nodes)
      // Attract each node toward its category center
      .force('categoryX', d3.forceX<SimNode>(d => centerMap.get(d.category)?.x || width / 2).strength(0.15))
      .force('categoryY', d3.forceY<SimNode>(d => centerMap.get(d.category)?.y || height / 2).strength(0.15))
      // Repel nodes from each other (prevents overlap, creates spread)
      .force('charge', d3.forceManyBody<SimNode>().strength(-40).distanceMax(200))
      // Collision detection
      .force('collide', d3.forceCollide<SimNode>(d => d.radius + 3).strength(0.8))
      // Link force for edges (connected nodes pull together)
      .force('link', d3.forceLink<SimNode, SimEdge>(edges as any)
        .id(d => d.id)
        .distance(80)
        .strength(d => (d as SimEdge).strength * 0.1)
      )
      // Keep nodes within bounds
      .force('bounds', () => {
        nodes.forEach(node => {
          const pad = 20
          node.x = Math.max(pad, Math.min(width - pad, node.x!))
          node.y = Math.max(pad, Math.min(height - pad, node.y!))
        })
      })
      .alphaDecay(0.02)
      .velocityDecay(0.4)
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

  // Reheat simulation (e.g., after drag)
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
