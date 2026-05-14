'use client'

/**
 * ReportLocationMap — V10.9.D.13 imperative-marker rewrite
 *
 * Purpose-built map for the top of the report page. Renders a
 * brand-purple pin/halo at the report's location with a pulsing
 * animation, plus a region label tag in the top-left corner.
 *
 * History worth keeping in mind:
 *   - V10.4 / V10.7 used react-map-gl's <Marker> JSX wrapper.
 *   - V10.9.D.10 switched dynamic→static imports trying to fix
 *     "Marker silently doesn't render" but the markers STILL didn't
 *     paint on production (NOLA halo never appeared even with the
 *     overlay badge moved out of the way). Something in the
 *     react-map-gl + Next.js dynamic-loading + SSR boundary is
 *     dropping Marker registration.
 *   - V10.9.D.13 (this rev) bypasses react-map-gl's Marker entirely
 *     and uses maplibre-gl's imperative `new maplibregl.Marker()`
 *     API directly. Markers are vanilla DOM elements created in a
 *     useEffect after the map loads. No React-lifecycle issues, no
 *     SSR boundary concerns. Bulletproof.
 *
 * Design rules per Chase's V10.9.D.12 review:
 *   1. EVERY report page shows a marker at the location.
 *   2. The marker pulses (animate-ping or equivalent CSS).
 *   3. EVERY report page shows the region label as a tag in the
 *      top-left corner — separate from the marker so they never
 *      overlap.
 *   4. Map zooms to the precision-appropriate level (street/city
 *      for exact coords, state-fit for state centroids, country-fit
 *      for country-only).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapPin } from 'lucide-react'
import { getSyntheticFitZoom } from '@/lib/ingestion/utils/location-zoom'

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || ''
const MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`
  : ''

export type LocationPrecision =
  | 'exact'      // lat/lng accurate to within a city block
  | 'city'       // city-level precision
  | 'region'     // state / province / county
  | 'country'    // country-only
  | 'unknown'

export interface NearbyReportPin {
  id: string
  slug: string
  title: string
  category: string | null
  latitude: number
  longitude: number
  distance_km: number
}

export interface ReportLocationMapProps {
  latitude?: number | null
  longitude?: number | null
  precision?: LocationPrecision
  regionLabel?: string | null
  pinLabel?: string | null
  height?: number
  className?: string
  nearby?: NearbyReportPin[]
  nearbyHref?: string
  coordsSynthetic?: boolean
  countryCode?: string | null
  stateKey?: string | null
}

export default function ReportLocationMap({
  latitude,
  longitude,
  precision = 'city',
  regionLabel,
  pinLabel,
  height = 240,
  className,
  nearby,
  nearbyHref,
  coordsSynthetic,
  countryCode,
  stateKey,
}: ReportLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const focalMarkerRef = useRef<maplibregl.Marker | null>(null)
  const nearbyMarkersRef = useRef<maplibregl.Marker[]>([])

  // ── Validity gates ─────────────────────────────────────────
  const hasUsableCoords =
    typeof latitude === 'number' && typeof longitude === 'number' &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180

  const showPin = hasUsableCoords && (precision === 'exact' || precision === 'city') && !coordsSynthetic
  const effectiveNearby = coordsSynthetic ? [] : (nearby || [])

  // ── Target zoom ────────────────────────────────────────────
  const syntheticZoom = getSyntheticFitZoom({
    precision,
    coords_synthetic: !!coordsSynthetic,
    countryCode,
    stateKey,
  })
  const precisionDefaultZoom =
    precision === 'exact'   ? 11 :
    precision === 'city'    ? 10 :
    precision === 'region'  ? 6  :
    precision === 'country' ? 4  : 2
  const targetZoom = syntheticZoom !== null
    ? syntheticZoom
    : (effectiveNearby.length > 0 ? Math.max(7, precisionDefaultZoom - 2) : precisionDefaultZoom)

  // ── Initialize the map ONCE ────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !MAPTILER_KEY) return
    if (mapRef.current) return // already initialized

    const initialZoom = hasUsableCoords ? Math.max(2, targetZoom - 4) : 1.5
    const center: [number, number] = hasUsableCoords ? [longitude!, latitude!] : [0, 20]

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center,
      zoom: initialZoom,
      attributionControl: false,
      interactive: false,
      dragPan: false,
      dragRotate: false,
      scrollZoom: false,
      doubleClickZoom: false,
      touchPitch: false,
    })
    mapRef.current = map

    return () => {
      // Cleanup nearby markers + focal marker before destroying map
      nearbyMarkersRef.current.forEach(m => m.remove())
      nearbyMarkersRef.current = []
      if (focalMarkerRef.current) {
        focalMarkerRef.current.remove()
        focalMarkerRef.current = null
      }
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // initialize once; subsequent effects update markers/zoom

  // ── flyTo the target zoom after the map loads ──────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !hasUsableCoords) return

    let cancelled = false
    function doFly() {
      if (cancelled || !map) return
      try {
        map.flyTo({
          center: [longitude!, latitude!],
          zoom: targetZoom,
          duration: 1500,
          essential: true,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
        })
      } catch (e) {
        // ignore — map may not be ready yet
      }
    }

    if (map.loaded()) {
      // Map is already loaded — fly immediately after a tiny delay so
      // the user sees the transition from initial zoom.
      setTimeout(doFly, 200)
    } else {
      map.once('load', () => setTimeout(doFly, 200))
    }

    return () => { cancelled = true }
  }, [latitude, longitude, hasUsableCoords, targetZoom])

  // ── Imperative focal marker (PinSprite OR SyntheticHalo) ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !hasUsableCoords) return

    const attach = (m: maplibregl.Map) => {
      // Remove any prior marker
      if (focalMarkerRef.current) {
        focalMarkerRef.current.remove()
        focalMarkerRef.current = null
      }

      const el = showPin
        ? buildPinSpriteElement()
        : (coordsSynthetic ? buildSyntheticHaloElement(precision) : null)
      if (!el) return

      const marker = new maplibregl.Marker({
        element: el,
        anchor: showPin ? 'bottom' : 'center',
      })
        .setLngLat([longitude!, latitude!])
        .addTo(m)
      focalMarkerRef.current = marker
    }

    if (map.loaded()) attach(map)
    else map.once('load', () => attach(map))
  }, [latitude, longitude, hasUsableCoords, showPin, coordsSynthetic, precision])

  // ── Imperative nearby markers ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const attach = (m: maplibregl.Map) => {
      // Clear previous
      nearbyMarkersRef.current.forEach(mk => mk.remove())
      nearbyMarkersRef.current = []
      if (!showPin) return // no nearby overlay when synthetic

      for (const n of effectiveNearby) {
        const el = buildNearbyDotElement(n.slug, n.title, n.distance_km)
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([n.longitude, n.latitude])
          .addTo(m)
        nearbyMarkersRef.current.push(marker)
      }
    }

    if (map.loaded()) attach(map)
    else map.once('load', () => attach(map))
    // Don't return a cleanup that removes markers per-run — clearing
    // is done inside `attach` so re-runs replace prior markers cleanly.
  }, [effectiveNearby, showPin])

  // ── Render container + region label overlay ────────────────
  const wrapperStyle = className && /\bh-/.test(className) ? undefined : { height }

  if (!hasUsableCoords) {
    return (
      <div
        className={'relative w-full bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900 border-b border-gray-800 flex items-center justify-center ' + (className || '')}
        style={wrapperStyle}
      >
        <RegionBadge label={regionLabel || 'Location unknown'} />
      </div>
    )
  }

  if (!MAPTILER_KEY) {
    return (
      <div
        className={'relative w-full overflow-hidden border-b border-gray-800 bg-gray-950 ' + (className || '')}
        style={wrapperStyle}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <RegionBadge label={regionLabel || pinLabel || 'Location'} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={'relative w-full overflow-hidden border-b border-gray-800 bg-gray-950 ' + (className || '')}
      style={wrapperStyle}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Region label tag — top-left corner. Always rendered when we
          have a label, regardless of pin/halo behavior. Sits in a
          consistent position on every report page. */}
      {regionLabel && (
        <div className="absolute top-3 left-3 z-10 pointer-events-none">
          <RegionBadge label={regionLabel} />
        </div>
      )}

      {/* Bottom scrim for legibility */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-12 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(10,10,20,0.85) 0%, transparent 100%)' }}
      />
    </div>
  )
}

