-- ============================================================
-- V10.4 Phase 1 — AI rewrite audit + answer_line field
--
-- Two structural changes to support the mass-ingestion-safe
-- AI rewrite pipeline:
--
--   1. ai_rewrite_audit table — every AI-rewrite call logs a
--      row here. Source text, prompt version, model, output
--      field, output text, claim-check result + notes. This
--      is the spine of the new pipeline:
--        - lets us spot-check fabrications retrospectively
--        - powers the admin review queue for claim-check fails
--        - supports prompt-version A/B testing
--        - makes prompt regressions detectable (counts of
--          claim_check_passed=false by prompt_version over time)
--
--   2. reports.answer_line — one-sentence faithful paraphrase
--      shown directly under the title on the new report page
--      (Phase 2). Generated through the unified pipeline at
--      ingestion time so it's audit-logged like every other
--      AI-rewritten field.
--
-- Privacy: ai_rewrite_audit is admin-only. Service role writes,
-- admins read. Never exposed to authenticated users.
-- ============================================================

-- 1) ai_rewrite_audit ----------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_rewrite_audit (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which AI rewrite mode produced this output. Determines
  -- whether a claim-check was run.
  --   faithful_paraphrase — must be claim-checked against source
  --   editorial            — no claim-check; user's own data
  --   structural           — moderation/tagging; minimal audit
  mode                 TEXT NOT NULL CHECK (mode IN ('faithful_paraphrase', 'editorial', 'structural')),

  -- Which prompt version was used. Bump when prompt changes
  -- so we can compare fail rates across versions.
  prompt_version       TEXT NOT NULL,

  -- Which model handled the rewrite.
  model                TEXT NOT NULL,

  -- Which DB field / surface this output is destined for
  -- (e.g. 'reports.paradocs_narrative', 'reports.feed_hook',
  -- 'artifacts.metadata_json.ai_summary', 'reports.answer_line').
  output_field         TEXT NOT NULL,

  -- The original source text the AI was paraphrasing. Stored
  -- so admins can side-by-side diff it against output_text
  -- when reviewing claim-check failures. Truncated to 8KB to
  -- bound storage; full text lives on the originating row.
  source_text          TEXT,

  -- The actual generated text. NULL when the rewrite returned
  -- INSUFFICIENT or failed the claim-check.
  output_text          TEXT,

  -- Claim-check result. NULL for editorial/structural modes
  -- (no check was run). For faithful_paraphrase:
  --   true  — every claim in output is supported by source
  --   false — at least one claim is unsupported / fabricated
  claim_check_passed   BOOLEAN,

  -- Free-text notes from the claim-check Haiku pass — what
  -- specifically failed, which claims were flagged. NULL when
  -- claim_check_passed is true or NULL.
  claim_check_notes    TEXT,

  -- INSUFFICIENT sentinel — true when the source was too thin
  -- to paraphrase faithfully and the model abstained.
  insufficient         BOOLEAN NOT NULL DEFAULT false,

  -- Status the operator/system can set:
  --   passed   — claim_check_passed=true, shipping
  --   pending  — claim_check_passed=false, awaiting admin review
  --   approved — admin manually overrode the fail and approved
  --   rejected — admin manually rejected, field set to NULL
  --   bypassed — editorial/structural; no review needed
  status               TEXT NOT NULL DEFAULT 'passed' CHECK (status IN ('passed', 'pending', 'approved', 'rejected', 'bypassed')),

  -- Free-text rationale from the reviewing admin (optional).
  admin_review_notes   TEXT,
  admin_reviewed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_reviewed_at    TIMESTAMPTZ,

  -- Cross-references back to the row that owns this output.
  -- One or the other will be set; both can be NULL for one-shot
  -- rewrites that don't persist (rare).
  report_id            UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  artifact_id          UUID REFERENCES public.constellation_artifacts(id) ON DELETE CASCADE,

  -- Latency for monitoring.
  duration_ms          INTEGER,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes -----------------------------------------------------

-- Admin queue — failed claim-checks pending review.
CREATE INDEX IF NOT EXISTS idx_ai_audit_pending
  ON public.ai_rewrite_audit (status, created_at DESC)
  WHERE status = 'pending';

-- Lookup by report / artifact for the side-by-side diff view.
CREATE INDEX IF NOT EXISTS idx_ai_audit_report
  ON public.ai_rewrite_audit (report_id, created_at DESC)
  WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_audit_artifact
  ON public.ai_rewrite_audit (artifact_id, created_at DESC)
  WHERE artifact_id IS NOT NULL;

-- Prompt-version analytics — fail rate over time.
CREATE INDEX IF NOT EXISTS idx_ai_audit_prompt_version
  ON public.ai_rewrite_audit (prompt_version, claim_check_passed, created_at DESC);

-- Mode + field lookup for surface-level fail-rate reports.
CREATE INDEX IF NOT EXISTS idx_ai_audit_mode_field
  ON public.ai_rewrite_audit (mode, output_field, created_at DESC);

COMMENT ON TABLE public.ai_rewrite_audit IS
  'V10.4 — every AI rewrite call writes here. Spine of the anti-fabrication pipeline. Powers the /admin/ai-audit review queue and gives us retrospective spot-checks across the entire corpus.';

-- RLS — admin only, service-role writes ----------------------

ALTER TABLE public.ai_rewrite_audit ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — writes happen from API routes
-- using the service-role key. No policy needed for inserts.

-- Admins (profiles.role = 'admin') can read all rows for the
-- review queue.
DROP POLICY IF EXISTS "Admins can read ai_rewrite_audit" ON public.ai_rewrite_audit;
CREATE POLICY "Admins can read ai_rewrite_audit"
  ON public.ai_rewrite_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Admins can update the status / admin_review_notes columns
-- when approving/rejecting a flagged rewrite.
DROP POLICY IF EXISTS "Admins can update ai_rewrite_audit" ON public.ai_rewrite_audit;
CREATE POLICY "Admins can update ai_rewrite_audit"
  ON public.ai_rewrite_audit
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- 2) reports.answer_line -------------------------------------

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS answer_line TEXT;

COMMENT ON COLUMN public.reports.answer_line IS
  'V10.4 — one-sentence faithful paraphrase of the report. Shown directly under the title on the report page. Generated through src/lib/ai/rewrite-pipeline.ts in faithful_paraphrase mode (hedge voice + claim-check + audit log). NULL when ingestion failed claim-check or source was too thin.';

-- Index for any future analytics / fill-rate queries.
CREATE INDEX IF NOT EXISTS idx_reports_answer_line_present
  ON public.reports ((answer_line IS NOT NULL));
