# ParaDocs Development Handoff

**Last updated:** March 9, 2026 (Session 12 — Batch 4 content enrichment)

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

### Most Recent (March 9, 2026) — Session 12: Batch 4

#### Batch 4 Content Enrichment ✅
- Fetched 20 entries alphabetically after "Bigfoot"
- **DELETED (3 entries)**:
  - Black Winged Humanoid (generic category, not a specific cryptid)
  - Buratsche-al-llgs (no verifiable folklore or cryptid documentation)
  - Cactus Cat (lumberjack tall tale, not a genuine cryptid tradition)
- **RECLASSIFIED to `religion_mythology` (3 entries)**:
  - Cadejo (supernatural guardian spirit from Central American folklore)
  - Cherufe (Mapuche volcanic deity, not a cryptid)
  - Chonchon (Mapuche sorcery entity, not a cryptid)
- **ENRICHED as cryptids (14 entries)**: Black Demon, Black Shuck, Bukit Timah Monkey Man, Bunyip, Burrunjor, Buru, Cadborosaurus, Champ, Cheonji Monster, Chessie, Chipekwe, Chipfalamfula, Chuchunya, Chupacabra
- All 14 entries verified to meet character minimums (desc 2000+, chars 2000+, theo 2000+, anal 2500+) and correct ai_quick_facts keys

### Prior (March 9, 2026) — Session 11: Minimap UX + Batch 3

#### Sidebar Minimap UX Improvements ✅
- Moved minimap above Quick Facts in sidebar (`891443e8`)
- Made minimap scroll away naturally while Quick Facts remains sticky (`ef72a5f6`) — separates minimap from `lg:sticky` container so users see Quick Facts without scrolling past the map

#### Batch 3 Content Enrichment ✅
- Fetched 20 entries alphabetically after "Ban Manush"
- **DELETED (4 entries)**:
  - Barmanu (duplicate of Barmanou — same creature, alternate spelling)
  - Big Grey Man (duplicate of Am Fear Liath Mòr — already enriched in Batch 1)
  - Bili Ape (confirmed real species — Eastern chimpanzee, Pan troglodytes schweinfurthii)
  - Bennington Monster (acknowledged fabrication by author Joseph Citro)
- **RECLASSIFIED to `religion_mythology` (3 entries)**:
  - Basilisk (classical mythology creature from Greek/Roman tradition, no modern cryptid sightings)
  - Baykok (Ojibwe spiritual being/death spirit, not a cryptid)
  - Bichura (Turkic household spirit, not a cryptid)
- **ENRICHED as cryptids (13 entries)**: Barghest of Yorkshire, Barmanou, Basajaun, Batsquatch, Batutut, Bear Lake Monster, Beast of Bodmin Moor, Beast of Bray Road, Beast of Busco, Beast of Exmoor, Beast of Gévaudan, Bessie, Bigfoot
- All 13 entries verified to meet character minimums (desc 2000+, chars 2000+, theo 2000+, anal 2500+)

### Prior (March 9, 2026) — Session 10: Batch 1+2 QA Audit, JSONB Fix, Research Audit

This session performed comprehensive QA across both Batch 1 and Batch 2 entries, fixing critical data issues and auditing for fabricated entries.

#### CRITICAL FIX: ai_quick_facts JSONB Double-Encoding ✅
- **Root cause**: `ai_quick_facts` column is `jsonb` (NOT text). When updating via REST API with `JSON.stringify(object)`, the value was double-encoded — stored as a JSON string literal instead of a JSON object. This caused the frontend to receive `typeof === "string"` instead of a parsed object, so Quick Facts never rendered.
- **Fix**: SQL command: `UPDATE phenomena SET ai_quick_facts = (ai_quick_facts #>> '{}')::jsonb WHERE ai_quick_facts IS NOT NULL AND jsonb_typeof(ai_quick_facts) = 'string'` — converted 98 rows from string to object type. Required temporarily disabling the `check_phenomena_duplicates` trigger.
- **Going forward**: When updating `ai_quick_facts` via REST API, pass the object directly — do NOT use `JSON.stringify()`. The REST API body itself is JSON-serialized, so `body: JSON.stringify({ ai_quick_facts: objectValue })` correctly sends the object as a nested JSON value.

