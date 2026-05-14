'use client'

/**
 * ReportLocationMap — V10.7.B.1 (V10.4 Phase 2 base)
 *
 * Purpose-built map for the top of the mobile-first report page.
 * Replaces a hero image entirely — the location IS the visual anchor.
 *
 * V10.7.B.1 — Added nearby-reports overlay. When the parent passes
 * a `nearby` prop (sourced from the haversine RPC via getStaticProps,
 * 80km radius / 50 row cap), we render each as a small muted dot
 * around the focal pin and overlay a count badge:
 *
 *   "12 similar within 80 km · View nearby →"
 *
 * Why no Supercluster (yet):
 *   At 50 points / 80km radius / city zoom, the points rarely overlap
 *   meaningfully and pure direct rendering reads cleaner. Supercluster
 *   was on the V10.7.B.1 spec but it's real overhead for marginal value
 *   on a hero map. If post-mass-ingest pin density warrants it (e.g.
 *   we widen the radius or raise the cap), add the cluster index here
 *   and switch the render branch.
 *
 * Behavior (V10.4 Phase 2 base, preserved):
 *   - Mounts at a regional zoom and flyTo-animates down to the focal
 *     location. Mirrors the "zoom to context" pattern from /lab.
 *   - Precision-aware: coarse precision shows a region BADGE instead
 *     of a misleading pin.
 *   - Static (no pan/zoom) so the map reads as a hero anchor, not a
 *     map exploration surface. Nearby dots are still clickable as
 *     deep links because that's a one-tap action, not exploration.
 *
 * Uses the same MapLibre + MapTiler stack as LocationMap and the
 * RADAR for visual consistency.
 */

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { getSyntheticFitZoom } from '@/lib/ingestion/utils/location-zoom'

