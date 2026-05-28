'use client'

/**
 * WorldMapBackdrop — V11.17.39
 *
 * Renders the same MapTiler dataviz-dark map used on located report
 * pages, zoomed to a full world view with no pin / marker / halo, and
 * overlays "Location: Not specified" centered on top. The point is
 * visual continuity with the standard report header: a located report
 * and a null-location report should feel like the same page chrome,
 * with the difference being explicit text rather than a different
 * graphic.
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
 *   - center=[0, 20] — same fallback used by ReportLocationMap when
 *     coords are entirely missing, biases away from Antarctica.
 *   - zoom=1.2 — shows the full world map without aggressive
 *     letterboxing on mobile widths.
 *   - interactive=false + all drag/zoom/touch off — this is a
 *     decorative band, not a navigable map.
 *   - Admin-border overlays added the same way ReportLocationMap
 *     does so country/state edges read consistently.
 *   - A semi-opaque vignette over the map so the text overlay reads
 *     with enough contrast at the band's small height.
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
      center: [0, 20],
      zoom: 1.2,
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
    <div className="relative h-[22vh] sm:h-[35vh] min-h-[160px] max-h-[320px] overflow-hidden border-b border-gray-800/60 bg-gray-950">
      {/* Real map — same dataviz-dark style as located reports */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />

      {/* Vignette / dim layer so the overlay text reads with enough
          contrast at this band's small height. Top-down gradient
          keeps the bottom edge stronger where the text sits. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(2,6,23,0.35) 0%, rgba(2,6,23,0.65) 60%, rgba(2,6,23,0.78) 100%)' }}
        aria-hidden="true"
      />

      {/* Foreground text — sits on top of the map */}
      <div className="relative h-full flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-300 mb-1.5">Location</p>
          <p className="text-base sm:text-lg font-medium text-gray-50">Not specified</p>
          <p className="text-[11px] sm:text-xs text-gray-300/85 mt-2 leading-relaxed">
            The witness did not record where the incident took place — or the geography hasn&apos;t been extracted from the source text yet.
          </p>
        </div>
      </div>
    </div>
  )
}
