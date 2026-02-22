# ParaDocs Development Handoff

## Project Overview

ParaDocs is a paranormal phenomena tracking platform (beta.discoverparadocs.com) built with Next.js, Supabase, and deployed on Vercel. The codebase lives at `eq1725/paradocs` on GitHub (main branch). Currently has ~592 active entries across 11 categories (UFOs, cryptids, ghosts, etc.) sourced from Reddit, NUFORC, BFRO, and other databases via an automated ingestion pipeline.

## Tech Stack

- **Frontend**: Next.js (Pages Router), React, Tailwind CSS, Leaflet (maps), D3 (constellation)
- **Backend**: Supabase (PostgreSQL + PostGIS + RLS), Next.js API routes
- **Ingestion**: Custom pipeline with source adapters, quality scoring, title improvement, location parsing, phenomenon linking
- **Deployment**: Vercel (auto-deploy on push to main)
- **Auth**: Supabase Auth with RLS policies
- **Geocoding**: Mapbox API

---

## Completed Work (This Sprint)

### 1. PostGIS Geographic Search
- Added `postgis` extension to Supabase
- Created `search_reports_by_location` RPC function for radius-based geographic queries
- Supports lat/lng center point + radius in miles, returns results with distance calculated
- Integrated with the Explore page filters

### 2. Full-Text Search
- Added `pg_trgm` extension for fuzzy matching
- Created `ts_vector` columns and GIN indexes on reports table
- Built `search_reports_fulltext` RPC with ranked results using `ts_rank`
- Supports query highlighting and relevance scoring

### 3. Map Page Enhancement
- **File**: `src/pages/map.tsx`
- Full filter suite brought to the map view: categories, phenomena, subcategories, text search, location radius
- Proximity search circle visualization on the map
- Click-to-set-center for geographic filtering
- Responsive layout with collapsible filter panel

### 4. Subcategory Filter UX
- **File**: `src/components/SubcategoryFilter.tsx`
- Grouped subcategories by parent category with visual hierarchy
- Added search/filter within subcategory list
- Collapsible category groups for cleaner UI
- Badge counts showing matching reports per subcategory

### 5. Saved Searches & Alerts
- **Files**:
  - `src/pages/api/user/searches.ts` — CRUD API for saved searches (GET, POST, PATCH, DELETE)
  - `src/components/SaveSearchButton.tsx` — Modal UI with filter summary, naming, alert toggle (daily/weekly)
  - Supabase table `saved_searches` with RLS policies for user data isolation
- Users can save any combination of active filters, toggle email alerts, manage from dashboard

### 6. Location Inference Engine
- **Files**:
  - `src/lib/ingestion/utils/location-inferrer.ts` — Deep text analysis for extracting locations from report narratives
  - `src/pages/api/admin/infer-locations.ts` — Admin API endpoint for batch location inference
- **Strategies** (in priority order):
  1. Embedded coordinates in text (decimal degrees and DMS formats) — 0.95 confidence
  2. Explicit place mentions via existing `parseLocation()` — 0.85 confidence
  3. Known landmarks database (19+ paranormal hotspots like Area 51, Skinwalker Ranch, Roswell, plus national parks and bodies of water) — 0.85 confidence
  4. Regional references ("Pacific Northwest", "Deep South", etc. — 25+ regions) — 0.55 confidence
  5. Directional state references ("northern California", "upstate New York") — 0.60 confidence
  6. Highway/road references ("along I-70", "near Route 66") — 0.35 confidence
  7. Narrative text extraction ("I was driving through rural Ohio when...") — 0.80 confidence
- **Admin endpoint modes**: `missing` (no location), `incomplete` (name but no coords), `all`
- Configurable `min_confidence` threshold, dry-run support, never overwrites existing data

---

## Key Files & Architecture

