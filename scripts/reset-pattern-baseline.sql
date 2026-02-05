-- ============================================
-- PATTERN DETECTION BASELINE RESET
-- Run this to start fresh for alpha
-- ============================================

-- 1. Archive all existing patterns (mark as 'historical' - the closest status to archived)
-- Note: pattern_status enum only has: active, historical, emerging, declining
UPDATE detected_patterns
SET
  status = 'historical',
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{archived_reason}',
      '"pre_alpha_baseline_reset"'
    ),
    '{archived_at}',
    to_jsonb(NOW()::text)
  )
WHERE status IN ('active', 'emerging', 'declining');

-- 2. Create settings table if it doesn't exist (for baseline start date)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Set the baseline start date to TODAY
-- Pattern detection will only consider data created after this date
INSERT INTO system_settings (key, value, description)
VALUES (
  'pattern_baseline_start_date',
  to_jsonb(NOW()::date::text),
  'Pattern detection only considers data created after this date. Set during alpha baseline reset.'
)
ON CONFLICT (key) DO UPDATE SET
  value = to_jsonb(NOW()::date::text),
  updated_at = NOW();

-- 4. Set minimum thresholds for showing patterns
INSERT INTO system_settings (key, value, description)
VALUES (
  'pattern_display_thresholds',
  '{
    "min_reports": 10,
    "min_confidence": 0.3,
    "min_weeks_of_data": 4,
    "show_emerging": true
  }'::jsonb,
  'Minimum thresholds for displaying patterns to users'
)
ON CONFLICT (key) DO UPDATE SET
  value = '{
    "min_reports": 10,
    "min_confidence": 0.3,
    "min_weeks_of_data": 4,
    "show_emerging": true
  }'::jsonb,
  updated_at = NOW();

-- 5. Verify the reset
SELECT
  'Archived patterns' as metric,
  COUNT(*) as count
FROM detected_patterns
WHERE status = 'archived'
  AND metadata->>'archived_reason' = 'pre_alpha_baseline_reset'

UNION ALL

SELECT
  'Active patterns remaining' as metric,
  COUNT(*) as count
FROM detected_patterns
WHERE status IN ('active', 'emerging')

UNION ALL

SELECT
  'Baseline start date' as metric,
  (SELECT value::text FROM system_settings WHERE key = 'pattern_baseline_start_date')::bigint as count;

-- Done! Pattern detection will now:
-- 1. Only analyze data created after today
-- 2. Only show patterns meeting minimum thresholds
-- 3. Start building a fresh baseline from organic user submissions
