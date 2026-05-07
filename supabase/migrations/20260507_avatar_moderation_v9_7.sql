-- =====================================================================
-- V9.7 Phase 2 — custom avatar uploads with automated moderation.
--
-- Adds three columns to `profiles` for tracking moderation state on
-- user-uploaded avatars:
--
--   avatar_pending_review       — TRUE while a custom upload is in
--                                 the admin queue. Users see their
--                                 previous (curated/approved) avatar
--                                 in the meantime; reviewers see the
--                                 pending one in /admin/media-review.
--   avatar_moderation_score     — JSONB blob from AWS Rekognition
--                                 DetectModerationLabels. Stores
--                                 confidence scores per label so we
--                                 can audit decisions and tune
--                                 thresholds over time.
--   avatar_moderation_decision  — 'approved' | 'rejected' | 'pending'
--                                 Set by the upload endpoint after
--                                 Rekognition runs. Default 'approved'
--                                 for legacy avatars (curated set).
--
-- Also creates a partial index on the moderation queue so admin
-- review queries stay fast even with many users.
-- =====================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_pending_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS avatar_moderation_score JSONB,
  ADD COLUMN IF NOT EXISTS avatar_moderation_decision TEXT
    CHECK (avatar_moderation_decision IN ('approved', 'rejected', 'pending')),
  ADD COLUMN IF NOT EXISTS avatar_pending_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_pending_uploaded_at TIMESTAMPTZ;

-- Index for the admin moderation queue: users whose pending upload
-- needs review, ordered by upload time so the oldest gets attention
-- first.
CREATE INDEX IF NOT EXISTS profiles_avatar_pending_idx
  ON profiles (avatar_pending_uploaded_at)
  WHERE avatar_pending_review = TRUE;

COMMENT ON COLUMN profiles.avatar_pending_review IS
  'V9.7 P2 — TRUE while a custom uploaded avatar is in the admin moderation queue.';
COMMENT ON COLUMN profiles.avatar_moderation_score IS
  'V9.7 P2 — JSONB record of AWS Rekognition DetectModerationLabels output for the most recent upload.';
COMMENT ON COLUMN profiles.avatar_moderation_decision IS
  'V9.7 P2 — final disposition of the most recent avatar upload: approved | rejected | pending.';
COMMENT ON COLUMN profiles.avatar_pending_url IS
  'V9.7 P2 — Supabase Storage URL of the pending custom avatar awaiting review. Becomes avatar_url on approval; deleted on rejection.';
COMMENT ON COLUMN profiles.avatar_pending_uploaded_at IS
  'V9.7 P2 — timestamp of the most recent pending upload, used to order the admin queue.';
