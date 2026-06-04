/**
 * Hint data-query types — the discriminated union the renderer executes
 * to produce token values for data-driven Hints.
 *
 * Why this file exists
 * --------------------
 * v1 of the Hints system shipped Hints with fabricated percentages baked
 * into the body strings ("roughly 41% use language similar to yours",
 * "64% are logged between midnight and 4 AM"). The founder caught this.
 * The fix is structural: every numerical claim in a Hint body must be
 * produced at render time by a query against the live Paradocs database,
 * and the Hint must be suppressed when the underlying corpus subset is
 * too small to ground the claim.
 *
 * Each Hint declares an array of HintDataQuery specs. At render time the
 * runtime executes each query, produces a value, and binds it to a named
 * token (`{{whoop_match_pct}}`, `{{nearby_count_within_50mi}}`, etc.).
 * If any required query returns `null` (insufficient data, or below the
 * Hint's min_data_threshold) the runtime falls through to the next Hint
 * in the never-empty fallback chain (see hint-schema.ts header).
 *
 * Database grounding (probed 2026-06-04 against 170,675 approved reports)
 * ----------------------------------------------------------------------
 * - category enum: cryptids, ufos_aliens, ghosts_hauntings, psychic_phenomena,
 *   esoteric_practices, consciousness_practices, perception_sensory,
 *   psychological_experiences, religion_mythology
 * - event_date present on ~93k rows; event_time present on 4 rows ONLY
 *   (so time-of-day queries must lean on extracted descriptors or
 *   witness_state_at_event, NOT a clock field)
 * - latitude/longitude on ~43k rows; state_province on ~30k; country on ~44k
 * - phenomenon_type_id on ~9k rows (linkable to 140-row phenomenon_types
 *   table); tags column richly populated; paradocs_assessment JSON on 100%
 * - witness_state_at_event enum: awake_alert, sleeping, drowsy_falling_asleep,
 *   driving, meditation, intoxicated, physical_activity, unspecified
 * - decade distribution skewed modern (2020s 49k, 2010s 34k, 2000s 5k,
 *   1990s 2k, 1980s 1.2k, older decades very sparse)
 *
 * Every query kind below names the table(s) and predicate it computes
 * against in its `provenance` comment, so a future "see how this was
 * computed" affordance can render the explanation to the user without
 * the runtime having to re-derive the description.
 *
 * Naming convention for query kinds
 * ---------------------------------
 * `<measure>_<scope>` — measure first (pct, count, ratio, date, list),
 * scope second (family, subpattern, region, descriptor, window). Token
 * names follow the same convention so the binding is obvious at the call
 * site: a `subpattern_match_pct` query binds to `{{<subpattern>_match_pct}}`.
 */

import type { HintCategory } from './hint-schema'

/**
 * The set of descriptor families the AI auto-extracts from a report's
 * narrative (via the paradocs_assessment pipeline) and stores as token
 * keys. Hints reference these by name; the runtime joins against the
 * extracted descriptor map.
 *
 * Locked vocabulary — adding a new descriptor family requires both a
 * schema bump here and a corresponding extractor in the assessment
 * pipeline. New entries: append, never reorder.
 */
export type DescriptorFamily =
  | 'static_electricity'      // static, tingling, hair-stand, prickle
  | 'low_hum'                  // low hum, throbbing, vibration, drone
  | 'whoop_vocalization'       // whoop, howl, call (cryptid auditory)
  | 'shadow_figure'            // shadow, figure, presence, standing
  | 'tunnel_imagery'           // tunnel, corridor, passage (NDE / sleep paralysis)
  | 'being_of_light'           // light, luminous figure, radiant
  | 'time_distortion'          // time slowed, time stopped, missing time
  | 'metallic_taste'           // metal taste, copper tongue
  | 'odor_sulphur'             // sulphur, rotten eggs, burning smell
  | 'paralysis_onset'          // can't move, frozen, locked
  | 'observed_from_above'      // looking down, ceiling view, above body
  | 'electromagnetic_disturbance' // lights flicker, watch stopped, electronics
  | 'animal_reaction'          // dog barking, horse spooked, cat hiding
  | 'three_note_pattern'       // groups-of-three, triadic, three-tone
  | 'craft_shape_triangle'     // triangle, V-formation, boomerang
  | 'craft_shape_disc'         // disc, saucer, plate
  | 'craft_shape_orb'          // orb, sphere, ball-of-light
  | 'witness_drowsy'           // hypnagogic, half-asleep, falling-asleep
  | 'witness_paired_or_more'   // shared event, family-witnessed
  | 'apparition_residential'   // home, house, bedroom (haunting locus)
  | 'recurring_location'       // happens again, same place, same room

