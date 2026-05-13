-- ============================================================
-- V10.7.A.0 — Per-report witness profile (demographic extraction)
--
-- Adds a single JSONB column for the structured witness profile
-- the AI will extract during ingestion (V10.7.A.1). Two of the
-- dimensions we'll filter on get STORED generated columns +
-- indexes so /explore filters work without GIN scans on JSONB.
--
-- Why JSONB instead of discrete columns?
--   - The set of dimensions will evolve as we see what reports
--     consistently surface. Adding a key to JSONB doesn't need
--     a schema change.
--   - Most rows will have most fields missing (the AI marks
--     unsupported fields as 'unspecified'/null). JSONB stores
--     this sparsely; a wide table of nullable columns wastes
--     row space and adds back-and-forth migrations.
--   - The generated columns give us the index-friendly access
--     pattern for the two dimensions we KNOW we want to filter
--     on (age_range + state_at_event); other dimensions can be
--     queried via JSONB ops at lower frequency.
--
-- Target JSONB shape (all keys optional, all values lowercase
-- snake_case enums or null/booleans):
--
--   {
--     "age_range": "child"|"teen"|"18-29"|"30-49"|"50-69"|"70+"|"unspecified",
--     "gender": "female"|"male"|"nonbinary"|"unspecified",
--     "occupation_category":
--        "student"|"military_vet"|"medical"|"first_responder"
--        |"aviation"|"tradesperson"|"office"|"retired"
--        |"other"|"unspecified",
--     "state_at_event":
--        "awake_alert"|"meditation"|"drowsy_falling_asleep"
--        |"sleeping"|"driving"|"physical_activity"
--        |"intoxicated"|"unspecified",
--     "with_others": true|false|null,
--     "prior_similar_experience": true|false|null,
--     "confidence": 0.0..1.0
--   }
--
-- Privacy posture:
--   The AI prompt (V10.7.A.1) bans extracting first/last names,
--   employer names, exact addresses, or any identifying detail.
--   state_at_event is bucketed deliberately ("intoxicated" not
--   "drunk at his cousin's wedding"). This migration just makes
--   the storage. PII protection is the prompt's job.
-- ============================================================

-- 1) The JSONB column ----------------------------------------

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS witness_profile JSONB DEFAULT NULL;

COMMENT ON COLUMN public.reports.witness_profile IS
  'V10.7 — AI-extracted structured witness profile. See migration 20260514 for shape. Optional; NULL means no extraction has run yet OR the source had insufficient detail.';

-- 2) Generated columns for filterable dimensions -------------
--
-- STORED (not VIRTUAL) so they're index-able. Both are
-- IMMUTABLE-friendly because JSONB ->> returns text and the
-- column read is deterministic for a given row.
--
-- We only generate columns for dimensions we plan to expose as
-- top-level /explore filters in the near term. Other dimensions
-- (gender, occupation_category, with_others, etc.) stay in the
-- JSONB and can be queried via `witness_profile->>'gender'`
-- when needed — that's fine for analytics and Lab queries; only
-- the hot user-facing filter paths need a dedicated index.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS witness_age_range TEXT
    GENERATED ALWAYS AS (witness_profile->>'age_range') STORED;

COMMENT ON COLUMN public.reports.witness_age_range IS
  'Generated from witness_profile->>age_range. Used by /explore?witness_age=... filter and the witness pill UI.';

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS witness_state_at_event TEXT
    GENERATED ALWAYS AS (witness_profile->>'state_at_event') STORED;

COMMENT ON COLUMN public.reports.witness_state_at_event IS
  'Generated from witness_profile->>state_at_event. State-of-consciousness during the experience (meditation, driving, drowsy, etc.).';

-- 3) Indexes -------------------------------------------------
--
-- Partial indexes — most rows will have NULL for these (either
-- the AI hasn't run, or it returned "unspecified" which the
-- generated column will surface as the literal text
-- "unspecified"). We index BOTH cases (not null) so we can do
-- "show me everyone where age_range is set", and we'll filter
-- the literal "unspecified" out at query time at the API layer.

CREATE INDEX IF NOT EXISTS idx_reports_witness_age_range
  ON public.reports(witness_age_range)
  WHERE witness_age_range IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_witness_state_at_event
  ON public.reports(witness_state_at_event)
  WHERE witness_state_at_event IS NOT NULL;

-- GIN on the whole JSONB so ad-hoc admin queries
-- (`witness_profile @> '{"occupation_category":"aviation"}'`)
-- stay fast. Lower priority than the generated-column indexes
-- but cheap to maintain at our scale.
CREATE INDEX IF NOT EXISTS idx_reports_witness_profile_gin
  ON public.reports USING gin (witness_profile)
  WHERE witness_profile IS NOT NULL;

-- 4) Audit table compatibility -------------------------------
--
-- The V10.7.A.1 service will write witness-profile rows to the
-- existing ai_rewrite_audit table with prompt_kind='witness_profile'.
-- No schema change needed there — output_field is already TEXT and
-- prompt_version is already free-form.
--
-- (No DO block; just leaving this note so the next dev knows
--  why we didn't touch ai_rewrite_audit.)

-- ============================================================
-- V10.7.A.0 done.
--
-- Next:
--   V10.7.A.1 — witness-profile.service.ts + ingestion hook
--               + /admin/backfill/witness-profile endpoint
--   V10.7.A.2 — WitnessProfilePill.tsx + getStaticProps wiring
-- ============================================================