// ── DOM element builders ─────────────────────────────────────
//
// These return raw DOM elements that maplibre-gl Marker can render
// directly. No React lifecycle = no react-map-gl wrapper bugs.
//
// Inline styles preferred over className for the visual layers
// because Tailwind's JIT may not pick up classes used only inside
// useEffect — inline styles render reliably regardless.

function buildPinSpriteElement(): HTMLDivElement {
  const root = document.createElement('div')
  root.style.cssText =
    'position:relative;width:26px;height:26px;display:flex;align-items:flex-end;justify-content:center;pointer-events:none;'

  // Outer animated pulse ring — Tailwind's animate-ping uses
  // @keyframes ping (defined in Tailwind's preflight CSS) so the
  // class works on any element, even one created imperatively.
  const pulse = document.createElement('span')
  pulse.className = 'animate-ping'
  pulse.style.cssText =
    'position:absolute;width:56px;height:56px;left:-15px;top:-15px;' +
    'border-radius:9999px;background:#c084fc;opacity:0.7;' +
    'animation-duration:2s;'
  root.appendChild(pulse)

  // Static halo glow — visible in still frames
  const halo = document.createElement('span')
  halo.style.cssText =
    'position:absolute;width:44px;height:44px;left:-9px;top:-9px;' +
    'border-radius:9999px;' +
    'background:radial-gradient(circle, rgba(168,85,247,0.55) 0%, rgba(168,85,247,0) 70%);'
  root.appendChild(halo)

  // Inner pin — solid brand purple with white border + glow shadow
  const pin = document.createElement('span')
  pin.style.cssText =
    'position:absolute;width:26px;height:26px;left:0;top:0;' +
    'border-radius:9999px;background:#a855f7;border:2px solid #ffffff;' +
    'box-shadow:0 0 14px rgba(168,85,247,0.9), 0 2px 8px rgba(0,0,0,0.6);'
  root.appendChild(pin)

  return root
}

