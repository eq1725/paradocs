-- ParaDocs Database Schema
-- The world's largest database of paranormal phenomena

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE phenomenon_category AS ENUM (
  'ufo_uap',
  'cryptid',
  'ghost_haunting',
  'unexplained_event',
  'psychic_paranormal',
  'mystery_location',
  'other'
);

CREATE TYPE credibility_level AS ENUM (
  'unverified',
  'low',
  'medium',
  'high',
  'confirmed'
);

CREATE TYPE report_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'flagged',
  'archived'
);

CREATE TYPE user_role AS ENUM (
  'user',
  'contributor',
  'moderator',
  'admin'
);

-- ============================================
-- USERS TABLE (extends Supabase auth.users)
-- ============================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  role user_role DEFAULT 'user',
  reputation_score INTEGER DEFAULT 0,
  reports_submitted INTEGER DEFAULT 0,
  reports_approved INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PHENOMENON TYPES (taxonomy)
-- ============================================

CREATE TABLE public.phenomenon_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category phenomenon_category NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  parent_id UUID REFERENCES public.phenomenon_types(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed phenomenon types
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
-- UFO/UAP
('ufo_uap', 'UFO Sighting', 'ufo-sighting', 'Unidentified flying object observation', '🛸'),
('ufo_uap', 'Close Encounter', 'close-encounter', 'Close proximity UFO/entity encounter', '👽'),
('ufo_uap', 'Abduction', 'abduction', 'Reported alien abduction experience', '🌌'),
('ufo_uap', 'USO (Underwater)', 'uso', 'Unidentified submerged object', '🌊'),
-- Cryptids
('cryptid', 'Bigfoot/Sasquatch', 'bigfoot', 'Large bipedal ape-like creature', '🦶'),
('cryptid', 'Lake Monster', 'lake-monster', 'Large aquatic cryptid (Nessie, etc.)', '🐉'),
('cryptid', 'Mothman', 'mothman', 'Winged humanoid creature', '🦇'),
('cryptid', 'Chupacabra', 'chupacabra', 'Livestock-attacking cryptid', '🐐'),
('cryptid', 'Other Cryptid', 'other-cryptid', 'Other unidentified creature', '❓'),
-- Ghosts/Hauntings
('ghost_haunting', 'Apparition', 'apparition', 'Visual ghost sighting', '👻'),
('ghost_haunting', 'Poltergeist', 'poltergeist', 'Physical disturbance activity', '🪑'),
('ghost_haunting', 'EVP/Audio', 'evp', 'Electronic voice phenomenon', '🎙️'),
('ghost_haunting', 'Haunted Location', 'haunted-location', 'Location with recurring activity', '🏚️'),
-- Unexplained Events
('unexplained_event', 'Time Slip', 'time-slip', 'Temporal anomaly experience', '⏰'),
('unexplained_event', 'Disappearance', 'disappearance', 'Mysterious vanishing', '🔍'),
('unexplained_event', 'Spontaneous Combustion', 'spontaneous-combustion', 'Unexplained fire phenomenon', '🔥'),
('unexplained_event', 'Crop Circle', 'crop-circle', 'Geometric field formations', '🌾'),
-- Psychic/Paranormal
('psychic_paranormal', 'Precognition', 'precognition', 'Future sight experience', '🔮'),
('psychic_paranormal', 'Telepathy', 'telepathy', 'Mind-to-mind communication', '🧠'),
('psychic_paranormal', 'Out of Body', 'obe', 'Out of body experience', '✨'),
-- Mystery Locations
('mystery_location', 'Bermuda Triangle', 'bermuda-triangle', 'Atlantic anomaly zone', '🔺'),
('mystery_location', 'Skinwalker Ranch', 'skinwalker-ranch', 'Utah paranormal hotspot', '🏜️'),
('mystery_location', 'Ley Line', 'ley-line', 'Alleged energy line', '📍');

-- ============================================
-- MAIN REPORTS TABLE
-- ============================================

CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Core fields
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Classification
  phenomenon_type_id UUID REFERENCES public.phenomenon_types(id),
  category phenomenon_category NOT NULL,
  tags TEXT[] DEFAULT '{}',

  -- Location
  location_name TEXT,
  location_description TEXT,
  country TEXT,
  state_province TEXT,
  city TEXT,
  coordinates GEOGRAPHY(POINT, 4326),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),

  -- Time
  event_date DATE,
  event_time TIME,
  event_date_approximate BOOLEAN DEFAULT FALSE,
  event_duration_minutes INTEGER,

  -- Credibility & Evidence
  credibility credibility_level DEFAULT 'unverified',
  witness_count INTEGER DEFAULT 1,
  has_physical_evidence BOOLEAN DEFAULT FALSE,
  has_photo_video BOOLEAN DEFAULT FALSE,
  has_official_report BOOLEAN DEFAULT FALSE,
  evidence_summary TEXT,

  -- Source
  source_type TEXT, -- 'user_submission', 'nuforc', 'bfro', 'historical', etc.
  source_url TEXT,
  source_reference TEXT,
  original_report_id TEXT, -- ID from original source if imported

  -- Submitter
  submitted_by UUID REFERENCES public.profiles(id),
  anonymous_submission BOOLEAN DEFAULT FALSE,
  submitter_was_witness BOOLEAN DEFAULT FALSE,

  -- Status & Moderation
  status report_status DEFAULT 'pending',
  moderated_by UUID REFERENCES public.profiles(id),
  moderation_notes TEXT,
  featured BOOLEAN DEFAULT FALSE,

  -- Engagement
  view_count INTEGER DEFAULT 0,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_reports_category ON public.reports(category);