### Ingestion Pipeline
- `src/lib/ingestion/engine.ts` — Main orchestrator: `runIngestion()`, `runScheduledIngestion()`
- `src/lib/ingestion/adapters/` — Source-specific scrapers (Reddit, NUFORC, BFRO, etc.)
- `src/lib/ingestion/utils/location-parser.ts` — Basic regex location parsing (98+ international cities, US states)
- `src/lib/ingestion/utils/location-inferrer.ts` — **NEW** deep text analysis (see above)
- `src/lib/ingestion/types.ts` — TypeScript interfaces for `ScrapedReport` etc.
- `src/lib/services/geocoding.service.ts` — Mapbox geocoding with in-memory cache

### Admin Endpoints
- `src/pages/api/admin/geocode.ts` — Batch geocode reports without coordinates
- `src/pages/api/admin/infer-locations.ts` — **NEW** batch location inference
- Various other admin endpoints for ingestion management

### Frontend Components
- `src/components/Layout.tsx` — App shell, navigation
- `src/components/SubcategoryFilter.tsx` — Grouped subcategory filter
- `src/components/SaveSearchButton.tsx` — Saved searches modal
- `src/pages/map.tsx` — Interactive map with full filter suite
- `src/pages/dashboard/constellation.tsx` — User's personal constellation (needs overhaul)

### Database
- Supabase project: `bhkbctdmwnowfmqpksed`
- Extensions: `postgis`, `pg_trgm`
- Key tables: `reports`, `phenomena`, `categories`, `saved_searches`, `user_activity` (planned)
- RLS policies on `saved_searches` for user isolation

---

## Planned Work (Not Yet Started)

### UX Optimization & Constellation Overhaul
Full plan at `.claude/plans/transient-cuddling-treasure.md`. Key items:

**Workstream A: Navigation & UX**
- A1: Header & mobile nav cleanup (reorder items, active indicators, organized mobile menu)
- A2: Homepage flow improvements (View All links, count badges, Continue Your Research for returning users)
- A3: Report detail UX (breadcrumbs, More Like This section, mobile sticky bar, reading progress)
- A4: Global UX (toast notifications, image fallbacks, loading skeletons)

**Workstream B: Constellation Overhaul**
- B1: User activity tracking API + Supabase table
- B2: Dynamic constellation data model (replace hardcoded 11 nodes with per-user engagement-based graph)
- B3: Constellation visualization rewrite (deep space theme, category nebulae, phenomenon stars, exploration trail)
- B4: Constellation info panel rewrite
- B5: Stats & gamification (explorer ranks, streak tracking)

### Other Discussed Items
- Email alert delivery system for saved searches (currently saves preferences but doesn't send)
- Integration of location inference into the live ingestion pipeline (currently admin-only batch)
- Additional data source adapters
- SEO optimization for report pages

---

## Git History (Recent Commits)

| Commit | Description |
|--------|-------------|
| `d15c8ae` | Add location inference engine for ingestion pipeline |
| `1cfd011` | Add admin endpoint for batch location inference |
| `64c6780` | Add SaveSearchButton component |
| `35860f1` | Add saved searches API endpoint |
| Earlier | Map page filters, SubcategoryFilter, PostGIS/FTS setup |

---

## Environment & Access

- **Live site**: beta.discoverparadocs.com
- **Vercel**: vercel.com/eq1725s-projects/paradocs
- **Supabase**: supabase.com/dashboard/project/bhkbctdmwnowfmqpksed
- **GitHub**: github.com/eq1725/paradocs (main branch)
- **Mapbox**: Used for geocoding in `geocoding.service.ts`

---

## Notes for Next Developer

1. The `infer-locations.ts` admin endpoint is ready to run on the existing ~592 reports to fill in missing location data. Run it in `dry` mode first to preview results, then with `min_confidence: 0.6` for safe initial pass.

2. The constellation overhaul is the biggest remaining feature. The plan is detailed but the existing constellation code (`ConstellationMap.tsx`, `constellation-data.ts`) needs a near-complete rewrite.

3. The ingestion pipeline runs on a schedule. Adding `inferLocation()` calls into `engine.ts` after the existing `parseLocation()` step would automatically enrich new reports during ingestion.

4. All pushes auto-deploy to Vercel. Build takes ~1.5 minutes. The current production deployment is commit `d15c8ae`.
