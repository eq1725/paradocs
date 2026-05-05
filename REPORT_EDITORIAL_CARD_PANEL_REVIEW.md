# Report & Editorial Card — Panel Review (V9 prep)

**The question (Chase):** "What about the way our ingested reports show up in this feed as well as any editorial pieces? Should we ensure they show up in an optimized way as well? I see value in these being visually distinct but also in them equally having shared visual elements."

**The right framing.** Both principles need to hold:
- **Consistency** so the user doesn't get whiplash between cards (same chrome, same chips, same CTA, same chip styling).
- **Type legibility** so the user knows at a glance whether this is an *encyclopedia entry*, a *single eyewitness account*, or *editorial commentary*.

---

## Current state audit

Three card types render in the feed, plus three special cards.

### PhenomenonCard (V8 — anchored)
- Category badge + year + region
- **NEW:** Phenomenon name kicker in primary purple
- Cold-open hook (anchor case)
- WHEN | WHERE | WITNESS chips (3)
- Unresolved tension line
- via Wikimedia attribution
- READ CASE

### TextReportCard (still V7-era)
- Category badge + year + location
- Source badge (BFRO, NUFORC, etc.)
- Headline (feed_hook or title)
- "Physical Evidence" pill if applicable
- **Big stat callout** (upvotes / views / comments — same kind of "X REPORTS" we just killed on phenomena)
- Body excerpt
- READ CASE

### MediaReportCard (still V7-era)
- Category badge + year + location
- **AMBER "Evidence" pill**
- Source badge
- Headline
- Photo/video evidence chips + amber stat callout
- Body
- Media thumbnail (expanded)
- READ CASE

### Special cards — already handled
- **OnThisDateCard** — its own amber/orange theme, calendar icon, year callout. Distinct *and* legible.
- **ClusterCard** — connection visualization.
- **PromoCard** — research hub upgrade.

**Diagnosis:** Phenomenon cards have been upgraded to V8 (cold-open hook, signal chips, unresolved tension, name kicker, no big-number callouts). Report cards are still on the V7 pattern with redundant stat callouts and definitional headlines. Editorial pieces aren't a distinct type at all yet — they get treated as either "report" or "phenomenon" depending on how they're imported.

---

## The panel

1. **Editorial Director** — ex-NYT *The Morning*, ex-*Atlantic*. "What does the *byline* tell the reader?"
2. **Mobile Feed Designer** — ex-TikTok, ex-Apple News. "Can the user tell card type in 200ms?"
3. **Information Architect** — ex-Reddit. "Is there a clear ontology, or are we mashing types?"
4. **Visual Designer** — ex-Substack, ex-Spotify. "Where does shared chrome end and type-language begin?"
5. **Cognitive Psychologist** — ex-Headspace, ex-NYT R&D. "How does the user mentally categorize what they're reading?"

---

## What each panelist said

### Editorial Director

> "Three card types should map to three editorial *forms*: the **encyclopedia entry** (synthesis of many cases), the **case file** (one specific eyewitness account), and the **editorial** (paradocs's own analysis or essay). The reader needs to know which one they're looking at because the *trust contract* is different. Encyclopedia synthesizes; case file recounts one experience; editorial argues a position. Conflate them and the reader stops trusting any of it."

**Recommendation:**
- Replace the "phenomenon name kicker" with a generic **TYPE kicker** that's consistent across all cards but reads different content per type:
  - Phenomenon: `ANGELS` (the phenomenon name)
  - Report: `EYEWITNESS · BFRO` (type · source)
  - Editorial: `ANALYSIS · BY PARADOCS` (type · author)
- Same primary-purple styling, same letter-spacing — but the *content* of the kicker tells the user what kind of thing they're reading.

### Mobile Feed Designer

> "Apple News uses a 200ms-readable ontology: the photo + headline tells you 80% of what's there, and a tiny section badge tells you the rest. We have the photo + headline; we need the badge to stop hedging. 'EYEWITNESS · NDERF' should look subtly *different* from 'ANGELS' — different enough to register, similar enough to feel like one product."

**Recommendation:**
- Keep the kicker styling identical (size, color, tracking) — visual consistency.
- Add a tiny **type icon** before the kicker text: `📜 EYEWITNESS` for reports, `✍ ANALYSIS` for editorials, no icon for phenomena (phenomenon name speaks for itself). Subtle differentiation, reads instantly.
- For media reports, the existing amber "Evidence" pill is fine — keep it as a secondary signal.

