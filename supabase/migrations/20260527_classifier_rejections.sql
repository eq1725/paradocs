-- Migration: classifier_rejections table (V11.17.39, #69)
--
-- Tracks (report_id, phenomenon_id) pairs that Haiku has previously
-- evaluated and rejected, so subsequent classifier sweeps skip them
-- rather than re-paying for the same Haiku call.
--
-- Observed in V11.17.x: ~70-80% of candidates that hit the classifier
-- get rejected per sweep (correct discrimination behavior). Without a
-- memo, every re-run pays Haiku for the same rejections. At ~$0.0002
-- per candidate × 1700 rejections per sweep × N sweeps = compounding
-- cost we can eliminate.
--
-- prompt_version lets us invalidate the memo when we tune the
-- classifier prompt. If we ship a more permissive rule, we want to
-- re-evaluate previously-rejected candidates. Bump the version in the
-- script and existing memo rows become irrelevant.

CREATE TABLE IF NOT EXISTS public.classifier_rejections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  phenomenon_id   UUID NOT NULL REFERENCES public.phenomena(id) ON DELETE CASCADE,
  prompt_version  TEXT NOT NULL DEFAULT 'v1',
  confidence      INTEGER,           -- Haiku's confidence score 0-100
  reason          TEXT,              -- one-sentence rejection rationale
  rejected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, phenomenon_id, prompt_version)
);

CREATE INDEX IF NOT EXISTS classifier_rejections_phenomenon_idx
  ON public.classifier_rejections (phenomenon_id, prompt_version);

CREATE INDEX IF NOT EXISTS classifier_rejections_report_idx
  ON public.classifier_rejections (report_id);

COMMENT ON TABLE public.classifier_rejections IS
  'Memo of (report, phenomenon) pairs Haiku has rejected. Used by reclassify-priority-categories.ts to skip re-evaluation. Bump prompt_version to invalidate.';
