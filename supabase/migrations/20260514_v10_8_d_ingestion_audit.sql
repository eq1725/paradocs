-- ============================================================
-- V10.8.D — Ingestion validation gates + audit table
--
-- 1. Adds 'quarantine' to the report_status enum so the engine
--    can route validation-error rows into a triage queue without
--    a new table.
--
-- 2. Creates `ingestion_audit` — one row per ValidationFlag
--    emitted by validateReportBeforeInsert. The admin page
--    /admin/ingest-audit groups by (adapter, code, severity) and
--    surfaces sudden spikes (regressed regex, broken connector).
--
-- See V10.8_PIPELINE_HARDENING_DESIGN.md → "V10.8.D" for the
-- complete code matrix (11 warning + 4 error codes).
-- ============================================================

-- 1. report_status += 'quarantine'
ALTER TYPE report_status ADD VALUE IF NOT EXISTS 'quarantine';

-- 2. ingestion_audit table
CREATE TABLE IF NOT EXISTS ingestion_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     UUID REFERENCES reports(id) ON DELETE SET NULL,
  adapter       TEXT NOT NULL,                    -- 'oberf' | 'nderf' | 'reddit' | ...
  severity      TEXT NOT NULL CHECK (severity IN ('warning', 'error')),
  code          TEXT NOT NULL,                    -- 'DATE_SENTINEL_EXACT' | ...
  message       TEXT NOT NULL,                    -- human-readable
  field         TEXT,                             -- 'event_date' | 'latitude' | ...
  payload       JSONB,                            -- offending values, for forensics
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for the admin dashboard queries.
CREATE INDEX IF NOT EXISTS ingestion_audit_created_at_idx
  ON ingestion_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS ingestion_audit_adapter_code_idx
  ON ingestion_audit (adapter, code, created_at DESC);

CREATE INDEX IF NOT EXISTS ingestion_audit_severity_idx
  ON ingestion_audit (severity, created_at DESC);

CREATE INDEX IF NOT EXISTS ingestion_audit_report_id_idx
  ON ingestion_audit (report_id) WHERE report_id IS NOT NULL;

COMMENT ON TABLE ingestion_audit IS
  'V10.8.D — per-flag log from validateReportBeforeInsert. One row per ValidationFlag emitted at ingest. Errors result in status=quarantine on the linked report; warnings are advisory and the report still inserts with its quality-derived status.';

COMMENT ON COLUMN ingestion_audit.code IS
  'See VALIDATION_CODES in src/lib/ingestion/utils/validate-report.ts for the canonical list. Stable string code so the admin page can group across adapters.';

COMMENT ON COLUMN ingestion_audit.payload IS
  'Optional JSON dump of the offending values for forensics (e.g. {event_date, precision, country}). Schema is per-code, not enforced.';
