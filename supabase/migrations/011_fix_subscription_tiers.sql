-- Migration: Fix Subscription Tiers Data
-- Description: Updates subscription_tiers to match expected TypeScript types
-- The TierName type expects: 'free' | 'basic' | 'pro' | 'enterprise'

-- First, check what tiers exist and update them accordingly
-- This is safer than delete+reinsert as it preserves foreign key references

-- Update 'researcher' tier to 'basic' if it exists
UPDATE public.subscription_tiers
SET
  name = 'basic',
  display_name = 'Basic',
  description = 'For active enthusiasts who want more access',
  price_monthly = 9.00,
  price_yearly = 90.00,
  features = '{
    "my_reports": true,
    "saved_reports": true,
    "personal_analytics": "full",
    "ai_insights": true,
    "alerts": "email",
    "data_export": false,
    "api_access": false,
    "custom_reports": false,
    "team_members": false,
    "priority_support": false,
    "analytics_dashboard": true,
    "advanced_search": true,
    "bulk_import": false
  }',
  limits = '{
    "reports_per_month": 25,
    "saved_reports_max": 100,
    "api_calls_per_month": 0,
    "team_members_max": 0
  }',
  sort_order = 1,
  updated_at = NOW()
WHERE name = 'researcher';

-- Ensure 'free' tier has correct settings
UPDATE public.subscription_tiers
SET
  display_name = 'Free',
  description = 'Perfect for casual browsers and researchers getting started',
  price_monthly = 0,
  price_yearly = 0,
  features = '{
    "my_reports": true,
    "saved_reports": true,
    "personal_analytics": "basic",
    "ai_insights": "view_only",
    "alerts": false,
    "data_export": false,
    "api_access": false,
    "custom_reports": false,
    "team_members": false,
    "priority_support": false,
    "analytics_dashboard": false,
    "advanced_search": false,
    "bulk_import": false
  }',
  limits = '{
    "reports_per_month": 5,
    "saved_reports_max": 10,
    "api_calls_per_month": 0,
    "team_members_max": 0
  }',
  is_default = true,
  sort_order = 0,
  updated_at = NOW()
WHERE name = 'free';

-- Ensure 'pro' tier has correct settings
UPDATE public.subscription_tiers
SET
  display_name = 'Pro',
  description = 'For serious investigators who need full access',
  price_monthly = 29.00,
  price_yearly = 290.00,
  features = '{
    "my_reports": true,
    "saved_reports": true,
    "personal_analytics": "full",
    "ai_insights": "priority",
    "alerts": "all",
    "data_export": true,
    "api_access": true,
    "custom_reports": false,
    "team_members": false,
    "priority_support": true,
    "analytics_dashboard": true,
    "advanced_search": true,
    "bulk_import": true
  }',
  limits = '{
    "reports_per_month": -1,
    "saved_reports_max": -1,
    "api_calls_per_month": 1000,
    "team_members_max": 0
  }',
  sort_order = 2,
  updated_at = NOW()
WHERE name = 'pro';

-- Ensure 'enterprise' tier has correct settings
UPDATE public.subscription_tiers
SET
  display_name = 'Enterprise',
  description = 'For organizations and media requiring comprehensive access',
  price_monthly = 99.00,
  price_yearly = 990.00,
  features = '{
    "my_reports": true,
    "saved_reports": true,
    "personal_analytics": "full",
    "ai_insights": "priority",
    "alerts": "all",
    "data_export": "bulk",
    "api_access": true,
    "custom_reports": true,
    "team_members": true,
    "priority_support": "dedicated",
    "analytics_dashboard": true,
    "advanced_search": true,
    "bulk_import": true
  }',
  limits = '{
    "reports_per_month": -1,
    "saved_reports_max": -1,
    "api_calls_per_month": 10000,
    "team_members_max": 10
  }',
  sort_order = 3,
  updated_at = NOW()
WHERE name = 'enterprise';

-- Insert 'basic' tier if it doesn't exist (when 'researcher' didn't exist either)
INSERT INTO public.subscription_tiers (name, display_name, description, price_monthly, price_yearly, features, limits, is_default, sort_order)
SELECT 'basic', 'Basic', 'For active enthusiasts who want more access', 9.00, 90.00,
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
    "priority_support": false,
    "analytics_dashboard": true,
    "advanced_search": true,
    "bulk_import": false
  }',
  '{
    "reports_per_month": 25,
    "saved_reports_max": 100,
    "api_calls_per_month": 0,
    "team_members_max": 0
  }',
  false, 1
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_tiers WHERE name = 'basic');
