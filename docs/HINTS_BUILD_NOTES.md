# Hints renderer build notes — V11.17.65

End-to-end Hints pipeline: data-query executor, eligibility checker,
renderer with cadence rules, impressions table, API routes, and Lab UI
rail. Built against the existing `SEED_HINTS` pool (50 Hints) and the
locked `HintDataQuery` discriminated union (14 kinds).

## Files created

- `src/lib/lab/hints/data-query-executor.ts` — Dispatch one `HintDataQuery`
  against Supabase. Returns `{ token, value, denominator }` per query.
  All 14 kinds implemented; `cross_progression_pct` is a TODO stub.
- `src/lib/lab/hints/eligibility.ts` — Pure trigger-condition evaluator
  (phen_family, subfamily, required_descriptors, event_month_range,
  event_decade, within_miles/min_nearby_reports, min_experience_count,
  seasonal_window, tier_visibility).
- `src/lib/lab/hints/hint-renderer.ts` — Public `renderHintsForUser`
  pipeline. Loads user context, evaluates eligibility, executes queries
  in parallel, binds tokens via mustache-style substitution, applies
  cadence rules (7-day dedupe via `lab_hint_impressions`, max 1
  named-match per session, max 2 per category, fallback chain), caps
  at 6 cards per session.
- `supabase/migrations/20260604_lab_hint_impressions.sql` — Impressions
  table + indexes + RLS policies (users read/write own only).
- `src/components/lab/HintsRail.tsx` — Vertical stack of Hint cards.
  Title (Changa One), body, primary-purple CTA button, dismiss X,
  category-color accent strip on the left edge.
- `src/pages/api/lab/hints.ts` — GET endpoint: returns `RenderedHint[]`.
- `src/pages/api/lab/hints/impression.ts` — POST endpoint: logs
  `shown` / `cta_clicked` / `dismissed`.
- `scripts/_smoke-test-hints-renderer.ts` — Smoke test against the
  live DB; picks the first user with an approved report and renders
  Hints for them.

## Files modified

- `src/pages/lab.tsx` — Imported and mounted `<HintsRail />` on the
  Story tab between the RADAR `<LabConstellationTab />` and the
  `<YourSignalTab />` block.

## Coverage — 14 query kinds

Real implementations:

- `subpattern_match_pct`
- `descriptor_count`
- `geographic_proximity_count`
- `closest_match_meta`
- `decade_distribution_pct`
- `month_window_pct` (excludes year-only event_date_precision rows)
- `month_window_count` (same exclusion + start_day/end_day window)
- `cross_family_overlap_pct` (2- and 3-family variants)
- `region_decade_sparseness`
- `archive_growth_count`
- `archive_total_count`
- `witness_state_pct`
- `region_count`

TODO stub (suppressed via `{ value: null, denominator: 0 }`):

- `cross_progression_pct` — requires a CTE-style sweep over
  `submitted_by` cohorts with >=2 reports plus temporal ordering;
  per the schema comment the multi-experience cohort is likely
  under the 100-row denominator floor today. Will need either an
  RPC or a periodic materialized rollup before it can ship.

## DB schema assumptions to verify

1. **Descriptor storage path** — the executor scans `reports.tags`,
   `paradocs_assessment.descriptors` (array), and report title/summary/
   description text for descriptor-family keyword matches. The
   structured `paradocs_assessment` shape is still in flux; once the
   assessment pipeline locks its descriptor key path the
   `readReportTokens` helper in `data-query-executor.ts` should be
   tightened to read from the canonical key directly.

2. **`witness_state_at_event`** — confirmed as a generated column off
   `witness_profile->>'state_at_event'` (V10.7 migration). Most rows
   are NULL.

3. **`event_date_precision`** — used by `month_window_pct` /
   `month_window_count` to exclude year-only rows that fall back to
   Jan 1. The executor drops rows where precision is
   `'year' | 'decade' | 'unknown'`.

4. **Tier resolution** — copied verbatim from
   `your-signal/index.ts`. Reads `user_subscriptions` joined to
   `subscription_tiers` and maps `basic` / `pro` / `enterprise`.

## Typecheck

Clean for all touched files:

```
npx tsc --noEmit --project tsconfig.json 2>&1 \
  | grep -E "lab/hints|HintsRail|api/lab/hints"
```

returns no output. Pre-existing typecheck issues elsewhere in the
codebase are untouched.

## Smoke test result

Run against the live DB (`scripts/_smoke-test-hints-renderer.ts`)
picked user `94c8de7b-25ab-448d-a01a-ccffd015aed6` and rendered 3
fallback Hints — `general.editorial.archive_total_scale`,
`general.editorial.archive_growth`, and
`cross_category.editorial.descriptor_anchors`. All three rendered
correctly with bound tokens. The 30-day archive growth shows the full
170,675 because the mass-ingest backfill (#104) has `created_at` on
every row inside the last 30 days — expected behavior, not a renderer
bug.

## Founder follow-up before ship

- Apply the `20260604_lab_hint_impressions.sql` migration via
  Supabase Studio (not auto-applied by the codebase).
- Decide whether `archive_growth_count` should fall back to a
  different window (or be suppressed) while mass-ingest is in flight,
  or just let the founder-tier card surface real growth numbers later.
- Lock the `paradocs_assessment.descriptors` key path so the executor
  can read structured descriptors instead of relying on the tag/text
  fallback scan (today's path works but underestimates matches).
- Implement `cross_progression_pct` once the multi-experience user
  cohort clears the 100-row denominator floor.
