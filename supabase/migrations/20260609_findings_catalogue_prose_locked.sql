-- V11.18.6 — Sprint 1C — findings_catalogue.prose_locked column.
--
-- Purpose
-- -------
-- The weekly prose-refresh cron (refresh-patterns-prose.ts, Sundays
-- 04:00 UTC) re-prompts Claude Haiku 4.5 for the interpretive_sentence
-- on every published Finding. Founder + Helena have hand-edited prose
-- on a small number of rows (shadow_figure, reunion_with_deceased,
-- electromagnetic_disturbance, sensed_presence as of Sprint 1C) that
-- must NOT drift away from the cleared copy.
--
-- Sprint 1B handled this by piggy-backing on the Helena validator —
-- the cron would reject Haiku output containing banned phrases and
-- preserve the existing prose. But that mechanism is unreliable:
--   - Haiku can produce a valid-looking-but-different sentence that
--     passes the validator yet drifts away from the cleared register.
--   - There is no way to mark a row "this is the final, locked copy".
--
-- This migration adds a per-row flag the cron consults. Rows with
-- `prose_locked = true` are skipped entirely by the prose cron; their
-- `interpretive_sentence` is the founder-edited source of truth.
--
-- Counts continue to refresh nightly via refresh-patterns-counts.ts
-- regardless of `prose_locked` (counts and prose are independent).
--
-- Operator sets prose_locked = true via SQL after Helena clears the
-- founder edit. The Sprint 1C runbook (docs/SPRINT_1C_NOTES.md §3)
-- walks the workflow.

ALTER TABLE findings_catalogue
  ADD COLUMN IF NOT EXISTS prose_locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN findings_catalogue.prose_locked IS
  'When true, the weekly prose-refresh cron will not overwrite interpretive_sentence. '
  'Founder sets to true on any row with hand-edited copy to prevent cron drift.';
