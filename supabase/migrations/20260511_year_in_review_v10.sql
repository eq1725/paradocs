-- ============================================================
-- V10 Phase 4.C — Your Signal Year in Review
--
-- Per-user annual recap caching. One row per (user_id, year).
-- Payload includes deterministic stats + a Sonnet-generated
-- narrative intro. Cached because generating per-visit is wasteful
-- (the year's data doesn't change once the year closes).
--
-- The generator endpoint is /api/lab/year-in-review/[year] (next
-- commit). Triggers:
--   - User visits /lab/year/[year] → cache check → generate if
--     missing or stale
--   - Late-November campaign: admin bulk-trigger ahead of share
--     campaign
-- ============================================================

CREATE TABLE IF NOT EXISTS public.year_in_review_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year          INTEGER NOT NULL CHECK (year BETWEEN 2024 AND 2100),
  -- Full computed payload — stats + Sonnet narrative.
  payload       JSONB NOT NULL,
  -- Generation metadata for audit.
  ai_model_used    TEXT,
  ai_input_tokens  INTEGER,
  ai_output_tokens INTEGER,
  ai_cost_usd      NUMERIC(10, 6),
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Mid-year regen guard: cache stale after 7 days for in-progress
  -- year; once year closes (Jan 1+), cache is effectively
  -- permanent.
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),

  UNIQUE (user_id, year)
);

CREATE INDEX IF NOT EXISTS idx_yir_user_year      ON public.year_in_review_cache (user_id, year DESC);
CREATE INDEX IF NOT EXISTS idx_yir_year_generated ON public.year_in_review_cache (year, generated_at DESC);

COMMENT ON TABLE public.year_in_review_cache IS
  'V10 Phase 4.C — Your Signal Year in Review payloads. UNIQUE(user_id, year). 7-day TTL for in-progress year; effectively permanent once year closes.';

ALTER TABLE public.year_in_review_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own Year in Review"
  ON public.year_in_review_cache
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages Year in Review"
  ON public.year_in_review_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
