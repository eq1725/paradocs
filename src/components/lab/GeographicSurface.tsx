'use client'

// V11.17.69 - Tier 2B
//
// GeographicSurface — the embedded MapLibre map per
// LAB_PANEL_REVIEW_V3 §3 first-session walkthrough.
//
// This is NOT the RADAR (which is the abstract / categorical lens —
// see RadarSurface). This is a REAL geographic map centered on the
// user's experience location, with archive reports of the same
// phen-family overlaid as dots.
//
// Three data lines render beneath the map (V3 §3 + V2 §3 contract):
//   - "Within 50 miles of your account: 14 related reports."
//   - "The closest in time and place: July 14, 1998, eleven miles east."
//   - "Reports cluster on a roughly NW-SE corridor along US-74." [only
//      when a real corridor is detected; otherwise suppressed]
//
// Gating philosophy (V3 §2): the surface renders at n=1 for every tier.
// Depth gates:
//   - Free: 50-mile fixed ring, 3 prose lines.
//   - Basic: configurable radius (10/50/200/500), adjacent-state view.
//     [Slot present in JSX; wire-up deferred to Tier 3 along with the
//      radius-control RPC.]
//   - Pro: county-level density, KML export. [Slot present; deferred.]
//
// MapLibre boilerplate cribbed from WorldMapBackdrop.tsx so this
// component inherits the V11.17.41 hydration-recovery + 0×0-container
// guards already proven in production.

import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapPin } from 'lucide-react'

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || ''
const MAP_STYLE = MAPTILER_KEY
  ? 'https://api.maptiler.com/maps/streets-v2-dark/style.json?key=' + MAPTILER_KEY
  : ''

interface NearbyReport {
  id: string
  slug?: string
  title?: string
  latitude: number
  longitude: number
  /** Distance from user in miles (haversine, computed at fetch time). */
  distance_mi?: number
  /** ISO event date if available. */
  event_date?: string | null
  /** Human-readable city/state for the closest-in-time line. */
  location_label?: string
}

interface GeographicSurfaceProps {
  /** User's experience latitude. */
  userLat: number | null
  /** User's experience longitude. */
  userLng: number | null
  /** Human-readable label for the user's location, e.g. "Lumberton, NC". */
  userLocationLabel: string
  /** Default search radius — miles. Per V3 §2, Free tier is 50mi. */
  radiusMiles?: number
  /**
   * Nearby reports already filtered to the same phen-family and within
   * radius. The parent owns the query; this component just renders.
   * Pass `null` while the query is in flight; `[]` for "no nearby".
   */
  nearbyReports: NearbyReport[] | null
  /**
   * Human-readable phen family label for the prose lines, e.g.
   * "triangle UFO reports" or "related reports".
   */
  phenFamilyLabel: string
  /**
   * Optional detected corridor sentence. When present, renders as the
   * third data line. Per V3 §3: "Reports cluster on a roughly NW-SE
   * corridor along US-74." — DO NOT fabricate; suppress when null.
   */
  corridorSentence?: string | null
  /** Tier of the current viewer — gates depth-add affordances. */
  tier?: 'free' | 'basic' | 'pro' | null
}

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  var R = 3959
  var dLat = (lat2 - lat1) * Math.PI / 180
  var dLng = (lng2 - lng1) * Math.PI / 180
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingDirection(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  var dLng = (toLng - fromLng) * Math.PI / 180
  var lat1 = fromLat * Math.PI / 180
  var lat2 = toLat * Math.PI / 180
  var y = Math.sin(dLng) * Math.cos(lat2)
  var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  var deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
  if (deg < 22.5 || deg >= 337.5) return 'north'
  if (deg < 67.5) return 'northeast'
  if (deg < 112.5) return 'east'
  if (deg < 157.5) return 'southeast'
  if (deg < 202.5) return 'south'
  if (deg < 247.5) return 'southwest'
  if (deg < 292.5) return 'west'
  return 'northwest'
}

function formatEventDate(iso: string | null | undefined): string {
  if (!iso) return ''
  var d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear()
}

