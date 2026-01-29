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

-- ============================================
-- ADD NEW DATA SOURCES FOR ADAPTERS
-- ============================================

-- Add shadowlands data source
INSERT INTO public.data_sources (name, slug, description, url, adapter_type, scrape_config, is_active)
VALUES ('Shadowlands Haunted Places', 'shadowlands', 'Haunted places index from theshadowlands.net', 'https://theshadowlands.net/places', 'shadowlands', '{"rate_limit_ms": 1000, "states": ["california", "texas", "florida", "ohio", "pennsylvania", "new york", "illinois"]}', true)
ON CONFLICT (slug) DO UPDATE SET adapter_type = 'shadowlands', scrape_config = EXCLUDED.scrape_config;

-- Add ghosts of america data source
INSERT INTO public.data_sources (name, slug, description, url, adapter_type, scrape_config, is_active)
VALUES ('Ghosts of America', 'ghostsofamerica', 'User-submitted ghost stories from ghostsofamerica.com', 'https://www.ghostsofamerica.com', 'ghostsofamerica', '{"rate_limit_ms": 1000, "states": ["ca", "tx", "fl", "oh", "pa", "ny", "il", "ga"]}', true)
ON CONFLICT (slug) DO UPDATE SET adapter_type = 'ghostsofamerica', scrape_config = EXCLUDED.scrape_config;

-- Add reddit data source
INSERT INTO public.data_sources (name, slug, description, url, adapter_type, scrape_config, is_active)
VALUES ('Reddit Paranormal', 'reddit', 'Paranormal experiences from Reddit communities', 'https://reddit.com', 'reddit', '{"rate_limit_ms": 2000, "subreddits": ["Paranormal", "UFOs", "Ghosts", "Thetruthishere", "cryptids", "HighStrangeness"]}', true)
ON CONFLICT (slug) DO UPDATE SET adapter_type = 'reddit', scrape_config = EXCLUDED.scrape_config;

-- Add wikipedia data source
INSERT INTO public.data_sources (name, slug, description, url, adapter_type, scrape_config, is_active)
VALUES ('Wikipedia Lists', 'wikipedia', 'Structured paranormal data from Wikipedia', 'https://en.wikipedia.org', 'wikipedia', '{"rate_limit_ms": 1000, "pages": ["List_of_reported_UFO_sightings", "List_of_reportedly_haunted_locations_in_the_United_States", "List_of_cryptids"]}', true)
ON CONFLICT (slug) DO UPDATE SET adapter_type = 'wikipedia', scrape_config = EXCLUDED.scrape_config;
