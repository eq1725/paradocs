-- Performance Indexes for 10M+ Scale
-- Migration 017: Add critical composite indexes for faster queries

-- ============================================================================
-- REPORTS TABLE INDEXES
-- ============================================================================

-- Composite index for the main browse/filter query (most common query pattern)
-- Covers: WHERE status = 'approved' AND category = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_reports_status_category_created
ON reports(status, category, created_at DESC);

-- Index for source_type filtering (used in analytics and admin views)
CREATE INDEX IF NOT EXISTS idx_reports_source_type
ON reports(source_type);

-- Composite for deduplication checks (used during ingestion)
CREATE INDEX IF NOT EXISTS idx_reports_original_source_dedup
ON reports(original_report_id, source_type);

-- Index for location-based queries (map views, geographic searches)
CREATE INDEX IF NOT EXISTS idx_reports_location_coords
ON reports(latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Index for date-based filtering (timeline views, date range queries)
CREATE INDEX IF NOT EXISTS idx_reports_event_date
ON reports(event_date DESC NULLS LAST);

-- Index for quality score filtering (used when showing high-quality reports first)
CREATE INDEX IF NOT EXISTS idx_reports_quality_score
ON reports(quality_score DESC NULLS LAST)
WHERE status = 'approved';

-- Partial index for approved reports only (most common status filter)
CREATE INDEX IF NOT EXISTS idx_reports_approved_recent
ON reports(created_at DESC)
WHERE status = 'approved';

-- ============================================================================
-- INGESTION LOGS TABLE INDEXES (for admin panel performance)
-- ============================================================================

-- Index for filtering logs by source and time
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_source_created
ON ingestion_logs(source_id, created_at DESC);

-- Index for filtering by log level
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_level_created
ON ingestion_logs(level, created_at DESC);

-- ============================================================================
-- DATA SOURCES TABLE INDEXES
-- ============================================================================

-- Index for enabled sources lookup
CREATE INDEX IF NOT EXISTS idx_data_sources_enabled
ON data_sources(enabled, adapter_type);

-- ============================================================================
-- ANALYZE TABLES (update statistics for query planner)
-- ============================================================================

ANALYZE reports;
ANALYZE ingestion_logs;
ANALYZE data_sources;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_reports_status_category_created IS
'Primary composite index for browse queries with status and category filters';

COMMENT ON INDEX idx_reports_source_type IS
'Index for analytics queries grouping by source type';

COMMENT ON INDEX idx_reports_original_source_dedup IS
'Deduplication index used during ingestion to prevent duplicate imports';

COMMENT ON INDEX idx_reports_approved_recent IS
'Partial index for efficient recent approved reports queries';
