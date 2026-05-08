-- =====================================================================
-- V9.9 P3 — bio moderation tracking columns.
--
-- Adds three columns to `profiles` so the server-side moderation
-- pipeline (Claude Haiku via /api/user/profile-update) can record
-- its decision on every bio save:
--
--   bio_moderation_decision  — 'approved' | 'pending' | 'rejected'
--   bio_moderation_categories — TEXT[] of flagged labels (empty []
--                              for approved bios)
--   bio_pending_review       — TRUE when admin should look at it
--   bio_moderation_at        — TIMESTAMPTZ of most recent decision
--
-- Hard rejections never reach the DB (the endpoint returns 422
-- before update). Pending bios save normally but flag for review.
--
-- Index supports the future admin bio-review queue similar to
-- the avatar-review queue.
-- =====================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bio_moderation_decision TEXT
    CHECK (bio_moderation_decision IN ('approved', 'pending', 'rejected')),
  ADD COLUMN IF NOT EXISTS bio_moderation_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS bio_pending_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bio_moderation_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_bio_pending_idx
  ON profiles (bio_moderation_at)
  WHERE bio_pending_review = TRUE;

COMMENT ON COLUMN profiles.bio_moderation_decision IS
  'V9.9 P3 — outcome of the most recent Claude Haiku bio moderation pass: approved | pending | rejected.';
COMMENT ON COLUMN profiles.bio_moderation_categories IS
  'V9.9 P3 — flagged labels Claude Haiku returned (e.g. ["mild_profanity", "edgy"]).';
COMMENT ON COLUMN profiles.bio_pending_review IS
  'V9.9 P3 — TRUE while a borderline bio awaits human review.';
COMMENT ON COLUMN profiles.bio_moderation_at IS
  'V9.9 P3 — timestamp of the most recent moderation pass.';
