-- V11.17.39 — /citd email waitlist signups (Contact in the Desert event).
--
-- The app is not production-ready when QR-code visitors hit /citd; the
-- POST /api/citd/signup endpoint captures their email + name so we can
-- batch-invite them once BETA_PROTECTION is lifted.
--
-- Apply via Supabase dashboard SQL editor before the event.

CREATE TABLE IF NOT EXISTS public.citd_signups (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text          NOT NULL UNIQUE,
  name         text,
  referrer     text,
  ip_address   text,
  user_agent   text,
  invited_at   timestamptz,                  -- set when we send the invite
  created_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_citd_signups_created_at
  ON public.citd_signups (created_at DESC);

-- RLS: API uses the service role key, so RLS is bypassed for inserts.
-- We still enable RLS + a denying policy so client-side reads aren't
-- possible if anyone exposes the table accidentally.
ALTER TABLE public.citd_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_select_citd_signups" ON public.citd_signups;
CREATE POLICY "deny_anon_select_citd_signups"
  ON public.citd_signups
  FOR SELECT
  TO anon, authenticated
  USING (false);
