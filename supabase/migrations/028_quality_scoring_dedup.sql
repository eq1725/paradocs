-- Migration 028: Quality Scoring Pipeline & Deduplication Tracking
-- Adds columns and tables for the 10-dimension quality scoring system
-- and fuzzy deduplication tracking

-- ============================================================================
-- 1. Add quality score columns to reports table
-- ============================================================================

-- Composite quality score (0-100)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS quality_score integer;

-- Quality grade (A/B/C/D/F)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS quality_grade text;

-- Full dimension breakdown stored as JSONB
-- Contains all 10 dimension scores, weights, and details
ALTER TABLE reports ADD COLUMN IF NOT EXISTS quality_dimensions jsonb;

-- When the quality score was last calculated
ALTER TABLE reports ADD COLUMN IF NOT EXISTS quality_scored_at timestamptz;

-- Scorer version (to know which reports need re-scoring when algorithm changes)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS quality_scorer_version text;

-- Content fingerprint for fast dedup pre-filtering
ALTER TABLE reports ADD COLUMN IF NOT EXISTS content_fingerprint text;

-- ============================================================================
-- 2. Create duplicate_matches table for tracking detected duplicates
-- ============================================================================

CREATE TABLE IF NOT EXISTS duplicate_matches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  report_a_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  report_b_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  title_similarity numeric(4,3) NOT NULL DEFAULT 0,
  location_similarity numeric(4,3) NOT NULL DEFAULT 0,
  date_similarity numeric(4,3) NOT NULL DEFAULT 0,
  content_similarity numeric(4,3) NOT NULL DEFAULT 0,
  overall_score numeric(4,3) NOT NULL DEFAULT 0,
  confidence text NOT NULL CHECK (confidence IN ('definite', 'likely', 'possible')),
  details text,
  -- Resolution tracking
  resolution text CHECK (resolution IN ('pending', 'confirmed_duplicate', 'not_duplicate', 'merged')),
  resolved_by uuid REFERENCES profiles(id),
  resolved_at timestamptz,
  resolution_notes text,
  -- Timestamps
  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Prevent duplicate pair entries (A,B should not also exist as B,A)
CREATE UNIQUE INDEX IF NOT EXISTS idx_duplicate_matches_pair
  ON duplicate_matches (LEAST(report_a_id, report_b_id), GREATEST(report_a_id, report_b_id));

-- ============================================================================
-- 3. Indexes for quality score queries
-- ============================================================================

-- Index for filtering by quality score (e.g., "show me all A-grade reports")
CREATE INDEX IF NOT EXISTS idx_reports_quality_score
  ON reports (quality_score DESC)
  WHERE status = 'approved' AND quality_score IS NOT NULL;

-- Index for finding unscored reports
CREATE INDEX IF NOT EXISTS idx_reports_unscored
  ON reports (created_at)
  WHERE quality_score IS NULL AND status IN ('approved', 'pending');

-- Index for finding reports that need re-scoring (version mismatch)
CREATE INDEX IF NOT EXISTS idx_reports_scorer_version
  ON reports (quality_scorer_version)
  WHERE quality_score IS NOT NULL;

-- Index for content fingerprint dedup lookups
CREATE INDEX IF NOT EXISTS idx_reports_fingerprint
  ON reports (content_fingerprint)
  WHERE content_fingerprint IS NOT NULL;

-- Index for duplicate_matches resolution queue
CREATE INDEX IF NOT EXISTS idx_duplicate_matches_pending
  ON duplicate_matches (overall_score DESC)
  WHERE resolution = 'pending' OR resolution IS NULL;

-- ============================================================================
-- 4. RPC function to get quality score distribution
-- ============================================================================

CREATE OR REPLACE FUNCTION get_quality_distribution()
RETURNS TABLE(grade text, count bigint) AS $$
  SELECT
    quality_grade as grade,
    count(*) as count
  FROM reports
  WHERE status = 'approved'
    AND quality_grade IS NOT NULL
  GROUP BY quality_grade
  ORDER BY
    CASE quality_grade
      WHEN 'A' THEN 1
      WHEN 'B' THEN 2
      WHEN 'C' THEN 3
      WHEN 'D' THEN 4
      WHEN 'F' THEN 5
    END;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- 5. RPC function to get unresolved duplicate count
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_duplicates_count()
RETURNS bigint AS $$
  SELECT count(*)
  FROM duplicate_matches
  WHERE resolution IS NULL OR resolution = 'pending';
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- 6. Set default resolution for existing records
-- ============================================================================

-- Any new duplicate_matches default to 'pending'
ALTER TABLE duplicate_matches ALTER COLUMN resolution SET DEFAULT 'pending';

-- ============================================================================
-- 7. Comments for documentation
-- ============================================================================

COMMENT ON COLUMN reports.quality_score IS '0-100 composite quality score from 10-dimension analysis';
COMMENT ON COLUMN reports.quality_grade IS 'Letter grade (A/B/C/D/F) derived from quality_score';
COMMENT ON COLUMN reports.quality_dimensions IS 'JSONB breakdown of all 10 quality dimensions with scores, weights, and details';
COMMENT ON COLUMN reports.content_fingerprint IS 'Normalized fingerprint of title+date+location for fast dedup pre-filtering';
COMMENT ON TABLE duplicate_matches IS 'Tracks detected duplicate report pairs with similarity scores and resolution status';
