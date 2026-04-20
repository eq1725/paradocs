-- Migration: Add 'pending_review' to report_status enum
-- Required by ingestion pipeline quality filter (getStatusFromScore returns 'pending_review' for scores 40-69)
-- Applied manually via Supabase SQL Editor on March 25, 2026

ALTER TYPE report_status ADD VALUE IF NOT EXISTS 'pending_review';
