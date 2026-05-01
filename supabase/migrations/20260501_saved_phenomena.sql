-- =====================================================================
-- saved_phenomena — parallel to saved_reports for /discover (Today) feed.
--
-- Background: /discover serves both reports AND phenomena. Right-swipe ("save")
-- on a PhenomenonCard was previously POSTing the phenomenon UUID into
-- saved_reports.report_id, which the FK rejected. The error was silently
-- swallowed and the user saw the "✦ Saved" flash with no persistence.
--
-- This migration adds a parallel table for phenomena saves with identical
-- shape to saved_reports (collection_name, RLS, etc.) so Lab → SAVES can
-- surface both kinds of saves uniformly.
-- =====================================================================

CREATE TABLE IF NOT EXISTS saved_phenomena (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phenomenon_id UUID NOT NULL REFERENCES phenomena(id) ON DELETE CASCADE,
  collection_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, phenomenon_id)
);

-- Lookup index for "all of user's saved phenomena, newest first"
CREATE INDEX IF NOT EXISTS saved_phenomena_user_created_idx
  ON saved_phenomena(user_id, created_at DESC);

-- Lookup index for "is this phenomenon saved by this user?"
CREATE INDEX IF NOT EXISTS saved_phenomena_lookup_idx
  ON saved_phenomena(user_id, phenomenon_id);

-- Lookup index for collection-filtered listings
CREATE INDEX IF NOT EXISTS saved_phenomena_collection_idx
  ON saved_phenomena(user_id, collection_name)
  WHERE collection_name IS NOT NULL;

-- =====================================================================
-- Row Level Security
-- =====================================================================
ALTER TABLE saved_phenomena ENABLE ROW LEVEL SECURITY;

-- A user can SELECT their own saved phenomena
DROP POLICY IF EXISTS saved_phenomena_select_own ON saved_phenomena;
CREATE POLICY saved_phenomena_select_own ON saved_phenomena
  FOR SELECT
  USING (auth.uid() = user_id);

-- A user can INSERT their own saved phenomena
DROP POLICY IF EXISTS saved_phenomena_insert_own ON saved_phenomena;
CREATE POLICY saved_phenomena_insert_own ON saved_phenomena
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- A user can UPDATE their own saved phenomena (e.g. move between collections)
DROP POLICY IF EXISTS saved_phenomena_update_own ON saved_phenomena;
CREATE POLICY saved_phenomena_update_own ON saved_phenomena
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- A user can DELETE their own saved phenomena
DROP POLICY IF EXISTS saved_phenomena_delete_own ON saved_phenomena;
CREATE POLICY saved_phenomena_delete_own ON saved_phenomena
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypasses RLS (default Supabase behavior; reaffirmed here).
GRANT ALL ON saved_phenomena TO service_role;

-- =====================================================================
-- Comment for the catalog
-- =====================================================================
COMMENT ON TABLE saved_phenomena IS
  'Per-user saved encyclopedia entries. Parallel to saved_reports. '
  'Created May 2026 to fix the /discover save bug where phenomenon '
  'saves were silently violating the saved_reports.report_id FK.';
