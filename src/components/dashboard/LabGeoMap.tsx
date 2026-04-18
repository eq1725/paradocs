'use client'

/**
 * LabGeoMap — Geographic map of the user's saves.
 *
 * Uses react-leaflet + supercluster for a proper dark-themed world map with
 * category-colored pins, zoom-based clustering, category and case-file
 * filters, and a tap-to-open detail panel.
 *
 * IMPORTANT: this component relies on browser APIs (window, document) and
 * must only be rendered client-side. The parent uses next/dynamic with
 * ssr: false to enforce that.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import type { Map as LeafletMap, LeafletMouseEvent, DivIcon } from 'leaflet'
import Supercluster from 'supercluster'
import type { EntryNode, UserMapData } from '@/lib/constellation-types'
import { classNames } from '@/lib/utils'
import { X as XIcon, MapPin as MapPinIcon } from 'lucide-react'

// Leaflet's default icon URLs assume a CDN layout — we supply custom
// DivIcons anyway, but the default CSS still needs a single import.
import 'leaflet/dist/leaflet.css'

// Category → marker color. Kept in sync with the rest of the Lab palette.
const CATEGORY_COLOR: Record<string, string> = {
  ufos_aliens: '#22c55e',
  cryptids: '#f59e0b',
  ghosts_hauntings: '#a855f7',
  psychic_phenomena: '#3b82f6',
  consciousness_practices: '#8b5cf6',
  psychological_experiences: '#ec4899',
  biological_factors: '#14b8a6',
  perception_sensory: '#06b6d4',
  religion_mythology: '#f97316',
  esoteric_practices: '#6366f1',
  combination: '#64748b',
}

// Cluster marker color scales with point density.
function clusterColor(count: number): string {
  if (count < 10) return '#6366f1'
  if (count < 50) return '#a855f7'
  if (count < 150) return '#ec4899'
  return '#f97316'
}

interface LabGeoMapProps {
  userMapData: UserMapData | null
  selectedCategory?: string | null
  selectedCaseFileId?: string | null
  onSelectEntry: (entry: EntryNode) => void
}

/**
 * Best-effort geocode from locationName when DB coordinates aren't present.
 * Stubbed as no-op for now — the component only shows entries that already
 * have explicit lat/lng in the underlying data. Future: server-side
 * geocoding pass that backfills coordinates for text locations.
 *
 * The current EntryNode type doesn't expose lat/lng directly; we pull them
 * from a loose `coordinates` property if present, or from `metadata_json`.
 */
// Supabase can return NUMERIC columns as strings in some client/driver
// configurations. Coerce + validate so a stored "-82.22" still counts as
// a valid longitude. Returns null for anything that isn't a finite number
// inside the plausible lat/lng range.
function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : null
}

function validCoord(lat: number | null, lng: number | null): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (lat === 0 && lng === 0) return null // almost always a default/uninitialized value
  return { lat, lng }
}

function entryCoords(e: EntryNode): { lat: number; lng: number } | null {
  // Read defensively — the coordinate fields aren't strictly typed and
  // different save paths (Paradocs report, legacy bookmark, external
  // artifact) stash them in slightly different places.
  const loose = e as unknown as {
    latitude?: unknown; longitude?: unknown;
    lat?: unknown; lng?: unknown;
    coordinates?: { latitude?: unknown; longitude?: unknown } | [unknown, unknown]
  }

  // Primary: flat latitude / longitude on the entry (set by user-map.ts
  // for report-linked saves).
  const direct = validCoord(num(loose.latitude), num(loose.longitude))
  if (direct) return direct

  // Alternate: lat / lng
  const alt = validCoord(num(loose.lat), num(loose.lng))
  if (alt) return alt

  // Nested coordinates, tuple form: [lng, lat] (GeoJSON order)
  if (Array.isArray(loose.coordinates) && loose.coordinates.length === 2) {
    const tuple = validCoord(num(loose.coordinates[1]), num(loose.coordinates[0]))
    if (tuple) return tuple
  }
  // Nested coordinates, object form
  if (loose.coordinates && !Array.isArray(loose.coordinates)) {
    const c = loose.coordinates as any
    const nested = validCoord(num(c.latitude), num(c.longitude))
    if (nested) return nested
  }

  // Artifact metadata: extract endpoint stashes coords here for some sources.
  const m = (e.sourceMetadata || {}) as any
  const fromMeta = validCoord(
    num(m.location_latitude ?? m.latitude ?? m.lat),
    num(m.location_longitude ?? m.longitude ?? m.lng),
  )
  if (fromMeta) return fromMeta

  return null
}

