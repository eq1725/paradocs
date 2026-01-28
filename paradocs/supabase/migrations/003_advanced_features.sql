-- Migration: Advanced Research Features
-- Description: Adds AI similarity search, hotspots, reputation, verification, and cross-reference support

-- ============================================
-- REPORT EMBEDDINGS (for similarity search)
-- ============================================
CREATE TABLE IF NOT EXISTS report_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  embedding vector(1536), -- OpenAI ada-002 embedding dimension
  embedding_model VARCHAR(50) DEFAULT 'text-embedding-ada-002',
  content_hash VARCHAR(64), -- To detect if report changed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_id)
);

-- Create index for vector similarity search (requires pgvector extension)
-- Note: Run "CREATE EXTENSION IF NOT EXISTS vector;" first if not enabled
CREATE INDEX IF NOT EXISTS idx_report_embeddings_vector ON report_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- NATURAL LANGUAGE QUERY LOG
-- ============================================
CREATE TABLE IF NOT EXISTS natural_language_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  parsed_filters JSONB, -- The interpreted search filters
  result_count INTEGER,
  execution_time_ms INTEGER,
  feedback_rating INTEGER, -- 1-5 user rating of results
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nl_queries_user ON natural_language_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_nl_queries_created ON natural_language_queries(created_at);

-- ============================================
-- COLLECTION SUMMARIES (AI-generated)
-- ============================================
CREATE TABLE IF NOT EXISTS collection_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  summary_type VARCHAR(50) DEFAULT 'overview', -- overview, patterns, timeline, geographic
  summary_text TEXT NOT NULL,
  key_findings JSONB, -- Structured findings
  report_count INTEGER, -- Reports analyzed
  tokens_used INTEGER,
  model_used VARCHAR(50),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- For cache invalidation
  UNIQUE(collection_id, summary_type)
);

-- ============================================
-- GEOGRAPHIC HOTSPOTS
-- ============================================
CREATE TABLE IF NOT EXISTS geographic_hotspots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  description TEXT,
  center_lat DECIMAL(10, 8) NOT NULL,
  center_lng DECIMAL(11, 8) NOT NULL,
  radius_km DECIMAL(10, 2) DEFAULT 50, -- Hotspot radius
  report_count INTEGER DEFAULT 0,
  intensity_score DECIMAL(5, 2), -- Calculated intensity 0-100
  primary_category VARCHAR(100), -- Most common phenomenon type
  category_breakdown JSONB, -- {"ufo": 45, "ghost": 30, ...}
  first_report_date DATE,
  last_report_date DATE,
  is_active BOOLEAN DEFAULT true, -- Has recent activity
  detection_method VARCHAR(50) DEFAULT 'clustering', -- clustering, manual, user_reported
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotspots_location ON geographic_hotspots(center_lat, center_lng);
CREATE INDEX IF NOT EXISTS idx_hotspots_intensity ON geographic_hotspots(intensity_score DESC);
CREATE INDEX IF NOT EXISTS idx_hotspots_active ON geographic_hotspots(is_active) WHERE is_active = true;

-- Junction table for hotspot-report relationships
CREATE TABLE IF NOT EXISTS hotspot_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotspot_id UUID NOT NULL REFERENCES geographic_hotspots(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  distance_km DECIMAL(10, 2), -- Distance from hotspot center
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotspot_id, report_id)
);

CREATE INDEX IF NOT EXISTS idx_hotspot_reports_hotspot ON hotspot_reports(hotspot_id);
CREATE INDEX IF NOT EXISTS idx_hotspot_reports_report ON hotspot_reports(report_id);

-- ============================================
-- EXTERNAL CORRELATIONS (cross-reference data)
-- ============================================
CREATE TABLE IF NOT EXISTS external_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  correlation_type VARCHAR(50) NOT NULL, -- weather, lunar, solar, seismic, military, astronomical
  data_source VARCHAR(100), -- API or database source
  correlation_data JSONB NOT NULL, -- The actual correlation data
  correlation_score DECIMAL(5, 2), -- How strong the correlation is 0-100
  notes TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_id, correlation_type)
);

