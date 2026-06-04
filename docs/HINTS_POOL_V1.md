# Hints Pool — v1 (Seed of 14)

**To:** Chase
**Re:** First seed pool of Hints for the Lab. Founder sign-off requested on format before expansion to ~50.
**Schema:** `/Users/chase/paradocs/src/lib/lab/hints/hint-schema.ts`
**Pool:** `/Users/chase/paradocs/src/lib/lab/hints/seed-hints.ts`

---

## What a Hint is

A Hint is one discovery card that fires in a user's Record after submission — the Ancestry-style "this could be a match" surface, retargeted at paranormal/anomalous experience patterns and the 200k-report Archive. Each Hint draws a single connection between the user's submitted account and the wider corpus: a sub-pattern they fit, a window of time their event occurred in, a region with a documented cluster, an encyclopedia entry their account matches, a specific descriptor that anchors to a known anomaly, a sparseness their account adds to, or a cross-experience arc visible across their own submissions.

Hints power the never-empty floor of the Lab loop (LAB_PANEL_REVIEW_V3 Section 4). On every visit the user sees a sentence with substance — even when no high-confidence match exists. The cadence layer picks one Hint per visit from the eligible pool, ranked by confidence, with a fallback chain to evergreen Hints and operator-curated editorial picks when nothing data-driven qualifies.

## Why this seed pool is structured this way

Three constraints shaped the seed:

1. **One submitted experience is the gold standard.** Twelve of the fourteen Hints below qualify with `min_match_signals: 1` and a single submission. Two cross-experience Hints (n=3+) are included to validate the schema handles the multi-experience case but are tier-gated behind Basic where the cross-experience header itself sits.
2. **Coverage across families and types.** All seven phenomenon families and all seven hint types appear at least once. The matrix at the bottom of this doc summarizes coverage.
3. **Tier governs depth, never access.** Ten Hints free, three Basic (one named-match offer + two cross-experience), one Pro (the nightly-recompute never-empty floor card). The named-match Hint requires mutual opt-in on both ends — encoded in the CTA target type.

## Voice / style rules (load-bearing)

- Documentary, matter-of-fact, comparative. Allowed register: percentages of the corpus, distances in miles, named decades, named windows of time, named regions, counts of reports.
- The corpus is described first; the user is placed within it second. (V3 Section 5 — the inversion that defuses diagnostic risk.)
- No diagnostic vocabulary (anxiety, depression, dissociation, trauma, PTSD). Use language-pattern descriptors instead (unease, wonder, calm, alarm, curiosity, resolution).
- Forbidden phrasings: "you might be interested in", "fun fact", "did you know", "fascinating", "spooky", "creepy", "weird".
- No exclamation marks. No all-caps. No emoji.
- `{{tokens}}` in body text are runtime substitutions for data-driven Hints (counts, distances, dates). Evergreen Hints contain no tokens.

---

## The 14 seed Hints

### 1. cryptids.pattern_match.bigfoot_whoop  (free, data-driven)

**Title.** Your auditory descriptors align with the documented "whoop" sub-pattern.

**Body.** Of the {{whoop_count}} Bigfoot-class reports in the Archive that describe a vocalization, roughly 41% use language similar to yours — a low, rising whoop heard at distance. The catalogue groups these under the "whoop" sub-pattern.

**Triggers when:** phen_family is cryptids + subfamily is bigfoot_class + account contains any of: whoop, howl, call, vocalization.

**CTA:** "See the sub-pattern" → related reports view.

---

### 2. cryptids.anomalous.static_sensation  (free, evergreen)

**Title.** The static-electricity sensation you described is a recurring anchor in the corpus.

**Body.** In close-encounter reports across the cryptid and UFO families, 31% of accounts mention a static, tingling, or hair-stand sensation in the seconds before the sighting. The catalogue treats this as a stable anomalous descriptor rather than a coincidence.

**Triggers when:** phen_family is cryptids or ufos_aliens + account contains static / tingling / hair-stand descriptors.

**CTA:** "View related accounts" → related reports view.

---

### 3. ufos_aliens.temporal.liminal_hours  (free, data-driven)

**Title.** Your encounter falls inside the 12 AM–4 AM cluster the catalogue calls the liminal hours.

**Body.** Of UFO-shape reports in the Archive, 64% are logged between midnight and 4 AM. Your account at {{event_time}} sits inside that window — the densest band on the 24-hour dial for this phenomenon family.

**Triggers when:** phen_family is ufos_aliens + event time falls between 00:00 and 04:00.

**CTA:** "See the 24-hour distribution" → related reports view.

---

### 4. ufos_aliens.geographic.corridor  (free, data-driven)

**Title.** {{nearby_count}} reports of lights-in-formation were logged within {{radius_mi}} miles of your account.

**Body.** The closest in time and place was {{closest_date}}, {{closest_distance_mi}} miles from your reported location. Reports in this region cluster along a roughly NW-SE corridor when the corridor algorithm finds one.

