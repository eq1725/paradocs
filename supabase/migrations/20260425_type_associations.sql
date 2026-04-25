-- Migration: Create phenomenon_type_associations for smart cross-tagging
-- Date: 2026-04-25
--
-- Purpose: Store co-occurrence relationships between phenomenon types so
-- the submit form can suggest "people who report X also report Y."
--
-- Two sources of data:
--   1. Manual seeds (source = 'curated') — domain-expert pairings
--   2. Computed from actual reports (source = 'computed') — recalculated
--      periodically by analyzing multi-tagged reports
--
-- The frontend queries: given type_id X, return the top N associated types
-- sorted by association_score DESC.

CREATE TABLE IF NOT EXISTS public.phenomenon_type_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id_a UUID NOT NULL REFERENCES public.phenomenon_types(id) ON DELETE CASCADE,
  type_id_b UUID NOT NULL REFERENCES public.phenomenon_types(id) ON DELETE CASCADE,
  co_occurrence_count INTEGER DEFAULT 0,
  association_score DECIMAL(5,3) DEFAULT 0.5,  -- 0-1, higher = stronger
  source TEXT DEFAULT 'curated',  -- 'curated' or 'computed'
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each pair should only exist once (A→B, not also B→A)
  -- Convention: type_id_a < type_id_b (alphabetically by id)
  UNIQUE(type_id_a, type_id_b),
  CHECK (type_id_a != type_id_b)
);

-- Index for the primary query: "given type X, find associated types"
CREATE INDEX IF NOT EXISTS idx_type_assoc_a ON public.phenomenon_type_associations(type_id_a, association_score DESC);
CREATE INDEX IF NOT EXISTS idx_type_assoc_b ON public.phenomenon_type_associations(type_id_b, association_score DESC);
CREATE INDEX IF NOT EXISTS idx_type_assoc_score ON public.phenomenon_type_associations(association_score DESC);

-- ============================================================
-- Seed curated associations
-- ============================================================
-- We use slug lookups via a DO block since IDs are UUIDs.
-- Scores reflect how strongly related two types are (0.5-0.95).

DO $$
DECLARE
  -- Helper function to insert an association by slug pair
  -- Automatically orders IDs so type_id_a < type_id_b
  PROCEDURE add_assoc(slug_a TEXT, slug_b TEXT, score DECIMAL) IS
  BEGIN
    NULL; -- placeholder, we'll use direct INSERT below
  END;
BEGIN
  -- Nothing needed here, using INSERT below
END $$;

-- Use a temp table for readable seeding
CREATE TEMP TABLE _assoc_seed (
  slug_a TEXT,
  slug_b TEXT,
  score DECIMAL(5,3)
) ON COMMIT DROP;

