-- Migration: Beta Signups Table
-- Stores beta access signups from the landing page

CREATE TABLE IF NOT EXISTS beta_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  interests TEXT[] NOT NULL DEFAULT '{}',
  source TEXT DEFAULT 'beta-access-page',
  signed_up_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Track if they converted to a full account
  converted_to_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ
);

-- Index for quick email lookups
CREATE INDEX IF NOT EXISTS idx_beta_signups_email ON beta_signups(email);

-- Index for analytics by source
CREATE INDEX IF NOT EXISTS idx_beta_signups_source ON beta_signups(source);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_beta_signups_signed_up_at ON beta_signups(signed_up_at);

-- RLS: Only service role can access (no public access)
ALTER TABLE beta_signups ENABLE ROW LEVEL SECURITY;

-- No public policies - only service role key can read/write
-- This keeps signup data private

COMMENT ON TABLE beta_signups IS 'Stores beta access signups from landing pages';
COMMENT ON COLUMN beta_signups.interests IS 'Array of interest categories selected during signup';
COMMENT ON COLUMN beta_signups.source IS 'Which landing page or campaign the signup came from';
COMMENT ON COLUMN beta_signups.converted_to_user_id IS 'Links to profiles if they create an account';