### Information Architect

> "The current schema has `phenomenon` and `report`. Editorial pieces are getting force-fit into one or the other depending on import path. That's a category error and it leaks into UX. Add a third entity type — `editorial` — to the data model. Then the rendering split is clean."

**Recommendation:**
- Schema-level: introduce `editorial` table (or `report.content_type='editorial'` flag) with author, byline, read-time, optional intro paragraph distinct from body.
- Routing: `/editorial/{slug}` or `/article/{slug}` for editorial pieces.
- Feed-v2: weight editorial differently in the ranking.
- For now (V8.2), if no schema change is desired yet, treat any report with `source_type='editorial'` as an editorial card variant.

### Visual Designer

> "Shared chrome should carry: hero image, category badge, kicker, hook headline, signal chips, unresolved tension (when applicable), CTA. That's the **constant frame**. Type-language should carry: kicker content, the *kind* of chips (different metadata per type), CTA verb (READ CASE vs READ ACCOUNT vs READ ANALYSIS), and one optional accent color band."

**Recommendation:**
- Constant frame, type-specific filling. Same skeleton, type-aware content.
- CTA verb maps to type:
  - Phenomenon: `READ CASE`
  - Report: `READ THE ACCOUNT`
  - Editorial: `READ THE ANALYSIS`
- Optional 4px accent strip at the very top of the card, behind the chrome:
  - Phenomenon: category color (existing)
  - Report: a slightly desaturated category color (signals "single instance")
  - Editorial: solid primary purple (paradocs voice)

### Cognitive Psychologist

> "Memory works in *types*. If every card looks the same the reader can't tell stories from definitions, and they walk away with mush. If every card looks different the reader has to context-switch every swipe and gets exhausted. The sweet spot is a **3-tier visual hierarchy** of difference: huge similarity in chrome (90%), small difference in kicker (5%), micro-difference in CTA verb (5%). That's enough to register the type, not enough to break flow."

**Recommendation:**
- Confirms the panel's converging direction: 90% shared, ~10% differentiated by type.
- Flag: don't over-design the differentiation. The kicker + CTA verb is enough. Anything more (like full-card color treatments) becomes overwhelming.

---

## Convergent recommendations

1. **Constant frame for all card types.** Same hero, chrome cluster, signal chips, unresolved tension, attribution, CTA placement.
2. **Type-aware kicker** in primary purple at the top:
   - Phenomenon: `ANGELS` (just the name)
   - Report: `📜 EYEWITNESS · BFRO`
   - Editorial: `✍ ANALYSIS · PARADOCS`
3. **Type-aware CTA verb:**
   - Phenomenon: `READ CASE`
   - Report: `READ THE ACCOUNT`
   - Editorial: `READ THE ANALYSIS`
4. **Drop the V7-era stat callouts** (upvotes/views/comments) from report cards, same as we did on phenomena. Replace with signal chips (date, location, witness — all present on reports already).
5. **Drop the redundant body excerpt on report cards** when a hook is present, same as phenomena.
6. **Keep the amber "Evidence" pill on MediaReportCard** as a secondary signal for "this card has photographic / physical evidence" — it's actionable and earned.
7. **Add `editorial` content type** as a Tier-2 schema change (deferred; can be flagged in current `source_type` for now).

---

## Recommended card layouts (V9)

### Phenomenon (V8 — already shipped, no change)
```
[hero @ 0.45]
RELIGION & MYTHOLOGY · GLOBAL
ANGELS                                    ← name kicker
2000 BCE onward. Mesopotamian cuneiform...← cold-open hook
[2000 BCE – present] [Cross-cultural] [5 modern…]
│ The unresolved part: ...
                                      via Wikimedia
                                  [▼ READ CASE]
```

### Eyewitness Report (V9 proposed)
```
[hero @ 0.45 if present]
CRYPTIDS · 2019 · BC, Canada
📜 EYEWITNESS · BFRO                      ← type · source kicker
"Bipedal figure crossed Highway 99...      ← report's hook
near Squamish at dusk, August 2019."
[Aug 2019] [BC, Canada] [A driver]        ← When · Where · Witness
│ The unresolved part: 16-inch tracks      ← optional, when narrative supplies one
│ measured at scene; no usable cast.
                                      via BFRO Database
                              [▼ READ THE ACCOUNT]
```

