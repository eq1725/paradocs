-- Migration: Fix duplicate phenomenon_types and improve ghost/haunting coverage
-- Date: 2026-04-25
--
-- Issues fixed:
--   1. Duplicate "Near-Death Experience" rows (canonical slug + auto-generated slug)
--   2. No phenomenon_type name contains "ghost" — searching "ghost" finds almost nothing
--   3. Descriptions on original ghost types are too terse for search matching
--   4. Shadow Figure / Shadow Person semantic overlap across categories
--
-- Strategy for duplicates:
--   Keep the canonical row (from NDE taxonomy migration) and delete any
--   auto-generated duplicates. Re-point any reports referencing the deleted
--   row to the canonical one first.

-- ============================================================
-- STEP 1: Fix NDE duplicates
-- ============================================================
-- The canonical row has slug 'near-death-experience' (from 20260414_nde_family_taxonomy.sql).
-- Any other row with name 'Near-Death Experience' and a different slug is a duplicate.

-- Re-point reports from duplicate to canonical
UPDATE public.reports
SET phenomenon_type_id = (
  SELECT id FROM public.phenomenon_types WHERE slug = 'near-death-experience'
)
WHERE phenomenon_type_id IN (
  SELECT id FROM public.phenomenon_types
  WHERE name = 'Near-Death Experience'
    AND slug != 'near-death-experience'
);

-- Delete the duplicate(s)
DELETE FROM public.phenomenon_types
WHERE name = 'Near-Death Experience'
  AND slug != 'near-death-experience';

-- ============================================================
-- STEP 2: Fix any other name-level duplicates
-- ============================================================
-- Generic duplicate cleanup: for any name that appears more than once,
-- keep the row with the longest description (most canonical) and delete others.
-- First re-point reports, then delete.

-- Find and fix all remaining duplicates (by name, case-insensitive)
DO $$
DECLARE
  dup RECORD;
  canonical_id UUID;
  dup_ids UUID[];
BEGIN
  FOR dup IN
    SELECT lower(name) AS lname, count(*) AS cnt
    FROM public.phenomenon_types
    GROUP BY lower(name)
    HAVING count(*) > 1
  LOOP
    -- Keep the one with the longest description
    SELECT id INTO canonical_id
    FROM public.phenomenon_types
    WHERE lower(name) = dup.lname
    ORDER BY length(COALESCE(description, '')) DESC, created_at ASC
    LIMIT 1;

    SELECT array_agg(id) INTO dup_ids
    FROM public.phenomenon_types
    WHERE lower(name) = dup.lname
      AND id != canonical_id;

    -- Re-point reports
    UPDATE public.reports
    SET phenomenon_type_id = canonical_id
    WHERE phenomenon_type_id = ANY(dup_ids);

    -- Delete duplicates
    DELETE FROM public.phenomenon_types
    WHERE id = ANY(dup_ids);

    RAISE NOTICE 'Deduplicated "%": kept %, removed %',
      dup.lname, canonical_id, array_length(dup_ids, 1);
  END LOOP;
END $$;


-- ============================================================
-- STEP 3: Add missing ghost/haunting types and improve descriptions
-- ============================================================

-- Add "Ghost Sighting" — the most obvious search term for this category
INSERT INTO public.phenomenon_types (category, name, slug, description) VALUES
  ('ghosts_hauntings', 'Ghost Sighting', 'ghost-sighting',
    'Seeing or encountering a ghost, spirit, or apparition — a visible presence of someone deceased or an unidentified figure.'),
  ('ghosts_hauntings', 'Spirit Communication', 'spirit-communication',
    'Receiving messages, signs, or responses from a ghost or spirit, including knocks, moved objects, or direct communication.'),
  ('ghosts_hauntings', 'Haunted House / Location Experience', 'haunted-house-experience',
    'Strange activity experienced inside a building, home, or property believed to be haunted — including sounds, cold spots, moving objects, or feelings of being watched.'),
  ('ghosts_hauntings', 'Ghostly Presence / Feeling Watched', 'ghostly-presence',
    'A strong sense of an unseen presence, being watched, or not being alone — without a visible ghost or apparition.'),
  ('ghosts_hauntings', 'Other Ghost Experience', 'other-ghost-experience',
    'Other ghost or haunting experience not covered by the types above.')
ON CONFLICT (slug) DO NOTHING;

-- Update existing ghost types to include "ghost" in their descriptions for search
UPDATE public.phenomenon_types
SET description = 'Seeing a ghost or spirit — a visual apparition of a deceased person or unknown entity.'
WHERE slug = 'apparition';

UPDATE public.phenomenon_types
SET description = 'A ghost or spirit causing physical disturbances — objects moving, doors slamming, unexplained sounds, or thrown items.'
WHERE slug = 'poltergeist';

UPDATE public.phenomenon_types
SET description = 'Capturing ghost voices or unexplained audio — electronic voice phenomena recorded on audio devices.'
WHERE slug = 'evp';

UPDATE public.phenomenon_types
SET description = 'Recurring ghost or paranormal activity tied to a specific location — a site with a history of hauntings or unexplained events.'
WHERE slug = 'haunted-location';

UPDATE public.phenomenon_types
SET description = 'Interactions with a ghost or spirit that appears aware of and responsive to the living — answering questions, reacting to people, or showing intent.'
WHERE slug = 'intelligent-haunting';

UPDATE public.phenomenon_types
SET description = 'Witnessing a ghostly scene that replays the same way each time — like a recording of a past event, with no interaction or awareness.'
WHERE slug = 'residual-haunting';

UPDATE public.phenomenon_types
SET description = 'Seeing a dark, human-shaped shadow figure or ghost, often with a sense of being watched or a feeling of dread.'
WHERE slug = 'shadow-person';

UPDATE public.phenomenon_types
SET description = 'Aggressive or malevolent ghost or paranormal activity perceived as demonic or evil in nature — beyond typical haunting behavior.'
WHERE slug = 'demonic-activity';

UPDATE public.phenomenon_types
SET description = 'Seeing or sensing the ghost or apparition of a person at the moment of their death or serious crisis, often at a great distance from the actual event.'
WHERE slug = 'crisis-apparition';


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT name, slug, description FROM public.phenomenon_types
-- WHERE category = 'ghosts_hauntings'
-- ORDER BY name;
--
-- Check for remaining duplicates:
-- SELECT lower(name), count(*) FROM public.phenomenon_types
-- GROUP BY lower(name) HAVING count(*) > 1;
