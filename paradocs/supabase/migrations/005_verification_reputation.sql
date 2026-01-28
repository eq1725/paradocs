-- Verification Requests Table
CREATE TABLE IF NOT EXISTS verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  request_type TEXT NOT NULL CHECK (request_type IN (
    'evidence_verification',
    'witness_interview',
    'location_survey',
    'expert_analysis',
    'media_authentication'
  )),
  
  evidence_description TEXT,
  supporting_links TEXT[] DEFAULT '{}',
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_review',
    'needs_more_info',
    'approved',
    'rejected'
  )),
  
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_verification_requests_report ON verification_requests(report_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_requester ON verification_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status);

-- RLS Policies
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own verification requests"
ON verification_requests FOR SELECT
USING (requester_id = auth.uid());

CREATE POLICY "Moderators can view all verification requests"
ON verification_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('moderator', 'admin')
  )
);

CREATE POLICY "Users can create verification requests"
ON verification_requests FOR INSERT
WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Moderators can update verification requests"
ON verification_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('moderator', 'admin')
  )
);

-- Reputation increment function
CREATE OR REPLACE FUNCTION increment_reputation(user_id UUID, points INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles 
  SET reputation_score = reputation_score + points,
      updated_at = NOW()
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update timestamp
CREATE OR REPLACE FUNCTION update_verification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verification_requests_updated
  BEFORE UPDATE ON verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_verification_timestamp();
