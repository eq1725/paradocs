-- =====================================================================
-- V9.7 Phase 1 — curated avatar library
--
-- Replaces the hardcoded avatar list previously embedded in
-- src/components/AvatarSelector with a data-driven curated_avatars
-- table. Adding new avatars now becomes a SQL insert + a WebP file in
-- /public/avatars/curated/, no deploy or component change required.
--
-- 30 starter avatars across 5 themed categories:
--   travelers   — UFO, aliens, astronauts (6)
--   cosmos      — galaxy, planets, telescope (6)
--   mystics     — crystal ball, tarot, magic (6)
--   symbols     — ankh, peace, dreamcatcher (6)
--   researchers — researcher, robot, AI, brain (6)
--
-- Source files are 256x256 WebP at quality 90, served as static
-- assets from /public/avatars/curated/{slug}.webp. When we move
-- to Supabase Storage in V9.7 Phase 2 (custom uploads), we'll add
-- a separate column for the storage URL and migrate the path
-- format then.
-- =====================================================================

CREATE TABLE IF NOT EXISTS curated_avatars (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('travelers', 'cosmos', 'mystics', 'symbols', 'researchers')),
  image_url     TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS curated_avatars_category_sort_idx
  ON curated_avatars (category, sort_order)
  WHERE is_active = TRUE;

COMMENT ON TABLE curated_avatars IS
  'V9.7 Phase 1 — data-driven curated avatar library. Public read, admin write. Image files live in /public/avatars/curated/.';

-- Seed 30 starter avatars.
INSERT INTO curated_avatars (slug, name, category, image_url, sort_order) VALUES
  -- Travelers (UFO & Aliens)
  ('alien-head',      'Alien',           'travelers',   '/avatars/curated/alien-head.webp',     1),
  ('ufo-classic',     'UFO',             'travelers',   '/avatars/curated/ufo-classic.webp',    2),
  ('astronaut',       'Astronaut',       'travelers',   '/avatars/curated/astronaut.webp',      3),
  ('spaceship',       'Spaceship',       'travelers',   '/avatars/curated/spaceship.webp',      4),
  ('abduction',       'Abduction',       'travelers',   '/avatars/curated/abduction.webp',      5),
  ('alien-scientist', 'Alien Scientist', 'travelers',   '/avatars/curated/alien-scientist.webp', 6),
  -- Cosmos
  ('galaxy',          'Galaxy',          'cosmos',      '/avatars/curated/galaxy.webp',         1),
  ('saturn',          'Saturn',          'cosmos',      '/avatars/curated/saturn.webp',         2),
  ('black-hole',      'Black Hole',      'cosmos',      '/avatars/curated/black-hole.webp',     3),
  ('falling-star',    'Falling Star',    'cosmos',      '/avatars/curated/falling-star.webp',   4),
  ('telescope',       'Telescope',       'cosmos',      '/avatars/curated/telescope.webp',      5),
  ('constellation',   'Constellation',   'cosmos',      '/avatars/curated/constellation.webp',  6),
  -- Mystics
  ('crystal-ball',    'Crystal Ball',    'mystics',     '/avatars/curated/crystal-ball.webp',   1),
  ('tarot',           'Tarot',           'mystics',     '/avatars/curated/tarot.webp',          2),
  ('pendulum',        'Pendulum',        'mystics',     '/avatars/curated/pendulum.webp',       3),
  ('crystal',         'Crystal',         'mystics',     '/avatars/curated/crystal.webp',        4),
  ('cauldron',        'Cauldron',        'mystics',     '/avatars/curated/cauldron.webp',       5),
  ('wizard-hat',      'Wizard Hat',      'mystics',     '/avatars/curated/wizard-hat.webp',     6),
  -- Symbols
  ('ankh',            'Ankh',            'symbols',     '/avatars/curated/ankh.webp',           1),
  ('eye-of-ra',       'Eye of Ra',       'symbols',     '/avatars/curated/eye-of-ra.webp',      2),
  ('hamsa',           'Hamsa',           'symbols',     '/avatars/curated/hamsa.webp',          3),
  ('yin-yang',        'Yin Yang',        'symbols',     '/avatars/curated/yin-yang.webp',       4),
  ('peace',           'Peace',           'symbols',     '/avatars/curated/peace.webp',          5),
  ('dreamcatcher',    'Dreamcatcher',    'symbols',     '/avatars/curated/dreamcatcher.webp',   6),
  -- Researchers
  ('researcher',      'Researcher',      'researchers', '/avatars/curated/researcher.webp',     1),
  ('hologram',        'Hologram',        'researchers', '/avatars/curated/hologram.webp',       2),
  ('robot',           'Robot',           'researchers', '/avatars/curated/robot.webp',          3),
  ('hacker',          'Hacker',          'researchers', '/avatars/curated/hacker.webp',         4),
  ('brain',           'Brain',           'researchers', '/avatars/curated/brain.webp',          5),
  ('ai',              'AI',              'researchers', '/avatars/curated/ai.webp',             6)
ON CONFLICT (slug) DO NOTHING;
