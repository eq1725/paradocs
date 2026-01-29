-- Ingestion Infrastructure Migration
-- Adds adapter configuration to data_sources and creates ingestion_jobs table

-- ============================================
-- ADD ADAPTER COLUMNS TO DATA_SOURCES
-- ============================================

-- Add columns for adapter configuration
ALTER TABLE public.data_sources
ADD COLUMN IF NOT EXISTS adapter_type TEXT,
ADD COLUMN IF NOT EXISTS scrape_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS scrape_interval_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS success_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Update existing data sources with adapter types
UPDATE public.data_sources SET adapter_type = 'nuforc', scrape_config = '{"base_url": "https://nuforc.org", "rate_limit_ms": 500}' WHERE slug = 'nuforc';
UPDATE public.data_sources SET adapter_type = 'bfro', scrape_config = '{"base_url": "https://www.bfro.net", "rate_limit_ms": 500, "states": ["wa", "or", "ca", "oh", "fl", "tx", "pa", "ny"]}' WHERE slug = 'bfro';

-- ============================================
-- INGESTION JOBS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  records_found INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job queries
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_source ON public.ingestion_jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON public.ingestion_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_created ON public.ingestion_jobs(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;

-- Ingestion jobs are viewable by everyone (read-only)
CREATE POLICY "Ingestion jobs are viewable by everyone"
ON public.ingestion_jobs FOR SELECT USING (true);

-- Only service role can modify ingestion jobs
CREATE POLICY "Only service role can modify ingestion_jobs"
ON public.ingestion_jobs FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.ingestion_jobs IS 'Tracks automated data ingestion runs from external sources';
COMMENT ON COLUMN public.data_sources.adapter_type IS 'Type of adapter to use: nuforc, bfro, etc.';
COMMENT ON COLUMN public.data_sources.scrape_config IS 'JSON configuration passed to the adapter';
COMMENT ON COLUMN public.data_sources.scrape_interval_hours IS 'How often to run this adapter (in hours)';
