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

interface ConstellationMapProps {
  userInterests: PhenomenonCategory[]
  stats?: ConstellationStats[]
  onNodeClick?: (category: PhenomenonCategory) => void
  selectedNode?: PhenomenonCategory | null
  compact?: boolean
}

interface D3Node extends ConstellationNode {
  fx: number | null
  fy: number | null
  isUserInterest: boolean
  reportCount: number
  trendingCount: number
}

interface D3Edge extends ConstellationEdge {
  sourceNode?: D3Node
  targetNode?: D3Node
}

const BACKGROUND_STARS = generateBackgroundStars(200)
const COMPACT_BACKGROUND_STARS = generateBackgroundStars(60, 99)

/**
 * Truncate long labels for small screens.
 * "Ghosts & Hauntings" → "Ghosts", "Multi-Disciplinary" → "Multi", etc.
 */
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

  // ── Build the D3 visualization — one unified render for ALL screen sizes ──
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return

    const svg = d3.select(svgRef.current)
    const { width, height } = dimensions

    // ── Responsive scale factors ──
    const isMobile = width < 500
    const scale = Math.min(width, height) / 600 // proportional to a 600px baseline
    const clampScale = Math.max(0.5, Math.min(scale, 1)) // clamp between 0.5x and 1x
    const padding = compact ? 30 : Math.max(30, Math.round(60 * clampScale))

    // On mobile, compress node positions inward so edge nodes don't overflow
    const remapX = (x: number) => isMobile ? 0.08 + x * 0.84 : x
    const remapY = (y: number) => isMobile ? 0.06 + y * 0.88 : y

    // Responsive sizes
    const nodeR = {
      active: Math.max(6, Math.round(14 * clampScale)),
      inactive: Math.max(3, Math.round(8 * clampScale)),
    }
    const glowR = Math.max(10, Math.round(28 * clampScale))
    const coreR = Math.max(2, Math.round(5 * clampScale))
    const iconSize = {
      active: `${Math.max(12, Math.round(18 * clampScale))}px`,
      inactive: `${Math.max(9, Math.round(14 * clampScale))}px`,
    }
    const labelSize = {
      active: `${Math.max(7, Math.round(12 * clampScale))}px`,
      inactive: `${Math.max(6, Math.round(10 * clampScale))}px`,
    }
    const iconDy = {
      active: -Math.max(12, Math.round(24 * clampScale)),
      inactive: -Math.max(8, Math.round(16 * clampScale)),
    }
    const labelDy = {
      active: Math.max(16, Math.round(30 * clampScale)),
      inactive: Math.max(12, Math.round(22 * clampScale)),
    }
    const labelMaxChars = isMobile ? 10 : 999
    const blurStd = {
      glow: Math.max(3, Math.round(8 * clampScale)),
      hover: Math.max(4, Math.round(12 * clampScale)),
    }
    const edgeW = {
      both: compact ? 1.5 : Math.max(1, 2 * clampScale),
      one: compact ? 0.8 : Math.max(0.5, 1.2 * clampScale),
      none: compact ? 0.3 : Math.max(0.2, 0.5 * clampScale),
    }
    const pulseR = { start: nodeR.active, end: Math.max(16, Math.round(35 * clampScale)) }
    const selectR = compact ? 20 : Math.max(16, Math.round(40 * clampScale))

    // Clear previous render
    svg.selectAll('*').remove()

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

    const nodes: D3Node[] = CONSTELLATION_NODES.map(n => {
      const rx = remapX(n.x)
      const ry = remapY(n.y)
      return {
        ...n,
        x: padding + rx * (width - padding * 2),
        y: padding + ry * (height - padding * 2),
        fx: padding + rx * (width - padding * 2),
        fy: padding + ry * (height - padding * 2),
        isUserInterest: userInterests.includes(n.id),
        reportCount: statsMap.get(n.id)?.reportCount || 0,
        trendingCount: statsMap.get(n.id)?.trendingCount || 0,
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

    // ── Edges ──
    const edgeGroup = svg.append('g').attr('class', 'edges')

    edgeGroup.selectAll('line')
      .data(edges).join('line')
      .attr('x1', d => d.sourceNode!.x).attr('y1', d => d.sourceNode!.y)
      .attr('x2', d => d.targetNode!.x).attr('y2', d => d.targetNode!.y)
      .attr('stroke', d => {
        const sa = userInterests.includes(d.source), ta = userInterests.includes(d.target)
        if (sa && ta) return 'rgba(139, 92, 246, 0.4)'
        if (sa || ta) return 'rgba(139, 92, 246, 0.2)'
        return 'rgba(75, 85, 99, 0.15)'
      })
      .attr('stroke-width', d => {
        const sa = userInterests.includes(d.source), ta = userInterests.includes(d.target)
        if (sa && ta) return edgeW.both
        if (sa || ta) return edgeW.one
        return edgeW.none
      })
      .attr('stroke-dasharray', d => {
        const sa = userInterests.includes(d.source), ta = userInterests.includes(d.target)
        return (!sa && !ta) ? '4,4' : 'none'
      })

    // ── Nodes ──
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
            const sa = userInterests.includes(d.source), ta = userInterests.includes(d.target)
            if (sa && ta) return 'rgba(139, 92, 246, 0.4)'
            if (sa || ta) return 'rgba(139, 92, 246, 0.2)'
            return 'rgba(75, 85, 99, 0.15)'
          })
          .attr('stroke-width', (d: any) => {
            const sa = userInterests.includes(d.source), ta = userInterests.includes(d.target)
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

      // Report count badges — only on larger screens
      if (!isMobile) {
        nodeElements.filter(d => d.reportCount > 0).append('text').attr('text-anchor', 'middle')
          .attr('dy', d => d.isUserInterest ? 44 : 36)
          .attr('fill', '#9ca3af').attr('font-size', '9px')
          .text(d => `${d.reportCount} reports`)
      }
    }

    // Pulse animation (active nodes, full mode)
    if (!compact) {
      nodeElements.filter(d => d.isUserInterest).append('circle')
        .attr('r', pulseR.start).attr('fill', 'none').attr('stroke', d => d.glowColor)
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

    // Selected node highlight ring
    if (selectedNode) {
      const sd = nodes.find(n => n.id === selectedNode)
      if (sd) {
        svg.append('circle').attr('cx', sd.x).attr('cy', sd.y)
          .attr('r', selectR).attr('fill', 'none')
          .attr('stroke', sd.glowColor).attr('stroke-width', 2)
          .attr('stroke-dasharray', '4,4').attr('opacity', 0.8)
      }
    }

    // Intro animation
    if (!isInitialized) {
      svg.attr('opacity', 0).transition().duration(1000).attr('opacity', 1)
      nodeElements.attr('opacity', 0).transition().delay((_, i) => 200 + i * 100).duration(800).attr('opacity', 1)
      edgeGroup.selectAll('line').attr('opacity', 0).transition().delay(1200).duration(800).attr('opacity', 1)
      setIsInitialized(true)
    }

  }, [dimensions, userInterests, stats, selectedNode, compact, isInitialized, onNodeClick])

  const hoveredData = hoveredNode ? CONSTELLATION_NODES.find(n => n.id === hoveredNode) : null

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="bg-transparent"
        style={{ display: dimensions.width > 0 ? 'block' : 'none' }}
      />

      {/* Hover tooltip — full mode only */}
      {!compact && hoveredData && (
        <div
          className="absolute pointer-events-none bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2 max-w-xs z-10"
          style={{ left: '50%', bottom: '16px', transform: 'translateX(-50%)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{hoveredData.icon}</span>
            <span className="text-white font-medium text-sm">{hoveredData.label}</span>
            {userInterests.includes(hoveredData.id) && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary-500/20 text-primary-400">Following</span>
            )}
          </div>
          <p className="text-gray-400 text-xs mt-1">{hoveredData.description}</p>
          <p className="text-gray-500 text-xs mt-1">Click to explore</p>
        </div>
      )}
    </div>
  )
}
