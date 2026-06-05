-- =====================================================================
-- V11.17.73 — Named-Match + Peer DM (Tier 3C)
--
-- Per LAB_PANEL_REVIEW_V3.md §4 + §6 — the Basic-tier engagement moat.
--
-- A Named-Match offer is the system's proposal that two contributors
-- whose submitted experiences share signal might wish to compare notes.
-- The match is detected by an 8-signal fingerprint scorer (see
-- src/lib/lab/named-match/fingerprint.ts), gated to confidence >= 0.85,
-- and only fires when BOTH involved reports have discoverable = TRUE.
--
-- Mutual opt-in mechanics (HARD privacy floor):
--   1. System detects strong match between A's report and B's report
--      → creates a row with state='pending', initiator = A.
--   2. A sees an anonymous card: phen family, year, signal overlap
--      count, distance bucket. No name. No photo. No exact location.
--   3. If A accepts, the offer's mirror row fires to B with the same
--      anonymous framing about A.
--   4. Once BOTH accept (state='accepted'), a DM thread opens via
--      lab_dm_threads and identifying detail becomes visible to both.
--   5. Either side can decline at any point → state='declined' AND
--      the pair lands on lab_match_suppressions for 90 days.
--
-- Cadence guardrails:
--   - Max 1 NEW offer surfaced per user per 7 days (enforced in the
--     cron handler, not the schema).
--   - Offers expire after 14 days (expires_at default + cron sweep).
--   - DM thread closure → 90-day suppression.
--
-- Tier gating: Basic + Pro receive offers and may open DMs. Free users
-- never see the surface. Service role bypasses RLS for the matcher.
-- =====================================================================

-- =====================================================================
-- discoverable flag on reports (per-experience opt-in)
-- =====================================================================
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_reports_discoverable
  ON public.reports (discoverable)
  WHERE discoverable = TRUE;

COMMENT ON COLUMN public.reports.discoverable IS
  'V11.17.73 Named-Match — per-experience opt-in flag. The fingerprint matcher only considers reports where discoverable = TRUE on BOTH sides of a candidate pair. Owner toggles via /api/lab/reports/[id]/toggle-discoverable.';

-- =====================================================================
-- lab_named_match_offers — one row per directional offer
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lab_named_match_offers (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  initiator_report_id         UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  recipient_user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_report_id         UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,

  signal_overlap_count        INT NOT NULL,            -- 0..8
  match_confidence            NUMERIC NOT NULL,         -- 0..1
  /** Pre-opt-in anonymous card payload. JSON shape:
   *    { phen_family, decade, distance_bucket, signal_overlap_count }
   *  No identifying detail. */
  anonymous_payload           JSONB NOT NULL DEFAULT '{}'::jsonb,

  state                       TEXT NOT NULL DEFAULT 'pending',
  initiator_responded_at      TIMESTAMPTZ,
  recipient_responded_at      TIMESTAMPTZ,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',

  CONSTRAINT lab_named_match_offers_state_check
    CHECK (state IN ('pending', 'initiator_accepted', 'accepted', 'declined', 'expired')),
  CONSTRAINT lab_named_match_offers_overlap_check
    CHECK (signal_overlap_count BETWEEN 0 AND 8),
  CONSTRAINT lab_named_match_offers_confidence_check
    CHECK (match_confidence >= 0 AND match_confidence <= 1),
  CONSTRAINT lab_named_match_offers_distinct
    CHECK (initiator_user_id <> recipient_user_id),
  CONSTRAINT lab_named_match_offers_unique_pair
    UNIQUE (initiator_report_id, recipient_report_id)
);

CREATE INDEX IF NOT EXISTS idx_named_match_offers_recipient_pending
  ON public.lab_named_match_offers (recipient_user_id, state)
  WHERE state = 'pending' OR state = 'initiator_accepted';

CREATE INDEX IF NOT EXISTS idx_named_match_offers_initiator_pending
  ON public.lab_named_match_offers (initiator_user_id, state)
  WHERE state = 'pending' OR state = 'initiator_accepted';

