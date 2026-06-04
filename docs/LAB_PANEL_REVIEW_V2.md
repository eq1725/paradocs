# Lab Panel Review V2 — Iterating on Your Five Notes

**To:** Chase
**From:** The Lab Panel (same seven voices, reconvened June 2026)
**Re:** Founder response to v1; sharpening recommendations on retirement of "constellation," multi-experience parity, richer pattern surfaces, peer matching, and RADAR scope clarity
**Length:** ~2,700 words
**Predecessor:** `/Users/chase/paradocs/docs/LAB_PANEL_REVIEW.md`

---

## TL;DR

- **"Constellation" goes — every appearance.** The panel debated and could not produce a defense the documentary voice survives. We're proposing concrete renames in code (table aliases via views), components, and copy, with a migration path that does not require a heavy SQL rewrite on day one.
- **One spine for everyone, scaled by density.** A single combined timeline ("Your Record") is the right surface for both the one-and-done and the collector — but the rendering scales: a single experience is presented as a full-bleed dossier; multiples accumulate as a vertical chronicle that grows richer (and adds cross-experience analytics) at thresholds of 2, 5, and 15+.
- **Pattern surface needs to feel like a documentary about you.** v1 collapsed four Signal cards into one prose paragraph. v2 keeps the paragraph and adds three earned visual surfaces: a temporal strip (clock + decade), a geographic heat panel (your radius vs. the wider record), and a sentiment arc (only when ≥3 experiences). Spotify-Wrapped's restraint, Strava's data density, Apple Health's reluctance to over-claim.
- **Peer matching is the moat — but it must be soft-first.** v2 proposes a two-band model: anonymous aggregate ("8 people in Robeson County have logged triangle sightings") shown to everyone; named one-to-one match offers ("This person logged something similar — would you like to be introduced?") shown only on double opt-in. Soft beats explicit; reveal is earned.
- **RADAR is mis-scoped, not broken.** Add a permanent eyebrow ("Reports near your 1998 Lumberton triangle — UFO-shape matches only, last 50 years"), a "What's not shown" tooltip, and a "Widen the view" pill. Keep RADAR as a hero animation and a focused lens; don't make it carry "everything in the archive" duty.

---

## Note 1 — Retire "constellation"

**Strongest voices:** Documentary Editorial, Consumer Product Strategist, AI Product Designer.

The panel tried in good faith to defend the term and could not. "Constellation" carries three problems the v1 review only glanced at: (1) it's *astrology-adjacent* — it tilts the brand the exact half-step toward woo that the catalogue voice spent two years backing away from; (2) it implies *fixed shape* — your experiences as a pre-existing pattern in the sky waiting to be read — when the actual product promise is that connections *form* as the archive grows; (3) it has no verb form. Users can "file a report," "save," "claim," "add to my record." They cannot "constellate." Words that don't generate verbs do not generate engagement.

We recommend full retirement, but staged. The user-facing copy and component names can flip this week; the database tables stay (renaming is expensive and risky given the foreign keys and RLS policies already deployed) but we add a thin presentation layer.

The **collective replacement** that survived three rounds of editorial argument: **"Record"** for the user's personal corpus (their submitted experiences + everything attached to them); **"the archive"** for the broader catalogue; **"Collections"** stays for case files (already good). "Record" is documentary, has a verb form ("add to my record"), is what museums and archives actually call this object, and reads correctly to a 65-year-old in Ohio and a 24-year-old in Brooklyn.

Specific renames are listed in the *Final Naming Recommendation* section below. The one sub-decision for you: **the URL.** `/lab` stays as the subscription product name and route (recognizable, indexed, in PostHog) — but the page header chrome no longer says "Lab" anywhere. The user-facing name in nav becomes "**My Record**" (v1 said "My Archive"; the panel re-debated and "Record" is stronger because *the archive* is the wider catalogue, while *your record* is the singular thing you build). This single rename ripples cleanly across the Signal copy, the digest emails, the push notification templates, and the marketing pages.

---

## Note 2 — Unlimited experiences, combined timeline, single-experience parity

**Strongest voices:** Ancestry-style UX Expert, Behavioral Designer, Onboarding & Activation Expert.

This is the most important note in the founder's response, and the v1 memo handled it as a footnote ("decide now: one combined timeline or per-experience archives — recommendation, combined"). v2 designs both halves.

**The spine is one timeline, always.** Call it **My Record.** It renders as a single vertical chronicle, oldest-experience-at-top (museum-archive convention; date-ascending also helps with the "this happened *before* that" cognitive frame that matters when a user is making sense of a life). Every experience is a stop on the timeline. Everything attached — confirmed matches, claimed phenomena, peer connections — clusters under its parent experience as a sub-stack.

