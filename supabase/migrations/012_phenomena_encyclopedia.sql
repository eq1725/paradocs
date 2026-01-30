-- ============================================
-- PHENOMENA ENCYCLOPEDIA
-- Auto-generated entries for specific named phenomena
-- (e.g., "Bigfoot", "Mothman", "The Phoenix Lights")
-- ============================================

-- Main phenomena table
CREATE TABLE public.phenomena (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  aliases TEXT[] DEFAULT '{}',  -- Alternative names (e.g., "Sasquatch" for Bigfoot)

  -- Classification
  category phenomenon_category NOT NULL,
  phenomenon_type_id UUID REFERENCES public.phenomenon_types(id),

  -- AI-Generated Content
  ai_summary TEXT,              -- Brief 1-2 sentence description
  ai_description TEXT,          -- Detailed description
  ai_history TEXT,              -- Historical background and first sightings
  ai_characteristics TEXT,      -- Physical description, behavior patterns
  ai_notable_sightings TEXT,    -- Famous cases summary
  ai_theories TEXT,             -- Popular explanations (scientific and folklore)
  ai_cultural_impact TEXT,      -- Media, books, cultural significance
  ai_model_used TEXT,           -- Which AI model generated the content
  ai_generated_at TIMESTAMPTZ,  -- When AI content was generated

  -- Visual
  primary_image_url TEXT,       -- Main image (AI-generated or public domain)
  image_gallery JSONB DEFAULT '[]',  -- [{url, caption, source, license}]
  icon TEXT,                    -- Emoji or icon identifier

  -- Stats (auto-updated)
  report_count INTEGER DEFAULT 0,
  first_reported_date DATE,
  last_reported_date DATE,
  primary_regions TEXT[] DEFAULT '{}',  -- Most common sighting locations

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'merged', 'archived')),
  merged_into_id UUID REFERENCES public.phenomena(id),  -- If merged into another phenomenon

  -- Source tracking
  auto_generated BOOLEAN DEFAULT TRUE,  -- Was this auto-generated from report analysis?
  confidence_score DECIMAL(3,2),  -- 0-1 confidence this is a valid distinct phenomenon
  source_report_ids UUID[] DEFAULT '{}',  -- Reports that led to this being identified

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX idx_phenomena_category ON public.phenomena(category);
CREATE INDEX idx_phenomena_slug ON public.phenomena(slug);
CREATE INDEX idx_phenomena_status ON public.phenomena(status);
CREATE INDEX idx_phenomena_report_count ON public.phenomena(report_count DESC);
CREATE INDEX idx_phenomena_name_search ON public.phenomena USING GIN(to_tsvector('english', name || ' ' || COALESCE(ai_summary, '')));

