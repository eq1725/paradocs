# V11.17.96 — Classifier attempts tracking

Stops the daily launchd cron from re-processing reports that legitimately can't be classified. After V11.17.95's "skip any report with at least one phen tag" filter, the remaining hot spot was the *zero-tag tail* — reports the model keeps returning `null` on (vague accounts, ambiguous events, prose with no canonical phen features). Without attempt tracking, every 04:00 cron run paid full classifier cost on the same ~6k tail reports forever.

**Cost savings projection: ~$9/day → ~$0/day for the tail. ~$3,300/yr.**

## What the columns mean

```sql
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS classifier_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS classifier_skip     BOOLEAN NOT NULL DEFAULT FALSE;
```

| Column | Type | Semantics |
|---|---|---|
| `classifier_attempts` | INT, default 0 | Number of times the classifier has processed this report. Bumped +1 after every batch chunk that included it — even if Anthropic returned null or the result row never arrived. |
| `classifier_skip` | BOOLEAN, default FALSE | Permanent skip flag. Set when `classifier_attempts >= MAX_CLASSIFIER_ATTEMPTS` AND the report still has zero `report_phenomena` rows after the bump. Cleared only by `--retry-failed`. |

Both columns default to `0` / `FALSE` so existing reports start fresh — they each get a full 3 tries from V11.17.96 forward. No backfill needed.

`MAX_CLASSIFIER_ATTEMPTS` is set to `3` at the top of `scripts/classify-phenomena-batch.ts`. Three attempts catches transient Anthropic failures + cold-cache stragglers + bad-chunk drops; anything still untaggable after that almost certainly can't be matched by the current taxonomy.

## Partial index

```sql
CREATE INDEX IF NOT EXISTS idx_reports_classifier_skip_attempts
  ON reports (classifier_attempts)
  WHERE status = 'approved' AND classifier_skip = FALSE;
```

The `WHERE` clause restricts the index to the classifier's hot path: approved reports the classifier might still touch. The `classifier_attempts` column ordering lets PostgREST's `lt('classifier_attempts', 3)` use an index scan.

## Filter logic

**Before (V11.17.95):**

Per category, `existingLinks` is built from `report_phenomena` joined on `report_id` only (no `phenomenon_id` filter — unless `--cross-category-enrichment` is set). Any report with ANY existing tag in ANY category is skipped. Reports with **zero** existing tags fall through and get re-classified every single run.

**After (V11.17.96):**

Same `existingLinks` filter still runs (V11.17.95 behavior preserved). PLUS the initial `reports` query now adds:

```ts
repQuery = repQuery
  .eq('classifier_skip', false)
  .lt('classifier_attempts', MAX_CLASSIFIER_ATTEMPTS)
```

So the report is excluded if EITHER:

1. It already has any phen tag (V11.17.95 path), OR
2. `classifier_skip = TRUE` (V11.17.96 permanent skip), OR
3. `classifier_attempts >= 3` (V11.17.96 cap reached but skip not yet written — same effect).

After Anthropic returns + persistence completes for each batch chunk, the script bumps `classifier_attempts += 1` for every report in that chunk and then sets `classifier_skip = TRUE` for any of those reports that crossed the cap AND still have zero junction rows.

## How `--retry-failed` works

When the founder adds new phenomena to the taxonomy, previously-untaggable reports may now have a viable match. The CLI flag clears the cap for the affected categories before classifying:

```bash
tsx scripts/classify-phenomena-batch.ts --category cryptids --retry-failed
tsx scripts/classify-phenomena-batch.ts --all --retry-failed
```

Under the hood:

```ts
await sb.from('reports')
  .update({ classifier_attempts: 0, classifier_skip: false })
  .eq('status', 'approved')
  .eq('category', category)
  .or('classifier_skip.eq.true,classifier_attempts.gt.0')
```

This affects only the category being processed (`--all` loops categories so it cascades naturally). The next pass gives every report in scope a fresh 3 tries against the new taxonomy.

## Defensive fallback (migration not yet applied)

The script can be deployed BEFORE the migration is run. On first call into `classifyCategory()`, `detectAttemptsColumns(sb)` probes:

```ts
const probe = await sb.from('reports').select('classifier_attempts, classifier_skip').limit(1)
```

If PostgREST returns `column does not exist`, the cached `attemptsColumnsPresent` flag is set to `false` and the script logs:

```
V11.17.96 attempt-tracking columns not detected (...) — falling back to V11.17.95 behavior.
  Run supabase/migrations/20260606_v111796_classifier_attempts.sql to enable.
```

In fallback mode:
- The filter falls back to V11.17.95 behavior (no `classifier_skip` / `classifier_attempts` clauses).
- The attempt bump + skip-flag write are skipped.
- `--retry-failed` logs a warning and continues.

The daily cron keeps working either way. The founder can apply the migration on their own schedule.

## Migration SQL — apply via Supabase Studio

```sql
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS classifier_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS classifier_skip     BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_reports_classifier_skip_attempts
  ON reports (classifier_attempts)
  WHERE status = 'approved' AND classifier_skip = FALSE;
```

Full file: `supabase/migrations/20260606_v111796_classifier_attempts.sql`.

The `ADD COLUMN IF NOT EXISTS` and `NOT NULL DEFAULT ...` form lets Postgres backfill the default in-place without a table rewrite — safe to run during cron hours.

## Verification

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "classify-phenomena-batch"
# (empty — clean)
```

Pre-existing unrelated TS errors in `src/pages/api/user/year-in-review.ts`, `src/pages/insights/index.tsx`, `src/pages/api/user/stats.ts`, and `src/pages/api/user/searches.ts` are untouched.

## Files

- `supabase/migrations/20260606_v111796_classifier_attempts.sql` — new migration
- `scripts/classify-phenomena-batch.ts` — V11.17.96 updates (constant + flag + probe + filter + bump + skip-flag)
- `docs/CLASSIFIER_ATTEMPTS_NOTES.md` — this file
