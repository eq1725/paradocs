-- Migration: Additional Personalization RPC Functions
-- Adds category trends and similar experiencers functions for personalized insights

-- =============================================
-- RPC: Get Category Trends
-- Returns trending stats for specific categories
-- =============================================

CREATE OR REPLACE FUNCTION get_category_trends(
  p_categories TEXT[],
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  category TEXT,
  current_count BIGINT,
  previous_count BIGINT,
  percent_change NUMERIC,
  trending_direction TEXT
) AS $$
DECLARE
  v_current_start DATE;
  v_previous_start DATE;
  v_previous_end DATE;
BEGIN
  -- Calculate date ranges
  v_current_start := CURRENT_DATE - p_days;
  v_previous_end := v_current_start;
  v_previous_start := v_previous_end - p_days;

  RETURN QUERY
  WITH category_list AS (
    SELECT unnest(p_categories) as cat
  ),
  current_period AS (
    SELECT
      r.category,
      COUNT(*) as cnt
    FROM reports r
    WHERE r.status = 'approved'
      AND r.category = ANY(p_categories)
      AND r.created_at >= v_current_start
    GROUP BY r.category
  ),
  previous_period AS (
    SELECT
      r.category,
      COUNT(*) as cnt
    FROM reports r
    WHERE r.status = 'approved'
      AND r.category = ANY(p_categories)
      AND r.created_at >= v_previous_start
      AND r.created_at < v_previous_end
    GROUP BY r.category
  )
  SELECT
    cl.cat as category,
    COALESCE(cp.cnt, 0) as current_count,
    COALESCE(pp.cnt, 0) as previous_count,
    CASE
      WHEN COALESCE(pp.cnt, 0) = 0 THEN
        CASE WHEN COALESCE(cp.cnt, 0) > 0 THEN 100.0 ELSE 0.0 END
      ELSE
        ROUND(((COALESCE(cp.cnt, 0)::NUMERIC - pp.cnt::NUMERIC) / pp.cnt::NUMERIC) * 100, 1)
    END as percent_change,
    CASE
      WHEN COALESCE(cp.cnt, 0) > COALESCE(pp.cnt, 0) THEN 'increasing'
      WHEN COALESCE(cp.cnt, 0) < COALESCE(pp.cnt, 0) THEN 'decreasing'
      ELSE 'stable'
    END as trending_direction
  FROM category_list cl
  LEFT JOIN current_period cp ON cp.category = cl.cat
  LEFT JOIN previous_period pp ON pp.category = cl.cat;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- RPC: Get Similar Experiencers
-- Returns count of users with similar interests
-- =============================================

CREATE OR REPLACE FUNCTION get_similar_experiencers(
  p_user_id UUID,
  p_state TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_similar_users BIGINT,
  users_in_state BIGINT,
  shared_interests TEXT[]
) AS $$
DECLARE
  v_user_interests TEXT[];
BEGIN
  -- Get the user's interested categories
  SELECT COALESCE(interested_categories, '{}')
  INTO v_user_interests
  FROM profiles
  WHERE id = p_user_id;

  -- If user has no interests, return zeros
  IF array_length(v_user_interests, 1) IS NULL OR array_length(v_user_interests, 1) = 0 THEN
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT, '{}'::TEXT[];
    RETURN;
  END IF;

  RETURN QUERY
  WITH similar_users AS (
    SELECT
      p.id,
      p.location_state,
      p.interested_categories,
      -- Count how many interests overlap
      (SELECT COUNT(*)
       FROM unnest(p.interested_categories) ui
       WHERE ui = ANY(v_user_interests)) as overlap_count
    FROM profiles p
    WHERE p.id != p_user_id
      AND p.interested_categories IS NOT NULL
      AND array_length(p.interested_categories, 1) > 0
      -- At least one shared interest
      AND p.interested_categories && v_user_interests
  )
  SELECT
    COUNT(*)::BIGINT as total_similar_users,
    COUNT(*) FILTER (WHERE location_state = p_state)::BIGINT as users_in_state,
    v_user_interests as shared_interests
  FROM similar_users;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON FUNCTION get_category_trends IS 'Returns trending stats for specified phenomenon categories over a time period';
COMMENT ON FUNCTION get_similar_experiencers IS 'Returns count of users who share interests with the specified user';
