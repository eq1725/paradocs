-- ============================================
-- UPDATED PHENOMENA SCHEMA
-- Aligns with the original comprehensive taxonomy
-- ============================================

-- Step 1: Create new enum type with all categories
CREATE TYPE phenomenon_category_new AS ENUM (
  'ufos_aliens',              -- UFOs and Aliens/NHIs
  'cryptids',                 -- Cryptids
  'ghosts_hauntings',         -- Ghosts and Hauntings
  'psychic_phenomena',        -- Psychic Phenomena (ESP)
  'consciousness_practices',  -- Consciousness Altering Practices
  'psychological_experiences', -- Psychological Experiences
  'biological_factors',       -- Biological Factors Influencing Experience
  'perception_sensory',       -- Perception and Sensory Processes
  'religion_mythology',       -- Comparative Religion and Mythology
  'esoteric_practices',       -- Esoteric Practices and Beliefs
  'combination'               -- Multiple categories apply
);

-- Step 2: Migrate existing data
-- First add a temporary column
ALTER TABLE public.reports ADD COLUMN category_new phenomenon_category_new;
ALTER TABLE public.phenomenon_types ADD COLUMN category_new phenomenon_category_new;

-- Map old categories to new categories
UPDATE public.reports SET category_new = CASE
  WHEN category = 'ufo_uap' THEN 'ufos_aliens'::phenomenon_category_new
  WHEN category = 'cryptid' THEN 'cryptids'::phenomenon_category_new
  WHEN category = 'ghost_haunting' THEN 'ghosts_hauntings'::phenomenon_category_new
  WHEN category = 'psychic_paranormal' THEN 'psychic_phenomena'::phenomenon_category_new
  WHEN category = 'unexplained_event' THEN 'psychological_experiences'::phenomenon_category_new
  WHEN category = 'mystery_location' THEN 'ghosts_hauntings'::phenomenon_category_new
  WHEN category = 'other' THEN 'combination'::phenomenon_category_new
  ELSE 'combination'::phenomenon_category_new
END;

UPDATE public.phenomenon_types SET category_new = CASE
  WHEN category = 'ufo_uap' THEN 'ufos_aliens'::phenomenon_category_new
  WHEN category = 'cryptid' THEN 'cryptids'::phenomenon_category_new
  WHEN category = 'ghost_haunting' THEN 'ghosts_hauntings'::phenomenon_category_new
  WHEN category = 'psychic_paranormal' THEN 'psychic_phenomena'::phenomenon_category_new
  WHEN category = 'unexplained_event' THEN 'psychological_experiences'::phenomenon_category_new
  WHEN category = 'mystery_location' THEN 'ghosts_hauntings'::phenomenon_category_new
  WHEN category = 'other' THEN 'combination'::phenomenon_category_new
  ELSE 'combination'::phenomenon_category_new
END;

-- Drop old column and rename new
ALTER TABLE public.reports DROP COLUMN category;
ALTER TABLE public.reports RENAME COLUMN category_new TO category;
ALTER TABLE public.reports ALTER COLUMN category SET NOT NULL;

ALTER TABLE public.phenomenon_types DROP COLUMN category;
ALTER TABLE public.phenomenon_types RENAME COLUMN category_new TO category;
ALTER TABLE public.phenomenon_types ALTER COLUMN category SET NOT NULL;

-- Drop old enum type
DROP TYPE phenomenon_category;

-- Rename new enum to standard name
ALTER TYPE phenomenon_category_new RENAME TO phenomenon_category;

-- Step 3: Clear existing phenomenon types and insert comprehensive taxonomy
DELETE FROM public.phenomenon_types;

