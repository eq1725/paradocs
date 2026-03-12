'use client'

/**
 * ConstellationView — Canvas-based interactive star field for the Research Hub.
 *
 * Adapted from the legacy ConstellationMapV2 hooks (useForceSimulation + useCanvasRenderer)
 * to work with the new constellation_artifacts + constellation_connections data model.
 *
 * Features:
 * - D3 force simulation with case-file-based clustering (nebulae)
 * - Canvas rendering with background stars, nebula glows, connection edges
 * - Progression unlock system (locked < 5, basic 5+, growing 15+, rich 30+, majestic 50+)
 * - Pan/zoom with mouse and touch
 * - Node hover/select with detail callback
 * - Connection edges styled by relationship type
 */

import type {
  ConstellationArtifact,
  CaseFile,
  ConstellationConnection,
  AiInsight,
} from '@/lib/database.types'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as d3 from 'd3'
import { Lock, Stars, Plus, Sparkles } from 'lucide-react'
import { classNames } from '@/lib/utils'

// ── Types ──

interface ConstellationViewProps {
  artifacts: ConstellationArtifact[]
  caseFiles: CaseFile[]
  connections: ConstellationConnection[]
  insights: AiInsight[]
  onSelectArtifact: (artifact: ConstellationArtifact) => void
  onAddArtifact: () => void
}

interface StarNode extends d3.SimulationNodeDatum {
  id: string
  artifact: ConstellationArtifact
  caseFileId: string | null
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
  radius: number
}

interface StarEdge {
  source: string
  target: string
  type: string // relationship_type from connections
  label: string | null
  strength: number
}

interface CaseFileCluster {
  id: string
  title: string
  color: string
  icon: string
  x: number
  y: number
  nodeCount: number
}

interface BgStar {
  x: number
  y: number
  size: number
  alpha: number
  twinkleSpeed: number
  twinklePhase: number
}

// ── Progression Tiers ──

type ProgressionTier = 'locked' | 'basic' | 'growing' | 'rich' | 'majestic'

var TIER_THRESHOLDS: Array<{ tier: ProgressionTier; min: number; label: string; description: string }> = [
  { tier: 'locked', min: 0, label: 'Locked', description: 'Add at least 5 artifacts to unlock your constellation' },
  { tier: 'basic', min: 5, label: 'Basic', description: 'Your research constellation is taking shape' },
  { tier: 'growing', min: 15, label: 'Growing', description: 'Connections are forming between your evidence' },
  { tier: 'rich', min: 30, label: 'Rich', description: 'A complex web of evidence emerges' },
  { tier: 'majestic', min: 50, label: 'Majestic', description: 'A full research universe' },
]

function getProgressionTier(artifactCount: number): { tier: ProgressionTier; label: string; description: string; nextTier: number | null } {
  var current = TIER_THRESHOLDS[0]
  var nextThreshold: number | null = TIER_THRESHOLDS[1]?.min || null

  for (var i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (artifactCount >= TIER_THRESHOLDS[i].min) {
      current = TIER_THRESHOLDS[i]
      nextThreshold = i < TIER_THRESHOLDS.length - 1 ? TIER_THRESHOLDS[i + 1].min : null
      break
    }
  }

  return {
    tier: current.tier,
    label: current.label,
    description: current.description,
    nextTier: nextThreshold,
  }
}

// ── Color Constants ──

var VERDICT_COLORS: Record<string, string> = {
  compelling: '#fbbf24',
  inconclusive: '#60a5fa',
  skeptical: '#9ca3af',
  needs_info: '#a78bfa',
}

var CASE_FILE_COLORS = [
  '#22c55e', '#f59e0b', '#a855f7', '#3b82f6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#06b6d4', '#ef4444',
]

var CONNECTION_COLORS: Record<string, string> = {
  same_witness: '#ffffff',
  same_location: '#22c55e',
  same_timeframe: '#3b82f6',
  contradicts: '#ef4444',
  corroborates: '#fbbf24',
  related: '#9ca3af',
  custom: '#a78bfa',
}