// V10.9.D.10 — switched from dynamic import (which silently failed
// to load Marker) to static import. SSR safety is now handled by the
// parent (ReportPageV2 wraps this component with next/dynamic +
// ssr:false). Statically importing Map AND Marker together
// guarantees they share the same module context, so Marker registers
// correctly with Map's provider.
import MapGL, { Marker } from 'react-map-gl/maplibre'

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
  /** Best-known precision; controls whether we drop a pin or render a region badge. */
  precision?: LocationPrecision
  /** Display string for the region badge fallback (e.g. "Pennsylvania, USA"). */
  regionLabel?: string | null
  /** Display string for the marker popup ("Phoenix, AZ"). */
  pinLabel?: string | null
  /** Container height. Default 240px (compact mobile-first). */
  height?: number
  className?: string
  /** V10.7.B.1 — pre-fetched nearby reports for the overlay. */
  nearby?: NearbyReportPin[]
  /**
   * V10.7.B.1 — href the bottom-bar "View nearby" link points to.
   * Optional; when omitted the count badge renders without a link.
   * Typical value: `/map?center=lat,lng&zoom=8`.
   */
  nearbyHref?: string
  /**
   * V10.8.I — synthetic-coord flag from the DB. When true, lat/lng
   * came from a centroid fallback (V10.8.C) rather than precise
   * geocoding. Drives:
   *   - country/state-fit zoom level via getSyntheticFitZoom()
   *   - suppression of the nearby-reports overlay (the "X nearby"
   *     claim is meaningless when both the focal and candidates
   *     share the same synthetic centroid)
   *   - softer fuzzy-marker styling (no pulsing pin)
   */
  coordsSynthetic?: boolean
  /** V10.8.I — ISO 3166-1 alpha-2. Used by getSyntheticFitZoom. */
  countryCode?: string | null
  /** V10.8.I — state key (e.g. "TX" / "ON" / "ENG"). Used by getSyntheticFitZoom. */
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
  // V10.5.1 — capture the underlying maplibre-gl Map instance via
  // onLoad, not via ref (react-map-gl wrapped in next/dynamic doesn't
  // forward refs cleanly through the dynamic boundary).
  const [mapInstance, setMapInstance] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  const [animationDone, setAnimationDone] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // ── Decide: pin or region badge ────────────────────────────
  const hasUsableCoords =
    typeof latitude === 'number' && typeof longitude === 'number' &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
  const showPin = hasUsableCoords && (precision === 'exact' || precision === 'city') && !coordsSynthetic

  // ── V10.8.I — Suppress nearby overlay for synthetic coords ────
  //
  // When the focal report's coords are synthetic (country/state
  // centroid), the V10.8.I nearby RPC update returns no candidates —
  // but defense-in-depth, we also hide the overlay client-side.
  // The "X similar cases nearby" claim is meaningless when the
  // focal point isn't a real location.
  const effectiveNearby = coordsSynthetic ? [] : (nearby || [])
  const nearbyCount = effectiveNearby.length
  const hasNearby = nearbyCount > 0

  // ── Target zoom — precision-driven ────────────────────────
  //
  // V10.8.I — When coords_synthetic is true, use the country/state
  // fit zoom from getSyntheticFitZoom() so the user sees the full
  // admin region instead of a misleadingly-zoomed view of a fake
  // point. Falls through to the legacy precision-default zoom for
  // precise-coord reports.
  //
  // V10.7.B.1 — When we have nearby reports to render, we zoom out
  // ONE LEVEL from the precision-default so the nearby dots are
  // visible in the viewport.
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
    : (hasNearby ? Math.max(7, precisionDefaultZoom - 2) : precisionDefaultZoom)

  // ── Animated flyTo on mount ────────────────────────────────
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

  useEffect(() => {
    if (!mapInstance || !hasUsableCoords || animationDone) return
    const tid = setTimeout(() => {
      try {
        mapInstance.flyTo({
          center: [longitude!, latitude!],
          zoom: targetZoom,
          duration: 1800,
          essential: true,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
        })
      } catch (err) {
        console.warn('[ReportLocationMap] flyTo failed:', err)
      }
      setAnimationDone(true)
    }, 200)
    return () => clearTimeout(tid)
  }, [mapInstance, hasUsableCoords, latitude, longitude, animationDone, targetZoom])

  // ── Compute the max distance across nearby points (for badge) ─
  const farthestKm = useMemo(() => {
    if (!effectiveNearby || effectiveNearby.length === 0) return null
    return Math.round(Math.max(...effectiveNearby.map(n => n.distance_km)))
  }, [effectiveNearby])

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

  return (
    <div
      className={'relative w-full overflow-hidden border-b border-gray-800 bg-gray-950 ' + (className || '')}
      style={wrapperStyle}
    >
      {!MAPTILER_KEY ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <RegionBadge label={regionLabel || pinLabel || 'Location'} />
        </div>
      ) : (
        <MapGL
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
            if (e && e.target) setMapInstance(e.target)
          }}
        >
          {/* V10.7.B.1 — Nearby dots BEHIND the focal pin. Rendered
              even before the flyTo animation completes so the user
              sees the surrounding density at the same time as the
              focal location. We render up to 50 (the RPC cap).
              V10.8.I — effectiveNearby is empty when coordsSynthetic. */}
          {showPin && effectiveNearby.map(n => (
            <Marker
              key={n.id}
              latitude={n.latitude}
              longitude={n.longitude}
              anchor="center"
            >
              <NearbyDot slug={n.slug} title={n.title} distanceKm={n.distance_km} />
            </Marker>
          ))}
          {showPin && (
            <Marker latitude={latitude!} longitude={longitude!} anchor="bottom">
              <PinSprite label={pinLabel || regionLabel || ''} />
            </Marker>
          )}
          {/* V10.8.I — synthetic-coord soft marker: when we have a
              centroid fallback, render a soft pulsing halo at the
              centroid + the region badge floating in the viewport.
              The halo says "the data is fuzzy in this area" without
              the precision implication of a sharp pin. */}
          {!showPin && coordsSynthetic && hasUsableCoords && (
            <Marker latitude={latitude!} longitude={longitude!} anchor="center">
              <SyntheticHalo precision={precision} />
            </Marker>
          )}
          {/* V10.9.D.12 — RegionBadge moved from absolute-centered to
              top-left corner. Centered placement covered the
              SyntheticHalo at the same centroid coords, hiding the
              location marker. Top-left is out of the way and reads
              as a "this is the region" tag. */}
          {!showPin && regionLabel && (
            <div className="absolute top-3 left-3 pointer-events-none">
              <RegionBadge label={regionLabel} />
            </div>
          )}
        </MapGL>
      )}

      {/* Bottom scrim for legibility */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-12 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(10,10,20,0.85) 0%, transparent 100%)' }}
      />

      {/* V10.9.D.7 — V10.7.B.1's "X similar cases nearby" badge was
          removed because it duplicated the PatternStrip's "Similar
          cases" facet (geographic radius / state / phenomenon) which
          lives in the side rail and carries strictly more info. The
          nearby cyan dots on the map still convey density visually
          without an explicit count overlay. */}
    </div>
  )
}

// ── Subcomponents ───────────────────────────────────────────

