/**
 * MapContainer — Core MapLibre GL map with clustered markers and heatmap
 *
 * This is the main map renderer. It receives data (features from Supercluster)
 * and renders them as clustered circle markers or a heatmap layer.
 */

import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react'
import Map, {
  Source,
  Layer,
  NavigationControl,
  GeolocateControl,
  MapRef,
  ViewStateChangeEvent,
  MapLayerMouseEvent,
} from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

// Hide MapLibre's native navigation control on mobile (we use pinch-to-zoom)
const mapOverrideStyles = `
  @media (max-width: 1023px) {
    .maplibregl-ctrl-top-right { display: none !important; }
  }
`
import type Supercluster from 'supercluster'
import {
  MAPTILER_STYLE_URL,
  BASEMAP_STYLES,
  INITIAL_VIEW,
  MAP_BOUNDS,
  CATEGORY_COLORS,
  HEATMAP_COLORS,
  ReportProperties,
  isCluster,
} from './mapStyles'
import { DataBounds } from './useViewportData'
import { PhenomenonCategory } from '@/lib/database.types'

interface MapContainerProps {
  features: (Supercluster.ClusterFeature<ReportProperties> | Supercluster.PointFeature<ReportProperties>)[]
  /** Raw unclustered points for the heatmap layer */
  allPoints: GeoJSON.FeatureCollection
  supercluster: Supercluster<ReportProperties> | null
  heatmapActive: boolean
  selectedReportId: string | null
  onSelectReport: (id: string) => void
  onViewportChange: (bounds: [number, number, number, number], zoom: number) => void
  onLocateMe?: () => void
  /** Bounding box of all data — map auto-fits to this on first load */
  dataBounds?: DataBounds
  /** Coordinates to fly to (e.g. from geolocation) — triggers flyTo when changed */
  flyToTarget?: { lng: number; lat: number; zoom?: number } | null
  /** Basemap style key (dark, satellite, terrain) */
  basemapStyle?: string
  /** Dynamic padding for map content (e.g. when filter panel opens) */
  mapPadding?: { top: number; bottom: number; left: number; right: number }
}