### Editorial / Analysis (V9 proposed)
```
[hero @ 0.45]
ANALYSIS · 8 MIN READ
✍ ANALYSIS · PARADOCS                     ← type · author kicker
"What the Wow! Signal still tells us       ← editorial headline
about how to listen for ETs"
[Sept 2025] [SETI] [Editorial]            ← chip strip (date · subject · type)
│ The argument: Active SETI vs passive...
                                      Original analysis
                            [▼ READ THE ANALYSIS]
```

---

## Implementation tiers

### Tier 1 — V9.0 — visual parity (1-2 days, ~30 min once decided)
- Update TextReportCard render to match phenomena structure:
  - Add type kicker (`📜 EYEWITNESS · {source_label}`)
  - Drop big stat callout (upvotes/views)
  - Drop redundant body excerpt
  - Add WHEN · WHERE · WITNESS chips when source data supplies them (date, location, anonymized witness role)
- Update MediaReportCard similarly; keep the amber "Evidence" pill.
- Update CTA text for reports to "READ THE ACCOUNT".
- ✅ Same visual chrome (hero, scrim, badge, chips, tension, CTA).

### Tier 2 — V9.1 — editorial type (2-3 days)
- Schema: introduce `editorial_pieces` table OR add `content_type='editorial'` enum + author/byline/read_time fields on reports.
- Add EditorialCard render variant.
- New CTA verb "READ THE ANALYSIS".
- Editorial-specific kicker prefix `✍ ANALYSIS · {author}`.
- Optional: editorial-specific 4px accent strip in primary purple.

### Tier 3 — V9.2 — anchored reports (3-5 days)
- Generate per-report `anchor_case_hook`-equivalent via Claude (similar pipeline to phenomena V8 sweep, but anchored on the *single* report's specific event).
- Generate per-report `unresolved_tension` line (where the report itself contains a contested or unresolved element).
- Run sweep across all ~10k reports.

### Tier 4 — V9.3 — type-aware ranking (1 day)
- Feed-v2 should mix card types intelligently: lead with a phenomenon (encyclopedic anchor), follow with 1–2 reports (specific cases), occasional editorial (deep dive). Not random.
- Ensures the user gets variance without context-switch fatigue.

---

## What we're NOT changing

- Phenomenon card V8 layout (already correct)
- Card chrome (chrome cluster, save/share/why, sticky CTA)
- Hero image opacity (V8 Tier 0 fixed at 0.45)
- Topics bottom-sheet picker (V8.1)
- Anchor-case hook generation pipeline

---

## Open questions for Chase

1. **Tier 1 ship today / this week?** It's the high-leverage move — every report card in the feed becomes consistent with the new phenomenon style. Pure UI work, no schema change.

2. **Is there a real distinction between "editorial" and "report" in the current ingestion pipeline?** If `source_type='editorial'` already flags some imported content, we can render those as editorial cards immediately without schema change. If editorial pieces aren't being imported yet, we can defer to Tier 2.

3. **CTA verbs — keep "READ CASE" for everything, or differentiate per type?** Visual Designer recommended differentiation; Cognitive Psychologist warned against over-differentiation. The 3 variants ("READ CASE" / "READ THE ACCOUNT" / "READ THE ANALYSIS") are useful but require maintaining three labels. Could simplify to "READ" + an icon if we want minimal verbiage.

4. **Anchor-case hook regeneration for reports** (Tier 3) — same pipeline as phenomena V8, but ~10k reports vs 4,531 phenomena. Estimated 6-8 hours of compute + ~$15-25 in Anthropic credits. Worth it for editorial coherence; can defer if the V9.0 Tier 1 work makes report cards "good enough."

---

## TL;DR

Reports + editorial pieces should share **90% of the chrome** with phenomena (same hero, chips, tension line, CTA placement) but distinguish themselves via the **kicker** (type · source/author) and **CTA verb**. Tier 1 ships visual parity in ~30 min once decided. Tier 2 introduces editorial as a first-class type. Tier 3 brings reports up to V8-quality cold-open hooks via the same Claude pipeline.
