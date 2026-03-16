/**
 * MapControls — Floating control buttons for the map
 * Positioned bottom-right on desktop, above bottom sheet on mobile
 */

import React, { useCallback, useState } from 'react'
import { Layers, Flame, Locate, Maximize, Minimize } from 'lucide-react'

interface MapControlsProps {
  heatmapActive: boolean
  onToggleHeatmap: () => void
  onLocateMe: () => void
  className?: string
}

export default function MapControls({
  heatmapActive,
  onToggleHeatmap,
  onLocateMe,
  className = '',
}: MapControlsProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }, [])

  const buttonBase =
    'flex items-center justify-center w-10 h-10 rounded-lg bg-gray-900/90 backdrop-blur-sm border border-gray-700/50 text-gray-300 hover:text-white hover:bg-gray-800 transition-all shadow-lg'

  const buttonActive =
    'flex items-center justify-center w-10 h-10 rounded-lg bg-purple-600/90 backdrop-blur-sm border border-purple-500/50 text-white hover:bg-purple-500 transition-all shadow-lg'

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Heatmap toggle */}
      <button
        onClick={onToggleHeatmap}
        className={heatmapActive ? buttonActive : buttonBase}
        title={heatmapActive ? 'Hide heatmap' : 'Show heatmap'}
        aria-label={heatmapActive ? 'Hide heatmap' : 'Show heatmap'}
      >
        <Flame size={18} />
      </button>

      {/* Locate me */}
      <button
        onClick={onLocateMe}
        className={buttonBase}
        title="Find my location"
        aria-label="Find my location"
      >
        <Locate size={18} />
      </button>

      {/* Fullscreen — hidden on mobile (iOS Safari doesn't support Fullscreen API) */}
      <button
        onClick={toggleFullscreen}
        className={`${buttonBase} hidden lg:flex`}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>
    </div>
  )
}
