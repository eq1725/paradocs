/**
 * Hint schema v2 — data-driven templates with computed token bindings.
 *
 * Why v2 exists (the bug v1 had)
 * ------------------------------
 * v1 Hints embedded fabricated statistics directly in body strings:
 *   - "roughly 41% use language similar to yours"
 *   - "64% are logged between midnight and 4 AM"
 *   - "31% of accounts mention a static, tingling..."
 * None of those numbers were derived from the Paradocs database. The
 * founder caught the bug and the constraint is now non-negotiable:
 *
 *    No Hint may ship containing fabricated data. Every numerical claim
 *    in a Hint body must be backed by a real query against the actual
 *    Paradocs corpus, and must update as the corpus grows.
 *
 * v2 is the structural fix:
 *
 *  1. The body is a `body_template` containing `{{token}}` placeholders.
 *  2. Each Hint declares a `data_queries` array of structured query
 *     specs (see data-query-types.ts) — one per token that needs filling.
 *  3. The runtime executes the queries against the live database, binds
 *     each result to its named token, and renders the template.
 *  4. If any required query returns null (denominator below
 *     `min_data_threshold`, no user coordinates available, etc.) the
 *     Hint is suppressed and the fallback chain takes over.
 *  5. Hints without numerical claims (purely descriptive editorial
 *     copy) have an empty `data_queries` array and render the template
 *     verbatim. They are eligible to surface as never-empty fallbacks.
 *
 * The never-empty fallback chain (v2)
 * ----------------------------------
 * The v1 schema had a Pro-only fallback Hint that explicitly told the
 * user "nothing matched your fingerprint yet." The founder killed it:
 *
 *    "I think it makes sense to avoid saying anything like this at all
 *    on any level."
 *
 * The runtime never shows a Hint that announces absence. The cadence
 * layer walks this chain on every visit:
 *
 *    Tier 1 — a data-driven Hint that qualified (sufficient N, descriptor
 *             overlap, geographic match, etc.)
 *    Tier 2 — a curated editorial Hint matching the user's phen family
 *             (no statistics — descriptive only)
 *    Tier 3 — a curated cross-category Hint (broader appeal, also no
 *             absence framing)
 *    Tier 4 — a general "exploring the archive" curiosity Hint not tied
 *             to specific user data
 *
 * Tiers 2-4 are the editorial-fallback pool. Every Hint with
 * `fallback_eligible: true` is in that pool. None of them may use
 * absence framing ("nothing matched", "no data", "your fingerprint is
 * being watched"). All of them present positive value — an editorial
 * observation, a phen-page surface they haven't seen, a cross-family
 * pattern they might recognize.
 *
 * Voice constraints (load-bearing — enforced in editorial review)
 * ---------------------------------------------------------------
 * - Documentary, matter-of-fact, comparative. The corpus is described
 *   first; the user is placed within it second.
 * - Banned phrasings: "fascinating", "spooky", "creepy", "weird", "you
 *   might be interested in", "fun fact", "did you know".
 * - Banned framings: any sentence asserting absence of result. No
 *   "nothing matched", no "we have nothing for you", no "your
 *   fingerprint is being watched". The fallback chain ALWAYS surfaces
 *   positive value.
 *
 * Confidence threshold for named matches
 * --------------------------------------
 * Per founder direction, named-match Hints (where a specific other user
 * is offered as a possible peer) require at minimum 3 signals from the
 * multi-signal fingerprint, and 4 signals for the first such match the
 * user is ever offered. Encoded via `named_match_requirements` on Hints
 * with the named-match CTA.
 *
 * The runtime token vocabulary
 * ----------------------------
 * The full token vocabulary is locked in data-query-types.ts under the
 * `HintToken` union. Hints may only use tokens that appear in that
 * union; adding a new token requires both a schema bump there and a
 * corresponding query kind that produces it. This file does not re-list
 * the tokens — see data-query-types.ts for the canonical list.
 *
 * Seasonal eligibility
 * --------------------
 * Hints can be eligible only inside a calendar window. The
 * `seasonal_window` field describes the window (month range, optionally
 * narrowed to days). The cadence layer suppresses seasonal Hints
 * outside their window regardless of trigger match. See seed-hints.ts
 * for the 12-month editorial calendar.
 */

