-- Migration: Add 'archive' and 'twitter' to constellation_artifacts source_type CHECK constraint
-- Date: 2026-03-13
-- Note: 'twitter' was added to the live DB previously but was missing from the CHECK constraint.
--       'archive' is a new source type for Archive.org URLs.

-- Step 1: Drop the existing CHECK constraint on source_type
ALTER TABLE constellation_artifacts
  DROP CONSTRAINT IF EXISTS constellation_artifacts_source_type_check;

-- Step 2: Re-add with the expanded list including 'twitter' and 'archive'
ALTER TABLE constellation_artifacts
  ADD CONSTRAINT constellation_artifacts_source_type_check
  CHECK (source_type IN (
    'paradocs_report', 'youtube', 'reddit', 'tiktok',
    'instagram', 'podcast', 'news', 'twitter', 'archive',
    'website', 'other'
  ));
