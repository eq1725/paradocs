# HANDOFF - User Dashboard & Constellation (Session 5)

**Last updated:** March 14, 2026
**Session focus:** Research Hub multi-view architecture, constellation integration, AI insights, mobile fixes
**Design doc:** `CONSTELLATION_V2_DESIGN.md` (comprehensive — read this first)

---

## What Was Built

### Research Hub — Phase 1 & 2 (DEPLOYED & LIVE)

Transformed the old constellation-only dashboard into a full multi-view Research Hub. The product vision is "Ancestry.com for paranormal research" — users collect evidence artifacts from across the internet, organize them into case files, draw connections, and get AI-powered insights.

**Architecture decision:** Multi-view with Board as mobile-first default. Constellation repositioned as prestige visualization unlocked by progression (planned: locked at <5 artifacts, majestic at 50+). Views serve as tier gates (Free: Board+Timeline, Basic: +Map, Pro: +Constellation).

### Research Hub — Phase 3: External URL Support (DEPLOYED & LIVE)

Full external URL artifact pipeline with metadata extraction, source auto-detection, and thumbnail scraping. Users paste any URL and the system auto-fills title, description, thumbnail, and source type.

**URL extraction endpoint** (`src/pages/api/research-hub/extract-url.ts`, ~1345 lines):
- Auto-detects source type from URL (YouTube, Reddit, Twitter/X, TikTok, Instagram, podcast, news, website)
- YouTube: oEmbed API for metadata + thumbnail
- Reddit: 6-source fallback chain (oEmbed → embed.reddit.com OG tags → rxddit.com JSON mirror → noembed → jsonlink → microlink) because Reddit blocks Vercel server IPs (403 on www/old/api JSON endpoints)
- Twitter/X: Syndication API for tweet metadata
- Generic: OG tag extraction with Cheerio HTML parsing
- All extraction happens server-side with proper error handling

**Quick-add modal** (`ArtifactQuickAdd.tsx`):
- Two tabs: "Save Report" (search Paradocs reports) and "Paste URL" (external links)
- Loading bar with Tailwind `animate-pulse` during extraction
- Editable description textarea (not duplicated in preview card)
- Manual thumbnail URL field shown as fallback when extraction can't find an image
- Source type auto-detected but user-overridable
- Tags, verdict, user note fields

**Card improvements** (March 13, 2026):
- **Uniform card heights:** Cards use `h-full flex flex-col` with `flex-1` content and `mt-auto` timestamp so all cards in a grid row match height
- **Branded source logos as fallback thumbnails:** New `SourceLogos.tsx` with hand-drawn SVGs for Reddit (Snoo), YouTube (play button), X/Twitter, TikTok, Instagram, Podcast (mic), News (newspaper), Website (globe), Paradocs (eye), and a default chain-link. Shown in the source's accent color when no thumbnail image exists.
- **Action bar opacity toggle:** Changed from `hidden`/`block` to `opacity-0`/`opacity-100` so action bar always reserves space (no layout jitter on hover)
- **Unsorted section auto-expands** in BoardView when it has items

**New component:** `src/components/dashboard/research-hub/SourceLogos.tsx` — SVG logo components for all 10 source types

**Source type additions:** Expanded from 8 to 16+ source types. Full list: youtube, reddit, twitter, tiktok, instagram, podcast, news, website, paradocs_report, archive_org, academia, forum, government, blog, book, documentary, interview. All added to database CHECK constraint, `database.types.ts`, `SOURCE_TYPE_CONFIG` in research-hub-helpers.ts, SourceLogos.tsx SVGs, and ArtifactQuickAdd.tsx dropdown.

**Artifact update endpoint (March 14, 2026):** Created `src/pages/api/research-hub/artifacts/[id].ts` — PUT handler for verdict, user_note, tags, title, description updates. Auth via Bearer token, verifies artifact ownership. Previously missing (useResearchHub hook was calling it but getting 405).

**Mobile fixes (March 14, 2026):**
- BoardView.tsx: Replaced JS `isMobile` state (`useState` + `useEffect`) with CSS-only Tailwind responsive classes (`sm:hidden` / `hidden sm:grid`). Eliminates hydration flash.
- ResearchHub.tsx: Added `overflow-x-hidden` and `overscroll-behavior: contain` to content area
- ArtifactDetailDrawer.tsx: Full-screen on mobile (`w-full sm:w-96`), enlarged back button (`p-2.5`), responsive padding, X.com deduplication fix
- ArtifactCard.tsx: Action buttons always visible on mobile, responsive thumbnail height
- dashboard/index.tsx: Truncation, overflow-hidden, min-w-0, flex-shrink-0 across hero, cards, pills, constellation overlay, activity feed, account footer
- **Key lesson:** Never use JS viewport detection for responsive layout in Next.js SSR — always use CSS-only Tailwind responsive classes

### Database (7 new tables, migration LIVE on Supabase)

Migration: `supabase/migrations/20260311_research_hub_constellation_v2.sql`

