-- ============================================================
-- V11.17.40 — Lab promo impression tracking
-- ============================================================
--
-- Backlog #4: replaces the localStorage-only dismiss counter
-- (`today_promo_dismissals_v1`) with server-side per-user/session
-- impression telemetry so the cadence + cap + cooldown logic
-- works across devices and sessions.
--
-- Events tracked:
--   shown         — LabPromo card mounted into the active feed slot
--   dismissed     — user swiped-left or tapped the X on the card
--   clicked       — user tapped the "Start 7-day free trial" CTA
--                   (treated as the paywall-view signal for cooldown)
--   paywall_view  — reserved for future explicit /pricing view hook
--
-- Cadence rules (server-side):
--   - 4+ saves in last 7d         → cadence = 12 (every 12th feed card)
--   - Otherwise (incl. anon)      → cadence = 25
--   - Hard cap                     6 shown / 7d
--   - 48h cooldown after dismissed
--   - 7d cooldown after clicked OR paywall_view
--
-- Anon users carry a `session_id` (uuid stored client-side in
-- localStorage 'lab_promo_session_v1'). Authed users get user_id;
-- session_id is still allowed alongside for migration continuity.

CREATE TABLE IF NOT EXISTS public.lab_promo_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('shown', 'dismissed', 'clicked', 'paywall_view')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT lab_promo_user_or_session CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

-- Time-windowed lookups: count shown in last 7d, latest dismissed,
-- latest clicked — these all need (subject, occurred_at DESC).
CREATE INDEX IF NOT EXISTS idx_lab_promo_user_time
  ON public.lab_promo_impressions (user_id, occurred_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lab_promo_session_time
  ON public.lab_promo_impressions (session_id, occurred_at DESC)
  WHERE session_id IS NOT NULL;

-- Event-type partial indexes for the cooldown LATEST queries
-- (dismissed / clicked / paywall_view are rare events; this
-- skinny index makes the windowed MAX(occurred_at) lookup cheap).
CREATE INDEX IF NOT EXISTS idx_lab_promo_user_event_time
  ON public.lab_promo_impressions (user_id, event_type, occurred_at DESC)
  WHERE user_id IS NOT NULL AND event_type IN ('dismissed', 'clicked', 'paywall_view');

CREATE INDEX IF NOT EXISTS idx_lab_promo_session_event_time
  ON public.lab_promo_impressions (session_id, event_type, occurred_at DESC)
  WHERE session_id IS NOT NULL AND event_type IN ('dismissed', 'clicked', 'paywall_view');

-- RLS — service role bypasses; authed users can read their own; anon
-- writes happen via the service role via the API route.
ALTER TABLE public.lab_promo_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_promo_select_own"
  ON public.lab_promo_impressions
  FOR SELECT
  USING (auth.uid() = user_id);

-- No direct INSERT policy: the API route uses the service role key
-- and validates user identity from the auth token. Anon writes by
-- session_id are also routed through the API.

COMMENT ON TABLE public.lab_promo_impressions IS
  'V11.17.40 lab upsell card impression telemetry. Powers the cadence + cap + cooldown logic in /api/lab/promo/should-show.';
