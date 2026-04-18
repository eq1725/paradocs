'use client'

/**
 * LabGeoMap — Geographic view of the user's saved reports.
 *
 * Powered by MapLibre GL (same stack as the public Explore map) so the
 * Lab tab has feature parity: three basemap styles, density heatmap,
 * smooth animated clustering, geolocate control, historical-wave
 * overlays when user saves fall inside a documented wave window, a
 * timeline scrubber for filtering by event year, and an optional
 * global-context backdrop showing all Paradocs reports as faint dots
 * so the user can see their library in global context.
 *
 * Only the user's saves come from useLabData; the global backdrop layer
 * lazy-loads via useViewportData (same hook the public map uses) once
 * the user opts in.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  Source,
  Layer,
  NavigationControl,
  GeolocateControl,
  Popup,
  type MapRef,
  type MapLayerMouseEvent,
} from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Layers, Flame, Clock, Globe2, Map as MapIcon, MapPin as MapPinIcon, X as XIcon } from 'lucide-react'
import type { EntryNode, UserMapData } from '@/lib/constellation-types'
import { BASEMAP_STYLES, CATEGORY_COLORS, HEATMAP_COLORS, MAP_BOUNDS, DEFAULT_FILTERS, TIMELINE } from '@/components/map/mapStyles'
import { HISTORICAL_WAVES } from '@/lib/historical-waves'
import { classNames } from '@/lib/utils'
import { useViewportData } from '@/components/map/useViewportData'

type BasemapKey = 'dark' | 'satellite' | 'terrain'

interface LabGeoMapProps {
  userMapData: UserMapData | null
  selectedCategory: string | null
  selectedCaseFileId: string | null
  onSelectEntry: (entry: EntryNode | null) => void
}

// ─── Coord coercion ─────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : null
}

function validCoord(lat: number | null, lng: number | null): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

function entryCoords(e: EntryNode): { lat: number; lng: number } | null {
  const loose = e as unknown as { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown }
  const direct = validCoord(num(loose.latitude), num(loose.longitude))
  if (direct) return direct
  const alt = validCoord(num(loose.lat), num(loose.lng))
  if (alt) return alt
  return null
}

// ─── Main component ─────────────────────────────────────────────

export default function LabGeoMap({
  userMapData,
  selectedCategory,
  selectedCaseFileId,
  onSelectEntry,
}: LabGeoMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  // Control state — persisted to localStorage so preferences survive
  // reloads. Keys intentionally namespaced under `paradocs_lab_`.
  const [basemap, setBasemap] = useState<BasemapKey>('dark')
  const [heatmapActive, setHeatmapActive] = useState(false)
  const [globalContext, setGlobalContext] = useState(false)
  const [timelineRange, setTimelineRange] = useState<[number, number] | null>(null)
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null)
  const hasFitBounds = useRef(false)

  // Restore persisted prefs once on mount
  useEffect(() => {
    try {
      const rawBase = localStorage.getItem('paradocs_lab_map_basemap')
      if (rawBase === 'dark' || rawBase === 'satellite' || rawBase === 'terrain') setBasemap(rawBase)
      const rawHeat = localStorage.getItem('paradocs_lab_map_heatmap')
      if (rawHeat === '1') setHeatmapActive(true)
      const rawGlobal = localStorage.getItem('paradocs_lab_map_global')
      if (rawGlobal === '1') setGlobalContext(true)
    } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem('paradocs_lab_map_basemap', basemap) } catch {} }, [basemap])
  useEffect(() => { try { localStorage.setItem('paradocs_lab_map_heatmap', heatmapActive ? '1' : '0') } catch {} }, [heatmapActive])
  useEffect(() => { try { localStorage.setItem('paradocs_lab_map_global', globalContext ? '1' : '0') } catch {} }, [globalContext])

  // ── Build user-save points ─────────────────────────────────
  const userPoints = useMemo(() => {
    if (!userMapData) return [] as Array<{ entry: EntryNode; lat: number; lng: number }>
    return userMapData.entryNodes.flatMap(e => {
      if (e.isGhost) return []
      if (selectedCategory && e.category !== selectedCategory) return []
      if (selectedCaseFileId && !(e.caseFileIds || []).includes(selectedCaseFileId)) return []
      const coords = entryCoords(e)
      if (!coords) return []
      // Timeline filter (by event year)
      if (timelineRange && e.eventDate) {
        const year = new Date(e.eventDate).getFullYear()
        if (!isNaN(year)) {
          if (year < timelineRange[0] || year > timelineRange[1]) return []
        }
      }
      return [{ entry: e, lat: coords.lat, lng: coords.lng }]
    })
  }, [userMapData, selectedCategory, selectedCaseFileId, timelineRange])

  // ── Year range for the timeline slider ──
  // When the global-context backdrop is on, widen to the full explore
  // range (TIMELINE.min → current year) so the user can slide back to
  // decades earlier than their own saves — global reports routinely
  // predate anything the user has personally saved. When it's off, fall
  // back to the user's save span so the slider doesn't show dead years.
  const yearRangeAvailable = useMemo<[number, number] | null>(() => {
    if (globalContext) return [TIMELINE.min, TIMELINE.max]
    const years: number[] = []
    for (const n of userMapData?.entryNodes || []) {
      if (!n.eventDate) continue
      const y = new Date(n.eventDate).getFullYear()
      if (!isNaN(y)) years.push(y)
    }
    if (years.length === 0) return null
    return [Math.min(...years), Math.max(...years)]
  }, [userMapData, globalContext])

  // ── Historical wave overlays: show polygons for any wave that has a
  // centroid and matches at least one user save (by eventDate/location).
  // Gives saves geographic context — e.g. Phoenix Lights radius, Rendlesham
  // Forest footprint.
  const waveOverlays = useMemo(() => {
    const features: GeoJSON.Feature[] = []
    for (const wave of HISTORICAL_WAVES) {
      if (!wave.centroid) continue
      // Show only if the user has a save inside the wave (temporal overlap
      // with lat/lng in radius, OR tag / title match).
      const hit = (userMapData?.entryNodes || []).some(e => {
        if (!e.eventDate) return false
        const t = new Date(e.eventDate).getTime()
        if (isNaN(t)) return false
        const start = new Date(wave.startDate).getTime()
        const end = new Date(wave.endDate).getTime() + 86400000
        if (t < start || t > end) return false
        const c = entryCoords(e)
        if (!c) return true // date-in-window with no coords still counts
        const { lat: cLat, lng: cLng } = c
        const d = haversineKm({ lat: cLat, lng: cLng }, wave.centroid!)
        return d <= wave.centroid!.radiusKm
      })
      if (!hit) continue
      features.push(circlePolygon(wave.centroid.lat, wave.centroid.lng, wave.centroid.radiusKm, {
        id: wave.id,
        title: wave.title,
      }))
    }
    return { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection
  }, [userMapData])

  // ── GeoJSON for the user's saves ─────────────────────────
  const userGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: userPoints.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: {
        id: p.entry.id,
        category: p.entry.category,
        name: p.entry.name,
      },
    })),
  }), [userPoints])

  // ── Category color expression ────────────────────────────
  const categoryColorExpr = useMemo(() => {
    const stops: (string | number)[] = []
    for (const [cat, color] of Object.entries(CATEGORY_COLORS)) stops.push(cat, color)
    return ['match', ['get', 'category'], ...stops, '#9ca3af'] as any
  }, [])

  // Global-context layer is loaded lazily via a child component so the
  // useViewportData hook (which hits Supabase) only runs when the user
  // actually opts in to the backdrop toggle.
  const [globalGeoJSON, setGlobalGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null)

  // Filter the global backdrop by the same timeline range the user saves
  // are filtered by — otherwise toggling the slider only hides your
  // saves while the global dots still span every era.
  const filteredGlobalGeoJSON = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!globalGeoJSON) return null
    if (!timelineRange) return globalGeoJSON
    const [lo, hi] = timelineRange
    return {
      type: 'FeatureCollection',
      features: globalGeoJSON.features.filter(f => {
        const date = (f.properties as any)?.event_date
        if (!date) return true // keep undated points rather than silently dropping them
        const y = new Date(date).getFullYear()
        if (isNaN(y)) return true
        return y >= lo && y <= hi
      }),
    }
  }, [globalGeoJSON, timelineRange])

  // Track hovered global-context point so we can show a tooltip with the
  // report's title + location and let the user explore the global corpus
  // without leaving the Lab.
  const [hoveredGlobal, setHoveredGlobal] = useState<{
    lat: number
    lng: number
    id: string
    title: string
    locationName: string | null
    category: string
    year: number | null
    slug: string | null
  } | null>(null)

  // ── Click handling ────────────────────────────────────────
  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    const feature = e.features?.[0]
    if (!feature) return
    const props = feature.properties || {}

    // Cluster: zoom in
    if (props.cluster) {
      const geometry = feature.geometry as GeoJSON.Point
      mapRef.current?.flyTo({
        center: geometry.coordinates as [number, number],
        zoom: Math.min((mapRef.current?.getMap().getZoom() || 4) + 2, MAP_BOUNDS.maxZoom),
        duration: 500,
      })
      return
    }

    // User save pin → detail panel
    if (feature.layer?.id === 'lab-point' || feature.layer?.id === 'lab-point-hit') {
      if (props.id && userMapData) {
        const entry = userMapData.entryNodes.find(n => n.id === props.id)
        if (entry) onSelectEntry(entry)
      }
      return
    }

    // Global-context report pin → open the full report in a new tab.
    // Keeps Lab in place while letting the user explore the corpus.
    if (feature.layer?.id === 'lab-global-points' && props.slug) {
      window.open(`/report/${props.slug}`, '_blank', 'noopener,noreferrer')
    }
  }, [userMapData, onSelectEntry])

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap()
    const f = e.features?.[0]
    if (!f) {
      if (map) map.getCanvas().style.cursor = ''
      setHoveredPinId(null)
      setHoveredGlobal(null)
      return
    }
    if (map) map.getCanvas().style.cursor = 'pointer'

    // User-pin hover → small highlight
    if (f.layer?.id === 'lab-point' || f.layer?.id === 'lab-point-hit') {
      if (f.properties?.id) setHoveredPinId(f.properties.id as string)
      setHoveredGlobal(null)
      return
    }

    // Global-pin hover → tooltip with report meta
    if (f.layer?.id === 'lab-global-points') {
      setHoveredPinId(null)
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number]
      const p = f.properties || {}
      const year = p.event_date ? new Date(p.event_date).getFullYear() : null
      setHoveredGlobal({
        lat: coords[1],
        lng: coords[0],
        id: p.id as string,
        title: (p.title as string) || 'Untitled report',
        locationName: (p.location_name as string) || null,
        category: (p.category as string) || 'combination',
        year: year && !isNaN(year) ? year : null,
        slug: (p.slug as string) || null,
      })
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (map) map.getCanvas().style.cursor = ''
    setHoveredPinId(null)
    setHoveredGlobal(null)
  }, [])

  // ── Fit bounds on first load ─────────────────────────────
  useEffect(() => {
    if (!mapLoaded) return
    if (hasFitBounds.current) return
    if (userPoints.length === 0) return
    const map = mapRef.current?.getMap()
    if (!map) return
    hasFitBounds.current = true
    if (userPoints.length === 1) {
      map.flyTo({ center: [userPoints[0].lng, userPoints[0].lat], zoom: 6, duration: 600 })
    } else {
      const lats = userPoints.map(p => p.lat)
      const lngs = userPoints.map(p => p.lng)
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, duration: 800, maxZoom: 7 },
      )
    }
  }, [mapLoaded, userPoints])

  // ── Empty state ───────────────────────────────────────────
  if (userPoints.length === 0 && !globalContext) {
    const totalSaves = (userMapData?.entryNodes || []).filter(e => !e.isGhost).length
    const paradocsReportSaves = (userMapData?.entryNodes || []).filter(
      e => !e.isGhost && e.sourceType !== 'external' && e.reportId,
    ).length
    return (
      <div className="relative w-full h-[60vh] sm:h-[70vh] rounded-2xl bg-gray-950 border border-gray-800 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="inline-flex p-3 bg-sky-500/10 rounded-full mb-3">
            <MapPinIcon className="w-6 h-6 text-sky-300" />
          </div>
          <h3 className="text-white font-semibold text-sm mb-1">
            {selectedCategory || selectedCaseFileId ? 'No pins match this filter' : 'No pins to show yet'}
          </h3>
          <p className="text-xs text-gray-400 leading-relaxed mb-4">
            {totalSaves === 0
              ? 'Save a Paradocs report with location data to see it here.'
              : paradocsReportSaves === 0
                ? `You have ${totalSaves} external URL save${totalSaves === 1 ? '' : 's'}. External saves don't auto-place on the map — save a Paradocs report with coordinates to see a pin.`
                : `Your ${paradocsReportSaves} Paradocs report save${paradocsReportSaves === 1 ? '' : 's'} ${paradocsReportSaves === 1 ? 'doesn\'t have coordinates' : 'don\'t have coordinates'} recorded yet.`}
          </p>
          <button
            onClick={() => setGlobalContext(true)}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
          >
            <Globe2 className="w-3 h-3" />
            Show all Paradocs reports instead
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-[60vh] sm:h-[70vh] rounded-2xl overflow-hidden border border-gray-800 bg-gray-950">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: userPoints[0]?.lng ?? -40, latitude: userPoints[0]?.lat ?? 30, zoom: 3 }}
        minZoom={MAP_BOUNDS.minZoom}
        maxZoom={MAP_BOUNDS.maxZoom}
        onLoad={() => setMapLoaded(true)}
        mapStyle={BASEMAP_STYLES[basemap]}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={
          globalContext
            ? ['lab-clusters', 'lab-point', 'lab-point-hit', 'lab-global-points']
            : ['lab-clusters', 'lab-point', 'lab-point-hit']
        }
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        attributionControl={false}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <GeolocateControl position="top-right" trackUserLocation={false} />

        {/* Hover tooltip for global-context reports. Anchored below the
            point so it doesn't cover the dot itself. */}
        {hoveredGlobal && (
          <Popup
            longitude={hoveredGlobal.lng}
            latitude={hoveredGlobal.lat}
            anchor="bottom"
            offset={10}
            closeButton={false}
            closeOnClick={false}
            className="lab-global-popup"
          >
            <div className="text-[11px] min-w-[180px] max-w-[240px]">
              <div className="text-[9px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">
                Paradocs report · click to open
              </div>
              <div className="font-semibold text-gray-900 leading-tight">{hoveredGlobal.title}</div>
              <div className="mt-1 text-gray-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {hoveredGlobal.locationName && <span>{hoveredGlobal.locationName}</span>}
                {hoveredGlobal.year && <span className="tabular-nums">· {hoveredGlobal.year}</span>}
              </div>
            </div>
          </Popup>
        )}

        {/* ── Historical wave overlays (faint polygons behind pins) ── */}
        {waveOverlays.features.length > 0 && (
          <Source id="lab-waves" type="geojson" data={waveOverlays}>
            <Layer
              id="lab-wave-fill"
              type="fill"
              paint={{
                'fill-color': '#06b6d4',
                'fill-opacity': 0.06,
              }}
            />
            <Layer
              id="lab-wave-outline"
              type="line"
              paint={{
                'line-color': '#22d3ee',
                'line-opacity': 0.3,
                'line-width': 1,
                'line-dasharray': [3, 3] as any,
              }}
            />
          </Source>
        )}

        {/* ── Global-context backdrop (all Paradocs reports as faint dots).
            Distinct look from user pins — smaller, neutral slate color,
            thin outline — so the visual priority stays on the user's own
            saves. Hover + click are wired so users can still explore the
            global corpus. The hovered dot grows and goes bright-white
            to confirm the interaction. */}
        {globalContext && <GlobalContextLoader onData={setGlobalGeoJSON} />}
        {globalContext && filteredGlobalGeoJSON && (
          <Source id="lab-global" type="geojson" data={filteredGlobalGeoJSON}>
            <Layer
              id="lab-global-points"
              type="circle"
              paint={{
                'circle-color': [
                  'case',
                  ['==', ['get', 'id'], hoveredGlobal?.id || ''],
                  '#ffffff',
                  '#94a3b8',
                ] as any,
                'circle-radius': [
                  'case',
                  ['==', ['get', 'id'], hoveredGlobal?.id || ''],
                  6,
                  ['interpolate', ['linear'], ['zoom'], 0, 2.5, 5, 3, 10, 4] as any,
                ] as any,
                'circle-opacity': heatmapActive ? 0.15 : 0.55,
                'circle-stroke-color': [
                  'case',
                  ['==', ['get', 'id'], hoveredGlobal?.id || ''],
                  '#22d3ee',
                  'rgba(255,255,255,0.35)',
                ] as any,
                'circle-stroke-width': [
                  'case',
                  ['==', ['get', 'id'], hoveredGlobal?.id || ''],
                  2,
                  0.5,
                ] as any,
              }}
            />
          </Source>
        )}

        {/* ── Density heatmap of the user's saves ── */}
        {heatmapActive && userPoints.length > 0 && (
          <Source id="lab-heat" type="geojson" data={userGeoJSON}>
            <Layer
              id="lab-heatmap"
              type="heatmap"
              paint={{
                'heatmap-weight': 1,
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 3, 10, 4] as any,
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 25, 6, 45, 10, 65] as any,
                'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 10, 0.55, 14, 0.2, 16, 0] as any,
                'heatmap-color': HEATMAP_COLORS as any,
              }}
            />
          </Source>
        )}

        {/* ── User's saved pins + clusters ── */}
        <Source
          id="lab-saves"
          type="geojson"
          data={userGeoJSON}
          cluster
          clusterRadius={50}
          clusterMaxZoom={14}
        >
          {/* Clusters */}
          <Layer
            id="lab-clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': [
                'step', ['get', 'point_count'],
                '#6366f1', 10, '#8b5cf6', 100, '#a855f7',
              ] as any,
              'circle-radius': [
                'step', ['get', 'point_count'], 16, 10, 20, 100, 26,
              ] as any,
              'circle-stroke-width': 2,
              'circle-stroke-color': 'rgba(255,255,255,0.2)',
              'circle-opacity': heatmapActive ? 0.4 : 0.95,
            }}
          />
          <Layer
            id="lab-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'] as any,
              'text-size': 12,
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': '#ffffff' }}
          />
          {/* Individual pin (halo) */}
          <Layer
            id="lab-point-halo"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': categoryColorExpr,
              'circle-radius': 14,
              'circle-opacity': 0.18,
              'circle-stroke-width': 0,
            }}
          />
          {/* Individual pin (main) */}
          <Layer
            id="lab-point"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': categoryColorExpr,
              'circle-radius': [
                'case',
                ['==', ['get', 'id'], hoveredPinId || ''],
                9,
                7,
              ] as any,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
              'circle-stroke-opacity': 0.9,
              'circle-opacity': heatmapActive ? 0.55 : 1,
            }}
          />
          {/* Transparent wider hit target for easier clicking */}
          <Layer
            id="lab-point-hit"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': '#000',
              'circle-radius': 18,
              'circle-opacity': 0,
            }}
          />
        </Source>
      </Map>

      {/* Control overlay */}
      <MapControls
        basemap={basemap}
        onBasemapChange={setBasemap}
        heatmapActive={heatmapActive}
        onHeatmapToggle={() => setHeatmapActive(v => !v)}
        globalContext={globalContext}
        onGlobalContextToggle={() => setGlobalContext(v => !v)}
        yearRangeAvailable={yearRangeAvailable}
        timelineRange={timelineRange}
        onTimelineChange={setTimelineRange}
        pinCount={userPoints.length}
        waveCount={waveOverlays.features.length}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Approximate a circle around (lat, lng) with radiusKm as a GeoJSON polygon. */
