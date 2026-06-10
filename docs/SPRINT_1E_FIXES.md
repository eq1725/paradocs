# Sprint 1E Fixes — V11.18.13

**Tag:** V11.18.13
**Predecessor:** V11.18.12 (Sprint 1E redesign)
**Spec:** `docs/SPRINT_1E_NOTES.md` (predecessor build notes)
**Date:** June 2026
**Scope:** Three post-V11.18.12 polish issues + four chronic console errors.
**Status:** Code complete; pending operator commit + spot-check.

---

## 1. Issues fixed

### 1.1 ClusteringCard substance zone empty

**Symptom:** "IN THIS CLUSTER" 3-row representative-report list was
suppressed on every cluster card the founder saw during V11.18.12 QA.

**Root-cause investigation:**
- `/api/discover/clusters.ts` correctly emits `representative_reports`
  on each cluster (V11.18.12 added `loadClusterReports()`).
- `/discover` picks one cluster via `Object.assign({}, available[pickIdx], {
  item_type: 'cluster' })` — the spread carries `representative_reports`
  through to the client card.
- `ClusteringCard.tsx` reads `item.representative_reports`, slices to
  3, renders the list under the "IN THIS CLUSTER" small-caps header.
- The diagnosis in the founder's notes ("data is in the wrong endpoint")
  was incorrect — clusters do come from `/api/discover/clusters`, not
  `feed-v2.ts`. The likely actual causes are (a) a 10-min CDN cache
  serving a pre-V11.18.12 shape during QA, (b) the inner
  `.eq('status', 'approved')` filter in `loadClusterReports` returning
  zero rows because of a between-query status change.

**Fixes applied:**
- `src/pages/api/discover/clusters.ts` — `loadClusterReports()` now
  drops the redundant inner `.eq('status', 'approved')` filter (the
  IDs already came from a status='approved' selection upstream); logs
  `[Clusters] loadClusterReports returned fewer rows than requested`
  with the failing IDs so the cause surfaces in Vercel logs.
- `src/pages/api/discover/clusters.ts` — CDN cache reduced from
  `s-maxage=600` (10 min) to `s-maxage=60` (1 min) so any shape
  changes propagate within a minute rather than ten.
- `src/pages/api/discover/clusters.ts` — also emit `cluster_type` as
  an alias of `type` so the `ClusterCardData` interface (which uses
  `cluster_type`) sees the value through the `Object.assign` spread
  in `discover.tsx`.
- `src/components/discover/ClusteringCard.tsx` — diagnostic
  `console.warn('[ClusteringCard] substance zone suppressed — no
  representative reports', {...})` fires once on mount when
  `reps.length === 0` so the founder can confirm the exact cause in
  DevTools next session.

**Files:**
- `src/pages/api/discover/clusters.ts` lines 235–283 (loadClusterReports
  rewrite), line ~378 (cluster_type field), line ~463 (CDN header).
- `src/components/discover/ClusteringCard.tsx` lines 164–186 (diag warn).

---

### 1.2 FindingCard space optimization for desktop/tablet

**Symptom:** Today-variant FindingCard was designed for mobile portrait
(2:3). At ≥768px (tablet) the card stretches edge-to-edge but its
inner content tops out at `max-w-[34ch]` (~510px), leaving an awkward
whitespace gutter on the right.

**Fix applied (option B per the founder memo — constrain max-width,
preserve mobile grammar):**
- `src/components/patterns/FindingCard.tsx` — TodayCardLayout outer
  wrapper gets `sm:max-w-lg sm:mx-auto` (512px max, centered) at
  ≥640px. Below `sm` the card stays full-bleed so the mobile portrait
  grammar is unchanged.
- A right-edge hairline mirror of the existing left-edge brand-purple
  hairline was added so the constrained card reads as a deliberate
  column at tablet+desktop rather than a clipped mobile card.

**Symmetrical fix on ClusteringCard for visual consistency:**
- `src/components/discover/ClusteringCard.tsx` — outer wrapper gets the
  same `sm:max-w-lg sm:mx-auto` treatment. The right-edge hairline
  isn't mirrored here because the cluster card already has a 60px
  brand-purple gradient + 1px rail on the left; symmetry-via-rail is
  the cluster card's signature, not a hairline edge.

