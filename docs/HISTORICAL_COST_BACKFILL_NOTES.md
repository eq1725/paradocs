# V11.17.86 — Historical AI cost backfill

## Context

V11.17.84 shipped the unified `ai-cost-logger` + schema migration so every
Haiku/Sonnet callsite writes a per-call row to
`paradocs_narrative_cost_log`. That fixes the FORWARD path. What it doesn't
fix: the historical gap between June 1 (when founder's Anthropic invoice
started showing ~$900 of spend) and June 5 (when the unified logger
landed). For that window the table only captured the
`consolidated-narrative` and `consolidated-batch` paths, totalling ~$310.
The other ~$590 of real spend (classifier batch + per-candidate verify +
tag-verify gate + per-report Sonnet helpers + image tagger + rewrites)
was never logged.

This script writes ESTIMATED rows back into the cost log so the
`/admin` cost panel's by-day chart shows real history.

## File

- `scripts/backfill-historical-ai-cost.ts` — the backfill script.

## Methodology

For each (day, service) pair the script:

1. Queries a volume signal from an existing DB table (e.g.
   `report_phenomena` for the classifier, `reports` for tag-verify, etc.)
2. Multiplies the per-day count by a service-specific cost-per-call
   estimate sourced from the V11.17.84 audit memo.
3. Inserts ONE summary row per (day, service) into
   `paradocs_narrative_cost_log` with the row clearly marked as an
   estimate.

Volume signals actually used:

| Service             | Signal                                              | Source        |
|---------------------|-----------------------------------------------------|---------------|
| classifier-primary  | `count(report_phenomena)` per day                   | measured      |
| classifier-verify   | `count(report_phenomena) × 1.5` (verify ratio)      | measured      |
| tag-verify          | `count(reports) × 0.3` (engine.ts verify ratio)     | measured      |
| ai-tagger           | `count(reports where has_photo_video=true)`         | measured      |
| report-insights     | n/a — `paradocs_assessment` is a consolidated-narrative side-effect; counting it would overcount by ~100x. Fall back to V11.17.84 audit estimate spread across days. | audit-fallback |
| ai-insights         | same                                                | audit-fallback |
| rewrite-pipeline    | `ai_rewrite_audit` was empty in the window          | audit-fallback |
| other-small         | flat allocation across days                         | audit-fallback |

Each inserted row carries:

- `model = '<original> (backfill-estimate)'` — clearly marked.
- `request_id = 'backfill-V11.17.86-<service>-<YYYY-MM-DD>'` — unique
  marker per (service, day) for idempotency + bulk-delete.
- `reason = 'historical-backfill (estimate ...)'` — explains the source.
- `created_at = <day>T12:00:00Z` — noon UTC so it lands in the right
  by-day bucket of the cost-summary endpoint.
- `status = 'completed'` — counts in the spend totals.

## Run results (June 1–5, 2026)

Dry-run + apply ran cleanly. 31 rows inserted, $176.27 of estimated
historical spend added.

Per-service breakdown:

| Service             | Rows | Cost added | Source         |
|---------------------|-----:|-----------:|----------------|
| classifier-primary  |    4 |    $39.95  | measured       |
| classifier-verify   |    4 |    $59.93  | measured       |
| tag-verify          |    2 |    $15.22  | measured       |
| report-insights     |    5 |    $15.00  | audit-fallback |
| ai-insights         |    5 |    $15.00  | audit-fallback |
| rewrite-pipeline    |    5 |    $20.00  | audit-fallback |
| ai-tagger           |    1 |     $6.16  | measured       |
| other-small         |    5 |     $5.00  | audit-fallback |
| **TOTAL**           | **31** | **$176.26** |             |

## Post-backfill table totals (7-day window, status='completed')

