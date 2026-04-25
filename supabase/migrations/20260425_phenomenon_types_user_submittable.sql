-- Migration: Add user_submittable flag to phenomenon_types
-- Date: 2026-04-25
--
-- Purpose: Distinguish between types suitable for user self-reporting
-- vs. editorial/classification labels used only for content tagging.
--
-- The submit form (src/pages/submit.tsx) filters these client-side using
-- pattern matching. This column mirrors that logic server-side so the
-- filter can eventually move to the query layer.
--
-- Patterns excluded:
--   1. "Historical ___" — editorial classifications, not personal experiences
--   2. "Notable/Infamous/Classic/Famous Case/Report/Incident" — editorial labels
--   3. Specific location names — describe a place, not an experience type

-- Step 1: Add the column (default true so all existing types remain visible)
ALTER TABLE public.phenomenon_types
  ADD COLUMN IF NOT EXISTS user_submittable BOOLEAN DEFAULT TRUE;

-- Step 2: Mark "Historical ___" types as non-submittable
-- These are editorial classifications, not personal experience types
UPDATE public.phenomenon_types
SET user_submittable = FALSE
WHERE name ILIKE 'Historical %';

-- Step 3: Mark case/report classification labels as non-submittable
-- e.g. "Notable Case", "Infamous Case", "Classic Case", "Famous Incident"
UPDATE public.phenomenon_types
SET user_submittable = FALSE
WHERE name ~* '\m(notable|infamous|classic|famous)\s+(case|report|incident)\M';

-- Step 4: Mark location-based types as non-submittable
-- These describe a place, not an experience type a user would report
UPDATE public.phenomenon_types
SET user_submittable = FALSE
WHERE slug IN ('bermuda-triangle', 'skinwalker-ranch', 'ley-line')
   OR name IN ('Bermuda Triangle', 'Skinwalker Ranch', 'Ley Line');

-- Step 5: Add an index for efficient filtering on the submit form
CREATE INDEX IF NOT EXISTS idx_phenomenon_types_user_submittable
  ON public.phenomenon_types (user_submittable)
  WHERE user_submittable = TRUE;

-- Verification (run manually to see what was excluded)
-- SELECT name, slug, category, user_submittable
-- FROM public.phenomenon_types
-- WHERE user_submittable = FALSE
-- ORDER BY category, name;
--
-- And what remains visible:
-- SELECT name, slug, category
-- FROM public.phenomenon_types
-- WHERE user_submittable = TRUE
-- ORDER BY category, name;
