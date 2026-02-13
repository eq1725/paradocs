-- ============================================================
-- ParaDocs Engagement System — Activity Tracking + Streaks
-- ============================================================

-- 1. User Activity Log — tracks every meaningful action for streaks + analytics
CREATE TABLE IF NOT EXISTS public.user_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'view_report', 'submit_report', 'save_report', 'vote',
    'comment', 'journal_entry', 'search', 'explore'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_log_user_date ON public.user_activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_log_user_type ON public.user_activity_log(user_id, activity_type);
CREATE INDEX idx_activity_log_created ON public.user_activity_log(created_at DESC);

-- RLS
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own activity" ON public.user_activity_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activity" ON public.user_activity_log FOR INSERT WITH CHECK (auth.uid() = user_id);


-- 2. User Streaks — dedication tracking
CREATE TABLE IF NOT EXISTS public.user_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_active_date DATE,
  streak_started_at DATE,
  total_active_days INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_streaks_user_unique UNIQUE (user_id)
);

-- RLS
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own streak" ON public.user_streaks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own streak" ON public.user_streaks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own streak" ON public.user_streaks FOR UPDATE USING (auth.uid() = user_id);


-- 3. RPC: Update user streak (call on any qualifying activity)
CREATE OR REPLACE FUNCTION public.update_user_streak(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_streak RECORD;
  v_result JSONB;
BEGIN
  -- Get or create streak record
  INSERT INTO public.user_streaks (user_id, current_streak, longest_streak, last_active_date, streak_started_at, total_active_days)
  VALUES (p_user_id, 0, 0, NULL, NULL, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_streak FROM public.user_streaks WHERE user_id = p_user_id;

  -- Already logged today
  IF v_streak.last_active_date = v_today THEN
    v_result := jsonb_build_object(
      'current_streak', v_streak.current_streak,
      'longest_streak', v_streak.longest_streak,
      'total_active_days', v_streak.total_active_days,
      'updated', false
    );
    RETURN v_result;
  END IF;

  -- Calculate new streak
  IF v_streak.last_active_date = v_today - INTERVAL '1 day' THEN
    -- Consecutive day — extend streak
    UPDATE public.user_streaks SET
      current_streak = current_streak + 1,
      longest_streak = GREATEST(longest_streak, current_streak + 1),
      last_active_date = v_today,
      total_active_days = total_active_days + 1,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF v_streak.last_active_date IS NULL THEN
    -- First ever activity
    UPDATE public.user_streaks SET
      current_streak = 1,
      longest_streak = 1,
      last_active_date = v_today,
      streak_started_at = v_today,
      total_active_days = 1,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    -- Streak broken — restart
    UPDATE public.user_streaks SET
      current_streak = 1,
      longest_streak = GREATEST(longest_streak, 1),
      last_active_date = v_today,
      streak_started_at = v_today,
      total_active_days = total_active_days + 1,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  SELECT * INTO v_streak FROM public.user_streaks WHERE user_id = p_user_id;

  v_result := jsonb_build_object(
    'current_streak', v_streak.current_streak,
    'longest_streak', v_streak.longest_streak,
    'total_active_days', v_streak.total_active_days,
    'streak_started_at', v_streak.streak_started_at,
    'updated', true
  );
  RETURN v_result;
END;
$$;


-- 4. Journal Entries — investigation research logs
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'freeform' CHECK (entry_type IN (
    'observation', 'hypothesis', 'evidence_review', 'field_note', 'connection', 'freeform'
  )),
  body TEXT DEFAULT '',
  hypothesis TEXT,
  evidence_notes TEXT,
  conclusions TEXT,
  linked_report_ids UUID[] DEFAULT '{}',
  linked_categories TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  is_private BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_journal_user_date ON public.journal_entries(user_id, created_at DESC);
CREATE INDEX idx_journal_search ON public.journal_entries USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(hypothesis, '') || ' ' || coalesce(conclusions, '')));

-- RLS
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own journal entries" ON public.journal_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create journal entries" ON public.journal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own journal entries" ON public.journal_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own journal entries" ON public.journal_entries FOR DELETE USING (auth.uid() = user_id);


-- 5. Weekly Digests — personalized weekly reports
CREATE TABLE IF NOT EXISTS public.weekly_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  digest_data JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT weekly_digests_user_week UNIQUE (user_id, week_start)
);

CREATE INDEX idx_digests_user_date ON public.weekly_digests(user_id, week_start DESC);

-- RLS
ALTER TABLE public.weekly_digests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own digests" ON public.weekly_digests FOR SELECT USING (auth.uid() = user_id);


-- 6. Convenience function: Log activity and update streak in one call
CREATE OR REPLACE FUNCTION public.log_activity_and_update_streak(
  p_user_id UUID,
  p_activity_type TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_streak JSONB;
BEGIN
  -- Log the activity
  INSERT INTO public.user_activity_log (user_id, activity_type, metadata)
  VALUES (p_user_id, p_activity_type, p_metadata);

  -- Update streak
  v_streak := public.update_user_streak(p_user_id);

  RETURN v_streak;
END;
$$;
