-- Migration: user_notifications table
--
-- T1.9 — Notifications center MVP. Captures every notification sent to
-- a user (Signal Alerts push, weekly/daily digest email, trial-state
-- transitions, etc.) into a queryable per-user log so the bell icon +
-- dropdown can render "what we've notified you about" without each
-- channel needing its own logging table.
--
-- Schema is intentionally narrow for MVP. No unread state, no read
-- receipts (per spec: "MVP: read-only, no unread state"). Add those
-- columns when the UI evolves to need them.
--
-- Producers (kept in sync as part of T1.9):
--   - src/pages/api/cron/signal-alerts.ts (inserts on push send)
--   - src/pages/api/cron/signal-digest-email.ts (inserts on email send)
--   - src/pages/api/subscription/activate-trial.ts (could insert on
--     trial activation — left to a follow-up if useful)
-- Consumer:
--   - src/pages/api/notifications/recent.ts (GET, returns last 10)
--   - src/components/NotificationsBell.tsx (dropdown UI)

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link_url   TEXT,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_notifications IS
  'T1.9 notifications center log. One row per notification surfaced to a user. Read-only at MVP — no unread state. Producers: signal-alerts cron, signal-digest-email cron, future trial / billing / admin channels.';

COMMENT ON COLUMN public.user_notifications.type IS
  'Channel/event identifier. Conventional values: signal_alert, signal_digest, trial_activated, trial_ending, admin_message, billing_event.';

COMMENT ON COLUMN public.user_notifications.link_url IS
  'Deep link the notification should navigate to when tapped. NULL for notifications with no destination.';

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON public.user_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_type
  ON public.user_notifications(type);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own notifications"
  ON public.user_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages notifications"
  ON public.user_notifications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;
