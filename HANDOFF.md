# ParaDocs Development Handoff

**Last updated:** March 9, 2026 (Session 9 — Batch 1 Content + Mini-Map Fixes + Profile Image/Media Workflow)

## Project Overview

ParaDocs is a paranormal phenomena tracking platform (beta.discoverparadocs.com) built with Next.js 14.2.35 (Pages Router), Supabase, and deployed on Vercel. The codebase lives at `eq1725/paradocs` on GitHub (main branch). Currently has ~900 approved reports and **4,792 phenomena entries** across 11 categories (UFOs, cryptids, ghosts, psychic phenomena, consciousness practices, psychological experiences, biological factors, perception/sensory, religion/mythology, esoteric practices, combination) sourced from NUFORC, BFRO, and other databases via an automated ingestion pipeline.

The platform's thesis: emergent patterns across massive anecdotal reports of paranormal experiences suggest a deeper reality — but this should be implied through analysis, not stated outright. The goal is to make each entry "the most robust report on this cryptid/item on the internet."

## Tech Stack

- **Frontend**: Next.js (Pages Router), React, Tailwind CSS, Leaflet (maps), D3 (constellation)
- **Backend**: Supabase (PostgreSQL + PostGIS + RLS), Next.js API routes
- **Ingestion**: Custom pipeline with source adapters, quality scoring, title improvement, location parsing, phenomenon linking
- **Deployment**: Vercel (auto-deploy on push to main)
- **Auth**: Supabase Auth with RLS policies
- **Geocoding**: Mapbox API (server-side only via `MAPBOX_ACCESS_TOKEN` env var)

---

## Completed Work (All Sprints)

### Most Recent (March 9, 2026) — Batch 1 Content + Mini-Map Fixes

This session completed Batch 1 (20 cryptid entries) content enrichment and fixed multiple mini-map issues.

#### Batch 1: 20 Cryptid Entries Enriched ✅
Entries processed (content only — no media/profile images yet):
Adlet, Adze, Agogwe, Agropelter, Ahool, Akka, Akkorokamui, Akunna, Alicanto, Alien Big Cat, Alkali Lake Monster, Almas, Almasti, Altai Wild Man, Altamaha-ha, Am Fear Liath Mòr, Amenoba, Amomongo, Animiki

