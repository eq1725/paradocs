-- =====================================================================
-- V8 Tier 1 — anchor_case_hook + signal-chip fields on phenomena.
--
-- Background: card UX panel review (TODAY_CARD_UX_PANEL_REVIEW.md)
-- diagnosed that cards lead with definitions ("Spiritual beings appearing
-- across Judaism, Christianity, Islam...") instead of cold-open anchor
-- cases. This migration adds the underlying fields so the LLM can
-- generate structured cold-open content per phenomenon.
--
-- Privacy constraint: experiencer names from BFRO/NUFORC/NDERF/OBERF
-- and other private archives are NEVER stored here. The anchor_witness
-- field stores ANONYMIZED witness roles ("a vacationing surgeon", "two
-- riders", "47 witnesses across 3 decades"). Names of public figures
-- on theatrical releases / court filings (Patterson-Gimlin, Travis
-- Walton) are permitted at editorial discretion via the admin tool.
-- =====================================================================

ALTER TABLE phenomena
  ADD COLUMN IF NOT EXISTS anchor_case_hook TEXT,
  ADD COLUMN IF NOT EXISTS anchor_when TEXT,
  ADD COLUMN IF NOT EXISTS anchor_where TEXT,
  ADD COLUMN IF NOT EXISTS anchor_witness TEXT,
  ADD COLUMN IF NOT EXISTS unresolved_tension TEXT;

-- Index for "which phenomena are missing an anchor hook" — drives the
-- batch_missing action in /api/admin/ai/generate-anchor-cases.
CREATE INDEX IF NOT EXISTS phenomena_anchor_hook_missing_idx
  ON phenomena(id)
  WHERE anchor_case_hook IS NULL;

-- Comment: the existing feed_hook column (V6) stays — it remains the
-- fallback when anchor_case_hook is null. After the Tier 1 sweep
-- completes, we expect ~100% coverage and feed_hook becomes vestigial.
COMMENT ON COLUMN phenomena.anchor_case_hook IS
  'V8 cold-open hook: 2-3 sentences leading with year + place + anonymized witness role + specific action + twist. Replaces feed_hook on the Today card.';
COMMENT ON COLUMN phenomena.anchor_when IS
  'Short signal chip label: "Oct 1934", "Since 1950s", "1947", etc.';
COMMENT ON COLUMN phenomena.anchor_where IS
  'Short signal chip label: "Loch Ness, Scotland", "Phoenix, AZ", etc.';
COMMENT ON COLUMN phenomena.anchor_witness IS
  'Anonymized witness role/count: "a vacationing surgeon", "two riders", "47 witnesses across 3 decades". NEVER experiencer names from private archives.';
COMMENT ON COLUMN phenomena.unresolved_tension IS
  'One-line unresolved claim or contested point. Closes the curiosity gap that the hook opens.';
