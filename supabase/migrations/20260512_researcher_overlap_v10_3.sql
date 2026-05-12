-- ============================================================
-- V10.3 — Researcher Overlap (QA #6)
--
-- Promotes the "Researcher overlap" stat in the Research Pulse
-- box from a single number into a real social mechanic. Users
-- can discover other Paradocs members whose save library
-- overlaps with their own — but ONLY when the overlap is
-- genuinely meaningful (IDF-weighted, with quality floors so
-- two strangers who both saved Roswell don't trigger a match).
--
-- What this migration adds:
--   1. profiles.researcher_overlap_visible — opt-in/opt-out
--      flag. Default ON. If false, the user never appears in
--      another user's overlap list AND their own list returns
--      empty (mutual courtesy).
--   2. Indexes on the three save tables (saved_reports,
--      saved_phenomena, constellation_artifacts) that the
--      overlap scoring query walks.
--   3. global_save_counts materialized view — pre-aggregated
--      "how many users saved this item" across all three save
--      surfaces. Refreshed nightly. Used as the denominator in
--      the IDF rarity weighting (rare saves count for a lot,
--      Roswell counts for ~nothing).
--
-- Scoring logic lives in src/lib/researcher-overlap.ts, NOT in
-- a SQL view — we want to be able to tune thresholds from
-- the admin dashboard without a migration.
-- ============================================================

-- 1) Opt-in/opt-out flag --------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS researcher_overlap_visible BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.researcher_overlap_visible IS
  'When true, the user can appear in other researchers'' overlap lists AND can see their own overlaps. Default true. Toggle in Account → Privacy.';

-- 2) Helpful indexes for the overlap query --------------------
-- saved_reports already has an index on user_id from the
-- 001_initial_schema migration. Add the reverse (report_id ->
-- users) so we can efficiently find "everyone else who saved
-- this report" given a single report_id.

CREATE INDEX IF NOT EXISTS idx_saved_reports_report_id_user
  ON public.saved_reports (report_id, user_id);

CREATE INDEX IF NOT EXISTS idx_saved_phenomena_phenomenon_id_user
  ON public.saved_phenomena (phenomenon_id, user_id);

-- constellation_artifacts.external_url_hash is already indexed
-- (per the 20260311 migration); no need to duplicate.

-- 3) Global save counts (IDF denominator) ---------------------
--
-- Materialized view union'd across all three save surfaces.
-- Each row: (item_kind, item_id, save_count). item_kind is one
-- of 'report' | 'phenomenon' | 'external_url_hash'. Refresh
-- nightly via pg_cron or a Vercel cron route.
--
-- A MATERIALIZED VIEW is fine here because:
--   - Reads happen far more often than writes (every overlap
--     query reads from this, but it only needs to be fresh to
--     the day).
--   - The underlying COUNT(*) queries would be expensive to
--     run on every overlap request at 10M+ saves scale.
--   - REFRESH MATERIALIZED VIEW CONCURRENTLY lets us refresh
--     without locking reads (needs a unique index).

DROP MATERIALIZED VIEW IF EXISTS public.global_save_counts CASCADE;

CREATE MATERIALIZED VIEW public.global_save_counts AS
  SELECT
    'report'::TEXT AS item_kind,
    report_id::TEXT AS item_id,
    COUNT(DISTINCT user_id)::BIGINT AS save_count
  FROM public.saved_reports
  GROUP BY report_id
  UNION ALL
  SELECT
    'phenomenon'::TEXT AS item_kind,
    phenomenon_id::TEXT AS item_id,
    COUNT(DISTINCT user_id)::BIGINT AS save_count
  FROM public.saved_phenomena
  GROUP BY phenomenon_id
  UNION ALL
  SELECT
    'external_url_hash'::TEXT AS item_kind,
    external_url_hash AS item_id,
    COUNT(DISTINCT user_id)::BIGINT AS save_count
  FROM public.constellation_artifacts
  WHERE external_url_hash IS NOT NULL
    AND source_type <> 'paradocs_report'
  GROUP BY external_url_hash;

CREATE UNIQUE INDEX idx_global_save_counts_kind_id
  ON public.global_save_counts (item_kind, item_id);

COMMENT ON MATERIALIZED VIEW public.global_save_counts IS
  'Per-item save counts unioned across saved_reports, saved_phenomena, and constellation_artifacts (external URLs only). Denominator for IDF rarity weighting in researcher-overlap scoring. Refresh nightly.';

-- Initial population so the first overlap request has data.
REFRESH MATERIALIZED VIEW public.global_save_counts;

-- 4) RLS / read access ----------------------------------------
--
-- global_save_counts contains no personally-identifying data —
-- it's purely aggregate counts. Allow authenticated users to
-- read it; do NOT expose to anon.

GRANT SELECT ON public.global_save_counts TO authenticated;