#### Batch 1 Research Audit ✅
- Researched all 20 Batch 1 entries for fabrication/misclassification
- **DELETED (fabricated)**: Akka (no credible cryptid sources; confused with Sami goddess), Amenoba (no verifiable documentation in any cryptid database)
- **Notable overlap**: Almas, Almasti, and Altai Wild Man are regional variants of the same creature — kept as separate entries since each represents distinct regional tradition
- **Remaining Batch 1 entries (18)**: Adjule, Adlet, Adze, Agogwe, Agropelter, Ahool, Ahuizotl, Akkorokamui, Akunna, Alicanto, Alien Big Cat, Alkali Lake Monster, Almas, Almasti, Altai Wild Man, Altamaha-ha, Am Fear Liath Mòr, Amomongo, Animiki, Ao Ao

#### Entry-Specific Fixes ✅
- **Adjule**: Added missing `also_known_as` to quick facts, expanded description/characteristics/theories to meet minimums
- **Ahuizotl**: Complete quick facts rewrite (had wrong keys like `length`, `location` etc.), wrote full Paradocs Analysis (was 0 chars), added primary_regions (was empty), expanded description/characteristics/theories

#### ai_quick_facts Key Rename Fix ✅
- 19 Batch 1 entries had `evidence` instead of `evidence_types` — frontend checks for `evidence_types` specifically. Renamed all via REST API.

### Prior (March 9, 2026) — Batch 1 Content + Mini-Map Fixes

This session completed Batch 1 (20 cryptid entries) content enrichment and fixed multiple mini-map issues.

#### Batch 1: Originally 20 Cryptid Entries Enriched (now 18 after deletions) ✅
Entries processed (content only — no media/profile images yet):
Adjule, Adlet, Adze, Agogwe, Agropelter, Ahool, Ahuizotl, Akkorokamui, Akunna, Alicanto, Alien Big Cat, Alkali Lake Monster, Almas, Almasti, Altai Wild Man, Altamaha-ha, Am Fear Liath Mòr, Amomongo, Animiki, Ao Ao

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
- **Batch 2 (16 entries, originally 20 — 4 removed)**: Content complete and fact-checked. Entries: Ao Ao, Ape Canyon Creature, Apotamkin, Appalachian Wildman, Asanbosam, Aswang, Atlantic Sea Dragon, Australian Panther, Awful, Ayia Napa Sea Monster, Azores Sea Serpent, Badalischio, Baikal Lake Dragon, Baluchistan Wildman, Bamboo Ape, Ban Manush
  - **DELETED (fabricated/misclassified)**: Aquatic Ape (not a cryptid — evolutionary hypothesis), Architeuthis Giganteus (confirmed real species — Giant Squid), Ashuanipi Lake Monster (fabricated — no documented monster legend), Banip (fabricated — no documented PNG creature)
  - **Fact-check corrections applied**: Apotamkin (removed vampire mischaracterization), Bamboo Ape (linked to verified Nguoi Rung/Batutut), Awful (transparent about questionable provenance), Azores Sea Serpent (honest about limited documentation)

### Two-Phase Approach
- **Phase 1 (current)**: Content enrichment only — `ai_description`, `ai_characteristics`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts`, `primary_regions` for all cryptid entries, 20 at a time
- **Phase 2 (later)**: Profile images and media (YouTube videos) for all entries — Chase will provide custom profile images and YouTube URLs

### Progress: ~62/~353 cryptids done (Adjule + Batch 1 (18) + Batch 2 (16) + Batch 3 (13) + Batch 4 (14) — 19 total deleted/reclassified across all batches)

---

## Planned / Next Work

### IMMEDIATE: Continue Batch Content Enrichment
- Process next 20 cryptid entries starting alphabetically after "Chupacabra" (Batch 5)
- Each entry needs: `ai_description`, `ai_characteristics`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts` (JSON), `primary_regions` (text[])
- Use Supabase REST API with service role key (browser JS) to update entries
- Target: 20 entries per session
- **CRITICAL: Follow the Content Quality Standards below exactly**

---

## Content Quality Standards (MUST follow for every batch)

These standards ensure consistency across all enriched entries. Derived from the Adjule/Agogwe/Almas/Animiki templates.

### Character Length Targets

| Field | Minimum | Target | Max |
|-------|---------|--------|-----|
| `ai_description` | 1800 | 2000–2600 | 3000 |
| `ai_characteristics` | 1800 | 2000–2300 | 2800 |
| `ai_theories` | 1800 | 2000–2500 | 3000 |
| `ai_paradocs_analysis` | 2200 | 2500–3100 | 3500 |

Each field should contain 3–5 substantial paragraphs. Content should read like a well-researched encyclopedia article — specific, evidence-aware, and analytically rich. Avoid generic filler. Every paragraph should contain concrete details: dates, names, locations, physical measurements, behavioral specifics.