**Single-experience UX (the one-and-done user, our mass market):** The timeline degenerates to a single dossier card that takes the full Record viewport. The 1998 Lumberton triangle is the page. Above it: the synthesized AI paragraph (the "where this sits" sentence). Below it: the temporal strip (clock-and-decade), the geographic panel (your radius), the matches stack, the Hints queue. The "Add another to your record" pill sits permanently below the dossier, never above it — we don't want to tell a first-time user "you should have more" before they've finished reading their first one.

**Multi-experience UX (2-4):** The timeline becomes a vertical scroll of dossier cards. Each one keeps its own temporal/geographic/match panels, but a *cross-experience header* appears at the very top: "Three experiences spanning 1998-2014. Two share a Robeson County radius; all three are night-time accounts." This is the compounding-value moment — the user sees that adding a second experience *immediately* generated a comparative summary. The synthesized paragraph at this point talks about the *body of work*, not just the most recent submission.

**Collector UX (5+):** The cross-experience header earns more visual real estate. It now includes the temporal strip aggregated across all experiences, a geographic heat panel showing all locations, and a *sentiment arc* (only valid with ≥3 experiences worth of language to compare). The individual dossier cards collapse to summary cards by default with an expand affordance — otherwise the page becomes a wall.

**Power UX (15+):** At this threshold we introduce a **filter/lens bar** above the timeline ("All experiences | Phenomenon: UFO | Decade: 1990s | State: NC") so the page stays usable. The collector becomes a real archivist of self at this point.

**The empty state (zero experiences):** v1's "preview Lab with sample user's archive" is the right call but underspecified. Concretely: render a *ghosted* dossier — the 1998 Lumberton triangle as a sample, dimmed at 30% opacity with a "Sample — this is what your Record looks like" eyebrow, the AI paragraph reading "Once you share an experience, this is where you'll see how it connects to the wider archive." Below it a single CTA: "Share your first experience." No tab chrome, no filters, no empty Signal cards. One screen, one decision.

**AI summary copy at 1, 5, 50:**
- 1 experience: *"Your 1998 Lumberton triangle is one of 23 triangle sightings in central NC in the late 1990s. The closest in time was July 14, 1998, eleven miles east."*
- 5: *"Across five experiences from 1991 to 2014, the throughline is night-time observation in Robeson County. Three describe a triangular or V-shape. Two are family-shared events."*
- 50: *"Your record spans 1971 to 2024 — 32 years of documented accounts. The dominant phenomenon-type is UFO-shape (28 of 50). 60% occurred between 10 PM and 3 AM. North Carolina is the geographic anchor, but five accounts were logged while traveling."*

**Sub-decision for the founder:** Do we cap free-tier submissions at 1, or at 3? The Subscription Strategist's view in v1 was 1; the panel now argues for **3** — because the "compounding value" promise only becomes legible at 2-3 experiences, and a hard cap at 1 means the marginal user never feels the compounding before being asked to pay. 3 lets them taste the multi-experience header once, then paywalls unlimited.

---

## Note 3 — Richer emergent patterns / sentiment / temporal / geographic UX

**Strongest voices:** AI Product Designer, Documentary Editorial, Consumer Product Strategist.

The synthesized paragraph from v1 is the hook; v2 adds three earned visual surfaces, sized for mobile-first and rigorously sober in voice.

**Temporal strip** (always rendered, even at 1 experience): a 24-hour clock dial with the user's experience(s) plotted as dots, layered against a faint background of the archive's distribution for the same phenomenon-type. Below it, a horizontal decade band (1950 → 2020s) with the same dual-layer. Copy underneath: *"Your accounts cluster between 11 PM and 2 AM, like 68% of UFO-shape reports in the archive."* This is the Spotify-Wrapped-equivalent that earns its place because it answers the question the user is actually carrying: *am I weird, or is this normal for this kind of thing?* The dual-layer (you against the archive) is the brand promise made visual.

**Geographic panel** (rendered when location exists on at least one experience): a small map tile centered on the user's experience(s), with a configurable radius ring (default 50 miles). Overlaid: a heat density of archive reports matching the same phenomenon family. Below the map, three concrete data lines:
- *"Within 50 miles of your accounts: 14 related reports."*
- *"The closest in time and place: July 14, 1998, eleven miles east."*
- *"Reports cluster on a roughly NW-SE corridor along US-74."* (only when the algorithm finds a real corridor; suppressed otherwise to avoid forcing a finding)