| Table | Purpose |
|-------|---------|
| `constellation_artifacts` | Core evidence items (from Paradocs reports OR external URLs) |
| `constellation_case_files` | User-created groupings (e.g., "Phoenix Lights Investigation") |
| `constellation_case_file_artifacts` | Junction table (many-to-many) |
| `constellation_connections` | User-drawn relationships between artifacts |
| `constellation_ai_insights` | AI-generated patterns, suggestions, anomalies |
| `constellation_theories` | User-written theories with supporting evidence |
| `constellation_external_url_signals` | Community signal aggregation for external links |

All tables have RLS policies scoped to `auth.uid()`. Backward-compatible migration from old `constellation_entries` table included.

### API Endpoints (8 files in `src/pages/api/research-hub/`)

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `hub-data.ts` | GET | Main data loader — returns full hub payload with view-specific optimizations |
| `artifacts.ts` | GET, POST, DELETE | Artifact CRUD (paginated, filterable by case_file_id/source_type/verdict/tag) |
| `artifacts/[id].ts` | PUT | **NEW (March 14)** Single artifact update — verdict, user_note, tags, title, description |
| `case-files.ts` | GET, POST, PUT, DELETE | Case file CRUD with artifact counts |
| `case-file-artifacts.ts` | POST, DELETE | Add/remove artifacts from case files |
| `connections.ts` | GET, POST, PUT, DELETE | Connection CRUD with artifact details on both sides |
| `insights.ts` | GET, POST | AI insight retrieval + feedback (helpful/dismissed) |
| `extract-url.ts` | POST | URL metadata extraction — auto-detects source type, scrapes OG tags, multi-source fallback chain for Reddit |

### Components (13 files in `src/components/dashboard/research-hub/`)

| Component | Purpose |
|-----------|---------|
| `ResearchHub.tsx` | Main orchestrator — manages shared state, renders sidebar + active view + drawers |
| `ViewSwitcher.tsx` | Segmented control for Board/Timeline/Map/Constellation toggle |
| `BoardView.tsx` | Masonry grid (desktop) / single-column feed (mobile) with case file sections |
| `TimelineView.tsx` | Chronological vertical timeline with decade/year/month/week zoom levels |
| `MapView.tsx` | Dynamic import wrapper (ssr: false for Leaflet) |
| `MapViewInner.tsx` | Full Leaflet implementation with markers, clustering, case file layers, spatial insights |
| `ArtifactCard.tsx` | Rich card with source type badge, verdict pill, tags, thumbnail, actions |
| `ArtifactDetailDrawer.tsx` | Slide-out detail panel with editable notes, verdict, tags, connections |
| `ArtifactQuickAdd.tsx` | Modal with "Save Report" (Paradocs search) and "Paste URL" tabs |
| `InsightCard.tsx` | AI insight card with gradient styling, confidence bar, helpful/dismiss |
| `SourceLogos.tsx` | **NEW** SVG logo fallbacks for all source types (Reddit, YouTube, X, TikTok, etc.) |
| `ResearchHubSidebar.tsx` | Desktop sidebar (280px) with case files, counts, AI insights badge |
| `MobileSidebar.tsx` | Bottom sheet with slide-up animation and overlay backdrop |

### Hooks & Helpers

| File | Purpose |
|------|---------|
| `src/lib/hooks/useResearchHub.ts` | Full data context — fetching, state, mutation functions |
| `src/lib/hooks/useArtifactActions.ts` | Lightweight artifact-specific CRUD hook |
| `src/lib/research-hub-helpers.ts` | Config objects for SOURCE_TYPE_CONFIG, VERDICT_CONFIG, RELATIONSHIP_CONFIG |

### Other Changes

- `DashboardLayout.tsx` — Added `FlaskConical` icon + "Research Hub" nav link in Research group. Desktop header bell replaced with Session 7's `<NotificationBell />` component (March 20).
- `database.types.ts` — Added 7 type enums + Row/Insert/Update types for all new tables
- `src/pages/dashboard/research-hub.tsx` — Page wrapper with auth check + login redirect

---

## Known Issues & Fix History

1. **Build failure: `uuid` module not found** — Replaced `import { v4 as uuidv4 } from 'uuid'` with `crypto.randomUUID()` in 3 API files (artifacts.ts, case-files.ts, connections.ts). Node 18+ has this built-in.

2. **Runtime crash: `s.filter is not a function`** — Added defensive `Array.isArray()` guards in ResearchHub.tsx for all hook data arrays. Root cause: hook data could be undefined during edge cases.

3. **Mobile "Not authenticated" error** — Page was missing the client-side auth check that all other dashboard pages have. Added `supabase.auth.getSession()` check with `router.push('/login')` redirect.

4. **TypeScript type mismatches (non-blocking, `ignoreBuildErrors: true`):**
   - `ConstellationConnection` type in BoardView has `connection_type` field but DB type uses `relationship_type`
   - `ArtifactCard.tsx` has nullable index type issue (line 40)
   - `MapViewInner.tsx` uses `Set<string>` spread (needs `--downlevelIteration`)
   - Hooks may have query param mismatches (`caseFileId` vs `case_file_id`)

5. **CSS keyframes broken in JSX** — Inline `<style>` tags with escaped newlines produce malformed CSS in React. Fixed by using Tailwind built-in `animate-pulse` instead.

