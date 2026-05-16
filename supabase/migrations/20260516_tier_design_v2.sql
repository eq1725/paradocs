-- Migration: Tier Design v2
--
-- Updates subscription_tiers (free / basic / pro) to match the
-- panel-reviewed tier design locked in docs/TIER_DESIGN_V2.md (Track E
-- task E0.5). Also adds free-trial config column to subscription_tiers
-- and trial-tracking columns to user_subscriptions.
--
-- Key changes vs. the original 003_subscriptions.sql + 011_fix seed:
--   - Free tier: removed 5-reports-per-month cap (now unlimited),
--     removed 10-saves-max cap (now unlimited). Added new limits:
--     story_analysis_max=1 (first-experience hook),
--     ask_questions_per_day=2 (Sonnet cost control),
--     constellation_unlocks_max=5 (existing PaywallModal gate).
--   - Basic tier: repriced to $5.99/mo or $59.88/yr. Added
--     story_analysis=unlimited, ask_the_unknown=unlimited,
--     signal_alerts_push=true, email_digest=daily,
--     constellation_unlocks=unlimited, comparative_story=false,
--     sonnet_model_priority=fallback. 7-day free trial offered.
--   - Pro tier: repriced to $14.99/mo or $149.88/yr. Added
--     comparative_story=true, sonnet_model_priority=primary,
--     early_access=true. Kept existing data_export, api_access,
--     bulk_import, priority_support.
--   - Enterprise tier: unchanged (admin-only).
--
-- Backward compat: keeps existing feature keys (alerts, custom_reports,
-- team_members, ai_insights) so old code paths keep working. New keys
-- added alongside, not replacing.

-- ============================================
-- Schema: add free-trial config column
-- ============================================

ALTER TABLE public.subscription_tiers
  ADD COLUMN IF NOT EXISTS free_trial_days INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.subscription_tiers.free_trial_days IS
  'Number of days of free trial offered when a user activates this tier '
  'for the first time. 0 = no trial. Trial activation logic lives in '
  'app code (T1.8 account-first onboarding hook), not in the DB.';

-- ============================================
-- Schema: add trial tracking to user_subscriptions
-- ============================================

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_subscriptions.trial_started_at IS
  'Timestamp the free trial period began. NULL for non-trial subscriptions.';

COMMENT ON COLUMN public.user_subscriptions.trial_ends_at IS
  'Timestamp the free trial period ends. After this, subscription either '
  'auto-converts to paid (if payment method on file) or drops to free tier.';

COMMENT ON COLUMN public.user_subscriptions.is_trial IS
  'True while the user is in the trial period. Flipped to false on '
  'trial conversion to paid or trial expiration to free.';

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_trial
  ON public.user_subscriptions(trial_ends_at)
  WHERE is_trial = true;

-- ============================================
-- Free tier: update to v2 spec
-- ============================================

UPDATE public.subscription_tiers
SET
  display_name = 'Free',
  description = 'Explore the archive, submit your experiences, and try one full AI Story analysis.',
  price_monthly = 0,
  price_yearly = 0,
  free_trial_days = 0,
  features = jsonb_build_object(
    -- Existing keys (preserved for backward-compat)
    'my_reports', true,
    'saved_reports', true,
    'personal_analytics', 'basic',
    'ai_insights', 'view_only',
    'alerts', false,
    'data_export', false,
    'api_access', false,
    'custom_reports', false,
    'team_members', false,
    'priority_support', false,
    'analytics_dashboard', false,
    'advanced_search', false,
    'bulk_import', false,
    -- New v2 keys
    'story_analysis', 'first_only',
    'ask_the_unknown', 'limited',
    'signal_alerts_push', false,
    'email_digest', 'weekly',
    'constellation_unlocks', 'limited',
    'comparative_story', false,
    'sonnet_model_priority', 'fallback',
    'early_access', false
  ),
  limits = jsonb_build_object(
    -- Existing keys: removed punitive caps per panel review
    'reports_per_month', -1,
    'saved_reports_max', -1,
    'api_calls_per_month', 0,
    'team_members_max', 0,
    -- New v2 keys
    'story_analysis_max', 1,
    'ask_questions_per_day', 2,
    'constellation_unlocks_max', 5
  ),
  is_default = true,
  is_active = true,
  sort_order = 0,
  updated_at = NOW()
WHERE name = 'free';

-- ============================================
-- Basic tier: update to v2 spec ($5.99 / $59.88)
-- ============================================

