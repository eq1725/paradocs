-- ============================================================
-- V10.8.C — Location normalization: geocode cache + coords_synthetic
--
-- Two changes on top of the existing reports / map schema:
--
-- 1. geocode_cache(query PK, lat, lng, accuracy, geocoded_at)
--    Lookup cache for MapTiler responses. Key is the lowercased
--    'city|state|country' tuple. Cache hits skip a paid API call.
--    At mass-ingest scale we expect ~70% cache hit rate.
--
-- 2. reports.coords_synthetic BOOLEAN
--    True when lat/lng came from a centroid fallback (state or
--    country) rather than precise geocoding. The map uses this to
--    render fuzzy markers (hollow ring instead of filled dot) so the
--    user isn't misled into thinking a country-center pin is exact.
--
-- 3. reports.country_code TEXT (NEW)
--    ISO 3166-1 alpha-2 code. Populated by normalizeLocation after
--    country-alias folding. Enables canonical filters on /map and
--    /explore. The legacy reports.country (free-text) column is kept
--    as the display string but country_code is the join key.
--
-- See V10.8_PIPELINE_HARDENING_DESIGN.md → "V10.8.C" for the full
-- contract.
-- ============================================================

-- 1. geocode_cache
CREATE TABLE IF NOT EXISTS geocode_cache (
  query        TEXT PRIMARY KEY,                  -- lowercased 'city|state|country' key
  lat          NUMERIC NOT NULL,
  lng          NUMERIC NOT NULL,
  accuracy     TEXT,                              -- 'point' | 'address' | 'street' | 'locality' | 'region' | 'country'
  geocoded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS geocode_cache_geocoded_at_idx
  ON geocode_cache (geocoded_at DESC);

COMMENT ON TABLE geocode_cache IS
  'V10.8.C — MapTiler geocode response cache. Key is the lowercased "city|state|country" tuple. Avoids re-paying for repeated city lookups during mass-ingest.';

COMMENT ON COLUMN geocode_cache.accuracy IS
  'MapTiler accuracy class — see GeocodeAccuracy in src/lib/ingestion/utils/normalize-location.ts. Lets the engine distinguish street-level hits from city-centroid hits.';

-- 2. reports.coords_synthetic
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS coords_synthetic BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN reports.coords_synthetic IS
  'V10.8.C — TRUE when lat/lng came from a centroid fallback (state or country) rather than a precise geocode. Map renders these as fuzzy markers.';

-- 3. reports.country_code
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS country_code TEXT;

CREATE INDEX IF NOT EXISTS reports_country_code_idx
  ON reports (country_code) WHERE country_code IS NOT NULL;

COMMENT ON COLUMN reports.country_code IS
  'V10.8.C — ISO 3166-1 alpha-2 code populated by normalizeLocation. Canonical join key for country filters. The free-text reports.country column is preserved as the display string.';
