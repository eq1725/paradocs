-- ============================================================================
-- Case Grouping & Report Linking
-- Adds case_group column to reports and creates report_links table
-- Run in Supabase SQL Editor
-- ============================================================================

-- 1. Add case_group column to reports
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS case_group TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_case_group ON public.reports(case_group) WHERE case_group IS NOT NULL;

-- 2. Create report_links table for explicit typed relationships
CREATE TABLE IF NOT EXISTS public.report_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  target_report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN (
    'witness_account',    -- First-hand witness report for a case
    'related_case',       -- Related but separate cases
    'follow_up',          -- Update or follow-up to a report
    'source_material',    -- Original source document
    'debunk'              -- Report that challenges or explains another
  )),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_self_link CHECK (source_report_id != target_report_id)
);

-- Indexes for bidirectional queries
CREATE INDEX IF NOT EXISTS idx_report_links_source ON public.report_links(source_report_id);
CREATE INDEX IF NOT EXISTS idx_report_links_target ON public.report_links(target_report_id);
CREATE INDEX IF NOT EXISTS idx_report_links_type ON public.report_links(link_type);

-- 3. RLS policies
ALTER TABLE public.report_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view report links"
  ON public.report_links FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create report links"
  ON public.report_links FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete own links"
  ON public.report_links FOR DELETE
  USING (auth.role() = 'authenticated');
