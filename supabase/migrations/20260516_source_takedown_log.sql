-- Migration: source_takedown_log
--
-- B0.5 — audit trail for the admin source-level takedown tool. Each
-- row records one mass-archive action (admin pulled all ingested
-- reports from a given source_type because ToS changed, takedown
-- request from rights holder, etc.).
--
-- The actual archival is an UPDATE on reports.status='archived'; this
-- log records WHO did it, WHEN, WHY, and HOW MANY reports were
-- affected. Lets us reconstruct the historical state and defend any
-- challenge to a takedown action.

CREATE TABLE IF NOT EXISTS public.source_takedown_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_email TEXT NOT NULL,
  source_type       TEXT NOT NULL,
  reports_affected  INTEGER NOT NULL DEFAULT 0,
  reason            TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.source_takedown_log IS
  'B0.5 audit ledger. One row per admin-triggered mass takedown of an ingested source (e.g. "archive all r/UFOs posts because Reddit ToS changed"). Preserves who/when/why/how-many for compliance + accountability.';

CREATE INDEX IF NOT EXISTS idx_source_takedown_log_source
  ON public.source_takedown_log(source_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_takedown_log_performed_by
  ON public.source_takedown_log(performed_by, created_at DESC);

-- RLS: service-role only writes; admin email reads via service-role
-- context in the API endpoint (no direct user reads from the table).
ALTER TABLE public.source_takedown_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages takedown log"
  ON public.source_takedown_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT ALL ON public.source_takedown_log TO service_role;
