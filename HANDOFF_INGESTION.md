# HANDOFF - Data Ingestion & Pipeline (Session 10 — Revised)

**Date:** March 25, 2026 (Session 10 Revised — continued)
**Session:** Data Ingestion & Pipeline (Session 10 — Revised for index-with-attribution model)
**Status:** ✅ DEPLOYED + TESTED. NUFORC 20-report quality test: **18/20 inserted (90% pass rate)**. 8 approved, 10 pending_review. Descriptions 440-1,913 chars. Live on beta.discoverparadocs.com.
**Next:** Add API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) to Vercel for AI features → Scale to 2-5K per source → Test other adapters (BFRO, Reddit, etc.).
**Action Item (Chase — Report Experience-Curated session):** Re-seed Roswell witness cluster (13) and Rendlesham Forest cluster (6) from existing seed scripts (`seed-rendlesham-cluster.ts`, `admin-seed-roswell-witnesses.js`, `admin-roswell-cluster-upgrade.js`).
**Action Item (Chase — Vercel env vars):** Add `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` to Vercel environment variables (Settings → Environment Variables) for feed hook generation, Paradocs analysis, and vector embeddings.

---

## What Was Built (This Session — Revised)

### 1. Database Migration — Paradocs Analysis Fields

**File:** `supabase/migrations/20260323_paradocs_analysis.sql`

Added columns to `reports` table:
- `paradocs_narrative` (text) — 1-4 paragraph original contextual analysis (Paradocs editorial voice)
- `paradocs_assessment` (jsonb) — Structured assessment: credibility score, mundane explanations, content type, emotional tone
- `paradocs_analysis_generated_at` (timestamptz) — When analysis was generated
- `paradocs_analysis_model` (text) — Which model generated the analysis
- `event_date_precision` (text, CHECK constraint) — One of: exact, month, year, decade, estimated, unknown
- `source_url` (text) — Link back to original source (legally required for index model)
- `emotional_tone` (text, CHECK constraint) — For future feed ranking: frightening, awe_inspiring, ambiguous, clinical, unsettling, hopeful

Created indexes:
- `idx_reports_paradocs_analysis` — Approved reports with analysis, ordered by date
- `idx_reports_event_date_precision` — Reports with reliable dates (for On This Date feature)
- `idx_reports_missing_source_url` — Reports missing attribution (audit index)

Also ensures `feed_hook` + `feed_hook_generated_at` columns exist (from previous session).

**Migration status:** ✅ APPLIED (March 25, 2026) via Supabase SQL editor. All columns and indexes live in production.

---

### 2. Data Cleanup SQL

**File:** `supabase/migrations/20260323_data_cleanup.sql`

Pre-formatted SQL for deleting all test data while preserving curated reports.

**Status:** ✅ EXECUTED (March 25, 2026). All cleanup complete:
- Deleted ~2M hidden Reddit dev data (reddit-comments, reddit-posts, reddit archived)
- Deleted all bfro, nuforc, wikipedia, historical_archive, NULL source types
- Deleted 40 AI-generated filler reports (incorrectly labeled `source_type='curated'`, all created 2026-02-15, all with `source_url=NULL` and uniform ~1,400 char AI-written descriptions)
- Reset data_sources metrics
- Re-enabled report_phenomena trigger
- **Result:** 1 report remains — "The Roswell Incident — July 1947" (the original showcase, created 2026-02-12)

---

### 3. Paradocs Analysis Generation Service

**File:** `src/lib/services/paradocs-analysis.service.ts`

Claude Haiku-powered service that generates original contextual analysis + structured assessment for each report. This is the transformative content layer that makes Paradocs an index rather than a republisher.

**What it produces per report:**

1. `paradocs_narrative` (text) — 1-4 paragraph original editorial analysis:
   - Places the report in broader context (historical parallels, geographic patterns)
   - Notes what makes the account notable or typical
   - References relevant phenomena categories and known patterns
   - Length-proportional to source (50 words source → 1 paragraph; 500+ → 3-4 paragraphs)
   - Category-specific tone (technical for UFOs, atmospheric for ghosts, clinical for NDEs, etc.)
   - NEVER a summary or paraphrase of the source text