function buildSyntheticHaloElement(precision?: LocationPrecision): HTMLDivElement {
  const size =
    precision === 'country' ? 90 :
    precision === 'region'  ? 70 :
    50
  const dotSize = Math.round(size * 0.28)

  const root = document.createElement('div')
  root.style.cssText =
    'position:relative;width:' + size + 'px;height:' + size + 'px;' +
    'display:flex;align-items:center;justify-content:center;pointer-events:none;'

  // Outer animated pulse
  const pulse = document.createElement('span')
  pulse.className = 'animate-ping'
  pulse.style.cssText =
    'position:absolute;inset:0;border-radius:9999px;background:#c084fc;' +
    'opacity:0.55;animation-duration:2.2s;'
  root.appendChild(pulse)

  // Static fuzzy halo
  const halo = document.createElement('span')
  halo.style.cssText =
    'position:absolute;inset:0;border-radius:9999px;' +
    'background:radial-gradient(circle, rgba(168,85,247,0.45) 0%, rgba(168,85,247,0.18) 50%, rgba(168,85,247,0) 78%);' +
    'border:1.5px solid rgba(168,85,247,0.55);'
  root.appendChild(halo)

  // Center dot
  const dot = document.createElement('span')
  dot.style.cssText =
    'position:absolute;width:' + dotSize + 'px;height:' + dotSize + 'px;' +
    'border-radius:9999px;background:#a855f7;border:2px solid rgba(255,255,255,0.8);' +
    'box-shadow:0 0 10px rgba(168,85,247,0.85), 0 2px 6px rgba(0,0,0,0.5);'
  root.appendChild(dot)

  return root
}

function buildNearbyDotElement(slug: string, title: string, distanceKm: number): HTMLAnchorElement {
  const distanceMi = Math.round(distanceKm * 0.621371)
  const a = document.createElement('a')
  a.href = '/report/' + slug
  a.title = title + ' · ' + distanceMi + ' mi away'
  a.setAttribute('aria-label', 'Nearby case: ' + title + ', ' + distanceMi + ' miles away')
  a.style.cssText = 'display:block;pointer-events:auto;text-decoration:none;'

  const dot = document.createElement('span')
  dot.style.cssText =
    'display:block;width:8px;height:8px;border-radius:9999px;' +
    'background:rgba(34,211,238,0.8);border:1px solid rgba(165,243,252,0.4);' +
    'box-shadow:0 0 4px rgba(0,0,0,0.5);' +
    'transition:all 150ms ease;'
  a.appendChild(dot)

  // Hover state via CSS-in-JS event handlers (no Tailwind JIT here).
  a.addEventListener('mouseenter', () => {
    dot.style.background = 'rgb(103, 232, 249)'
    dot.style.transform = 'scale(1.5)'
  })
  a.addEventListener('mouseleave', () => {
    dot.style.background = 'rgba(34,211,238,0.8)'
    dot.style.transform = ''
  })

  return a
}

// ── React subcomponents (still used for the badge overlay) ──

function RegionBadge({ label }: { label: string }) {
  return (
    <div className="px-3 py-1.5 rounded-full bg-gray-950/90 border border-purple-500/40 text-xs font-medium text-purple-100 inline-flex items-center gap-1.5 backdrop-blur-sm shadow-lg">
      <MapPin className="w-3 h-3 text-purple-300" />
      {label}
    </div>
  )
}
