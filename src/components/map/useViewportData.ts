/**
 * useViewportData — Fetches report data from Supabase and manages
 * Supercluster for client-side clustering.
 *
 * Tier 1 approach: loads all geocoded reports into memory, clusters client-side.
 * Scale path: swap to viewport-based server queries when > 50K reports.
 */

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import Supercluster from 'supercluster'
import { supabase } from '@/lib/supabase'
import { PhenomenonCategory } from '@/lib/database.types'
import { MapFilters, ReportProperties } from './mapStyles'

type ReportPoint = GeoJSON.Feature<GeoJSON.Point, ReportProperties>
type ClusterFeature = Supercluster.ClusterFeature<ReportProperties> | Supercluster.PointFeature<ReportProperties>
type AnyClusterFeature = ClusterFeature

/** Bounding box of all data points [west, south, east, north] */
export type DataBounds = [number, number, number, number] | null

/**
 * V10.9.A — region-totals bucket from /api/map/region-counts.
 * Represents reports whose coords are synthetic (country/state
 * centroid fallbacks) — these intentionally don't appear on the
 * pin layer to avoid the false-cluster pile-up bug. The
 * RegionTotalsPanel renders them as honest aggregate counts.
 */
export interface RegionBucket {
  code: string                 // ISO 3166-1 alpha-2
  name: string
  state?: string
  total: number
  by_category: Record<string, number>
}

interface UseViewportDataReturn {
  /** All features (clusters + individual points) for current viewport */
  features: any[]
  /** Raw unclustered points as GeoJSON (for heatmap) */
  allPointsGeoJSON: GeoJSON.FeatureCollection
  /** Total number of reports loaded (pre-filter) */
  totalReports: number
  /** Number of reports matching current filters */
  filteredCount: number
  /** Category counts for the current filtered data */
  categoryCounts: Record<string, number>
  /** Top countries by report count */
  topCountries: { name: string; count: number }[]
  /** V10.9.A — region buckets from synthetic-coord reports (NOT on the pin layer). */
  regionBuckets: RegionBucket[]
  /** V10.9.A — total count of synthetic-coord reports (sum of regionBuckets totals). */
  regionTotalCount: number
  /** Data bounds for auto-fitting the map */
  dataBounds: DataBounds
  /** Year histogram (all reports, pre-filter) for timeline sparkline */
  yearHistogram: { year: number; count: number }[]
  /** Loading state */
  loading: boolean
  /** Error message if any */
  error: string | null
  /** Supercluster instance for expansion zoom lookups */
  supercluster: Supercluster<ReportProperties> | null
  /** Get a specific report by ID */
  getReport: (id: string) => ReportProperties | undefined
  /** Refetch data */
  refetch: () => void
}

const SUPERCLUSTER_OPTIONS: Supercluster.Options<ReportProperties, any> = {
  radius: 60,
  maxZoom: 16,
  minZoom: 0,
  minPoints: 2,
}

