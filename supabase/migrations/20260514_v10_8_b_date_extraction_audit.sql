-- ============================================================
-- V10.8.B — Date-extraction audit + News pub-date separation
--
-- Two new columns on reports:
--
-- 1. event_date_extracted_from TEXT NULLABLE
--    Audit field. Stores the `source` enum from extractDate's
--    ExtractedDate type — 'structured' | 'prose-monthname' |
--    'prose-numeric' | 'prose-year' | 'haiku' | 'none'. Lets
--    /admin/ingest-audit filter by extraction confidence so a
--    regressed adapter regex shows up immediately.
--
-- 2. source_published_at TIMESTAMPTZ NULLABLE
--    For sources that have a publication date distinct from the
--    event date (news articles, blog posts, podcast episodes). The
--    news adapter previously stored pub_date in event_date with
--    precision='exact' — almost always wrong (pub date != event
--    date). After V10.8.B, news adapter stores pub date here and
--    leaves event_date for extractDate's prose result.
--
-- Both columns are nullable and unindexed at first — they don't
-- gate any user-facing query path. Add indexes only if a future
-- filter need them.
-- ============================================================

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS event_date_extracted_from TEXT,
  ADD COLUMN IF NOT EXISTS source_published_at TIMESTAMPTZ;

COMMENT ON COLUMN reports.event_date_extracted_from IS
  'V10.8.B — extractDate audit trail. Values: structured | prose-monthname | prose-numeric | prose-year | haiku | none. Null on pre-V10.8 rows.';

COMMENT ON COLUMN reports.source_published_at IS
  'V10.8.B — publication date of the source (news, blog, podcast). Distinct from event_date. Used to surface "x days ago" without conflating pub date with event date.';