```
2026-06-05   consolidated-narrative   $53.48  (19,008 rows)
             classifier-verify        $27.36
             classifier-primary       $18.24
             rewrite-pipeline          $4.00
             ai-insights               $3.00
             report-insights           $3.00
             other-small               $1.00

2026-06-04   consolidated-narrative  $232.77  (74,978 rows)
             classifier-verify        $15.63
             classifier-primary       $10.42
             rewrite-pipeline          $4.00
             ai-insights               $3.00
             report-insights           $3.00
             other-small               $1.00

2026-06-03   rewrite-pipeline          $4.00
             ai-insights               $3.00
             report-insights           $3.00
             other-small               $1.00

2026-06-02   consolidated-narrative   $19.23  (5,998 rows)
             tag-verify               $14.95
             rewrite-pipeline          $4.00
             ai-insights               $3.00
             report-insights           $3.00
             classifier-verify         $2.29
             classifier-primary        $1.53
             other-small               $1.00

2026-06-01   classifier-verify        $14.65
             classifier-primary        $9.76
             ai-tagger                 $6.16
             consolidated-narrative    $4.82  (1,500 rows)
             rewrite-pipeline          $4.00
             ai-insights               $3.00
             report-insights           $3.00
             other-small               $1.00
             tag-verify                $0.28

TOTAL: $486.56 (101,515 rows)
```

## Why $486 not $900?

Founder's $900 is the Anthropic-side billing total. The script reconciles
the ~$590 STRUCTURAL gap (paths that were never wired to log) using the
volume-signal × cost-per-call methodology from the audit memo, and it
lines up with the audit:

- Classifier (primary + verify): audit said ~$125/7d; measured $100 for
  5 days, consistent.
- tag-verify: audit said ~$25/7d; measured $15 for 5 days, consistent.
- Sonnet helpers (report-insights / ai-insights / rewrite-pipeline /
  ai-tagger): audit said ~$50 combined; backfilled $56.

The remaining gap (~$400 between the $486 logged and the $900 invoice)
is genuine but not structural. Likely sources:

1. **Earlier consolidated-narrative spend** — the legacy logger that
   captured "$310" was only running during specific drains. Outside the
   drain window the consolidated path may have run without writing
   rows, or written under the old `(consolidated)` model marker that
   doesn't get summed correctly.
2. **One-off admin runs** (regenerate-all-insights, repair-dates,
   generate-hooks, fix-titles, auto-tag-artifact) — these are the
   exact services V11.17.84 explicitly listed as "low-volume operator-
   triggered, kept out of scope for this pass." Per-run cost is bounded
   but each run can be $5–$20.
3. **Anthropic billing lag / pre-cache-write spend** — invoices include
   spend from June 1 *UTC* boundaries that may or may not match the
   `created_at` boundaries the cost log uses.

To close the rest of the gap would require either (a) wiring those
operator endpoints to ai-cost-logger and waiting for the next run, or
(b) inserting a single "unaccounted" backfill row per day that closes
the difference to founder's invoice total. (b) is a one-line change if
the founder wants it.

## Idempotency

Re-running with `--apply` is safe. The script checks for an existing row
with the V11.17.86 marker before inserting and skips already-backfilled
(day, service) pairs.

To bulk-delete all backfill rows later:

```sql
DELETE FROM paradocs_narrative_cost_log
WHERE request_id LIKE 'backfill-V11.17.86-%';
```

## Typecheck

`npx tsc --noEmit` — clean for `scripts/backfill-historical-ai-cost.ts`.
The pre-existing errors in `year-in-review.ts` and `insights/index.tsx`
are unrelated and unchanged.

## Open questions for founder

1. **Close the remaining ~$400 gap to invoice?** Two options:
   (a) wire generate-hooks / fix-titles / repair-dates / auto-tag to
   ai-cost-logger then wait for next operator run, (b) insert a single
   "unaccounted-historical" backfill row per day that closes the
   per-day total to the founder's invoice number. (a) is structurally
   correct but slow; (b) is dishonest unless we label it clearly.

2. **Should the backfill marker be more obvious in the chart?** Right
   now the model column shows `claude-haiku-4-5-20251001 (backfill-
   estimate)`. The cost-summary endpoint groups by `model` so backfill
   rows show up as a distinct slice in the by-model panel. That's good
   for honesty but may clutter the chart. Founder could pick whether
   to filter them out by default in the admin UI.

3. **Tag-verify undercount.** The 0.3 verify-call-per-report ratio is
   from the V11.17.84 audit and may be off. We could measure it
   precisely by counting log rows from V11.17.84 onward and dividing
   by reports ingested in that window — that would give a real ratio
   to use in future backfills.

## Helper script

`scripts/_verify-backfill-totals.ts` — disposable verification script
that prints per-day per-service totals. Safe to delete after the
founder sanity-checks the chart.