**Triggers when:** phen_family is ufos_aliens + ≥3 reports within 50 mi.

**CTA:** "Open the geographic panel" → related reports view. Corridor sentence suppressed by renderer when algorithm finds no real corridor.

---

### 5. ufos_aliens.pattern_match.triangle  (basic, data-driven, named-match)

**Title.** One nearby account has opted in to be discovered and matches your triangle sighting on three signals.

**Body.** A user whose Record includes a triangle sighting within {{closest_distance_mi}} miles and within the same decade has enabled named-match offers. Mutual opt-in is required on both sides before any identifying detail is shared.

**Triggers when:** phen_family is ufos_aliens + subfamily is triangle_class + multi-signal fingerprint ≥3 signals + ≥1 nearby opted-in user.

**CTA:** "Review the match offer" → mutual-match invite flow.

---

### 6. ghosts_hauntings.geographic.nearby  (free, data-driven)

**Title.** {{nearby_count}} haunting accounts have been logged within {{radius_mi}} miles of your location.

**Body.** Three of those describe the same general phenomenon class — residential, recurring, no apparition. The closest in time was {{closest_date}}.

**Triggers when:** phen_family is ghosts_hauntings + ≥2 reports within 20 mi.

**CTA:** "See the geographic panel" → related reports view.

---

### 7. ghosts_hauntings.cross_phen.sp_haunt  (basic, evergreen, n≥3)

**Title.** Across your submissions, two accounts share a recurring location anchor.

**Body.** Two of your three Record entries reference the same address or building. In the Archive, recurring-location accounts make up 18% of haunting-class reports and tend to surface adjacent sub-patterns over time.

**Triggers when:** phen_family is ghosts_hauntings + user has ≥3 submissions + ≥2 share a location anchor.

**CTA:** "Open cross-experience view" → related reports view.

---

### 8. nde_obe.phen_page.classic_nde  (free, evergreen)

**Title.** Your account contains four of the eight descriptors the catalogue lists for the classic NDE pattern.

**Body.** The catalogue entry on the classic NDE pattern documents eight recurring descriptors — tunnel, light, life review, sense of remove, return decision, after-effects, time distortion, and encountered figures. Your account references four of these.

**Triggers when:** phen_family is nde_obe + subfamily is classic_nde + ≥1 descriptor match.

**CTA:** "Read the catalogue entry" → phen page (nde-classic-pattern).

---

### 9. nde_obe.cross_phen.sp_to_obe  (basic, evergreen, n≥3)

**Title.** A pattern in the corpus: sleep-paralysis accounts are often followed by OBE accounts from the same witness.

**Body.** Among Archive users with three or more submissions, 22% who first logged a sleep-paralysis account later submitted an OBE account. Your Record fits the first half of that arc. The catalogue notes this as a pattern in our data, not a prediction.

**Triggers when:** phen_family is nde_obe or sleep_paralysis + user has ≥3 submissions + ≥2 signal match.

**CTA:** "Read the catalogue note" → phen page (sp-obe-progression).

---

### 10. sleep_paralysis.anomalous.shadow_figure  (free, evergreen)

**Title.** The shadow-figure descriptor in your account anchors to one of the corpus's most documented sub-patterns.

**Body.** Of sleep-paralysis reports in the Archive, 57% describe a figure perceived as standing, leaning, or sitting at the bedside. The catalogue groups these under the "third-presence" descriptor regardless of cultural framing.

**Triggers when:** phen_family is sleep_paralysis + account contains shadow / figure / presence / bedside / standing.

**CTA:** "View the third-presence catalogue page" → phen page (sp-third-presence).

---

### 11. psychic.comparative_quiet.rural_state  (free, data-driven)

**Title.** Reports of precognitive dream accounts from rural {{region}} are rare in the Archive.

**Body.** Your account is the {{nth}} the Archive holds from this region and decade combination. The catalogue treats sparseness as a signal worth noting — under-represented regions tend to fill in slowly as the corpus grows.

**Triggers when:** phen_family is psychic + subfamily is precognitive_dream + user's region+decade+sub-pattern combination has <5 entries.

**CTA:** "Add detail to strengthen the regional record" → add-detail prompt.

---

### 12. esoteric.phen_page.synchronicity  (free, evergreen)

**Title.** Your account fits the catalogue's description of the meaningful-coincidence class.

**Body.** The catalogue entry on synchronicity documents three recurring features: a low-probability pairing of events, a personally significant referent, and a temporal proximity under 72 hours. Your account references all three.

**Triggers when:** phen_family is esoteric + subfamily is synchronicity + account contains coincidence / meaningful / timing descriptors.

**CTA:** "Read the catalogue entry" → phen page (synchronicity).

---

### 13. general.temporal.october_cluster  (free, seasonal)

**Title.** Encounters logged in October are over-represented in the Archive relative to other months.

