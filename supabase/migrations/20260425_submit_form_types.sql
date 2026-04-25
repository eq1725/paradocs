-- Migration: Add user-submittable phenomenon types for all categories
-- Date: 2026-04-25
--
-- Purpose: 6 of 11 categories have zero types available in the submit form
-- dropdown, and 3 more need supplements. This migration adds experience-
-- oriented types that a user would self-select when reporting a personal
-- encounter. All new types default to user_submittable = TRUE.
--
-- Uses ON CONFLICT (slug) DO NOTHING so it's idempotent — types that
-- already exist (e.g. added directly to DB) are left untouched.

-- ============================================================
-- NEW TYPES FOR EMPTY CATEGORIES
-- ============================================================

-- Consciousness Practices (currently 0 types)
INSERT INTO public.phenomenon_types (category, name, slug, description) VALUES
  ('consciousness_practices', 'Lucid Dream', 'lucid-dream',
    'Becoming aware you are dreaming while still in the dream, often with ability to control the experience.'),
  ('consciousness_practices', 'Astral Projection', 'astral-projection',
    'Intentional out-of-body travel or separation of consciousness from the physical body.'),
  ('consciousness_practices', 'Meditation Experience', 'meditation-experience',
    'Unusual visions, sensations, or altered states occurring during meditation practice.'),
  ('consciousness_practices', 'Breathwork Experience', 'breathwork-experience',
    'Altered states, visions, or physical sensations arising from breathwork techniques.'),
  ('consciousness_practices', 'Plant Medicine / Psychedelic Experience', 'plant-medicine-experience',
    'Anomalous experiences during or following use of plant medicines or psychedelic substances.'),
  ('consciousness_practices', 'Sensory Deprivation Experience', 'sensory-deprivation-experience',
    'Unusual perceptions or altered states during float tanks, isolation, or sensory deprivation.'),
  ('consciousness_practices', 'Shamanic Journey', 'shamanic-journey',
    'Visionary experiences during drumming, chanting, or guided shamanic practice.'),
  ('consciousness_practices', 'Other Consciousness Practice', 'other-consciousness-practice',
    'Other altered-state experience not covered by the types above.')
ON CONFLICT (slug) DO NOTHING;

-- Biological Factors (currently 0 types)
INSERT INTO public.phenomenon_types (category, name, slug, description) VALUES
  ('biological_factors', 'Unexplained Healing', 'unexplained-healing',
    'Spontaneous recovery or remission without clear medical explanation.'),
  ('biological_factors', 'Unexplained Marks or Injuries', 'unexplained-marks',
    'Marks, burns, scars, or bruises appearing without known cause.'),
  ('biological_factors', 'Physical Sensation or Anomaly', 'physical-anomaly',
    'Unusual bodily sensations such as vibrations, pressure, heat, or tingling without physical cause.'),
  ('biological_factors', 'Electromagnetic Sensitivity', 'electromagnetic-sensitivity',
    'Sensitivity to electronic devices, EMF fields, or electrical disturbances around you.'),
  ('biological_factors', 'Unexplained Illness or Symptoms', 'unexplained-illness',
    'Sudden onset of illness, fatigue, or symptoms without medical explanation, often linked to a location or event.'),
  ('biological_factors', 'Other Physical Effect', 'other-physical-effect',
    'Other unexplained physical effects not covered by the types above.')
ON CONFLICT (slug) DO NOTHING;

