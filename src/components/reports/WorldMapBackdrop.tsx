'use client'

/**
 * WorldMapBackdrop — V11.17.41 (rev 2)
 *
 * Renders the same MapTiler dataviz-dark map used on located report
 * pages, zoomed to a full world view with no pin / marker / halo. The
 * "Location · Not on record" copy sits inside a backdrop-blurred,
 * brand-purple-bordered card so the text reads cleanly while the map
 * behind it remains clearly visible — same chrome as a located report,
 * with the difference being explicit text rather than the absence of
 * a real map.
 *
 * V11.17.41 rev-2 (operator iteration — "I want to see the map"):
 *   Rev 1 stacked a heavy black-to-near-opaque vignette (rgba 0.42 →
 *   0.85) plus a brand-purple radial wash that obscured the underlying
 *   map entirely. Visually it read as "purple void with text" instead
 *   of "world map with a deliberate brand overlay". This revision
 *   keeps the brand register but lets the map breathe:
 *     - Drops the global vignette; dimming is concentrated only behind
 *       the text card.
 *     - Replaces the wide radial wash with a tight purple glow centred
 *       on the card so the brand accent doesn't cover continents.
 *     - The "Not on record" copy moves into a backdrop-blurred panel
 *       with a brand-purple border. That panel takes the contrast
 *       burden so the surrounding map can stay at full visibility.
 *     - zoom 0.8 → 1.1 because at 0.8 continent shapes are too
 *       compressed at the band's display height to read as a globe.
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
 *   - center=[12, 10] — balanced view, no single continent dominates.
 *   - interactive=false + all drag/zoom/touch off — decorative band.
 *   - Admin-border overlays mirror ReportLocationMap so country lines
 *     match other report pages exactly.
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
      // V11.17.41 rev-2 — balanced global centre [12, 10] keeps Africa,
      // the Americas, Eurasia, and the Pacific roughly proportional
      // (no Africa-centric read). zoom bumped back from 0.8 → 1.1 so
      // continent shapes are recognisable at this band's display
      // height (22–35vh).
      center: [12, 10],
      zoom: 1.1,
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

      {/* V11.17.41 rev-2 — Light global dim ONLY, so the map stays
          clearly visible. Dimming is gentle enough that continent
          outlines and the brand-purple admin borders read at a glance.
          Heavy contrast work moves onto the centred text card below. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'rgba(2,6,23,0.28)' }}
        aria-hidden="true"
      />

      {/* V11.17.41 rev-2 — Tight brand-purple glow centred behind the
          text card. Carries brand register without covering map. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(144,0,240,0.22) 0%, rgba(144,0,240,0.08) 22%, transparent 38%)' }}
        aria-hidden="true"
      />

      {/* Foreground — text lives inside a brand-purple-bordered,
          backdrop-blurred card. The card takes the contrast burden so
          the surrounding map can stay at full visibility. */}
      <div className="relative h-full flex items-center justify-center px-6">
        <div
          className="text-center max-w-md px-7 py-5 rounded-2xl border border-purple-500/35 shadow-2xl"
          style={{
            background: 'rgba(10, 10, 20, 0.55)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px -8px rgba(144, 0, 240, 0.25), inset 0 0 0 1px rgba(196, 181, 253, 0.08)',
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#c4b5fd] mb-2 font-semibold">Location</p>
          <p className="font-display text-xl sm:text-2xl font-semibold text-white tracking-tight" style={{ letterSpacing: '-0.005em' }}>Not on record</p>
          <p className="text-[11px] sm:text-xs text-gray-200/90 mt-2.5 leading-relaxed max-w-sm mx-auto">
            The witness did not record where this took place &mdash; or the geography hasn&apos;t been extracted from the source yet.
          </p>
        </div>
      </div>
    </div>
  )
}
