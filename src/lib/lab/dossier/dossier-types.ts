// V11.17.71 - Pro Dossier
//
// Type definitions for the Pro Dossier engine + viewer.
//
// The sections_json column in pro_dossiers persists a DossierSections
// object — one envelope per section. Each section carries either real
// data OR a `data_sparse: true` marker so the viewer renders an
// honest "data sparse" surface instead of fabricated numbers
// (PRO_TIER_VALIDATION_V3 §3 hard rule: every numeric claim must come
// from a real DB query, NEVER fabricated).

/** Phen-family enum used across the Archive (mirrors reports.category). */
export type PhenFamily =
  | 'cryptids'
  | 'ufos_aliens'
  | 'ghosts_hauntings'
  | 'psychic_phenomena'
  | 'esoteric_practices'
  | 'consciousness_practices'
  | 'perception_sensory'
  | 'psychological_experiences'
  | 'religion_mythology'
  | 'general'
  | 'cross_category'

/* ────────────────────────────────────────────────────────────────────── */
/* Section 1 — Closest reports                                            */
/* ────────────────────────────────────────────────────────────────────── */

export interface ClosestReport {
  id: string
  slug: string | null
  title: string
  /** ISO year (1985, 1998, etc). Null when event_date is missing. */
  year: number | null
  location_label: string
  /** Sub-pattern tag if the engine could derive one, else the parent family. */
  sub_pattern_tag: string
  /** One-line snippet from summary or description — never AI-rewritten. */
  snippet: string
  /** Composite score 0-100 used for ranking. */
  composite_score: number
  /**
   * Sub-scores so the viewer can show "5/7 signals matched" style detail.
   * Each is 0-1.
   */
  signals: {
    descriptor_overlap: number
    geo_proximity: number
    temporal_proximity: number
  }
  distance_mi: number | null
}

export interface ClosestReportsSection {
  kind: 'closest_reports'
  caption: string
  reports: ClosestReport[]
  data_sparse: boolean
  /** Total candidates considered (denominator for "5 of N"). */
  pool_size: number
}

/* ────────────────────────────────────────────────────────────────────── */
/* Section 2 — Phenomenology lineage                                      */
/* ────────────────────────────────────────────────────────────────────── */

export interface LineageInheritance {
  /** Stable identifier for the sub-pattern (e.g. "bigfoot-whoop"). */
  sub_pattern_id: string
  /** Display label for the prose ("the bigfoot-whoop sub-pattern"). */
  label: string
  /** Signals matched out of total signals defined for the sub-pattern. */
  matched_signals: number
  total_signals: number
  /** Confidence 0-1 = matched / total. */
  confidence: number
  /** Concrete signals that matched, surfaced to the viewer as cites. */
  signal_cites: string[]
}

export interface PhenLineageSection {
  kind: 'phen_lineage'
  caption: string
  inheritances: LineageInheritance[]
  data_sparse: boolean
}

/* ────────────────────────────────────────────────────────────────────── */
/* Section 3 — Geographic neighbors                                       */
/* ────────────────────────────────────────────────────────────────────── */

export interface GeoNeighborBucket {
  sub_pattern_tag: string
  count: number
}

export interface GeographicNeighborsSection {
  kind: 'geographic_neighbors'
  caption: string
  /** Configurable per phen-family — 50mi UFO/cryptid, 5mi ghost. */
  radius_mi: number
  total_count: number
  buckets: GeoNeighborBucket[]
  /** Map center for the inline map. */
  center_lat: number | null
  center_lng: number | null
  data_sparse: boolean
}

/* ────────────────────────────────────────────────────────────────────── */
/* Section 4 — Temporal neighbors                                         */
/* ────────────────────────────────────────────────────────────────────── */