6. **Reddit blocks Vercel server IPs** — All Reddit JSON endpoints (www, old, api) return 403 from Vercel. oEmbed works (200) but lacks `thumbnail_url` for video posts. Fixed by adding `embed.reddit.com` OG tags and `rxddit.com` JSON mirror as fallback sources. Whether these fully resolve all Reddit thumbnail cases is still being verified.

7. **Description field appeared non-editable** — ArtifactQuickAdd showed description both as static text in the preview card AND as an editable textarea below. Fixed by removing the static display, keeping only the editable textarea.

8. **Cards had inconsistent heights** — Cards varied in height based on content (tags, description length, action bar visibility). Fixed with `h-full flex flex-col` layout, `flex-1` content section, `mt-auto` timestamp, and `opacity` toggle (not `hidden`/`block`) for action bar.

9. **PUT /api/research-hub/artifacts/[id] missing (March 14)** — useResearchHub hook was calling this endpoint for verdict/notes/tags updates but it returned 405. Users' edits were silently lost. Fixed by creating the [id].ts handler.

10. **X.com showing twice in ArtifactDetailDrawer (March 14)** — `sourceConfig.label` ("X.com") and `artifact.source_platform` ("X.com") both displayed with dot separator, showing "X.com · X.com". Fixed by adding `!== sourceConfig.label` dedup check.

11. **JS viewport detection causing hydration flash (March 14)** — `useState(false)` + `useEffect` on `window.innerWidth` starts as `false` during SSR, so desktop layout always renders first on mobile. Fixed by replacing with CSS-only Tailwind responsive classes (`sm:hidden` / `hidden sm:grid`).

---

## What Needs to Be Built Next (Phases 3b-5)

### Phase 3b: Constellation View (External URL support is DONE)

**External URLs: COMPLETE** — OG scraping, source auto-detection (YouTube/Reddit/Twitter/TikTok/Instagram/podcast/news), thumbnail extraction with multi-source fallback, manual thumbnail URL override, branded SVG logo fallbacks. All deployed and live.

**Constellation View (remaining):**
- Wire existing D3 force-directed graph (ConstellationMapV2, Canvas-based) to new `constellation_artifacts` + `constellation_connections` data model
- Progression unlock: locked at <5 artifacts, basic at 5+, majestic at 50+
- Node types: artifact nodes (colored by source_type), case file clusters, connection edges
- Interactive: click node to open detail drawer, drag to rearrange, zoom/pan
- Visual: particle effects on connections, pulsing for AI-suggested connections

### Phase 4: AI Intelligence Layer

- **On-add insight generation:** When user adds artifact, fire async Claude call to analyze and generate 1-3 insights
- **Weekly deep scan cron:** Analyze entire user hub for cross-artifact patterns, temporal clusters, geographic correlations
- **Community pattern detection:** Aggregate across users (anonymized) to surface meta-patterns
- **Cross-case-file suggestions:** "This artifact in Case A may relate to Case B because..."
- **Confidence scoring:** Each insight has confidence level + explanation

### Phase 5: Social & Sharing

- **Theory publishing:** Users can publish theories (with supporting artifacts) to public profile
- **Public researcher profiles:** Show published theories, research stats, expertise areas
- **Embeddable research snippets:** Share case files as embeddable widgets on external sites
- **Community signal aggregation:** When multiple users save the same external URL, boost its signal score. High-signal URLs feed back into the Paradocs ingestion pipeline (the "hybrid flywheel").

---

## SWC Constraints (CRITICAL — Read Before Coding)

The project uses SWC compiler with strict constraints:
- **NO template literals in JSX** — Use string concatenation: `'text ' + variable` not `` `text ${variable}` ``
- **Use `var`** instead of `const`/`let` where SWC complains
- **Use `function(){}` syntax** for callbacks in some contexts
- **Unicode escapes for smart quotes** — Use `\u2018` / `\u2019` instead of literal curly quotes
- **`classNames()` utility** from `@/lib/utils` for conditional CSS classes

---

## Codebase Patterns to Follow

- **Auth pattern:** `createServerClient()` with Bearer token in API routes
- **Supabase client:** `import { supabase } from '@/lib/supabase'` for client-side
- **Icons:** `lucide-react` (FlaskConical, LayoutGrid, Clock, Map, Stars, Menu, etc.)
- **Styling:** Tailwind dark theme (bg-gray-950 base, bg-gray-900/800 for surfaces)
- **Dynamic imports:** `next/dynamic` with `{ ssr: false }` for Leaflet/map components
- **Page auth:** Check session in `useEffect`, redirect to `/login` if none

---

## Quick Start for Next Session

1. Read `PROJECT_STATUS.md` (cross-feature notes)
2. Read `CONSTELLATION_V2_DESIGN.md` (full architecture spec)
3. Read this file (`HANDOFF_DASHBOARD.md`)
4. Read `HANDOFF_MOBILE.md` (current mobile state — Session 13 handles comprehensive mobile redesign)
5. Pick up from Phase 3b (Constellation View — External URL support is DONE)
