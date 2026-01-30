-- Migration: User Personalization
-- Adds location and interest preferences to profiles for personalized AI Insights

-- =============================================
-- PROFILE PERSONALIZATION COLUMNS
-- =============================================

-- Location preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_city TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_state TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_country TEXT DEFAULT 'United States';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_latitude DECIMAL(10, 8);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_longitude DECIMAL(11, 8);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS watch_radius_miles INTEGER DEFAULT 50;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS share_location BOOLEAN DEFAULT FALSE;

-- Interest preferences (stored as arrays)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interested_categories TEXT[] DEFAULT '{}';

-- Personalization metadata
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS personalization_updated_at TIMESTAMPTZ;

-- =============================================
-- GEOGRAPHY COLUMN FOR SPATIAL QUERIES
-- =============================================

-- Add PostGIS geography column for efficient distance queries
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_coordinates GEOGRAPHY(POINT, 4326);

-- Create spatial index for location queries
CREATE INDEX IF NOT EXISTS idx_profiles_location_coordinates
ON profiles USING GIST (location_coordinates);

-- =============================================
-- TRIGGER: Auto-update coordinates from lat/lng
-- =============================================

CREATE OR REPLACE FUNCTION update_profile_coordinates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location_latitude IS NOT NULL AND NEW.location_longitude IS NOT NULL THEN
    NEW.location_coordinates := ST_SetSRID(
      ST_MakePoint(NEW.location_longitude, NEW.location_latitude),
      4326
    )::geography;
  ELSE
    NEW.location_coordinates := NULL;
  END IF;

  -- Update timestamp when personalization changes
  IF (OLD.location_city IS DISTINCT FROM NEW.location_city OR
      OLD.location_state IS DISTINCT FROM NEW.location_state OR
      OLD.location_latitude IS DISTINCT FROM NEW.location_latitude OR
      OLD.share_location IS DISTINCT FROM NEW.share_location OR
      OLD.watch_radius_miles IS DISTINCT FROM NEW.watch_radius_miles OR
      OLD.interested_categories IS DISTINCT FROM NEW.interested_categories) THEN
    NEW.personalization_updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_profile_coordinates ON profiles;
CREATE TRIGGER trigger_update_profile_coordinates
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_coordinates();

-- =============================================
-- RPC: Get Activity in User's Watch Radius
-- =============================================

CREATE OR REPLACE FUNCTION get_activity_in_radius(
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_radius_km INTEGER DEFAULT 80,  -- ~50 miles
  p_current_days INTEGER DEFAULT 30,
  p_previous_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  current_count BIGINT,
  previous_count BIGINT,
  percent_change NUMERIC,
  trending_direction TEXT
) AS $$
DECLARE
  v_user_point GEOGRAPHY;
  v_current_start DATE;
  v_previous_start DATE;
  v_previous_end DATE;
BEGIN
  -- Create user's location point
  v_user_point := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography;

  -- Calculate date ranges
  v_current_start := CURRENT_DATE - p_current_days;
  v_previous_end := v_current_start;
  v_previous_start := v_previous_end - p_previous_days;

  RETURN QUERY
  WITH current_period AS (
    SELECT COUNT(*) as cnt
    FROM reports r
    WHERE r.status = 'approved'
      AND r.latitude IS NOT NULL
      AND r.longitude IS NOT NULL
      AND r.created_at >= v_current_start
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(r.longitude, r.latitude), 4326)::geography,
        v_user_point,
        p_radius_km * 1000  -- Convert km to meters
      )
  ),
  previous_period AS (
    SELECT COUNT(*) as cnt
    FROM reports r
    WHERE r.status = 'approved'
      AND r.latitude IS NOT NULL
      AND r.longitude IS NOT NULL
      AND r.created_at >= v_previous_start
      AND r.created_at < v_previous_end
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(r.longitude, r.latitude), 4326)::geography,
        v_user_point,
        p_radius_km * 1000
      )
  )
  SELECT
    cp.cnt as current_count,
    pp.cnt as previous_count,
    CASE
      WHEN pp.cnt = 0 THEN
        CASE WHEN cp.cnt > 0 THEN 100.0 ELSE 0.0 END
      ELSE
        ROUND(((cp.cnt::NUMERIC - pp.cnt::NUMERIC) / pp.cnt::NUMERIC) * 100, 1)
    END as percent_change,
    CASE
      WHEN cp.cnt > pp.cnt THEN 'increasing'
      WHEN cp.cnt < pp.cnt THEN 'decreasing'
      ELSE 'stable'
    END as trending_direction
  FROM current_period cp, previous_period pp;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- RPC: Get Patterns Matching User Interests
-- =============================================

CREATE OR REPLACE FUNCTION get_patterns_by_interests(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  pattern_id UUID,
  pattern_type TEXT,
  title TEXT,
  summary TEXT,
  report_count INTEGER,
  significance_score NUMERIC,
  center_lat NUMERIC,
  center_lng NUMERIC
) AS $$
DECLARE
  v_interested_categories TEXT[];
BEGIN
  -- Get user's interested categories
  SELECT COALESCE(interested_categories, '{}')
  INTO v_interested_categories
  FROM profiles
  WHERE id = p_user_id;

  -- If no interests set, return top patterns by significance
  IF array_length(v_interested_categories, 1) IS NULL OR array_length(v_interested_categories, 1) = 0 THEN
    RETURN QUERY
    SELECT
      dp.id as pattern_id,
      dp.pattern_type::TEXT,
      COALESCE(pi.title, dp.pattern_type || ' Pattern') as title,
      pi.summary,
      dp.report_count,
      dp.significance_score,
      ST_Y(dp.center_point::geometry) as center_lat,
      ST_X(dp.center_point::geometry) as center_lng
    FROM detected_patterns dp
    LEFT JOIN pattern_insights pi ON pi.pattern_id = dp.id
    WHERE dp.status IN ('active', 'emerging')
    ORDER BY dp.significance_score DESC, dp.report_count DESC
    LIMIT p_limit;
  ELSE
    -- Return patterns that have reports matching user's interests
    RETURN QUERY
    SELECT DISTINCT
      dp.id as pattern_id,
      dp.pattern_type::TEXT,
      COALESCE(pi.title, dp.pattern_type || ' Pattern') as title,
      pi.summary,
      dp.report_count,
      dp.significance_score,
      ST_Y(dp.center_point::geometry) as center_lat,
      ST_X(dp.center_point::geometry) as center_lng
    FROM detected_patterns dp
    LEFT JOIN pattern_insights pi ON pi.pattern_id = dp.id
    JOIN pattern_reports pr ON pr.pattern_id = dp.id
    JOIN reports r ON r.id = pr.report_id
    WHERE dp.status IN ('active', 'emerging')
      AND r.category = ANY(v_interested_categories)
    ORDER BY dp.significance_score DESC, dp.report_count DESC
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON COLUMN profiles.location_city IS 'User''s city for personalized insights';
COMMENT ON COLUMN profiles.location_state IS 'User''s state/province for personalized insights';
COMMENT ON COLUMN profiles.share_location IS 'Whether user consents to location-based personalization';
COMMENT ON COLUMN profiles.watch_radius_miles IS 'Radius in miles for nearby activity alerts';
COMMENT ON COLUMN profiles.interested_categories IS 'Array of phenomenon categories user is interested in';
COMMENT ON FUNCTION get_activity_in_radius IS 'Returns report activity metrics within a geographic radius';
COMMENT ON FUNCTION get_patterns_by_interests IS 'Returns patterns matching user''s interested categories';
