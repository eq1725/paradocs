-- =====================================================================
-- V9.2 — daily_leads table.
--
-- Stores one curated phenomenon (or report) per calendar day as the
-- Today's Lead. Same lead for everyone that day = the daily-ritual
-- hook actually works (was: "Today's Lead" = whatever was at idx 0
-- in the personalized feed = different for every user).
--
-- Selected daily by a cron-friendly endpoint /api/admin/leads/select-
-- today that picks via heuristic: anchor_case_hook present, primary
-- image present, high report_count, hasn't been lead in the last 30
-- days, push_copy populated.
-- =====================================================================

CREATE TABLE IF NOT EXISTS daily_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lead date (one row per calendar day, UTC). Calling code uses
  -- the user's local date but the cron + DB store UTC for consistency.
  lead_date DATE NOT NULL UNIQUE,
  -- Polymorphic: lead can be either a phenomenon OR a report (or future
  -- editorial). Exactly one of these FK columns is non-null.
  phenomenon_id UUID REFERENCES phenomena(id) ON DELETE CASCADE,
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  -- Selection metadata
  selection_method TEXT NOT NULL DEFAULT 'auto_heuristic',
  selection_reason TEXT,
  -- Editorial override flag — when true, this lead was hand-picked
  -- and shouldn't be replaced by the auto-selector running again.
  editorial_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Exactly one of phenomenon_id / report_id must be set
  CONSTRAINT daily_leads_exactly_one_target CHECK (
    (phenomenon_id IS NOT NULL AND report_id IS NULL) OR
    (phenomenon_id IS NULL AND report_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS daily_leads_date_idx ON daily_leads(lead_date DESC);
CREATE INDEX IF NOT EXISTS daily_leads_phen_idx ON daily_leads(phenomenon_id) WHERE phenomenon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS daily_leads_rep_idx ON daily_leads(report_id) WHERE report_id IS NOT NULL;

COMMENT ON TABLE daily_leads IS
  'V9.2 curated daily-ritual hook. One row per calendar day (UTC). selection_method=auto_heuristic|editorial. editorial_locked=true protects hand-picked leads from being overwritten by the auto-selector cron.';
