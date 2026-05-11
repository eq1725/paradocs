-- ============================================================
-- V9.11.6 — Your Signal (AI emergent-patterns Lab tab)
--
-- Adds two pieces of schema:
--
--   1. allow_peer_connection (boolean) on `profiles` and `reports`.
--      Profile-level default + per-report override so users can
--      opt into being reachable by other matched experiencers.
--      Defaults to FALSE everywhere — opt-in, not opt-out.
--
--   2. your_signal_insights cache table — per-(user, report)
--      caching of the 4 generated insight cards. Avoids regenerating
--      cards on every tab open. TTL 7 days; invalidated when the
--      user shares a new experience or when significant new ingestion
--      lands.
--
-- Notes/journal deprecation: the journal_entries table and the
-- /api/user/journal endpoint stay in place for now (data
-- preservation); the UI surface is removed in this release. A
-- follow-up cleanup migration will drop both once we confirm no
-- production users have authored journal entries.
-- ============================================================

-- ── 1. Peer-connection opt-in fields ────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allow_peer_connection BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.allow_peer_connection IS
  'Profile-level default: when TRUE, other users with similar experiences may request to connect through Paradocs. Default FALSE (opt-in).';

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS allow_peer_connection BOOLEAN;

COMMENT ON COLUMN public.reports.allow_peer_connection IS
  'Per-report override of profiles.allow_peer_connection. NULL = inherit profile default; TRUE/FALSE = explicit per-report opt-in/out.';

-- Helper view for the effective opt-in (per report).
CREATE OR REPLACE VIEW public.report_peer_visibility AS
SELECT
  r.id AS report_id,
  r.submitted_by AS user_id,
  COALESCE(r.allow_peer_connection, p.allow_peer_connection, FALSE) AS effective_allow_peer
FROM public.reports r
LEFT JOIN public.profiles p ON p.id = r.submitted_by;

COMMENT ON VIEW public.report_peer_visibility IS
  'Resolved peer-connection visibility per report: per-report override > profile default > FALSE.';

-- ── 2. Your Signal insights cache ───────────────────────────

CREATE TABLE IF NOT EXISTS public.your_signal_insights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id     UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,

  -- Card 1: deterministic — top match dimensions
  fingerprint_payload   JSONB,
  -- Card 2: deterministic — geographic + temporal cluster
  cluster_payload       JSONB,
  -- Card 3: AI-generated — surprising fact (Sonnet)
  did_you_know_payload  JSONB,
  -- Card 4: deterministic — broader pattern context
  context_payload       JSONB,

  -- Generation metadata
  ai_model_used    TEXT,       -- e.g., "claude-sonnet-4-6"
  ai_input_tokens  INTEGER,
  ai_output_tokens INTEGER,
  ai_cost_usd      NUMERIC(10, 6),

  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),

  UNIQUE (user_id, report_id)
);

CREATE INDEX IF NOT EXISTS idx_your_signal_user_report ON public.your_signal_insights (user_id, report_id);
CREATE INDEX IF NOT EXISTS idx_your_signal_expires_at  ON public.your_signal_insights (expires_at);

COMMENT ON TABLE public.your_signal_insights IS
  'Cached AI-generated insight cards (4 per user-report). Phase 1.B builds the generators that populate the deterministic payloads (1, 2, 4); Phase 1.C adds Sonnet-generated did_you_know_payload. TTL 7 days.';

-- RLS — users read their own insights; service role writes.
ALTER TABLE public.your_signal_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own Your Signal insights"
  ON public.your_signal_insights
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages Your Signal insights"
  ON public.your_signal_insights
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
