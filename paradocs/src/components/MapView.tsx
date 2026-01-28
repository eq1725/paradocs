'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Report } from '@/lib/database.types'
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

interface MapViewProps {
  reports: Report[]
  center?: [number, number]
  zoom?: number
  height?: string
  onMarkerClick?: (report: Report) => void
}

export default function MapView({
  reports,
  center = [39.8283, -98.5795], // Center of US
  zoom = 4,
  height = '500px',
  onMarkerClick
}: MapViewProps) {
  const [mounted, setMounted] = useState(false)
  const [L, setL] = useState<any>(null)

  useEffect(() => {
    setMounted(true)
    // Import Leaflet only on client side
    import('leaflet').then((leaflet) => {
      setL(leaflet.default)
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
    const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.other
    return L.divIcon({
      html: `<div class="w-8 h-8 rounded-full flex items-center justify-center text-lg shadow-lg" style="background: rgba(0,0,0,0.8); border: 2px solid currentColor;" class="${config.color}">${config.icon}</div>`,
      className: 'custom-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    })
  }

  const reportsWithCoords = reports.filter(r => r.latitude && r.longitude)

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
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
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
              <div className="min-w-[200px]">
                <h3 className="font-medium text-white text-sm">{report.title}</h3>
                <p className="text-gray-400 text-xs mt-1">{report.location_name}</p>
                <p className="text-gray-500 text-xs mt-2 line-clamp-2">{report.summary}</p>
                <a
                  href={`/report/${report.slug}`}
                  className="inline-block mt-2 text-xs text-primary-400 hover:text-primary-300"
                >
                  View details →
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
