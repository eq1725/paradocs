# Paradocs — Development & Data Strategy

**Last updated:** February 2026
**Status:** Pre-launch, active development

---

## Core Principle: Perfect the Pipeline, Then Fill It

We have ~2M Reddit reports ingested. We're planning tens of millions across multiple source types before going public. Every backfill/re-process at scale costs hours. The lesson: **don't iterate on data formatting at scale — iterate on a small sample, lock in the pipeline, then do one clean bulk ingestion.**

---

## Current State (Feb 2026)

### What's Done
- **~2M Reddit reports** ingested (posts + comments) from Arctic Shift
- **Title cleaning pipeline** — 9-step smart regex cleaner in `backfill-titles.ts`, also integrated into `reddit.ts` adapter for future ingestion via `title-improver.ts`
- **Media extraction pipeline** — `batch-media-backfill.ts` with URL-level deduplication and junk media filtering (logos, tracking pixels, Reddit system images, etc.)
- **AI insights pipeline** — `report-insights.service.ts` with Reddit-aware prompts
- **Phenomena classification** — batch-link runner, ~260K reports linked to phenomena
- **Purple period branding** — logo updated in Layout.tsx

### What's In Progress
- Media backfill (ready to run, testing on small batch first)
- Report display quality iteration

### What's Planned
- User dashboard overhaul
- User journey / onboarding
- Gamification system
- Additional data sources beyond Reddit
- Insight invalidation for stale Reddit insights
- Scale to tens of millions of reports

---

## Development Workflow

### Phase 1: Golden Sample (CURRENT)
1. Select ~1,000–5,000 representative reports across source types and categories
2. Iterate on every pipeline component using this sample:
   - Title formatting
   - Media extraction & display
   - AI insight quality
   - Report card rendering
   - Search/filter behavior
   - Dashboard presentation
3. Review results on the live site, tweak, repeat
4. Lock in the pipeline once everything looks right

### Phase 2: Site & UX (NEXT)
1. User dashboard redesign
2. User journey / onboarding flow
3. Gamification features
4. Core site features & navigation
5. Mobile responsiveness
6. Performance optimization (with existing ~2M for load testing)

### Phase 3: Pipeline Finalization
1. Final review of all ingestion adapters
2. Final review of all processing steps (titles, media, insights, classification)
3. Integration tests on golden sample
4. Document the full pipeline for reproducibility

### Phase 4: Bulk Ingestion
1. Optionally wipe and re-ingest existing Reddit data through final pipeline
2. Ingest new Reddit data (remaining subreddits, time ranges)
3. Ingest non-Reddit sources (MUFON, NUFORC, books, podcasts, news, etc.)
4. Run classification, insights, media extraction at scale — once
5. Target: tens of millions of reports, all consistent quality

---

## Data Pipeline Architecture