UPDATE public.subscription_tiers
SET
  display_name = 'Basic',
  description = 'Unlimited AI Story analysis on every experience, daily Signal Alerts, and the full search toolkit.',
  price_monthly = 5.99,
  price_yearly = 59.88,
  free_trial_days = 7,
  features = jsonb_build_object(
    'my_reports', true,
    'saved_reports', true,
    'personal_analytics', 'full',
    'ai_insights', true,
    'alerts', 'all',
    'data_export', false,
    'api_access', false,
    'custom_reports', false,
    'team_members', false,
    'priority_support', false,
    'analytics_dashboard', true,
    'advanced_search', true,
    'bulk_import', false,
    'story_analysis', 'unlimited',
    'ask_the_unknown', 'unlimited',
    'signal_alerts_push', true,
    'email_digest', 'daily',
    'constellation_unlocks', 'unlimited',
    'comparative_story', false,
    'sonnet_model_priority', 'fallback',
    'early_access', false
  ),
  limits = jsonb_build_object(
    'reports_per_month', -1,
    'saved_reports_max', -1,
    'api_calls_per_month', 0,
    'team_members_max', 0,
    'story_analysis_max', -1,
    'ask_questions_per_day', -1,
    'constellation_unlocks_max', -1
  ),
  is_default = false,
  is_active = true,
  sort_order = 1,
  updated_at = NOW()
WHERE name = 'basic';

-- Insert Basic if it doesn't already exist (defensive for fresh installs)
INSERT INTO public.subscription_tiers (
  name, display_name, description,
  price_monthly, price_yearly, free_trial_days,
  features, limits, is_default, is_active, sort_order
)
SELECT
  'basic', 'Basic',
  'Unlimited AI Story analysis on every experience, daily Signal Alerts, and the full search toolkit.',
  5.99, 59.88, 7,
  jsonb_build_object(
    'my_reports', true, 'saved_reports', true, 'personal_analytics', 'full',
    'ai_insights', true, 'alerts', 'all', 'data_export', false, 'api_access', false,
    'custom_reports', false, 'team_members', false, 'priority_support', false,
    'analytics_dashboard', true, 'advanced_search', true, 'bulk_import', false,
    'story_analysis', 'unlimited', 'ask_the_unknown', 'unlimited',
    'signal_alerts_push', true, 'email_digest', 'daily',
    'constellation_unlocks', 'unlimited', 'comparative_story', false,
    'sonnet_model_priority', 'fallback', 'early_access', false
  ),
  jsonb_build_object(
    'reports_per_month', -1, 'saved_reports_max', -1,
    'api_calls_per_month', 0, 'team_members_max', 0,
    'story_analysis_max', -1, 'ask_questions_per_day', -1,
    'constellation_unlocks_max', -1
  ),
  false, true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_tiers WHERE name = 'basic');

-- ============================================
-- Pro tier: update to v2 spec ($14.99 / $149.88)
-- ============================================

UPDATE public.subscription_tiers
SET
  display_name = 'Pro',
  description = 'Comparative Story mode, primary Sonnet 4.6, data export, API access, and priority support — for serious researchers.',
  price_monthly = 14.99,
  price_yearly = 149.88,
  free_trial_days = 0,
  features = jsonb_build_object(
    'my_reports', true,
    'saved_reports', true,
    'personal_analytics', 'full',
    'ai_insights', 'priority',
    'alerts', 'all',
    'data_export', true,
    'api_access', true,
    'custom_reports', false,
    'team_members', false,
    'priority_support', true,
    'analytics_dashboard', true,
    'advanced_search', true,
    'bulk_import', true,
    'story_analysis', 'unlimited',
    'ask_the_unknown', 'unlimited',
    'signal_alerts_push', true,
    'email_digest', 'daily',
    'constellation_unlocks', 'unlimited',
    'comparative_story', true,
    'sonnet_model_priority', 'primary',
    'early_access', true
  ),
  limits = jsonb_build_object(
    'reports_per_month', -1,
    'saved_reports_max', -1,
    'api_calls_per_month', 1000,
    'team_members_max', 0,
    'story_analysis_max', -1,
    'ask_questions_per_day', -1,
    'constellation_unlocks_max', -1
  ),
  is_default = false,
  is_active = true,
  sort_order = 2,
  updated_at = NOW()
WHERE name = 'pro';

-- ============================================
-- Enterprise tier: unchanged, ensure new keys exist with sensible defaults
-- ============================================

UPDATE public.subscription_tiers
SET
  features = features || jsonb_build_object(
    'story_analysis', 'unlimited',
    'ask_the_unknown', 'unlimited',
    'signal_alerts_push', true,
    'email_digest', 'daily',
    'constellation_unlocks', 'unlimited',
    'comparative_story', true,
    'sonnet_model_priority', 'primary',
    'early_access', true
  ),
  limits = limits || jsonb_build_object(
    'story_analysis_max', -1,
    'ask_questions_per_day', -1,
    'constellation_unlocks_max', -1
  ),
  updated_at = NOW()
WHERE name = 'enterprise';

-- ============================================
-- Verification queries (run manually after deploy)
-- ============================================
--
-- 1. Confirm all customer-facing tiers are present with correct prices:
--    SELECT name, display_name, price_monthly, price_yearly, free_trial_days
--    FROM subscription_tiers WHERE is_active = true ORDER BY sort_order;
--
-- 2. Confirm features.story_analysis is set on every active tier:
--    SELECT name, features->'story_analysis', limits->'ask_questions_per_day'
--    FROM subscription_tiers WHERE is_active = true ORDER BY sort_order;
--
-- 3. Confirm no user_subscriptions has is_trial=true from before this migration:
--    SELECT count(*) FROM user_subscriptions WHERE is_trial = true;
--    Expected: 0 (the trial column is new).
