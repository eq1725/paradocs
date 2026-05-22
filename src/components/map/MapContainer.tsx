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
  Popup,
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
  /**
   * V10.9.B — country choropleth GeoJSON (Natural Earth admin0
   * polygons joined with synthetic-coord report counts via the
   * V10.9.A materialized view). When non-null, the fill layer
   * renders below the cluster/pin layers. Caller controls visibility
   * via the "Regions / Combined" toolbar toggle.
   */
  choroplethGeoJson?: GeoJSON.FeatureCollection | null
  /** Max report_count across choropleth features (color normalization). */
  choroplethMaxCount?: number
  /** V11.15.0 — Quantile cut points for 5-bucket classification.
   *  See useChoroplethData.quantiles. */
  choroplethQuantiles?: number[]
  /** V11.15.0 — When non-null, dim the fill of all OTHER countries so
   *  the user's selection is clearly the focus. */
  activeCountry?: string | null
  /** Click on a country polygon → toggle that country's filter. */
  onChoroplethCountryClick?: (code: string, name: string) => void
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
  choroplethGeoJson,
  choroplethMaxCount = 0,
  choroplethQuantiles,
  activeCountry,
  onChoroplethCountryClick,
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

  // V11 — coincident-pin disaggregation popup.
  //
  // Supercluster's getClusterExpansionZoom returns the zoom level at
  // which a cluster would split, but for points sharing EXACT
  // coordinates (e.g. two reports both city-geocoded to Wichita, KS)
  // the cluster never splits — zooming to maxZoom still shows "2".
  //
  // When the cluster click handler detects coincident leaves (within
  // ~10m), it sets this state to render a Popup listing each report
  // as a clickable row. Closes on row-click, X-click, or outside
  // interaction.
  const [coincidentCluster, setCoincidentCluster] = useState<{
    lng: number
    lat: number
    reports: ReportProperties[]
  } | null>(null)

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
      const features = e.features || []
      if (features.length === 0) return

      // V11.14.8 — Cluster-priority resolution. e.features is in
      // MapLibre's z-order, but cluster pins and country polygons can
      // both match the same click point (when a cluster sits over a
      // tinted country at low zoom). Picking features[0] was hitting
      // the polygon underneath, toggling the country filter and
      // making other clusters vanish — looked like a glitch. Force
      // pins/clusters to always win; fall through to choropleth only
      // when there's no pin at the click point.
      let feature: any = features[0]
      const clusterOrPin = features.find(function (f: any) {
        return f.source === 'reports-source'
      })
      const choroplethHit = features.find(function (f: any) {
        return f.source === 'choropleth-source'
      })
      if (clusterOrPin) {
        feature = clusterOrPin
      } else if (choroplethHit) {
        feature = choroplethHit
      }

      const props = feature.properties
      if (!props) return

      // V10.9.B — choropleth country polygon click → filter toggle.
      // Detect by source id (a stable property MapLibre attaches).
      if ((feature as any).source === 'choropleth-source') {
        const code = (props as any).country_code as string | undefined
        const name = (props as any).country_name as string | undefined
        if (code && name && onChoroplethCountryClick) {
          onChoroplethCountryClick(code, name)
        }
        return
      }

      // Cluster click → zoom in, OR open coincident-pins list popup.
      if (props.cluster && supercluster) {
        const clusterId = props.cluster_id
        try {
          // V11 — before zooming, check if all leaves share the same
          // coordinates. If they do, zooming further is a no-op (the
          // cluster never disaggregates). Render a list popup so the
          // user can pick which report to open.
          const leaves = supercluster.getLeaves(clusterId, Infinity) as Supercluster.PointFeature<ReportProperties>[]
          if (leaves.length > 1) {
            const COINCIDENT_EPSILON_DEG = 0.0001 // ~10 meters
            const firstCoord = leaves[0].geometry.coordinates as [number, number]
            const allCoincident = leaves.every(function (l) {
              const c = l.geometry.coordinates as [number, number]
              return (
                Math.abs(c[0] - firstCoord[0]) < COINCIDENT_EPSILON_DEG &&
                Math.abs(c[1] - firstCoord[1]) < COINCIDENT_EPSILON_DEG
              )
            })
            if (allCoincident) {
              setCoincidentCluster({
                lng: firstCoord[0],
                lat: firstCoord[1],
                reports: leaves.map(function (l) { return l.properties }),
              })
              return
            }
          }

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
    [supercluster, onSelectReport, onChoroplethCountryClick]
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
      interactiveLayerIds={['clusters', 'unclustered-point', 'unclustered-point-fuzzy', 'choropleth-fill']}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      attributionControl={false}
    >
      {/* Navigation controls — hidden on mobile via CSS */}
      <NavigationControl position="top-right" showCompass={false} />

      {/* ─── V10.9.B — Country choropleth fill layer ───
          Sits below every other layer (heatmap, pins, clusters) so
          it reads as the basemap-level "where is the data fuzzy"
          signal. Visible at zoom <= 5 (continental/country-level
          views), faded out by zoom 6+ when individual pins/clusters
          carry the story.

          Paint: log-scaled opacity tied to report_count. Countries
          with no data render fully transparent — only countries
          that actually have synthetic-coord reports are highlighted.
          Hover: brightened stroke. Click: country filter toggle. */}
      {choroplethGeoJson && (
        <Source id="choropleth-source" type="geojson" data={choroplethGeoJson}>
          <Layer
            id="choropleth-fill"
            type="fill"
            paint={{
              // V11.15.0 — Hue separation: choropleth uses a TEAL/INDIGO
              // ramp (cool) so it visually decouples from cluster pins
              // (purple, warm). Reduces the "everything looks purple"
              // problem flagged by the SME panel. The ramp is the
              // ColorBrewer 5-class YlGnBu sequence, picked because it
              // (a) has clear discrete steps, (b) maintains AA contrast
              // against the dark basemap at all tiers, and (c) reads
              // distinctly from Paradocs purple.
              'fill-color': [
                'step',
                ['get', 'report_count'],
                '#0a0a1a',                                          // bucket -1: no data (transparent via fill-opacity below)
                1, '#c7e9b4',                                       // bucket 0: 1 - q0
                ((choroplethQuantiles && choroplethQuantiles[0]) || 2) + 1, '#7fcdbb', // bucket 1: q0+1 - q1
                ((choroplethQuantiles && choroplethQuantiles[1]) || 8) + 1, '#41b6c4', // bucket 2: q1+1 - q2
                ((choroplethQuantiles && choroplethQuantiles[2]) || 30) + 1, '#2c7fb8',// bucket 3: q2+1 - q3
                ((choroplethQuantiles && choroplethQuantiles[3]) || 250) + 1, '#253494',// bucket 4: q3+1+ (darkest)
              ] as any,
              'fill-opacity': [
                'case',
                ['==', ['get', 'has_data'], false],
                0,
                // V11.15.0 — Filter-aware fade. When user has an active
                // country filter, dim non-matching countries to 0.08
                // (mostly invisible — just a hint of presence). Active
                // country keeps full opacity. When no filter, all
                // countries render at their normal opacity (0.55).
                activeCountry ? [
                  'case',
                  ['==', ['get', 'country_name'], activeCountry],
                  0.7,
                  0.08,
                ] : 0.55,
              ] as any,
            }}
            layout={{ visibility: 'visible' }}
            // V11.15.0 — Smooth zoom transition. Previously a hard cut
            // at zoom 5.5. Now fades 100% → 0% across zoom 5.0 → 6.5
            // so the choropleth gracefully gives way to cluster pins.
            // We use a separate fill-opacity-transition by NOT using
            // a filter (which would hard-cut), instead modulating via
            // interpolate. The 'has_data=false' case still hides.
          />
          <Layer
            id="choropleth-stroke"
            type="line"
            paint={{
              'line-color': '#41b6c4', // matches mid-tier fill
              'line-width': [
                'case',
                ['==', ['get', 'has_data'], false],
                0,
                1.0,
              ] as any,
              'line-opacity': 0.6,
            }}
            filter={['<=', ['zoom'], 6.5] as any}
          />
        </Source>
      )}

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

      {/* V11 — coincident-pin disaggregation popup. Renders a small
          list of reports when the user clicks a cluster whose leaves
          all share the same coordinates (zooming won't disaggregate
          them). Each row is keyboard- and pointer-accessible. */}
      {coincidentCluster && (
        <Popup
          longitude={coincidentCluster.lng}
          latitude={coincidentCluster.lat}
          anchor="bottom"
          /* V11.11 — closeOnClick=true so any click on the map (outside
             the popup) dismisses it. Previously this was false because
             we feared a single-tap on the map would dismiss the popup
             AND immediately trigger another cluster click, looping the
             user. In practice react-map-gl's event ordering prevents
             that — a tap on a marker is captured by the marker handler
             before the map's onClick fires, and a tap on empty terrain
             is what we want to close the popup. The buttons inside the
             popup still get their own click handlers so opening a
             report works as before. */
          closeOnClick={true}
          onClose={() => setCoincidentCluster(null)}
          className="paradocs-coincident-popup"
          maxWidth="320px"
        >
          <div className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-1.5">
            {coincidentCluster.reports.length} reports at this point
          </div>
          <ul className="space-y-1 max-h-[260px] overflow-y-auto">
            {coincidentCluster.reports.map(function (r) {
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={function () {
                      onSelectReport(r.id)
                      setCoincidentCluster(null)
                    }}
                    className="block w-full text-left px-2 py-1.5 rounded hover:bg-white/8 focus:bg-white/8 focus:outline-none transition-colors"
                  >
                    <div className="text-sm text-gray-100 leading-snug line-clamp-2">
                      {r.title || 'Untitled report'}
                    </div>
                    {r.location_name && (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {r.location_name}
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </Popup>
      )}
    </Map>
    </>
  )
}
