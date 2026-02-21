'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import {
  CONSTELLATION_NODES,
  CONSTELLATION_EDGES,
  generateBackgroundStars,
  ConstellationNode,
  ConstellationEdge,
  ConstellationStats,
} from '@/lib/constellation-data'
import { PhenomenonCategory } from '@/lib/database.types'
import type { UserMapData, EntryNode } from '@/pages/dashboard/constellation'

// Verdict → color mapping for star rendering
const VERDICT_COLORS: Record<string, string> = {
  compelling: '#fbbf24',   // amber-400
  inconclusive: '#60a5fa', // blue-400
  skeptical: '#9ca3af',    // gray-400
  needs_info: '#a78bfa',   // purple-400
}

interface ConstellationMapProps {
  userInterests: PhenomenonCategory[]
  stats?: ConstellationStats[]
  UerNdcLClick?: (category: PhenomenonCategory) => void
  selectedNode?: PhenomenonCategory | null
  compact?: boolean
  userMapData?: UserMapData | null
}

interface D3Node extends ConstellationNode {
  fx: number | null
  fy: number | null
  isUserInterest: boolean
  reportCount: number
  trendingCount: number
  entryCount: number
}

interface D3Edge extends ConstellationEdge {
  sourceNode?: D3Node
  targetNode?: D3Node
}

const BACKGROUND_STARS = generateBackgroundStars(1500)
const COMPACT_BACKGROUND_STARS = generateBackgroundStars(60, 99)

function shortLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label
  const first = label.split(/[\s&]/)[0]
  return first.length > maxLen ? first.slice(0, maxLen - 1) + '…' : first
}

export default function ConstellationMap({
  userInterests,
  stats = [],
  onNodeClick,
  selectedNode,
  compact = false,
  userMapData,
}: ConstellationMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [hoveredNode, setHoveredNode] = useState<PhenomenonCategory | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setDimensions({ width, height })
        }
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

