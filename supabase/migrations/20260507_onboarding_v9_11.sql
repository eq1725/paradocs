-- =====================================================================
-- V9.11 — onboarding flow schema additions.
--
-- Two columns on `reports`:
--
--   visibility — TEXT, one of 'public' | 'radar_only' | 'private'
--                Default 'public' for backward-compat with existing
--                approved reports (they keep showing in browse feed).
--                New onboarding submissions default to 'radar_only'.
--                'private' = only the submitter sees it; doesn't show
--                in RADAR matching either.
--
--   onboarding_first_report — BOOLEAN, marks reports that came in via
--                /start (the new onboarding flow). Useful for analytics
--                + retention measurement.
--
-- Both columns are additive; existing rows get the defaults. No
-- destructive change.
-- =====================================================================

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'radar_only', 'private')),
  ADD COLUMN IF NOT EXISTS onboarding_first_report BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index for RADAR matching: faster lookups for reports that
-- can match (everything except 'private').
CREATE INDEX IF NOT EXISTS reports_visibility_status_idx
  ON reports (visibility, status)
  WHERE visibility != 'private' AND status = 'approved';

-- Partial index for onboarding analytics queries.
CREATE INDEX IF NOT EXISTS reports_onboarding_first_idx
  ON reports (created_at DESC)
  WHERE onboarding_first_report = TRUE;

COMMENT ON COLUMN reports.visibility IS
  'V9.11 — public (browseable feed + RADAR), radar_only (RADAR matching only, not in feed), private (submitter only).';
COMMENT ON COLUMN reports.onboarding_first_report IS
  'V9.11 — TRUE when this report was created via the /start onboarding flow as a user''s first submission.';
