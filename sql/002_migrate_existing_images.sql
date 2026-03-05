-- ============================================
-- ParaDocs: Migrate existing image mappings to phenomena_media
-- Run in Supabase SQL Editor AFTER 001_create_phenomena_media.sql
-- ============================================

-- Temporarily disable triggers that cause cascade issues during bulk insert
ALTER TABLE phenomena_media DISABLE TRIGGER trg_single_profile_image;
ALTER TABLE phenomena_media DISABLE TRIGGER trg_sync_profile_image;

-- Migrate phenomena that already have a primary_image_url
INSERT INTO phenomena_media (
  phenomenon_id,
  media_type,
  original_url,
  stored_url,
  caption,
  source,
  license,
  is_profile,
  status,
  ai_confidence,
  tags
)
SELECT
  p.id,
  'image',
  p.primary_image_url,
  CASE
    WHEN p.primary_image_url LIKE '%supabase%' THEN p.primary_image_url
    ELSE NULL
  END,
  p.name || ' - Primary image',
  CASE
    WHEN p.primary_image_url LIKE '%wikimedia%' THEN 'Wikimedia Commons'
    WHEN p.primary_image_url LIKE '%supabase%' THEN 'Wikimedia Commons (self-hosted)'
    ELSE 'External'
  END,
  'Public Domain',
  true,
  'approved',
  0.5,
  ARRAY['legacy', 'migrated']
FROM phenomena p
WHERE p.primary_image_url IS NOT NULL
  AND p.primary_image_url != ''
  AND p.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM phenomena_media pm
    WHERE pm.phenomenon_id = p.id AND pm.is_profile = true
  );

-- Re-enable triggers
ALTER TABLE phenomena_media ENABLE TRIGGER trg_single_profile_image;
ALTER TABLE phenomena_media ENABLE TRIGGER trg_sync_profile_image;

-- Report how many were migrated
SELECT 'Migrated ' || COUNT(*) || ' existing profile images' AS result
FROM phenomena_media
WHERE 'migrated' = ANY(tags);