INSERT INTO _assoc_seed (slug_a, slug_b, score) VALUES
  -- UFO / Alien experiences commonly co-occur with:
  ('ufo-sighting',        'missing-time',              0.85),
  ('ufo-sighting',        'physical-anomaly',          0.70),
  ('ufo-sighting',        'unexplained-light',         0.80),
  ('ufo-sighting',        'electromagnetic-sensitivity', 0.65),
  ('alien-encounter',     'missing-time',              0.90),
  ('alien-encounter',     'telepathy',                 0.80),
  ('alien-encounter',     'physical-anomaly',          0.75),
  ('alien-encounter',     'unexplained-marks',         0.70),
  ('alien-abduction',     'missing-time',              0.95),
  ('alien-abduction',     'unexplained-marks',         0.85),
  ('alien-abduction',     'sleep-paralysis',           0.75),
  ('alien-abduction',     'physical-anomaly',          0.80),
  ('alien-abduction',     'telepathy',                 0.70),

  -- Ghost/Haunting experiences commonly co-occur with:
  ('ghost-sighting',      'phantom-sounds',            0.85),
  ('ghost-sighting',      'ghostly-presence',          0.90),
  ('ghost-sighting',      'sleep-paralysis',           0.65),
  ('ghost-sighting',      'shadow-person',             0.75),
  ('ghost-sighting',      'after-death-communication', 0.70),
  ('poltergeist',         'phantom-sounds',            0.90),
  ('poltergeist',         'ghostly-presence',          0.80),
  ('poltergeist',         'electromagnetic-sensitivity', 0.60),
  ('haunted-house-experience', 'phantom-sounds',       0.85),
  ('haunted-house-experience', 'ghostly-presence',     0.90),
  ('haunted-house-experience', 'shadow-person',        0.70),
  ('shadow-person',       'sleep-paralysis',           0.80),
  ('shadow-person',       'ghostly-presence',          0.85),

  -- NDE family commonly co-occurs with:
  ('near-death-experience', 'out-of-body-experience',  0.95),
  ('near-death-experience', 'after-death-communication', 0.70),
  ('near-death-experience', 'unexplained-healing',     0.65),
  ('near-death-experience', 'premonition-experience',  0.60),
  ('out-of-body-experience', 'lucid-dream',            0.70),
  ('out-of-body-experience', 'astral-projection',      0.85),
  ('out-of-body-experience', 'meditation-experience',  0.65),
  ('shared-death-experience', 'deathbed-vision',       0.90),
  ('shared-death-experience', 'after-death-communication', 0.80),

  -- Psychic phenomena commonly co-occur with:
  ('telepathy',           'premonition-experience',    0.75),
  ('telepathy',           'clairvoyance',              0.85),
  ('telepathy',           'remote-viewing',            0.70),
  ('precognitive-dream',  'premonition-experience',    0.90),
  ('precognitive-dream',  'lucid-dream',               0.65),
  ('clairvoyance',        'remote-viewing',            0.80),
  ('synchronicity-experience', 'premonition-experience', 0.65),

  -- Consciousness practices commonly co-occur with:
  ('lucid-dream',         'astral-projection',         0.80),
  ('lucid-dream',         'sleep-paralysis',           0.75),
  ('meditation-experience', 'astral-projection',       0.70),
  ('meditation-experience', 'out-of-body-experience',  0.65),
  ('plant-medicine-experience', 'telepathy',           0.65),
  ('plant-medicine-experience', 'entity-encounter',    0.75),
  ('plant-medicine-experience', 'out-of-body-experience', 0.70),

  -- Cryptid sightings commonly co-occur with:
  ('bigfoot',             'phantom-sounds',            0.60),
  ('bigfoot',             'physical-anomaly',          0.55),
  ('bigfoot',             'unexplained-light',         0.50),

  -- Perception / sensory commonly co-occur with:
  ('sleep-paralysis',     'shadow-figure',             0.85),
  ('sleep-paralysis',     'phantom-sounds',            0.70),
  ('phantom-sounds',      'ghostly-presence',          0.80),
  ('time-distortion',     'missing-time',              0.85),
  ('time-distortion',     'out-of-body-experience',    0.60),

  -- Esoteric practices commonly co-occur with:
  ('seance-experience',   'spirit-communication',      0.90),
  ('seance-experience',   'phantom-sounds',            0.75),
  ('ouija-experience',    'ghostly-presence',          0.80),
  ('ouija-experience',    'phantom-sounds',            0.75),
  ('energy-work-experience', 'physical-anomaly',       0.70),
  ('energy-work-experience', 'unexplained-healing',    0.75),

  -- Religion commonly co-occurs with:
  ('religious-vision',    'miraculous-healing',        0.70),
  ('angelic-encounter',   'unexplained-healing',       0.65),
  ('demonic-encounter',   'demonic-activity',          0.90),
  ('demonic-encounter',   'possession-experience',     0.85),
  ('possession-experience', 'speaking-in-tongues',     0.75);

-- Insert seeds into the real table, resolving slugs to IDs
-- Skip any where either slug doesn't exist in phenomenon_types
INSERT INTO public.phenomenon_type_associations (type_id_a, type_id_b, association_score, source)
SELECT DISTINCT ON (LEAST(a.id, b.id), GREATEST(a.id, b.id))
  LEAST(a.id, b.id),
  GREATEST(a.id, b.id),
  s.score,
  'curated'
FROM _assoc_seed s
JOIN public.phenomenon_types a ON a.slug = s.slug_a
JOIN public.phenomenon_types b ON b.slug = s.slug_b
ORDER BY LEAST(a.id, b.id), GREATEST(a.id, b.id), s.score DESC
ON CONFLICT (type_id_a, type_id_b) DO UPDATE
  SET association_score = GREATEST(
    public.phenomenon_type_associations.association_score,
    EXCLUDED.association_score
  );


-- ============================================================
-- Recalculation function (call periodically to update from real data)
-- ============================================================
-- Mines co-occurrence patterns from two data sources:
--   1. report_tags: user-submitted reports with multiple tags
--   2. report_phenomena → phenomena → phenomenon_type_id: ingested reports
--      linked to multiple phenomena that each map to a type
--
-- The function computes raw co-occurrence counts, then normalizes to a
-- 0–1 association_score using Jaccard similarity:
--   score = co_occurrences(A,B) / (reports_with(A) + reports_with(B) - co_occurrences(A,B))
-- This rewards pairs that consistently appear together, not just pairs
-- that appear on high-volume types.
--
-- Computed rows are merged with curated rows: the higher score wins.

CREATE OR REPLACE FUNCTION public.recalculate_type_associations()
RETURNS TABLE(pairs_updated INT, pairs_inserted INT)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_updated INT := 0;
  v_inserted INT := 0;
