-- V11.17.84 — Unified AI cost tracking
--
-- The original paradocs_narrative_cost_log table was scoped to the
-- consolidated paradocs_narrative Haiku call. Since then we've added
-- many more Haiku callsites (tag-verification, location-extraction,
-- classify-phenomena-batch, cluster-finding, synthesized-paragraph,
-- and the various small per-service helpers) — none of which were
-- logging cost. June 1–5 founder spend was ~$900 against the table's
-- ~$310, all of the missing $590 unaccounted.
--
-- This migration extends the existing table (no rename — keeps the
-- existing rows intact and avoids touching the consolidated-batch
-- writer in batch-ingest-worker.ts) with the columns the unified
-- logger needs:
--
--   service               — which subsystem ('consolidated-narrative',
--                           'classifier-verify', 'location-extract',
--                           'tag-verify', 'cluster-finding',
--                           'synthesized-paragraph', etc.)
--   cache_creation_tokens — cache writes (1.25× input cost on Haiku)
--   cache_read_tokens     — cache hits (0.1× input cost on Haiku)
--   user_id               — for per-user attribution (Pro Dossier, lab)
--   request_id            — Anthropic request id (debugging)
--
-- The status CHECK constraint is widened to allow new statuses we
-- emit from the unified logger ('skipped' for callers that decide
-- not to call Haiku for reasons other than the cap).

ALTER TABLE public.paradocs_narrative_cost_log
  ADD COLUMN IF NOT EXISTS service               TEXT,
  ADD COLUMN IF NOT EXISTS cache_creation_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS cache_read_tokens     INTEGER,
  ADD COLUMN IF NOT EXISTS user_id               UUID,
  ADD COLUMN IF NOT EXISTS request_id            TEXT;

-- Backfill: every existing row predates the unified logger and
-- corresponds to the consolidated narrative path.
UPDATE public.paradocs_narrative_cost_log
SET service = 'consolidated-narrative'
WHERE service IS NULL;

-- Widen the status CHECK so the unified logger can record extra
-- transitions (e.g. 'skipped' from caching layers, 'rate_limited'
-- from 429-handling helpers).
ALTER TABLE public.paradocs_narrative_cost_log
  DROP CONSTRAINT IF EXISTS paradocs_cost_log_status_check;

ALTER TABLE public.paradocs_narrative_cost_log
  ADD CONSTRAINT paradocs_cost_log_status_check
  CHECK (status IN ('completed', 'skipped_cap', 'skipped', 'failed', 'parse_failed', 'rate_limited'));

CREATE INDEX IF NOT EXISTS idx_paradocs_cost_log_service
  ON public.paradocs_narrative_cost_log(service, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paradocs_cost_log_user
  ON public.paradocs_narrative_cost_log(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.paradocs_narrative_cost_log.service IS
  'V11.17.84 — Which subsystem emitted the call. One of: consolidated-narrative, consolidated-batch, classifier-verify, classifier-primary, tag-verify, location-extract, cluster-finding, synthesized-paragraph, ai-title, report-insights, ai-insights, phenomena-service, onboarding-title, ask-the-unknown, generate-hooks, fix-titles, repair-dates, text-moderation, rewrite-pipeline, video-transcribe, auto-tag, ai-tagger, research-hub-insights. Older rows are backfilled as consolidated-narrative.';

COMMENT ON COLUMN public.paradocs_narrative_cost_log.cache_creation_tokens IS
  'V11.17.84 — Tokens written to the Anthropic prompt cache on this call. Billed at 1.25× the base input rate on Haiku.';

COMMENT ON COLUMN public.paradocs_narrative_cost_log.cache_read_tokens IS
  'V11.17.84 — Tokens read from the prompt cache. Billed at 0.1× the base input rate on Haiku.';

-- Verification queries:
--
--   -- Total spend by service, last 7 days
--   SELECT service, SUM(cost_usd) AS spend_usd, COUNT(*) AS calls
--   FROM paradocs_narrative_cost_log
--   WHERE created_at > NOW() - INTERVAL '7 days' AND status = 'completed'
--   GROUP BY service ORDER BY spend_usd DESC;
--
--   -- Per-day per-service spend
--   SELECT DATE(created_at) AS day, service, SUM(cost_usd) AS spend_usd
--   FROM paradocs_narrative_cost_log
--   WHERE created_at > NOW() - INTERVAL '14 days' AND status = 'completed'
--   GROUP BY DATE(created_at), service ORDER BY day DESC, spend_usd DESC;
