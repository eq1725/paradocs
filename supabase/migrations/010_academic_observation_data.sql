-- Academic Observation Data Schema
-- Structured data capture for journal-compliant reports
-- Migration: 010_academic_observation_data.sql

-- Create academic_observations table for structured research data
CREATE TABLE IF NOT EXISTS academic_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,

  -- Observer Information (anonymized for privacy)
  observer_experience_level VARCHAR(50), -- novice, amateur, experienced, professional
  observer_occupation_category VARCHAR(100), -- scientist, military, pilot, etc.
  observer_age_range VARCHAR(20), -- 18-25, 26-35, etc.
  observer_visual_aids TEXT[], -- glasses, binoculars, telescope, camera
  observer_physical_state VARCHAR(50), -- alert, fatigued, intoxicated, etc.
  observer_emotional_state VARCHAR(50), -- calm, excited, frightened, etc.

  -- Environmental Conditions
  weather_conditions JSONB, -- {sky: "clear", visibility: "excellent", temperature: 72, humidity: 45}
  ambient_lighting VARCHAR(50), -- bright, moderate, dim, dark
  urban_light_pollution VARCHAR(50), -- none, low, moderate, high
  observation_location_type VARCHAR(100), -- urban, suburban, rural, wilderness, at sea
  terrain_description TEXT,

  -- Object Characteristics
  object_count INTEGER,
  object_shape VARCHAR(100),
  object_color TEXT[],
  object_size_apparent VARCHAR(100), -- angular size or comparison
  object_size_estimated VARCHAR(100), -- if distance known
  object_brightness VARCHAR(50), -- dim, moderate, bright, blinding
  object_sound VARCHAR(100), -- silent, humming, roaring, etc.
  object_smell TEXT,

  -- Motion Characteristics
  motion_type VARCHAR(100), -- stationary, hovering, linear, erratic, circular
  motion_speed_apparent VARCHAR(100), -- slow, moderate, fast, instantaneous
  motion_direction VARCHAR(100), -- N, NE, E, etc. or specific degrees
  motion_altitude_apparent VARCHAR(100), -- treetop, airplane, very high
  motion_maneuvers TEXT[], -- sudden stops, right angles, acceleration

  -- Temporal Data
  observation_duration_seconds INTEGER,
  time_certainty VARCHAR(50), -- exact, approximate, estimated
  observation_start_conditions TEXT, -- what was observer doing when sighting began
  observation_end_reason TEXT, -- object disappeared, moved out of view, etc.

  -- Physical Effects
  physical_effects_observer TEXT[], -- nausea, headache, tingling, etc.
  physical_effects_environment TEXT[], -- electromagnetic interference, animal reaction
  physical_evidence_collected BOOLEAN DEFAULT FALSE,
  physical_evidence_description TEXT,

  -- Documentation
  documentation_methods TEXT[], -- notes, photos, video, audio, sketch
  documentation_timing VARCHAR(50), -- during, immediately after, hours later, days later
  other_witnesses_present BOOLEAN DEFAULT FALSE,
  other_witnesses_count INTEGER,
  other_witnesses_relationship VARCHAR(100), -- family, friends, strangers

  -- Investigator Assessment
  investigator_notes TEXT,
  data_quality_score INTEGER CHECK (data_quality_score BETWEEN 1 AND 10),
  completeness_score INTEGER CHECK (completeness_score BETWEEN 1 AND 10),

  -- Metadata
  data_collector_id UUID REFERENCES profiles(id),
  collection_method VARCHAR(50), -- self-reported, interview, questionnaire
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(report_id)
);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_academic_observations_report_id ON academic_observations(report_id);
CREATE INDEX IF NOT EXISTS idx_academic_observations_quality ON academic_observations(data_quality_score);

-- Create RLS policies
ALTER TABLE academic_observations ENABLE ROW LEVEL SECURITY;

-- Public can read academic data for approved reports
CREATE POLICY "academic_observations_public_read" ON academic_observations
  FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = academic_observations.report_id
      AND r.status = 'approved'
    )
  );

-- Service role can manage all academic data
CREATE POLICY "academic_observations_service_all" ON academic_observations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Data collectors (authenticated users with permissions) can update
CREATE POLICY "academic_observations_collector_update" ON academic_observations
  FOR UPDATE
  TO authenticated
  USING (data_collector_id = auth.uid())
  WITH CHECK (data_collector_id = auth.uid());

-- Add function to calculate completeness score automatically
CREATE OR REPLACE FUNCTION calculate_observation_completeness(obs academic_observations)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
  total_fields INTEGER := 20;
  filled_fields INTEGER := 0;
BEGIN
  -- Count non-null fields
  IF obs.observer_experience_level IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.weather_conditions IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.object_count IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.object_shape IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.object_color IS NOT NULL AND array_length(obs.object_color, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF obs.object_brightness IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.motion_type IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.motion_speed_apparent IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.observation_duration_seconds IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.time_certainty IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.observation_end_reason IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.documentation_methods IS NOT NULL AND array_length(obs.documentation_methods, 1) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF obs.documentation_timing IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.ambient_lighting IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.observation_location_type IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.object_sound IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.motion_altitude_apparent IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.physical_effects_observer IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.other_witnesses_present IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF obs.observer_physical_state IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;

  -- Calculate score (1-10)
  score := CEIL((filled_fields::FLOAT / total_fields) * 10);
  IF score < 1 THEN score := 1; END IF;
  IF score > 10 THEN score := 10; END IF;

  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update completeness score
CREATE OR REPLACE FUNCTION update_completeness_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.completeness_score := calculate_observation_completeness(NEW);
  NEW.last_updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER academic_observations_completeness
  BEFORE INSERT OR UPDATE ON academic_observations
  FOR EACH ROW
  EXECUTE FUNCTION update_completeness_score();

-- Add comments for documentation
COMMENT ON TABLE academic_observations IS 'Structured observation data for academic/journal requirements';
COMMENT ON COLUMN academic_observations.data_quality_score IS 'Investigator-assigned quality rating 1-10';
COMMENT ON COLUMN academic_observations.completeness_score IS 'Auto-calculated field completeness 1-10';