-- ============================================
-- UFOs and Aliens/NHIs
-- ============================================
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
-- Close Encounters Classification
('ufos_aliens', 'CE-1: Close Encounter First Kind', 'ce-1', 'Visual sighting within 500 feet', '👁️'),
('ufos_aliens', 'CE-2: Close Encounter Second Kind', 'ce-2', 'Physical effects or evidence left behind', '🔥'),
('ufos_aliens', 'CE-3: Close Encounter Third Kind', 'ce-3', 'Observation of occupants or entities', '👽'),
('ufos_aliens', 'CE-4: Close Encounter Fourth Kind', 'ce-4', 'Abduction or direct contact experience', '🛸'),
('ufos_aliens', 'CE-5: Close Encounter Fifth Kind', 'ce-5', 'Conscious, voluntary contact initiated by human', '🤝'),
-- Sighting Reports
('ufos_aliens', 'Mass Sighting', 'mass-sighting', 'UFO observed by multiple witnesses simultaneously', '👥'),
('ufos_aliens', 'Historical Sighting', 'historical-ufo-sighting', 'Documented UFO sighting from historical records', '📜'),
('ufos_aliens', 'Notable Case', 'notable-ufo-case', 'Well-documented and significant UFO incident', '⭐'),
('ufos_aliens', 'USO (Unidentified Submerged Object)', 'uso', 'Unidentified object observed underwater', '🌊'),
('ufos_aliens', 'NHI Contact', 'nhi-contact', 'Non-human intelligence contact or communication', '🌌');

-- ============================================
-- Cryptids
-- ============================================
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
('cryptids', 'Bigfoot/Sasquatch', 'bigfoot', 'Large bipedal ape-like creature sightings', '🦶'),
('cryptids', 'Lake/Sea Monster', 'lake-monster', 'Large aquatic cryptid (Nessie, etc.)', '🐉'),
('cryptids', 'Mothman', 'mothman', 'Winged humanoid creature sightings', '🦇'),
('cryptids', 'Chupacabra', 'chupacabra', 'Livestock-attacking cryptid', '🐐'),
('cryptids', 'Thunderbird', 'thunderbird', 'Giant bird cryptid sightings', '🦅'),
('cryptids', 'Dogman/Werewolf', 'dogman', 'Canine humanoid creature', '🐺'),
('cryptids', 'Historical Cryptid Report', 'historical-cryptid', 'Documented cryptid sighting from historical records', '📜'),
('cryptids', 'Eyewitness Account', 'cryptid-eyewitness', 'First-hand cryptid encounter testimony', '👁️'),
('cryptids', 'Physical Evidence', 'cryptid-evidence', 'Tracks, hair, or other physical cryptid evidence', '🔍'),
('cryptids', 'Other Cryptid', 'other-cryptid', 'Other unidentified creature sighting', '❓');

-- ============================================
-- Ghosts and Hauntings
-- ============================================
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
-- Types of ghosts
('ghosts_hauntings', 'Residual Haunting', 'residual-haunting', 'Repeating non-interactive ghostly phenomena', '🔄'),
('ghosts_hauntings', 'Intelligent Haunting', 'intelligent-haunting', 'Interactive ghost capable of communication', '💬'),
('ghosts_hauntings', 'Poltergeist Activity', 'poltergeist', 'Physical disturbance and object manipulation', '🪑'),
('ghosts_hauntings', 'Shadow Person', 'shadow-person', 'Dark humanoid figure sighting', '👤'),
('ghosts_hauntings', 'Apparition', 'apparition', 'Visual manifestation of a spirit', '👻'),
-- Investigation related
('ghosts_hauntings', 'EVP Recording', 'evp', 'Electronic Voice Phenomenon capture', '🎙️'),
('ghosts_hauntings', 'Paranormal Investigation', 'paranormal-investigation', 'Documented ghost hunting investigation', '🔦'),
-- Notable cases and locations
('ghosts_hauntings', 'Famous Haunted Site', 'famous-haunted-site', 'Well-known haunted location report', '🏚️'),
('ghosts_hauntings', 'Infamous Case', 'infamous-ghost-case', 'Notable paranormal case (Bermuda Triangle, Roanoke, etc.)', '📰'),
('ghosts_hauntings', 'Historical Haunting', 'historical-haunting', 'Ghost reports from historical records', '📜');

-- ============================================
-- Psychic Phenomena (ESP)
-- ============================================
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
('psychic_phenomena', 'Telepathy', 'telepathy', 'Mind-to-mind communication experience', '🧠'),
('psychic_phenomena', 'Telepathy in Animals', 'animal-telepathy', 'Psychic connection with animals', '🐕'),
('psychic_phenomena', 'Remote Viewing', 'remote-viewing', 'Perceiving distant locations psychically', '🔮'),
('psychic_phenomena', 'Clairvoyance', 'clairvoyance', 'Extrasensory perception of events or information', '👁️'),
('psychic_phenomena', 'Premonition Dream', 'premonition-dream', 'Predictive dream experience', '💤'),
('psychic_phenomena', 'Precognition', 'precognition', 'Knowledge of future events', '⏰'),
('psychic_phenomena', 'Psychokinesis/Telekinesis', 'psychokinesis', 'Mind affecting physical matter', '🌀'),
('psychic_phenomena', 'Notable ESP Case', 'notable-esp-case', 'Well-documented psychic phenomenon', '⭐');

