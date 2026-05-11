-- ============================================================
-- V9.12 Phase 2.C — Time-evolving Your Signal alerts
--
-- Tracks the "last seen" snapshot of each user's cluster so the
-- nightly cron only sends a push when there's GENUINE growth
-- since we last alerted them. Without this snapshot we'd either
-- spam users every night ("you have 47 nearby reports!") or
-- never tell them when something changed.
--
-- Schema:
--   user_id           — PK; one row per user
--   last_report_id    — the user's most-recent report at last check
--                       (cluster recomputes when this changes)
--   last_cluster_size — count of reports within Card-2 radius at last check
--   last_alerted_at   — timestamp of the last push we sent to this user
--                       (separate from last_checked_at — we check far more
--                        often than we alert, to enforce a cooldown)
--   last_checked_at   — when the cron last evaluated this user
--   created_at / updated_at
--
-- A user can be CHECKED nightly but only ALERTED when cluster_size
-- has grown by >= ALERT_THRESHOLD (3 by default) AND it's been
-- at least 72 hours since the last alert (cooldown). Both rules
-- live in the cron handler so they're tunable without a migration.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.signal_alert_state (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_report_id     UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  last_cluster_size  INTEGER NOT NULL DEFAULT 0,
  last_alerted_at    TIMESTAMPTZ,
  last_checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_alert_state_checked  ON public.signal_alert_state (last_checked_at);
CREATE INDEX IF NOT EXISTS idx_signal_alert_state_alerted  ON public.signal_alert_state (last_alerted_at);

COMMENT ON TABLE public.signal_alert_state IS
  'Per-user snapshot for the nightly Your Signal alert cron. One row per user; cluster size + last-alerted timestamp let us send only on genuine growth and respect a 72h cooldown.';

ALTER TABLE public.signal_alert_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own alert state"
  ON public.signal_alert_state
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages alert state"
  ON public.signal_alert_state
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
