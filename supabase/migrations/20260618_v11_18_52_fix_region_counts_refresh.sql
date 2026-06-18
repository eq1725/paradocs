-- ============================================================
-- V11.18.52 — Make report_region_counts refresh actually work.
--
-- Symptom: every category's map "regions" (choropleth) layer under-painted or
-- showed almost nothing (e.g. cryptids painted only the US as "Fewer"). The MV
-- had silently gone stale — 268 rows summing to ~7.4k reports, while there are
-- ~150k approved reports WITH country_code.
--
-- Root cause: refresh_region_counts() ran
--     REFRESH MATERIALIZED VIEW CONCURRENTLY report_region_counts;
-- CONCURRENTLY requires a UNIQUE index on the MV. The intended unique index
-- (country_code, COALESCE(state_province,''), category) is NOT actually unique:
-- a single country_code maps to multiple country names (GB -> "United Kingdom",
-- "Scotland", "England"), and the MV GROUPs BY country too — so two rows can
-- share (country_code, state_province, category) while differing in country.
-- The index therefore never built, CONCURRENTLY raised
--     55000: cannot refresh materialized view concurrently
-- and the function's `EXCEPTION WHEN OTHERS` block swallowed it, so refresh
-- reported success while the view stayed frozen at an old snapshot.
--
-- Fix: refresh NON-concurrently. No unique index required, reliable across PG
-- versions. report_region_counts is a small aggregate; a plain refresh takes
-- ~1-2s and only briefly locks it for reads — fine at a periodic cadence. We
-- also keep a logged WARNING on failure (so ingest runs don't abort) instead of
-- a totally silent swallow.
--
-- NOTE: this does NOT add a scheduler. Pair with a periodic call to
-- refresh_region_counts() — see the pg_cron snippet at the bottom (commented;
-- enable the pg_cron extension first), or call it from the ingest pipeline.
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_region_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Non-concurrent: no unique index needed; always succeeds for a healthy MV.
  REFRESH MATERIALIZED VIEW report_region_counts;
EXCEPTION WHEN OTHERS THEN
  -- Log (visible in Postgres logs) but don't abort the caller (e.g. an
  -- ingestion run). With the non-concurrent refresh this should not trip.
  RAISE WARNING 'refresh_region_counts failed: %', SQLERRM;
END;
$$;

-- Rebuild immediately with current data so the choropleths populate now.
REFRESH MATERIALIZED VIEW report_region_counts;

-- ── Keep it fresh automatically (run once, after enabling pg_cron) ──────────
-- Supabase: enable the pg_cron extension (Dashboard ▸ Database ▸ Extensions),
-- then run:
--
--   select cron.schedule(
--     'refresh-region-counts',
--     '*/30 * * * *',                       -- every 30 minutes
--     $$ select refresh_region_counts(); $$
--   );
--
-- (Alternatively, call select refresh_region_counts() at the end of each
-- ingest/auto-approve batch — the ingest scripts already reference it.)
