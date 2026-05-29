# Cluster Pattern Card — Redesign Panel Memo

**Date:** May 29, 2026
**Panel:** Maya (Editorial), Jordan (Product/UX), Lena (Design), Sam (Data)
**Prior input:** `docs/panel-reviews/V11_17_14_cluster_pattern_card.md` (persona pass, May 24)
**Surface:** Discover feed — Cluster Pattern card
**Deliverable:** Approve, push back, or hand to implementer

---

## 1. TL;DR

- Kill the templated-alert voice and the triple-printed `196`. The card is a **noticing**, not a notification.
- Visually align with Lab promo / Phenomenon Spotlight: small mark, restrained type, one number, one quiet CTA. Drop the emoji, the radial gradient peak, the "Trending Pattern" badge, and "View Reports."
- One template, four small variations. The differences between geographic / temporal / category-trend / milestone go in **the eyebrow word and the single accent mark** — not in card structure.

---

## 2. What the current card gets wrong (panel consensus)

1. **Templated copy.** "A concentration of activity detected in California over the past week" is the language of a monitoring tool, not a documentary catalogue.
2. **The number prints three times** — headline, callout, CTA — which reads as insecurity. One placement is enough; the rest is decoration.
3. **Emoji as identity.** `🗺️ ⚡ 📈 ⭐` are the loudest pixels on the card, and they don't belong to Paradocs. The Lab promo's hand-tuned radar teaser sets the bar; a stock emoji is below it.
4. **Two competing eyebrows.** The corner pill ("◉ CLUSTER PATTERN") and the centered badge ("Trending Pattern") say the same thing. One must go.
5. **"View Reports" is a CRM verb.** This is the feed; the user is already discovering. The button names the database, not the experience.
6. **The card screams.** Purple-on-purple gradient + dot grid + giant emoji + giant numeral + bold headline. Every layer is at 100%. Paradocs' voice is quiet; the card should be quiet.

---

## 3. Panel debate

### Maya (Editorial)

KEEP: the cluster *concept* — surfacing patterns is editorially valuable.
DROP: every word currently on the card. "Trending Pattern," "concentration of activity detected," "reports in this cluster," "View Reports." All of it.
CHANGE: the headline has to read like a sentence a person would write. "196 UFO reports from California in the past week" is fine as a *fact* but it's not a *finding*. The card should tell me what's interesting, not just what's counted.

> Pushback on Sam: I hear you wanting baseline ratios, but "3.2× the typical rate" lands as a numerate flex. We're not Bloomberg. One number, plainly stated, then prose.

Recommendation: one-line declarative headline, one-line context line, no badge copy, no CTA copy beyond a chevron or a soft verb like "Open the cluster."

### Jordan (Product/UX)

KEEP: tappability and a clear affordance. This card has to convert to a filtered view or it's just decoration.
DROP: the "Trending Pattern" badge — the corner pill already does that job, and the corner pill is the cross-card convention we've already established (Lab promo, On This Date, Phenomenon Spotlight all self-identify in the corner).
CHANGE: the CTA from a pill button to a full-card tap target with a subtle footer cue. The whole card is the link.

> Pushback on Maya: "Open the cluster" is cute but vague to a first-timer. The persona-A read from the May 24 panel was "what's a cluster?" If we strip too far we lose comprehension. I want the corner pill to do the labeling work so the body can be quiet.

Recommendation: corner pill carries the type label ("Geographic cluster" / "Recent burst" / "Category trend" / "Milestone"). Body is editorial. Footer is a single chevron-affixed line, not a button.

### Lena (Design)

KEEP: the dark surface and the purple as accent (not as wash).
DROP: the radial gradient, the dot grid overlay, the centered alignment, the giant numeral, the emoji.
CHANGE: composition from centered-trophy to left-aligned editorial. Phenomenon Spotlight is left-aligned; the cluster card should match. Use Changa for the headline (display, weight 600), Inter for the meta line, brand purple as a 1px rule or a single small dot — not a field.

> Pushback on Jordan: a full-card tap target is fine but I don't want a footer chevron that looks like a chat bubble. A single hairline rule above a small "Open cluster ›" in Inter 13/medium is enough. We've been earning restraint everywhere else; this card has to fall in line.

Recommendation: left-aligned three-block layout — eyebrow row, editorial body, meta footer with the number embedded as a small bold inline figure, not a hero.

### Sam (Data)

KEEP: report_count, time_range, location_summary, category. They're real and they're cheap.
DROP: the *implication* of anomaly that "Trending" creates without any baseline math behind it. If we say "trending" we're making a claim we can't defend.
CHANGE: the eyebrow word. Use a neutral descriptor of the cluster *type*, not a value judgment. `Geographic cluster`, `Recent burst`, `Category trend`, `Milestone`. Each is true by construction; none over-claims.

> Pushback on Maya: I'll cede the ratio for now — we don't compute baselines yet — but when we do, the headline *should* carry it. "196 UFO reports from California — twice the usual week" is a finding, not a flex. Reserve a copy slot for that.

Recommendation: ship without baseline; design a second optional line slot for "vs baseline" so we can light it up when Sam's anomaly job is wired. Until then, that slot stays empty and the card breathes.

---

## 4. Editorial copy direction

**Voice rule:** A Paradocs cluster card is a quiet observation, not an alert. One sentence states the fact; one sentence gives it shape. No exclamation, no "detected," no "trending," no "concentration." Use proper nouns, real verbs, plain numbers.

