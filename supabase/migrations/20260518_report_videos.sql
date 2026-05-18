-- Migration: report_videos
--
-- Panel-feedback (May 2026). Pre-launch video pipeline (Phase A + B).
-- A single user-submitted video clip attached to one report row. The
-- existing /report-media path covers stills + post-publish uploads;
-- this table is dedicated to the Stories-style first-class video
-- submission that becomes the report's primary content.
--
-- One row per video. status drives the lifecycle:
--   uploading        — multipart upload in progress
--   transcribing     — Whisper cron picks it up
--   ready_for_review — transcript landed; awaiting user "Publish"
--                      from /submit/video-review/[id]
--   pending_review   — moderation flagged → admin queue
--   ready            — passed moderation → renders on Today feed
--   rejected         — admin denied OR moderation hard-blocked
--   failed           — Whisper exhausted retries; surfaces in admin queue
--
-- Why a separate table from report_media: video submissions are the
-- PRIMARY content of their report; report_media is for supplementary
-- attachments. We also want to query "all reports with a publishable
-- video" without scanning a wider media table, and the metadata
-- shape diverges (transcripts, segments, captions) enough that
-- co-mingling would muddy both surfaces.

CREATE TABLE IF NOT EXISTS public.report_videos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id           UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Storage
  storage_bucket      TEXT NOT NULL DEFAULT 'report_videos',
  storage_path        TEXT NOT NULL,        -- e.g. user_<uuid>/<report_id>/<file_id>.mp4
  mime_type           TEXT NOT NULL,
  size_bytes          BIGINT,
  duration_sec        NUMERIC(8, 2),
  width               INTEGER,
  height              INTEGER,

  -- Lifecycle
  status              TEXT NOT NULL DEFAULT 'uploading',
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at        TIMESTAMPTZ,
  rejected_at         TIMESTAMPTZ,
  rejection_reason    TEXT,

  -- Transcript (Phase B)
  transcript          TEXT,
  transcript_segments JSONB,                -- [{start, end, text, words?:[]}]
  transcript_provider TEXT,                 -- 'whisper-1' etc.
  transcript_lang     TEXT,                 -- ISO-639-1 (or whatever Whisper returns)
  transcribed_at      TIMESTAMPTZ,
  transcribe_attempts INTEGER NOT NULL DEFAULT 0,
  transcribe_error    TEXT,

  -- Haiku auto-extraction (Phase B)
  extracted_meta      JSONB,                -- { proposed_title, proposed_description,
                                             --   location_hints[], date_hints[], category_hints[] }
  extracted_at        TIMESTAMPTZ,

  -- Moderation (Phase B)
  moderation_result   JSONB,                -- OpenAI moderation API response (categories + scores)
  moderation_passed   BOOLEAN,
  moderation_at       TIMESTAMPTZ,

  -- Admin review (Phase A + B fallback)
  reviewed_by         UUID REFERENCES auth.users(id),
  reviewed_at         TIMESTAMPTZ,
  reviewer_notes      TEXT,

  -- Tracking
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constrain status to the documented lifecycle values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'report_videos_status_check'
  ) THEN
    ALTER TABLE public.report_videos
      ADD CONSTRAINT report_videos_status_check
      CHECK (status IN (
        'uploading',
        'transcribing',
        'ready_for_review',
        'pending_review',
        'ready',
        'rejected',
        'failed'
      ));
  END IF;
END $$;

-- One in-flight video per report (we don't currently support multi-clip
-- video reports). Enforced as a partial unique index so admin can
-- rebuild a rejected video without dropping the original row.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_video_per_report
  ON public.report_videos(report_id)
  WHERE status IN ('uploading', 'transcribing', 'ready_for_review', 'pending_review', 'ready');

-- Hot-path indexes:
--   - cron picks up by status='transcribing' ordered by uploaded_at
--   - admin queue lists status IN ('pending_review','failed')
--   - feed render filters status='ready'
CREATE INDEX IF NOT EXISTS idx_report_videos_status_uploaded_at
  ON public.report_videos(status, uploaded_at);

