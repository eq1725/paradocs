-- ============================================================================
-- Migration: NDE-family taxonomy — phenomenon_types + encyclopedia entries
-- Date: 2026-04-14 (Session B1.5 pre-QA/QC prep)
--
-- Purpose
-- -------
-- Before B1.5 runs 5-per-type smoke tests against NDERF + OBERF, the DB must
-- be able to:
--   1. Store a proper phenomenon_type_id on each imported report (so the
--      category facet + search filters work).
--   2. Resolve an encyclopedia page for every experience type (so the
--      ingest-time pattern matcher fires and a /phenomena/<slug> page exists
--      for users).
--   3. Back-link reports to encyclopedia entries via report_phenomena (so
--      "related reports" renders on each encyclopedia page).
--
-- Prior to this migration, the only NDE-family entry in either table was a
-- bare phenomenon_type row (slug 'obe', seeded in 001_initial_schema.sql).
-- No encyclopedia entries existed for NDE, OBE, SOBE, STE, DBV, ADC, NELE,
-- NDE-Like, Pre-Birth, Prayer, Dream, Premonition, Shared-Death, Distressing
-- NDE, or Other — so none of the ~30K rows we'll ingest in B2 would have
-- been classified or linked.
--
-- Slugs below are deliberately chosen to match the OBERF adapter's existing
-- `typeSlug` values (see src/lib/ingestion/adapters/oberf.ts) so the engine
-- can do a direct phenomenon_types.slug lookup from metadata.experienceTypeSlug.
--
-- Trigger handling
-- ----------------
-- The `phenomena` table has a BEFORE INSERT trigger
-- (check_near_duplicate_phenomena, defined in DB, not in repo) that fires
-- before ON CONFLICT resolution. If an auto-generated row with the same name
-- already exists (e.g. 'Near-Death Experience' created by
-- identifyPhenomenaForReport during prior ingestion), a plain INSERT ... ON
-- CONFLICT (slug) DO NOTHING will still RAISE and abort. To make this
-- migration idempotent we:
--   1. Temporarily disable user triggers on phenomena.
--   2. UPDATE any existing rows that match our canonical names (by
--      lower(name)) to use our canonical slug, aliases, type FK, etc.
--   3. INSERT any still-missing canonical entries (skipped on slug conflict).
--   4. Re-enable the trigger.
-- No data is lost — existing report_phenomena FKs to the (updated) row stay
-- intact because we UPDATE in place rather than DELETE+INSERT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: Upgrade the legacy 'obe' phenomenon_type to the full slug used by
-- the OBERF adapter. Keep the row (FK preservation) and just rename/retag it.
-- ----------------------------------------------------------------------------
UPDATE public.phenomenon_types
SET
  slug = 'out-of-body-experience',
  name = 'Out-of-Body Experience',
  description = 'A phenomenon in which the subject experiences their consciousness as separated from their physical body, often observing themselves and surroundings from an external viewpoint.',
  category = 'psychological_experiences',
  icon = '✨'
WHERE slug = 'obe';

