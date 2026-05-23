-- V11.16 — Phenomena image metadata
--
-- Adds licensing + attribution + accessibility fields so we can adopt
-- images into our own Supabase Storage bucket instead of hotlinking
-- Wikimedia (current fragile pattern). Required for the V11.16 image
-- pipeline that fills the ~957 phenomena currently lacking a hero
-- image and cleans up the ~506 that have mismatched/embarrassing
-- existing matches.
--
-- Columns:
--   image_source        — provenance class (wikimedia | internet_archive |
--                          flickr_commons | library_of_congress |
--                          ai_generated | fair_use_screenshot | manual)
--   image_license       — license class (cc0 | cc_by | cc_by_sa | pd_age
--                          | fair_use_educational | proprietary)
--   image_attribution   — short HTML string for the credit line, e.g.
--                          'Photo: <a href="...">Wikimedia / John Smith</a>
--                          (CC BY-SA 4.0)'
--   image_alt_text      — descriptive alt for screen readers. NOT a label
--                          like "image of Bigfoot" — describes the image
--                          contents.
--   image_adopted_at    — when the V11.16 pipeline adopted it; null if the
--                          field still holds a legacy hotlinked URL.
--   image_review_score  — 0-100 Haiku confidence that the image actually
--                          depicts the phenomenon. Anything <60 should
--                          be re-sourced.
--
-- All columns are nullable so this migration is non-breaking for the
-- existing 506 phenomena with hotlinked Wikimedia URLs — those keep
-- working until the cleanup pass replaces them.

ALTER TABLE phenomena
  ADD COLUMN IF NOT EXISTS image_source        TEXT,
  ADD COLUMN IF NOT EXISTS image_license       TEXT,
  ADD COLUMN IF NOT EXISTS image_attribution   TEXT,
  ADD COLUMN IF NOT EXISTS image_alt_text      TEXT,
  ADD COLUMN IF NOT EXISTS image_adopted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_review_score  SMALLINT;

-- Index lets the adoption script quickly find phenomena that still need
-- processing OR need a re-review (low score).
CREATE INDEX IF NOT EXISTS phenomena_image_review_idx
  ON phenomena (image_review_score)
  WHERE status = 'active';
