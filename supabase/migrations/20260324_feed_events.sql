-- Migration: Feed Events + Feed Config
-- Date: March 24, 2026
-- Purpose: Behavioral signal collection for algorithmic feed ranking
--
-- Creates:
--   1. feed_events — stores every impression, dwell, tap, save, share, scroll_depth, swipe_related
--   2. feed_config — tuneable ranking weights and feature flags
--   3. category_engagement — materialized view of category-level engagement rates
--   4. user_usage — tracks daily/weekly/monthly usage for depth gating

-- ============================================================
-- 1. FEED EVENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS feed_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  card_id text NOT NULL,
  card_type text NOT NULL,
  phenomenon_category text,
  event_type text NOT NULL,
  duration_ms integer,
  scroll_depth_pct integer,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes for analytics queries
CREATE INDEX idx_feed_events_user_session ON feed_events (user_id, session_id, created_at DESC);
CREATE INDEX idx_feed_events_card ON feed_events (card_id, event_type, created_at DESC);
CREATE INDEX idx_feed_events_category_type ON feed_events (phenomenon_category, event_type, created_at DESC);
CREATE INDEX idx_feed_events_created ON feed_events (created_at DESC);

-- RLS: users can insert their own events, only admins can read
ALTER TABLE feed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own events" ON feed_events
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins can read all events" ON feed_events
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- ============================================================
-- 2. FEED CONFIG TABLE (tuneable ranking weights)
-- ============================================================

CREATE TABLE IF NOT EXISTS feed_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO feed_config (key, value) VALUES
  ('ranking_weights', '{"engagement": 1.0, "recency": 0.8, "affinity": 1.2, "diversity": 1.0, "explore": 0.3}'),
  ('max_consecutive_same_category', '3'),
  ('recency_boost_days', '7'),
  ('cold_start_base_score', '50'),
  ('depth_gate_free_views', '3'),
  ('ask_unknown_free_weekly', '1')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 3. CATEGORY ENGAGEMENT MATERIALIZED VIEW
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS category_engagement AS
SELECT
  phenomenon_category,
  count(*) FILTER (WHERE event_type = 'tap') as taps,
  count(*) FILTER (WHERE event_type = 'impression') as impressions,
  CASE WHEN count(*) FILTER (WHERE event_type = 'impression') > 0
    THEN count(*) FILTER (WHERE event_type = 'tap')::numeric /
         count(*) FILTER (WHERE event_type = 'impression')
    ELSE 0 END as tap_rate,
  avg(duration_ms) FILTER (WHERE event_type = 'dwell' AND duration_ms > 500) as avg_dwell_ms,
  count(*) FILTER (WHERE event_type = 'save') as saves,
  count(*) FILTER (WHERE event_type = 'share') as shares
FROM feed_events
WHERE created_at > now() - interval '30 days'
GROUP BY phenomenon_category;

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_category_engagement_cat ON category_engagement (phenomenon_category);

-- ============================================================
-- 4. USER USAGE TABLE (depth gating)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  case_views integer DEFAULT 0,
  ai_searches integer DEFAULT 0,
  ask_unknown_count integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, usage_date)
);

CREATE INDEX idx_user_usage_user_date ON user_usage (user_id, usage_date DESC);

ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage" ON user_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own usage" ON user_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage" ON user_usage
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all usage" ON user_usage
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );
