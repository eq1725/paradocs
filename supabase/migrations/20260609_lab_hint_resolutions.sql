-- V11.18.x — lab_hint_resolutions table.
--
-- Per UI_SHIPPING_ROADMAP_V2 Sprint 1A additions, each Hint card on
-- the /lab HintsRail now offers three actions: Accept / Save / Not
-- mine. Each resolution is persisted per (user_id, hint_id) so:
--
--   1. The Hints renderer can filter out hints the user has already
--      resolved (any resolution kind hides the hint from the rail).
--   2. Operators can analyze acceptance / dismissal patterns for
--      editorial review without losing the impression history.
--
-- We deliberately do NOT extend lab_hint_impressions — the impression
-- table is observational (every shown/dismissed/cta_clicked event is
-- a row), whereas resolution is a single terminal action per
-- (user, hint) pair. Keeping them separate avoids schema overloading
-- and lets the renderer query a small, indexed table without joining
-- against the full impression log.

CREATE TABLE IF NOT EXISTS lab_hint_resolutions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hint_id TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('accept', 'save', 'dismiss')),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, hint_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_hint_resolutions_user
  ON lab_hint_resolutions (user_id, resolved_at DESC);

CREATE INDEX IF NOT EXISTS idx_lab_hint_resolutions_hint
  ON lab_hint_resolutions (hint_id, resolved_at DESC);

-- ----------------------------------------------------------------
-- RLS — users read + write their own resolutions only.
-- The service-role key used by /api/lab/hints/[id]/resolve bypasses
-- RLS so the endpoint can write even when the user's anon-key
-- session would otherwise be blocked.
-- ----------------------------------------------------------------

ALTER TABLE lab_hint_resolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_hint_resolutions_select_own ON lab_hint_resolutions;
CREATE POLICY lab_hint_resolutions_select_own
  ON lab_hint_resolutions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lab_hint_resolutions_insert_own ON lab_hint_resolutions;
CREATE POLICY lab_hint_resolutions_insert_own
  ON lab_hint_resolutions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lab_hint_resolutions_update_own ON lab_hint_resolutions;
CREATE POLICY lab_hint_resolutions_update_own
  ON lab_hint_resolutions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