import type { HintDataQuery } from './data-query-types'

/* -------------------------------------------------------------------------- */
/* Vocabularies                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Phenomenon families the auto-tagger emits at submit time. Mirrors the
 * `reports.category` enum in the database, plus `general` and
 * `cross_category` as Hint-only buckets for surfaces that span families.
 *
 * The DB-side category names are kept verbatim (psychic_phenomena,
 * esoteric_practices, etc.) so the matcher can join Hint.category
 * directly against reports.category without translation.
 *
 * Note on legacy aliases: v1 used `nde_obe`, `sleep_paralysis`,
 * `psychic`, `esoteric`. v2 unifies on the DB names. NDE/OBE accounts
 * live under `consciousness_practices`; sleep-paralysis accounts live
 * under `perception_sensory` and `psychological_experiences`.
 */
export type HintCategory =
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

/**
 * Conceptual type of the Hint — what kind of connection it draws between
 * the user's submission and the wider Archive. The runtime uses this to
 * pick a renderer (map tile, decade band, descriptor anchor, phen-page
 * preview, plain-prose card) and to balance variety across visits.
 *
 * `cross_category` is new in v2 — the explicit Hint type for patterns
 * that span multiple phen families.
 */
export type HintType =
  | 'pattern_match'           // user's account fits a documented sub-pattern
  | 'temporal_context'        // user's decade or season aligns with a corpus cluster
  | 'geographic_context'      // user's location has nearby reports or sits in a cluster
  | 'phen_page_surface'       // user's account matches a phen page with an entry
  | 'anomalous_detail'        // a specific descriptor anchors to a corpus pattern
  | 'comparative_quietness'   // the user's account is rare for its region/period
  | 'cross_category'          // pattern observed across multiple phen families
  | 'cross_experience'        // pattern across multiple submissions from same user
  | 'editorial'               // pure curiosity, no statistical claim, fallback-eligible

/** Subscription gate. `free` means visible to all; `basic`/`pro` are floors. */
export type HintTierVisibility = 'free' | 'basic' | 'pro'

/**
 * How the runtime keeps this Hint fresh.
 * - `evergreen`: copy and trigger logic don't drift with archive state;
 *   no data queries.
 * - `seasonal`: re-eligible on calendar cycle (e.g. October cluster);
 *   may or may not have data queries.
 * - `data-driven`: tokens in the body re-render against live archive
 *   aggregates; runtime substitutes from the data_queries result map.
 */
export type HintFreshnessPolicy = 'evergreen' | 'seasonal' | 'data-driven'

/* -------------------------------------------------------------------------- */
/* Triggers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Structured rules describing when a Hint qualifies to fire for a user.
 * The matcher RPC reads this object and decides eligibility per-visit;
 * the cadence layer then picks one Hint from the eligible set.
 *
 * All fields are optional and AND-ed together when present. An empty
 * object plus `fallback_eligible: true` means the Hint can surface in
 * the never-empty editorial chain regardless of user signal.
 */
