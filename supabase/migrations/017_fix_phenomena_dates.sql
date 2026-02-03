-- ============================================
-- FIX PHENOMENA DATE CALCULATION
-- The trigger was using the most recently linked report's date
-- instead of MIN/MAX across all linked reports
-- ============================================

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS update_phenomenon_stats_trigger ON public.report_phenomena;

-- Replace the function with corrected logic
CREATE OR REPLACE FUNCTION update_phenomenon_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Update stats using correct MIN/MAX calculations
    UPDATE public.phenomena SET
      report_count = (
        SELECT COUNT(*)
        FROM public.report_phenomena rp
        WHERE rp.phenomenon_id = NEW.phenomenon_id
      ),
      -- First reported = earliest event_date across ALL linked reports
      first_reported_date = (
        SELECT MIN(r.event_date)
        FROM public.report_phenomena rp
        JOIN public.reports r ON r.id = rp.report_id
        WHERE rp.phenomenon_id = NEW.phenomenon_id
          AND r.event_date IS NOT NULL
      ),
      -- Last reported = most recent event_date across ALL linked reports
      last_reported_date = (
        SELECT MAX(r.event_date)
        FROM public.report_phenomena rp
        JOIN public.reports r ON r.id = rp.report_id
        WHERE rp.phenomenon_id = NEW.phenomenon_id
          AND r.event_date IS NOT NULL
      )
    WHERE id = NEW.phenomenon_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- Recalculate all stats when a link is removed
    UPDATE public.phenomena SET
      report_count = (
        SELECT COUNT(*)
        FROM public.report_phenomena rp
        WHERE rp.phenomenon_id = OLD.phenomenon_id
      ),
      first_reported_date = (
        SELECT MIN(r.event_date)
        FROM public.report_phenomena rp
        JOIN public.reports r ON r.id = rp.report_id
        WHERE rp.phenomenon_id = OLD.phenomenon_id
          AND r.event_date IS NOT NULL
      ),
      last_reported_date = (
        SELECT MAX(r.event_date)
        FROM public.report_phenomena rp
        JOIN public.reports r ON r.id = rp.report_id
        WHERE rp.phenomenon_id = OLD.phenomenon_id
          AND r.event_date IS NOT NULL
      )
    WHERE id = OLD.phenomenon_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER update_phenomenon_stats_trigger
  AFTER INSERT OR DELETE ON public.report_phenomena
  FOR EACH ROW EXECUTE FUNCTION update_phenomenon_stats();

-- Recalculate all existing phenomena stats to fix current data
UPDATE public.phenomena p SET
  report_count = COALESCE((
    SELECT COUNT(*)
    FROM public.report_phenomena rp
    WHERE rp.phenomenon_id = p.id
  ), 0),
  first_reported_date = (
    SELECT MIN(r.event_date)
    FROM public.report_phenomena rp
    JOIN public.reports r ON r.id = rp.report_id
    WHERE rp.phenomenon_id = p.id
      AND r.event_date IS NOT NULL
  ),
  last_reported_date = (
    SELECT MAX(r.event_date)
    FROM public.report_phenomena rp
    JOIN public.reports r ON r.id = rp.report_id
    WHERE rp.phenomenon_id = p.id
      AND r.event_date IS NOT NULL
  );