-- ----------------------------------------------------------------------------
-- Step 2: Seed phenomenon_types for the remaining NDE-family experience types.
-- Uses ON CONFLICT DO NOTHING so migration is idempotent.
-- ----------------------------------------------------------------------------
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
  ('psychological_experiences', 'Near-Death Experience', 'near-death-experience',
    'Profound subjective experiences reported by people who have been clinically dead or in mortal danger, typically including sensations such as detachment from the body, feelings of peace, encounters with deceased relatives or a being of light, life review, and transit through a tunnel or boundary.', '🕯️'),

  ('psychological_experiences', 'Sudden Out-of-Body Experience', 'sudden-obe',
    'Spontaneous, unanticipated episodes of consciousness separation from the physical body, typically brief and occurring without meditative preparation, illness, or trauma.', '💫'),

  ('psychological_experiences', 'Spiritually Transformative Experience', 'spiritually-transformative-experience',
    'Profound consciousness events — mystical, numinous, or unitive — that the experiencer reports as enduringly altering their worldview, values, and sense of self, without necessarily involving mortal peril.', '🌟'),

  ('psychological_experiences', 'Deathbed Vision', 'deathbed-vision',
    'Visions, encounters, or altered perceptions reported by dying persons in the hours or days before death, frequently involving deceased relatives, religious figures, or otherworldly landscapes.', '🕊️'),

  ('psychic_phenomena', 'After-Death Communication', 'after-death-communication',
    'Subjective experiences reported by the bereaved of direct contact — sensed presence, auditory messages, dream encounters, or physical-world signs — with a loved one who has died.', '💌'),

  ('psychological_experiences', 'Nearing End-of-Life Experience', 'nearing-end-of-life-experience',
    'Altered-awareness experiences reported in the weeks or months preceding death, including reaching-toward-unseen gestures, unexplained lucidity, and anticipatory visions, distinct from same-hour deathbed phenomena.', '🌅'),

  ('psychological_experiences', 'NDE-Like Experience', 'nde-like-experience',
    'Phenomenologically NDE-shaped experiences — tunnel, light, life review, unconditional love — occurring in the absence of clinical death or mortal injury, often during extreme stress, meditation, or spontaneously.', '🔦'),

  ('psychic_phenomena', 'Pre-Birth Memory', 'pre-birth-memory',
    'Reported conscious memories of existence, planning, or communication preceding one''s own birth or conception, including memories attributed to infants and young children.', '👶'),

  ('psychological_experiences', 'Prayer Experience', 'prayer-experience',
    'Altered-consciousness events reported during or immediately following prayer, including mystical absorption, felt presences, answered prayers, and unexplained physical sensations.', '🙏'),

  ('psychological_experiences', 'Dream Experience', 'dream-experience',
    'Anomalous dream states including lucid dreams, apparent visitations from deceased persons, and dreams with unusually high subjective intensity or significance, excluding clearly precognitive content.', '💤'),

  ('psychic_phenomena', 'Premonition / Waking Vision', 'premonition-experience',
    'Apparently prescient perceptions of future events — including waking visions, vivid foresight impressions, and symbolic warnings — that the experiencer reports as subsequently confirmed.', '👁️'),

  ('psychological_experiences', 'Shared Death Experience', 'shared-death-experience',
    'Phenomena in which a caregiver, family member, or bystander reports sharing elements of a dying person''s end-of-life experience, such as co-witnessed visions or apparent joint transit.', '🤝'),

  ('psychological_experiences', 'Distressing Near-Death Experience', 'distressing-nde',
    'Near-death experiences with predominantly frightening, void-like, or hellish phenomenology, distinct from the more commonly reported peaceful NDE pattern.', '⚡'),

  ('psychological_experiences', 'Other Anomalous Experience', 'other-experience',
    'Experiential reports that do not fit the established NDE-family categories but share phenomenological features such as altered consciousness, encounters, or unexplained knowledge.', '❓')
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Step 3: Seed encyclopedia entries (phenomena).
--
-- We do this inside a DO block so we can:
--   (a) temporarily disable the near-duplicate trigger,
--   (b) MERGE (canonicalize) any pre-existing auto-generated rows by
--       lower(name) match, and
--   (c) INSERT the remainder, then re-enable the trigger.
--
-- The canonical seed data is held in a temp table so Step 3a and Step 3b can
-- both reference it without duplication.
-- ----------------------------------------------------------------------------

CREATE TEMP TABLE _nde_family_seed (
  name text,
  slug text,
  aliases text[],
  category text,
  icon text,
  ai_summary text,
  confidence_score numeric
) ON COMMIT DROP;

