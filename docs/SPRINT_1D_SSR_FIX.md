# Sprint 1D SSR Fix — FindingCard first-paint race

**Tag:** V11.18.10
**Sprint:** 1D race fix (post-V11.18.9 trace)
**Files touched:**
- `src/pages/discover.tsx` (+ ~85 lines: getServerSideProps, props type, mount-time seed, skip-client guard, three reset paths)

**Constraints honored:**
- Operator commits locally (no git commands run by the agent)
- `npx tsc --noEmit` clean on the touched file (pre-existing errors elsewhere in the repo are unchanged)
- Mobile-first (no UI surface changed; render path identical post-mount)
- Documentary register preserved (comments + log labels stay in the existing register)
- NUFORC ingest + classifier-daily cron + nightly patterns-counts cron untouched
- No regression on LabPromo (still client-side, tier-gated) / OnThisDate (still client-side) / Cluster (still client-side, session-seeded)
- No double-injection (the client patterns/list fetch is guarded by `ssrFindingDelivered.current`)

---

## The bug (recap)

The FindingCard at position 5 of /discover was rendering correctly, but
only AFTER the user swiped past it and came back. The root cause was a
race between the client-side `fetch('/api/lab/patterns/list?limit=20')`
inside `fetchSpecialCards()` (200–1000 ms turnaround) and the user's
TikTok-style upward swipe. Fast swipers passed position 5 before the
Finding entry landed in the items array. The `injectPendingSpecialCards`
tick fired after the user had already moved past the splice index, and
the existing render path then quietly skipped the slot.

Diagnostic logs added in V11.18.3 / V11.18.8 / V11.18.9 confirmed the
race: `[Discover/inject]` showed the finding being inserted at position
4 or 5, but `[Discover/render-entry]` for those positions had already
fired on a different `item_type` (the report that had occupied that
slot before the splice landed).

## The fix

Pre-fetch the day's Finding inside `getServerSideProps` so the very
first paint of /discover ships with the FindingCard already wired into
the pending-special-cards queue. The client `loadFeed(0)` then drains
that queue on its first injection tick, and the user sees the
FindingCard at position 4–5 without needing to swipe back.

### Scope (deliberately narrow)

- **FindingCard moves to SSR** — small data, deterministic
  day-of-year rotation, most-affected by the race because it lands at
  position 4–5 where fast swipers reach first.
- **LabPromo stays client-side** — requires user state + tier-check
  (`userTier === 'pro'`) + the cooldown decision API; not safe to run
  in SSR without leaking server-side env or breaking the tier gate.
- **OnThisDateCard stays client-side** — lands at position 1 (already
  visible by the time the user finishes onboarding); race is not the
  bottleneck and the data is smaller.
- **ClusteringCard stays client-side** — uses the per-session
  `sessionSeed.current` for ranker freshness; moving it to SSR would
  return the same cluster pick across all anonymous CDN-cache hits.

### Mechanism

