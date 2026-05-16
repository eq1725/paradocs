-- Migration: report_type enum on reports table
--
-- B0.2 — distinguish user-submitted from ingested reports at the DB
-- level. Drives the IngestedBadge UI (B0.3), the disable-author-DM
-- conditional (B0.4), and the source-level admin takedown tool (B0.5).
--
-- All existing reports default to 'submitted' (only the Roswell case
-- remains in prod after the Session 10 cleanup, and it's a real
-- submitter-authored report — the default is correct for it).
--
-- The ingestion engine (src/lib/ingestion/engine.ts) sets
-- report_type='ingested' on all adapter-driven inserts going forward
-- (NUFORC, BFRO, NDERF, OBERF, Reddit, IANDS, Wikipedia, historical).

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'submitted';

ALTER TABLE public.reports
  ADD CONSTRAINT reports_report_type_check
  CHECK (report_type IN ('submitted', 'ingested'));

COMMENT ON COLUMN public.reports.report_type IS
  'Provenance: ''submitted'' = first-person account contributed by a user via /start. ''ingested'' = indexed from an external source by the ingestion engine with attribution. Drives display divergence (IngestedBadge, no author-DM) and admin takedown tooling.';

-- Backfill: every existing row stays as 'submitted' (the default).
-- Explicit UPDATE is a no-op given the DEFAULT clause but documents
-- the intent. Only Roswell currently lives in prod per Session 10
-- cleanup, and it's a real submission.
UPDATE public.reports
SET report_type = 'submitted'
WHERE report_type IS NULL;

-- Index for the source-takedown query (B0.5) which filters by
-- source_type AND report_type='ingested'. Without this index that
-- query would table-scan once we have millions of ingested rows.
CREATE INDEX IF NOT EXISTS idx_reports_report_type_source_type
  ON public.reports(report_type, source_type)
  WHERE report_type = 'ingested';

-- Verification (run manually after deploy):
--   SELECT report_type, COUNT(*) FROM reports GROUP BY report_type;
--   Expected: { submitted: 1 } before first ingestion run; both keys
--   after the first adapter batch.