2. `paradocs_assessment` (JSON):
   ```json
   {
     "credibility_score": 0-100,
     "credibility_reasoning": "1-2 sentences",
     "credibility_factors": [{"name", "impact", "description"}],
     "mundane_explanations": [{"explanation", "likelihood", "reasoning"}],
     "content_type": {"suggested_type", "is_first_hand_account", "confidence"},
     "similar_phenomena": ["phenomenon name 1", "phenomenon name 2"],
     "emotional_tone": "frightening|awe_inspiring|ambiguous|clinical|unsettling|hopeful"
   }
   ```

**AI Provider:** Claude Haiku 4.5 primary, Claude Haiku 3.5 fallback. Uses `ANTHROPIC_API_KEY` env var.

**Cost optimization:** Combined single API call (narrative + assessment in one request). Fallback to separate calls if combined parsing fails. ~$0.50-0.60 per 1,000 reports.

**Key functions:**
- `generateParadocsAnalysis(reportId)` — Generate narrative + assessment for one report
- `generateAndSaveParadocsAnalysis(reportId)` — Generate and persist to database
- `generateAnalysisBatch(reportIds, options)` — Batch process with rate limiting (200ms between calls, 2s between batches of 15)
- `getParadocsAnalysisStats()` — Coverage statistics

---

### 4. Batch Analysis Generation Endpoint

**File:** `src/pages/api/admin/ai/generate-analysis.ts`

**Endpoint:** `POST /api/admin/ai/generate-analysis`

**Auth:** Bearer token (admin role check) or `x-admin-key` header.

**Actions:**

| Action | Body | Description |
|--------|------|-------------|
| `stats` | `{ action: 'stats' }` | Get analysis coverage statistics |
| `single` | `{ action: 'single', id: 'uuid' }` | Generate analysis for one report |
| `all_missing` | `{ action: 'all_missing', limit: 100 }` | Batch generate for reports without analysis |
| `all` | `{ action: 'all', force: true, limit: 50 }` | Force regenerate all (with optional limit) |

---

### 5. Source URL Audit — All 12 Adapters

Every adapter now outputs `source_url` on ScrapedReport. This is legally required for the index-with-attribution model.

| Adapter | source_url format | Status |
|---------|------------------|--------|
| NUFORC | `https://nuforc.org/sighting/?id={id}` | ✅ Verified |
| BFRO | `https://www.bfro.net/GDB/show_report.asp?id={id}` | ✅ Verified |
| Reddit (legacy) | `https://reddit.com{permalink}` | ✅ Verified |
| Reddit v2 | `https://reddit.com{permalink}` | ✅ Verified |
| NDERF | `https://www.nderf.org/Experiences/{id}.htm` | ✅ Verified |
| IANDS | `https://iands.org/nde-stories/nde-accounts/{id}` | ✅ Verified |
| Ghosts of America | `https://www.ghostsofamerica.com/ghosts/{state}/` | ✅ **FIXED** (was missing) |
| Shadowlands | `https://theshadowlands.net/places/{state}` | ✅ **FIXED** (was missing) |
| Wikipedia | `https://en.wikipedia.org/wiki/{article}` | ✅ Verified |
| YouTube | `https://youtube.com/watch?v={videoId}` | ✅ Verified |
| News | Original article URL from NewsAPI | ✅ Verified |
| Erowid | `https://erowid.org/experiences/exp.php?ID={id}` | ✅ Verified |

**Type change:** `source_url` is now **required** (not optional) in `ScrapedReport` interface.

---

### 6. Event Date Precision — All 12 Adapters

Every adapter now outputs `event_date_precision` to support the On This Date feature.

