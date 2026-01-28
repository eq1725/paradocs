-- ParaDocs Database Migration: Collections, Saved Searches & Subscriptions
-- Adds features for research tools and subscription management

-- ============================================
-- SUBSCRIPTION TIERS
-- ============================================

CREATE TABLE public.subscription_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10, 2) DEFAULT 0,
  price_yearly DECIMAL(10, 2) DEFAULT 0,
  features JSONB NOT NULL DEFAULT '{}',
  limits JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed subscription tiers
INSERT INTO public.subscription_tiers (name, display_name, description, price_monthly, price_yearly, features, limits, is_default, sort_order) VALUES
(
  'free',
  'Explorer',
  'Perfect for casual browsing and discovery',
  0, 0,
  '{
    "browse_reports": true,
    "submit_reports": true,
    "saved_reports": true,
    "collections": false,
    "collection_notes": false,
    "collection_tags": false,
    "basic_search": true,
    "advanced_filters": false,
    "saved_searches": false,
    "email_alerts": false,
    "public_heatmap": true,
    "interactive_analytics": false,
    "custom_visualizations": false,
    "pattern_recognition": false,
    "report_comparison": false,
    "ai_insights": true,
    "ai_similar_reports": false,
    "ai_natural_language_search": false,
    "export_csv": false,
    "export_pdf": false,
    "bulk_export": false,
    "api_access": false,
    "share_collections": false,
    "collaborate": false,
    "priority_support": false
  }',
  '{
    "saved_reports_max": 25,
    "collections_max": 0,
    "saved_searches_max": 0,
    "ai_queries_per_month": 5,
    "api_calls_per_month": 0,
    "exports_per_month": 0,
    "collaborators_per_collection": 0
  }',
  TRUE, 0
),
(
  'pro',
  'Investigator',
  'For serious researchers who need powerful tools',
  9, 90,
  '{
    "browse_reports": true,
    "submit_reports": true,
    "saved_reports": true,
    "collections": true,
    "collection_notes": true,
    "collection_tags": true,
    "basic_search": true,
    "advanced_filters": true,
    "saved_searches": true,
    "email_alerts": true,
    "public_heatmap": true,
    "interactive_analytics": true,
    "custom_visualizations": false,
    "pattern_recognition": false,
    "report_comparison": false,
    "ai_insights": true,
    "ai_similar_reports": true,
    "ai_natural_language_search": false,
    "export_csv": true,
    "export_pdf": true,
    "bulk_export": false,
    "api_access": false,
    "share_collections": false,
    "collaborate": false,
    "priority_support": false
  }',
  '{
    "saved_reports_max": -1,
    "collections_max": 10,
    "saved_searches_max": 5,
    "ai_queries_per_month": 50,
    "api_calls_per_month": 0,
    "exports_per_month": 50,
    "collaborators_per_collection": 0
  }',
  FALSE, 1
),
(
  'researcher',
  'Researcher',
  'Full access for academic and professional research',
  19, 190,
  '{
    "browse_reports": true,
    "submit_reports": true,
    "saved_reports": true,
    "collections": true,
    "collection_notes": true,
    "collection_tags": true,
    "basic_search": true,
    "advanced_filters": true,
    "saved_searches": true,
    "email_alerts": true,
    "public_heatmap": true,
    "interactive_analytics": true,
    "custom_visualizations": true,
    "pattern_recognition": true,
    "report_comparison": true,
    "ai_insights": true,
    "ai_similar_reports": true,
    "ai_natural_language_search": true,
    "export_csv": true,
    "export_pdf": true,
    "bulk_export": true,
    "api_access": true,
    "share_collections": true,
    "collaborate": true,
    "priority_support": true
  }',
  '{
    "saved_reports_max": -1,
    "collections_max": -1,
    "saved_searches_max": -1,
    "ai_queries_per_month": 500,
    "api_calls_per_month": 10000,
    "exports_per_month": -1,
    "collaborators_per_collection": 10
  }',
  FALSE, 2
);

-- ============================================
-- USER SUBSCRIPTIONS
-- ============================================

CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier_id UUID REFERENCES public.subscription_tiers(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'trial', 'past_due')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_subscriptions_user ON public.user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON public.user_subscriptions(status);

-- ============================================
-- USAGE TRACKING
-- ============================================