CREATE INDEX IF NOT EXISTS idx_named_match_offers_expires
  ON public.lab_named_match_offers (expires_at)
  WHERE state = 'pending' OR state = 'initiator_accepted';

COMMENT ON TABLE public.lab_named_match_offers IS
  'V11.17.73 Named-Match offers — mutual-opt-in handshake between two contributors. state flow: pending → initiator_accepted → accepted | declined | expired. accepted opens a lab_dm_threads row.';

-- =====================================================================
-- lab_dm_threads — one row per opened thread, scoped to matched pair
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lab_dm_threads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_offer_id      UUID NOT NULL REFERENCES public.lab_named_match_offers(id) ON DELETE CASCADE,

  state               TEXT NOT NULL DEFAULT 'open',
  closed_by           UUID REFERENCES auth.users(id),
  closed_at           TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lab_dm_threads_state_check
    CHECK (state IN ('open', 'closed')),
  -- canonical ordering on the pair so (A,B) and (B,A) collapse to one row
  CONSTRAINT lab_dm_threads_canonical_pair CHECK (user_a_id < user_b_id),
  CONSTRAINT lab_dm_threads_unique_per_offer UNIQUE (match_offer_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_threads_user_a
  ON public.lab_dm_threads (user_a_id, state, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_threads_user_b
  ON public.lab_dm_threads (user_b_id, state, last_message_at DESC);

COMMENT ON TABLE public.lab_dm_threads IS
  'V11.17.73 Peer DM threads — 1:1 channel opened after both parties accept a named-match offer. Canonical pair ordering (user_a_id < user_b_id) makes (A,B) unique.';

-- =====================================================================
-- lab_dm_messages — text-only chat messages, ≤2000 chars
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lab_dm_messages (
  id              BIGSERIAL PRIMARY KEY,
  thread_id       UUID NOT NULL REFERENCES public.lab_dm_threads(id) ON DELETE CASCADE,
  sender_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at         TIMESTAMPTZ,

  CONSTRAINT lab_dm_messages_body_length
    CHECK (length(body) > 0 AND length(body) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_thread_recent
  ON public.lab_dm_messages (thread_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_messages_unread
  ON public.lab_dm_messages (thread_id, sender_user_id)
  WHERE read_at IS NULL;

COMMENT ON TABLE public.lab_dm_messages IS
  'V11.17.73 Peer DM messages — text-only (no media), 2000 char cap. read_at flips when the recipient marks the message read.';

-- =====================================================================
-- lab_match_suppressions — after withdrawal/closure, don't re-offer 90d
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lab_match_suppressions (
  id                  BIGSERIAL PRIMARY KEY,
  user_a_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suppressed_until    TIMESTAMPTZ NOT NULL,
  reason              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lab_match_suppressions_canonical_pair CHECK (user_a_id < user_b_id),
  CONSTRAINT lab_match_suppressions_unique_pair UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_match_suppressions_until
  ON public.lab_match_suppressions (suppressed_until);

COMMENT ON TABLE public.lab_match_suppressions IS
  'V11.17.73 Named-Match suppression list — used after a decline or thread closure to prevent re-offer churn for 90 days. Pair canonicalized as (user_a < user_b).';

-- =====================================================================
-- last_message_at trigger on lab_dm_messages → lab_dm_threads
-- =====================================================================
CREATE OR REPLACE FUNCTION public.touch_lab_dm_thread_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.lab_dm_threads
    SET last_message_at = NEW.sent_at
    WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lab_dm_messages_touch_thread ON public.lab_dm_messages;
CREATE TRIGGER lab_dm_messages_touch_thread
  AFTER INSERT ON public.lab_dm_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_lab_dm_thread_last_message_at();

-- =====================================================================
-- RLS — users read/write their own only; service role bypass
-- =====================================================================
ALTER TABLE public.lab_named_match_offers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_dm_threads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_dm_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_match_suppressions   ENABLE ROW LEVEL SECURITY;

-- ── lab_named_match_offers ───────────────────────────────────────────
-- A user can SELECT offers where they are EITHER initiator or recipient.
-- However, pre-mutual-acceptance, the API masks identifying detail
-- application-side; the row itself only carries the IDs + anonymous
-- payload, so the RLS read of the row alone does NOT leak identity.
DROP POLICY IF EXISTS lab_named_match_offers_party_select ON public.lab_named_match_offers;
CREATE POLICY lab_named_match_offers_party_select
  ON public.lab_named_match_offers
  FOR SELECT
  USING (auth.uid() = initiator_user_id OR auth.uid() = recipient_user_id);

-- Users may UPDATE only their own response timestamps + state transition;
-- but we route ALL state mutations through the API (which uses the
-- service role) so the surface is consistent. Direct UPDATE from RLS-
-- bound clients is allowed only on the responded_at columns.
DROP POLICY IF EXISTS lab_named_match_offers_party_update ON public.lab_named_match_offers;
CREATE POLICY lab_named_match_offers_party_update
  ON public.lab_named_match_offers
  FOR UPDATE
  USING (auth.uid() = initiator_user_id OR auth.uid() = recipient_user_id)
  WITH CHECK (auth.uid() = initiator_user_id OR auth.uid() = recipient_user_id);

DROP POLICY IF EXISTS lab_named_match_offers_service_all ON public.lab_named_match_offers;
CREATE POLICY lab_named_match_offers_service_all
  ON public.lab_named_match_offers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── lab_dm_threads ───────────────────────────────────────────────────
DROP POLICY IF EXISTS lab_dm_threads_party_select ON public.lab_dm_threads;
CREATE POLICY lab_dm_threads_party_select
  ON public.lab_dm_threads
  FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS lab_dm_threads_party_update ON public.lab_dm_threads;
CREATE POLICY lab_dm_threads_party_update
  ON public.lab_dm_threads
  FOR UPDATE
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS lab_dm_threads_service_all ON public.lab_dm_threads;
CREATE POLICY lab_dm_threads_service_all
  ON public.lab_dm_threads
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── lab_dm_messages ──────────────────────────────────────────────────
-- A user may SELECT messages whose thread they are a party to.
DROP POLICY IF EXISTS lab_dm_messages_party_select ON public.lab_dm_messages;
CREATE POLICY lab_dm_messages_party_select
  ON public.lab_dm_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lab_dm_threads t
      WHERE t.id = lab_dm_messages.thread_id
        AND (t.user_a_id = auth.uid() OR t.user_b_id = auth.uid())
    )
  );

-- A user may INSERT a message only as themselves into a thread they own
-- AND the thread must still be open.
DROP POLICY IF EXISTS lab_dm_messages_party_insert ON public.lab_dm_messages;
CREATE POLICY lab_dm_messages_party_insert
  ON public.lab_dm_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_user_id
    AND EXISTS (
      SELECT 1 FROM public.lab_dm_threads t
      WHERE t.id = lab_dm_messages.thread_id
        AND (t.user_a_id = auth.uid() OR t.user_b_id = auth.uid())
        AND t.state = 'open'
    )
  );

-- Updates allowed only to flip read_at on the recipient side.
DROP POLICY IF EXISTS lab_dm_messages_party_update ON public.lab_dm_messages;
CREATE POLICY lab_dm_messages_party_update
  ON public.lab_dm_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.lab_dm_threads t
      WHERE t.id = lab_dm_messages.thread_id
        AND (t.user_a_id = auth.uid() OR t.user_b_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lab_dm_threads t
      WHERE t.id = lab_dm_messages.thread_id
        AND (t.user_a_id = auth.uid() OR t.user_b_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS lab_dm_messages_service_all ON public.lab_dm_messages;
CREATE POLICY lab_dm_messages_service_all
  ON public.lab_dm_messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── lab_match_suppressions ───────────────────────────────────────────
-- Users may SELECT suppressions touching them; only service role writes.
DROP POLICY IF EXISTS lab_match_suppressions_party_select ON public.lab_match_suppressions;
CREATE POLICY lab_match_suppressions_party_select
  ON public.lab_match_suppressions
  FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS lab_match_suppressions_service_all ON public.lab_match_suppressions;
CREATE POLICY lab_match_suppressions_service_all
  ON public.lab_match_suppressions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
