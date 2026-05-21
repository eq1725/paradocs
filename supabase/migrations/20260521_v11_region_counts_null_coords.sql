-- V11 — region counts view: count BOTH legacy synthetic-coord reports
-- AND new null-coord country-precision reports.
--
-- Background: V10.8.C originally synthesized country-centroid lat/lng
-- for country-precision reports with `coords_synthetic = TRUE` so the
-- map could "show" them somewhere. That created a stack of pins on
-- 39.78/-100.45 (US center) — the visible-clump bug. V11 (May 2026)
-- changed normalize-location.ts to leave lat/lng NULL for
-- country-precision reports entirely. They surface on the map ONLY
-- via the RegionTotalsPanel as honest aggregate counts.
--
-- But the report_region_counts materialized view's WHERE clause
-- was written for the V10.8 shape (`coords_synthetic = TRUE`) and
-- doesn't include the new null-coord rows. As a result:
--   - The "57" badge in the panel is stale leftover from old
--     synthetic-coord reports.
--   - New country-precision reports from the ongoing smoke pass
--     never get counted into the panel.
--
-- This migration broadens the view to count any approved report
-- with a country_code that isn't pin-eligible — i.e. EITHER the
-- legacy `coords_synthetic = TRUE` flag OR the new shape of
-- (latitude IS NULL AND longitude IS NULL).

DROP MATERIALIZED VIEW IF EXISTS report_region_counts;

CREATE MATERIALIZED VIEW report_region_counts AS
SELECT
  country_code,
  country,
  state_province,
  category,
  COUNT(*) AS report_count
FROM reports
WHERE
  status = 'approved'
  AND country_code IS NOT NULL
  AND (
    -- Legacy: state-centroid synthetic-coord pins (pre-V11)
    coords_synthetic = TRUE
    -- New: country-precision rows with no synthesized coord (V11+)
    OR (latitude IS NULL AND longitude IS NULL)
  )
GROUP BY country_code, country, state_province, category;

-- Restore indexes (CONCURRENTLY-refresh requires a unique index).
CREATE UNIQUE INDEX IF NOT EXISTS report_region_counts_pk_idx
  ON report_region_counts (country_code, COALESCE(state_province, ''), category);

CREATE INDEX IF NOT EXISTS report_region_counts_country_idx
  ON report_region_counts (country_code);

CREATE INDEX IF NOT EXISTS report_region_counts_country_state_idx
  ON report_region_counts (country_code, state_province)
  WHERE state_province IS NOT NULL;

COMMENT ON MATERIALIZED VIEW report_region_counts IS
  'V11 — aggregated counts of non-pin-eligible reports (synthetic-coord OR null-coord country-precision) by country, state, and category. Backs the explore-map region-totals panel + future choropleth polygons. Refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY report_region_counts.';

-- Refresh immediately so the panel reflects the new view definition.
REFRESH MATERIALIZED VIEW report_region_counts;