CREATE TABLE public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  reports_saved INTEGER DEFAULT 0,
  collections_created INTEGER DEFAULT 0,
  saved_searches_created INTEGER DEFAULT 0,
  ai_queries_made INTEGER DEFAULT 0,
  api_calls_made INTEGER DEFAULT 0,
  exports_made INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_period UNIQUE (user_id, period_start)
);

CREATE INDEX idx_usage_tracking_user ON public.usage_tracking(user_id);
CREATE INDEX idx_usage_tracking_period ON public.usage_tracking(period_start);

-- ============================================
-- BILLING HISTORY
-- ============================================

CREATE TABLE public.billing_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method TEXT,
  stripe_payment_intent_id TEXT,
  invoice_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_billing_history_user ON public.billing_history(user_id);

-- ============================================
-- COLLECTIONS
-- ============================================

CREATE TABLE public.collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1', -- Default indigo
  icon TEXT DEFAULT 'folder',
  is_public BOOLEAN DEFAULT FALSE,
  report_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_collection_slug UNIQUE (user_id, slug)
);

CREATE INDEX idx_collections_user ON public.collections(user_id);
CREATE INDEX idx_collections_public ON public.collections(is_public) WHERE is_public = TRUE;

-- ============================================
-- COLLECTION REPORTS (many-to-many)
-- ============================================

CREATE TABLE public.collection_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  user_notes TEXT,
  tags TEXT[] DEFAULT '{}',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_collection_report UNIQUE (collection_id, report_id)
);

CREATE INDEX idx_collection_reports_collection ON public.collection_reports(collection_id);
CREATE INDEX idx_collection_reports_report ON public.collection_reports(report_id);
CREATE INDEX idx_collection_reports_tags ON public.collection_reports USING GIN(tags);

-- Update collection report count trigger
CREATE OR REPLACE FUNCTION update_collection_report_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.collections SET report_count = report_count + 1, updated_at = NOW() WHERE id = NEW.collection_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.collections SET report_count = report_count - 1, updated_at = NOW() WHERE id = OLD.collection_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_collection_report_count_trigger
  AFTER INSERT OR DELETE ON public.collection_reports
  FOR EACH ROW EXECUTE FUNCTION update_collection_report_count();

-- ============================================
-- COLLECTION COLLABORATORS
-- ============================================

CREATE TABLE public.collection_collaborators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
  invited_by UUID REFERENCES public.profiles(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_collection_collaborator UNIQUE (collection_id, user_id)
);

CREATE INDEX idx_collection_collaborators_collection ON public.collection_collaborators(collection_id);
CREATE INDEX idx_collection_collaborators_user ON public.collection_collaborators(user_id);

-- ============================================
-- SAVED SEARCHES
-- ============================================

CREATE TABLE public.saved_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Search criteria (stored as JSON for flexibility)
  search_query TEXT, -- Full-text search query
  filters JSONB DEFAULT '{}', -- Category, date range, location, etc.

  -- Alert settings
  alerts_enabled BOOLEAN DEFAULT FALSE,
  alert_frequency TEXT DEFAULT 'daily' CHECK (alert_frequency IN ('immediate', 'daily', 'weekly')),
  last_alert_sent_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  new_results_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_user ON public.saved_searches(user_id);
CREATE INDEX idx_saved_searches_alerts ON public.saved_searches(alerts_enabled) WHERE alerts_enabled = TRUE;

-- ============================================
-- AI QUERY HISTORY
-- ============================================

CREATE TABLE public.ai_query_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  query_type TEXT NOT NULL, -- 'insight', 'similar', 'natural_language', 'pattern'
  query_text TEXT,
  context JSONB DEFAULT '{}', -- Report IDs, filters, etc.
  response_summary TEXT,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_query_history_user ON public.ai_query_history(user_id);
CREATE INDEX idx_ai_query_history_type ON public.ai_query_history(query_type);
CREATE INDEX idx_ai_query_history_created ON public.ai_query_history(created_at DESC);

-- ============================================
-- UPDATE PROFILES TABLE
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_tier_id UUID REFERENCES public.subscription_tiers(id);