**Behavior across viewports:**
- Mobile (375px): full-bleed, identical to V11.18.12.
- Tablet (768px): 512px-wide column centered in the card pane.
- Desktop (1280px+): 512px-wide column centered inside the existing
  `lg:max-w-2xl xl:max-w-3xl` card pane.

**Files:**
- `src/components/patterns/FindingCard.tsx` (TodayCardLayout outer div).
- `src/components/discover/ClusteringCard.tsx` (outer div).

---

### 1.3 LabPromo preview override for design QA

**Symptom:** LabPromo Today-variant is correctly suppressed for Pro
tier users via `tier_pro` short-circuit (`userTier === 'pro' ||
userTier === 'enterprise'`). The founder + designer need to QA the
card without changing their actual tier.

**Fix applied:**
- `src/pages/discover.tsx` `fetchSpecialCards()` — check
  `router.query.preview_labpromo === '1'`. When true AND the user is
  Pro/Enterprise, flip `tierSkip = false` so the LabPromo decision
  proceeds normally. Logs
  `[Discover/LabPromo] preview override active — bypassing tier_pro
  suppression` when active. Production behavior unchanged for users
  not appending the query param.

**Usage:**
```
/discover?preview_labpromo=1
```

The query param does NOT bypass the server-side cap (6/week) or
cooldowns. To force the card to land in the feed, the operator may
need to also clear `lab_promo_impressions` for their user_id; in
practice the founder is below the cap during QA so the override alone
is sufficient.

**Files:**
- `src/pages/discover.tsx` lines ~990–1005 (Promise.all then-clause,
  before the tierSkip branch).

---

### 1.4 Chronic 400/401 errors — silenced

**Errors observed in DevTools console during V11.18.12 sessions:**
1. `POST /api/push/claim-anon-subscriptions 401` — auth race on first
   paint after sign-in.
2. `POST /api/user/streak-bootstrap 401` — same auth race.
3. `GET /profiles?select=subscription_tier&id=eq.<uuid> 400` —
   PostgREST `.single()` returns 4xx for zero-row matches; the
   profiles row may not exist yet for newly-created users.
4. `GET /api/user/streak 401` — same auth race as (1) and (2).

**Fixes applied:**

**(1), (2), (4) — auth race on streak + claim-anon endpoints:**
- `src/pages/discover.tsx` — the streak + claim-anon-subscriptions
  useEffect now calls `supabase.auth.getSession()` inside the effect
  and bails when no access_token is present (silent — no fetch fired).
  When a token exists it passes `Authorization: Bearer <token>` on
  every server call so the server-side `createServerSupabaseClient`
  finds the session immediately, even when the SSR cookie hasn't
  fully hydrated.
- `src/components/discover/EndOfFeedCard.tsx` — same treatment for
  the `/api/user/streak` fetch on the end-of-feed celebration card.

**(3) — profiles 400:**
- `src/pages/discover.tsx` — `loadUserTier()` swapped
  `.single()` → `.maybeSingle()` for `profiles.subscription_tier`.
  PostgREST returns 200 + null body for zero-row matches under
  maybeSingle, eliminating the 400. The "free" default in the success
  branch already covers null.

**Files:**
- `src/pages/discover.tsx` lines 669–680 (loadUserTier maybeSingle),
  lines 690–793 (streak useEffect rewrite).
- `src/components/discover/EndOfFeedCard.tsx` lines 18–49 (streak fetch
  with Bearer token).

---

## 2. Operator commit + spot-check sequence

### Commit
```
git status            # confirm only the V11.18.13 fix files modified
git add -A
git commit -m "V11.18.13 — Sprint 1E fixes: cluster substance zone + cross-platform card width + LabPromo preview + chronic 401/400 silencing"
git tag V11.18.13
git push && git push --tags
```

### Spot-check (post-deploy)

**ClusteringCard substance zone:**
- Open `/discover` in incognito.
- Swipe past ~8 cards (cluster lands at position 8).
- VERIFY: cluster card shows "IN THIS CLUSTER" label + 3 rep-report
  rows beneath the hero glyph + headline.
- If empty, open DevTools console — look for
  `[ClusteringCard] substance zone suppressed — no representative
  reports`. The logged payload tells whether (a) the field is missing
  entirely on the cluster object (API/cache problem), (b) the field is
  present but empty array (`loadClusterReports` returned 0 rows —
  check Vercel logs for the matching warning).

