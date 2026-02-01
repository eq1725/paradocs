-- Migration: Scale Optimizations for 10M+ Records
-- Purpose: Replace in-memory aggregation with PostgreSQL-level aggregation
-- and add missing indexes for efficient queries at scale

-- =============================================================
-- PART 1: RPC Functions for Efficient Aggregation
-- =============================================================

-- Get approved reports count (estimated for speed)
CREATE OR REPLACE FUNCTION get_approved_reports_count()
RETURNS TABLE (count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT COUNT(*)::BIGINT
  FROM reports
  WHERE status = 'approved';
END;
$$ LANGUAGE plpgsql STABLE;

-- Get unique countries count
CREATE OR REPLACE FUNCTION get_unique_countries_count()
RETURNS TABLE (count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT COUNT(DISTINCT country)::BIGINT
  FROM reports
  WHERE status = 'approved' AND country IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Category breakdown with counts (replaces in-memory aggregation)
CREATE OR REPLACE FUNCTION get_category_breakdown()
RETURNS TABLE (category TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT r.category::TEXT, COUNT(*)::BIGINT
  FROM reports r
  WHERE r.status = 'approved'
  GROUP BY r.category
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Country breakdown with counts (top 15)
CREATE OR REPLACE FUNCTION get_country_breakdown(limit_count INT DEFAULT 15)
RETURNS TABLE (country TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT r.country::TEXT, COUNT(*)::BIGINT
  FROM reports r
  WHERE r.status = 'approved' AND r.country IS NOT NULL
  GROUP BY r.country
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Credibility breakdown with counts
CREATE OR REPLACE FUNCTION get_credibility_breakdown()
RETURNS TABLE (credibility TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT r.credibility::TEXT, COUNT(*)::BIGINT
  FROM reports r
  WHERE r.status = 'approved'
  GROUP BY r.credibility
  ORDER BY
    CASE r.credibility
      WHEN 'confirmed' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
      WHEN 'unverified' THEN 5
      ELSE 6
    END;
END;
$$ LANGUAGE plpgsql STABLE;

-- Time of day breakdown (requires event_time)
CREATE OR REPLACE FUNCTION get_time_of_day_breakdown()
RETURNS TABLE (hour INT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM r.event_time)::INT AS hour,
    COUNT(*)::BIGINT
  FROM reports r
  WHERE r.status = 'approved' AND r.event_time IS NOT NULL
  GROUP BY EXTRACT(HOUR FROM r.event_time)
  ORDER BY hour;
END;
$$ LANGUAGE plpgsql STABLE;

-- Day of week breakdown
CREATE OR REPLACE FUNCTION get_day_of_week_breakdown()
RETURNS TABLE (day_of_week INT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(DOW FROM r.event_date)::INT AS day_of_week,
    COUNT(*)::BIGINT
  FROM reports r
  WHERE r.status = 'approved' AND r.event_date IS NOT NULL
  GROUP BY EXTRACT(DOW FROM r.event_date)
  ORDER BY day_of_week;
END;
$$ LANGUAGE plpgsql STABLE;

-- Source type breakdown
CREATE OR REPLACE FUNCTION get_source_breakdown()
RETURNS TABLE (source_type TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(r.source_type, 'user_submission')::TEXT AS source_type,
    COUNT(*)::BIGINT
  FROM reports r
  WHERE r.status = 'approved'
  GROUP BY r.source_type
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Evidence analysis aggregation
CREATE OR REPLACE FUNCTION get_evidence_analysis()
RETURNS TABLE (
  total BIGINT,
  with_photo_video BIGINT,
  with_physical_evidence BIGINT,
  with_official_report BIGINT,
  with_any_evidence BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total,
    COUNT(CASE WHEN has_photo_video = true THEN 1 END)::BIGINT AS with_photo_video,
    COUNT(CASE WHEN has_physical_evidence = true THEN 1 END)::BIGINT AS with_physical_evidence,
    COUNT(CASE WHEN has_official_report = true THEN 1 END)::BIGINT AS with_official_report,
    COUNT(CASE WHEN has_photo_video = true OR has_physical_evidence = true OR has_official_report = true THEN 1 END)::BIGINT AS with_any_evidence
  FROM reports
  WHERE status = 'approved';
END;
$$ LANGUAGE plpgsql STABLE;

-- Witness statistics aggregation
CREATE OR REPLACE FUNCTION get_witness_stats()
RETURNS TABLE (
  total_reports BIGINT,
  total_witnesses BIGINT,
  reports_with_multiple_witnesses BIGINT,
  submitter_was_witness_count BIGINT,
  anonymous_submissions BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_reports,
    COALESCE(SUM(witness_count), 0)::BIGINT AS total_witnesses,
    COUNT(CASE WHEN witness_count > 1 THEN 1 END)::BIGINT AS reports_with_multiple_witnesses,
    COUNT(CASE WHEN submitter_was_witness = true THEN 1 END)::BIGINT AS submitter_was_witness_count,
    COUNT(CASE WHEN anonymous_submission = true THEN 1 END)::BIGINT AS anonymous_submissions
  FROM reports
  WHERE status = 'approved';
END;
$$ LANGUAGE plpgsql STABLE;

-- Monthly trend (last 12 months)
CREATE OR REPLACE FUNCTION get_monthly_trend(months_back INT DEFAULT 12)
RETURNS TABLE (month_key TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(r.created_at, 'YYYY-MM') AS month_key,
    COUNT(*)::BIGINT
  FROM reports r
  WHERE r.status = 'approved'
    AND r.created_at >= (CURRENT_DATE - (months_back || ' months')::INTERVAL)
  GROUP BY TO_CHAR(r.created_at, 'YYYY-MM')
  ORDER BY month_key;
END;
$$ LANGUAGE plpgsql STABLE;

-- Total views aggregation
CREATE OR REPLACE FUNCTION get_total_views()
RETURNS TABLE (total_views BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT COALESCE(SUM(view_count), 0)::BIGINT
  FROM reports
  WHERE status = 'approved';
END;
$$ LANGUAGE plpgsql STABLE;

-- Basic stats all-in-one (reduces multiple queries)
CREATE OR REPLACE FUNCTION get_basic_stats()
RETURNS TABLE (
  total_reports BIGINT,
  total_views BIGINT,
  countries_count BIGINT,
  this_month_reports BIGINT,
  last_month_reports BIGINT,
  last_24h_reports BIGINT,
  last_7d_reports BIGINT
) AS $$
DECLARE
  this_month_start TIMESTAMP := DATE_TRUNC('month', CURRENT_DATE);
  last_month_start TIMESTAMP := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM reports WHERE status = 'approved')::BIGINT,
    (SELECT COALESCE(SUM(view_count), 0) FROM reports WHERE status = 'approved')::BIGINT,
    (SELECT COUNT(DISTINCT country) FROM reports WHERE status = 'approved' AND country IS NOT NULL)::BIGINT,
    (SELECT COUNT(*) FROM reports WHERE status = 'approved' AND created_at >= this_month_start)::BIGINT,
    (SELECT COUNT(*) FROM reports WHERE status = 'approved' AND created_at >= last_month_start AND created_at < this_month_start)::BIGINT,
    (SELECT COUNT(*) FROM reports WHERE status = 'approved' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::BIGINT,
    (SELECT COUNT(*) FROM reports WHERE status = 'approved' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')::BIGINT;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================
-- PART 2: Additional Performance Indexes
-- =============================================================

-- Index for credibility + status filtering (used in explore page)
CREATE INDEX IF NOT EXISTS idx_reports_credibility_status
ON reports(credibility, status)
WHERE status = 'approved';

-- Index for evidence filtering (used in explore page)
CREATE INDEX IF NOT EXISTS idx_reports_evidence_status
ON reports(status)
WHERE status = 'approved' AND (has_physical_evidence = true OR has_photo_video = true);

-- Index for view_count aggregation
CREATE INDEX IF NOT EXISTS idx_reports_view_count
ON reports(view_count DESC)
WHERE status = 'approved';

-- Index for source type grouping
CREATE INDEX IF NOT EXISTS idx_reports_source_type_status
ON reports(source_type, status)
WHERE status = 'approved';

-- Index for monthly aggregations
CREATE INDEX IF NOT EXISTS idx_reports_created_month_status
ON reports(DATE_TRUNC('month', created_at), status)
WHERE status = 'approved';

-- Index for country filtering
CREATE INDEX IF NOT EXISTS idx_reports_country_status
ON reports(country, status)
WHERE status = 'approved' AND country IS NOT NULL;

-- Partial index for map with lat/long ordered by recent
CREATE INDEX IF NOT EXISTS idx_reports_approved_latlong_recent
ON reports(created_at DESC, latitude, longitude)
WHERE status = 'approved' AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- =============================================================
-- PART 3: Grant Execute Permissions
-- =============================================================

-- Grant execute permissions to authenticated and anon users
GRANT EXECUTE ON FUNCTION get_approved_reports_count() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_unique_countries_count() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_category_breakdown() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_country_breakdown(INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_credibility_breakdown() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_time_of_day_breakdown() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_day_of_week_breakdown() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_source_breakdown() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_evidence_analysis() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_witness_stats() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_monthly_trend(INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_total_views() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_basic_stats() TO authenticated, anon;