-- Set default tier for existing users
UPDATE public.profiles
SET current_tier_id = (SELECT id FROM public.subscription_tiers WHERE is_default = TRUE LIMIT 1)
WHERE current_tier_id IS NULL;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_query_history ENABLE ROW LEVEL SECURITY;

-- Subscription tiers: viewable by all
CREATE POLICY "Subscription tiers are viewable by everyone" ON public.subscription_tiers
  FOR SELECT USING (true);

-- User subscriptions: users can view own
CREATE POLICY "Users can view own subscriptions" ON public.user_subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own subscriptions" ON public.user_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Usage tracking: users can view own
CREATE POLICY "Users can view own usage" ON public.usage_tracking
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can manage usage" ON public.usage_tracking
  FOR ALL USING (true);

-- Billing history: users can view own
CREATE POLICY "Users can view own billing" ON public.billing_history
  FOR SELECT USING (user_id = auth.uid());

-- Collections: owner and collaborators can view
CREATE POLICY "Users can view own collections" ON public.collections
  FOR SELECT USING (
    user_id = auth.uid() OR
    is_public = TRUE OR
    EXISTS (
      SELECT 1 FROM public.collection_collaborators
      WHERE collection_id = collections.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create collections" ON public.collections
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own collections" ON public.collections
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own collections" ON public.collections
  FOR DELETE USING (user_id = auth.uid());

-- Collection reports: based on collection access
CREATE POLICY "Users can view collection reports" ON public.collection_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_reports.collection_id
      AND (c.user_id = auth.uid() OR c.is_public = TRUE OR
           EXISTS (SELECT 1 FROM public.collection_collaborators cc WHERE cc.collection_id = c.id AND cc.user_id = auth.uid()))
    )
  );

CREATE POLICY "Users can add to own collections" ON public.collection_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_reports.collection_id
      AND (c.user_id = auth.uid() OR
           EXISTS (SELECT 1 FROM public.collection_collaborators cc WHERE cc.collection_id = c.id AND cc.user_id = auth.uid() AND cc.role IN ('editor', 'admin')))
    )
  );

CREATE POLICY "Users can remove from own collections" ON public.collection_reports
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_reports.collection_id
      AND (c.user_id = auth.uid() OR
           EXISTS (SELECT 1 FROM public.collection_collaborators cc WHERE cc.collection_id = c.id AND cc.user_id = auth.uid() AND cc.role IN ('editor', 'admin')))
    )
  );

-- Collection collaborators
CREATE POLICY "Users can view collaborators" ON public.collection_collaborators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_collaborators.collection_id
      AND (c.user_id = auth.uid() OR
           EXISTS (SELECT 1 FROM public.collection_collaborators cc WHERE cc.collection_id = c.id AND cc.user_id = auth.uid()))
    )
  );

CREATE POLICY "Collection owners can manage collaborators" ON public.collection_collaborators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_collaborators.collection_id AND c.user_id = auth.uid()
    )
  );

-- Saved searches: users can manage own
CREATE POLICY "Users can view own saved searches" ON public.saved_searches
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create saved searches" ON public.saved_searches
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own saved searches" ON public.saved_searches
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own saved searches" ON public.saved_searches
  FOR DELETE USING (user_id = auth.uid());

-- AI query history: users can view own
CREATE POLICY "Users can view own AI history" ON public.ai_query_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create AI queries" ON public.ai_query_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Generate collection slug
CREATE OR REPLACE FUNCTION generate_collection_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
    NEW.slug := trim(both '-' from NEW.slug);
    NEW.slug := substring(NEW.slug from 1 for 50);

    -- Ensure uniqueness for this user
    WHILE EXISTS (SELECT 1 FROM public.collections WHERE user_id = NEW.user_id AND slug = NEW.slug AND id != COALESCE(NEW.id, uuid_generate_v4())) LOOP
      NEW.slug := NEW.slug || '-' || substr(md5(random()::text), 1, 4);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_collection_slug_trigger
  BEFORE INSERT OR UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION generate_collection_slug();

-- Update timestamps for collections
CREATE TRIGGER update_collections_updated_at
  BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update timestamps for saved searches
CREATE TRIGGER update_saved_searches_updated_at
  BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update timestamps for subscriptions
CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update timestamps for usage tracking
CREATE TRIGGER update_usage_tracking_updated_at
  BEFORE UPDATE ON public.usage_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