CREATE INDEX IF NOT EXISTS idx_report_videos_report_id
  ON public.report_videos(report_id);

CREATE INDEX IF NOT EXISTS idx_report_videos_user_id
  ON public.report_videos(user_id);

COMMENT ON TABLE public.report_videos IS
  'Panel-feedback (May 2026): Stories-style user-submitted video attached as the primary content of a report. Phase A captures + admin-reviews; Phase B adds Whisper transcripts, Haiku auto-extraction, and OpenAI moderation. One active row per report; rejected rows kept for audit.';

COMMENT ON COLUMN public.report_videos.status IS
  'Lifecycle: uploading → transcribing → ready_for_review → ready (or pending_review on moderation flag, rejected on admin denial, failed on Whisper exhaustion).';

COMMENT ON COLUMN public.report_videos.transcript_segments IS
  'Whisper word-level segments. Drives the captions track on the Today feed player. Format: [{start, end, text, words?:[]}] where word-level entries are present only when Whisper returns timestamp_granularities=word.';

COMMENT ON COLUMN public.report_videos.extracted_meta IS
  'Haiku JSON extraction from transcript. Shape: { proposed_title, proposed_description, location_hints: string[], date_hints: string[], category_hints: string[] }. Used to prefill /submit/video-review; user must still explicitly confirm location and date before publish.';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_report_videos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS report_videos_updated_at ON public.report_videos;
CREATE TRIGGER report_videos_updated_at
  BEFORE UPDATE ON public.report_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_report_videos_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────
-- Users can SELECT their own videos at any status (so they can see
-- "still processing…" on /submit/video-review).
-- Public users can SELECT videos that are status='ready' AND whose
-- parent report is also publicly visible.
-- INSERT happens via the /api/reports/video/upload endpoint which
-- uses the service role (we control storage path and validate
-- ownership), so user-facing INSERT is denied at the policy level.
-- UPDATE is denied to users entirely — admin queue and cron use the
-- service role.

ALTER TABLE public.report_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own report videos"
  ON public.report_videos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Public reads ready videos"
  ON public.report_videos FOR SELECT
  USING (
    status = 'ready'
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_videos.report_id
        AND r.status = 'approved'
        AND COALESCE(r.visibility, 'public') IN ('public', 'radar_only')
    )
  );

CREATE POLICY "Service role manages report videos"
  ON public.report_videos FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.report_videos TO authenticated, anon;
GRANT ALL ON public.report_videos TO service_role;

-- ── Convenience: report-level "has_video" derived flag ───────────
-- The Today feed and report card need to know whether to render a
-- video player. We can JOIN, but a denormalized boolean lets the
-- feed query stay cheap. Maintained by a trigger so callers don't
-- need to remember to flip it.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS has_video BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.sync_reports_has_video()
RETURNS TRIGGER AS $$
DECLARE
  any_ready BOOLEAN;
BEGIN
  -- Recompute the parent report's has_video flag whenever a video
  -- row's status changes or a row is inserted/deleted.
  SELECT EXISTS (
    SELECT 1 FROM public.report_videos
    WHERE report_id = COALESCE(NEW.report_id, OLD.report_id)
      AND status = 'ready'
  ) INTO any_ready;

  UPDATE public.reports
  SET has_video = any_ready
  WHERE id = COALESCE(NEW.report_id, OLD.report_id);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS report_videos_sync_has_video ON public.report_videos;
CREATE TRIGGER report_videos_sync_has_video
  AFTER INSERT OR UPDATE OF status OR DELETE
  ON public.report_videos
  FOR EACH ROW EXECUTE FUNCTION public.sync_reports_has_video();

CREATE INDEX IF NOT EXISTS idx_reports_has_video
  ON public.reports(has_video)
  WHERE has_video = TRUE;

COMMENT ON COLUMN public.reports.has_video IS
  'Denormalized flag synced by report_videos trigger: TRUE when at least one report_videos row with status=ready exists for this report. Drives the Today feed video render without a join.';
