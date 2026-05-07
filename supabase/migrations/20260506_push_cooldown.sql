-- =====================================================================
-- V9.4.10 — push cooldown: track last_active_at on push_subscriptions
-- so /api/push/send-daily-lead can skip users who opened the app
-- recently. Avoids the "I'm already reading and you're pinging me
-- about today's lead" noise.
-- =====================================================================

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Index supports the cooldown query: WHERE last_active_at IS NULL
-- OR last_active_at < NOW() - INTERVAL '4 hours'.
CREATE INDEX IF NOT EXISTS push_subs_last_active_idx
  ON push_subscriptions(last_active_at)
  WHERE is_active = TRUE;

COMMENT ON COLUMN push_subscriptions.last_active_at IS
  'V9.4.10 last time the user opened a Paradocs surface (set via /api/push/heartbeat from /discover mount). The daily push send filters out subs where this is < 4 hours ago.';
