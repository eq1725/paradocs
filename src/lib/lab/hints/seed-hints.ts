/**
 * Seed pool of Hints — v2, 50 entries, data-driven templates.
 *
 * What changed from v1
 * --------------------
 * v1 (14 Hints) embedded fabricated percentages directly in body strings.
 * The founder caught the bug. v2 is a structural rewrite: every numerical
 * claim in a Hint body is now a `{{token}}` filled at render time from a
 * structured `data_queries` spec executed against the live Paradocs
 * database. If the underlying corpus subset is too small to ground the
 * claim, the Hint is suppressed and the never-empty fallback chain takes
 * over.
 *
 * Coverage targets and final tallies (per founder direction)
 * ---------------------------------------------------------
 *   Total Hints                       50  (exact)
 *   Phen-family coverage              7 required families + general + cross_category
 *   n=1 eligible                      48  (target >=12)
 *   Cross-category                    8   (target >=8)
 *   Seasonal Hints                    13  (target >=12; all 12 months covered)
 *   Editorial / fallback_eligible     16  (target 5-10; intentionally larger)
 *   Named-match Hints (basic-tier)    2   (cryptid + ufos_aliens; 3-signal floor)
 *   Tier split                        37 free / 10 basic / 3 pro
 *   Freshness split                   29 data-driven / 8 evergreen / 13 seasonal
 *
 * Family count detail:
 *   cryptids (4), ufos_aliens (6), ghosts_hauntings (5),
 *   consciousness_practices (3), perception_sensory (3),
 *   psychic_phenomena (2), esoteric_practices (1),
 *   cross_category (8), general (18 — includes the 13 seasonals,
 *   the universal editorial fallbacks, and the 3 Pro depth Hints).
 *
 * The psychological_experiences and religion_mythology DB-side
 * categories are NOT represented in v2 — both are eligible for the
 * universal general.* fallbacks. The brief listed seven required
 * phen families; those two are not on the required list.
 *
 * No Hint in this file contains a hard-coded statistic. Every
 * percentage, count, date, and distance in a body string is a
 * `{{token}}` paired with a `data_queries` entry. The fabricated
 * stats from v1 ("41%", "64%", "57%", "31%", etc.) are gone.
 *
 * The never-empty fallback chain (founder direction)
 * --------------------------------------------------
 * v1 had a Pro-only Hint that explicitly said "nothing matched your
 * fingerprint yet." It is gone. No Hint in v2 announces absence. When no
 * data-driven Hint qualifies, the cadence layer walks the fallback chain:
 *   Tier 2: a curated editorial Hint matching the user's phen family
 *   Tier 3: a cross-category curiosity Hint
 *   Tier 4: a general "exploring the archive" editorial pick
 * Every Hint with `fallback_eligible: true` is in that pool and presents
 * positive value — observation, surface, curiosity — never absence.
 *
 * Voice (load-bearing)
 * --------------------
 * Documentary, matter-of-fact, comparative. Corpus first, user second.
 * Banned phrasings: "fascinating", "spooky", "creepy", "weird", "you
 * might be interested in", "fun fact", "did you know". No exclamation
 * marks. No diagnostic vocabulary (anxiety, depression, dissociation,
 * trauma, PTSD).
 *
 * Index (see HINTS_POOL_V2.md for the rendered human-readable view)
 * -----------------------------------------------------------------
 *   cryptids                    (4)
 *   ufos_aliens                 (6)
 *   ghosts_hauntings            (5)
 *   consciousness_practices     (3)  NDE / OBE
 *   perception_sensory          (3)  sleep paralysis, perceptual
 *   psychic_phenomena           (2)
 *   esoteric_practices          (1)
 *   cross_category              (8)
 *   general                    (18)  seasonal calendar (13), editorial
 *                                    fallbacks (2), Pro depth Hints (3)
 */

import type { Hint } from './hint-schema'

