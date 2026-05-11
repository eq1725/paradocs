-- ============================================================
-- V9.13 Phase 3.A — Ask the Unknown log
--
-- Persists every Sonnet Q&A interaction so we can:
--   (a) enforce a daily per-user rate limit (default 20/day)
--   (b) audit cost over time per user
--   (c) review refused / sensitive interactions for safety
--   (d) feed product analytics on what users actually ask
--
-- Schema:
--   user_id        — who asked
--   report_id      — which of their reports the question was about
--                    (the most recent at ask time)
--   question       — verbatim user input (capped 500 chars at API)
--   answer         — Sonnet's response text (or null if refused)
--   citation_ids   — UUID[] of report ids cited
--   refused        — TRUE if Sonnet refused (off-topic / safety)
--   refusal_reason — short tag (e.g. 'user-safety', 'off-topic')
--   model          — e.g. 'claude-sonnet-4-6'
--   input_tokens / output_tokens / cost_usd — billing audit
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ask_the_unknown_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id       UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  question        TEXT NOT NULL,
  answer          TEXT,
  citation_ids    UUID[] DEFAULT '{}',
  refused         BOOLEAN NOT NULL DEFAULT FALSE,
  refusal_reason  TEXT,
  model           TEXT,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  cost_usd        NUMERIC(10, 6),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ask_log_user_created ON public.ask_the_unknown_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ask_log_refused      ON public.ask_the_unknown_log (refused);

COMMENT ON TABLE public.ask_the_unknown_log IS
  'V9.13 Phase 3.A — Sonnet Q&A audit log. Rate limit (20/day/user) reads from this table.';

ALTER TABLE public.ask_the_unknown_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own ask log"
  ON public.ask_the_unknown_log
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages ask log"
  ON public.ask_the_unknown_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
