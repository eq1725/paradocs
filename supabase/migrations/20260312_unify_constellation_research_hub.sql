-- Unification: Sync existing constellation_entries that don't have matching constellation_artifacts
-- This ensures all V1 entries are represented in the Research Hub

INSERT INTO constellation_artifacts (
  user_id,
  source_type,
  report_id,
  title,
  user_note,
  verdict,
  tags,
  created_at,
  updated_at
)
SELECT
  ce.user_id,
  'paradocs_report' AS source_type,
  ce.report_id,
  COALESCE(r.title, 'Logged Report') AS title,
  ce.note AS user_note,
  ce.verdict,
  ce.tags,
  ce.created_at,
  ce.updated_at
FROM constellation_entries ce
LEFT JOIN reports r ON r.id = ce.report_id
WHERE NOT EXISTS (
  SELECT 1 FROM constellation_artifacts ca
  WHERE ca.user_id = ce.user_id
    AND ca.report_id = ce.report_id
)
ON CONFLICT (user_id, report_id) DO NOTHING;
