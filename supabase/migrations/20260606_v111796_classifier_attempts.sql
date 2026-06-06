-- V11.17.96 — Classifier attempt tracking
--
-- Stops the daily launchd cron (04:00 local, runs
-- scripts/classify-phenomena-batch.ts --all) from re-processing the
-- same un-tag-able reports forever. After V11.17.95, the
-- "already-covered" filter skips any approved report with at least
-- one phen tag. Reports with ZERO tags after a classifier pass still
-- get re-tried every single day — wasting ~$9/day (~$3,300/yr) on
-- reports that legitimately can't be classified (vague accounts,
-- ambiguous events, prose with no canonical phenomenon features).
--
-- Tracking model:
--   classifier_attempts INT — how many times the classifier has
--     processed this report. Bumped after every batch chunk that
--     included it, even if Anthropic returned null.
--   classifier_skip BOOL — permanent skip flag. Set when attempts
--     reaches MAX_CLASSIFIER_ATTEMPTS (currently 3 in the TS) AND
--     the report still has zero junction rows. Cleared explicitly
--     via `--retry-failed` after the founder adds new phens to the
--     taxonomy.
--
-- Reset semantics (no data backfill needed):
--   Existing reports start at attempts=0, skip=FALSE — they get the
--   full 3 tries from V11.17.96 forward. Reports tagged before
--   V11.17.96 are already filtered out by the V11.17.95
--   "any-existing-tag" gate, so the new counter only affects the
--   currently-untagged tail.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS classifier_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS classifier_skip     BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index sized for the classifier's hot path: the daily
-- "load approved reports needing classification" query in
-- classify-phenomena-batch.ts. Restricting WHERE status='approved'
-- AND classifier_skip=FALSE keeps the index small (only candidates
-- the classifier might still touch), and indexing on
-- classifier_attempts lets the script's eventual `<` comparison
-- against MAX_CLASSIFIER_ATTEMPTS use an index scan.
CREATE INDEX IF NOT EXISTS idx_reports_classifier_skip_attempts
  ON reports (classifier_attempts)
  WHERE status = 'approved' AND classifier_skip = FALSE;