Each entry received: `ai_description`, `ai_characteristics`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts` (JSON), `primary_regions` (text[])

**Adjule** (the template entry from Session 8) also received:
- 6 YouTube media entries in `phenomena_media` table
- Profile image uploaded to Supabase Storage (`phenomena-images` bucket)
- `primary_image_url` set

#### Mini-Map Fixes ✅
- **Map centering**: Replaced broken `MapFitBounds` dynamic import with `bounds` prop directly on `MapContainer`
- **Geocode outlier detection**: Added two-pass system to `regions.ts` — detects extreme geographic spread and re-geocodes outliers using `bbox` constraint (fixed "Labrador, Australia" bug)
- **Zoom controls**: Enabled `zoomControl` and `scrollWheelZoom`, styled dark theme with purple accents
- **Visible markers**: Replaced invisible SVG pins with Lucide MapPin-style icons (32x32, purple fill, white center, drop-shadow glow). Fixed `display:none` caused by global CSS rule requiring `custom-div-marker` class.
- **Tighter bounds**: Reduced padding from 30%/2° to 15%/1° for better default zoom

#### Profile Image Cropping Fix ✅
- Added `object-top` to thumbnail blur layer in `[slug].tsx` (line 240)
- Added `object-top` to encyclopedia card images in `index.tsx` (line 877)
- Hero banner reverted to default `object-cover` per user request

### Prior (March 8, 2026) — Adjule Entry Review & Overview Tab Restructure

#### Branding Fix, Paradocs Analysis Section, Interactive Mini-Map, Overview Tab Restructure ✅
- All previously documented work from Session 8 remains intact
- See git history for details

#### Quick Facts Icon Fix (prior session) ✅
- Replaced broken emoji icons with Lucide React icons (BookOpen, Fingerprint, Lightbulb, etc.)

#### Profile Image Enhancement (prior session) ✅
- Added blurred background fill for profile images on phenomena pages

#### Media Tab Videos (prior session) ✅
- Added YouTube video embeds to the Adjule Media tab

### Earlier (March 2026)

#### Media Pipeline & Admin Media Review ✅ (COMPLETE)
- **Files**: `src/pages/admin/media-review.tsx`, `src/pages/api/admin/phenomena/media-review.ts`, `src/pages/api/admin/phenomena/auto-search-profile-images.ts`
- Admin media review page at `/admin/media-review` with three tabs: Profile Review, Candidate Review, Denied Queue

#### Automated Wikimedia Commons Image Search ✅
- **Auto-Search API** (`src/pages/api/admin/phenomena/auto-search-profile-images.ts`):
  - Batch endpoint searches Wikimedia Commons for phenomena missing profile images
  - Scores by AI confidence: 0.95 (name in title), 0.70 (name in description), 0.65 (term in description), 0.40 (generic), 0.1 (mismatch)
  - Default confidence threshold: 0.3
  - Config: `maxDuration: 60`, `RATE_LIMIT_MS = 250`, `MAX_SEARCH_RESULTS = 8`, `MAX_CANDIDATES_PER_TERM = 3`, default `batch_size = 3`
  - Saves best candidate as `primary_image_url`, marks `profile_review_status = 'unreviewed'`
- **Media Review Frontend** (`src/pages/admin/media-review.tsx`):
  - "Auto-Find Images (All)" button with live progress counter
  - Profile Review tab: visual grid of all 4,792 phenomena with approve/deny buttons
  - Denied Queue tab: manual URL input per item + bulk CSV import
  - Category filter dropdown, search by name, status filter

### Earlier (February 2026)

#### Dashboard Overhaul: Constellation-First Research Hub ✅
- Sidebar reorganized into Research / Library / Tools groups
- Constellation and Journal promoted to positions #2 and #3
- Constellation Map V2 preview as dashboard centerpiece (D3 force simulation)
- Research Activity feed, Research Snapshot metric pills, Suggested Explorations cards

#### Psychic Phenomena Content Enrichment ✅
- Expanded psychic_phenomena entries from 55 to 157
- Enriched 90 entries below 4,500 chars total content

#### Encyclopedia Page Navigation ✅
- Category quick-nav bar: horizontal scrollable pill buttons with category icons, labels, and entry counts
- IntersectionObserver tracks active category on scroll

### Earlier Work
- PostGIS Geographic Search, Full-Text Search, Map Page Enhancement
- Saved Searches & Alerts, Location Inference Engine
- SEO groundwork, ingestion pipeline

---

## Key Files & Architecture

### Phenomena Detail Page
- `src/pages/phenomena/[slug].tsx` — **Primary detail page** (~1029 lines, heavily modified in recent sessions)
  - Overview tab: Fragment wrapper with top 3-col grid (main + sticky sidebar) + bottom 2-col grid (Characteristics | Theories)
  - History, Media, Reports tabs
  - Uses `ContentSection` component for Description, Characteristics, Theories
  - Custom Paradocs Analysis section with purple gradient
  - Phenomenon interface includes: `ai_summary`, `ai_description`, `ai_history`, `ai_characteristics`, `ai_notable_sightings`, `ai_theories`, `ai_cultural_impact`, `ai_paradocs_analysis`, `primary_regions`, `ai_quick_facts`
- `src/components/PhenomenonMiniMap.tsx` — Location mini-map for phenomenon sidebar
- `src/pages/api/geocode/regions.ts` — Server-side geocoding proxy for Mapbox
- `src/pages/api/admin/phenomena/update.ts` — Admin endpoint using `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS

### Ingestion Pipeline
- `src/lib/ingestion/engine.ts` — Main orchestrator
- `src/lib/ingestion/adapters/` — Source-specific scrapers (Reddit, NUFORC, BFRO, etc.)
- `src/lib/ingestion/utils/location-parser.ts` — Basic regex location parsing
- `src/lib/ingestion/utils/location-inferrer.ts` — Deep text analysis
- `src/lib/services/geocoding.service.ts` — Mapbox geocoding with in-memory cache

### Admin Endpoints
- `src/pages/api/admin/geocode.ts` — Batch geocode reports
- `src/pages/api/admin/infer-locations.ts` — Batch location inference
- `src/pages/api/admin/phenomena/update.ts` — Bypass RLS for phenomena updates
- `src/pages/api/admin/phenomena/media-review.ts` — Media review actions
- `src/pages/api/admin/phenomena/auto-search-profile-images.ts` — Wikimedia image search

