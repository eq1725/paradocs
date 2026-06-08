-- Migration: source_body_sha256 (Copyright Sprint 2)
--
-- Date: 2026-06-08
-- Sprint:  Copyright Sprint 2 (Option A: truncate + snapshot)
-- Related: docs/COPYRIGHT_DERIVATIVE_WORK_AUDIT.md
--          docs/DESCRIPTION_BACKFILL_SCOPE.md (§6)
--          docs/COPYRIGHT_SPRINT_2_NOTES.md
--
-- Purpose:
--   Audit-trail snapshot. Allows verification that Paradocs's narrative
--   was derived from a specific known source-body content, without
--   storing that source-body text indefinitely. Used by the future
--   Sprint 3 strip + ingest-time-snapshot path (DESCRIPTION_BACKFILL_SCOPE
--   §6). For an IP-counsel review, "we no longer store the source text,
--   but we can prove we extracted X from a source body whose SHA-256
--   matches the one the rights holder will reproduce from their archive"
--   is materially stronger than "we no longer store it and have no
--   audit trail."
--
-- Backfill:
--   scripts/backfill-description-truncate-v1.ts populates this column
--   for every row where description IS NOT NULL AND source_body_sha256
--   IS NULL. Same script applies the 2,000-char description truncation.
--   The hash is computed against the ORIGINAL pre-truncation description
--   so the audit trail captures the body that Haiku actually saw at
--   ingest time.
--
-- Schema:
--   - source_body_sha256 TEXT (nullable) — 64-char hex SHA-256 of the
--     pre-truncation description. Sized as TEXT rather than CHAR(64)
--     to leave room for a future per-source prefix marker
--     ("sha256:..." vs "sha512:...") if the hash algorithm changes.
--   - Partial index on (source_body_sha256) WHERE NOT NULL — keeps the
--     index sparse during the backfill ramp and during steady-state
--     (only rows with a snapshot get indexed). Optimizes the hot
--     lookup pattern for IP-counsel / DMCA audits: "find report by
--     known source-body hash."
--
-- Forward path (Sprint 3 / engine.ts hot path):
--   The V11.17.x copyright Sprint 2 change to src/lib/ingestion/engine.ts
--   already populates source_body_sha256 at INSERT time alongside the
--   2,000-char description cap, so every new ingest from Sprint 2
--   forward lands with the snapshot pre-filled (no backfill needed).

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS source_body_sha256 TEXT;

-- Partial index: only rows with a snapshot get indexed. Sparse during
-- the backfill ramp; small in steady state (the rows without a hash
-- are the four user_submission rows that the backfill explicitly
-- skips). Index used by future IP-counsel / DMCA lookup queries:
--   SELECT id, slug FROM reports WHERE source_body_sha256 = $1;
CREATE INDEX IF NOT EXISTS idx_reports_source_body_sha256
  ON reports (source_body_sha256)
  WHERE source_body_sha256 IS NOT NULL;

COMMENT ON COLUMN reports.source_body_sha256 IS
  'SHA-256 hex digest of the original (pre-truncation) source body. '
  'Copyright Sprint 2 audit-trail snapshot — proves Paradocs derived '
  'a narrative from a specific source content without retaining that '
  'content indefinitely. Populated by scripts/backfill-description-'
  'truncate-v1.ts for historical rows and by engine.ts at INSERT '
  'time for new rows.';
