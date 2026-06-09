-- V11.18.1 — Sprint 1A-2 — findings_catalogue table.
--
-- Purpose
-- -------
-- The Patterns surface ships a curated canvas of cross-corpus Finding
-- Cards. Each row in this table represents one published (or draft)
-- "Finding" — a Helena-cleared, screenshot-shareable artifact derived
-- from a `cross_family_overlap_pct` query against the live corpus.
--
-- See docs/UI_SHIPPING_ROADMAP_V2.md §2 (the Patterns surface) and §4.2
-- (`cross_family_overlap_pct` IS the Patterns engine). The Sprint 1
-- MVP promotes 5 of the existing 8 cross-category Hints (seed-hints.ts
-- lines 958-1147) into Finding rows; later Sprints extend with
-- temporal, geographic, witness-pattern, source-overlap, and
-- sub-family-distribution variants behind the same `eyebrow_type`
-- check constraint.
--
-- Sprint 2 extension notes
-- ------------------------
-- - `representative_report_ids` will be the join target for the
--   "→ See representative reports" affordance on the Finding detail
--   page (`/lab/patterns/[slug]`).
-- - A `findings_computed` precompute cache table will be added in
--   Sprint 2 once nightly recomputation lands (see roadmap V2 §9 R3
--   — performance mitigations at 200k+ corpus scale).
-- - `eyebrow_type` enum-style CHECK is intentionally a check (not a
--   pg enum) so new variants can be added by ALTER TABLE without an
--   enum type migration. Sprint 1 only USES `cross_cutting_descriptor`.
-- - `publish_order` is nullable on draft rows; required on published
--   rows by application convention (no DB constraint yet — the seed
--   script and admin UI both assign sequential values).
-- - `published` defaults FALSE — every newly seeded Finding lands in
--   draft so the founder can review the Haiku interpretive sentence
--   + the live query bindings before it surfaces to users.

CREATE TABLE IF NOT EXISTS findings_catalogue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  eyebrow_type TEXT NOT NULL CHECK (eyebrow_type IN (
    'cross_cutting_descriptor',
    'temporal',
    'geographic',
    'witness_pattern',
    'source_overlap',
    'sub_family_distribution'
  )),
  headline TEXT NOT NULL,
  descriptor TEXT NOT NULL,                    -- e.g. "non_physicality", "tunnel_imagery"
  phen_families JSONB NOT NULL,                -- [{family_slug, family_label, count, total_in_family, pct}]
  denominator_n INT NOT NULL,                  -- total accounts considered (sum of family totals)
  denominator_n_label TEXT NOT NULL,           -- "Across 12,420 accounts in three phen families"
  interpretive_sentence TEXT NOT NULL,         -- Haiku-generated, Helena-cleared, ≤35 words
  representative_report_ids JSONB,             -- 3-5 report IDs for "see representative reports"
  published BOOLEAN NOT NULL DEFAULT FALSE,    -- only TRUE rows appear on /lab/patterns
  publish_order INT,                           -- editorial rail ordering (NULL on drafts)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_findings_catalogue_slug
  ON findings_catalogue (slug);

CREATE INDEX IF NOT EXISTS idx_findings_catalogue_published
  ON findings_catalogue (published, publish_order)
  WHERE published = true;

-- The table is read by Patterns API endpoints under the anon role
-- (public unauthed Findings are deliberately readable so the surface
-- is SEO-indexable per V2 §2.5). Writes go through the seed script
-- and the operator admin path, both of which use the service role.
ALTER TABLE findings_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS findings_catalogue_public_read
  ON findings_catalogue
  FOR SELECT
  USING (published = true);

-- Service-role bypasses RLS automatically; no INSERT/UPDATE policies
-- needed for anon/authed roles. Founder workflow: seed script
-- (--apply) writes drafts; SQL or admin UI flips `published = true`.
