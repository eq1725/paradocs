# Top Phenomena Row — Redesign Panel Memo

**Date:** May 30, 2026
**Panel:** Maya (Editorial), Jordan (Product/UX), Lena (Design), Sam (Data)
**Surface:** `/explore` (also nav: "Phenomena") — "Top Phenomena Right Now" horizontal-scroll row
**Current implementation:** `src/pages/explore.tsx:1290-1420`
**Deliverable:** Approve, push back, or hand to implementer

---

## 1. TL;DR

- The section title is the lie. "Top Phenomena Right Now" is tabloid framing for a row that is, in practice, **the four most-tagged phenomena across recent reports** — and "Top" implies a defensible ranking we don't yet compute. Rename. Maya leads.
- The two broken links (See-all + Browse Encyclopedia terminator) are not just a bug, they are the symptom. The row was designed as a teaser to the `/phenomena` index but was wired to a same-page anchor. **Both destinations: `/phenomena`.** Tier 1 fix is one line in two places.
- Kill the terminator card. A horizontal scroll row that ends with a fifth card that says "see the rest" is a dead-end metaphor — the user already has a "See all" in the header. Lena.
- Keep the rich image-bg card, but quiet it. No rank numerals, no count-delta badges, no "+340 this week" pulse. The single signal that earns the slot is **report count**, which is already on the card. Sam confirms nothing else is defensible at our data volume.
- Drop "Encyclopedia" as a verb anywhere on this surface. `/phenomena` is a **tag-vocabulary index**, not an encyclopedia. The label has been off-brand since the pivot. Call it what it is: **"All phenomena."**

---

## 2. What the current row gets wrong (panel consensus)

1. **The header overclaims.** "Top Phenomena Right Now" + "Most-tagged across recent reports" — the headline says ranking, the subtitle says volume. Volume across "recent reports" is also vague: recent how? Top by what? Neither line survives Sam's defensibility test.
2. **The See-all link goes nowhere useful.** It scrolls the user *back up the same page* to the category grid they scrolled past to reach this row. This is the worst possible interaction outcome for a "see all" affordance: it punishes the user for engaging.
3. **The Browse Encyclopedia card has the same bug** and adds a second insult — it implies a destination ("Every phenomenon") it does not deliver.
4. **The terminator card is structurally redundant.** The row already has a section header with a See-all link. The fifth card duplicates that affordance at the cost of one slot that could be a fifth real phenomenon.
5. **"Encyclopedia" is a leftover word.** Per `[slug].tsx` comments, phen pages are now "Reports tagged X." The encyclopedia framing was deprecated; the label wasn't.
6. **Four cards reads as a curation, not a list.** The operator's read is correct — at four items it feels like a hand-picked highlight reel, not a ranked surface of what's actually moving through the catalogue.

---

## 3. Panel debate

### Maya (Editorial)

KEEP: the *idea* that the catalogue can show you what it's been logging lately. That's a real editorial value.
DROP: "Top Phenomena Right Now." Every word does damage. "Top" is a Buzzfeed verb. "Right Now" is a cable-news lower-third. "Phenomena" is the only honest word and even it's load-bearing.
CHANGE: the title to something declarative and quiet. **"Most-tagged this month."** Or **"What the catalogue is logging."** The subtitle goes away — if the title is honest, the subtitle is redundant.

> Pushback on Sam: I'll cede "this month" only if it's actually computed on a 30-day window. If it's an all-time count we're calling "this month," I'd rather it just say "Most-tagged across Paradocs."

> Pushback on Jordan: I know "What the catalogue is logging" is editorially the strongest read, but I'll concede it's the kind of line that requires a confident product to ship. The safe default is "Most-tagged this month." Save the editorial high bar for v2.

Recommendation: rename to **"Most-tagged this month."** Drop the subtitle entirely. The row's content explains itself.

### Jordan (Product/UX)

KEEP: the row as a discovery affordance. The cluster-card panel established that horizontal scroll rows are how Paradocs surfaces non-feed editorial content; this row fits that pattern.
DROP: the terminator card. A horizontal-scroll row with a "go further" card at the end of it is a 2014 Netflix pattern; we have a See-all link in the header and that's the convention. One affordance, one place.
CHANGE: the number of cards from 4 to **8**. Four feels curated; eight feels like a list. Beyond eight the scroll gets tedious; eight is the right horizon for "give me a real sense of what's moving without sending me to the index."

