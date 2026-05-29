'use client'

/**
 * WorldMapBackdrop — V11.17.41 (rev 3)
 *
 * Renders the same MapTiler dataviz-dark map used on located report
 * pages, zoomed to a full world view with no pin / marker / halo. The
 * "Location · Not on record" copy sits inside a backdrop-blurred,
 * brand-purple-bordered card so the text reads cleanly while the map
 * behind it remains clearly visible.
 *
 * V11.17.41 rev-3 (operator iteration — "I want to see the map"):
 *   Rev-2 dropped the heavy vignette so the map COULD be visible, but
 *   the operator was still seeing pure black behind the card. Root
 *   cause: maplibre was being initialised synchronously inside
 *   useEffect, but at first paint the parent's h-[35vh] hasn't
 *   resolved (viewport-relative height before layout settles), so the
 *   container had clientWidth/clientHeight = 0. maplibre init against
 *   a 0×0 element never fetches tiles and never recovers, even after
 *   the ResizeObserver later reports correct dimensions.
 *
 *   Fix: defer maplibre init until the container has non-zero
 *   dimensions. ResizeObserver watches the container; once it gains
 *   width AND height, init runs once. 1-second safety fallback covers
 *   the (unlikely) case where ResizeObserver never fires.
 *
 *   Also: ocean-blue parent background (#0d1c2e — the same flat ocean
 *   colour the dataviz-dark style uses) instead of bg-gray-950 so even
 *   if maplibre fails to load, the band reads as a map at a glance.
 *   Console.warn surfaces both the missing-API-key case and the init-
 *   threw case for easy debugging.
 *
 * Map config notes:
 *   - center=[12, 10] — balanced view, no continent dominates.
 *   - zoom=1.1 — continent shapes read at 22-35vh band height.
 *   - interactive=false + all drag/zoom/touch off — decorative band.
 *   - Admin-border overlays mirror ReportLocationMap so country lines
 *     match other report pages exactly.
 */

import React, { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || ''
// V11.17.41 rev-9 — Switched WorldMapBackdrop's style from dataviz-dark
// to streets-v2-dark. dataviz-dark renders land and ocean in nearly
// identical dark shades (the style is intentionally subdued for use
// as a base under data overlays — markers, pins, heatmaps). For the
// "no-location" backdrop we have nothing to overlay, so the map read
// as a uniform dark surface and the operator legitimately couldn't
// see continents. streets-v2-dark keeps the same overall dark
// register but paints land in a distinctly lighter gray-blue against
// the ocean. Located report pages keep dataviz-dark — pins + halos
// provide their own contrast there.
const MAP_STYLE = MAPTILER_KEY
  ? 'https://api.maptiler.com/maps/streets-v2-dark/style.json?key=' + MAPTILER_KEY
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

function addAdminBorderOverlays(map: maplibregl.Map) {
  // V11.17.41 rev-7 — Borders thickened + opacity bumped at world zoom
  // levels (1-3). Without this, dataviz-dark at zoom 1.1 paints continents
  // in colors nearly identical to the ocean — the operator saw the band
  // as a flat dark surface even though tiles were loading fine. Brighter,
  // thicker country lines give the eye edges to lock onto.
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
          'line-opacity': 0.55,
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            1, 0.6, 3, 1.2, 5, 1.8, 7, 2.4, 10, 3.0,
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
          'line-opacity': 1.0,
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            1, 1.4, 3, 2.0, 5, 2.6, 7, 3.0, 10, 3.4,
          ],
        },
      }, firstSymbolId)
    }
  } catch (e) {
    console.warn('[WorldMapBackdrop] addLayer overlay failed:', e)
  }
}

