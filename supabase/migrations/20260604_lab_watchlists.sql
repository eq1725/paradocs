-- =====================================================================
-- V11.17.72 — Custom Watchlists (Tier 3B)
--
-- Per PRO_TIER_VALIDATION_V3.md §4 — the secondary Pro flagship.
--
-- A Watchlist is a user-defined "standing search" — a named JSON
-- criteria object (phenomenon family, descriptors, geo radius, date
-- range, etc.) that the system continuously evaluates against newly-
-- ingested Archive reports. When a report matches above a confidence
-- threshold, the system records the match and (per the user's prefs)
-- fires a push notification and/or includes the match in the weekly
-- digest email.
--
-- Match detection paths (see /api/cron/evaluate-watchlists):
--   1. Nightly cron sweep — for each active watchlist, query reports
--      approved since last_evaluated_at, score them, persist matches
--      above threshold. Update last_evaluated_at after.
--   2. Future: ingest-time trigger (low-latency) — wire into the
--      batch-ingest-worker after the persist step. Path 2 is deferred
--      to a future pass; the nightly path covers the MVP.
--
-- Notification cadence (founder decision PRO_TIER_VALIDATION_V3 Round 3):
--   - Push default ON, max 1 per user per 7-day rolling window across
--     ALL watchlists (enforced in the cron handler).
--   - Email weekly digest default ON, Sundays 09:00 UTC.
-- =====================================================================

-- =====================================================================
-- lab_watchlists — the user-defined criteria
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lab_watchlists (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                          TEXT NOT NULL,
  criteria                      JSONB NOT NULL,
  status                        TEXT NOT NULL DEFAULT 'active',
  notify_push                   BOOLEAN NOT NULL DEFAULT TRUE,
  notify_email_weekly           BOOLEAN NOT NULL DEFAULT TRUE,
  match_confidence_threshold    NUMERIC NOT NULL DEFAULT 0.85,
  last_evaluated_at             TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lab_watchlists_status_check
    CHECK (status IN ('active', 'paused', 'archived')),

  CONSTRAINT lab_watchlists_threshold_check
    CHECK (match_confidence_threshold >= 0 AND match_confidence_threshold <= 1)
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user_status
  ON public.lab_watchlists (user_id, status);

CREATE INDEX IF NOT EXISTS idx_watchlists_active_last_eval
  ON public.lab_watchlists (last_evaluated_at)
  WHERE status = 'active';

COMMENT ON TABLE public.lab_watchlists IS
  'V11.17.72 Custom Watchlists — Pro tier standing search criteria. Evaluated nightly against newly-approved Archive reports per PRO_TIER_VALIDATION_V3.md §4.';

-- =====================================================================
-- lab_watchlist_matches — fired matches (one row per match)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lab_watchlist_matches (
  id                BIGSERIAL PRIMARY KEY,
  watchlist_id      UUID NOT NULL REFERENCES public.lab_watchlists(id) ON DELETE CASCADE,
  report_id         UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  matched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  match_confidence  NUMERIC NOT NULL,
  notified_push     BOOLEAN DEFAULT FALSE,
  notified_email    BOOLEAN DEFAULT FALSE,
  dismissed         BOOLEAN DEFAULT FALSE,

  CONSTRAINT lab_watchlist_matches_unique
    UNIQUE (watchlist_id, report_id),

  CONSTRAINT lab_watchlist_matches_confidence_check
    CHECK (match_confidence >= 0 AND match_confidence <= 1)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_matches_recent
  ON public.lab_watchlist_matches (watchlist_id, matched_at DESC);

CREATE INDEX IF NOT EXISTS idx_watchlist_matches_user_undismissed
  ON public.lab_watchlist_matches (watchlist_id)
  WHERE dismissed = FALSE;

-- Helper index for the email digest cron — "fetch undelivered matches
-- across all of this user's watchlists in the last 7 days." Joined on
-- watchlist_id which we group by user later in app code.
CREATE INDEX IF NOT EXISTS idx_watchlist_matches_pending_email
  ON public.lab_watchlist_matches (matched_at DESC)
  WHERE notified_email = FALSE;

COMMENT ON TABLE public.lab_watchlist_matches IS
  'V11.17.72 Custom Watchlists — match events. UNIQUE (watchlist_id, report_id) guarantees no duplicate-match per (watchlist, report) pair.';

-- =====================================================================
-- updated_at trigger on lab_watchlists
-- =====================================================================
CREATE OR REPLACE FUNCTION public.touch_lab_watchlists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lab_watchlists_set_updated_at ON public.lab_watchlists;
CREATE TRIGGER lab_watchlists_set_updated_at
  BEFORE UPDATE ON public.lab_watchlists
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_lab_watchlists_updated_at();

-- =====================================================================
-- RLS — users read/write their own only; service role bypass
-- =====================================================================
ALTER TABLE public.lab_watchlists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_watchlist_matches  ENABLE ROW LEVEL SECURITY;

-- ── lab_watchlists policies ──────────────────────────────────────────
DROP POLICY IF EXISTS lab_watchlists_owner_select ON public.lab_watchlists;
CREATE POLICY lab_watchlists_owner_select
  ON public.lab_watchlists
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lab_watchlists_owner_insert ON public.lab_watchlists;
CREATE POLICY lab_watchlists_owner_insert
  ON public.lab_watchlists
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lab_watchlists_owner_update ON public.lab_watchlists;
CREATE POLICY lab_watchlists_owner_update
  ON public.lab_watchlists
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lab_watchlists_owner_delete ON public.lab_watchlists;
CREATE POLICY lab_watchlists_owner_delete
  ON public.lab_watchlists
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lab_watchlists_service_all ON public.lab_watchlists;
CREATE POLICY lab_watchlists_service_all
  ON public.lab_watchlists
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── lab_watchlist_matches policies ───────────────────────────────────
-- Users SELECT matches that belong to their own watchlists (via the
-- parent's user_id). Match writes (INSERT / mark-notified) go through
-- the service role from the cron handler; users only mutate the
-- dismissed flag via the dismiss endpoint which uses an authed client.
DROP POLICY IF EXISTS lab_watchlist_matches_owner_select ON public.lab_watchlist_matches;
CREATE POLICY lab_watchlist_matches_owner_select
  ON public.lab_watchlist_matches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lab_watchlists w
      WHERE w.id = lab_watchlist_matches.watchlist_id
        AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lab_watchlist_matches_owner_update ON public.lab_watchlist_matches;
CREATE POLICY lab_watchlist_matches_owner_update
  ON public.lab_watchlist_matches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.lab_watchlists w
      WHERE w.id = lab_watchlist_matches.watchlist_id
        AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lab_watchlists w
      WHERE w.id = lab_watchlist_matches.watchlist_id
        AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lab_watchlist_matches_service_all ON public.lab_watchlist_matches;
CREATE POLICY lab_watchlist_matches_service_all
  ON public.lab_watchlist_matches
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