/** Witness state at event — pulls directly from reports.witness_state_at_event. */
export type WitnessState =
  | 'awake_alert'
  | 'sleeping'
  | 'drowsy_falling_asleep'
  | 'meditation'
  | 'driving'
  | 'intoxicated'
  | 'physical_activity'

/**
 * The Hint runtime locks a token vocabulary at this layer. Every Hint
 * body that contains `{{token_name}}` MUST have a data_queries entry
 * whose `bind_to` field equals `token_name`. Type-checked at runtime
 * (see render layer); enumerated here for editorial visibility.
 *
 * Naming rules:
 * - snake_case
 * - `_pct` suffix for percentages (0-100, integer)
 * - `_count` suffix for raw integer counts
 * - `_mi` suffix for distances in miles
 * - `_date` suffix for ISO-yyyy-mm-dd strings
 * - `_decade` suffix for integer decades (e.g., 1990)
 * - `_region` suffix for human-readable place strings
 * - `_label` suffix for renderable descriptor labels
 */
export type HintToken =
  // pattern_match
  | 'subpattern_match_pct'
  | 'subpattern_total_count'
  | 'subpattern_label'
  // descriptor anchors
  | 'descriptor_pct'
  | 'descriptor_total_count'
  | 'descriptor_label'
  | 'descriptor_family_label'
  // geographic
  | 'nearby_count_within_50mi'
  | 'nearby_count_within_100mi'
  | 'closest_match_date'
  | 'closest_match_distance_mi'
  | 'state_region_label'
  | 'state_region_count'
  // decade / temporal
  | 'event_decade'
  | 'decade_share_pct'
  | 'decade_rank_label'
  | 'event_month_label'
  | 'event_season_label'
  // cross-family
  | 'cross_family_a_pct'
  | 'cross_family_b_pct'
  | 'cross_family_c_pct'
  | 'cross_family_a_label'
  | 'cross_family_b_label'
  | 'cross_family_c_label'
  | 'cross_progression_pct'
  // witness state
  | 'witness_state_pct'
  | 'witness_state_label'
  // archive growth
  | 'archive_growth_count_30d'
  | 'archive_total_count'
  // sparseness / region
  | 'region_decade_subpattern_count'
  | 'corpus_sub_baseline_label'
  // sub-pattern arms (for cross-family Hints rendering 3 percentages)
  | 'family_match_label'

/** A query's runtime output binding — what token in the body it fills. */
export interface BindToken {
  bind_to: HintToken
}

/**
 * Optional minimum N for the query's denominator. The runtime evaluates
 * the query; if the denominator falls below `min_denominator`, the query
 * returns null and the Hint is suppressed. Defaults vary by query kind
 * (see comments on each variant).
 */
export interface MinDenominator {
  min_denominator?: number
}

/* -------------------------------------------------------------------------- */
/* Discriminated union — one variant per kind of runtime computation          */
/* -------------------------------------------------------------------------- */

/**
 * Percentage of reports inside a phen family that match a descriptor
 * family (extracted from paradocs_assessment.descriptors).
 *
 * Provenance: SELECT COUNT(*) FROM reports WHERE category = <family>
 *   AND paradocs_assessment ->> 'descriptors' contains <descriptor_family>
 *   / SELECT COUNT(*) FROM reports WHERE category = <family>.
 *
 * If `user_descriptor_overlap: true`, the matcher additionally requires
 * the user's own submission to contain at least one descriptor in the
 * named family before the Hint is eligible (binds to the user's account
 * rather than a constant claim).
 */
