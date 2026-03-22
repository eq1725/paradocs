# HANDOFF - Data Ingestion & Pipeline (Session 10)

**Date:** March 21, 2026 (Session 10 complete)
**Session:** Data Ingestion & Pipeline (Session 10)
**Status:** CORE INFRASTRUCTURE DEPLOYED. Feed hook service live, 4 new adapters built (12 total), ingestion engine integrated with hooks + embeddings. Quality scorer expanded for new sources. Ready for data cleanup and mass ingestion execution.
**Next session:** Execute data cleanup SQL, run migration, add env vars, mass ingest adapter-by-adapter, backfill hooks + embeddings.

---

## What Was Built

### 1. Database Migration — Feed Hook Columns

**File:** `supabase/migrations/20260321_feed_hook.sql`

Added three columns to `reports` table:
- `feed_hook` (text) — 2-3 sentence hook for Discover feed cards
- `feed_hook_generated_at` (timestamptz) — when the hook was last generated
- `needs_reingestion` (boolean, default false) — flag for marking reports that should be re-processed

Created three targeted indexes:
- `idx_reports_feed_hook_not_null` — approved reports with hooks, ordered by date (for feed queries)
- `idx_reports_needs_reingestion` — reports flagged for re-ingestion (by source type)
- `idx_reports_missing_feed_hook` — approved reports missing hooks (for backfill)

**Migration status:** SQL ready. Run via Supabase dashboard or CLI.

---

### 2. Feed Hook Generation Service

**File:** `src/lib/services/feed-hook.service.ts`

Claude Haiku-powered service that generates compelling 2-3 sentence hooks for the Discover feed. Each hook creates irresistible curiosity — think documentary trailer opening.

**Key functions:**
- `generateAndSaveFeedHook(reportId)` — Generate and save a hook for one report
- `generateHooksBatch(reportIds, options)` — Batch process with rate limiting (200ms between calls, 2s between batches of 15)
- `getFeedHookStats()` — Coverage statistics (total approved, with/without hooks, coverage %)

**AI Provider:** Claude Haiku 4.5 primary, Claude Haiku 3.5 fallback. Uses `ANTHROPIC_API_KEY` env var.

**Prompt engineering:** Category-specific tone guidance:
- UFOs: technical, aviation-flavored
- Cryptids: nature documentary tone
- Ghosts: gothic atmosphere
- Psychic: clinical but open-minded
- Consciousness: experiential, first-person-adjacent

**Quality rules:** 40-80 words, no cliche words ("mysterious", "shocking"), no spoilers, no rhetorical questions, present tense for immediacy.

**Cost estimate:** ~$0.15-0.20 per 1,000 reports at Haiku pricing.

---

### 3. Batch Hook Generation Endpoint

**File:** `src/pages/api/admin/ai/generate-hooks.ts`

**Endpoint:** `POST /api/admin/ai/generate-hooks`

**Auth:** Bearer token (admin role check) or `x-admin-key` header.

**Actions:**

| Action | Body | Description |
|--------|------|-------------|
| `stats` | `{ action: 'stats' }` | Get hook coverage statistics |
| `single` | `{ action: 'single', id: 'uuid' }` | Generate hook for one report |
| `all_missing` | `{ action: 'all_missing', limit: 100 }` | Batch generate for reports without hooks |
| `all` | `{ action: 'all', force: true, limit: 50 }` | Force regenerate all (with optional limit) |

---

### 4. Ingestion Engine Integration

**File:** `src/lib/ingestion/engine.ts` (modified)

**Changes:**
- Added imports for `generateAndSaveFeedHook` and `embedReport`
- **INSERT path (new reports):** After phenomena linking and media insertion, approved reports now get:
  1. Feed hook generation (non-blocking, logs and continues on failure)
  2. Vector embedding via `embedReport()` (non-blocking)
- **UPDATE path (re-ingested reports):** If the existing report lacks a `feed_hook`, generates one during update

**Critical design decision:** Both feed hook and embedding are non-fatal. If either fails, the report is still ingested successfully. Batch backfill endpoints catch any stragglers.

---

### 5. New Source Adapters (4 built)