CREATE INDEX idx_reports_phenomenon_type ON public.reports(phenomenon_type_id);
CREATE INDEX idx_reports_status ON public.reports(status);
CREATE INDEX idx_reports_event_date ON public.reports(event_date);
CREATE INDEX idx_reports_coordinates ON public.reports USING GIST(coordinates);
CREATE INDEX idx_reports_country ON public.reports(country);
CREATE INDEX idx_reports_created_at ON public.reports(created_at DESC);
CREATE INDEX idx_reports_featured ON public.reports(featured) WHERE featured = TRUE;
CREATE INDEX idx_reports_credibility ON public.reports(credibility);
CREATE INDEX idx_reports_tags ON public.reports USING GIN(tags);

-- Full-text search
ALTER TABLE public.reports ADD COLUMN search_vector tsvector;

CREATE INDEX idx_reports_search ON public.reports USING GIN(search_vector);

CREATE OR REPLACE FUNCTION update_report_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.location_name, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reports_search_vector_update
  BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION update_report_search_vector();

-- ============================================
-- MEDIA/EVIDENCE TABLE
-- ============================================

CREATE TABLE public.report_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL, -- 'image', 'video', 'audio', 'document'
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMMENTS TABLE
-- ============================================

CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  is_edited BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_report ON public.comments(report_id);
CREATE INDEX idx_comments_user ON public.comments(user_id);

-- ============================================
-- VOTES TABLE
-- ============================================

CREATE TABLE public.votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  vote_type SMALLINT NOT NULL CHECK (vote_type IN (-1, 1)), -- -1 = downvote, 1 = upvote
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_report_vote UNIQUE (user_id, report_id),
  CONSTRAINT unique_comment_vote UNIQUE (user_id, comment_id),
  CONSTRAINT vote_target_check CHECK (
    (report_id IS NOT NULL AND comment_id IS NULL) OR
    (report_id IS NULL AND comment_id IS NOT NULL)
  )
);

-- ============================================
-- SAVED/BOOKMARKED REPORTS
-- ============================================

CREATE TABLE public.saved_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_saved_report UNIQUE (user_id, report_id)
);

-- ============================================
-- DATA SOURCE TRACKING
-- ============================================

CREATE TABLE public.data_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  url TEXT,
  last_synced_at TIMESTAMPTZ,
  total_records INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.data_sources (name, slug, description, url) VALUES
('User Submissions', 'user-submissions', 'Reports submitted by ParaDocs users', NULL),
('NUFORC', 'nuforc', 'National UFO Reporting Center', 'https://nuforc.org'),
('BFRO', 'bfro', 'Bigfoot Field Researchers Organization', 'https://bfro.net'),
('MUFON', 'mufon', 'Mutual UFO Network', 'https://mufon.com'),
('Historical Archives', 'historical', 'Historical paranormal records and newspaper archives', NULL);

