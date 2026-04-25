-- Migration: Add user_submittable flag to phenomenon_types
-- Date: 2026-04-25
--
-- Purpose: Distinguish between types suitable for user self-reporting
-- vs. editorial/classification labels used only for content tagging.
--
-- Types like "Historical Sighting" and "Notable Case" are editorial labels
-- applied by the content/moderation team. A user reporting their own
-- experience wouldn't select these. Similarly, location-based entries like
-- "Bermuda Triangle" describe a place, not an experience type.
--
-- The submit form (src/pages/submit.tsx) currently filters these client-side.
-- This column provides a server-authoritative flag so the filter logic can
-- move to the query layer once this migration has been applied.

-- Step 1: Add the column (default true so all existing types remain visible)
ALTER TABLE public.phenomenon_types
  ADD COLUMN IF NOT EXISTS user_submittable BOOLEAN DEFAULT TRUE;

-- Step 2: Mark editorial/classification types as non-submittable
UPDATE public.phenomenon_types
SET user_submittable = FALSE
WHERE slug IN (
  'historical-sighting',
  'notable-case'
) OR name IN (
  'Historical Sighting',
  'Notable Case'
);

-- Step 3: Mark location-based types as non-submittable
-- These describe a place, not an experience type a user would report
UPDATE public.phenomenon_types
SET user_submittable = FALSE
WHERE slug IN (
  'bermuda-triangle',
  'skinwalker-ranch',
  'ley-line'
) OR name IN (
  'Bermuda Triangle',
  'Skinwalker Ranch',
  'Ley Line'
);

-- Step 4: Add an index for efficient filtering on the submit form
CREATE INDEX IF NOT EXISTS idx_phenomenon_types_user_submittable
  ON public.phenomenon_types (user_submittable)
  WHERE user_submittable = TRUE;

-- Verification (commented — run manually to confirm)
-- SELECT name, slug, category, user_submittable
-- FROM public.phenomenon_types
-- ORDER BY category, name;
