-- Migration: Pattern Detection System
-- Description: Adds tables and functions for emergent pattern detection

-- ============================================
-- DETECTED PATTERNS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS detected_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type VARCHAR(50) NOT NULL, -- geographic_cluster, temporal_anomaly, flap_wave, characteristic_correlation, seasonal_pattern, time_of_day_pattern, date_correlation, regional_concentration
  status VARCHAR(20) NOT NULL DEFAULT 'emerging', -- active, historical, emerging, declining
  confidence_score DECIMAL(5, 4) NOT NULL DEFAULT 0, -- 0-1 scale
  significance_score DECIMAL(5, 4) NOT NULL DEFAULT 0, -- 0-1 scale
  report_count INTEGER NOT NULL DEFAULT 0,
  center_point GEOGRAPHY(POINT, 4326), -- For geographic patterns (PostGIS)
  bounding_box GEOGRAPHY(POLYGON, 4326), -- Area covered
  radius_km DECIMAL(10, 2), -- For clusters
  pattern_start_date DATE, -- For temporal patterns
  pattern_end_date DATE,
  metadata JSONB DEFAULT '{}', -- Pattern-specific data
  categories TEXT[] DEFAULT '{}', -- Related categories
  ai_title VARCHAR(255), -- LLM-generated title
  ai_summary VARCHAR(500), -- Brief description
  ai_narrative TEXT, -- Full analysis
  ai_narrative_generated_at TIMESTAMPTZ,
  first_detected_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patterns_type ON detected_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_status ON detected_patterns(status);