| Adapter | Precision Logic | Typical Value |
|---------|----------------|---------------|
| NUFORC | Full date → 'exact', partial → 'month'/'year' | exact |
| BFRO | Full date → 'exact', partial → 'month'/'year' | month |
| Reddit (legacy) | Post date ≠ event date | unknown |
| Reddit v2 | Post date ≠ event date | unknown |
| NDERF | No event date extracted | unknown |
| IANDS | No event date extracted | unknown |
| Ghosts of America | Year-only → 'year', full date → 'exact' | year/unknown |
| Shadowlands | No date extraction | unknown |
| Wikipedia | Year-only dates | year |
| YouTube | Upload date ≠ event date | unknown |
| News | Article date ≈ event date | exact |
| Erowid | No event date extracted | unknown |

**Type:** Added `event_date_precision?: 'exact' | 'month' | 'year' | 'decade' | 'estimated' | 'unknown'` to `ScrapedReport` interface.

---

### 7. Ingestion Engine Integration

**File:** `src/lib/ingestion/engine.ts` (modified)

**Changes:**
- Added import for `generateAndSaveParadocsAnalysis`
- **INSERT path:** After feed hook generation, now generates Paradocs Analysis (non-blocking)
- **UPDATE path:** If existing report lacks `paradocs_narrative`, generates it during update
- **INSERT + UPDATE:** Now writes `event_date_precision` and `source_url` to database
- Pipeline order: Title improvement → Slug → Phenomena linking → Media → Feed hook → **Paradocs Analysis** → Embedding

**Pipeline cost per report (all AI steps):**
- Title improvement (Haiku): ~$0.10 per 1K
- Feed hook (Haiku): ~$0.15-0.20 per 1K
- Paradocs Analysis — narrative + assessment (Haiku): ~$0.50-0.60 per 1K
- Vector embedding (OpenAI): ~$0.10 per 1K
- **Total: ~$0.85-1.00 per 1K reports, ~$850-1,000 per 1M**

---

## Previous Session Work (Preserved)

### Feed Hook Generation Service
**File:** `src/lib/services/feed-hook.service.ts`
Claude Haiku-powered, 2-3 sentence hooks for Discover feed. ~$0.15-0.20 per 1K reports.

### Batch Hook Generation Endpoint
**File:** `src/pages/api/admin/ai/generate-hooks.ts`
Actions: stats, single, all_missing, all.

### 4 New Source Adapters
- **reddit-v2** — Arctic Shift API, 13 subreddits
- **youtube** — YouTube Data API v3, 4 default channels
- **news** — NewsAPI.org, 7 search queries
- **erowid** — Erowid Experience Vaults, 5 substance categories

### Quality Scorer Updates
Source tiers for youtube (5), news (6.5), erowid (6), podcast (5.5), government (8.5).

---

## What Needs Manual Execution

### Execution Order

1. **Run data cleanup SQL** (`20260323_data_cleanup.sql`)
   - Execute in Supabase SQL editor
   - Verify 20 curated reports remain after cleanup

2. **Apply migration** (`20260323_paradocs_analysis.sql`)
   - Run via Supabase dashboard or CLI
   - Verify new columns exist: `paradocs_narrative`, `paradocs_assessment`, `event_date_precision`, `source_url`, `emotional_tone`

3. **Set environment variables** (if not already set)
   - `ANTHROPIC_API_KEY` — Claude Haiku for hooks + analysis (required)
   - `OPENAI_API_KEY` — Vector embeddings (required)
   - `YOUTUBE_API_KEY` — YouTube adapter (optional, needed for YouTube source)
   - `NEWS_API_KEY` — News adapter (optional, needed for News source)

4. **Staged ingestion (2-5K per source)**
   - Run each adapter with `limit: 50` first — verify quality
   - Run each adapter with `limit: 500` — check dedup, phenomena linking
   - Run each adapter with `limit: 2000-5000` — **HARD STOP HERE**
   - Review quality before scaling up: source_url validity, narrative quality, assessment scores

