-- ============================================================
-- V9.12 Phase 2.D — Comment threads on /report/[slug]
--
-- Schema:
--   id                — PK
--   report_id         — FK to reports
--   user_id           — FK to auth.users (commenter)
--   parent_id         — self-FK for one-level threading (replies)
--   body              — comment text (limit enforced at API)
--   status            — 'approved' | 'pending' | 'rejected'
--                       Set by moderateText() at insert time.
--                       Public reads filter to 'approved'.
--   moderation_reason — populated when status != 'approved'
--   edited_at         — set on edits (V2 — not yet exposed in UI)
--   deleted_at        — soft-delete; row preserved for audit but
--                       hidden from public reads
--   created_at        — when the comment was posted
--
-- Threading: parent_id allows replies. V1 UI renders depth 0 + 1
-- only (parent + replies). Deeper replies still persist but are
-- flattened up to the depth-1 parent at render time. V2 may
-- render deeper threads.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES public.report_comments(id) ON DELETE CASCADE,
  body              TEXT NOT NULL CHECK (length(body) >= 1 AND length(body) <= 2000),
  status            TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  moderation_reason TEXT,
  edited_at         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_comments_report     ON public.report_comments (report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_comments_parent     ON public.report_comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_report_comments_user       ON public.report_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_report_comments_status     ON public.report_comments (status);

COMMENT ON TABLE public.report_comments IS
  'V9.12 Phase 2.D — Public comment threads on /report/[slug]. Moderated at insert time via moderateText(); rejected comments persist for audit but never surface in public reads.';

ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;

-- Everyone (including anon) can read approved, non-deleted comments.
CREATE POLICY "Anyone reads approved comments"
  ON public.report_comments
  FOR SELECT
  USING (status = 'approved' AND deleted_at IS NULL);

-- Authors can read their own pending/rejected comments (so the UI
-- can show them "we're reviewing this" or "this didn't pass review").
CREATE POLICY "Authors read their own comments"
  ON public.report_comments
  FOR SELECT
  USING (auth.uid() = user_id);

-- Authenticated users can post comments under their own user_id.
-- The API still enforces moderation + body length; this RLS is
-- a second line of defence.
CREATE POLICY "Authenticated users insert their own comments"
  ON public.report_comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Authors can edit (update) and soft-delete their own comments.
CREATE POLICY "Authors update their own comments"
  ON public.report_comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role for admin moderation / cleanup.
CREATE POLICY "Service role full access to comments"
  ON public.report_comments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
