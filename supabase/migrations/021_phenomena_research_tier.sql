-- ============================================
-- PHENOMENA RESEARCH-TIER CONTENT
-- Additional AI content fields for Pro/Enterprise users
-- ============================================

-- Add research-tier content columns to phenomena table
ALTER TABLE public.phenomena ADD COLUMN IF NOT EXISTS ai_cultural_origins TEXT;
ALTER TABLE public.phenomena ADD COLUMN IF NOT EXISTS ai_regional_variants TEXT;
ALTER TABLE public.phenomena ADD COLUMN IF NOT EXISTS ai_scientific_analysis TEXT;
ALTER TABLE public.phenomena ADD COLUMN IF NOT EXISTS ai_witness_profile TEXT;
ALTER TABLE public.phenomena ADD COLUMN IF NOT EXISTS ai_bibliography TEXT;
ALTER TABLE public.phenomena ADD COLUMN IF NOT EXISTS ai_related_phenomena TEXT;

-- Add content tier tracking
ALTER TABLE public.phenomena ADD COLUMN IF NOT EXISTS content_tier TEXT DEFAULT 'standard'
  CHECK (content_tier IN ('standard', 'research'));

-- Comments for documentation
COMMENT ON COLUMN public.phenomena.ai_cultural_origins IS 'Folklore roots, indigenous connections, cultural origins of the phenomenon';
COMMENT ON COLUMN public.phenomena.ai_regional_variants IS 'How the phenomenon differs by culture/region (e.g., Bigfoot vs Yeti vs Yowie)';
COMMENT ON COLUMN public.phenomena.ai_scientific_analysis IS 'Scientific perspectives, studies conducted, mainstream explanations';
COMMENT ON COLUMN public.phenomena.ai_witness_profile IS 'Common witness demographics, typical circumstances of encounters';
COMMENT ON COLUMN public.phenomena.ai_bibliography IS 'Key researchers, papers, books, and academic sources';
COMMENT ON COLUMN public.phenomena.ai_related_phenomena IS 'Related or similar phenomena that may be connected';
COMMENT ON COLUMN public.phenomena.content_tier IS 'Content generation tier: standard (all users) or research (Pro/Enterprise)';

-- Index for content tier filtering
CREATE INDEX IF NOT EXISTS idx_phenomena_content_tier ON public.phenomena(content_tier);
