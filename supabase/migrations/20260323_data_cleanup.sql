-- DATA CLEANUP — Run BEFORE mass ingestion
-- Session 10 (Revised) — March 23, 2026
--
-- IMPORTANT: Run these in order. Verify counts before each DELETE.
-- This script deletes ALL test data except the 20 curated reports (Roswell 14 + Rendlesham 6).

-- ============================================
-- STEP 0: Pre-cleanup verification
-- ============================================

-- Count curated reports that MUST be preserved
SELECT id, title, source_type, status FROM reports
WHERE status = 'approved'
AND (source_type = 'curated' OR source_type = 'editorial')
ORDER BY title;
-- Expected: 20 rows (14 Roswell + 6 Rendlesham)

-- Count hidden Reddit dev data
SELECT status, count(*) FROM reports WHERE source_type = 'reddit' GROUP BY status;

-- Count all approved test reports by source
SELECT source_type, count(*) FROM reports
WHERE status = 'approved'
AND source_type NOT IN ('curated', 'editorial')
GROUP BY source_type
ORDER BY count(*) DESC;

-- ============================================
-- STEP 1a: Delete ~2M hidden Reddit dev data
-- ============================================

-- Delete associated data first (foreign keys)
DELETE FROM report_phenomena WHERE report_id IN (
  SELECT id FROM reports WHERE source_type = 'reddit' AND status != 'approved'
);

DELETE FROM report_media WHERE report_id IN (
  SELECT id FROM reports WHERE source_type = 'reddit' AND status != 'approved'
);

DELETE FROM vector_chunks WHERE source_id IN (
  SELECT id FROM reports WHERE source_type = 'reddit' AND status != 'approved'
) AND source_table = 'report';

-- Delete the reports themselves
DELETE FROM reports WHERE source_type = 'reddit' AND status != 'approved';

-- ============================================
-- STEP 1b: Delete ~900 test reports (EXCEPT 20 curated)
-- ============================================

-- Delete associated data for test reports
DELETE FROM report_phenomena WHERE report_id IN (
  SELECT id FROM reports WHERE status = 'approved'
  AND source_type NOT IN ('curated', 'editorial')
);

DELETE FROM report_media WHERE report_id IN (
  SELECT id FROM reports WHERE status = 'approved'
  AND source_type NOT IN ('curated', 'editorial')
);

DELETE FROM vector_chunks WHERE source_id IN (
  SELECT id FROM reports WHERE status = 'approved'
  AND source_type NOT IN ('curated', 'editorial')
) AND source_table = 'report';

DELETE FROM report_insights WHERE report_id IN (
  SELECT id FROM reports WHERE status = 'approved'
  AND source_type NOT IN ('curated', 'editorial')
);

-- Delete the test reports
DELETE FROM reports
WHERE status = 'approved'
AND source_type NOT IN ('curated', 'editorial');

-- ============================================
-- STEP 1c: Clean up stale ingestion state
-- ============================================

-- Reset data_sources metrics for fresh mass ingestion
UPDATE data_sources SET
  error_count = 0,
  last_error = NULL,
  last_synced_at = NULL
WHERE is_active = true;

-- Clean up old ingestion logs (optional — keeps audit trail)
-- DELETE FROM ingestion_logs WHERE created_at < NOW() - INTERVAL '30 days';

-- ============================================
-- STEP 2: Post-cleanup verification
-- ============================================

-- Should show ONLY curated/editorial reports
SELECT source_type, status, count(*) FROM reports GROUP BY source_type, status ORDER BY source_type;

-- Verify exactly 20 curated reports remain
SELECT count(*) as curated_count FROM reports WHERE status = 'approved';
-- Expected: 20

-- Verify all curated reports have their data intact
SELECT id, title, source_type,
  (SELECT count(*) FROM report_phenomena WHERE report_id = r.id) as phenomena_links,
  (SELECT count(*) FROM report_media WHERE report_id = r.id) as media_items
FROM reports r
WHERE status = 'approved'
ORDER BY title;
