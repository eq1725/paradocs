-- Migration: Pattern Analysis Performance Indexes
-- Description: Add indexes to optimize geographic clustering queries

-- Composite index for clustering queries - covers the main WHERE clause
CREATE INDEX IF NOT EXISTS idx_reports_approved_coords_date
ON reports(event_date DESC)
WHERE status = 'approved' AND coordinates IS NOT NULL;

-- Partial GIST index for approved reports with coordinates
CREATE INDEX IF NOT EXISTS idx_reports_approved_gist
ON reports USING GIST(coordinates)
WHERE status = 'approved' AND coordinates IS NOT NULL;

-- Index for category-based clustering
CREATE INDEX IF NOT EXISTS idx_reports_category_event_date
ON reports(category, event_date DESC)
WHERE status = 'approved';

-- Partial index for reports with lat/lng
CREATE INDEX IF NOT EXISTS idx_reports_with_latlong
ON reports(latitude, longitude)
WHERE status = 'approved' AND latitude IS NOT NULL AND longitude IS NOT NULL;