BEGIN
  -- Step 1: Build a unified "report → type" mapping from all sources
  CREATE TEMP TABLE _report_types (
    report_id UUID,
    type_id UUID
  ) ON COMMIT DROP;

  -- Source A: report_tags (user submissions + any tagged reports)
  INSERT INTO _report_types (report_id, type_id)
  SELECT DISTINCT report_id, phenomenon_type_id
  FROM public.report_tags
  WHERE phenomenon_type_id IS NOT NULL;

  -- Source B: reports.phenomenon_type_id (primary type on every report)
  INSERT INTO _report_types (report_id, type_id)
  SELECT DISTINCT id, phenomenon_type_id
  FROM public.reports
  WHERE phenomenon_type_id IS NOT NULL;

  -- Source C: report_phenomena → phenomena.phenomenon_type_id (ingested reports)
  INSERT INTO _report_types (report_id, type_id)
  SELECT DISTINCT rp.report_id, p.phenomenon_type_id
  FROM public.report_phenomena rp
  JOIN public.phenomena p ON p.id = rp.phenomenon_id
  WHERE p.phenomenon_type_id IS NOT NULL;

  -- Deduplicate (a report may be in multiple sources)
  CREATE TEMP TABLE _report_types_deduped AS
  SELECT DISTINCT report_id, type_id FROM _report_types;
  DROP TABLE _report_types;

  -- Step 2: Count how many reports each type appears on (for Jaccard denominator)
  CREATE TEMP TABLE _type_counts AS
  SELECT type_id, count(DISTINCT report_id) AS report_count
  FROM _report_types_deduped
  GROUP BY type_id
  HAVING count(DISTINCT report_id) >= 2;  -- skip types with <2 reports

  -- Step 3: Self-join to find co-occurrences (pairs on the same report)
  CREATE TEMP TABLE _co_occurrences AS
  SELECT
    LEAST(a.type_id, b.type_id) AS type_id_a,
    GREATEST(a.type_id, b.type_id) AS type_id_b,
    count(DISTINCT a.report_id) AS co_count
  FROM _report_types_deduped a
  JOIN _report_types_deduped b
    ON a.report_id = b.report_id
    AND a.type_id < b.type_id  -- avoid self-pairs and duplicates
  GROUP BY LEAST(a.type_id, b.type_id), GREATEST(a.type_id, b.type_id)
  HAVING count(DISTINCT a.report_id) >= 2;  -- minimum 2 co-occurrences

  -- Step 4: Compute Jaccard similarity score
  CREATE TEMP TABLE _computed_assoc AS
  SELECT
    co.type_id_a,
    co.type_id_b,
    co.co_count,
    ROUND(
      co.co_count::NUMERIC / (ca.report_count + cb.report_count - co.co_count),
      3
    ) AS jaccard_score
  FROM _co_occurrences co
  JOIN _type_counts ca ON ca.type_id = co.type_id_a
  JOIN _type_counts cb ON cb.type_id = co.type_id_b;

  -- Step 5: Upsert computed associations
  -- Update existing rows (both curated and computed)
  UPDATE public.phenomenon_type_associations pta
  SET
    co_occurrence_count = ca.co_count,
    association_score = GREATEST(
      CASE WHEN pta.source = 'curated' THEN pta.association_score ELSE 0 END,
      ca.jaccard_score
    ),
    source = CASE
      WHEN pta.source = 'curated' AND ca.jaccard_score > pta.association_score
        THEN 'computed'  -- data overtook the curated score
      ELSE pta.source
    END,
    last_calculated_at = NOW()
  FROM _computed_assoc ca
  WHERE pta.type_id_a = ca.type_id_a
    AND pta.type_id_b = ca.type_id_b;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Insert new pairs that don't exist yet
  INSERT INTO public.phenomenon_type_associations
    (type_id_a, type_id_b, co_occurrence_count, association_score, source, last_calculated_at)
  SELECT
    ca.type_id_a,
    ca.type_id_b,
    ca.co_count,
    ca.jaccard_score,
    'computed',
    NOW()
  FROM _computed_assoc ca
  WHERE NOT EXISTS (
    SELECT 1 FROM public.phenomenon_type_associations pta
    WHERE pta.type_id_a = ca.type_id_a
      AND pta.type_id_b = ca.type_id_b
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Cleanup
  DROP TABLE _report_types_deduped;
  DROP TABLE _type_counts;
  DROP TABLE _co_occurrences;
  DROP TABLE _computed_assoc;

  RETURN QUERY SELECT v_updated, v_inserted;
END;
$fn$;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT
--   a.slug as type_a,
--   b.slug as type_b,
--   pta.association_score,
--   pta.source
-- FROM public.phenomenon_type_associations pta
-- JOIN public.phenomenon_types a ON a.id = pta.type_id_a
-- JOIN public.phenomenon_types b ON b.id = pta.type_id_b
-- ORDER BY pta.association_score DESC
-- LIMIT 20;
