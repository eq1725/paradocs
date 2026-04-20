-- Migration: Add feed_hook columns to reports table
-- Session 10: Data Ingestion & Pipeline
-- Date: 2026-03-21

-- Add feed_hook column for Discover feed card copy
ALTER TABLE reports ADD COLUMN IF NOT EXISTS feed_hook text;

-- Add timestamp for tracking when hook was generated
ALTER TABLE reports ADD COLUMN IF NOT EXISTS feed_hook_generated_at timestamptz;

-- Add needs_reingestion flag for marking existing reports for pipeline refresh
ALTER TABLE reports ADD COLUMN IF NOT EXISTS needs_reingestion boolean DEFAULT false;

-- Index for efficient feed queries: approved reports with hooks, sorted by date
CREATE INDEX IF NOT EXISTS idx_reports_feed_hook_not_null
ON reports (created_at DESC)
WHERE feed_hook IS NOT NULL AND status = 'approved';

-- Index for finding reports that need reingestion
CREATE INDEX IF NOT EXISTS idx_reports_needs_reingestion
ON reports (source_type)
WHERE needs_reingestion = true;

-- Index for finding reports missing feed hooks (for backfill)
CREATE INDEX IF NOT EXISTS idx_reports_missing_feed_hook
ON reports (created_at ASC)
WHERE feed_hook IS NULL AND status = 'approved';
