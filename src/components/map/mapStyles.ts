/**
 * Map style constants and shared types for the Paradocs Global Map
 * Uses MapLibre GL with MapTiler basemap tiles
 */

import { PhenomenonCategory } from '@/lib/database.types'

// ─── Basemap ───────────────────────────────────────────────
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY
export const MAPTILER_STYLE_URL = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`

export const BASEMAP_STYLES: Record<string, string> = {
  dark: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`,
  satellite: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
  terrain: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`,
}

// ─── Initial View ──────────────────────────────────────────
export const INITIAL_VIEW = {
  longitude: -40,
  latitude: 30,
  zoom: 2.2,
  pitch: 0,
  bearing: 0,
} as const

export const MAP_BOUNDS = {
  minZoom: 1.5,
  maxZoom: 18,
} as const

// ─── Category Marker Colors (hex for MapLibre expressions) ─
export const CATEGORY_COLORS: Record<PhenomenonCategory, string> = {
  ufos_aliens: '#22c55e',       // green-500
  cryptids: '#f59e0b',          // amber-500
  ghosts_hauntings: '#a855f7',  // purple-500
  psychic_phenomena: '#3b82f6', // blue-500
  consciousness_practices: '#6366f1', // indigo-500
  psychological_experiences: '#ec4899', // pink-500
  biological_factors: '#10b981', // emerald-500
  perception_sensory: '#06b6d4', // cyan-500
  religion_mythology: '#eab308', // yellow-500
  esoteric_practices: '#8b5cf6', // violet-500
  combination: '#9ca3af',       // gray-400
}

export const CATEGORY_ICONS: Record<PhenomenonCategory, string> = {
  ufos_aliens: '🛸',
  cryptids: '🦶',
  ghosts_hauntings: '👻',
  psychic_phenomena: '🔮',
  consciousness_practices: '🧘',
  psychological_experiences: '🧠',
  biological_factors: '🧬',
  perception_sensory: '👁️',
  religion_mythology: '⚡',
  esoteric_practices: '✨',
  combination: '🔄',
}

// ─── Cluster Styling ───────────────────────────────────────
export const CLUSTER_COLORS = {
  small: '#6366f1',   // indigo - 2-9 reports
  medium: '#8b5cf6',  // violet - 10-99
  large: '#a855f7',   // purple - 100-999
  massive: '#c084fc',  // purple-400 - 1000+
} as const

export const CLUSTER_SIZES = {
  small: 32,
  medium: 40,
  large: 50,
  massive: 60,
} as const

// ─── Heatmap Colors ────────────────────────────────────────
export const HEATMAP_COLORS = [
  'interpolate', ['linear'], ['heatmap-density'],
  0, 'rgba(0,0,0,0)',
  0.1, 'rgba(103,58,183,0.3)',
  0.3, 'rgba(33,150,243,0.5)',
  0.5, 'rgba(76,175,80,0.6)',
  0.7, 'rgba(255,152,0,0.7)',
  1.0, 'rgba(244,67,54,0.85)',
] as const

// ─── Timeline ──────────────────────────────────────────────
export const TIMELINE = {
  min: 1400,
  max: new Date().getFullYear(),
  eras: [
    { label: 'All Time', from: null, to: null },
    { label: 'Pre-Modern', from: null, to: 1899 },
    { label: '1900–1950', from: 1900, to: 1950 },
    { label: '1950–2000', from: 1950, to: 2000 },
    { label: '2000+', from: 2000, to: null },
  ],
} as const

// ─── GeoJSON Types ─────────────────────────────────────────
export interface ReportProperties {
  id: string
  title: string
  slug: string
  summary: string | null
  category: PhenomenonCategory
  credibility: string
  location_name: string | null
  country: string | null
  event_date: string | null
  witness_count: number | null
  has_physical_evidence: boolean
  has_photo_video: boolean
}

export interface ClusterProperties {
  cluster: true
  cluster_id: number
  point_count: number
  point_count_abbreviated: string
}

export type MapFeatureProperties = ReportProperties | ClusterProperties

export function isCluster(props: MapFeatureProperties): props is ClusterProperties {
  return 'cluster' in props && props.cluster === true
}

// ─── Map State ─────────────────────────────────────────────
export interface MapFilters {
  category: PhenomenonCategory | null
  credibility: string | null
  country: string | null
  dateFrom: number | null
  dateTo: number | null
  hasEvidence: boolean
  searchQuery: string
}

export const DEFAULT_FILTERS: MapFilters = {
  category: null,
  credibility: null,
  country: null,
  dateFrom: null,
  dateTo: null,
  hasEvidence: false,
  searchQuery: '',
}
