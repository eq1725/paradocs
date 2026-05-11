-- ============================================================
-- V10 Phase 4.B — Match Circles
--
-- Small auto-curated groups (5–10 active members) of users
-- sharing a fingerprint. Panel-driven sizing:
--   - Target: 7 active members
--   - Range: 5–10
--   - Auto-grow when ≤4 active (prioritize for new opt-ins)
--   - Auto-split when ≥11 (split by tightest fingerprint cluster)
--
-- Schema:
--   match_circles            — the circle (one row per group)
--   match_circle_members     — membership (one row per user-circle)
--   match_circle_messages    — moderated message thread
-- ============================================================

-- 1) match_circles --------------------------------------------

CREATE TABLE IF NOT EXISTS public.match_circles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Optional human-readable name; usually derived from
  -- phenomenon_type and region by the curation cron.
  name                TEXT,
  -- Anchoring fingerprint: the dominant phenomenon_type for
  -- this circle. Used at curation time to decide who joins.
  phenomenon_type_id  UUID REFERENCES public.phenomenon_types(id) ON DELETE SET NULL,
  -- Optional geographic anchor: region label like 'pnw' or
  -- 'mid-atlantic' for regional circles, NULL for non-geographic.
  region_label        TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'merging', 'splitting')),
  -- Aggregate metadata maintained by the curation cron + message
  -- triggers (kept denormalized for cheap reads).
  member_count        INTEGER NOT NULL DEFAULT 0,
  active_count        INTEGER NOT NULL DEFAULT 0,
  last_message_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_circles_type     ON public.match_circles (phenomenon_type_id);
CREATE INDEX IF NOT EXISTS idx_match_circles_status   ON public.match_circles (status);
CREATE INDEX IF NOT EXISTS idx_match_circles_active   ON public.match_circles (active_count) WHERE status = 'active';

COMMENT ON TABLE public.match_circles IS
  'V10 Phase 4.B — Auto-curated 5-10 person experiencer groups. One row per group.';

-- 2) match_circle_members -------------------------------------

CREATE TABLE IF NOT EXISTS public.match_circle_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id       UUID NOT NULL REFERENCES public.match_circles(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ,
  muted_until     TIMESTAMPTZ,
  left_at         TIMESTAMPTZ,
  -- 30-day re-join cooldown: when a user leaves, we record a
  -- timestamp; the curation cron won't add them back to the
  -- same circle until cooldown expires.
  cooldown_until  TIMESTAMPTZ,

  UNIQUE (circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_circle_members_user        ON public.match_circle_members (user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_match_circle_members_circle      ON public.match_circle_members (circle_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_match_circle_members_active      ON public.match_circle_members (circle_id, last_active_at DESC) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_match_circle_members_cooldown    ON public.match_circle_members (user_id, cooldown_until) WHERE cooldown_until IS NOT NULL;

COMMENT ON TABLE public.match_circle_members IS
  'V10 Phase 4.B — Circle membership. UNIQUE(circle_id, user_id); left_at NULL = currently in circle. 30-day cooldown_until prevents re-join drama loops.';

-- 3) match_circle_messages ------------------------------------

CREATE TABLE IF NOT EXISTS public.match_circle_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id         UUID NOT NULL REFERENCES public.match_circles(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body              TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status            TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  moderation_reason TEXT,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_circle_messages_thread ON public.match_circle_messages (circle_id, created_at);

COMMENT ON TABLE public.match_circle_messages IS
  'V10 Phase 4.B — Circle messages. Moderated at insert via moderateText(). Public-to-circle, NOT public-to-world: RLS scoped to circle members only.';

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE public.match_circles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_circle_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_circle_messages ENABLE ROW LEVEL SECURITY;

-- A user reads circles they're a member of (left_at NULL).
CREATE POLICY "Members read their circles"
  ON public.match_circles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.match_circle_members m
      WHERE m.circle_id = match_circles.id
        AND m.user_id = auth.uid()
        AND m.left_at IS NULL
    )
  );

CREATE POLICY "Service role manages circles"
  ON public.match_circles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Members read their own membership row + other members of the
-- same circles (so they can see who's in the group).
CREATE POLICY "Members read their own membership"
  ON public.match_circle_members
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Members read co-members in their circles"
  ON public.match_circle_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.match_circle_members me
      WHERE me.circle_id = match_circle_members.circle_id
        AND me.user_id = auth.uid()
        AND me.left_at IS NULL
    )
  );

-- A user updates their own membership row (mute, leave).
CREATE POLICY "Members update their own membership"
  ON public.match_circle_members
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages memberships"
  ON public.match_circle_members
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Messages: members read; sender inserts; sender updates own
-- (edit / soft-delete).
CREATE POLICY "Active members read circle messages"
  ON public.match_circle_messages
  FOR SELECT
  USING (
    (status = 'approved' AND deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM public.match_circle_members m
      WHERE m.circle_id = match_circle_messages.circle_id
        AND m.user_id = auth.uid()
        AND m.left_at IS NULL
    ))
    OR sender_id = auth.uid()
  );

CREATE POLICY "Active members send messages"
  ON public.match_circle_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_circle_members m
      WHERE m.circle_id = match_circle_messages.circle_id
        AND m.user_id = auth.uid()
        AND m.left_at IS NULL
    )
  );

CREATE POLICY "Senders edit and soft-delete their messages"
  ON public.match_circle_messages
  FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Service role manages circle messages"
  ON public.match_circle_messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Convenience view: my circles with denormalized state.
CREATE OR REPLACE VIEW public.my_match_circles AS
SELECT
  c.id                AS circle_id,
  c.name,
  c.phenomenon_type_id,
  c.region_label,
  c.status,
  c.member_count,
  c.active_count,
  c.last_message_at,
  c.created_at,
  m.joined_at,
  m.last_active_at,
  m.muted_until
FROM public.match_circles c
JOIN public.match_circle_members m
  ON m.circle_id = c.id
WHERE m.user_id = auth.uid()
  AND m.left_at IS NULL;

COMMENT ON VIEW public.my_match_circles IS
  'Convenience view: circles the signed-in user belongs to (left_at NULL), with denormalized state.';
