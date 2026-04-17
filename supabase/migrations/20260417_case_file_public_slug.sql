-- ============================================================================
-- Case file public sharing: adds a URL-safe slug that, when present, makes
-- a case file readable by anyone via /cases/public/{slug}.
-- ============================================================================

ALTER TABLE constellation_case_files
  ADD COLUMN IF NOT EXISTS public_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_case_files_public_slug
  ON constellation_case_files(public_slug)
  WHERE public_slug IS NOT NULL;

DROP POLICY IF EXISTS case_files_select_public_slug ON constellation_case_files;
CREATE POLICY case_files_select_public_slug
  ON constellation_case_files
  FOR SELECT
  USING (public_slug IS NOT NULL);

DROP POLICY IF EXISTS cfa_select_public ON constellation_case_file_artifacts;
CREATE POLICY cfa_select_public
  ON constellation_case_file_artifacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM constellation_case_files cf
      WHERE cf.id = case_file_id
        AND cf.public_slug IS NOT NULL
    )
  );

DROP POLICY IF EXISTS artifacts_select_via_public_case_file ON constellation_artifacts;
CREATE POLICY artifacts_select_via_public_case_file
  ON constellation_artifacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM constellation_case_file_artifacts cfa
      JOIN constellation_case_files cf ON cf.id = cfa.case_file_id
      WHERE cfa.artifact_id = constellation_artifacts.id
        AND cf.public_slug IS NOT NULL
    )
  );
