import React, { useEffect, useRef, useState, useCallback } from 'react'
import Map, { Marker, NavigationControl, MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapPin } from 'lucide-react'

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY
const MAP_STYLE = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`

interface LocationPickerProps {
  latitude: string
  longitude: string
  onLocationChange: (lat: string, lng: string) => void
}

export default function LocationPicker({ latitude, longitude, onLocationChange }: LocationPickerProps) {
  const mapRef = useRef<MapRef>(null)
  const [isDragging, setIsDragging] = useState(false)

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
        className="w-full h-48 rounded-lg border border-white/10 overflow-hidden"
        style={{ position: 'relative' }}
      >
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          onClick={handleClick}
          mapStyle={MAP_STYLE}
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
        >
          <NavigationControl position="top-right" showCompass={false} />
          {hasCoords && (
            <Marker
              longitude={lng}
              latitude={lat}
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              anchor="bottom"
            >
              <MapPin className="w-8 h-8 text-primary-400 drop-shadow-lg" strokeWidth={2.5} />
            </Marker>
          )}
        </Map>
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        {hasCoords
          ? 'Drag the pin to adjust the exact location'
          : 'Click the map to place a pin, or enter a city above to auto-locate'}
      </p>
    </div>
  )
}