function PinSprite({ label }: { label: string }) {
  // V10.9.D.9 — MUCH more prominent so it's obvious on a dark map.
  // V10.9.D.8 was still too subtle (Chase couldn't spot it on
  // BFRO reports zoomed to street level).
  // Layered design (outermost → innermost):
  //   - Outer pulse ring 56x56, animate-ping, 2s cycle
  //   - Static glow halo 36x36 with brand-purple radial gradient
  //   - Inner pin 26x26 solid purple-500 with white border
  //   - Box-shadow on inner pin for halo glow even in still frames
  return (
    <div className="relative flex flex-col items-center pointer-events-auto">
      {label && (
        <div className="mb-1.5 px-2 py-1 rounded-md bg-gray-950/90 border border-purple-500/40 text-[11px] font-medium text-white whitespace-nowrap shadow-lg">
          {label}
        </div>
      )}
      <div className="relative" style={{ width: 26, height: 26 }}>
        {/* Outer animated ping ring (motion) */}
        <span
          className="absolute rounded-full bg-purple-400 animate-ping"
          style={{
            width: 56,
            height: 56,
            left: -15,
            top: -15,
            opacity: 0.7,
            animationDuration: '2s',
          }}
        />
        {/* Static halo glow (visible in still frames) */}
        <span
          className="absolute rounded-full"
          style={{
            width: 44,
            height: 44,
            left: -9,
            top: -9,
            background: 'radial-gradient(circle, rgba(168,85,247,0.55) 0%, rgba(168,85,247,0) 70%)',
          }}
        />
        {/* Inner pin */}
        <span
          className="absolute rounded-full bg-purple-500 border-2 border-white"
          style={{
            width: 26,
            height: 26,
            left: 0,
            top: 0,
            boxShadow: '0 0 14px rgba(168,85,247,0.9), 0 2px 8px rgba(0,0,0,0.6)',
          }}
        />
      </div>
    </div>
  )
}

function NearbyDot({ slug, title, distanceKm }: { slug: string; title: string; distanceKm: number }) {
  // Small muted dot. No animation, no label. Tap routes to that
  // report. V10.9.D.7 — distance shown in miles (US-focused).
  const distanceMi = Math.round(distanceKm * 0.621371)
  return (
    <Link
      href={'/report/' + slug}
      title={title + ' · ' + distanceMi + ' mi away'}
      aria-label={'Nearby case: ' + title + ', ' + distanceMi + ' miles away'}
      className="block pointer-events-auto"
    >
      <span className="block w-2 h-2 rounded-full bg-cyan-400/80 border border-cyan-200/40 shadow-sm hover:bg-cyan-300 hover:scale-150 transition-all" />
    </Link>
  )
}

function NearbyCountBadge({
  count,
  farthestKm,
  href,
}: {
  count: number
  farthestKm: number | null
  href?: string
}) {
  const labelMain = count === 1
    ? '1 similar case nearby'
    : count.toLocaleString() + ' similar cases nearby'
  // V10.9.D.7 — display in miles for US-focused audience.
  const farthestMi = farthestKm ? Math.round(farthestKm * 0.621371) : null
  const labelSub = farthestMi ? '· within ' + farthestMi + ' mi' : ''
  const inner = (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-950/85 border border-cyan-500/40 backdrop-blur-sm text-[11px] text-cyan-100 shadow-lg">
      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" aria-hidden="true" />
      <span className="font-medium">{labelMain}</span>
      {labelSub && <span className="text-cyan-300/70">{labelSub}</span>}
      {href && <span className="ml-1 text-cyan-200">→</span>}
    </span>
  )
  return (
    <div className="absolute left-3 bottom-3 pointer-events-auto">
      {href ? (
        <Link href={href} className="hover:no-underline">{inner}</Link>
      ) : (
        inner
      )}
    </div>
  )
}

function SyntheticHalo({ precision }: { precision?: LocationPrecision }) {
  // V10.9.D.9 — synthetic halo strengthened to match the PinSprite's
  // brand-purple visual weight. Visible center dot ensures the
  // marker reads in still frames; outer pulse provides motion to
  // match the precise-pin behavior. Same brand purple, same shadow
  // glow — only the size scales by precision.
  const size =
    precision === 'country' ? 90 :
    precision === 'region'  ? 70 :
    50
  const dotSize = Math.round(size * 0.28)
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Outer animated pulse ring */}
      <span
        className="absolute inset-0 rounded-full bg-purple-400 animate-ping"
        style={{ opacity: 0.55, animationDuration: '2.2s' }}
      />
      {/* Static fuzzy halo (visible in still frames) */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(168,85,247,0.45) 0%, rgba(168,85,247,0.18) 50%, rgba(168,85,247,0) 78%)',
          border: '1.5px solid rgba(168,85,247,0.55)',
        }}
      />
      {/* Center dot — matches PinSprite anchor visually */}
      <span
        className="absolute rounded-full bg-purple-500 border-2 border-white/80"
        style={{
          width: dotSize,
          height: dotSize,
          boxShadow: '0 0 10px rgba(168,85,247,0.85), 0 2px 6px rgba(0,0,0,0.5)',
        }}
      />
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
