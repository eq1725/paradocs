-- ============================================================================
-- Research Hub / Constellation V2 — Full Schema Migration
-- Creates: constellation_artifacts, constellation_case_files,
--          constellation_case_file_artifacts, constellation_connections,
--          constellation_ai_insights, constellation_theories,
--          constellation_external_url_signals
-- ============================================================================

-- 1. constellation_artifacts
-- The fundamental unit: any piece of evidence (Paradocs report or external URL)
CREATE TABLE IF NOT EXISTS constellation_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Source identification
  source_type TEXT NOT NULL CHECK (source_type IN (
    'paradocs_report', 'youtube', 'reddit', 'tiktok',
    'instagram', 'podcast', 'news', 'twitter', 'archive',
    'vimeo', 'rumble', 'substack', 'medium', 'wikipedia',
    'google_docs', 'imgur', 'flickr', 'github', 'facebook',
    'twitch', 'mufon', 'nuforc', 'blackvault', 'coasttocoast',
    'website', 'other'
  )),
  report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
  external_url TEXT,

  -- Display metadata
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  source_platform TEXT,

  -- Content metadata
  extracted_date DATE,
  extracted_location TEXT,
  coordinates GEOGRAPHY(POINT, 4326),

  -- User input
  user_note TEXT,
  verdict TEXT CHECK (verdict IN ('compelling', 'inconclusive', 'skeptical', 'needs_info')),
  tags TEXT[] DEFAULT '{}',

  -- Platform-specific metadata
  metadata_json JSONB DEFAULT '{}',

  -- Flywheel tracking
  external_url_hash TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_report UNIQUE (user_id, report_id),
  CONSTRAINT source_type_check CHECK (
    (source_type = 'paradocs_report' AND report_id IS NOT NULL) OR
    (source_type != 'paradocs_report' AND external_url IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_artifacts_user ON constellation_artifacts(user_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_report ON constellation_artifacts(report_id) WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_url_hash ON constellation_artifacts(external_url_hash) WHERE external_url_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_tags ON constellation_artifacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_artifacts_source_type ON constellation_artifacts(source_type);
CREATE INDEX IF NOT EXISTS idx_artifacts_coordinates ON constellation_artifacts USING GIST(coordinates) WHERE coordinates IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_date ON constellation_artifacts(extracted_date) WHERE extracted_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_created ON constellation_artifacts(user_id, created_at DESC);


-- 2. constellation_case_files
-- Named investigations / collections of artifacts
CREATE TABLE IF NOT EXISTS constellation_case_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  cover_color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'star',

  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'shared')),

  -- Constellation view positioning
  position_x FLOAT,
  position_y FLOAT,

  -- Board view ordering
  sort_order INT DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_files_user ON constellation_case_files(user_id);
CREATE INDEX IF NOT EXISTS idx_case_files_visibility ON constellation_case_files(visibility) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_case_files_sort ON constellation_case_files(user_id, sort_order);


-- 3. constellation_case_file_artifacts (junction table)
-- Many-to-many: artifacts can belong to multiple case files
CREATE TABLE IF NOT EXISTS constellation_case_file_artifacts (
  case_file_id UUID NOT NULL REFERENCES constellation_case_files(id) ON DELETE CASCADE,
  artifact_id UUID NOT NULL REFERENCES constellation_artifacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sort_order INT DEFAULT 0,

  PRIMARY KEY (case_file_id, artifact_id)
);

CREATE INDEX IF NOT EXISTS idx_cfa_artifact ON constellation_case_file_artifacts(artifact_id);


-- 4. constellation_connections
-- User-drawn or AI-suggested relationships between artifacts
CREATE TABLE IF NOT EXISTS constellation_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  artifact_a_id UUID NOT NULL REFERENCES constellation_artifacts(id) ON DELETE CASCADE,
  artifact_b_id UUID NOT NULL REFERENCES constellation_artifacts(id) ON DELETE CASCADE,

  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'same_witness', 'same_location', 'same_timeframe',
    'contradicts', 'corroborates', 'related', 'custom'
  )),
  annotation TEXT,

  ai_suggested BOOLEAN DEFAULT false,
  ai_confidence FLOAT,
  strength FLOAT DEFAULT 0.5,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_connection UNIQUE (user_id, artifact_a_id, artifact_b_id),
  CONSTRAINT no_self_connection CHECK (artifact_a_id != artifact_b_id)
);

CREATE INDEX IF NOT EXISTS idx_connections_user ON constellation_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_connections_artifact_a ON constellation_connections(artifact_a_id);
CREATE INDEX IF NOT EXISTS idx_connections_artifact_b ON constellation_connections(artifact_b_id);


