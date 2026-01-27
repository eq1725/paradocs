-- Migration: Pattern Detection System
-- Description: Tables and functions for emergent pattern detection

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE pattern_type AS ENUM (
  'geographic_cluster',
  'temporal_anomaly',
  'flap_wave',
  'characteristic_correlation',
  'regional_concentration',
  'seasonal_pattern',
  'time_of_day_pattern',
  'date_correlation'
);

CREATE TYPE pattern_status AS ENUM (
  'active',
  'historical',
  'emerging',
  'declining'
);

-- ============================================
-- TABLES
-- ============================================

-- Main patterns table
CREATE TABLE detected_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type pattern_type NOT NULL,
  status pattern_status DEFAULT 'active',

  -- Scoring & confidence
  confidence_score DECIMAL(5,4) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  significance_score DECIMAL(5,4) NOT NULL CHECK (significance_score BETWEEN 0 AND 1),
  report_count INTEGER NOT NULL DEFAULT 0,

  -- Temporal bounds
  first_detected_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  pattern_start_date DATE,
  pattern_end_date DATE,

  -- Geographic bounds (for spatial patterns)
  center_point GEOGRAPHY(POINT, 4326),
  bounding_box GEOGRAPHY(POLYGON, 4326),
  radius_km DECIMAL(10,2),

  -- Pattern-specific metadata (JSONB for flexibility)
  metadata JSONB NOT NULL DEFAULT '{}',

  -- AI-generated content
  ai_narrative TEXT,
  ai_narrative_generated_at TIMESTAMPTZ,
  ai_title VARCHAR(200),
  ai_summary VARCHAR(500),

  -- Categorization
  categories TEXT[] DEFAULT '{}',
  phenomenon_types UUID[] DEFAULT '{}',

  -- Engagement tracking
  view_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table linking patterns to reports
CREATE TABLE pattern_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES detected_patterns(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  relevance_score DECIMAL(5,4) DEFAULT 1.0,
  added_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(pattern_id, report_id)
);

-- Analysis run tracking
CREATE TABLE pattern_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'geographic', 'temporal'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'running', -- 'running', 'completed', 'failed'

  -- Statistics
  reports_analyzed INTEGER DEFAULT 0,
  patterns_detected INTEGER DEFAULT 0,
  patterns_updated INTEGER DEFAULT 0,
  patterns_archived INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,
  error_stack TEXT,

  metadata JSONB DEFAULT '{}'
);

-- AI-generated insights cache
CREATE TABLE pattern_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID REFERENCES detected_patterns(id) ON DELETE CASCADE,

  -- Can also be aggregate insights (no specific pattern)
  insight_type VARCHAR(50) NOT NULL, -- 'pattern_narrative', 'trend_analysis', 'correlation_insight', 'weekly_digest'

  -- Content
  title VARCHAR(200),
  content TEXT NOT NULL,
  summary VARCHAR(500),

  -- AI metadata
  model_used VARCHAR(100),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validity
  valid_until TIMESTAMPTZ,
  is_stale BOOLEAN DEFAULT FALSE,

  -- Source data snapshot (for regeneration)
  source_data_hash VARCHAR(64),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Spatial indexes for geographic queries
CREATE INDEX idx_patterns_center_point ON detected_patterns USING GIST (center_point);
CREATE INDEX idx_patterns_bounding_box ON detected_patterns USING GIST (bounding_box);

-- Standard indexes
CREATE INDEX idx_patterns_type ON detected_patterns (pattern_type);
CREATE INDEX idx_patterns_status ON detected_patterns (status);
CREATE INDEX idx_patterns_confidence ON detected_patterns (confidence_score DESC);
CREATE INDEX idx_patterns_significance ON detected_patterns (significance_score DESC);
CREATE INDEX idx_patterns_updated ON detected_patterns (last_updated_at DESC);
CREATE INDEX idx_patterns_metadata ON detected_patterns USING GIN (metadata);
CREATE INDEX idx_patterns_categories ON detected_patterns USING GIN (categories);

-- Pattern reports indexes
CREATE INDEX idx_pattern_reports_pattern ON pattern_reports (pattern_id);
CREATE INDEX idx_pattern_reports_report ON pattern_reports (report_id);

