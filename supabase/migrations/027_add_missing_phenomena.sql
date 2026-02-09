-- Migration: Add missing phenomena for consciousness/psychological categories
-- These are needed so the batch-linker can auto-tag imported reports
-- Date: 2026-02-09

-- Consciousness Practices
INSERT INTO phenomena (name, slug, aliases, category, icon, ai_summary, status, auto_generated, confidence_score)
VALUES
  ('Lucid Dreaming', 'lucid-dreaming',
   ARRAY['Lucid Dream', 'Dream Control', 'Conscious Dreaming', 'Wake-Initiated Lucid Dream', 'WILD', 'DILD'],
   'consciousness_practices', '🌙',
   'The experience of becoming aware that one is dreaming while still in the dream state, often with the ability to control the dream environment.',
   'active', true, 0.9),

  ('Astral Projection', 'astral-projection',
   ARRAY['Astral Travel', 'Soul Travel', 'Astral Body', 'Etheric Projection'],
   'consciousness_practices', '✨',
   'The intentional practice of separating consciousness from the physical body to travel in an astral plane or alternate dimension.',
   'active', true, 0.9),

  ('Dream Visitation', 'dream-visitation',
   ARRAY['Visitation Dream', 'Spirit Dream', 'Contact Dream', 'Deceased Visit Dream'],
   'consciousness_practices', '👤',
   'Vivid dreams involving apparent contact with deceased loved ones, often described as feeling distinctly different from normal dreams.',
   'active', true, 0.85),

  ('False Awakening', 'false-awakening',
   ARRAY['Dream Within a Dream', 'Nested Dream', 'Loop Dream'],
   'consciousness_practices', '🔄',
   'The vivid experience of apparently waking up while actually remaining in a dream state, sometimes occurring multiple times in succession.',
   'active', true, 0.85),

  ('Kundalini Awakening', 'kundalini-awakening',
   ARRAY['Kundalini Rising', 'Kundalini Energy', 'Serpent Energy', 'Spiritual Awakening'],
   'consciousness_practices', '🐍',
   'A spiritual experience described as energy rising from the base of the spine, often accompanied by intense physical and psychological phenomena.',
   'active', true, 0.85),

  ('Meditation Vision', 'meditation-vision',
   ARRAY['Third Eye Vision', 'Inner Vision', 'Jhana Experience', 'Samadhi'],
   'consciousness_practices', '🧘',
   'Spontaneous visual or sensory experiences occurring during deep meditation, ranging from lights and geometric patterns to vivid scenes.',
   'active', true, 0.8)
ON CONFLICT (slug) DO NOTHING;

-- Psychological Experiences
INSERT INTO phenomena (name, slug, aliases, category, icon, ai_summary, status, auto_generated, confidence_score)
VALUES
  ('Hypnagogic Hallucination', 'hypnagogic-hallucination',
   ARRAY['Hypnagogia', 'Hypnopompic Hallucination', 'Sleep Onset Hallucination', 'Waking Dream'],
   'psychological_experiences', '😵',
   'Vivid sensory experiences occurring at the boundary between wakefulness and sleep, including visual, auditory, and tactile hallucinations.',
   'active', true, 0.85),

  ('Deja Vu', 'deja-vu',
   ARRAY['Déjà Vu', 'Already Seen', 'Deja Vecu', 'Presque Vu'],
   'psychological_experiences', '🔁',
   'The intense feeling of having already experienced a present situation, sometimes reported with paranormal intensity or accuracy.',
   'active', true, 0.8),

  ('Ego Death', 'ego-death',
   ARRAY['Ego Dissolution', 'Psychic Death', 'Dark Night of the Soul'],
   'psychological_experiences', '🕳️',
   'A complete loss of subjective self-identity, often described during meditation, near-death experiences, or altered states of consciousness.',
   'active', true, 0.8),

  ('Dissociative Experience', 'dissociative-experience',
   ARRAY['Depersonalization', 'Derealization', 'Out of Reality'],
   'psychological_experiences', '🌀',
   'Experiences of detachment from reality, oneself, or surroundings, sometimes reported alongside paranormal phenomena.',
   'active', true, 0.75)
ON CONFLICT (slug) DO NOTHING;

-- Psychic Phenomena additions
INSERT INTO phenomena (name, slug, aliases, category, icon, ai_summary, status, auto_generated, confidence_score)
VALUES
  ('Synchronicity', 'synchronicity',
   ARRAY['Meaningful Coincidence', 'Cosmic Coincidence', 'Signs from the Universe'],
   'psychic_phenomena', '🎯',
   'Meaningful coincidences that seem too significant to be random, as described by Carl Jung.',
   'active', true, 0.8),

  ('Empathic Ability', 'empathic-ability',
   ARRAY['Empath', 'Psychic Empathy', 'Emotional Sensing', 'Energy Sensitivity'],
   'psychic_phenomena', '💗',
   'The reported ability to sense or absorb the emotions and energies of other people or environments.',
   'active', true, 0.8),

  ('Channeling', 'channeling',
   ARRAY['Mediumship', 'Spirit Communication', 'Trance Channeling', 'Psychic Medium'],
   'psychic_phenomena', '📡',
   'The practice of receiving and transmitting messages from spirits, entities, or non-physical intelligences.',
   'active', true, 0.8)
ON CONFLICT (slug) DO NOTHING;

-- Ghosts/Hauntings additions
INSERT INTO phenomena (name, slug, aliases, category, icon, ai_summary, status, auto_generated, confidence_score)
VALUES
  ('Attachment Entity', 'attachment-entity',
   ARRAY['Spirit Attachment', 'Parasitic Entity', 'Hitchhiker Entity', 'Attached Spirit'],
   'ghosts_hauntings', '🔗',
   'An entity believed to attach itself to a person or location, often following paranormal encounters or visiting haunted places.',
   'active', true, 0.8),

  ('Portal', 'portal',
   ARRAY['Dimensional Portal', 'Vortex', 'Thin Place', 'Gateway'],
   'ghosts_hauntings', '🌀',
   'A location believed to serve as a doorway between dimensions or realms, often associated with recurring paranormal activity.',
   'active', true, 0.8)
ON CONFLICT (slug) DO NOTHING;
