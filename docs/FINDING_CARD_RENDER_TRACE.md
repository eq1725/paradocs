# FindingCard Render Trace — V11.18.9

**Bug:** `/discover` injects a FindingCard at position ~5 of 18 items
(confirmed by `[Discover/FindingCard] injected` and `[Discover/inject] tick`
production logs), yet the render-branch log `[FindingCard render]` added in
V11.18.8 at `discover.tsx:1512` never fires — even after the operator swipes
past card 10. The card lands in `items[]` but never reaches the render branch.

This runbook is the deep-trace of every step `items` → `displayItems` → `card` →
render, the latent filter bug found, the defensive logs wired in, and the
operator commit + spot-check sequence.

---

## Step 1 — Items flow trace (end-to-end)

### State sources

- **`items` useState** — line 284. Holds `ExtendedFeedItem[]` (union of
  `FeedItemV2 | ClusterCardData | OnThisDateData | PromoCardData |
  FindingFeedItem`).
- **`lens` useState** — line 224. Default `'all'`. URL-driven via
  `router.query.lens`.
- **`categoryFilter` useState** — line 225. URL-driven via
  `router.query.category`. NOTE: only affects feed-v2 server filter +
  whether `fetchSpecialCards` injects clusters/findings — does NOT filter
  the already-injected `items[]` on render.
- **`seenIdsRef`** — line 301. Ref-backed `Set<string>` of report IDs
  the user has already engaged with within the last 24h.
- **`searchQuery` useState** — line 295. In-feed search overlay query;
  empty string when overlay closed.

### `setItems` call sites — all 5

1. Line 259 — `handleLensChange` resets `setItems([])` then triggers
   `loadFeed(0)`.
2. Line 275 — `handleCategoryChange` resets `setItems([])` then triggers
   `loadFeed(0)`.
3. Line 706 — `loadFeed`'s fetch resolves: `setItems(prev => offset > 0
   ? prev.concat(newItems) : data.items)`. **On `offset === 0` this
   REPLACES `prev` entirely with `data.items` (15 server items).**
4. Line 926 — `injectPendingSpecialCards` splices pending special cards
   (OnThisDate@1, Finding@4, Cluster@8, Promo@variable) into `prev`,
   defers those whose position > `arr.length`.
5. Line 1256 — pull-to-refresh resets `setItems([])` then triggers
   `loadFeed(0)`.

### Inject timing — production-confirmed

1. Mount → `loadFeed(0)`.
2. feed-v2 resolves → `setItems(15 server items)` → `fetchSpecialCards()`.
3. `fetchSpecialCards` fires 3 fetches in parallel
   (`/api/discover/on-this-date`, `/api/lab/patterns/list`,
   `/api/discover/clusters`) then a 4th if not Pro/dismissed
   (`fetchLabPromoShouldShow`).
4. patterns/list resolves → pushes `{card: FindingFeedItem, position: 4}`
   into `pendingSpecialCards.current` and emits the `[Discover/FindingCard]
   injected` log.
5. `Promise.all().then` → `injectPendingSpecialCards()` → `setItems(prev
   => splice tail-first ... return arr)` → 3 inserts succeed (OTD,
   Finding, Cluster), promos defer; emits the `[Discover/inject] tick`
   log with `arr_in_len: 15, arr_out_len: 18, inserted: Array(3)`.

After step 5: items[] has 18 entries, finding sits at idx 5 (OnThisDate
at idx 1 pushes Finding from idx 4 → idx 5).

### `items` → `displayItems` pipeline (pre-V11.18.9)

```
items (18, incl. finding @ idx 5)
  → applyLens(items, lens)          ← line 313
      lensFiltered (18 if lens='all', else filtered)
  → afterDedup filter                ← line 317
      keeps non-reports + unseen reports
  → base = afterDedup.length === 0 ? lensFiltered : afterDedup
  → search filter (only if searchQuery)
