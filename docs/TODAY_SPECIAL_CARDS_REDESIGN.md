# Today Feed Special Cards — Mobile Redesign Panel

**To:** Chase
**From:** The Today-Cards Panel — Sho Tanaka (mobile-first UX, ex-TikTok feed product), Mariko (mass-market copy lead, Sprint 1C aunt-test enforcer), Dr. Helena Voigt (editorial register), Lucia Reyes (conversion lead, ex-Spotify / Letterboxd), Sam Doyle (pragmatic engineer / scope hawk).
**Re:** Founder flagged three Today-feed special cards — FindingCard (today_card variant), ClusteringCard, LabPromo — for shared problems: dead space, weak "why care," marketing register intruding on documentary surface, RADAR teaser on LabPromo out of sync with current My Record aesthetic.
**Scope:** Research + recommendations only. No code. Mockups in ASCII; copy candidates with editor stamps.
**Word budget:** ~3,500.

---

## 1. The consolidated mobile-feed pattern (~600 words)

The three flagged cards all share a viewport — a 2:3 portrait swipe slot in the Today feed — and they currently solve it incompatibly. FindingCard top-loads, then collapses into 40-60% dark. ClusteringCard top-loads even harder (eyebrow + headline burn the top 30%, then the cream-italic baseline is the entire middle, then 60% void). LabPromo center-stacks everything around a 140px RADAR sphere, then drops a heavy cream button. Three different grammars for one slot.

The TikTok-grammar floor: **vertical cards do one job, in three zones, with one tap target.** The viewer's thumb hovers at the bottom edge; the eye scans top-to-middle in the first 800ms. Anything below the middle that isn't part of the tap affordance is wasted. The consolidated pattern, three zones with assigned jobs.

### Zone A — Hero (top 35-40% of card)

The hero zone exists to make the viewer stay. Its job is to deliver the *single fact this card is about* in under two seconds, so the swipe-decision is "stay" not "next."

