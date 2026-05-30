-- =====================================================================
-- V11.17.48 — phenomenon_trending_30d
--
-- Per panel memo (docs/TOP_PHENOMENA_ROW_REDESIGN_PANEL.md):
-- the "Most-tagged this month" row on /explore needs a defensible
-- trailing-30-day computation, not the all-time report_count sort
-- it currently uses.
--
-- Sam's design:
--   - Materialized view, refreshed nightly at 03:00 UTC by
--     /api/cron/refresh-trending-phenomena.
--   - Straight count: reports tagged with phenomenon X where
--     reports.created_at >= now() - interval '30 days'.
--   - No decay, no normalization, no weighting (panel explicitly
--     banned these — too gameable, requires tuning we haven't earned).
--   - Approved reports only.
--   - REFRESH CONCURRENTLY so reads aren't blocked during refresh.
--     Requires a UNIQUE index, hence the (phenomenon_id) one below.
--
-- Read path (api/feed/personalized.ts):
--   JOIN phenomena ON phenomenon_trending_30d.phenomenon_id = phenomena.id
--   ORDER BY reports_tagged_30d DESC, phenomena.report_count DESC, phenomena.name ASC
--   LIMIT 8
--
-- Falls back to all-time report_count sort if the view is empty or
-- the join returns fewer than 8 rows (the API handles that).
-- =====================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.phenomenon_trending_30d AS
SELECT
  rp.phenomenon_id,
  COUNT(DISTINCT rp.report_id)::INTEGER AS reports_tagged_30d,
  NOW() AS computed_at
FROM public.report_phenomena rp
JOIN public.reports r ON r.id = rp.report_id
JOIN public.phenomena p ON p.id = rp.phenomenon_id
WHERE r.status = 'approved'
  AND r.created_at >= NOW() - INTERVAL '30 days'
  AND p.status = 'active'
GROUP BY rp.phenomenon_id
WITH DATA;

-- UNIQUE index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS idx_phen_trending_30d_phen_id
  ON public.phenomenon_trending_30d (phenomenon_id);

-- The hot read path: ORDER BY reports_tagged_30d DESC, fetched LIMIT 8.
CREATE INDEX IF NOT EXISTS idx_phen_trending_30d_count
  ON public.phenomenon_trending_30d (reports_tagged_30d DESC);

COMMENT ON MATERIALIZED VIEW public.phenomenon_trending_30d IS
  'V11.17.48 — trailing-30-day count of approved reports tagged with each phenomenon. Refreshed nightly by /api/cron/refresh-trending-phenomena. Backs the "Most-tagged this month" row on /explore.';

-- =====================================================================
-- Refresh function — called by /api/cron/refresh-trending-phenomena
-- =====================================================================
-- The Supabase JS client can't issue REFRESH MATERIALIZED VIEW
-- directly, so we expose it as an RPC. SECURITY DEFINER lets the
-- service-role caller invoke without needing materialized-view-owner
-- privileges.
--
-- Tries CONCURRENTLY first (doesn't block reads). Falls back to a
-- blocking refresh on the first call when the view has no rows yet —
-- CONCURRENTLY requires at least one row plus the UNIQUE index.

CREATE OR REPLACE FUNCTION public.refresh_phenomenon_trending_30d()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_started TIMESTAMPTZ := clock_timestamp();
  v_row_count INTEGER;
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.phenomenon_trending_30d;
  EXCEPTION
    WHEN OTHERS THEN
      -- Initial-bootstrap path: CONCURRENTLY needs prior data + the
      -- unique index. If we trip the empty-set case, do a blocking
      -- refresh instead.
      REFRESH MATERIALIZED VIEW public.phenomenon_trending_30d;
  END;

  SELECT COUNT(*) INTO v_row_count FROM public.phenomenon_trending_30d;

  RETURN jsonb_build_object(
    'ok', true,
    'rows', v_row_count,
    'duration_ms', EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_phenomenon_trending_30d() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_phenomenon_trending_30d() TO service_role;
