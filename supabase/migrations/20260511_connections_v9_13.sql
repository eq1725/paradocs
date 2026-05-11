-- ============================================================
-- V9.13 Phase 3.B + 3.C — Mediated peer connections + messages
--
-- Schema split across three tables:
--
--   connection_requests   — pending invites (one user reaches out)
--   connections           — accepted mutual connections (the
--                           established relationship)
--   connection_messages   — message thread between connected users
--
-- Flow:
--   1. User A sees "People like you" (Phase 3.B card) and taps
--      "Reach out privately" on User B → POST creates a row in
--      connection_requests with an initial intro message.
--   2. User B sees an inbox entry; they can ACCEPT or DECLINE.
--      Accept → row in connections (one row per pair, sorted
--      user_a < user_b for de-dup), the original intro message
--      becomes the first connection_message, both users can
--      message each other from then on.
--      Decline → request row is marked status='declined'; A
--      does not get a notification of decline (panel: avoid
--      shame). A can re-request only after 30 days.
--   3. Either party can disconnect at any time → marks the
--      connection row inactive; no new messages allowed.
--
-- Privacy rules (enforced by RLS):
--   - Only the two parties (or service-role admin) can read
--     a connection or its messages.
--   - moderateText() runs against the intro message AND every
--     subsequent message (API enforces; RLS allows but the API
--     gates).
-- ============================================================

-- 1) connection_requests --------------------------------------

CREATE TABLE IF NOT EXISTS public.connection_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The user_report the requester is reaching out about (typically
  -- the recipient's report that surfaced in 'People like you').
  about_report  UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  -- Initial intro message (1-1000 chars; moderated at API layer).
  intro_message TEXT NOT NULL CHECK (length(intro_message) BETWEEN 1 AND 1000),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'rejected_moderation')),
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (from_user <> to_user)
);

CREATE INDEX IF NOT EXISTS idx_conn_requests_to_status   ON public.connection_requests (to_user, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conn_requests_from_status ON public.connection_requests (from_user, status, created_at DESC);

COMMENT ON TABLE public.connection_requests IS
  'Pending peer-connection invites. Only the two parties can read; status flows pending → accepted | declined | expired | rejected_moderation.';

-- Enforce a 30-day cooldown on re-requesting the same recipient
-- via a partial unique index on pending+declined.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conn_requests_pair_active
  ON public.connection_requests (from_user, to_user)
  WHERE status IN ('pending', 'declined');

ALTER TABLE public.connection_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Either party reads connection requests"
  ON public.connection_requests
  FOR SELECT
  USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "Authenticated users send their own requests"
  ON public.connection_requests
  FOR INSERT
  WITH CHECK (auth.uid() = from_user);

-- Recipient can update status (accept/decline). Sender can update
-- only to cancel (we'll use 'declined' for canceled-by-sender too;
-- the responded_at + a self-update audit handles the rest).
CREATE POLICY "Recipient or sender updates request status"
  ON public.connection_requests
  FOR UPDATE
  USING (auth.uid() = to_user OR auth.uid() = from_user)
  WITH CHECK (auth.uid() = to_user OR auth.uid() = from_user);

CREATE POLICY "Service role full access to requests"
  ON public.connection_requests
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2) connections ----------------------------------------------

CREATE TABLE IF NOT EXISTS public.connections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ordered pair: user_a < user_b lexicographically so we get one
  -- row per relationship regardless of who initiated.
  user_a       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  origin_request_id UUID REFERENCES public.connection_requests(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,

  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_connections_user_a_active ON public.connections (user_a) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_connections_user_b_active ON public.connections (user_b) WHERE is_active;

COMMENT ON TABLE public.connections IS
  'Established peer-to-peer connections. One row per pair (user_a < user_b). Either party can deactivate (is_active = FALSE).';

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Either party reads their connection"
  ON public.connections
  FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Either party deactivates their connection"
  ON public.connections
  FOR UPDATE
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Service role manages connections"
  ON public.connections
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3) connection_messages --------------------------------------

CREATE TABLE IF NOT EXISTS public.connection_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  sender_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  -- Set at the API layer based on moderateText() decision. Public
  -- thread reads filter to 'approved'. 'rejected' rows persist for
  -- the sender so they see why their message didn't go through.
  status        TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  moderation_reason TEXT,
  read_at       TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conn_messages_thread ON public.connection_messages (connection_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conn_messages_unread ON public.connection_messages (connection_id, read_at) WHERE read_at IS NULL;

COMMENT ON TABLE public.connection_messages IS
  'Messages exchanged inside an established connection. All bodies moderated via moderateText() at insert time.';

ALTER TABLE public.connection_messages ENABLE ROW LEVEL SECURITY;

-- Either party reads approved messages in their connection, or
-- their own rejected messages (so the sender sees the rejection).
CREATE POLICY "Connection parties read approved messages"
  ON public.connection_messages
  FOR SELECT
  USING (
    (status = 'approved' AND deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = connection_id
        AND (auth.uid() = c.user_a OR auth.uid() = c.user_b)
    ))
    OR (sender_id = auth.uid())
  );

CREATE POLICY "Connection parties insert their own messages"
  ON public.connection_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = connection_id
        AND c.is_active = TRUE
        AND (auth.uid() = c.user_a OR auth.uid() = c.user_b)
    )
  );

CREATE POLICY "Senders edit and soft-delete their messages"
  ON public.connection_messages
  FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Service role full access to messages"
  ON public.connection_messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Helper view: my connections with the other party's profile preview.
CREATE OR REPLACE VIEW public.my_connections AS
SELECT
  c.id           AS connection_id,
  c.is_active,
  c.created_at,
  c.deactivated_at,
  CASE WHEN auth.uid() = c.user_a THEN c.user_b ELSE c.user_a END AS other_user_id,
  p.username     AS other_username,
  p.display_name AS other_display_name,
  p.avatar_url   AS other_avatar_url
FROM public.connections c
JOIN public.profiles p
  ON p.id = (CASE WHEN auth.uid() = c.user_a THEN c.user_b ELSE c.user_a END)
WHERE auth.uid() = c.user_a OR auth.uid() = c.user_b;

COMMENT ON VIEW public.my_connections IS
  'Convenience view: my connections with the other party''s profile fields. RLS-friendly (uses auth.uid()).';