The map is *not* the existing RADAR — it's a real geographic map (the `/map` surface, embedded). The RADAR keeps its role as the hero animation and the abstract "your story in the archive" view; the geographic panel is the concrete spatial truth.

**Sentiment arc** (rendered when ≥3 experiences with description text): the AI compares the language of early vs. recent accounts and surfaces shifts. *"Your earlier accounts describe fear and confusion; the 2014 account describes acceptance. This shift appears in 41% of multi-experience users with a similar phenomenon profile."* This is the highest-risk surface in the panel — sentiment analysis on traumatic / formative experiences must not feel diagnostic. The rule: state the observation, name the percentage of others who share it, never interpret what it means. The user does the interpreting.

**Pattern-match band** (the deepest AI surface, paywalled past the first reveal): the existing Cluster card's "your descriptors match the Bigfoot vocalization sub-pattern more than the cryptid-vocalization general one" lives here. Copy template: *"The auditory descriptors in your account most closely match the [specific sub-pattern] cluster, not the general [parent pattern]."* The specificity (sub-pattern vs. parent) is what differentiates Paradocs's AI from a generic chatbot — it should be the headline of the paywall surface.

**Comparative "your data vs. catalogue average" panel** (rendered when ≥2 experiences): one row per dimension where the user diverges meaningfully from the catalogue baseline. *"Time of day: yours 11 PM–2 AM, catalogue 9 PM–4 AM (you skew narrower late)." "Witness count: yours mostly solo, catalogue 60% multi-witness."* Two or three rows, never more. This is Apple-Health-style: show the comparison, let the user think.

**The structural rule across all four:** every visual surface must be paired with a one-sentence summary in the documentary voice. The visual without the sentence is decoration; the sentence without the visual is a chatbot. Both is the product.

---

## Note 4 — Better matching to others on the site

**Strongest voices:** Genealogy / Ancestry UX Expert, Subscription Strategist, Behavioral Designer.

This is, in the panel's reading, the **largest moat available to Paradocs and the most under-developed surface today.** The v1 "Hints queue" was right in shape but timid in ambition.

**The conceptual match model:** every experience produces a weighted multi-signal fingerprint. The signals, ranked by panel-agreed match strength:
1. **Phenomenon sub-type** (sharpest — "triangle UFO" matches "triangle UFO" much harder than "UFO" matches "UFO")
2. **Geographic proximity** (under 50 miles is a strong signal; under 10 miles is near-conclusive)
3. **Time proximity** (same year is moderate; same month is strong; same night is extraordinary)
4. **Time-of-day pattern** (matters more than people expect — late-night clusters are signal-dense)
5. **Sensory descriptors** (extracted via embeddings — the auditory/visual/somatic vocabulary the user used)
6. **Witness count + relation** (solo vs. shared vs. family vs. stranger)
7. **Sentiment trajectory** (only on multi-experience users)
8. **Phenomenon adjacency** (a UFO sighting with missing-time has different match graph than one without)

A "match" surfaces when ≥3 signals reach a confidence threshold. The threshold itself is the dial; suggested starting point is conservative (better to show fewer, stronger matches than many soft ones).

**How matches are SHOWN:** the panel argues for **two distinct surface registers**.

The first is **aggregate / anonymous** — *always-on, no permission required, shown to everyone*. *"8 people in your county have logged triangle sightings." "3 reports in the archive happened the same week as yours."* This is the warm-blanket statement; it's the "you're not alone" baseline.

The second is **named one-to-one match invitations** — *opt-in, both sides must consent before a name surfaces*. The mechanic: when two users hit a strong-match threshold, both receive a Hint card: *"Someone in your area logged a triangle sighting three months after yours. Would you like to ask the system to introduce you?"* Tap yes, and the other user receives the same offer with no identifying detail. If both opt in, a private channel opens between them. Neither user ever sees the other's name without explicit mutual consent.

**Connection modes** (after mutual opt-in): start with **a single shared thread per match** — a private message channel scoped to that pair, with a "compare our accounts side by side" affordance built in. Do *not* ship DMs at large; the channel is bound to the match. Group threads (multiple matched users in a region or a sub-pattern) are a Tier 3 feature, not MVP.

**Privacy and safety floor:** the user controls visibility per experience, not just per account. *"Allow other users to match my account anonymously"* (default on) and *"Allow introduction offers"* (default off) are two separate toggles, per-submission. The panel is unanimous that the second must be opt-in not opt-out. The reputational risk of an introduction offer reaching the wrong user on a vulnerable account is asymmetric.

**The moat argument:** every other paranormal database is a database. Paradocs becomes a *community formed around shared experience type*. That community is the network effect; the network effect is the subscription justification; the subscription justification is the business. The match surface is the load-bearing piece.

