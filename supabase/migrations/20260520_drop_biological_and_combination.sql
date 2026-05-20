-- V11 — Drop `biological_factors` and `combination` categories.
--
-- Rationale:
--   * `biological_factors` was a "skeptical-explanation" bucket (Temporal Lobe
--     Epilepsy, infrasound, hypnagogic state, etc.) — incompatible with the
--     experiencer-centric mission. Removing rather than re-bucketing avoids
--     mis-classifying real experiences as their proposed neurological
--     reduction.
--   * `combination` was a catch-all that masked classification gaps in
--     adapters. Adapter code now returns NULL when it can't determine a
--     specific bucket, and Sonnet does per-record classification.
--
-- This migration:
--   1. Hard-deletes phenomena entries in the two categories. Foreign keys
--      on report_phenomena and saved_phenomena ON DELETE CASCADE so the
--      join rows clean up automatically.
--   2. Hard-deletes phenomenon_types in the two categories. This includes
--      the three placeholder rows from 20260425_submit_form_types.sql
--      (multi-phenomenon-event, unexplained-event, other-unclassified).
--   3. NULLs reports.category where it was 'combination' or
--      'biological_factors'. The next Sonnet pass will reclassify these
--      into a real bucket from the description content.
--   4. NULLs data_sources.category for completeness.
--
-- The PhenomenonCategory TypeScript union in src/lib/database.types.ts
-- has been pruned in the same commit.

BEGIN;

-- 1. Delete phenomena entries in the dropped categories.
-- CASCADE clears join rows on report_phenomena and saved_phenomena.
DELETE FROM public.phenomena
 WHERE category IN ('biological_factors', 'combination');

-- 2. Delete phenomenon_types entries in the dropped categories,
-- including the catch-all placeholders.
DELETE FROM public.phenomenon_types
 WHERE category IN ('biological_factors', 'combination');

-- 3. NULL out the report-level category hint. Sonnet's analyzer
-- repopulates this on next analysis pass for each affected report.
UPDATE public.reports
   SET category = NULL
 WHERE category IN ('biological_factors', 'combination');

-- 4. NULL out the data_sources-level category hint too.
UPDATE public.data_sources
   SET category = NULL
 WHERE category IN ('biological_factors', 'combination');

-- Verify counts (commented out; uncomment to inspect before COMMIT)
-- SELECT 'phenomena_combination_remaining' AS k, COUNT(*) FROM public.phenomena WHERE category = 'combination';
-- SELECT 'phenomena_biological_remaining' AS k, COUNT(*) FROM public.phenomena WHERE category = 'biological_factors';
-- SELECT 'reports_combination_remaining' AS k, COUNT(*) FROM public.reports WHERE category = 'combination';
-- SELECT 'reports_biological_remaining' AS k, COUNT(*) FROM public.reports WHERE category = 'biological_factors';

COMMIT;