export interface TemporalNeighborsSection {
  kind: 'temporal_neighbors'
  caption: string
  /** Decade label, e.g. "1990s". */
  decade_label: string | null
  decade_count: number
  /** Month label of user's event_date, e.g. "July". */
  month_label: string | null
  month_count: number
  /** Hour-of-day window label, e.g. "1–3 AM" or "evening". */
  hour_window_label: string | null
  hour_window_count: number
  data_sparse: boolean
}

/* ────────────────────────────────────────────────────────────────────── */
/* Section 5 — Descriptor matches                                         */
/* ────────────────────────────────────────────────────────────────────── */

export interface DescriptorMatch {
  /** Stable descriptor family identifier. */
  family: string
  /** Display label ("static-electricity sensation"). */
  label: string
  /** Percent of relevant reports referencing the descriptor (0-100). */
  pct: number
  /** Denominator (count of relevant reports). */
  denominator: number
  /** Numerator (count of reports referencing this descriptor). */
  numerator: number
}

export interface DescriptorMatchesSection {
  kind: 'descriptor_matches'
  caption: string
  matches: DescriptorMatch[]
  data_sparse: boolean
}

/* ────────────────────────────────────────────────────────────────────── */
/* Section 6 — Rarity percentile                                          */
/* ────────────────────────────────────────────────────────────────────── */

export interface RarityPercentileSection {
  kind: 'rarity_percentile'
  caption: string
  /** 0-100; higher = more unusual. */
  percentile: number
  /** Methodology cite — short phrase the viewer renders as a tooltip. */
  method: string
  /** Family the percentile was computed against (e.g. "bigfoot-class"). */
  family_label: string
  /** How many user-descriptors went into the comparison. */
  descriptor_count: number
  /** Sub-corpus size the percentile compares against. */
  corpus_size: number
  data_sparse: boolean
}

/* ────────────────────────────────────────────────────────────────────── */
/* Section 7 — Time-machine context                                       */
/* ────────────────────────────────────────────────────────────────────── */

export interface TimeMachineSection {
  kind: 'time_machine'
  caption: string
  event_date_iso: string | null
  /** Moon phase string + illumination percentage, when date is known. */
  moon_phase: { phase: string; illumination_pct: number } | null
  /** Active meteor shower at the date, or null. */
  meteor_shower: { name: string; rate_per_hour: number } | null
  /** Other Archive reports within 7d + 100mi window. */
  contemporaneous_reports: Array<{
    id: string
    slug: string | null
    title: string
    event_date: string | null
    distance_mi: number | null
    location_label: string
  }>
  /** Honest gap notes — engine writes the explicit "no data" sentences. */
  notes: string[]
  data_sparse: boolean
}

/* ────────────────────────────────────────────────────────────────────── */
/* The whole envelope                                                     */
/* ────────────────────────────────────────────────────────────────────── */

export interface DossierSections {
  closest_reports: ClosestReportsSection
  phen_lineage: PhenLineageSection
  geographic_neighbors: GeographicNeighborsSection
  temporal_neighbors: TemporalNeighborsSection
  descriptor_matches: DescriptorMatchesSection
  rarity_percentile: RarityPercentileSection
  time_machine: TimeMachineSection
  /** Computed metadata — surfaces in the viewer header. */
  meta: {
    user_id: string
    experience_report_id: string
    experience_title: string
    experience_location_label: string
    experience_year: number | null
    phen_family: PhenFamily
    sub_pattern_tag: string
    /** Set when the engine runs; surfaces as "Generated [date]". */
    computed_at_iso: string
    /** md5 input-signal hash; for cache-invalidation. */
    checksum: string
    /** Total Archive size at compute time (used by the > 1% growth trigger). */
    archive_size_at_compute: number
  }
}

/** Row shape returned by the dossier endpoints. */
export interface ProDossierRow {
  id: string
  user_id: string
  experience_report_id: string
  sections_json: DossierSections
  rarity_score: number | null
  checksum: string
  computed_at: string
  created_at: string
  updated_at: string
  is_public_shareable: boolean
  share_token: string | null
}
