-- ============================================
-- PROFILE SETTINGS MIGRATION
-- Adds additional profile fields for settings page
-- ============================================

-- Add new columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{
  "email_new_comments": true,
  "email_report_updates": true,
  "email_weekly_digest": false,
  "email_marketing": false
}'::jsonb;

-- Add index on location for potential location-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_location ON public.profiles(location);

-- Update RLS policy to allow users to update their own profiles
-- (This should already exist but ensuring it's correct)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Ensure users can view their own profile
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Ensure users can insert their own profile
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

COMMENT ON COLUMN public.profiles.location IS 'User-provided location (city, country, etc.)';
COMMENT ON COLUMN public.profiles.website IS 'User personal website URL';
COMMENT ON COLUMN public.profiles.notification_settings IS 'JSON object containing email notification preferences';