CREATE INDEX IF NOT EXISTS idx_correlations_report ON external_correlations(report_id);
CREATE INDEX IF NOT EXISTS idx_correlations_type ON external_correlations(correlation_type);

-- Reference data for lunar phases (pre-populated)
CREATE TABLE IF NOT EXISTS lunar_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_date DATE NOT NULL UNIQUE,
  phase_name VARCHAR(50) NOT NULL, -- new_moon, waxing_crescent, first_quarter, waxing_gibbous, full_moon, waning_gibbous, last_quarter, waning_crescent
  illumination DECIMAL(5, 2), -- 0-100 percentage
  phase_angle DECIMAL(6, 2)
);

CREATE INDEX IF NOT EXISTS idx_lunar_phases_date ON lunar_phases(phase_date);

-- ============================================
-- WITNESS REPUTATION SYSTEM
-- ============================================
CREATE TABLE IF NOT EXISTS witness_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_id VARCHAR(64), -- For anonymous witnesses
  reputation_score DECIMAL(5, 2) DEFAULT 50, -- 0-100 scale, starts at 50
  total_reports INTEGER DEFAULT 0,
  verified_reports INTEGER DEFAULT 0,
  disputed_reports INTEGER DEFAULT 0,
  reports_with_evidence INTEGER DEFAULT 0,
  avg_detail_score DECIMAL(5, 2), -- How detailed their reports are
  consistency_score DECIMAL(5, 2), -- Consistency across reports
  credibility_tier VARCHAR(20) DEFAULT 'new', -- new, emerging, established, trusted, expert
  badges JSONB DEFAULT '[]', -- Achievement badges
  first_report_at TIMESTAMPTZ,
  last_report_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(anonymous_id)
);

CREATE INDEX IF NOT EXISTS idx_witness_profiles_user ON witness_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_witness_profiles_reputation ON witness_profiles(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_witness_profiles_tier ON witness_profiles(credibility_tier);

-- Reputation events log
CREATE TABLE IF NOT EXISTS reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  witness_id UUID NOT NULL REFERENCES witness_profiles(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- report_submitted, report_verified, report_disputed, evidence_added, expert_endorsement, badge_earned
  points_change DECIMAL(5, 2) NOT NULL, -- Can be positive or negative
  reason TEXT,
  related_report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
  related_verification_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reputation_events_witness ON reputation_events(witness_id);
CREATE INDEX IF NOT EXISTS idx_reputation_events_type ON reputation_events(event_type);

-- ============================================
-- EXPERT VERIFICATION NETWORK
-- ============================================
CREATE TABLE IF NOT EXISTS verification_experts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(255) NOT NULL,
  bio TEXT,
  expertise_areas TEXT[], -- Array of expertise: ['ufo', 'ghost', 'cryptid', 'photo_analysis', 'witness_interview']
  credentials TEXT,
  organization VARCHAR(255),
  website_url VARCHAR(500),
  verification_count INTEGER DEFAULT 0,
  approval_rate DECIMAL(5, 2), -- Percentage of verifications approved by community
  is_verified BOOLEAN DEFAULT false, -- Admin-verified expert status
  is_active BOOLEAN DEFAULT true,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_experts_verified ON verification_experts(is_verified) WHERE is_verified = true;
CREATE INDEX IF NOT EXISTS idx_experts_expertise ON verification_experts USING GIN(expertise_areas);

-- Expert verifications on reports
CREATE TABLE IF NOT EXISTS expert_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  expert_id UUID NOT NULL REFERENCES verification_experts(id) ON DELETE CASCADE,
  verification_type VARCHAR(50) NOT NULL, -- location_verified, witness_interviewed, evidence_analyzed, plausibility_assessed
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, verified, inconclusive, disputed, rejected
  confidence_level INTEGER, -- 1-10
  findings TEXT,
  evidence_notes TEXT,
  methodology TEXT, -- How the verification was conducted
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_id, expert_id, verification_type)
);

CREATE INDEX IF NOT EXISTS idx_verifications_report ON expert_verifications(report_id);
CREATE INDEX IF NOT EXISTS idx_verifications_expert ON expert_verifications(expert_id);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON expert_verifications(status);

