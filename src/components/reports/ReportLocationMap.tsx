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
import { getSyntheticFitZoom, getPrecisionFitBounds, type BoundsTuple } from '@/lib/ingestion/utils/location-zoom'

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || ''
const MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`
  : ''

/**
 * V10.8.N — robust "map is ready for layer/camera ops" helper.
 *
 * Replaces every previous `map.once('load', fn)` in this file. Live
 * inspection of the deployed Kansas page showed the `load` event was
 * never firing under our `interactive: false` Map config, so the
 * framing flyTo + the V10.8.M overlay-add never ran (zoom stuck at 2,
 * no admin layers added — but the focal marker did render because its
 * useEffect re-runs on dep changes and falls into a `loaded()` check).
 *
 * Strategy:
 *   1. Synchronous fast path: if isStyleLoaded() is true, run now.
 *   2. Listen for `styledata` (fires reliably whenever the style
 *      mutates, including initial load), re-checking isStyleLoaded
 *      each fire.
 *   3. setTimeout fallback at 2.5s — if the events never settle,
 *      run anyway. flyTo / fitBounds / addLayer all queue safely
 *      against an in-flight style.
 *   4. Cancellation token (cancelRef.current = true) so unmount
 *      cleanup blocks the late callback.
 */
function whenMapReady(
  map: maplibregl.Map,
  fn: () => void,
  cancelRef?: { current: boolean },
): () => void {
  let done = false
  const isCancelled = () => done || cancelRef?.current === true

  const run = () => {
    if (isCancelled()) return
    done = true
    map.off('styledata', onData)
    clearTimeout(timer)
    try { fn() } catch (e) {
      // Surface the error to console so a future regression isn't
      // silently swallowed (V10.8.J trim() and V10.8.M overlay both
      // failed silently for hours before live inspection).
      console.warn('[ReportLocationMap] whenMapReady fn threw:', e)
    }
  }

  const onData = () => {
    if (isCancelled()) return
    if (map.isStyleLoaded()) run()
  }

  if (map.isStyleLoaded()) {
    // Defer one tick so callers can be sure their refs are set.
    Promise.resolve().then(run)
    return () => { done = true }
  }

  map.on('styledata', onData)
  // V10.8.P — fallback is 600ms (was 2.5s — too long, perceived as a
  // hang). styledata fires within ~150-300ms on real connections; on
  // slow connections the flyTo / addLayer queue against the still-
  // loading style anyway. Worst case the user sees the framing settle
  // a frame later than ideal.
  const timer = setTimeout(() => {
    if (isCancelled()) return
    run()
  }, 600)

  return () => {
    done = true
    map.off('styledata', onData)
    clearTimeout(timer)
  }
}

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

  // V10.8.I.2 — render decisions:
  //   - showPin: precise pin (with pulse). Requires city-or-finer
  //     precision AND non-synthetic coords. The clamped precision in
  //     ReportPageV2 means precision='exact' is only set when the row
  //     truly has a city populated — so over-claimed metadata can no
  //     longer flip this on for country-only rows.
  //   - showHalo: fuzzy halo (region / country precision). Fires when
  //     we have usable coords but the precision is region or country
  //     — regardless of whether the coords were stored as synthetic
  //     or returned by a country-accuracy geocode.
  const showPin = hasUsableCoords && (precision === 'exact' || precision === 'city') && !coordsSynthetic
  const showHalo =
    hasUsableCoords && !showPin &&
    (precision === 'country' || precision === 'region' || coordsSynthetic === true)
  const effectiveNearby = (coordsSynthetic || showHalo) ? [] : (nearby || [])

  // ── Target framing ─────────────────────────────────────────
  //
  // V10.8.I.1 — when the (clamped) precision tells us the row only
  // pins down a country or a region, prefer a real bounding-box fit
  // over a fixed zoom number. The bbox path calls map.fitBounds with
  // consistent padding, which gives accurate framing regardless of
  // viewport size — the fixed-zoom path was sized for desktop and on
  // mobile showed nothing but a halo on featureless tile area.
  //
  // We deliberately do NOT gate this on `coords_synthetic`. A row
  // with precision='country' should frame the country whether the
  // coords were stored as a centroid or whether MapTiler returned
  // country-level accuracy on a real geocode call — the visible UI
  // is the same in both cases.
  const syntheticBounds = getPrecisionFitBounds({
    precision,
    countryCode,
    stateKey,
  })
  const syntheticZoom = getSyntheticFitZoom({
    precision,
    coords_synthetic: !!coordsSynthetic,
    countryCode,
    stateKey,
  })
  // V10.7.E.12 — pulled back the precision-default zoom so the map
  // shows REGIONAL CONTEXT, not just an unlabeled dot in a sea of
  // terrain. Previous values (11 / 10 / 6 / 4) zoomed so tight that
  // only the state label was visible — no neighboring cities or
  // county lines for the viewer to orient against. New values show
  // 1-2 administrative levels of context above the precision level
  // so a Moss Hill, Texas dot also reveals Houston, Beaumont, the
  // gulf coast.
  const precisionDefaultZoom =
    precision === 'exact'   ? 9   :
    precision === 'city'    ? 8   :
    precision === 'region'  ? 5   :
    precision === 'country' ? 3.5 : 2
  const targetZoom = syntheticZoom !== null
    ? syntheticZoom
    : (effectiveNearby.length > 0 ? Math.max(7, precisionDefaultZoom - 2) : precisionDefaultZoom)

  // ── Initialize the map ONCE ────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !MAPTILER_KEY) return
    if (mapRef.current) return // already initialized

    // V10.8.P — initialize at the target zoom, not zoomed-out. The
    // wide-out initial was a holdover from when every framing used
    // flyTo. With the jumpTo path for bbox-fit rows, the wide-out
    // initial flashes the world before snapping to the target — looks
    // janky. Start at the right zoom; the framing useEffect can still
    // refine center / zoom (or animate in for precise-coord rows).
    //
    // V11 — when lat/lng are null (country-precision reports after the
    // V11 synth-coord drop) we still want to show a useful map. If we
    // have country bounds, compute the bbox center and an appropriate
    // country-fit zoom (~3.5) instead of the old [0, 20] mid-Atlantic
    // fallback which rendered as a black/ocean void. The fitBounds
    // effect below will frame the country properly once the map's
    // ready; this just gets us a sensible initial paint.
    let initialZoom: number
    let center: [number, number]
    if (hasUsableCoords) {
      initialZoom = syntheticBounds ? Math.max(targetZoom - 0.5, 5) : Math.max(2, targetZoom - 4)
      center = [longitude!, latitude!]
    } else if (syntheticBounds) {
      // syntheticBounds = [west, south, east, north]
      const [w, s, e, n] = syntheticBounds
      center = [(w + e) / 2, (s + n) / 2]
      initialZoom = precisionDefaultZoom // country = 3.5, region = 5
    } else {
      // No usable coords AND no country bbox — last-resort world view.
      center = [0, 20]
      initialZoom = 1.5
    }

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

    // V10.9.D.14 / V10.8.N — resize after the map is ready (was
    // map.once('load', ...) but that never fires under our config —
    // see whenMapReady for details).
    whenMapReady(map, () => {
      try { map.resize() } catch (_e) { /* ignore */ }
      // V10.8.M — bolder admin-border overlay. The dataviz-dark style
      // already loads admin0/admin1 boundary geometry (source
      // maptiler_planet, source-layer boundary) but paints them in
      // hsl(2, 0%, 28%) — invisible on the dark background, especially
      // on mobile where viewport gamma is harsher. Add two line
      // layers using the same vector source: one for state/province
      // borders (admin_level 3-10), one for country borders (level 2),
      // both painted in a desaturated brand-purple tinted gray with
      // enough opacity to read on dark UI. Insert below the first
      // label/symbol layer so country/state names stay on top.
      try {
        const style = map.getStyle()
        const firstSymbolId = style?.layers?.find(
          (L: any) => L.type === 'symbol',
        )?.id
        // V10.8.O — bumped paint visibility. Live pixel-readback test
        // confirmed the prior #7e6da1 / 0.55 / width 1.2 was too
        // subtle on dark UI to register visually (the features WERE
        // rendered, just invisibly). Increased saturation, opacity,
        // and width across the zoom curve so state borders read
        // immediately on both desktop and mobile dark backgrounds.
        if (!map.getLayer('paradocs-admin1-overlay')) {
          map.addLayer(
            {
              id: 'paradocs-admin1-overlay',
              type: 'line',
              source: 'maptiler_planet',
              'source-layer': 'boundary',
              // V10.8.Q — admin_level 3 + 4 only. Was [3,4,5,6]; 5
              // and 6 are county / parish / department lines that
              // make the map look noisy. 4 is state/province (US
              // states, AU states, German Länder, etc.); 3 covers
              // countries that use level 3 for their primary
              // subdivision (Russia federal subjects, etc.).
              filter: ['all',
                ['in', 'admin_level', 3, 4],
                ['==', 'maritime', 0],
              ],
              paint: {
                'line-color': '#c4b5fd',  // brand-purple-300, more luminous
                'line-opacity': 0.9,
                // V10.8.Q — bump width at lower zooms so state edges
                // are visible at fit-zoom (~5-6) on a mobile viewport
                // when the bbox naturally fits without the prior
                // zoom-6 floor.
                'line-width': [
                  'interpolate', ['linear'], ['zoom'],
                  3, 0.8,
                  5, 1.6,
                  7, 2.2,
                  10, 3.0,
                ],
              },
            },
            firstSymbolId,
          )
        }
        if (!map.getLayer('paradocs-admin0-overlay')) {
          map.addLayer(
            {
              id: 'paradocs-admin0-overlay',
              type: 'line',
              source: 'maptiler_planet',
              'source-layer': 'boundary',
              filter: ['all',
                ['==', 'admin_level', 2],
                ['==', 'maritime', 0],
                ['==', 'disputed', 0],
              ],
              paint: {
                'line-color': '#ddd6fe',  // brand-purple-200 — even brighter for country edges
                'line-opacity': 0.95,
                'line-width': [
                  'interpolate', ['linear'], ['zoom'],
                  1, 0.8,
                  3, 1.5,
                  6, 2.3,
                  10, 3.2,
                ],
              },
            },
            firstSymbolId,
          )
        }
      } catch (e) {
        // V10.8.N — was silently swallowed; now logged so a regression
        // surfaces in console instead of just looking like "borders
        // mysteriously not showing." Still non-fatal — overlay is
        // cosmetic, never blocks marker/framing.
        console.warn('[ReportLocationMap] addLayer overlay failed:', e)
      }
    })

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        try { map.resize() } catch (_e) { /* ignore */ }
      })
      resizeObserver.observe(containerRef.current)
    }

    // Belt-and-suspenders: also resize after the next frame in case
    // the container's final size resolves a tick after init.
    requestAnimationFrame(() => {
      try { map.resize() } catch (_e) { /* ignore */ }
    })

    return () => {
      // Cleanup nearby markers + focal marker before destroying map
      if (resizeObserver) resizeObserver.disconnect()
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

  // ── Frame the map after it loads ───────────────────────────
  //
  // V10.8.I.1 — three paths:
  //   1. Synthetic + bbox known  → map.fitBounds(bbox, { padding })
  //      This frames the actual country/state polygon and works
  //      regardless of viewport size (small mobile or large desktop).
  //   2. Synthetic + no bbox     → flyTo({ zoom: syntheticZoom })
  //      Fallback for cities or unknowns.
  //   3. Precise coords          → flyTo({ zoom: targetZoom })
  //      Drops the pin at the precision-appropriate zoom.
  //
  // Padding is asymmetric on mobile because the region label sits in
  // the top-left and the bottom scrim covers the lower 48px. We bias
  // the fit toward the visible center so neither overlay clips the
  // halo.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // V11 — allow the framing pass to run when we have syntheticBounds
    // even if lat/lng are null. Country-precision reports (post-V11
    // synth-coord drop) have null coords but a valid country bbox; we
    // still want to fitBounds to the country instead of leaving the
    // map at its [0, 20] world-view fallback.
    if (!hasUsableCoords && !syntheticBounds) return

    let cancelled = false
    function doFrame() {
      if (cancelled || !map) return
      try {
        if (syntheticBounds) {
          // V10.8.L — viewport-aware framing with a hard zoom floor
          // for state-precision rows.
          //
          // The previous V10.8.J.1 fix scaled padding down on small
          // viewports, but Kansas's bbox is wide (7.4° lng) so the
          // fit-zoom only moved from ~5.3 (desktop padding) to ~5.6
          // (mobile padding) — both still below MapTiler dataviz-
          // dark's state-border render threshold (around zoom 6). The
          // halo+badge looked fine but the basemap rendered as an
          // unbordered tan blob.
          //
          // Fix: compute the would-be fit camera with cameraForBounds,
          // then if the resulting zoom is below the threshold for
          // visible borders at this precision, override the zoom up
          // to that floor (centered on the bbox center). State
          // borders need ≥6, country borders are always visible so
          // no floor needed.
          const cont = map.getContainer()
          const cw = cont?.clientWidth || 600
          const ch = cont?.clientHeight || 300
          const isCompact = cw < 600 || ch < 280
          const pad = isCompact
            ? { top: 14, right: 12, bottom: 26, left: 12 }
            : { top: 36, right: 24, bottom: 56, left: 24 }

          const bounds: [[number, number], [number, number]] = [
            [syntheticBounds[0], syntheticBounds[1]],
            [syntheticBounds[2], syntheticBounds[3]],
          ]

          // cameraForBounds returns the CameraOptions maplibre would
          // adopt for fitBounds with these bounds + padding. We then
          // post-process to enforce our zoom floor.
          const cam = map.cameraForBounds(bounds, { padding: pad, maxZoom: 9 })
          if (cam) {
            const camCenter = cam.center as { lng: number; lat: number } | [number, number] | undefined
            const center: [number, number] = Array.isArray(camCenter)
              ? [camCenter[0], camCenter[1]]
              : camCenter
                ? [camCenter.lng, camCenter.lat]
                : [
                    (syntheticBounds[0] + syntheticBounds[2]) / 2,
                    (syntheticBounds[1] + syntheticBounds[3]) / 2,
                  ]
            const fitZoom = typeof cam.zoom === 'number' ? cam.zoom : 5
            // V10.8.Q — drop the prior zoom-6 floor for state precision.
            // The floor was a workaround for the basemap not drawing
            // state borders below ~zoom 6. V10.8.M added our own
            // overlay layer that draws borders at any zoom, so we no
            // longer need to over-zoom on wide states like Kansas
            // (which forced the state to fill the viewport with no
            // border visible). Just use the natural fit and let the
            // overlay handle visibility.
            map.jumpTo({
              center,
              zoom: Math.min(fitZoom, 9),
            })
          } else {
            // Defensive — if cameraForBounds somehow fails, snap to
            // the bbox center at a sensible zoom.
            map.jumpTo({
              center: [
                (syntheticBounds[0] + syntheticBounds[2]) / 2,
                (syntheticBounds[1] + syntheticBounds[3]) / 2,
              ],
              zoom: 5,
            })
          }
        } else {
          // V10.8.P — keep the flyTo for precise-coord rows since the
          // initial-zoom-out → fly-in motion is part of the "showing
          // you exactly where this happened" reveal. But shorten it.
          map.flyTo({
            center: [longitude!, latitude!],
            zoom: targetZoom,
            duration: 800,
            essential: true,
            easing: (t: number) => 1 - Math.pow(1 - t, 3),
          })
        }
      } catch (e) {
        // ignore — map may not be ready yet
      }
    }

    // V10.8.N / V10.8.P — robust ready-check + immediate framing.
    // The previous map.once('load',...) never fired under
    // interactive:false. Also dropped the 200ms settle timeout — it
    // was a holdover from when the framing depended on tile readiness;
    // flyTo handles in-flight tiles fine.
    const cancelToken = { current: false }
    const cleanup = whenMapReady(map, doFrame, cancelToken)

    return () => {
      cancelled = true
      cancelToken.current = true
      cleanup()
    }
  }, [
    latitude,
    longitude,
    hasUsableCoords,
    targetZoom,
    syntheticBounds && syntheticBounds[0],
    syntheticBounds && syntheticBounds[1],
    syntheticBounds && syntheticBounds[2],
    syntheticBounds && syntheticBounds[3],
  ])

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
        : (showHalo ? buildSyntheticHaloElement(precision) : null)
      if (!el) return

      const marker = new maplibregl.Marker({
        element: el,
        anchor: showPin ? 'bottom' : 'center',
      })
        .setLngLat([longitude!, latitude!])
        .addTo(m)
      focalMarkerRef.current = marker
    }

    const cancelToken = { current: false }
    const cleanup = whenMapReady(map, () => attach(map), cancelToken)
    return () => {
      cancelToken.current = true
      cleanup()
    }
  }, [latitude, longitude, hasUsableCoords, showPin, showHalo, coordsSynthetic, precision])

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

    const cancelToken = { current: false }
    const cleanup = whenMapReady(map, () => attach(map), cancelToken)
    // Cleanup cancels the ready callback if the effect re-runs before
    // it fires. Markers themselves are cleared inside `attach` so
    // re-runs replace prior markers cleanly.
    return () => {
      cancelToken.current = true
      cleanup()
    }
  }, [effectiveNearby, showPin])

  // ── Render container + region label overlay ────────────────
  //
  // V10.9.D.15 — Tailwind class collision fix.
  //
  // Parent on ReportPageV2 is `relative h-[22vh] ... max-h-[320px]`
  // and passes `className="absolute inset-0 h-full"` here. If we
  // ALSO put `relative` in our base classes, Tailwind's stylesheet
  // emits `.relative` after `.absolute` (alphabetical ordering for
  // position utilities) — same specificity means source order wins,
  // so `position: relative` on the wrapper beats the user's
  // `absolute`. With `position: relative`, `inset-0` is a no-op,
  // the wrapper doesn't fill the parent, and the map container
  // inside (anchored to it via `absolute inset-0`) collapses to
  // the natural-flow box → narrow band.
  //
  // Fix: omit `relative` from the base class string and rely on
  // inline `style` to set positioning + sizing. Inline styles
  // cleanly beat Tailwind's utilities and we no longer need to
  // care what the consumer passes via `className`.
  //
  // We honor the consumer's className for visual modifiers (height
  // classes, background overrides, etc.) but layout is owned by
  // inline style for predictability.
  const consumerHasPositioning =
    !!className && /\b(absolute|fixed|sticky|relative)\b/.test(className)
  const consumerHasHeight = !!className && /\bh-/.test(className)

  const wrapperStyle: React.CSSProperties = {}
  if (consumerHasPositioning) {
    // Consumer is positioning us — fill the positioned ancestor.
    wrapperStyle.position = 'absolute'
    wrapperStyle.inset = 0
    if (!consumerHasHeight) wrapperStyle.height = '100%'
  } else {
    // Standalone usage — own our height, be a positioning context
    // for the map canvas inside.
    wrapperStyle.position = 'relative'
    wrapperStyle.height = consumerHasHeight ? undefined : height
  }
  wrapperStyle.width = '100%'

  // Strip layout-affecting classes the consumer passed so they don't
  // re-introduce the collision (we own layout via wrapperStyle).
  const consumerClass = (className || '')
    .replace(/\b(absolute|fixed|sticky|relative)\b/g, '')
    .replace(/\binset-0\b/g, '')
    .replace(/\bw-full\b/g, '')
    .trim()

  const innerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
  }

  if (!hasUsableCoords) {
    return (
      <div
        className={'overflow-hidden bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900 border-b border-gray-800 flex items-center justify-center ' + consumerClass}
        style={wrapperStyle}
      >
        <RegionBadge label={regionLabel || 'Location unknown'} />
      </div>
    )
  }

  if (!MAPTILER_KEY) {
    return (
      <div
        className={'overflow-hidden border-b border-gray-800 bg-gray-950 ' + consumerClass}
        style={wrapperStyle}
      >
        <div style={innerStyle} className="flex items-center justify-center">
          <RegionBadge label={regionLabel || pinLabel || 'Location'} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={'overflow-hidden border-b border-gray-800 bg-gray-950 ' + consumerClass}
      style={wrapperStyle}
    >
      <div ref={containerRef} style={innerStyle} />

      {/* Region label tag — top-left corner. Always rendered when we
          have a label, regardless of pin/halo behavior. Sits in a
          consistent position on every report page. */}
      {regionLabel && (
        <div
          style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, pointerEvents: 'none' }}
        >
          <RegionBadge label={regionLabel} />
        </div>
      )}

      {/* Bottom scrim for legibility */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 48,
          pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(10,10,20,0.85) 0%, transparent 100%)',
        }}
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

function buildNearbyDotElement(slug: string, title: string, distanceKm: number): HTMLSpanElement {
  // V10.8.J.2 — non-interactive context dot. Previously this was a
  // clickable <a href="/report/{slug}"> which let the report-page map
  // pull the reader away from the article they're currently reading.
  // The map header is meant to convey "this case happened here, and
  // here are nearby ones" — navigation belongs to the Related Reports
  // section below the article. Render as a plain <span> with a
  // hover-only tooltip via the title attribute and pointer-events
  // disabled at the layer level so dragging/clicking the map is
  // unaffected.
  const distanceMi = Math.round(distanceKm * 0.621371)
  const span = document.createElement('span')
  span.title = title + ' · ' + distanceMi + ' mi away'
  span.setAttribute('aria-label', 'Nearby case: ' + title + ', ' + distanceMi + ' miles away')
  span.style.cssText = 'display:block;pointer-events:none;'

  const dot = document.createElement('span')
  dot.style.cssText =
    'display:block;width:7px;height:7px;border-radius:9999px;' +
    'background:rgba(34,211,238,0.55);border:1px solid rgba(165,243,252,0.3);' +
    'box-shadow:0 0 4px rgba(0,0,0,0.5);'
  span.appendChild(dot)

  // V10.8.J.2 — `slug` is intentionally unused now that the dot is
  // non-clickable. Reference it once so TypeScript / linters don't
  // flag it as dead code (and so a future reviewer can see we kept
  // the slug threading on purpose for hover-debug surfaces).
  void slug

  return span
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