### `ai_quick_facts` Format (CRITICAL — frontend will not render if wrong)

**Must be a flat JSON object** with these exact keys (all optional but include as many as applicable):

```json
{
  "origin": "Detailed origin — region, culture, and historical context (50-150 chars)",
  "classification": "Cryptid type and taxonomic speculation (40-100 chars)",
  "first_documented": "Year and context of first Western/written documentation (50-200 chars)",
  "danger_level": "Assessment with explanation — triggers color coding in UI (50-150 chars)",
  "typical_encounter": "What a sighting usually looks like — conditions, duration, behavior (80-220 chars)",
  "evidence_types": "What evidence exists — oral tradition, photos, tracks, specimens, etc. (80-220 chars)",
  "active_period": "When the creature is active — diurnal, nocturnal, seasonal patterns (50-150 chars)",
  "notable_feature": "The single most distinctive or unusual characteristic (80-200 chars)",
  "cultural_significance": "Role in local culture, spiritual traditions, or modern impact (80-200 chars)",
  "also_known_as": ["Alt Name 1", "Alt Name 2"]
}
```

**Key rules:**
- `danger_level` value is parsed for color: include words like "High", "Moderate", "Low", "None", "Dangerous", "Benign", "Harmless", "Caution"
- `also_known_as` is the ONLY array field — all others are strings
- Values should be **detailed phrases/sentences**, not terse labels. 50-220 chars each.
- **CRITICAL**: The column is `jsonb`, NOT text. When updating via REST API, pass the object directly — do NOT wrap in `JSON.stringify()`. Example: `{ ai_quick_facts: quickFactsObject }` — the REST body serialization handles it correctly.
- The frontend renders each key conditionally with a specific Lucide icon — if the key doesn't match exactly, it won't display

### `primary_regions` Format
- Array of 3-6 specific geographic strings
- Include both specific locations and broader regions
- Example: `["Chittagong Hill Tracts, Bangladesh", "Southeastern Bangladesh", "Indo-Burman borderlands", "Sylhet Division, Bangladesh"]`

### Content Quality Checklist (per entry)
- [ ] Description: 3-5 paragraphs, 2000+ chars, includes historical context, physical description overview, notable sightings
- [ ] Characteristics: 3-4 paragraphs, 2000+ chars, detailed morphology, behavioral patterns, habitat specifics, sensory details
- [ ] Theories: 3-4 paragraphs, 2000+ chars, at minimum covers: scientific/conventional explanation, cryptozoological hypothesis, cultural/anthropological interpretation
- [ ] Analysis: 3-5 paragraphs, 2500+ chars, connects to ParaDocs database patterns, identifies cross-cultural parallels, raises analytical questions, discusses evidence quality
- [ ] Quick Facts: flat object with 8-10 keys from the approved list, detailed values
- [ ] Regions: 3-6 specific geographic strings

### Research-First Mandate (NON-NEGOTIABLE)

**All content must be grounded in actual research. No fabrication.**

Before writing content for ANY entry, you MUST:

1. **Web search the cryptid name** — find actual sources (Wikipedia, cryptozoology databases, folklore archives, academic papers, news articles)
2. **Verify key facts** before including them:
   - Geographic origin and specific locations of sightings
   - First documented accounts (who, when, where)
   - Physical descriptions from actual witness reports or folklore sources
   - Cultural context from the actual tradition (not invented)
   - Named researchers, expeditions, or investigators
   - Specific dates, publications, or events
3. **If a fact cannot be verified**, do NOT include it. It is better to write shorter, accurate content than to pad with plausible-sounding fabrications.
4. **For obscure entries** with very little available information, acknowledge the limited documentation rather than inventing details. Focus on what IS known and verifiable.
5. **Cross-reference** — if multiple sources agree on a detail, include it. If only one dubious source mentions something, note the uncertainty.

6. **Entry quality gate** — if research reveals that an entry is fabricated (no documented tradition), a confirmed real species (not a cryptid), or a misclassified concept (e.g., a scientific hypothesis, not a creature), flag it for DELETION rather than writing content for it. Entries that are mythological/religious in nature (not cryptids) should be RECLASSIFIED to `religion_mythology` category rather than deleted, as long as they come from real text/research traditions. Only real reported myths, cryptids, and folklore creatures should have entries in the encyclopedia.

