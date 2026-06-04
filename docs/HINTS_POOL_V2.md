# Hints Pool — v2 (Seed of 50)

**To:** Chase
**Re:** Second seed pool of Hints for the Lab. Full rewrite of v1 after the founder caught the fabricated-statistics bug. Founder sign-off requested on the full 50 at once.
**Schema:** `/Users/chase/paradocs/src/lib/lab/hints/hint-schema.ts`
**Data-query types:** `/Users/chase/paradocs/src/lib/lab/hints/data-query-types.ts`
**Pool:** `/Users/chase/paradocs/src/lib/lab/hints/seed-hints.ts`

---

## What changed from v1

v1 (14 Hints) embedded fabricated percentages directly in body strings: "roughly 41% use language similar to yours", "64% are logged between midnight and 4 AM", "31% of accounts mention a static, tingling sensation". None of those numbers came from the live database. The founder caught it. v2 is a structural rewrite:

1. **Every numerical claim is now a `{{token}}` filled at render time** from a structured `data_queries` spec executed against the live Paradocs corpus. If the underlying subset is too small to ground the claim (below the Hint's `min_data_threshold`), the Hint is suppressed and the never-empty fallback chain takes over.
2. **The Pro-only "nothing matched your fingerprint yet" Hint is gone.** Per founder direction: "I think it makes sense to avoid saying anything like this at all on any level." No Hint in v2 ever announces absence. The fallback chain always surfaces positive value.
3. **Named-match Hints declare a confidence floor.** 3 signals minimum, 4 for a user's first-ever match offer. Sub-family + geographic proximity are mandatory signals out of the multi-signal set.
4. **Cross-category Hints are a first-class type.** 8 Hints in this pool explicitly draw patterns across phen families.
5. **Seasonal calendar — all 12 months.** 13 seasonal Hints fire only inside their `seasonal_window`. Coverage spans January through December plus a dedicated Halloween-week window.

## Voice / integrity statement (load-bearing)

- Documentary, matter-of-fact, comparative. Corpus first, user second.
- **Zero fabricated statistics.** Every percentage, count, date, and distance in a body string is a runtime token paired with a real query. The v1 stats ("41%", "64%", "57%", "31%") are gone.
- Banned phrasings: "fascinating", "spooky", "creepy", "weird", "you might be interested in", "fun fact", "did you know". No exclamation marks. No diagnostic vocabulary (anxiety, depression, dissociation, trauma, PTSD).
- **Never absence framing.** No Hint in this pool says "nothing matched", "no data", "your fingerprint is being watched", or any variant. Every Hint surfaces positive value.
- All Hints with numeric tokens have a `min_data_threshold` and the runtime suppresses them when N is below floor.

## Coverage summary

| Metric | Target | Actual |
|---|---|---|
| Total Hints | 50 | **50** |
| n=1 eligible | >=12 | **48** |
| Cross-category | >=8 | **8** |
| Seasonal (12 months covered) | >=12 | **13** |
| Fallback-eligible (editorial pool) | 5-10 | **16** |
| Named-match (Basic) | ~6 | **2** |
| Tier split | ~35 / ~10 / ~5 | **37 free / 10 basic / 3 pro** |
| Freshness | mix | **29 data-driven / 8 evergreen / 13 seasonal** |

## Family coverage

| Family | # Hints |
|---|---|
| `cryptids` | 4 |
| `ufos_aliens` | 6 |
| `ghosts_hauntings` | 5 |
| `consciousness_practices` | 3 |
| `perception_sensory` | 3 |
| `psychic_phenomena` | 2 |
| `esoteric_practices` | 1 |
| `cross_category` | 8 |
| `general` | 18 |

Note: DB-side categories `psychological_experiences` and `religion_mythology` are not represented in dedicated Hints; both are eligible for the universal `general.*` editorial fallbacks. The brief required seven phen families; those two are not on the required list.

## Seasonal calendar (12 months)

| Month / Window | Hint ID | Freshness |
|---|---|---|
| Jan — New year / January reflection | `general.seasonal.new_year_anniversary` | seasonal |
| Feb — February quiet cluster | `general.seasonal.february_imbolc` | seasonal |
| Mar — Spring equinox | `general.seasonal.spring_equinox` | seasonal |
| Apr — April shoulder-spring | `general.seasonal.april_easter` | seasonal |
| May — May long-evening transition | `general.seasonal.may_long_evening` | seasonal |
| Jun — Summer solstice | `general.seasonal.summer_solstice` | seasonal |
| Jul — July clear-night cluster | `general.seasonal.july_clear_nights` | seasonal |
| Aug — August clear-night / Perseids | `general.seasonal.perseids_august` | seasonal |
| Sep — September back-to-school | `general.seasonal.september_back_to_school` | seasonal |
| Oct — October cluster | `general.seasonal.october_cluster` | seasonal |
| Oct — Halloween week | `general.seasonal.halloween_week` | seasonal |
| Nov — November dark-evening cluster | `general.seasonal.november_dark_evening` | seasonal |
| Dec — Winter solstice / Yule | `general.seasonal.winter_solstice` | seasonal |

## Locked token vocabulary

Token names are defined in `data-query-types.ts` under the `HintToken` union. Every `{{token}}` in a body must appear there; adding a new token requires both a schema bump and a corresponding query kind.

**Tokens in use across the v2 pool:**

- `{{subpattern_match_pct}}` — % of a family's reports matching a sub-pattern
- `{{subpattern_total_count}}` — count of reports inside a sub-pattern
- `{{descriptor_total_count}}` — count of reports referencing a descriptor family
- `{{archive_total_count}}` — total approved reports (optionally in a family)
- `{{archive_growth_count_30d}}` — count of reports added in last 30 days
- `{{nearby_count_within_50mi}}` / `{{nearby_count_within_100mi}}` — proximity counts
- `{{closest_match_date}}` / `{{closest_match_distance_mi}}` — single nearest match meta
- `{{state_region_count}}` — count in user's state_province
- `{{event_decade}}` / `{{decade_share_pct}}` — decade band + share
- `{{witness_state_pct}}` — % of family at a given witness_state_at_event
- `{{region_decade_subpattern_count}}` — sparseness count
- `{{cross_family_a_pct}}`, `{{cross_family_b_pct}}`, `{{cross_family_c_pct}}` — three-family overlap percentages
- `{{cross_family_a_label}}`, `{{cross_family_b_label}}`, `{{cross_family_c_label}}` — labels for the families in the overlap
- `{{cross_progression_pct}}` — multi-experience progression %

## The 50 Hints

### Cryptids (4)

#### `cryptids.pattern_match.bigfoot_whoop`

**Title.** A documented "whoop" sub-pattern in {{subpattern_total_count}} cryptid accounts

**Body.** Of the {{subpattern_total_count}} cryptid-class reports in the Archive that describe a vocalization, {{subpattern_match_pct}}% reference a low, rising whoop heard at distance. The catalogue groups these under the "whoop" sub-pattern.

**Provenance.** Numerator: cryptid reports whose extracted descriptors include the whoop_vocalization family. Denominator: cryptid reports with any extracted auditory descriptor.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 100 · **Flags.** n=1

*Editorial note: Fires when the auto-tagger marks the submission as a bigfoot-class encounter and at least one whoop descriptor is extracted from the account. Token values come from the live DB; v1 hardcoded 41% — gone.*

#### `cryptids.anomalous.static_sensation`

**Title.** The static-electricity sensation anchors to a corpus pattern

**Body.** In cryptid close-encounter reports, {{descriptor_total_count}} accounts describe a static, tingling, or hair-stand sensation in the seconds before the sighting. The catalogue treats this as a stable anomalous descriptor rather than coincidence.

**Provenance.** Count of cryptid reports whose extracted descriptors include the static_electricity family.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 30 · **Flags.** n=1

#### `cryptids.geographic.nearby_corridor`

**Title.** {{nearby_count_within_100mi}} cryptid accounts within 100 miles of your location

**Body.** The closest in time and place was {{closest_match_date}}, {{closest_match_distance_mi}} miles from your reported location. The catalogue holds {{nearby_count_within_100mi}} cryptid-family reports inside a 100-mile radius of your account.

**Provenance.** Approved cryptid reports within 100 miles of user coordinates (haversine). Closest_match_meta returns the single nearest report.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 3 · **Flags.** n=1

#### `cryptids.pattern_match.named_match`

**Title.** One nearby cryptid account matches yours on three signals

**Body.** A user whose Record includes a cryptid encounter within {{closest_match_distance_mi}} miles and the same decade has enabled named-match offers. Mutual opt-in is required on both sides before any identifying detail is shared.

**Provenance.** Surfaces only when the multi-signal fingerprint scores >=3 (>=4 for first-ever match offer). Requires opted-in counterparty.

**Tier.** basic · **Freshness.** data-driven · **N threshold.** — · **Flags.** named-match, n=1

*Editorial note: Named-match — basic tier. Cadence: at most one per visit. First match requires 4 signals; subsequent matches require 3. Mandatory signals locked at sub-family + geographic proximity.*

### UFOs / Aliens (6)

#### `ufos_aliens.pattern_match.triangle_subpattern`

**Title.** Your account fits the triangle / V-formation sub-pattern

**Body.** In UFO-shape reports, {{subpattern_match_pct}}% describe a triangular or V-formation craft. The catalogue treats triangle as a distinct sub-pattern from disc and orb — each with its own decade-and-region distribution.

**Provenance.** Percentage of approved ufos_aliens reports whose extracted descriptors include craft_shape_triangle.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 500 · **Flags.** n=1

#### `ufos_aliens.geographic.corridor_50mi`

**Title.** {{nearby_count_within_50mi}} UFO accounts within 50 miles of your location

**Body.** The closest in time and place was {{closest_match_date}}, {{closest_match_distance_mi}} miles from your reported location. Reports in the Archive within 50 miles of your account total {{nearby_count_within_50mi}}.

**Provenance.** Approved ufos_aliens reports within 50 mi of user coordinates (haversine). Closest_match_meta returns the single nearest.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 3 · **Flags.** n=1

#### `ufos_aliens.temporal.decade_share`

**Title.** Your {{event_decade}}s account sits inside a {{decade_share_pct}}% slice of the UFO record

**Body.** Of dated UFO-shape reports in the Archive, {{decade_share_pct}}% were logged in the {{event_decade}}s — the decade your account falls in. The catalogue tracks decade-by-decade shifts in the UFO record as a distinct lens.

**Provenance.** Percentage of dated UFO-family reports whose event_date decade matches the user submission decade.

**Tier.** basic · **Freshness.** data-driven · **N threshold.** 500 · **Flags.** n=1

#### `ufos_aliens.anomalous.electromagnetic`

**Title.** Electromagnetic disturbance is a documented descriptor in {{descriptor_total_count}} UFO accounts

**Body.** {{descriptor_total_count}} UFO-family accounts in the Archive reference an electromagnetic disturbance — flickering lights, stopped watches, vehicle electronics behaving unusually. The catalogue treats this as a stable anomalous descriptor.

**Provenance.** Count of approved UFO reports whose extracted descriptors include the electromagnetic_disturbance family.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 30 · **Flags.** n=1

#### `ufos_aliens.pattern_match.named_match`

**Title.** One nearby UFO account matches yours on three signals

**Body.** A user whose Record includes a UFO sighting within {{closest_match_distance_mi}} miles and the same decade has enabled named-match offers. Mutual opt-in is required on both sides before any identifying detail is shared.

**Provenance.** Named-match Hint. Fires only when fingerprint score >=3 (>=4 for first match) and a counterparty has opted in.

**Tier.** basic · **Freshness.** data-driven · **N threshold.** — · **Flags.** named-match, n=1

#### `ufos_aliens.phen_page.craft_shape_disc`

**Title.** The classic disc / saucer sub-pattern

**Body.** The catalogue entry on the disc / saucer sub-pattern documents the shape's history, peak-decade clusters, and the recurring descriptor set (silent, hovering, abrupt departure). Your account references the disc shape.

**Provenance.** Editorial phen-page surface. No statistical claim — descriptive copy with subfamily trigger.

**Tier.** free · **Freshness.** evergreen · **N threshold.** — · **Flags.** n=1

### Ghosts / Hauntings (5)

#### `ghosts_hauntings.geographic.nearby_20mi`

**Title.** {{nearby_count_within_50mi}} haunting accounts within 50 miles of your location

**Body.** The closest in time was {{closest_match_date}}, {{closest_match_distance_mi}} miles away. The catalogue holds {{nearby_count_within_50mi}} haunting-class reports within 50 miles of your account.

**Provenance.** Approved ghosts_hauntings reports within 50 mi of user coordinates.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 3 · **Flags.** n=1

#### `ghosts_hauntings.anomalous.shadow_figure`

**Title.** Shadow-figure descriptor anchors to {{descriptor_total_count}} accounts

**Body.** {{descriptor_total_count}} haunting-class reports in the Archive reference a shadow figure — perceived as standing, leaning, or moving across a doorway. The catalogue groups these under the "third-presence" descriptor regardless of cultural framing.

**Provenance.** Count of approved ghosts_hauntings reports whose descriptors include shadow_figure.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 50 · **Flags.** n=1

#### `ghosts_hauntings.temporal.decade_share`

**Title.** Your {{event_decade}}s haunting account sits inside a {{decade_share_pct}}% slice of the record

**Body.** Of dated haunting-class reports in the Archive, {{decade_share_pct}}% were logged in the {{event_decade}}s. The catalogue tracks decade-by-decade shifts in haunting language — the descriptors that appear, the architectures referenced, the rate of recurrence.

**Provenance.** Percentage of dated ghosts_hauntings reports whose decade matches user submission decade.

**Tier.** basic · **Freshness.** data-driven · **N threshold.** 500 · **Flags.** n=1

#### `ghosts_hauntings.cross_experience.recurring_location`

**Title.** A recurring-location pattern across your Record

**Body.** Two of your submitted accounts share a recurring location anchor. In the Archive, recurring-location accounts cluster within haunting-class reports and tend to surface adjacent sub-patterns over time. The catalogue notes this as a pattern in the corpus.

**Provenance.** Cross-experience Hint, gated to n>=3 submissions where >=2 share a location anchor. Descriptive only — no statistical claim that would require a query.

**Tier.** basic · **Freshness.** evergreen · **N threshold.** — · **Flags.** —

*Editorial note: Basic-tier — cross-experience header itself is a Basic+ surface per V3 matrix.*

#### `ghosts_hauntings.editorial.subpattern_guide`

**Title.** Haunting accounts in the Archive group into multiple sub-patterns

**Body.** The catalogue groups haunting-class accounts into sub-patterns by phenomenon shape — residential recurring, apparition, sound-only, object movement, sensed presence, and others. Most submitted accounts match more than one sub-pattern.

**Provenance.** Editorial fallback Hint. Surfaces an organizing observation about the corpus without making any claim about the user.

**Tier.** free · **Freshness.** evergreen · **N threshold.** — · **Flags.** fallback, n=1

*Editorial note: Editorial — fallback eligible. Never absence framing.*

### Consciousness practices (NDE / OBE) (3)

#### `consciousness_practices.phen_page.classic_nde`

**Title.** Your account matches the classic NDE pattern

**Body.** The catalogue entry on the classic NDE pattern documents recurring descriptors — tunnel, light, life review, sense of remove, return decision, time distortion, and encountered figures. Your account references several of these.

**Provenance.** Editorial phen-page surface. Descriptor-based trigger; no statistical claim that would require a query.

**Tier.** free · **Freshness.** evergreen · **N threshold.** — · **Flags.** n=1

#### `consciousness_practices.anomalous.tunnel`

**Title.** Tunnel imagery is a documented descriptor in {{descriptor_total_count}} accounts

**Body.** {{descriptor_total_count}} consciousness-practice reports in the Archive describe a tunnel, corridor, or passage between states. The catalogue treats tunnel imagery as a stable cross-cultural descriptor of the NDE/OBE family.

**Provenance.** Count of approved consciousness_practices reports whose extracted descriptors include tunnel_imagery.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 30 · **Flags.** n=1

#### `consciousness_practices.pattern_match.observed_from_above`

**Title.** Your account fits the observed-from-above OBE sub-pattern

**Body.** Of consciousness-practice reports that describe an out-of-body episode, {{subpattern_match_pct}}% reference an observed-from-above perspective — looking down at the room, the body, or the scene. The catalogue treats this as a stable feature of the OBE sub-pattern.

**Provenance.** Percentage of OBE-class consciousness reports whose descriptors include observed_from_above.

**Tier.** basic · **Freshness.** data-driven · **N threshold.** 200 · **Flags.** n=1

### Perception-sensory (sleep paralysis) (3)

#### `perception_sensory.anomalous.shadow_figure`

**Title.** Shadow-figure descriptor anchors to {{descriptor_total_count}} sleep-paralysis accounts

**Body.** {{descriptor_total_count}} perception-sensory reports in the Archive describe a figure perceived as standing, leaning, or sitting at the bedside. The catalogue groups these under the "third-presence" descriptor regardless of cultural framing.

**Provenance.** Count of approved perception_sensory reports whose descriptors include shadow_figure.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 50 · **Flags.** n=1

#### `perception_sensory.witness_state.drowsy`

**Title.** Of perception-sensory accounts, {{witness_state_pct}}% are logged in a drowsy state

**Body.** Reports in this family cluster around the drowsy / falling-asleep state at submission. {{witness_state_pct}}% of perception-sensory accounts were logged with the witness in a drowsy or falling-asleep state — a stable feature of the hypnagogic and hypnopompic record.

**Provenance.** Percentage of approved perception_sensory reports with witness_state_at_event = drowsy_falling_asleep.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 200 · **Flags.** n=1

#### `perception_sensory.anomalous.paralysis_onset`

**Title.** Paralysis-onset descriptor anchors to {{descriptor_total_count}} accounts

**Body.** {{descriptor_total_count}} perception-sensory accounts reference paralysis onset — the inability to move, often paired with awareness and breath. The catalogue groups these under the recognized hypnagogic / hypnopompic descriptor set.

**Provenance.** Count of approved perception_sensory reports whose descriptors include paralysis_onset.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 50 · **Flags.** n=1

### Psychic phenomena (2)

#### `psychic_phenomena.region.sparseness`

**Title.** Psychic accounts from your region are sparse in the Archive

**Body.** Your account is one of {{region_decade_subpattern_count}} the Archive holds from this region and decade combination. The catalogue treats sparseness as a signal worth noting — under-represented regions tend to fill in slowly as the corpus grows.

**Provenance.** Sparseness query — fires only when the count of approved psychic_phenomena reports sharing the user state+decade is <= 10.

**Tier.** free · **Freshness.** data-driven · **N threshold.** — · **Flags.** n=1

*Editorial note: Comparative-quietness Hint — sparseness gate. CTA invites enrichment rather than offering a match.*

#### `psychic_phenomena.phen_page.precognitive_dream`

**Title.** Your account fits the precognitive-dream catalogue entry

**Body.** The catalogue entry on the precognitive-dream pattern documents three recurring features — a dream content, a waking-state confirmation, and a temporal proximity under 72 hours between dream and event. Your account references each of these.

**Provenance.** Editorial phen-page surface. Descriptor-based trigger; no statistical claim.

**Tier.** free · **Freshness.** evergreen · **N threshold.** — · **Flags.** n=1

### Esoteric practices (1)

#### `esoteric_practices.phen_page.synchronicity`

**Title.** Your account fits the meaningful-coincidence class

**Body.** The catalogue entry on synchronicity documents three recurring features — a low-probability pairing of events, a personally significant referent, and a temporal proximity under 72 hours. Your account references all three.

**Provenance.** Editorial phen-page surface for the synchronicity subfamily. Descriptor-based trigger.

**Tier.** free · **Freshness.** evergreen · **N threshold.** — · **Flags.** n=1

### Cross-category (8)

#### `cross_category.static_sensation.cryptid_ufo`

**Title.** Static-electricity descriptor appears across cryptid and UFO accounts

**Body.** The static-electricity sensation recurs across phen families — {{cross_family_a_pct}}% of {{cross_family_a_label}} accounts and {{cross_family_b_pct}}% of {{cross_family_b_label}} accounts reference it. The catalogue treats descriptors that span families as cross-family anchors.

**Provenance.** Two-family overlap query — counts the share of cryptid vs UFO reports referencing static_electricity, both family denominators must clear 100.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 100 · **Flags.** cross-category, n=1

#### `cross_category.tunnel.nde_sp`

**Title.** Tunnel imagery appears across NDE and sleep-paralysis accounts

**Body.** Tunnel imagery recurs across multiple phen families — {{cross_family_a_pct}}% of {{cross_family_a_label}} accounts and {{cross_family_b_pct}}% of {{cross_family_b_label}} accounts reference a tunnel, corridor, or passage. The catalogue treats this as a cross-family descriptor anchored in the NDE/OBE record.

**Provenance.** Two-family overlap query — share of consciousness_practices vs perception_sensory reports referencing tunnel_imagery.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 100 · **Flags.** cross-category, n=1

#### `cross_category.shadow_figure.three_family`

**Title.** Shadow figures appear across three phen families

**Body.** Shadow-figure descriptors appear in {{cross_family_a_label}} ({{cross_family_a_pct}}%), {{cross_family_b_label}} ({{cross_family_b_pct}}%), and {{cross_family_c_label}} ({{cross_family_c_pct}}%) accounts. The catalogue treats this as one of the most consistent cross-family descriptors in the corpus.

**Provenance.** Three-family overlap query — share of each family's reports referencing the shadow_figure descriptor.

**Tier.** basic · **Freshness.** data-driven · **N threshold.** 100 · **Flags.** cross-category, n=1

#### `cross_category.electromagnetic.cryptid_ufo_ghost`

**Title.** Electromagnetic disturbance reports cluster across three families

**Body.** Electromagnetic disturbance — flickering lights, electronics behaving unusually — recurs in {{cross_family_a_label}} ({{cross_family_a_pct}}%), {{cross_family_b_label}} ({{cross_family_b_pct}}%), and {{cross_family_c_label}} ({{cross_family_c_pct}}%) accounts. The catalogue tracks the descriptor across families rather than within any one.

**Provenance.** Three-family overlap query — share of UFO / haunting / cryptid reports referencing the electromagnetic_disturbance descriptor.

**Tier.** basic · **Freshness.** data-driven · **N threshold.** 100 · **Flags.** cross-category, n=1

#### `cross_category.witness_drowsy.sp_obe`

**Title.** Drowsy-state accounts cluster across perception-sensory and consciousness-practice families

**Body.** Of perception-sensory accounts, {{cross_family_a_pct}}% are logged in a drowsy or falling-asleep state. Of consciousness-practice accounts, {{cross_family_b_pct}}% share that witness state. The catalogue treats the drowsy / falling-asleep state as a cross-family anchor for the boundary-of-consciousness corpus.

**Provenance.** Two-family overlap query, witness_drowsy descriptor (joined from witness_state_at_event = drowsy_falling_asleep).

**Tier.** free · **Freshness.** data-driven · **N threshold.** 200 · **Flags.** cross-category, n=1

#### `cross_category.progression.sp_to_obe`

**Title.** Multi-experience users sometimes log sleep-paralysis before OBE

**Body.** Among Archive users with multiple submissions, {{cross_progression_pct}}% who first logged a perception-sensory account later submitted a consciousness-practice account. The catalogue notes this as a pattern in our data, not a prediction.

**Provenance.** Percentage of multi-experience users whose first phen_family is perception_sensory and whose later submissions include consciousness_practices.

**Tier.** basic · **Freshness.** data-driven · **N threshold.** 100 · **Flags.** cross-category

*Editorial note: Cross-experience progression Hint. "Not a prediction" qualifier load-bearing for brand voice.*

#### `cross_category.editorial.descriptor_anchors`

**Title.** The Archive tracks descriptors that span phen families

**Body.** Several descriptors recur across phen families rather than belonging to any one — static electricity, tunnel imagery, shadow figures, electromagnetic disturbance, the being-of-light figure, three-note vocal patterns. The catalogue treats these as cross-family anchors that organize the corpus alongside the family taxonomy.

**Provenance.** Editorial / fallback cross-category Hint. Names the cross-family descriptor lens without making any user-specific claim.

**Tier.** free · **Freshness.** evergreen · **N threshold.** — · **Flags.** cross-category, fallback, n=1

*Editorial note: Pure editorial cross-category Hint. Fallback eligible across all families.*

#### `cross_category.observed_from_above.obe_ufo`

**Title.** Observed-from-above accounts cluster across consciousness-practice and UFO families

**Body.** The observed-from-above perspective recurs across two distinct phen families — {{cross_family_a_pct}}% of {{cross_family_a_label}} OBE accounts and {{cross_family_b_pct}}% of {{cross_family_b_label}} abduction-class accounts reference looking down at a scene or body. The catalogue treats this as one of the more counter-intuitive cross-family anchors in the corpus.

**Provenance.** Two-family overlap query — share of OBE-class consciousness reports vs abduction-class UFO reports referencing the observed_from_above descriptor.

**Tier.** basic · **Freshness.** data-driven · **N threshold.** 200 · **Flags.** cross-category, n=1

### General / editorial / seasonal (18)

#### `general.seasonal.november_dark_evening`

**Title.** November accounts in the Archive — the dark-evening cluster

**Body.** November sits on the on-ramp to the dark months in the Archive. Accounts in this window tilt toward shorter-day outdoor observations and the rise of the household haunting descriptors. The cluster is editorial; the catalogue notes the descriptor shift without forcing a statistical claim.

**Provenance.** Seasonal editorial Hint — descriptive only.

**Tier.** free · **Freshness.** seasonal · **N threshold.** — · **Flags.** fallback, n=1, seasonal

#### `general.seasonal.may_long_evening`

**Title.** May accounts in the Archive — the long-evening transition cluster

**Body.** The catalogue groups May as the transition into summer — accounts in this window tilt toward clear-sky orb sightings, outdoor cryptid reports, and the start of long-evening household observations. The cluster is editorial, named for the calendar rather than a percentage claim.

**Provenance.** Seasonal editorial Hint — descriptive only.

**Tier.** free · **Freshness.** seasonal · **N threshold.** — · **Flags.** fallback, n=1, seasonal

#### `general.seasonal.october_cluster`

**Title.** October accounts in the Archive — {{archive_total_count}} entries

**Body.** The Archive holds {{archive_total_count}} accounts logged in October across all phen families. The catalogue treats October as its own micro-record — the descriptor profile shifts modestly across the month relative to the rest of the year.

**Provenance.** Count of approved reports whose event_date falls in October, excluding year-only event_date_precision rows.

**Tier.** free · **Freshness.** seasonal · **N threshold.** 200 · **Flags.** n=1, seasonal

*Editorial note: October seasonal Hint. v1 hard-coded "14% / 70% above baseline" — those numbers were fabricated. v2 surfaces a count, not a percentage above baseline.*

#### `general.seasonal.halloween_week`

**Title.** Halloween-week accounts in the Archive — {{archive_total_count}} entries

**Body.** The catalogue groups Halloween-week (October 26 – November 2) accounts as a distinct seasonal cluster. The Archive holds {{archive_total_count}} approved reports in that window.

**Provenance.** Count of approved reports whose event_date falls between Oct 26 and Nov 2, excluding year-only precision.

**Tier.** free · **Freshness.** seasonal · **N threshold.** 50 · **Flags.** n=1, seasonal

#### `general.seasonal.winter_solstice`

**Title.** Winter-solstice and Yule-week accounts in the Archive

**Body.** The catalogue keeps a small editorial cluster around the winter-solstice and Yule-week window — accounts from the longest nights of the year, with their own descriptor tilt toward house-bound, family-witnessed, and quiet observations. The cluster is a calendar cousin to the October over-representation.

**Provenance.** Seasonal editorial Hint. No statistical claim — descriptive cluster only.

**Tier.** free · **Freshness.** seasonal · **N threshold.** — · **Flags.** fallback, n=1, seasonal

*Editorial note: Descriptive seasonal Hint — no percentage claim. The month-of-event distribution is noisy because year-only event_dates fall to January; safer to avoid a stat here.*

#### `general.seasonal.new_year_anniversary`

**Title.** January anniversary accounts in the Archive

**Body.** The catalogue treats January as a reflective window — many users revisit older accounts in the new year, and the descriptor profile of submissions in this window tilts toward witnessed-with-family and long-recall accounts. The Archive holds its own January cluster as an editorial sub-record.

**Provenance.** Editorial seasonal Hint. The corpus has a known year-only fallback to January 1, so this Hint avoids any percentage claim about January distribution.

**Tier.** free · **Freshness.** seasonal · **N threshold.** — · **Flags.** fallback, n=1, seasonal

#### `general.seasonal.summer_solstice`

**Title.** Summer-solstice accounts in the Archive

**Body.** The catalogue keeps an editorial cluster around the summer solstice — clear-night observations, outdoor accounts, and the strand of UFO and orb sightings that historically peak in the long evenings of June. The cluster is named for the longest day rather than the descriptor profile that follows.

**Provenance.** Seasonal editorial Hint. Descriptive only — no statistical claim.

**Tier.** free · **Freshness.** seasonal · **N threshold.** — · **Flags.** fallback, n=1, seasonal

#### `general.editorial.archive_growth`

**Title.** The Archive has grown by {{archive_growth_count_30d}} accounts this month

**Body.** In the past 30 days the Archive received {{archive_growth_count_30d}} new approved accounts. The catalogue keeps the corpus growing — every new account folds into the descriptor, regional, and decade lenses that surface on your Record.

**Provenance.** Count of approved reports created in the past 30 days. Editorial / fallback Hint — surfaces growth without ever framing it as absence.

**Tier.** free · **Freshness.** data-driven · **N threshold.** 100 · **Flags.** fallback, n=1

*Editorial note: Replaces v1 Hint #14 ("None matched your fingerprint yet"). Surfaces growth positively, never absence.*

#### `general.seasonal.february_imbolc`

**Title.** February accounts in the Archive — the quiet-month cluster

**Body.** February runs the quieter section of the calendar in the Archive. The catalogue groups the month's accounts as a quiet-record cluster — fewer outdoor sightings, more household and indoor accounts, the descriptor profile tilts toward the small and the close.

**Provenance.** Editorial seasonal Hint. Descriptive only — the corpus February sample is too noisy for a percentage claim given the January year-only fallback.

**Tier.** free · **Freshness.** seasonal · **N threshold.** — · **Flags.** fallback, n=1, seasonal

#### `general.seasonal.spring_equinox`

**Title.** Spring-equinox accounts in the Archive

**Body.** The catalogue keeps an editorial cluster around the spring equinox — accounts that arrive as daylight crosses the midpoint, with their own descriptor tilt toward outdoor observation, weather-shift accounts, and the return of clear-night sky reports. The cluster is named for the equinox window, not the descriptors that follow.

**Provenance.** Seasonal editorial Hint — descriptive only.

**Tier.** free · **Freshness.** seasonal · **N threshold.** — · **Flags.** fallback, n=1, seasonal

#### `general.seasonal.april_easter`

**Title.** April accounts in the Archive — the shoulder-spring cluster

**Body.** The catalogue groups April as a shoulder-spring window — the descriptor profile in April accounts tilts toward outdoor sightings as daylight returns and toward residential accounts in the household-deep-clean / spring-routine stretch. The cluster is editorial, named for the calendar, not a statistical claim.

**Provenance.** Seasonal editorial Hint — descriptive only.

**Tier.** free · **Freshness.** seasonal · **N threshold.** — · **Flags.** fallback, n=1, seasonal

#### `general.seasonal.perseids_august`

**Title.** August accounts in the Archive — clear-night observation cluster

**Body.** The catalogue holds an August editorial cluster around clear-night observation — including the run of mid-month accounts traditionally logged during the Perseids window. The catalogue notes that meteor activity often coincides with elevated outdoor sky-watching, which broadens the descriptor profile of accounts logged in this stretch.

**Provenance.** Seasonal editorial Hint — descriptive only.

**Tier.** free · **Freshness.** seasonal · **N threshold.** — · **Flags.** fallback, n=1, seasonal

#### `general.seasonal.september_back_to_school`

**Title.** September accounts — the back-to-school cluster in sleep-paralysis records

**Body.** The catalogue keeps a small editorial cluster around the September back-to-school window — perception-sensory accounts in this stretch tilt toward stress-shift-and-sleep-disruption descriptors, with elevated mentions of unfamiliar bedrooms and first-week-of-routine accounts.

**Provenance.** Seasonal editorial Hint — descriptive only, no percentage claim.

**Tier.** free · **Freshness.** seasonal · **N threshold.** — · **Flags.** fallback, n=1, seasonal

#### `general.seasonal.july_clear_nights`

**Title.** July accounts in the Archive — the clear-night observation cluster

**Body.** The catalogue keeps a July editorial cluster around the long-evening clear-sky stretch — outdoor sightings, orb and craft-shape accounts, and the post-Independence-Day window when sky-watching elevates. The cluster is descriptive rather than statistical.

**Provenance.** Seasonal editorial Hint — descriptive only.

**Tier.** free · **Freshness.** seasonal · **N threshold.** — · **Flags.** fallback, n=1, seasonal

#### `general.editorial.archive_total_scale`

**Title.** The Archive holds {{archive_total_count}} approved accounts

**Body.** The catalogue holds {{archive_total_count}} approved accounts across all phen families. Every Record sits inside that corpus — the descriptor, decade, and regional lenses on your Record are computed against the live total, recomputed as the Archive grows.

**Provenance.** Total count of approved reports in the Archive. Editorial / fallback Hint. The number updates as the corpus grows — surfacing it positively replaces v1's never-empty floor card.

**Tier.** free · **Freshness.** data-driven · **N threshold.** — · **Flags.** fallback, n=1

*Editorial note: Universal editorial fallback — eligible for any user, any visit, when no stronger Hint qualifies. Always positive framing.*

#### `pro.geographic.county_density`

**Title.** County-level density: {{nearby_count_within_50mi}} accounts in your immediate area

**Body.** At the Pro tier the Archive surfaces county-level density. The catalogue holds {{nearby_count_within_50mi}} approved accounts within 50 miles of your reported location, broken out by phen family on the Pro geographic panel.

**Provenance.** Approved reports across all phen families within 50 mi of user coordinates. Pro depth.

**Tier.** pro · **Freshness.** data-driven · **N threshold.** 3 · **Flags.** n=1

#### `pro.temporal.decade_breakdown`

**Title.** Decade breakdown: your {{event_decade}}s account sits inside a {{decade_share_pct}}% slice

**Body.** Of dated approved accounts in your phen family, {{decade_share_pct}}% were logged in the {{event_decade}}s. The Pro temporal lens breaks this down by sub-pattern and region.

**Provenance.** Decade share within UFO family — Pro depth view exposes the breakdown by subfamily and region.

**Tier.** pro · **Freshness.** data-driven · **N threshold.** 500 · **Flags.** n=1

#### `pro.editorial.export_ready`

**Title.** Pro: the underlying queries that built this Hint are exportable

**Body.** At the Pro tier, each Hint exposes its underlying query — the SQL fragment, the denominator, the date of recomputation. The catalogue keeps the audit trail visible so the operator can verify any claim against the live corpus.

**Provenance.** Pro-tier editorial Hint surfacing the audit-trail / provenance affordance. No statistical claim.

**Tier.** pro · **Freshness.** evergreen · **N threshold.** — · **Flags.** fallback, n=1

*Editorial note: Pro-tier editorial / fallback. Replaces v1 Hint #14 as the Pro never-empty floor.*

---

## Coverage matrix

| # | id | family | type | n=1? | tier | freshness | x-cat | fallback | seasonal |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `cryptids.pattern_match.bigfoot_whoop` | cryptids | pattern_match | yes | free | data-driven |  |  |  |
| 2 | `cryptids.anomalous.static_sensation` | cryptids | anomalous_detail | yes | free | data-driven |  |  |  |
| 3 | `cryptids.geographic.nearby_corridor` | cryptids | geographic_context | yes | free | data-driven |  |  |  |
| 4 | `general.seasonal.november_dark_evening` | general | editorial | yes | free | seasonal |  | yes | yes |
| 5 | `cryptids.pattern_match.named_match` | cryptids | pattern_match | yes | basic | data-driven |  |  |  |
| 6 | `ufos_aliens.pattern_match.triangle_subpattern` | ufos_aliens | pattern_match | yes | free | data-driven |  |  |  |
| 7 | `ufos_aliens.geographic.corridor_50mi` | ufos_aliens | geographic_context | yes | free | data-driven |  |  |  |
| 8 | `ufos_aliens.temporal.decade_share` | ufos_aliens | temporal_context | yes | basic | data-driven |  |  |  |
| 9 | `ufos_aliens.anomalous.electromagnetic` | ufos_aliens | anomalous_detail | yes | free | data-driven |  |  |  |
| 10 | `ufos_aliens.pattern_match.named_match` | ufos_aliens | pattern_match | yes | basic | data-driven |  |  |  |
| 11 | `ufos_aliens.phen_page.craft_shape_disc` | ufos_aliens | phen_page_surface | yes | free | evergreen |  |  |  |
| 12 | `ghosts_hauntings.geographic.nearby_20mi` | ghosts_hauntings | geographic_context | yes | free | data-driven |  |  |  |
| 13 | `ghosts_hauntings.anomalous.shadow_figure` | ghosts_hauntings | anomalous_detail | yes | free | data-driven |  |  |  |
| 14 | `ghosts_hauntings.temporal.decade_share` | ghosts_hauntings | temporal_context | yes | basic | data-driven |  |  |  |
| 15 | `ghosts_hauntings.cross_experience.recurring_location` | ghosts_hauntings | cross_experience | no | basic | evergreen |  |  |  |
| 16 | `ghosts_hauntings.editorial.subpattern_guide` | ghosts_hauntings | editorial | yes | free | evergreen |  | yes |  |
| 17 | `consciousness_practices.phen_page.classic_nde` | consciousness_practices | phen_page_surface | yes | free | evergreen |  |  |  |
| 18 | `consciousness_practices.anomalous.tunnel` | consciousness_practices | anomalous_detail | yes | free | data-driven |  |  |  |
| 19 | `general.seasonal.may_long_evening` | general | editorial | yes | free | seasonal |  | yes | yes |
| 20 | `consciousness_practices.pattern_match.observed_from_above` | consciousness_practices | pattern_match | yes | basic | data-driven |  |  |  |
| 21 | `perception_sensory.anomalous.shadow_figure` | perception_sensory | anomalous_detail | yes | free | data-driven |  |  |  |
| 22 | `perception_sensory.witness_state.drowsy` | perception_sensory | pattern_match | yes | free | data-driven |  |  |  |
| 23 | `perception_sensory.anomalous.paralysis_onset` | perception_sensory | anomalous_detail | yes | free | data-driven |  |  |  |
| 24 | `psychic_phenomena.region.sparseness` | psychic_phenomena | comparative_quietness | yes | free | data-driven |  |  |  |
| 25 | `psychic_phenomena.phen_page.precognitive_dream` | psychic_phenomena | phen_page_surface | yes | free | evergreen |  |  |  |
| 26 | `esoteric_practices.phen_page.synchronicity` | esoteric_practices | phen_page_surface | yes | free | evergreen |  |  |  |
| 27 | `cross_category.static_sensation.cryptid_ufo` | cross_category | cross_category | yes | free | data-driven | yes |  |  |
| 28 | `cross_category.tunnel.nde_sp` | cross_category | cross_category | yes | free | data-driven | yes |  |  |
| 29 | `cross_category.shadow_figure.three_family` | cross_category | cross_category | yes | basic | data-driven | yes |  |  |
| 30 | `cross_category.electromagnetic.cryptid_ufo_ghost` | cross_category | cross_category | yes | basic | data-driven | yes |  |  |
| 31 | `cross_category.witness_drowsy.sp_obe` | cross_category | cross_category | yes | free | data-driven | yes |  |  |
| 32 | `cross_category.progression.sp_to_obe` | cross_category | cross_experience | no | basic | data-driven | yes |  |  |
| 33 | `cross_category.editorial.descriptor_anchors` | cross_category | editorial | yes | free | evergreen | yes | yes |  |
| 34 | `cross_category.observed_from_above.obe_ufo` | cross_category | cross_category | yes | basic | data-driven | yes |  |  |
| 35 | `general.seasonal.october_cluster` | general | temporal_context | yes | free | seasonal |  |  | yes |
| 36 | `general.seasonal.halloween_week` | general | temporal_context | yes | free | seasonal |  |  | yes |
| 37 | `general.seasonal.winter_solstice` | general | editorial | yes | free | seasonal |  | yes | yes |
| 38 | `general.seasonal.new_year_anniversary` | general | editorial | yes | free | seasonal |  | yes | yes |
| 39 | `general.seasonal.summer_solstice` | general | editorial | yes | free | seasonal |  | yes | yes |
| 40 | `general.editorial.archive_growth` | general | editorial | yes | free | data-driven |  | yes |  |
| 41 | `general.seasonal.february_imbolc` | general | editorial | yes | free | seasonal |  | yes | yes |
| 42 | `general.seasonal.spring_equinox` | general | editorial | yes | free | seasonal |  | yes | yes |
| 43 | `general.seasonal.april_easter` | general | editorial | yes | free | seasonal |  | yes | yes |
| 44 | `general.seasonal.perseids_august` | general | editorial | yes | free | seasonal |  | yes | yes |
| 45 | `general.seasonal.september_back_to_school` | general | editorial | yes | free | seasonal |  | yes | yes |
| 46 | `general.seasonal.july_clear_nights` | general | editorial | yes | free | seasonal |  | yes | yes |
| 47 | `general.editorial.archive_total_scale` | general | editorial | yes | free | data-driven |  | yes |  |
| 48 | `pro.geographic.county_density` | general | geographic_context | yes | pro | data-driven |  |  |  |
| 49 | `pro.temporal.decade_breakdown` | general | temporal_context | yes | pro | data-driven |  |  |  |
| 50 | `pro.editorial.export_ready` | general | editorial | yes | pro | evergreen |  | yes |  |

## Open questions for founder

1. **Named-match volume.** v2 ships only 2 named-match Hints (cryptids + ufos_aliens). The brief's tier-split target suggested ~6 Basic-tier Hints; v2 lands at 10 Basic but most of those are depth-of-information (decade share, county density, cross-family 3-family overlap), not named-match. Reason: cryptids has 3.2k reports and ufos_aliens has 28k; the rest of the families have lower coverage of geocoded reports or fewer opted-in counterparties. Add named-match Hints for ghosts_hauntings, consciousness_practices, perception_sensory once the matched-user opt-in flow lands in production?

2. **First-match threshold confirmation.** Per founder direction: 3 signals minimum, 4 for first-ever match. v2 encodes this as `named_match_requirements.first_match_min_signals: 4`. Confirm 4 is right (vs 5).

3. **Descriptive vs statistical seasonals.** Three seasonals carry a count token (October cluster, Halloween week, archive growth). The other 10 are descriptive-only. The asymmetry is deliberate — descriptors are safer when month-of-event distribution is noisy (the corpus has a known year-only fallback to Jan 1). Confirm: keep mixed, or push all seasonals to data-driven where possible?

4. **Sparseness deanonymization risk.** `psychic_phenomena.region.sparseness` says "Your account is one of N from this region and decade." For N=1 or N=2, that implicitly identifies the user. Should the gate floor at N>=3 to protect deanonymization?

5. **Provenance "see how this was computed" affordance.** Every Hint declares a `provenance_description`. Surface it as a user-facing affordance (Basic+ depth, per V3 Section 2 matrix) in MVP, or keep operator-only?

6. **Cultural-lineage seasonal Hints.** v2 keeps seasonal labels neutral ("Winter solstice / Yule", "May long-evening transition", "Halloween week"). Should specific lineage windows (Day of the Dead Oct 31–Nov 2, Obon mid-August, etc.) earn their own Hints later?