export interface HintTriggerConditions {
  /** Phenomenon family of the user's submission must match one of these. */
  phen_family?: HintCategory[]
  /** Optional finer-grained sub-pattern tag the auto-tagger emits. */
  subfamily?: string
  /**
   * Specific descriptor tokens that must appear in the user's account text
   * (matched case-insensitive against the auto-extracted descriptor set).
   * E.g. ["static", "tingling", "hair-stand"] for an anomalous-detail Hint.
   */
  required_descriptors?: string[]
  /** Month range (1-12, inclusive) the event must fall inside; supports seasonal Hints. */
  event_month_range?: { start_month: number; end_month: number }
  /** Decade band the event must fall inside (e.g. 1990 for "the 90s"). */
  event_decade?: number
  /** Geographic radius constraint, in miles, around the user's reported location. */
  within_miles?: number
  /** Minimum count of nearby Archive reports required for this Hint to fire. */
  min_nearby_reports?: number
  /**
   * Minimum number of independent corpus signals required. For pattern-match
   * Hints this is the multi-signal fingerprint floor. Defaults to 1 — i.e.,
   * the n=1 user qualifies for most surfaces.
   *
   * Named-match Hints (those with a `mutual_match_invite` CTA) set this to
   * 3 at minimum and 4 for the user's first such match — see
   * `named_match_requirements` below.
   */
  min_match_signals?: number
  /**
   * Minimum count of experiences the user must have submitted before this
   * Hint is eligible. Defaults to 1. Cross-experience Hints set this to 3+.
   */
  min_experience_count?: number
  /**
   * If true, this Hint can fire as part of the never-empty fallback chain
   * even when no stronger candidate qualifies. Editorial-fallback Hints
   * set this to true and present positive value — never absence framing.
   */
  fallback_eligible?: boolean
}

/**
 * Optional per-Hint named-match requirements. When the Hint's CTA is a
 * `mutual_match_invite`, the cadence layer enforces these floors before
 * surfacing the Hint. Per the founder's direction (paraphrased):
 *
 *    "Named-match confidence threshold must mitigate risk of false
 *    positives. Recommend keep at 3 signals minimum, possibly 4 for
 *    first-match cases."
 *
 * Defaults applied when this field is absent on a Hint with the
 * mutual_match_invite CTA: min_signals=3, first_match_min_signals=4.
 */
export interface NamedMatchRequirements {
  /** Minimum signal count for any named-match offer. Default 3. */
  min_signals?: number
  /**
   * Minimum signal count for the user's first named-match offer ever
   * (when their match_offer_history.length === 0). Default 4 — higher
   * floor because the first offer sets the user's expectation of how
   * strong "a match" feels in this product.
   */
  first_match_min_signals?: number
  /**
   * Which signals are MANDATORY (out of the multi-signal set) before
   * the Hint can fire. Per V3: phenomenon sub-type + geographic
   * proximity are the two we recommend always requiring; the third can
   * be any of the remaining six signals.
   */
  mandatory_signals?: Array<
    | 'phen_subfamily'
    | 'geographic_proximity'
    | 'time_proximity'
    | 'descriptor_overlap'
    | 'witness_count_or_relation'
    | 'sentiment_trajectory'
    | 'phen_adjacency'
  >
}

/* -------------------------------------------------------------------------- */
/* Seasonal eligibility                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Calendar window during which a Hint is eligible to fire. The cadence
 * layer compares the current date against this window and suppresses
 * the Hint outside it. Multiple Hints can share a window (e.g., several
 * October Hints).
 *
 * `start_month` and `end_month` are 1-12 inclusive. If `start_month`
 * is greater than `end_month`, the window wraps around the new year
 * (e.g., { start_month: 11, end_month: 2 } = Nov 1 – Feb 28).
 * Optional day fields narrow the window further (e.g., Halloween week =
 * { start_month: 10, start_day: 26, end_month: 11, end_day: 2 }).
 */
export interface SeasonalWindow {
  start_month: number       // 1-12
  start_day?: number        // 1-31; omit for "whole month"
  end_month: number         // 1-12
  end_day?: number          // 1-31; omit for "whole month"
  /**
   * Optional editorial label for the window (e.g., "Halloween cluster",
   * "Summer solstice", "Liminal Twelve Days of Yule"). Surfaced to the
   * operator dashboard, never to users.
   */
  label?: string
}

/* -------------------------------------------------------------------------- */
/* CTA                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The call-to-action attached to a Hint. The target is a route, a phen
 * slug, a mutual-match invite, or a noop — kept as a discriminated union
 * so the renderer can type-check the action and the analytics layer
 * can tag it.
 */
