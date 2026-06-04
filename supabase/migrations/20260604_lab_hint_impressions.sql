-- V11.17.65 — lab_hint_impressions table.
--
-- Tracks Hint impressions for the Lab Hints renderer's cadence layer.
-- Used to:
--   1. Suppress a Hint already shown to a user in the last 7 days
--      (avoids "I've seen this card before" fatigue).
--   2. Measure CTA conversion (cta_clicked) and dismissal
--      (dismissed) for editorial review.
--
-- Schema is intentionally narrow — the Hint payload itself isn't
-- persisted because Hints are regenerated against the live archive
-- on every render (the body text changes as the corpus grows).

CREATE TABLE IF NOT EXISTS lab_hint_impressions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hint_id TEXT NOT NULL,
  shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cta_clicked BOOLEAN DEFAULT FALSE,
  dismissed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_lab_hint_impressions_user_recent
  ON lab_hint_impressions (user_id, shown_at DESC);

-- Secondary index for the editorial review query
-- ("how does Hint X perform over time"):
CREATE INDEX IF NOT EXISTS idx_lab_hint_impressions_hint_recent
  ON lab_hint_impressions (hint_id, shown_at DESC);

-- ---------------------------------------------------------------
-- RLS — users can read and write their own impressions only.
-- ---------------------------------------------------------------

ALTER TABLE lab_hint_impressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_hint_impressions_select_own ON lab_hint_impressions;
CREATE POLICY lab_hint_impressions_select_own
  ON lab_hint_impressions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lab_hint_impressions_insert_own ON lab_hint_impressions;
CREATE POLICY lab_hint_impressions_insert_own
  ON lab_hint_impressions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lab_hint_impressions_update_own ON lab_hint_impressions;
CREATE POLICY lab_hint_impressions_update_own
  ON lab_hint_impressions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Note: the service-role key used by the API routes bypasses RLS so
-- the POST /api/lab/hints/impression endpoint can write rows even
-- when the user's anon-key session would be blocked by the policy.
