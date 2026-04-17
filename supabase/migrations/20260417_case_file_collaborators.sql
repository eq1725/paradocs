-- ============================================================================
-- Case file collaborators: enables multi-researcher investigations.
-- Owner can invite other users (by email) to view or edit a case file.
-- Pending invites accept via one-time token (or auto-accept when the
-- invited email already has a Paradocs account).
-- ============================================================================

CREATE TABLE IF NOT EXISTS constellation_case_file_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_file_id UUID NOT NULL REFERENCES constellation_case_files(id) ON DELETE CASCADE,

  -- Exactly one of user_id OR pending_email is set. Once a pending invite is
  -- accepted, user_id is populated and pending_email is cleared.
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  pending_email TEXT,

  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- One-time token for email-based accept flow. Null once accepted.
  invite_token TEXT,
  invite_token_expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,

  -- Prevent duplicate invitations / memberships for the same pair.
  CONSTRAINT unique_active_collaborator UNIQUE (case_file_id, user_id),
  CONSTRAINT unique_pending_invite UNIQUE (case_file_id, pending_email),
  -- Exactly one identity reference must be set.
  CONSTRAINT identity_required CHECK (
    (user_id IS NOT NULL AND pending_email IS NULL) OR
    (user_id IS NULL AND pending_email IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cf_collab_case_file
  ON constellation_case_file_collaborators(case_file_id);
CREATE INDEX IF NOT EXISTS idx_cf_collab_user
  ON constellation_case_file_collaborators(user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cf_collab_pending_email
  ON constellation_case_file_collaborators(pending_email)
  WHERE pending_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cf_collab_token
  ON constellation_case_file_collaborators(invite_token)
  WHERE invite_token IS NOT NULL;

ALTER TABLE constellation_case_file_collaborators ENABLE ROW LEVEL SECURITY;

-- Owners of the case file can manage collaborators (add/remove/view).
DROP POLICY IF EXISTS cf_collab_owner_manage ON constellation_case_file_collaborators;
CREATE POLICY cf_collab_owner_manage
  ON constellation_case_file_collaborators
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM constellation_case_files cf
      WHERE cf.id = case_file_id AND cf.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM constellation_case_files cf
      WHERE cf.id = case_file_id AND cf.user_id = auth.uid()
    )
  );

-- Collaborators can SELECT their own memberships (so they can enumerate
-- "case files shared with me").
DROP POLICY IF EXISTS cf_collab_self_read ON constellation_case_file_collaborators;
CREATE POLICY cf_collab_self_read
  ON constellation_case_file_collaborators
  FOR SELECT
  USING (user_id = auth.uid());

-- Extend existing case-file SELECT policy: in addition to owners, readers/
-- editors of a case file can SELECT that case file's row.
DROP POLICY IF EXISTS case_files_select_collaborators ON constellation_case_files;
CREATE POLICY case_files_select_collaborators
  ON constellation_case_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM constellation_case_file_collaborators cfc
      WHERE cfc.case_file_id = constellation_case_files.id
        AND cfc.user_id = auth.uid()
        AND cfc.accepted_at IS NOT NULL
    )
  );

-- Editors can UPDATE case files they're a collaborator on with role=editor.
-- (Owner policies already cover the owner's own updates.)
DROP POLICY IF EXISTS case_files_update_editors ON constellation_case_files;
CREATE POLICY case_files_update_editors
  ON constellation_case_files
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM constellation_case_file_collaborators cfc
      WHERE cfc.case_file_id = constellation_case_files.id
        AND cfc.user_id = auth.uid()
        AND cfc.role = 'editor'
        AND cfc.accepted_at IS NOT NULL
    )
  );

-- Junction: collaborators can SELECT the artifact links for a shared case
-- file, and editors can INSERT/DELETE those links (add/remove artifacts).
DROP POLICY IF EXISTS cfa_select_collaborators ON constellation_case_file_artifacts;
CREATE POLICY cfa_select_collaborators
  ON constellation_case_file_artifacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM constellation_case_file_collaborators cfc
      WHERE cfc.case_file_id = constellation_case_file_artifacts.case_file_id
        AND cfc.user_id = auth.uid()
        AND cfc.accepted_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS cfa_mutate_editors ON constellation_case_file_artifacts;
CREATE POLICY cfa_mutate_editors
  ON constellation_case_file_artifacts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM constellation_case_file_collaborators cfc
      WHERE cfc.case_file_id = constellation_case_file_artifacts.case_file_id
        AND cfc.user_id = auth.uid()
        AND cfc.role = 'editor'
        AND cfc.accepted_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS cfa_delete_editors ON constellation_case_file_artifacts;
CREATE POLICY cfa_delete_editors
  ON constellation_case_file_artifacts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM constellation_case_file_collaborators cfc
      WHERE cfc.case_file_id = constellation_case_file_artifacts.case_file_id
        AND cfc.user_id = auth.uid()
        AND cfc.role = 'editor'
        AND cfc.accepted_at IS NOT NULL
    )
  );

-- Collaborators can SELECT the owner's artifacts that appear in a shared case file.
DROP POLICY IF EXISTS artifacts_select_via_shared_case_file ON constellation_artifacts;
CREATE POLICY artifacts_select_via_shared_case_file
  ON constellation_artifacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM constellation_case_file_artifacts cfa
      JOIN constellation_case_file_collaborators cfc
        ON cfc.case_file_id = cfa.case_file_id
      WHERE cfa.artifact_id = constellation_artifacts.id
        AND cfc.user_id = auth.uid()
        AND cfc.accepted_at IS NOT NULL
    )
  );
