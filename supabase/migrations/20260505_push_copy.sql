-- =====================================================================
-- V8.3 — push_copy column on phenomena + reports.
--
-- Stores ≤90 character notification copy for the Today's Lead
-- (or any candidate phenomenon/report). Generated daily via the
-- /api/admin/ai/generate-push-copy endpoint, consumed later by the
-- push delivery infrastructure (separate workstream).
--
-- The copy is anchored on the same anchor_case_hook content but
-- compressed to a single notification-ready line — leads with the
-- date or place, never starts with the phenomenon name (assumes the
-- reader doesn't know it). Example:
--   "On this day, 1947: the Roswell Daily Record published its
--    retracted headline →"
--
-- =====================================================================

ALTER TABLE phenomena
  ADD COLUMN IF NOT EXISTS push_copy TEXT;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS push_copy TEXT;

-- Sparse index for "phenomena/reports missing push copy" — drives the
-- batch_missing action in /api/admin/ai/generate-push-copy.
CREATE INDEX IF NOT EXISTS phenomena_push_copy_missing_idx
  ON phenomena(id)
  WHERE push_copy IS NULL;

CREATE INDEX IF NOT EXISTS reports_push_copy_missing_idx
  ON reports(id)
  WHERE push_copy IS NULL;

COMMENT ON COLUMN phenomena.push_copy IS
  'V8.3 push notification copy: <= 90 chars. Generated via /api/admin/ai/generate-push-copy. Compressed from anchor_case_hook to a single line that opens with date or place. Future: consumed by push delivery (FCM/Web Push). Currently a content-only field.';

COMMENT ON COLUMN reports.push_copy IS
  'V8.3 push notification copy: <= 90 chars. Same generator as phenomena.push_copy.';
