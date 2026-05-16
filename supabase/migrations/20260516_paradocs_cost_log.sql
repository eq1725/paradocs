-- Migration: paradocs_narrative_cost_log
--
-- B0.7 — daily cost cap for Haiku-driven paradocs_narrative generation
-- during mass ingestion. Logs every call (and every skip) so the
-- service can sum today's spend and enforce a hard ceiling before
-- making the next call.
--
-- Operational model:
--   - PARADOCS_HAIKU_DAILY_CAP env var (default $50/day)
--   - Service checks today's sum BEFORE each call
--   - If over cap, the call is skipped (logged with status='skipped_cap'),
--     the report still inserts (without narrative), and the next day's
--     first ingestion pass picks up unnarrated reports first
--   - Daily reset is implicit (queries always filter by today)

CREATE TABLE IF NOT EXISTS public.paradocs_narrative_cost_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      NUMERIC(12, 6) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'completed',
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.paradocs_narrative_cost_log
  ADD CONSTRAINT paradocs_cost_log_status_check
  CHECK (status IN ('completed', 'skipped_cap', 'failed'));

COMMENT ON TABLE public.paradocs_narrative_cost_log IS
  'B0.7 cost-tracking ledger for paradocs_narrative Haiku calls. One row per generation attempt (completed, skipped due to cap, or failed). Drives daily-cap enforcement and the admin spend dashboard.';

COMMENT ON COLUMN public.paradocs_narrative_cost_log.status IS
  '''completed'' = Haiku call succeeded, cost_usd reflects actual spend. ''skipped_cap'' = daily ceiling hit, no call made, cost_usd = 0. ''failed'' = call attempted but errored (timeout, API error), cost_usd = 0 since we don''t get billed for non-completions.';

CREATE INDEX IF NOT EXISTS idx_paradocs_cost_log_day_status
  ON public.paradocs_narrative_cost_log(created_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_paradocs_cost_log_report
  ON public.paradocs_narrative_cost_log(report_id)
  WHERE report_id IS NOT NULL;

-- RLS: service-role only. Cost data is operational, not user-facing.
ALTER TABLE public.paradocs_narrative_cost_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages cost log"
  ON public.paradocs_narrative_cost_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT ALL ON public.paradocs_narrative_cost_log TO service_role;

-- Verification queries:
--   -- Today's total spend
--   SELECT SUM(cost_usd) FROM paradocs_narrative_cost_log
--   WHERE created_at >= DATE_TRUNC('day', NOW()) AND status = 'completed';
--
--   -- Skipped-due-to-cap count today
--   SELECT COUNT(*) FROM paradocs_narrative_cost_log
--   WHERE created_at >= DATE_TRUNC('day', NOW()) AND status = 'skipped_cap';
--
--   -- Per-day spend, last 7 days
--   SELECT DATE(created_at) AS day, SUM(cost_usd) AS spend_usd, COUNT(*) AS calls
--   FROM paradocs_narrative_cost_log
--   WHERE created_at > NOW() - INTERVAL '7 days' AND status = 'completed'
--   GROUP BY DATE(created_at) ORDER BY day DESC;