5. **Quality review checkpoint** (after 2-5K per source)
   - Spot-check 20-30 reports per source:
     - Does `source_url` link to the real source?
     - Is `paradocs_narrative` original analysis (NOT a summary)?
     - Is `paradocs_narrative` length-proportional to source?
     - Is `paradocs_assessment` valid JSON with reasonable credibility scores?
     - Is `feed_hook` compelling and cliche-free?

6. **Scale up** (only after quality review approval)
   - Remove limit, run full adapter scrapes
   - Target: 1M+ for closed beta

---

## Architecture Diagram

```
Source Adapter (scrape) → Quality Filter → Dedup Check
    ↓
Title Improvement (AI) → Slug Generation → Phenomena Linking
    ↓
DB Insert/Update → Feed Hook (Claude Haiku) → Paradocs Analysis (Claude Haiku) → Vector Embedding (OpenAI)
    ↓
Report live with: hook + narrative + assessment + embedding + source_url + event_date_precision
```

**Failure handling:** Each post-insert step is non-blocking. Any failure → report still ingested, caught by batch backfill endpoints.

---

## Post-Ingestion Verification Query

```sql
SELECT
  source_type,
  count(*) as total,
  count(feed_hook) as has_hook,
  count(paradocs_narrative) as has_narrative,
  count(paradocs_assessment) as has_assessment,
  count(source_url) as has_source_url,
  count(event_date) as has_event_date,
  count(CASE WHEN event_date_precision IN ('exact','month') THEN 1 END) as reliable_dates,
  count(emotional_tone) as has_tone,
  count(CASE WHEN id IN (SELECT source_id FROM vector_chunks WHERE source_table = 'report') THEN 1 END) as embedded
FROM reports
WHERE status = 'approved'
GROUP BY source_type
ORDER BY total DESC;
```

**Coverage targets:**
- Feed hook: 95%+
- Paradocs Analysis (narrative + assessment): 95%+
- Source URL: 100% (REQUIRED)
- Embedding: 80%+ (batch-fill remaining)
- Event date presence: varies by source

---

## Files Created/Modified Summary

**New files (this session):**
- `supabase/migrations/20260323_paradocs_analysis.sql` — DB migration
- `supabase/migrations/20260323_data_cleanup.sql` — Data cleanup SQL
- `src/lib/services/paradocs-analysis.service.ts` — Paradocs Analysis generation service
- `src/pages/api/admin/ai/generate-analysis.ts` — Batch analysis generation endpoint

**Modified files (this session):**
- `src/lib/ingestion/engine.ts` — Added Paradocs Analysis integration + event_date_precision + source_url in insert/update
- `src/lib/ingestion/types.ts` — `source_url` now required, added `event_date_precision` field
- `src/lib/ingestion/adapters/ghostsofamerica.ts` — Added `source_url` + `event_date_precision`
- `src/lib/ingestion/adapters/shadowlands.ts` — Added `source_url` + `event_date_precision`
- `src/lib/ingestion/adapters/nuforc.ts` — Added `event_date_precision`
- `src/lib/ingestion/adapters/bfro.ts` — Added `event_date_precision`
- `src/lib/ingestion/adapters/reddit.ts` — Added `event_date_precision`
- `src/lib/ingestion/adapters/reddit-v2.ts` — Added `event_date_precision`
- `src/lib/ingestion/adapters/nderf.ts` — Added `event_date_precision`
- `src/lib/ingestion/adapters/iands.ts` — Added `event_date_precision`
- `src/lib/ingestion/adapters/wikipedia.ts` — Added `event_date_precision`
- `src/lib/ingestion/adapters/youtube.ts` — Added `event_date_precision`
- `src/lib/ingestion/adapters/news.ts` — Added `event_date_precision`
- `src/lib/ingestion/adapters/erowid.ts` — Added `event_date_precision`

