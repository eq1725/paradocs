-- =====================================================================
-- V11.17.71 — Pro Dossier
--
-- Per PRO_TIER_VALIDATION_V3.md §3 — the Pro tier's load-bearing
-- flagship. Per-experience auto-generated cross-reference dossier
-- with 7 deterministic sections, all sourced from real DB queries
-- against the Archive. No long-form prose; structure is the artifact.
--
-- Sections (mirrored in sections_json):
--   1. closest_reports      — top-5 fingerprint-scored Archive matches
--   2. phen_lineage         — sub-pattern inheritances + signal cites
--   3. geographic_neighbors — within-radius reports grouped by sub-pat
--   4. temporal_neighbors   — same decade / season / hour-window count
--   5. descriptor_matches   — per-descriptor % across phen-family
--   6. rarity_percentile    — composite rarity vs. same-phen sub-corpus
--   7. time_machine         — contemporaneous weather/astro/news/peers
--
-- Refresh policy:
--   - Compute on demand (lazy first view).
--   - Recompute when:
--       (a) user's report row was edited (updated_at > computed_at)
--       (b) checksum of input signals changed
--       (c) Archive grew by >1% since last compute
--       (d) >7 days since last compute
--   - Nightly cron queues stale Dossiers — see
--     /api/cron/recompute-dossiers and vercel.json.
--
-- Sharing:
--   - is_public_shareable flag flips a per-Dossier public-read RLS
--     allow. share_token is the unguessable URL slug
--     (/dossier/share/[token]); never the user_id.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pro_dossiers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experience_report_id  UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,

  -- The 7 sections as a single JSONB blob. The compute engine writes
  -- this in one shot; the viewer reads it in one shot. Keeping it
  -- monolithic avoids a join-storm at render time.
  sections_json         JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Materialized rarity (0-100 percentile) for indexed sorting on the
  -- "my latest dossiers" surface. Mirrors sections_json -> rarity.
  rarity_score          NUMERIC(5,2),

  -- Checksum of input signals (md5 of phen_family + lat/lng/year +
  -- descriptor token set + report description hash). When the report
  -- mutates, the checksum changes, and the next view recomputes.
  checksum              TEXT NOT NULL DEFAULT '',

  -- Lifecycle timestamps.
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Public-share affordance.
  is_public_shareable   BOOLEAN NOT NULL DEFAULT FALSE,
  share_token           TEXT UNIQUE,

  -- One Dossier per user-per-experience. The compute engine UPSERTs
  -- on this constraint; force-recompute bumps computed_at + checksum
  -- without producing a new row.
  CONSTRAINT pro_dossiers_unique_per_experience
    UNIQUE (user_id, experience_report_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_dossiers_user_recent
  ON public.pro_dossiers (user_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pro_dossiers_experience
  ON public.pro_dossiers (experience_report_id);

-- Public-share token lookup index (unauthenticated /dossier/share/[token]).
CREATE INDEX IF NOT EXISTS idx_pro_dossiers_share_token
  ON public.pro_dossiers (share_token)
  WHERE share_token IS NOT NULL AND is_public_shareable = TRUE;

COMMENT ON TABLE public.pro_dossiers IS
  'V11.17.71 Pro Dossier — per-experience structured cross-reference (see PRO_TIER_VALIDATION_V3.md §3). Recomputed nightly + on-demand when stale; one row per (user, experience).';

-- =====================================================================
-- updated_at trigger (mirrors the pattern used in user_standing etc.)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.touch_pro_dossiers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pro_dossiers_set_updated_at ON public.pro_dossiers;
CREATE TRIGGER pro_dossiers_set_updated_at
  BEFORE UPDATE ON public.pro_dossiers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_pro_dossiers_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.pro_dossiers ENABLE ROW LEVEL SECURITY;

-- Owner read.
DROP POLICY IF EXISTS pro_dossiers_owner_read ON public.pro_dossiers;
CREATE POLICY pro_dossiers_owner_read
  ON public.pro_dossiers
  FOR SELECT
  USING (auth.uid() = user_id);

-- Public read via share token — only when is_public_shareable is TRUE.
-- The /dossier/share/[token] page reads anonymously via the anon key;
-- this policy lets the row through ONLY when the user has explicitly
-- flipped the public flag on this row.
DROP POLICY IF EXISTS pro_dossiers_public_read ON public.pro_dossiers;
CREATE POLICY pro_dossiers_public_read
  ON public.pro_dossiers
  FOR SELECT
  USING (is_public_shareable = TRUE AND share_token IS NOT NULL);

-- Owner toggles the public flag (and only the public flag — the
-- compute engine still writes sections_json via service role only).
-- Implemented as a permissive UPDATE policy; the API endpoint
-- validates that only is_public_shareable + share_token are mutated.
DROP POLICY IF EXISTS pro_dossiers_owner_toggle_public ON public.pro_dossiers;
CREATE POLICY pro_dossiers_owner_toggle_public
  ON public.pro_dossiers
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role full access (compute engine, cron recomputes, share-
-- card renderer all write here).
DROP POLICY IF EXISTS pro_dossiers_service_all ON public.pro_dossiers;
CREATE POLICY pro_dossiers_service_all
  ON public.pro_dossiers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