CREATE INDEX IF NOT EXISTS idx_patterns_significance ON detected_patterns(significance_score DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_updated ON detected_patterns(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_center_point ON detected_patterns USING GIST(center_point);
CREATE INDEX IF NOT EXISTS idx_patterns_categories ON detected_patterns USING GIN(categories);

-- ============================================
-- PATTERN REPORTS JUNCTION TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES detected_patterns(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  relevance_score DECIMAL(5, 4) DEFAULT 1.0, -- How relevant the report is to the pattern
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pattern_id, report_id)
);

CREATE INDEX IF NOT EXISTS idx_pattern_reports_pattern ON pattern_reports(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_reports_report ON pattern_reports(report_id);

-- ============================================
-- PATTERN INSIGHTS (AI-generated)
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID REFERENCES detected_patterns(id) ON DELETE CASCADE,
  insight_type VARCHAR(50) NOT NULL DEFAULT 'pattern_narrative', -- pattern_narrative, weekly_digest, comparison
  title VARCHAR(255),
  content TEXT NOT NULL,
  summary VARCHAR(500),
  source_data_hash VARCHAR(64), -- To detect if source data changed
  model_used VARCHAR(50),
  tokens_used INTEGER,
  is_stale BOOLEAN DEFAULT false,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_pattern ON pattern_insights(pattern_id);
CREATE INDEX IF NOT EXISTS idx_insights_type ON pattern_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_valid ON pattern_insights(valid_until);
CREATE INDEX IF NOT EXISTS idx_insights_stale ON pattern_insights(is_stale) WHERE is_stale = false;

-- ============================================
-- PATTERN ANALYSIS RUNS (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type VARCHAR(20) NOT NULL DEFAULT 'full', -- full, incremental
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  reports_analyzed INTEGER DEFAULT 0,
  patterns_detected INTEGER DEFAULT 0,
  patterns_updated INTEGER DEFAULT 0,
  patterns_archived INTEGER DEFAULT 0,
  error_message TEXT,
  error_stack TEXT,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_status ON pattern_analysis_runs(status);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_created ON pattern_analysis_runs(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE detected_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_analysis_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Detected patterns (public read)
DROP POLICY IF EXISTS "Anyone can view detected patterns" ON detected_patterns;
CREATE POLICY "Anyone can view detected patterns" ON detected_patterns FOR SELECT USING (true);

-- Pattern reports (public read)
DROP POLICY IF EXISTS "Anyone can view pattern reports" ON pattern_reports;
CREATE POLICY "Anyone can view pattern reports" ON pattern_reports FOR SELECT USING (true);

-- Pattern insights (public read)
DROP POLICY IF EXISTS "Anyone can view pattern insights" ON pattern_insights;
CREATE POLICY "Anyone can view pattern insights" ON pattern_insights FOR SELECT USING (true);

-- Analysis runs (public read for transparency)
DROP POLICY IF EXISTS "Anyone can view analysis runs" ON pattern_analysis_runs;
CREATE POLICY "Anyone can view analysis runs" ON pattern_analysis_runs FOR SELECT USING (true);

-- ============================================
-- GEOGRAPHIC CLUSTERING FUNCTION (PostGIS DBSCAN)
-- ============================================
CREATE OR REPLACE FUNCTION detect_geographic_clusters(
  p_eps_km DECIMAL DEFAULT 50,
  p_min_points INTEGER DEFAULT 5,
  p_days_back INTEGER DEFAULT 365
)
RETURNS TABLE (
  cluster_id INTEGER,
  report_ids TEXT[],
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  report_count BIGINT,
  density DOUBLE PRECISION,
  categories TEXT[],
  phenomenon_types TEXT[],
  first_date DATE,
  last_date DATE
) AS $$
BEGIN
  RETURN QUERY
  WITH clustered AS (
    SELECT
      r.id,
      r.latitude,
      r.longitude,
      r.category,
      r.date_of_encounter,
      ST_ClusterDBSCAN(
        ST_MakePoint(r.longitude, r.latitude)::geography,
        eps := p_eps_km * 1000, -- Convert km to meters
        minpoints := p_min_points
      ) OVER () as cluster_num
    FROM reports r
    WHERE r.status = 'approved'
      AND r.latitude IS NOT NULL
      AND r.longitude IS NOT NULL
      AND r.date_of_encounter >= CURRENT_DATE - p_days_back
  )
  SELECT
    c.cluster_num as cluster_id,
    ARRAY_AGG(c.id::TEXT) as report_ids,
    AVG(c.latitude) as center_lat,
    AVG(c.longitude) as center_lng,
    COUNT(*) as report_count,
    COUNT(*) / NULLIF(
      ST_Area(ST_MinimumBoundingCircle(ST_Collect(ST_MakePoint(c.longitude, c.latitude)))),
      0
    ) * 1000000 as density,
    ARRAY_AGG(DISTINCT c.category) as categories,
    ARRAY_AGG(DISTINCT c.category) as phenomenon_types,
    MIN(c.date_of_encounter) as first_date,
    MAX(c.date_of_encounter) as last_date
  FROM clustered c
  WHERE c.cluster_num IS NOT NULL
  GROUP BY c.cluster_num
  HAVING COUNT(*) >= p_min_points
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- WEEKLY REPORT COUNTS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_weekly_report_counts(
  p_weeks_back INTEGER DEFAULT 52
)
RETURNS TABLE (
  week_start DATE,
  report_count BIGINT,
  categories JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH weekly AS (
    SELECT
      DATE_TRUNC('week', r.date_of_encounter)::DATE as week,
      COUNT(*) as cnt,
      JSONB_OBJECT_AGG(
        COALESCE(r.category, 'unknown'),
        1
      ) as cats
    FROM reports r
    WHERE r.status = 'approved'
      AND r.date_of_encounter >= CURRENT_DATE - (p_weeks_back * 7)
      AND r.date_of_encounter <= CURRENT_DATE
    GROUP BY DATE_TRUNC('week', r.date_of_encounter)
  )
  SELECT
    w.week as week_start,
    w.cnt as report_count,
    w.cats as categories
  FROM weekly w
  ORDER BY w.week ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEASONAL PATTERNS ANALYSIS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION analyze_seasonal_patterns()
RETURNS TABLE (
  month INTEGER,
  report_count BIGINT,
  seasonal_index DOUBLE PRECISION,
  top_phenomenon_type TEXT
) AS $$
DECLARE
  avg_monthly DOUBLE PRECISION;
BEGIN
  -- Calculate average monthly count
  SELECT AVG(cnt) INTO avg_monthly
  FROM (
    SELECT COUNT(*) as cnt
    FROM reports
    WHERE status = 'approved'
      AND date_of_encounter >= CURRENT_DATE - INTERVAL '3 years'
    GROUP BY EXTRACT(MONTH FROM date_of_encounter)
  ) sub;

  RETURN QUERY
  WITH monthly_data AS (
    SELECT
      EXTRACT(MONTH FROM r.date_of_encounter)::INTEGER as m,
      COUNT(*) as cnt,
      MODE() WITHIN GROUP (ORDER BY r.category) as top_cat
    FROM reports r
    WHERE r.status = 'approved'
      AND r.date_of_encounter >= CURRENT_DATE - INTERVAL '3 years'
    GROUP BY EXTRACT(MONTH FROM r.date_of_encounter)
  )
  SELECT
    md.m as month,
    md.cnt as report_count,
    CASE WHEN avg_monthly > 0 THEN md.cnt / avg_monthly ELSE 1.0 END as seasonal_index,
    md.top_cat as top_phenomenon_type
  FROM monthly_data md
  ORDER BY md.m;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FIND NEARBY PATTERNS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION find_nearby_patterns(
  p_point TEXT, -- 'POINT(lng lat)'
  p_radius_km DECIMAL DEFAULT 100,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  pattern_id UUID,
  pattern_type VARCHAR,
  distance_km DOUBLE PRECISION,
  report_count INTEGER,
  significance_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dp.id as pattern_id,
    dp.pattern_type,
    ST_Distance(
      dp.center_point,
      ST_GeographyFromText(p_point)
    ) / 1000 as distance_km,
    dp.report_count,
    dp.significance_score
  FROM detected_patterns dp
  WHERE dp.center_point IS NOT NULL
    AND dp.status IN ('active', 'emerging')
    AND ST_DWithin(
      dp.center_point,
      ST_GeographyFromText(p_point),
      p_radius_km * 1000 -- Convert to meters
    )
  ORDER BY ST_Distance(dp.center_point, ST_GeographyFromText(p_point))
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- INCREMENT VERIFICATION COUNT FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION increment_verification_count(expert_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE verification_experts
  SET verification_count = verification_count + 1,
      updated_at = NOW()
  WHERE id = expert_id;
END;
$$ LANGUAGE plpgsql;
