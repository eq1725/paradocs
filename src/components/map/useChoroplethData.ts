/**
 * useChoroplethData — V10.9.B
 *
 * Hook for the explore-map's country choropleth layer. Combines:
 *   1. Natural Earth 110m admin0 GeoJSON polygons (lazy-fetched from
 *      a stable CDN, cached in-memory for the session)
 *   2. The region-counts API response (synthetic-coord report
 *      aggregates from V10.9.A's materialized view)
 *
 * Output: a GeoJSON FeatureCollection where each country polygon
 * carries `properties.country_code`, `properties.country_name`, and
 * `properties.report_count`. MapLibre's fill paint expression
 * reads `report_count` to pick a color.
 *
 * Design choices (V10.9.B SME panel):
 *   - Lazy fetch on first enable (saves ~100KB for users who never
 *     turn choropleth on).
 *   - In-memory cache only — the GeoJSON is static, so reloading
 *     during a session is wasteful, but we don't need localStorage
 *     since the browser cache will hold the response across pages.
 *   - ISO_A2 matching against our country_code column. Fall back to
 *     ISO_A2_EH (Natural Earth's "extended hierarchy" version) for
 *     a few special cases (Norway, France) where the standard
 *     ISO_A2 is "-99".
 *   - Disputed / unclaimed territories with ISO_A2 = "-99" and no
 *     ISO_A2_EH are skipped — no matching counts and no rendering.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RegionBucket } from './useViewportData'

// Natural Earth 110m admin0 — public domain, well-known, stable URL.
// ~100KB, ~250 countries, includes ISO_A2 / ISO_A2_EH / NAME.
const ADMIN0_GEOJSON_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'

// Module-level cache so multiple consumers in the same session
// don't refetch.
let geojsonCache: GeoJSON.FeatureCollection | null = null
let geojsonInFlight: Promise<GeoJSON.FeatureCollection | null> | null = null

async function loadAdmin0Geojson(): Promise<GeoJSON.FeatureCollection | null> {
  if (geojsonCache) return geojsonCache
  if (geojsonInFlight) return geojsonInFlight
  geojsonInFlight = (async () => {
    try {
      const resp = await fetch(ADMIN0_GEOJSON_URL)
      if (!resp.ok) {
        console.warn('[choropleth] admin0 GeoJSON fetch non-200:', resp.status)
        return null
      }
      const data = (await resp.json()) as GeoJSON.FeatureCollection
      if (!data || data.type !== 'FeatureCollection') return null
      geojsonCache = data
      return data
    } catch (e) {
      console.warn('[choropleth] admin0 GeoJSON fetch error:', e)
      return null
    } finally {
      geojsonInFlight = null
    }
  })()
  return geojsonInFlight
}

interface ChoroplethProperties {
  country_code: string
  country_name: string
  report_count: number
  /** True when we have an aggregated count > 0 (drives the paint expr). */
  has_data: boolean
}

interface UseChoroplethDataReturn {
  /** FeatureCollection joined with counts; ready to feed MapLibre. */
  geojson: GeoJSON.FeatureCollection | null
  /** Max report_count across all features (for color-scale normalization). */
  maxCount: number
  /** True while the underlying GeoJSON is loading. */
  loading: boolean
  /** V11.15.0 — Quantile thresholds for 5-bucket discrete classification.
   *  Each entry is the upper bound (inclusive) for that bucket index.
   *  Example: [2, 8, 30, 250, 4000] means bucket0=1-2, bucket1=3-8,
   *  bucket2=9-30, bucket3=31-250, bucket4=251-4000. Pass to the paint
   *  expression to map report_count to a discrete color step.
   *  Used for the on-map legend, too. */
  quantiles: number[]
}

/**
 * @param buckets    RegionBucket[] from /api/map/region-counts (via
 *                   useViewportData). Each entry is one country.
 * @param enabled    When false, returns nulls without fetching the
 *                   GeoJSON (saves ~100KB until the user opts in).
 */
export function useChoroplethData(
  buckets: RegionBucket[],
  enabled: boolean,
): UseChoroplethDataReturn {
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [loading, setLoading] = useState(false)

  // Lazy-load when first enabled.
  useEffect(() => {
    if (!enabled) return
    if (geojson) return
    let cancelled = false
    setLoading(true)
    loadAdmin0Geojson().then(data => {
      if (cancelled) return
      setGeojson(data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [enabled, geojson])

  // Build the joined feature collection. Recomputed whenever buckets
  // change (e.g. ingestion adds rows, category filter changes).
  const joined = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!geojson) return null
    const byCode: Record<string, RegionBucket> = {}
    for (const b of buckets) {
      if (b.code) byCode[b.code.toUpperCase()] = b
    }
    const newFeatures: GeoJSON.Feature[] = []
    for (const f of geojson.features) {
      const props = (f.properties || {}) as Record<string, any>
      let code: string | null = null
      if (typeof props.ISO_A2 === 'string' && props.ISO_A2 !== '-99') code = props.ISO_A2
      else if (typeof props.ISO_A2_EH === 'string' && props.ISO_A2_EH !== '-99') code = props.ISO_A2_EH
      if (!code) continue
      const upper = code.toUpperCase()
      const bucket = byCode[upper] || null
      const name = bucket ? bucket.name : (props.NAME || props.ADMIN || code)
      const count = bucket ? bucket.total : 0
      newFeatures.push({
        ...f,
        properties: {
          country_code: upper,
          country_name: name,
          report_count: count,
          has_data: count > 0,
        } as ChoroplethProperties,
      })
    }
    return { type: 'FeatureCollection', features: newFeatures }
  }, [geojson, buckets])

  const maxCount = useMemo(() => {
    if (!buckets || buckets.length === 0) return 0
    return buckets.reduce((m, b) => Math.max(m, b.total), 0)
  }, [buckets])

  // V11.15.0 — Quantile classification. With a long-tailed
  // distribution (US 4190, next ~10 countries 100-400, then 70+
  // countries < 50), the prior log-opacity ramp collapsed the bottom
  // 80% of countries to indistinguishable faint purple. Quantile bins
  // by rank give every tier a visibly distinct color step.
  //
  // We compute 4 cut points → 5 buckets. Bucket 0 is the lightest
  // (countries with the fewest reports); bucket 4 is the darkest.
  // The bucket cuts are at the 20/40/60/80 percentiles of the
  // distribution. Edge cases:
  //   - All zero / no data → all buckets degenerate to 0; choropleth
  //     renders nothing.
  //   - All-same count → buckets collapse but the paint expression
  //     still works (step interpolation handles ties).
  //   - One outlier → quantile naturally distributes the outlier
  //     into bucket 4 alone; the rest of the data fills 0-3.
  const quantiles = useMemo<number[]>(() => {
    const withData = buckets.filter(b => b.total > 0).map(b => b.total).sort((a, b) => a - b)
    if (withData.length === 0) return [1, 2, 3, 4, 5]  // degenerate; never hit
    const percentile = (p: number): number => {
      const idx = Math.floor((withData.length - 1) * p)
      return withData[idx]
    }
    return [
      percentile(0.2),
      percentile(0.4),
      percentile(0.6),
      percentile(0.8),
      withData[withData.length - 1],  // max
    ]
  }, [buckets])

  return {
    geojson: joined,
    maxCount,
    loading,
    quantiles,
  }
}