**Preserved from previous session (not modified):**
- `supabase/migrations/20260321_feed_hook.sql`
- `src/lib/services/feed-hook.service.ts`
- `src/pages/api/admin/ai/generate-hooks.ts`
- `src/lib/ingestion/adapters/reddit-v2.ts` (new adapter)
- `src/lib/ingestion/adapters/youtube.ts` (new adapter)
- `src/lib/ingestion/adapters/news.ts` (new adapter)
- `src/lib/ingestion/adapters/erowid.ts` (new adapter)

---

## Cross-Session Integration Points

| Session | Integration | Status |
|---------|------------|--------|
| Session 2 (Discover) | `feed_hook` for card copy | Ready |
| Session 2 (Discover) | `event_date_precision` enables On This Date cards | Ready — adapters output precision |
| Session 2 (Discover) | `emotional_tone` for session continuity ranking | Ready — generated at ingestion |
| Session 6b (Report detail) | `paradocs_narrative` + `paradocs_assessment` for Paradocs Analysis box | Ready — fields populated at ingestion |
| Session 6b (Report detail) | `source_url` for attribution link | Ready — all 12 adapters output URLs |
| Session 6b (Report detail) | Raw `description` NEVER rendered to users | Enforced — description is AI-only |
| Session 7 (Homepage) | DiscoverPreview uses `feed_hook` | Ready |
| Session 15 (AI/Embedding) | `embedReport()` called post-insert | Integrated |
| Session 3 (Map) | More geolocated reports = richer map | Depends on ingestion volume |
| Session 8 (Subscription) | Depth gating depends on content volume | Depends on ingestion volume |

---

## Session 10 Continued — Quality Test Results & Fixes

### 1. 20-Report Quality Test (NUFORC)

Ran 20-report ingestion via browser console (`/api/admin/ingest?source=UUID&limit=20`).

**Bug found:** All 20 reports failed to insert. Error: `invalid input value for enum report_status: "pending_review"`. The quality filter returns `pending_review` for scores 40-69, but the PostgreSQL `report_status` enum only had `{pending, approved, rejected, flagged, archived}`.

**Fix applied:** `ALTER TYPE report_status ADD VALUE IF NOT EXISTS 'pending_review'` — executed in Supabase SQL editor. Migration saved to `supabase/migrations/20260325_add_pending_review_status.sql`.

**Result after fix:** All 20 reports inserted successfully. However, all 20 had identical titles ("Disk Sighting in Old Bridge, New Jersey (2026-03-01)") despite having different `original_report_id` values — revealing the NUFORC adapter parsing bug.

**Test data cleanup:** All 20 test records deleted after review.

### 2. NUFORC Adapter Fix (wpDataTable Parsing)

**Root cause:** NUFORC uses WordPress wpDataTable which loads table data via AJAX/JavaScript. The adapter's `fetchWithHeaders` gets server-rendered HTML that does NOT contain the actual table row data. Sighting IDs were extracted from embedded page scripts, but the row-level regex matched the same (or no) HTML content for all IDs, resulting in identical metadata for every report.

**Fix (in `src/lib/ingestion/adapters/nuforc.ts`):**

1. **New Approach 0 — wpDataTable AJAX**: Detects wpDataTable configuration in page HTML, extracts the `table_id` and AJAX endpoint, calls the DataTables server-side processing endpoint directly to get JSON row data. This bypasses JavaScript rendering entirely.

2. **Improved Approach 1 — Row-split parsing**: Instead of using a single regex per ID (which could match across row boundaries), splits HTML at `<tr>` boundaries first, then matches IDs within isolated row substrings. Includes a duplicate-detection check: if all extracted rows have identical city+shape, the data is cleared as bad and falls through to the next approach.

3. **New Approach 3 — ID-only fallback**: If no row data is available from any HTML parsing approach, returns IDs with empty metadata. The `scrape()` method detects this and auto-enables `fetch_full_details` to scrape individual report pages.

4. **Enhanced `fetchReportDetails`**: Now extracts city, state, country, shape, and occurred date from individual report pages (not just description). When row data is empty, these fields populate the report metadata.

