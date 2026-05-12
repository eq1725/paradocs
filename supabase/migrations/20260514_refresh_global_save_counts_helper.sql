-- ============================================================
-- V10.3 follow-up — refresh_global_save_counts() helper
--
-- The nightly cron at /api/cron/refresh-global-save-counts
-- calls this via Supabase RPC. We need SECURITY DEFINER so
-- the cron's service-role key can REFRESH a MATERIALIZED
-- VIEW (a DDL-style op that the normal authenticated role
-- can't run).
--
-- REFRESH MATERIALIZED VIEW CONCURRENTLY needs the unique
-- index that the V10.3 migration created
-- (idx_global_save_counts_kind_id). CONCURRENTLY means reads
-- against global_save_counts continue while the refresh
-- happens — no overlap-scoring outage during the nightly run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_global_save_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.global_save_counts;
END;
$$;

-- Service role + authenticated role can call this. We gate
-- the cron endpoint on CRON_SECRET / x-admin-key so authenticated
-- access here doesn't expose it to end users.
REVOKE ALL ON FUNCTION public.refresh_global_save_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_global_save_counts() TO service_role;

COMMENT ON FUNCTION public.refresh_global_save_counts() IS
  'V10.3 follow-up — SECURITY DEFINER wrapper around REFRESH MATERIALIZED VIEW CONCURRENTLY public.global_save_counts. Called nightly by the /api/cron/refresh-global-save-counts cron. CONCURRENTLY means reads continue during refresh.';
