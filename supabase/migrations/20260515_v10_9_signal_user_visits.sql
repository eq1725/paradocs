-- V10.9 Signal Reframe — per-user last-visit tracking for the
-- "Since you last visited" delta line on the Lab Signal tab.
--
-- Why a dedicated table instead of reusing profiles.last_seen_at:
--   - last_seen_at is updated on any auth ping; it captures every
--     site visit, not specifically Signal-tab opens.
--   - We want the delta to reflect what's changed in the user's
--     archive context since they last LOOKED AT SIGNAL, which is
--     a subset of all visits and the meaningful comparison point.
--
-- The API stamps last_visited_at when the user opens Signal, but
-- returns the PRIOR value as `previous_visited_at` so the delta
-- can be computed against it. That way the user sees "what changed
-- since I last opened this," not "what's new since right now."
--
-- One row per user (PK on user_id). Updated on every Signal load.
-- archived_baseline_at is the cluster-baseline anchor for the
-- "since" math — set on first visit, advances when the user
-- explicitly acknowledges a delta (clicks "got it" or similar).
-- For now we use last_visited_at as the baseline; archived_baseline_at
-- is reserved for a future "freeze the baseline until I act" UX.

CREATE TABLE IF NOT EXISTS public.signal_user_visits (
  user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_visited_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_visited_at     TIMESTAMPTZ,
  visit_count             INTEGER NOT NULL DEFAULT 1,
  archived_baseline_at    TIMESTAMPTZ,
  -- Cached delta snapshot from last visit, so the API can short-
  -- circuit on rapid re-loads without re-querying. nullable; the
  -- API is free to ignore and recompute.
  last_delta_payload      JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signal_user_visits_last_visited_idx
  ON public.signal_user_visits (last_visited_at DESC);

ALTER TABLE public.signal_user_visits ENABLE ROW LEVEL SECURITY;

-- RLS: each user sees only their own row. Service role bypasses.
DROP POLICY IF EXISTS signal_user_visits_select_own ON public.signal_user_visits;
CREATE POLICY signal_user_visits_select_own
  ON public.signal_user_visits
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS signal_user_visits_modify_own ON public.signal_user_visits;
CREATE POLICY signal_user_visits_modify_own
  ON public.signal_user_visits
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.signal_user_visits IS
  'V10.9 — per-user Signal-tab visit history for the "since you last visited" delta line. One row per user, updated on every load.';
