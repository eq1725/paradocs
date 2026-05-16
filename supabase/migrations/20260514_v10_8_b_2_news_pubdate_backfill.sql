-- ============================================================
-- V10.8.B.2 — News pub-date backfill (one-time)
--
-- Before V10.8.B.2, news.ts stored the article's `publishedAt`
-- timestamp into `event_date` with `event_date_precision='exact'`.
-- That was almost always wrong — pub date is not event date. The
-- new news adapter now stores pub date in `source_published_at`
-- and uses extractDate({prose: articleBody}) to populate
-- `event_date`.
--
-- This script fixes the ~15 existing rows shipped under the old
-- contract:
--   1. Copy the current event_date into source_published_at so we
--      don't lose the pub-date data.
--   2. Null event_date / event_date_precision so they get
--      repopulated naturally when the row is re-ingested OR when
--      the V10.8.E Haiku-assisted fallback runs over them.
--
-- Selection criterion: source_type='news' AND
-- source_published_at IS NULL (untouched by the new adapter).
-- ============================================================

UPDATE reports
SET
  source_published_at = (event_date::timestamptz),
  event_date = NULL,
  event_date_precision = 'unknown',
  event_date_extracted_from = 'none'
WHERE source_type = 'news'
  AND source_published_at IS NULL
  AND event_date IS NOT NULL;

-- Forensic check — should match the number of news rows pre-V10.8.B.2.
-- After running, all news rows should have source_published_at populated.
SELECT
  COUNT(*) FILTER (WHERE source_type = 'news') AS news_total,
  COUNT(*) FILTER (WHERE source_type = 'news' AND source_published_at IS NOT NULL) AS news_with_pub_date,
  COUNT(*) FILTER (WHERE source_type = 'news' AND event_date IS NULL) AS news_event_date_nulled,
  COUNT(*) FILTER (WHERE source_type = 'news' AND event_date_extracted_from = 'none') AS news_extract_source_none
FROM reports;