All adapters implement the `SourceAdapter` interface: `{ name: string, scrape(config, limit): Promise<AdapterResult> }`.

#### reddit-v2 (`src/lib/ingestion/adapters/reddit-v2.ts`)
- **Source:** Arctic Shift API (Reddit archive)
- **13 subreddits:** r/Paranormal, r/Glitch_in_the_Matrix, r/Thetruthishere, r/UFOs, r/HighStrangeness, r/Ghosts, r/Cryptids, r/NDE, r/AstralProjection, r/Humanoidencounters, r/Missing411, r/Skinwalkers, r/CrawlerSightings
- **Filters:** Self posts only, min 200 chars, excludes [deleted]/[removed]
- **Config:** `subreddits`, `minScore` (default 5), `afterEpoch`
- **Rate limit:** 1s between subreddit fetches

#### youtube (`src/lib/ingestion/adapters/youtube.ts`)
- **Source:** YouTube Data API v3
- **Env var:** `YOUTUBE_API_KEY` required
- **Default channels:** Nukes Top 5, MrBallen, Bedtime Stories, The Why Files
- **Maps:** Video metadata + description to report; thumbnail as primary media
- **Config:** `channels`, `apiKey`, `publishedAfter`
- **Rate limit:** 500ms between API calls

#### news (`src/lib/ingestion/adapters/news.ts`)
- **Source:** NewsAPI.org
- **Env var:** `NEWS_API_KEY` required
- **7 search queries:** UFO sighting, paranormal encounter, ghost sighting, cryptid sighting, unexplained phenomenon, UAP military, near death experience
- **Category detection:** Keyword-based from article title/content
- **Credibility boost:** Major outlets (BBC, CNN, Reuters, etc.) get higher score
- **Config:** `queries`, `apiKey`, `fromDate`

#### erowid (`src/lib/ingestion/adapters/erowid.ts`)
- **Source:** Erowid Experience Vaults (HTML scraping)
- **Focus:** DMT, Ayahuasca, Salvia, 5-MeO-DMT, Ketamine experiences
- **Maps to:** `consciousness_practices` and `psychological_experiences` categories
- **Rate limit:** 2s between page fetches (respects Erowid servers)
- **Config:** `startOffset`, `substances`

---

### 6. Quality Scorer Updates

**Files modified:**
- `src/lib/ingestion/filters/quality-scorer.ts` — Added source tiers for youtube (5), news (6.5), erowid (6), podcast (5.5), government (8.5). Added YouTube engagement boost (views) and news mainstream outlet boost.
- `src/lib/ingestion/filters/quality-filter.ts` — Added source credibility scores for new sources.
- `src/lib/ingestion/filters/index.ts` — Added SOURCE_LABELS for youtube, news, erowid, podcast, government.

---

### 7. Adapter Registry Update

**File:** `src/lib/ingestion/adapters/index.ts`

Registered 4 new adapters: `reddit-v2`, `youtube`, `news`, `erowid`. Total: 12 adapters.

---

## What Needs Manual Execution

### Data Cleanup (Step 1 from session prompt)

These require direct database access (Supabase dashboard SQL editor or CLI):

**1a. Delete ~2M hidden Reddit dev data:**
```sql
-- Verify counts first
SELECT status, count(*) FROM reports WHERE source_type = 'reddit' GROUP BY status;

-- Delete foreign key references
DELETE FROM report_phenomena WHERE report_id IN (
  SELECT id FROM reports WHERE source_type = 'reddit' AND status != 'approved'
);
DELETE FROM report_media WHERE report_id IN (
  SELECT id FROM reports WHERE source_type = 'reddit' AND status != 'approved'
);
DELETE FROM vector_chunks WHERE source_id IN (
  SELECT id FROM reports WHERE source_type = 'reddit' AND status != 'approved'
) AND source_table = 'report';

-- Delete the reports
DELETE FROM reports WHERE source_type = 'reddit' AND status != 'approved';
```

**1b. Flag existing ~900 reports for re-ingestion:**
```sql
UPDATE reports SET needs_reingestion = true WHERE status = 'approved';
```

