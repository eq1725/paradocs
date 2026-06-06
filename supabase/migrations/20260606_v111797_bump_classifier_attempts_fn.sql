-- V11.17.97 — Bulk classifier_attempts increment function.
--
-- Single round-trip per chunk. Replaces V11.17.96's N parallel UPDATEs
-- which scaled O(N) on network round-trips. At 10k reports/day this
-- saves ~3 minutes of wall-clock per chunk and reduces classifier
-- wall-clock significantly.
--
-- Background: V11.17.96 introduced classifier_attempts tracking, but
-- bumped each report's counter via a separate UPDATE round-trip
-- (Promise.all over the chunk). 4000 reports = 4000 round-trips.
-- At ~5-20ms per UPDATE that's 20-80s of serialized network latency
-- per chunk just for the increment. This migration moves the per-row
-- arithmetic into Postgres so the entire chunk fits in one RPC call.
--
-- Both functions are SECURITY DEFINER so the service-role-keyed client
-- can call them through PostgREST without RLS interference. They
-- accept UUID arrays so the caller can pass the full chunk of report
-- IDs in one shot. Adjust SECURITY DEFINER to INVOKER if your project
-- doesn't use RLS on the reports table.

CREATE OR REPLACE FUNCTION bump_classifier_attempts(report_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE reports
  SET classifier_attempts = classifier_attempts + 1
  WHERE id = ANY(report_ids);
$$;

COMMENT ON FUNCTION bump_classifier_attempts IS
  'V11.17.97 — Bulk increment classifier_attempts for a UUID array. Called by scripts/classify-phenomena-batch.ts after each batch chunk completes.';


-- V11.17.97 — Bulk mark classifier_skip=TRUE for reports that hit the
-- attempt cap AND still have zero phen junction rows.
--
-- Implemented as a single statement so the caller doesn't have to
-- (a) read back classifier_attempts to find capped reports, (b) probe
-- report_phenomena for each capped report, and (c) issue an UPDATE.
-- All three live as CTEs here:
--   targets : reports in the input set whose attempts >= cap with no
--             junction rows
--   updated : the actual UPDATE on those targets, returning their IDs
--   SELECT  : returns the count of newly-skipped rows so the caller
--             can log it
--
-- IMPORTANT: this function must be called AFTER bump_classifier_attempts
-- so the >= cap check sees the freshly-bumped counter, and AFTER the
-- junction upserts for the chunk so the NOT EXISTS check sees them.
CREATE OR REPLACE FUNCTION mark_classifier_skip_for_capped(
  report_ids uuid[],
  cap int
)
RETURNS TABLE(skipped_count int)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH targets AS (
    SELECT r.id
    FROM reports r
    WHERE r.id = ANY(report_ids)
      AND r.classifier_attempts >= cap
      AND NOT EXISTS (
        SELECT 1 FROM report_phenomena rp WHERE rp.report_id = r.id
      )
  ),
  updated AS (
    UPDATE reports
    SET classifier_skip = TRUE
    WHERE id IN (SELECT id FROM targets)
    RETURNING id
  )
  SELECT COUNT(*)::int FROM updated;
$$;

COMMENT ON FUNCTION mark_classifier_skip_for_capped IS
  'V11.17.97 — Bulk-set classifier_skip=TRUE for reports that have hit cap AND have zero junction rows. Returns count of newly-skipped reports.';
