'use client'

import React, { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type {
  ConstellationArtifact,
  CaseFile,
  AiInsight,
} from '@/lib/database.types'
import { SOURCE_TYPE_CONFIG, VERDICT_CONFIG } from '@/lib/research-hub-helpers'
import { classNames, formatRelativeDate, truncate, formatDate } from '@/lib/utils'
import {
  Plus,
  MapPin,
  ZoomIn,
  X,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'

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

interface MapViewProps {
  artifacts: ConstellationArtifact[]
  caseFiles: CaseFile[]
  caseFileArtifactMap: Record<string, string[]>
  insights: AiInsight[]
  activeCaseFileId: string | null
  onSelectArtifact: (artifact: ConstellationArtifact) => void
  onAddArtifact: () => void
}

interface Cluster {
  markers: ConstellationArtifact[]
  center: [number, number]
  bounds: [[number, number], [number, number]]
}

const CLUSTERING_DISTANCE_METERS = 50000
const MIN_CLUSTER_SIZE = 3
const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795]
const DEFAULT_ZOOM = 4

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

function clusterMarkers(artifacts: ConstellationArtifact[]): {
  clusters: Cluster[]
  unclustered: ConstellationArtifact[]
} {
  const clusters: Cluster[] = []
  const used = new Set<string>()

  for (const artifact of artifacts) {
    if (used.has(artifact.id)) continue

    const coords = artifact.coordinates as {
      lat: number
      lng: number
    } | null
    if (!coords) continue

    const nearby = [artifact]
    used.add(artifact.id)

    for (const other of artifacts) {
      if (used.has(other.id)) continue

      const otherCoords = other.coordinates as {
        lat: number
        lng: number
      } | null
      if (!otherCoords) continue

      const distance = haversineDistance(
        coords.lat,
        coords.lng,
        otherCoords.lat,
        otherCoords.lng
      )

      if (distance <= CLUSTERING_DISTANCE_METERS) {
        nearby.push(other)
        used.add(other.id)
      }
    }

    if (nearby.length >= MIN_CLUSTER_SIZE) {
      const lats = nearby.map(
        (a) => (a.coordinates as { lat: number; lng: number }).lat
      )
      const lngs = nearby.map(
        (a) => (a.coordinates as { lat: number; lng: number }).lng
      )
      const centerLat = lats.reduce((a, b) => a + b) / lats.length
      const centerLng = lngs.reduce((a, b) => a + b) / lngs.length

      const minLat = Math.min(...lats)
      const maxLat = Math.max(...lats)
      const minLng = Math.min(...lngs)
      const maxLng = Math.max(...lngs)

      clusters.push({
        markers: nearby,
        center: [centerLat, centerLng],
        bounds: [
          [minLat, minLng],
          [maxLat, maxLng],
        ],
      })
    }
  }

  const unclustered = artifacts.filter((a) => !used.has(a.id))

  return { clusters, unclustered }
}

function computeClusterBoundingCircle(
  artifacts: ConstellationArtifact[]
): { center: [number, number]; radius: number } | null {
  if (artifacts.length === 0) return null

  const coords = artifacts
    .map((a) => a.coordinates as { lat: number; lng: number } | null)
    .filter((c) => c !== null) as { lat: number; lng: number }[]

  if (coords.length === 0) return null

  const centerLat = coords.reduce((a, b) => a + b.lat, 0) / coords.length
  const centerLng = coords.reduce((a, b) => a + b.lng, 0) / coords.length

  let maxDistance = 0
  for (const coord of coords) {
    const distance = haversineDistance(centerLat, centerLng, coord.lat, coord.lng)
    if (distance > maxDistance) {
      maxDistance = distance
    }
  }

  return {
    center: [centerLat, centerLng],
    radius: maxDistance,
  }
}

export function MapViewInner({
  artifacts,
  caseFiles,
  caseFileArtifactMap,
  insights,
  activeCaseFileId,
  onSelectArtifact,
  onAddArtifact,
}: MapViewProps) {
  const [mounted, setMounted] = useState(false)
  const [L, setL] = useState<any>(null)
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(
    new Set(['all'])
  )
  const [mapRef, setMapRef] = useState<any>(null)
  const [showBottomSheet, setShowBottomSheet] = useState(true)
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false)

  useEffect(() => {
    setMounted(true)
    import('leaflet').then((leaflet) => {
      const L = leaflet.default
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl: '',
        iconRetinaUrl: '',
        shadowUrl: '',
      })
      setL(L)
    })
  }, [])

  const artifactsWithCoords = useMemo(
    () =>
      artifacts.filter(
        (a) =>
          a.coordinates &&
          typeof a.coordinates === 'object' &&
          'lat' in a.coordinates &&
          'lng' in a.coordinates
      ),
    [artifacts]
  )

  const filteredArtifacts = useMemo(() => {
    if (selectedLayers.has('all')) {
      return artifactsWithCoords
    }

    const visible = new Set<string>()
    for (const caseFileId of selectedLayers) {
      const artifactIds = caseFileArtifactMap[caseFileId] || []
      artifactIds.forEach((id) => visible.add(id))
    }

    return artifactsWithCoords.filter((a) => visible.has(a.id))
  }, [selectedLayers, artifactsWithCoords, caseFileArtifactMap])

  const { clusters, unclustered } = useMemo(
    () => clusterMarkers(filteredArtifacts),
    [filteredArtifacts]
  )

  const spatialClusterInsights = useMemo(
    () => insights.filter((i) => i.insight_type === 'spatial_cluster'),
    [insights]
  )

  const insightCircles = useMemo(
    () =>
      spatialClusterInsights
        .map((insight) => {
          const artifactIds = new Set(insight.artifact_ids)
          const insightArtifacts = filteredArtifacts.filter((a) =>
            artifactIds.has(a.id)
          )
          return {
            insight,
            boundingCircle: computeClusterBoundingCircle(insightArtifacts),
          }
        })
        .filter((i) => i.boundingCircle !== null),
    [spatialClusterInsights, filteredArtifacts]
  )

  const createMarkerIcon = (artifact: ConstellationArtifact) => {
    let markerColor = '#808080'
    let borderColor = '#4B5563'

    const caseFileIds = Object.entries(caseFileArtifactMap)
      .filter(([, artifactIds]) => artifactIds.includes(artifact.id))
      .map(([caseFileId]) => caseFileId)

    if (caseFileIds.length === 1) {
      const caseFile = caseFiles.find((cf) => cf.id === caseFileIds[0])
      if (caseFile) {
        markerColor = caseFile.cover_color
      }
    }

    const verdictConfig = VERDICT_CONFIG[artifact.verdict || 'inconclusive']
    borderColor = verdictConfig?.dotColor || '#4B5563'

    const html =
      '<div style="width:36px;min-width:36px;max-width:36px;height:36px;min-height:36px;max-height:36px;aspect-ratio:1/1;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;background:' +
      markerColor +
      ';border:2.5px solid ' +
      borderColor +
      ';box-shadow:0 2px 8px rgba(0,0,0,0.5);line-height:1;flex-shrink:0;"></div>'

    return L.divIcon({
      html: html,
      className: 'custom-div-marker',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
    })
  }

  const createClusterIcon = (count: number) => {
    const html =
      '<div style="width:44px;min-width:44px;max-width:44px;height:44px;min-height:44px;max-height:44px;aspect-ratio:1/1;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;background:#6366f1;border:2.5px solid #7a00cc;color:white;box-shadow:0 2px 12px rgba(99,102,241,0.4);line-height:1;flex-shrink:0;">' +
      count +
      '</div>'

    return L.divIcon({
      html: html,
      className: 'custom-div-marker',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -22],
    })
  }

  const handleLayerToggle = (caseFileId: string) => {
    const newLayers = new Set(selectedLayers)

    if (caseFileId === 'all') {
      if (newLayers.has('all')) {
        newLayers.delete('all')
        caseFiles.forEach((cf) => newLayers.add(cf.id))
      } else {
        newLayers.clear()
        newLayers.add('all')
      }
    } else {
      if (newLayers.has('all')) {
        newLayers.delete('all')
      }

      if (newLayers.has(caseFileId)) {
        newLayers.delete(caseFileId)
      } else {
        newLayers.add(caseFileId)
      }

      if (newLayers.size === caseFiles.length) {
        newLayers.clear()
        newLayers.add('all')
      }
    }

    if (newLayers.size === 0) {
      newLayers.add('all')
    }

    setSelectedLayers(newLayers)
  }

  const handleFitToSelection = () => {
    if (!mapRef || filteredArtifacts.length === 0) return

    const bounds: [[number, number], [number, number]] | null = (() => {
      const lats = filteredArtifacts
        .map((a) => (a.coordinates as { lat: number; lng: number } | null)?.lat)
        .filter((lat) => lat !== undefined) as number[]

      const lngs = filteredArtifacts
        .map((a) => (a.coordinates as { lat: number; lng: number } | null)?.lng)
        .filter((lng) => lng !== undefined) as number[]

      if (lats.length === 0 || lngs.length === 0) return null

      return [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ]
    })()

    if (bounds) {
      mapRef.fitBounds(bounds, { padding: [50, 50] })
    }
  }

  const handleFitAll = () => {
    if (!mapRef || artifactsWithCoords.length === 0) return

    const lats = artifactsWithCoords
      .map((a) => (a.coordinates as { lat: number; lng: number } | null)?.lat)
      .filter((lat) => lat !== undefined) as number[]

    const lngs = artifactsWithCoords
      .map((a) => (a.coordinates as { lat: number; lng: number } | null)?.lng)
      .filter((lng) => lng !== undefined) as number[]

    if (lats.length === 0 || lngs.length === 0) return

    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ]

    mapRef.fitBounds(bounds, { padding: [50, 50] })
  }

  if (!mounted || !L) {
    return (
      <div className="rounded-xl overflow-hidden bg-gray-900/50 flex items-center justify-center" style={{ height: '600px' }}>
        <div className="text-gray-500">Loading map...</div>
      </div>
    )
  }

  if (artifactsWithCoords.length === 0) {
    return (
      <div className="rounded-xl overflow-hidden bg-gray-900 border border-gray-800">
        <div className="h-96 flex flex-col items-center justify-center">
          <MapPin className="w-12 h-12 text-gray-600 mb-3" />
          <p className="text-gray-400 text-sm mb-4">
            None of your artifacts have location data.
          </p>
          <p className="text-gray-500 text-xs mb-6 max-w-sm text-center">
            Add locations to your artifacts to see them displayed on this map.
          </p>
          <button
            onClick={onAddArtifact}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Artifact
          </button>
        </div>
      </div>
    )
  }

  const bannerText =
    artifactsWithCoords.length === artifacts.length
      ? null
      : 'Showing ' +
        artifactsWithCoords.length +
        ' of ' +
        artifacts.length +
        ' artifacts (' +
        (artifacts.length - artifactsWithCoords.length) +
        ' have no location data)'

  return (
    <div className="rounded-xl overflow-hidden bg-gray-900 border border-gray-800 flex flex-col h-full">
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <style>{[
        '.custom-div-marker { background: transparent !important; border: none !important; }',
        '.leaflet-popup-content-wrapper { background: rgba(15, 23, 42, 0.95) !important; border: 1px solid rgba(255,255,255,0.1) !important; border-radius: 8px !important; }',
        '.leaflet-popup-content { color: white !important; margin: 0 !important; }',
        '.leaflet-popup-tip { background: rgba(15, 23, 42, 0.95) !important; }',
        '.leaflet-control-zoom { border: 1px solid rgba(255,255,255,0.15) !important; border-radius: 8px !important; overflow: hidden; }',
        '.leaflet-control-zoom a { background: rgba(15, 23, 42, 0.9) !important; color: #c084fc !important; border-bottom: 1px solid rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; line-height: 28px !important; font-size: 14px !important; }',
        '.leaflet-control-zoom a:hover { background: rgba(30, 40, 60, 0.95) !important; color: #a855f7 !important; }',
        '.leaflet-control-zoom a:last-child { border-bottom: none !important; }',
      ].join(' ')}</style>

      {bannerText && (
        <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-800 text-xs text-gray-400">
          {bannerText}
        </div>
      )}

      <div className="flex-1 relative">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
          minZoom={2}
          maxBounds={[[-85, -180], [85, 180]]}
          maxBoundsViscosity={1.0}
          ref={setMapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            noWrap={true}
          />

          {insightCircles.map((item) => {
            const circle = item.boundingCircle
            if (!circle) return null
            return (
              <CircleComponent
                key={item.insight.id}
                center={circle.center}
                radius={circle.radius}
                pathOptions={{
                  color: '#8b5cf6',
                  weight: 2,
                  opacity: 0.5,
                  fill: true,
                  fillColor: '#8b5cf6',
                  fillOpacity: 0.08,
                  dashArray: '5, 5',
                }}
              />
            )
          })}

          {clusters.map((cluster) => (
            <Marker
              key={'cluster-' + cluster.center.join('-')}
              position={cluster.center}
              icon={createClusterIcon(cluster.markers.length)}
              eventHandlers={{
                click: () => {
                  if (mapRef) {
                    mapRef.fitBounds(cluster.bounds, { padding: [50, 50] })
                  }
                },
              }}
            />
          ))}

          {unclustered.map((artifact) => {
            const coords = artifact.coordinates as {
              lat: number
              lng: number
            } | null
            if (!coords) return null

            const sourceConfig = SOURCE_TYPE_CONFIG[artifact.source_type]
            const verdictConfig = VERDICT_CONFIG[artifact.verdict || 'inconclusive']

            return (
              <Marker
                key={artifact.id}
                position={[coords.lat, coords.lng]}
                icon={createMarkerIcon(artifact)}
                eventHandlers={{
                  click: () => {
                    onSelectArtifact(artifact)
                  },
                }}
              >
                <Popup>
                  <div className="min-w-[280px]">
                    <h3 className="font-semibold text-white text-sm mb-2">
                      {artifact.title}
                    </h3>

                    <div className="flex gap-2 mb-2">
                      <span
                        className={classNames(
                          'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full',
                          sourceConfig?.bgColor || 'bg-gray-700/50',
                          sourceConfig?.color || 'text-gray-300'
                        )}
                      >
                        {sourceConfig?.label || 'Unknown'}
                      </span>

                      {verdictConfig && (
                        <span
                          className={classNames(
                            'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full',
                            verdictConfig.bgColor,
                            verdictConfig.color
                          )}
                        >
                          {verdictConfig.label}
                        </span>
                      )}
                    </div>

                    {artifact.extracted_date && (
                      <p className="text-xs text-gray-400 mb-1">
                        {formatDate(artifact.extracted_date, 'MMM d, yyyy')}
                      </p>
                    )}

                    {artifact.user_note && (
                      <p className="text-xs text-gray-300 mt-2 line-clamp-2">
                        {truncate(artifact.user_note, 120)}
                      </p>
                    )}

                    <button
                      onClick={() => onSelectArtifact(artifact)}
                      className="mt-3 w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      View Details
                    </button>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>

        {/* Layer toggle panel - top right */}
        <div className="absolute top-4 right-4 z-10 bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-xl">
          <div className="px-3 py-2 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-300">Layers</p>
          </div>

          <div className="max-h-48 overflow-y-auto">
            <button
              onClick={() => handleLayerToggle('all')}
              className={classNames(
                'w-full text-left px-3 py-2 text-xs transition-colors',
                selectedLayers.has('all')
                  ? 'bg-indigo-600/20 text-indigo-300'
                  : 'text-gray-400 hover:bg-gray-800'
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedLayers.has('all')}
                  onChange={() => {}}
                  className="w-3 h-3"
                />
                All
              </span>
            </button>

            {caseFiles.map((caseFile) => (
              <button
                key={caseFile.id}
                onClick={() => handleLayerToggle(caseFile.id)}
                className={classNames(
                  'w-full text-left px-3 py-2 text-xs transition-colors',
                  selectedLayers.has(caseFile.id)
                    ? 'bg-indigo-600/20 text-indigo-300'
                    : 'text-gray-400 hover:bg-gray-800'
                )}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedLayers.has(caseFile.id)}
                    onChange={() => {}}
                    className="w-3 h-3"
                  />
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: caseFile.cover_color }}
                  />
                  <span className="truncate">{caseFile.title}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-gray-800 p-2 space-y-1">
            <button
              onClick={handleFitToSelection}
              disabled={selectedLayers.has('all') || filteredArtifacts.length === 0}
              className="w-full flex items-center justify-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-300 disabled:opacity-50 disabled:hover:text-gray-400 hover:bg-gray-800 rounded transition-colors"
            >
              <ZoomIn className="w-3 h-3" />
              Fit Selection
            </button>

            <button
              onClick={handleFitAll}
              className="w-full flex items-center justify-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
            >
              <ZoomIn className="w-3 h-3" />
              Fit All
            </button>
          </div>
        </div>
      </div>

      {/* Bottom sheet - mobile view */}
      {showBottomSheet && filteredArtifacts.length > 0 && (
        <div className="border-t border-gray-800 bg-gray-900 max-h-40">
          <button
            onClick={() => setBottomSheetExpanded(!bottomSheetExpanded)}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-800 transition-colors"
          >
            <span className="text-xs font-medium text-gray-300">
              Visible Artifacts ({filteredArtifacts.length})
            </span>
            {bottomSheetExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            )}
          </button>

          {bottomSheetExpanded && (
            <div className="overflow-y-auto max-h-48 px-4 pb-3 space-y-2">
              {filteredArtifacts.slice(0, 10).map((artifact) => {
                const sourceConfig = SOURCE_TYPE_CONFIG[artifact.source_type]

                return (
                  <button
                    key={artifact.id}
                    onClick={() => onSelectArtifact(artifact)}
                    className="w-full text-left p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                  >
                    <p className="text-xs font-medium text-white truncate">
                      {artifact.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {sourceConfig?.label || 'Unknown'}
                    </p>
                  </button>
                )
              })}

              {filteredArtifacts.length > 10 && (
                <p className="text-xs text-gray-500 text-center py-1">
                  +{filteredArtifacts.length - 10} more
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