export type HintCta =
  | { label: string; target: { kind: 'phen_page'; slug: string } }
  | { label: string; target: { kind: 'add_detail'; field: string } }
  | { label: string; target: { kind: 'mutual_match_invite'; match_id_placeholder: true } }
  | { label: string; target: { kind: 'related_reports_view'; filter_token: string } }
  | { label: string; target: { kind: 'archive_curiosity'; topic_slug: string } }
  | { label: string; target: { kind: 'noop' } }

/* -------------------------------------------------------------------------- */
/* The Hint itself                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The data-driven Hint, v2. The `body_template` may contain `{{token}}`
 * placeholders that the runtime substitutes from the `data_queries`
 * result map. Evergreen / editorial Hints have an empty data_queries
 * array and render the template verbatim.
 *
 * Required invariants enforced at editorial review:
 *
 *  1. Every `{{token}}` in `body_template` (and `title_template` if
 *     present) MUST have a corresponding data_queries entry whose
 *     `bind_to` field equals the token name. Cross-family-overlap
 *     queries expand to the *_a / *_b / *_c tokens.
 *
 *  2. Every Hint with `freshness_policy: 'data-driven'` must have a
 *     non-empty `data_queries` array AND a `min_data_threshold` set on
 *     either the Hint or every individual query.
 *
 *  3. No `body_template` may contain absence framing ("no match",
 *     "nothing matched", "your fingerprint is being watched", etc.).
 *     Editorial reviewer to enforce.
 *
 *  4. Hints with `cross_category: true` must have `hint_type:
 *     'cross_category'` and either a `cross_family_overlap_pct` query
 *     OR a descriptive body that names the families it spans.
 */
export interface Hint {
  /** Stable identifier. Convention: `<category>.<type>.<short-slug>`. */
  id: string

  category: HintCategory
  hint_type: HintType

  /**
   * One-line hook. May contain `{{tokens}}` like the body; the runtime
   * substitutes them the same way. If null, the renderer derives a
   * title from the body's first sentence.
   */
  title_template: string

  /**
   * 1-2 sentences of context. May contain `{{tokens}}` that the runtime
   * substitutes from the data_queries result map.
   */
  body_template: string

  /**
   * Structured query specs that the render layer executes to produce
   * token values. Empty for editorial / evergreen Hints whose body
   * contains no placeholders.
   */
  data_queries: HintDataQuery[]

  /**
   * Minimum size of the underlying corpus subset for ANY data_query in
   * this Hint to qualify. If set, the runtime overrides each query's
   * default min_denominator with this value. Use when the Hint as a
   * whole should be suppressed below a certain N regardless of which
   * sub-query was tightest.
   */
  min_data_threshold?: number

  /**
   * Short human description of what the Hint's underlying queries
   * measure, for debug surfaces and the future "see how this was
   * computed" affordance. Operator-facing only, never rendered to users.
   */
  provenance_description: string

  /**
   * True when the Hint draws a pattern across multiple phen families
   * (e.g., shadow figures appearing in sleep paralysis AND haunting
   * AND abduction reports). Used by the cadence layer to ensure
   * cross-category variety in the rotation.
   */
  cross_category: boolean

  trigger_conditions: HintTriggerConditions
  /** Present when this is a named-match Hint (CTA = mutual_match_invite). */
  named_match_requirements?: NamedMatchRequirements

  /** Calendar window the Hint is eligible during. Omit for year-round Hints. */
  seasonal_window?: SeasonalWindow

  cta: HintCta
  tier_visibility: HintTierVisibility
  freshness_policy: HintFreshnessPolicy

  /**
   * Optional editorial note for the operator pool. Not surfaced to users.
   * Use this to document why a Hint exists, what corpus signal it leans
   * on, or any review caveats.
   */
  editorial_note?: string
}

/* -------------------------------------------------------------------------- */
/* Helpers re-exported for the runtime / pool / index                          */
/* -------------------------------------------------------------------------- */

export type { HintDataQuery } from './data-query-types'
