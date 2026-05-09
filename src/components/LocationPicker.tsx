import React, { useEffect, useRef, useState, useCallback } from 'react'
import Map, { Marker, NavigationControl, MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapPin, Map as MapIcon, Layers, Mountain } from 'lucide-react'

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY

/**
 * V9.11.5 #24 — multi-layer map.
 * Chase: 'this layer is hard to navigate to manually find streets etc'.
 * Switched the default from MapTiler 'dataviz-dark' (abstract, minimal
 * labels) to 'streets-v2-dark' (full street network, readable labels,
 * brand-consistent dark theme) and added a layer toggle so users can
 * switch between Streets / Satellite / Outdoor on demand.
 */
type MapLayer = 'streets' | 'satellite' | 'outdoor'

const LAYER_STYLES: Record<MapLayer, { url: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  streets:   { url: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`, label: 'Streets',   icon: MapIcon },
  satellite: { url: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,           label: 'Satellite', icon: Layers },
  outdoor:   { url: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`,       label: 'Terrain',   icon: Mountain },
}

interface LocationPickerProps {
  latitude: string
  longitude: string
  onLocationChange: (lat: string, lng: string) => void
}

export default function LocationPicker({ latitude, longitude, onLocationChange }: LocationPickerProps) {
  const mapRef = useRef<MapRef>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [layer, setLayer] = useState<MapLayer>('streets')

  const lat = parseFloat(latitude) || 0
  const lng = parseFloat(longitude) || 0
  const hasCoords = !!(latitude && longitude && (lat !== 0 || lng !== 0))

  const [viewState, setViewState] = useState({
    longitude: hasCoords ? lng : 0,
    latitude: hasCoords ? lat : 30,
    zoom: hasCoords ? 10 : 2,
  })

  // Fly to new coordinates when they change (but not while dragging)
  useEffect(() => {
    if (!hasCoords || isDragging) return
    const map = mapRef.current
    if (map) {
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 10),
        duration: 800,
      })
    }
  }, [lat, lng, hasCoords, isDragging])

  // Handle click on map to place/move pin
  const handleClick = useCallback((e: any) => {
    const { lng: newLng, lat: newLat } = e.lngLat
    onLocationChange(newLat.toFixed(6), newLng.toFixed(6))
  }, [onLocationChange])

  // Handle marker drag
  const handleDragStart = useCallback(() => setIsDragging(true), [])
  const handleDragEnd = useCallback((e: any) => {
    setIsDragging(false)
    const { lng: newLng, lat: newLat } = e.lngLat
    onLocationChange(newLat.toFixed(6), newLng.toFixed(6))
  }, [onLocationChange])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-white">
          Pin the location on the map
        </label>
        {hasCoords && (
          <span className="text-xs text-gray-500">
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
        )}
      </div>
      <div
        className="w-full h-72 sm:h-80 rounded-lg border border-white/10 overflow-hidden"
        style={{ position: 'relative' }}
      >
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          onClick={handleClick}
          mapStyle={LAYER_STYLES[layer].url}
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
        >
          <NavigationControl position="top-right" showCompass={false} showZoom />
          {hasCoords && (
            <Marker
              longitude={lng}
              latitude={lat}
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              anchor="bottom"
            >
              <MapPin className="w-9 h-9 text-primary-400 drop-shadow-lg" strokeWidth={2.5} />
            </Marker>
          )}
        </Map>

        {/* Layer toggle (top-left) */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            display: 'flex',
            gap: 4,
            background: 'rgba(10, 10, 15, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            padding: 3,
            zIndex: 1,
          }}
        >
          {(Object.keys(LAYER_STYLES) as MapLayer[]).map((key) => {
            const style = LAYER_STYLES[key]
            const Icon = style.icon
            const active = layer === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setLayer(key)}
                title={style.label}
                aria-label={style.label}
                aria-pressed={active}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 9px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'Changa','Helvetica Neue',Helvetica,Arial,sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  color: active ? '#ffffff' : '#9ca3af',
                  background: active ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                  transition: 'background 150ms, color 150ms',
                }}
              >
                <Icon className="w-3 h-3" />
                {style.label}
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        {hasCoords
          ? 'Drag the pin to adjust the exact location, or click anywhere to move it.'
          : 'Click the map to place a pin, or enter a city above to auto-locate.'}
      </p>
    </div>
  )
}
