# FindingCard / OnThisDate / ClusterCard SSR-Bake Fix (V11.18.14)

Operator runbook for the chronic special-card visibility bug on `/discover`.

## TL;DR

Forward-swiping through `/discover` would skip past the FindingCard at
index 4-5 and the OnThisDateCard at index 1; cards only surfaced after
the user swiped *backward*. V11.18.14 fixes it by SSR-baking both cards
into the very first `setItems()` call, so the TikTok-grammar swipe
component's snap-points are computed once from the complete array.

LabPromo placements stay client-side (they need session + tier
decisions that can only run after mount).

ClusterCard remains injected via `fetchSpecialCards()` per the V11.18.13
data-flow constraint, untouched by this patch.

---

## Architectural diagnosis — snap-point staleness

The swipe component on `/discover` calculates its snap-points from the
initial `items[]` array passed to it. Up through V11.18.13 the initial
array was 15 base report cards from `feed-v2`; special cards (Finding /
OnThisDate / LabPromo) were async-injected via
`pendingSpecialCards.current` + `injectPendingSpecialCards()` *after*
first paint.

That async injection mutated `items[]` to length 17+, but the swipe
component's snap-points were STALE — they had been computed from the
length-15 layout. A forward-only swipe would jump past where the
special cards now lived; the cards only became visible when the user
swiped backward and the component re-evaluated positions.

V11.18.11 made the SSR Finding land in `pendingSpecialCards.current`
synchronously via a `useRef` initializer. That fixed the queue-empty
race but did NOT fix snap-point staleness — the splice still happened
in a *second* `setItems()` call after the base feed setState had
already committed.

## The fix

Bake the SSR special cards into the items array *inside the same
setItems call* that handles the base feed. One render = one snap-point
calculation = correct positions on first forward pass.

```
BEFORE (V11.18.13)                AFTER (V11.18.14)
====================              ====================
setItems(data.items)              merged = [...data.items]
   |                                splice(4, 0, finding)
   |                                splice(1, 0, otd)
fetchSpecialCards()               setItems(merged)         <-- ONE call
   .then(Promise.all)             fetchSpecialCards()        with the
   .then(injectPending...)            // LabPromo only       complete
       setItems(prev => [          .then(injectPending..)    array.
         splice(prev,                  // LabPromo only
                otd, position 1)
         splice(prev,
                finding, pos 4)
       ])                          [snap-points are stale ONLY
                                    for LabPromo positions, which
[snap-points are stale because       LabPromo never needs first-paint
 array grew between renders]         visibility anyway]
```

## items[] mutation pattern — before/after pseudocode

```typescript
// BEFORE — discover.tsx loadFeed(0) + injectPendingSpecialCards()
setItems(data.items)                    // length 15, snap points fixed here
fetchSpecialCards()
  .then(Promise.all([otd, finding, cluster, promo]))
  .then(() => injectPendingSpecialCards())
    setItems(prev => {                  // length 15 -> 18, snap points NOT recomputed
      const arr = prev.slice()
      arr.splice(promoPos, 0, promo)
      arr.splice(8, 0, cluster)
      arr.splice(4, 0, finding)
      arr.splice(1, 0, otd)
      return arr
    })

// AFTER — V11.18.14 loadFeed(0)
const merged = [...data.items]
const bakeSpecials = []
if (ssrOnThisDateDelivered && initialOnThisDate && !categoryFilter)
  bakeSpecials.push({ card: initialOnThisDate, position: 1 })
if (ssrFindingDelivered && initialFinding && !categoryFilter)
  bakeSpecials.push({ card: initialFinding, position: 4 })
bakeSpecials.sort((a, b) => b.position - a.position)   // DESC, tail-first splice
bakeSpecials.forEach(s => {
  merged.splice(Math.min(s.position, merged.length), 0, s.card)
})
setItems(merged)                                       // length 17, ONE call
fetchSpecialCards()                                    // ONLY LabPromo branch fires
```

## OnThisDate SSR fetch implementation

`getServerSideProps` in `src/pages/discover.tsx` now does an
internal HTTP fetch to the existing on-this-date endpoint:

```typescript
var base = process.env.NEXT_PUBLIC_SITE_URL || (
  ctx.req.headers.host
    ? (ctx.req.headers['x-forwarded-proto'] === 'https' ? 'https://' : 'http://') + ctx.req.headers.host
    : 'https://beta.discoverparadocs.com'
)
var otdRes = await fetch(base + '/api/discover/on-this-date')
if (otdRes && otdRes.ok) {
  var otdData = await otdRes.json()
  if (otdData && Array.isArray(otdData.items) && otdData.items.length > 0) {
    initialOnThisDate = otdData.items[0]
  }
}
```

We reuse the endpoint rather than duplicate the AI-text-date parsing
logic. On failure or empty result, `initialOnThisDate = null` and the
client fetch path in `fetchSpecialCards()` fires as the safety net
(behavior preserved from pre-V11.18.14).

## Client-side injection — what's still firing, what got disabled