export function useViewportData(
  filters: MapFilters,
  bounds: [number, number, number, number] | null, // [west, south, east, north]
  zoom: number
): UseViewportDataReturn {
  const [allReports, setAllReports] = useState<ReportPoint[]>([])
  const [regionBuckets, setRegionBuckets] = useState<RegionBucket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchKey, setFetchKey] = useState(0)

  const reportMapRef = useRef<Map<string, ReportProperties>>(new Map())

  // ─── Fetch all geocoded reports from Supabase ────────────
  useEffect(() => {
    let cancelled = false

    async function fetchReports() {
      setLoading(true)
      setError(null)

      try {
        // V10.9.A — pin layer fetches PRECISE-COORD reports only.
        // V11.14 — REVERSED the V11 exclusion of synthetic-coord
        // reports. The original concern was that 50+ country-centroid
        // pins piling up at the same point would look like a real
        // cluster. But:
        //   1. With V11.10+ filters + first-class admin curation, the
        //      "57 at Kansas" defaulting bug is impossible — country
        //      defaults were removed in V11.8 and bogus locations are
        //      structurally nulled in V11.11. Synthetic coords now
        //      only appear when the source genuinely points to a
        //      country with no city/state signal.
        //   2. The map's fuzzy-halo layer (location_precision='country'
        //      / 'state') renders synthetic-coord reports at lower
        //      opacity + larger radius — visually distinct from
        //      precise pins, so users can tell.
        //   3. The V11.11 coincident-pin popup handles the rare case
        //      of multiple country-precision reports at the same
        //      centroid by showing a list.
        // Net: country-precision reports now show as halos on the
        // map (Italy, India, etc.). Both choropleth + halo paths
        // are populated.
        // V11.15.0 — Paginate around Supabase's PostgREST 5000-row
        // cap. Previously `.limit(50000)` silently returned only the
        // first 5,000 rows.
        //
        // V11.15.0.1 — PROGRESSIVE loading. The first version of
        // pagination waited for ALL pages to finish before flipping
        // loading=false, which meant ~4-10s of "Loading map data"
        // before any pins showed. Now each page commits to state as
        // it arrives so pins stream in incrementally:
        //   - First page (1000 newest reports) flips loading=false
        //     and the map becomes interactive immediately.
        //   - Subsequent pages append to allReports — the map
        //     re-renders with more pins as each lands.
        //   - The choropleth + region totals are already on screen
        //     during this phase (they load from a separate fast API).
        const PAGE_SIZE = 1000
        const HARD_CAP = 50000

        // Helper: convert a page of raw DB rows to ReportPoints.
        const reportMap = new Map<string, ReportProperties>()
        const rowToPoint = (r: any): ReportPoint | null => {
          if (!r.latitude || !r.longitude) return null
          const props: ReportProperties = {
            id: r.id,
            title: r.title,
            slug: r.slug,
            summary: r.summary,
            category: r.category,
            credibility: r.credibility || 'unverified',
            location_name: r.location_name,
            country: r.country,
            event_date: r.event_date,
            event_date_precision: r.event_date_precision,
            witness_count: r.witness_count,
            has_physical_evidence: r.has_physical_evidence || false,
            has_photo_video: r.has_photo_video || false,
            source_type: r.source_type || null,
            location_precision: (r.metadata && r.metadata.location_precision) || null,
          }
          reportMap.set(r.id, props)
          return {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [parseFloat(r.longitude), parseFloat(r.latitude)],
            },
            properties: props,
          }
        }

        let pageStart = 0
        let isFirstPage = true
        while (pageStart < HARD_CAP) {
          const pageEnd = Math.min(pageStart + PAGE_SIZE - 1, HARD_CAP - 1)
          const res = await supabase
            .from('reports')
            .select(
              'id,title,slug,summary,category,latitude,longitude,location_name,country,country_code,event_date,event_date_precision,credibility,witness_count,has_physical_evidence,has_photo_video,coords_synthetic,metadata'
            )
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .range(pageStart, pageEnd)
          if (cancelled) return
          if (res.error) {
            setError(res.error.message)
            if (!cancelled) setLoading(false)
            return
          }
          const rows = res.data || []
          const pagePoints: ReportPoint[] = []
          for (const r of rows) {
            const p = rowToPoint(r)
            if (p) pagePoints.push(p)
          }
          reportMapRef.current = reportMap
          // Append to state. setAllReports with a function form means
          // React batches updates correctly across awaits.
          if (isFirstPage) {
            setAllReports(pagePoints)
            setLoading(false)  // Map becomes interactive after first page
            isFirstPage = false
          } else {
            setAllReports(prev => prev.concat(pagePoints))
          }
          if (rows.length < PAGE_SIZE) break  // exhausted
          pageStart += PAGE_SIZE
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load map data')
          setLoading(false)
        }
      }
    }

    fetchReports()
    return () => { cancelled = true }
  }, [fetchKey])

  // ─── V10.9.A / V11.15.1 — fetch region totals for choropleth ──────
  //
  // Hits /api/map/region-counts which reads the report_region_counts
  // materialized view. Server-side aggregation so this scales cleanly
  // to 1M+ reports during mass ingest. Cached at the edge for 5 min.
  //
  // V11.15.1 — Filter-aware choropleth. When the user has an active
  // category filter, refetch region counts with ?category= so the
  // choropleth re-tints to show per-country density FOR THAT CATEGORY
  // (e.g. cryptid hotspots show Mexico+Brazil prominently while UFO
  // hotspots show the US). Per SME panel Persona B (Data Viz): the
  // choropleth should reflect what the user is currently looking at,
  // not a static total.
  useEffect(() => {
    let cancelled = false
    async function fetchRegionCounts() {
      try {
        let url = '/api/map/region-counts?level=country'
        if (filters.category) {
          url += '&category=' + encodeURIComponent(filters.category)
        }
        const resp = await fetch(url)
        if (!resp.ok) {
          if (!cancelled) setRegionBuckets([])
          return
        }
        const data = await resp.json()
        if (!cancelled) setRegionBuckets(data.buckets || [])
      } catch (_e) {
        if (!cancelled) setRegionBuckets([])
      }
    }
    fetchRegionCounts()
    return () => { cancelled = true }
  }, [fetchKey, filters.category])

  // ─── Filter reports ──────────────────────────────────────
  const filteredReports = useMemo(() => {
    let reports = allReports

    if (filters.category) {
      reports = reports.filter((r) => r.properties.category === filters.category)
    }

    if (filters.credibility) {
      reports = reports.filter((r) => r.properties.credibility === filters.credibility)
    }

    if (filters.country) {
      reports = reports.filter((r) => r.properties.country === filters.country)
    }

    if (filters.dateFrom !== null) {
      reports = reports.filter((r) => {
        if (!r.properties.event_date) return false
        const year = new Date(r.properties.event_date).getFullYear()
        return year >= filters.dateFrom!
      })
    }

    if (filters.dateTo !== null) {
      reports = reports.filter((r) => {
        if (!r.properties.event_date) return false
        const year = new Date(r.properties.event_date).getFullYear()
        return year <= filters.dateTo!
      })
    }

    if (filters.hasEvidence) {
      reports = reports.filter(
        (r) => r.properties.has_physical_evidence || r.properties.has_photo_video
      )
    }

    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase()
      reports = reports.filter(
        (r) =>
          r.properties.title.toLowerCase().includes(q) ||
          (r.properties.summary?.toLowerCase().includes(q)) ||
          (r.properties.location_name?.toLowerCase().includes(q))
      )
    }

    return reports
  }, [allReports, filters])

  // ─── Build Supercluster index ────────────────────────────
  const supercluster = useMemo(() => {
    if (filteredReports.length === 0) return null

    const index = new Supercluster<ReportProperties>(SUPERCLUSTER_OPTIONS)
    index.load(filteredReports)
    return index
  }, [filteredReports])

  // ─── Get clusters for current viewport ───────────────────
  const features = useMemo(() => {
    if (!supercluster || !bounds) return []

    try {
      return supercluster.getClusters(bounds, Math.floor(zoom))
    } catch {
      return []
    }
  }, [supercluster, bounds, zoom])

  // ─── Raw points as GeoJSON for heatmap ────────────────────
  const allPointsGeoJSON = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: filteredReports as GeoJSON.Feature[],
    }),
    [filteredReports]
  )

  // ─── Category counts for stats display ─────────────────────
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of filteredReports) {
      const cat = r.properties.category
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [filteredReports])

  // ─── Top countries ──────────────────────────────────────────
  const topCountries = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of filteredReports) {
      const country = r.properties.country
      if (country) {
        counts[country] = (counts[country] || 0) + 1
      }
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [filteredReports])

  // ─── Year histogram (all reports, not filtered) ─────────────
  const yearHistogram = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const r of allReports) {
      const dateStr = r.properties.event_date
      if (!dateStr) continue
      const year = new Date(dateStr).getFullYear()
      if (year >= 1800 && year <= new Date().getFullYear()) {
        counts[year] = (counts[year] || 0) + 1
      }
    }
    return Object.entries(counts)
      .map(([y, c]) => ({ year: parseInt(y), count: c }))
      .sort((a, b) => a.year - b.year)
  }, [allReports])

  // ─── Data bounds for auto-fit ───────────────────────────────
  const dataBounds = useMemo((): DataBounds => {
    if (allReports.length === 0) return null

    let west = 180, south = 90, east = -180, north = -90
    for (const r of allReports) {
      const [lng, lat] = r.geometry.coordinates
      if (lng < west) west = lng
      if (lng > east) east = lng
      if (lat < south) south = lat
      if (lat > north) north = lat
    }
    // Add a small padding
    const lngPad = (east - west) * 0.05
    const latPad = (north - south) * 0.05
    return [west - lngPad, south - latPad, east + lngPad, north + latPad]
  }, [allReports])

  const getReport = useCallback(
    (id: string) => reportMapRef.current.get(id),
    []
  )

  const refetch = useCallback(() => setFetchKey((k) => k + 1), [])

  // V10.9.A — filter region buckets by the active category filter
  // so the panel stays in sync with the rest of the map UI.
  const filteredRegionBuckets = useMemo(() => {
    if (!filters.category) return regionBuckets
    const cat = filters.category
    return regionBuckets
      .map(b => ({
        ...b,
        total: b.by_category[cat] || 0,
      }))
      .filter(b => b.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [regionBuckets, filters.category])

  const regionTotalCount = useMemo(
    () => filteredRegionBuckets.reduce((acc, b) => acc + b.total, 0),
    [filteredRegionBuckets],
  )

  return {
    features,
    allPointsGeoJSON,
    totalReports: allReports.length,
    filteredCount: filteredReports.length,
    categoryCounts,
    topCountries,
    regionBuckets: filteredRegionBuckets,
    regionTotalCount,
    dataBounds,
    yearHistogram,
    loading,
    error,
    supercluster,
    getReport,
    refetch,
  }
}