function circlePolygon(
  lat: number,
  lng: number,
  radiusKm: number,
  properties: Record<string, any>,
  segments = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = []
  const latRadius = radiusKm / 111 // rough km-per-deg latitude
  const lngRadius = radiusKm / (111 * Math.cos((lat * Math.PI) / 180))
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * 2 * Math.PI
    coords.push([lng + lngRadius * Math.cos(theta), lat + latRadius * Math.sin(theta)])
  }
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Polygon', coordinates: [coords] },
  }
}

// ─────────────────────────────────────────────────────────────────
// Map controls panel — basemap switcher, heatmap + global toggles,
// timeline scrubber. Floats in the top-left corner of the map.
// ─────────────────────────────────────────────────────────────────

interface MapControlsProps {
  basemap: BasemapKey
  onBasemapChange: (b: BasemapKey) => void
  heatmapActive: boolean
  onHeatmapToggle: () => void
  globalContext: boolean
  onGlobalContextToggle: () => void
  yearRangeAvailable: [number, number] | null
  timelineRange: [number, number] | null
  onTimelineChange: (r: [number, number] | null) => void
  pinCount: number
  waveCount: number
}

function MapControls({
  basemap, onBasemapChange,
  heatmapActive, onHeatmapToggle,
  globalContext, onGlobalContextToggle,
  yearRangeAvailable, timelineRange, onTimelineChange,
  pinCount, waveCount,
}: MapControlsProps) {
  // Default the layers panel to expanded so users can see the controls
  // immediately rather than having to discover the collapsed pill.
  const [expanded, setExpanded] = useState(true)

  const hasTimeline = !!yearRangeAvailable && yearRangeAvailable[0] !== yearRangeAvailable[1]

  return (
    <div className="absolute top-3 left-3 z-[500] flex flex-col gap-2 text-xs">
      {/* Collapsed: pill with counts + expand button */}
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/75 border border-white/15 text-gray-200 hover:bg-black/85 hover:border-white/25 backdrop-blur-sm transition-colors"
        >
          <Layers className="w-3.5 h-3.5 text-sky-300" />
          <span className="font-medium">{pinCount} pin{pinCount === 1 ? '' : 's'}</span>
          {waveCount > 0 && (
            <span className="text-cyan-300/90 text-[10px]">· {waveCount} wave{waveCount === 1 ? '' : 's'}</span>
          )}
          <span className="text-gray-500">·</span>
          <span className="text-gray-400">Layers</span>
        </button>
      ) : (
        <div className="w-64 rounded-xl bg-black/80 border border-white/15 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-300" />
              <span className="text-white font-semibold text-[11px] uppercase tracking-wider">Map layers</span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Close map layer controls"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Basemap switcher */}
          <div className="px-3 py-2.5 border-b border-white/5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5">Basemap</div>
            <div className="inline-flex items-center w-full rounded-md bg-white/[0.04] border border-white/10 p-0.5 text-[11px]">
              {(['dark', 'satellite', 'terrain'] as BasemapKey[]).map(b => (
                <button
                  key={b}
                  onClick={() => onBasemapChange(b)}
                  className={classNames(
                    'flex-1 px-2 py-1 rounded capitalize transition-colors',
                    basemap === b ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-gray-200',
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="px-3 py-2 space-y-1.5 border-b border-white/5">
            <ToggleRow
              label="Density heatmap"
              hint="Concentration of your saves"
              icon={Flame}
              active={heatmapActive}
              onToggle={onHeatmapToggle}
            />
            <ToggleRow
              label="Global-context backdrop"
              hint="All Paradocs reports as faint dots"
              icon={Globe2}
              active={globalContext}
              onToggle={onGlobalContextToggle}
            />
          </div>

          {/* Timeline scrubber */}
          {hasTimeline && (
            <div className="px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-violet-300" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Timeline</span>
                </div>
                {timelineRange && (
                  <button
                    onClick={() => onTimelineChange(null)}
                    className="text-[10px] text-gray-500 hover:text-white transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
              <TimelineSlider
                min={yearRangeAvailable![0]}
                max={yearRangeAvailable![1]}
                value={timelineRange ?? yearRangeAvailable!}
                onChange={onTimelineChange}
              />
            </div>
          )}

          {/* Legend / hint */}
          {waveCount > 0 && (
            <div className="px-3 py-2 bg-cyan-500/5 border-t border-cyan-500/15 text-[10px] text-cyan-200/90 flex items-center gap-1.5">
              <MapIcon className="w-3 h-3 flex-shrink-0" />
              <span>Cyan dashed rings = historical wave footprints you have saves inside.</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToggleRow({
  label, hint, icon: Icon, active, onToggle,
}: {
  label: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={classNames(
        'w-full flex items-start gap-2 px-2 py-1.5 rounded-md transition-colors text-left',
        active ? 'bg-sky-500/10' : 'hover:bg-white/[0.04]',
      )}
      role="switch"
      aria-checked={active}
    >
      <Icon className={classNames('w-3.5 h-3.5 mt-0.5 flex-shrink-0', active ? 'text-sky-300' : 'text-gray-500')} />
      <div className="flex-1 min-w-0">
        <div className={classNames('text-[11px] font-medium', active ? 'text-white' : 'text-gray-300')}>
          {label}
        </div>
        <div className="text-[10px] text-gray-500 leading-tight">{hint}</div>
      </div>
      <div
        className={classNames(
          'mt-0.5 w-7 h-4 rounded-full flex-shrink-0 relative transition-colors',
          active ? 'bg-sky-500/80' : 'bg-white/10',
        )}
      >
        <div
          className={classNames(
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all',
            active ? 'left-3.5' : 'left-0.5',
          )}
        />
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// TimelineSlider — dual-thumb range slider on a single track
// ─────────────────────────────────────────────────────────────────

function TimelineSlider({
  min, max, value, onChange,
}: {
  min: number
  max: number
  value: [number, number]
  onChange: (v: [number, number]) => void
}) {
  const [lo, hi] = value
  return (
    <div className="space-y-1">
      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-white/10" />
        <div
          className="absolute h-1 rounded-full bg-violet-400/70"
          style={{
            left: `${((lo - min) / Math.max(1, max - min)) * 100}%`,
            right: `${(1 - (hi - min) / Math.max(1, max - min)) * 100}%`,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={lo}
          onChange={e => {
            const next = Math.min(Number(e.target.value), hi)
            onChange([next, hi])
          }}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-violet-500 [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={hi}
          onChange={e => {
            const next = Math.max(Number(e.target.value), lo)
            onChange([lo, next])
          }}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-violet-500 [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-400 tabular-nums">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// GlobalContextLoader — only mounts (and therefore only fires the
// viewport-data fetch) when the user turns on the global backdrop.
// Keeping useViewportData call off the main component means the Lab
// map doesn't pay the network cost for users who never toggle it.
// ─────────────────────────────────────────────────────────────────

function GlobalContextLoader({ onData }: { onData: (d: GeoJSON.FeatureCollection | null) => void }) {
  // Use DEFAULT_FILTERS so the hook's internal field reads match the
  // MapFilters shape exactly — previously we passed a shape from a
  // different draft of the hook (cast as any), which silently resulted
  // in an empty fetch or broken filter predicates and the backdrop
  // never populated.
  const vp = useViewportData(DEFAULT_FILTERS, null, 2)
  useEffect(() => {
    onData(vp.allPointsGeoJSON || null)
  }, [vp.allPointsGeoJSON, onData])
  return null
}