**Body.** October accounts for 14% of all submissions across phenomenon families — roughly 70% above the monthly baseline. Your {{event_month}} account sits inside that cluster.

**Triggers when:** event month is October. Eligible only during October.

**CTA:** "See the monthly distribution" → related reports view.

---

### 14. general.comparative_quiet.archive_grow  (pro, data-driven, fallback)

**Title.** The Archive grew by {{new_report_count}} reports this month. None matched your fingerprint yet.

**Body.** The corpus is recomputed nightly at this tier. Your fingerprint is held against every new ingest. When a match crosses the confidence threshold, it surfaces here.

**Triggers when:** no other Hint qualifies in the cadence + user is on Pro. Fallback floor.

**CTA:** "Open Record" → noop.

---

## Coverage matrix

| # | id | family | type | n=1? | tier | freshness |
|---|---|---|---|---|---|---|
| 1 | cryptids.pattern_match.bigfoot_whoop | cryptids | pattern_match | yes | free | data-driven |
| 2 | cryptids.anomalous.static_sensation | cryptids | anomalous_detail | yes | free | evergreen |
| 3 | ufos_aliens.temporal.liminal_hours | ufos_aliens | temporal_context | yes | free | data-driven |
| 4 | ufos_aliens.geographic.corridor | ufos_aliens | geographic_context | yes | free | data-driven |
| 5 | ufos_aliens.pattern_match.triangle | ufos_aliens | pattern_match | yes | **basic** | data-driven |
| 6 | ghosts_hauntings.geographic.nearby | ghosts_hauntings | geographic_context | yes | free | data-driven |
| 7 | ghosts_hauntings.cross_phen.sp_haunt | ghosts_hauntings | cross_phenomenon | no (n≥3) | **basic** | evergreen |
| 8 | nde_obe.phen_page.classic_nde | nde_obe | phen_page_surface | yes | free | evergreen |
| 9 | nde_obe.cross_phen.sp_to_obe | nde_obe | cross_phenomenon | no (n≥3) | **basic** | evergreen |
| 10 | sleep_paralysis.anomalous.shadow_figure | sleep_paralysis | anomalous_detail | yes | free | evergreen |
| 11 | psychic.comparative_quiet.rural_state | psychic | comparative_quietness | yes | free | data-driven |
| 12 | esoteric.phen_page.synchronicity | esoteric | phen_page_surface | yes | free | evergreen |
| 13 | general.temporal.october_cluster | general | temporal_context | yes | free | seasonal |
| 14 | general.comparative_quiet.archive_grow | general | comparative_quietness | yes | **pro** | data-driven |

**Family coverage:** cryptids ×2, ufos_aliens ×3, ghosts_hauntings ×2, nde_obe ×2, sleep_paralysis ×1, psychic ×1, esoteric ×1, general ×2. All seven families ≥1.

**Type coverage:** pattern_match ×2, temporal_context ×2, geographic_context ×2, phen_page_surface ×2, anomalous_detail ×2, comparative_quietness ×2, cross_phenomenon ×2. All seven types ≥1.

**Tier distribution:** 10 free, 3 basic, 1 pro.

**Freshness distribution:** 7 data-driven, 6 evergreen, 1 seasonal.

---

## Open questions for founder review

1. **Token vocabulary lock-in.** The data-driven Hints assume a stable set of runtime tokens (`{{nearby_count}}`, `{{radius_mi}}`, `{{closest_date}}`, `{{closest_distance_mi}}`, `{{event_time}}`, `{{event_month}}`, `{{whoop_count}}`, `{{region}}`, `{{nth}}`, `{{new_report_count}}`). Worth a brief alignment pass before the expansion to 50 — once 50 Hints are using these tokens, renaming any of them is a sed-and-pray exercise.
2. **Named-match Hint frequency floor.** Hint #5 fires only when multi-signal fingerprint ≥3 + nearby opted-in user exists. Founder direction wanted aggressive cadence; the V3 panel set a high confidence bar to protect retention. Is the current threshold the right floor, or should we soften to 2 signals + a softer language frame ("a possible peer") to fire more often?
3. **The Pro-only fallback Hint (#14).** This is a retention-protection card for paying users on nights when nothing else qualifies. Founder may want a Free/Basic equivalent (e.g. "the Archive grew this week, your match queue is being watched") so the never-empty floor is felt at every tier. The V3 panel's instinct was operator-curated editorial picks fill that gap for Free/Basic — but if the founder wants a system-generated equivalent, it's a small lift to add.
4. **Seasonal Hint policy.** Only one seasonal Hint in the seed (#13, October). Worth committing to a calendar of seasonal Hints (full-moon weeks, equinoxes, regional folkloric calendars) before the expansion, or hold seasonal until v2?
5. **Editorial workflow ownership.** V3 Section 7 Q3 noted: "Who owns this content workflow?" If the expansion to 50 happens with operator review, what's the founder's preferred volume — 50 in one batch, or 10/week over five weeks with founder review at each gate?

