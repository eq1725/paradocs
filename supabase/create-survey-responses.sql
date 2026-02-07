-- Survey Responses Table
-- Run this in your Supabase SQL Editor before deploying the survey page.

CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topics TEXT[] NOT NULL,
  researcher_type TEXT NOT NULL CHECK (researcher_type IN ('casual', 'enthusiast', 'academic', 'creator')),
  open_response TEXT,
  email TEXT,
  source TEXT DEFAULT 'alpha-update-email',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by topic and researcher type
CREATE INDEX IF NOT EXISTS idx_survey_responses_researcher_type ON survey_responses(researcher_type);
CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at ON survey_responses(submitted_at DESC);

-- Enable Row Level Security
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (survey doesn't require auth)
CREATE POLICY "Allow anonymous survey submissions"
  ON survey_responses
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Only authenticated service role can read responses
CREATE POLICY "Service role can read survey responses"
  ON survey_responses
  FOR SELECT
  TO service_role
  USING (true);
