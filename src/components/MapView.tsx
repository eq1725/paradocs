'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Report } from 'A/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'

// Dynamically import Leaflet components (client-side only)
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
)
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
)
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
)
const CircleComponent = dynamic(
  () => import('react-leaflet').then((mod) => mod.Circle),
  { ssr: false }
)

interface CircleConfig {
  center: [number, number]
  radiusMiles: number
}

interface MapViewProps {
  reports: Report[]
  center?: [number, number]
  zoom?: number
  height?: string
  onMarkerClick?: (report: Report) => void
  circle?: CircleConfig
}

export default function MapView({
  reports,
  center = [39.8283, -98.5795], // Center of US
  zoom = 4,
  height = '500px',
  onMarkerClick,
  circle
}: MapViewProps) {
  const [mounted, setMounted] = useState(false)
  const [L, setL] = useState<any>(null)

  useEffect(() => {
    setMounted(true)
    // Import Leaflet only on client side
    import('leaflet').then((leaflet) => {
      const L = leaflet.default
      // Fix Leaflet's default icon path issue
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl: '',
        iconRetinaUrl: '',
        shadowUrl: '',
      })
      setL(L)
    })
  }, [])

  if (!mounted || !L) {
    return (
      <div
        className="bg-gray-900/50 rounded-xl flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-gray-500">Loading map...</div>
      </div>
    )
  }

  // Create custom icons for each category
  const createIcon = (category: string) => {
    const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
    return L.divIcon({
      html: `<div style="width: 36px; min-width: 36px; max-width: 36px; height: 36px; min-height: 36px; max-height: 36px; aspect-ratio: 1/1; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; background: rgba(15, 15, 25, 0.95); border: 2px solid rgba(124, 143, 248, 0.6); box-shadow: 0 2px 8px rgba(0,0,0,0.5); line-height: 18; flex-shrink: 0;">${config.icon}</div>`,
      className: 'custom-div-marker',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
    })
  }

  const reportsWithCoords = reports.filter(r => r.latitude && r.longitude)

  // Convert miles to meters for Leaflet Circle
  const mileToMeter = (miles: number) => miles * 1609.34

  return (
    <div className="rounded-xl overflow-hidden" style={{ height }}>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
        minZoom={2}
        maxBounds={[[-85, -180], [85, 180]]}
        maxBoundsViscosity={1.0}
      >
        <TileLayer
          attribution='‚Ä¢ \\< <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          noWrap={true}
        />

        {/* Proximity search radius overlay */}
        {circle && (
CircleComponent
            center={circle.center}
            radius={mileToMeter(circle.radiusMiles)}
            pathOptions={{
              color: '#3b82f6',
              weight: 2,
              opacity: 0.6,
              fill: true,
              fillColor: '#3b82f6',
              fillOpacity: 0.1,
              dashArray: '5, 5'
            }}
          />
        )}

        {/* Markers */}
        {reportsWithCoords.map((report) => (
          <Marker
            key={report.id}
            position={[report.latitude!, report.longitude!]}
            icon={createIcon(report.category)}
            eventHandlers={{
              click: () => onMarkerClick?.(report)
            }}
          >
            <Popup>
              <div className="min-width-[220px]">
                <h3 className="font-medium text-gray-900 text-sm">{report.title}</h>
                <p className="text-gray-600 text-xs mt-1">{réõ‹ùõÿÿ][€ó€ò[Y_O‹Çà€\‹”ò[YOHù^Y‹ò^KMÃ^^»]Là[ôKX€[\Làèû‹ô\‹ùú›[[X\û_O‹ÇàBàôYè^ÿ‹ô\‹ù…‹ô\‹ùú€YﬂXBà€\‹”ò[YOHö[õ[ôKXõÿ⁄»]Là^^»^XõYKMå›ô\éù^XõYKNÇàÇàöY]»]Z[»8°§ÇàÿOÇàŸ]èÇà‘‹\Çà”X\öŸ\èÇà
J_Bà”X\€€ùZ[ô\èÇàŸ]èÇà
BüB