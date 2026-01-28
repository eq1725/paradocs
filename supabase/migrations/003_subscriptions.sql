-- Migration: Subscription Tiers and User Dashboard
-- Description: Adds subscription management, usage tracking, and dashboard support

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE subscription_status AS ENUM (
  'active',
  'cancelled',
  'expired',
  'trial',
  'past_due'
);

-- ============================================
-- SUBSCRIPTION TIERS TABLE
-- ============================================

CREATE TABLE public.subscription_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10, 2) DEFAULT 0,
  price_yearly DECIMAL(10, 2) DEFAULT 0,
  features JSONB DEFAULT '{}',
  limits JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default tiers
INSERT INTO public.subscription_tiers (name, display_name, description, price_monthly, price_yearly, features, limits, is_default, sort_order) VALUES
(
  'free',
  'Free',
  'Perfect for casual browsers and researchers getting started',
  0,
  0,
  '{
    "my_reports": true,
    "saved_reports": true,
    "personal_analytics": "basic",
    "ai_insights": "view_only",
    "alerts": false,
    "data_export": false,
    "api_access": false,
    "custom_reports": false,
    "team_members": false,
    "priority_support": false
  }',
  '{
    "reports_per_month": 5,
    "saved_reports_max": 10,
    "api_calls_per_month": 0,
    "team_members_max": 0
  }',
  true,
  0
),
(
  'basic',
  'Basic',
  'For active enthusiasts who want more access',
  9.00,
  90.00,
  '{
    "my_reports": true,
    "saved_reports": true,
    "personal_analytics": "full",
    "ai_insights": true,
    "alerts": "email",
    "data_export": false,
    "api_access": false,
    "custom_reports": false,
    "team_members": false,
    "priority_support": false
  }',
  '{
    "reports_per_month": 25,
    "saved_reports_max": 100,
    "api_calls_per_month": 0,
    "team_members_max": 0
  }',
  false,
  1
),
(
  'pro',
  'Pro',
  'For serious investigators who need full access',
  29.00,
  290.00,
  '{
    "my_reports": true,
    "saved_reports": true,
    "personal_analytics": "full",
    "ai_insights": "priority",
    "alerts": "all",
    "data_export": true,
    "api_access": true,
    "custom_reports": false,
    "team_members": false,
    "priority_support": true
  }',
  '{
    "reports_per_month": -1,
    "saved_reports_max": -1,
    "api_calls_per_month": 1000,
    "team_members_max": 0
  }',
  false,
  2
),
(
  'enterprise',
  'Enterprise',
  'For organizations and media requiring comprehensive access',
  99.00,
  990.00,
  '{
    "my_reports": true,
    "saved_reports": true,
    "personal_analytics": "full",
    "ai_insights": "priority",
    "alerts": "all",
    "data_export": "bulk",
    "api_access": true,
    "custom_reports": true,
    "team_members": true,
    "priority_support": "dedicated"
  }',
  '{
    "reports_per_month": -1,
    "saved_reports_max": -1,
    "api_calls_per_month": 10000,
    "team_members_max": 10
  }',
  false,
  3
);

-- ============================================
-- USER SUBSCRIPTIONS TABLE
-- ============================================

CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES public.subscription_tiers(id),
  status subscription_status DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  -- For future payment integration
  payment_provider VARCHAR(50),
  payment_customer_id VARCHAR(255),
  payment_subscription_id VARCHAR(255),
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one active subscription per user
  CONSTRAINT unique_active_subscription UNIQUE (user_id, status)
    WHERE (status = 'active')
);

-- Index for quick lookups
CREATE INDEX idx_user_subscriptions_user ON public.user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON public.user_subscriptions(status);

-- ============================================
-- USAGE TRACKING TABLE
-- ============================================

CREATE TABLE public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- Usage metrics
  reports_submitted INTEGER DEFAULT 0,
  reports_saved INTEGER DEFAULT 0,
  api_calls_made INTEGER DEFAULT 0,
  exports_made INTEGER DEFAULT 0,
  ai_insights_viewed INTEGER DEFAULT 0,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One record per user per period
  CONSTRAINT unique_user_period UNIQUE (user_id, period_start)
);

-- Index for quick lookups
CREATE INDEX idx_usage_tracking_user_period ON public.usage_tracking(user_id, period_start);

-- ============================================
-- BILLING HISTORY TABLE (Mock for now)
-- ============================================

CREATE TABLE public.billing_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.user_subscriptions(id),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  description TEXT,
  status VARCHAR(50) DEFAULT 'completed',
  invoice_url TEXT,
  payment_method VARCHAR(50),
  -- Timestamps
  billing_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_billing_history_user ON public.billing_history(user_id);

-- ============================================
-- UPDATE PROFILES TABLE
-- ============================================

-- Add subscription reference to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS current_tier_id UUID REFERENCES public.subscription_tiers(id);