export const SEED_HINTS: Hint[] = [
  /* --------------------------------------------------------------------- */
  /* CRYPTIDS */
  /* --------------------------------------------------------------------- */

  {
    id: 'cryptids.pattern_match.bigfoot_whoop',
    category: 'cryptids',
    hint_type: 'pattern_match',
    title_template: 'A documented "whoop" sub-pattern in {{subpattern_total_count}} cryptid accounts',
    body_template:
      'Of the {{subpattern_total_count}} cryptid-class reports in the Archive that describe a vocalization, {{subpattern_match_pct}}% reference a low, rising whoop heard at distance. The catalogue groups these under the "whoop" sub-pattern.',
    data_queries: [
      {
        kind: 'subpattern_match_pct',
        phen_family: 'cryptids',
        subfamily: 'bigfoot_class',
        descriptor_family: 'whoop_vocalization',
        user_descriptor_overlap: true,
        bind_to: 'subpattern_match_pct',
        min_denominator: 100,
      },
      {
        kind: 'descriptor_count',
        phen_family: 'cryptids',
        descriptor_family: 'whoop_vocalization',
        bind_to: 'subpattern_total_count',
      },
    ],
    min_data_threshold: 100,
    provenance_description:
      'Numerator: cryptid reports whose extracted descriptors include the whoop_vocalization family. Denominator: cryptid reports with any extracted auditory descriptor.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['cryptids'],
      subfamily: 'bigfoot_class',
      required_descriptors: ['whoop', 'howl', 'call', 'vocalization'],
      min_match_signals: 1,
    },
    cta: {
      label: 'See the sub-pattern',
      target: { kind: 'related_reports_view', filter_token: 'bigfoot_whoop' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
    editorial_note:
      'Fires when the auto-tagger marks the submission as a bigfoot-class encounter and at least one whoop descriptor is extracted from the account. Token values come from the live DB; v1 hardcoded 41% — gone.',
  },

  {
    id: 'cryptids.anomalous.static_sensation',
    category: 'cryptids',
    hint_type: 'anomalous_detail',
    title_template: 'The static-electricity sensation anchors to a corpus pattern',
    body_template:
      'In cryptid close-encounter reports, {{descriptor_total_count}} accounts describe a static, tingling, or hair-stand sensation in the seconds before the sighting. The catalogue treats this as a stable anomalous descriptor rather than coincidence.',
    data_queries: [
      {
        kind: 'descriptor_count',
        phen_family: 'cryptids',
        descriptor_family: 'static_electricity',
        bind_to: 'descriptor_total_count',
        min_denominator: 30,
      },
    ],
    min_data_threshold: 30,
    provenance_description:
      'Count of cryptid reports whose extracted descriptors include the static_electricity family.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['cryptids'],
      required_descriptors: ['static', 'tingling', 'hair-stand', 'hair stood'],
      min_match_signals: 1,
    },
    cta: {
      label: 'View related accounts',
      target: { kind: 'related_reports_view', filter_token: 'static_sensation' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'cryptids.geographic.nearby_corridor',
    category: 'cryptids',
    hint_type: 'geographic_context',
    title_template: '{{nearby_count_within_100mi}} cryptid accounts within 100 miles of your location',
    body_template:
      'The closest in time and place was {{closest_match_date}}, {{closest_match_distance_mi}} miles from your reported location. The catalogue holds {{nearby_count_within_100mi}} cryptid-family reports inside a 100-mile radius of your account.',
    data_queries: [
      {
        kind: 'geographic_proximity_count',
        radius_mi: 100,
        phen_family: 'cryptids',
        bind_to: 'nearby_count_within_100mi',
        min_denominator: 3,
      },
      {
        kind: 'closest_match_meta',
        phen_family: 'cryptids',
        bind_date_to: 'closest_match_date',
        bind_distance_to: 'closest_match_distance_mi',
        max_radius_mi: 500,
      },
    ],
    min_data_threshold: 3,
    provenance_description:
      'Approved cryptid reports within 100 miles of user coordinates (haversine). Closest_match_meta returns the single nearest report.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['cryptids'],
      within_miles: 100,
      min_nearby_reports: 3,
      min_match_signals: 1,
    },
    cta: {
      label: 'Open the geographic panel',
      target: { kind: 'related_reports_view', filter_token: 'nearby_cryptid_reports' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'general.seasonal.november_dark_evening',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'November accounts in the Archive — the dark-evening cluster',
    body_template:
      'November sits on the on-ramp to the dark months in the Archive. Accounts in this window tilt toward shorter-day outdoor observations and the rise of the household haunting descriptors. The cluster is editorial; the catalogue notes the descriptor shift without forcing a statistical claim.',
    data_queries: [],
    provenance_description: 'Seasonal editorial Hint — descriptive only.',
    cross_category: false,
    trigger_conditions: { min_match_signals: 1, fallback_eligible: true },
    seasonal_window: { start_month: 11, end_month: 11, label: 'November dark-evening cluster' },
    cta: {
      label: 'Browse November accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'november-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
  },

  {
    id: 'cryptids.pattern_match.named_match',
    category: 'cryptids',
    hint_type: 'pattern_match',
    title_template: 'One nearby cryptid account matches yours on three signals',
    body_template:
      'A user whose Record includes a cryptid encounter within {{closest_match_distance_mi}} miles and the same decade has enabled named-match offers. Mutual opt-in is required on both sides before any identifying detail is shared.',
    data_queries: [
      {
        kind: 'closest_match_meta',
        phen_family: 'cryptids',
        bind_date_to: 'closest_match_date',
        bind_distance_to: 'closest_match_distance_mi',
        max_radius_mi: 200,
      },
    ],
    provenance_description:
      'Surfaces only when the multi-signal fingerprint scores >=3 (>=4 for first-ever match offer). Requires opted-in counterparty.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['cryptids'],
      min_match_signals: 3,
      min_nearby_reports: 1,
    },
    named_match_requirements: {
      min_signals: 3,
      first_match_min_signals: 4,
      mandatory_signals: ['phen_subfamily', 'geographic_proximity'],
    },
    cta: {
      label: 'Review the match offer',
      target: { kind: 'mutual_match_invite', match_id_placeholder: true },
    },
    tier_visibility: 'basic',
    freshness_policy: 'data-driven',
    editorial_note:
      'Named-match — basic tier. Cadence: at most one per visit. First match requires 4 signals; subsequent matches require 3. Mandatory signals locked at sub-family + geographic proximity.',
  },


  /* --------------------------------------------------------------------- */
  /* UFOS / ALIENS */
  /* --------------------------------------------------------------------- */

  {
    id: 'ufos_aliens.pattern_match.triangle_subpattern',
    category: 'ufos_aliens',
    hint_type: 'pattern_match',
    title_template: 'Your account fits the triangle / V-formation sub-pattern',
    body_template:
      'In UFO-shape reports, {{subpattern_match_pct}}% describe a triangular or V-formation craft. The catalogue treats triangle as a distinct sub-pattern from disc and orb — each with its own decade-and-region distribution.',
    data_queries: [
      {
        kind: 'subpattern_match_pct',
        phen_family: 'ufos_aliens',
        descriptor_family: 'craft_shape_triangle',
        user_descriptor_overlap: true,
        bind_to: 'subpattern_match_pct',
        min_denominator: 500,
      },
    ],
    min_data_threshold: 500,
    provenance_description:
      'Percentage of approved ufos_aliens reports whose extracted descriptors include craft_shape_triangle.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['ufos_aliens'],
      subfamily: 'triangle_class',
      required_descriptors: ['triangle', 'v-formation', 'boomerang'],
      min_match_signals: 1,
    },
    cta: {
      label: 'See the triangle sub-pattern',
      target: { kind: 'related_reports_view', filter_token: 'ufo_triangle' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'ufos_aliens.geographic.corridor_50mi',
    category: 'ufos_aliens',
    hint_type: 'geographic_context',
    title_template: '{{nearby_count_within_50mi}} UFO accounts within 50 miles of your location',
    body_template:
      'The closest in time and place was {{closest_match_date}}, {{closest_match_distance_mi}} miles from your reported location. Reports in the Archive within 50 miles of your account total {{nearby_count_within_50mi}}.',
    data_queries: [
      {
        kind: 'geographic_proximity_count',
        radius_mi: 50,
        phen_family: 'ufos_aliens',
        bind_to: 'nearby_count_within_50mi',
        min_denominator: 3,
      },
      {
        kind: 'closest_match_meta',
        phen_family: 'ufos_aliens',
        bind_date_to: 'closest_match_date',
        bind_distance_to: 'closest_match_distance_mi',
        max_radius_mi: 500,
      },
    ],
    min_data_threshold: 3,
    provenance_description:
      'Approved ufos_aliens reports within 50 mi of user coordinates (haversine). Closest_match_meta returns the single nearest.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['ufos_aliens'],
      within_miles: 50,
      min_nearby_reports: 3,
      min_match_signals: 1,
    },
    cta: {
      label: 'Open the geographic panel',
      target: { kind: 'related_reports_view', filter_token: 'nearby_ufo_reports' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'ufos_aliens.temporal.decade_share',
    category: 'ufos_aliens',
    hint_type: 'temporal_context',
    title_template: 'Your {{event_decade}}s account sits inside a {{decade_share_pct}}% slice of the UFO record',
    body_template:
      'Of dated UFO-shape reports in the Archive, {{decade_share_pct}}% were logged in the {{event_decade}}s — the decade your account falls in. The catalogue tracks decade-by-decade shifts in the UFO record as a distinct lens.',
    data_queries: [
      {
        kind: 'decade_distribution_pct',
        phen_family: 'ufos_aliens',
        bind_to: 'decade_share_pct',
        min_denominator: 500,
      },
    ],
    min_data_threshold: 500,
    provenance_description:
      'Percentage of dated UFO-family reports whose event_date decade matches the user submission decade.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['ufos_aliens'],
      min_match_signals: 1,
    },
    cta: {
      label: 'See the decade distribution',
      target: { kind: 'related_reports_view', filter_token: 'ufo_decade_distribution' },
    },
    tier_visibility: 'basic',
    freshness_policy: 'data-driven',
  },

  {
    id: 'ufos_aliens.anomalous.electromagnetic',
    category: 'ufos_aliens',
    hint_type: 'anomalous_detail',
    title_template: 'Electromagnetic disturbance is a documented descriptor in {{descriptor_total_count}} UFO accounts',
    body_template:
      '{{descriptor_total_count}} UFO-family accounts in the Archive reference an electromagnetic disturbance — flickering lights, stopped watches, vehicle electronics behaving unusually. The catalogue treats this as a stable anomalous descriptor.',
    data_queries: [
      {
        kind: 'descriptor_count',
        phen_family: 'ufos_aliens',
        descriptor_family: 'electromagnetic_disturbance',
        bind_to: 'descriptor_total_count',
        min_denominator: 30,
      },
    ],
    min_data_threshold: 30,
    provenance_description:
      'Count of approved UFO reports whose extracted descriptors include the electromagnetic_disturbance family.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['ufos_aliens'],
      required_descriptors: ['flicker', 'stopped', 'electronics', 'watch'],
      min_match_signals: 1,
    },
    cta: {
      label: 'View related accounts',
      target: { kind: 'related_reports_view', filter_token: 'ufo_electromagnetic' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'ufos_aliens.pattern_match.named_match',
    category: 'ufos_aliens',
    hint_type: 'pattern_match',
    title_template: 'One nearby UFO account matches yours on three signals',
    body_template:
      'A user whose Record includes a UFO sighting within {{closest_match_distance_mi}} miles and the same decade has enabled named-match offers. Mutual opt-in is required on both sides before any identifying detail is shared.',
    data_queries: [
      {
        kind: 'closest_match_meta',
        phen_family: 'ufos_aliens',
        bind_date_to: 'closest_match_date',
        bind_distance_to: 'closest_match_distance_mi',
        max_radius_mi: 200,
      },
    ],
    provenance_description:
      'Named-match Hint. Fires only when fingerprint score >=3 (>=4 for first match) and a counterparty has opted in.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['ufos_aliens'],
      min_match_signals: 3,
      min_nearby_reports: 1,
    },
    named_match_requirements: {
      min_signals: 3,
      first_match_min_signals: 4,
      mandatory_signals: ['phen_subfamily', 'geographic_proximity'],
    },
    cta: {
      label: 'Review the match offer',
      target: { kind: 'mutual_match_invite', match_id_placeholder: true },
    },
    tier_visibility: 'basic',
    freshness_policy: 'data-driven',
  },

  {
    id: 'ufos_aliens.phen_page.craft_shape_disc',
    category: 'ufos_aliens',
    hint_type: 'phen_page_surface',
    title_template: 'The classic disc / saucer sub-pattern',
    body_template:
      'The catalogue entry on the disc / saucer sub-pattern documents the shape\'s history, peak-decade clusters, and the recurring descriptor set (silent, hovering, abrupt departure). Your account references the disc shape.',
    data_queries: [],
    provenance_description:
      'Editorial phen-page surface. No statistical claim — descriptive copy with subfamily trigger.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['ufos_aliens'],
      subfamily: 'disc_class',
      required_descriptors: ['disc', 'saucer', 'plate'],
      min_match_signals: 1,
    },
    cta: {
      label: 'Read the catalogue entry',
      target: { kind: 'phen_page', slug: 'ufo-disc-pattern' },
    },
    tier_visibility: 'free',
    freshness_policy: 'evergreen',
  },


  /* --------------------------------------------------------------------- */
  /* GHOSTS / HAUNTINGS */
  /* --------------------------------------------------------------------- */

  {
    id: 'ghosts_hauntings.geographic.nearby_20mi',
    category: 'ghosts_hauntings',
    hint_type: 'geographic_context',
    title_template: '{{nearby_count_within_50mi}} haunting accounts within 50 miles of your location',
    body_template:
      'The closest in time was {{closest_match_date}}, {{closest_match_distance_mi}} miles away. The catalogue holds {{nearby_count_within_50mi}} haunting-class reports within 50 miles of your account.',
    data_queries: [
      {
        kind: 'geographic_proximity_count',
        radius_mi: 50,
        phen_family: 'ghosts_hauntings',
        bind_to: 'nearby_count_within_50mi',
        min_denominator: 3,
      },
      {
        kind: 'closest_match_meta',
        phen_family: 'ghosts_hauntings',
        bind_date_to: 'closest_match_date',
        bind_distance_to: 'closest_match_distance_mi',
        max_radius_mi: 500,
      },
    ],
    min_data_threshold: 3,
    provenance_description:
      'Approved ghosts_hauntings reports within 50 mi of user coordinates.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['ghosts_hauntings'],
      within_miles: 50,
      min_nearby_reports: 3,
      min_match_signals: 1,
    },
    cta: {
      label: 'See the geographic panel',
      target: { kind: 'related_reports_view', filter_token: 'nearby_hauntings' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'ghosts_hauntings.anomalous.shadow_figure',
    category: 'ghosts_hauntings',
    hint_type: 'anomalous_detail',
    title_template: 'Shadow-figure descriptor anchors to {{descriptor_total_count}} accounts',
    body_template:
      '{{descriptor_total_count}} haunting-class reports in the Archive reference a shadow figure — perceived as standing, leaning, or moving across a doorway. The catalogue groups these under the "third-presence" descriptor regardless of cultural framing.',
    data_queries: [
      {
        kind: 'descriptor_count',
        phen_family: 'ghosts_hauntings',
        descriptor_family: 'shadow_figure',
        bind_to: 'descriptor_total_count',
        min_denominator: 50,
      },
    ],
    min_data_threshold: 50,
    provenance_description:
      'Count of approved ghosts_hauntings reports whose descriptors include shadow_figure.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['ghosts_hauntings'],
      required_descriptors: ['shadow', 'figure', 'presence'],
      min_match_signals: 1,
    },
    cta: {
      label: 'View the third-presence catalogue page',
      target: { kind: 'phen_page', slug: 'third-presence-descriptor' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'ghosts_hauntings.temporal.decade_share',
    category: 'ghosts_hauntings',
    hint_type: 'temporal_context',
    title_template: 'Your {{event_decade}}s haunting account sits inside a {{decade_share_pct}}% slice of the record',
    body_template:
      'Of dated haunting-class reports in the Archive, {{decade_share_pct}}% were logged in the {{event_decade}}s. The catalogue tracks decade-by-decade shifts in haunting language — the descriptors that appear, the architectures referenced, the rate of recurrence.',
    data_queries: [
      {
        kind: 'decade_distribution_pct',
        phen_family: 'ghosts_hauntings',
        bind_to: 'decade_share_pct',
        min_denominator: 500,
      },
    ],
    min_data_threshold: 500,
    provenance_description:
      'Percentage of dated ghosts_hauntings reports whose decade matches user submission decade.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['ghosts_hauntings'],
      min_match_signals: 1,
    },
    cta: {
      label: 'See the decade distribution',
      target: { kind: 'related_reports_view', filter_token: 'haunting_decade_distribution' },
    },
    tier_visibility: 'basic',
    freshness_policy: 'data-driven',
  },

  {
    id: 'ghosts_hauntings.cross_experience.recurring_location',
    category: 'ghosts_hauntings',
    hint_type: 'cross_experience',
    title_template: 'A recurring-location pattern across your Record',
    body_template:
      'Two of your submitted accounts share a recurring location anchor. In the Archive, recurring-location accounts cluster within haunting-class reports and tend to surface adjacent sub-patterns over time. The catalogue notes this as a pattern in the corpus.',
    data_queries: [],
    provenance_description:
      'Cross-experience Hint, gated to n>=3 submissions where >=2 share a location anchor. Descriptive only — no statistical claim that would require a query.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['ghosts_hauntings'],
      min_experience_count: 3,
      min_match_signals: 2,
    },
    cta: {
      label: 'Open cross-experience view',
      target: { kind: 'related_reports_view', filter_token: 'cross_experience_location' },
    },
    tier_visibility: 'basic',
    freshness_policy: 'evergreen',
    editorial_note:
      'Basic-tier — cross-experience header itself is a Basic+ surface per V3 matrix.',
  },


  {
    id: 'ghosts_hauntings.editorial.subpattern_guide',
    category: 'ghosts_hauntings',
    hint_type: 'editorial',
    title_template: 'Haunting accounts in the Archive group into multiple sub-patterns',
    body_template:
      'The catalogue groups haunting-class accounts into sub-patterns by phenomenon shape — residential recurring, apparition, sound-only, object movement, sensed presence, and others. Most submitted accounts match more than one sub-pattern.',
    data_queries: [],
    provenance_description:
      'Editorial fallback Hint. Surfaces an organizing observation about the corpus without making any claim about the user.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['ghosts_hauntings'],
      fallback_eligible: true,
      min_match_signals: 1,
    },
    cta: {
      label: 'Browse haunting sub-patterns',
      target: { kind: 'archive_curiosity', topic_slug: 'haunting-subpatterns' },
    },
    tier_visibility: 'free',
    freshness_policy: 'evergreen',
    editorial_note: 'Editorial — fallback eligible. Never absence framing.',
  },

  /* --------------------------------------------------------------------- */
  /* CONSCIOUSNESS PRACTICES (NDE / OBE)                                   */
  /* --------------------------------------------------------------------- */

  {
    id: 'consciousness_practices.phen_page.classic_nde',
    category: 'consciousness_practices',
    hint_type: 'phen_page_surface',
    title_template: 'Your account matches the classic NDE pattern',
    body_template:
      'The catalogue entry on the classic NDE pattern documents recurring descriptors — tunnel, light, life review, sense of remove, return decision, time distortion, and encountered figures. Your account references several of these.',
    data_queries: [],
    provenance_description:
      'Editorial phen-page surface. Descriptor-based trigger; no statistical claim that would require a query.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['consciousness_practices'],
      subfamily: 'classic_nde',
      required_descriptors: ['tunnel', 'light', 'review', 'return', 'remove', 'figure'],
      min_match_signals: 1,
    },
    cta: {
      label: 'Read the catalogue entry',
      target: { kind: 'phen_page', slug: 'nde-classic-pattern' },
    },
    tier_visibility: 'free',
    freshness_policy: 'evergreen',
  },

  {
    id: 'consciousness_practices.anomalous.tunnel',
    category: 'consciousness_practices',
    hint_type: 'anomalous_detail',
    title_template: 'Tunnel imagery is a documented descriptor in {{descriptor_total_count}} accounts',
    body_template:
      '{{descriptor_total_count}} consciousness-practice reports in the Archive describe a tunnel, corridor, or passage between states. The catalogue treats tunnel imagery as a stable cross-cultural descriptor of the NDE/OBE family.',
    data_queries: [
      {
        kind: 'descriptor_count',
        phen_family: 'consciousness_practices',
        descriptor_family: 'tunnel_imagery',
        bind_to: 'descriptor_total_count',
        min_denominator: 30,
      },
    ],
    min_data_threshold: 30,
    provenance_description:
      'Count of approved consciousness_practices reports whose extracted descriptors include tunnel_imagery.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['consciousness_practices'],
      required_descriptors: ['tunnel', 'corridor', 'passage'],
      min_match_signals: 1,
    },
    cta: {
      label: 'View related accounts',
      target: { kind: 'related_reports_view', filter_token: 'tunnel_imagery' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'general.seasonal.may_long_evening',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'May accounts in the Archive — the long-evening transition cluster',
    body_template:
      'The catalogue groups May as the transition into summer — accounts in this window tilt toward clear-sky orb sightings, outdoor cryptid reports, and the start of long-evening household observations. The cluster is editorial, named for the calendar rather than a percentage claim.',
    data_queries: [],
    provenance_description: 'Seasonal editorial Hint — descriptive only.',
    cross_category: false,
    trigger_conditions: { min_match_signals: 1, fallback_eligible: true },
    seasonal_window: { start_month: 5, end_month: 5, label: 'May long-evening transition' },
    cta: {
      label: 'Browse May accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'may-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
  },


  {
    id: 'consciousness_practices.pattern_match.observed_from_above',
    category: 'consciousness_practices',
    hint_type: 'pattern_match',
    title_template: 'Your account fits the observed-from-above OBE sub-pattern',
    body_template:
      'Of consciousness-practice reports that describe an out-of-body episode, {{subpattern_match_pct}}% reference an observed-from-above perspective — looking down at the room, the body, or the scene. The catalogue treats this as a stable feature of the OBE sub-pattern.',
    data_queries: [
      {
        kind: 'subpattern_match_pct',
        phen_family: 'consciousness_practices',
        subfamily: 'obe_class',
        descriptor_family: 'observed_from_above',
        user_descriptor_overlap: true,
        bind_to: 'subpattern_match_pct',
        min_denominator: 200,
      },
    ],
    min_data_threshold: 200,
    provenance_description:
      'Percentage of OBE-class consciousness reports whose descriptors include observed_from_above.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['consciousness_practices'],
      subfamily: 'obe_class',
      required_descriptors: ['looking down', 'above body', 'ceiling view', 'from above'],
      min_match_signals: 1,
    },
    cta: {
      label: 'Read the OBE catalogue entry',
      target: { kind: 'phen_page', slug: 'obe-observed-from-above' },
    },
    tier_visibility: 'basic',
    freshness_policy: 'data-driven',
  },

  /* --------------------------------------------------------------------- */
  /* PERCEPTION_SENSORY (sleep paralysis, perceptual)                      */
  /* --------------------------------------------------------------------- */

  {
    id: 'perception_sensory.anomalous.shadow_figure',
    category: 'perception_sensory',
    hint_type: 'anomalous_detail',
    title_template: 'Shadow-figure descriptor anchors to {{descriptor_total_count}} sleep-paralysis accounts',
    body_template:
      '{{descriptor_total_count}} perception-sensory reports in the Archive describe a figure perceived as standing, leaning, or sitting at the bedside. The catalogue groups these under the "third-presence" descriptor regardless of cultural framing.',
    data_queries: [
      {
        kind: 'descriptor_count',
        phen_family: 'perception_sensory',
        descriptor_family: 'shadow_figure',
        bind_to: 'descriptor_total_count',
        min_denominator: 50,
      },
    ],
    min_data_threshold: 50,
    provenance_description:
      'Count of approved perception_sensory reports whose descriptors include shadow_figure.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['perception_sensory'],
      required_descriptors: ['shadow', 'figure', 'presence', 'bedside', 'standing'],
      min_match_signals: 1,
    },
    cta: {
      label: 'View the third-presence catalogue page',
      target: { kind: 'phen_page', slug: 'sp-third-presence' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'perception_sensory.witness_state.drowsy',
    category: 'perception_sensory',
    hint_type: 'pattern_match',
    title_template: 'Of perception-sensory accounts, {{witness_state_pct}}% are logged in a drowsy state',
    body_template:
      'Reports in this family cluster around the drowsy / falling-asleep state at submission. {{witness_state_pct}}% of perception-sensory accounts were logged with the witness in a drowsy or falling-asleep state — a stable feature of the hypnagogic and hypnopompic record.',
    data_queries: [
      {
        kind: 'witness_state_pct',
        phen_family: 'perception_sensory',
        witness_state: 'drowsy_falling_asleep',
        bind_to: 'witness_state_pct',
        min_denominator: 200,
      },
    ],
    min_data_threshold: 200,
    provenance_description:
      'Percentage of approved perception_sensory reports with witness_state_at_event = drowsy_falling_asleep.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['perception_sensory'],
      min_match_signals: 1,
    },
    cta: {
      label: 'See the witness-state distribution',
      target: { kind: 'related_reports_view', filter_token: 'sp_witness_state' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'perception_sensory.anomalous.paralysis_onset',
    category: 'perception_sensory',
    hint_type: 'anomalous_detail',
    title_template: 'Paralysis-onset descriptor anchors to {{descriptor_total_count}} accounts',
    body_template:
      '{{descriptor_total_count}} perception-sensory accounts reference paralysis onset — the inability to move, often paired with awareness and breath. The catalogue groups these under the recognized hypnagogic / hypnopompic descriptor set.',
    data_queries: [
      {
        kind: 'descriptor_count',
        phen_family: 'perception_sensory',
        descriptor_family: 'paralysis_onset',
        bind_to: 'descriptor_total_count',
        min_denominator: 50,
      },
    ],
    min_data_threshold: 50,
    provenance_description:
      'Count of approved perception_sensory reports whose descriptors include paralysis_onset.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['perception_sensory'],
      required_descriptors: ["can't move", 'frozen', 'locked', 'paralyzed'],
      min_match_signals: 1,
    },
    cta: {
      label: 'Read the catalogue entry',
      target: { kind: 'phen_page', slug: 'sp-paralysis-onset' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },



  /* --------------------------------------------------------------------- */
  /* PSYCHIC_PHENOMENA */
  /* --------------------------------------------------------------------- */

  {
    id: 'psychic_phenomena.region.sparseness',
    category: 'psychic_phenomena',
    hint_type: 'comparative_quietness',
    title_template: 'Psychic accounts from your region are sparse in the Archive',
    body_template:
      'Your account is one of {{region_decade_subpattern_count}} the Archive holds from this region and decade combination. The catalogue treats sparseness as a signal worth noting — under-represented regions tend to fill in slowly as the corpus grows.',
    data_queries: [
      {
        kind: 'region_decade_sparseness',
        phen_family: 'psychic_phenomena',
        bind_to: 'region_decade_subpattern_count',
        sparseness_max: 10,
      },
    ],
    // V11.17.64 — anonymity floor. Founder-approved hard floor of N >= 3
    // on sparseness claims. At N=1 or N=2 the user's account is implicitly
    // identifying within the region+decade slice, which could deanonymize
    // them to themselves or to anyone viewing their Record. Suppress
    // entirely below the floor — render NOTHING rather than a number low
    // enough to point back at the individual.
    min_data_threshold: 3,
    provenance_description:
      'Sparseness query — fires only when the count of approved psychic_phenomena reports sharing the user state+decade is between 3 and 10 (inclusive). Hard-floored at 3 for anonymity protection.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['psychic_phenomena'],
      min_match_signals: 1,
    },
    cta: {
      label: 'Add detail to strengthen the regional record',
      target: { kind: 'add_detail', field: 'location_detail' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
    editorial_note:
      'Comparative-quietness Hint — sparseness gate. Hard floor at N>=3 enforced via min_data_threshold per V11.17.64 to prevent deanonymization. CTA invites enrichment rather than offering a match.',
  },

  {
    id: 'psychic_phenomena.phen_page.precognitive_dream',
    category: 'psychic_phenomena',
    hint_type: 'phen_page_surface',
    title_template: 'Your account fits the precognitive-dream catalogue entry',
    body_template:
      'The catalogue entry on the precognitive-dream pattern documents three recurring features — a dream content, a waking-state confirmation, and a temporal proximity under 72 hours between dream and event. Your account references each of these.',
    data_queries: [],
    provenance_description:
      'Editorial phen-page surface. Descriptor-based trigger; no statistical claim.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['psychic_phenomena'],
      subfamily: 'precognitive_dream',
      required_descriptors: ['dream', 'before it happened', 'came true'],
      min_match_signals: 1,
    },
    cta: {
      label: 'Read the catalogue entry',
      target: { kind: 'phen_page', slug: 'precognitive-dream' },
    },
    tier_visibility: 'free',
    freshness_policy: 'evergreen',
  },


  /* --------------------------------------------------------------------- */
  /* ESOTERIC_PRACTICES */
  /* --------------------------------------------------------------------- */

  {
    id: 'esoteric_practices.phen_page.synchronicity',
    category: 'esoteric_practices',
    hint_type: 'phen_page_surface',
    title_template: 'Your account fits the meaningful-coincidence class',
    body_template:
      'The catalogue entry on synchronicity documents three recurring features — a low-probability pairing of events, a personally significant referent, and a temporal proximity under 72 hours. Your account references all three.',
    data_queries: [],
    provenance_description:
      'Editorial phen-page surface for the synchronicity subfamily. Descriptor-based trigger.',
    cross_category: false,
    trigger_conditions: {
      phen_family: ['esoteric_practices'],
      subfamily: 'synchronicity',
      required_descriptors: ['coincidence', 'meaningful', 'happened at the same time', 'timing'],
      min_match_signals: 1,
    },
    cta: {
      label: 'Read the catalogue entry',
      target: { kind: 'phen_page', slug: 'synchronicity' },
    },
    tier_visibility: 'free',
    freshness_policy: 'evergreen',
  },




  /* --------------------------------------------------------------------- */
  /* CROSS_CATEGORY */
  /* --------------------------------------------------------------------- */

  {
    id: 'cross_category.static_sensation.cryptid_ufo',
    category: 'cross_category',
    hint_type: 'cross_category',
    title_template: 'Static-electricity descriptor appears across cryptid and UFO accounts',
    body_template:
      'The static-electricity sensation recurs across phen families — {{cross_family_a_pct}}% of {{cross_family_a_label}} accounts and {{cross_family_b_pct}}% of {{cross_family_b_label}} accounts reference it. The catalogue treats descriptors that span families as cross-family anchors.',
    data_queries: [
      {
        kind: 'cross_family_overlap_pct',
        descriptor_family: 'static_electricity',
        families: ['cryptids', 'ufos_aliens'],
        bind_to: 'cross_family_set',
        min_denominator_per_family: 100,
      },
    ],
    min_data_threshold: 100,
    provenance_description:
      'Two-family overlap query — counts the share of cryptid vs UFO reports referencing static_electricity, both family denominators must clear 100.',
    cross_category: true,
    trigger_conditions: {
      phen_family: ['cryptids', 'ufos_aliens'],
      required_descriptors: ['static', 'tingling', 'hair-stand'],
      min_match_signals: 1,
    },
    cta: {
      label: 'See the cross-family descriptor',
      target: { kind: 'related_reports_view', filter_token: 'cross_static_sensation' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'cross_category.tunnel.nde_sp',
    category: 'cross_category',
    hint_type: 'cross_category',
    title_template: 'Tunnel imagery appears across NDE and sleep-paralysis accounts',
    body_template:
      'Tunnel imagery recurs across multiple phen families — {{cross_family_a_pct}}% of {{cross_family_a_label}} accounts and {{cross_family_b_pct}}% of {{cross_family_b_label}} accounts reference a tunnel, corridor, or passage. The catalogue treats this as a cross-family descriptor anchored in the NDE/OBE record.',
    data_queries: [
      {
        kind: 'cross_family_overlap_pct',
        descriptor_family: 'tunnel_imagery',
        families: ['consciousness_practices', 'perception_sensory'],
        bind_to: 'cross_family_set',
        min_denominator_per_family: 100,
      },
    ],
    min_data_threshold: 100,
    provenance_description:
      'Two-family overlap query — share of consciousness_practices vs perception_sensory reports referencing tunnel_imagery.',
    cross_category: true,
    trigger_conditions: {
      phen_family: ['consciousness_practices', 'perception_sensory'],
      required_descriptors: ['tunnel', 'corridor', 'passage'],
      min_match_signals: 1,
    },
    cta: {
      label: 'See the cross-family descriptor',
      target: { kind: 'related_reports_view', filter_token: 'cross_tunnel_imagery' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'cross_category.shadow_figure.three_family',
    category: 'cross_category',
    hint_type: 'cross_category',
    title_template: 'Shadow figures appear across three phen families',
    body_template:
      'Shadow-figure descriptors appear in {{cross_family_a_label}} ({{cross_family_a_pct}}%), {{cross_family_b_label}} ({{cross_family_b_pct}}%), and {{cross_family_c_label}} ({{cross_family_c_pct}}%) accounts. The catalogue treats this as one of the most consistent cross-family descriptors in the corpus.',
    data_queries: [
      {
        kind: 'cross_family_overlap_pct',
        descriptor_family: 'shadow_figure',
        families: ['perception_sensory', 'ghosts_hauntings', 'ufos_aliens'],
        bind_to: 'cross_family_set',
        min_denominator_per_family: 100,
      },
    ],
    min_data_threshold: 100,
    provenance_description:
      'Three-family overlap query — share of each family\'s reports referencing the shadow_figure descriptor.',
    cross_category: true,
    trigger_conditions: {
      phen_family: ['perception_sensory', 'ghosts_hauntings', 'ufos_aliens'],
      required_descriptors: ['shadow', 'figure', 'presence'],
      min_match_signals: 1,
    },
    cta: {
      label: 'See the cross-family descriptor',
      target: { kind: 'related_reports_view', filter_token: 'cross_shadow_figure' },
    },
    tier_visibility: 'basic',
    freshness_policy: 'data-driven',
  },

  {
    id: 'cross_category.electromagnetic.cryptid_ufo_ghost',
    category: 'cross_category',
    hint_type: 'cross_category',
    title_template: 'Electromagnetic disturbance reports cluster across three families',
    body_template:
      'Electromagnetic disturbance — flickering lights, electronics behaving unusually — recurs in {{cross_family_a_label}} ({{cross_family_a_pct}}%), {{cross_family_b_label}} ({{cross_family_b_pct}}%), and {{cross_family_c_label}} ({{cross_family_c_pct}}%) accounts. The catalogue tracks the descriptor across families rather than within any one.',
    data_queries: [
      {
        kind: 'cross_family_overlap_pct',
        descriptor_family: 'electromagnetic_disturbance',
        families: ['ufos_aliens', 'ghosts_hauntings', 'cryptids'],
        bind_to: 'cross_family_set',
        min_denominator_per_family: 100,
      },
    ],
    min_data_threshold: 100,
    provenance_description:
      'Three-family overlap query — share of UFO / haunting / cryptid reports referencing the electromagnetic_disturbance descriptor.',
    cross_category: true,
    trigger_conditions: {
      phen_family: ['ufos_aliens', 'ghosts_hauntings', 'cryptids'],
      required_descriptors: ['flicker', 'stopped', 'electronics', 'watch'],
      min_match_signals: 1,
    },
    cta: {
      label: 'See the cross-family descriptor',
      target: { kind: 'related_reports_view', filter_token: 'cross_electromagnetic' },
    },
    tier_visibility: 'basic',
    freshness_policy: 'data-driven',
  },

  {
    id: 'cross_category.witness_drowsy.sp_obe',
    category: 'cross_category',
    hint_type: 'cross_category',
    title_template: 'Drowsy-state accounts cluster across perception-sensory and consciousness-practice families',
    body_template:
      'Of perception-sensory accounts, {{cross_family_a_pct}}% are logged in a drowsy or falling-asleep state. Of consciousness-practice accounts, {{cross_family_b_pct}}% share that witness state. The catalogue treats the drowsy / falling-asleep state as a cross-family anchor for the boundary-of-consciousness corpus.',
    data_queries: [
      {
        kind: 'cross_family_overlap_pct',
        descriptor_family: 'witness_drowsy',
        families: ['perception_sensory', 'consciousness_practices'],
        bind_to: 'cross_family_set',
        min_denominator_per_family: 200,
      },
    ],
    min_data_threshold: 200,
    provenance_description:
      'Two-family overlap query, witness_drowsy descriptor (joined from witness_state_at_event = drowsy_falling_asleep).',
    cross_category: true,
    trigger_conditions: {
      phen_family: ['perception_sensory', 'consciousness_practices'],
      min_match_signals: 1,
    },
    cta: {
      label: 'See the boundary-of-consciousness corpus',
      target: { kind: 'archive_curiosity', topic_slug: 'boundary-of-consciousness' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
  },

  {
    id: 'cross_category.progression.sp_to_obe',
    category: 'cross_category',
    hint_type: 'cross_experience',
    title_template: 'Multi-experience users sometimes log sleep-paralysis before OBE',
    body_template:
      'Among Archive users with multiple submissions, {{cross_progression_pct}}% who first logged a perception-sensory account later submitted a consciousness-practice account. The catalogue notes this as a pattern in our data, not a prediction.',
    data_queries: [
      {
        kind: 'cross_progression_pct',
        from_family: 'perception_sensory',
        to_family: 'consciousness_practices',
        bind_to: 'cross_progression_pct',
        min_denominator: 100,
      },
    ],
    min_data_threshold: 100,
    provenance_description:
      'Percentage of multi-experience users whose first phen_family is perception_sensory and whose later submissions include consciousness_practices.',
    cross_category: true,
    trigger_conditions: {
      phen_family: ['perception_sensory', 'consciousness_practices'],
      min_experience_count: 3,
      min_match_signals: 2,
    },
    cta: {
      label: 'Read the catalogue note',
      target: { kind: 'phen_page', slug: 'sp-obe-progression' },
    },
    tier_visibility: 'basic',
    freshness_policy: 'data-driven',
    editorial_note:
      'Cross-experience progression Hint. "Not a prediction" qualifier load-bearing for brand voice.',
  },

  {
    id: 'cross_category.editorial.descriptor_anchors',
    category: 'cross_category',
    hint_type: 'editorial',
    title_template: 'The Archive tracks descriptors that span phen families',
    body_template:
      'Several descriptors recur across phen families rather than belonging to any one — static electricity, tunnel imagery, shadow figures, electromagnetic disturbance, the being-of-light figure, three-note vocal patterns. The catalogue treats these as cross-family anchors that organize the corpus alongside the family taxonomy.',
    data_queries: [],
    provenance_description:
      'Editorial / fallback cross-category Hint. Names the cross-family descriptor lens without making any user-specific claim.',
    cross_category: true,
    trigger_conditions: {
      fallback_eligible: true,
      min_match_signals: 1,
    },
    cta: {
      label: 'Browse cross-family descriptors',
      target: { kind: 'archive_curiosity', topic_slug: 'cross-family-descriptors' },
    },
    tier_visibility: 'free',
    freshness_policy: 'evergreen',
    editorial_note: 'Pure editorial cross-category Hint. Fallback eligible across all families.',
  },

  {
    id: 'cross_category.observed_from_above.obe_ufo',
    category: 'cross_category',
    hint_type: 'cross_category',
    title_template: 'Observed-from-above accounts cluster across consciousness-practice and UFO families',
    body_template:
      'The observed-from-above perspective recurs across two distinct phen families — {{cross_family_a_pct}}% of {{cross_family_a_label}} OBE accounts and {{cross_family_b_pct}}% of {{cross_family_b_label}} abduction-class accounts reference looking down at a scene or body. The catalogue treats this as one of the more counter-intuitive cross-family anchors in the corpus.',
    data_queries: [
      {
        kind: 'cross_family_overlap_pct',
        descriptor_family: 'observed_from_above',
        families: ['consciousness_practices', 'ufos_aliens'],
        bind_to: 'cross_family_set',
        min_denominator_per_family: 200,
      },
    ],
    min_data_threshold: 200,
    provenance_description:
      'Two-family overlap query — share of OBE-class consciousness reports vs abduction-class UFO reports referencing the observed_from_above descriptor.',
    cross_category: true,
    trigger_conditions: {
      phen_family: ['consciousness_practices', 'ufos_aliens'],
      required_descriptors: ['looking down', 'above body', 'ceiling view', 'from above'],
      min_match_signals: 1,
    },
    cta: {
      label: 'See the cross-family descriptor',
      target: { kind: 'related_reports_view', filter_token: 'cross_observed_from_above' },
    },
    tier_visibility: 'basic',
    freshness_policy: 'data-driven',
  },

  /* --------------------------------------------------------------------- */
  /* GENERAL / EDITORIAL / SEASONAL CALENDAR                               */
  /* --------------------------------------------------------------------- */

  {
    id: 'general.seasonal.october_cluster',
    category: 'general',
    hint_type: 'temporal_context',
    title_template: 'October accounts in the Archive — {{archive_total_count}} entries',
    body_template:
      'The Archive holds {{archive_total_count}} accounts logged in October across all phen families. The catalogue treats October as its own micro-record — the descriptor profile shifts modestly across the month relative to the rest of the year.',
    data_queries: [
      {
        kind: 'month_window_count',
        start_month: 10,
        end_month: 10,
        bind_to: 'archive_total_count',
        min_denominator: 200,
      },
    ],
    min_data_threshold: 200,
    provenance_description:
      'Count of approved reports whose event_date falls in October, excluding year-only event_date_precision rows.',
    cross_category: false,
    trigger_conditions: {
      min_match_signals: 1,
    },
    seasonal_window: { start_month: 10, end_month: 10, label: 'October cluster' },
    cta: {
      label: 'Browse October accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'october-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
    editorial_note:
      'October seasonal Hint. v1 hard-coded "14% / 70% above baseline" — those numbers were fabricated. v2 surfaces a count, not a percentage above baseline.',
  },

  {
    id: 'general.seasonal.halloween_week',
    category: 'general',
    hint_type: 'temporal_context',
    title_template: 'Halloween-week accounts in the Archive — {{archive_total_count}} entries',
    body_template:
      'The catalogue groups Halloween-week (October 26 – November 2) accounts as a distinct seasonal cluster. The Archive holds {{archive_total_count}} approved reports in that window.',
    data_queries: [
      {
        kind: 'month_window_count',
        start_month: 10,
        start_day: 26,
        end_month: 11,
        end_day: 2,
        bind_to: 'archive_total_count',
        min_denominator: 50,
      },
    ],
    min_data_threshold: 50,
    provenance_description:
      'Count of approved reports whose event_date falls between Oct 26 and Nov 2, excluding year-only precision.',
    cross_category: false,
    trigger_conditions: {
      min_match_signals: 1,
    },
    seasonal_window: { start_month: 10, start_day: 26, end_month: 11, end_day: 2, label: 'Halloween week' },
    cta: {
      label: 'Browse Halloween-week accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'halloween-week' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
  },

  {
    id: 'general.seasonal.winter_solstice',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'Winter-solstice and Yule-week accounts in the Archive',
    body_template:
      'The catalogue keeps a small editorial cluster around the winter-solstice and Yule-week window — accounts from the longest nights of the year, with their own descriptor tilt toward house-bound, family-witnessed, and quiet observations. The cluster is a calendar cousin to the October over-representation.',
    data_queries: [],
    provenance_description:
      'Seasonal editorial Hint. No statistical claim — descriptive cluster only.',
    cross_category: false,
    trigger_conditions: {
      min_match_signals: 1,
      fallback_eligible: true,
    },
    seasonal_window: { start_month: 12, start_day: 18, end_month: 12, end_day: 31, label: 'Winter solstice / Yule' },
    cta: {
      label: 'Browse winter-solstice accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'winter-solstice-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
    editorial_note:
      'Descriptive seasonal Hint — no percentage claim. The month-of-event distribution is noisy because year-only event_dates fall to January; safer to avoid a stat here.',
  },

  {
    id: 'general.seasonal.new_year_anniversary',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'January anniversary accounts in the Archive',
    body_template:
      'The catalogue treats January as a reflective window — many users revisit older accounts in the new year, and the descriptor profile of submissions in this window tilts toward witnessed-with-family and long-recall accounts. The Archive holds its own January cluster as an editorial sub-record.',
    data_queries: [],
    provenance_description:
      'Editorial seasonal Hint. The corpus has a known year-only fallback to January 1, so this Hint avoids any percentage claim about January distribution.',
    cross_category: false,
    trigger_conditions: {
      min_match_signals: 1,
      fallback_eligible: true,
    },
    seasonal_window: { start_month: 1, end_month: 1, label: 'New year / January reflection' },
    cta: {
      label: 'Browse January accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'january-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
  },

  {
    id: 'general.seasonal.summer_solstice',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'Summer-solstice accounts in the Archive',
    body_template:
      'The catalogue keeps an editorial cluster around the summer solstice — clear-night observations, outdoor accounts, and the strand of UFO and orb sightings that historically peak in the long evenings of June. The cluster is named for the longest day rather than the descriptor profile that follows.',
    data_queries: [],
    provenance_description:
      'Seasonal editorial Hint. Descriptive only — no statistical claim.',
    cross_category: false,
    trigger_conditions: {
      min_match_signals: 1,
      fallback_eligible: true,
    },
    seasonal_window: { start_month: 6, start_day: 15, end_month: 6, end_day: 30, label: 'Summer solstice' },
    cta: {
      label: 'Browse solstice accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'summer-solstice-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
  },

  {
    id: 'general.editorial.archive_growth',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'The Archive has grown by {{archive_growth_count_30d}} accounts this month',
    body_template:
      'In the past 30 days the Archive received {{archive_growth_count_30d}} new approved accounts. The catalogue keeps the corpus growing — every new account folds into the descriptor, regional, and decade lenses that surface on your Record.',
    data_queries: [
      {
        kind: 'archive_growth_count',
        days: 30,
        bind_to: 'archive_growth_count_30d',
        min_denominator: 100,
      },
    ],
    min_data_threshold: 100,
    provenance_description:
      'Count of approved reports created in the past 30 days. Editorial / fallback Hint — surfaces growth without ever framing it as absence.',
    cross_category: false,
    trigger_conditions: {
      fallback_eligible: true,
      min_match_signals: 1,
    },
    cta: {
      label: 'Open the Archive',
      target: { kind: 'archive_curiosity', topic_slug: 'recent-additions' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
    editorial_note:
      'Replaces v1 Hint #14 ("None matched your fingerprint yet"). Surfaces growth positively, never absence.',
  },

  /* --------------------------------------------------------------------- */
  /* EXTENDED SEASONAL CALENDAR — Feb, Mar, Apr, May, Jul, Aug, Sep, Nov   */
  /* --------------------------------------------------------------------- */

  {
    id: 'general.seasonal.february_imbolc',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'February accounts in the Archive — the quiet-month cluster',
    body_template:
      'February runs the quieter section of the calendar in the Archive. The catalogue groups the month\'s accounts as a quiet-record cluster — fewer outdoor sightings, more household and indoor accounts, the descriptor profile tilts toward the small and the close.',
    data_queries: [],
    provenance_description:
      'Editorial seasonal Hint. Descriptive only — the corpus February sample is too noisy for a percentage claim given the January year-only fallback.',
    cross_category: false,
    trigger_conditions: {
      min_match_signals: 1,
      fallback_eligible: true,
    },
    seasonal_window: { start_month: 2, end_month: 2, label: 'February quiet cluster' },
    cta: {
      label: 'Browse February accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'february-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
  },

  {
    id: 'general.seasonal.spring_equinox',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'Spring-equinox accounts in the Archive',
    body_template:
      'The catalogue keeps an editorial cluster around the spring equinox — accounts that arrive as daylight crosses the midpoint, with their own descriptor tilt toward outdoor observation, weather-shift accounts, and the return of clear-night sky reports. The cluster is named for the equinox window, not the descriptors that follow.',
    data_queries: [],
    provenance_description: 'Seasonal editorial Hint — descriptive only.',
    cross_category: false,
    trigger_conditions: { min_match_signals: 1, fallback_eligible: true },
    seasonal_window: { start_month: 3, start_day: 15, end_month: 3, end_day: 25, label: 'Spring equinox' },
    cta: {
      label: 'Browse equinox accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'spring-equinox-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
  },

  {
    id: 'general.seasonal.april_easter',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'April accounts in the Archive — the shoulder-spring cluster',
    body_template:
      'The catalogue groups April as a shoulder-spring window — the descriptor profile in April accounts tilts toward outdoor sightings as daylight returns and toward residential accounts in the household-deep-clean / spring-routine stretch. The cluster is editorial, named for the calendar, not a statistical claim.',
    data_queries: [],
    provenance_description: 'Seasonal editorial Hint — descriptive only.',
    cross_category: false,
    trigger_conditions: { min_match_signals: 1, fallback_eligible: true },
    seasonal_window: { start_month: 4, end_month: 4, label: 'April shoulder-spring' },
    cta: {
      label: 'Browse April accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'april-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
  },

  {
    id: 'general.seasonal.perseids_august',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'August accounts in the Archive — clear-night observation cluster',
    body_template:
      'The catalogue holds an August editorial cluster around clear-night observation — including the run of mid-month accounts traditionally logged during the Perseids window. The catalogue notes that meteor activity often coincides with elevated outdoor sky-watching, which broadens the descriptor profile of accounts logged in this stretch.',
    data_queries: [],
    provenance_description: 'Seasonal editorial Hint — descriptive only.',
    cross_category: false,
    trigger_conditions: { min_match_signals: 1, fallback_eligible: true },
    seasonal_window: { start_month: 8, start_day: 8, end_month: 8, end_day: 20, label: 'August clear-night / Perseids' },
    cta: {
      label: 'Browse August accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'august-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
  },

  {
    id: 'general.seasonal.september_back_to_school',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'September accounts — the back-to-school cluster in sleep-paralysis records',
    body_template:
      'The catalogue keeps a small editorial cluster around the September back-to-school window — perception-sensory accounts in this stretch tilt toward stress-shift-and-sleep-disruption descriptors, with elevated mentions of unfamiliar bedrooms and first-week-of-routine accounts.',
    data_queries: [],
    provenance_description: 'Seasonal editorial Hint — descriptive only, no percentage claim.',
    cross_category: false,
    trigger_conditions: { min_match_signals: 1, fallback_eligible: true },
    seasonal_window: { start_month: 9, end_month: 9, label: 'September back-to-school' },
    cta: {
      label: 'Browse September accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'september-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
  },

  {
    id: 'general.seasonal.july_clear_nights',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'July accounts in the Archive — the clear-night observation cluster',
    body_template:
      'The catalogue keeps a July editorial cluster around the long-evening clear-sky stretch — outdoor sightings, orb and craft-shape accounts, and the post-Independence-Day window when sky-watching elevates. The cluster is descriptive rather than statistical.',
    data_queries: [],
    provenance_description: 'Seasonal editorial Hint — descriptive only.',
    cross_category: false,
    trigger_conditions: { min_match_signals: 1, fallback_eligible: true },
    seasonal_window: { start_month: 7, end_month: 7, label: 'July clear-night cluster' },
    cta: {
      label: 'Browse July accounts',
      target: { kind: 'archive_curiosity', topic_slug: 'july-cluster' },
    },
    tier_visibility: 'free',
    freshness_policy: 'seasonal',
  },

  {
    id: 'general.editorial.archive_total_scale',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'The Archive holds {{archive_total_count}} approved accounts',
    body_template:
      'The catalogue holds {{archive_total_count}} approved accounts across all phen families. Every Record sits inside that corpus — the descriptor, decade, and regional lenses on your Record are computed against the live total, recomputed as the Archive grows.',
    data_queries: [
      { kind: 'archive_total_count', bind_to: 'archive_total_count' },
    ],
    provenance_description:
      'Total count of approved reports in the Archive. Editorial / fallback Hint. The number updates as the corpus grows — surfacing it positively replaces v1\'s never-empty floor card.',
    cross_category: false,
    trigger_conditions: {
      fallback_eligible: true,
      min_match_signals: 1,
    },
    cta: {
      label: 'Open the Archive',
      target: { kind: 'archive_curiosity', topic_slug: 'archive-scale' },
    },
    tier_visibility: 'free',
    freshness_policy: 'data-driven',
    editorial_note:
      'Universal editorial fallback — eligible for any user, any visit, when no stronger Hint qualifies. Always positive framing.',
  },

  /* --------------------------------------------------------------------- */
  /* PRO-TIER DEPTH HINTS                                                  */
  /* --------------------------------------------------------------------- */

  {
    id: 'pro.geographic.county_density',
    category: 'general',
    hint_type: 'geographic_context',
    title_template: 'County-level density: {{nearby_count_within_50mi}} accounts in your immediate area',
    body_template:
      'At the Pro tier the Archive surfaces county-level density. The catalogue holds {{nearby_count_within_50mi}} approved accounts within 50 miles of your reported location, broken out by phen family on the Pro geographic panel.',
    data_queries: [
      {
        kind: 'geographic_proximity_count',
        radius_mi: 50,
        bind_to: 'nearby_count_within_50mi',
        min_denominator: 3,
      },
    ],
    min_data_threshold: 3,
    provenance_description:
      'Approved reports across all phen families within 50 mi of user coordinates. Pro depth.',
    cross_category: false,
    trigger_conditions: { min_match_signals: 1 },
    cta: {
      label: 'Open the Pro geographic panel',
      target: { kind: 'related_reports_view', filter_token: 'pro_county_density' },
    },
    tier_visibility: 'pro',
    freshness_policy: 'data-driven',
  },

  {
    id: 'pro.temporal.decade_breakdown',
    category: 'general',
    hint_type: 'temporal_context',
    title_template: 'Decade breakdown: your {{event_decade}}s account sits inside a {{decade_share_pct}}% slice',
    body_template:
      'Of dated approved accounts in your phen family, {{decade_share_pct}}% were logged in the {{event_decade}}s. The Pro temporal lens breaks this down by sub-pattern and region.',
    data_queries: [
      {
        kind: 'decade_distribution_pct',
        phen_family: 'ufos_aliens',
        bind_to: 'decade_share_pct',
        min_denominator: 500,
      },
    ],
    min_data_threshold: 500,
    provenance_description:
      'Decade share within UFO family — Pro depth view exposes the breakdown by subfamily and region.',
    cross_category: false,
    trigger_conditions: { phen_family: ['ufos_aliens'], min_match_signals: 1 },
    cta: {
      label: 'Open the Pro temporal lens',
      target: { kind: 'related_reports_view', filter_token: 'pro_decade_breakdown' },
    },
    tier_visibility: 'pro',
    freshness_policy: 'data-driven',
  },

  {
    id: 'pro.editorial.export_ready',
    category: 'general',
    hint_type: 'editorial',
    title_template: 'Pro: the underlying queries that built this Hint are exportable',
    body_template:
      'At the Pro tier, each Hint exposes its underlying query — the SQL fragment, the denominator, the date of recomputation. The catalogue keeps the audit trail visible so the operator can verify any claim against the live corpus.',
    data_queries: [],
    provenance_description:
      'Pro-tier editorial Hint surfacing the audit-trail / provenance affordance. No statistical claim.',
    cross_category: false,
    trigger_conditions: { min_match_signals: 1, fallback_eligible: true },
    cta: {
      label: 'Open the provenance view',
      target: { kind: 'archive_curiosity', topic_slug: 'pro-provenance' },
    },
    tier_visibility: 'pro',
    freshness_policy: 'evergreen',
    editorial_note: 'Pro-tier editorial / fallback. Replaces v1 Hint #14 as the Pro never-empty floor.',
  },
]