| Card           | Pre-V11.18.14                          | V11.18.14                                                |
| -------------- | -------------------------------------- | -------------------------------------------------------- |
| FindingCard    | SSR seed via `pendingSpecialCards`     | SSR-baked into `setItems(merged)` directly               |
| OnThisDateCard | Client fetch `/api/discover/on-this-date` | SSR pre-fetched in `getServerSideProps`, baked into items |
| ClusterCard    | Client fetch `/api/discover/clusters`  | Unchanged (V11.18.13 data flow preserved)                |
| LabPromo       | Client fetch `/api/lab/promo/should-show` | Unchanged (needs tier + session — must stay client-side) |

The client-side `fetchSpecialCards()` branches for OnThisDate and
Finding now early-return when the corresponding `ssr*Delivered.current`
ref is true. The pendingSpecialCards useRef initializer no longer seeds
the Finding — it starts empty and only LabPromo placements land in it.

The `[Discover/inject] tick` console log will now show:
- Free user, normal session: `inserted: [{type: 'promo', position: N}, ...]`, `deferred: [...]`
- Pro user, normal session: `inserted: []`, `deferred: []` (tier short-circuit)
- Free user, post-pull-to-refresh: includes OnThisDate + Finding again
  (the refresh path resets `ssr*Delivered.current` refs)

## Spot-check sequence

1. Open `/discover` with DevTools console open.
2. Hard refresh (Cmd+Shift+R).
3. Confirm `[Discover/SSR-bake] items_bake_complete` log appears ONCE
   on mount. Expected fields:
   - `base_len: 15` (feed-v2 returned 15 base cards)
   - `final_len: 17` (15 base + Finding + OnThisDate)
   - `finding_idx: 5` (OnThisDate at 1 shifted Finding from splice-4 to render-5)
   - `otd_idx: 1`
   - `cluster_idx: -1` (cluster injects after via fetchSpecialCards)
4. Swipe FORWARD only — do NOT swipe back.
5. Expected visibility on first forward pass:
   - idx 0: Today's Lead phenomenon
   - idx 1: OnThisDateCard
   - idx 2-4: report cards
   - idx 5: FindingCard
   - idx 8 or 9: ClusteringCard (still injected client-side, lands after first paint)
6. Confirm `[Discover/inject] tick` only shows promo entries (Free) or
   empty arrays (Pro).
7. Pro-tier QA: sign in as Pro user, repeat steps 1-6. Expected:
   FindingCard + OnThisDate + Cluster all visible on first forward
   pass; NO LabPromo cards anywhere. `[Discover/inject] tick` shows
   `inserted: []`.

## Operator commit + tag sequence

```bash
cd ~/paradocs
git status                            # confirm modified files
git diff src/pages/discover.tsx       # eyeball the loadFeed + getServerSideProps changes
git diff docs/FINDING_CARD_SSR_BAKE.md  # this runbook
git add src/pages/discover.tsx docs/FINDING_CARD_SSR_BAKE.md
git commit -m "V11.18.14 — SSR-bake OnThisDate + Finding into initial items[]

Fixes chronic FindingCard/OnThisDateCard visibility bug on /discover.
The TikTok-grammar swipe component computes snap-points from the
initial items[] array; async-injected special cards staled those snap
points and only surfaced on swipe-back. Pre-fetch both cards in
getServerSideProps and splice them into items[] in the same setItems()
call that loads the base feed, so snap-points are correct on first
forward pass.

- getServerSideProps: pre-fetch OnThisDate alongside Finding (was Finding only)
- loadFeed(0): splice SSR specials into merged array before setItems
- fetchSpecialCards: skip OnThisDate fetch when SSR delivered
- pendingSpecialCards useRef: no longer seeds Finding (baked directly)
- ssrOnThisDateDelivered ref added, reset on lens/category/refresh

LabPromo stays client-side (tier + session decisions). ClusterCard data
flow preserved (V11.18.13). Pro suppression unchanged. tsc clean.

Runbook: docs/FINDING_CARD_SSR_BAKE.md"
git tag V11.18.14
```

## Pre-conditions

- NUFORC ingest, classifier-daily cron, nightly patterns-counts cron all
  continue to run; this patch touches only the SSR + first-paint
  rendering path on `/discover`.
- The `findings_catalogue` table must have at least one row with
  `published=true` for the SSR Finding to populate; otherwise the
  client fetch falls through as before.
- The `phenomena` table must have at least one active phenomenon
  matching today's MM/DD for the SSR OnThisDate to populate;
  otherwise `initialOnThisDate = null` and the card simply doesn't
  appear on this date.

## Open questions

- ClusterCard still surfaces post-first-paint via the client cluster
  fetch. The brief explicitly carves it out ("ClusterCard data flow
  stays via feed-v2 / V11.18.13's cluster fix"), but the underlying
  snap-point staleness theoretically still applies to the cluster
  position. If founder QA confirms cluster visibility on first forward
  pass is still flaky, a follow-up V11.18.15 should SSR-bake cluster as
  well (similar internal-HTTP-fetch pattern to OnThisDate).
- LabPromo cannot SSR-bake because the should-show decision needs
  tier + cooldown state. Acceptable: LabPromo positions are 9/21/33/45,
  and Free users typically only see the first one — by the time they
  swipe past idx 8, the inject has long since run. Stale snap-points
  for cards at idx >9 are practically irrelevant.
- The internal HTTP fetch for OnThisDate adds a server-side round-trip
  on cold-cache SSR renders. Endpoint sets `s-maxage=86400` so the
  hot path is fast; cold path is ~50-200ms on Supabase US-East.
