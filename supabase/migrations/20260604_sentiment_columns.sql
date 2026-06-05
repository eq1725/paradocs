-- V11.17.74 — Sentiment + endpoints (Tier 3D)
--
-- Adds per-report sentiment columns to the `reports` table so the
-- comparative-corpus sentiment surface (LAB_PANEL_REVIEW_V3 §5) has
-- numeric ground truth instead of synthesized prose.
--
-- IMPORTANT — schema note re: the task brief.
--
-- The Tier 3D brief originally suggested
--   `ALTER TABLE paradocs_assessment ADD COLUMN …`
-- but `paradocs_assessment` is a JSONB COLUMN on the `reports` table,
-- not a standalone table (see 20260323_paradocs_analysis.sql). The
-- intended scope ("one row per approved report") is exactly the
-- `reports` table, so the four sentiment columns are added there.
-- This keeps the live-ingest consolidated AI write path (which already
-- updates `reports.paradocs_assessment` in the same UPDATE) able to
-- write sentiment in the same transaction.
--
-- Per PRO_TIER_VALIDATION_V3 + LAB_PANEL_REVIEW_V3 §5: sentiment is
-- NOT MVP-must — it ships behind feature flags
-- (`HINTS_ENABLE_SENTIMENT=true` for surfaces; `INCLUDE_SENTIMENT=true`
-- for consolidated-AI prompt inclusion). Founder enables when ready.
--
-- Score scales:
--   sentiment_valence  : NUMERIC(4,3) in [-1.000, 1.000]
--     -1 = strongly negative / fearful / alarmed
--      0 = neutral
--     +1 = strongly positive / awe-filled / calm-resolved
--   sentiment_arousal  : NUMERIC(4,3) in [ 0.000, 1.000]
--      0 = calm / detached
--      1 = intense / alarmed / acute
--   sentiment_dominant_emotion : TEXT in
--     ('fear','awe','calm','confusion','anger','sadness','joy','neutral')
--   sentiment_computed_at      : TIMESTAMPTZ, NULL = not yet computed.
--                                Used by scripts/_backfill-sentiment-scores.ts
--                                as the idempotency cursor.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS sentiment_valence            NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS sentiment_arousal            NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS sentiment_dominant_emotion   TEXT,
  ADD COLUMN IF NOT EXISTS sentiment_computed_at        TIMESTAMPTZ;

-- Range guards — defensive against bad Haiku output landing out of band.
ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_sentiment_valence_chk;
ALTER TABLE reports
  ADD CONSTRAINT reports_sentiment_valence_chk
  CHECK (sentiment_valence IS NULL OR (sentiment_valence >= -1.000 AND sentiment_valence <= 1.000));

ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_sentiment_arousal_chk;
ALTER TABLE reports
  ADD CONSTRAINT reports_sentiment_arousal_chk
  CHECK (sentiment_arousal IS NULL OR (sentiment_arousal >= 0.000 AND sentiment_arousal <= 1.000));

ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_sentiment_dominant_emotion_chk;
ALTER TABLE reports
  ADD CONSTRAINT reports_sentiment_dominant_emotion_chk
  CHECK (sentiment_dominant_emotion IS NULL OR sentiment_dominant_emotion IN
    ('fear','awe','calm','confusion','anger','sadness','joy','neutral'));

-- Index lookup paths the comparative-corpus query needs:
--   "what share of <phen_family> reports skew <emotion>?"
-- Partial index keeps it slim — only rows that have been scored.
CREATE INDEX IF NOT EXISTS idx_reports_sentiment_dominant_emotion
  ON reports (sentiment_dominant_emotion)
  WHERE sentiment_dominant_emotion IS NOT NULL;

-- Backfill cursor — lets the script quickly find the next chunk of
-- unscored approved reports without scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_reports_sentiment_missing
  ON reports (id)
  WHERE sentiment_computed_at IS NULL AND status = 'approved';
