-- ============================================================
-- V10.8.I — nearby_reports_within_km excludes synthetic coords
--
-- Bug: the V10.7.B.0 RPC returns any approved report with a
-- lat/lng within X km of the focal report. After V10.8.C added
-- centroid fallbacks (coords_synthetic), every country-only US
-- report shares the same US-centroid lat/lng. The RPC therefore
-- returns "56 nearby reports" for any US-country-only focal
-- row — they're all sitting at the same synthetic point.
--
-- Fix: filter both the focal-row lookup AND the candidate set
-- by coords_synthetic IS NOT TRUE. If the focal row is synthetic,
-- return an empty set (nothing is meaningfully "near" a country
-- centroid). If a candidate is synthetic, exclude it from the
-- nearby result regardless of haversine distance.
--
-- The function signature is unchanged so callers don't need to
-- rev. Idempotent CREATE OR REPLACE.
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
      AND COALESCE(coords_synthetic, FALSE) = FALSE   -- V10.8.I: skip if focal coords are synthetic
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
      AND COALESCE(r.coords_synthetic, FALSE) = FALSE  -- V10.8.I: exclude synthetic candidates
  )
  SELECT id, slug, title, category, latitude, longitude, distance_km
  FROM candidates
  WHERE distance_km <= p_radius_km
  ORDER BY distance_km ASC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION nearby_reports_within_km IS
  'V10.8.I — returns approved reports within p_radius_km of the focal report (p_report_id), ordered by distance. Excludes synthetic-coord rows on both sides (focal and candidates) so country/state centroid pile-ups don''t produce false "X nearby" claims. Limit clamped at p_limit. Uses haversine because PostGIS is not installed; revisit if mass-ingest latency requires it.';