electAll('*').remove()

    // ── Defs: Glow filters ──
    const defs = svg.append('defs')

    const glowFilter = defs.append('filter')
      .attr('id', 'star-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%')
    glowFilter.append('feGaussianBlur').attr('stdDeviation', compact ? 4 : blurStd.glow).attr('result', 'blur')
    glowFilter.append('feMerge').selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic']).join('feMergeNode').attr('in', d => d)

    const dimGlow = defs.append('filter')
      .attr('id', 'dim-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%')
    dimGlow.append('feGaussianBlur').attr('stdDeviation', 2).attr('result', 'blur')
    dimGlow.append('feMerge').selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic']).join('feMergeNode').attr('in', d => d)

    const hoverGlow = defs.append('filter')
      .attr('id', 'hover-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%')
    hoverGlow.append('feGaussianBlur').attr('stdDeviation', compact ? 6 : blurStd.hover).attr('result', 'blur')
    hoverGlow.append('feMerge').selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic']).join('feMergeNode').attr('in', d => d)

    // ── Prepare data ──
    const statsMap = new Map(stats.map(s => [s.category, s]))
    const catEntryCount = userMapData?.categoryStats || {}

    const nodes: D3Node[] = CONSTELLATION_NODES.map(n => {
      const rx = remapX(n.x)
      const ry = remapY(n.y)
      const hasEntries = (catEntryCount[n.id]?.entries || 0) > 0
      return {
        ...n,
        x: padding + rx * (width - padding * 2),
        y: padding + ry * (height - padding * 2),
        fx: padding + rx * (width - padding * 2),
        fy: padding + ry * (height - padding * 2),
        isUserInterest: userInterests.includes(n.id) || hasEntries,
        reportCount: statsMap.get(n.id)?.reportCount || 0,
        trendingCount: statsMap.get(n.id)?.trendingCount || 0,
        entryCount: catEntryCount[n.id]?.entries || 0,
      }
    })

    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    const edges: D3Edge[] = CONSTELLATION_EDGES.map(e => ({
      ...e,
      sourceNode: nodeMap.get(e.source),
      targetNode: nodeMap.get(e.target),
    })).filter(e => e.sourceNode && e.targetNode)

    // ── Background stars ──
    const bgStars = compact ? COMPACT_BACKGROUND_STARS : BACKGROUND_STARS
    const bgGroup = svg.append('g').attr('class', 'background-stars')

    bgGroup.selectAll('circle')
      .data(bgStars).join('circle')
      .attr('cx', d => d.x * width).attr('cy', d => d.y * height)
      .attr('r', d => d.size).attr('fill', 'white').attr('opacity', d => d.opacity)

    if (!compact) {
      bgGroup.selectAll<SVGCircleElement, unknown>('circle')
        .filter(() => Math.random() < 0.15)
        .each(function(this: SVGCircleElement) {
          const star = d3.select(this)
          const baseOp = parseFloat(star.attr('opacity'))
          const delay = Math.random() * 5000
          function twinkle() {
            star.transition().delay(delay).duration(1500 + Math.random() * 2000)
              .attr('opacity', baseOp * 0.3)
              .transition().duration(1500 + Math.random() * 2000)
              .attr('opacity', baseOp).on('end', twinkle)
          }
          twinkle()
        })
    }

    // ── Category Edges ──
    const edgeGroup = svg.append('g').attr('class', 'edges')

    edgeGroup.selectAll('line')
      .data(edges).join('line')
      .attr('x1', d => d.sourceNode!.x).attr('y1', d => d.sourceNode!.y)
      .attr('x2', d => d.targetNode!.x).attr('y2', d => d.targetNode!.y)
      .attr('stroke', d => {
        const sa = d.sourceNode!.isUserInterest, ta = d.targetNode!.isUserInterest
        if (sa && ta) return 'rgba(139, 92, 246, 0.4)'
        if (sa || ta) return 'rgba(139, 92, 246, 0.2)'
        return 'rgba(75, 85, 99, 0.15)'
      })
      .attr('stroke-width', d => {
        const sa = d.sourceNode!.isUserInterest, ta = d.targetNode!.isUserInterest
        if (sa && ta) return edgeW.both
        if (sa || ta) return edgeW.one
        return edgeW.none
      })
      .attr('stroke-dasharray', d => {
        const sa = d.sourceNode!.isUserInterest, ta = d.targetNode!.isUserInterest
        return (!sa && !ta) ? '4,4' : 'none'
      })

    // ── Category Nodes ──
    const nodeGroup = svg.append('g').attr('class', 'nodes')
    const nodeElements = nodeGroup.selectAll('g')
      .data(nodes).join('g')
      .attr('transform', d => `translate(${d.x}, ${d.y})`)
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => { if (onNodeClick) onNodeClick(d.id) })
      .on('mouseenter', (_event, d) => {
        setHoveredNode(d.id)
        edgeGroup.selectAll('line').transition().duration(200)
          .attr('stroke', (e: any) => (e.source === d.id || e.target === d.id) ? d.glowColor + 'aa' : 'rgba(75, 85, 99, 0.08)')
          .attr('stroke-width', (e: any) => (e.source === d.id || e.target === d.id) ? edgeW.both * 1.5 : edgeW.none * 0.5)
      })
      .on('mouseleave', () => {
        setHoveredNode(null)
        edgeGroup.selectAll('line').transition().duration(400)
          .attr('stroke', (d: any) => {
            const sn = nodeMap.get(d.source as PhenomenonCategory)
            const tn = nodeMap.get(d.target as PhenomenonCategory)
            const sa = sn?.isUserInterest, ta = tn?.isUserInterest
            if (sa && ta) return 'rgba(139, 92, 246, 0.4)'
            if (sa || ta) return 'rgba(139, 92, 246, 0.2)'
            return 'rgba(75, 85, 99, 0.15)'
          })
          .attr('stroke-width', (d: any) => {
            const sn = nodeMap.get(d.source as PhenomenonCategory)
            const tn = nodeMap.get(d.target as PhenomenonCategory)
            const sa = sn?.isUserInterest, ta = tn?.isUserInterest
            if (sa && ta) return edgeW.both
            if (sa || ta) return edgeW.one
            return edgeW.none
          })
      })

    // Outer glow ring (active nodes)
    nodeElements.filter(d => d.isUserInterest).append('circle')
      .attr('r', glowR).attr('fill', d => d.glowColor).attr('opacity', 0.15).attr('filter', 'url(#star-glow)')

    // Main star circle
    nodeElements.append('circle')
      .attr('r', d => d.isUserInterest ? nodeR.active : nodeR.inactive)
      .attr('fill', d => d.isUserInterest ? d.glowColor : '#4b5563')
      .attr('opacity', d => d.isUserInterest ? 1 : 0.5)
      .attr('filter', d => d.isUserInterest ? 'url(#star-glow)' : 'url(#dim-glow)')

    // Inner bright core
    nodeElements.filter(d => d.isUserInterest).append('circle')
      .attr('r', coreR).attr('fill', 'white').attr('opacity', 0.9)

    // Icons and labels (full mode only)
    if (!compact) {
      nodeElements.append('text').attr('text-anchor', 'middle')
        .attr('dy', d => d.isUserInterest ? iconDy.active : iconDy.inactive)
        .attr('font-size', d => d.isUserInterest ? iconSize.active : iconSize.inactive)
        .attr('opacity', d => d.isUserInterest ? 1 : 0.5)
        .text(d => d.icon)

      nodeElements.append('text').attr('text-anchor', 'middle')
        .attr('dy', d => d.isUserInterest ? labelDy.active : labelDy.inactive)
        .attr('fill', d => d.isUserInterest ? '#e5e7eb' : '#6b7280')
        .attr('font-size', d => d.isUserInterest ? labelSize.active : labelSize.inactive)
        .attr('font-weight', d => d.isUserInterest ? '600' : '400')
        .text(d => shortLabel(d.label, labelMaxChars))

      // Entry count badges (instead of report count)
      if (!isMobile) {
        nodeElements.filter(d => d.entryCount > 0).append('text').attr('text-anchor', 'middle')
          .attr('dy', d => d.isUserInterest ? 44 : 36)
          .attr('fill', '#a78bfa').attr('font-size', '9px')
          .text(d => `${d.entryCount} logged`)
      }
    }

    // Pulse animation (active nodes, full mode)
    if (!compact) {
      nodeElements.filter(d => d.isUserInterest).append('circle')
        .attr('r', pulseR.start).attr('fill', 'none').attr('stroke', d => d.gllowColor)
        .attr('stroke-width', 1).attr('opacity', 0)
        .each(function(this: SVGCircleElement) {
          const pulse = d3.select(this)
          function doPulse() {
            pulse.attr('r', pulseR.start).attr('opacity', 0.6)
              .transition().duration(2000).ease(d3.easeCubicOut)
              .attr('r', pulseR.end).attr('opacity', 0)
              .on('end', () => { setTimeout(doPulse, 1000 + Math.random() * 3000) })
          }
          setTimeout(doPulse, Math.random() * 4000)
        })
    }

    // ── Logged Entry Stars (verdict-colored) ──
    if (!compact && userMapData && userMapData.entryNodes.length > 0) {
      const entryGroup = svg.append('g').attr('class', 'entry-stars')

      // Group entries by category and position around parent node
      const entriesByCat = new Map<string, EntryNode[]>()
      for (const entry of userMapData.entryNodes) {
        const cat = entry.category || 'combination'
        if (!entriesByCat.has(cat)) entriesByCat.set(cat, [)
        entriesByCat.get(cat)!.push(entry)
      }

      const allEntryStars: { x: number; y: number; entry: EntryNode; parentNode: D3Node }[] = []

      for (const [cat, entries] of entriesByCat) {
        const parentNode = nodeMap.get(cat as PhenomenonCategory)
        if (!parentNode) continue

        const orbitRadius = Math.max(20, Math.round(45 * clampScale))
        entries.forEach((entry, i) => {
          const angle = (i / Math.max(entries.length, 1)) * Math.PI * 2 - Math.PI / 2
          const jitterR = orbitRadius + (i % 3 - 1) * 8 * clampScale
          const px = parentNode.x + Math.cos(angle) * jitterR
          const py = parentNode.y + Math.sin(angle) * jitterR
          allEntryStars.push({ x: px, y: py, entry, parentNode })
        })
      }

      // Faint lines connecting entries to their category
      entryGroup.selectAll('line.entry-link')
        .data(allEntryStars).join('line')
        .attr('class', 'entry-link')
        .attr('x1', d => d.parentNode.x).attr('y1', d => d.parentNode.y)
        .attr('x2', d => d.x).attr('y2', d => d.y)
        .attr('stroke', d => VEPDE