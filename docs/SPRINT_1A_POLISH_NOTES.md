# Sprint 1A Polish — V11.18.2

**Date:** 2026-06-09
**Branch:** uncommitted (operator commits locally)
**Scope:** One real bug fix + two visual/copy redesigns flagged in the
post-V11.18.1 founder pass. No DB migration; no AI spend (everything is
pure layout/copy).

---

## 1. Bug fix — LabPromo position clamping

### Symptom

Founder reported (post-V11.18.1 deploy) that the four `research_hub`
promos targeted at positions `9 / 21 / 33 / 45` (cadence=12,
`PROMO_SESSION_PLACEMENTS=4`) were appearing **back-to-back-to-back at
the tail of page 1** instead of interleaving as the user scrolled.

### Root cause

`fetchSpecialCards()` in `src/pages/discover.tsx` injected ALL pending
promos on the initial feed load using `Math.min(entry.position, arr.length)`.
Because the initial feed page returns ~12 items, three of the four
promos (positions 21, 33, 45) were all clamped to `arr.length` (~12)
and spliced in adjacent indices, producing the stack.

Additionally, `specialCardsInjected.current = true` was being flipped
unconditionally after the first injection, so subsequent `loadMore`
paginations never had a chance to insert the deferred promos.

### Fix

Extracted the injection into a shared `injectPendingSpecialCards()`
routine. The new behavior:

- Inserts ONLY entries whose `entry.position <= arr.length` (deferred
  ones stay in `pendingSpecialCards.current`).
- `specialCardsInjected.current` flips to `true` only when the pending
  list drains to zero in the splice path (never in the early-return on
  an empty list — that would race with the initial Promise.all).
- `loadFeed()` calls `injectPendingSpecialCards()` on every paginated
  page (`offset > 0`), giving each subsequent page a chance to absorb
  the next deferred promo.

### Before / after pseudocode

**Before:**

```typescript
pendingSpecialCards.current.forEach(function (entry) {
  var insertAt = Math.min(entry.position, arr.length)   // <— clamp bug
  arr.splice(insertAt, 0, entry.card)
})
specialCardsInjected.current = true                      // <— premature
```

**After:**

```typescript
function injectPendingSpecialCards() {
  if (pendingSpecialCards.current.length === 0) return
  setItems(function (prev) {
    var arr = prev.slice()
    var remaining = []
    pendingSpecialCards.current.forEach(function (entry) {
      if (entry.position <= arr.length) {
        arr.splice(entry.position, 0, entry.card)
      } else {
        remaining.push(entry)
      }
    })
    pendingSpecialCards.current = remaining
    specialCardsInjected.current = (remaining.length === 0)
    return arr
  })
}

// loadFeed:
if (offset === 0) fetchSpecialCards()
else              injectPendingSpecialCards()
```

### Expected outcome (operator spot-check)

With cadence=12 and 4 placements, the user should see promo cards land
at indices 9, 21, 33, 45 as they scroll past those positions on the
respective pagination pages — never three in a row at the tail of any
single page.

---

## 2. FindingCard — visual + copy redesign

### File

`src/components/patterns/FindingCard.tsx` (overwritten).

### Goal

Founder feedback: cards were reading database-y. "We want users to see
these patterns and findings and go 'woah'." References named:
Spotify Wrapped (hero stat treatment), NYT data illustration cards
(headline + single key number + small citation), Pudding.cool editorial
restraint, Stripe annual report austerity.

### Copy fixes (rendered at render-time — no migration needed)

| Field (DB / pre-V11.18.2) | Renders as (V11.18.2) |
|---|---|
| `eyebrow_type: cross_cutting_descriptor` -> "Cross-Cutting Descriptor" | "Across Phenomena" |
| `eyebrow_type: temporal` -> "Temporal Cluster" | "A Temporal Pattern" |
| `eyebrow_type: geographic` -> "Geographic Cluster" | "A Geographic Pattern" |
| `eyebrow_type: witness_pattern` -> "Witness Pattern" | "A Witness Pattern" |
| `eyebrow_type: source_overlap` -> "Source Overlap" | "A Source Overlap" |
| `eyebrow_type: sub_family_distribution` -> "Sub-Family Distribution" | "Within a Phenomenon" |
| `family_label: "UFO"` | "UFO Sightings" |
| `family_label: "haunting"` | "Hauntings" |
| `family_label: "perception-sensory"` | "Sleep Paralysis & Perception" |
| `family_label: "cryptid"` | "Cryptid Encounters" |
| `family_label: "psychological"` | "Near-Death & Psychological" |
| `family_label: "consciousness"` | "Consciousness Practices" |
| `family_label: "psychic"` | "Psychic Phenomena" |
| `family_label: "esoteric"` | "Esoteric Practices" |
| `family_label: "religion/mythology"` | "Religion & Mythology" |
| `denominator_n_label: "Across 142,116 accounts in three phen families."` | "Across 142,116 documented accounts." |
| Footer: "From the catalogue · 142,116 accounts" | Footer: "Paradocs Archive │ 142,116 accounts" (with hairline vertical rule) |