INSERT INTO _nde_family_seed VALUES
  ('Near-Death Experience', 'near-death-experience',
    ARRAY['NDE', 'Near Death Experience', 'Near-Death', 'Near Death', 'Clinical Death Experience', 'Tunnel of Light Experience'],
    'psychological_experiences', '🕯️',
    'A profound subjective experience reported by people who have been clinically dead or in mortal danger, typically featuring sensations of peace, out-of-body perception, encounters with a being of light, and a sense of transit through a tunnel or boundary.',
    0.98),

  ('Out-of-Body Experience', 'out-of-body-experience',
    ARRAY['OBE', 'OOBE', 'Out of Body Experience', 'Out-of-Body', 'Body Separation', 'Consciousness Separation'],
    'psychological_experiences', '✨',
    'An experience in which a person perceives their consciousness as separated from their physical body, typically observing themselves and their surroundings from an external vantage point.',
    0.98),

  ('Sudden Out-of-Body Experience', 'sudden-obe',
    ARRAY['SOBE', 'Sudden OBE', 'Spontaneous Out-of-Body Experience', 'Spontaneous OBE', 'Unprovoked OBE'],
    'psychological_experiences', '💫',
    'A spontaneous, unanticipated out-of-body experience occurring without meditative preparation, physical trauma, or illness — frequently brief and subjectively startling.',
    0.95),

  ('Spiritually Transformative Experience', 'spiritually-transformative-experience',
    ARRAY['STE', 'Spiritually Transformative', 'Mystical Experience', 'Spiritual Awakening Experience', 'Unitive Consciousness'],
    'psychological_experiences', '🌟',
    'A profound consciousness experience — mystical, numinous, or unitive — that the experiencer reports as lastingly altering their worldview, values, and sense of self.',
    0.95),

  ('Deathbed Vision', 'deathbed-vision',
    ARRAY['DBV', 'Deathbed Visions', 'End-of-Life Vision', 'Pre-Mortem Vision', 'Death-Bed Vision'],
    'psychological_experiences', '🕊️',
    'A vision or altered perception reported by a dying person in the hours or days before death, often involving deceased relatives, religious figures, or otherworldly landscapes.',
    0.95),

  ('After-Death Communication', 'after-death-communication',
    ARRAY['ADC', 'After Death Communication', 'Post-Mortem Contact', 'Bereavement Vision', 'Posthumous Contact', 'Spirit Communication'],
    'psychic_phenomena', '💌',
    'A subjective experience reported by the bereaved of direct contact with a loved one who has died — through sensed presence, auditory messages, dream encounters, or apparent physical-world signs.',
    0.95),

  ('Nearing End-of-Life Experience', 'nearing-end-of-life-experience',
    ARRAY['NELE', 'Nearing End of Life Experience', 'Pre-Death Experience', 'Approaching-Death Awareness', 'End-of-Life Awareness'],
    'psychological_experiences', '🌅',
    'An altered-awareness experience reported in the weeks or months preceding death — including reaching-toward-unseen gestures, unexplained lucidity, and anticipatory visions.',
    0.92),

  ('NDE-Like Experience', 'nde-like-experience',
    ARRAY['NDE-Like', 'NDE Like', 'NDE-like Experience', 'Fear-Death Experience', 'FDE', 'NDE-Adjacent', 'Pseudo-NDE', 'NDE without clinical death', 'Near-death-like'],
    'psychological_experiences', '🔦',
    'An experience phenomenologically indistinguishable from a near-death experience — tunnel, light, life review, unconditional love — but occurring without clinical death, typically in extreme stress, meditation, or spontaneously.',
    0.93),

  ('Pre-Birth Memory', 'pre-birth-memory',
    ARRAY['Pre-Birth', 'Prebirth Memory', 'Pre-Existence Memory', 'Soul Choice Memory', 'In-Utero Memory', 'Life-Planning Memory'],
    'psychic_phenomena', '👶',
    'A reported conscious memory of existence, planning, or communication preceding one''s own birth or conception, including memories attributed to infants and young children.',
    0.88),

  ('Prayer Experience', 'prayer-experience',
    ARRAY['Prayer Vision', 'Mystical Prayer', 'Answered Prayer', 'Contemplative Prayer Experience'],
    'psychological_experiences', '🙏',
    'An altered-consciousness event reported during or immediately following prayer — including mystical absorption, felt presences, apparent answers, and unexplained physical sensations.',
    0.85),

  ('Dream Experience', 'dream-experience',
    ARRAY['Anomalous Dream', 'Visitation Dream', 'Numinous Dream', 'Spiritual Dream', 'Dream Vision'],
    'psychological_experiences', '💤',
    'An anomalous dream state including lucid, visitation-type, or unusually significant dreams, excluding clearly precognitive content (see Premonition).',
    0.85),

  ('Premonition / Waking Vision', 'premonition-experience',
    ARRAY['Premonition', 'Waking Vision', 'Precognitive Vision', 'Foresight', 'Prophetic Dream', 'Precognition'],
    'psychic_phenomena', '👁️',
    'An apparently prescient perception of a future event — a waking vision, vivid foresight impression, or symbolic warning — that the experiencer reports as subsequently confirmed.',
    0.88),

  ('Shared Death Experience', 'shared-death-experience',
    ARRAY['SDE', 'Shared Death', 'Sympathetic Death Experience', 'Empathic Death Experience', 'Shared-NDE'],
    'psychological_experiences', '🤝',
    'A phenomenon in which a caregiver, family member, or bystander reports sharing elements of a dying person''s end-of-life experience, such as co-witnessed visions or apparent joint transit.',
    0.90),

  ('Distressing Near-Death Experience', 'distressing-nde',
    ARRAY['Distressing NDE', 'Hellish NDE', 'Negative NDE', 'Frightening NDE', 'Void Experience'],
    'psychological_experiences', '⚡',
    'A near-death experience with predominantly frightening, void-like, or hellish phenomenology, distinct from the more commonly reported peaceful NDE pattern.',
    0.92),

  ('Other Anomalous Experience', 'other-experience',
    ARRAY['Other Experience', 'Unclassified Anomalous Experience', 'Anomalous Experience'],
    'psychological_experiences', '❓',
    'An experiential report that does not fit the established NDE-family categories but shares phenomenological features such as altered consciousness, unusual encounters, or unexplained knowledge.',
    0.70);

