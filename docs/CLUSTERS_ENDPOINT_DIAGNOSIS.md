# /api/discover/clusters — Timeout Diagnosis

**Date:** 2026-06-10  **Status:** Confirmed root cause. Recommend Path A surgical fix.

---

## TL;DR

- `GET /api/discover/clusters` hangs ≥ 40s (curl times out empty).
- Root cause: the handler iterates every group of `(state, category)` that has ≥ 3 reports in the last 7 days and `await`s a serial Haiku call PLUS two Supabase round-trips for each one. With the corpus at 60,816 approved reports / 7 days (367k+ total, NUFORC complete), the inner loop has **64 geographic clusters + 1 temporal burst = 65 serial Haiku calls** per cold-cache request. Each Haiku call has a 12-second client-side timeout. The handler wall-clock is ~65 × (Haiku + 2 × Supabase) ≈ several minutes, well past Vercel Pro's default 15s function limit.
- The CDN cache (`s-maxage=60`) does mask the bug for ~60s after a successful cold execution, but a cold execution effectively never happens any more.

## Endpoint anatomy

**File:** `/Users/chase/paradocs/src/pages/api/discover/clusters.ts`

Per-request shape:

1. Pull `geoRaw` — approved reports in the last 7 days with non-null state. *(~0.7s, 5000-row PostgREST cap)*
2. Pull `geoTrailingRaw` — same shape, 28-day → 7-day window. *(~0.3s, 5000-row cap)*
3. Group `geoRaw` by `(state, country, category)`. Any group with ≥ 3 rows becomes a geographic cluster.
4. **For each geographic cluster (sync `for…of`)**:
   a. `await generateClusterFinding(...)` — Haiku call, 12s timeout. (`src/lib/services/cluster-finding.service.ts`)
   b. `await loadClusterReports(...)` — Supabase IN-query for first 3 linked IDs **plus** a 30-day category-scoped fallback when IN returns < 3 rows.
   c. Push the cluster card onto `clusters[]`.
5. Pull `recentCounts` and `monthlyCounts` for temporal-burst detection. *(~0.3s each)*
6. **For each temporal burst**: another `await generateClusterFinding(...)` + `await loadClusterReports(...)`.
7. Sort, `.slice(0, 5)`, set `s-maxage=60`, respond.

The 5-card cap in step 7 is applied **after** all 65 clusters are fully built. Work on items 6..65 is wasted.

## Evidence

### Live endpoint timing

```
$ curl -sS -o /tmp/c1.json -w 'HTTP %{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}s total=%{time_total}s\n' \
    --max-time 40 'https://www.discoverparadocs.com/api/discover/clusters?cb=…'
curl: (28) Operation timed out after 40006 milliseconds with 0 bytes received
HTTP 000 bytes=0 ttfb=0.000000s total=40.007287s
```

A second back-to-back call returned in 260ms — the CDN serves a stale-while-revalidate response from some earlier successful request. The cold path itself doesn't complete inside curl's 40s budget; Vercel's function timeout (15s default Pro) almost certainly fires first and returns a 504, which the SWR layer then masks until its window expires.

### Underlying DB queries are NOT the problem

Running each Supabase query directly against `https://db.discoverparadocs.com` with the service-role key:

| Query | Time | Bytes |
| --- | --- | --- |
| `geoRaw` (7d, status=approved, state not null) | **0.73s** | 642 KB |
| `geoTrailingRaw` (28d–7d, status=approved, state not null) | **0.31s** | 295 KB |
| `recentCounts` (7d, status=approved) | **0.29s** | 370 KB |
| `monthlyCounts` (30d, status=approved) | **0.24s** | 210 KB |

Sum: **~1.6s of Supabase work** at the front of the request. Database is fine. (All four are PostgREST-capped at 5000 rows; the partial counts only feed grouping totals, so the cap further bounds the inner-loop cost but masks the real corpus size — see "Other quality notes" below.)

### Inner-loop cardinality

From the 5000-row `geoRaw` sample (Jun 4–11):

- 64 `(state, category)` groups with ≥ 3 reports → 64 geographic-cluster iterations.
- Top 10:

| reports | state | category |
| --- | --- | --- |
| 698 | California | ufos_aliens |
| 285 | Texas | ufos_aliens |
| 273 | Florida | ufos_aliens |
| 256 | Washington | ufos_aliens |
| 210 | New York | ufos_aliens |
| 194 | Pennsylvania | ufos_aliens |
| 172 | Arizona | ufos_aliens |
| 172 | Illinois | ufos_aliens |
| 147 | Ohio | ufos_aliens |
| 145 | North Carolina | ufos_aliens |

Plus 1 `temporal_burst` (ufos_aliens). Total inner-loop iterations: **65**.

### Per-iteration cost

`generateClusterFinding(...)` in `src/lib/services/cluster-finding.service.ts`:

- One Supabase `select(...).in('id', sampleIds)` to fetch 12 sample reports.
- One Haiku request via `fetch('https://api.anthropic.com/v1/messages', …)` with a 12-second `AbortController` timeout.
- Awaited with `.catch(() => null)` in the handler — failures don't abort, but they DO still wait the full 12s before resolving null.

`loadClusterReports(...)` in `src/pages/api/discover/clusters.ts:267`:

- Supabase IN-query for first 3 linked IDs.
- Conditional 30-day fallback IN-query (kicks in when fewer than 3 rows resolved).

### Wall-clock estimate

