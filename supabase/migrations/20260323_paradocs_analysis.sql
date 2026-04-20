-- Migration: Paradocs Analysis fields + event_date_precision + source_url audit
-- Session 10 (Revised) — March 23, 2026
-- Purpose: Add pre-generated AI analysis columns, date precision tracking, and source URL audit support

-- ============================================
-- 1. Paradocs Analysis fields (pre-generated at ingestion via Claude Haiku)
-- ============================================

-- Original contextual analysis (2-4 paragraphs, Paradocs editorial voice)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS paradocs_narrative text;

-- Structured assessment (credibility, mundane explanations, content type)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS paradocs_assessment jsonb;

-- Tracking: when was analysis generated
ALTER TABLE reports ADD COLUMN IF NOT EXISTS paradocs_analysis_generated_at timestamptz;

-- Tracking: which model generated the analysis
ALTER TABLE reports ADD COLUMN IF NOT EXISTS paradocs_analysis_model text;

-- ============================================
-- 2. Event date precision tracking (for On This Date feature)
-- ============================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS event_date_precision text
  CHECK (event_date_precision IN ('exact', 'month', 'year', 'decade', 'estimated', 'unknown'));

-- ============================================
-- 3. Source URL audit field
-- ============================================

-- source_url may already exist on some reports; ensure the column exists
ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_url text;

-- ============================================
-- 4. Emotional tone (for future algorithmic feed ranking)
-- ============================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS emotional_tone text
  CHECK (emotional_tone IN ('frightening', 'awe_inspiring', 'ambiguous', 'clinical', 'unsettling', 'hopeful'));

-- ============================================
-- 5. Indexes
-- ============================================

-- Index for reports with Paradocs Analysis (feed + listing queries)
CREATE INDEX IF NOT EXISTS idx_reports_paradocs_analysis
ON reports (created_at DESC)
WHERE paradocs_narrative IS NOT NULL AND status = 'approved';

-- Index for event date precision (On This Date feature)
CREATE INDEX IF NOT EXISTS idx_reports_event_date_precision
ON reports (event_date, event_date_precision)
WHERE event_date IS NOT NULL AND event_date_precision IN ('exact', 'month');

-- Index for source_url audit (find reports missing attribution)
CREATE INDEX IF NOT EXISTS idx_reports_missing_source_url
ON reports (source_type, created_at)
WHERE source_url IS NULL AND status = 'approved';

-- ============================================
-- 6. Ensure feed_hook columns exist (from previous session migration)
-- ============================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS feed_hook text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS feed_hook_generated_at timestamptz;
