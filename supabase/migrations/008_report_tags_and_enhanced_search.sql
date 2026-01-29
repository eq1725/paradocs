-- ============================================
-- REPORT TAGS AND ENHANCED SEARCH
-- Enables multi-tagging for cross-disciplinary reports
-- ============================================

-- Step 1: Create report_tags junction table for many-to-many relationship
-- This allows reports to be tagged with multiple phenomenon types
CREATE TABLE IF NOT EXISTS public.report_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  phenomenon_type_id UUID NOT NULL REFERENCES public.phenomenon_types(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,  -- Mark the primary/main phenomenon type
  relevance_score DECIMAL(3,2) DEFAULT 1.00,  -- How relevant this tag is (0.00-1.00)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure no duplicate tags for same report
  UNIQUE(report_id, phenomenon_type_id)
);

-- Step 2: Create indexes for efficient querying
CREATE INDEX idx_report_tags_report_id ON public.report_tags(report_id);
CREATE INDEX idx_report_tags_phenomenon_type_id ON public.report_tags(phenomenon_type_id);
CREATE INDEX idx_report_tags_is_primary ON public.report_tags(is_primary) WHERE is_primary = true;

-- Step 3: Add related_phenomena field to reports for quick cross-reference
-- This stores category slugs for fast filtering without joins
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS related_categories TEXT[] DEFAULT '{}';

-- Step 4: Create index for array searching
CREATE INDEX IF NOT EXISTS idx_reports_related_categories ON public.reports USING GIN (related_categories);

-- Step 5: Enable Row Level Security on report_tags
ALTER TABLE public.report_tags ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read tags
CREATE POLICY "Anyone can view report tags"
  ON public.report_tags FOR SELECT
  USING (true);

-- Policy: Users can add tags to their own reports
CREATE POLICY "Users can add tags to own reports"
  ON public.report_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE id = report_id AND user_id = auth.uid()
    )
  );

-- Policy: Users can update tags on their own reports
CREATE POLICY "Users can update tags on own reports"
  ON public.report_tags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE id = report_id AND user_id = auth.uid()
    )
  );

-- Policy: Users can delete tags from their own reports
CREATE POLICY "Users can delete tags from own reports"
  ON public.report_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE id = report_id AND user_id = auth.uid()
    )
  );

-- Step 6: Create a view for easy querying of reports with their tags
CREATE OR REPLACE VIEW public.reports_with_tags AS
SELECT
  r.*,
  COALESCE(
    json_agg(
      json_build_object(
        'id', pt.id,
        'name', pt.name,
        'slug', pt.slug,
        'category', pt.category,
        'icon', pt.icon,
        'is_primary', rt.is_primary,
        'relevance_score', rt.relevance_score
      )
    ) FILTER (WHERE pt.id IS NOT NULL),
    '[]'::json
  ) as tags,
  COALESCE(
    array_agg(DISTINCT pt.category) FILTER (WHERE pt.category IS NOT NULL),
    '{}'::phenomenon_category[]
  ) as tag_categories
FROM public.reports r
LEFT JOIN public.report_tags rt ON r.id = rt.report_id
LEFT JOIN public.phenomenon_types pt ON rt.phenomenon_type_id = pt.id
GROUP BY r.id;