-- Junction table: reports can be tagged with multiple phenomena
CREATE TABLE public.report_phenomena (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  phenomenon_id UUID NOT NULL REFERENCES public.phenomena(id) ON DELETE CASCADE,

  -- Tagging metadata
  confidence DECIMAL(3,2) DEFAULT 0.5,  -- 0-1 how confident the match is
  tagged_by TEXT DEFAULT 'auto',  -- 'auto' (AI), 'user', 'moderator'
  tagged_by_user_id UUID REFERENCES public.profiles(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(report_id, phenomenon_id)
);

CREATE INDEX idx_report_phenomena_report ON public.report_phenomena(report_id);
CREATE INDEX idx_report_phenomena_phenomenon ON public.report_phenomena(phenomenon_id);

-- Seed with well-known phenomena
INSERT INTO public.phenomena (name, slug, aliases, category, icon, ai_summary, status, auto_generated) VALUES
-- Cryptids
('Bigfoot', 'bigfoot', ARRAY['Sasquatch', 'Skunk Ape', 'Grassman', 'Yeti'], 'cryptids', '🦶',
 'A large, hairy, ape-like creature reported in forests across North America, known for leaving large footprints.',
 'active', false),
('Mothman', 'mothman', ARRAY['The Mothman'], 'cryptids', '🦇',
 'A winged humanoid creature first reported in Point Pleasant, West Virginia in 1966-67, often associated with disaster prophecies.',
 'active', false),
('Loch Ness Monster', 'loch-ness-monster', ARRAY['Nessie', 'Loch Ness Creature'], 'cryptids', '🐉',
 'A large aquatic creature reportedly inhabiting Loch Ness in Scotland, often described as having a long neck and humps.',
 'active', false),
('Chupacabra', 'chupacabra', ARRAY['Goat Sucker', 'El Chupacabra'], 'cryptids', '🐐',
 'A creature known for allegedly attacking and drinking the blood of livestock, primarily reported in Puerto Rico and Latin America.',
 'active', false),
('Jersey Devil', 'jersey-devil', ARRAY['Leeds Devil'], 'cryptids', '😈',
 'A legendary creature said to inhabit the Pine Barrens of New Jersey, described as a kangaroo-like creature with bat wings.',
 'active', false),
('Thunderbird', 'thunderbird', ARRAY['Giant Bird'], 'cryptids', '🦅',
 'An enormous bird-like creature from Native American legend, with modern sightings of pterodactyl-like flying creatures.',
 'active', false),
('Wendigo', 'wendigo', ARRAY['Windigo', 'Wetiko'], 'cryptids', '❄️',
 'A malevolent, cannibalistic spirit from Algonquian folklore, associated with winter, famine, and transformation.',
 'active', false),
('Skinwalker', 'skinwalker', ARRAY['Yee Naaldlooshii'], 'cryptids', '🐺',
 'A shape-shifting witch from Navajo legend, capable of transforming into various animals.',
 'active', false),

-- UFO Types
('Black Triangle UFO', 'black-triangle-ufo', ARRAY['TR-3B', 'Silent Triangle'], 'ufos_aliens', '🔺',
 'A class of UFO characterized by a triangular shape with lights at each corner, often reported as silent and massive.',
 'active', false),
('Tic Tac UFO', 'tic-tac-ufo', ARRAY['Nimitz UFO', 'White Tic Tac'], 'ufos_aliens', '💊',
 'An oblong, white, wingless craft famously encountered by USS Nimitz pilots in 2004, exhibiting extraordinary flight capabilities.',
 'active', false),
('Flying Saucer', 'flying-saucer', ARRAY['Disc UFO', 'Classic UFO'], 'ufos_aliens', '🛸',
 'The classic disc-shaped UFO, the most commonly reported type since Kenneth Arnold''s 1947 sighting.',
 'active', false),
('Orb UFO', 'orb-ufo', ARRAY['Light Orb', 'Plasma Orb', 'Foo Fighter'], 'ufos_aliens', '⚪',
 'Spherical lights of various colors, often seen moving intelligently or in formation.',
 'active', false),
('Cigar UFO', 'cigar-ufo', ARRAY['Cylinder UFO', 'Mothership'], 'ufos_aliens', '🚀',
 'Elongated, cigar or cylinder-shaped craft, sometimes described as "motherships" releasing smaller objects.',
 'active', false),

-- Ghosts/Entities
('Shadow Person', 'shadow-person', ARRAY['Shadow Figure', 'Hat Man', 'Shadow Being'], 'ghosts_hauntings', '👤',
 'A dark, humanoid figure seen in peripheral vision or during sleep paralysis, often perceived as menacing.',
 'active', false),
('Poltergeist', 'poltergeist', ARRAY['Noisy Ghost'], 'ghosts_hauntings', '🪑',
 'A type of haunting characterized by physical disturbances like moving objects, knocking, and electrical interference.',
 'active', false),
('Grey Alien', 'grey-alien', ARRAY['Greys', 'Zeta Reticulan', 'EBE'], 'ufos_aliens', '👽',
 'Small humanoid beings with grey skin, large heads, and big black eyes, commonly reported in abduction accounts.',
 'active', false),
('Nordic Alien', 'nordic-alien', ARRAY['Tall Whites', 'Space Brothers', 'Pleiadians'], 'ufos_aliens', '👼',
 'Human-like extraterrestrials described as tall with blonde hair and blue eyes, often portrayed as benevolent.',
 'active', false),
('Men in Black', 'men-in-black', ARRAY['MIB'], 'ufos_aliens', '🕴️',
 'Mysterious figures in dark suits who allegedly harass or threaten UFO witnesses into silence.',
 'active', false);

-- Function to update phenomena stats
CREATE OR REPLACE FUNCTION update_phenomenon_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.phenomena SET
      report_count = report_count + 1,
      last_reported_date = COALESCE(
        (SELECT event_date FROM public.reports WHERE id = NEW.report_id),
        CURRENT_DATE
      ),
      first_reported_date = COALESCE(
        first_reported_date,
        (SELECT event_date FROM public.reports WHERE id = NEW.report_id),
        CURRENT_DATE
      )
    WHERE id = NEW.phenomenon_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.phenomena SET
      report_count = GREATEST(0, report_count - 1)
    WHERE id = OLD.phenomenon_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_phenomenon_stats_trigger
  AFTER INSERT OR DELETE ON public.report_phenomena
  FOR EACH ROW EXECUTE FUNCTION update_phenomenon_stats();

-- Update timestamps trigger
CREATE TRIGGER update_phenomena_updated_at
  BEFORE UPDATE ON public.phenomena
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS Policies
ALTER TABLE public.phenomena ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_phenomena ENABLE ROW LEVEL SECURITY;

-- Phenomena are viewable by everyone
CREATE POLICY "Phenomena are viewable by everyone" ON public.phenomena
  FOR SELECT USING (status = 'active');

-- Only service role can modify phenomena
CREATE POLICY "Only service role can modify phenomena" ON public.phenomena
  FOR ALL USING (auth.role() = 'service_role');

-- Report-phenomena links viewable by everyone
CREATE POLICY "Report-phenomena links are viewable by everyone" ON public.report_phenomena
  FOR SELECT USING (true);

-- Authenticated users can tag reports with phenomena
CREATE POLICY "Authenticated users can tag reports" ON public.report_phenomena
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Users can remove their own tags
CREATE POLICY "Users can remove own tags" ON public.report_phenomena
  FOR DELETE USING (tagged_by_user_id = auth.uid());

-- Service role has full access
CREATE POLICY "Service role has full access to report_phenomena" ON public.report_phenomena
  FOR ALL USING (auth.role() = 'service_role');
