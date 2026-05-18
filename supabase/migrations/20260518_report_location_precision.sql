-- Migration: report location_precision column
--
-- Panel-feedback (May 2026): submitted experiences must enforce location
-- at submit-time so the report page map, the Today feed pin, and
-- "near you" personalization always have something to render. We let
-- the user pick precision — exact (drops a pin), city (renders a city
-- radius circle, no pin), region (state/province radius), country
-- (country chip only). Default is 'exact' to match the historical
-- behavior for the ~all already-submitted rows where lat/lng were
-- captured from a precise picker.
--
-- The companion event_date_precision column already exists (added
-- 20260426_event_date_precision.sql); this migration handles the
-- location side so the submit form's two enforcement points have
-- symmetric schema support.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS location_precision TEXT DEFAULT 'exact';

-- Constrain to the four valid precision tiers. Use a separate
-- statement so the column add is idempotent even when the constraint
-- already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_location_precision_check'
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_location_precision_check
      CHECK (location_precision IN ('exact', 'city', 'region', 'country'));
  END IF;
END $$;

COMMENT ON COLUMN public.reports.location_precision IS
  'Location precision tier: exact (pin), city (radius), region (state/province radius), country (country chip only). Drives the report-page map widget render. Defaults to exact.';

-- Backfill: rows with NULL lat/lng but a city/state get 'city' or
-- 'region'. Rows with lat/lng stay 'exact'. Rows with no location
-- data at all stay 'exact' (the column default) — they have no map
-- to render anyway, so precision is moot.
UPDATE public.reports
SET location_precision = 'city'
WHERE location_precision = 'exact'
  AND (latitude IS NULL OR longitude IS NULL)
  AND city IS NOT NULL
  AND city <> '';

UPDATE public.reports
SET location_precision = 'region'
WHERE location_precision = 'exact'
  AND (latitude IS NULL OR longitude IS NULL)
  AND (city IS NULL OR city = '')
  AND state_province IS NOT NULL
  AND state_province <> '';

UPDATE public.reports
SET location_precision = 'country'
WHERE location_precision = 'exact'
  AND (latitude IS NULL OR longitude IS NULL)
  AND (city IS NULL OR city = '')
  AND (state_province IS NULL OR state_province = '')
  AND country IS NOT NULL
  AND country <> '';

-- Helpful index for any future queries that filter by precision
-- (e.g., "show only exact-pin reports on the Today feed map").
CREATE INDEX IF NOT EXISTS idx_reports_location_precision
  ON public.reports(location_precision)
  WHERE location_precision <> 'exact';