### Ingestion Flow
```
Source Data (Reddit, MUFON, etc.)
  → Source Adapter (e.g., reddit.ts)
    → Title Processing (cleanRedditTitle / improveTitle / forceGenerateTitle)
    → Media Extraction (inline URL parsing + Arctic Shift API)
    → Junk Media Filtering (isJunkMedia)
    → URL Deduplication
  → Supabase: reports table
  → Supabase: report_media table
  → Supabase: report_tags
  → Post-processing:
    → Phenomena Classification (batch-link)
    → AI Insights Generation (report-insights.service)
```

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/ingestion/adapters/reddit.ts` | Reddit post/comment → report conversion |
| `src/lib/ingestion/batch-reddit-importer.ts` | Bulk Reddit import orchestrator |
| `src/lib/ingestion/filters/title-improver.ts` | Pattern-based title generation (use sparingly — can create duplicates) |
| `src/pages/api/admin/backfill-titles.ts` | Batch title processing with `cleanRedditTitle()` |
| `src/pages/api/admin/batch-media-backfill.ts` | Media extraction with dedup + junk filtering |
| `src/pages/api/admin/invalidate-insights.ts` | Scope-based insight cache invalidation |
| `src/lib/services/report-insights.service.ts` | AI insight generation with Reddit-aware prompts |
| `scripts/backfill-titles-runner.js` | Browser console runner for title backfill |
| `scripts/backfill-media-runner.js` | Browser console runner for media backfill |
| `scripts/batch-link-runner-v2.js` | Browser console runner for phenomena classification |

### Title Processing Notes
- **`cleanRedditTitle()`** (in backfill-titles.ts): 9-step regex pipeline. Preserves uniqueness. This is the primary approach.
- **`improveTitle()`** / **`forceGenerateTitle()`** (in title-improver.ts): Pattern-based. Creates clean descriptive titles BUT generates duplicates at scale (e.g., many "Shadow Figure Encounter — Jan 2026"). Use only for individual report ingestion, not bulk backfill.
- **Strategy**: Use `cleanRedditTitle()` for bulk processing. Use `improveTitle()` only in the live ingestion adapter where each report is processed individually.

### Media Processing Notes
- **Junk filter** (`isJunkMedia`): Catches Reddit system images, logos, favicons, tracking pixels, ad network URLs, CSS assets, placeholder images
- **Dedup**: URL-level (not just report-level). Checks existing `report_media` rows by URL before inserting. Also deduplicates within each batch.
- **Two modes**: `text` (extract URLs from description, free/fast) and `arctic` (fetch from Arctic Shift API for videos/galleries, slower)
- **URL validation**: HEAD requests to verify media is still live before inserting. Dead URLs are skipped.

### Content Viability Check (Critical Quality Gate)

Not all Reddit posts have standalone value. The pipeline must classify each post and handle accordingly:

**Post Categories:**
| Category | Description | Signals | Without Media |
|----------|-------------|---------|---------------|
| **Media-primary** | Post's value IS the media (shared photo, video, EVP) | Short description (<200 chars), title references visual content ("photo", "picture", "video", "film", "footage", "captured", "look at"), `is_self: false`, has media URLs | **Worthless** — skip or flag |
| **Text-primary** | Post's value is the written narrative/experience | Long description (>500 chars), paragraphs of text, personal account, `is_self: true` | **Still valuable** — keep |
| **Link-primary** | Post links to external content (article, YouTube) | Description is mostly a URL, links to youtube/news/external | **Depends** — check if link works |

**Pipeline Behavior:**
1. During media extraction, classify each report as media-primary or text-primary
2. Validate media URLs with HEAD requests (is the link still live?)
3. If media-primary + all media dead → tag as `media-missing`, exclude from display
4. If text-primary + media dead → keep report, just skip dead media insertion
5. If text-primary + no media at all → totally fine, keep as-is

**Why this matters:** The Patterson-Gimlin film report example — a post sharing Frame 350 of the famous Bigfoot film. Without the image, it's an empty shell. We had ~2.7% of posts yielding media from text mode; many of the remaining 97% are text-primary and fine without media. But some are media-primary with dead links and should be excluded.

**Implementation location:** `batch-media-backfill.ts` for backfill, `reddit.ts` adapter for live ingestion.

---

## Console Runner Pattern

All batch operations use browser console scripts that:
- Run as async IIFEs on the beta site
- Authenticate via Supabase localStorage token
- Save progress to localStorage for resume after stop/crash
- Support graceful stop via `window.STOP_*` flags
- Auto-retry with exponential backoff on failures
- Display rolling ETA and progress stats

---

## Infrastructure
- **Frontend**: Next.js on Vercel (Pro plan, 300s function timeout)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth, admin check against `ADMIN_EMAIL`
- **Deployment**: Auto-deploy on `git push` to main
- **Domain**: beta.discoverparadocs.com
- **Primary color**: `#5b63f1` (blue-purple, `primary-500`)

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Feb 2026 | Pivot from pattern titles to regex cleaning | Pattern approach created duplicates at scale |
| Feb 2026 | Free regex over AI title improvement | AI would cost $300-500 for Haiku across 2M reports |
| Feb 2026 | Perfect pipeline before bulk ingest | Re-processing 2M+ records per change is unsustainable |
| Feb 2026 | Keep existing 2M for development | Useful for load testing, search perf, UI at scale |
| Feb 2026 | Add content viability check to pipeline | Media-primary posts with dead links are worthless shells — skip them |
| Feb 2026 | Validate media URLs before inserting | Prevents 404s on the site, avoids cluttering DB with dead links |

---

## For Future Claude Sessions

When continuing this project:
1. **Read this doc first** for strategic context
2. **Check `docs/` folder** for other reference docs
3. **Check git log** for recent changes
4. **Current phase**: Golden Sample iteration — small batch testing, then UX/dashboard work
5. **Don't run bulk operations** without explicit user approval
6. **The ~2M existing records** are development data — they may be wiped and re-ingested through the final pipeline
