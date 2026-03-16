# HANDOFF_MAP.md — Map & Geospatial Design Plan

**Session:** Map & Geospatial
**Date:** 2026-03-16
**Status:** Phase 1 & 2 COMPLETE — Phase 3 deferred to post-ingestion

---

## Current State Assessment

### What Exists

The map page (`/map`) is a 752-line Next.js page using **Leaflet 1.9.4** with CartoDB dark raster tiles. It renders 312 markers (test data) with emoji-based `divIcon` markers, a left sidebar filter panel (desktop), bottom-sheet filters (mobile), and a report detail panel (right sidebar desktop / bottom sheet mobile). PostGIS is enabled on Supabase with a `nearby_reports` RPC function and GIST index on a `GEOGRAPHY(POINT, 4326)` column. Mapbox is used only for geocoding (no vector tiles, no Mapbox GL). The Research Hub has a separate `MapViewInner.tsx` (719 lines) with Haversine clustering and layer filtering for research artifacts — this is intentionally separate from the public map.

### Critical Problems Identified

**1. Will Not Scale**
Every report is fetched client-side and rendered as an individual Leaflet divIcon. At 10K reports this will freeze the browser. At 100K+ it's completely unusable. No clustering library is installed (no Supercluster). No viewport-based loading. No server-side aggregation.

**2. Mobile UX Is Broken**
- The filter panel opens *on top of the map* covering the entire viewport on first load (auto-opens)
- When a report is selected, both a Leaflet popup AND a bottom sheet appear simultaneously, leaving ~15% of the screen for the actual map
- The category legend (emoji row) overlaps the bottom nav tabs at small heights
- The "Near Me" button requires scrolling past all filters to reach
- No gesture affordance for the bottom sheet (no drag handle, no snap points)

**3. Raster Tiles Can't Support Advanced Viz**
CartoDB raster tiles at zoom 2-5 range look muddy. No heatmap layer. No terrain/satellite toggle. No smooth zooming or rotation. Vector tiles (MapLibre GL / Mapbox GL) are required for heatmap layers, 3D terrain, smooth animations, and custom styling at scale.

**4. No Clustering = Visual Chaos at Density**
Dense areas (Pacific Northwest, Eastern US, UK) show overlapping markers. No spiderfy on click. No cluster counts. No zoom-to-cluster behavior.

**5. Missing Core Map Features**
- No timeline/date slider
- No phenomenon-specific map views
- No "what's near me" as a primary CTA
- No deep-link sharing of map state (partially done via URL params but incomplete)
- No fullscreen mode
- No satellite/terrain/dark toggle

---

## Design Vision: "The Definitive Paranormal Map"

This should be the Google Maps of the unexplained — the first place anyone goes to explore what's been reported where. When a user lands on `/map`, they should see a dense, alive, visually stunning globe of activity spanning every phenomenon type, with intelligent clustering that invites exploration through zoom.

### Design Principles

1. **Map-first, chrome-second** — maximize map viewport, minimize UI overlay
2. **Progressive disclosure** — show density at world zoom, detail on drill-down
3. **All layers on by default** — the "wow" moment is seeing everything at once
4. **Mobile is the primary platform** — thumb-reachable controls, gesture-native interactions
5. **URL is the API** — every map state is shareable via URL
6. **Scale from day one** — architecture must handle 1M+ points without degradation

---

## Architecture: Leaflet → MapLibre GL Migration

### Why MapLibre GL (Not Mapbox GL)

- **Open source** (BSD license) — no token required for rendering, no usage-based pricing for map loads
- **Vector tiles** — enables heatmap layers, 3D terrain, smooth zoom, custom styling, runtime layer toggling
- **WebGL rendering** — handles 100K+ points natively via the GPU
- **Supercluster integration** — built-in clustering support at the GL level
- **Protocol buffers** — vector tiles are 10-50x smaller than raster tiles
- **Dark theme native** — style the basemap itself rather than relying on pre-rendered dark tiles
- **react-map-gl** — mature React wrapper (same one used by Uber, Airbnb)

### Migration Path

```
Phase 1: Install maplibre-gl + react-map-gl + supercluster
Phase 2: Create new MapContainer component with MapLibre
Phase 3: Port markers to GeoJSON source + symbol/circle layers
Phase 4: Add clustering via Supercluster (client) or PostGIS (server)
Phase 5: Add heatmap layer toggle
Phase 6: Remove Leaflet from map page (keep for mini-maps if needed)
```

### Tile Source Strategy

| Layer | Source | Notes |
|-------|--------|-------|
| Dark basemap | MapTiler (free tier: 100K tiles/mo) or self-hosted PMTiles | Styled to match Paradocs dark theme |
| Satellite | MapTiler Satellite or Esri | Toggle for location verification |
| Terrain | MapTiler Terrain RGB | Optional 3D hillshade |
| Report data | GeoJSON (< 50K) or Vector tiles via PostGIS/Martin (> 50K) | Dynamic, from our DB |

### Environment Variables Needed

