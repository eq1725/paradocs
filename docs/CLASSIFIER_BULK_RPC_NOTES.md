# V11.17.97 — Bulk RPC for classifier_attempts

Replaces V11.17.96's N parallel `UPDATE` round-trips per chunk with two Postgres function calls. At the 10k+ reports/day scale, this collapses the chunk-completion bump from O(N) network hops to O(1).

## Why

V11.17.96 (`scripts/classify-phenomena-batch.ts`) introduced `reports.classifier_attempts` tracking. After each Anthropic batch chunk completed, the script had to:

1. Read the current `classifier_attempts` for every report in the chunk.
2. Issue one `UPDATE` per report with `classifier_attempts + 1`.
3. Probe `report_phenomena` to find capped reports with no junction rows.
4. Bulk-update `classifier_skip = TRUE` for those.

Step 2 was the bottleneck — `Promise.all` over the chunk fires UPDATE round-trips in parallel but each still pays full network latency (~5-20ms). At 4000-report chunks that's tolerable. At 10k+ reports/day across multiple chunks it stacks to minutes of pure network wait.

```ts
// V11.17.96 — N parallel UPDATEs (N round-trips)
await Promise.all(current.map(r =>
  sb.from('reports').update({ classifier_attempts: r.classifier_attempts + 1 }).eq('id', r.id)
));
```

V11.17.97 moves the per-row arithmetic into Postgres. One `rpc()` call sends the whole UUID array and the database does `UPDATE … SET classifier_attempts = classifier_attempts + 1 WHERE id = ANY(report_ids)` in one statement.

## What the functions do

### `bump_classifier_attempts(report_ids uuid[]) → void`

Single statement: `UPDATE reports SET classifier_attempts = classifier_attempts + 1 WHERE id = ANY(report_ids)`. Called once per chunk after the chunk's classifier results are persisted to `report_phenomena`. `SECURITY DEFINER` so the service-role-keyed PostgREST client can call it without RLS interference.

### `mark_classifier_skip_for_capped(report_ids uuid[], cap int) → TABLE(skipped_count int)`

Combines the cap-check + junction-probe + skip-flag-update into one statement. CTE-based:

- `targets` — IDs in `report_ids` whose `classifier_attempts >= cap` AND have zero `report_phenomena` rows.
- `updated` — `UPDATE reports SET classifier_skip = TRUE` over those IDs.
- final `SELECT` returns the count for logging.

Must be called AFTER `bump_classifier_attempts` (so the cap check sees the bumped counter) and AFTER the chunk's junction upserts (so the `NOT EXISTS` check sees the freshly-written tags).

## Migration SQL (paste into Supabase Studio)

File: `supabase/migrations/20260606_v111797_bump_classifier_attempts_fn.sql`

```sql
CREATE OR REPLACE FUNCTION bump_classifier_attempts(report_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE reports
  SET classifier_attempts = classifier_attempts + 1
  WHERE id = ANY(report_ids);
$$;

COMMENT ON FUNCTION bump_classifier_attempts IS
  'V11.17.97 — Bulk increment classifier_attempts for a UUID array. Called by scripts/classify-phenomena-batch.ts after each batch chunk completes.';

CREATE OR REPLACE FUNCTION mark_classifier_skip_for_capped(
  report_ids uuid[],
  cap int
)
RETURNS TABLE(skipped_count int)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH targets AS (
    SELECT r.id
    FROM reports r
    WHERE r.id = ANY(report_ids)
      AND r.classifier_attempts >= cap
      AND NOT EXISTS (
        SELECT 1 FROM report_phenomena rp WHERE rp.report_id = r.id
      )
  ),
  updated AS (
    UPDATE reports
    SET classifier_skip = TRUE
    WHERE id IN (SELECT id FROM targets)
    RETURNING id
  )
  SELECT COUNT(*)::int FROM updated;
$$;

COMMENT ON FUNCTION mark_classifier_skip_for_capped IS
  'V11.17.97 — Bulk-set classifier_skip=TRUE for reports that have hit cap AND have zero junction rows. Returns count of newly-skipped reports.';
```

Depends on `reports.classifier_attempts` + `reports.classifier_skip` (added by `20260606_v111796_classifier_attempts.sql`). Run V11.17.96 first if it's not already applied.

## Performance comparison

| Chunk size | V11.17.96 round-trips | V11.17.97 round-trips | Wall-clock @ 10ms RTT |
|---|---|---|---|
| 100 reports | 100 | 2 | 1000ms → 20ms |
| 4000 reports | 4000 | 2 | 40s → 20ms |
| 10000 reports | 10000 | 2 | 100s → 20ms |

(V11.17.96 numbers above are with `Promise.all`-parallel UPDATEs, which Postgres still serializes on the connection pool. The "100s" assumes pool saturation at typical Supabase pooler settings; actual latency varies.)

The two RPCs are the only DB work per chunk regardless of report count, so the bump step is now constant-time relative to chunk size.

## Defensive fallback

The script probes `bump_classifier_attempts` once at startup (with an empty UUID array — a no-op call that returns void on success). Three outcomes:

- **RPCs present** → use bulk RPC path. Logs `classifier_attempts +1 for N reports (bulk RPC)`.
- **RPCs missing** (404 / "function does not exist") → log warning pointing at the migration file, set `bulkRpcAvailable=false`, fall back to V11.17.96 per-row read-modify-write path for the whole run. Logs `classifier_attempts +1 for N reports (V11.17.96 fallback path)`.
- **RPC call errors mid-run** (e.g. transient DB error) → same fallback inline for that chunk only.

So the script ships safely BEFORE the migration runs — the founder can deploy code first, then paste the SQL in Supabase Studio at their convenience.

## Files touched

- `supabase/migrations/20260606_v111797_bump_classifier_attempts_fn.sql` — the two functions.
- `scripts/classify-phenomena-batch.ts` — `detectBulkRpc()` probe, `bumpAttemptsFallback()` helper, RPC-first chunk-completion handler.

## Verify

```bash
cd /sessions/affectionate-tender-fermi/mnt/paradocs
npx tsc --noEmit --project tsconfig.json 2>&1 | grep classify-phenomena-batch
# (no output = clean)
```