export interface QSubpatternMatchPct extends BindToken, MinDenominator {
  kind: 'subpattern_match_pct'
  phen_family: HintCategory
  subfamily?: string          // optional finer subfamily slug
  descriptor_family: DescriptorFamily
  user_descriptor_overlap?: boolean
  /** Default min_denominator: 100 */
}

/**
 * Count of reports in a phen family that match a descriptor family,
 * without computing a ratio. Used when the Hint wants to surface a
 * raw N ("the catalogue holds 412 sleep-paralysis accounts that
 * describe a figure at the bedside").
 *
 * Provenance: same predicate as subpattern_match_pct; returns COUNT(*).
 * Default min_denominator (i.e., the count itself must clear): 30.
 */
export interface QDescriptorCount extends BindToken, MinDenominator {
  kind: 'descriptor_count'
  phen_family: HintCategory
  descriptor_family: DescriptorFamily
  /** Default min_denominator: 30 */
}

/**
 * Count of approved reports within `radius_mi` of the user's submitted
 * coordinates (and optionally within the same phen family).
 *
 * Provenance: SELECT COUNT(*) FROM reports WHERE status='approved'
 *   AND haversine(latitude, longitude, :user_lat, :user_lon) <= radius_mi
 *   [AND category = <phen_family>].
 *
 * Suppression rule: returns null if the user's submission has no
 * coordinates, OR if the count is below `min_denominator` (default 3).
 */
export interface QGeographicProximityCount extends BindToken, MinDenominator {
  kind: 'geographic_proximity_count'
  radius_mi: 50 | 100 | 200
  phen_family?: HintCategory
  /** Default min_denominator: 3 */
}

/**
 * Metadata about the single closest geographic match (date + distance).
 * Binds two tokens — date and distance — under a single query. The
 * runtime returns null if no match exists within 500 mi.
 *
 * Provenance: SELECT event_date, haversine(...) AS dist FROM reports
 *   WHERE status='approved' AND category = <family>
 *   AND latitude IS NOT NULL ORDER BY dist ASC LIMIT 1.
 */
export interface QClosestMatchMeta {
  kind: 'closest_match_meta'
  phen_family: HintCategory
  bind_date_to: 'closest_match_date'
  bind_distance_to: 'closest_match_distance_mi'
  max_radius_mi?: number      // suppress if no match within this radius (default 500)
}

/**
 * Percentage of a phen family's reports inside a decade band.
 *
 * Provenance: SELECT COUNT(*) WHERE category=<family> AND
 *   EXTRACT(decade FROM event_date) = <decade> / SELECT COUNT(*) WHERE
 *   category=<family> AND event_date IS NOT NULL.
 *
 * Suppression: null if family has fewer than 200 dated reports.
 */
export interface QDecadeDistributionPct extends BindToken, MinDenominator {
  kind: 'decade_distribution_pct'
  phen_family: HintCategory
  /** If unset, the user's submission's decade is used at render time. */
  decade?: number
  /** Default min_denominator: 200 */
}

/**
 * Percentage of dated reports in a phen family (or all families) that
 * fall inside a calendar window (start_month..end_month inclusive).
 *
 * NB: month-of-event distributions on the corpus are noisy because
 * year-only `event_date` values fall back to January 1; the runtime
 * is responsible for excluding such fallbacks (event_date_precision
 * != 'year-only') before computing this percentage.
 *
 * Provenance: SELECT COUNT(*) WHERE EXTRACT(month FROM event_date)
 *   BETWEEN start_month AND end_month [AND category=<family>]
 *   AND event_date_precision != 'year-only'
 *   / SELECT COUNT(*) WHERE event_date IS NOT NULL AND
 *   event_date_precision != 'year-only' [AND category=<family>].
 *
 * Suppression: null if denominator < 500 (seasonal claims need a real N).
 */
