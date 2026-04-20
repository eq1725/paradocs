-- Add metadata JSONB column to reports table
-- Stores adapter-specific structured data (NUFORC estimated speed, size, etc.)
-- This avoids needing separate columns for each source's unique fields.

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Index for querying metadata fields
CREATE INDEX IF NOT EXISTS idx_reports_metadata ON public.reports USING gin(metadata);

COMMENT ON COLUMN public.reports.metadata IS 'Adapter-specific structured data (e.g. NUFORC estimated speed, size, direction, angle of elevation, closest distance)';