```env
NEXT_PUBLIC_MAPTILER_KEY=...       # MapTiler API key (Flex plan: $25/mo)
# Style URL constructed from key:
# https://api.maptiler.com/maps/dataviz-dark/style.json?key=${NEXT_PUBLIC_MAPTILER_KEY}
```

### MapTiler Setup

1. Sign up at https://www.maptiler.com/cloud/ (start on Free tier during dev, upgrade to Flex for production)
2. Get API key from account dashboard → API Keys
3. Set domain restrictions on the key: `beta.discoverparadocs.com`, `localhost` (prevents unauthorized use since key is client-exposed via NEXT_PUBLIC_ prefix)
4. Add key to `.env.local` as `NEXT_PUBLIC_MAPTILER_KEY`
5. Dark basemap style: `dataviz-dark` (purpose-built for data overlay) or `dark-v2` (newer generation, released Jan 2026)
6. MapLibre GL loads vector tiles from MapTiler automatically via the style JSON — no additional tile configuration needed
7. MapTiler bills by tile requests when using MapLibre GL directly (not their SDK). Each pan/zoom loads ~10-20 tiles. Flex plan includes retroactive overage billing (service doesn't pause like free tier).

---

## Primary Map Page (`/map`) — Complete Redesign

### Desktop Layout (≥ 1024px)

```
┌──────────────────────────────────────────────────────────────┐
│  [Paradocs nav bar - 56px]                                    │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────┐  FULL VIEWPORT MAP                              │
│  │ Search  │  (100vw × calc(100vh - 56px))                   │
│  │ ┌─────┐ │                                                  │
│  │ │     │ │  Clusters → individual markers on zoom           │
│  │ └─────┘ │  Heatmap layer toggle                            │
│  │         │                                                  │
│  │ Filters │  ┌──────────────────────────────────────┐       │
│  │ (collap-│  │         SELECTED REPORT CARD          │       │
│  │  sible) │  │  Slides in from right (400px wide)    │       │
│  │         │  │  Image + title + summary + metadata   │       │
│  │         │  │  "View Full Report" CTA               │       │
│  └─────────┘  └──────────────────────────────────────┘       │
│                                                                │
│  [Timeline slider - 48px - bottom of map]                     │
│  ├── 1947 ─────────────────────────── 2026 ──┤               │
│                                                                │
│  [Layer toggles] [Fullscreen] [Locate me]    bottom-right     │
└──────────────────────────────────────────────────────────────┘
```

**Key Desktop Behaviors:**
- Map fills entire viewport below nav (no title bar, no "Global Sightings Map" header — the map IS the page)
- Filter panel: collapsible left drawer (320px), starts collapsed, toggle button visible
- Search: integrated into filter panel header (or floating search bar top-center like Google Maps)
- Report detail: right slide-in panel (400px), pushes nothing, overlays map
- Timeline slider: fixed at bottom of map area, full width, always visible
- Layer controls: bottom-right floating buttons (heatmap toggle, satellite toggle, locate me, fullscreen)
- Legend: bottom-left, compact, auto-hides at high zoom
- Zoom controls: right side, vertically stacked

### Mobile Layout (< 1024px)

```
┌─────────────────────────┐
│  [Nav - 56px]           │
├─────────────────────────┤
│                         │
│   FULL VIEWPORT MAP     │
│   (100vw × available)   │
│                         │
│   ┌───┐                 │
│   │ 🔍│ ← FAB: search  │
│   └───┘                 │
│                         │
│   Clusters everywhere   │
│                         │
│  [🗺️] [🔥] [📍] [⛶]  │  ← Floating action pills
│                         │
│  ┌─────────────────┐   │
│  │ ═══ drag handle  │   │  ← Bottom sheet (snap: peek/half/full)
│  │ Timeline slider  │   │
│  │ ── 1947 ── 2026 │   │
│  │                  │   │
│  │ [Peek: 3 nearby] │   │  ← Shows nearby reports list
│  └─────────────────┘   │
│                         │
│  [Explore][Map][🔥][📖][≡]│  ← MobileBottomTabs (56px)
└─────────────────────────┘
```

**Key Mobile Behaviors:**
- Map fills ALL available space (no title, no header text, no category chips eating viewport)
- NO popup on marker tap — instead, bottom sheet snaps to "half" showing the report card
- Bottom sheet has 3 snap points: peek (timeline + 2 nearby items visible), half (report detail), full (filters + search + full list)
- Floating action pills (bottom-right, above bottom sheet): layers toggle, heatmap toggle, locate me, fullscreen
- Search: floating pill top-center or inside bottom sheet when expanded to full
- Filter: inside bottom sheet at full-snap (not a separate overlay)
- Timeline slider: inside bottom sheet peek area (always accessible)
- Gestures: pinch zoom, two-finger rotate, double-tap zoom, long-press for coordinates
- Category filter: horizontal scrollable chips inside bottom sheet (not overlaying map)

### Bottom Sheet Architecture (Mobile)

The bottom sheet is the central UI element on mobile. It replaces the filter overlay, the report detail panel, and the legend — all in one unified component.

```
PEEK STATE (120px visible):
┌─────────────────────────────┐
│  ═══ (drag handle)          │
│  Timeline: 1947 ────── 2026 │
│  "312 sightings • 12 types" │
└─────────────────────────────┘

HALF STATE (50vh):
┌─────────────────────────────┐
│  ═══                         │
│  [Selected Report Card]      │
│  ┌─────────────────────────┐│
│  │ 🛸 Phoenix Lights        ││
│  │ Phoenix, AZ • Mar 1997   ││
│  │ "Massive V-shaped..."    ││
│  │ ⭐ High Credibility      ││
│  │ [View Full Report →]     ││
│  └─────────────────────────┘│
│  ── Nearby ──                │
│  • Sedona Lights (12 mi)    │
│  • Mesa Triangle (28 mi)    │
└─────────────────────────────┘

FULL STATE (90vh):
┌─────────────────────────────┐
│  ═══                         │
│  🔍 Search reports...        │
│  [All][🛸UFO][🦶Crypt][👻]  │  ← Category chips (horizontal scroll)
│  Credibility: [All ▾]       │
│  Country: [All ▾]           │
│  Has Evidence: [ ]          │
│  ── Results (312) ──         │
│  [Report list, scrollable]   │
│  ...                         │
└─────────────────────────────┘
```

---

## Clustering Strategy

### Client-Side (< 50K points): Supercluster

```typescript
import Supercluster from 'supercluster';

const index = new Supercluster({
  radius: 60,        // cluster radius in pixels
  maxZoom: 16,       // max zoom to cluster at
  minPoints: 2,      // minimum points to form cluster
  map: (props) => ({ // aggregate properties
    category: props.category,
    maxCredibility: props.credibility,
    hasEvidence: props.has_evidence ? 1 : 0,
  }),
  reduce: (accumulated, props) => {
    accumulated.hasEvidence += props.hasEvidence;
  }
});

index.load(geojsonPoints);
const clusters = index.getClusters(bbox, zoom);
```

### Server-Side (> 50K points): PostGIS + Viewport Queries

For the mass-ingestion phase, switch to server-side clustering:

```sql
-- New RPC: viewport_clusters
CREATE OR REPLACE FUNCTION viewport_clusters(
  min_lng DOUBLE PRECISION,
  min_lat DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  zoom_level INTEGER,
  filter_category TEXT DEFAULT NULL,
  filter_min_date DATE DEFAULT NULL,
  filter_max_date DATE DEFAULT NULL
) RETURNS TABLE (
  cluster_id INTEGER,
  point_count INTEGER,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  categories JSONB,          -- {"ufo_uap": 45, "cryptids": 12, ...}
  top_report_id UUID,        -- highest credibility report in cluster
  top_report_title TEXT,
  is_cluster BOOLEAN         -- false = individual point at high zoom
) AS $$
  -- Use ST_ClusterDBSCAN with eps scaled to zoom level
  -- At zoom < 5: large clusters (eps ~200km)
  -- At zoom 5-10: medium clusters (eps ~50km)
  -- At zoom > 10: small clusters or individual points (eps ~5km)
  -- At zoom > 14: no clustering, return individual reports
$$;
```

### Cluster Visual Design

```
WORLD ZOOM (2-4):
  Large circles with gradient fill
  Size proportional to count (min 40px, max 80px)
  Color = dominant category color
  Number overlay: "2.4K" format
  Subtle pulse animation on clusters > 100

REGION ZOOM (5-8):
  Medium circles (30-50px)
  Category pie chart inside circle (mini donut)
  Count overlay
  Click → zoom to bounds + split into sub-clusters

CITY ZOOM (9-12):
  Small clusters (24-36px) or individual markers
  Spiderfy on click when markers overlap
  Individual markers show category emoji icon

STREET ZOOM (13+):
  Individual markers only
  Rich marker: thumbnail + title on hover
  Click → bottom sheet / side panel with full detail
```

---

## Heatmap Layer

MapLibre GL has native heatmap layer support. Toggle between marker mode and heatmap mode:

```typescript
// MapLibre heatmap layer config
{
  id: 'reports-heat',
  type: 'heatmap',
  source: 'reports',
  paint: {
    'heatmap-weight': ['interpolate', ['linear'], ['get', 'credibility_score'], 0, 0, 1, 1],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, 0],
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0, 'rgba(0,0,0,0)',
      0.2, 'rgba(103,58,183,0.4)',   // purple (Paradocs brand)
      0.4, 'rgba(33,150,243,0.6)',    // blue
      0.6, 'rgba(76,175,80,0.7)',     // green
      0.8, 'rgba(255,152,0,0.8)',     // orange
      1.0, 'rgba(244,67,54,0.9)'      // red (hotspots)
    ]
  }
}
```

The heatmap doubles as the "density" view — useful for identifying global patterns at a glance. Weight by credibility score so high-credibility clusters burn brighter.

---

## Timeline Slider

A dual-handle range slider that filters the visible date range on the map. This is one of the most engaging interactive elements for exploration.

### Design

```
Desktop: Fixed bar at bottom of map, full width
Mobile: Inside bottom sheet peek area

┌─────────────────────────────────────────────────────┐
│  ◀  ├──●═══════════════════●──┤  ▶  │  1997 - 2024 │
│     1800                    2026     │  [▶ Play]     │
└─────────────────────────────────────────────────────┘
  [All Time] [Pre-1900] [1900-1950] [1950-2000] [2000+]  ← Era presets
```

### Features
- Dual handles for start/end date range (1400–2026, 626 positions)
- Era preset buttons: All Time, Pre-Modern, 1900-1950, 1950-2000, 2000-Present
- "All Time" includes reports dated before 1400 (schema DATE has no floor)
- 1400 start covers Age of Exploration, medieval accounts, early colonial sightings
- Histogram behind the slider showing report density per year (sparkline)
- "Play" button that auto-advances the range (animation mode: 1 year per second)
- Snap to decades at low zoom, individual years at high zoom
- URL-synced: `?dateFrom=1997&dateTo=2024&era=all`

### Implementation
- Use a lightweight range slider (noUiSlider or custom)
- Report density histogram: precomputed counts per year from DB
- On change: filter the Supercluster index or re-query server-side clusters
- Debounce at 150ms for smooth sliding without excessive re-renders

---

## Explore Page: "Map Spotlight" Row

Following the Encyclopedia Spotlight pattern — a horizontal-scroll card row on the Explore page with curated, phenomenon-specific map previews.

### Card Design

```
┌────────────────────────────┐
│  ┌──────────────────────┐  │
│  │   STATIC MAP IMAGE   │  │  ← MapTiler Static API or pre-rendered
│  │   (dark, with dots)  │  │     screenshot of the filtered map view
│  │                      │  │
│  │  🛸 UFOs & Aliens    │  │  ← Category badge (bottom-left of image)
│  │        847 sightings │  │  ← Count badge (bottom-right of image)
│  ├──────────────────────┤  │
│  │  UFO Sightings in    │  │  ← Title (line-clamp-1)
│  │  the United States   │  │
│  │  The most reported..  │  │  ← Subtitle (line-clamp-2)
│  └──────────────────────┘  │
└────────────────────────────┘
```

### Curated Map Cards (Examples)

| Title | Filter | Region |
|-------|--------|--------|
| UFO Hotspots: United States | category=ufo_uap | US bounds |
| Ghost Sightings in Britain | category=ghosts | UK bounds |
| Bigfoot & Cryptid Reports | category=cryptids, phenomenon=bigfoot | North America |
| The Roswell Cluster | cluster=roswell | New Mexico bounds |
| Mothman Sightings | phenomenon=mothman | Point Pleasant area |
| Skinwalker Ranch Activity | location=skinwalker-ranch | Utah bounds |
| UFOs Over the Middle East | category=ufo_uap | Middle East bounds |
| Global Hotspots: Heatmap | heatmap=true | World view |

### Data Source

New API endpoint or extend `/api/feed/personalized.ts`:

```typescript
// In the feed API, add a new section:
{
  id: 'map-spotlight',
  title: 'Explore the Map',
  subtitle: 'Curated views of the world\'s most active regions',
  type: 'map_cards',
  mapCards: [
    {
      id: 'ufo-us',
      title: 'UFO Hotspots: United States',
      subtitle: 'Over 500 documented sightings across all 50 states',
      category: 'ufo_uap',
      bounds: { north: 49, south: 25, east: -66, west: -125 },
      reportCount: 523,
      staticImageUrl: '/images/map-cards/ufo-us.png', // pre-rendered
      mapUrl: '/map?category=ufo_uap&bounds=25,-125,49,-66',
    },
    // ...
  ]
}
```

### Static Map Images

Two options for generating the card thumbnails:

**Option A: Pre-rendered (recommended for beta)**
- Generate screenshots of filtered map views
- Store as static images in `/public/images/map-cards/`
- Regenerate periodically via scheduled task

**Option B: Dynamic (for production)**
- Use MapTiler Static API or MapLibre GL `map.getCanvas().toDataURL()`
- Generate on-demand with caching (CDN edge cache)
- URL pattern: `/api/map-preview?category=ufo_uap&bounds=25,-125,49,-66&width=400&height=250`

### Component Structure

Reuse the exact same horizontal scroll container from Encyclopedia Spotlight:

```tsx
// New component: MapSpotlightRow.tsx
// Follows same pattern as Encyclopedia Spotlight in explore.tsx
// - overflow-x-auto, snap-x, snap-mandatory
// - Right fade gradient
// - Chevron scroll buttons on hover (desktop)
// - Final card: "Explore Full Map →" linking to /map
```

---

## Phenomenon-Specific Map Views

When a user navigates from an encyclopedia page or spotlight card, the map should support deep-linked filtered views:

### URL Schema

```
/map?phenomenon=bigfoot           → All Bigfoot reports
/map?category=ufo_uap             → All UFO reports
/map?category=cryptids&country=US  → US cryptid reports
/map?bounds=25,-125,49,-66         → Bounded viewport
/map?lat=33.39&lng=-104.52&z=10   → Centered on Roswell
/map?heatmap=true                  → Heatmap mode on
/map?dateFrom=1947&dateTo=1960    → Postwar era only
/map?q=triangle+lights             → Text search
```

All params combine: `/map?category=ufo_uap&country=US&dateFrom=2020&heatmap=true`

### Encyclopedia → Map Integration

On each encyclopedia phenomenon page, the existing "Reported Locations" mini-map should include a "View all on map →" link that opens `/map?phenomenon={slug}` with the map pre-filtered and bounded to that phenomenon's report locations.

---

## Data Pipeline: Geo Extraction at Scale

### Current Capabilities (Keep)

The existing `location-inferrer.ts` (530 lines, 7 strategies) and `location-parser.ts` (308 lines) are solid for extracting locations from report text. They handle coordinates, explicit places, landmarks, regional references, directional states, highways, and narrative extraction with confidence scoring.

### Enhancements Needed for Mass Ingestion

**1. Batch geocoding queue**
```
Report submitted → location-inferrer extracts location text
→ If coordinates found (confidence > 0.9): write directly to DB
→ If place name found (confidence > 0.6): queue for Mapbox geocoding
→ If ambiguous (confidence < 0.6): flag for human review
→ Background job processes geocoding queue (rate-limited to Mapbox limits)
```

**2. Geocoding result caching table**
```sql
CREATE TABLE geocoding_cache (
  query_text TEXT PRIMARY KEY,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  display_name TEXT,
  confidence DECIMAL(3, 2),
  source TEXT,  -- 'mapbox', 'inferred', 'manual'
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**3. Location quality scoring**
Each report gets a `location_quality` enum: `exact` (coordinates), `geocoded` (city-level), `regional` (state/province), `country` (country only), `unknown`. This feeds into map display: exact locations get precise markers, regional locations get area circles, unknown locations are excluded from the map but flagged for enrichment.

---

## Performance Architecture

### Tier 1: < 5K reports (Current + Near-term)

```
Client loads all reports as GeoJSON → Supercluster clusters client-side
Acceptable: Full dataset fits in ~500KB GeoJSON
```

### Tier 2: 5K - 100K reports (Post mass-ingestion)

```
Server-side viewport queries:
  1. Client sends bbox + zoom + filters to API
  2. API queries PostGIS with ST_MakeEnvelope for viewport
  3. PostGIS returns pre-clustered results (ST_ClusterDBSCAN)
  4. Client renders clusters + individual points

New API: /api/map/viewport
  GET ?bbox=-125,25,-66,49&zoom=5&category=ufo_uap&dateFrom=1947
  Returns: { clusters: [...], points: [...], totalInView: 4521 }
```

### Tier 3: 100K - 1M+ reports (Scale phase)

```
Vector tile server (Martin or pg_tileserv):
  1. PostGIS generates vector tiles on-demand
  2. Tiles cached at CDN edge (CloudFront/Vercel Edge)
  3. MapLibre GL consumes tiles natively
  4. Zero client-side data processing

Infrastructure:
  - Martin tile server (Rust, from MapLibre team)
  - Connected to Supabase PostgreSQL
  - Tile cache: 24h TTL, invalidate on new reports
  - Serves MVT (Mapbox Vector Tiles) protocol
```

### Precomputed Aggregations

For the timeline histogram and spotlight card counts:

```sql
-- Materialized view: report counts by year, category, country
CREATE MATERIALIZED VIEW report_geo_stats AS
SELECT
  EXTRACT(YEAR FROM event_date) as year,
  category,
  country,
  COUNT(*) as report_count,
  ST_Centroid(ST_Collect(coordinates::geometry)) as centroid
FROM reports
WHERE latitude IS NOT NULL
GROUP BY year, category, country;

-- Refresh nightly or on significant ingestion batches
REFRESH MATERIALIZED VIEW CONCURRENTLY report_geo_stats;
```

---

## Packages to Install

```bash
npm install maplibre-gl react-map-gl supercluster @types/supercluster
# Optional for timeline:
npm install nouislider  # or build custom with CSS
```

### Package Sizes

| Package | Gzipped | Notes |
|---------|---------|-------|
| maplibre-gl | ~200KB | WebGL map renderer (replaces leaflet ~40KB) |
| react-map-gl | ~25KB | React wrapper |
| supercluster | ~6KB | Client-side clustering |
| **Total new** | **~231KB** | vs current Leaflet ~40KB |

The size increase is justified: MapLibre GL handles rendering that would otherwise require multiple additional libraries (heatmap, clustering, vector tiles, 3D terrain). The performance gain at scale is massive.

### What Gets Removed

```
leaflet: ~40KB (from map page only — keep for mini-maps if simpler)
react-leaflet: ~15KB (from map page only)
```

Net increase: ~176KB gzipped. Worth it for WebGL rendering of 100K+ points.

---

## File Structure (New/Modified)

```
src/
  components/
    map/
      MapContainer.tsx          # NEW: MapLibre GL wrapper
      MapControls.tsx           # NEW: Layer toggles, fullscreen, locate
      MapMarkerLayer.tsx        # NEW: Clustered marker layer
      MapHeatmapLayer.tsx       # NEW: Heatmap toggle layer
      MapTimeline.tsx           # NEW: Dual-handle date range slider
      MapBottomSheet.tsx        # NEW: Mobile bottom sheet (peek/half/full)
      MapFilterPanel.tsx        # NEW: Desktop collapsible filter drawer
      MapReportCard.tsx         # NEW: Selected report detail card
      MapSearchBar.tsx          # NEW: Floating search input
      MapLegend.tsx             # NEW: Compact category legend
      MapSpotlightCard.tsx      # NEW: Explore page map preview card
      MapSpotlightRow.tsx       # NEW: Horizontal scroll row for Explore
      useMapState.ts            # NEW: URL-synced map state hook
      useViewportData.ts        # NEW: Viewport-based data fetching hook
      mapStyles.ts              # NEW: MapLibre style definitions
  pages/
    map.tsx                     # REWRITE: New MapLibre-based page
    api/
      map/
        viewport.ts             # NEW: Viewport cluster query API
        stats.ts                # NEW: Aggregation stats API
        preview.ts              # NEW: Static map image API (future)
  lib/
    services/
      map-clustering.service.ts # NEW: Server-side clustering logic
```

---

## Implementation Sequence

### Phase 1: Foundation (This Sprint)
1. Install maplibre-gl, react-map-gl, supercluster
2. Create MapContainer.tsx with MapLibre GL + dark basemap
3. Port existing report data to GeoJSON source
4. Implement Supercluster client-side clustering
5. New mobile layout: full-viewport map + bottom sheet
6. New desktop layout: collapsible filter panel + right detail panel
7. Basic URL state sync (all current params + bounds + zoom)

### Phase 2: Visualization (Next Sprint)
1. Heatmap layer toggle
2. Timeline slider with year histogram
3. Category-colored cluster markers (pie chart clusters)
4. Satellite/terrain basemap toggle
5. Spiderfy for overlapping markers at high zoom
6. "Locate me" with proximity circle

### Phase 3: Explore Integration
1. Map Spotlight row on Explore page
2. Static map card images (pre-rendered)
3. Deep-link URL schema for phenomenon-specific views
4. Encyclopedia "View all on map →" links
5. Cross-page map state persistence

### Phase 4: Scale (Post Mass-Ingestion)
1. Server-side viewport clustering API
2. PostGIS materialized views for aggregations
3. Vector tile server evaluation (Martin)
4. Geocoding queue for batch processing
5. Location quality scoring pipeline
6. CDN tile caching

---

## Design Specifications

### Color Palette (Map-Specific)

```
Basemap:        #0a0a1a (deep space dark)
Water:          #0d1117 (slightly lighter than land)
Land borders:   #1a1a2e (subtle, not distracting)
Roads:          #16163a (faint at low zoom)
Labels:         #4a4a6a (muted, never competing with markers)

Cluster fill:   Category-dominant color at 70% opacity
Cluster stroke: White at 30% opacity
Heatmap cold:   #6B3AB7 (Paradocs purple)
Heatmap hot:    #F44336 (red)
Selection:      #7C3AED (primary purple, bright)
Proximity:      #3B82F6 (blue circle, dashed)
```

### Marker Design

Individual markers at high zoom should be refined from the current emoji-in-circle approach:

```
Current: 36px blue circle with emoji inside (divIcon)
Proposed: 28px circle with category color fill + white icon silhouette
  - Cleaner at density
  - Better contrast
  - Consistent sizing
  - Subtle drop shadow for depth
  - Selected state: 36px with bright border + pulse
```

### Typography on Map

```
Cluster count:  Inter/system, 12-16px bold, white, text-shadow
Popup title:    16px semibold
Popup body:     13px regular, gray-400
Timeline:       11px, gray-500
Legend:          12px, gray-400
```

---

## Subscription Tier Considerations

Per PROJECT_STATUS.md subscription tiers:

| Feature | Free | Explorer ($9) | Investigator ($19) |
|---------|------|---------------|--------------------|
| Map viewing | Full | Full | Full |
| Heatmap layer | Yes | Yes | Yes |
| Clustering | Yes | Yes | Yes |
| Timeline slider | Basic | Full | Full |
| "Near Me" | Yes | Yes | Yes |
| Saved map views | — | 5 | Unlimited |
| Export map data | — | — | CSV/GeoJSON |
| Custom map layers | — | — | Yes |
| API access (map data) | — | — | Yes |

The map itself should be fully accessible to everyone — it's a top-of-funnel discovery feature. Gating should happen on power-user features like saved views, data export, and custom layers.

---

## Key Decisions (Resolved 2026-03-16)

1. **Basemap tiles: MapTiler paid tier ($25/mo, 500K tiles/month).** Style URL abstracted behind `NEXT_PUBLIC_MAPTILER_KEY` env var so migration to self-hosted (PMTiles on CDN or Martin tile server) is a single config change later.

2. **Leaflet retained for mini-maps.** Only the main `/map` page migrates to MapLibre GL. PhenomenonMiniMap and Research Hub MapViewInner stay on Leaflet — they work fine, have no scale requirements, and rewriting them yields no user-visible benefit.

3. **Pre-rendered static PNGs for Map Spotlight cards.** Stored in `/public/images/map-cards/`. Regenerated after major data ingestions. Dynamic API deferred to a future phase if personalized map cards become a feature.

4. **Timeline slider: year-level granularity, 1400–2026.** 626 snap positions on the dual-handle slider. Era preset buttons above the slider: "All Time", "Pre-Modern", "1900-1950", "1950-2000", "2000-Present". Reports with dates before 1400 appear when "All Time" or "Pre-Modern" is active. 1400 chosen to cover Age of Exploration, medieval accounts, and early colonial-era sightings without making the modern range too compressed. Density histogram shows one bar per decade. Month precision deferred — most report dates lack that precision anyway.

5. **3D terrain: included in Phase 2 as optional toggle.** Off by default. Terrain button in map controls. Low implementation effort (~50-100 lines), high visual impact for users who opt in. Avoids performance issues on older mobile devices.

---

## Phase 1 Completion Log (2026-03-16)

**All Phase 1 items COMPLETE and deployed to beta.discoverparadocs.com.**

### What Was Built

- **MapLibre GL migration:** Replaced Leaflet with MapLibre GL JS + react-map-gl + Supercluster. WebGL rendering, vector tiles from MapTiler (dataviz-dark style).
- **MapTiler integration:** Flex plan ($25/mo), domain-restricted API key (`NEXT_PUBLIC_MAPTILER_KEY`). Domains: `beta.discoverparadocs.com`, `localhost`.
- **Client-side clustering:** Supercluster with radius=60, maxZoom=16. Cluster circles sized/colored by point_count. Click-to-expand zoom. 312 reports clustered.
- **Heatmap layer:** Separate GeoJSON source with all raw unclustered points. Purple-to-red gradient. Toggle via floating button.
- **Mobile bottom sheet:** 3-snap-point (peek 80px / half 340px / full 85vh). Touch drag with `preventDefault` on non-passive listeners for smooth swiping. Ref-based state to prevent effect re-registration during drag.
- **Bottom sheet empty state:** Category breakdown with colored progress bars (tappable to filter by category), top countries as pill buttons (tappable to filter), hint text.
- **Desktop layout:** Full-viewport map below 56px nav. Collapsible filter drawer (left). Selected report card (right, 340px). Floating controls (bottom-right).
- **URL-synced state:** All filters persist in query params via `useMapState` hook (shallow routing).
- **Auto-fit to data bounds:** Map computes bounding box of all reports on load and flies to fit them (no more Atlantic Ocean default center).
- **Locate Me:** Geolocation API → flyTo user position at zoom 5 (regional view).
- **Navigation control hidden on mobile:** CSS media query hides MapLibre's +/- buttons below 1024px (pinch-to-zoom is standard).
- **Fullscreen button hidden on mobile:** iOS Safari doesn't support Fullscreen API.
- **Category-colored individual markers:** Each report dot colored by its PhenomenonCategory.

### New Files Created (Phase 1)

```
src/components/map/
  mapStyles.ts          — Style constants, category colors, types, TIMELINE config
  useMapState.ts        — URL-synced filter state hook
  useViewportData.ts    — Supabase fetch + Supercluster + filtering + stats
  MapContainer.tsx      — Core MapLibre GL renderer (heatmap + clusters + markers)
  MapControls.tsx       — Floating control buttons (heatmap, locate, fullscreen)
  MapFilterPanel.tsx    — Collapsible filter drawer / inline filters
  MapBottomSheet.tsx    — Mobile 3-snap-point bottom sheet with stats
  MapReportCard.tsx     — Selected report detail card
src/pages/
  map.tsx               — Complete rewrite (~220 lines, down from 752)
```

### Dependencies Added

```json
"maplibre-gl": "^4.7.1",
"react-map-gl": "^7.1.7",
"supercluster": "^8.0.1",
"@types/supercluster": "^7.1.3"
```

### Bugs Fixed During Phase 1

1. Heatmap showing transparent dots instead of heat blobs — root cause: heatmap layer was reading from clustered source (~10 centroids). Fixed by creating separate `reports-heat-source` with all raw unclustered points.
2. Blank map after switching to `dark-matter` basemap — style doesn't exist on MapTiler. Reverted to `dataviz-dark`.
3. Bottom sheet swipe moving the page instead of the sheet — React synthetic touch events are passive by default. Fixed with native `addEventListener({ passive: false })` + `e.preventDefault()`.
4. Bottom sheet barely moving on swipe — `useEffect` deps included `currentHeight`, causing listener re-registration on every height change (resetting drag state). Fixed by reading all values from refs with `[]` deps.
5. Locate Me button not working — was a placeholder. Wired to `navigator.geolocation.getCurrentPosition` → `map.flyTo`.
6. Map controls cut off by bottom sheet on mobile — increased `bottom` offset from `100px` to `150px`.

### Phase 2 Completion Log (2026-03-16)

**All Phase 2 core items COMPLETE and deployed to beta.discoverparadocs.com.**

#### What Was Built

- **Timeline slider (MapTimeline.tsx):** Dual-handle date range slider (1400–2026). Decade histogram sparkline behind track. Era preset buttons (All Time, Pre-Modern, 1900–1950, 1950–2000, 2000+) visible on both desktop and mobile. Pointer events API for cross-device compatibility. 200ms debounce. Touch targets enlarged to 44×44px (Apple minimum) with 18px visible dot.
- **Basemap toggle (MapControls.tsx rewritten):** Cycles through dark (dataviz-dark) → satellite (hybrid) → terrain (outdoor-v2) MapTiler styles. Globe icon for dark/satellite, Mountain icon for terrain.
- **Basemap style switching (MapContainer.tsx + mapStyles.ts):** `BASEMAP_STYLES` record with three MapTiler style URLs. `basemapStyle` prop switches style dynamically.
- **Year histogram (useViewportData.ts):** Buckets all reports by year for timeline sparkline. Also computes `categoryCounts`, `topCountries`, and `dataBounds`.
- **Bottom sheet improvements (MapBottomSheet.tsx):**
  - Compact timeline with era presets integrated into empty state
  - Peek height raised from 80px → 100px to clear bottom nav bar
  - Pull-down-to-dismiss from content area: when content is scrolled to top and user swipes down, gesture is captured as sheet drag (fixes stuck-at-full-height bug)
- **Desktop timeline bar (map.tsx):** Fixed bar at bottom of map with backdrop blur, full-width timeline.

#### Phase 2 Files Modified/Created

```
src/components/map/MapTimeline.tsx     — NEW: Dual-handle timeline slider
src/components/map/MapControls.tsx     — REWRITTEN: Basemap cycle toggle added
src/components/map/mapStyles.ts        — UPDATED: BASEMAP_STYLES record, TIMELINE min→1400, Pre-Modern label
src/components/map/MapContainer.tsx    — UPDATED: basemapStyle prop
src/components/map/MapBottomSheet.tsx  — UPDATED: compact timeline, raised peek, pull-to-dismiss from content
src/components/map/useViewportData.ts  — UPDATED: yearHistogram computation
src/pages/map.tsx                      — UPDATED: wired timeline, basemap state, desktop bar
```

#### Bugs Fixed During Phase 2

1. Bottom sheet content clipped behind bottom nav bar — raised peek from 80→100px.
2. Timeline slider handles too small to grab on mobile — enlarged touch target to 44×44px wrapping 18px visible dot.
3. Era preset buttons hidden on mobile — removed `!compact` gate, now visible in both modes.
4. Bottom sheet stuck at full height (can't drag down) — added content-area touch listener that intercepts downward swipes when scrolled to top.
5. Timeline range too narrow (1800) — extended to 1400, renamed "Pre-1900" to "Pre-Modern".

#### Deferred from Phase 2

- **Spiderfy:** Cluster expansion zoom handles most overlap cases with 312 reports. Revisit post-ingestion.
- **Locate Me proximity circle:** Functional locate me exists (flyTo at zoom 5). Decorative circle deferred.
- **Category pie chart clusters:** Stretch goal, deferred to post-ingestion when visual density justifies it.
- **3D terrain:** MapTiler terrain style (outdoor-v2) is included in basemap cycle. True 3D extrusion deferred.

### Phase 3 Plan (Deferred to Post-Ingestion)

Phase 3 focuses on cross-page integration and is best tackled after mass data ingestion when there's enough data to make spotlight cards and deep-link views compelling.

1. **Explore page Map Spotlight cards:** Horizontal-scroll card row with curated map views (e.g., "UFO Hotspots: US", "Cryptid Reports: Pacific Northwest"). Pre-rendered static map thumbnails. Each card deep-links to `/map?category=...&bounds=...`. Consider building placeholder spotlight cards in the interim to validate UX before mass ingestion.
2. **Deep-link URL schema:** Already partially done via URL-synced filters. Extend to support `?phenomenon=bigfoot`, `?bounds=lat1,lng1,lat2,lng2`, `?heatmap=true`.
3. **Encyclopedia → map links:** "View all on map →" link on phenomenon pages opening `/map?phenomenon={slug}` pre-filtered and bounded.
4. **Cross-page map state persistence:** Navigating away and back retains map position/filters.

### Phase 4 Plan (Post Mass-Ingestion, Scale)

1. Server-side viewport clustering API (PostGIS `ST_ClusterDBSCAN`)
2. PostGIS materialized views for aggregations (report counts by year/category/country)
3. Vector tile server evaluation (Martin) for 100K+ points
4. Geocoding queue for batch processing
5. Location quality scoring pipeline
6. CDN tile caching

---

## References

- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) — Map renderer
- [react-map-gl](https://visgl.github.io/react-map-gl/) — React integration
- [Supercluster](https://github.com/mapbox/supercluster) — Client-side clustering
- [Martin](https://martin.maplibre.org/) — Vector tile server
- [MapTiler](https://www.maptiler.com/) — Basemap tiles

---

*This document serves as the implementation blueprint for the Map & Geospatial feature. It should be read alongside PROJECT_STATUS.md for context on subscription tiers, critical sequencing, and cross-feature dependencies.*