-- Step 7: Create function to get related reports (cross-disciplinary)
CREATE OR REPLACE FUNCTION public.get_related_reports(
  p_report_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  category phenomenon_category,
  similarity_score DECIMAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH source_tags AS (
    SELECT phenomenon_type_id, is_primary
    FROM public.report_tags
    WHERE report_id = p_report_id
  ),
  source_categories AS (
    SELECT DISTINCT pt.category
    FROM source_tags st
    JOIN public.phenomenon_types pt ON st.phenomenon_type_id = pt.id
  )
  SELECT DISTINCT
    r.id,
    r.title,
    r.slug,
    r.category,
    -- Calculate similarity based on shared tags and categories
    (
      COUNT(DISTINCT CASE WHEN rt.phenomenon_type_id IN (SELECT phenomenon_type_id FROM source_tags) THEN rt.phenomenon_type_id END)::DECIMAL * 2 +
      CASE WHEN r.category IN (SELECT category FROM source_categories) THEN 1 ELSE 0 END
    ) / (COUNT(DISTINCT rt.phenomenon_type_id) + 1)::DECIMAL as similarity_score
  FROM public.reports r
  LEFT JOIN public.report_tags rt ON r.id = rt.report_id
  WHERE r.id != p_report_id
    AND r.status = 'approved'
    AND (
      -- Has at least one matching tag
      rt.phenomenon_type_id IN (SELECT phenomenon_type_id FROM source_tags)
      -- Or same primary category
      OR r.category IN (SELECT category FROM source_categories)
    )
  GROUP BY r.id, r.title, r.slug, r.category
  ORDER BY similarity_score DESC
  LIMIT p_limit;
END;
$$;

-- Step 8: Create function to search reports with faceted filtering
CREATE OR REPLACE FUNCTION public.search_reports_advanced(
  p_query TEXT DEFAULT NULL,
  p_categories phenomenon_category[] DEFAULT NULL,
  p_phenomenon_type_ids UUID[] DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_has_evidence BOOLEAN DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  summary TEXT,
  category phenomenon_category,
  location_name TEXT,
  event_date DATE,
  credibility credibility_level,
  tags JSON,
  relevance_rank REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.slug,
    r.summary,
    r.category,
    r.location_name,
    r.event_date,
    r.credibility,
    COALESCE(
      json_agg(
        json_build_object(
          'id', pt.id,
          'name', pt.name,
          'slug', pt.slug,
          'category', pt.category,
          'icon', pt.icon
        )
      ) FILTER (WHERE pt.id IS NOT NULL),
      '[]'::json
    ) as tags,
    CASE
      WHEN p_query IS NOT NULL THEN ts_rank(r.search_vector, websearch_to_tsquery('english', p_query))
      ELSE 1.0
    END as relevance_rank
  FROM public.reports r
  LEFT JOIN public.report_tags rt ON r.id = rt.report_id
  LEFT JOIN public.phenomenon_types pt ON rt.phenomenon_type_id = pt.id
  WHERE r.status = 'approved'
    -- Text search
    AND (p_query IS NULL OR r.search_vector @@ websearch_to_tsquery('english', p_query))
    -- Category filter (supports multiple)
    AND (p_categories IS NULL OR r.category = ANY(p_categories))
    -- Phenomenon type filter (supports multiple)
    AND (p_phenomenon_type_ids IS NULL OR rt.phenomenon_type_id = ANY(p_phenomenon_type_ids))
    -- Country filter
    AND (p_country IS NULL OR r.country = p_country)
    -- Date range
    AND (p_date_from IS NULL OR r.event_date >= p_date_from)
    AND (p_date_to IS NULL OR r.event_date <= p_date_to)
    -- Evidence filter
    AND (p_has_evidence IS NULL OR (p_has_evidence = true AND (r.has_physical_evidence = true OR r.has_photo_video = true)))
  GROUP BY r.id
  ORDER BY
    CASE WHEN p_query IS NOT NULL THEN ts_rank(r.search_vector, websearch_to_tsquery('english', p_query)) ELSE 0 END DESC,
    r.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Step 9: Create function to get phenomenon type hierarchy
CREATE OR REPLACE FUNCTION public.get_phenomenon_types_by_category()
RETURNS TABLE (
  category phenomenon_category,
  category_label TEXT,
  types JSON
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pt.category,
    CASE pt.category
      WHEN 'ufos_aliens' THEN 'UFOs & Aliens/NHIs'
      WHEN 'cryptids' THEN 'Cryptids'
      WHEN 'ghosts_hauntings' THEN 'Ghosts & Hauntings'
      WHEN 'psychic_phenomena' THEN 'Psychic Phenomena (ESP)'
      WHEN 'consciousness_practices' THEN 'Consciousness Practices'
      WHEN 'psychological_experiences' THEN 'Psychological Experiences'
      WHEN 'biological_factors' THEN 'Biological Factors'
      WHEN 'perception_sensory' THEN 'Perception & Sensory'
      WHEN 'religion_mythology' THEN 'Religion & Mythology'
      WHEN 'esoteric_practices' THEN 'Esoteric Practices'
      WHEN 'combination' THEN 'Combination'
    END as category_label,
    json_agg(
      json_build_object(
        'id', pt.id,
        'name', pt.name,
        'slug', pt.slug,
        'description', pt.description,
        'icon', pt.icon
      ) ORDER BY pt.name
    ) as types
  FROM public.phenomenon_types pt
  GROUP BY pt.category
  ORDER BY
    CASE pt.category
      WHEN 'ufos_aliens' THEN 1
      WHEN 'cryptids' THEN 2
      WHEN 'ghosts_hauntings' THEN 3
      WHEN 'psychic_phenomena' THEN 4
      WHEN 'consciousness_practices' THEN 5
      WHEN 'psychological_experiences' THEN 6
      WHEN 'biological_factors' THEN 7
      WHEN 'perception_sensory' THEN 8
      WHEN 'religion_mythology' THEN 9
      WHEN 'esoteric_practices' THEN 10
      WHEN 'combination' THEN 11
    END;
END;
$$;

-- Step 10: Migrate existing phenomenon_type_id to report_tags
INSERT INTO public.report_tags (report_id, phenomenon_type_id, is_primary)
SELECT id, phenomenon_type_id, true
FROM public.reports
WHERE phenomenon_type_id IS NOT NULL
ON CONFLICT (report_id, phenomenon_type_id) DO NOTHING;
