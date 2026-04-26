-- Migration: Add event_date_precision and event_date_raw columns
-- Date: 2026-04-26
--
-- Purpose: When users report approximate dates (year only, month/year,
-- or decade), we should not store a fabricated DATE like "2014-01-01"
-- that implies January 1st. Instead, store the user's raw input in
-- event_date_raw and the precision level in event_date_precision.
-- The event_date DATE column is only populated for exact dates.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS event_date_precision TEXT DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS event_date_raw TEXT;

-- Backfill: existing approximate dates get 'approximate' precision
UPDATE public.reports
SET event_date_precision = 'approximate'
WHERE event_date_approximate = TRUE
  AND event_date_precision = 'exact';

COMMENT ON COLUMN public.reports.event_date_precision IS
  'Date precision: exact, month, year, or decade';
COMMENT ON COLUMN public.reports.event_date_raw IS
  'Raw user input for non-exact dates (e.g., "2014", "2014-07", "2010s")';
