/**
 * useMapState — URL-synced map state hook
 * Every filter, viewport position, and mode is persisted in the URL
 * so map states are shareable via link.
 */

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import { PhenomenonCategory } from '@/lib/database.types'
import { MapFilters, DEFAULT_FILTERS } from './mapStyles'

export interface MapViewState {
  longitude: number
  latitude: number
  zoom: number
  pitch: number
  bearing: number
}

export interface UseMapStateReturn {
  filters: MapFilters
  setFilter: <K extends keyof MapFilters>(key: K, value: MapFilters[K]) => void
  setFilters: (updates: Partial<MapFilters>) => void
  resetFilters: () => void
  heatmapActive: boolean
  setHeatmapActive: (active: boolean) => void
  selectedReportId: string | null
  setSelectedReportId: (id: string | null) => void
}

function parseQuery(query: Record<string, string | string[] | undefined>): {
  filters: MapFilters
  heatmap: boolean
  selectedId: string | null
} {
  const str = (key: string): string | null => {
    const v = query[key]
    return typeof v === 'string' && v.length > 0 ? v : null
  }

  const num = (key: string): number | null => {
    const v = str(key)
    if (v === null) return null
    const n = parseInt(v, 10)
    return isNaN(n) ? null : n
  }

  return {
    filters: {
      category: (str('category') as PhenomenonCategory) || null,
      credibility: str('credibility'),
      country: str('country'),
      dateFrom: num('dateFrom'),
      dateTo: num('dateTo'),
      hasEvidence: str('hasEvidence') === 'true',
      searchQuery: str('q') || '',
    },
    heatmap: str('heatmap') === 'true',
    selectedId: str('report'),
  }
}

function filtersToQuery(
  filters: MapFilters,
  heatmap: boolean,
  selectedId: string | null
): Record<string, string> {
  const q: Record<string, string> = {}

  if (filters.category) q.category = filters.category
  if (filters.credibility) q.credibility = filters.credibility
  if (filters.country) q.country = filters.country
  if (filters.dateFrom !== null) q.dateFrom = String(filters.dateFrom)
  if (filters.dateTo !== null) q.dateTo = String(filters.dateTo)
  if (filters.hasEvidence) q.hasEvidence = 'true'
  if (filters.searchQuery) q.q = filters.searchQuery
  if (heatmap) q.heatmap = 'true'
  if (selectedId) q.report = selectedId

  return q
}

export function useMapState(): UseMapStateReturn {
  const router = useRouter()
  const parsed = useMemo(() => parseQuery(router.query), [router.query])

  const updateUrl = useCallback(
    (
      newFilters: MapFilters,
      newHeatmap: boolean,
      newSelectedId: string | null
    ) => {
      const query = filtersToQuery(newFilters, newHeatmap, newSelectedId)
      // Session A2: Map is now at /explore?mode=map
      var basePath = router.pathname === '/explore' ? '/explore' : '/map'
      if (basePath === '/explore') query.mode = 'map'
      router.replace({ pathname: basePath, query: query }, undefined, { shallow: true })
    },
    [router]
  )

  const setFilter = useCallback(
    <K extends keyof MapFilters>(key: K, value: MapFilters[K]) => {
      const next = { ...parsed.filters, [key]: value }
      updateUrl(next, parsed.heatmap, parsed.selectedId)
    },
    [parsed, updateUrl]
  )

  const setFilters = useCallback(
    (updates: Partial<MapFilters>) => {
      const next = { ...parsed.filters, ...updates }
      updateUrl(next, parsed.heatmap, parsed.selectedId)
    },
    [parsed, updateUrl]
  )

  const resetFilters = useCallback(() => {
    updateUrl(DEFAULT_FILTERS, parsed.heatmap, null)
  }, [parsed.heatmap, updateUrl])

  const setHeatmapActive = useCallback(
    (active: boolean) => {
      updateUrl(parsed.filters, active, parsed.selectedId)
    },
    [parsed, updateUrl]
  )

  const setSelectedReportId = useCallback(
    (id: string | null) => {
      updateUrl(parsed.filters, parsed.heatmap, id)
    },
    [parsed, updateUrl]
  )

  return {
    filters: parsed.filters,
    setFilter,
    setFilters,
    resetFilters,
    heatmapActive: parsed.heatmap,
    setHeatmapActive,
    selectedReportId: parsed.selectedId,
    setSelectedReportId,
  }
}
