-- ============================================================
-- V10.9.A — Region counts materialized view + indexes
--
-- Per V10.9_EXPLORE_MAP_AGGREGATION_DESIGN.md. Aggregates
-- synthetic-coord reports by country (+ state, when present)
-- and category. Designed for mass-ingest scale: at 1M reports
-- the view holds ≤10K rows even worst-case (210 countries × ~50
-- states × 11 categories), and the GROUP BY runs in milliseconds.
--
-- The /explore?mode=map page queries this via the new
-- /api/map/region-counts endpoint to render a "Region totals"
-- panel (V10.9.A) and, in the future, choropleth polygons
-- (V10.9.B).
--
-- Refresh strategy: cron-driven nightly via
-- REFRESH MATERIALIZED VIEW CONCURRENTLY. The CONCURRENTLY
-- variant requires a unique index, which we provide below.
--
-- For real-time freshness during mass ingest, the ingestion
-- engine can also REFRESH after every batch — the view is
-- cheap. Decide at deploy time.
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS report_region_counts AS
SELECT
  country_code,
  country,
  state_province,
  category,
  COUNT(*) AS report_count
FROM reports
WHERE
  status = 'approved'
  AND coords_synthetic = TRUE
  AND country_code IS NOT NULL
GROUP BY country_code, country, state_province, category;

-- Unique composite key required for REFRESH MATERIALIZED VIEW
-- CONCURRENTLY. NULL state_province is normalized to '' via COALESCE
-- so the index covers country-only rows too.
CREATE UNIQUE INDEX IF NOT EXISTS report_region_counts_pk_idx
  ON report_region_counts (country_code, COALESCE(state_province, ''), category);

CREATE INDEX IF NOT EXISTS report_region_counts_country_idx
  ON report_region_counts (country_code);

CREATE INDEX IF NOT EXISTS report_region_counts_country_state_idx
  ON report_region_counts (country_code, state_province)
  WHERE state_province IS NOT NULL;

COMMENT ON MATERIALIZED VIEW report_region_counts IS
  'V10.9.A — aggregated counts of synthetic-coord reports by country, state, and category. Backs the explore-map region-totals panel + future choropleth polygons. Refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY report_region_counts.';

-- Trigger an initial refresh so the view is populated immediately.
REFRESH MATERIALIZED VIEW report_region_counts;