**California case (196 UFO reports, past 7 days) — five rewrites:**

1. **196 UFO reports from California this week.**
   Most cluster around the Central Valley and the coast south of Monterey.

2. **California has logged 196 UFO sightings in the past seven days.**
   The pattern is concentrated, recent, and still growing.

3. **A week of orange lights over California.**
   196 reports so far, most from the Central Valley and the coast.

4. **196 California witnesses, one week.**
   Reports cluster around the Central Valley after dusk.

5. **Something is happening over California.**
   196 UFO reports in seven days — the densest week on record for the state.

Variant 1 is the safe default. Variant 3 is the editorial high bar (requires the Haiku "shared characteristic" generator from the May 24 panel — orange / dusk / Central Valley would need to be real). Variant 5 is reserved for genuine milestones; do not ship it on routine clusters.

---

## 5. Visual treatment direction

**Surface.** Dark background (`bg-gray-950`), no radial gradient, no dot grid. A single very low-opacity vertical purple wash on the left edge (4–6px wide, `#9000F0` at ~20% opacity, fading to nothing within 80px) acts as the accent rail. That's the only purple field.

**Layout.** Left-aligned, three vertical blocks with generous whitespace. Match Phenomenon Spotlight's left padding and rhythm.

```
┌────────────────────────────────────────┐
│ │ ◉ Geographic cluster                 │  ← corner pill, Inter 10 caps
│ │                                      │
│ │                                      │
│ │ 196 UFO reports from                 │  ← headline, Changa 600, 26–28px
│ │ California this week.                │     two lines, tight leading
│ │                                      │
│ │ Most cluster around the Central      │  ← body, Changa 400, 15–16px
│ │ Valley and the coast south of        │     cream-tinted gray
│ │ Monterey.                            │
│ │                                      │
│ │ ──────────────────────────────────── │  ← hairline rule, white/10
│ │ UFOs & Aliens · Past 7 days   ›      │  ← meta, Inter 12/medium, gray-400
│ └──────────────────────────────────────┘
```

**What stays:**
- Corner pill self-identifier (Lab promo / Spotlight / On This Date convention)
- Category label and time range in the meta footer
- Whole-card tap target → filtered view

**What goes:**
- Emoji icon (all four)
- Radial gradient and dot grid
- Centered "Trending Pattern" badge
- Giant numeral callout block
- "View Reports" pill button
- The number's second and third appearances

**What changes:**
- Headline becomes editorial, not templated. Number appears once, inside the sentence.
- CTA becomes a chevron in the meta footer, not a button.
- Category is `UFOs & Aliens` (CATEGORY_CONFIG label), never the slug.
- Location proper noun in the headline; descriptive location in the body when we have it.

**Reference anchors:** Lab promo's restraint of palette and iconography; Phenomenon Spotlight's left-aligned editorial composition and category-dot meta row; CITD sub-headline's quiet declarative tone ("You're not the only one who saw something.").

---

## 6. Cluster-type differentiation

**One template. Differentiation lives in the eyebrow and (optionally) a single accent mark.**

| Type | Corner pill label | Optional accent | Headline pattern |
|---|---|---|---|
| `geographic_cluster` | `◉ Geographic cluster` | none | "N {category} reports from {place} this week." |
| `temporal_burst` | `◉ Recent burst` | none | "N {category} reports in the past {window}." |
| `category_trend` | `◉ Category trend` | none | "{Category} is up this {window}." (N in body) |
| `milestone` | `◉ Milestone` | small purple dot before the headline | "Paradocs just passed N {category} reports." |

The structural card is identical across all four. No icon swap, no color swap, no layout swap. The eyebrow word does the work. The milestone accent dot is the only visual differentiation, and only because milestones are genuinely categorically different (a fact about the catalogue, not a fact about the world).

Sam's note: when the baseline-ratio data lands, `temporal_burst` and `category_trend` gain an optional second line under the headline ("Twice the usual rate.") — same template, one extra line slot used only when defensible.

---

## 7. What we're NOT doing (and why)

- **Per-type emoji or per-type color theming.** Loud and off-brand. The cross-card convention is restraint; cluster types are an internal taxonomy, not a user-facing taste.
- **A "Trending Pattern" badge.** Over-claims and duplicates the corner pill. Pick one identifier; the corner pill won.
- **A giant numeric hero.** The number is one of many facts on the card. It does not deserve top billing three times.
- **A pill CTA button.** Phenomenon Spotlight doesn't have one. Lab promo has one because it sells a subscription. The cluster card is editorial discovery; whole-card tap + chevron is sufficient.
- **Baseline anomaly math right now.** Sam doesn't have it wired. Don't claim what we can't compute. Reserve the line slot; light it up later.
- **A Haiku-generated "finding" sentence in v1.** The May 24 panel recommended it; we agree it's the editorial high bar, but it's a follow-up. v1 ships the templated-but-honest copy (variant 1 above); v2 adds the generator for the "orange lights over California" upgrade.
- **Renaming "cluster."** Persona A didn't know what it meant, but the corner pill spells the type out ("Geographic cluster"). The word does its job in context; we don't need a thesaurus pass.

---

## Recommended path

Ship v1: copy rewrite + visual restraint + one-template-four-eyebrows. ~half a day of implementer work. Defer the Haiku finding generator and the baseline ratio to v2 when the data job lands. The card stops screaming this week; it earns its slot next month.