-- Disable user triggers on phenomena (the near-duplicate trigger fires BEFORE
-- ON CONFLICT resolution, so we need it out of the way to run an idempotent
-- upsert pattern). System triggers (FK / PK checks) remain active.
ALTER TABLE public.phenomena DISABLE TRIGGER USER;

-- Step 3a: Canonicalize any pre-existing rows that match our names.
-- This handles rows auto-created by identifyPhenomenaForReport() during
-- earlier ingestion (which may have slightly different slugs or missing
-- phenomenon_type_id / aliases).
UPDATE public.phenomena p SET
  slug = s.slug,
  aliases = ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p.aliases, ARRAY[]::text[]) || s.aliases) x WHERE x IS NOT NULL AND x <> ''),
  category = s.category::phenomenon_category,
  phenomenon_type_id = (SELECT id FROM public.phenomenon_types WHERE slug = s.slug),
  icon = COALESCE(NULLIF(p.icon, ''), s.icon),
  ai_summary = COALESCE(NULLIF(p.ai_summary, ''), s.ai_summary),
  status = 'active',
  confidence_score = GREATEST(COALESCE(p.confidence_score, 0), s.confidence_score)
FROM _nde_family_seed s
WHERE lower(p.name) = lower(s.name)
   OR p.slug = s.slug;

-- Step 3b: Insert any seed rows that are still missing after the canonicalize
-- pass (i.e. no existing phenomena row by name or slug match).
INSERT INTO public.phenomena (
  name, slug, aliases, category, phenomenon_type_id, icon,
  ai_summary, status, auto_generated, confidence_score
)
SELECT
  s.name,
  s.slug,
  s.aliases,
  s.category::phenomenon_category,
  (SELECT id FROM public.phenomenon_types WHERE slug = s.slug),
  s.icon,
  s.ai_summary,
  'active',
  false,
  s.confidence_score
FROM _nde_family_seed s
WHERE NOT EXISTS (
  SELECT 1 FROM public.phenomena p
  WHERE p.slug = s.slug
     OR lower(p.name) = lower(s.name)
);

-- Re-enable user triggers
ALTER TABLE public.phenomena ENABLE TRIGGER USER;

-- ----------------------------------------------------------------------------
-- Step 4: Verification queries (commented — run manually to confirm).
-- ----------------------------------------------------------------------------
-- SELECT slug, name, category FROM public.phenomenon_types
--   WHERE slug IN (
--     'near-death-experience', 'out-of-body-experience', 'sudden-obe',
--     'spiritually-transformative-experience', 'deathbed-vision',
--     'after-death-communication', 'nearing-end-of-life-experience',
--     'nde-like-experience', 'pre-birth-memory', 'prayer-experience',
--     'dream-experience', 'premonition-experience', 'shared-death-experience',
--     'distressing-nde', 'other-experience'
--   )
--   ORDER BY name;
--
-- SELECT p.slug, p.name, pt.slug AS type_slug, array_length(p.aliases, 1) AS alias_count
--   FROM public.phenomena p
--   LEFT JOIN public.phenomenon_types pt ON p.phenomenon_type_id = pt.id
--   WHERE p.slug IN (
--     'near-death-experience', 'out-of-body-experience', 'sudden-obe',
--     'spiritually-transformative-experience', 'deathbed-vision',
--     'after-death-communication', 'nearing-end-of-life-experience',
--     'nde-like-experience', 'pre-birth-memory', 'prayer-experience',
--     'dream-experience', 'premonition-experience', 'shared-death-experience',
--     'distressing-nde', 'other-experience'
--   )
--   ORDER BY p.name;
