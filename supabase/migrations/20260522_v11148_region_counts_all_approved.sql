-- V11.14.8 — region_counts view: count ALL approved reports with
-- country_code, not just non-pin-eligible ones.
--
-- Background: V11's broadening (May 21) counted synthetic-coord +
-- null-coord reports for the Region Totals panel — the panel's job
-- is to surface aggregate counts for reports we CAN'T precisely pin.
-- That made sense when nearly every Reddit ingest had country_code
-- but no city/state.
--
-- After the V11.14.8 mass run + MapTiler-enabled backfill, most
-- approved reports now have REAL city/state coordinates with
-- coords_synthetic = FALSE. They show as map pins (clusters) but
-- are EXCLUDED from the region-counts view — which means the
-- choropleth-fill layer renders all countries with has_data=false
-- and zero opacity. Result: the toggle does nothing visually
-- because the underlying data is empty.
--
-- New definition: count every approved report that has a
-- country_code, regardless of coord precision. The choropleth then
-- accurately tints countries by total approved-report volume,
-- which is what users actually want to see ("which countries have
-- the most paranormal accounts on Paradocs"). The Region Totals
-- panel — if still surfaced — shows the same aggregate, which is
-- arguably MORE useful than the old "non-pinned only" cut.

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
GROUP BY country_code, country, state_province, category;

-- Unique composite key required for REFRESH MATERIALIZED VIEW
-- CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS report_region_counts_pk_idx
  ON report_region_counts (country_code, COALESCE(state_province, ''), category);

CREATE INDEX IF NOT EXISTS report_region_counts_country_idx
  ON report_region_counts (country_code);

CREATE INDEX IF NOT EXISTS report_region_counts_country_state_idx
  ON report_region_counts (country_code, state_province)
  WHERE state_province IS NOT NULL;

COMMENT ON MATERIALIZED VIEW report_region_counts IS
  'V11.14.8 — aggregated counts of all approved reports by country, state, and category. Backs the explore-map choropleth-fill layer + region-totals panel. Refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY report_region_counts.';

-- Refresh immediately so the panel + choropleth populate from the
-- new definition without needing a manual rpc('refresh_region_counts').
REFRESH MATERIALIZED VIEW report_region_counts;