> Pushback on Lena: I hear you on the cluster-card register but this row is in a different lane. The cluster card is a *noticing*; this row is *navigation*. Image-backed cards do real wayfinding work — a user recognizes "Ghost sightings" or "Bigfoot" faster from a photo than from a hairline-ruled text block. Don't strip what's working.

> Pushback on Maya: if we go to 8 cards the title matters more, not less. "Most-tagged this month" has to feel true at card 8, not just card 1. If position 8 has 23 reports and position 1 has 4,500, the list is structurally honest but optically embarrassing. Sam needs to confirm the curve.

Recommendation: 8 cards, no terminator, See-all in the header points to `/phenomena`, whole-card tap targets unchanged. Keep image-bg treatment.

### Lena (Design)

KEEP: image-bg cards for *this* row only — Jordan's wayfinding argument lands. A phenomenon has a visual identity (the iconic cryptid photo, the iconic UAP frame) and stripping it would slow recognition.
DROP: the category pill overlay where the image already encodes category. We are double-labeling. The pill goes only on no-image cards (where the colored gradient is doing the category work and a label is required).
CHANGE: the meta line under the title. "8533 reports" in muted gray is fine; do not add a rank numeral, do not add a delta indicator (+340 this week), do not add a flame, a pulse, an arrow, or any motion. Restraint vocabulary still applies: the card is allowed to *show* a photograph because the photograph is the subject; it is not allowed to *behave* like a leaderboard tile.

> Pushback on Jordan: 8 is fine. But the row needs to feel like a row, not a strip. Add the same hairline-bottom rule under the section header that we used on the cluster card panel — it signals "this is a content section" the same way it does there. Same vocabulary, different surface.

> Pushback on Sam: no rank number on the card. The position in the row *is* the rank. Printing "1." on the first card is the kind of leaderboard tell we banned in the standing system memo, and it imports the same casino UX.

Recommendation: keep image-bg, drop the pill on image cards, no rank numbers, no deltas, no motion. Section header gets a hairline bottom rule. Terminator card deleted.

### Sam (Data)

KEEP: report_count as the sort key. It's real, it's indexed, it's cheap, and the user can verify it on the card itself.
DROP: the implication that this is a *current* ranking. Right now the sort is almost certainly all-time `report_count` desc with a recency filter on the underlying reports — which is not the same as "trending." If we ship under the name "Top Right Now" we are claiming a temporal computation we don't perform.
CHANGE: the computation to a defensible 30-day window. **Phenomena ranked by count of reports tagged with that phenomenon in the trailing 30 days.** No decay function, no half-life — those are gameable and require tuning we haven't earned. Straight count, fixed window, recomputed nightly.

> Pushback on Maya: "this month" is colloquially fine but technically wrong — "trailing 30 days" is more honest. I'll accept "this month" in the title if the implementation actually is trailing-30. If the eng cost of trailing-30 is too high we can do calendar-month-to-date, but then the row reads differently on May 1 (almost empty) vs May 30 (full). Trailing-30 smooths that. Pick one and commit.

> Pushback on Jordan: 8 cards is the right ask but the data has a long tail. Position 8 might be 23 reports while position 1 is 4,500. That's not a bug, that's the shape of the catalogue — but the card has to display the count plainly so the user can calibrate. Don't hide the number to "make the row look balanced."

Recommendation: nightly job computes `phenomenon_id → count_tagged_last_30_days`, top 8 by that count get the row. Persist in `phenomenon_trending_30d` materialized view, refresh nightly at 3am UTC. Title says "Most-tagged this month" but the underlying query is `tagged_at >= now() - interval '30 days'`. One name in the UI; one defensible computation behind it.

---

## 4. Synthesised recommendation

### 4.1 Section header

- **Title:** "Most-tagged this month."
- **Subtitle:** removed.
- **See-all link:** kept, in the header, right side. Destination: `/phenomena` (not `#browse-categories`). Label: **"All phenomena ›"** (not "See all," not "Browse Encyclopedia").
- **Hairline rule:** 1px gray-800 bottom border on the header block, matching the cluster-card vocabulary.

### 4.2 Computation (Sam owns)

- Trailing 30 days, straight count of reports where `report.tagged_phenomena` contains the phenomenon.
- Recomputed nightly. Cached as a materialized view; cheap to read.
- No decay, no normalization, no weighting. Just count.
- Tie-break by all-time `report_count` desc, then by phenomenon name asc (deterministic).

### 4.3 Number of cards: 8

Four feels curated; sixteen feels exhaustive; eight is the honest middle. The row is meant to read as a real list of what's being tagged, not as a hand-picked highlight reel.

