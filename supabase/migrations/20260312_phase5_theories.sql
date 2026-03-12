-- Phase 5: Theories Table + RLS
-- User-written theses supported by collected evidence, with publishing support.

CREATE TABLE IF NOT EXISTS constellation_theories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  thesis TEXT NOT NULL,

  -- Supporting evidence
  artifact_ids UUID[] DEFAULT '{}',
  connection_ids UUID[] DEFAULT '{}',
  case_file_id UUID REFERENCES constellation_case_files(id) ON DELETE SET NULL,

  -- Publishing
  is_public BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,

  -- Community engagement (when public)
  upvotes INT DEFAULT 0,
  view_count INT DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_theories_user ON constellation_theories(user_id);
CREATE INDEX IF NOT EXISTS idx_theories_public ON constellation_theories(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_theories_case_file ON constellation_theories(case_file_id) WHERE case_file_id IS NOT NULL;

-- RLS
ALTER TABLE constellation_theories ENABLE ROW LEVEL SECURITY;

-- Own theories: full access
CREATE POLICY theories_select_own ON constellation_theories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY theories_select_public ON constellation_theories
  FOR SELECT USING (is_public = true);
CREATE POLICY theories_insert ON constellation_theories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY theories_update ON constellation_theories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY theories_delete ON constellation_theories
  FOR DELETE USING (auth.uid() = user_id);

-- Add researcher_bio and is_profile_public to profiles if not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_profile_public') THEN
    ALTER TABLE profiles ADD COLUMN is_profile_public BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'researcher_bio') THEN
    ALTER TABLE profiles ADD COLUMN researcher_bio TEXT;
  END IF;
END$$;
