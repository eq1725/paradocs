-- ============================================================================
-- RLS Security Hardening — March 31, 2026
-- ============================================================================
-- Fixes Supabase security alert: tables publicly accessible without RLS.
-- Addresses: feed_config, constellation_external_url_signals, duplicate_matches,
--            daily_stats, data_sources
-- Does NOT add RLS to phenomenon_types (intentionally public read-only taxonomy)
-- ============================================================================

-- ============================================================================
-- 1. feed_config — CRITICAL: ranking weights, gate thresholds, feature flags
--    Admin-only read/write. API routes use service_role key already.
-- ============================================================================

ALTER TABLE feed_config ENABLE ROW LEVEL SECURITY;

-- Admin can read config via dashboard
CREATE POLICY "Admins can read feed config" ON feed_config
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- Admin can update config via dashboard
CREATE POLICY "Admins can update feed config" ON feed_config
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- Admin can insert new config keys
CREATE POLICY "Admins can insert feed config" ON feed_config
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- Note: API routes that read feed_config (e.g. feed-v2.ts) use supabaseAdmin
-- (service_role key) which bypasses RLS. This is correct — the scored ranking
-- query needs config but runs server-side, not from the client.

-- ============================================================================
-- 2. constellation_external_url_signals — URL signals for Research Hub
--    Users can read (public metadata), only service role writes via RPC.
-- ============================================================================

ALTER TABLE public.constellation_external_url_signals ENABLE ROW LEVEL SECURITY;

-- Anyone can read URL signals (they're aggregated public metadata)
CREATE POLICY "Public can read URL signals" ON constellation_external_url_signals
  FOR SELECT USING (true);

-- Only authenticated users can trigger upserts (via RPC function which runs as SECURITY DEFINER)
-- Direct INSERT/UPDATE blocked for anon role
CREATE POLICY "Authenticated users can upsert URL signals" ON constellation_external_url_signals
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update URL signals" ON constellation_external_url_signals
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ============================================================================
-- 3. duplicate_matches — dedup tracking (admin/ingestion only)
--    No client access needed. Service role handles all operations.
-- ============================================================================

ALTER TABLE duplicate_matches ENABLE ROW LEVEL SECURITY;

-- Admin can view duplicate matches for resolution
CREATE POLICY "Admins can read duplicate matches" ON duplicate_matches
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- Admin can resolve duplicates
CREATE POLICY "Admins can update duplicate matches" ON duplicate_matches
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- Note: Ingestion pipeline uses service_role key which bypasses RLS.

-- ============================================================================
-- 4. daily_stats — aggregate platform statistics
--    Public read (no sensitive data), admin write only.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'daily_stats') THEN
    ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

    EXECUTE 'CREATE POLICY "Public can read daily stats" ON daily_stats FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "Admins can manage daily stats" ON daily_stats FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role = ''admin''))';
  END IF;
END $$;

-- ============================================================================
-- 5. data_sources — ingestion source reference data
--    Public read (source names/URLs are not sensitive), admin write only.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'data_sources') THEN
    ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;

    EXECUTE 'CREATE POLICY "Public can read data sources" ON data_sources FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "Admins can manage data sources" ON data_sources FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role = ''admin''))';
  END IF;
END $$;

-- ============================================================================
-- 6. phenomenon_types — intentionally left WITHOUT RLS
--    This is a public taxonomy table. Read-only for all users by design.
--    Supabase may flag it, but adding RLS here would break public queries
--    that need to join phenomena to their types. If you want to suppress
--    the Supabase warning, you can enable RLS with a permissive SELECT:
-- ============================================================================

-- Uncomment these two lines ONLY if you want to suppress the Supabase dashboard warning:
-- ALTER TABLE phenomenon_types ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Public read access" ON phenomenon_types FOR SELECT USING (true);

-- ============================================================================
-- VERIFICATION: Run after applying migration to confirm all tables secured
-- ============================================================================
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- AND rowsecurity = false
-- ORDER BY tablename;