-- 5. constellation_ai_insights
-- Proactive AI-generated observations about the user's research
CREATE TABLE IF NOT EXISTS constellation_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  scope_type TEXT NOT NULL CHECK (scope_type IN ('artifact', 'case_file', 'constellation')),
  scope_id UUID,

  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'spatial_cluster', 'temporal_pattern', 'witness_overlap',
    'source_correlation', 'cross_case_pattern', 'anomaly',
    'suggestion', 'community_convergence'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,

  primary_view TEXT CHECK (primary_view IN ('board', 'timeline', 'map', 'constellation')),

  artifact_ids UUID[] DEFAULT '{}',
  connection_ids UUID[] DEFAULT '{}',

  confidence FLOAT NOT NULL DEFAULT 0.5,

  dismissed BOOLEAN DEFAULT false,
  helpful BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_insights_user ON constellation_ai_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_insights_scope ON constellation_ai_insights(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_insights_active ON constellation_ai_insights(user_id)
  WHERE dismissed = false;
CREATE INDEX IF NOT EXISTS idx_insights_view ON constellation_ai_insights(primary_view)
  WHERE dismissed = false;


-- 6. constellation_theories
-- User-written theses supported by collected evidence
CREATE TABLE IF NOT EXISTS constellation_theories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  thesis TEXT NOT NULL,

  artifact_ids UUID[] DEFAULT '{}',
  connection_ids UUID[] DEFAULT '{}',
  case_file_id UUID REFERENCES constellation_case_files(id) ON DELETE SET NULL,

  is_public BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,

  upvotes INT DEFAULT 0,
  view_count INT DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_theories_user ON constellation_theories(user_id);
CREATE INDEX IF NOT EXISTS idx_theories_public ON constellation_theories(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_theories_case_file ON constellation_theories(case_file_id) WHERE case_file_id IS NOT NULL;


-- 7. constellation_external_url_signals (Flywheel)
-- Tracks aggregated saves across users to feed ingestion pipeline
CREATE TABLE IF NOT EXISTS constellation_external_url_signals (
  url_hash TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,

  save_count INT DEFAULT 1,
  first_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  ingestion_status TEXT DEFAULT 'pending' CHECK (ingestion_status IN (
    'pending', 'queued', 'ingested', 'rejected'
  )),
  ingested_report_id UUID REFERENCES reports(id),

  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_url_signals_count ON constellation_external_url_signals(save_count DESC);
CREATE INDEX IF NOT EXISTS idx_url_signals_status ON constellation_external_url_signals(ingestion_status);


-- ============================================================================
-- Row-Level Security Policies
-- ============================================================================

ALTER TABLE constellation_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_case_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_case_file_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_theories ENABLE ROW LEVEL SECURITY;

-- Artifacts: users see only their own
CREATE POLICY artifacts_select ON constellation_artifacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY artifacts_insert ON constellation_artifacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY artifacts_update ON constellation_artifacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY artifacts_delete ON constellation_artifacts FOR DELETE USING (auth.uid() = user_id);

-- Case files: own + public from others
CREATE POLICY case_files_select_own ON constellation_case_files FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY case_files_select_public ON constellation_case_files FOR SELECT USING (visibility = 'public');
CREATE POLICY case_files_insert ON constellation_case_files FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY case_files_update ON constellation_case_files FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY case_files_delete ON constellation_case_files FOR DELETE USING (auth.uid() = user_id);

-- Junction: access follows artifact ownership
CREATE POLICY cfa_select ON constellation_case_file_artifacts FOR SELECT USING (
  EXISTS (SELECT 1 FROM constellation_artifacts WHERE id = artifact_id AND user_id = auth.uid())
);
CREATE POLICY cfa_insert ON constellation_case_file_artifacts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM constellation_artifacts WHERE id = artifact_id AND user_id = auth.uid())
);
CREATE POLICY cfa_delete ON constellation_case_file_artifacts FOR DELETE USING (
  EXISTS (SELECT 1 FROM constellation_artifacts WHERE id = artifact_id AND user_id = auth.uid())
);

-- Connections: own only
CREATE POLICY connections_select ON constellation_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY connections_insert ON constellation_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY connections_update ON constellation_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY connections_delete ON constellation_connections FOR DELETE USING (auth.uid() = user_id);

-- AI insights: own only (insert/delete via service role)
CREATE POLICY insights_select ON constellation_ai_insights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY insights_update ON constellation_ai_insights FOR UPDATE USING (auth.uid() = user_id);

-- Theories: own + public from others
CREATE POLICY theories_select_own ON constellation_theories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY theories_select_public ON constellation_theories FOR SELECT USING (is_public = true);
CREATE POLICY theories_insert ON constellation_theories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY theories_update ON constellation_theories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY theories_delete ON constellation_theories FOR DELETE USING (auth.uid() = user_id);


-- ============================================================================
-- Migration helper: move existing constellation_entries to new artifacts table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'constellation_entries') THEN
    INSERT INTO constellation_artifacts (user_id, source_type, report_id, title, user_note, verdict, tags, created_at, updated_at)
    SELECT
      ce.user_id,
      'paradocs_report',
      ce.report_id,
      COALESCE(r.title, 'Untitled Report'),
      ce.note,
      ce.verdict,
      ce.tags,
      ce.created_at,
      ce.updated_at
    FROM constellation_entries ce
    LEFT JOIN reports r ON r.id = ce.report_id
    ON CONFLICT (user_id, report_id) DO NOTHING;
  END IF;
END $$;