-- ============================================
-- Consciousness Altering Practices
-- ============================================
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
('consciousness_practices', 'Breathwork Experience', 'breathwork', 'Altered state through breathing techniques', '🌬️'),
('consciousness_practices', 'Meditation Experience', 'meditation-experience', 'Profound experience during meditation', '🧘'),
('consciousness_practices', 'Shamanic Journey', 'shamanic-journey', 'Shamanic practice altered state experience', '🪶'),
('consciousness_practices', 'Vision Quest', 'vision-quest', 'Traditional vision quest experience', '🏔️'),
('consciousness_practices', 'Religious Ritual Experience', 'religious-ritual', 'Altered state during religious practice', '🕯️'),
('consciousness_practices', 'Sensory Deprivation', 'sensory-deprivation', 'Float tank or isolation experience', '🌑'),
('consciousness_practices', 'Plant Medicine Experience', 'plant-medicine', 'Entheogenic or plant medicine journey', '🌿'),
('consciousness_practices', 'Neurofeedback Experience', 'neurofeedback', 'Brain-machine interface experience', '⚡'),
('consciousness_practices', 'VR Altered State', 'vr-altered-state', 'Virtual reality induced altered state', '🥽');

-- ============================================
-- Psychological Experiences
-- ============================================
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
('psychological_experiences', 'Lucid Dream', 'lucid-dream', 'Conscious awareness during dreaming', '💭'),
('psychological_experiences', 'Prophetic Dream', 'prophetic-dream', 'Dream with apparent prophetic content', '🌙'),
('psychological_experiences', 'Shared Dream', 'shared-dream', 'Dream shared by multiple people', '👥'),
('psychological_experiences', 'Near-Death Experience', 'nde', 'Experience during clinical death or near-death', '✨'),
('psychological_experiences', 'Shared Death Experience', 'shared-death', 'Sharing the death experience of another', '🤝'),
('psychological_experiences', 'Remembered Death Experience', 'past-life-memory', 'Memories of past lives or deaths', '🔄'),
('psychological_experiences', 'Out-of-Body Experience', 'obe', 'Consciousness separating from body', '🌟'),
('psychological_experiences', 'Astral Projection', 'astral-projection', 'Intentional out-of-body travel', '🚀'),
('psychological_experiences', 'Tulpamancy', 'tulpamancy', 'Creation of autonomous mental entities', '🧠'),
('psychological_experiences', 'Anomalous Memory', 'anomalous-memory', 'Unexplained memory phenomena', '📝'),
('psychological_experiences', 'Time Slip', 'time-slip', 'Temporal anomaly or displacement experience', '⏳'),
('psychological_experiences', 'Deja Vu Phenomenon', 'deja-vu', 'Strong sense of having experienced the present before', '🔮');

-- ============================================
-- Biological Factors Influencing Experience
-- ============================================
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
('biological_factors', 'Genetic Predisposition', 'genetic-predisposition', 'Hereditary factors in paranormal sensitivity', '🧬'),
('biological_factors', 'Environmental Influence', 'environmental-influence', 'Ecological factors affecting experiences', '🌍'),
('biological_factors', 'Geographical Anomaly', 'geographical-anomaly', 'Location-based factors in experiences', '📍'),
('biological_factors', 'Psychophysiological Response', 'psychophysiological', 'Physical body responses to phenomena', '💓'),
('biological_factors', 'EMF Sensitivity', 'emf-sensitivity', 'Electromagnetic field sensitivity experiences', '⚡'),
('biological_factors', 'Infrasound Effect', 'infrasound-effect', 'Low frequency sound induced experiences', '🔊');

