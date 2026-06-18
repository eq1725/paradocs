-- ============================================================
-- V11.18.57 — Fix report_region_counts unique index (the real cause of the
-- silently-failing refresh).
--
-- The MV GROUPs BY (country_code, country, state_province, category), but the
-- unique index report_region_counts_pk_idx only covered
--   (country_code, COALESCE(state_province,''), category)  -- omits `country`.
-- One country_code maps to multiple country names (GB -> "United Kingdom",
-- "Scotland", "England", "Wales"), so a row like
--   (GB, 'Scottish Borders', ufos_aliens)
-- exists under both "United Kingdom" AND "Scotland" -> duplicate index key ->
-- ERROR 23505 unique_violation -> REFRESH MATERIALIZED VIEW aborts. Because
-- refresh_region_counts() wraps REFRESH in EXCEPTION WHEN OTHERS, the failure
-- was swallowed and the MV silently froze. (It broke the moment country_code
-- was backfilled onto Scotland/England rows; before that they were NULL and
-- excluded from the MV.)
--
-- The /api/map/region-counts endpoint aggregates by country_code, so multiple
-- country-name rows per code are harmless — the unique index just has to match
-- the MV's actual grouping key. Add `country` to it.
-- ============================================================

DROP INDEX IF EXISTS report_region_counts_pk_idx;

CREATE UNIQUE INDEX report_region_counts_pk_idx
  ON report_region_counts (
    country_code,
    COALESCE(country, ''),
    COALESCE(state_province, ''),
    COALESCE(category, '')
  );

-- Now the refresh succeeds. (CONCURRENTLY also works again with a valid unique
-- index, so refresh_region_counts() — and the scheduled task / ingest calls —
-- will actually rebuild from here on.)
REFRESH MATERIALIZED VIEW report_region_counts;
