-- ============================================================
-- V10.7.B.0 — Nearby-reports RPC
--
-- Single source of truth for the "give me approved reports
-- within X km of report Y" query. Replaces the inline haversine
-- math in /api/reports/[slug]/nearby.ts so both:
--   - the API endpoint (used by LocationMap's nearby overlay)
--   - getStaticProps for /report/[slug] (used by ReportLocationMap
--     to render Supercluster cluster bubbles in V10.7.B.1)
-- ...read from the same function with the same distance math.
--
-- Implementation notes:
--   - Plain haversine in SQL because we don't have PostGIS. If
--     post-mass-ingest p95 latency exceeds 200ms, add a
--     `geom geography` column + ST_DWithin and swap the body of
--     this function — callers don't need to change.
--   - LEAST(1.0, GREATEST(-1.0, ...)) clamps the cosine argument
--     to guard against floating-point drift on coincident points
--     (acos of slightly-over-1 returns NaN).
--   - Filtered by status='approved' and excludes the focal report
--     itself, so callers can pass it the same report_id they're
--     viewing without manual exclusion.
--   - LIMIT 50 cap: hard ceiling on result-set size for memory
--     safety. Callers can request fewer.
--
-- Indexes assumed: status, latitude, longitude all exist already
-- on reports (V9.x ingestion migration).
-- ============================================================

CREATE OR REPLACE FUNCTION nearby_reports_within_km(
  p_report_id UUID,
  p_radius_km NUMERIC DEFAULT 80,
  p_limit INT DEFAULT 50
) RETURNS TABLE (
  id UUID,
  slug TEXT,
  title TEXT,
  category TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  distance_km NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH source AS (
    SELECT latitude AS lat, longitude AS lng
    FROM reports
    WHERE id = p_report_id
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
  ),
  candidates AS (
    SELECT
      r.id,
      r.slug,
      r.title,
      r.category,
      r.latitude,
      r.longitude,
      (6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(s.lat)) * cos(radians(r.latitude))
          * cos(radians(r.longitude) - radians(s.lng))
          + sin(radians(s.lat)) * sin(radians(r.latitude))
        ))
      )) AS distance_km
    FROM reports r
    CROSS JOIN source s
    WHERE r.id <> p_report_id
      AND r.status = 'approved'
      AND r.latitude IS NOT NULL
      AND r.longitude IS NOT NULL
  )
  SELECT id, slug, title, category, latitude, longitude, distance_km
  FROM candidates
  WHERE distance_km <= p_radius_km
  ORDER BY distance_km ASC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION nearby_reports_within_km IS
  'V10.7.B.0 — Returns approved reports within p_radius_km of the focal report (p_report_id), ordered by distance ascending. Limit clamped at p_limit. Uses haversine because PostGIS is not installed; revisit if mass-ingest latency requires it.';