5. **Rate limit raised**: Default changed from 100ms to 500ms to respect NUFORC servers during individual page fetches.

### 3. Source Catalog Expansion

Created comprehensive `INGESTION_SOURCES.md` covering:
- **Tier 1**: 12 existing adapters with full config/quality docs
- **Tier 2**: 13 new high-priority adapters to build
- **Tier 3**: 2,569 sources from `Paradocs Research (1).xlsx` (2024 research), organized by phenomenon category with priority rankings

Key new source clusters identified: 670 ghost/haunting sites, 527 combination/multi-category sources, 326 UFO databases, 305 psychological experience sources, 173 cryptid databases, 166 esoteric archives, 139 consciousness practice sources, 126 psychic phenomena sources, 113 religion/mythology sources.

Estimated total addressable volume: 1.5M+ reports across all tiers.

### 4. Source-Specific Quality Thresholds

**File:** `src/lib/ingestion/filters/quality-filter.ts`

Added `SOURCE_THRESHOLDS` config — per-source approve/review/reject cutoffs and minimum description lengths. Government docs and structured databases (BFRO, NUFORC) have lower thresholds since they're pre-curated. Reddit and Erowid require higher scores due to variable quality.

`getStatusFromScore(score, sourceType?)` now accepts optional `sourceType` to use source-specific thresholds, falling back to defaults (70/40/100) when unspecified.

### 5. Enrichment Pipeline

**File:** `src/lib/ingestion/enrichment/report-enricher.ts` (NEW)

Post-adapter, pre-scoring step that fills missing structured data from description text:
- **Date extraction**: 7 regex pattern categories (exact dates, month/year, approximate years)
- **Location extraction**: US-focused patterns (City+State, City+ST abbreviation, regional, standalone state)
- **Date precision validation**: Verifies claimed precision against actual date format
- **Geocoding**: MapTiler API integration using `NEXT_PUBLIC_MAPTILER_KEY`

Key principle: NEVER fabricates data. Every extraction comes from clearly stated text.

Wired into `engine.ts` between quick-reject and quality scoring so enriched data improves quality scores.

### 6. Cross-Post Fuzzy Dedup (NEW)

**Files:** `src/lib/ingestion/engine.ts`, `src/lib/ingestion/batch-reddit-importer.ts`

**Problem found:** 21 live reports included duplicate Yowie encounter — same Reddit post cross-posted to r/cryptids and r/Paranormal. Cross-posts get different Reddit post IDs, so the exact `(source_type, original_report_id)` check didn't catch it.

**Fix:** Wired the existing fuzzy dedup engine (`dedup.ts`) into both ingestion paths:
- Before inserting a new report, queries up to 200 existing reports in the same category
- Runs `checkForDuplicate()` which compares title (30%), location (25%), date (20%), and content (25%) similarity
- **Definite match (>=0.85)**: Skip insert entirely, log as cross-post duplicate
- **Likely match (>=0.65)**: Insert but record match in `duplicate_matches` table for admin review
- **Possible match (>=0.45)**: Insert normally (no action)
- Failure is non-fatal — dedup errors never block ingestion

### 7. Deployment & NUFORC Quality Test (March 26, 2026)

**Deployment fixes pushed (3 commits):**

1. **`f131ba5d` — fix: remove duplicate config export in ingest.ts**
   - `src/pages/api/admin/ingest.ts` had two `export const config` blocks (line 5: maxDuration 120, line 187: maxDuration 300). Removed the duplicate at line 5.

2. **`4d4885ad` — fix: raise NUFORC hasUsableDescriptions threshold to 150 chars**
   - NUFORC table summaries are 50-130 chars, which passed the old 50-char `hasUsableDescriptions` check but failed the quality filter's 150-char `minDescLength`. Raised threshold to 150 to force full-page fetches.