**Sub-decision for the founder:** how aggressive is the Hint cadence on matched pairs? Conservative (one match offer per week max, per user, even if more exist) or growth-paced (one per visit, capped at four per month). Panel leans conservative — these are emotional moments, not Tinder swipes.

---

## Note 5 — RADAR cluster scoping

**Strongest voices:** Consumer Product Strategist, AI Product Designer, Documentary Editorial.

The bug, examined in `RadarVisualization.tsx` and `LabConstellationTab.tsx`, is real: the RADAR renders match dots positioned by category-angle and proximity-distance, but **the user has no visible answer to "what am I looking at?"** The component supports a `filter` prop (`'all' | 'high' | 'nearby'`) and a category-color legend exists, but neither is wired into a prominent eyebrow or scope label on the Lab page.

**The fix, in three layers:**

**(1) Permanent scope eyebrow above the RADAR.** A single line, always rendered, that reads: *"Reports matching your 1998 Lumberton triangle — UFO-shape phenomena, all decades, North America."* The three clauses (your-anchor, phenomenon-scope, geographic-scope) are dynamically generated from the focused report + the current filter. When the user flips the filter via the existing toggle (`high` / `nearby` / `all`), the eyebrow changes to reflect: *"Strong matches only" / "Within ~500 miles" / "All matches."* This is one line of text and it fixes 80% of the confusion.

**(2) "What's not shown" tooltip.** Right-aligned in the eyebrow, a small (i) icon. Tapping it opens a short modal: *"This view shows your strongest matches in the UFO-shape family. Not shown: reports from other phenomena (ghosts, cryptids, etc.); reports outside your selected radius; reports the AI rated below the match threshold. Want a wider view? Try the filters above or visit the [full archive map →]."* The modal explicitly names the three exclusions so the user understands the curation.

**(3) "Widen the view" pill.** A subtle pill below RADAR: *"Showing 14 of 132 related reports. → Widen the view"* — tapping it relaxes the filter one step (high → all, or nearby → all). This is a one-tap escape hatch when the user senses they're seeing a subset and wants more.

**Additional small fix:** when zero matches exist (the empty-cluster case), today's RADAR shows just the YOU node and looks broken. Replace with explicit copy: *"No close matches yet in this view. The archive grew by 9,000 reports this week — none in your radius and phenomenon-type. Widen the filter or wait — we re-check weekly."*

**Where the panel pushes back on RADAR more broadly:** the RADAR is, as v1 said, a hero animation more than a workspace. The cluster-scoping fix makes it legible as a *focused lens*, not a totalizing view. We are *not* recommending RADAR become the geographic surface — that's what the new Geographic panel from Note 3 does. RADAR is one of three views of the same match data; the user should be able to flip between RADAR (abstract / categorical), Map (geographic / spatial), and List (chronological / readable).

---

## Revised execution plan deltas (vs. v1 Tier 1/2/3)

**Tier 1 changes:**
- v1 #1 (rename labels): *expanded* — now the full constellation→record rename across copy, component names, and a presentation-layer view alias for the DB. Add it.
- v1 #2 (`SinceLastVisitLine` promotion): unchanged, ship.
- v1 #3 (persistent experience pill): unchanged.
- v1 #4 ("Add another to your record" pill): *moved* — below the dossier, never above it (per Note 2 mass-market rule).
- v1 #5 (one prose paragraph): unchanged, but the paragraph now scales by experience count (1/5/50 variants per Note 2).
- **NEW Tier 1 #6:** RADAR scope eyebrow + "What's not shown" tooltip + "Widen the view" pill (per Note 5). This is a few hours of code and removes the largest single confusion point.

**Tier 2 changes:**
- v1 #1 (Hints queue): *split* into two — *anonymous-aggregate Hints* (no consent required, ship now) and *named-match Hints* (mutual opt-in, ship after the consent toggles land).
- v1 #2 (collapse tabs to lens toggle): unchanged.
- v1 #3 (archive timeline): renamed *Record timeline*, now scaled per Note 2 (one card / multi-card / collector / power tiers).
- v1 #4 (paywall surface): now anchored to the *second experience* gate, not the first reveal — per the new free-cap-of-3 recommendation in Note 2.
- v1 #5 (voice guide rewrite): unchanged.
- **NEW Tier 2 #6:** Temporal strip + Geographic panel + comparative panel (per Note 3). The richer pattern surface.
- **NEW Tier 2 #7:** Mutual-opt-in consent toggles, per-experience (per Note 4). Required scaffolding before named matches.