export default function GeographicSurface(props: GeographicSurfaceProps) {
  var containerRef = useRef<HTMLDivElement | null>(null)
  var mapRef = useRef<maplibregl.Map | null>(null)
  var disposeRef = useRef<(() => void) | null>(null)
  var [mapReady, setMapReady] = useState(false)
  var radius = props.radiusMiles || 50

  // Init the map — same pattern as WorldMapBackdrop (proven against
  // hydration recovery + 0×0 containers).
  useEffect(function () {
    var el = containerRef.current
    if (!el) return
    if (!MAPTILER_KEY) {
      console.warn('[GeographicSurface] NEXT_PUBLIC_MAPTILER_KEY missing — map will not render')
      return
    }
    // No-op fast path: map already attached to the current container.
    if (mapRef.current && mapRef.current.getContainer() === el) return
    if (disposeRef.current) { try { disposeRef.current() } catch (_e) { /* ignore */ } disposeRef.current = null }
    if (mapRef.current) { try { mapRef.current.remove() } catch (_e) { /* ignore */ } mapRef.current = null }

    var disposed = false
    var resizeObserver: ResizeObserver | null = null
    var initWatcher: ResizeObserver | null = null
    var fallbackTimer: ReturnType<typeof setTimeout> | null = null

    function initMap() {
      if (disposed) return
      if (mapRef.current) return
      if (!containerRef.current) return
      try {
        // If the user has a known location, center there; else fall
        // back to a continental US view (the mass-market default).
        var center: [number, number] = (props.userLat != null && props.userLng != null)
          ? [props.userLng, props.userLat]
          : [-97, 39]
        var zoom = (props.userLat != null && props.userLng != null) ? 7.2 : 3.5
        var map = new maplibregl.Map({
          container: containerRef.current,
          style: MAP_STYLE,
          center: center,
          zoom: zoom,
          attributionControl: false,
          interactive: true,
          dragPan: true,
          scrollZoom: false,
          doubleClickZoom: true,
          touchPitch: false,
        })
        mapRef.current = map
        map.on('load', function () {
          if (disposed) return
          setMapReady(true)
        })
        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
          resizeObserver = new ResizeObserver(function () {
            try { map.resize() } catch (_e) { /* ignore */ }
          })
          resizeObserver.observe(containerRef.current)
        }
        requestAnimationFrame(function () { try { map.resize() } catch (_e) { /* ignore */ } })
      } catch (e) {
        console.warn('[GeographicSurface] maplibre init failed:', e)
      }
    }

    if (el.clientWidth > 0 && el.clientHeight > 0) {
      initMap()
    } else if (typeof ResizeObserver !== 'undefined') {
      initWatcher = new ResizeObserver(function (entries) {
        if (mapRef.current) return
        for (var i = 0; i < entries.length; i++) {
          var w = entries[i].contentRect.width
          var h = entries[i].contentRect.height
          if (w > 0 && h > 0) {
            try { if (initWatcher) initWatcher.disconnect() } catch (_e) { /* ignore */ }
            initMap()
            return
          }
        }
      })
      initWatcher.observe(el)
      fallbackTimer = setTimeout(function () { if (!mapRef.current) initMap() }, 1000)
    } else {
      fallbackTimer = setTimeout(initMap, 100)
    }

    disposeRef.current = function () {
      disposed = true
      if (resizeObserver) { try { resizeObserver.disconnect() } catch (_e) { /* ignore */ } }
      if (initWatcher) { try { initWatcher.disconnect() } catch (_e) { /* ignore */ } }
      if (fallbackTimer !== null) { clearTimeout(fallbackTimer) }
    }
  })

  // Final unmount cleanup.
  useEffect(function () {
    return function () {
      if (disposeRef.current) { try { disposeRef.current() } catch (_e) { /* ignore */ } disposeRef.current = null }
      if (mapRef.current) { try { mapRef.current.remove() } catch (_e) { /* ignore */ } mapRef.current = null }
    }
  }, [])

  // Update user marker + nearby markers + radius ring when data lands.
  useEffect(function () {
    var map: maplibregl.Map | null = mapRef.current
    if (!map || !mapReady) return
    var m: maplibregl.Map = map
    // Drop existing layers + sources we own (idempotent).
    var layers = ['paradocs-radius-ring', 'paradocs-nearby-dots']
    layers.forEach(function (id) {
      try { if (m.getLayer(id)) m.removeLayer(id) } catch (_e) { /* ignore */ }
    })
    var sources = ['paradocs-radius-ring-src', 'paradocs-nearby-src']
    sources.forEach(function (id) {
      try { if (m.getSource(id)) m.removeSource(id) } catch (_e) { /* ignore */ }
    })

    // Radius ring (rough approximation — circle in lng/lat space).
    if (props.userLat != null && props.userLng != null) {
      var ringCoords: [number, number][] = []
      var steps = 64
      // 1 degree latitude ≈ 69 miles; longitude scales by cos(lat).
      var latDelta = radius / 69
      var lngDelta = radius / (69 * Math.cos(props.userLat * Math.PI / 180))
      for (var i = 0; i <= steps; i++) {
        var theta = (i / steps) * 2 * Math.PI
        ringCoords.push([
          props.userLng + lngDelta * Math.cos(theta),
          props.userLat + latDelta * Math.sin(theta),
        ])
      }
      try {
        m.addSource('paradocs-radius-ring-src', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ringCoords] }, properties: {} },
        })
        m.addLayer({
          id: 'paradocs-radius-ring',
          type: 'fill',
          source: 'paradocs-radius-ring-src',
          paint: { 'fill-color': '#9000F0', 'fill-opacity': 0.08, 'fill-outline-color': '#c4b5fd' },
        })
      } catch (e) { console.warn('[GeographicSurface] ring add failed', e) }
    }

    // Nearby reports as dots.
    if (props.nearbyReports && props.nearbyReports.length > 0) {
      try {
        m.addSource('paradocs-nearby-src', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: props.nearbyReports.map(function (r) {
              return {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [r.longitude, r.latitude] },
                properties: { id: r.id, title: r.title || '' },
              }
            }),
          },
        })
        m.addLayer({
          id: 'paradocs-nearby-dots',
          type: 'circle',
          source: 'paradocs-nearby-src',
          paint: {
            'circle-radius': 4,
            'circle-color': '#c4b5fd',
            'circle-stroke-color': '#9000F0',
            'circle-stroke-width': 1,
            'circle-opacity': 0.85,
          },
        })
      } catch (e) { console.warn('[GeographicSurface] dots add failed', e) }
    }

    // Recenter on the user's point when it changes.
    if (props.userLat != null && props.userLng != null) {
      try {
        m.flyTo({ center: [props.userLng, props.userLat], zoom: 7.2, duration: 600 })
      } catch (_e) { /* ignore */ }
    }
  }, [mapReady, props.userLat, props.userLng, props.nearbyReports, radius])

  // Prose lines.
  var loading = props.nearbyReports === null
  var nearby = props.nearbyReports || []
  var nearbyCount = nearby.length
  var hasLocation = props.userLat != null && props.userLng != null

  // Closest-in-time-and-place line. Pick the smallest combined
  // distance / temporal-rank ordering — we approximate by minimum
  // distance for the MVP (temporal weight TODO in Tier 3 with the
  // multi-signal fingerprint refactor).
  var closest: NearbyReport | null = null
  if (hasLocation && nearby.length > 0) {
    var sorted = nearby.slice().sort(function (a, b) {
      var da = a.distance_mi != null ? a.distance_mi : haversineMi(props.userLat as number, props.userLng as number, a.latitude, a.longitude)
      var db = b.distance_mi != null ? b.distance_mi : haversineMi(props.userLat as number, props.userLng as number, b.latitude, b.longitude)
      return da - db
    })
    closest = sorted[0]
  }

  return (
    <section
      aria-label="Geographic context — where else this kind of account has been recorded"
      className="rounded-2xl border border-gray-800/60 bg-gray-950/40 overflow-hidden"
    >
      <div className="flex items-baseline justify-between gap-2 px-4 sm:px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-3 h-3 text-purple-300" />
          <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-purple-300">
            Geographic context
          </span>
        </div>
        <span className="text-[10px] text-gray-500">
          {hasLocation ? radius + '-mile ring around ' + props.userLocationLabel : 'no location on this account'}
        </span>
      </div>

      {/* Embedded map */}
      <div
        className="relative h-[220px] sm:h-[260px] border-y border-gray-800/60"
        style={{ background: '#0d1c2e' }}
      >
        <div
          ref={containerRef}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>

      {/* Prose lines — V3 §3 contract */}
      <div className="px-4 sm:px-5 py-4 space-y-2">
        {!hasLocation ? (
          <p className="text-sm text-gray-300 leading-relaxed">
            Add a location to your account and we&rsquo;ll set it against the
            wider Archive&rsquo;s geography for {props.phenFamilyLabel}.
          </p>
        ) : loading ? (
          <p className="text-sm text-gray-400 leading-relaxed">
            Computing nearby reports within {radius} miles&hellip;
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-200 leading-relaxed">
              Within{' '}
              <span className="font-semibold text-purple-200">{radius} miles</span>
              {' '}of your account:{' '}
              <span className="font-semibold text-purple-200">
                {nearbyCount} {nearbyCount === 1 ? 'related report' : 'related reports'}
              </span>
              .
            </p>
            {closest && (
              <p className="text-sm text-gray-200 leading-relaxed">
                The closest in time and place:{' '}
                {formatEventDate(closest.event_date)
                  ? <><span className="font-semibold text-purple-200">{formatEventDate(closest.event_date)}</span>{', '}</>
                  : null}
                <span className="font-semibold text-purple-200">
                  {closest.distance_mi != null
                    ? Math.round(closest.distance_mi)
                    : Math.round(haversineMi(props.userLat as number, props.userLng as number, closest.latitude, closest.longitude))}
                  {' miles '}
                  {bearingDirection(props.userLat as number, props.userLng as number, closest.latitude, closest.longitude)}
                </span>
                {closest.location_label ? <> &mdash; {closest.location_label}</> : null}.
              </p>
            )}
            {props.corridorSentence ? (
              <p className="text-sm text-gray-200 leading-relaxed">
                {props.corridorSentence}
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* Tier-depth affordance */}
      {props.tier === 'free' && hasLocation && (
        <p className="text-[11px] text-gray-500 px-4 sm:px-5 pb-4 leading-relaxed">
          Basic adds configurable radius (10/50/200/500 mi) and adjacent-state
          views; Pro adds county-level density and KML export.
        </p>
      )}
    </section>
  )
}