// ── Helpers ──

function hexToRGBA(hex: string, alpha: number): string {
  var r = parseInt(hex.slice(1, 3), 16)
  var g = parseInt(hex.slice(3, 5), 16)
  var b = parseInt(hex.slice(5, 7), 16)
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
}

function hashString(str: string): number {
  var hash = 0
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

function generateBgStars(count: number): BgStar[] {
  var stars: BgStar[] = []
  for (var i = 0; i < count; i++) {
    var isLarge = i >= count * 0.75
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size: isLarge ? Math.random() * 1.5 + 1.5 : Math.random() * 1.2 + 0.3,
      alpha: isLarge ? Math.random() * 0.3 + 0.3 : Math.random() * 0.5 + 0.15,
      twinkleSpeed: Math.random() * 0.025 + 0.008,
      twinklePhase: Math.random() * Math.PI * 2,
    })
  }
  return stars
}

function getNodeRadius(artifact: ConstellationArtifact, tier: ProgressionTier): number {
  var base = tier === 'majestic' ? 6 : tier === 'rich' ? 5.5 : 5
  if (artifact.tags && artifact.tags.length > 2) base += 1
  if (artifact.verdict === 'compelling') base += 1
  return base
}

// ── Component ──

export function ConstellationView({
  artifacts,
  caseFiles,
  connections,
  insights,
  onSelectArtifact,
  onAddArtifact,
}: ConstellationViewProps) {
  var canvasRef = useRef<HTMLCanvasElement>(null)
  var containerRef = useRef<HTMLDivElement>(null)
  var simulationRef = useRef<d3.Simulation<StarNode, StarEdge> | null>(null)
  var nodesRef = useRef<StarNode[]>([])
  var edgesRef = useRef<StarEdge[]>([])
  var clustersRef = useRef<CaseFileCluster[]>([])
  var bgStarsRef = useRef<BgStar[]>(generateBgStars(350))
  var animFrameRef = useRef<number>(0)
  var timeRef = useRef(0)

  var [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  var [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  var [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  var [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  var [settled, setSettled] = useState(false)

  var progression = useMemo(function() {
    return getProgressionTier(artifacts.length)
  }, [artifacts.length])

  // ── Resize Observer ──

  useEffect(function() {
    var container = containerRef.current
    if (!container) return

    var observer = new ResizeObserver(function(entries) {
      var entry = entries[0]
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(container)

    return function() { observer.disconnect() }
  }, [])

  // ── Build and Run Force Simulation ──

  useEffect(function() {
    if (progression.tier === 'locked') return
    if (dimensions.width < 10 || dimensions.height < 10) return

    var w = dimensions.width
    var h = dimensions.height

    // Build case file clusters positioned in a circle
    var cfMap = new Map<string, CaseFile>()
    caseFiles.forEach(function(cf) { cfMap.set(cf.id, cf) })

    // Count artifacts per case file (simplified: use first matching case file)
    var artifactCfMap = new Map<string, string>() // artifact_id -> case_file_id
    // For now, we derive from metadata or use "unsorted"
    // In a full implementation, the hub-data API would return junction data
    // For now, distribute artifacts among case files based on available data

    var clusters: CaseFileCluster[] = []
    var cfIds = caseFiles.map(function(cf) { return cf.id })
    var angleStep = cfIds.length > 0 ? (Math.PI * 2) / cfIds.length : 0
    var centerX = w / 2
    var centerY = h / 2
    var orbitRadius = Math.min(w, h) * 0.3

    cfIds.forEach(function(cfId, i) {
      var cf = cfMap.get(cfId)
      if (!cf) return
      clusters.push({
        id: cfId,
        title: cf.title,
        color: CASE_FILE_COLORS[i % CASE_FILE_COLORS.length],
        icon: cf.icon || '\u{1F4C1}',
        x: centerX + Math.cos(angleStep * i - Math.PI / 2) * orbitRadius,
        y: centerY + Math.sin(angleStep * i - Math.PI / 2) * orbitRadius,
        nodeCount: 0,
      })
    })

    // Add "Unsorted" cluster at center
    clusters.push({
      id: '__unsorted__',
      title: 'Unsorted',
      color: '#64748b',
      icon: '\u{2B50}',
      x: centerX,
      y: centerY,
      nodeCount: 0,
    })

    var clusterMap = new Map<string, CaseFileCluster>()
    clusters.forEach(function(c) { clusterMap.set(c.id, c) })

    // Build star nodes
    var nodes: StarNode[] = artifacts.map(function(artifact, i) {
      // Determine which cluster this artifact belongs to
      var cfId = artifactCfMap.get(artifact.id) || '__unsorted__'
      var cluster = clusterMap.get(cfId) || clusterMap.get('__unsorted__')!

      // Update cluster count
      cluster.nodeCount++

      var angle = (i / Math.max(artifacts.length, 1)) * Math.PI * 2 + Math.random() * 0.5
      var spread = 60 + Math.random() * 50

      return {
        id: artifact.id,
        artifact: artifact,
        caseFileId: cfId === '__unsorted__' ? null : cfId,
        x: cluster.x + Math.cos(angle) * spread,
        y: cluster.y + Math.sin(angle) * spread,
        radius: getNodeRadius(artifact, progression.tier),
      }
    })

    // Build edges from connections
    var edges: StarEdge[] = connections.map(function(conn) {
      return {
        source: conn.artifact_a_id,
        target: conn.artifact_b_id,
        type: conn.relationship_type,
        label: conn.annotation,
        strength: conn.ai_suggested ? 0.3 : 0.6,
      }
    })

    // Also build tag-based edges (implicit connections)
    var tagGroups: Record<string, string[]> = {}
    artifacts.forEach(function(a) {
      if (a.tags) {
        a.tags.forEach(function(tag) {
          if (!tagGroups[tag]) tagGroups[tag] = []
          tagGroups[tag].push(a.id)
        })
      }
    })

    var tagEdgeSeen = new Set<string>()
    Object.keys(tagGroups).forEach(function(tag) {
      var ids = tagGroups[tag]
      if (ids.length < 2 || ids.length > 10) return // Skip very common tags
      for (var i = 0; i < ids.length; i++) {
        for (var j = i + 1; j < ids.length; j++) {
          var key = [ids[i], ids[j]].sort().join('--')
          if (!tagEdgeSeen.has(key)) {
            tagEdgeSeen.add(key)
            edges.push({
              source: ids[i],
              target: ids[j],
              type: 'tag',
              label: tag,
              strength: 0.15,
            })
          }
        }
      }
    })

    nodesRef.current = nodes
    edgesRef.current = edges
    clustersRef.current = clusters

    // Kill previous simulation
    if (simulationRef.current) {
      simulationRef.current.stop()
    }

    // Build D3 force simulation
    var simulation = d3.forceSimulation<StarNode>(nodes)
      .force('clusterX', d3.forceX<StarNode>(function(d) {
        var cfId = d.caseFileId || '__unsorted__'
        var cluster = clusterMap.get(cfId)
        return cluster ? cluster.x : centerX
      }).strength(0.12))
      .force('clusterY', d3.forceY<StarNode>(function(d) {
        var cfId = d.caseFileId || '__unsorted__'
        var cluster = clusterMap.get(cfId)
        return cluster ? cluster.y : centerY
      }).strength(0.12))
      .force('charge', d3.forceManyBody<StarNode>().strength(-40).distanceMax(200))
      .force('collide', d3.forceCollide<StarNode>(function(d) { return d.radius + 3 }).strength(0.8))
      .force('link', d3.forceLink<StarNode, StarEdge>(edges as any)
        .id(function(d) { return d.id })
        .distance(70)
        .strength(function(d) { return (d as StarEdge).strength * 0.08 })
      )
      .force('bounds', function() {
        var pad = 30
        nodes.forEach(function(node) {
          node.x = Math.max(pad, Math.min(w - pad, node.x))
          node.y = Math.max(pad, Math.min(h - pad, node.y))
        })
      })
      .alphaDecay(0.02)
      .velocityDecay(0.4)
      .on('end', function() { setSettled(true) })

    simulationRef.current = simulation
    setSettled(false)

    return function() { simulation.stop() }
  }, [artifacts, caseFiles, connections, dimensions, progression.tier])

  // ── Canvas Drawing ──

  var draw = useCallback(function() {
    var canvas = canvasRef.current
    if (!canvas) return

    var maybeCtx = canvas.getContext('2d')
    if (!maybeCtx) return
    var ctx: CanvasRenderingContext2D = maybeCtx

    var w = dimensions.width
    var h = dimensions.height
    var dpr = Math.min(window.devicePixelRatio || 1, 2)
    var time = timeRef.current

    canvas.width = w * dpr
    canvas.height = h * dpr

    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // Background gradient
    var bgGrad = ctx.createLinearGradient(0, 0, 0, h)
    bgGrad.addColorStop(0, '#0a0a1a')
    bgGrad.addColorStop(0.5, '#0d0d24')
    bgGrad.addColorStop(1, '#080818')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, w, h)

    // Background stars (fixed, no transform)
    var stars = bgStarsRef.current
    stars.forEach(function(star) {
      var twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase)
      var alpha = star.alpha * (0.6 + 0.4 * twinkle)
      ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')'
      ctx.beginPath()
      ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2)
      ctx.fill()
    })

    // Apply zoom transform
    ctx.save()
    ctx.translate(transform.x, transform.y)
    ctx.scale(transform.k, transform.k)

    var nodes = nodesRef.current
    var edges = edgesRef.current
    var clusters = clustersRef.current
    var zoom = transform.k

    // Draw case file nebulae
    clusters.forEach(function(cluster) {
      if (cluster.nodeCount === 0) return
      var baseRadius = 80 + Math.min(cluster.nodeCount * 20, 160)
      var maxAlpha = Math.min(0.1 + cluster.nodeCount * 0.015, 0.18)

      var grad = ctx.createRadialGradient(cluster.x, cluster.y, 0, cluster.x, cluster.y, baseRadius)
      grad.addColorStop(0, hexToRGBA(cluster.color, maxAlpha))
      grad.addColorStop(0.5, hexToRGBA(cluster.color, maxAlpha * 0.3))
      grad.addColorStop(1, hexToRGBA(cluster.color, 0))
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cluster.x, cluster.y, baseRadius, 0, Math.PI * 2)
      ctx.fill()
    })

    // Draw edges
    if (zoom >= 0.4) {
      var nodeMap = new Map<string, StarNode>()
      nodes.forEach(function(n) { nodeMap.set(n.id, n) })

      edges.forEach(function(edge) {
        var sourceId = typeof edge.source === 'string' ? edge.source : (edge.source as any).id
        var targetId = typeof edge.target === 'string' ? edge.target : (edge.target as any).id
        var source = nodeMap.get(sourceId)
        var target = nodeMap.get(targetId)
        if (!source || !target) return

        var isHighlighted = selectedNodeId && (sourceId === selectedNodeId || targetId === selectedNodeId)
        var edgeColor = CONNECTION_COLORS[edge.type] || '#888'
        var alpha = edge.type === 'tag' ? (isHighlighted ? 0.5 : 0.06) : (isHighlighted ? 0.8 : 0.4)
        var lineWidth = edge.type === 'tag' ? (isHighlighted ? 1 : 0.4) : (isHighlighted ? 2.5 : 1.5)

        // Glow for non-tag connections
        if (edge.type !== 'tag') {
          ctx.strokeStyle = hexToRGBA(edgeColor, isHighlighted ? 0.3 : 0.15)
          ctx.lineWidth = (lineWidth * 3) / zoom
          ctx.beginPath()
          ctx.moveTo(source.x, source.y)
          ctx.lineTo(target.x, target.y)
          ctx.stroke()
        }

        ctx.strokeStyle = hexToRGBA(edgeColor, alpha)
        ctx.lineWidth = lineWidth / zoom
        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        ctx.stroke()
      })
    }

    // Draw star nodes
    nodes.forEach(function(node) {
      var x = node.x
      var y = node.y
      var r = node.radius / Math.max(zoom, 0.5)
      var art = node.artifact

      var isHovered = node.id === hoveredNodeId
      var isSelected = node.id === selectedNodeId
      var isActive = isHovered || isSelected

      var verdictColor = VERDICT_COLORS[art.verdict || ''] || '#9ca3af'
      var cfCluster = clustersRef.current.find(function(c) { return c.id === (node.caseFileId || '__unsorted__') })
      var catGlow = cfCluster ? cfCluster.color : '#666'

      // Per-star twinkle
      var phase = (hashString(node.id) % 1000) / 1000 * Math.PI * 2
      var twinkle = Math.sin(time * 0.04 + phase) * 0.25 + 0.75

      // Active node glow
      if (isActive) {
        var glowR = r * 5
        var glow = ctx.createRadialGradient(x, y, 0, x, y, glowR)
        glow.addColorStop(0, hexToRGBA(verdictColor, 0.5))
        glow.addColorStop(0.5, hexToRGBA(verdictColor, 0.15))
        glow.addColorStop(1, hexToRGBA(verdictColor, 0))
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(x, y, glowR, 0, Math.PI * 2)
        ctx.fill()
      }

      // Pulse for selected
      var displayR = r
      if (isSelected) {
        displayR = r * (1 + 0.15 * Math.sin(time * 0.06))
      }

      // Outer halo
      var outerHaloR = displayR * 3.5
      var outerGrad = ctx.createRadialGradient(x, y, 0, x, y, outerHaloR)
      outerGrad.addColorStop(0, hexToRGBA(verdictColor, 0.08 * twinkle))
      outerGrad.addColorStop(0.5, hexToRGBA(verdictColor, 0.02))
      outerGrad.addColorStop(1, hexToRGBA(verdictColor, 0))
      ctx.fillStyle = outerGrad
      ctx.beginPath()
      ctx.arc(x, y, outerHaloR, 0, Math.PI * 2)
      ctx.fill()

      // Medium glow (case file color)
      var medGlowR = displayR * 2.2
      var medGrad = ctx.createRadialGradient(x, y, displayR * 0.7, x, y, medGlowR)
      medGrad.addColorStop(0, hexToRGBA(catGlow, 0.2 * twinkle))
      medGrad.addColorStop(0.6, hexToRGBA(catGlow, 0.05))
      medGrad.addColorStop(1, hexToRGBA(catGlow, 0))
      ctx.fillStyle = medGrad
      ctx.beginPath()
      ctx.arc(x, y, medGlowR, 0, Math.PI * 2)
      ctx.fill()

      // Core
      ctx.fillStyle = hexToRGBA(verdictColor, 0.85 * twinkle)
      ctx.beginPath()
      ctx.arc(x, y, displayR, 0, Math.PI * 2)
      ctx.fill()

      // Diffraction spikes for compelling/active
      if (isActive || art.verdict === 'compelling') {
        var spikeLen = displayR * (isActive ? 3.0 : 2.5)
        var spikeW = displayR * 0.2
        var spikeAlpha = (isActive ? 0.6 : 0.4) * twinkle

        ctx.save()
        ctx.globalAlpha = spikeAlpha
        ctx.fillStyle = '#ffffff'

        ctx.beginPath()
        ctx.moveTo(x - spikeLen, y)
        ctx.lineTo(x - spikeW, y - spikeW * 0.5)
        ctx.lineTo(x + spikeW, y - spikeW * 0.5)
        ctx.lineTo(x + spikeLen, y)
        ctx.lineTo(x + spikeW, y + spikeW * 0.5)
        ctx.lineTo(x - spikeW, y + spikeW * 0.5)
        ctx.closePath()
        ctx.fill()

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

      // Center highlight
      var centerAlpha = (0.7 + 0.2 * twinkle) * (isActive ? 1.0 : 0.8)
      ctx.fillStyle = 'rgba(255, 255, 255, ' + centerAlpha + ')'
      ctx.beginPath()
      ctx.arc(x, y, displayR * 0.35, 0, Math.PI * 2)
      ctx.fill()

      // Label for active nodes
      if (isActive) {
        var fontSize = Math.max(10, Math.min(13, 12 / zoom))
        ctx.font = '600 ' + fontSize + "px 'Space Grotesk', Inter, system-ui, sans-serif"
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        var label = art.title.length > 28 ? art.title.slice(0, 26) + '\u2026' : art.title
        var textY = y + displayR + 6 / zoom

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillText(label, x + 0.5 / zoom, textY + 0.5 / zoom)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.fillText(label, x, textY)
      }
    })

    // Draw cluster labels (fade at high zoom)
    var zoomFade = 1
    if (zoom > 1.5) {
      zoomFade = Math.max(0, 1 - (zoom - 1.5) / 1.5)
    }
    if (zoomFade > 0.01) {
      clusters.forEach(function(cluster) {
        if (cluster.nodeCount === 0 && cluster.id !== '__unsorted__') return
        var alpha = (cluster.nodeCount > 0 ? 0.7 : 0.3) * zoomFade
        var fontSize = Math.max(11, Math.min(14, 13 / zoom))

        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        ctx.font = fontSize * 1.5 + 'px sans-serif'
        ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')'
        ctx.fillText(cluster.icon, cluster.x, cluster.y - fontSize * 1.2)

        ctx.font = '600 ' + fontSize + "px 'Space Grotesk', Inter, system-ui, sans-serif"
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (alpha * 0.8) + ')'
        ctx.fillText(cluster.title, cluster.x, cluster.y + fontSize * 0.4)

        if (cluster.nodeCount > 0) {
          ctx.font = '400 ' + (fontSize * 0.75) + 'px Inter, system-ui, sans-serif'
          ctx.fillStyle = 'rgba(255, 255, 255, ' + (alpha * 0.5) + ')'
          ctx.fillText(cluster.nodeCount + ' artifacts', cluster.x, cluster.y + fontSize * 1.5)
        }
      })
    }

    ctx.restore()
    ctx.restore()
  }, [dimensions, transform, hoveredNodeId, selectedNodeId, progression.tier])

  // ── Animation Loop ──

  useEffect(function() {
    if (progression.tier === 'locked') return

    var running = true
    function animate() {
      if (!running) return
      timeRef.current++
      draw()
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animate()

    return function() {
      running = false
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [draw, progression.tier])

  // ── Zoom + Pan (D3 zoom behavior) ──

  useEffect(function() {
    var canvas = canvasRef.current
    if (!canvas || progression.tier === 'locked') return

    var zoomBehavior = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.3, 5])
      .on('zoom', function(event) {
        setTransform({
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k,
        })
      })

    d3.select(canvas).call(zoomBehavior)

    return function() {
      d3.select(canvas).on('.zoom', null)
    }
  }, [dimensions, progression.tier])

  // ── Hit Testing (mouse/touch) ──

  var screenToWorld = useCallback(function(screenX: number, screenY: number) {
    return {
      x: (screenX - transform.x) / transform.k,
      y: (screenY - transform.y) / transform.k,
    }
  }, [transform])

  var handleCanvasMove = useCallback(function(e: React.MouseEvent) {
    var rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    var world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

    var hitRadius = Math.max(12, 20 / transform.k)
    var found: StarNode | null = null
    var nodes = nodesRef.current

    for (var i = nodes.length - 1; i >= 0; i--) {
      var dx = world.x - nodes[i].x
      var dy = world.y - nodes[i].y
      if (dx * dx + dy * dy < hitRadius * hitRadius) {
        found = nodes[i]
        break
      }
    }

    setHoveredNodeId(found ? found.id : null)
    if (canvasRef.current) {
      canvasRef.current.style.cursor = found ? 'pointer' : 'grab'
    }
  }, [screenToWorld, transform.k])

  var handleCanvasClick = useCallback(function(e: React.MouseEvent) {
    var rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    var world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

    var hitRadius = Math.max(12, 20 / transform.k)
    var found: StarNode | null = null
    var nodes = nodesRef.current

    for (var i = nodes.length - 1; i >= 0; i--) {
      var dx = world.x - nodes[i].x
      var dy = world.y - nodes[i].y
      if (dx * dx + dy * dy < hitRadius * hitRadius) {
        found = nodes[i]
        break
      }
    }

    if (found) {
      setSelectedNodeId(found.id)
      onSelectArtifact(found.artifact)
    } else {
      setSelectedNodeId(null)
    }
  }, [screenToWorld, transform.k, onSelectArtifact])

  // ── Locked State ──

  if (progression.tier === 'locked') {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 text-center px-4">
        <div className="relative mb-8">
          <div className="w-32 h-32 rounded-full bg-gray-800/50 border border-gray-700 flex items-center justify-center">
            <Lock className="w-12 h-12 text-gray-600" />
          </div>
          <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <Stars className="w-5 h-5 text-indigo-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Unlock Your Constellation</h2>
        <p className="text-gray-400 mb-2 max-w-md">
          Add at least 5 artifacts to your Research Hub to unlock the Constellation view.
          Each piece of evidence becomes a star in your personal research universe.
        </p>
        <p className="text-gray-500 text-sm mb-6">
          {artifacts.length} / 5 artifacts added
        </p>
        <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-500"
            style={{ width: Math.min(100, (artifacts.length / 5) * 100) + '%' }}
          />
        </div>
        <button
          onClick={onAddArtifact}
          className={classNames(
            'inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium',
            'bg-indigo-600 text-white hover:bg-indigo-500 transition-colors'
          )}
        >
          <Plus className="w-5 h-5" />
          Add Artifact
        </button>
      </div>
    )
  }

  // ── Active Constellation ──

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-96" style={{ height: 'calc(100vh - 120px)' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ width: dimensions.width, height: dimensions.height }}
        onMouseMove={handleCanvasMove}
        onClick={handleCanvasClick}
        onMouseLeave={function() { setHoveredNodeId(null) }}
      />

      {/* Progression Badge */}
      <div className="absolute top-4 left-4 z-10">
        <div className={classNames(
          'flex items-center gap-2 px-3 py-2 rounded-lg border backdrop-blur-sm',
          progression.tier === 'majestic'
            ? 'bg-amber-500/10 border-amber-500/30'
            : progression.tier === 'rich'
            ? 'bg-purple-500/10 border-purple-500/30'
            : 'bg-gray-800/70 border-gray-700'
        )}>
          <Sparkles className={classNames(
            'w-4 h-4',
            progression.tier === 'majestic' ? 'text-amber-400' :
            progression.tier === 'rich' ? 'text-purple-400' :
            'text-gray-400'
          )} />
          <span className="text-sm font-medium text-white">{progression.label}</span>
          <span className="text-xs text-gray-400">
            {artifacts.length} artifacts
          </span>
          {progression.nextTier && (
            <span className="text-xs text-gray-500">
              \u00B7 {progression.nextTier - artifacts.length} to next tier
            </span>
          )}
        </div>
      </div>

      {/* Help hint */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="px-3 py-2 rounded-lg bg-gray-800/70 border border-gray-700 backdrop-blur-sm">
          <p className="text-xs text-gray-400">
            Scroll to zoom \u00B7 Drag to pan \u00B7 Click a star to view details
          </p>
        </div>
      </div>

      {/* Add button */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={onAddArtifact}
          className={classNames(
            'flex items-center gap-2 px-3 py-2 rounded-lg',
            'bg-indigo-600/80 text-white hover:bg-indigo-500 transition-colors',
            'backdrop-blur-sm border border-indigo-500/30'
          )}
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">Add</span>
        </button>
      </div>
    </div>
  )
}

export default ConstellationView
