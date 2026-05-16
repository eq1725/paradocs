-- Migration: account_deletion_requests
--
-- C3.1 — Apple Guideline 5.1.1(v) + Google Play Data Safety both
-- require that users be able to initiate full account deletion from
-- within the app. Apple's standard: "effective within 30 days" of
-- the user's request.
--
-- Implementation: 7-day grace period (cancellable) + typed confirmation
-- before request is accepted + cascading anonymization on processing +
-- audit log of every deletion (kept indefinitely for compliance).
--
-- Lifecycle:
--   1. User requests deletion via /account/delete (POST /api/account/delete)
--      → INSERT row with status='pending', scheduled_for = NOW() + 7 days
--   2. User can cancel during grace period (DELETE /api/account/delete)
--      → UPDATE row to status='cancelled'
--   3. Daily cron (/api/cron/process-account-deletions) picks up rows
--      where status='pending' AND scheduled_for <= NOW()
--      → performs anonymization, soft-deletes reports, revokes push
--      → UPDATE row to status='processed' + processed_at = NOW()

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for       TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  confirmation_text   TEXT,
  ip_address          TEXT,
  user_agent          TEXT,
  cancelled_at        TIMESTAMPTZ,
  processed_at        TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_status_check
  CHECK (status IN ('pending', 'cancelled', 'processed', 'failed'));

COMMENT ON TABLE public.account_deletion_requests IS
  'C3.1 audit + grace-period ledger for user-initiated account deletions. One row per request. Status pending→cancelled if user reverses during grace; pending→processed after the daily cron runs anonymization. Kept indefinitely for compliance audit.';

COMMENT ON COLUMN public.account_deletion_requests.confirmation_text IS
  'The literal text the user typed to confirm. Required ''DELETE MY ACCOUNT''. Stored so we can prove informed consent if challenged.';

COMMENT ON COLUMN public.account_deletion_requests.scheduled_for IS
  'Grace-period end. Set to requested_at + 7 days on insert. After this, the cron picks up the row for processing.';

-- Only one pending deletion per user at a time (prevents duplicate requests).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_deletion_per_user
  ON public.account_deletion_requests(user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_account_deletion_scheduled
  ON public.account_deletion_requests(scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_account_deletion_user_status
  ON public.account_deletion_requests(user_id, status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_account_deletion_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS account_deletion_requests_updated_at ON public.account_deletion_requests;
CREATE TRIGGER account_deletion_requests_updated_at
  BEFORE UPDATE ON public.account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_account_deletion_requests_updated_at();

-- RLS: users can SELECT their own request (to show "deletion scheduled for X");
-- service role manages everything else.
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own deletion request"
  ON public.account_deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages deletion requests"
  ON public.account_deletion_requests FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.account_deletion_requests TO authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;
