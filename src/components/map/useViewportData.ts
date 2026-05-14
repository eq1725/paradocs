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
        // Synthetic-coord reports (country/state centroid fallbacks)
        // are excluded here so they don't pile up at shared centroids
        // and create misleading clusters (the "57 at Kansas" bug).
        // Those reports surface as honest aggregate counts via
        // /api/map/region-counts → regionBuckets below.
        const { data, error: dbError } = await supabase
          .from('reports')
          .select(
            'id,title,slug,summary,category,latitude,longitude,location_name,country,country_code,event_date,credibility,witness_count,has_physical_evidence,has_photo_video,coords_synthetic,metadata'
          )
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .eq('status', 'approved')
          .or('coords_synthetic.is.null,coords_synthetic.eq.false')
          .order('created_at', { ascending: false })
          .limit(50000)

        if (cancelled) return

        if (dbError) {
          setError(dbError.message)
          setLoading(false)
          return
        }

        const reportMap = new Map<string, ReportProperties>()
        const points: ReportPoint[] = (data || [])
          .filter((r: any) => r.latitude && r.longitude)
          .map((r: any) => {
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
          })

        reportMapRef.current = reportMap
        setAllReports(points)
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load map data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchReports()
    return () => { cancelled = true }
  }, [fetchKey])

  // ─── V10.9.A — fetch region totals for synthetic-coord reports ────
  //
  // Hits /api/map/region-counts which reads the report_region_counts
  // materialized view. Server-side aggregation so this scales cleanly
  // to 1M+ reports during mass ingest. Cached at the edge for 5 min.
  useEffect(() => {
    let cancelled = false
    async function fetchRegionCounts() {
      try {
        const resp = await fetch('/api/map/region-counts?level=country')
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
  }, [fetchKey])

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