- **Eyebrow** (small-caps, hairline-underlined, 10-12px). Names the artifact type — *Across Phenomena · Geographic Pattern · From the Archive*. Not a filled pill (Mariko: filled pills read promotional). The current FindingCard `Eyebrow` component is the right register; ClusteringCard's purple-tint pill is acceptable; LabPromo's "From Paradocs" pill is fine but should sit in the same eyebrow position, not floating top-left.
- **Headline** (display, 26-32px, max 24ch). The fact in plain English. No taxonomy. Mariko: subject-verb-object, opens with people or a count, never a percentage.
- **Hero numeric** (display, 56-72px, brand-purple #9000F0) — *only when there is a single dominant number that earns Spotify-Wrapped scale.* FindingCard's `HeroStat` already does this. ClusteringCard should adopt it (the "5×" beat). LabPromo does not have a single number to lead with — and that's a clue that the lead element should be something else (covered in §4).

Helena rule: the hero zone is the documentary surface. No exclamation, no second-person body voice except inside the personalized overlay, no spooky.

### Zone B — Substance (middle 30-40%)

The substance zone is what the founder is calling the "dead space" — and the prescription is *fill it with corpus-grounded substance, not chrome.* This is the per-card-type-specific zone; it carries whatever evidence the card-type owns.

- FindingCard: the category bars + a concrete excerpt or comparison (§2).
- ClusteringCard: a 3-5 line list of recent reports in the cluster, OR a vs-baseline mini-strip (§3).
- LabPromo: a "your record so far" mini-snapshot (the 4 saved reports as small chips) replacing the RADAR sphere (§4).

The constant across all three: **substance, not value props.** Lucia: corporate value-prop lists are the single most-skippable pattern in feeds; the user has been trained to skim past them. Replace value-prop lists with *evidence the card is what it claims to be.* The user infers value from the evidence.

### Zone C — Action (bottom 20-25%)

The action zone exists to give the viewer one path off the card. Its job is *small, calm, and tappable.* Above all, it never competes with the hero or the substance.

- Hairline rule (border-top white/0.06-0.07).
- Citation line on the left: *Paradocs Archive · 94,341 accounts*. The wordmark + thin vertical rule + tabular-nums count. Already correct in FindingCard.
- Action affordance on the right: chevron + label. *Read more · See the cluster · Open My Record*. **No cream-filled pill buttons in the Today feed.** (Helena: cream-filled buttons read marketing; chevron + label reads documentary.) LabPromo's "Start 7-day free trial" pill is the largest current-state violation.
- Whole-card tap target wraps everything. The chevron is a visual cue, not the only hit target.

**Three zone budgets, one tap, one register.** A card that doesn't have content for all three zones should be designed around the zones that *do* have content — *not* center-stacked in a way that creates voids.

---

## 2. FindingCard today_card redesign (~700 words)

### 2.1 What the dead space is

The current today_card lays out hero stat + 2 secondary bars + denominator italic + interpretive sentence + footer. On an iPhone 14 Pro that occupies ~55% of the viewport. The bottom ~45% is the dark `bg-gray-950` with the purple top/bottom hairlines + the citation footer pinned at the bottom. The right side of every line is also blank because of the `max-w-[34ch]` cap.

### 2.2 The fill — which of the five options

The brief listed five options. Panel evaluation:

| Option | Verdict | Why |
|---|---|---|
| (a) Representative report excerpt | **PICK** | Corpus-grounded, no new data dependency (`representative_report_ids` already exists on the Finding), turns the abstract pattern into one human voice, doubles as the "see the case" hand-off the user wanted from "See reports →" before it became "Read more →" |
| (b) Compare to 2 related Findings | Defer | Requires a related-findings join we don't have today; introduces decision fatigue (3 things to tap) |
| (c) Geographic mini-map | No | The Finding is cross-phenomena; geography isn't always meaningful (reunion + tunnel imagery have no geographic story) |
| (d) Timeline mini-chart | No | Same — temporality isn't the spine of most Findings; over-claims trend where there isn't one |
| (e) Larger share-card region | Defer | The share affordance belongs system-wide, not per-card; will compete with the substance |

**Pick: option (a) — a representative report excerpt.** Lucia: this is also the highest-charge moment for a new visitor — the abstract pattern (2,820 witnesses describe X) becomes one quoted human ("I couldn't move my arms or legs for about thirty seconds, and then it was over"). That single quote is what makes the screenshotable beat land.

Sam (engineer scope check): the `representative_report_ids` array is already on the `Finding` type. A new server-side join (`SELECT title, location_short, date_short, excerpt FROM reports WHERE id = $1 LIMIT 1`) lands as one query on the today-feed endpoint. ~1 sprint, well inside scope.

### 2.3 Layout sketch (ASCII)

```
┌───────────────────────────────────────────────┐ ← brand-purple hairline
│                                               │
│  ACROSS PHENOMENA          [icon][icon][icon] │ ← Zone A: eyebrow + family icons
│  ─────────────                                │
│                                               │
│  The same locked-in opening shows up in       │
│  sleep paralysis, near-death events, and      │ ← headline (display, 32px)
│  UFO encounters.                              │
│                                               │
│  2,820  witnesses, three settings             │ ← Hero numeric (Spotify-Wrapped)
│         (out of 92,843 accounts)              │
│                                               │
│  ▓▓▓▓▓▓▓▓▓▓▓░░░░  Near-Death     7%  (2,024) │ ← Zone B: bars
│  ▓▓▓▓▓░░░░░░░░░░  UFO Sightings  1%    (796) │
│                                               │
│  ┌───────────────────────────────────────┐    │ ← NEW: report excerpt slab
│  │ "I couldn't move my arms or my legs   │    │
│  │  for about thirty seconds, and then   │    │
│  │  it was over. There was no light, no  │    │
│  │  figure, nothing in the room."        │    │
│  │  ─ Sandusky, OH · 2003                │    │
│  └───────────────────────────────────────┘    │
│                                               │
│  ─────────────────────────────────────────    │ ← Zone C: hairline
│  PARADOCS ARCHIVE │ 92,843 accounts      →    │
└───────────────────────────────────────────────┘ ← brand-purple hairline
```

The excerpt slab fills the dead middle-bottom with corpus voice. Border: `border-white/[0.07]`. Background: a hair-darker `bg-white/[0.025]`. Excerpt text in `text-gray-200` italic at 14px; attribution in `text-gray-500` non-italic at 11.5px. No quote marks rendered around the excerpt — the slab itself is the quote container (Helena: typographic quotes risk decoration register; the slab is enough).

### 2.4 Copy — the "why care" tightening

Current reunion sentence (53 words, founder still flags as not landing):

> "1,928 witnesses describe meeting someone they knew who had died. The percentage is small — 2-3% — but it's the same small percentage whether the witness was at a deathbed, in a haunted location, or trying to contact the dead through a medium. Across 94,341 reports, that small percentage barely moves."

The panel's diagnosis: the "why care" buried in *"the same small percentage barely moves"* requires the reader to do the inference. Mariko: the aunt doesn't infer; she nods or she swipes. The payoff has to be the *implication*, not the *measurement*.

**Candidate A (Helena lead):**
> "1,928 witnesses describe meeting someone they knew who had died. Whether they were at a deathbed, in a haunted house, or sitting with a medium, the rate is the same — 2-3%. Three doors into the experience; the same person on the other side."
- Helena: **ON-BRAND**
- Mariko: **PASSES AUNT** (the "same person on the other side" lands the implication concretely)
- Lucia: screenshottable
- (51 words)

**Candidate B (Mariko lead, shorter):**
> "1,928 witnesses describe meeting someone they knew who had died. The setting doesn't change the rate — 2-3% in haunted houses, at deathbeds, and through mediums alike. The reunion finds them anyway."
- Helena: **FLAG** (\"finds them\" risks edging into mystical voice)
- Mariko: PASSES AUNT but Helena's veto edges win
- (40 words)

**Panel recommendation: Candidate A.** Helena + Mariko both clear; the screenshottable closer is the "three doors / same person" beat.

---

## 3. ClusteringCard redesign (~600 words)

### 3.1 Current state diagnosis

The current card front-loads the eyebrow pill + headline ("292 UFOs & Aliens reports from Washington this week"), buries the baseline ("5× the usual week") as italic dim-gray at the bottom, and leaves ~60% of the card empty. Sho: the baseline is *the entire reason this card exists* — the cluster matters because it's anomalous — and it's smaller than the body. That's inverted.

### 3.2 The fix

Three moves, all consistent with the consolidated pattern.

**Move 1 — Promote the baseline to hero.** "5×" becomes the Spotify-Wrapped-scale numeric. The headline becomes the *context line under the number*, not the lead.

**Move 2 — Fill Zone B with a 3-row list of representative reports from the cluster.** Title + location + date snippet, with chevron. Same data the feed already loads.

**Move 3 — Tighten the copy.** The current pattern reads template-y. Replace with a cleaner factual sentence.

### 3.3 Layout sketch (ASCII)

```
┌───────────────────────────────────────────────┐
│ ▌                                             │ ← left edge purple rail (kept)
│ ▌                                             │
│ ▌  [ GEOGRAPHIC CLUSTER ]                     │ ← Zone A: eyebrow pill
│ ▌                                             │
│ ▌                                             │
│ ▌  5×          the usual week                 │ ← Hero numeric (72px purple)
│ ▌                                             │   + secondary label
│ ▌                                             │
│ ▌  292 UFO sightings from Washington          │ ← headline (24px display)
│ ▌  in the last 7 days.                        │
│ ▌                                             │
│ ▌                                             │
│ ▌  IN THIS CLUSTER                            │ ← Zone B: substance label
│ ▌  ─────                                      │
│ ▌  "Three lights over Tacoma, single file"    │ ← row 1
│ ▌    Tacoma, WA · 2 days ago               →  │
│ ▌                                             │
│ ▌  "Silent triangle, Bellingham"              │ ← row 2
│ ▌    Bellingham, WA · 4 days ago           →  │
│ ▌                                             │
│ ▌  "Boomerang shape over Spokane"             │ ← row 3
│ ▌    Spokane, WA · 5 days ago              →  │
│ ▌                                             │
│ ▌  ─────────────────────────────────────────  │ ← Zone C: hairline
│ ▌  UFOs & ALIENS · Washington · this week  →  │
└───────────────────────────────────────────────┘
```

The 3-row list of cluster reports is what makes the card *evidence* and not *announcement*. Sam: the cluster route already loads `linked_report_ids`; the feed endpoint joins on title + location + date once. No new data shape.

### 3.4 Copy candidates

Headline (under the hero numeric):

**Candidate A:** *"292 UFO sightings from Washington in the last 7 days."*
- Helena: ON-BRAND
- Mariko: PASSES AUNT
- (literal fact; the hero numeric does the "why care" work)

**Candidate B:** *"Washington is seeing 5× the usual rate of UFO reports."*
- Helena: ON-BRAND
- Mariko: PASSES AUNT
- Sho: redundant with the hero numeric; the panel prefers A

**Panel recommendation: Candidate A** as the under-hero line. The hero "5× the usual week" + Candidate A is the cleanest beat — the number lands the surprise, the sentence anchors the count and the place.

Substance section label: **"IN THIS CLUSTER"** (small-caps, hairline-underlined). Helena: ON-BRAND. Mariko: PASSES AUNT.

If `baseline_text` is missing for a cluster (insufficient history), the hero numeric is suppressed and the headline promotes to Zone A. The 3-row list still anchors Zone B. The card never has a void.

---

## 4. LabPromo Today-variant redesign (~700 words)

### 4.1 What's wrong, named

- **The RADAR sphere is the old My Record aesthetic.** Sprint V5 (MY_RECORD_SME_META_REVIEW) explicitly killed RadarSurface as part of the V4 cuts. The promo card is still surfacing it as a teaser — *promoting an aesthetic the product is moving away from.* That's the single biggest tell of the card being out of sync.
- **The value-prop list reads corporate.** "Your experience, set against 200k accounts" / "Related reports surfaced as the archive grows" / "Keep collections of accounts that matter to you" — Lucia: this is the LinkedIn-tier feature-bulleted register; Mariko: the aunt skims past.
- **The cream-pill CTA is too heavy for the Today feed.** The other two Today cards have chevron-only affordances; this one has a 140px-wide cream button. Visual mass alone signals "marketing."
- **The headline state-machine is right, the sub-headline is wrong.** *"The pattern is already there. My Record places your account inside it."* — Helena: this is workshop vocabulary. *"Places your account inside it"* is data-prose, not voice.

### 4.2 The replacement — pick

The brief listed four options for replacing the RADAR sphere. Panel evaluation:

| Option | Verdict | Why |
|---|---|---|
| (a) Mini "your record so far" — 4 saved reports as small chips | **PICK** | Shows the user's actual record back to them; matches the SME META-REVIEW's Ancestry-style frame ("your tree of three names feels like a beginning"); evidence not chrome |
| (b) "200k accounts; where yours fits" zoom-out | No | Re-introduces a chart/visualization where META-REVIEW killed them; risks RADAR-2.0 |
| (c) Single Finding teaser ("here's a pattern from your saves") | Defer | Requires a saves→finding inference layer we don't have; great for Sprint 2 |
| (d) Drop the visualization entirely, expand value props | No | Lucia: value-prop expansion is the wrong direction; the card already over-tells |

**Pick: option (a).** A small Zone-B slab showing 3-4 of the user's saved reports as quiet chips, titled "YOUR RECORD SO FAR" with the count above. For a user with `savedCount7d === 0`, the slab swaps to a single "Start your record" empty-state slab. For `savedCount7d >= 1`, real data — title + location + date per chip.

This is also the SME META-REVIEW's central insight: *make n=1 feel like a beginning, not a sample size.* The Today promo is the perfect surface to enact that — show the aunt that the 4 reports she saved are already a record, and the offer becomes "keep growing this," not "buy a feature."

### 4.3 Layout sketch (ASCII)

```
┌───────────────────────────────────────────────┐
│                                               │
│  [ FROM PARADOCS ]                            │ ← Zone A: eyebrow (relocated)
│                                               │
│  My Record                                    │ ← wordmark (44px Changa One)
│                                               │
│  You've saved 4 reports this week.            │ ← headline (state-aware)
│  The catalogue can tell you why.              │ ← sub-line
│                                               │
│                                               │
│  YOUR RECORD SO FAR                           │ ← Zone B label
│  ─────                                        │
│  ┌────────────────────────────────────────┐   │
│  │ "Triangle, three lights, no sound"     │   │
│  │  Sandusky, OH · saved Tuesday          │   │
│  ├────────────────────────────────────────┤   │
│  │ "Silent disc over Lake Erie"           │   │
│  │  Cleveland, OH · saved Wednesday       │   │
│  ├────────────────────────────────────────┤   │
│  │ "Three lights in formation"            │   │
│  │  Toledo, OH · saved Friday             │   │
│  ├────────────────────────────────────────┤   │
│  │ + 1 more                               │   │
│  └────────────────────────────────────────┘   │
│                                               │
│  ─────────────────────────────────────────    │ ← Zone C
│  Open My Record                            →  │
│  Free to start · $5.99/mo after 7 days        │
└───────────────────────────────────────────────┘
```

Note the inverted action zone: the affordance is *Open My Record*, not *Start 7-day free trial*. The cream pill is gone. The pricing detail moves to a quiet caption beneath the action — present, not punching.

Lucia (dissent recorded — see §5): she would A/B this against the current cream-pill CTA. Her instinct is that the chevron-only treatment under-converts vs the pill button by 15-25%. Sho's counter: the cream pill is what makes the card feel marketing-y in the first place, and the user is already deep in the feed — the conversion is "tap to learn more," not "commit to trial here."

### 4.4 Copy candidates (state-aware)

State: `savedCount7d >= 4`.
**Headline A:** *"You've saved 4 reports this week. The catalogue can tell you why."*
- Helena: ON-BRAND (the "catalogue" is the documentary noun; replaces the "Lab makes it visible" workshop vocabulary)
- Mariko: PASSES AUNT
- Lucia: stronger than current; concrete pattern-question hook

State: `savedCount7d >= 1`.
**Headline B:** *"You've saved {N} reports. Three more and the catalogue starts noticing patterns."*
- Helena: ON-BRAND (with edit: "the catalogue starts noticing" is acceptable; "noticing" is documentary if the corpus is the subject)
- Mariko: PASSES AUNT
- (Sam: requires a small change to `pickHeadline`)

State: signed-out / `savedCount7d === 0`.
**Headline C:** *"200,000 catalogued accounts. Yours might already be in here."*
- Helena: ON-BRAND
- Mariko: PASSES AUNT
- Lucia: this is the front-door number the SME META-REVIEW wants surfaced; doubles the work

Sub-line (replaces current SUB_HEADLINE): **"Your account, set against the archive."**
- Helena: ON-BRAND (austere; documentary)
- Mariko: PASSES AUNT
- (Replaces "The pattern is already there. My Record places your account inside it." — that sub-line is two sentences trying to be one; the new sub-line is one sentence doing the same work.)

Zone-B label: **"YOUR RECORD SO FAR"** (small-caps, 11px, hairline-underlined). Helena + Mariko clear.

Action label: **"Open My Record →"** (replaces "Start 7-day free trial"). Pricing detail moves to caption.
- Helena: ON-BRAND
- Mariko: PASSES AUNT
- Lucia: **flagged dissent** — wants the trial-frame retained somewhere visible. Panel compromise: keep the pricing caption *("Free to start · $5.99/mo after 7 days")* directly below the action chevron, so the offer is present without becoming the visual lead.

---

## 5. Consistency check + open questions (~400 words)

### 5.1 Where the three cards now share the pattern

All three cards now follow the same three-zone grammar.

| Zone | FindingCard | ClusteringCard | LabPromo |
|---|---|---|---|
| **A — Hero** | eyebrow + headline + hero stat (largest family %) | eyebrow pill + hero numeric (5×) + headline (the count + place) | eyebrow + wordmark + headline (state-aware) + sub-line |
| **B — Substance** | category bars + representative excerpt slab | 3-row list of cluster reports | "YOUR RECORD SO FAR" chip stack |
| **C — Action** | citation + chevron | category · location · time + chevron | "Open My Record →" + pricing caption |

All three carry the same hairline-rule register; all three lose the cream-pill button (LabPromo was the last violator); all three favor evidence over value props in Zone B.

### 5.2 Where they intentionally diverge

- **Backgrounds.** FindingCard keeps the dark `bg-gray-950` + brand-purple top/bottom hairlines. ClusteringCard keeps the left-edge accent rail (its identifying mark per the panel memo). LabPromo keeps its indigo gradient — this is the *one* card where a slightly warmer surface is justified because it's the promo and needs a hair of distinction from the editorial cards. Helena: ON-BRAND, conditional on the gradient staying as restrained as it currently is.
- **Wordmark.** Only LabPromo carries the "My Record" Changa One wordmark in Zone A — it's a promo for a destination, so the wordmark functions as the identifier. FindingCard and ClusteringCard don't need wordmarks; their eyebrows do the identification.
- **Share affordance.** Panel recommends the share button live on FindingCard *only* in MVP — it's the most screenshotable artifact, and adding it to ClusteringCard / LabPromo risks chrome bloat. Defer cluster-share to V2 (Sho dissents — believes the cluster card is also share-worthy; founder taste call).

### 5.3 Open questions for founder

1. **Backgrounds — should FindingCard and ClusteringCard share a gradient register?** Today both are flat dark. The panel recommends *no* — the contrast lets the Today feed feel varied as the user swipes. But: a subtle hairline radial behind the hero numeric might give both cards a bit more visual lift without breaking documentary register. Worth a Helena copy-review-but-for-visuals pass.

2. **Share button — every card, or FindingCard only?** Panel splits 3-2 in favor of FindingCard-only for MVP. Sho + Lucia want it on ClusteringCard too (the "5× the usual week" beat is shareable). Helena votes FindingCard-only (the Findings are the surface most worth recruiting on).

3. **LabPromo goal — convert to Basic, or engage with /lab?** Today's "Start 7-day free trial" + value props say "convert"; the actual content says "engage." Panel recommendation: **engage primary, convert secondary** — the redesign tilts that direction (the chevron + caption). But this is a founder call, and if the answer is "convert primary," the cream-pill CTA stays and the value-prop list comes back. Lucia: she wants A/B between the two framings before committing.

---

## 6. Recommendation memo — one direction per card

**FindingCard today_card.** Fill the dead space with a *representative report excerpt slab* inside Zone B. Adopt Candidate A copy for the reunion finding ("Three doors into the experience; the same person on the other side."). Keep brand-purple hairlines, hero stat, category bars. Add `representative_report_excerpt` field (title + location + date + 2-3 sentence pull) to the today-feed `Finding` payload. **Helena ON-BRAND; Mariko PASSES AUNT; Lucia screenshot-ready; Sam ~1 sprint.**

**ClusteringCard.** Promote `baseline_text` ("5×") to a Spotify-Wrapped-scale hero numeric in Zone A. Demote the headline to a fact-sentence under the numeric. Fill Zone B with a 3-row list of representative cluster reports (title + location + relative date, each row chevron-tapable). Adopt Candidate A copy. When `baseline_text` is missing, promote the headline back into the hero slot and skip the numeric. **Helena ON-BRAND; Mariko PASSES AUNT; Sho approves; Sam ~3 days.**

**LabPromo.** Replace the RADAR teaser with a "YOUR RECORD SO FAR" chip stack showing the user's last 3-4 saved reports. Adopt state-aware Headline A/B/C. Adopt sub-line "Your account, set against the archive." Replace the cream-pill "Start 7-day free trial" with a chevron action "Open My Record →" plus a quiet pricing caption. Relocate the "FROM PARADOCS" pill to the standard eyebrow position. **Helena ON-BRAND; Mariko PASSES AUNT; Lucia flags conversion A/B before committing; Sam ~1 sprint, includes a tiny `/api/lab/promo/recent-saves` join.**

---

## 7. Dissents recorded

**Dissent 1 — Lucia (Conversion).** *"Killing the cream-pill CTA on LabPromo is the right aesthetic move and possibly the wrong conversion move. I want this A/B'd: chevron-only treatment vs. cream pill, with the chevron-only as the proposed challenger. My prediction is chevron-only under-converts to Basic by 15-25% but reads as documentary; the founder has to decide if that trade is worth it. Helena seconds the aesthetic; Sho seconds the aesthetic; I am alone on the dissent."*

**Dissent 2 — Sho (Mobile UX).** *"The share button should be on the ClusteringCard, not just the FindingCard. The 'Washington is seeing 5× the usual rate' beat is the single most screenshot-shareable card-type we have — it's a local-news-grade fact, and locality is exactly what makes mass-market users send things to family. FindingCard-only for share is leaving recruit upside on the table. Helena disagrees; she wants Findings to be the share lever. Founder taste call."*

**Dissent 3 — Mariko (Mass-market copy).** *"Candidate A for the reunion finding ('Three doors into the experience; the same person on the other side.') is one register-step closer to mystical voice than I'm comfortable with. The aunt screenshots it; the skeptic raises an eyebrow. I would prefer a quieter closer — 'The setting changes; the rate doesn't.' — even though it's less screenshot-y. Helena overrides — she wants the implication landed, not the measurement. I record the dissent and accept the panel call."*

---

*Word count: ~3,470. Under cap. Helena + Mariko aligned on every recommended copy candidate. Three dissents recorded. Three founder taste calls flagged.*
