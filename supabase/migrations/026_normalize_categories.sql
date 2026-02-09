-- Migration: Normalize category values
-- Purpose: Ensure all reports use the current category names that match the UI
-- Date: 2026-02-09
--
-- Background: The original schema used an ENUM with values like 'ufo_uap', 'cryptid', etc.
-- The UI and import scripts use newer values like 'ufos_aliens', 'cryptids', etc.
-- This migration:
-- 1. Changes the column to TEXT (if it's still an ENUM) so all values are accepted
-- 2. Normalizes old-format values to new-format
-- 3. Maps orphan categories to valid UI categories

-- Step 1: Change category column from ENUM to TEXT if needed
-- (Safe to run even if already TEXT - ALTER TYPE to same type is a no-op error we ignore)
DO $$
BEGIN
  -- Check if column is still an enum type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports'
    AND column_name = 'category'
    AND udt_name = 'phenomenon_category'
  ) THEN
    ALTER TABLE reports ALTER COLUMN category TYPE TEXT;
    RAISE NOTICE 'Changed reports.category from ENUM to TEXT';
  ELSE
    RAISE NOTICE 'reports.category is already TEXT';
  END IF;
END $$;

-- Step 2: Normalize old enum values to new UI-compatible values
UPDATE reports SET category = 'ufos_aliens' WHERE category = 'ufo_uap';
UPDATE reports SET category = 'cryptids' WHERE category = 'cryptid';
UPDATE reports SET category = 'ghosts_hauntings' WHERE category = 'ghost_haunting';
UPDATE reports SET category = 'psychic_phenomena' WHERE category IN ('unexplained_event', 'psychic_paranormal');
UPDATE reports SET category = 'esoteric_practices' WHERE category = 'mystery_location';
UPDATE reports SET category = 'combination' WHERE category = 'other';

-- Step 3: Map orphan import categories to valid UI categories
UPDATE reports SET category = 'psychic_phenomena' WHERE category = 'high_strangeness';
UPDATE reports SET category = 'consciousness_practices' WHERE category = 'nde_consciousness';

-- Step 4: Also fix the phenomena table if it uses the old enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phenomena'
    AND column_name = 'category'
    AND udt_name = 'phenomenon_category'
  ) THEN
    ALTER TABLE phenomena ALTER COLUMN category TYPE TEXT;
    RAISE NOTICE 'Changed phenomena.category from ENUM to TEXT';
  END IF;
END $$;

-- Step 5: Also fix phenomenon_types table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phenomenon_types'
    AND column_name = 'category'
    AND udt_name = 'phenomenon_category'
  ) THEN
    ALTER TABLE phenomenon_types ALTER COLUMN category TYPE TEXT;
    RAISE NOTICE 'Changed phenomenon_types.category from ENUM to TEXT';
  END IF;
END $$;

-- Normalize categories in those tables too
UPDATE phenomenon_types SET category = 'ufos_aliens' WHERE category::TEXT = 'ufo_uap';
UPDATE phenomenon_types SET category = 'cryptids' WHERE category::TEXT = 'cryptid';
UPDATE phenomenon_types SET category = 'ghosts_hauntings' WHERE category::TEXT = 'ghost_haunting';
UPDATE phenomenon_types SET category = 'psychic_phenomena' WHERE category::TEXT IN ('unexplained_event', 'psychic_paranormal');
UPDATE phenomenon_types SET category = 'esoteric_practices' WHERE category::TEXT = 'mystery_location';
UPDATE phenomenon_types SET category = 'combination' WHERE category::TEXT = 'other';

UPDATE phenomena SET category = 'ufos_aliens' WHERE category::TEXT = 'ufo_uap';
UPDATE phenomena SET category = 'cryptids' WHERE category::TEXT = 'cryptid';
UPDATE phenomena SET category = 'ghosts_hauntings' WHERE category::TEXT = 'ghost_haunting';
UPDATE phenomena SET category = 'psychic_phenomena' WHERE category::TEXT IN ('unexplained_event', 'psychic_paranormal');
UPDATE phenomena SET category = 'esoteric_practices' WHERE category::TEXT = 'mystery_location';
UPDATE phenomena SET category = 'combination' WHERE category::TEXT = 'other';

-- Step 6: Recreate indexes for the TEXT column
DROP INDEX IF EXISTS idx_reports_category;
CREATE INDEX idx_reports_category ON reports(category);

DROP INDEX IF EXISTS idx_reports_status_category_created;
CREATE INDEX idx_reports_status_category_created ON reports(status, category, created_at DESC);

-- Step 7: Add composite index for the explore page's default query (status + content_type + created_at)
CREATE INDEX IF NOT EXISTS idx_reports_status_contenttype_created
ON reports(status, content_type, created_at DESC);