export default function LabGeoMap({
  userMapData,
  selectedCategory,
  selectedCaseFileId,
  onSelectEntry,
}: LabGeoMapProps) {
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null)

  // Dynamic-load leaflet on the client so we can build DivIcons.
  useEffect(() => {
    let cancelled = false
    import('leaflet').then(L => {
      if (!cancelled) setLeaflet(L as any)
    })
    return () => { cancelled = true }
  }, [])

  // Points: entries with valid coordinates, filtered by category + case file.
  const points = useMemo(() => {
    if (!userMapData) return [] as Array<{ entry: EntryNode; lat: number; lng: number }>
    return userMapData.entryNodes.flatMap(e => {
      if (e.isGhost) return []
      if (selectedCategory && e.category !== selectedCategory) return []
      if (selectedCaseFileId && !(e.caseFileIds || []).includes(selectedCaseFileId)) return []
      const coords = entryCoords(e)
      if (!coords) return []
      return [{ entry: e, lat: coords.lat, lng: coords.lng }]
    })
  }, [userMapData, selectedCategory, selectedCaseFileId])

  // Empty / loading states
  if (!leaflet) {
    return (
      <div className="w-full h-[60vh] sm:h-[70vh] rounded-2xl bg-gray-950 border border-gray-800 flex items-center justify-center">
        <div className="text-center">
          <MapPinIcon className="w-6 h-6 text-gray-600 mx-auto mb-2 animate-pulse" />
          <p className="text-xs text-gray-500">Loading map...</p>
        </div>
      </div>
    )
  }

  if (points.length === 0) {
    return (
      <div className="w-full h-[60vh] sm:h-[70vh] rounded-2xl bg-gray-950 border border-gray-800 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="inline-flex p-3 bg-sky-500/10 rounded-full mb-3">
            <MapPinIcon className="w-6 h-6 text-sky-300" />
          </div>
          <h3 className="text-white font-semibold text-sm mb-1">
            {selectedCategory || selectedCaseFileId
              ? 'No geocoded saves match this filter'
              : 'No geocoded saves yet'}
          </h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            Paradocs reports with a location and cross-referenced coordinates will appear here as pins.
            Clear any active filters, or save reports that have location data attached.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-[60vh] sm:h-[70vh] rounded-2xl overflow-hidden border border-gray-800 bg-gray-950">
      <MapContainer
        center={[points[0].lat, points[0].lng] as [number, number]}
        zoom={3}
        scrollWheelZoom
        className="w-full h-full"
        attributionControl={false}
      >
        <TileLayer
          // Dark basemap from CartoDB. Free for small-scale usage under their
          // terms; attribution appears in the floating control.
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <ClusteredMarkers
          L={leaflet!}
          points={points}
          onSelect={onSelectEntry}
        />
      </MapContainer>
    </div>
  )
}

// ── Clustered marker renderer ──

interface ClusteredMarkersProps {
  L: typeof import('leaflet')
  points: Array<{ entry: EntryNode; lat: number; lng: number }>
  onSelect: (entry: EntryNode) => void
}

function ClusteredMarkers({ L, points, onSelect }: ClusteredMarkersProps) {
  const map = useMap()
  const [, setTick] = useState(0)

  // Rebuild supercluster whenever points change.
  const cluster = useMemo(() => {
    const sc = new Supercluster({ radius: 60, maxZoom: 16 })
    sc.load(points.map((p, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { idx: i, entry: p.entry },
    })) as any)
    return sc
  }, [points])

  // Tick the renderer on every map move/zoom so clusters rebuild for the
  // current viewport.
  useEffect(() => {
    const update = () => setTick(t => t + 1)
    map.on('moveend', update)
    map.on('zoomend', update)
    update()
    return () => {
      map.off('moveend', update)
      map.off('zoomend', update)
    }
  }, [map])

  // Compute current viewport bounds + zoom, ask supercluster for the clusters
  // it wants to render at this resolution.
  const b = map.getBounds()
  const z = Math.round(map.getZoom())
  const clusters = cluster.getClusters(
    [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
    z
  )

  return (
    <>
      {clusters.map((c: any) => {
        const [lng, lat] = c.geometry.coordinates
        if (c.properties.cluster) {
          return (
            <Marker
              key={'cluster-' + c.properties.cluster_id}
              position={[lat, lng]}
              icon={makeClusterIcon(L, c.properties.point_count)}
              eventHandlers={{
                click: () => {
                  const expansionZoom = Math.min(cluster.getClusterExpansionZoom(c.properties.cluster_id), 14)
                  map.setView([lat, lng], expansionZoom, { animate: true })
                },
              }}
            />
          )
        }
        const entry = c.properties.entry as EntryNode
        return (
          <Marker
            key={'pin-' + entry.id}
            position={[lat, lng]}
            icon={makePinIcon(L, entry.category)}
            eventHandlers={{
              click: () => onSelect(entry),
            }}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-semibold text-gray-900 mb-0.5">{entry.name}</div>
                {entry.locationName && (
                  <div className="text-gray-600">{entry.locationName}</div>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

// ── Icon factories ──

function makePinIcon(L: typeof import('leaflet'), category: string): DivIcon {
  const color = CATEGORY_COLOR[category] || '#64748b'
  // Classic "map pin" shape with a glowing ring. The inline SVG keeps us
  // from shipping raster assets.
  const html = `
    <div style="position: relative; width: 24px; height: 32px;">
      <svg viewBox="0 0 24 32" width="24" height="32" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));">
        <path
          d="M12 0c-6.6 0-12 5.4-12 12 0 8 12 20 12 20s12-12 12-20c0-6.6-5.4-12-12-12z"
          fill="${color}"
          stroke="rgba(255,255,255,0.8)"
          stroke-width="1.5"
        />
        <circle cx="12" cy="12" r="4.5" fill="white" />
      </svg>
    </div>
  `
  return L.divIcon({
    className: 'lab-pin',
    html,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
    popupAnchor: [0, -28],
  })
}

function makeClusterIcon(L: typeof import('leaflet'), count: number): DivIcon {
  const color = clusterColor(count)
  const size = count < 10 ? 34 : count < 50 ? 40 : count < 150 ? 48 : 56
  const html = `
    <div style="
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${color};
      box-shadow: 0 0 0 4px ${color}33, 0 2px 6px rgba(0,0,0,0.4);
      color: white;
      font-weight: 700;
      font-size: ${count < 10 ? 13 : count < 150 ? 14 : 15}px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Inter, system-ui, sans-serif;
    ">${count}</div>
  `
  return L.divIcon({
    className: 'lab-cluster',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}
