-- ============================================================
-- V10.9.A.1 — refresh_region_counts() function
--
-- Wraps REFRESH MATERIALIZED VIEW CONCURRENTLY in a SECURITY
-- DEFINER function so the ingestion engine can call it via
-- supabase.rpc('refresh_region_counts') without needing the
-- direct DDL privilege (the service-role key has those rights,
-- but funneling everything through a named function is cleaner
-- and gives us one place to add logging / instrumentation later).
--
-- Idempotent. Safe to run inside other transactions (CONCURRENTLY
-- requires no active transaction, but supabase.rpc() opens its
-- own connection so this is fine).
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_region_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY report_region_counts;
EXCEPTION WHEN OTHERS THEN
  -- Soft fail — the engine should never abort an ingestion run
  -- because the view refresh hit a transient lock or similar.
  RAISE WARNING 'refresh_region_counts failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION refresh_region_counts IS
  'V10.9.A.1 — refreshes the report_region_counts materialized view CONCURRENTLY. Called by the ingestion engine after each successful run so the explore-map Region Totals panel stays fresh during mass ingest. SECURITY DEFINER so non-superuser callers can refresh.';

-- Grant execute to the service role + authenticated users. The
-- function itself only reads from / refreshes the view; it doesn't
-- expose any new data.
GRANT EXECUTE ON FUNCTION refresh_region_counts() TO service_role;
GRANT EXECUTE ON FUNCTION refresh_region_counts() TO authenticated;
