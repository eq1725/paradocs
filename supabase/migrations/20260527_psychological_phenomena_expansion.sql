-- Migration: expand psychological_experiences phenomena taxonomy (V11.17.39, #107)
--
-- Audit of 50-report sample of category=psychological_experiences found
-- that ~46% of reports (all from Reddit) describe real anomalous
-- experiences that don't fit ANY existing phenomenon slug under this
-- category. The classifier was correctly returning null for these
-- because there was no taxonomy to link to. Categories of missed
-- experiences:
--
--   - Synchronicity (e.g. "soul-written letter precedes unexpected
--     encounter"; "old wallet materializes at new apartment threshold")
--   - Manifestation/conversational influence (e.g. "thought it strongly,
--     it happened the next day")
--   - Vanishing objects / apports (e.g. "wallet appeared at my door
--     after being lost months ago")
--
-- Adding these as first-class slugs lets the classifier link the
-- 273+ stuck reports to appropriate phenomenon pages. Each new slug
-- carries a category='psychological_experiences' so it shows up under
-- the existing category page + match algorithm.

-- phenomenon_types schema: id, name, slug, description, icon, parent_id, created_at, category, user_submittable
-- No updated_at column (verified V11.17.39 via service-role inspection).
INSERT INTO public.phenomenon_types (slug, name, category, description, created_at)
VALUES
  (
    'synchronicity',
    'Synchronicity',
    'psychological_experiences',
    'Meaningful coincidence — events that appear unrelated by causal mechanism but carry a felt connection to the witness''s inner state, often experienced as a sign or affirmation.',
    NOW()
  ),
  (
    'manifestation-experience',
    'Manifestation Experience',
    'psychological_experiences',
    'A specific intention, desire, or thought reported by the witness as preceding a corresponding physical event in a way that defies coincidence or conventional explanation.',
    NOW()
  ),
  (
    'vanishing-object',
    'Vanishing or Appearing Object',
    'psychological_experiences',
    'A physical object disappears from one location and/or appears in another location without intermediate handling, or returns to the witness in a way that defies conventional retrieval (also known as apport phenomena in some traditions).',
    NOW()
  )
ON CONFLICT (slug) DO NOTHING;