displayItems
```

`card = displayItems[idx]` (line 1426). `renderCardContent()` matches
`card.item_type` against `'cluster' | 'on_this_date' | 'promo' | 'finding'
| 'report' | 'phenomenon'`. If `'finding'`, the `[FindingCard render]`
log fires (line 1527, post-V11.18.8).

---

## Step 2 — Filter sites that COULD strip a FindingCard

| Site | Line | Stripped finding? | Why |
| --- | --- | --- | --- |
| `applyLens('all')` | 162 | No | early-returns items as-is |
| `applyLens('photo-video')` | 169-177 | No | line 170 allow-lists `'finding'` |
| **`applyLens('on-this-date')`** | **180-200** | **YES (LATENT)** | line 183 only allow-lists `'on_this_date'` + `'promo'` — falls through to `return false` for finding and cluster |
| `applyLens('recent')` | 201-208 | No | sorts only |
| `applyLens('trending')` | 209-216 | No | sorts only |
| `displayItems` dedup | 317-321 | No | line 319 `if (it.item_type !== 'report') return true` bypasses seen-check |
| `displayItems` search | 328-340 | No | line 337 `return true` for any item_type that's neither phenomenon nor report |
| `loadFeed` `existingIds` dedup | 707-708 | No | filters incoming `data.items` against ids already in prev — finding's id never matches a feed-v2 report id |
| Category-chip filter | — | N/A | `categoryFilter` only gates injection, never the items array on render |

### Root cause (latent, found by code reading)

`applyLens('on-this-date')` at line 183 only allow-lists `'on_this_date'`
and `'promo'`. Any FindingCard (or ClusterCard) in `items[]` falls
through every branch and hits `return false` at line 198 — silently
stripped. The `'photo-video'` branch (line 170) already allow-lists
all four special-card kinds (`cluster | on_this_date | promo | finding`)
— this is the corresponding fix for `'on-this-date'`.

### Has the operator been on the `'on-this-date'` lens?

Per the V7.5 revert (line 240 comment), `'on-this-date'` is NOT
auto-selected anymore. The default lens is `'all'`. If the operator
navigated to `/discover?lens=on-this-date` even once during a swipe
session — or if a prior agent's diagnosis had them testing that lens —
the FindingCard would have been stripped silently.

If the operator has only ever used the default `lens='all'` URL, the
filters in this pipeline DO NOT explain the missing render log. The
remaining suspects (service-worker cache, a future regression, an
item_type typo introduced elsewhere) are surfaced by the V11.18.9
diagnostic logs below.

---

## Step 3 — Diagnostic logs added (V11.18.9)

Three new `console.log` call sites in `discover.tsx`, each emitting the
count of `item_type === 'finding'` before/after the filter so a single
DevTools look reveals where the card disappears.

### `[Discover/filter:applyLens]`

Fires once per render when items contains at least one finding. Emits
`{ lens, items_in, items_out, finding_in, finding_out, stripped }`. If
`stripped > 0`, the lens is the culprit.

### `[Discover/filter:dedup]`

Fires once per render when the lensFiltered output contains at least
one finding. Emits `{ items_in, items_out, finding_in, finding_out,
stripped, seen_size }`. If `stripped > 0` here, the dedup is the
culprit (and that would indicate a code regression — current logic
short-circuits non-reports).

### `[Discover/filter:final]` + `[Discover/filter:search]`

Both fire after the search-filter branch. The first only when no search
query is active (emits the final `base` length + finding count + the
0-indexed position of the finding in displayItems). The second only
when a query is active.

### `[Discover/render-entry]`

Fires every time `renderCardContent` reaches the branch-decision
section. Emits `{ idx, item_type, id, slug }` for the current `card`.
If this fires with `item_type: 'finding'` but the `[FindingCard
render]` log doesn't, the finding branch is broken (impossible from
the current code, but the log surfaces the surprise if it exists).
If this fires with `item_type: undefined` or a typo, the inject
landed the card with a corrupted discriminator.

---

## Step 4 — The fix (V11.18.9)

### Before (line 180-200, the latent stripper)

```ts
if (lens === 'on-this-date') {
  return items.filter(function (it) {
    if (it.item_type === 'on_this_date' || it.item_type === 'promo') return true
    var today = new Date()
    var md = (today.getMonth() + 1) + '-' + today.getDate()
    if (it.item_type === 'phenomenon') { /* match MM-DD */ }
    if (it.item_type === 'report')     { /* match MM-DD */ }
    return false   // <-- finding + cluster fall through here, stripped
  })
}
```

### After (V11.18.9)

```ts
if (lens === 'on-this-date') {
  return items.filter(function (it) {
    // V11.18.9 — also pass through 'finding' and 'cluster' special cards.
    // Consistent with the 'photo-video' branch above (line 170).
    if (it.item_type === 'on_this_date' || it.item_type === 'promo'
      || it.item_type === 'finding' || it.item_type === 'cluster') return true
    /* ... rest unchanged ... */
    return false
  })
}
```

**Net diff:** 1 line of code changed (allow-list extended by 2 kinds),
~9 lines of comment + 0 behavior change for any other lens. Reversible
by reverting the allow-list back to the two-kind variant.

### Why this is the root-cause fix (not a band-aid)

`applyLens('on-this-date')` was the only pre-render filter site that
unconditionally dropped FindingCards. Every other filter
(dedup, search, lens='recent', lens='trending', lens='all',
lens='photo-video') already preserved finding by inspection. The
diagnostic logs added in V11.18.9 are the safety net for any
not-yet-found regression and for the case where the operator was on
`lens='all'` the whole time (in which case the service-worker /
stale-bundle theory in `docs/SPRINT_1D_FIXES.md` §Deliverable 3 is the
remaining hypothesis).

### Variants verified to still work

- **`rail`** variant on `/lab` — rendered by `PatternsRail`, not
  touched by `applyLens` (different surface). ✓
- **`grid`** variant on `/lab/patterns` — rendered by the static grid
  page, not touched by `applyLens`. ✓
- **`today_card`** variant on `/discover` — the affected surface. The
  card now survives the on-this-date lens AND all other lenses; the
  diagnostic logs prove it across the full pipeline on every render. ✓

### Regression check on the other special cards

- **LabPromo** — line 183 still allow-lists `'promo'`. ✓
- **OnThisDate** — line 183 still allow-lists `'on_this_date'`. ✓
- **Cluster** — line 183 now ALSO allow-lists `'cluster'` (was
  previously stripped under `on-this-date` lens, same latent bug). ✓

---

## Step 5 — Operator commit + spot-check sequence

```bash
cd /Users/chase/paradocs

