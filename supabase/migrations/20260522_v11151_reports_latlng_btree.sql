-- V11.15.1 P1.2B — btree index on (latitude, longitude) for bbox queries.
--
-- The new /api/map/viewport-reports endpoint filters reports by a
-- viewport bounding box (W,S,E,N). At ~22k rows today a full scan is
-- fine, but as the corpus grows to 100k → 1M+ we need the index to
-- keep viewport-restricted queries fast.
--
-- Btree is sufficient here — bbox queries are just two range scans
-- (lat BETWEEN s AND n, lng BETWEEN w AND e). PostGIS GIST is more
-- powerful (polygon-intersects, etc.) but overkill for a rectangular
-- bbox. If we ever need polygon-mask queries (e.g. show reports
-- inside a country shape), we'll upgrade then.
--
-- CONCURRENTLY = non-blocking. Drain's INSERTs/UPDATEs to the
-- reports table continue normally during index build. Build takes
-- ~10-30s on 22k rows; minutes on 1M+ but still concurrent.
--
-- Per V11.15 panel review (Persona E, Performance): "Required by
-- V11.15: spatial bbox filter on report query. Currently fetches
-- ALL approved reports. Replace with viewport_intersects(bbox)
-- query. Add a GIST index on (latitude, longitude)." We're using
-- btree instead of GIST per the rationale above.

CREATE INDEX CONCURRENTLY IF NOT EXISTS reports_latlng_btree_idx
  ON reports (latitude, longitude)
  WHERE status = 'approved' AND latitude IS NOT NULL AND longitude IS NOT NULL;

COMMENT ON INDEX reports_latlng_btree_idx IS
  'V11.15.1 — partial btree on (lat, lng) where status=approved AND coords populated. Backs viewport-bbox queries from /api/map/viewport-reports. Partial index keeps it tight (~22k rows now, ~1M rows ceiling).';
