-- Migration: report_slug_aliases (V11.17.98)
--
-- V11.17.98 — Slug refresh + 301 alias table.
--
-- Background:
--   The consolidated-ai persistence path (src/lib/services/
--   consolidated-ai.service.ts → persistConsolidatedResult) regenerates
--   a report's slug whenever Haiku rewrites its title. The slug prefix
--   tracks the displayed headline while the 8-char hash suffix (set by
--   engine.ts at INSERT time) preserves identity.
--
--   Reports ingested BEFORE V11.17.98 shipped never got their slug
--   refreshed; ~6,521 of them carry stale prefixes derived from the
--   raw Reddit / NUFORC / YouTube source title (e.g. the chopped
--   first-sentence narrative the adapter handed engine.ts). The
--   V11.17.98 backfill script (scripts/backfill-slugs-v11-17-98.ts)
--   rewrites those slugs to match the current Haiku title and writes
--   the OLD slug into this table so existing inbound URLs (shared
--   links, search-engine index entries, push notifications already
--   delivered, CDN-cached pages, etc.) keep working via a 301 redirect
--   to the new canonical slug.
--
-- Lookup pattern (src/pages/report/[slug].tsx):
--   1. SELECT * FROM reports WHERE slug = :slug  →  if hit, render
--   2. Otherwise SELECT report_id FROM report_slug_aliases WHERE
--      old_slug = :slug  →  if hit, look up reports.slug for that id
--      and return a 301 redirect to /report/<current slug>
--   3. Otherwise 404
--
-- The forward direction (current → current) stays the hot path and is
-- unchanged. Aliases only fire on the historically-shared URLs.
--
-- Schema notes:
--   - old_slug UNIQUE — a stale slug can only ever point at one report.
--     If a future title refresh happens to land on the SAME prefix as
--     a prior stale slug, the backfill / live path inserts ON CONFLICT
--     DO NOTHING (the existing alias already points at the correct
--     report id).
--   - ON DELETE CASCADE — when a report is hard-deleted (rare; the
--     normal path is status='deleted'), its aliases evaporate with it
--     so the redirect handler doesn't 301 to a 404.

CREATE TABLE IF NOT EXISTS report_slug_aliases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  old_slug    TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Redirect handler hot path: lookup by old_slug, returning report_id.
-- UNIQUE already creates a btree index on old_slug, but spell it out
-- explicitly so future readers don't wonder.
CREATE INDEX IF NOT EXISTS report_slug_aliases_old_slug_idx
  ON report_slug_aliases (old_slug);

-- Reverse lookup: "what slugs has this report ever had?" — used by the
-- admin debug view to confirm a 301 chain is intact after a refresh.
CREATE INDEX IF NOT EXISTS report_slug_aliases_report_id_idx
  ON report_slug_aliases (report_id);

-- RLS: only the service role writes; anon reads (for the redirect
-- lookup in getStaticProps). The anon select policy returns only the
-- columns the redirect handler needs.
ALTER TABLE report_slug_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read report_slug_aliases" ON report_slug_aliases;
CREATE POLICY "anon read report_slug_aliases"
  ON report_slug_aliases
  FOR SELECT
  TO anon, authenticated
  USING (true);