-- Set default tier for existing and new users
UPDATE public.profiles
SET current_tier_id = (SELECT id FROM public.subscription_tiers WHERE is_default = true LIMIT 1)
WHERE current_tier_id IS NULL;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to get user's current subscription with tier details
CREATE OR REPLACE FUNCTION get_user_subscription(p_user_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  tier_name VARCHAR,
  tier_display_name VARCHAR,
  features JSONB,
  limits JSONB,
  status subscription_status,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    us.id as subscription_id,
    st.name as tier_name,
    st.display_name as tier_display_name,
    st.features,
    st.limits,
    us.status,
    us.expires_at
  FROM public.user_subscriptions us
  JOIN public.subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
  ORDER BY us.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get or create current period usage
CREATE OR REPLACE FUNCTION get_current_usage(p_user_id UUID)
RETURNS public.usage_tracking AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_usage public.usage_tracking;
BEGIN
  -- Calculate current billing period (1st of month to end of month)
  v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  v_period_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Try to get existing record
  SELECT * INTO v_usage
  FROM public.usage_tracking
  WHERE user_id = p_user_id
    AND period_start = v_period_start;

  -- Create if doesn't exist
  IF v_usage IS NULL THEN
    INSERT INTO public.usage_tracking (user_id, period_start, period_end)
    VALUES (p_user_id, v_period_start, v_period_end)
    RETURNING * INTO v_usage;
  END IF;

  RETURN v_usage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment usage counter
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_field VARCHAR,
  p_amount INTEGER DEFAULT 1
)
RETURNS BOOLEAN AS $$
DECLARE
  v_usage public.usage_tracking;
BEGIN
  v_usage := get_current_usage(p_user_id);

  EXECUTE format(
    'UPDATE public.usage_tracking SET %I = %I + $1, updated_at = NOW() WHERE id = $2',
    p_field, p_field
  ) USING p_amount, v_usage.id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can perform action based on limits
CREATE OR REPLACE FUNCTION check_user_limit(
  p_user_id UUID,
  p_limit_key VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
  v_limit INTEGER;
  v_current INTEGER;
  v_tier_limits JSONB;
BEGIN
  -- Get user's tier limits
  SELECT st.limits INTO v_tier_limits
  FROM public.profiles p
  JOIN public.subscription_tiers st ON p.current_tier_id = st.id
  WHERE p.id = p_user_id;

  -- Get the specific limit (-1 means unlimited)
  v_limit := (v_tier_limits->>p_limit_key)::INTEGER;

  IF v_limit = -1 THEN
    RETURN true;
  END IF;

  -- Get current usage
  SELECT
    CASE p_limit_key
      WHEN 'reports_per_month' THEN reports_submitted
      WHEN 'saved_reports_max' THEN reports_saved
      WHEN 'api_calls_per_month' THEN api_calls_made
      ELSE 0
    END INTO v_current
  FROM get_current_usage(p_user_id);

  RETURN v_current < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to create subscription when user is created
CREATE OR REPLACE FUNCTION create_default_subscription()
RETURNS TRIGGER AS $$
DECLARE
  v_default_tier_id UUID;
BEGIN
  -- Get default tier
  SELECT id INTO v_default_tier_id
  FROM public.subscription_tiers
  WHERE is_default = true
  LIMIT 1;

  -- Update profile with default tier
  UPDATE public.profiles
  SET current_tier_id = v_default_tier_id
  WHERE id = NEW.id;

  -- Create subscription record
  INSERT INTO public.user_subscriptions (user_id, tier_id, status)
  VALUES (NEW.id, v_default_tier_id, 'active');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to profiles table
DROP TRIGGER IF EXISTS on_profile_created_subscription ON public.profiles;
CREATE TRIGGER on_profile_created_subscription
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_default_subscription();

-- Update timestamp trigger
CREATE TRIGGER update_subscription_tiers_updated_at
  BEFORE UPDATE ON public.subscription_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_usage_tracking_updated_at
  BEFORE UPDATE ON public.usage_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Subscription Tiers (public read)
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active subscription tiers"
  ON public.subscription_tiers FOR SELECT
  USING (is_active = true);

-- User Subscriptions (users see their own)
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
  ON public.user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions"
  ON public.user_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- Usage Tracking (users see their own)
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
  ON public.usage_tracking FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage usage"
  ON public.usage_tracking FOR ALL
  USING (auth.role() = 'service_role');

-- Billing History (users see their own)
ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own billing history"
  ON public.billing_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage billing"
  ON public.billing_history FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT ON public.subscription_tiers TO anon, authenticated;
GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT SELECT ON public.usage_tracking TO authenticated;
GRANT SELECT ON public.billing_history TO authenticated;

GRANT ALL ON public.subscription_tiers TO service_role;
GRANT ALL ON public.user_subscriptions TO service_role;
GRANT ALL ON public.usage_tracking TO service_role;
GRANT ALL ON public.billing_history TO service_role;
