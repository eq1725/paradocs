-- ============================================================
-- V9.12 Phase 2.A — Your Signal feedback loop
--
-- Captures thumbs-up / thumbs-down on each of the four Your Signal
-- insight cards. The data lets us:
--   (a) hide repeatedly low-rated insights for that specific user
--   (b) tune the Sonnet prompt over time toward patterns users find
--       resonant (Card 3 is the only AI-generated one; the other
--       three are deterministic, but the feedback still tells us
--       which deterministic framings land)
--   (c) eventually feed the matching engine — low ratings on
--       "Patterns near you" reveal weak geographic clusters
--
-- Schema:
--   user_id    — owner
--   report_id  — the user's report the insights were generated for
--   card_type  — 'fingerprint' | 'cluster' | 'did_you_know' | 'context'
--   rating     — 'up' | 'down' (no nulls — explicit user signal)
--   created_at — when they hit the button
--
-- A user can change their rating; we upsert on (user_id, report_id,
-- card_type) so toggling thumbs-up → thumbs-down updates in place.
-- "Un-rate" (returning to neutral) is represented by deleting the row.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.your_signal_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id  UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  card_type  TEXT NOT NULL CHECK (card_type IN ('fingerprint', 'cluster', 'did_you_know', 'context')),
  rating     TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, report_id, card_type)
);

CREATE INDEX IF NOT EXISTS idx_your_signal_feedback_user        ON public.your_signal_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_your_signal_feedback_report_card ON public.your_signal_feedback (report_id, card_type);
CREATE INDEX IF NOT EXISTS idx_your_signal_feedback_rating      ON public.your_signal_feedback (rating);

COMMENT ON TABLE public.your_signal_feedback IS
  'Thumbs up/down on each Your Signal insight card. UNIQUE(user_id, report_id, card_type) so toggling updates in place; deletion = un-rate.';

-- RLS — users read/write only their own rows.
ALTER TABLE public.your_signal_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own Your Signal feedback"
  ON public.your_signal_feedback
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own Your Signal feedback"
  ON public.your_signal_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own Your Signal feedback"
  ON public.your_signal_feedback
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own Your Signal feedback"
  ON public.your_signal_feedback
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to Your Signal feedback"
  ON public.your_signal_feedback
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
