'use client'

/**
 * WorldMapBackdrop — V11.17.41
 *
 * Renders the same MapTiler dataviz-dark map used on located report
 * pages, zoomed to a full world view with no pin / marker / halo, and
 * overlays "Location not specified" centered on top with a brand-
 * purple gradient treatment so the missing-data state reads as
 * deliberate editorial restraint, not as a load failure.
 *
 * V11.17.41 changes (operator iteration after CITD-week QA):
 *   - center moved from [0, 20] → [12, 10]. The old centre put Africa
 *     prominently in the visible band, which read as "this is an
 *     Africa report" at a glance. The new centre balances Africa /
 *     Eurasia / Americas / Pacific so no single continent dominates.
 *   - zoom dropped from 1.2 → 0.8 so the curve of the earth across
 *     hemispheres reads at a glance — more "global", less "regional".
 *   - Brand-purple gradient layer added over the map vignette so the
 *     band reads as Paradocs editorial chrome, not as a generic
 *     fallback. Combined treatment (Lena's recommendation from the #5
 *     panel applied here too — "card style, not absence").
 *   - Typography pushed larger + Changa serif on the headline to match
 *     the editorial register of the rest of the report page chrome.
 *
 * Why a real maplibre instance instead of static SVG:
 *   Chase 2026-05-27 — "the map needs to match the map same style we
 *   have on other report pages." The hand-drawn silhouette didn't.
 *   We pay the maplibre cost (already in the bundle if any other
 *   report page session has been visited; otherwise lazy-loaded via
 *   the same dynamic import) and the tile fetches for zoom 0-1
 *   (~50KB of vector tiles), and get pixel-identical styling.
 *
 * Map config notes:
 *   - interactive=false + all drag/zoom/touch off — this is a
 *     decorative band, not a navigable map.
 *   - Admin-border overlays added the same way ReportLocationMap
 *     does so country/state edges read consistently.
 *   - Brand-purple gradient + dim vignette over the map for contrast.
 */

import React, { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || ''
const MAP_STYLE = MAPTILER_KEY
  ? 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=' + MAPTILER_KEY
  : ''

function whenMapReady(map: maplibregl.Map, fn: () => void): () => void {
  let done = false
  const run = () => {
    if (done) return
    done = true
    map.off('styledata', onData)
    clearTimeout(timer)
    try { fn() } catch (e) { console.warn('[WorldMapBackdrop] ready fn threw:', e) }
  }
  const onData = () => { if (map.isStyleLoaded()) run() }
  if (map.isStyleLoaded()) {
    Promise.resolve().then(run)
    return () => { done = true }
  }
  map.on('styledata', onData)
  const timer = setTimeout(run, 600)
  return () => { done = true; map.off('styledata', onData); clearTimeout(timer) }
}

export default function WorldMapBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || !MAPTILER_KEY) return
    if (mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      // V11.17.41 — balanced global centre. [12, 10] keeps Africa, the
      // Americas, Eurasia, and the Pacific roughly proportional in the
      // visible band so the view reads as "global, no specific region"
      // rather than the old [0, 20] which read as Africa-centric.
      center: [12, 10],
      zoom: 0.8,
      attributionControl: false,
      interactive: false,
      dragPan: false,
      dragRotate: false,
      scrollZoom: false,
      doubleClickZoom: false,
      touchPitch: false,
    })
    mapRef.current = map

    const dispose = whenMapReady(map, () => {
      try { map.resize() } catch (_e) { /* ignore */ }
      // Mirror ReportLocationMap's admin-border overlays so this view
      // looks like the same map style rather than a bare base layer.
      try {
        const style = map.getStyle()
        const firstSymbolId = style?.layers?.find((L: any) => L.type === 'symbol')?.id
        if (!map.getLayer('paradocs-admin1-overlay')) {
          map.addLayer({
            id: 'paradocs-admin1-overlay',
            type: 'line',
            source: 'maptiler_planet',
            'source-layer': 'boundary',
            filter: ['all', ['in', 'admin_level', 3, 4], ['==', 'maritime', 0]],
            paint: {
              'line-color': '#c4b5fd',
              'line-opacity': 0.9,
              'line-width': [
                'interpolate', ['linear'], ['zoom'],
                3, 0.8, 5, 1.6, 7, 2.2, 10, 3.0,
              ],
            },
          }, firstSymbolId)
        }
        if (!map.getLayer('paradocs-admin0-overlay')) {
          map.addLayer({
            id: 'paradocs-admin0-overlay',
            type: 'line',
            source: 'maptiler_planet',
            'source-layer': 'boundary',
            filter: ['all', ['==', 'admin_level', 2], ['==', 'maritime', 0], ['==', 'disputed', 0]],
            paint: {
              'line-color': '#ddd6fe',
              'line-opacity': 0.95,
              'line-width': [
                'interpolate', ['linear'], ['zoom'],
                1, 0.8, 3, 1.5, 6, 2.3, 10, 3.2,
              ],
            },
          }, firstSymbolId)
        }
      } catch (e) {
        console.warn('[WorldMapBackdrop] addLayer overlay failed:', e)
      }
    })

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        try { map.resize() } catch (_e) { /* ignore */ }
      })
      resizeObserver.observe(containerRef.current)
    }
    requestAnimationFrame(() => {
      try { map.resize() } catch (_e) { /* ignore */ }
    })

    return () => {
      dispose()
      try { resizeObserver?.disconnect() } catch (_e) { /* ignore */ }
      try { map.remove() } catch (_e) { /* ignore */ }
      mapRef.current = null
    }
  }, [])

  return (
    <div className="relative h-[22vh] sm:h-[35vh] min-h-[180px] max-h-[340px] overflow-hidden border-b border-gray-800/60 bg-gray-950">
      {/* Real map — same dataviz-dark style as located reports */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />

      {/* V11.17.41 — Dim vignette PLUS brand-purple radial wash so the
          band reads as deliberate editorial chrome (Paradocs colour
          identity) rather than a load-failure fallback. The two
          layers stack: the dark vignette establishes contrast for the
          overlay text, and the purple wash carries brand register. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(2,6,23,0.42) 0%, rgba(2,6,23,0.72) 60%, rgba(2,6,23,0.85) 100%)' }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 55%, rgba(144,0,240,0.22) 0%, rgba(144,0,240,0.10) 35%, transparent 65%)' }}
        aria-hidden="true"
      />

      {/* Foreground text — sits on top of the map + gradients */}
      <div className="relative h-full flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#c4b5fd] mb-2 font-medium">Location</p>
          <p className="font-display text-xl sm:text-2xl font-semibold text-gray-50 tracking-tight" style={{ letterSpacing: '-0.005em' }}>Not on record</p>
          <p className="text-[11px] sm:text-xs text-gray-300/80 mt-2.5 leading-relaxed max-w-sm mx-auto">
            The witness did not record where this took place &mdash; or the geography hasn&apos;t been extracted from the source yet.
          </p>
        </div>
      </div>
    </div>
  )
}
