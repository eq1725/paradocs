'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
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
  compact?: boolean // For dashboard preview mode
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

export default function ConstellationMap({
  userInterests,
  stats = [],
  onNodeClick,
  selectedNode,
  compact = false,
}: ConstellationMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
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

  // Build the D3 visualization
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return

    const svg = d3.select(svgRef.current)
    const { width, height } = dimensions
    const isMobile = width < 500
    const padding = compact ? 30 : isMobile ? 50 : 60

    // Clear previous render
    svg.selectAll('*').remove()

    // ── Defs: Glow filters + gradients ──
    const defs = svg.append('defs')

    // Glow filter for active (user interest) stars
    const glowFilter = defs.append('filter')
      .attr('id', 'star-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%')

    glowFilter.append('feGaussianBlur')
      .attr('stdDeviation', compact ? 4 : isMobile ? 3 : 8)
      .attr('result', 'blur')

    glowFilter.append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .join('feMergeNode')
      .attr('in', d => d)

    // Subtle glow for dim stars
    const dimGlow = defs.append('filter')
      .attr('id', 'dim-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%')

    dimGlow.append('feGaussianBlur')
      .attr('stdDeviation', 2)
      .attr('result', 'blur')

    dimGlow.append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .join('feMergeNode')
      .attr('in', d => d)

    // Hover glow
    const hoverGlow = defs.append('filter')
      .attr('id', 'hover-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%')

    hoverGlow.append('feGaussianBlur')
      .attr('stdDeviation', compact ? 6 : isMobile ? 8 : 12)
      .attr('result', 'blur')

    hoverGlow.append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .join('feMergeNode')
      .attr('in', d => d)

    // ── Prepare node data ──
    const statsMap = new Map(stats.map(s => [s.category, s]))

    const nodes: D3Node[] = CONSTELLATION_NODES.map(n => ({
      ...n,
      x: padding + n.x * (width - padding * 2),
      y: padding + n.y * (height - padding * 2),
      fx: padding + n.x * (width - padding * 2),
      fy: padding + n.y * (height - padding * 2),
      isUserInterest: userInterests.includes(n.id),
      reportCount: statsMap.get(n.id)?.reportCount || 0,
      trendingCount: statsMap.get(n.id)?.trendingCount || 0,
    }))

    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    // ── Prepare edge data ──
    const edges: D3Edge[] = CONSTELLATION_EDGES.map(e => ({
      ...e,
      sourceNode: nodeMap.get(e.source),
      targetNode: nodeMap.get(e.target),
    })).filter(e => e.sourceNode && e.targetNode)

    // ── Background stars layer ──
    const bgStars = compact ? COMPACT_BACKGROUND_STARS : BACKGROUND_STARS
    const bgGroup = svg.append('g').attr('class', 'background-stars')

    bgGroup.selectAll('circle')
      .data(bgStars)
      .join('circle')
      .attr('cx', d => d.x * width)
      .attr('cy', d => d.y * height)
      .attr('r', d => d.size)
      .attr('fill', 'white')
      .attr('opacity', d => d.opacity)

    // Twinkling animation on a few stars
    if (!compact) {
      bgGroup.selectAll<SVGCircleElement, unknown>('circle')
        .filter(() => Math.random() < 0.15)
        .each(function(this: SVGCircleElement) {
          const star = d3.select(this)
          const baseOpacity = parseFloat(star.attr('opacity'))
          const delay = Math.random() * 5000

          function twinkle() {
            star
              .transition()
              .delay(delay)
              .duration(1500 + Math.random() * 2000)
              .attr('opacity', baseOpacity * 0.3)
              .transition()
              .duration(1500 + Math.random() * 2000)
              .attr('opacity', baseOpacity)
              .on('end', twinkle)
          }
          twinkle()
        })
    }

    // ── Edge layer ──
    const edgeGroup = svg.append('g').attr('class', 'edges')

    edgeGroup.selectAll('line')
      .data(edges)
      .join('line')
      .attr('x1', d => d.sourceNode!.x)
      .attr('y1', d => d.sourceNode!.y)
      .attr('x2', d => d.targetNode!.x)
      .attr('y2', d => d.targetNode!.y)
      .attr('stroke', d => {
        const sourceActive = userInterests.includes(d.source)
        const targetActive = userInterests.includes(d.target)
        if (sourceActive && targetActive) return 'rgba(139, 92, 246, 0.4)'
        if (sourceActive || targetActive) return 'rgba(139, 92, 246, 0.2)'
        return 'rgba(75, 85, 99, 0.15)'
      })
      .attr('stroke-width', d => {
        const sourceActive = userInterests.includes(d.source)
        const targetActive = userInterests.includes(d.target)
        if (sourceActive && targetActive) return compact ? 1.5 : isMobile ? 1.5 : 2
        if (sourceActive || targetActive) return compact ? 0.8 : isMobile ? 0.8 : 1.2
        return compact ? 0.3 : isMobile ? 0.3 : 0.5
      })
      .attr('stroke-dasharray', d => {
        const sourceActive = userInterests.includes(d.source)
        const targetActive = userInterests.includes(d.target)
        if (!sourceActive && !targetActive) return '4,4'
        return 'none'
      })

    // ── Node layer ──
    const nodeGroup = svg.append('g').attr('class', 'nodes')

    const nodeElements = nodeGroup.selectAll('g')
      .data(nodes)
      .join('g')
      .attr('transform', d => `translate(${d.x}, ${d.y})`)
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => {
        if (onNodeClick) onNodeClick(d.id)
      })
      .on('mouseenter', (_event, d) => {
        setHoveredNode(d.id)
        // Highlight connected edges
        edgeGroup.selectAll('line')
          .transition()
          .duration(200)
          .attr('stroke', (e: any) => {
            if (e.source === d.id || e.target === d.id) {
              return d.glowColor + 'aa'
            }
            return 'rgba(75, 85, 99, 0.08)'
          })
          .attr('stroke-width', (e: any) => {
            if (e.source === d.id || e.target === d.id) {
              return compact ? 2 : isMobile ? 2 : 3
            }
            return compact ? 0.2 : isMobile ? 0.2 : 0.3
          })
      })
      .on('mouseleave', () => {
        setHoveredNode(null)
        // Reset edges
        edgeGroup.selectAll('line')
          .transition()
          .duration(400)
          .attr('stroke', (d: any) => {
            const sourceActive = userInterests.includes(d.source)
            const targetActive = userInterests.includes(d.target)
            if (sourceActive && targetActive) return 'rgba(139, 92, 246, 0.4)'
            if (sourceActive || targetActive) return 'rgba(139, 92, 246, 0.2)'
            return 'rgba(75, 85, 99, 0.15)'
          })
          .attr('stroke-width', (d: any) => {
            const sourceActive = userInterests.includes(d.source)
            const targetActive = userInterests.includes(d.target)
            if (sourceActive && targetActive) return compact ? 1.5 : isMobile ? 1.5 : 2
            if (sourceActive || targetActive) return compact ? 0.8 : isMobile ? 0.8 : 1.2
            return compact ? 0.3 : isMobile ? 0.3 : 0.5
          })
      })

    // Outer glow ring (for active stars)
    nodeElements.filter(d => d.isUserInterest)
      .append('circle')
      .attr('r', compact ? 16 : isMobile ? 14 : 28)
      .attr('fill', d => d.glowColor)
      .attr('opacity', 0.15)
      .attr('filter', 'url(#star-glow)')

    // Main star circle
    nodeElements.append('circle')
      .attr('r', d => {
        if (compact) return d.isUserInterest ? 8 : 4
        if (isMobile) return d.isUserInterest ? 8 : 3
        return d.isUserInterest ? 14 : 8
      })
      .attr('fill', d => d.isUserInterest ? d.glowColor : '#4b5563')
      .attr('opacity', d => d.isUserInterest ? 1 : 0.5)
      .attr('filter', d => d.isUserInterest ? 'url(#star-glow)' : 'url(#dim-glow)')

    // Inner bright core
    nodeElements.filter(d => d.isUserInterest)
      .append('circle')
      .attr('r', compact ? 3 : isMobile ? 3 : 5)
      .attr('fill', 'white')
      .attr('opacity', 0.9)

    // Icon emoji and labels (full mode only)
    if (!compact) {
      if (isMobile) {
        // ── Mobile: minimal — small icon above active nodes only, short label below ──
        const activeNodes = nodeElements.filter(d => d.isUserInterest)

        activeNodes.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', -14)
          .attr('font-size', '12px')
          .text(d => d.icon)

        // Short label — first word only for long names
        const shortLabel = (label: string) => {
          if (label.length <= 8) return label
          return label.split(/[\s&]/)[0]
        }

        activeNodes.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', 18)
          .attr('fill', '#e5e7eb')
          .attr('font-size', '8px')
          .attr('font-weight', '600')
          .text(d => shortLabel(d.label))

      } else {
        // ── Desktop: full icons and labels on all nodes ──
        nodeElements.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', d => d.isUserInterest ? -24 : -16)
          .attr('font-size', d => d.isUserInterest ? '18px' : '14px')
          .attr('opacity', d => d.isUserInterest ? 1 : 0.5)
          .text(d => d.icon)

        nodeElements.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', d => d.isUserInterest ? 30 : 22)
          .attr('fill', d => d.isUserInterest ? '#e5e7eb' : '#6b7280')
          .attr('font-size', d => d.isUserInterest ? '12px' : '10px')
          .attr('font-weight', d => d.isUserInterest ? '600' : '400')
          .text(d => d.label)

        // Report count badge
        nodeElements.filter(d => d.reportCount > 0)
          .append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', d => d.isUserInterest ? 44 : 36)
          .attr('fill', '#9ca3af')
          .attr('font-size', '9px')
          .text(d => `${d.reportCount} reports`)
      }
    }

    // Pulse animation on active nodes
    if (!compact) {
      const pulseStart = isMobile ? 8 : 14
      const pulseEnd = isMobile ? 18 : 35

      nodeElements.filter(d => d.isUserInterest)
        .append('circle')
        .attr('r', pulseStart)
        .attr('fill', 'none')
        .attr('stroke', d => d.glowColor)
        .attr('stroke-width', 1)
        .attr('opacity', 0)
        .each(function(this: SVGCircleElement, d) {
          const pulse = d3.select(this)
          function doPulse() {
            pulse
              .attr('r', pulseStart)
              .attr('opacity', 0.6)
              .transition()
              .duration(2000)
              .ease(d3.easeCubicOut)
              .attr('r', pulseEnd)
              .attr('opacity', 0)
              .on('end', () => {
                setTimeout(doPulse, 1000 + Math.random() * 3000)
              })
          }
          setTimeout(doPulse, Math.random() * 4000)
        })
    }

    // Selected node highlight ring
    if (selectedNode) {
      const selectedData = nodes.find(n => n.id === selectedNode)
      if (selectedData) {
        svg.append('circle')
          .attr('cx', selectedData.x)
          .attr('cy', selectedData.y)
          .attr('r', compact ? 20 : isMobile ? 25 : 40)
          .attr('fill', 'none')
          .attr('stroke', selectedData.glowColor)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '4,4')
          .attr('opacity', 0.8)
      }
    }

    // Intro animation
    if (!isInitialized) {
      svg.attr('opacity', 0)
        .transition()
        .duration(1000)
        .attr('opacity', 1)

      nodeElements
        .attr('opacity', 0)
        .transition()
        .delay((_, i) => 200 + i * 100)
        .duration(800)
        .attr('opacity', 1)

      edgeGroup.selectAll('line')
        .attr('opacity', 0)
        .transition()
        .delay(1200)
        .duration(800)
        .attr('opacity', 1)

      setIsInitialized(true)
    }

  }, [dimensions, userInterests, stats, selectedNode, compact, isInitialized, onNodeClick])

  // Hovered node tooltip (outside SVG for better styling)
  const hoveredData = hoveredNode ? CONSTELLATION_NODES.find(n => n.id === hoveredNode) : null

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="bg-transparent"
        style={{ display: 'block' }}
      />

      {/* Hover tooltip — full mode only */}
      {!compact && hoveredData && (
        <div
          className="absolute pointer-events-none bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2 max-w-xs z-10"
          style={{
            left: `${50}%`,
            bottom: '16px',
            transform: 'translateX(-50%)',
          }}
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
