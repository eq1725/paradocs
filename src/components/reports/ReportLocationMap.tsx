'use client'

/**
 * ReportLocationMap — V10.4 Phase 2
 *
 * Purpose-built map for the top of the new mobile-first report
 * page. Replaces the hero image entirely — the location IS the
 * visual anchor.
 *
 * Behavior:
 *   - Mounts at a regional zoom (country/state level) and
 *     animates a smooth flyTo down to the specific location.
 *     Mirrors the "zoom to context" pattern used on the /lab
 *     RADAR reveal.
 *   - Precision-aware: when latitude/longitude are not at city-
 *     level precision (or missing), shows a region BADGE
 *     instead of a misleading pin.
 *   - No nearby-reports overlay (that's a separate research
 *     surface; clutters the report's first impression).
 *
 * Uses the same MapLibre + MapTiler stack as LocationMap and
 * the RADAR for visual consistency.
 */

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'

const Map = dynamic(
  () => import('react-map-gl/maplibre').then(mod => mod.default || (mod as any).Map || mod),
  { ssr: false },
) as any
const Marker = dynamic(
  () => import('react-map-gl/maplibre').then(mod => (mod as any).Marker),
  { ssr: false },
) as any

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

export interface ReportLocationMapProps {
  latitude?: number | null
  longitude?: number | null
  /** Best-known precision; controls whether we drop a pin or render a region badge. */
  precision?: LocationPrecision
  /** Display string for the region badge fallback (e.g. "Pennsylvania, USA"). */
  regionLabel?: string | null
  /** Display string for the marker popup ("Phoenix, AZ"). */
  pinLabel?: string | null
  /** Container height. Default 240px (compact mobile-first). */
  height?: number
  className?: string
}