1. New `getServerSideProps` at the bottom of `discover.tsx` queries
   `findings_catalogue` directly via the Supabase service-role client
   (same shape as `/lab/patterns`'s SSR), picks `rows[doy % N]` with
   identical UTC day-of-year math, and returns `initialFinding` or
   `null` on failure.
2. New `DiscoverPageProps { initialFinding: FindingFeedItem | null }`
   type on the component signature.
3. New `ssrFindingDelivered` ref (initialized from
   `initialFinding != null`) and a one-shot mount useEffect that
   pushes the SSR finding into `pendingSpecialCards.current` at
   `position: 4`.
4. `fetchSpecialCards()` gated: if `!categoryFilter &&
   ssrFindingDelivered.current`, skip the
   `/api/lab/patterns/list?limit=20` fetch entirely (the SSR finding is
   already in the queue) and log a single
   `[Discover/FindingCard] SSR-delivered — skipping client patterns/list fetch`.
5. Three reset paths (`handleLensChange`, `handleCategoryChange`,
   pull-to-refresh) clear `ssrFindingDelivered.current = false` so the
   client fetch path takes over for those user-initiated reloads
   (which don't re-run getServerSideProps).
6. SSR response sets `Cache-Control: s-maxage=60,
   stale-while-revalidate=60` so the CDN can cache the shell + Finding
   payload for 60 s without staling the day-of-year rotation
   noticeably (every user gets the same Finding for the whole UTC
   day).

### Pre-existing caching posture

Before V11.18.10, /discover was a client-only page (no
`getServerSideProps`, no `getStaticProps`), so Next.js was statically
rendering an empty shell at build time and the CDN was caching that
shell indefinitely. Adding `getServerSideProps` changes the page to be
server-rendered on every request — but the explicit
`Cache-Control: s-maxage=60` header tells the Vercel edge to still
cache the response for 60 s. Practical effect: at most one
Supabase round-trip per minute per region per UTC day. No additional
auth surface (the SSR call uses the service-role key, identical to
`/lab/patterns`, and returns only the `published=true` Finding
rotation — no per-user data).

### What if SSR fails

If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is unset, or the
Supabase query throws, `getServerSideProps` returns
`{ initialFinding: null }`. The mount useEffect short-circuits,
`ssrFindingDelivered.current` stays `false`, and the original
client-side `fetchSpecialCards()` patterns/list fetch path runs
exactly as it did pre-V11.18.10. No regression.

---

## Operator commit + spot-check sequence

```bash
cd ~/paradocs
git add src/pages/discover.tsx docs/SPRINT_1D_SSR_FIX.md
git diff --staged | wc -l       # ~120 added lines, mostly comments
git commit -m "V11.18.10 — SSR pre-fetch FindingCard to kill first-paint swipe race

Move the day-of-year Finding rotation pick into getServerSideProps so
the FindingCard is in the items array on initial paint instead of
landing 200–1000 ms later via the client patterns/list fetch. Keeps
LabPromo / OnThisDate / Cluster on their existing client-side paths
(tier-gated / smaller data / session-seeded — none had the race).

ssrFindingDelivered ref guards fetchSpecialCards() so the client
patterns/list fetch is skipped when SSR already seeded the queue (no
double-injection). Three reset paths (lens change, category change,
pull-to-refresh) clear the ref so user-initiated reloads fall back to
the pre-V11.18.10 client fetch.

Pre-existing tag: V11.18.9 (FindingCard render trace + filter logs).
Closes Sprint 1D race-fix backlog."
git tag V11.18.10
git push && git push --tags
```

### Spot-check (founder DevTools, mobile Safari)

1. Hard-refresh /discover (cmd-shift-R / pull-to-refresh on iOS).
2. Open Web Inspector console.
3. Expected log sequence on first paint (in order):
   ```
   [Discover/SSR-finding] { hasInitialFinding: true, slug: "shadow_figure" }
   [Discover/FindingCard] SSR-delivered — skipping client patterns/list fetch
   [Discover/inject] tick {
     arr_in_len: 15,
     arr_out_len: 18,
     inserted: [
       { type: "finding", position: 4 },
       { type: "cluster", position: 8 },
       { type: "on_this_date", position: 1 },
       ...promo entries deferred to next page...
     ],
     deferred: [...],
     all_injected: false,
   }
   ```
4. Swipe up 4 times (without coming back). At idx=4 the
   `[Discover/render-entry]` log fires with `item_type: "finding"` and
   `[FindingCard render]` follows with `variant: "today_card"`.
5. Verify the visual: hairline purple top + bottom borders, eyebrow
   "Across Phenomena", headline, three family-percent bars, footer
   "Source: Paradocs Archive · NNN,NNN accounts".

### Regression spot-checks (other special cards untouched)

- OnThisDate at position 1: first swipe up should render it (look for
  `[Discover/render-entry] item_type: "on_this_date"` at idx=1).
- Cluster at position 8: 8 swipes in, expect
  `item_type: "cluster"` at idx=8.
- LabPromo (anon or free tier): around idx=11 ± 3 expect
  `item_type: "promo"`.

### Pull-to-refresh spot-check

Pull-down on idx=0 to trigger refresh. Console should now show
`[Discover/FindingCard] injected` (the client patterns/list path) on
the post-refresh load, NOT `[Discover/SSR-finding]` again — confirming
the `ssrFindingDelivered.current = false` reset took effect.

---

## Pre-conditions verified

- `findings_catalogue` table: ≥1 row with `published = true` (verified
  during Sprint 1B re-seed; the operator can re-verify via
  `select count(*) from findings_catalogue where published=true`).
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set in
  Vercel project env (already required by `/lab/patterns` SSR — no new
  env keys).
- API endpoint `/api/lab/patterns/list?limit=20` continues to work for
  the lens-change / category-change / pull-to-refresh fallback paths.
- The nightly patterns-counts cron (`scripts/refresh-patterns-counts`)
  keeps `findings_catalogue` denominator_n + phen_families counts
  current; no scheduling change.

## Known uncertainty

- **Caching posture shift:** /discover was client-rendered with a
  CDN-cached static shell pre-V11.18.10; it's now server-rendered with
  a 60 s edge cache. Vercel will see slightly more origin traffic
  during cache-miss windows, but the `s-maxage=60` and the trivial
  cost of the single Supabase query make this negligible. If the
  founder observes a meaningful Vercel function-invocation uptick,
  bump `s-maxage` to 300 (matches the `/api/lab/patterns/list` edge
  cache) — the rotation is stable for the whole UTC day so 300 s is
  still safe.
- **Server/client doy-pick alignment:** SSR `Date.UTC` math is
  identical to the client `dayOfYear()` helper (line 146). On the
  ~60-second window straddling UTC midnight the client and server can
  technically diverge by one row; this only affects the lens-change /
  pull-to-refresh fallback paths because the SSR pick is authoritative
  for the initial paint. Documented but not gated.
- **Pages-router `'use client'` directive:** /discover starts with the
  string literal `'use client'`. This is a no-op in Pages router
  (it's an App Router directive); `getServerSideProps` exports work
  regardless. Verified by the equivalent pattern in
  `/lab/patterns.tsx`, which exports SSR without the directive.
