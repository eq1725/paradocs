-- =====================================================================
-- V9.0 — anchor_case_hook + signal-chip fields on reports.
--
-- Mirrors the V8 migration on phenomena (20260504_anchor_case_hooks.sql)
-- so report cards can reach V8 visual parity in the Today feed.
--
-- Privacy constraint: experiencer names from BFRO/NUFORC/NDERF/OBERF
-- and other private archives are NEVER stored. The anchor_witness
-- field stores ANONYMIZED roles only ("a hiker", "a flight crew of 4",
-- "two motorists"). Names of public-figure witnesses (theatrical
-- releases, court filings, peer-reviewed publications) are permitted
-- via editorial override on a case-by-case basis.
-- =====================================================================

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS anchor_case_hook TEXT,
  ADD COLUMN IF NOT EXISTS anchor_when TEXT,
  ADD COLUMN IF NOT EXISTS anchor_where TEXT,
  ADD COLUMN IF NOT EXISTS anchor_witness TEXT,
  ADD COLUMN IF NOT EXISTS unresolved_tension TEXT;

-- Index for "which reports are missing an anchor hook" — drives the
-- batch_missing action in /api/admin/ai/generate-anchor-cases?type=reports.
CREATE INDEX IF NOT EXISTS reports_anchor_hook_missing_idx
  ON reports(id)
  WHERE anchor_case_hook IS NULL;

COMMENT ON COLUMN reports.anchor_case_hook IS
  'V9 cold-open hook for report cards: 2-3 sentences leading with date + place + anonymized witness role + specific action + twist. Replaces feed_hook on the Today card when present.';
COMMENT ON COLUMN reports.anchor_when IS
  'Short signal chip label derived from event_date + event_date_precision: "Aug 2019", "1947", "Spring 2024".';
COMMENT ON COLUMN reports.anchor_where IS
  'Short signal chip label derived from city/state/country: "Squamish, BC", "Phoenix, AZ", "Pacific NW".';
COMMENT ON COLUMN reports.anchor_witness IS
  'Anonymized witness role/count: "a driver", "two campers", "a flight crew of 4". NEVER names from BFRO/NUFORC/NDERF/OBERF/Reddit/Erowid/etc.';
COMMENT ON COLUMN reports.unresolved_tension IS
  'One-line unresolved claim or contested point from the report. Closes the curiosity gap that the hook opens. Optional — skip for reports without a strong tension element.';
