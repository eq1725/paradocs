-- ============================================================
-- V10 Phase 4.A — Resonance
--
-- Lightweight social signal: a single tap on a report to say
-- "this happened to me too" / "this resonates with my own
-- experience." No words required. The count surfaced publicly
-- becomes a social-proof signal; identities stay anonymous in
-- the public view (only revealed when both users have opted
-- into peer connection, future feature).
--
-- Schema:
--   user_id     — who resonated
--   report_id   — which report
--   UNIQUE pair — toggles idempotently
--   created_at  — for "resonated within the last X" filters
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_resonance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id   UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, report_id)
);

CREATE INDEX IF NOT EXISTS idx_report_resonance_report   ON public.report_resonance (report_id);
CREATE INDEX IF NOT EXISTS idx_report_resonance_user     ON public.report_resonance (user_id);
CREATE INDEX IF NOT EXISTS idx_report_resonance_created  ON public.report_resonance (created_at DESC);

COMMENT ON TABLE public.report_resonance IS
  'V10 Phase 4.A — Single-tap "this happened to me too" social signal on reports. UNIQUE(user_id, report_id) so toggling = upsert/delete.';

ALTER TABLE public.report_resonance ENABLE ROW LEVEL SECURITY;

-- Public can read counts (anonymous). We DON'T expose per-user
-- rows to the public — only aggregates. Logged-in users can read
-- their OWN resonance to know what they've already tapped.
CREATE POLICY "Users read their own resonance"
  ON public.report_resonance
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users insert their own resonance"
  ON public.report_resonance
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own resonance"
  ON public.report_resonance
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to resonance"
  ON public.report_resonance
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
