-- Enforce uniqueness at database level for deduplication
-- Migration 025: Add unique constraint on source_type + original_report_id

-- First drop the existing non-unique index
DROP INDEX IF EXISTS idx_reports_original_source_dedup;

-- Create a unique index instead (enforces constraint + provides lookup performance)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_source_unique
ON reports(source_type, original_report_id)
WHERE original_report_id IS NOT NULL;

-- Comment explaining the constraint
COMMENT ON INDEX idx_reports_source_unique IS
'Unique constraint ensuring no duplicate reports from the same source. Prevents re-importing the same Reddit post, NUFORC case, BFRO report, etc.';
