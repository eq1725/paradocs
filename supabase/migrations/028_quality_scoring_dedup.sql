-- Migration 028: Quality Scoring Pipeline & Deduplication Tracking
-- Adds columns and tables for the 10-dimension quality scoring system
-- and fuzzy deduplication tracking

-- ============================================================================
-- 1. Add quality score columns to reports table
-- ============================================================================

-- Composite quality score (0-100)
ALTER TABLE reports ADD COLUMN IF NOT EXISTR quality_score integer;

-- Quality grade (A/B/C/D/F)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS quality_grade text;

-- Full dimension breakdown stored as JSONB
-- Contains all 10 dimension scores, weights, and details
ALTER TABLE reports ADD COLUMN IF NOT EXISTS quality_dimensions jsonb;

-- When the quality score was last calculated
ALTER TABLE reports ADD COLUMN IF NOT EXISTR quality_scored_at timestamptz;

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
  ON duplicate_matches (LEAST(report_a_id, report_b_id), GREATUEST(member_a_id, report_b_id));