**FindingCard cross-platform width:**
- Open `/discover` on mobile (375px / iPhone 14 Pro DevTools preset).
- Swipe to position ~4–5 (FindingCard lands at position 4).
- VERIFY: card spans full viewport width, identical to V11.18.12.
- Resize to tablet (768px). VERIFY: card narrows to 512px wide, centered.
- Resize to desktop (1280px). VERIFY: card stays 512px wide inside the
  `lg:max-w-2xl` card pane, centered.
- VERIFY: ClusteringCard at position 8 receives the same treatment.

**LabPromo preview override:**
- As a Pro-tier user, open `/discover` (no query param). VERIFY: no
  LabPromo lands in the feed.
- Open `/discover?preview_labpromo=1`. VERIFY: LabPromo lands at
  position 8+cadence. DevTools console shows:
  `[Discover/LabPromo] preview override active — bypassing tier_pro
  suppression`.
- Drop the query param. VERIFY: production behavior restored (no
  LabPromo for the Pro user).

**Console error silencing:**
- Sign in fresh (clear cookies, log in via /login).
- Land on `/discover`. Open DevTools Network tab.
- VERIFY (no 401):
  - `/api/user/streak` returns 200
  - `/api/user/streak-bootstrap` returns 200 (when localStorage anon
    streak present) or doesn't fire
  - `/api/push/claim-anon-subscriptions` returns 200 (when anon
    client id present) or doesn't fire
- VERIFY (no 400): `/profiles?select=subscription_tier` returns 200
  + tier value (or 200 + null if the row doesn't exist).

---

## 3. Backing services — still running

The fixes are UI-and-API-only. The following continue to run on cron:
- NUFORC ingest (NUFORC adapter polling, V11.17.94 protections).
- Daily classifier (`/api/cron/classify-phenomena-batch`, 6am UTC).
- Nightly patterns-counts (`/api/cron/refresh-pattern-counts`,
  midnight UTC).

No changes to ingestion or classifier paths in V11.18.13.

---

## 4. Open questions for founder

1. **Substance-zone diagnostic warn — keep or remove for V11.18.14?**
   The `console.warn` in `ClusteringCard.tsx` fires every time the
   substance zone is suppressed. If the founder confirms the zone
   renders correctly post-fix, the diagnostic should be removed in the
   next sprint so the DevTools console stays clean.

2. **Cluster card type-field aliasing — clean up `type` in V11.18.14?**
   `/api/discover/clusters.ts` now emits BOTH `type` and `cluster_type`
   for the same value (the original ClusterCardData interface used
   `cluster_type`; the API was emitting `type`). The dual-emit was a
   minimal-disruption fix. A follow-up could drop the legacy `type`
   field once it's confirmed no other consumer reads it.

3. **`?preview_labpromo=1` cap interaction.** The override bypasses the
   tier_pro suppression but NOT the server-side 6/week impression cap
   or 48h dismiss cooldown. For QA the founder rarely hits these, but
   in a designer hand-off it might trip. A future
   `?preview_labpromo=force` could also bypass the
   `fetchLabPromoShouldShow()` server-side decision — leave as
   backlog.

4. **FindingCard max-width — `max-w-lg` vs `max-w-md`?** Chose
   `max-w-lg` (512px) based on the panel memo's "preserve the mobile
   grammar" guidance — 448px (max-w-md) made the bar widths feel
   cramped relative to the hero numeric on desktop. Founder may
   prefer the tighter 448px column; trivial to change.

---

## 5. Quality bar — verification

- [x] `npx tsc --noEmit` — no new errors introduced in the 5
  Sprint 1E files (`discover.tsx`, `clusters.ts`, `ClusteringCard.tsx`,
  `FindingCard.tsx`, `EndOfFeedCard.tsx`). Pre-existing scripts-folder
  + LogToConstellation errors are unrelated to V11.18.13.
- [x] ClusteringCard data flow extended + CDN cache tightened +
  diagnostic logging in place.
- [x] FindingCard + ClusteringCard receive matching `sm:max-w-lg
  sm:mx-auto` so they read as a coherent family across viewports.
- [x] LabPromo preview override behind a query param; production
  behavior unchanged.
- [x] All four chronic console errors gated by either an explicit
  session check (401s) or maybeSingle (400).
- [x] Documentary register preserved on all rendered copy.
- [x] NUFORC + classifier + patterns-counts cron jobs untouched.