### Mass Ingestion Execution (Step 7)

Run adapter-by-adapter through the admin ingest endpoint:
1. Limit 100 per adapter — verify quality
2. Limit 1000 per adapter — check dedup + hooks
3. Full runs — no limit

### Required Environment Variables for New Adapters

| Variable | Required For | Notes |
|----------|-------------|-------|
| `ANTHROPIC_API_KEY` | Feed hook generation | Already exists |
| `OPENAI_API_KEY` | Vector embeddings | Already exists |
| `YOUTUBE_API_KEY` | YouTube adapter | Need to add |
| `NEWS_API_KEY` | News adapter | Need to add (NewsAPI.org) |

---

## Architecture Diagram

```
Source Adapter (scrape) → Quality Filter → Dedup Check
    ↓
Title Improvement (AI) → Slug Generation → Phenomena Linking
    ↓
DB Insert/Update → Feed Hook Generation (Claude Haiku) → Vector Embedding (OpenAI)
    ↓
Report live in database with hook + embedding
```

**Failure handling:** Each post-insert step is non-blocking. Feed hook failure → report still ingested, caught by batch backfill. Embedding failure → report still ingested, caught by batch embed endpoint.

---

## Cross-Session Integration Points

| Session | Integration | Status |
|---------|------------|--------|
| Session 2 (Discover) | `feed_hook` consumed by feed-v2 API for card copy | Ready — feed-v2 already has graceful fallback for missing hooks |
| Session 2 (Discover) | `report_media` consumed by feed-v2 API for MediaReportCard image backgrounds | Ready — primary_media fetched from report_media table, used as full-screen card backdrop |
| Session 2 (Discover) | Media is **critical for visual quality** in the Stories feed. Reports with images get MediaReportCard (full-screen photo bg); reports without get TextReportCard (generative gradient). More media = more visually compelling feed. | **HIGH PRIORITY**: Ensure all adapters extract media aggressively. YouTube thumbnails, Reddit image posts, news article hero images. Every report_media row makes the feed better. |
| Session 2 (Discover) | `report_media` also consumed by `/api/discover/related-cards` for horizontal swipe-through cards | Ready — related-cards API resolves primary_media for reports with `has_photo_video`, used in full-screen related card display |
| Session 7 (Homepage) | DiscoverPreview uses `feed_hook` | Ready — already wired with fallback |
| Session 15 (AI/Embedding) | `embedReport()` called post-insert | Integrated — uses existing embedding.service.ts |
| Session 3 (Map) | More geolocated reports = richer map | Depends on ingestion volume |
| Session 4 (Insights) | More data = better pattern detection | Depends on ingestion volume |

---

## Cost Estimates for Mass Ingestion

| Operation | Per 1K Reports | For 1M Reports |
|-----------|---------------|-----------------|
| Feed hook (Claude Haiku) | ~$0.15-0.20 | ~$150-200 |
| Title improvement (Claude Haiku) | ~$0.15-0.20 | ~$150-200 |
| Vector embedding (OpenAI small) | ~$0.02 per 1M tokens | ~$500-600 |
| **Total** | | **~$300-400** |

---

## Files Created/Modified Summary

**New files:**
- `supabase/migrations/20260321_feed_hook.sql`
- `src/lib/services/feed-hook.service.ts`
- `src/pages/api/admin/ai/generate-hooks.ts`
- `src/lib/ingestion/adapters/reddit-v2.ts`
- `src/lib/ingestion/adapters/youtube.ts`
- `src/lib/ingestion/adapters/news.ts`
- `src/lib/ingestion/adapters/erowid.ts`
- `HANDOFF_INGESTION.md` (this file)

**Modified files:**
- `src/lib/ingestion/engine.ts` — Added feed_hook + embedding integration
- `src/lib/ingestion/adapters/index.ts` — Registered 4 new adapters
- `src/lib/ingestion/filters/quality-scorer.ts` — New source tiers + engagement boosts
- `src/lib/ingestion/filters/quality-filter.ts` — New source credibility scores
- `src/lib/ingestion/filters/index.ts` — New source labels
- `PROJECT_STATUS.md` — Updated Session 10 section