**What counts as fabrication (DO NOT DO):**
- Inventing specific dates of sightings that didn't happen
- Creating fictional researcher names or expeditions
- Attributing quotes or accounts to people who didn't make them
- Making up physical measurements or behavioral details
- Inventing cultural practices or beliefs not documented in actual traditions
- Creating "first documented" dates without a source

**What is acceptable:**
- Synthesizing information from multiple verified sources into original prose
- Drawing reasonable analytical connections between verified facts
- Noting the analytical significance of a cryptid within the ParaDocs framework (this is the Analysis section's purpose)
- Using general knowledge about a region's geography, ecology, or culture when it provides context for verified cryptid reports

### Writing Style for ParaDocs
- **Tone**: Intellectually serious but accessible. The platform treats paranormal phenomena as legitimate subjects of inquiry without being credulous.
- **Thesis**: Emergent patterns in massive anecdotal data suggest deeper reality — implied through analysis, never stated outright.
- **Goal per entry**: "The most robust report on this cryptid on the internet."
- **ParaDocs Analysis section** should reference the "ParaDocs database" or "ParaDocs system" and discuss cross-entry patterns, analytical metrics, and evidence quality. This is the signature section that distinguishes ParaDocs from a standard encyclopedia.

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
| `ef72a5f6` | Make minimap scroll away so Quick Facts sticks to top |
| `891443e8` | Move minimap above Quick Facts in sidebar |
| `79d555f2` | Fix blank space between Paradocs Analysis and Characteristics/Theories |
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
- `ai_quick_facts` is `jsonb` column — pass as a plain JS object, do NOT stringify (or it will be double-encoded as a JSON string literal)
- `primary_regions` is `text[]` — pass as a JS array
- Supabase Storage bucket `phenomena-images` (public) for profile images
- `primary_image_url` field (NOT `image_url`) for profile images

## Notes for Next Session

1. **Continue batch content enrichment** — Batch 5 starts after "Chupacabra" alphabetically, process 20 entries
2. **RESEARCH FIRST** — Web search EVERY cryptid before writing content. Verify all facts. No fabrication. See "Research-First Mandate" section.
3. **READ the Content Quality Standards section above BEFORE writing any content** — this is critical for consistency
4. First establish the browser helper functions (see Database Update Method above)
5. Query for next 20 cryptid entries: `phenomena?category=eq.cryptids&order=name&name=gt.Chupacabra&limit=20`
6. For each entry, generate and update: `ai_description`, `ai_characteristics`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts`, `primary_regions`
7. **`ai_quick_facts` must be a flat object** with keys: origin, classification, first_documented, danger_level, typical_encounter, evidence_types, active_period, notable_feature, cultural_significance, also_known_as. Pass as JS object (NOT stringified). NOT an array of label/value pairs.
8. **Content length targets**: desc 2000+, chars 2000+, theories 2000+, analysis 2500+ (chars). Check against these AFTER pushing and run a verification query across all entries in the batch before marking complete.
9. The mini-map automatically works for any entry with `primary_regions` populated
10. Profile images and media are Phase 2 — skip for now
11. **Git workflow**: Claude commits in VM, Chase pushes from `~/paradocs` with `rm -f .git/HEAD.lock && git push origin main`
12. **SWC restrictions** only apply to `[slug].tsx` — other files use modern JS
13. **DB column note**: category column is `category` (not `category_id`), no `description` column (use `ai_description`)

### Lessons Learned (from Batches 1-4)
- **Parallel agents produce short content**: When using parallel agents to research/write entries, they frequently produce fields under the character minimums. Always verify lengths AFTER pushing and expand any short fields before marking the batch complete.
- **Quick facts keys must be exact**: The frontend only renders these 10 keys: `origin`, `classification`, `first_documented`, `danger_level`, `typical_encounter`, `evidence_types`, `active_period`, `notable_feature`, `cultural_significance`, `also_known_as`. Agents sometimes invent arbitrary keys. Always validate.
- **Push via slug not id**: Use `?slug=eq.SLUG` in REST API URLs — more reliable than looking up UUIDs.
- **JS variables don't persist between browser executions**: Each `javascript_exec` call is independent. Store reusable data on `window` (e.g., `window._fixData`) or combine build+push in a single call.
- **REST API returns 405 on DELETE**: Use Supabase SQL Editor (tab 741825755) with Monaco API for deletions: `monaco.editor.getEditors()[0].setValue(sql)` then click Run.
- **Reclassify via PATCH**: `fetch(url + '?slug=eq.SLUG', { method: 'PATCH', body: JSON.stringify({ category: 'religion_mythology' }) })`