export interface QMonthWindowPct extends BindToken, MinDenominator {
  kind: 'month_window_pct'
  phen_family?: HintCategory
  start_month: number   // 1-12
  end_month: number     // 1-12
  /** Default min_denominator: 500 */
}

/**
 * Count of reports inside a month window, optionally scoped by phen
 * family and/or region. Used by seasonal Hints that want a raw count
 * rather than a percentage ("214 Halloween-week accounts in the
 * Archive — your 2014 submission is one of them").
 *
 * Provenance: same as month_window_pct but COUNT not ratio.
 */
export interface QMonthWindowCount extends BindToken, MinDenominator {
  kind: 'month_window_count'
  phen_family?: HintCategory
  start_month: number
  end_month: number
  start_day?: number
  end_day?: number
  /** Default min_denominator: 50 */
}

/**
 * The cross-family hero query — emits up to three (label, pct) pairs
 * showing the share of each family's reports that reference the same
 * descriptor. Used to render Hints like "Shadow figures appear in
 * sleep paralysis (X%), ghost hauntings (Y%), and abductions (Z%)."
 *
 * Provenance: for each family in `families`, run subpattern_match_pct
 * against `descriptor_family`. Suppresses (returns null) if ANY family
 * has fewer than 100 reports (so the comparison isn't drawn from noise).
 *
 * The runtime binds the results in array order to the *_a/_b/_c tokens.
 */
export interface QCrossFamilyOverlapPct {
  kind: 'cross_family_overlap_pct'
  descriptor_family: DescriptorFamily
  families: [HintCategory, HintCategory] | [HintCategory, HintCategory, HintCategory]
  bind_to: 'cross_family_set'   // sentinel — runtime expands to *_a/_b/_c bindings
  min_denominator_per_family?: number   // default 100
}

/**
 * Percentage of multi-experience users who, after submitting a
 * report in `from_family`, later submitted a report in `to_family`.
 * Computed over the constellation_artifacts + reports join scoped to
 * users with >=2 submissions.
 *
 * Provenance: WITH multi AS (SELECT submitted_by FROM reports WHERE
 *   submitted_by IS NOT NULL GROUP BY submitted_by HAVING COUNT(*)>=2)
 *   SELECT COUNT(...) per-user logic — see scripts/hints/queries.
 *
 * Suppression: null if multi-experience user cohort < 100.
 */
export interface QCrossProgressionPct extends BindToken, MinDenominator {
  kind: 'cross_progression_pct'
  from_family: HintCategory
  to_family: HintCategory
  /** Default min_denominator: 100 */
}

/**
 * Sparseness query — returns the count of approved reports matching
 * the user's region+decade+(optionally)subpattern. Bind the integer
 * to a token like `{{region_decade_subpattern_count}}` so the body
 * can say "your account is one of N from this region and decade".
 *
 * Provenance: SELECT COUNT(*) FROM reports WHERE state_province = :user_state
 *   AND EXTRACT(decade FROM event_date) = :user_decade [AND
 *   paradocs_assessment->'subpatterns' ?| <subpattern_slugs>].
 *
 * No min_denominator — sparseness queries are MEANT to surface low N.
 * Surface only when count <= sparseness_max (default 10).
 */
export interface QRegionDecadeSparseness extends BindToken {
  kind: 'region_decade_sparseness'
  phen_family?: HintCategory
  subfamily?: string
  /** Maximum count for this Hint to be eligible — sparseness gate. */
  sparseness_max?: number   // default 10
}

/**
 * Count of reports ingested into the Archive within the last N days,
 * optionally filtered by phen family. Used by editorial-fallback
 * Hints that surface archive growth as ambient context ("3,400 new
 * accounts were added to the Archive this month").
 *
 * Provenance: SELECT COUNT(*) FROM reports WHERE created_at >= NOW()
 *   - INTERVAL '<n> days' AND status='approved' [AND category=<family>].
 *
 * Suppression: null if count < min_denominator (default 100, raised
 * for fallback Hints that need a non-trivial number).
 */
