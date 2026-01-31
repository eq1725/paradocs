-- Ingestion Logs Migration
-- Adds detailed logging for admin panel activity feed

-- ============================================
-- INGESTION LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.ingestion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES data_sources(id) ON DELETE CASCADE,
  job_id UUID REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'success')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_created ON public.ingestion_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_source ON public.ingestion_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_level ON public.ingestion_logs(level);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_job ON public.ingestion_logs(job_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.ingestion_logs ENABLE ROW LEVEL SECURITY;

-- Logs are viewable by everyone (read-only)
CREATE POLICY "Ingestion logs are viewable by everyone"
ON public.ingestion_logs FOR SELECT USING (true);

-- Only service role can modify logs
CREATE POLICY "Only service role can modify ingestion_logs"
ON public.ingestion_logs FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.ingestion_logs IS 'Detailed activity logs for ingestion operations';
COMMENT ON COLUMN public.ingestion_logs.level IS 'Log level: info, warning, error, success';
COMMENT ON COLUMN public.ingestion_logs.metadata IS 'Additional context data (counts, error details, etc.)';

-- ============================================
-- ADD QUALITY SCORE TO REPORTS IF NOT EXISTS
-- ============================================

ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_reports_quality_score ON public.reports(quality_score);
