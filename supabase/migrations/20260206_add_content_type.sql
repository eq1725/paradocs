-- Migration: Add content_type field to reports table
-- Purpose: Distinguish between actual experiencer reports vs news/discussions/historical cases
-- Date: 2026-02-06

-- Create the content_type enum
CREATE TYPE content_type AS ENUM (
  'experiencer_report',    -- First-hand witness account of a paranormal encounter
  'historical_case',       -- Documented historical case (not first-hand)
  'news_discussion',       -- News, articles, discussions about paranormal topics
  'research_analysis'      -- Academic or research-based analysis
);

-- Add content_type column to reports table with default of 'experiencer_report'
ALTER TABLE reports
ADD COLUMN content_type content_type NOT NULL DEFAULT 'experiencer_report';

-- Create index for filtering by content type
CREATE INDEX idx_reports_content_type ON reports(content_type);

-- Update existing reports: Try to auto-classify based on content
-- Mark as news_discussion if the description contains certain keywords
UPDATE reports
SET content_type = 'news_discussion'
WHERE
  status = 'approved'
  AND (
    description ILIKE '%news article%'
    OR description ILIKE '%according to%sources%'
    OR description ILIKE '%website%seized%'
    OR description ILIKE '%reported by%media%'
    OR description ILIKE '%documentary%'
    OR title ILIKE '%question%'
    OR title ILIKE '%discussion%'
    OR (source_type = 'forum_post' AND NOT submitter_was_witness)
  );

-- Mark as historical_case if it references historical events without being first-hand
UPDATE reports
SET content_type = 'historical_case'
WHERE
  status = 'approved'
  AND content_type = 'experiencer_report'  -- Don't override news_discussion
  AND (
    source_type = 'historical_archive'
    OR source_type = 'book_reference'
    OR (event_date < '1990-01-01' AND NOT submitter_was_witness)
  );

-- Mark as research_analysis if it's academic/research content
UPDATE reports
SET content_type = 'research_analysis'
WHERE
  status = 'approved'
  AND content_type = 'experiencer_report'  -- Don't override others
  AND (
    source_type = 'academic_paper'
    OR source_type = 'investigation_report'
    OR description ILIKE '%study%found%'
    OR description ILIKE '%research%indicates%'
  );

-- Comment: After running this migration, review reports with content_type = 'news_discussion'
-- to ensure they are correctly classified. The AI analysis should also help flag misclassified content.