-- Insights indexes
CREATE INDEX idx_insights_pattern ON pattern_insights (pattern_id);
CREATE INDEX idx_insights_type ON pattern_insights (insight_type);
CREATE INDEX idx_insights_valid ON pattern_insights (valid_until) WHERE NOT is_stale;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Geographic clustering function using PostGIS DBSCAN
CREATE OR REPLACE FUNCTION detect_geographic_clusters(
  p_eps_km DECIMAL DEFAULT 50,
  p_min_points INTEGER DEFAULT 5,
  p_category TEXT DEFAULT NULL,
  p_days_back INTEGER DEFAULT 365
)
RETURNS TABLE (
  cluster_id INTEGER,
  report_ids UUID[],
  center_lat DECIMAL,
  center_lng DECIMAL,
  report_count INTEGER,
  density DECIMAL,
  categories TEXT[],
  phenomenon_types UUID[],
  first_date DATE,
  last_date DATE
) AS $$
WITH clustered AS (
  SELECT
    r.id,
    r.coordinates,
    r.category::TEXT,
    r.phenomenon_type_id,
    r.event_date,
    ST_ClusterDBSCAN(
      r.coordinates::geometry,
      eps := p_eps_km * 1000, -- convert km to meters
      minpoints := p_min_points
    ) OVER () AS cluster_id
  FROM reports r
  WHERE r.status = 'approved'
    AND r.event_date >= CURRENT_DATE - (p_days_back || ' days')::INTERVAL
    AND (p_category IS NULL OR r.category::TEXT = p_category)
    AND r.coordinates IS NOT NULL
),
cluster_stats AS (
  SELECT
    c.cluster_id,
    ARRAY_AGG(DISTINCT c.id) AS report_ids,
    ST_Y(ST_Centroid(ST_Collect(c.coordinates::geometry))) AS center_lat,
    ST_X(ST_Centroid(ST_Collect(c.coordinates::geometry))) AS center_lng,
    COUNT(*)::INTEGER AS report_count,
    ARRAY_AGG(DISTINCT c.category) AS categories,
    ARRAY_AGG(DISTINCT c.phenomenon_type_id) FILTER (WHERE c.phenomenon_type_id IS NOT NULL) AS phenomenon_types,
    MIN(c.event_date) AS first_date,
    MAX(c.event_date) AS last_date,
    ST_Area(ST_MinimumBoundingCircle(ST_Collect(c.coordinates::geometry))::geography) AS area_sq_m
  FROM clustered c
  WHERE c.cluster_id IS NOT NULL
  GROUP BY c.cluster_id
  HAVING COUNT(*) >= p_min_points
)
SELECT
  cs.cluster_id,
  cs.report_ids,
  cs.center_lat,
  cs.center_lng,
  cs.report_count,
  CASE
    WHEN cs.area_sq_m > 0 THEN (cs.report_count / (cs.area_sq_m / 1000000))::DECIMAL
    ELSE 0
  END AS density, -- reports per sq km
  cs.categories,
  cs.phenomenon_types,
  cs.first_date,
  cs.last_date
FROM cluster_stats cs
ORDER BY cs.report_count DESC;
$$ LANGUAGE SQL;

-- Find nearby patterns for a given point
CREATE OR REPLACE FUNCTION find_nearby_patterns(
  p_point GEOGRAPHY,
  p_radius_km DECIMAL DEFAULT 100,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  pattern_id UUID,
  distance_km DECIMAL,
  pattern_type pattern_type,
  ai_title VARCHAR,
  report_count INTEGER,
  confidence_score DECIMAL
) AS $$
SELECT
  dp.id AS pattern_id,
  (ST_Distance(dp.center_point, p_point) / 1000)::DECIMAL AS distance_km,
  dp.pattern_type,
  dp.ai_title,
  dp.report_count,
  dp.confidence_score
FROM detected_patterns dp
WHERE dp.center_point IS NOT NULL
  AND dp.status IN ('active', 'emerging')
  AND ST_DWithin(dp.center_point, p_point, p_radius_km * 1000)
ORDER BY ST_Distance(dp.center_point, p_point)
LIMIT p_limit;
$$ LANGUAGE SQL;

