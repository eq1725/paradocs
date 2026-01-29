/**
 * LocationMap Component
 *
 * Displays a mini-map showing the report location and nearby reports
 */

'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Navigation, ExternalLink } from 'lucide-react'
import { classNames } from '@/lib/utils'
import { CATEGORY_CONFIG } from '@/lib/constants'

// Dynamically import the entire map component to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then(mod => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then(mod => mod.TileLayer),
  { ssr: false }
)
const Marker = dynamic(
  () => import('react-leaflet').then(mod => mod.Marker),
  { ssr: false }
)
const Popup = dynamic(
  () => import('react-leaflet').then(mod => mod.Popup),
  { ssr: false }
)
const Circle = dynamic(
  () => import('react-leaflet').then(mod => mod.Circle),
  { ssr: false }
)

interface NearbyReport {
  id: string
  title: string
  slug: string
  category: string
  event_date: string | null
  latitude: number
  longitude: number
  location_name: string | null
  summary: string | null
  distance_km: number
}

interface Props {
  reportSlug: string
  reportTitle: string
  latitude?: number | null
  longitude?: number | null
  className?: string
}

export default function LocationMap({
  reportSlug,
  reportTitle,
  latitude,
  longitude,
  className
}: Props) {
  const [nearbyReports, setNearbyReports] = useState<NearbyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [radiusKm, setRadiusKm] = useState(50)
  const [mounted, setMounted] = useState(false)
  const [L, setL] = useState<any>(null)

  // Load Leaflet on client side only
  useEffect(() => {
    setMounted(true)
    import('leaflet').then((leaflet) => {
      setL(leaflet.default)
    })
  }, [])

  useEffect(() => {
    if (latitude && longitude) {
      fetchNearbyReports()
    } else {
      setLoading(false)
    }
  }, [reportSlug, radiusKm])

  async function fetchNearbyReports() {
    try {
      const res = await fetch(`/api/reports/${reportSlug}/nearby?radius=${radiusKm}&limit=15`)
      if (!res.ok) {
        throw new Error('Failed to fetch nearby reports')
      }
      const data = await res.json()
      setNearbyReports(data.nearby || [])
    } catch (err) {
      console.error('Error fetching nearby reports:', err)
    } finally {
      setLoading(false)
    }
  }

  // Don't render if no coordinates
  if (!latitude || !longitude) {
    return null
  }

  // Create custom icons using loaded Leaflet instance
  const createIcon = (category: string, isMain: boolean = false) => {
    if (!L) return undefined

    const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
    const size = isMain ? 32 : 24
    const bgColor = isMain ? '#8b5cf6' : 'rgba(255,255,255,0.9)'
    const borderColor = isMain ? '#7c3aed' : 'rgba(0,0,0,0.2)'
    const textColor = isMain ? 'white' : 'inherit'

    return L.divIcon({
      className: 'custom-marker',
      html: `
        <div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${bgColor};
          border: 2px solid ${borderColor};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isMain ? '14px' : '12px'};
          color: ${textColor};
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          ${isMain ? 'animation: pulse 2s infinite;' : ''}
        ">
          ${isMain ? '📍' : config.icon}
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    })
  }

  return (
    <div className={classNames('glass-card overflow-hidden', className)}>
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-primary-400" />
            <h4 className="text-sm font-medium text-white">Location Intelligence</h4>
          </div>
          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(parseInt(e.target.value))}
            className="text-xs bg-white/10 border border-white/20 rounded px-2 py-1 text-white"
          >
            <option value={25}>25 km</option>
            <option value={50}>50 km</option>
            <option value={100}>100 km</option>
            <option value={200}>200 km</option>
          </select>
        </div>
        {nearbyReports.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            {nearbyReports.length} report{nearbyReports.length !== 1 ? 's' : ''} within {radiusKm}km
          </p>
        )}
      </div>

      {/* Leaflet CSS - Required for proper map rendering */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <style>{`
        .custom-marker {
          background: transparent !important;
          border: none !important;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        .leaflet-popup-content-wrapper {
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
        }
        .leaflet-popup-content {
          color: white;
          margin: 8px 12px;
        }
        .leaflet-popup-tip {
          background: rgba(15, 23, 42, 0.95);
        }
      `}</style>

      {/* Map */}
      <div className="h-64 md:h-80 relative bg-gray-900">
        {!mounted || !L || loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <MapContainer
            center={[latitude, longitude]}
            zoom={9}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {/* Search radius circle */}
            <Circle
              center={[latitude, longitude]}
              radius={radiusKm * 1000}
              pathOptions={{
                color: '#8b5cf6',
                fillColor: '#8b5cf6',
                fillOpacity: 0.1,
                weight: 1
              }}
            />

            {/* Main report marker */}
            <Marker
              position={[latitude, longitude]}
              icon={createIcon('main', true)}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-medium">{reportTitle}</p>
                  <p className="text-gray-500 text-xs">This report</p>
                </div>
              </Popup>
            </Marker>

            {/* Nearby report markers */}
            {nearbyReports.map((report) => (
              <Marker
                key={report.id}
                position={[report.latitude, report.longitude]}
                icon={createIcon(report.category)}
              >
                <Popup>
                  <div className="text-sm max-w-[200px]">
                    <p className="font-medium line-clamp-2">{report.title}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      {report.distance_km} km away
                      {report.event_date && ` • ${new Date(report.event_date).toLocaleDateString()}`}
                    </p>
                    <Link
                      href={`/report/${report.slug}`}
                      className="text-primary-400 hover:text-primary-300 text-xs mt-2 inline-flex items-center gap-1"
                    >
                      View report <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Nearby reports list */}
      {nearbyReports.length > 0 && (
        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-gray-400 mb-2">Nearby Reports:</p>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {nearbyReports.slice(0, 5).map((report) => {
              const config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
              return (
                <Link
                  key={report.id}
                  href={`/report/${report.slug}`}
                  className="flex items-center gap-2 text-sm hover:bg-white/5 rounded p-1 -mx-1 transition-colors"
                >
                  <span>{config.icon}</span>
                  <span className="text-white truncate flex-1">{report.title}</span>
                  <span className="text-gray-500 text-xs flex-shrink-0">
                    {report.distance_km} km
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