Both the eyebrow + family-label maps are defensive (slug-key first,
label-key second, raw fallback last) — so future seeds emitting either
slug form will render correctly, and we never blank-render.

### Visual moves (per variant)

**Shared:**
- Eyebrow restyled — small-caps, kerned `tracking-[0.22em]`, hairline-
  underlined (no filled pill background). Reads as a section label, not
  a tag.
- New `HeroStat` block — the LARGEST family % is rendered at 40-64px in
  the brand purple `#9000F0` using `font-display` (Changa), with the
  family label + (N / total) in the right gutter at 12-13px.
- Secondary families render as `CategoryBar` rows with thin (`h-[3px]`)
  hairline-bordered bars and right-aligned tabular-nums percentages.
  Secondary bars use a muted purple gradient so the hero reads as the
  primary stat.
- New `FooterCitation` — "Paradocs Archive" wordmark (small-caps,
  kerned) + thin vertical rule + tabular `NNN,NNN accounts`.
- Headline upsized to 20-32px depending on variant, all `font-display`
  (Changa) with tight tracking.

**`rail` variant** (PatternsRail on /lab + horizontal rails):
- Width bumped to 300/324px, min-height 400px (was 280/320 / 360 — gave
  the hero stat the breathing room it needed).
- Hero stat treatment, secondaries muted beneath.
- Footer citation + "See reports" link side-by-side at the bottom.

**`grid` variant** (`/lab/patterns` page):
- Wider per-cell layout. All three family bars visible (no hero — when
  the card has full width the bar treatment IS the visual hook), but
  the largest is sorted first and rendered unmuted so the eye lands
  there.
- Headline 24-28px, body copy slightly larger (13.5-14.5px) since the
  cell can afford more text density.
- Same footer citation pattern.

**`today_card` variant** (vertical full-bleed swipe card on /discover):
- Hero stat is now at 56-64px (Spotify Wrapped scale) since this is the
  variant the user can screenshot from the feed.
- Headline 26-32px, tight tracking, max-width 24ch for editorial line
  length.
- Hairline brand-purple top + bottom edges retained from V11.18.1
  (distinguishes from report cards in the feed); left rail dropped
  from 4px solid to 1px translucent — felt heavy at the new headline
  scale.

### Documentary register guardrails

- Zero emoji.
- Zero exclamation marks.
- No second-person voice in the corpus body (only inside
  `PersonalizedOverlay`, which is by-spec — V2 §2.3).
- No playful gradients; the only gradients are functional bar fills,
  always purple-on-purple.
- No line illustrations / icons above the headline (deferred — the
  brief listed it as optional, "skip if it doesn't land cleanly". The
  hero numeric stat is doing the visual heavy lifting already).

---

## 3. CorpusStatEyebrow — polish

### File

`src/components/common/CorpusStatEyebrow.tsx` (overwritten).

### Before

Plain centered text strip, single line, `text-gray-500`:
"Across 200,000+ catalogued accounts. — Paradocs Archive"

### After

Two-column hairline-divided strip (stacks vertically below `sm:`):

```
[ 237,000+ catalogued accounts ]  │  [ PARADOCS ARCHIVE · last updated June 2026 ]
```

Concrete moves:

1. **Typography.** Primary column uses small-caps, kerned
   `tracking-[0.18em]`, ~11-12px on the bold prefix; secondary is
   slightly tighter `tracking-[0.16em]`, ~10-10.5px.
2. **Color hierarchy.** Primary number on `#d4d4d0` (off-white);
   secondary on `#8a8a85` (muted gray); the "catalogued accounts"
   label sits at `#a8a8a3` between the two.
3. **Hairline vertical rule.** 1px × 12px translucent white between
   the two columns at `sm:` and up. Stacks vertically below `sm`.
