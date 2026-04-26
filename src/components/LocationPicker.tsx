import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default marker icon in Next.js/webpack
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface LocationPickerProps {
  latitude: string
  longitude: string
  onLocationChange: (lat: string, lng: string) => void
}

export default function LocationPicker({ latitude, longitude, onLocationChange }: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const lat = parseFloat(latitude) || 0
  const lng = parseFloat(longitude) || 0
  const hasCoords = !!(latitude && longitude && lat !== 0)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: hasCoords ? [lat, lng] : [30, 0],
      zoom: hasCoords ? 10 : 2,
      scrollWheelZoom: true,
      attributionControl: false,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map)

    // Add attribution in bottom-right, minimal
    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright" style="color:#888">OSM</a>')
      .addTo(map)

    // Click on map to place/move pin
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: newLat, lng: newLng } = e.latlng
      onLocationChange(newLat.toFixed(6), newLng.toFixed(6))
    })

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update marker when coords change
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (hasCoords) {
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng])
      } else {
        const marker = L.marker([lat, lng], { draggable: true }).addTo(map)
        marker.on('dragstart', () => setIsDragging(true))
        marker.on('dragend', (e) => {
          setIsDragging(false)
          const pos = e.target.getLatLng()
          onLocationChange(pos.lat.toFixed(6), pos.lng.toFixed(6))
        })
        markerRef.current = marker
      }

      if (!isDragging) {
        map.setView([lat, lng], Math.max(map.getZoom(), 10), { animate: true })
      }
    }
  }, [lat, lng, hasCoords]) // eslint-disable-line react-hooks/exhaustive-deps

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
        ref={mapRef}
        className="w-full h-48 rounded-lg border border-white/10 overflow-hidden"
        style={{ zIndex: 0 }}
      />
      <p className="mt-1.5 text-xs text-gray-500">
        {hasCoords
          ? 'Drag the pin to adjust the exact location'
          : 'Click the map to place a pin, or enter a city above to auto-locate'}
      </p>
    </div>
  )
}