-- ============================================
-- TIMELINE EVENTS (for timeline visualization)
-- ============================================
CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- sighting, encounter, investigation, media_coverage, official_statement
  event_date DATE NOT NULL,
  event_time TIME,
  time_precision VARCHAR(20) DEFAULT 'day', -- exact, hour, day, month, year
  title VARCHAR(255) NOT NULL,
  description TEXT,
  location_name VARCHAR(255),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  category VARCHAR(100),
  significance_score INTEGER DEFAULT 5, -- 1-10 for filtering major events
  source_url VARCHAR(500),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline_events(event_date);
CREATE INDEX IF NOT EXISTS idx_timeline_category ON timeline_events(category);
CREATE INDEX IF NOT EXISTS idx_timeline_significance ON timeline_events(significance_score DESC);

-- ============================================
-- HOTSPOT ALERTS (user subscriptions to hotspot activity)
-- ============================================
CREATE TABLE IF NOT EXISTS hotspot_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hotspot_id UUID REFERENCES geographic_hotspots(id) ON DELETE CASCADE,
  custom_location_lat DECIMAL(10, 8), -- For custom location alerts
  custom_location_lng DECIMAL(11, 8),
  custom_radius_km DECIMAL(10, 2) DEFAULT 100,
  alert_name VARCHAR(255),
  categories TEXT[], -- Filter by categories
  min_intensity DECIMAL(5, 2), -- Minimum intensity to alert
  is_active BOOLEAN DEFAULT true,
  notification_method VARCHAR(20) DEFAULT 'email', -- email, push, both
  frequency VARCHAR(20) DEFAULT 'immediate', -- immediate, daily, weekly
  last_alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, hotspot_id)
);

CREATE INDEX IF NOT EXISTS idx_hotspot_alerts_user ON hotspot_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_hotspot_alerts_active ON hotspot_alerts(is_active) WHERE is_active = true;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE report_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE natural_language_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE geographic_hotspots ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotspot_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_correlations ENABLE ROW LEVEL SECURITY;
ALTER TABLE witness_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_experts ENABLE ROW LEVEL SECURITY;
ALTER TABLE expert_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotspot_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lunar_phases ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Report embeddings (public read for similarity search)
DROP POLICY IF EXISTS "Anyone can view report embeddings" ON report_embeddings;
CREATE POLICY "Anyone can view report embeddings" ON report_embeddings FOR SELECT USING (true);

-- NL Queries (users see own queries)
DROP POLICY IF EXISTS "Users can view own NL queries" ON natural_language_queries;
CREATE POLICY "Users can view own NL queries" ON natural_language_queries FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert NL queries" ON natural_language_queries;
CREATE POLICY "Users can insert NL queries" ON natural_language_queries FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Collection summaries (follow collection access)
DROP POLICY IF EXISTS "Users can view collection summaries" ON collection_summaries;
CREATE POLICY "Users can view collection summaries" ON collection_summaries FOR SELECT
USING (EXISTS (SELECT 1 FROM collections WHERE id = collection_id AND (user_id = auth.uid() OR is_public = true)));

-- Hotspots (public read)
DROP POLICY IF EXISTS "Anyone can view hotspots" ON geographic_hotspots;
CREATE POLICY "Anyone can view hotspots" ON geographic_hotspots FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view hotspot reports" ON hotspot_reports;
CREATE POLICY "Anyone can view hotspot reports" ON hotspot_reports FOR SELECT USING (true);

-- External correlations (public read)
DROP POLICY IF EXISTS "Anyone can view correlations" ON external_correlations;
CREATE POLICY "Anyone can view correlations" ON external_correlations FOR SELECT USING (true);

-- Witness profiles (public read, own write)
DROP POLICY IF EXISTS "Anyone can view witness profiles" ON witness_profiles;
CREATE POLICY "Anyone can view witness profiles" ON witness_profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON witness_profiles;
CREATE POLICY "Users can update own profile" ON witness_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Reputation events (users see own events)
DROP POLICY IF EXISTS "Users can view own reputation events" ON reputation_events;
CREATE POLICY "Users can view own reputation events" ON reputation_events FOR SELECT
USING (EXISTS (SELECT 1 FROM witness_profiles WHERE id = witness_id AND user_id = auth.uid()));

