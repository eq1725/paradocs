-- Migration: Add all new source types to constellation_artifacts CHECK constraint
-- Date: 2026-03-13
-- Added: twitter (formalized), archive, vimeo, rumble, substack, medium, wikipedia,
--        google_docs, imgur, flickr, github, facebook, twitch, mufon, nuforc, blackvault, coasttocoast

-- Step 1: Drop the existing CHECK constraint on source_type
ALTER TABLE constellation_artifacts
  DROP CONSTRAINT IF EXISTS constellation_artifacts_source_type_check;

-- Step 2: Re-add with the full expanded list
ALTER TABLE constellation_artifacts
  ADD CONSTRAINT constellation_artifacts_source_type_check
  CHECK (source_type IN (
    'paradocs_report', 'youtube', 'reddit', 'tiktok',
    'instagram', 'podcast', 'news', 'twitter', 'archive',
    'vimeo', 'rumble', 'substack', 'medium', 'wikipedia',
    'google_docs', 'imgur', 'flickr', 'github', 'facebook',
    'twitch', 'mufon', 'nuforc', 'blackvault', 'coasttocoast',
    'website', 'other'
  ));
