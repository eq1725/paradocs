# Sprint 1D — SSR FindingCard Fix v2 (V11.18.11)

## Tag
`V11.18.11`

## TL;DR
V11.18.10 added `getServerSideProps` + a mount `useEffect` to seed the SSR
FindingCard into `pendingSpecialCards.current`. The seed effect lost a
useEffect-ordering race against the feed-load effect, so the card stayed
stuck in the pending queue until a re-injection (swipe-back, scroll-to-
bottom, pull-to-refresh) fired. The founder's report was correct: the
FindingCard still appeared only on swipe-back.

V11.18.11 makes the seed **synchronous** by initializing `pendingSpecialCards.current`
in the `useRef` initializer itself. `useRef` initializers run during
render (before any `useEffect`), so the FindingCard is in the queue
**before** the first `loadFeed(0)` → `injectPendingSpecialCards()`
chain fires.

## Root cause (useEffect ordering)

```
V11.18.10 timeline on first paint:

  render #1
    -> useRef([]) for pendingSpecialCards.current      // empty
    -> useRef(initialFinding != null) for ssrFindingDelivered   // true
  commit
  useEffects fire in declaration order:
    1. feed-load effect  -> loadFeed(0)
                         -> setItems(15 items)
                         -> setState triggers re-render
    -> render #2
    -> injectPendingSpecialCards() runs with EMPTY queue   <-- BUG
    2. mount-seed effect -> pushes Finding into queue       <-- TOO LATE
```

Net effect: the Finding sat in `pendingSpecialCards.current` but never
got merged into `items`. The next `injectPendingSpecialCards()` call
(triggered by a subsequent `loadFeed()` — only happens on
swipe-to-bottom or pull-to-refresh) finally folded it in. That's why
the founder only saw it after swipe-back / scroll movement that
triggered more fetches.

## The fix (synchronous useRef init)

`useRef`'s initial-value expression evaluates during render, before any
`useEffect`. Seeding the queue there guarantees `injectPendingSpecialCards`
sees the Finding on the very first call.

### Before (V11.18.10, lines 613-638)
```tsx
// Pending special cards
var pendingSpecialCards = useRef<{ card: ExtendedFeedItem; position: number }[]>([])
var specialCardsInjected = useRef(false)

// V11.18.10 — Sprint 1D SSR fix. When `initialFinding` came from
// getServerSideProps, push it into the pending queue at mount time
// (BEFORE the first loadFeed(0) lands) and flip the
// `ssrFindingDelivered` ref so fetchSpecialCards() skips the client
// patterns/list fetch and we don't double-inject. The pull-to-refresh
// path resets the ref so the next session re-attempts SSR semantics
// via the client fetch (since pull-to-refresh doesn't re-run SSR).
var ssrFindingDelivered = useRef<boolean>(initialFinding != null)
var ssrFindingSeededRef = useRef(false)
useEffect(function () {
  if (typeof window !== 'undefined') {
    console.log('[Discover/SSR-finding]', {
      hasInitialFinding: !!initialFinding,
      slug: initialFinding && initialFinding.slug,
    })
  }
  if (ssrFindingSeededRef.current) return
  if (initialFinding) {
    ssrFindingSeededRef.current = true
    pendingSpecialCards.current.push({ card: initialFinding, position: 4 })
  }
}, [])
```

### After (V11.18.11)
```tsx
// Pending special cards
//
// V11.18.11 — Sprint 1D SSR fix v2. Seed the SSR-delivered FindingCard
// SYNCHRONOUSLY in the useRef initializer (not via a mount useEffect).
// V11.18.10 used a mount useEffect, but useEffects run AFTER the
// first commit — meaning the existing feed-load useEffect would fire
// loadFeed(0) -> setItems -> injectPendingSpecialCards with an empty
// queue, BEFORE the seed effect ran. The Finding got stuck in
// pendingSpecialCards.current and only appeared after a re-injection
// (swipe-back / scroll-to-bottom). useRef initializers run during
// render, before any useEffect, so the queue is populated before
// the first loadFeed completes.
var pendingSpecialCards = useRef<{ card: ExtendedFeedItem; position: number }[]>(
  initialFinding ? [{ card: initialFinding, position: 4 }] : []
)
var specialCardsInjected = useRef(false)

// `ssrFindingDelivered` flips fetchSpecialCards() into skip-client-fetch
// mode so we don't double-inject. The pull-to-refresh / lens-change /
// category-change paths reset the ref so the next session re-attempts
// via the client fetch (those paths don't re-run getServerSideProps).
var ssrFindingDelivered = useRef<boolean>(initialFinding != null)

// Diagnostic log only — moved from V11.18.10's mount-seed useEffect.
// No seeding logic here; that's now synchronous above.
useEffect(function () {
  if (typeof window !== 'undefined') {
    console.log('[Discover/SSR-finding]', {
      hasInitialFinding: !!initialFinding,
      slug: initialFinding && initialFinding.slug,
    })
  }
}, [])
```

### Why this preserves the resets
`handleLensChange`, `handleCategoryChange`, and the pull-to-refresh
handler all do:
```tsx
pendingSpecialCards.current = []
ssrFindingDelivered.current = false
```
After the reset, the FindingCard is gone from the queue (correct — those
flows don't re-run SSR), and the client `fetchSpecialCards()` runs as
normal (because `ssrFindingDelivered.current` is false). No change to
those paths.

## Pre-commit verification

1. `npx tsc --noEmit` — clean for `src/pages/discover.tsx` (pre-existing
   errors in unrelated `scripts/*.ts` and `LogToConstellation.tsx` are
   not introduced by this change).
2. Hard-reload `/discover` in incognito:
   - First paint: feed loads, no swipe action taken.
   - DevTools console:
     - `[Discover/SSR-finding] {hasInitialFinding: true, slug: ...}` fires once.
     - `[FindingCard render]` fires for idx 4 **before** the user swipes there
       (because injectPendingSpecialCards now sees the queue immediately).
   - Swipe forward 4 cards — FindingCard appears at idx 4 with no swipe-back required.
3. Spot-check other special-card injections (LabPromo, OnThisDate,
   Cluster) still appear after their respective fetches resolve — these
   flow through `fetchSpecialCards()` unchanged.
4. Pull-to-refresh → confirm FindingCard reappears via the client-fetch
   safety net (since `ssrFindingDelivered` was reset to false).

## Operator commit

```bash
cd /Users/chase/paradocs
git add src/pages/discover.tsx docs/SPRINT_1D_SSR_FIX_V2.md
git commit -m "V11.18.11: Synchronous useRef init for SSR FindingCard (fix useEffect race)"
git tag V11.18.11
git push && git push --tags
```

## Files changed
- `src/pages/discover.tsx` — lines ~613-643 (pendingSpecialCards init +
  log-only useEffect; mount-seed effect deleted)
- `docs/SPRINT_1D_SSR_FIX_V2.md` — this runbook

## Uncertainty / risk notes
- Low risk. The change is contained to two refs and removes a single
  useEffect. The reset paths (lens / category / pull-to-refresh) were
  already correct and are untouched.
- The `ssrFindingDelivered` ref still initializes synchronously off
  `initialFinding != null`, so `fetchSpecialCards()`'s skip-client-fetch
  branch (lines 908-931) fires on the same first render — no
  double-injection risk.
- `FindingFeedItem` is already a member of the `ExtendedFeedItem`
  union, so no type cast is needed at the seed site.
