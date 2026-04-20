-- ═══════════════════════════════════════════════════════════════════════
-- Featured Investigations + Report Books
-- Created: 2026-03-18
-- Purpose: Editorial curation for homepage featured cases + Amazon
--          affiliate book recommendations on report pages
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Featured Investigations ──────────────────────────────────────────
-- Admin-curated case files for homepage hero rotation.
-- Each entry represents one "magazine cover story" with editorial blurb
-- and custom hero image, linking to a case_group of reports.

CREATE TABLE IF NOT EXISTS featured_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_group TEXT NOT NULL,                          -- matches reports.case_group (e.g. 'roswell-1947')
  title TEXT NOT NULL,                               -- editorial title (may differ from showcase report title)
  subtitle TEXT,                                     -- optional tagline
  editorial_blurb TEXT NOT NULL,                     -- hook text for homepage (150-300 chars, written to sell)
  hero_image_url TEXT,                               -- custom hero image (Supabase Storage preferred)
  hero_image_caption TEXT,
  showcase_slug TEXT,                                -- slug of the showcase/primary report to link to
  report_count INTEGER DEFAULT 0,                    -- cached count of reports in this case group
  category TEXT,                                     -- for badge display (e.g. 'ufos_aliens')
  location_label TEXT,                               -- display location (e.g. 'Roswell, New Mexico')
  date_label TEXT,                                   -- display date (e.g. 'July 1947')
  display_order INTEGER NOT NULL DEFAULT 0,          -- lower = higher priority
  is_active BOOLEAN NOT NULL DEFAULT true,           -- only active investigations show on homepage
  starts_at TIMESTAMPTZ,                             -- optional: scheduled rotation start
  ends_at TIMESTAMPTZ,                               -- optional: scheduled rotation end
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_featured_investigations_active ON featured_investigations(is_active, display_order);
CREATE INDEX idx_featured_investigations_case_group ON featured_investigations(case_group);

-- RLS: public read, admin write
ALTER TABLE featured_investigations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "featured_investigations_public_read"
  ON featured_investigations FOR SELECT
  USING (true);

CREATE POLICY "featured_investigations_admin_write"
  ON featured_investigations FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE email = 'williamschaseh@gmail.com'
    )
  );

-- ─── Report Books ─────────────────────────────────────────────────────
-- Amazon affiliate book recommendations linked to individual reports.
-- Each report can have 2-4 contextually relevant books.

CREATE TABLE IF NOT EXISTS report_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                               -- book title
  author TEXT NOT NULL,                              -- author(s)
  amazon_asin TEXT NOT NULL,                         -- Amazon Standard Identification Number
  cover_image_url TEXT,                              -- book cover thumbnail
  editorial_note TEXT,                               -- 1-2 sentence note: why this book matters for this report
  display_order INTEGER NOT NULL DEFAULT 0,          -- order within the report's book list
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_books_report_id ON report_books(report_id);
CREATE INDEX idx_report_books_asin ON report_books(amazon_asin);

-- RLS: public read, admin write
ALTER TABLE report_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_books_public_read"
  ON report_books FOR SELECT
  USING (true);

CREATE POLICY "report_books_admin_write"
  ON report_books FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE email = 'williamschaseh@gmail.com'
    )
  );