-- Get temporal report distribution by week
CREATE OR REPLACE FUNCTION get_weekly_report_counts(
  p_weeks_back INTEGER DEFAULT 52,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  week_start DATE,
  report_count BIGINT,
  categories JSONB
) AS $$
SELECT
  DATE_TRUNC('week', r.event_date)::DATE AS week_start,
  COUNT(*) AS report_count,
  JSONB_OBJECT_AGG(r.category::TEXT, cnt) AS categories
FROM (
  SELECT
    r.event_date,
    r.category,
    COUNT(*) OVER (PARTITION BY DATE_TRUNC('week', r.event_date), r.category) AS cnt
  FROM reports r
  WHERE r.status = 'approved'
    AND r.event_date >= CURRENT_DATE - (p_weeks_back * 7 || ' days')::INTERVAL
    AND (p_category IS NULL OR r.category::TEXT = p_category)
) r
GROUP BY DATE_TRUNC('week', r.event_date)
ORDER BY week_start;
$$ LANGUAGE SQL;

-- Analyze seasonal patterns
CREATE OR REPLACE FUNCTION analyze_seasonal_patterns(
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  month INTEGER,
  report_count BIGINT,
  seasonal_index DECIMAL,
  top_phenomenon_type UUID
) AS $$
WITH monthly_counts AS (
  SELECT
    EXTRACT(MONTH FROM event_date)::INTEGER AS month,
    COUNT(*) AS count,
    MODE() WITHIN GROUP (ORDER BY phenomenon_type_id) AS top_type
  FROM reports
  WHERE event_date IS NOT NULL
    AND status = 'approved'
    AND (p_category IS NULL OR category::TEXT = p_category)
  GROUP BY EXTRACT(MONTH FROM event_date)
),
total AS (
  SELECT AVG(count) AS avg_count FROM monthly_counts
)
SELECT
  mc.month,
  mc.count AS report_count,
  CASE WHEN t.avg_count > 0 THEN (mc.count::DECIMAL / t.avg_count) ELSE 1 END AS seasonal_index,
  mc.top_type AS top_phenomenon_type
FROM monthly_counts mc, total t
ORDER BY mc.month;
$$ LANGUAGE SQL;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_pattern_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_detected_patterns_timestamp
  BEFORE UPDATE ON detected_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_timestamp();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE detected_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_insights ENABLE ROW LEVEL SECURITY;

-- Public read access for patterns (they're public data)
CREATE POLICY "Patterns are viewable by everyone"
  ON detected_patterns FOR SELECT
  USING (true);

CREATE POLICY "Pattern reports are viewable by everyone"
  ON pattern_reports FOR SELECT
  USING (true);

CREATE POLICY "Pattern insights are viewable by everyone"
  ON pattern_insights FOR SELECT
  USING (true);

-- Only service role can modify patterns (via cron jobs)
CREATE POLICY "Only service role can insert patterns"
  ON detected_patterns FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service role can update patterns"
  ON detected_patterns FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Only service role can delete patterns"
  ON detected_patterns FOR DELETE
  USING (auth.role() = 'service_role');

-- Same for other tables
CREATE POLICY "Only service role can modify pattern_reports"
  ON pattern_reports FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Only service role can modify analysis_runs"
  ON pattern_analysis_runs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Only service role can modify insights"
  ON pattern_insights FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE detected_patterns IS 'Stores detected patterns from automated analysis including geographic clusters, temporal anomalies, and correlations';
COMMENT ON TABLE pattern_reports IS 'Junction table linking patterns to their constituent reports';
COMMENT ON TABLE pattern_analysis_runs IS 'Audit trail for pattern analysis job runs';
COMMENT ON TABLE pattern_insights IS 'Cached AI-generated narrative insights for patterns';
COMMENT ON FUNCTION detect_geographic_clusters IS 'Detects geographic clusters of reports using DBSCAN algorithm';
COMMENT ON FUNCTION find_nearby_patterns IS 'Finds patterns within a given radius of a point';
COMMENT ON FUNCTION get_weekly_report_counts IS 'Returns weekly report counts for temporal analysis';
COMMENT ON FUNCTION analyze_seasonal_patterns IS 'Analyzes monthly seasonal patterns in report data';