4. **Container border.** Replaced the previous `bg-white/[0.06]`
   bottom hairline with a brand-purple `rgba(144,0,240,0.18)` bottom
   border. Subtle — reads as intentional, not decorative.
5. **Whole strip is now a `<Link href="/sources">`.** Tap takes the
   user to the Sources & Methodology page shipped in Copyright Sprint
   1 — trust payoff per the cross-surface coherence audit.
6. **Last-updated freshness.** Renders the new optional
   `last_updated` field from `/api/public/stats` when present; falls
   back to `"June 2026"` (deliberately month-precision so we don't
   fake daily freshness on a slow ingest day).

Mobile-first: stacks at `<sm:` (375px target), side-by-side from
`sm:` (640px) upward.

### Possible follow-up (not done here)

`/api/public/stats` should be extended to return `last_updated` — a
single ISO-8601 month string ("2026-06") computed from the latest
`reports.created_at`. Currently the component falls back to the
hardcoded `FALLBACK_UPDATED`. This is a 10-line API change but out of
scope for the polish pass; track separately if the operator wants live
freshness.

---

## 4. Operator commit + spot-check sequence

### Commit

The operator commits locally. Suggested grouping (single commit OK,
or split as below):

```
git add src/pages/discover.tsx \
        src/components/patterns/FindingCard.tsx \
        src/components/common/CorpusStatEyebrow.tsx \
        docs/SPRINT_1A_POLISH_NOTES.md
git commit -m "V11.18.2 — Sprint 1A polish: promo clamping fix + FindingCard + eyebrow redesign"
git push origin main
```

### Pre-deploy verification (post-Vercel preview)

1. **Bug fix** (mobile, /discover):
   - Open the preview on a non-Pro account (or clear `localStorage`).
   - Swipe through 50+ cards. Promo cards should appear roughly every
     12 swipes (positions ~9, 21, 33, 45), NEVER two in a row.
   - Open the React DevTools console: `pendingSpecialCards.current`
     should shrink as you scroll, not stay at 3-4.

2. **FindingCard `today_card`** (mobile /discover, position 4):
   - Card should show: small-caps eyebrow → big serif headline → giant
     purple % hero (the largest family) → two muted bar rows for the
     secondaries → italic denominator caption → interpretive sentence
     → "Paradocs Archive │ NNN accounts" footer.
   - Family labels render as "Hauntings", "UFO Sightings",
     "Sleep Paralysis & Perception" — NEVER "haunting", "UFO",
     "perception-sensory".

3. **FindingCard `rail`** (mobile /lab — PatternsRail):
   - Narrower, hero stat present, secondaries muted, footer hairline-
     divided.

4. **FindingCard `grid`** (desktop `/lab/patterns`):
   - Three bars all visible (sorted largest-first, largest unmuted),
     full-width headline at 28px.

5. **CorpusStatEyebrow** (mobile + desktop, all three pages /discover,
   /explore, /lab):
   - Desktop: side-by-side, hairline vertical rule visible.
   - Mobile (375px): stacks vertically, no horizontal scroll.
   - Tapping the strip routes to `/sources` (Sources & Methodology).

### Typecheck

`npx tsc --noEmit -p .` — clean on the three edited files (one
pre-existing unrelated error in `src/pages/api/og/discover.tsx`
re: `@vercel/og` was present before this change and is untouched).

---

## 5. Open questions for founder

1. **Hero variant selection rule.** Currently `pickHero()` returns the
   single largest-% family. For Findings where all three families are
   roughly equal (e.g. 35% / 33% / 32%), the hero treatment may feel
   arbitrary. Worth considering a min-delta threshold (e.g. only hero-
   ize when the top is >5pp above the second) and falling back to the
   three-bar layout otherwise.
2. **Eyebrow copy.** The map uses "Across Phenomena" / "A Temporal
   Pattern" / "Within a Phenomenon". Founder may prefer "The Pattern"
   for cross_cutting_descriptor as a single-source-of-voice label; the
   per-variant map gives more nuance but adds vocabulary surface.
3. **Family-label map source-of-truth.** Render-time map duplicates a
   small slice of `humanizeFamily()` in `data-query-executor.ts`. The
   cleaner architecture is to push these labels into the seed pipeline
   and the catalogue itself (Sprint 1B item). For now, the render-time
   map is the fix that ships without a migration.
4. **`last_updated` API field.** Eyebrow falls back to a hardcoded
   "June 2026" until `/api/public/stats` is extended. Operator call:
   ship as-is and add the field separately, or roll the API change
   into V11.18.2.