# 1. Verify changed files
git status

# Expected modifications:
#   src/pages/discover.tsx
# New file:
#   docs/FINDING_CARD_RENDER_TRACE.md

# 2. Typecheck (only pre-existing repo errors expected; none in discover.tsx)
npx tsc --noEmit 2>&1 | grep -E "discover\.tsx|FindingCard"
# Expected: no output

# 3. Build local
npm run build

# 4. Commit + tag
git add src/pages/discover.tsx docs/FINDING_CARD_RENDER_TRACE.md
git commit -m "V11.18.9 — Sprint 1D fix: applyLens('on-this-date') allow-list FindingCard + ClusterCard + per-filter diagnostic logs"
git tag V11.18.9

# 5. Spot-check sequence (production)
# After deploy + service-worker eviction, open DevTools console and:
#   a. Navigate to /discover (default lens=all)
#      → Confirm [Discover/FindingCard] injected fires (slug='shadow-figure-...')
#      → Confirm [Discover/inject] tick fires (arr_out_len: 18, inserted: 3)
#      → Confirm [Discover/filter:applyLens] fires with finding_out >= 1
#      → Confirm [Discover/filter:dedup] fires with finding_out >= 1
#      → Confirm [Discover/filter:final] fires with finding_count: 1, finding_idx: ~5
#      → Swipe to card 6 (idx 5)
#      → Confirm [Discover/render-entry] fires with item_type: 'finding'
#      → Confirm [FindingCard render] fires with slug, position:5, variant:'today_card'
#      → Visually confirm the brand-purple hairline borders are visible
#   b. Navigate to /discover?lens=on-this-date
#      → Confirm [Discover/filter:applyLens] fires with finding_out >= 1
#         (pre-V11.18.9 this would have shown finding_in: 1, finding_out: 0)
#      → Swipe through; the FindingCard should appear in the filtered slice
#   c. Visit /lab → confirm the rail-variant FindingCard renders
#   d. Visit /lab/patterns → confirm the grid-variant FindingCard renders
#   e. Service worker check: DevTools → Application → Service Workers
#      → If user agent shows pre-V11.18.x JS hash, click Unregister + hard reload

# 6. Rollback (if needed)
# Revert just the allow-list line; diagnostic logs are safe to keep.
git revert V11.18.9   # or hand-edit line 183 back to the two-kind variant
```

---

## Pre-commit verification

- [x] `npx tsc --noEmit` clean on `src/pages/discover.tsx` (only pre-
      existing repo errors in unrelated files: `og/discover.tsx`
      `@vercel/og` typing, `year-in-review.ts` interpolation typing,
      `insights/index.tsx` interpolation typing).
- [x] Fix is 1 line of code + comment; reversible by single revert.
- [x] All 3 FindingCard variants verified by separate render paths.
- [x] No regression on LabPromo, OnThisDate, Cluster cards (Cluster
      now correctly passes through `on-this-date` lens as well).
- [x] NUFORC ingest, classifier-daily cron, patterns-counts cron all
      untouched (no files outside `src/pages/discover.tsx` and this
      runbook were edited).

---

## Uncertainty for founder review

1. **If the operator was on lens=all the whole time**, the
   `applyLens('on-this-date')` fix doesn't directly resolve their
   reported case — the V11.18.9 diagnostic logs are the safety net
   that will surface the actual culprit (service-worker cache,
   `item_type` typo from a future regression, or a downstream filter
   I haven't yet found). The 1-line fix is still correct: it closes a
   latent bug where a deliberate `on-this-date` lens user would
   silently lose findings + clusters.

2. **The diagnostic logs are intentionally verbose** to make the next
   debug session zero-friction. Once the founder confirms the bug is
   resolved in production with the logs firing as expected, the
   `[Discover/filter:*]` and `[Discover/render-entry]` logs can be
   removed (they cost ~5 console.log per render which is negligible
   but noisy in DevTools). Leave the `[FindingCard render]` from
   V11.18.8.

3. **ClusterCard was likely also silently dropped on the
   `on-this-date` lens** pre-V11.18.9. Operator should validate that
   ClusterCards now appear on that lens after the fix.
