-- ============================================
-- ParaDocs: Create phenomena_media table
-- Run in Supabase SQL Editor
-- ============================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS phenomena_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phenomenon_id UUID NOT NULL REFERENCES phenomena(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'document', 'illustration')),
  original_url TEXT NOT NULL,
  stored_url TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  source TEXT,
  source_url TEXT,
  license TEXT,
  is_profile BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ai_confidence REAL,
  ai_search_query TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  tags TEXT[],
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_phenomena_media_phenomenon ON phenomena_media(phenomenon_id);
CREATE INDEX IF NOT EXISTS idx_phenomena_media_status ON phenomena_media(status);
CREATE INDEX IF NOT EXISTS idx_phenomena_media_profile ON phenomena_media(phenomenon_id, is_profile) WHERE is_profile = true;
CREATE INDEX IF NOT EXISTS idx_phenomena_media_type ON phenomena_media(media_type);

-- 3. Enable RLS (Row Level Security)
ALTER TABLE phenomena_media ENABLE ROW LEVEL SECURITY;

-- 4. Public read access for approved media
CREATE POLICY "Public can view approved media"
  ON phenomena_media FOR SELECT
  USING (status = 'approved');

-- 5. Admin full access (service role bypasses RLS, but this covers authenticated admin)
CREATE POLICY "Admin full access to phenomena_media"
  ON phenomena_media FOR ALL
  USING (
    auth.jwt() ->> 'email' = 'williamschaseh@gmail.com'
  );

-- 6. Trigger to enforce single profile image per phenomenon
CREATE OR REPLACE FUNCTION enforce_single_profile_image()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_profile = true AND NEW.status = 'approved' THEN
    UPDATE phenomena_media
    SET is_profile = false
    WHERE phenomenon_id = NEW.phenomenon_id
      AND id != NEW.id
      AND is_profile = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_single_profile_image
  AFTER INSERT OR UPDATE ON phenomena_media
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_profile_image();

-- 7. Trigger to sync profile image to phenomena.primary_image_url
CREATE OR REPLACE FUNCTION sync_profile_to_phenomena()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_profile = true AND NEW.status = 'approved' THEN
    UPDATE phenomena
    SET primary_image_url = COALESCE(NEW.stored_url, NEW.original_url)
    WHERE id = NEW.phenomenon_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_profile_image
  AFTER INSERT OR UPDATE ON phenomena_media
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_to_phenomena();

-- 8. Verify
SELECT 'phenomena_media table created successfully' AS result;