export default function WorldMapBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  // V11.17.41 rev-5 — Track per-init resources so we can dispose them
  // when re-initialising on a new container (hydration recovery).
  const disposeInitResourcesRef = useRef<(() => void) | null>(null)

  // V11.17.41 rev-5 — Hydration-recovery-resistant init.
  //
  // Diagnostic logs in rev-4 revealed maplibre WAS successfully
  // initialising on the first render, but React was then re-rendering
  // the entire root in response to a hydration mismatch (#418/#423,
  // caused upstream by MetaMask's SES injection mutating the DOM
  // before React could hydrate). The re-render wiped the original
  // <div ref={containerRef}> that maplibre had attached to and
  // mounted a fresh empty one. The map instance in mapRef became
  // orphaned on a DOM node no longer in the page; the visible new
  // div had no canvas.
  //
  // useEffect with [] deps only fires once per mount, so it never
  // ran a second time to recover. Fix: use a deps-less effect (runs
  // after every render) that detects when the container DOM node
  // has changed and re-initialises the map onto the new node. The
  // common case — map already attached to the current container —
  // is an immediate no-op.

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (!MAPTILER_KEY) {
      console.warn('[WorldMapBackdrop] NEXT_PUBLIC_MAPTILER_KEY missing — map will not render')
      return
    }
    // No-op fast path: map already attached to the current container.
    if (mapRef.current && mapRef.current.getContainer() === el) return
    // Container changed (post-hydration-recovery re-render) or first
    // init. Dispose orphaned map + its per-init resources, then init
    // fresh on the new node.
    if (disposeInitResourcesRef.current) {
      try { disposeInitResourcesRef.current() } catch (_e) { /* ignore */ }
      disposeInitResourcesRef.current = null
    }
    if (mapRef.current) {
      try { mapRef.current.remove() } catch (_e) { /* ignore */ }
      mapRef.current = null
    }

    let disposed = false
    let readyDisposer: (() => void) | null = null
    let resizeObserverForResizes: ResizeObserver | null = null
    let initWatcher: ResizeObserver | null = null
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null

    const initMap = () => {
      if (disposed) return
      if (mapRef.current) return
      if (!containerRef.current) return
      try {
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: MAP_STYLE,
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

        readyDisposer = whenMapReady(map, () => {
          try { map.resize() } catch (_e) { /* ignore */ }
          addAdminBorderOverlays(map)
        })

        // Keep the canvas sized to the container as the viewport changes.
        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
          resizeObserverForResizes = new ResizeObserver(() => {
            try { map.resize() } catch (_e) { /* ignore */ }
          })
          resizeObserverForResizes.observe(containerRef.current)
        }
        requestAnimationFrame(() => {
          try { map.resize() } catch (_e) { /* ignore */ }
        })
      } catch (e) {
        console.warn('[WorldMapBackdrop] maplibre init failed:', e)
      }
    }

    // If the container already has non-zero dimensions, init immediately.
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      initMap()
    } else if (typeof ResizeObserver !== 'undefined') {
      // Otherwise wait for layout to settle. Init once the container has
      // both width and height — maplibre against a 0×0 canvas never
      // fetches tiles, and a later resize doesn't recover.
      initWatcher = new ResizeObserver((entries) => {
        if (mapRef.current) return
        for (const entry of entries) {
          const w = entry.contentRect.width
          const h = entry.contentRect.height
          if (w > 0 && h > 0) {
            try { initWatcher?.disconnect() } catch (_e) { /* ignore */ }
            initMap()
            return
          }
        }
      })
      initWatcher.observe(el)
      // Safety net: if ResizeObserver never fires (it should, but just
      // in case), try init after 1s anyway.
      fallbackTimer = setTimeout(() => {
        if (mapRef.current) return
        initMap()
      }, 1000)
    } else {
      // No ResizeObserver support: best-effort delayed init.
      fallbackTimer = setTimeout(initMap, 100)
    }

    // V11.17.41 rev-5 — Store per-init resource disposer in a ref
    // instead of returning it as the effect's cleanup. We DON'T want
    // React's automatic cleanup-before-next-effect-run to tear the map
    // down when this effect re-runs harmlessly (which it now does on
    // every render to detect container changes). The final unmount
    // cleanup useEffect below uses this ref to dispose properly.
    disposeInitResourcesRef.current = () => {
      disposed = true
      if (readyDisposer) { try { readyDisposer() } catch (_e) { /* ignore */ } }
      if (resizeObserverForResizes) { try { resizeObserverForResizes.disconnect() } catch (_e) { /* ignore */ } }
      if (initWatcher) { try { initWatcher.disconnect() } catch (_e) { /* ignore */ } }
      if (fallbackTimer !== null) { clearTimeout(fallbackTimer) }
    }
    // No cleanup function returned — see comment above.
  })  // V11.17.41 rev-5 — No deps array: runs after every render so
      // the container-change check can detect React's hydration recovery
      // (which mounts a fresh DOM node for the same component).

  // V11.17.41 rev-5 — Final unmount cleanup. Only runs when the
  // component is actually being removed, not on every render.
  useEffect(() => {
    return () => {
      if (disposeInitResourcesRef.current) {
        try { disposeInitResourcesRef.current() } catch (_e) { /* ignore */ }
        disposeInitResourcesRef.current = null
      }
      if (mapRef.current) {
        try { mapRef.current.remove() } catch (_e) { /* ignore */ }
        mapRef.current = null
      }
    }
  }, [])

  return (
    <div
      className="relative h-[22vh] sm:h-[35vh] min-h-[180px] max-h-[340px] overflow-hidden border-b border-gray-800/60"
      // V11.17.41 rev-3 — Ocean-blue parent background instead of
      // bg-gray-950. This is the same flat ocean colour the dataviz-
      // dark style uses, so even if maplibre fails to load (missing
      // API key, init race, etc) the band still reads as a map-shaped
      // chrome surface rather than a void.
      style={{ background: '#0d1c2e' }}
    >
      {/* Real map — streets-v2-dark (see MAP_STYLE comment for why
          this surface uses a different style than located reports). */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />

      {/* V11.17.41 rev-7 — Global dim removed entirely. dataviz-dark at
          zoom 1.1 is already very dark; layering even a 0.28 alpha black
          gradient on top made the map indistinguishable from the
          ocean-blue parent background. The brand-purple admin borders
          (with rev-7's higher opacity + line-width) now carry the visual
          register; the card's own background takes the contrast burden. */}

      {/* V11.17.41 rev-7 — Tight brand-purple glow centred behind the
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