- Realistic Haiku latency: 1–3 s/call (small prompt). Best case: 65 × 1.5s = **~98 s**.
- Pessimistic (Haiku slowness, retries, timeouts at 12s): 65 × 12s = **780 s**.
- Plus ~2 × Supabase RTT per iteration: 65 × 2 × 80ms ≈ 10s of additional serial RTT.

Either way, the request CANNOT complete inside Vercel's function timeout. There is no `export const config = { maxDuration: ... }` on this route, so the default applies (`vercel.json` only configures `admin/` and `cron/` routes).

### What the founder is actually seeing

- `curl … | jq '.clusters | length'` hangs 29+s with no body — Vercel's edge has a stale-while-revalidate cached value at the proxy that has aged past its window, so the request goes through to the function, the function times out, the connection hangs until the client gives up.
- Client-side `fetch('/api/discover/clusters')` in `discover.tsx:1085` does `.catch(function () {})` — total silent failure. No console error, no card injection.
- Same silent failure was breaking V11.18.20 SSR-bake. (No SSR call to this endpoint is wired today, presumably reverted.)
- "Geographic Cluster card has never reliably appeared" matches exactly: it appears only inside a 60-second window after the rare cold execution that happens to finish before Vercel cuts it off — basically a race the user almost always loses.

## Other quality notes (incidental, not the root cause)

- `geoRaw`/`recentCounts`/`monthlyCounts` are silently capped at PostgREST's 5000-row max. Real corpus volume is **60,816 / 7d** (approved); the cap means the grouping math under-counts. Once the volume-cap is relevant for Path A's pre-compute pass, the queries need to be paginated or aggregated in SQL.
- `var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!` is evaluated at module load — fine, but the `getSupabase()` factory creates a NEW client per request. Not the bug but worth a follow-up cleanup.
- `loadClusterReports` emits a `console.log` for every cluster on every cold execution — 65 lines per request into Vercel logs. Noisy, not load-bearing.

## Vercel function logs

Logs not directly accessed in this investigation (no CLI auth in the sandbox). Given the symptom (40s hang → empty body), the function is being killed by the platform's default ~15s timeout for Pro Node serverless and the proxy is holding the connection until the client gives up. The expected log shape would be:

```
[Clusters] Error: AbortError / FUNCTION_INVOCATION_TIMEOUT
```

…and 60+ `[loadClusterReports]` lines per cold invocation, half of which may never flush because the function is terminated mid-loop.

---

## Recommended path: **A — surgical fix**

The underlying primitive is healthy (the DB queries are sub-second), the corpus actually is interesting (64 geographic clusters in a week is a feature, not a bug), and the card has a clearly designed visual treatment. The endpoint just needs to stop serializing 65 Haiku calls inside a request handler.

### Specific fix proposal

Three changes, applied together, in `src/pages/api/discover/clusters.ts`:

1. **Cap the number of clusters the handler builds (not just returns).**
   Sort `(state, category)` groups by `group.length` BEFORE the loop, slice to top 8 candidates for geographic, top 4 for temporal. The endpoint only ever serves 5; building 65 is pure waste. This alone collapses inner-loop work by ~85%.

   ```ts
   var geoEntries = Object.entries(geoGroups)
     .filter(([, g]) => g.length >= 3)
     .sort(([, a], [, b]) => b.length - a.length)
     .slice(0, 8)   // build 8, serve at most 5 after the temporal-bursts merge
   for (var [keyG, group] of geoEntries) { … }
   ```

2. **Parallelize the Haiku + rep-report fetches with `Promise.all`.**
   Within each cluster, both side-effects are independent of the other clusters. Wrap the body of each loop in an `async` function and `Promise.all` the lot. Worst case: max(Haiku) ≈ 12s, fits inside Vercel's window with margin.

3. **Bump the CDN cache from 60s to 1 hour and add a maxDuration.**
   Geographic-cluster shape is stable on the hour scale; the 60s TTL was tuned to a different problem (cluster shape drift during QA in Sprint 1E). Set:

   ```ts
   res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
   ```

   …and add `export const config = { maxDuration: 30 }` so a cold execution has headroom even if Haiku is slow.

Optional follow-up (not blocking): pre-compute clusters in a nightly cron writing to a `cluster_cards` table, so the endpoint becomes a single Supabase `select … limit 5`. That's the right end-state but the three above changes are sufficient to unbreak the card today.

### Risk

- **Low.** Capping the candidate count narrows the variety of clusters the discover-feed picks from (sessionSeed % 5 still picks one from a 5-card pool), but it picks from the 5 highest-volume clusters, which is exactly what the variety logic was designed around.
- `Promise.all` change is local to the same handler — no API-shape change.
- 1-hour cache may delay the appearance of a brand-new state cluster by up to an hour. Acceptable for cluster cadence.

### Uncertainty

- The 65-iteration count is real for the Jun 4–11 window. If the corpus quiets down (NUFORC stops trickling) the count drops, the bug becomes intermittent, and Path A is overcautious — but Path A still costs nothing in that quiet regime.
- Vercel function timeout for this route is the platform default (15s, Pro Node); unverified directly. Even if it's secretly 60s, a 65-Haiku-call serial loop overflows that too.
- Haiku call latency assumption (1–3s typical) is based on the 12s timeout + observed Haiku P50 in other paths. Not measured for this specific path in this investigation.

## Alternative considered: Path B — disable cluster card

Rejected. The Geographic Cluster card is a designed feature with two sprints of polish (1E, 1G, V11.18.19, V11.18.20). The data exists, is clean, and lights up the card the way the panel designed. Removing it papers over a fixable serialization mistake. If the surgical fix in Path A doesn't land within a day, Path B becomes the right pragmatic call — but the right first move is the three-line fix above.