-- ============================================
-- ANALYTICS / STATISTICS
-- ============================================

CREATE TABLE public.daily_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stat_date DATE UNIQUE NOT NULL,
  total_reports INTEGER DEFAULT 0,
  new_reports INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  total_views INTEGER DEFAULT 0,
  reports_by_category JSONB DEFAULT '{}',
  top_locations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_media ENABLE ROW LEVEL SECURITY;

-- Profiles: viewable by all, editable by owner
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Reports: approved reports viewable by all, own reports always viewable
CREATE POLICY "Approved reports are viewable by everyone" ON public.reports
  FOR SELECT USING (status = 'approved' OR submitted_by = auth.uid());

CREATE POLICY "Authenticated users can create reports" ON public.reports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own pending reports" ON public.reports
  FOR UPDATE USING (submitted_by = auth.uid() AND status = 'pending');

-- Comments: viewable by all on approved reports
CREATE POLICY "Comments are viewable on approved reports" ON public.comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id = comments.report_id
      AND reports.status = 'approved'
    )
  );

CREATE POLICY "Authenticated users can create comments" ON public.comments
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own comments" ON public.comments
  FOR UPDATE USING (user_id = auth.uid());

-- Votes: users can manage own votes
CREATE POLICY "Users can view own votes" ON public.votes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create votes" ON public.votes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can delete own votes" ON public.votes
  FOR DELETE USING (user_id = auth.uid());

-- Saved reports: users can manage own saved
CREATE POLICY "Users can view own saved reports" ON public.saved_reports
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can save reports" ON public.saved_reports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can unsave reports" ON public.saved_reports
  FOR DELETE USING (user_id = auth.uid());

-- Media: viewable by all on approved reports
CREATE POLICY "Media is viewable on approved reports" ON public.report_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE reports.id = report_media.report_id
      AND reports.status = 'approved'
    )
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Auto-generate slug from title
CREATE OR REPLACE FUNCTION generate_unique_slug(title TEXT, table_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  new_slug TEXT;
  counter INTEGER := 0;
  slug_exists BOOLEAN;
BEGIN
  base_slug := lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  base_slug := substring(base_slug from 1 for 100);
  new_slug := base_slug;

  LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE slug = $1)', table_name)
    INTO slug_exists USING new_slug;

    IF NOT slug_exists THEN
      RETURN new_slug;
    END IF;

    counter := counter + 1;
    new_slug := base_slug || '-' || counter;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update vote counts
CREATE OR REPLACE FUNCTION update_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.report_id IS NOT NULL THEN
      IF NEW.vote_type = 1 THEN
        UPDATE public.reports SET upvotes = upvotes + 1 WHERE id = NEW.report_id;
      ELSE
        UPDATE public.reports SET downvotes = downvotes + 1 WHERE id = NEW.report_id;
      END IF;
    ELSIF NEW.comment_id IS NOT NULL THEN
      IF NEW.vote_type = 1 THEN
        UPDATE public.comments SET upvotes = upvotes + 1 WHERE id = NEW.comment_id;
      ELSE
        UPDATE public.comments SET downvotes = downvotes + 1 WHERE id = NEW.comment_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.report_id IS NOT NULL THEN
      IF OLD.vote_type = 1 THEN
        UPDATE public.reports SET upvotes = upvotes - 1 WHERE id = OLD.report_id;
      ELSE
        UPDATE public.reports SET downvotes = downvotes - 1 WHERE id = OLD.report_id;
      END IF;
    ELSIF OLD.comment_id IS NOT NULL THEN
      IF OLD.vote_type = 1 THEN
        UPDATE public.comments SET upvotes = upvotes - 1 WHERE id = OLD.comment_id;
      ELSE
        UPDATE public.comments SET downvotes = downvotes - 1 WHERE id = OLD.comment_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vote_counts_trigger
  AFTER INSERT OR DELETE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION update_vote_counts();

-- Update comment counts
CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reports SET comment_count = comment_count + 1 WHERE id = NEW.report_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reports SET comment_count = comment_count - 1 WHERE id = OLD.report_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_comment_count_trigger
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_count();

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
