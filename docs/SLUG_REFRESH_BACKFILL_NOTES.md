# V11.17.98 — Slug-refresh backfill runbook

## Why

V11.17.98 added slug regeneration to `persistConsolidatedResult`
(`src/lib/services/consolidated-ai.service.ts`). Freshly ingested
reports now get a slug derived from the Haiku-rewritten title, with
the 8-char hash suffix preserved for identity stability.

~6,521 reports ingested BEFORE V11.17.98 still carry stale slugs
derived from the raw adapter title (chopped first-sentence narrative
from Reddit / NUFORC / YouTube — the smoking gun is that the URL
fragment doesn't match the displayed headline).

This pass:

1. Rewrites the stale slugs to match the current Haiku title.
2. Records every old slug in `report_slug_aliases` so existing inbound
   URLs (shared links, push notifications already delivered,
   search-engine index entries, CDN-cached pages) 301-redirect to the
   new canonical URL.

## Files

- **Migration:** `supabase/migrations/20260606_v111798_slug_aliases.sql`
- **Backfill script:** `scripts/backfill-slugs-v11-17-98.ts`
- **Redirect handler:** `src/pages/report/[slug].tsx` — getStaticProps
  now checks `report_slug_aliases.old_slug` before returning 404 and
  returns a `permanent: true` (301) redirect when a hit lands on a
  current approved slug.
- **Shared helper:** `src/lib/services/consolidated-ai.service.ts`
  exports `computeRefreshedSlug` / `buildSlugPrefixFromTitle` /
  `splitSlugSuffix`. Both the live persistence path and the backfill
  script call the SAME functions — no duplicated regex.

## Operator runbook

Run from `/Users/chase/paradocs` with the production env loaded.

### 1. Apply the migration

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260606_v111798_slug_aliases.sql
```

(or push via the Supabase dashboard / `supabase db push` — the schema
is idempotent: `IF NOT EXISTS` everywhere.)

### 2. Dry-run the backfill

```bash
set -a; source .env.local; set +a
tsx scripts/backfill-slugs-v11-17-98.ts
```

This prints:

- Total scanned (approved reports).
- Skipped (no title / no slug / slug already current).
- To-update candidate count (expect ~6,521 ± drift).
- A sample of 10 (old slug → new slug) for spot-check.

### 3. Review the sample

Eyeball the 10 sample rows. Confirm:

- New slug is a clean lowercased-hyphenated version of the displayed
  title.
- The trailing 8-char hash suffix is identical between old and new.
- No new slug is empty / null / suspicious.

If anything looks off, re-run with `--sample-size=50` to widen the
audit. Don't proceed to step 4 until at least one sample is reviewed.

### 4. Apply

```bash
tsx scripts/backfill-slugs-v11-17-98.ts --apply
```

Sequential per-row UPDATE plus a batched alias upsert per page of 500.
At ~500 rows/page and ~6.5k candidates this is ~13 pages and runs in
a few minutes. Watch the log; any per-row update error is logged and
counted, the script keeps going.

### 5. Spot-check the redirect

Pick one of the sample rows. Visit `https://paradocs.app/report/<old-slug>`
in a browser. Expect a 301 to `/report/<new-slug>` and the report to
render normally.

## Smoke tests (post-apply)

- Random ~5 reports — confirm the displayed page URL matches the
  headline.
- One report with no alias (a pristine V11.17.98+ ingestion) — confirm
  it still renders normally (alias lookup miss should be no-op, not
  break the page).
- `report_slug_aliases` row count should be roughly equal to the
  to-update count from the dry-run summary.

## Rollback

**There is no point-in-time snapshot of the old slugs outside of
`report_slug_aliases` itself.** This is one-way.

If we need to "undo" the refresh:

1. `report_slug_aliases.old_slug` IS the historical record. For each
   row in the aliases table, the `old_slug` was the value of
   `reports.slug` immediately prior to the backfill UPDATE.
2. Restoration would be:

   ```sql
   UPDATE reports r
   SET slug = a.old_slug
   FROM report_slug_aliases a
   WHERE a.report_id = r.id
     AND a.created_at >= '<backfill window start>';
   ```

   …then `TRUNCATE report_slug_aliases` (or delete only the rows
   inserted in that window) so the redirect handler stops 301-ing
   restored slugs to themselves.
3. Risk: if the live ingestion path ALSO refreshed a slug between
   backfill and rollback (because Haiku-rewrote a title in the
   regular flow), the alias from that refresh would also restore,
   reverting a legitimate post-backfill change. This is a low-
   frequency event but worth knowing about.

**The clean way to undo is "don't" — accept the 301 redirects and
move on. Flag this risk before deciding to roll back.**

## Open questions for the founder

1. **CDN cache invalidation.** Vercel serves `/report/[slug]` via ISR
   with `revalidate: 120`. Old-slug pages already cached at the edge
   will keep serving the old HTML for up to two minutes after backfill,
   then automatically revalidate (the old slug hits getStaticProps,
   getStaticProps now redirects, edge cache replaces with the 301).
   No manual invalidation should be needed. **Confirm we have no
   other CDN layer (Cloudflare in front of Vercel, etc.) that would
   need an explicit purge.**

2. **Search-engine index churn.** Google etc. will see ~6.5k 301s in
   quick succession when their crawler next sweeps. This is the
   correct signal (canonical move) but will produce a spike in Search
   Console "Page with redirect" coverage. Normal and self-healing
   over a few weeks; flag if anyone notices.

3. **Aliases table growth.** Over time, repeated title rewrites
   (admin re-runs of consolidated-ai on a report) will accumulate
   alias rows. No automated cleanup. Probably fine — even at one
   alias per report per year, the table is ~100k rows in a decade.
   Revisit if it ever crosses ~1M.