**Tier 3 changes:**
- v1 #1 (phenomenon claim mechanic): unchanged.
- v1 #2 (peer connections): *upgraded to the centerpiece* — this is the moat per Note 4. Build the match algorithm out of the existing signals, ship the named-match Hints, build the private channel per matched pair.
- v1 #3 (periodic re-analysis): unchanged.
- v1 #4 (shareable archive links): unchanged.
- v1 #5 (demographic onboarding): unchanged.
- **NEW Tier 3 #6:** Sentiment arc (per Note 3) — gated to ≥3 experiences and requires careful copy review before ship.

---

## Final naming recommendation — current → proposed

**Product surface:**
- "Lab" (nav label) → **"My Record"** (URL stays `/lab`)
- "Your Story" (tab) → **"My Record"** (becomes the page itself, not a tab)
- "Library" (tab) → **"My Archive"** (the user's saved + attached items)
- "Explore" (tab) → **"The Catalogue"** (the wider record; the verb-as-noun is gone)

**Inside the Signal surface:**
- "Your Signal" (header) → **"How yours connects"** *(or remove the header entirely; the bands speak for themselves)*
- "Your Signature" band → **"What makes yours yours"**
- "Near you" band → **"Where else this is happening"** *(already the kicker; promote it)*
- "Across the archive" band → **"In the wider record"**
- "Your Fingerprint" card kicker → **"What's distinctive about your account"**
- "Cluster" card kicker → **"Nearby and related"**
- "Did you know" / "Context" card → **"Worth knowing"**
- "Peer Questions" card → **"What others are asking"** *(already this; keep)*

**Data model (presentation layer, not migration):**
- DB tables stay as `constellation_artifacts`, `constellation_case_files`, etc. — renaming live tables with foreign keys and RLS policies is a multi-day risk.
- Create thin Postgres views: `record_attachments` (over `constellation_artifacts`), `record_collections` (over `constellation_case_files`), `record_connections` (over `constellation_connections`), `record_insights` (over `constellation_ai_insights`).
- New code reads/writes through the views; the underlying table names become a private implementation detail. When the dust settles in 90 days, do the table rename in a quiet migration window.

**Component / file renames (do these in v2 of the rename sprint, not v1):**
- `LabConstellationTab.tsx` → `MyRecordTab.tsx`
- `useLabData.ts` → unchanged (the hook is fine; nothing user-facing)
- `RadarVisualization.tsx` → unchanged (RADAR is a useful internal name and the user-facing label is the scope eyebrow, not the component)
- `ConstellationReveal.tsx` → `RecordReveal.tsx`
- `ExperienceOnboarding.tsx` → unchanged
- `constellation-data.ts` → `record-data.ts` *(can defer)*

**Copy hard-bans across the product** (the "do not ship without flagging" list for any future PR):
- "constellation"
- "fingerprint" (rename to "signature" or "signal" depending on context — both already in flight per v1)
- "radar" in user-facing copy (the component keeps the name internally; the user-facing label is "Reports near your [experience]")
- "data points" / "metrics" — documentary voice doesn't use ops vocabulary

---

## Open questions remaining

1. **Free-tier submission cap: 1 or 3?** Panel recommendation is 3; founder call. Driver: whether you want the user to *taste* the compounding-value moment before the paywall, or you want the paywall as the first multi-experience gate.

2. **Sentiment arc — ship or sit?** Strong AI signal, real risk of feeling diagnostic on traumatic experiences. Panel recommendation: ship behind a feature flag with a soft-launch to 10% of multi-experience users, monitor feedback for a month before broader rollout.

3. **Named-match cadence: weekly cap or per-visit cap?** Panel leans weekly. Founder call given how aggressive you want the engagement loop on the moat surface.

4. **DB table rename timing: now or post-90-day quiet window?** Recommendation: defer the actual `ALTER TABLE` until after the UI ships and the views have been in production for a sprint. The rename window is a Sunday morning.

5. **"My Record" vs. "My Archive" as the user-facing nav label.** v1 said Archive; v2 panel says Record. Both have defenders. The argument for Record: the user is building a single thing, their *record*. The argument for Archive: it's already what the wider catalogue conceptually is. Founder call. If we go Record, the wider catalogue becomes "The Archive"; if we go Archive, the wider catalogue becomes "The Catalogue." Either is defensible.

6. **Match-introduction privacy floor.** The panel recommends both sides must double opt-in before any identifying information surfaces. Does the founder want to add a third gate (e.g., minimum subscription duration before introductions can fire)? Argument for: filters out throwaway accounts. Argument against: blocks the genuine first-time match moment.

---

*— The Panel*
