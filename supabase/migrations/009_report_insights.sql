-- Migration: Report Insights & Enhanced Analysis
-- Description: AI-generated insights for individual reports, pattern connections, and location intelligence

-- ============================================
-- REPORT INSIGHTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS report_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  insight_type VARCHAR(50) NOT NULL DEFAULT 'analysis',

  -- Content
  title VARCHAR(255),
  summary TEXT,
  content TEXT NOT NULL,

  -- Structured analysis data
  credibility_analysis JSONB,  -- {reasoning: string, factors: [{name, impact, description}], score: number}
  similar_cases JSONB,         -- [{report_id, title, slug, similarity_score, reason}]
  mundane_explanations JSONB,  -- [{explanation, likelihood, reasoning}]

  -- AI metadata
  model_used VARCHAR(100),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Caching
  valid_until TIMESTAMPTZ,
  is_stale BOOLEAN DEFAULT FALSE,
  source_data_hash VARCHAR(64),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(report_id, insight_type)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_report_insights_report ON report_insights(report_id);
CREATE INDEX idx_report_insights_type ON report_insights(insight_type);
CREATE INDEX idx_report_insights_valid ON report_insights(valid_until) WHERE NOT is_stale;
CREATE INDEX idx_report_insights_generated ON report_insights(generated_at DESC);

-- Spatial index for nearby reports queries (if not already exists)
CREATE INDEX IF NOT EXISTS idx_reports_coordinates
ON reports(latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE report_insights ENABLE ROW LEVEL SECURITY;

-- Public read access (insights are public)
CREATE POLICY "Report insights are viewable by everyone"
  ON report_insights FOR SELECT
  USING (true);

-- Only service role can modify (via API)
CREATE POLICY "Only service role can insert report_insights"
  ON report_insights FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service role can update report_insights"
  ON report_insights FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Only service role can delete report_insights"
  ON report_insights FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to find nearby reports using PostGIS
CREATE OR REPLACE FUNCTION find_nearby_reports(
  p_report_id UUID,
  p_radius_km DECIMAL DEFAULT 50,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title VARCHAR,
  slug VARCHAR,
  category VARCHAR,
  event_date DATE,
  latitude DECIMAL,
  longitude DECIMAL,
  distance_km DECIMAL
) AS $$
DECLARE
  v_lat DECIMAL;
  v_lng DECIMAL;
BEGIN
  -- Get coordinates of the source report
  SELECT r.latitude, r.longitude INTO v_lat, v_lng
  FROM reports r
  WHERE r.id = p_report_id;

  -- Return empty if no coordinates
  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN;
  END IF;

  -- Find nearby reports
  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.slug,
    r.category::VARCHAR,
    r.event_date,
    r.latitude,
    r.longitude,
    (ST_Distance(
      ST_MakePoint(r.longitude, r.latitude)::geography,
      ST_MakePoint(v_lng, v_lat)::geography
    ) / 1000)::DECIMAL AS distance_km
  FROM reports r
  WHERE r.id != p_report_id
    AND r.status = 'approved'
    AND r.latitude IS NOT NULL
    AND r.longitude IS NOT NULL
    AND ST_DWithin(
      ST_MakePoint(r.longitude, r.latitude)::geography,
      ST_MakePoint(v_lng, v_lat)::geography,
      p_radius_km * 1000  -- Convert km to meters
    )
  ORDER BY distance_km
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get patterns containing a specific report
CREATE OR REPLACE FUNCTION get_report_patterns(
  p_report_id UUID
)
RETURNS TABLE (
  pattern_id UUID,
  pattern_type VARCHAR,
  status VARCHAR,
  ai_title VARCHAR,
  ai_summary VARCHAR,
  confidence_score DECIMAL,
  significance_score DECIMAL,
  report_count INTEGER,
  relevance_score DECIMAL
) AS $$
SELECT
  dp.id AS pattern_id,
  dp.pattern_type::VARCHAR,
  dp.status::VARCHAR,
  dp.ai_title,
  dp.ai_summary,
  dp.confidence_score,
  dp.significance_score,
  dp.report_count,
  pr.relevance_score
FROM detected_patterns dp
JOIN pattern_reports pr ON dp.id = pr.pattern_id
WHERE pr.report_id = p_report_id
  AND dp.status IN ('active', 'emerging')
ORDER BY pr.relevance_score DESC, dp.significance_score DESC;
$$ LANGUAGE SQL;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE report_insights IS 'Cached AI-generated insights for individual reports';
COMMENT ON FUNCTION find_nearby_reports IS 'Finds approved reports within a given radius of a specific report';
COMMENT ON FUNCTION get_report_patterns IS 'Gets all active/emerging patterns that contain a specific report';
