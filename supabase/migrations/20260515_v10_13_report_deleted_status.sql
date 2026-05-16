-- V10.13 Phase A hotfix — add 'deleted' to report_status enum and
-- a deleted_at timestamp column for audit/recovery.
--
-- The user-facing /api/reports/[slug]/delete endpoint sets
-- status='deleted' to soft-delete reports. Without this enum value
-- the UPDATE fails with "invalid input value for enum report_status".
--
-- After this migration:
--   - All public queries that filter on status='approved' naturally
--     exclude soft-deleted reports.
--   - deleted_at preserves a timestamp for the two-week recovery
--     window described in the user-facing copy.
--   - Service-role admin queries can still see deleted rows for
--     audit / restore purposes.

-- 1. Add 'deleted' to the enum if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'deleted'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'report_status')
  ) THEN
    ALTER TYPE public.report_status ADD VALUE 'deleted';
  END IF;
END$$;

-- 2. Add deleted_at column (nullable; set when soft-delete fires).
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Index so filter queries that exclude deleted rows stay fast
--    even as the table grows.
CREATE INDEX IF NOT EXISTS reports_deleted_at_idx
  ON public.reports (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.reports.deleted_at IS
  'V10.13 — set when a user soft-deletes their own report. NULL = active. Combined with status=''deleted''.';