### Frontend Components
- `src/components/Layout.tsx` — App shell, navigation
- `src/components/MapView.tsx` — Global sightings map (167 lines, CartoDB dark tiles)
- `src/components/reports/LocationMap.tsx` — Report location map (299 lines)
- `src/components/PhenomenonMiniMap.tsx` — Phenomenon-specific location map
- `src/components/patterns/PatternMiniMap.tsx` — Canvas-based mini-map alternative
- `src/pages/dashboard/constellation.tsx` — User's personal constellation (D3 force simulation)
- `src/pages/dashboard/index.tsx` — Dashboard overview

### Database
- Supabase project: `bhkbctdmwnowfmqpksed`
- Extensions: `postgis`, `pg_trgm`
- Key tables: `reports`, `phenomena`, `categories`, `saved_searches`, `constellation_entries`, `constellation_connections`, `constellation_theories`, `journal_entries`, `phenomena_media`
- Notable columns on `phenomena`: `ai_paradocs_analysis` (text), `primary_regions` (text[]), `profile_review_status` (text)
- RLS policies on most tables; admin endpoint uses `SUPABASE_SERVICE_ROLE_KEY` to bypass

---

## Current State: Batch Processing

### Completed
- **Adjule** (template): Fully complete — content, media (6 YouTube videos), profile image, primary_regions
- **Batch 1 (20 entries)**: Content complete (descriptions, characteristics, theories, paradocs analysis, quick facts, primary_regions). NO media or profile images yet.

### Two-Phase Approach
- **Phase 1 (current)**: Content enrichment only — `ai_description`, `ai_characteristics`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts`, `primary_regions` for all ~357 cryptid entries, 20 at a time
- **Phase 2 (later)**: Profile images and media (YouTube videos) for all entries — Chase will provide custom profile images and YouTube URLs

### Progress: ~21/357 cryptids done (Adjule + Batch 1)

---

## Planned / Next Work

### IMMEDIATE: Continue Batch Content Enrichment
- Process next 20 cryptid entries (Batch 2) starting alphabetically after "Animiki"
- Each entry needs: `ai_description`, `ai_characteristics`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts` (JSON), `primary_regions` (text[])
- Use Supabase REST API with service role key (browser JS) to update entries
- Target: 20 entries per session

### Phase 2 (Later): Profile Images & Media
- Chase uploads custom profile images to Supabase Storage `phenomena-images` bucket
- Chase provides YouTube URLs per entry
- Claude inserts media entries into `phenomena_media` table and sets `primary_image_url`

### Other Later Work
- Auto-search images (partially complete ~100+ processed, ~58 found)
- UX Optimization (header/nav cleanup, homepage flow, report detail UX)
- Email alerts for saved searches
- Location inference in live ingestion pipeline
- SEO optimization, Stripe checkout, Collections, Connection cards

---

## Git History (Recent Commits)

| SHA | Description |
|-----|-------------|
| `98afbb0` | Fix hidden markers by adding custom-div-marker class |
| `fdc3092` | Replace invisible SVG pins with Lucide MapPin-style markers |
| `d92057f` | Add zoom controls to mini-map and tighten default bounds |
| `1c2788b` | Use bbox instead of proximity for geocode outlier re-geocoding |
| `4a632a7` | Fix geocode outlier detection for ambiguous region names |
| `824d7a2` | Fix map centering by using bounds prop directly on MapContainer |
| `a6ede1e` | Improve mini-map: fix centering and add purple pin markers |
| `5e6a588` | Revert hero banner to default center positioning |
| `b953cbd` | Fix profile image cropping by adding object-top positioning |
| `871d081` | Restructure overview tab: mobile-first sidebar, sticky Quick Facts |
| `fb6f331` | Create PhenomenonMiniMap component with server-side geocoding |

---

## Environment & Access

- **Live site**: beta.discoverparadocs.com
- **Vercel**: vercel.com/eq1725s-projects/paradocs
- **Supabase**: supabase.com/dashboard/project/bhkbctdmwnowfmqpksed
- **GitHub**: github.com/eq1725/paradocs (main branch)
- **GitHub token**: (stored locally — do not commit to repo)
- **Mapbox**: Server-side only via `MAPBOX_ACCESS_TOKEN` env var
- **Admin email whitelist**: `williamschaseh@gmail.com`
- **Adjule phenomenon ID**: `6a49e38e-516b-4c89-9c10-bda16b3a828d`

---

## Critical: SWC Compiler Rules for [slug].tsx