### 4.4 Card treatment

- **Image-bg cards stay** for this row. Wayfinding matters more here than register-purity (Jordan's argument, Lena conceded).
- **Drop the category pill overlay on image cards.** Image encodes category; the label is redundant.
- **Keep the pill on no-image cards** (the colored gradient fallback) — the gradient alone doesn't carry the category.
- **Meta line:** `8533 reports` in `text-gray-400`, tabular-nums. No rank numeral. No delta. No "+340 this week." No motion.
- **One-line summary** under the title stays, line-clamp-1, the witness-respectful summary the operator just shipped.

### 4.5 Terminator card: deleted

The fifth card was doing the same job as the See-all link, twice as loudly, while pointing to the wrong place. The header See-all is the single canonical "go to the full index" affordance for this row. The card slot is reclaimed for the 5th-of-8 phenomenon.

### 4.6 Label rewrites

| Current | Replaced with | Why |
|---|---|---|
| "Top Phenomena Right Now" | "Most-tagged this month." | Drop "Top" and "Right Now"; honest about the computation |
| "Most-tagged across recent reports" (subtitle) | *(removed)* | Title is now self-explanatory |
| "See all →" | "All phenomena ›" | Names the destination; matches the chevron convention from cluster card |
| "Browse Encyclopedia" | *(card deleted)* | The encyclopedia pivot deprecated this label; the affordance is redundant |
| "Every phenomenon" (subtitle on terminator) | *(card deleted)* | — |

The word **encyclopedia** is retired from this surface entirely. If we want a label for `/phenomena`, it is **"All phenomena"** — accurate to the page, post-pivot honest, and short enough to live in a chevron-affixed link.

### 4.7 Tier-1 fix (if we ship nothing else)

If the team can only spend an hour on this:

1. Change both `href="#browse-categories"` destinations (header See-all and terminator card) to `href="/phenomena"`.
2. Remove the `onClick` scroll-intercept on both.
3. Rename "Browse Encyclopedia" → "All phenomena."

That fixes the bug. Everything else in this memo is the larger redesign and can land in a follow-up week.

---

## 5. What we're NOT doing (and why)

- **Rank numerals (1, 2, 3…) on the cards.** Position in the row is the rank. Printing the number imports leaderboard UX and breaks the restraint vocabulary established by the cluster card and standing memos.
- **Count-delta indicators ("+340 this week," "▲ 12%").** Sam doesn't have the baseline math wired, and even when he does, week-over-week deltas in tag counts are too noisy at low N. We'd be lighting up tiles that drift up and down for statistical reasons no user cares about.
- **A "Trending" or "Hot" eyebrow on individual cards.** Same reason we killed the cluster card's "Trending Pattern" badge. Over-claims without defensible math; tabloid voice.
- **A flame icon, pulse animation, glow, or any motion on the row.** Banned by the cluster card panel; same vocabulary applies here.
- **Renaming the row "Phenomena Rising" / "What's Stirring" / "On the Radar."** Maya's veto. Every cute alternative imports a register Paradocs doesn't ship in.
- **A pagination control inside the row.** Eight cards is the horizon. Beyond eight, the affordance is the See-all link to `/phenomena`, which has Grid/List/search.
- **Keeping the terminator card "but fixing its link."** Two affordances doing the same job is the original sin. Delete it. The header link is the only canonical exit.
- **A recency-decay function** (e.g., `count * exp(-age/14d)`). Sam: requires tuning we haven't earned and obscures the computation from the user. Straight 30-day window is honest and explicable.
- **Per-phenomenon trend sparklines.** Off-brand and statistically thin at our N. Maybe v3 if Sam's distribution work surfaces something real.
- **A separate "Encyclopedia" surface.** It doesn't exist; the pivot retired it. `/phenomena` is the tag index. Don't bring the word back.

---

## Recommended path

**Tier-1 (1 hour):** Change both `href` destinations to `/phenomena`, rename the terminator card label to "All phenomena." Bug fixed. Ship today.

**Tier-2 (half day):** Delete the terminator card. Rename section header to "Most-tagged this month." Drop the subtitle. Add the hairline bottom rule. Bump the card count from 4 to 8. Drop the category pill on image-bg cards. Ship this week.

**Tier-3 (1-2 days, Sam):** Materialized view `phenomenon_trending_30d`, nightly refresh, swap the row's data source from the current query to the new view. Ship next week.

The row stops lying about what it computes; it starts earning its slot in the catalogue's voice.