export default function MapContainer({
  features,
  allPoints,
  supercluster,
  heatmapActive,
  selectedReportId,
  onSelectReport,
  onViewportChange,
  dataBounds,
  flyToTarget,
  basemapStyle = 'dark',
  mapPadding,
}: MapContainerProps) {
  const mapRef = useRef<MapRef>(null)
  const [viewState, setViewState] = useState<{
    longitude: number
    latitude: number
    zoom: number
    pitch: number
    bearing: number
  }>(INITIAL_VIEW)
  const [mapLoaded, setMapLoaded] = useState(false)
  const hasFittedBounds = useRef(false)

  // ─── Build GeoJSON for the source ──────────────────────────
  const geojsonData = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: features as GeoJSON.Feature[],
    }),
    [features]
  )

  // ─── Category color expression for MapLibre ────────────────
  const categoryColorExpr = useMemo(() => {
    const stops: (string | PhenomenonCategory)[] = []
    for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
      stops.push(cat, color)
    }
    return ['match', ['get', 'category'], ...stops, '#9ca3af'] as any
  }, [])

  // ─── Report viewport changes ───────────────────────────────
  const handleMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      const map = mapRef.current?.getMap()
      if (!map) return

      const bounds = map.getBounds()
      if (!bounds) return

      onViewportChange(
        [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ],
        e.viewState.zoom
      )
    },
    [onViewportChange]
  )

  // Fire initial viewport after map loads
  useEffect(() => {
    if (mapLoaded) {
      const map = mapRef.current?.getMap()
      if (!map) return
      const bounds = map.getBounds()
      if (bounds) {
        onViewportChange(
          [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
          viewState.zoom
        )
      }
    }
  }, [mapLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fit to data bounds on first load
  useEffect(() => {
    if (mapLoaded && dataBounds && !hasFittedBounds.current) {
      const map = mapRef.current?.getMap()
      if (!map) return
      hasFittedBounds.current = true
      map.fitBounds(
        [[dataBounds[0], dataBounds[1]], [dataBounds[2], dataBounds[3]]],
        { padding: { top: 60, bottom: 100, left: 40, right: 40 }, duration: 1000, maxZoom: 12 }
      )
    }
  }, [mapLoaded, dataBounds])

  // Re-fit bounds when padding changes (e.g. filter panel open/close)
  const prevPaddingRef = useRef(mapPadding)
  useEffect(() => {
    if (!mapLoaded || !dataBounds || !mapPadding) return
    // Skip initial render — only refit on actual padding changes
    if (prevPaddingRef.current === mapPadding) return
    prevPaddingRef.current = mapPadding
    const map = mapRef.current?.getMap()
    if (!map) return
    map.fitBounds(
      [[dataBounds[0], dataBounds[1]], [dataBounds[2], dataBounds[3]]],
      { padding: mapPadding, duration: 600, maxZoom: 12 }
    )
  }, [mapLoaded, mapPadding]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to a target location (e.g. user geolocation)
  useEffect(() => {
    if (!mapLoaded || !flyToTarget) return
    const map = mapRef.current?.getMap()
    if (!map) return
    map.flyTo({
      center: [flyToTarget.lng, flyToTarget.lat],
      zoom: flyToTarget.zoom ?? 10,
      duration: 1200,
    })
  }, [mapLoaded, flyToTarget])

  // ─── Click handling ────────────────────────────────────────
  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return

      const props = feature.properties
      if (!props) return

      // Cluster click → zoom in
      if (props.cluster && supercluster) {
        const clusterId = props.cluster_id
        try {
          const zoom = supercluster.getClusterExpansionZoom(clusterId)
          const geometry = feature.geometry as GeoJSON.Point
          mapRef.current?.flyTo({
            center: geometry.coordinates as [number, number],
            zoom: Math.min(zoom, MAP_BOUNDS.maxZoom),
            duration: 500,
          })
        } catch {
          // ignore
        }
        return
      }

      // Individual report click
      if (props.id) {
        onSelectReport(props.id as string)
      }
    },
    [supercluster, onSelectReport]
  )

  // ─── Cursor changes ───────────────────────────────────────
  const handleMouseEnter = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (map) map.getCanvas().style.cursor = 'pointer'
  }, [])

  const handleMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (map) map.getCanvas().style.cursor = ''
  }, [])

  return (
    <>
    <style>{mapOverrideStyles}</style>
    <Map
      ref={mapRef}
      {...viewState}
      onMove={(e) => setViewState(e.viewState)}
      onMoveEnd={handleMoveEnd}
      onLoad={() => setMapLoaded(true)}
      mapStyle={BASEMAP_STYLES[basemapStyle] || MAPTILER_STYLE_URL}
      style={{ width: '100%', height: '100%' }}
      minZoom={MAP_BOUNDS.minZoom}
      maxZoom={MAP_BOUNDS.maxZoom}
      interactiveLayerIds={['clusters', 'unclustered-point', 'unclustered-point-fuzzy']}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      attributionControl={false}
    >
      {/* Navigation controls — hidden on mobile via CSS */}
      <NavigationControl position="top-right" showCompass={false} />

      {/* ─── Heatmap: separate source with ALL raw points (not clustered) ─── */}
      {heatmapActive && (
        <Source id="reports-heat-source" type="geojson" data={allPoints}>
          <Layer
            id="reports-heat"
            type="heatmap"
            paint={{
              'heatmap-weight': 1,
              'heatmap-intensity': [
                'interpolate', ['linear'], ['zoom'],
                0, 1,
                3, 2,
                6, 3,
                10, 4,
              ] as any,
              'heatmap-radius': [
                'interpolate', ['linear'], ['zoom'],
                0, 20,
                3, 40,
                6, 50,
                10, 60,
                14, 80,
              ] as any,
              'heatmap-opacity': [
                'interpolate', ['linear'], ['zoom'],
                0, 0.85,
                10, 0.7,
                14, 0.3,
                16, 0,
              ] as any,
              'heatmap-color': HEATMAP_COLORS as any,
            }}
          />
        </Source>
      )}

      {/* ─── Clustered markers source ─── */}
      <Source
        id="reports"
        type="geojson"
        data={geojsonData}
      >
        {/* ─── Cluster circles ─── */}
        <Layer
          id="clusters"
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': [
              'step', ['get', 'point_count'],
              '#6366f1', // indigo < 10
              10, '#8b5cf6', // violet < 100
              100, '#a855f7', // purple < 1000
              1000, '#c084fc', // purple-400
            ] as any,
            'circle-radius': [
              'step', ['get', 'point_count'],
              16, // < 10
              10, 20, // < 100
              100, 26, // < 1000
              1000, 32,
            ] as any,
            'circle-stroke-width': 2,
            'circle-stroke-color': 'rgba(255,255,255,0.15)',
            'circle-opacity': heatmapActive ? 0.3 : 0.9,
          }}
        />

        {/* ─── Cluster count labels ─── */}
        <Layer
          id="cluster-count"
          type="symbol"
          filter={['has', 'point_count']}
          layout={{
            'text-field': [
              'step', ['get', 'point_count'],
              ['to-string', ['get', 'point_count']],
              1000, ['concat', ['to-string', ['/', ['round', ['/', ['get', 'point_count'], 100]], 10]], 'K'],
            ] as any,
            'text-size': 12,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-allow-overlap': true,
          }}
          paint={{
            'text-color': '#ffffff',
            'text-opacity': heatmapActive ? 0.3 : 1,
          }}
        />

        {/* ─── Individual report markers (city-accurate and better) ─── */}
        <Layer
          id="unclustered-point"
          type="circle"
          filter={[
            'all',
            ['!', ['has', 'point_count']],
            ['!=', ['get', 'location_precision'], 'state'],
            ['!=', ['get', 'location_precision'], 'country'],
          ] as any}
          paint={{
            'circle-color': categoryColorExpr,
            'circle-radius': [
              'case',
              ['==', ['get', 'id'], selectedReportId || ''],
              10,
              6,
            ] as any,
            'circle-stroke-width': [
              'case',
              ['==', ['get', 'id'], selectedReportId || ''],
              3,
              1.5,
            ] as any,
            'circle-stroke-color': [
              'case',
              ['==', ['get', 'id'], selectedReportId || ''],
              '#ffffff',
              'rgba(255,255,255,0.3)',
            ] as any,
            'circle-opacity': heatmapActive ? 0.4 : 0.9,
          }}
        />

        {/* ─── Fuzzy markers (state-centroid / country-centroid) ─── */}
        {/* These pins are intentionally softer and larger — they sit at a
            state or country centroid, not a precise spot. We use a hollow-
            ish fill, a halo ring, and lower opacity so they read as
            "somewhere in this area" rather than "exactly here". */}
        <Layer
          id="unclustered-point-fuzzy-halo"
          type="circle"
          filter={[
            'all',
            ['!', ['has', 'point_count']],
            ['any',
              ['==', ['get', 'location_precision'], 'state'],
              ['==', ['get', 'location_precision'], 'country'],
            ],
          ] as any}
          paint={{
            'circle-color': categoryColorExpr,
            'circle-radius': [
              'case',
              ['==', ['get', 'location_precision'], 'country'], 22,
              16,
            ] as any,
            'circle-opacity': 0.10,
            'circle-stroke-width': 0,
          }}
        />
        <Layer
          id="unclustered-point-fuzzy"
          type="circle"
          filter={[
            'all',
            ['!', ['has', 'point_count']],
            ['any',
              ['==', ['get', 'location_precision'], 'state'],
              ['==', ['get', 'location_precision'], 'country'],
            ],
          ] as any}
          paint={{
            'circle-color': categoryColorExpr,
            'circle-radius': [
              'case',
              ['==', ['get', 'id'], selectedReportId || ''],
              9,
              5,
            ] as any,
            'circle-opacity': heatmapActive ? 0.3 : 0.55,
            'circle-stroke-width': [
              'case',
              ['==', ['get', 'id'], selectedReportId || ''],
              2.5,
              1,
            ] as any,
            'circle-stroke-color': 'rgba(255,255,255,0.55)',
          }}
        />
      </Source>
    </Map>
    </>
  )
}
