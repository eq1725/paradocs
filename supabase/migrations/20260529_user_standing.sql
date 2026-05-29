-- =====================================================================
-- V11.17.42 — user_standing
--
-- Per Maya/Jordan/Lena/Sam panel (docs/BADGE_SYSTEM_PANEL.md):
-- replaces the placeholder rank logic in profile.tsx:167-171 with a
-- two-axis "Standing" system.
--
--   axis 1: catalogue_tier    (Reader / Regular / Keeper / Archivist)
--   axis 2: contribution_tier (Witness / Contributor / Correspondent / Steward)
--
-- Numeric values 1..4 stored; name lookup lives in
-- src/lib/services/standing.service.ts so we can retune without a
-- migration. Sam's call: thresholds are config, not schema.
--
-- Recompute job:
--   - /api/cron/recompute-standing nightly
--   - /api/standing/me on-demand if the row is missing or stale > 24h
--
-- No history table — current state only (panel section 5: "we don't
-- need to know that someone was a Regular last month").
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.user_standing (
  user_id            UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  catalogue_tier     SMALLINT NOT NULL DEFAULT 1 CHECK (catalogue_tier BETWEEN 1 AND 4),
  contribution_tier  SMALLINT NOT NULL DEFAULT 1 CHECK (contribution_tier BETWEEN 1 AND 4),
  -- "since" stamps support the "Keeper since March" prose line.
  -- We only update them when the tier *changes*; idempotent recomputes
  -- that land on the same tier don't reset the date.
  catalogue_since    TIMESTAMPTZ,
  contribution_since TIMESTAMPTZ,
  -- Snapshot of the raw counts at compute time, so the prose
  -- progression line ("Next: Archivist at 250 saves and one year on
  -- Paradocs.") can render without re-querying the source tables.
  saves_count        INTEGER NOT NULL DEFAULT 0,
  active_days        INTEGER NOT NULL DEFAULT 0,
  account_age_days   INTEGER NOT NULL DEFAULT 0,
  reports_count      INTEGER NOT NULL DEFAULT 0,
  comments_count     INTEGER NOT NULL DEFAULT 0,
  journal_count      INTEGER NOT NULL DEFAULT 0,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_standing_computed_at
  ON public.user_standing (computed_at);

CREATE INDEX IF NOT EXISTS idx_user_standing_catalogue
  ON public.user_standing (catalogue_tier)
  WHERE catalogue_tier > 1;

CREATE INDEX IF NOT EXISTS idx_user_standing_contribution
  ON public.user_standing (contribution_tier)
  WHERE contribution_tier > 1;

COMMENT ON TABLE public.user_standing IS
  'V11.17.42 — two-axis Standing system (panel memo: docs/BADGE_SYSTEM_PANEL.md). Recomputed nightly by /api/cron/recompute-standing; on-demand recompute when stale > 24h.';

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.user_standing ENABLE ROW LEVEL SECURITY;

-- Anyone can read any user's standing (public attribution in comments
-- needs to surface the standing of the comment author, not just the
-- viewer). Standing is intentionally public — it's about what someone
-- has done on the platform, not private data.
DROP POLICY IF EXISTS user_standing_public_read ON public.user_standing;
CREATE POLICY user_standing_public_read
  ON public.user_standing
  FOR SELECT
  USING (true);

-- Only the service role writes. Standing is computed server-side from
-- ground-truth tables; no user-driven writes ever.
DROP POLICY IF EXISTS user_standing_service_write ON public.user_standing;
CREATE POLICY user_standing_service_write
  ON public.user_standing
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
