/**
 * LocationMap Component
 *
 * Displays a mini-map showing the report location and nearby reports.
 * Uses MapLibre GL + MapTiler — the same stack as the main /map page —
 * for visual consistency and a seamless "Explore on Map" deep-link.
 */

'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Navigation, ExternalLink, Maximize2, Layers } from 'lucide-react'
import { classNames } from '@/lib/utils'
import { CATEGORY_CONFIG } from '@/lib/constants'
import CategoryIcon from '@/components/ui/CategoryIcon'
import type { PhenomenonCategory } from '@/lib/database.types'

// Dynamically import react-map-gl (MapLibre) to avoid SSR/WebGL issues
const Map = dynamic(
  () => import('react-map-gl/maplibre').then(mod => mod.default || mod.Map || mod),
  { ssr: false }
)
const MapSource = dynamic(
  () => import('react-map-gl/maplibre').then(mod => mod.Source),
  { ssr: false }
)
const MapLayer = dynamic(
  () => import('react-map-gl/maplibre').then(mod => mod.Layer),
  { ssr: false }
)
const NavigationControl = dynamic(
  () => import('react-map-gl/maplibre').then(mod => mod.NavigationControl),
  { ssr: false }
)

const KM_PER_MILE = 1.60934
const milesToKm = (miles: number) => miles * KM_PER_MILE
const kmToMiles = (km: number) => km / KM_PER_MILE

