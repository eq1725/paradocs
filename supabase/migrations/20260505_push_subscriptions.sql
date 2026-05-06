-- =====================================================================
-- V9.4 — push_subscriptions table for Web Push API delivery.
--
-- Stores per-device subscription endpoints (PushSubscription objects
-- from the browser's Push API). One user can have many subscriptions
-- (phone PWA, desktop browser, etc.). One row per (user_id, endpoint)
-- pair to avoid duplicates if the user re-subscribes.
--
-- Anonymous subscriptions allowed (user_id NULL) for users who opt
-- in before signing up. When they sign in, the bootstrap endpoint
-- can claim their subscriptions.
-- =====================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Anonymous client identifier (browser localStorage UUID) used to
  -- claim subscriptions when a previously anonymous user signs in.
  anon_client_id TEXT,
  -- The endpoint URL is unique across the web — use it as the
  -- dedup key.
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_secret TEXT NOT NULL,
  -- Optional metadata for debugging
  user_agent TEXT,
  -- Subscription preferences
  topics TEXT[] DEFAULT ARRAY['daily_lead'],
  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subs_user_active_idx
  ON push_subscriptions(user_id, is_active)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS push_subs_anon_active_idx
  ON push_subscriptions(anon_client_id, is_active)
  WHERE is_active = TRUE AND user_id IS NULL;

COMMENT ON TABLE push_subscriptions IS
  'V9.4 Web Push API subscriptions. One row per device endpoint. Anonymous (user_id NULL) allowed; claimed on sign-in via anon_client_id match. consecutive_failures auto-disables after 5 to skip dead endpoints.';
