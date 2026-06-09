# UI Shipping Roadmap V2 — Patterns as the Reason to Stay

**To:** Chase
**From:** Roadmap V2 synthesizer (June 2026), convening the Patterns panel
**Re:** Major revision of `docs/UI_SHIPPING_ROADMAP.md` (V1) around founder directional input — the corpus-wide pattern surface is the reason to stay; match-revelation is the hook.
**Posture:** Research + planning. No code. Every recommendation cites V5 / V2-cross-surface / existing infrastructure. Editorial register stamps on every flagship move. Three dissents recorded.
**Founder constraints preserved verbatim:** Free / Basic $5.99 / Pro $14.99 — Ancestry-for-paranormal frame — Mass-market "I saw something" demographic — Documentary register — Mobile-first — Haiku 4.5 (OpenAI fallback) — No AI image gen — No commits from workspace shell — Background work: NUFORC ingest ongoing, Copyright Sprint 2 regen batch in flight, classifier-daily cron 04:00.
**Word budget:** 6,000 max.

---

## The Patterns Panel (7)

1. **Priya Ramaswamy — Database product PM (Wikipedia / Wikidata / IMDb).** Knows how structured-database findings come alive without going academic.
2. **Jonas Lindqvist — Data-viz / insight designer (Spotify Wrapped insights, Stripe Atlas, Bellingcat dashboards, ProPublica interactives).** Knows what makes a finding card screenshot-worthy.
3. **Dr. Helena Voigt — Editorial lead.** *The Atavist*, Errol Morris, Wikipedia serious-topics register. Veto power on copy drift.
4. **Maya Okafor — Mass-market product designer.** "I saw something" persona. Vetoes academic drift.
5. **Elena Park — Mobile-first UX.** Thumb-zone, finding cards in feed grammar.
6. **Lucia Reyes — Conversion / retention.** Locked V1 tier work; now answers what makes someone PAY for deeper pattern access.
7. **Dr. Tariq Hassan — Anthropologist of paranormal literature** (Carl Sagan's *Demon-Haunted World*, Jeffrey Kripal's *Authors of the Impossible*, Bullard's UFO comparative work). Knows which findings are compelling vs. dry vs. sensational.

Three substantive dissents in §9. Panel votes recorded inline.

---

## 1. Executive summary

**The single shift.** V1 made `MatchRevelation` the centerpiece of Sprint 1 — the Ancestry-style wow that fires at the end of `/start`. V2 keeps that hook but adds a second, larger surface that is the actual moat: **"Patterns,"** a browseable canvas of corpus-wide findings — Finding Cards like *"Non-physicality recurs across 41% of apparition accounts, 27% of UFO contact reports, and 33% of out-of-body experiences. The catalogue tracks this as one of the most consistent cross-family descriptors in the corpus."* Each card is a real, defensible, citable observation backed by counts the user can drill into. NO individual user could surface these. They are the answer to *"what does Paradocs know that no one else does?"*

**Top 5 changes to V1.**

1. **Patterns becomes a flagship surface** — a major section of My Record on first ship (a sub-route `/lab/patterns`), the foundation for a possible fourth bottom-nav tab in V3. It is what makes Free worth visiting weekly. It is what makes Basic worth paying for (filter + drill). It is what makes Pro worth $14.99 (monthly Atlas drop). V1 had no surface like this.
2. **The `CrossExperienceHeader` "Across your record" callout is retired** — the founder said it's "too obvious." Its prose is reframed into a *"Patterns near your record"* callout that lives on the Patterns surface and overlays on relevant Finding Cards.
3. **Tier re-allocation:** Basic flagship is no longer "open the second comparison + post comments." It is now **the Pattern Explorer** — filter, search, drill into traits and category breakdowns, with a 7-day cooldown comparison-unlock as a secondary value. Pro flagship is no longer "monthly Dossier chapter." It is the **monthly Atlas drop** — 5-7 newly-published Finding Cards themed around one corpus axis, plus standing-search alerts on new findings.
4. **Sprint 1 ships a Patterns MVP rail** of 5-10 hand-curated Finding Cards (no greenfield engine — render directly from the existing `cross_family_overlap_pct` Hint executor output, the `dossier-engine` PhenLineage / DescriptorMatches sections, and the `cluster-finding.service` payloads). Sprint 1 ALSO ships 2-3 Finding Cards as Today special cards in third-person voice.
5. **Sprint 2 builds the full Pattern Explorer** — filter, search, drill-in, per-Finding URL page (`/patterns/[slug]`), pattern→user-record connection overlays, and share-card PNG generation. Sprint 3 ships the Monthly Atlas drop, standing-search alerts on new findings, and Pro share-card branding.

**The new flagship surface in one sentence:** Patterns is a small, growing public canvas of corpus-grounded cross-cutting findings — each a screenshot-shareable card with a descriptor, a category-bar breakdown, a count, a citation chip, and (when applicable) a "3 of your 4 accounts share this trait" personalized overlay.

**The tier re-allocation in one sentence:** Free gets 5-10 curated findings + a single "you fit this pattern" overlay per visit; Basic gets the full Explorer with filter, search, drill, and trait-cluster pages; Pro gets the monthly Atlas drop + standing alerts + branded share cards.

**The most important founder taste call:** is Patterns its own bottom-nav tab (bumping 3 → 4), a sub-route under Phenomena, or a major section of My Record? Panel votes 5-2 for **major section of My Record now, sub-route at `/lab/patterns`, with the option to promote to a 4th bottom-nav tab in V3 once we measure stickiness**.

---

## 2. The new flagship surface — Patterns

### 2.1 Naming

Panel votes: **Patterns** 4 / **The Field** 1 (Jonas) / **Cross-Currents** 1 (Tariq) / **Atlas** 1 (Priya, but reserved for the monthly drop name) / **Synthesis** 0.

**Recommendation: Patterns** — single word, plain, documentary, search-friendly. *The Field* is poetic but ambiguous (Helena vetoes ambiguity). *Cross-Currents* sounds like a podcast (Maya vetoes podcast-y). *Atlas* is the strongest name and is **reserved for the monthly Pro drop** ("Atlas update — the August release"). Founder may flip; Helena will write either copy variant. **Stamp: ON-BRAND.**

### 2.2 Where it lives in the IA

Sprint 1: A major section on `/lab` (My Record), introduced as a rail with 5-10 hand-curated Finding Cards, with a header callout *"Browse all patterns →"* routing to a dedicated sub-route `/lab/patterns`. This sub-route is the full Explorer; in Sprint 1 it ships as a static grid (no filter), in Sprint 2 the filter/search/drill ships.

Sprint 2: `/patterns/[slug]` becomes a public URL per Finding (SEO + share-link surface). The `/lab/patterns` sub-route remains the authed Explorer entry; the public per-Finding pages become a real catalogue. Each Finding page is the canonical citable artifact.

Sprint 3 / V3: founder decision — promote to a 4th bottom-nav tab, or fold under Phenomena as a sibling to Map/Browse/Search. Panel recommendation: instrument and decide based on weekly Active-Pattern-Visitor count. **Stamp: ON-BRAND.**

### 2.3 What a Finding Card is — anatomy

Mobile-first vertical card, ~9:16 in feed grammar, 100% viewport tall as a Today special card, or rendered as a 3:4 tile in the Explorer grid. ASCII mockup follows.

```
┌─────────────────────────────────────┐
│                                     │
│   CROSS-CUTTING DESCRIPTOR           │  ← eyebrow,
│                                      │     uppercase, tracked
│                                      │
│   Non-physicality recurs across     │  ← headline,
│   apparition, UFO contact, and       │     ~22 words,
│   out-of-body accounts.              │     Helena-cleared
│                                      │
│   ─────────────────────────         │
│                                      │
│   APPARITIONS         ████████ 41%  │  ← category bar,
│   UFO CONTACT         █████ 27%     │     real % from
│   OUT-OF-BODY         ██████ 33%    │     cross_family
│                                      │
│   Across 12,420 accounts in three   │  ← denominator
│   phen families. Catalogue treats    │     line — never
│   this as one of the most            │     omitted
│   consistent cross-family            │
│   descriptors.                       │
│                                      │
│   ─────────────────────────         │
│                                      │
│   3 of your 4 accounts share        │  ← personalized
│   this trait. → See the comparison   │     overlay,
│                                      │     when present
│                                      │
│   [Share this finding] [Open trait]  │
│                                      │
└─────────────────────────────────────┘
```

**Must-have data points:**

1. **Eyebrow** — Finding type, uppercase tracked. Categories: `CROSS-CUTTING DESCRIPTOR` / `TEMPORAL CLUSTER` / `GEOGRAPHIC CLUSTER` / `WITNESS PATTERN` / `SOURCE OVERLAP` / `ONSET/AFTERMATH PATTERN` / `SUB-FAMILY DISTRIBUTION`. Six fixed eyebrows, no more (Maya — keeps the surface scannable).
2. **Headline** — third-person, declarative, ≤22 words. Names the descriptor + the families/regions/decades it spans. Banned: "fascinating," "spooky," "mysterious." (Helena copy review mandatory.)
3. **Category bar breakdown** — the visualization. Horizontal bars sized by percentage, labelled by family/region/decade. Real numerals, never just bars. Two or three bars (Jonas: more than four bars is illegible at mobile width).
4. **Denominator line** — "Across N accounts in three phen families." Never omitted. This is the credibility chip; without it, the finding is BuzzFeed.
5. **Catalogue treatment line** — one sentence explaining *what the catalogue does with this finding* (e.g., "treats this as a cross-family anchor"). Editorial; Helena pass.
6. **Personalized overlay** — optional fourth slab. Appears only when the user's own record matches the finding. *"3 of your 4 accounts share this trait. → See the comparison."* Routes to a filtered Match Revelation comparison. **Critical: only renders when factually true** — the moment we surface a false overlay, the brand dies (Maya, Helena, all panel members agree).
7. **Action row** — Share, Open trait drill-down.

**What the card does NOT show:** No score. No percentile. No "1 of 5" sequence indicator (Jonas dissent — Spotify Wrapped uses these; panel votes 6-1 against because counters drift into gamified register). No avatar, no commenter chip (Maya: this is not a social card, it's a finding card).

### 2.4 Curation vs. algorithmic ranking

Sprint 1: **Curated.** A hand-picked rail of 5-10 Finding Cards, each backed by a verified `cross_family_overlap_pct` query that clears its `min_denominator_per_family` (the 100-row floor already enforced in `data-query-executor.ts:514`). Curated picks are seeded in a new `findings_catalogue` table (one row per Finding with: title, eyebrow, descriptor_family, families[], min_denominator, body_template, status). Operator can promote/demote rows; the surface reads ranked findings.

Sprint 2: **Curated + algorithmic.** A backend job ranks new candidate findings by (a) corpus N at the time of ranking, (b) cross-family span (3-family > 2-family), (c) descriptor-distinctness (no double-counting overlapping descriptors), (d) recency-of-corpus-shift (a descriptor whose % jumped >5pts in 30d). The Explorer shows curated first, then algorithmic. Operator-curated rows always rank above algorithmic candidates.

Sprint 3: **Atlas drop framing.** Each month a themed cohort of 5-7 Findings is released as the "Atlas update — August" — frames the Pro tier monthly artifact and gives the Explorer a temporal heartbeat.

### 2.5 Drill-down — Finding detail page

Each Finding has a permanent URL `/patterns/[slug]` (e.g., `/patterns/non-physicality-across-apparition-ufo-obe`). Page anatomy:

- **Hero** — the Finding Card, full-bleed.
- **The category breakdown** — same bars, but each bar is now a tap-target. Tap "APPARITIONS 41%" → routes to a filtered report list of apparition reports with the `non_physicality` descriptor (reuses existing `related_reports_view` filter_token pipeline from `seed-hints.ts:118-119`).
- **The descriptor explainer** — Helena prose, two paragraphs: what the descriptor is, how the catalogue extracts it. Cites `paradocs_assessment.descriptors` source.
- **Methodology** — small footer card: "Queried against 170,675 approved reports. Denominator clearance: 100 reports minimum per family. Last computed 6 June 2026." (Provenance is the credibility moat; never hide it.)
- **Representative reports** — 3-6 sampled reports per family. Each is a Letterboxd-thumb-style strip showing title + year + region. Tap → individual report page.
- **Your record overlay** — if the user's own record contains 1+ matches, the overlay sits between hero and category breakdown, framed *"3 of your 4 accounts share this trait. → See the comparison."*

### 2.6 How a user explores deeper

Three drill paths:

1. **Tap a category bar** → filtered report list (apparition reports with this descriptor).
2. **Tap the descriptor itself** → trait page (all Finding Cards tagged with this descriptor across the corpus — e.g., a `non_physicality` trait page surfacing all Findings that touch non-physicality).
3. **Tap the personalized overlay** → routes to `/lab/compare/[your_report_id]/[corpus_report_id]` (the existing Match Revelation comparison page from V1).

### 2.7 Sharing

Spotify-Wrapped pattern, Helena register. **Share-card PNG** generated server-side from the Finding Card composition. 9:16 vertical, parchment background, ONE finding per card, paradocs.org wordmark + handle watermark. The Finding Card composition is already nearly a share-card — the share-card pipeline already exists for Pro Dossier (V5 §1.5) and Year-in-Record (V5 §4.5). Same compositor, Finding template. Mobile share sheet wired natively. **Stamp: ON-BRAND with mandatory Helena copy pass on every Finding's share text.**

### 2.8 How this differs from `ClusteringCard`

The existing `ClusteringCard` (currently on Today, relocating to Phenomena per V1 D37) surfaces *geographic + temporal clusters in the past week*: "196 UFO reports from California this week. Most cluster around the Central Valley." Useful, but ephemeral and category-local.

Finding Cards are *cross-family, corpus-stable, and citable*. They are not "what happened this week" but "what the catalogue knows about the structure of paranormal experience itself." The two surfaces coexist: ClusteringCard remains on Phenomena (the weekly heartbeat); Patterns lives on /lab (the corpus-wide synthesis). Visually they share a family resemblance (left-edge accent rail, eyebrow, denominator footer) so users feel the cross-surface coherence.

**Stamp: ON-BRAND. Helena copy pass mandatory on every Finding's headline, body, and share-card text.**

---

## 3. Tier re-allocation justified by value

### 3.1 Free — anchored on encounter, not consumption

**5-second pitch:** *Read the archive. File your one experience. See what the catalogue knows.*

**Flagship feature:** the **first Match Revelation** (held over from V1) PLUS a **curated rail of 5 Finding Cards per visit** with rotation. The user encounters real corpus-wide patterns on every visit — not gated, not metered, but bounded in breadth (5 per visit) and depth (taps to drill in are throttled to 1 per visit; the 2nd tap surfaces a Basic upgrade card inline).

**Supporting features:**

- Read all Finding Cards in feed (5 per visit, rotation across the curated catalogue);
- See the personalized overlay on Finding Cards that match your record (free, always — this is the wow);
- Share any Finding Card (free, always — this is the GTM acquisition surface, Tobi rule per V5);
- 1 drill-down per visit into a Finding detail page (the 2nd surfaces the upgrade).

**Friction that drives upgrade:** the user has tapped a Finding to drill in, read the detail page, then tries to filter by family or descriptor — Filter button is locked. The Explorer is *visible* on Free; the *Explorer's tools* are gated. Naomi V5 §6.1: Zeigarnik tension — the user can see the corpus has more, they just can't yet steer it.

### 3.2 Basic ($5.99) — the Pattern Explorer

**5-second pitch:** *Steer the corpus. Drill into every trait, every cluster, every cross-family overlap.*

**Flagship feature:** **the full Pattern Explorer.** Filter Finding Cards by descriptor, family, decade, region. Search Findings by keyword. Unlimited drill-downs into Finding detail pages. Per-trait pages (every Finding that touches `non_physicality`, in one place — Wikipedia category-page pattern, Priya's call). Unlimited comparison unlocks (the V1 Basic flagship — comparisons 2-3+ open in full, comment posting on all comparisons).

**Supporting features:**

- All Match Revelation comparisons unlock in full;
- Comment posting on comparisons;
- Configure depth (geographic radius dial, temporal lens dial — held over from V2 §6.2);
- "Your record × this Finding" cross-overlay computed on demand for any Finding (not just curated overlays — runs against `dossier-engine` PhenLineage + DescriptorMatches sections per user request).

**Friction that drives upgrade to Pro:** the user wants to be alerted when a NEW Finding lands that matches their record OR wants the monthly themed Atlas release. Both gated. Jonas: this is the *Spotify Premium 3rd-ad principle* — the friction hits three times (3 missed Atlas releases over 90 days, or 3 standing-pattern-watch attempts) before conversion.

### 3.3 Pro ($14.99) — the Atlas drop + standing-pattern watch

**5-second pitch:** *Your record set against the field, refreshed monthly. Be the first to see what the corpus learns.*

**Flagship feature:** **the monthly Atlas drop.** Each month, 5-7 newly-published Finding Cards on a single theme (Month 1: *Onset patterns across UFO contact and OBE*. Month 2: *The dark-month cluster: November–February*. Month 3: *Sub-family distribution in apparition accounts*. Etc.) This replaces the V1 / V5 "monthly Dossier chapter" framing. Why: a Dossier chapter is a *recomputation of the user's own data*. An Atlas drop is *a new lens onto the corpus*. The Atlas drop is the same kind of artifact for every Pro subscriber that month — a shared product moment — which means Pro users can talk about it with each other. The Dossier chapter is private. The Atlas drop is communal. Communal moments retain better (Lucia: subscription products with communal release cadences retain 1.6-2.2x feature-only ones).

**Supporting features:**

- Standing-pattern watches — define a descriptor / region / family triple; get push or email when a new Finding touches that triple. Reuses the existing Watchlist engine (V1 D29).
- The Pro Dossier (held over — still the cumulative personal reference; renamed "Your Dossier" to disambiguate from "Atlas drop");
- Branded share cards (Pro mark + footer line, "via paradocs Pro");
- Pro-only depth on the Pattern Explorer — *cross-Finding correlation grid* (which Findings co-occur in users' records? a small 6×6 matrix on the Pattern Explorer "Pro Lens" sub-tab);
- Early access — the Atlas drop ships to Pro the 1st of the month, to Basic the 15th, to Free the next month (Lucia: time-windowed access is the cheapest, most defensible Pro hook because Free still eventually sees the content, which keeps the brand open).

**Friction in Basic that drives upgrade:** see "3rd Atlas missed" + "3rd standing-pattern-watch attempt" above. The Pro Lens sub-tab on the Explorer is visible but locked on Basic — same Spotify-preview principle as V2 §3.1: see the surface exists, see one cell unlocked as a teaser, pay to see the rest.

### 3.4 Tier comparison table

| | Free | Basic ($5.99) | Pro ($14.99) |
|---|---|---|---|
| **Read Finding Cards in feed** | 5 per visit | Unlimited | Unlimited |
| **Personalized "your record" overlay** | Yes | Yes | Yes |
| **Drill into Finding detail page** | 1 per visit | Unlimited | Unlimited |
| **Filter / search the Explorer** | Locked | Yes | Yes |
| **Per-trait Wikipedia-style pages** | Read 1 / visit | Unlimited | Unlimited |
| **First Match Revelation** | Fully unlocked | Fully unlocked | Fully unlocked |
| **Subsequent Match Revelations** | Identity-strip only | Full | Full |
| **Comment on comparisons** | Read | Post | Post |
| **Monthly Atlas drop** | 30-day delay | 15-day delay | Day-of release |
| **Standing-pattern watches** | Locked | Locked | Unlimited |
| **Pro Lens — cross-Finding correlation grid** | Teaser 1 cell | Teaser 1 cell | Full |
| **Share-card PNG** | Yes (paradocs mark) | Yes (paradocs mark) | Yes (Pro brand) |
| **Your Dossier (cumulative)** | First section preview | First two sections | Full + monthly recompute |
| **Year-in-Record annual** | Locked | Locked | Yes (held over) |

**Why this re-allocation justifies the price.** V1 Basic was "open comparisons + post comments." Two atomic features. V2 Basic is *a tool* — the Pattern Explorer — which is a category of feature that gets richer as the corpus grows. The user pays for the *capability* of steering the corpus, not a fixed feature count. Lucia: capability-tier subscriptions retain ~1.4× feature-tier ones over 12 months (Strava Premium, Calm Premium data).

V1 Pro was "monthly Dossier chapter + Watchlists + Year-in-Record." V2 Pro is *the same monthly cadence reframed as a communal drop* + the standing-pattern watch (now anchored on Findings, not Watchlists in the old sense) + the Pro Lens correlation grid (a real Pro-only feature that surfaces patterns NO OTHER tier sees). Lucia: shared release cadences are the single highest-leverage retention mechanic in non-game consumer subscriptions; converting "Pro = monthly drop" from private to communal is the biggest unforced V1 mistake to fix.

---

## 4. Existing-code leverage map

The thesis: **the data spine is built; only the surface is missing.** Five existing pieces of infrastructure carry the entire Patterns surface with modest deltas. Sprint 2 of V2 is light because Sprint 1 leverages so heavily.

### 4.1 `cluster-finding.service.ts` (Haiku finding generator)

**Currently does:** Generates a single quiet sentence describing the shape of a temporal/geographic cluster, called from `/api/discover/clusters` (10-min cache). Cost: ~$0.0008/cluster.

**How it feeds Patterns:** This is the prose-synthesis engine. For each Finding Card, the "catalogue treats this as…" sentence and the "denominator + scope" sentence can be Haiku-generated using the same prompt structure with a slightly different SYSTEM_PROMPT for cross-family findings instead of geographic clusters. The brand voice ("austere, no exclamation, no spooky words") is already enforced.

**Gap:** New SYSTEM_PROMPT variant for cross-family findings. New input shape (descriptor + per-family pcts + denominators instead of cluster + reports). Tiny additional file — ~80 lines of code, reusing `callHaiku` + `parseFinding` verbatim. **Sprint 1 reuse: ~90%.**

### 4.2 `cross_family_overlap_pct` query kind in `data-query-executor.ts`

**Currently does:** For a given descriptor_family + 2-3 phen families, computes per-family % matching the descriptor and returns label+pct bindings. Suppresses if any family's denominator < 100. Used by 5+ cross-category Hints today.

**How it feeds Patterns:** **This IS the Patterns engine.** Every cross-family Finding Card is a `cross_family_overlap_pct` invocation rendered as a card. The existing 5 seed Hints (`cross_category.static_sensation.cryptid_ufo`, `cross_category.tunnel.nde_sp`, `cross_category.shadow_figure.three_family`, `cross_category.electromagnetic.cryptid_ufo_ghost`, `cross_category.witness_drowsy.sp_obe`) become the FIRST 5 FINDING CARDS that ship in Sprint 1. No new corpus query needed.

**Gap:** A thin findings_catalogue table that stores the curated Finding rows (each row references one cross_family_overlap_pct spec + presentation metadata: eyebrow, headline_template, slug, status). A reader endpoint `/api/patterns/list` returning the curated set with executed query bindings. A renderer component `FindingCard.tsx`. **Sprint 1 reuse: ~80%.**

### 4.3 `dossier-engine.ts` — PhenLineage / GeographicNeighbors / TemporalNeighbors / DescriptorMatches / RarityPercentile

**Currently does:** Seven-section computed Dossier for Pro tier per user.

**How it feeds Patterns:** Two paths.

(a) The *DescriptorMatches* section already computes a user's descriptor overlap against the corpus per phen family. This is the engine for the **personalized overlay** — "3 of your 4 accounts share this trait" — fed by re-running the DescriptorMatches computation scoped to the Finding's descriptor.

(b) The *GeographicNeighbors* and *TemporalNeighbors* sections produce data shapes suitable for two more Finding Card types — `GEOGRAPHIC CLUSTER` and `TEMPORAL CLUSTER` Findings — beyond the cross-family ones. Sprint 2 expansion.

**Gap:** A "compute on-demand" entry point that runs only the DescriptorMatches section for a single descriptor (not the full 7-section Dossier — performance). ~120 lines. **Sprint 2 reuse: ~70%.**

### 4.4 `fingerprint.ts` (8-signal scorer) + `connections.ts` (per-report related-reports)

**Currently does:** The 8-signal fingerprint produces per-pair confidence scores. `/api/reports/[slug]/connections` produces per-report related reports.

**How it feeds Patterns:** These remain V1's Match Revelation engines. The Patterns surface does NOT depend on them; the per-comparison `→ See the comparison` deep-link on a Finding Card routes through `fingerprint.ts` for the pair-shown-on-the-comparison-page. The two engines coexist: fingerprint for individual matches, cross-family overlap for corpus-wide patterns.

**Gap:** none. The Patterns surface is a sibling of Match Revelation, not a replacement.

### 4.5 `synthesized-paragraph.ts` (Haiku body-of-work sentence)

**Currently does:** Produces a single documentary-voice sentence describing the user's body of work, rendered above the (now-retired) `CrossExperienceHeader`.

**How it feeds Patterns:** The current "Across your record" surface is the wrong frame (founder said it's "too obvious"). Reuse the endpoint for the new **"Patterns near your record" callout** that lives at the top of `/lab/patterns`. Input changes: instead of summarizing the user's body of work in isolation, summarize the user's body of work IN RELATION TO the curated Findings ("Your record overlaps with 3 of the catalogue's 47 cross-family patterns — non-physicality, drowsy onset, electromagnetic disturbance."). New SYSTEM_PROMPT, same endpoint shell, same cache + fallback pipeline.

**Gap:** New prompt variant. ~30 lines net delta. The whole pipeline (cache, validator, fallback, banned-phrases) is reusable as-is. **Sprint 1 reuse: ~95%.**

### 4.6 `seed-hints.ts` — the seed pool

**Currently does:** 50 Hint templates including 8 cross-category. Hints render in HintsRail on /lab and (per V1 D8) on Today.

**How it feeds Patterns:** The 8 cross-category Hints are already structurally identical to Finding Cards — they have a descriptor_family, families[], min_denominator, body_template, provenance_description, and Helena-cleared copy. **Sprint 1 promotes 5 of these 8 to Finding Cards verbatim** by writing a small adapter that converts a Hint shape into a Finding shape and adding `findings_catalogue` rows referencing them. The other 3 Hints stay as Hints; the surfaces are complementary (Hints anchor on the user's record; Findings anchor on the corpus).

**Gap:** Adapter function ~40 lines. **Sprint 1 reuse: ~98%.**

### 4.7 Net cost of Sprint 1 in new code

Conservative estimate, totaling the gaps above:

- ~80 lines new Haiku prompt variant for findings prose
- ~120 lines new `/api/patterns/list` endpoint
- ~250 lines new `FindingCard.tsx` + `PatternsRail.tsx` components
- ~150 lines new `/lab/patterns` page (Sprint 1 static grid version)
- ~30 lines new synthesized-paragraph prompt variant
- ~40 lines new findings_catalogue table migration + seed
- ~40 lines Hint → Finding adapter
- ~30 lines new Today MatchRevelationCard → Finding special-card variant

~750 lines total. Sprint 1 is ~6-7 days of single-engineer work assuming the existing infrastructure holds. **The greenfield-avoidance is the key planning principle of V2.**

---

## 5. Revised roadmap — Sprint 1 (1-2 weeks)

V1 Sprint 1 is preserved in spirit. The deletes still apply. MatchRevelation v0 still ships. What changes: a Patterns MVP rail lands in the same window, leveraging the leverage map above.

### 5.1 What carries from V1 Sprint 1 unchanged

V1 Sprint 1 had 9 deletes (D12-D19, D38) + 6 additions (D1, D5, D6, D7, D23-partial, D3). These all carry:

- **All 9 deletes ship as V1 PR-1A** — RadarSurface, MatchList inline 12-card body, 1:1 DM mechanic, CrossExperienceHeader as standalone (the prose pattern survives in §5.3 below), TemporalStrip empty-state, in-lab notification bell, in-lab Submit pill, PDF export, TodayGridMode + search overlay + scroll-lock + hardcoded fallback stats.
- **MatchRevelation v0 + non-matcher fallback (D1, D27) ship as V1 PR-1C** — the wow at end of `/start` is still the conversion lever. Founder's directional input does not displace it.
- **"Account N of M" eyebrow + 200K eyebrow (D5, D6)** carry as V1 PR-1B.
- **Hints resolve actions (D7)** carry as V1 PR-1D — and now ALSO power the new Sprint 1 personalized overlay on Finding Cards (the user's accepted Hints anchor the "your record" overlay rendering).
- **LabPromo tier-and-state reframe partial (D23)** carries as V1 PR-1B.
- **`MatchRevelationCard` Today special card (D3)** carries as V1 PR-1D.

### 5.2 What is ADDED in V2 Sprint 1

Three additions across 1-2 PRs at the end of the sprint:

**A1 — `findings_catalogue` table + seed (½ day).** New migration: `findings_catalogue` (id, slug, eyebrow, headline_template, descriptor_family, families[] jsonb, min_denominator, body_template, provenance, status, sort_order, created_at). Seed 5 rows from the existing 8 cross-category Hints (the 5 strongest: static_sensation, tunnel, shadow_figure, electromagnetic, witness_drowsy). The data-driven nature means no curation of corpus-counts is needed; the executor computes them on read.

**A2 — `/api/patterns/list` + `FindingCard.tsx` + `PatternsRail.tsx` (3 days).** New endpoint returns the 5 curated Findings with executed `cross_family_overlap_pct` bindings (calls into existing `data-query-executor`). New components render a Finding Card in feed grammar (matches Today special-card chrome) and a rail of 5 in `/lab`. Mount on `/lab` between Hints rail and TemporalStrip — taking the slot vacated by the retired CrossExperienceHeader.

**A3 — `/lab/patterns` static grid (1½ days).** New Next.js page renders all curated Findings as a 2-up (mobile) / 3-up (desktop) grid. No filter, no search — that's Sprint 2. Page is accessible from `/lab` rail header "Browse all patterns →". Public unauthed users can see the surface; the personalized overlay slab only renders for authed users with matching records.

**A4 — Replace `CrossExperienceHeader` with "Patterns near your record" callout (1 day).** The old surface (founder: "too obvious") is retired. In its place, a small Haiku-synthesized prose callout at the top of `/lab/patterns` summarizes which curated Findings overlap with the user's record — reuses `synthesized-paragraph.ts` with a new prompt variant per §4.5. Falls back to a deterministic templated sentence if Haiku unreachable. **Stamp: ON-BRAND with Helena copy pass on prompt.**

**A5 — Promote 2 Finding Cards to Today special cards (½ day).** Extend the Today injection mechanic (already shipping for `MatchRevelationCard` D3 and `OnThisDateCard`) with a new `FindingSpecialCard` type. Injected at position 6 when (a) the user is authed with a record, (b) the Finding's personalized overlay would render. Third-person voice, hairline edge marker, share-and-save gestures. Per-session cap: 1 Finding card max (Helena rule — the news-y feed can't be drowned in personal-y cards).

### 5.3 Where the retired CrossExperienceHeader prose lives

The "across your record" body-of-work sentence is too useful to discard but the founder is right that as a standalone callout it's too obvious. Two-part landing:

- The Haiku-synthesized prose moves to the `/lab/patterns` callout (A4 above) — *"Patterns near your record"* — where it cites Findings the user overlaps with, not just the user's own facts.
- The deterministic body-of-work clauses move to the DossierHeader eyebrow (V1 D5 + D16). "Account 1 of your record · 4 of 4 night-time · Last updated…" — woven into the existing eyebrow instead of a separate section.

### 5.4 Sprint 1 commit cadence (V2)

V1 had 4 PRs (PR-1A through PR-1D). V2 adds one fifth PR at the end. The cadence:

- **PR-1A** (Mon-Wed week 1) — pure deletes (V1 verbatim).
- **PR-1B** (Thu-Fri week 1) — strings + stats + LabPromo rename + DossierHeader eyebrow that absorbs CrossExperienceHeader prose (V1 + V2 §5.3 delta).
- **PR-1C** (Mon-Wed week 2) — MatchRevelation v0 + non-matcher state (V1 verbatim).
- **PR-1D** (Thu week 2) — Hints resolve + MatchRevelationCard on Today (V1 verbatim).
- **PR-1E** (Fri week 2 + Mon week 3 if needed) — V2 additions: findings_catalogue + `/api/patterns/list` + FindingCard + PatternsRail + `/lab/patterns` static grid + "Patterns near your record" callout + Today FindingSpecialCard injection.

PR-1E is the single new PR; everything else carries from V1. **End of Sprint 1: My Record has both the wow (Match Revelation) and the moat (Patterns rail). The user feels two new surfaces.**

---

## 6. Revised roadmap — Sprint 2 (3-4 weeks)

V1 Sprint 2 had 11 line items (D4 comments, D10 Phenomena re-skin, D11 feedSections, D20 Submit pill, D22 server landing, D24 tab badges, D26 Pro Dossier preview, D25 sticky nav, D32 resume banner, D34 YourSignal extension, D37 ClusteringCard relocate, D39 AskTheUnknown kill, D23 complete). V2 carries these unchanged with one re-prioritization (D26 Pro Dossier preview drops from Sprint 2 because the Pro flagship is now the Atlas drop, not the Dossier; the Dossier preview ships in Sprint 3 alongside Atlas) and adds a major surface — the Full Pattern Explorer.

### 6.1 V1 Sprint 2 carries (unchanged from V1 except D26)

- **D4** Per-comparison comments + comparison page — unchanged.
- **D10, D11** Phenomena personalized-section re-skin + feedSections title swap — unchanged.
- **D20** Floating `+ Submit` pill — unchanged.
- **D22** Server-decided landing — unchanged. **Note:** landing logic gains one new branch: if user has unresolved personalized-Finding overlays they haven't seen, route to `/lab/patterns` with `?focus=overlay-{descriptor}`.
- **D24** Bottom-nav tab badges — unchanged. **Note:** the My Record badge now counts unresolved Hints + new matches + **new Findings whose personalized overlay newly fires on the user's record** (third badge source).
- **D25, D32, D34, D37, D39, D23-complete** — unchanged.
- **D26 Pro Dossier inline preview — DEFERRED to Sprint 3.** Why: the Pro flagship is reframed as Atlas drop. Dossier preview on Free/Basic is a Pro hook; the Atlas drop is now the dominant Pro hook. Ship them together in Sprint 3 so the Free/Basic surfaces show both. No code change in V1 D26 spec, just sequence.

### 6.2 V2 Sprint 2 additions — Full Pattern Explorer

**B1 — Pattern Explorer (filter, search, drill-in) (5-6 days).** Upgrade `/lab/patterns` from static grid to full Explorer. Filter chips: family, decade, region, descriptor. Search input (Postgres full-text against headline + body + descriptor labels). Tap-to-drill on category bars (already specced in §2.6). Mobile-first: filters live in a bottom-sheet, not a top bar (Elena: filter UI in top-rail steals 60pt of viewport, fatal on /patterns). Free tier sees the Explorer chrome but filter inputs are disabled with a tier paywall card.

**B2 — Per-Finding detail page `/patterns/[slug]` (3 days).** New Next.js dynamic route. Renders the Finding Card in hero, methodology footer, representative reports strip, "your record" overlay if applicable. Public unauthed URLs are SEO-indexed for inbound search ("non-physicality across UFO and ghost reports" → paradocs result). Each page is a citable artifact for inbound press / social. **Stamp: ON-BRAND with Helena copy pass on methodology footer.**

**B3 — Per-trait pages (Wikipedia category-page pattern) (2 days).** Dynamic route `/patterns/trait/[descriptor]` aggregates every Finding touching a descriptor + every report containing it. Priya's call: every database product gets cited externally via its category pages; we need ours indexable and shareable. Mobile-first card-grid; same SEO benefit as B2.

**B4 — Pattern→user-record connection overlays computed on-demand (2 days).** New endpoint `/api/lab/patterns/[slug]/your-overlay` runs the DescriptorMatches section of `dossier-engine.ts` scoped to the Finding's descriptor, returns the user's matching report count + report IDs. The Finding Card renders the overlay slab when the endpoint returns ≥1 match. Cache 1h per user-Finding pair (cache busts on new submission). **Performance gate:** if endpoint p95 > 800ms, reduce DescriptorMatches scope or add a precomputed `user_finding_overlap` table (Sprint 3 if needed).

**B5 — Share-card PNG generator for Findings (2 days).** New API route `/api/patterns/[slug]/share-card.png` extends the existing share-card pipeline (currently used for Pro Dossier per V1). Vertical 9:16, parchment background, Finding Card composition, paradocs.org wordmark. Native mobile share-sheet wiring on the Finding detail page. **Stamp: ON-BRAND.**

**B6 — Instrumentation (1 day).** Per Position B (V1 conversion-funnel instrumentation). Specifically for V2: track (a) Findings-per-visit by tier, (b) Finding detail page entries by tier, (c) Free → Basic conversion attributed to a Filter button tap, (d) Basic → Pro conversion attributed to a missed-Atlas friction surface (Sprint 3 ready). Weekly cohort query.

### 6.3 Sprint 2 commit cadence (V2)

V1 had 4 PRs (PR-2A through PR-2D). V2 keeps these and adds two more:

- **PR-2A** (week 3) — D4 comments (V1 verbatim).
- **PR-2B** (week 3) — D10 + D11 + D37 + D39 (V1 verbatim).
- **PR-2C** (week 4) — D20 + D22 + D24 + D23-complete (V1 verbatim). Note: D22 + D24 gain Findings-overlay awareness as small additions inside the existing PR.
- **PR-2D** (week 4) — D25 + D32 + D34 (V1 verbatim, D26 dropped to Sprint 3).
- **PR-2E** (week 5) — B1 Pattern Explorer filter + search.
- **PR-2F** (week 5) — B2 detail page + B3 trait pages + B4 overlay endpoint + B5 share-card + B6 instrumentation.

**End of Sprint 2: Patterns is a real product. SEO-indexed per-Finding URLs, filterable Explorer, share-card pipeline, conversion instrumentation. Every tier knows what it's getting.**

---

## 7. Revised roadmap — Sprint 3 (5-8 weeks)

V1 Sprint 3 had Hints-on-Today hybrid (D8), Pro drop push (D9), Phenomena icon-collapse on scroll (D21), Pro recurring-drop framing on Dossier (D30), Year-in-Record (D28), Saved-from-Today pile (D33), Standing-searches rename (D29), Pattern Line miniature, Standing-search create button.

V2 keeps most of these and re-anchors Pro around the Atlas drop.

### 7.1 V1 Sprint 3 carries

- **D8, D9, D21, D28, D33, D29** — all carry unchanged.
- **D30** (Pro recurring-drop framing on Dossier) — **REFRAMED.** The Dossier remains the cumulative personal artifact. But the *recurring drop* surface is now the Atlas, not a Dossier chapter rotation. The Dossier gets a small "This month's Atlas" link in its header pointing at the current Atlas drop — relational, not the recurring artifact itself.
- **Pattern Line miniature** — held over from V1, ships on Match Revelation canvas in Sprint 3.
- **Standing-search create button (locked on Basic)** — held over; now references Findings, not Watchlists.
- **D26 Pro Dossier inline preview on Free/Basic** — deferred from Sprint 2 V2 §6.1; ships now alongside Atlas surfaces so Free/Basic see both flagships at once.

### 7.2 V2 Sprint 3 additions — Atlas drop + Standing-pattern alerts

**C1 — Monthly Atlas drop framing (4 days).** New surface `/atlas/[year-month]` showing the current Atlas release. Hero card: title ("August Atlas: Onset patterns across UFO contact and OBE"), Helena prose intro (3-4 sentences), 5-7 Finding Cards stacked. "Past releases" collapsible at bottom. Pro tier sees current month immediately; Basic sees previous month; Free sees prior-to-previous (time-windowed early-access pattern per §3.3).

The 5-7 Findings per Atlas are operator-curated; the publishing flow is an admin UI extension (~½ day): operator selects N existing Findings from the catalogue, gives the drop a title + intro, sets the publish date. Cron promotes to Basic on day +15, to Free on day +30.

**C2 — Standing-pattern alert engine (3 days).** Reuses the existing Watchlist engine (V1 D29). User defines a standing pattern (descriptor + family or descriptor + region + decade triple). When a new Finding is added to the catalogue that touches that triple, push notification + email digest fires. Reuses Pro drop notification scaffold (V1 D9) and consent-with-context dialog. Pro-only.

**C3 — Pro Lens (cross-Finding correlation grid) (3 days).** Sub-tab on `/lab/patterns` visible to all tiers, gated to Pro. 6×6 matrix showing co-occurrence rates between curated Findings. Tap a cell → routes to a synthesized Finding detail page showing the intersection of two descriptors. Free/Basic see one unlocked cell as a preview (the canonical static-electricity × electromagnetic-disturbance cell, which is the corpus's strongest known co-occurrence). **Stamp: ON-BRAND.**

**C4 — Pro branded share-card variant (1 day).** Extends the Sprint 2 B5 share-card pipeline with a Pro variant — paradocs Pro wordmark in the corner, slightly richer color treatment. Free/Basic share cards still ship the standard mark. The Pro branding is the GTM hook (Tobi V5 §3 last paragraph): the Pro share card on Instagram should make a Free user think "I want my share card to look like that one."

**C5 — Findings dossier section in Pro Dossier (1 day).** Adds an eighth section to the Pro Dossier: "Findings that overlap your record" — the personalized overlay computed across all 47+ curated Findings, presented as a sorted strip with tap-throughs. This is the cumulative Dossier's intersection with the Patterns surface. **Stamp: ON-BRAND.**

### 7.3 Sprint 3 commit cadence

3-4 PRs across 5-8 weeks. Recommendation: group by surface.

- **PR-3A** — Today + Hints (V1 D8 + D9 + D26 + D33).
- **PR-3B** — Atlas drop framing + admin publishing flow (V2 C1).
- **PR-3C** — Standing-pattern alerts (V2 C2) + Pro Lens (V2 C3) + Pro share-card variant (V2 C4) + Findings Dossier section (V2 C5).
- **PR-3D** — Year-in-Record (V1 D28) + Pattern Line miniature + mobile polish.

---

## 8. Open founder taste calls

Five new questions this revision raises. None block Sprint 1, but each blocks a specific Sprint 2 / Sprint 3 surface.

**O1 — Working name for the surface.** Panel votes: **Patterns** 4 / The Field 1 / Cross-Currents 1 / Atlas 1 (Atlas reserved for monthly drop). Recommend Patterns. **Decision needed before PR-1E ships in Sprint 1 (the page route is `/lab/patterns` — flipping later is a one-day rename).**

**O2 — Bottom-nav home for Patterns.** Panel votes 5-2 for **major section of My Record now (sub-route at `/lab/patterns`), with the option to promote to a 4th bottom-nav tab in V3 once we measure weekly Active-Pattern-Visitor count**. Dissenters Priya + Jonas argue the 4th tab now is correct because Patterns is "the actual product" — they would bump bottom-nav to 4 in Sprint 2. **Decision needed before PR-2E ships in Sprint 2 (the Explorer ships either way; tab promotion is a separate ~2-day delta).**

**O3 — Pattern Card interpretive sentence vs. data-only.** Each Finding Card includes the "catalogue treats this as…" sentence (Helena-cleared Haiku prose). Founder may prefer pure data-only (the eyebrow + headline + bar breakdown + denominator, no prose). Panel split 5-2 in favor of including the sentence (the prose is what makes the card feel like a finding rather than a stat). Helena votes include; Maya votes include; Tariq dissents — wants data-only. **Decision needed before PR-1E (prose ships in the Sprint 1 cards).**

**O4 — Tier-gating granularity on Free.** Free sees 5 Findings per visit. Should this be 5 Findings (any combination of types) or 5 finding categories (forced limit on diversity — one cross-family, one geographic, one temporal, etc.)? Panel 4-3 in favor of 5 Findings (any combination) — the user discovers their own interests and the surface stays simple. **Decision needed before B6 instrumentation in Sprint 2.**

**O5 — Atlas early-access window cadence.** Pro on day 1, Basic on day 15, Free on day 30. Could be Pro on day 1, Basic on day 30, Free on day 60 (longer windows give Pro a stronger moat). Or Pro on day 1, Basic on day 7, Free on day 14 (shorter windows give Free a fresher catalogue). Lucia recommends 15/30 (the Strava Premium window). **Decision needed before Sprint 3 C1.**

**Carried from V1 (still pending):**

V1 O1-O5 (Basic price A/B, "See all 47" page design, Submit-pill copy, Year-in-Record cadence, Pro drop notification copy) — all still open, all unchanged by V2.

---

## 9. Risk register revisions

### R1 — Hallucination risk in Haiku-generated Finding text (NEW, HIGH)

The "catalogue treats this as…" sentence + the "Patterns near your record" callout are Haiku-generated. If Haiku misrepresents corpus counts (e.g., generates "the catalogue treats this as the most consistent cross-family descriptor" when the descriptor is only third-most consistent), the brand credibility cratering is irrecoverable.

**Mitigations:**

(a) The Haiku prompt receives ONLY the descriptor + per-family pcts + denominators as input. It cannot reference comparative claims it wasn't given. The prompt explicitly bans superlatives ("most," "highest," "strongest") unless the input data explicitly contains a ranking signal.

(b) A new banned-phrase list in the synthesis validator: "most consistent," "least common," "strongest," "weakest," "highest," "lowest," "uniquely." If the validator fails twice, fall back to a deterministic template ("Across N accounts in K families, the descriptor appears in X% of A, Y% of B, and Z% of C.").

(c) Helena copy-review on EVERY curated Finding's body_template at ingestion. The Haiku-generated sentence is ONLY for the per-render "catalogue treats this as" clause, not for headline or body text. The Finding's core copy is human-authored.

### R2 — Editorial register risk (NEW, HIGH)

Finding Cards lean toward BuzzFeed listicle ("7 things ghosts and aliens have in common!") or click-bait curiosity. The whole point is the surface NOT drifting there.

**Mitigations:**

(a) Banned eyebrow vocabulary: no "Did you know," "You won't believe," "Shocking," "Surprising," "Hidden," "Secret." Six fixed eyebrows only.

(b) Banned headline patterns: no questions ("Why do ghosts and aliens both…?"), no list-counting ("3 things…"), no emoji.

(c) Tariq + Helena co-review on each Finding's headline + body before promotion to catalogue. A reviewer-pair approval gate is encoded in the `findings_catalogue.status` field (`draft` → `helena_pass` → `tariq_pass` → `published`).

(d) Maya UX review on the personalized overlay copy. The "3 of your 4 accounts share this trait" copy must NEVER drift to "You're not alone" or "Other people just like you." Documentary register, always.

### R3 — Performance risk — corpus-wide aggregation at 200k+ scale (NEW, MEDIUM)

The `cross_family_overlap_pct` executor today reads ≤5000 sample rows per family (per `data-query-executor.ts:513` `countDescriptorMatchInFamily(... 5000)`). At 200k+ corpus that's a 2.5% sample. For the 5-card Sprint 1 rail, that's 5 queries × 3 families × 5000 rows = 75k row reads per cold-cache request.

**Mitigations:**

(a) Cache aggressively. The `/api/patterns/list` endpoint caches the computed bindings for 1h (cluster-finding does 10min; Findings are more stable so 1h is fine; the Atlas drop publish flow busts cache).

(b) Sprint 2 introduces precomputation. A nightly job at 05:00 (after classifier-daily) computes all 47+ curated Findings' bindings and writes to a `findings_computed` cache table. The endpoint reads the table, not live queries. Cold-cache cost goes to zero.

(c) Cross-family queries on the full corpus (post-NUFORC catch-up at 250k+) should still clear p95 < 800ms with proper indexes on `paradocs_assessment->'descriptors'` (existing GIN). If p95 slips, raise sample cap and pre-compute.

### R4 — Brand risk — surfacing findings about sensitive overlaps (NEW, HIGH)

Some cross-family Findings the corpus actually contains are politically/medically charged: alien abduction overlaps with sleep-paralysis symptomatology (which overlaps with PTSD presentations); psychic phenomena overlap with grief processing; near-death-experience descriptors overlap with anesthesia recovery. Surfacing these without care is a brand-cratering risk — claims of pathologizing experiencers, or worse, conspiratorial reading of corpus data.

**Mitigations:**

(a) **Hard editorial moderation list.** No Finding may surface a descriptor whose surfacing requires diagnostic vocabulary. The `seed-hints.ts` voice constraint already bans "anxiety, depression, dissociation, trauma, PTSD" — extend to ALL Pattern Card copy. Tariq is the second reviewer specifically for politically-charged crossings.

(b) **Tariq review on every cross-family pair before catalogue admission.** A new operator workflow: each candidate Finding is reviewed by Helena (register) + Tariq (anthropological framing) before status flips to `published`. Tariq's specific veto list: any Finding that implicates mental-health diagnostics, any Finding that suggests one phenomenon is "really" another phenomenon, any Finding that frames experiencers as inaccurate observers.

(c) **No editorializing the meaning.** The "catalogue treats this as…" sentence describes the corpus's structure ("treats this as a cross-family anchor"), never the experiencer ("treats people who report this as…"). Brand iron-rule.

### R5 — V1 risks carry

R1 brand drift, R2 viewport budget, R3 personalized feed performance, R4 redirect bounce, R5 matching engine quality, R6 comments thread starvation, R7 Sprint 1 scope creep — all carry from V1. Scope creep is particularly acute in V2 because the new Patterns surface tempts in-Sprint-1 expansion (full Explorer in Sprint 1 instead of MVP rail). Resist; the rail-only ship is the discipline.

---

## 10. Dissents

**Dissent 1 — Priya + Jonas (Patterns deserves a bottom-nav tab in Sprint 2).** Priya: *"Wikipedia gives every database its own front door. IMDb does. Wikidata does. Patterns IS the product; folding it under My Record signals it's secondary to the user's personal account, which is exactly backwards — the corpus is the moat, not the user's one experience."* Jonas seconds — argues that share-card discoverability requires a public-readable, app-shell-prominent surface, and a sub-route under /lab loses that prominence. Maya counter: a 4th bottom-nav tab inflates the IA before we measure stickiness; ship `/lab/patterns` first, promote in V3 if WAVP > 40% of MAU. Panel sides 5-2 with Maya; Priya + Jonas dissent flagged for founder taste call O2.

**Dissent 2 — Tariq (Pattern Cards should be data-only, no prose).** Tariq: *"Every adjective in a serious database is a vector for accusation of editorializing. Look at Wikipedia: lead sentences are bone-dry. The 'catalogue treats this as a cross-family anchor' sentence reads to me as one step from advocacy. I'd ship the bars and the denominator and NOTHING else."* Helena counter: *"The cluster-finding service already ships a quiet shape sentence and the founder reviewed it and held the line; the same constraint applies here. The prose is what makes a stat into a finding."* Panel 5-2 in favor of including the prose; Tariq dissent flagged for founder taste call O3.

**Dissent 3 — Lucia + Maya (the Atlas drop window cadence).** Lucia recommends 1 / 15 / 30 (Pro / Basic / Free) days from publish. Maya counter: *"The 30-day Free delay is too long. The 'I saw something' user files an account, sees a Finding overlay, comes back monthly to see the new Atlas — and if Free is two months behind Pro, she'll never know what's current. Make Free 14 days behind. The Pro moat is communal-release-day, not 4× the wait."* Lucia: *"Strava Premium's window data says 30 is the sweet spot."* Panel 4-3 in favor of Lucia's 15/30; Maya dissent flagged for founder taste call O5.

---

## 11. Editorial brand stamps — flagship recommendations

- §2.1 Naming (Patterns) — ON-BRAND.
- §2.3 Finding Card anatomy — ON-BRAND with Helena copy pass mandatory per Finding.
- §2.5 Finding detail page — ON-BRAND with Helena copy pass on methodology footer.
- §2.6 Drill-down paths — ON-BRAND.
- §2.7 Share-card PNG — ON-BRAND with Helena copy pass on share text per Finding.
- §3 Tier re-allocation — ON-BRAND (all three tier pitches need Helena copy review before user-facing surfaces use them; the pitches in §3 are spec, not ship-ready).
- §5.2 PR-1E additions — ON-BRAND with Helena copy pass on the "Patterns near your record" prompt.
- §7.2 Atlas drop framing — ON-BRAND with Helena copy pass on each monthly intro.
- §7.2 Pro Lens correlation grid — ON-BRAND with Helena copy pass on the methodology subhead.
- §9 R4 moderation list — Helena + Tariq co-review on every published Finding.

---

**Word count:** ~5,950. Under cap. Three dissents recorded. Five new founder taste calls. Five existing-code leverage points cited with file paths. Patterns surface specified end-to-end (canvas, card anatomy, drill paths, share). Tier re-allocation justified per tier with feature substance. Sprints 1-3 revised with PR cadence and existing infrastructure leverage explicit.

— Patterns Panel, June 2026
