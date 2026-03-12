-- Phase 3: External URL Signals Flywheel + Upsert RPC
-- This migration adds the upsert function for tracking how many users
-- have saved the same external URL, feeding the ingestion pipeline.

-- Create the external URL signals table if it doesn't exist
CREATE TABLE IF NOT EXISTS constellation_external_url_signals (
  url_hash TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  save_count INT DEFAULT 1,
  first_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingestion_status TEXT DEFAULT 'pending' CHECK (ingestion_status IN (
    'pending', 'queued', 'ingested', 'rejected'
  )),
  ingested_report_id UUID REFERENCES reports(id),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_url_signals_count
  ON constellation_external_url_signals(save_count DESC);
CREATE INDEX IF NOT EXISTS idx_url_signals_status
  ON constellation_external_url_signals(ingestion_status);

-- RPC function: upsert external URL signal
-- Increments save_count if the URL hash already exists, inserts otherwise.
-- Called from the artifacts API when a user saves an external URL.
CREATE OR REPLACE FUNCTION upsert_external_url_signal(
  p_url_hash TEXT,
  p_canonical_url TEXT,
  p_source_type TEXT,
  p_title TEXT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO constellation_external_url_signals (
    url_hash, canonical_url, source_type, title, thumbnail_url,
    save_count, first_saved_at, last_saved_at
  ) VALUES (
    p_url_hash, p_canonical_url, p_source_type, p_title, p_thumbnail_url,
    1, NOW(), NOW()
  )
  ON CONFLICT (url_hash) DO UPDATE SET
    save_count = constellation_external_url_signals.save_count + 1,
    last_saved_at = NOW(),
    title = COALESCE(EXCLUDED.title, constellation_external_url_signals.title),
    thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, constellation_external_url_signals.thumbnail_url);
END;
$$;

-- Grant execute to authenticated users (called via API with service role,
-- but safe to grant since it only increments counters)
GRANT EXECUTE ON FUNCTION upsert_external_url_signal TO authenticated;
