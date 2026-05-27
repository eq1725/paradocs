-- Migration: Mux video pipeline (V11.17.39)
--
-- Adds Mux integration fields to report_videos so the Today feed can
-- serve HLS adaptive streams from Mux's CDN instead of raw MP4/MOV
-- files from Supabase Storage. The Supabase upload remains the source
-- of truth (uploads land there, we push to Mux as a secondary step),
-- so if Mux ever fails or we want to swap providers later, the
-- original bytes are still available.
--
-- Lifecycle (mux_status):
--   null                 — never pushed to Mux (legacy rows)
--   pending              — Asset.Create called, waiting on webhook
--   ready                — Mux finished encoding; mux_playback_id usable
--   errored              — Mux returned a failure; falls back to Supabase
--
-- The feed checks `mux_playback_id IS NOT NULL AND mux_status = 'ready'`
-- to decide whether to serve HLS. Falls back to the existing Supabase
-- signed URL otherwise.

ALTER TABLE public.report_videos
  ADD COLUMN IF NOT EXISTS mux_asset_id     TEXT,
  ADD COLUMN IF NOT EXISTS mux_playback_id  TEXT,
  ADD COLUMN IF NOT EXISTS mux_status       TEXT,
  ADD COLUMN IF NOT EXISTS mux_uploaded_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mux_ready_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mux_error        TEXT,
  ADD COLUMN IF NOT EXISTS mux_duration_sec NUMERIC(8, 2);

-- Lookup index for the webhook handler: when Mux sends video.asset.ready,
-- we match on the asset_id to find the row to update. Without an index
-- this would table-scan report_videos on every webhook delivery.
CREATE INDEX IF NOT EXISTS report_videos_mux_asset_id_idx
  ON public.report_videos (mux_asset_id)
  WHERE mux_asset_id IS NOT NULL;

-- Reverse-lookup for feed-v2's mux_playback_id IS NOT NULL filter.
CREATE INDEX IF NOT EXISTS report_videos_mux_ready_idx
  ON public.report_videos (mux_status, mux_playback_id)
  WHERE mux_status = 'ready';

COMMENT ON COLUMN public.report_videos.mux_asset_id IS
  'Mux Asset ID returned by Asset.Create. Used to match incoming webhooks.';
COMMENT ON COLUMN public.report_videos.mux_playback_id IS
  'Mux Playback ID for HLS streaming. URL: https://stream.mux.com/<id>.m3u8';
COMMENT ON COLUMN public.report_videos.mux_status IS
  'pending | ready | errored | null (not yet pushed)';