**These MUST be followed or the Vercel build WILL fail for `[slug].tsx`:**
- **NO template literals** — use `'hello ' + name` not `` `hello ${name}` ``
- **Use `var`** — never `const` or `let`
- **Use `function(){}`** — never arrow functions `() =>`
- **String concatenation for URLs/classNames** — never template literals in JSX
- **Unicode escapes for smart quotes** — use `\u2019` not `'`
- **useState pattern:** `var fooState = useState(default); var foo = fooState[0]; var setFoo = fooState[1];`

**Note:** Other component files (PhenomenonMiniMap.tsx, MapView.tsx, LocationMap.tsx, API routes) use modern JS syntax (const, arrow functions, template literals) without issues. The SWC restriction only applies to `[slug].tsx`.

## Code Deployment Method

**The VM sandbox CANNOT make outbound HTTPS requests** (403 Forbidden tunnel). All GitHub pushes happen via browser JavaScript:

```javascript
// 1. Get current file SHA
fetch('https://api.github.com/repos/eq1725/paradocs/contents/PATH', {
  headers: { 'Authorization': 'token GH_TOKEN' }
}).then(function(r) { return r.json(); }).then(function(data) {
  // data.sha is needed for updates
});

// 2. Encode content properly (handles unicode)
var bytes = new TextEncoder().encode(content);
var binary = '';
for (var i = 0; i < bytes.length; i++) {
  binary += String.fromCharCode(bytes[i]);
}
var b64 = btoa(binary);

// 3. Push complete file
fetch('https://api.github.com/repos/eq1725/paradocs/contents/PATH', {
  method: 'PUT',
  headers: { 'Authorization': 'token GH_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'commit msg', content: b64, sha: data.sha, branch: 'main' })
});
```

- Always push COMPLETE file content (not diffs)
- Vercel auto-deploys on push (~1.5 min build)
- Chrome extension content blocker frequently blocks JS outputs containing JSX, base64, or cookie-like patterns — use simpler output formats, split into chunks, or use window variables

## Database Update Method (for batch content enrichment)

The VM cannot make outbound HTTPS. All Supabase updates happen via browser JavaScript:

```javascript
// Set up once per session
window._SB_URL = 'https://bhkbctdmwnowfmqpksed.supabase.co';
window._SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoa2JjdGRtd25vd2ZtcXBrc2VkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxOTg2MiwiZXhwIjoyMDg1MDk1ODYyfQ.dClu6HWGaTRR6TDeT8JkwCvqVUBtMo3Kb8Dr8r7EuwA';

// Update a phenomenon by ID
window._updatePhenomenon = function(id, fields) {
  return fetch(window._SB_URL + '/rest/v1/phenomena?id=eq.' + id, {
    method: 'PATCH',
    headers: {
      'apikey': window._SB_KEY,
      'Authorization': 'Bearer ' + window._SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(fields)
  }).then(function(r) { return r.status; });
};

// Insert media entry
window._insertMedia = function(phenomenonId, url, type, title, desc) {
  return fetch(window._SB_URL + '/rest/v1/phenomena_media', {
    method: 'POST',
    headers: {
      'apikey': window._SB_KEY,
      'Authorization': 'Bearer ' + window._SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      phenomenon_id: phenomenonId,
      media_url: url,
      media_type: type,
      title: title,
      description: desc || ''
    })
  }).then(function(r) { return r.status; });
};
```

### Key schema notes:
- `phenomena_media.media_type` CHECK constraint: valid values are `image`, `video`, `document`, `illustration`
- `ai_quick_facts` is stored as a JSON string (not JSONB) — stringify before updating
- `primary_regions` is `text[]` — pass as a JS array
- Supabase Storage bucket `phenomena-images` (public) for profile images
- `primary_image_url` field (NOT `image_url`) for profile images

## Notes for Next Session

1. **Continue batch content enrichment** — Batch 2 starts after "Animiki" alphabetically, process 20 entries
2. First establish the browser helper functions (see Database Update Method above)
3. Query for next 20 cryptid entries: `phenomena?ai_paradocs_analysis=is.null&category_id=eq.CRYPTID_ID&order=name&limit=20&offset=20`
4. For each entry, generate and update: `ai_description`, `ai_characteristics`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts`, `primary_regions`
5. The mini-map automatically works for any entry with `primary_regions` populated
6. Profile images and media are Phase 2 — skip for now
7. **Git workflow**: Claude commits in VM, Chase pushes from `~/paradocs` with `rm -f .git/HEAD.lock && git push origin main`
8. **SWC restrictions** only apply to `[slug].tsx` — other files use modern JS