-- Perception & Sensory (currently 0 types)
INSERT INTO public.phenomenon_types (category, name, slug, description) VALUES
  ('perception_sensory', 'Shadow Figure', 'shadow-figure',
    'Seeing a dark, shadowy humanoid form, often in peripheral vision.'),
  ('perception_sensory', 'Phantom Sounds or Voices', 'phantom-sounds',
    'Hearing voices, music, knocking, or other sounds without a physical source.'),
  ('perception_sensory', 'Unexplained Light or Glow', 'unexplained-light',
    'Seeing lights, orbs, flashes, or glowing phenomena without explanation.'),
  ('perception_sensory', 'Sleep Paralysis', 'sleep-paralysis',
    'Waking unable to move, often accompanied by a sense of presence or visual/auditory phenomena.'),
  ('perception_sensory', 'Phantom Smell or Sensation', 'phantom-smell',
    'Smelling perfume, smoke, sulfur, or other odors with no identifiable source.'),
  ('perception_sensory', 'Time Distortion', 'time-distortion',
    'Experiencing time moving unusually fast or slow, or periods of missing time.'),
  ('perception_sensory', 'Other Sensory Experience', 'other-sensory-experience',
    'Other unexplained sensory perception not covered by the types above.')
ON CONFLICT (slug) DO NOTHING;

-- Religion & Mythology (currently 0 types)
INSERT INTO public.phenomenon_types (category, name, slug, description) VALUES
  ('religion_mythology', 'Religious Vision', 'religious-vision',
    'A vision of a religious figure, sacred scene, or divine message.'),
  ('religion_mythology', 'Angelic or Divine Encounter', 'angelic-encounter',
    'Encounter with an angel, divine being, or messenger perceived as holy.'),
  ('religion_mythology', 'Demonic Encounter', 'demonic-encounter',
    'Encounter with an entity perceived as evil, demonic, or malevolent in a religious context.'),
  ('religion_mythology', 'Miraculous Healing', 'miraculous-healing',
    'Healing attributed to prayer, faith, a holy site, or divine intervention.'),
  ('religion_mythology', 'Stigmata or Sacred Marks', 'stigmata',
    'Spontaneous appearance of wounds, marks, or signs with religious significance.'),
  ('religion_mythology', 'Possession Experience', 'possession-experience',
    'Feeling taken over or influenced by an external spiritual entity.'),
  ('religion_mythology', 'Exorcism Experience', 'exorcism-experience',
    'Experience during or following a religious deliverance or exorcism ritual.'),
  ('religion_mythology', 'Speaking in Tongues', 'speaking-in-tongues',
    'Spontaneous speaking in unknown languages during prayer or worship.'),
  ('religion_mythology', 'Other Religious Experience', 'other-religious-experience',
    'Other religious or spiritual experience not covered by the types above.')
ON CONFLICT (slug) DO NOTHING;

-- Esoteric Practices (currently 0 usable types — all 3 were locations)
INSERT INTO public.phenomenon_types (category, name, slug, description) VALUES
  ('esoteric_practices', 'Séance or Spirit Communication', 'seance-experience',
    'Experience during a séance, spirit circle, or intentional spirit communication attempt.'),
  ('esoteric_practices', 'Ouija Board Experience', 'ouija-experience',
    'Unusual or unexplained events during or after using a spirit board or planchette.'),
  ('esoteric_practices', 'Tarot or Divination Experience', 'divination-experience',
    'Anomalous accuracy or unexplained events during tarot, I Ching, rune, or other divination practice.'),
  ('esoteric_practices', 'Ritual or Ceremonial Experience', 'ritual-experience',
    'Unusual phenomena occurring during a ritual, ceremony, or magical working.'),
  ('esoteric_practices', 'Energy Work or Healing', 'energy-work-experience',
    'Experiences during reiki, chakra work, aura reading, or other energy-based practice.'),
  ('esoteric_practices', 'Dowsing Experience', 'dowsing-experience',
    'Unexplained responses or results during dowsing with rods, pendulums, or other tools.'),
  ('esoteric_practices', 'Other Esoteric Practice', 'other-esoteric-practice',
    'Other experience during an esoteric or occult practice not covered above.')
ON CONFLICT (slug) DO NOTHING;

