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

interface UserMapData {
  categoryStats: Record<string, { views: number; saves: number; uniquePhenomena: number }>
  phenomenonNodes: Array<{
    id: string
    name: string
    slug: string
    category: string
    imageUrl: string | null
    dangerLevel: string | null
    firstViewed: string
    viewCount: number
    isSaved: boolean
  }>
  trail: Array<{ phenomenonId: string; timestamp: string; category: string }>
  stats: {
    totalViewed: number
    totalPhenomena: number
    categoriesExplored: number
    totalCategories: number
    currentStreak: number
    longestStreak: number
    totalSaved: number
    rank: string
    rankLevel: number
  }
}

interface ConstellationMapProps {
  userInterests: PhenomenonCategory[]
  stats?: ConstellationStats[]
  onNodeClick?: (category: PhenomenonCategory) => void
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
}

interface D3Edge extends ConstellationEdge {
  sourceNode?: D3Node
  targetNode?: D3Node
}

const BACKGROUND_STARS = generateBackgroundStars(200)
const COMPACT_BACKGROUND_STARS = generateBackgroundStars(60, 99)
/**
 * Truncate long labels for small screens.
 * "Ghosts & Hauntings" â†’ "Ghosts", "Multi-Disciplinary" â†’ "Multi", etc.
 */
function shortLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label
  const first = label.split(/[\s&]/)[0]
  return first.length > maxLen ? first.slice(0, maxLen - 1) + 'â€¦' : first
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

  // â”€â”€ Build the D3 visualization â€” one unified render for ALL screen sizes â”€â”€
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return

    const svg = d3.select(svgRef.current)
    const { width, height } = dimensions

    // â”€â”€ Responsive scale factors â”€â”€
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

    // â”€â”€ Defs: Glow filters â”€â”€
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

    // â”€â”€ Prepare data â”€â”€
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

    // â”€â”€ Background stars â”€â”€
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

    // â”€â”€ Edges â”€â”€
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

    // â”€â”€ Nodes â”€â”€
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

      // Report count badges â€” only on larger screens
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
ˆËÈ8¥ 8¥ [›ÛY[›Ûˆİ\œÈ
\Ù\‹Y\ØÛİ™\™Y
H8¥ 8¥ ˆYˆ
XÛÛ\Xİ	‰ˆ\Ù\“X\]H	‰ˆ\Ù\“X\]Kœ[›ÛY[›Û“›Ù\Ë›[™İˆ
HÂˆÛÛœİ[›ÛY[›Û‘Ü›İ\Hİ™Ë˜\[™
	ÙÉÊK˜]Š	ØÛ\ÜÉË	Ü[›ÛY[›Û‹\İ\œÉÊB‚ˆËÈÜ›İ\[›ÛY[˜HHØ]YÛÜH[™ÜÚ][Ûˆ[H\›İ[™\™[Ø]YÛÜH›ÙBˆÛÛœİ[PØ]H™]ÈX\İš[™Ë\[Ùˆ\Ù\“X\]Kœ[›ÛY[›Û“›Ù\ÏŠ
Bˆ›Üˆ
ÛÛœİÙˆ\Ù\“X\]Kœ[›ÛY[›Û“›Ù\ÊHÂˆÛÛœİØ]H˜Ø]YÛÜH	ØÛÛXš[˜][Û‰ÂˆYˆ
\[PØ]š\ÊØ]
JH[PØ]œÙ]
Ø]×JBˆ[PØ]™Ù]
Ø]
HKœ\Ú

BˆB‚ˆÛÛœİ[[”İ\œÎˆÈˆ[X™\ÈNˆ[X™\Èˆ\[Ùˆ\Ù\“X\]Kœ[›ÛY[›Û“›Ù\ÖÌNÈ\™[›ÙNˆÓ›ÙHV×HH×B‚ˆ›Üˆ
ÛÛœİØØ][›ÛY[˜WHÙˆ[PØ]
HÂˆÛÛœİ\™[›ÙHH›ÙSX\™Ù]
Ø]\È[›ÛY[›ÛØ]YÛÜJBˆYˆ
\\™[›ÙJHÛÛ[YB‚ˆÛÛœİÜ˜š]˜Y]\ÈHX]›X^
ŒX]œ›İ[™
H
ˆÛ[\ØØ[JJBˆ[›ÛY[˜K™›Ü‘XXÚ

JHOˆÂˆÛÛœİ[™ÛHH
HÈX]›X^
[›ÛY[˜K›[™İJJH
ˆX]”H
ˆˆHX]”HÈ‚ˆËÈYÛYÚ˜[™Û[™\ÜÈÈÜ˜š]ˆÛÛœİš]\”ˆHÜ˜š]˜Y]\È
È
H	HÈHJH
ˆ
ˆÛ[\ØØ[BˆÛÛœİH\™[›ÙK
ÈX]˜ÛÜÊ[™ÛJH
ˆš]\”‚ˆÛÛœİHH\™[›ÙKH
ÈX]œÚ[Š[™ÛJH
ˆš]\”‚ˆ[[”İ\œËœ\Ú
ÈˆNˆK\™[›ÙHJBˆJBˆB‚ˆËÈ˜]È˜Z[[™\ÈÛÛ›™Xİ[™È[›ÛY[›Ûˆİ\œÈÈZ\ˆ\™[Ø]YÛÜBˆ[›ÛY[›Û‘Ü›İ\œÙ[Xİ[
	Û[™Kœ[‹[[šÉÊBˆ™]J[[”İ\œÊKš›Ú[Š	Û[™IÊBˆ˜]Š	ØÛ\ÜÉË	Ü[‹[[šÉÊBˆ˜]Š	ŞIËOˆœ\™[›ÙK
K˜]Š	ŞLIËOˆœ\™[›ÙKJBˆ˜]Š	Ş‰ËOˆ
K˜]Š	ŞL‰ËOˆJBˆ˜]Š	Üİ›ÚÙIËOˆœ\™[›ÙK™ÛİĞÛÛÜŠBˆ˜]Š	Üİ›ÚÙK[ÜXÚ]IËŒMJBˆ˜]Š	Üİ›ÚÙK]ÚY	ËJB‚ˆËÈ˜]È[›ÛY[›Ûˆİ\œÂˆÛÛœİ[”ˆHX]›X^
‹X]œ›İ[™

ˆÛ[\ØØ[JJBˆÛÛœİ[‘[[Y[ÈH[›ÛY[›Û‘Ü›İ\œÙ[Xİ[
	ØÚ\˜ÛKœ[‹\İ\‰ÊBˆ™]J[[”İ\œÊKš›Ú[Š	ØÚ\˜ÛIÊBˆ˜]Š	ØÛ\ÜÉË	Ü[‹\İ\‰ÊBˆ˜]Š	ØŞ	ËOˆ
K˜]Š	ØŞIËOˆJBˆ˜]Š	Ü‰ËOˆœš\ÔØ]™YÈ[”ˆ
ÈHˆ[”ŠBˆ˜]Š	Ùš[	ËOˆœš\ÔØ]™YÈ	ÈÙ˜˜™Œ	Èˆœ\™[›ÙK™ÛİĞÛÛÜŠBˆ˜]Š	ÛÜXÚ]IËOˆX]›Z[ŠK
ÈœšY]ĞÛİ[
ˆŒJJBˆ˜]Š	Ùš[\‰ËOˆœš\ÔØ]™YÈ	İ\›
Üİ\‹YÛİÊIÈˆ	İ\›
Ù[KYÛİÊIÊB‚ˆËÈØ]™Yİ\œÈ[ÙHÙ[Bˆ[›ÛY[›Û‘Ü›İ\œÙ[Xİ[Õ‘ĞÚ\˜ÛQ[[Y[\[Ùˆ[[”İ\œÖÌOŠ	ØÚ\˜ÛKœ[‹\İ\‰ÊBˆ™š[\ŠOˆœš\ÔØ]™Y
Bˆ™XXÚ
[˜İ[ÛŠ\ÎˆÕ‘ĞÚ\˜ÛQ[[Y[
HÂˆÛÛœİİ\ˆHËœÙ[Xİ
\ÊBˆÛÛœİ˜\ÙTˆH\œÙQ›Ø]
İ\‹˜]Š	Ü‰ÊJBˆ[˜İ[Ûˆ[ÙTØ]™Y

HÂˆİ\‹˜[œÚ][ÛŠ
K™\˜][ÛŠŒ
K™X\ÙJË™X\ÙTÚ[’[“İ]
Bˆ˜]Š	Ü‰Ë˜\ÙTˆ
ÈKJK˜]Š	ÛÜXÚ]IËMJBˆ˜[œÚ][ÛŠ
K™\˜][ÛŠŒ
K™X\ÙJË™X\ÙTÚ[’[“İ]
Bˆ˜]Š	Ü‰Ë˜\ÙTŠK˜]Š	ÛÜXÚ]IËÊBˆ›ÛŠ	Ù[™	Ë[ÙTØ]™Y
BˆBˆÙ][Y[İ]
[ÙTØ]™YX]œ˜[™ÛJ
H
ˆÌ
BˆJB‚ˆËÈ[›È[š[X][Ûˆ›Üˆ[›ÛY[›Ûˆİ\œÂˆYˆ
Z\Ò[š]X[^™Y
HÂˆ[‘[[Y[Ë˜]Š	ÛÜXÚ]IË
Bˆ˜[œÚ][ÛŠ
K™[^JML
K™\˜][ÛŠŒ
Bˆ˜]Š	ÛÜXÚ]IËOˆX]›Z[ŠK
ÈœšY]ĞÛİ[
ˆŒJJBˆBˆB‚ˆËÈ8¥ 8¥ ^Ü˜][Ûˆ˜Z[
\Ù\‰ÜÈ›İ\›™^H]
H8¥ 8¥ ˆYˆ
XÛÛ\Xİ	‰ˆ\Ù\“X\]H	‰ˆ\Ù\“X\]K˜Z[›[™İˆJHÂˆÛÛœİ˜Z[Ü›İ\Hİ™Ë˜\[™
	ÙÉÊK˜]Š	ØÛ\ÜÉË	İ˜Z[	ÊB‚ˆËÈX\˜Z[[šY\ÈÈÛÛÜ™[˜]\ÈšXHZ\ˆ[›ÛY[›Û‰ÜÈØ]YÛÜH›ÙBˆÛÛœİ˜Z[Ú[ÎˆÈˆ[X™\ÈNˆ[X™\ˆV×HH×Bˆ›Üˆ
ÛÛœİ[HÙˆ\Ù\“X\]K˜Z[œÛXÙJLŒ
JHÂˆÛÛœİØ]›ÙHH›ÙSX\™Ù]
[K˜Ø]YÛÜH\È[›ÛY[›ÛØ]YÛÜJBˆYˆ
Ø]›ÙJHÂˆËÈÙ™œÙ]ÛYÚHœ›ÛHÙ[\ˆÈ]›ÚYİ™\›\[™ÈH›ÙBˆÛÛœİH
X]œ˜[™ÛJ
HHJH
ˆŒ
ˆÛ[\ØØ[BˆÛÛœİHH
X]œ˜[™ÛJ
HHJH
ˆŒ
ˆÛ[\ØØ[Bˆ˜Z[Ú[Ëœ\Ú
ÈˆØ]›ÙK
ÈNˆØ]›ÙKH
ÈHJBˆBˆB‚ˆYˆ
˜Z[Ú[Ë›[™İˆJHÂˆÛÛœİ[™QÙ[ˆHË›[™OÈˆ[X™\ÈNˆ[X™\ˆOŠ
Bˆ
Oˆ
KJOˆJBˆ˜İ\™JË˜İ\™PØ]][›ÛK˜[JJJB‚ˆ˜Z[Ü›İ\˜\[™
	Ü]	ÊBˆ˜]Š	Ù	Ë[™QÙ[Š˜Z[Ú[ÊJBˆ˜]Š	Ùš[	Ë	Û›Û™IÊBˆ˜]Š	Üİ›ÚÙIË	Ü™Ø˜JLÎKL‹‹ŒŠIÊBˆ˜]Š	Üİ›ÚÙK]ÚY	ËKJBˆ˜]Š	Üİ›ÚÙKY\Ú\œ˜^IË	Í‹	ÊBˆ˜]Š	Üİ›ÚÙK[[™XØ\	Ë	Ü›İ[™	ÊBˆBˆB‚ˆËÈÙ[XİY›ÙHYÚYÚš[™ÂˆYˆ
Ù[XİY›ÙJHÂˆÛÛœİÙH›Ù\Ë™š[™
ˆOˆ‹šYOOHÙ[XİY›ÙJBˆYˆ
Ù
HÂˆİ™Ë˜\[™
	ØÚ\˜ÛIÊK˜]Š	ØŞ	ËÙ
K˜]Š	ØŞIËÙJBˆ˜]Š	Ü‰ËÙ[XİŠK˜]Š	Ùš[	Ë	Û›Û™IÊBˆ˜]Š	Üİ›ÚÙIËÙ™ÛİĞÛÛÜŠK˜]Š	Üİ›ÚÙK]ÚY	ËŠBˆ˜]Š	Üİ›ÚÙKY\Ú\œ˜^IË	Í	ÊK˜]Š	ÛÜXÚ]IË
BˆBˆB‚ˆËÈ[›È[š[X][Û‚ˆYˆ
Z\Ò[š]X[^™Y
HÂˆİ™Ë˜]Š	ÛÜXÚ]IË
K˜[œÚ][ÛŠ
K™\˜][ÛŠL
K˜]Š	ÛÜXÚ]IËJBˆ›ÙQ[[Y[Ë˜]Š	ÛÜXÚ]IË
K˜[œÚ][ÛŠ
K™[^J
ËJHOˆŒ
ÈH
ˆL
K™\˜][ÛŠ
K˜]Š	ÛÜXÚ]IËJBˆYÙQÜ›İ\œÙ[Xİ[
	Û[™IÊK˜]Š	ÛÜXÚ]IË
K˜[œÚ][ÛŠ
K™[^JLŒ
K™\˜][ÛŠ
K˜]Š	ÛÜXÚ]IËJBˆÙ]\Ò[š]X[^™Y
YJBˆB‚ˆKÙ[Y[œÚ[ÛœË\Ù\’[\™\İËİ]ËÙ[XİY›ÙKÛÛ\Xİ\Ò[š]X[^™YÛ“›ÙPÛXÚË\Ù\“X\]WJB‚ˆÛÛœİİ™\™Y]HHİ™\™Y›ÙHÈÓÓ”ÕSUSÓ—Ó“ÑTË™š[™
ˆOˆ‹šYOOHİ™\™Y›ÙJHˆ[‚ˆ™]\›ˆ
ˆ]ˆ™Y^ØÛÛZ[™\”™YŸHÛ\ÜÓ˜[YOHœ™[]]™HËY[Y[‚ˆİ™Âˆ™Y^Üİ™Ô™YŸBˆÚY^Ù[Y[œÚ[ÛœËÚYBˆZYÚ^Ù[Y[œÚ[ÛœËšZYÚBˆÛ\ÜÓ˜[YOH˜™Ë]˜[œÜ\™[‚ˆİ[O^ŞÈ\Ü^Nˆ[Y[œÚ[ÛœËÚYˆÈ	Ø›ØÚÉÈˆ	Û›Û™IÈ_BˆÏ‚‚ˆËÊˆİ™\ˆÛÛ\8 %[[ÙHÛ›H
‹ßBˆÈXÛÛ\Xİ	‰ˆİ™\™Y]H	‰ˆ
ˆ]‚ˆÛ\ÜÓ˜[YOH˜XœÛÛ]HÚ[\‹Y]™[Ë[›Û™H™ËYÜ˜^KNLÎMH›Ü™\ˆ›Ü™\‹YÜ˜^KMÌ›İ[™Y[ÈLÈKLˆX^]Ë^È‹LL‚ˆİ[O^ŞÈYˆ	ÍL	IË›İÛNˆ	ÌMœ	Ë˜[œÙ›Ü›Nˆ	İ˜[œÛ]V
ML	JIÈ_Bˆ‚ˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\Lˆ‚ˆÜ[ˆÛ\ÜÓ˜[YOH^[ÈÚİ™\™Y]KšXÛÛŸOÜÜ[‚ˆÜ[ˆÛ\ÜÓ˜[YOH^]Ú]H›Û[YY][H^\ÛHÚİ™\™Y]K›X™[OÜÜ[‚ˆİ\Ù\’[\™\İËš[˜ÛY\Êİ™\™Y]KšY
H	‰ˆ
ˆÜ[ˆÛ\ÜÓ˜[YOH^^ÈLKHKLH›İ[™YY[™Ë\š[X\KMLÌŒ^\š[X\KM‘›ÛİÚ[™ÏÜÜ[‚ˆ
_BˆÙ]‚ˆÛ\ÜÓ˜[YOH^YÜ˜^KM^^È]LHÚİ™\™Y]K™\ØÜš\[ÛŸOÜ‚ˆÛ\ÜÓ˜[YOH^YÜ˜^KML^^È]LHÛXÚÈÈ^Ü™OÜ‚ˆÙ]‚ˆ
_BˆÙ]‚ˆ
BŸB