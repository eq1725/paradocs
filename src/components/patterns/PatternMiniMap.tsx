'use client'

import React, { useEffect, useRef } from 'react'
import { MapPin, ZoomIn } from 'lucide-react'

interface PatternMiniMapProps {
  center: { lat: number; lng: number }
  radiusKm?: number
  reportCount?: number
  className?: string
  interactive?: boolean
  onExpand?: () => void
}

/**
 * Lightweight mini-map for pattern cards
 * Uses static map tiles for performance, no heavy Mapbox GL dependency
 */
export default function PatternMiniMap({
  center,
  radiusKm = 50,
  reportCount,
  className = '',
  interactive = false,
  onExpand
}: PatternMiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Calculate zoom level based on radius
  const getZoomLevel = (radius: number): number => {
    // Approximate zoom for given radius in km
    if (radius > 500) return 3
    if (radius > 200) return 5
    if (radius > 100) return 6
    if (radius > 50) return 7
    if (radius > 20) return 8
    return 9
  }

  const zoom = getZoomLevel(radiusKm)

  // Generate static map URL using OpenStreetMap tiles via a static map service
  const mapUrl = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${center.lng},${center.lat},${zoom},0/300x200?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 'pk.placeholder'}`

  // Fallback: Draw a simple SVG representation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Dark gradient background
    const gradient = ctx.createRadialGradient(150, 100, 0, 150, 100, 150)
    gradient.addColorStop(0, '#1a1a2e')
    gradient.addColorStop(1, '#0f0f1a')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 300, 200)

    // Draw grid lines
    ctx.strokeStyle = '#2a2a4a'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= 300; x += 30) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 200)
      ctx.stroke()
    }
    for (let y = 0; y <= 200; y += 30) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(300, y)
      ctx.stroke()
    }

    // Draw cluster radius
    const radiusPixels = Math.min(80, (radiusKm / 100) * 60)
    const centerX = 150
    const centerY = 100

    // Outer glow
    const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radiusPixels + 20)
    glowGradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)')
    glowGradient.addColorStop(0.7, 'rgba(139, 92, 246, 0.1)')
    glowGradient.addColorStop(1, 'rgba(139, 92, 246, 0)')
    ctx.fillStyle = glowGradient
    ctx.beginPath()
    ctx.arc(centerX, centerY, radiusPixels + 20, 0, Math.PI * 2)
    ctx.fill()

    // Main cluster circle
    ctx.fillStyle = 'rgba(139, 92, 246, 0.2)'
    ctx.beginPath()
    ctx.arc(centerX, centerY, radiusPixels, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(139, 92, 246, 0.6)'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.stroke()
    ctx.setLineDash([])

    // Center point
    ctx.fillStyle = '#8b5cf6'
    ctx.beginPath()
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2)
    ctx.fill()

    // Pulsing ring effect
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(centerX, centerY, 12, 0, Math.PI * 2)
    ctx.stroke()

    // Scatter some report dots
    if (reportCount) {
      const dotCount = Math.min(reportCount, 20)
      ctx.fillStyle = 'rgba(236, 72, 153, 0.7)'
      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2 + Math.random() * 0.5
        const dist = Math.random() * radiusPixels * 0.8
        const x = centerX + Math.cos(angle) * dist
        const y = centerY + Math.sin(angle) * dist
        ctx.beginPath()
        ctx.arc(x, y, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Coordinate label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.font = '10px monospace'
    ctx.fillText(`${center.lat.toFixed(2)}°, ${center.lng.toFixed(2)}°`, 8, 192)

  }, [center, radiusKm, reportCount])

  return (
    <div className={`relative overflow-hidden rounded-lg bg-gray-900/50 ${className}`}>
      <canvas
        ref={canvasRef}
        width={300}
        height={200}
        className="w-full h-full object-cover"
      />

      {/* Hover overlay */}
      {interactive && onExpand && (
        <div
          className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
          onClick={onExpand}
        >
          <div className="flex items-center gap-2 text-white text-sm">
            <ZoomIn className="w-4 h-4" />
            <span>View on map</span>
          </div>
        </div>
      )}

      {/* Location badge */}
      <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-black/60 rounded text-xs text-white">
        <MapPin className="w-3 h-3 text-purple-400" />
        <span>{radiusKm} km radius</span>
      </div>
    </div>
  )
}