// MapTiler basemap styles — matches the main /map page
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY
const BASEMAP_STYLES: Record<string, string> = {
  dark: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`,
  satellite: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
}

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
  const [radiusMiles, setRadiusMiles] = useState(30)
  const [mounted, setMounted] = useState(false)
  const [basemap, setBasemap] = useState<'dark' | 'satellite'>('dark')
  const mapRef = useRef<any>(null)

  // Convert miles to km for the API (which uses km internally)
  const radiusKm = milesToKm(radiusMiles)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (latitude && longitude) {
      fetchNearbyReports()
    } else {
      setLoading(false)
    }
  }, [reportSlug, radiusMiles])

  async function fetchNearbyReports() {
    try {
      const res = await fetch(`/api/reports/${reportSlug}/nearby?radius=${Math.round(radiusKm)}&limit=15`)
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

  // Hooks must run every render — these map callbacks live above any
  // conditional return to satisfy react-hooks/rules-of-hooks.
  const handleMapClick = useCallback((e: any) => {
    const features = e.features
    if (!features || features.length === 0) return
    const feature = features[0]
    if (feature.properties?.slug) {
      window.location.href = `/report/${feature.properties.slug}`
    }
  }, [])

  const handleMouseEnter = useCallback(() => {
    const map = mapRef.current
    if (map) {
      const canvas = map.getMap?.()?.getCanvas?.() || map.getCanvas?.()
      if (canvas) canvas.style.cursor = 'pointer'
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    const map = mapRef.current
    if (map) {
      const canvas = map.getMap?.()?.getCanvas?.() || map.getCanvas?.()
      if (canvas) canvas.style.cursor = ''
    }
  }, [])

  // Don't render if no coordinates
  if (!latitude || !longitude) {
    return null
  }

  // Build GeoJSON for the radius circle (approximation using 64-point polygon)
  const radiusGeoJSON = (() => {
    const points = 64
    const coords: [number, number][] = []
    const radiusInDeg = radiusKm / 111.32
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI
      const dx = radiusInDeg * Math.cos(angle) / Math.cos(latitude * Math.PI / 180)
      const dy = radiusInDeg * Math.sin(angle)
      coords.push([longitude + dx, latitude + dy])
    }
    return {
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [coords] },
      properties: {},
    }
  })()

  // Build GeoJSON for the main report marker
  const mainMarkerGeoJSON = {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [longitude, latitude] },
      properties: { type: 'main', title: reportTitle },
    }],
  }

  // Build GeoJSON for nearby report markers
  const nearbyMarkersGeoJSON = {
    type: 'FeatureCollection' as const,
    features: nearbyReports.map(r => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [r.longitude, r.latitude] },
      properties: {
        type: 'nearby',
        id: r.id,
        title: r.title,
        slug: r.slug,
        category: r.category,
        distance_mi: Math.round(kmToMiles(r.distance_km) * 10) / 10,
      },
    })),
  }

  // Category color mapping for nearby markers
  const categoryColorExpr = [
    'match', ['get', 'category'],
    'ufos_aliens', '#22c55e',
    'cryptids', '#f59e0b',
    'ghosts_hauntings', '#a855f7',
    'psychic_phenomena', '#3b82f6',
    'consciousness_practices', '#6366f1',
    'psychological_experiences', '#ec4899',
    'biological_factors', '#10b981',
    'perception_sensory', '#06b6d4',
    'religion_mythology', '#eab308',
    'esoteric_practices', '#8b5cf6',
    '#9ca3af', // fallback
  ] as any

  return (
    <div className={classNames('glass-card overflow-hidden', className)} style={{ overflowX: 'hidden' }}>
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-primary-400" />
            <h4 className="text-sm font-medium text-white">Location Intelligence</h4>
          </div>
          <div className="flex items-center gap-2">
            {/* Basemap toggle */}
            <button
              onClick={() => setBasemap(b => b === 'dark' ? 'satellite' : 'dark')}
              className="text-xs bg-white/10 hover:bg-white/15 border border-white/20 rounded px-2 py-1 text-white/70 hover:text-white transition-colors flex items-center gap-1"
              title={basemap === 'dark' ? 'Switch to satellite view' : 'Switch to dark view'}
            >
              <Layers className="w-3 h-3" />
              {basemap === 'dark' ? 'Satellite' : 'Dark'}
            </button>
            {/* Radius selector */}
            <select
              value={radiusMiles}
              onChange={(e) => setRadiusMiles(parseInt(e.target.value))}
              className="text-xs bg-white/10 border border-white/20 rounded px-2 py-1 text-white"
            >
              <option value={15}>15 mi</option>
              <option value={30}>30 mi</option>
              <option value={60}>60 mi</option>
              <option value={125}>125 mi</option>
            </select>
          </div>
        </div>
        {nearbyReports.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            {nearbyReports.length} report{nearbyReports.length !== 1 ? 's' : ''} within {radiusMiles} mi
          </p>
        )}
      </div>

      {/* MapLibre GL CSS */}
      <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
      <style>{`
        .location-map-container .maplibregl-ctrl-attrib {
          display: none !important;
        }
        .location-map-container .maplibregl-ctrl-top-right {
          top: 4px;
          right: 4px;
        }
        .location-map-container .maplibregl-ctrl-group {
          background: rgba(15, 23, 42, 0.8) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 6px !important;
        }
        .location-map-container .maplibregl-ctrl-group button {
          width: 28px !important;
          height: 28px !important;
        }
        .location-map-container .maplibregl-ctrl-group button + button {
          border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        .location-map-container .maplibregl-ctrl-group button span {
          filter: invert(1) !important;
        }
      `}</style>

      {/* Map */}
      <div className="h-64 md:h-80 relative bg-gray-900 overflow-hidden location-map-container">
        {!mounted || loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Map
            ref={mapRef}
            initialViewState={{
              longitude,
              latitude,
              zoom: 8,
            }}
            style={{ width: '100%', height: '100%' }}
            mapStyle={BASEMAP_STYLES[basemap]}
            scrollZoom={false}
            attributionControl={false}
            interactiveLayerIds={['nearby-points']}
            onClick={handleMapClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <NavigationControl position="top-right" showCompass={false} />

            {/* Radius circle */}
            <MapSource id="radius-circle" type="geojson" data={radiusGeoJSON as any}>
              <MapLayer
                id="radius-fill"
                type="fill"
                paint={{
                  'fill-color': '#8b5cf6',
                  'fill-opacity': 0.08,
                }}
              />
              <MapLayer
                id="radius-border"
                type="line"
                paint={{
                  'line-color': '#8b5cf6',
                  'line-width': 1.5,
                  'line-opacity': 0.4,
                }}
              />
            </MapSource>

            {/* Nearby report markers */}
            <MapSource id="nearby-reports" type="geojson" data={nearbyMarkersGeoJSON as any}>
              <MapLayer
                id="nearby-points"
                type="circle"
                paint={{
                  'circle-color': categoryColorExpr,
                  'circle-radius': 6,
                  'circle-stroke-width': 1.5,
                  'circle-stroke-color': 'rgba(255,255,255,0.3)',
                  'circle-opacity': 0.9,
                }}
              />
            </MapSource>

            {/* Main report marker — rendered last so it's on top */}
            <MapSource id="main-marker" type="geojson" data={mainMarkerGeoJSON as any}>
              {/* Pulsing halo */}
              <MapLayer
                id="main-pulse"
                type="circle"
                paint={{
                  'circle-color': '#8b5cf6',
                  'circle-radius': 16,
                  'circle-opacity': 0.15,
                }}
              />
              {/* Core marker */}
              <MapLayer
                id="main-point"
                type="circle"
                paint={{
                  'circle-color': '#8b5cf6',
                  'circle-radius': 8,
                  'circle-stroke-width': 2.5,
                  'circle-stroke-color': '#ffffff',
                  'circle-opacity': 1,
                }}
              />
            </MapSource>
          </Map>
        )}
      </div>

      {/* Nearby reports list */}
      {nearbyReports.length > 0 && (
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Nearby Reports:</p>
            <Link
              href={`/map?lat=${latitude}&lng=${longitude}&zoom=9`}
              className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
              Explore on Map
            </Link>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto overflow-x-hidden">
            {nearbyReports.slice(0, 5).map((report) => {
              const config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
              return (
                <Link
                  key={report.id}
                  href={`/report/${report.slug}`}
                  className="flex items-center gap-2 text-sm hover:bg-white/5 rounded p-1 -mx-1 transition-colors"
                >
                  <span><CategoryIcon category={report.category as PhenomenonCategory} size={14} /></span>
                  <span className="text-white truncate flex-1">{report.title}</span>
                  <span className="text-gray-500 text-xs flex-shrink-0">
                    {Math.round(kmToMiles(report.distance_km) * 10) / 10} mi
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