3. **`67a55c9d` — fix: NUFORC full-page description extraction for current HTML structure**
   - Old regex patterns looked for `</p><p>`, `<article>`, `entry-content` — none of which exist in NUFORC's HTML. NUFORC uses `<b>Label:</b> value<br>` for metadata with narrative text after `<br><br>`.
   - Rewrote `fetchReportDetails` description extraction with 3 approaches:
     - Approach 1: Match text after `<b>Characteristics:</b>` followed by `<br><br>`
     - Approach 2: Split content-area by `<br><br>`, filter for narrative paragraphs (>40 chars, no metadata label prefix)
     - Approach 3: Legacy patterns for older page layouts

**20-Report NUFORC Quality Test Results:**

| Metric | Value |
|--------|-------|
| Records found | 20 |
| Records inserted | 18 (90%) |
| Records rejected | 2 (10% — descriptions too short) |
| Approved | 8 |
| Pending review | 10 |
| Duration | ~2.5 minutes (full-page fetches) |
| Description lengths | 442–1,913 chars |
| Error messages | None |

**Sample reports on live site (beta.discoverparadocs.com/explore):**
- "Triangle Sighting in Guelph, ON (2026-03-05)" — 917 chars, approved, High Credibility
- "Orb Sighting in Costa del Este, Buenos Aires Province (2026-03-01)" — 1,913 chars, approved, High Credibility
- "Other Sighting in Ringwood, England (2026-03-04)" — 442 chars, pending_review
- "Orb Sighting in Sint Jacobiparochie, Friesland (2026-03-05)" — 801 chars, approved

**Database state after test:**
- 1 curated/approved (Roswell)
- 8 nuforc/approved
- 10 nuforc/pending_review
- Total: 19 reports (9 visible on site)

### 8. Media Compliance & Policy (March 26, 2026)

**Commits (pending push):**
- Content Classification crash fix (`ce08d0a9`)
- Admin report review page (`b6ad00db`)
- Media policy + storage integration (this session)

**Files created:**
- `MEDIA_POLICY.md` — Full ToS review and source-by-source media policy matrix
- `src/lib/ingestion/media-policy.ts` — Source media policy config (download / link_only / embed_only per source)
- `src/lib/ingestion/media-storage.ts` — Reusable download+store utility for permitted sources (Supabase `report-media` bucket)

**Files modified:**
- `src/lib/ingestion/engine.ts` — Media insert now routes through `processMediaItem()` which checks source policy before deciding to download+store vs. hotlink

**Policy summary:**
- ✅ Download + store: Wikipedia/Wikimedia (CC BY-SA), Government/FOIA/BlackVault/GEIPAN (public domain), Kaggle imports (per license)
- ⚠️ Link only: NUFORC, BFRO, Reddit, Erowid, NDERF, IANDS, Shadowlands, Ghosts of America, News, MUFON
- 🎬 Embed only: YouTube (iframe embed player)
- ❌ No AI-generated images on report detail pages (confirmed: not present in current code)

**Admin Report Review page:**
- `src/pages/admin/report-review.tsx` — Full review UI with status tabs, source filters, credibility score bars, expand-to-detail, bulk approve/reject
- `src/pages/api/admin/report-review.ts` — API endpoint with auth, GET (paginated listing + stats), POST (approve/reject actions)

### 9. Outstanding Items

- **Git push** (Chase): Push pending commits: `ce08d0a9` (crash fix), `b6ad00db` (admin review page), + media policy commits
- **Test AI pipeline**: After API keys are set, verify feed hooks + paradocs analysis generation on the 18 NUFORC reports
- **Scale testing**: Run 50 → 500 → 2,000 per source for NUFORC, then test BFRO, Reddit, Wikipedia adapters
- **Re-seed Roswell/Rendlesham clusters**: Chase action item from previous session
- **Wikipedia media download test**: Run a small Wikipedia ingestion batch to verify download+store works with CC BY-SA attribution
- **Pre-existing type error**: `LogToConstellation.tsx` lines 96, 127 — concat type mismatch (not related to ingestion)