export default function ReportLocationMap({
  latitude,
  longitude,
  precision = 'city',
  regionLabel,
  pinLabel,
  height = 240,
  className,
}: ReportLocationMapProps) {
  // V10.5.1 — capture the underlying maplibre-gl Map instance via
  // the onLoad event rather than via a React ref. With react-map-gl
  // wrapped in next/dynamic, refs are NOT forwarded cleanly through
  // the dynamic boundary, so mapRef.current.flyTo was undefined.
  // onLoad fires once the map is ready and gives us the real Map
  // instance — same flyTo method, but actually callable.
  const [mapInstance, setMapInstance] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  const [animationDone, setAnimationDone] = useState(false)

  // Wait for client-side mount before deciding what to render —
  // MapLibre can't run SSR.
  useEffect(() => { setMounted(true) }, [])

  // ── Decide: pin or region badge ────────────────────────────
  // V10.5 — pin renders ONLY when precision is exact or city.
  // Anything coarser (region/country/unknown) renders the region
  // badge over a map centered on the country/region, no pin —
  // because dropping a pin at a state centroid can land in the
  // wrong place entirely (the Georgia case landed in the Atlantic).
  const hasUsableCoords =
    typeof latitude === 'number' && typeof longitude === 'number' &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
  const showPin = hasUsableCoords && (precision === 'exact' || precision === 'city')

  // ── Target zoom — precision-driven ────────────────────────
  // V10.5 — Roswell/Corona was landing at country-zoom because the
  // initial state already matched the target. Fix: start clearly
  // ZOOMED OUT (zoom 3) and animate IN to the precision-matched
  // target. Target zoom map:
  //   exact   → 11 (street/neighborhood)
  //   city    → 10 (city + immediate region)
  //   region  → 6  (state/province visible)
  //   country → 4  (country visible)
  //   unknown → 2  (world)
  const targetZoom =
    precision === 'exact'   ? 11 :
    precision === 'city'    ? 10 :
    precision === 'region'  ? 6  :
    precision === 'country' ? 4  : 2

  // ── Animated flyTo on mount ────────────────────────────────
  // Always start from a wider zoom (target − 4, floor 2) so the
  // user perceives the motion as "here's the world, narrowing in
  // on this case". Without this, when target was already 3.5 it
  // looked like the map had failed to load anything specific.
  const initialZoom = Math.max(2, targetZoom - 4)
  const initialViewState = hasUsableCoords ? {
    latitude: latitude!,
    longitude: longitude!,
    zoom: initialZoom,
    bearing: 0,
    pitch: 0,
  } : {
    latitude: 20,
    longitude: 0,
    zoom: 1.5,
    bearing: 0,
    pitch: 0,
  }

  // V10.5.1 — fire the flyTo once both (a) the map instance has
  // loaded (we got it via onLoad) and (b) we have usable coords.
  // The 200ms delay gives the initial wide-zoom view a beat to
  // register with the user before the camera moves.
  useEffect(() => {
    if (!mapInstance || !hasUsableCoords || animationDone) return
    const tid = setTimeout(() => {
      try {
        mapInstance.flyTo({
          center: [longitude!, latitude!],
          zoom: targetZoom,
          duration: 1800,
          essential: true, // bypass prefers-reduced-motion (the motion IS the content)
          easing: (t: number) => 1 - Math.pow(1 - t, 3), // ease-out-cubic
        })
      } catch (err) {
        console.warn('[ReportLocationMap] flyTo failed:', err)
      }
      setAnimationDone(true)
    }, 200)
    return () => clearTimeout(tid)
  }, [mapInstance, hasUsableCoords, latitude, longitude, animationDone, targetZoom])

  // ── Fallback when we have no usable coords ────────────────
  // V10.5 — if a className that controls height (e.g. h-full
  // inside an absolutely-positioned parent) is provided, we
  // skip the inline height style so the wrapper wins.
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

  // ── Render ────────────────────────────────────────────────
  return (
    <div
      className={'relative w-full overflow-hidden border-b border-gray-800 bg-gray-950 ' + (className || '')}
      style={wrapperStyle}
    >
      {!MAPTILER_KEY ? (
        // Without a MapTiler key we'd render a broken style.
        // Fall back to the region badge so the page never breaks
        // in dev / preview environments missing the env var.
        <div className="absolute inset-0 flex items-center justify-center">
          <RegionBadge label={regionLabel || pinLabel || 'Location'} />
        </div>
      ) : (
        <Map
          initialViewState={initialViewState}
          mapStyle={MAP_STYLE}
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
          dragPan={false}
          dragRotate={false}
          touchPitch={false}
          scrollZoom={false}
          doubleClickZoom={false}
          interactive={false}
          onLoad={(e: any) => {
            // V10.5.1 — capture the underlying maplibre-gl Map
            // instance so the flyTo useEffect can call its
            // methods directly. e.target is the Map instance per
            // react-map-gl v7's MapEvent contract.
            if (e && e.target) setMapInstance(e.target)
          }}
        >
          {showPin && (
            <Marker latitude={latitude!} longitude={longitude!} anchor="bottom">
              <PinSprite label={pinLabel || regionLabel || ''} />
            </Marker>
          )}
          {!showPin && regionLabel && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <RegionBadge label={regionLabel} />
            </div>
          )}
        </Map>
      )}
      {/* Bottom scrim for legibility against busy basemaps */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-12 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(10,10,20,0.85) 0%, transparent 100%)' }}
      />
    </div>
  )
}

// ── Subcomponents ───────────────────────────────────────────

function PinSprite({ label }: { label: string }) {
  return (
    <div className="relative flex flex-col items-center pointer-events-auto">
      {label && (
        <div className="mb-1 px-2 py-1 rounded-md bg-gray-950/90 border border-purple-500/40 text-[11px] font-medium text-white whitespace-nowrap shadow-lg">
          {label}
        </div>
      )}
      {/* Pulsing pin */}
      <div className="relative">
        <span className="absolute inset-0 rounded-full bg-purple-400 opacity-50 animate-ping" style={{ width: 16, height: 16, left: -8, top: -8 }} />
        <span className="block w-4 h-4 rounded-full bg-purple-500 border-2 border-white shadow-md" />
      </div>
    </div>
  )
}

function RegionBadge({ label }: { label: string }) {
  return (
    <div className="px-3 py-1.5 rounded-full bg-gray-950/90 border border-purple-500/40 text-xs font-medium text-purple-100 inline-flex items-center gap-1.5 backdrop-blur-sm">
      <MapPin className="w-3 h-3 text-purple-300" />
      {label}
    </div>
  )
}