-- Verification experts (public read)
DROP POLICY IF EXISTS "Anyone can view experts" ON verification_experts;
CREATE POLICY "Anyone can view experts" ON verification_experts FOR SELECT USING (is_verified = true AND is_active = true);
DROP POLICY IF EXISTS "Users can manage own expert profile" ON verification_experts;
CREATE POLICY "Users can manage own expert profile" ON verification_experts FOR ALL USING (auth.uid() = user_id);

-- Expert verifications (public read)
DROP POLICY IF EXISTS "Anyone can view public verifications" ON expert_verifications;
CREATE POLICY "Anyone can view public verifications" ON expert_verifications FOR SELECT USING (is_public = true);
DROP POLICY IF EXISTS "Experts can manage own verifications" ON expert_verifications;
CREATE POLICY "Experts can manage own verifications" ON expert_verifications FOR ALL
USING (EXISTS (SELECT 1 FROM verification_experts WHERE id = expert_id AND user_id = auth.uid()));

-- Timeline events (public read)
DROP POLICY IF EXISTS "Anyone can view timeline events" ON timeline_events;
CREATE POLICY "Anyone can view timeline events" ON timeline_events FOR SELECT USING (true);

-- Hotspot alerts (users see own)
DROP POLICY IF EXISTS "Users can manage own hotspot alerts" ON hotspot_alerts;
CREATE POLICY "Users can manage own hotspot alerts" ON hotspot_alerts FOR ALL USING (auth.uid() = user_id);

-- Lunar phases (public read)
DROP POLICY IF EXISTS "Anyone can view lunar phases" ON lunar_phases;
CREATE POLICY "Anyone can view lunar phases" ON lunar_phases FOR SELECT USING (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to calculate witness credibility tier
CREATE OR REPLACE FUNCTION calculate_credibility_tier(reputation DECIMAL)
RETURNS VARCHAR(20) AS $$
BEGIN
  RETURN CASE
    WHEN reputation >= 90 THEN 'expert'
    WHEN reputation >= 75 THEN 'trusted'
    WHEN reputation >= 60 THEN 'established'
    WHEN reputation >= 40 THEN 'emerging'
    ELSE 'new'
  END;
END;
$$ LANGUAGE plpgsql;

-- Function to update witness reputation after events
CREATE OR REPLACE FUNCTION update_witness_reputation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE witness_profiles
  SET
    reputation_score = GREATEST(0, LEAST(100, reputation_score + NEW.points_change)),
    credibility_tier = calculate_credibility_tier(GREATEST(0, LEAST(100, reputation_score + NEW.points_change))),
    updated_at = NOW()
  WHERE id = NEW.witness_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for reputation updates
DROP TRIGGER IF EXISTS trigger_update_reputation ON reputation_events;
CREATE TRIGGER trigger_update_reputation
AFTER INSERT ON reputation_events
FOR EACH ROW
EXECUTE FUNCTION update_witness_reputation();

-- Function to calculate hotspot intensity
CREATE OR REPLACE FUNCTION calculate_hotspot_intensity(
  report_count INTEGER,
  days_active INTEGER,
  has_verified_reports BOOLEAN
)
RETURNS DECIMAL AS $$
DECLARE
  base_score DECIMAL;
  recency_factor DECIMAL;
  verification_bonus DECIMAL;
BEGIN
  -- Base score from report count (logarithmic scale)
  base_score := LEAST(50, LOG(report_count + 1) * 20);

  -- Recency factor (more recent = higher score)
  recency_factor := CASE
    WHEN days_active <= 30 THEN 30
    WHEN days_active <= 90 THEN 20
    WHEN days_active <= 365 THEN 10
    ELSE 5
  END;

  -- Verification bonus
  verification_bonus := CASE WHEN has_verified_reports THEN 20 ELSE 0 END;

  RETURN LEAST(100, base_score + recency_factor + verification_bonus);
END;
$$ LANGUAGE plpgsql;