export interface QArchiveGrowthCount extends BindToken, MinDenominator {
  kind: 'archive_growth_count'
  days: 7 | 30 | 90
  phen_family?: HintCategory
  /** Default min_denominator: 100 */
}

/**
 * Total count of approved reports in the Archive (or in a family).
 * Used by editorial Hints and by data-driven Hints that want to
 * surface scale.
 *
 * Provenance: SELECT COUNT(*) FROM reports WHERE status='approved'
 *   [AND category=<family>].
 *
 * No min_denominator — this query never suppresses; the Archive
 * always has reports.
 */
export interface QArchiveTotalCount extends BindToken {
  kind: 'archive_total_count'
  phen_family?: HintCategory
}

/**
 * Percentage of reports in a phen family whose witness_state_at_event
 * equals a specific enum value. Lets us draw claims like "of sleep
 * paralysis accounts, X% are logged with witness_state drowsy_falling_asleep".
 *
 * Provenance: SELECT COUNT(*) FROM reports WHERE witness_state_at_event = :state
 *   AND category = <family> / SELECT COUNT(*) WHERE category = <family>.
 *
 * Default min_denominator: 200.
 */
export interface QWitnessStatePct extends BindToken, MinDenominator {
  kind: 'witness_state_pct'
  phen_family: HintCategory
  witness_state: WitnessState
  /** Default min_denominator: 200 */
}

/**
 * Count of approved reports whose state_province (or country, if
 * `scope: 'country'`) matches the user's submission, scoped to a
 * phen family.
 *
 * Provenance: SELECT COUNT(*) FROM reports WHERE state_province = :user_state
 *   AND category = <family>.
 *
 * Suppression: null if user submission has no state_province (or
 * country, depending on scope).
 */
export interface QRegionCount extends BindToken, MinDenominator {
  kind: 'region_count'
  scope: 'state_province' | 'country'
  phen_family?: HintCategory
  /** Default min_denominator: 5 */
}

/* -------------------------------------------------------------------------- */
/* The exported discriminated union                                            */
/* -------------------------------------------------------------------------- */

/**
 * Discriminated union of every supported Hint data query. The Hint
 * `data_queries` array holds zero or more of these. Zero means the
 * Hint is purely editorial (no statistical claim; descriptive prose
 * only — body has no `{{token}}` placeholders).
 *
 * To add a new query kind:
 *  1. Define an interface above (extend BindToken + MinDenominator as needed)
 *  2. Add the variant to the union below
 *  3. Implement the runtime executor in src/lib/lab/hints/runtime/queries.ts
 *  4. Document the provenance SQL in the interface comment
 */
export type HintDataQuery =
  | QSubpatternMatchPct
  | QDescriptorCount
  | QGeographicProximityCount
  | QClosestMatchMeta
  | QDecadeDistributionPct
  | QMonthWindowPct
  | QMonthWindowCount
  | QCrossFamilyOverlapPct
  | QCrossProgressionPct
  | QRegionDecadeSparseness
  | QArchiveGrowthCount
  | QArchiveTotalCount
  | QWitnessStatePct
  | QRegionCount

/**
 * Default min_denominator per query kind. The runtime consults this map
 * when a Hint omits an explicit override. Centralized here so editorial
 * review can scan one table to understand suppression thresholds.
 */
export const DEFAULT_MIN_DENOMINATOR: Record<HintDataQuery['kind'], number> = {
  subpattern_match_pct: 100,
  descriptor_count: 30,
  geographic_proximity_count: 3,
  closest_match_meta: 1,
  decade_distribution_pct: 200,
  month_window_pct: 500,
  month_window_count: 50,
  cross_family_overlap_pct: 100,
  cross_progression_pct: 100,
  region_decade_sparseness: 0, // sparseness is a max-cap, not a min
  archive_growth_count: 100,
  archive_total_count: 0,
  witness_state_pct: 200,
  region_count: 5,
}