-- Multi-Disciplinary / Combination (currently 0 types)
INSERT INTO public.phenomenon_types (category, name, slug, description) VALUES
  ('combination', 'Multi-Phenomenon Event', 'multi-phenomenon-event',
    'An experience involving multiple types of phenomena simultaneously (e.g. UFO sighting with psychic effects).'),
  ('combination', 'Unexplained Event', 'unexplained-event',
    'A strange or anomalous event that does not fit neatly into any single category.'),
  ('combination', 'Other / Unclassified', 'other-unclassified',
    'An experience you are unsure how to categorize.')
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- SUPPLEMENTS FOR EXISTING CATEGORIES
-- ============================================================

-- Cryptids (currently 5 types — adding 6 more common encounter types)
INSERT INTO public.phenomenon_types (category, name, slug, description) VALUES
  ('cryptids', 'Dogman / Werewolf', 'dogman',
    'Encounter with an upright canine or wolf-like humanoid creature.'),
  ('cryptids', 'Thunderbird / Flying Cryptid', 'thunderbird',
    'Sighting of an abnormally large bird or unidentified flying creature.'),
  ('cryptids', 'Sea Serpent / Marine Cryptid', 'sea-serpent',
    'Encounter with a large unidentified creature in ocean or coastal waters.'),
  ('cryptids', 'Phantom Cat / Big Cat', 'phantom-cat',
    'Sighting of a large cat species in an area where none should exist.'),
  ('cryptids', 'Humanoid Entity', 'humanoid-entity',
    'Encounter with an unidentified humanoid being that is not alien or ghostly in nature.'),
  ('cryptids', 'Winged Humanoid', 'winged-humanoid',
    'Sighting of a humanoid figure with wings, similar to Mothman-type creatures.')
ON CONFLICT (slug) DO NOTHING;

-- Ghosts & Hauntings (currently 4 types — adding 5 common experience types)
INSERT INTO public.phenomenon_types (category, name, slug, description) VALUES
  ('ghosts_hauntings', 'Shadow Person', 'shadow-person',
    'Seeing a dark, human-shaped shadow figure, often with a sense of being watched.'),
  ('ghosts_hauntings', 'Demonic Activity', 'demonic-activity',
    'Aggressive or malevolent paranormal activity perceived as demonic in nature.'),
  ('ghosts_hauntings', 'Intelligent Haunting', 'intelligent-haunting',
    'Interactions with an entity that appears aware of and responsive to the living.'),
  ('ghosts_hauntings', 'Crisis Apparition', 'crisis-apparition',
    'Seeing or sensing a person at the moment of their death or serious crisis, often at a distance.'),
  ('ghosts_hauntings', 'Residual Haunting', 'residual-haunting',
    'Witnessing a repeating scene or event that plays out the same way, like a recording.')
ON CONFLICT (slug) DO NOTHING;

-- Psychic Phenomena (currently 9 types — adding 5 common experience types)
INSERT INTO public.phenomenon_types (category, name, slug, description) VALUES
  ('psychic_phenomena', 'Clairvoyance', 'clairvoyance',
    'Gaining visual information about a distant or hidden event without normal sensory input.'),
  ('psychic_phenomena', 'Remote Viewing', 'remote-viewing',
    'Perceiving details about a distant or unseen target through mental impression.'),
  ('psychic_phenomena', 'Psychokinesis', 'psychokinesis',
    'Objects moving, breaking, or being affected by apparent mental influence.'),
  ('psychic_phenomena', 'Synchronicity', 'synchronicity-experience',
    'A meaningful coincidence that feels too significant to be random.'),
  ('psychic_phenomena', 'Channeling / Mediumship', 'channeling-mediumship',
    'Receiving messages, impressions, or information from a non-physical source or deceased person.')
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- VERIFICATION
-- ============================================================
-- Run manually to confirm type counts per category:
--
-- SELECT category, count(*) as total,
--        count(*) FILTER (WHERE user_submittable = TRUE) as submittable
-- FROM public.phenomenon_types
-- GROUP BY category
-- ORDER BY category;
