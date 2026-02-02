-- Migration 020: Add AI tags to report_media for searchability
-- Phase 3: Media Ingestion

-- Add AI-generated tags column to report_media
ALTER TABLE public.report_media
ADD COLUMN IF NOT EXISTS ai_tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_description TEXT,
ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

-- Create index for tag searching
CREATE INDEX IF NOT EXISTS idx_report_media_ai_tags
ON public.report_media USING GIN (ai_tags);

-- Create index for finding unanalyzed media
CREATE INDEX IF NOT EXISTS idx_report_media_unanalyzed
ON public.report_media (ai_analyzed_at)
WHERE ai_analyzed_at IS NULL;

-- Add composite index for media with specific tags
CREATE INDEX IF NOT EXISTS idx_report_media_type_tags
ON public.report_media (media_type, ai_analyzed_at)
WHERE ai_tags != '{}';

-- Function to search reports by media tags
CREATE OR REPLACE FUNCTION search_reports_by_media_tags(
  search_tags TEXT[],
  result_limit INT DEFAULT 20
)
RETURNS TABLE (
  report_id UUID,
  report_title TEXT,
  report_slug TEXT,
  media_url TEXT,
  media_type TEXT,
  matched_tags TEXT[],
  match_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id as report_id,
    r.title as report_title,
    r.slug as report_slug,
    rm.url as media_url,
    rm.media_type,
    rm.ai_tags & search_tags as matched_tags,
    cardinality(rm.ai_tags & search_tags) as match_count
  FROM report_media rm
  JOIN reports r ON r.id = rm.report_id
  WHERE rm.ai_tags && search_tags
    AND r.status = 'approved'
  ORDER BY match_count DESC, r.created_at DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get popular media tags
CREATE OR REPLACE FUNCTION get_popular_media_tags(
  result_limit INT DEFAULT 50
)
RETURNS TABLE (
  tag TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    unnest(rm.ai_tags) as tag,
    COUNT(*) as count
  FROM report_media rm
  JOIN reports r ON r.id = rm.report_id
  WHERE r.status = 'approved'
    AND rm.ai_tags != '{}'
  GROUP BY unnest(rm.ai_tags)
  ORDER BY count DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON COLUMN public.report_media.ai_tags IS 'AI-generated descriptive tags for searchability (e.g., bright light, triangle, orb, night sky)';
COMMENT ON COLUMN public.report_media.ai_description IS 'AI-generated description of the media content';
COMMENT ON COLUMN public.report_media.ai_analyzed_at IS 'Timestamp when AI analysis was performed';
