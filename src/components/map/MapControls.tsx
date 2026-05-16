/**
 * MapControls — Floating control buttons for the map
 * Positioned bottom-right on desktop, above bottom sheet on mobile
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Flame, Locate, Maximize, Minimize, Globe, Mountain, Map as MapIcon } from 'lucide-react'

export type BasemapStyle = 'dark' | 'satellite' | 'terrain'

interface MapControlsProps {
  heatmapActive: boolean
  onToggleHeatmap: () => void
  onLocateMe: () => void
  basemapStyle: BasemapStyle
  onBasemapChange: (style: BasemapStyle) => void
  className?: string
  /**
   * V10.9.B — choropleth toggle. When true, the country fill layer
   * renders on the explore-map. Default false so the map matches
   * the V10.9.A behavior unless the user opts in.
   */
  choroplethActive?: boolean
  onToggleChoropleth?: () => void
}

const BASEMAP_CYCLE: BasemapStyle[] = ['dark', 'satellite', 'terrain']

export default function MapControls({
  heatmapActive,
  onToggleHeatmap,
  onLocateMe,
  basemapStyle,
  onBasemapChange,
  className = '',
  choroplethActive = false,
  onToggleChoropleth,
}: MapControlsProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // V10.9.D.5 — Fullscreen the map's wrapper element, NOT
  // document.documentElement. The previous behavior put the entire
  // <html> in fullscreen mode which caused Chrome/Safari to render
  // only the wordmark (the layout's fixed-position children get
  // re-stacked relative to the new fullscreen container and the
  // map's `fixed inset-0` wrapper ends up invisible behind whatever
  // root element wins the stacking-context battle).
  //
  // Targeting a specific element keeps everything inside that element
  // (map, controls, panels) visible in fullscreen and exits cleanly.
  // We look up the explore wrapper by class — it's the closest fixed
  // ancestor of the map controls.
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
      setIsFullscreen(false)
      return
    }
    // Find the map's wrapper. Walk up from a known map element first
    // (the maplibregl canvas), fall back to the explore wrapper class.
    const target =
      (document.querySelector('[data-map-fullscreen-target]') as HTMLElement | null) ||
      (document.querySelector('.maplibregl-map')?.closest('div[style*="inset-0"], div.fixed') as HTMLElement | null) ||
      document.documentElement
    target.requestFullscreen?.().then(
      () => setIsFullscreen(true),
      () => setIsFullscreen(false),
    )
  }, [])

  // Sync local state with browser fullscreen state (e.g. user hits
  // ESC to exit). Without this listener the icon stays "expanded"
  // and the next click would try to RE-fullscreen instead of enter
  // fullscreen.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const cycleBasemap = useCallback(() => {
    const idx = BASEMAP_CYCLE.indexOf(basemapStyle)
    const next = BASEMAP_CYCLE[(idx + 1) % BASEMAP_CYCLE.length]
    onBasemapChange(next)
  }, [basemapStyle, onBasemapChange])

  const buttonBase =
    'flex items-center justify-center w-10 h-10 rounded-lg bg-gray-900/90 backdrop-blur-sm border border-gray-700/50 text-gray-300 hover:text-white hover:bg-gray-800 transition-all shadow-lg'

  const buttonActive =
    'flex items-center justify-center w-10 h-10 rounded-lg bg-purple-600/90 backdrop-blur-sm border border-purple-500/50 text-white hover:bg-purple-500 transition-all shadow-lg'

  const basemapLabel =
    basemapStyle === 'dark'
      ? 'Switch to satellite'
      : basemapStyle === 'satellite'
      ? 'Switch to terrain'
      : 'Switch to dark'

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Basemap toggle (cycles: dark → satellite → terrain) */}
      <button
        onClick={cycleBasemap}
        className={basemapStyle !== 'dark' ? buttonActive : buttonBase}
        title={basemapLabel}
        aria-label={basemapLabel}
      >
        {basemapStyle === 'terrain' ? <Mountain size={18} /> : <Globe size={18} />}
      </button>

      {/* Heatmap toggle */}
      <button
        onClick={onToggleHeatmap}
        className={heatmapActive ? buttonActive : buttonBase}
        title={heatmapActive ? 'Hide heatmap' : 'Show heatmap'}
        aria-label={heatmapActive ? 'Hide heatmap' : 'Show heatmap'}
      >
        <Flame size={18} />
      </button>

      {/* V10.9.B — Choropleth toggle. Tints countries by the number
          of synthetic-coord reports they contain (the same data shown
          in the Region Totals panel). Visible at low zoom only. */}
      {onToggleChoropleth && (
        <button
          onClick={onToggleChoropleth}
          className={choroplethActive ? buttonActive : buttonBase}
          title={choroplethActive ? 'Hide regions' : 'Show regions'}
          aria-label={choroplethActive ? 'Hide region density' : 'Show region density'}
        >
          <MapIcon size={18} />
        </button>
      )}

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
