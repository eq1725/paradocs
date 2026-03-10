import React, { useState, useRef } from 'react'
import { X, Share2, Download, Globe, Lock, Copy, Check, Image, BarChart3 } from 'lucide-react'

interface ShareConstellationProps {
  isOpen: boolean
  onClose: () => void
  userToken: string
  username: string
  stats: {
    totalEntries: number
    categoriesExplored: number
    uniqueTags: number
    connectionsFound: number
    theoriesCount: number
    rank: string
    rankLevel: number
  }
  isProfilePublic: boolean
  onTogglePublic: (isPublic: boolean) => void
  svgRef: React.RefObject<SVGSVGElement | null>
}

const RANK_CONFIG: Record<string, { icon: string; color: string }> = {
  'Stargazer': { icon: '🔭', color: '#9ca3af' },
  'Field Researcher': { icon: '📋', color: '#60a5fa' },
  'Pattern Seeker': { icon: '🔍', color: '#a78bfa' },
  'Cartographer': { icon: '🗺️', color: '#fbbf24' },
  'Master Archivist': { icon: '📜', color: '#f87171' },
}

export default function ShareConstellation({
  isOpen,
  onClose,
  userToken,
  username,
  stats,
  isProfilePublic,
  onTogglePublic,
  svgRef,
}: ShareConstellationProps) {
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportType, setExportType] = useState<'map' | 'card' | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  if (!isOpen) return null

  const profileUrl = `${window.location.origin}/researcher/${encodeURIComponent(username)}`
  const rankInfo = RANK_CONFIG[stats.rank] || RANK_CONFIG['Stargazer']

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* fallback */ }
  }

  const exportMapAsPng = async () => {
    if (!svgRef.current) return
    setExporting(true)
    setExportType('map')
    try {
      const svg = svgRef.current
      const svgData = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      const img = new window.Image()
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const scale = 2 // High-res
        canvas.width = svg.clientWidth * scale
        canvas.height = svg.clientHeight * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Dark background
        ctx.fillStyle = '#030712'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0, svg.clientWidth, svg.clientHeight)

        // Watermark
        ctx.scale(1/scale, 1/scale)
        ctx.font = '14px system-ui, sans-serif'
        ctx.fillStyle = 'rgba(139, 92, 246, 0.5)'
        ctx.textAlign = 'right'
        ctx.fillText('Paradocs', canvas.width - 16, canvas.height - 12)

        canvas.toBlob(blob => {
          if (!blob) return
          const link = document.createElement('a')
          link.download = `paradocs-constellation-${username}.png`
          link.href = URL.createObjectURL(blob)
          link.click()
          URL.revokeObjectURL(link.href)
          setExporting(false)
          setExportType(null)
        }, 'image/png')

        URL.revokeObjectURL(url)
      }
      img.src = url
    } catch {
      setExporting(false)
      setExportType(null)
    }
  }

  const exportStatsCard = async () => {
    setExporting(true)
    setExportType('card')
    try {
      const canvas = canvasRef.current
      if (!canvas) return

      const w = 600, h = 340
      canvas.width = w * 2
      canvas.height = h * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.scale(2, 2)

      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, w, h)
      gradient.addColorStop(0, '#0f0a1a')
      gradient.addColorStop(1, '#1a0f2e')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, w, h)

      // Border
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)'
      ctx.lineWidth = 1
      ctx.roundRect(1, 1, w - 2, h - 2, 16)
      ctx.stroke()

      // Decorative stars
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
      for (let i = 0; i < 30; i++) {
        const sx = Math.random() * w
        const sy = Math.random() * h
        const sr = Math.random() * 1.5 + 0.5
        ctx.beginPath()
        ctx.arc(sx, sy, sr, 0, Math.PI * 2)
        ctx.fill()
      }

      // Title
      ctx.font = 'bold 24px system-ui, sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(username, 30, 50)

      // Rank badge
      ctx.font = '16px system-ui, sans-serif'
      ctx.fillStyle = rankInfo.color
      ctx.fillText(`${rankInfo.icon} ${stats.rank}`, 30, 80)

      // Stats grid
      const statItems = [
        { label: 'Phenomena Logged', value: stats.totalEntries.toString() },
        { label: 'Categories', value: `${stats.categoriesExplored}/11` },
        { label: 'Research Tags', value: stats.uniqueTags.toString() },
        { label: 'Connections', value: stats.connectionsFound.toString() },
        { label: 'Theories', value: stats.theoriesCount.toString() },
      ]

      const startY = 120
      const colW = (w - 60) / 3
      statItems.forEach((stat, i) => {
        const row = Math.floor(i / 3)
        const col = i % 3
        const x = 30 + col * colW
        const y = startY + row * 80

        ctx.font = 'bold 32px system-ui, sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(stat.value, x, y + 30)

        ctx.font = '12px system-ui, sans-serif'
        ctx.fillStyle = '#6b7280'
        ctx.fillText(stat.label, x, y + 50)
      })

      // Footer
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(139, 92, 246, 0.6)'
      ctx.textAlign = 'right'
      ctx.fillText('paradocs.com', w - 20, h - 16)

      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(107, 114, 128, 0.5)'
      ctx.fillText('My Paranormal Research Constellation', 30, h - 16)

      canvas.toBlob(blob => {
        if (!blob) return
        const link = document.createElement('a')
        link.download = `paradocs-stats-${username}.png`
        link.href = URL.createObjectURL(blob)
        link.click()
        URL.revokeObjectURL(link.href)
        setExporting(false)
        setExportType(null)
      }, 'image/png')
    } catch {
      setExporting(false)
      setExportType(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary-400" />
            <h2 className="text-white font-semibold">Share Constellation</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Privacy toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
            <div className="flex items-center gap-2">
              {isProfilePublic ? (
                <Globe className="w-4 h-4 text-green-400" />
              ) : (
                <Lock className="w-4 h-4 text-gray-500" />
              )}
              <div>
                <div className="text-sm text-white">Public Profile</div>
                <div className="text-xs text-gray-500">
                  {isProfilePublic ? 'Anyone can view your constellation' : 'Only you can see your constellation'}
                </div>
              </div>
            </div>
            <button
              onClick={() => onTogglePublic(!isProfilePublic)}
              className={`relative w-10 h-5 rounded-full transition-colors ${isProfilePublic ? 'bg-green-500' : 'bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isProfilePublic ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Share link */}
          {isProfilePublic && (
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Profile URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={profileUrl}
                  readOnly
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 truncate"
                />
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Export options */}
          <div className="space-y-2">
            <label className="text-gray-400 text-xs block">Export</label>

            <button
              onClick={exportMapAsPng}
              disabled={exporting}
              className="w-full flex items-center gap-3 p-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-lg transition-colors text-left"
            >
              <Image className="w-5 h-5 text-purple-400 shrink-0" />
              <div className="flex-1">
                <div className="text-sm text-white">Constellation Map</div>
                <div className="text-xs text-gray-500">High-res PNG with Paradocs branding</div>
              </div>
              <Download className="w-4 h-4 text-gray-500" />
            </button>

            <button
              onClick={exportStatsCard}
              disabled={exporting}
              className="w-full flex items-center gap-3 p-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-lg transition-colors text-left"
            >
              <BarChart3 className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="flex-1">
                <div className="text-sm text-white">Researcher Stats Card</div>
                <div className="text-xs text-gray-500">Shareable stats summary image</div>
              </div>
              <Download className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {exporting && (
            <div className="text-center text-sm text-primary-400 py-2">
              Generating {exportType === 'map' ? 'constellation' : 'stats card'}...
            </div>
          )}
        </div>

        {/* Hidden canvas for export */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  )
}