-- ============================================
-- Perception and Sensory Processes
-- ============================================
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
('perception_sensory', 'Anomalous Perception', 'anomalous-perception', 'Unusual sensory perception experience', '👁️'),
('perception_sensory', 'Synesthesia Experience', 'synesthesia', 'Cross-sensory perception phenomena', '🎨'),
('perception_sensory', 'Hypnagogic/Hypnopompic', 'hypnagogic', 'Sleep transition perception experiences', '😴'),
('perception_sensory', 'Pareidolia', 'pareidolia', 'Pattern recognition in random stimuli', '🖼️'),
('perception_sensory', 'Auditory Anomaly', 'auditory-anomaly', 'Unexplained sounds or voices', '👂'),
('perception_sensory', 'Visual Anomaly', 'visual-anomaly', 'Unexplained visual phenomena', '👀'),
('perception_sensory', 'Tactile Anomaly', 'tactile-anomaly', 'Unexplained physical sensations', '✋');

-- ============================================
-- Comparative Religion and Mythology
-- ============================================
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
('religion_mythology', 'Afterlife Vision', 'afterlife-vision', 'Experience or vision of afterlife realms', '☁️'),
('religion_mythology', 'Reincarnation Memory', 'reincarnation', 'Memories suggesting past lives', '🔄'),
('religion_mythology', 'Mystical Experience', 'mystical-experience', 'Profound religious or mystical encounter', '✨'),
('religion_mythology', 'Religious Vision', 'religious-vision', 'Vision of religious figures or symbols', '🕊️'),
('religion_mythology', 'Miracle Report', 'miracle', 'Reported miraculous occurrence', '🌟'),
('religion_mythology', 'Angel Encounter', 'angel-encounter', 'Encounter with angelic beings', '👼'),
('religion_mythology', 'Demonic Encounter', 'demonic-encounter', 'Encounter with demonic entities', '😈'),
('religion_mythology', 'Mythological Being', 'mythological-being', 'Sighting of beings from mythology', '🧚'),
('religion_mythology', 'Sacred Site Experience', 'sacred-site', 'Anomalous experience at sacred location', '⛩️'),
('religion_mythology', 'Supernatural Being', 'supernatural-being', 'Encounter with supernatural entity', '👹');

-- ============================================
-- Esoteric Practices and Beliefs
-- ============================================
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
('esoteric_practices', 'Ritual Magic Experience', 'ritual-magic', 'Experience during ceremonial magic practice', '🔯'),
('esoteric_practices', 'Chaos Magic Result', 'chaos-magic', 'Manifestation from chaos magic practice', '🌀'),
('esoteric_practices', 'Witchcraft Experience', 'witchcraft', 'Experience related to witchcraft practice', '🧙'),
('esoteric_practices', 'Kabbalah Experience', 'kabbalah', 'Mystical experience from Kabbalistic practice', '✡️'),
('esoteric_practices', 'Hermetic Experience', 'hermetic', 'Experience from Hermetic practices', '⚗️'),
('esoteric_practices', 'Theosophical Experience', 'theosophical', 'Experience related to Theosophy', '📚'),
('esoteric_practices', 'Astrological Event', 'astrological-event', 'Notable astrological correlation', '♈'),
('esoteric_practices', 'Tarot Experience', 'tarot-experience', 'Significant tarot reading or experience', '🃏'),
('esoteric_practices', 'Divination Result', 'divination', 'Successful divination or oracle experience', '🔮'),
('esoteric_practices', 'Ley Line Phenomenon', 'ley-line', 'Experience at ley line or energy grid location', '📍'),
('esoteric_practices', 'Occult Phenomenon', 'occult-phenomenon', 'Other occult or esoteric experience', '🌑');

-- ============================================
-- Combination (Multiple Categories)
-- ============================================
INSERT INTO public.phenomenon_types (category, name, slug, description, icon) VALUES
('combination', 'Multi-Phenomena Event', 'multi-phenomena', 'Event involving multiple paranormal categories', '🔗'),
('combination', 'Complex Case', 'complex-case', 'Case spanning multiple phenomenon types', '📋'),
('combination', 'Interdisciplinary Report', 'interdisciplinary', 'Report requiring multiple classification areas', '🔀');

-- ============================================
-- Recreate indexes
-- ============================================
DROP INDEX IF EXISTS idx_reports_category;
CREATE INDEX idx_reports_category ON public.reports(category);
