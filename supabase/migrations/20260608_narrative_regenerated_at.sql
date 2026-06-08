-- Migration: narrative_regenerated_at (Copyright Sprint 2)
--
-- Date: 2026-06-08
-- Sprint: Copyright Sprint 2
-- Related:
--   - scripts/regen-flagged-narratives.ts (the regen runner)
--   - scripts/flag-paraphrased-narratives.ts (produces input JSON)
--   - docs/HAIKU_NARRATIVE_DERIVATIVE_AUDIT.md (§5 — R1+R2+(c) backfill)
--
-- Purpose:
--   Audit pointer for the Copyright Sprint 2 paraphrase-regen pass.
--   Records WHEN a row's paradocs_narrative was rewritten by the
--   regen script so re-runs can skip rows already brought into
--   compliance (idempotent + resumable). Also lets the operator
--   verify "did the regen finish?" with a simple
--     SELECT count(*) FROM reports WHERE narrative_regenerated_at IS NOT NULL
--   without grepping AI cost-log entries.
--
-- Why a dedicated column:
--   paradocs_analysis_generated_at gets bumped by every Haiku call
--   (not just the regen), so it can't tell us whether a row was
--   specifically regenerated for the copyright pass. A dedicated
--   timestamp makes the audit query trivial.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS narrative_regenerated_at TIMESTAMPTZ;

COMMENT ON COLUMN reports.narrative_regenerated_at IS
  'Set by scripts/regen-flagged-narratives.ts when a flagged narrative '
  'is rewritten via Anthropic Batch API + post-Sprint-1 anti-paraphrase '
  'prompt. NULL means no regen pass has touched this row.';
