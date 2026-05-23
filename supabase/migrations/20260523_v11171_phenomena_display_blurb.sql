-- V11.17.11 — Phenomena display_blurb
--
-- Card-optimized 1-sentence descriptor. Renders on the /phenomena
-- encyclopedia list view + /explore browse tile + discover spotlight,
-- replacing the CSS-truncated ai_summary paragraph.
--
-- Why a separate field (panel review Persona C, May 2026):
--   - ai_summary is 200-400 chars, encyclopedic prose. Designed for
--     the phenomenon detail page. When chopped by line-clamp on a
--     card it reads as broken ("...spanning centuri…").
--   - display_blurb is ≤140 chars, written FOR the card. Netflix +
--     App Store + Spotify all keep a separate short blurb field for
--     this exact reason — same content shape, different render target.
--
-- Population:
--   scripts/generate-display-blurbs.ts uses the Anthropic Batch API
--   (50% discount) with Claude Haiku 4.5 to produce one blurb per
--   phenomenon. ≈$8 one-time for the current 4,500 phenomena.
--
--   The drain end-of-run hook (engine.ts) calls the same generator
--   for newly-created phenomena so the field stays populated as
--   new entries appear.
--
-- Field is nullable so the frontend can fall back to
-- firstSentence(ai_summary) until the batch completes.

ALTER TABLE phenomena
  ADD COLUMN IF NOT EXISTS display_blurb        TEXT,
  ADD COLUMN IF NOT EXISTS display_blurb_at     TIMESTAMPTZ;

-- Length guard. 140 chars is the design budget; 180 gives Haiku
-- headroom to occasionally land at a clean sentence boundary just
-- past 140 without rejection. The frontend's firstSentence() still
-- enforces the visible cap so over-budget Haiku output stays safe.
ALTER TABLE phenomena
  ADD CONSTRAINT phenomena_display_blurb_length_chk
  CHECK (display_blurb IS NULL OR char_length(display_blurb) <= 180);

-- Index lets the generator script quickly find phenomena that still
-- need a blurb (and lets cron easily count what's left).
CREATE INDEX IF NOT EXISTS phenomena_display_blurb_missing_idx
  ON phenomena (id)
  WHERE display_blurb IS NULL AND status = 'active';
