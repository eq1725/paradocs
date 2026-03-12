# Research Hub V2 — System Design Document

**Project:** Paradocs (beta.discoverparadocs.com)
**Feature:** User Dashboard — Multi-View Research Hub
**Author:** Chase Williams / Claude
**Date:** March 11, 2026
**Status:** Draft — Awaiting Approval
**Revision:** 2 (replaces Constellation-only design)

---

## 1. Vision & Purpose

The Research Hub is the core personal investigation tool for Paradocs users. It transforms passive content consumption into active research by giving every user a multi-view, AI-powered evidence board for the unexplained.

**The Ancestry.com analogy:** Just as Ancestry lets users build and explore their family tree — connecting people, records, and stories into a living document — Paradocs lets users build a personal constellation of paranormal evidence. Every sighting video, Reddit thread, official report, and podcast episode has a place. The research hub grows as the user investigates, and AI surfaces patterns and connections they'd never find alone.

**Core value loop:**

1. **Collect** — Save any evidence from anywhere on the internet (Paradocs reports, YouTube, Reddit, TikTok, news, podcasts, etc.)
2. **Connect** — Organize evidence into case files, draw relationships between artifacts, tag and annotate
3. **Discover** — AI proactively reveals hidden patterns: spatial clusters, temporal sequences, witness overlaps, cross-case correlations
4. **Share** — Publish theories, make case files public, contribute to the collective research graph

---

## 2. Product Strategy

### 2.1 The Hybrid Flywheel Model

The research hub supports two types of content:

**Layer 1 — Paradocs-Curated Reports:** The gold standard. Fully enriched with AI analysis, geocoded, linked to phenomena, credibility-scored. These are the backbone of every research collection and come from the Paradocs ingestion pipeline.

**Layer 2 — User-Added External Links:** Users can save any URL to their research hub. Paradocs auto-extracts metadata (title, thumbnail, source platform, date). These appear as visually distinct items — indicating user-sourced, not Paradocs-verified content.

**Layer 3 — The Flywheel:** When multiple users save the same external link, it signals high-value content. These links are surfaced to the Paradocs ingestion pipeline for potential promotion to full curated reports. Users whose links get promoted earn recognition/XP. Over time, the community crowd-sources content discovery, and the best sources naturally become part of the core database.

**Business moat:** The accumulated research graph — thousands of users connecting evidence across sources, with AI analyzing patterns across all of them — creates a network effect no competitor can replicate.

### 2.2 Monetization Tie-ins

| Feature | Free Tier | Basic Tier | Pro Tier |
|---------|-----------|------------|----------|
| Paradocs report artifacts | 25 | 100 | Unlimited |
| External link artifacts | 10 | 50 | Unlimited |
| Case files | 2 | 10 | Unlimited |
| Views available | Board + Timeline | + Map | + Constellation |
| AI insights | Weekly summary | Daily insights | Real-time proactive |
| Theories | View only | 3 published | Unlimited |
| Public profile | No | Basic | Full |
| Community patterns | No | View | View + contribute |

---

## 3. Multi-View Architecture

### 3.1 Design Philosophy

The research hub provides four complementary views of the same underlying data. Each view is optimized for a different research task and a different AI insight type. The data model is view-agnostic — all views read from the same tables and respond to the same mutations.

**Key principle:** The primary interaction surfaces (Board, Timeline) are designed mobile-first. The visualization surfaces (Map, Constellation) are designed desktop-first with graceful mobile fallbacks.

### 3.2 View Switcher

A persistent toggle bar at the top of the research hub lets users switch between views. On mobile, this renders as a horizontally scrollable pill bar. On desktop, it's a segmented control. The active view is remembered per session (stored in localStorage) and defaults to Board.

```
[ Board ]  [ Timeline ]  [ Map ]  [ Constellation ]
```

All four views share a common sidebar/drawer containing:

- Case file list (filterable, with artifact counts)
- Active AI insights (badge count)
- Quick-add artifact button
- Search/filter controls

On mobile, this sidebar becomes a bottom sheet accessible via a floating action button.

### 3.3 View 1: Board View (Default — Mobile Primary)

**Purpose:** Day-to-day research management. Collecting, organizing, annotating.

**Layout:** Case files as vertical sections (desktop) or swipeable tabs (mobile). Within each case file, artifacts render as rich cards in a masonry grid (desktop) or a single-column feed (mobile).

**Artifact card anatomy:**

```
┌─────────────────────────────────┐
│ [Thumbnail]    Source icon + tag │
│                                 │
│  Title of the artifact          │
│  Brief excerpt or user note...  │
│                                 │
│  ● Compelling   #ufo #military  │
│  Saved 3 days ago               │
│                                 │
│  [Connect] [Annotate] [Move] ...│
└─────────────────────────────────┘
```

**Card variations by source type:**

| Source | Thumbnail | Extra Info |
|--------|-----------|-----------|
| Paradocs report | Report image or phenomenon icon | Credibility score, category badge |
| YouTube | Video thumbnail with duration overlay | Channel name, view count |
| Reddit | Subreddit icon or preview image | Subreddit, upvotes, comment count |
| TikTok / Instagram | Video/image thumbnail | Creator handle, like count |
| Podcast | Show art | Show name, episode number, duration |
| News | Article image | Publication name, date |
| Other URL | OpenGraph image or favicon | Domain name |

**Unsorted section:** Artifacts not yet assigned to any case file appear in an "Unsorted" section at the top — encouraging organization without blocking collection.

**AI insights in Board View:** Insight cards are visually distinct (subtle glow border, AI icon) and are interspersed between artifact cards within the relevant case file. Example: between two artifacts that share a location, an insight card reads "These two sightings are 12 miles apart and 3 weeks apart."

**Connection visualization:** When a user taps "Connect" on a card, other cards that already have connections highlight with a colored left-border. Drawing a new connection: tap card A's "Connect" button, then tap card B — a modal asks for the relationship type and optional annotation. Existing connections appear as small linked-icon badges on each card showing the count (e.g., "3 connections").

**Mobile behavior (375px - 768px):**

- Single-column card feed
- Case files as horizontal swipeable tabs at top (with "Unsorted" + "All" as defaults)
- Bottom sheet for sidebar (case file list, insights, filters)
- Floating action button: "+" to add artifact (Paradocs search or paste URL)
- Swipe-left on card for quick actions: annotate, move to case file, delete
- Pull-down on case file tab to see case file description and stats
- Long-press card to enter multi-select mode (bulk move, bulk tag)

**Tablet behavior (768px - 1024px):**

- Two-column masonry grid
- Case file sidebar visible on left
- Cards show more metadata inline

**Desktop behavior (1024px+):**

- Three-column masonry grid (or kanban-style columns per case file)
- Persistent sidebar with case file tree, insights panel, and quick filters
- Drag-and-drop cards between case files
- Hover cards to preview connections as highlighted lines to related cards

### 3.4 View 2: Timeline View

**Purpose:** Temporal investigation. Seeing when things happened, spotting sequences and clusters, identifying escalation or migration patterns.

**Layout:** A vertical timeline axis with artifacts plotted by their `extracted_date`. Case files are color-coded layers that can be toggled on/off.

```
2024 ─────────────────────────────────
  Jan  ● UFO sighting over Phoenix (Paradocs)
  Feb
  Mar  ● Reddit post: similar lights in Tucson
       ● YouTube: dashcam footage Scottsdale
  Apr
  May  ◆ AI INSIGHT: 3 sightings in 60-day
       │  window within 100-mile radius
  Jun  ● Podcast episode: Arizona wave analysis
─────────────────────────────────────
```

**Artifact rendering on timeline:**

- Each artifact is a horizontal card extending from the timeline axis
- Source-type icon on the timeline dot (play icon for video, Reddit icon, etc.)
- Card shows title, source, verdict badge, and first line of note
- Tap/click to expand full detail

**Case file layers:**

- Toggle buttons at top: "Skinwalker Ranch" (amber), "Arizona Wave" (blue), "All" (white)
- Each case file's artifacts are color-coded on the timeline
- Overlapping dates from multiple case files create visual density — intentional

**AI insights in Timeline View:** Temporal insights render as highlighted spans on the timeline: a shaded region covering "Feb-May 2024" with an annotation: "4 artifacts cluster in this 90-day window." Sequence insights draw arrows between chronological artifacts: "This escalation pattern matches 3 other case files in the community."

**Zoom levels:**

- Decade view (for long-running investigations)
- Year view (default)
- Month view (for dense clusters)
- Week view (for rapid-fire events)

**Mobile behavior:**

- Vertical scrolling timeline (natural mobile gesture)
- Case file filter as horizontal pill bar at top
- Tap artifact dot to expand card inline
- Pinch to zoom between time scales
- AI insight spans render as subtle background color bands

### 3.5 View 3: Map View

**Purpose:** Spatial investigation. Seeing where things happened, identifying geographic corridors, proximity clusters, and regional patterns.

**Layout:** Full-screen Leaflet/Mapbox map with artifacts plotted as markers. Reuses existing Paradocs map infrastructure.

**Marker types:**

| Source | Marker |
|--------|--------|
| Paradocs report | Category-colored pin with verdict ring |
| YouTube / external | Source-colored pin with platform icon |
| Cluster (3+ nearby) | Numbered circle marker, click to expand |

**Case file layers:** Same toggle system as Timeline. Each case file is a toggleable layer with its own marker color. Overlapping artifacts from multiple case files show both colors (split marker or double ring).

**AI insights in Map View:** Spatial insights render as translucent shaded regions on the map. "Your 5 artifacts in this area form a 20-mile corridor along Route 191." Proximity insights draw dotted lines between nearby artifacts with distance labels.

**Map controls:**

- Standard zoom/pan
- "Fit to case file" button (auto-zooms to show all artifacts in selected case file)
- Heatmap toggle (density visualization when 20+ artifacts have coordinates)
- Time slider at bottom (filter artifacts by date range — combines Map + Timeline power)

**Mobile behavior:**

- Full-screen map with floating controls
- Bottom sheet for artifact list (swipe up to see cards for visible markers)
- Tap marker to see artifact card in bottom sheet
- Case file toggle as floating pills overlay at top

**Note:** Only artifacts with valid coordinates appear on the Map. A subtle banner indicates "X artifacts have no location data — visible in Board and Timeline views."

### 3.6 View 4: Constellation View (Prestige Visualization)

**Purpose:** The "wow" moment. A beautiful, immersive visualization of the user's entire research universe. Optimized for visual impact, exploration, and sharing — not for daily task management.

**Positioning:** This is the view users show their friends, share on social media, and use as their public profile background. On mobile, it's a full-screen immersive experience entered deliberately. It is a *reward* for building a substantial research collection — most powerful once a user has 15+ artifacts across 2+ case files.

**Layout:** Canvas-rendered interactive star field (existing V2 engine) with enhancements:

- **Stars** = Artifacts (evidence items)
- **Nebulae** = Case files (glowing cloud regions containing their artifacts)
- **Lines** = Connections (edges between related artifacts)
- **Pulses** = AI insights (brief glowing animations highlighting patterns)

**Node Types & Visual Treatment:**

| Node Type | Shape | Size | Glow | Special Effect |
|-----------|-------|------|------|----------------|
| Paradocs report | Multi-layer star | Large (8-12px) | Full category glow | Diffraction spikes if compelling |
| YouTube video | Star with play icon | Medium (6-10px) | Red-tinted glow | — |
| Reddit post | Star with dot | Medium (6-10px) | Orange-tinted glow | — |
| TikTok / Instagram | Star with circle | Small-Medium (5-8px) | Pink-tinted glow | — |
| Podcast | Star with wave | Medium (6-10px) | Green-tinted glow | — |
| News article | Star with square | Medium (6-10px) | Blue-tinted glow | — |
| Other URL | Dim star | Small (4-6px) | White glow | — |

**Verdict Colors (Applied to Star Core):**

- Compelling: `#fbbf24` (amber) — bright, warm, draws the eye
- Inconclusive: `#60a5fa` (blue) — cool, neutral
- Skeptical: `#9ca3af` (gray) — subdued
- Needs Info: `#a78bfa` (purple) — intriguing, unresolved

**Case File Nebulae:**

Each case file renders as a soft, glowing nebula region:

- Background layer: Large gaussian blur in the case file's `cover_color`, 15-25% opacity
- Boundary: No hard edge — the glow fades naturally
- Label: Case file title rendered at nebula center, fading at high zoom
- Gravity: Artifacts within a case file are attracted toward the nebula center via D3 force
- Multi-membership: Artifacts in multiple case files are attracted to the midpoint between their parent nebulae

**Connection Lines:**

| Connection Type | Line Style | Color |
|----------------|------------|-------|
| same_witness | Solid | White |
| same_location | Dashed | Green |
| same_timeframe | Dotted | Blue |
| contradicts | Wavy/red | Red |
| corroborates | Solid thick | Gold |
| related | Thin solid | Gray |
| AI-suggested | Pulsing dashed | Cyan |

**AI Insight Animations:**

When a new insight is generated:

1. Relevant artifacts briefly brighten (200ms fade-in)
2. A glowing "pulse" travels along the connection or between the referenced artifacts
3. A small insight icon appears near the cluster with a tooltip preview
4. The insight badge count in the sidebar increments

**Zoom Levels:**

| Zoom | What's Visible |
|------|---------------|
| 0.2x - 0.5x | Nebulae as soft glows, no labels, no edges, stars as dots |
| 0.5x - 1.0x | Nebulae with labels, star icons visible, major connections shown |
| 1.0x - 2.0x | Full detail: all connections, annotations, source type icons, hover details |
| 2.0x+ | Close-up: thumbnail previews appear near stars, full metadata on hover |

**Mobile Constellation behavior:**

- Full-screen immersive mode (hides all chrome, edge-to-edge)
- Touch zoom/pan via D3-zoom (already implemented)
- Tap star to see artifact summary overlay at bottom
- Double-tap star to open full artifact detail
- Tap-and-hold on empty space to exit to previous view
- Simplified rendering at lower zoom levels (skip edges, reduce glow layers)
- Reduce max background stars from 380 to 150 for GPU performance
- A "Return to Board" floating button in top-left corner

**Empty state (< 5 artifacts):** Instead of a sparse, disappointing star field, show a beautifully animated teaser constellation with placeholder stars and a message: "Save 5 more artifacts to unlock your personal constellation." This creates a progression mechanic and avoids the cold-start problem.

**Constellation as progression reward:**

| Artifacts Saved | Constellation State |
|----------------|-------------------|
| 0-4 | Locked — animated preview with "Save X more to unlock" |
| 5-14 | Basic — stars only, no nebulae, simple connections |
| 15-29 | Growing — nebulae appear for case files with 3+ artifacts |
| 30-49 | Rich — full glow effects, AI insight pulses, all connection types |
| 50+ | Majestic — diffraction spikes, dust lanes, shooting star animations for new adds |

---

## 4. Data Model

### 4.1 Entity Relationship Overview

```
constellation_artifacts (the fundamental unit)
    ├── belongs to → constellation_case_file_artifacts (junction) → constellation_case_files
    ├── connects to → constellation_connections → constellation_artifacts
    ├── referenced by → constellation_ai_insights
    ├── cited in → constellation_theories
    └── optionally links to → reports (Paradocs curated)

constellation_case_files
    ├── contains → constellation_case_file_artifacts → constellation_artifacts
    ├── has → constellation_theories
    └── has → constellation_ai_insights

constellation_ai_insights
    └── references → constellation_artifacts[]

constellation_theories
    ├── cites → constellation_artifacts[]
    ├── uses → constellation_connections[]
    └── belongs to → constellation_case_files (optional)
```

**Note:** The data model is identical across all four views. Views are purely a presentation-layer concern. All CRUD operations work the same regardless of which view the user is in.

### 4.2 Table: `constellation_artifacts`

The fundamental unit of the research hub. Represents any piece of evidence — either a Paradocs report or an external URL.

```sql
CREATE TABLE constellation_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Source identification
  source_type TEXT NOT NULL CHECK (source_type IN (
    'paradocs_report', 'youtube', 'reddit', 'tiktok',
    'instagram', 'podcast', 'news', 'website', 'other'
  )),
  report_id UUID REFERENCES reports(id) ON DELETE SET NULL,  -- if source_type = 'paradocs_report'
  external_url TEXT,                                          -- if external source

  -- Display metadata
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  source_platform TEXT,          -- Human-readable: "YouTube", "Reddit r/UFOs", etc.

  -- Content metadata (auto-extracted or user-provided)
  extracted_date DATE,           -- When the source content is from
  extracted_location TEXT,       -- Location mentioned in source
  coordinates GEOGRAPHY(POINT, 4326),  -- Geocoded location (PostGIS)

  -- User input
  user_note TEXT,
  verdict TEXT CHECK (verdict IN ('compelling', 'inconclusive', 'skeptical', 'needs_info')),
  tags TEXT[] DEFAULT '{}',

  -- Platform-specific metadata
  metadata_json JSONB DEFAULT '{}',
  -- Examples:
  --   YouTube: { duration, views, channel, like_count }
  --   Reddit: { subreddit, upvotes, comment_count, author }
  --   TikTok: { likes, shares, creator }
  --   Podcast: { episode_number, show_name, duration }

  -- Flywheel tracking
  external_url_hash TEXT,        -- SHA256 of normalized URL for dedup across users

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_report UNIQUE (user_id, report_id),
  CONSTRAINT source_type_check CHECK (
    (source_type = 'paradocs_report' AND report_id IS NOT NULL) OR
    (source_type != 'paradocs_report' AND external_url IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX idx_artifacts_user ON constellation_artifacts(user_id);
CREATE INDEX idx_artifacts_report ON constellation_artifacts(report_id) WHERE report_id IS NOT NULL;
CREATE INDEX idx_artifacts_url_hash ON constellation_artifacts(external_url_hash) WHERE external_url_hash IS NOT NULL;
CREATE INDEX idx_artifacts_tags ON constellation_artifacts USING GIN(tags);
CREATE INDEX idx_artifacts_source_type ON constellation_artifacts(source_type);
CREATE INDEX idx_artifacts_coordinates ON constellation_artifacts USING GIST(coordinates) WHERE coordinates IS NOT NULL;
CREATE INDEX idx_artifacts_date ON constellation_artifacts(extracted_date) WHERE extracted_date IS NOT NULL;
CREATE INDEX idx_artifacts_created ON constellation_artifacts(user_id, created_at DESC);
```

### 4.3 Table: `constellation_case_files`

Named collections of artifacts — the user's "investigations."

```sql
CREATE TABLE constellation_case_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  cover_color TEXT DEFAULT '#6366f1',    -- Used for nebula color + timeline/map layer color
  icon TEXT DEFAULT 'star',              -- Emoji or icon identifier

  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'shared')),

  -- Constellation positioning (nebula center, only used in constellation view)
  position_x FLOAT,    -- Normalized 0-1, set by user or auto-placed
  position_y FLOAT,

  -- Board view ordering
  sort_order INT DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_files_user ON constellation_case_files(user_id);
CREATE INDEX idx_case_files_visibility ON constellation_case_files(visibility) WHERE visibility = 'public';
CREATE INDEX idx_case_files_sort ON constellation_case_files(user_id, sort_order);
```

### 4.4 Table: `constellation_case_file_artifacts` (Junction)

Maps artifacts to case files (many-to-many — an artifact can be in multiple case files).

```sql
CREATE TABLE constellation_case_file_artifacts (
  case_file_id UUID NOT NULL REFERENCES constellation_case_files(id) ON DELETE CASCADE,
  artifact_id UUID NOT NULL REFERENCES constellation_artifacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sort_order INT DEFAULT 0,

  PRIMARY KEY (case_file_id, artifact_id)
);

CREATE INDEX idx_cfa_artifact ON constellation_case_file_artifacts(artifact_id);
```

### 4.5 Table: `constellation_connections`

User-drawn or AI-suggested relationships between artifacts.

```sql
CREATE TABLE constellation_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  artifact_a_id UUID NOT NULL REFERENCES constellation_artifacts(id) ON DELETE CASCADE,
  artifact_b_id UUID NOT NULL REFERENCES constellation_artifacts(id) ON DELETE CASCADE,

  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'same_witness', 'same_location', 'same_timeframe',
    'contradicts', 'corroborates', 'related', 'custom'
  )),
  annotation TEXT,               -- User's explanation of the connection

  ai_suggested BOOLEAN DEFAULT false,  -- Was this suggested by AI?
  ai_confidence FLOAT,                 -- 0-1, only if ai_suggested
  strength FLOAT DEFAULT 0.5,          -- 0-1 visual weight

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate connections (order-independent)
  CONSTRAINT unique_connection UNIQUE (user_id, artifact_a_id, artifact_b_id),
  CONSTRAINT no_self_connection CHECK (artifact_a_id != artifact_b_id)
);

CREATE INDEX idx_connections_user ON constellation_connections(user_id);
CREATE INDEX idx_connections_artifact_a ON constellation_connections(artifact_a_id);
CREATE INDEX idx_connections_artifact_b ON constellation_connections(artifact_b_id);
```

### 4.6 Table: `constellation_ai_insights`

Proactive AI-generated observations about the user's research.

```sql
CREATE TABLE constellation_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- What this insight is about
  scope_type TEXT NOT NULL CHECK (scope_type IN ('artifact', 'case_file', 'constellation')),
  scope_id UUID,    -- FK to artifact or case_file (NULL if constellation-wide)

  -- Insight content
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'spatial_cluster',       -- Multiple artifacts near same location
    'temporal_pattern',      -- Time-based pattern detected
    'witness_overlap',       -- Same witness/source across artifacts
    'source_correlation',    -- Multiple users saving same external source
    'cross_case_pattern',    -- Pattern spanning multiple case files
    'anomaly',               -- Something unusual in the data
    'suggestion',            -- Suggested connection or next steps
    'community_convergence'  -- Other researchers investigating similar things
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,

  -- View affinity: which view should prominently display this insight?
  -- Allows each view to prioritize its most relevant insight types
  primary_view TEXT CHECK (primary_view IN ('board', 'timeline', 'map', 'constellation')),

  -- References
  artifact_ids UUID[] DEFAULT '{}',     -- Artifacts this insight references
  connection_ids UUID[] DEFAULT '{}',   -- Connections this insight references

  confidence FLOAT NOT NULL DEFAULT 0.5,  -- 0-1 AI confidence

  -- User interaction
  dismissed BOOLEAN DEFAULT false,
  helpful BOOLEAN,   -- User feedback (NULL = no feedback, true/false)

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ   -- Some insights become stale
);

CREATE INDEX idx_insights_user ON constellation_ai_insights(user_id);
CREATE INDEX idx_insights_scope ON constellation_ai_insights(scope_type, scope_id);
CREATE INDEX idx_insights_active ON constellation_ai_insights(user_id)
  WHERE dismissed = false AND (expires_at IS NULL OR expires_at > NOW());
CREATE INDEX idx_insights_view ON constellation_ai_insights(primary_view)
  WHERE dismissed = false;
```

**View affinity mapping (set automatically on insight creation):**

| Insight Type | Primary View | Reason |
|-------------|-------------|--------|
| spatial_cluster | map | Geographic pattern best seen on map |
| temporal_pattern | timeline | Time-based pattern best seen on timeline |
| witness_overlap | board | Relationship between artifacts, shown as card interspersals |
| source_correlation | board | Social proof, shown as badges on cards |
| cross_case_pattern | constellation | Cross-case patterns best seen in holistic view |
| anomaly | board | Actionable callout between cards |
| suggestion | board | Next-step recommendation, card format |
| community_convergence | board | Social proof badge on artifact cards |

### 4.7 Table: `constellation_theories`

User-written theses supported by collected evidence.

```sql
CREATE TABLE constellation_theories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  thesis TEXT NOT NULL,              -- The user's argument/conclusion

  -- Supporting evidence
  artifact_ids UUID[] DEFAULT '{}',
  connection_ids UUID[] DEFAULT '{}',
  case_file_id UUID REFERENCES constellation_case_files(id) ON DELETE SET NULL,

  -- Publishing
  is_public BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,

  -- Community engagement (when public)
  upvotes INT DEFAULT 0,
  view_count INT DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_theories_user ON constellation_theories(user_id);
CREATE INDEX idx_theories_public ON constellation_theories(is_public) WHERE is_public = true;
CREATE INDEX idx_theories_case_file ON constellation_theories(case_file_id) WHERE case_file_id IS NOT NULL;
```

### 4.8 Table: `constellation_external_url_signals` (Flywheel)

Tracks how many users have saved the same external URL, feeding the ingestion pipeline.

```sql
CREATE TABLE constellation_external_url_signals (
  url_hash TEXT PRIMARY KEY,           -- SHA256 of normalized URL
  canonical_url TEXT NOT NULL,         -- The original URL
  source_type TEXT NOT NULL,
  title TEXT,                          -- Most common title across users
  thumbnail_url TEXT,

  save_count INT DEFAULT 1,           -- How many users saved this
  first_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ingestion pipeline status
  ingestion_status TEXT DEFAULT 'pending' CHECK (ingestion_status IN (
    'pending', 'queued', 'ingested', 'rejected'
  )),
  ingested_report_id UUID REFERENCES reports(id),  -- If promoted to full report

  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_url_signals_count ON constellation_external_url_signals(save_count DESC);
CREATE INDEX idx_url_signals_status ON constellation_external_url_signals(ingestion_status);
```

---

## 5. Row-Level Security (RLS) Policies

All constellation tables enforce strict user isolation.

```sql
-- Enable RLS on all tables
ALTER TABLE constellation_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_case_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_case_file_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_theories ENABLE ROW LEVEL SECURITY;

-- Artifacts: Users see only their own
CREATE POLICY artifacts_select ON constellation_artifacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY artifacts_insert ON constellation_artifacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY artifacts_update ON constellation_artifacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY artifacts_delete ON constellation_artifacts FOR DELETE USING (auth.uid() = user_id);

-- Case files: Own + public from others
CREATE POLICY case_files_select_own ON constellation_case_files FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY case_files_select_public ON constellation_case_files FOR SELECT USING (visibility = 'public');
CREATE POLICY case_files_insert ON constellation_case_files FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY case_files_update ON constellation_case_files FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY case_files_delete ON constellation_case_files FOR DELETE USING (auth.uid() = user_id);

-- Junction: Access follows artifact ownership
CREATE POLICY cfa_select ON constellation_case_file_artifacts FOR SELECT USING (
  EXISTS (SELECT 1 FROM constellation_artifacts WHERE id = artifact_id AND user_id = auth.uid())
);
CREATE POLICY cfa_insert ON constellation_case_file_artifacts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM constellation_artifacts WHERE id = artifact_id AND user_id = auth.uid())
);
CREATE POLICY cfa_delete ON constellation_case_file_artifacts FOR DELETE USING (
  EXISTS (SELECT 1 FROM constellation_artifacts WHERE id = artifact_id AND user_id = auth.uid())
);

-- Connections: Own only
CREATE POLICY connections_select ON constellation_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY connections_insert ON constellation_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY connections_update ON constellation_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY connections_delete ON constellation_connections FOR DELETE USING (auth.uid() = user_id);

-- AI Insights: Own only
CREATE POLICY insights_select ON constellation_ai_insights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY insights_update ON constellation_ai_insights FOR UPDATE USING (auth.uid() = user_id);
-- Insert/delete handled by service role (AI pipeline)

-- Theories: Own + public from others
CREATE POLICY theories_select_own ON constellation_theories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY theories_select_public ON constellation_theories FOR SELECT USING (is_public = true);
CREATE POLICY theories_insert ON constellation_theories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY theories_update ON constellation_theories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY theories_delete ON constellation_theories FOR DELETE USING (auth.uid() = user_id);
```

---

## 6. AI Insight Pipeline

### 6.1 Trigger: On-Add Analysis

When a user saves a new artifact, immediately run lightweight checks:

```
1. Spatial proximity: Any existing artifacts within 50 miles?
   → primary_view: 'map'
2. Temporal proximity: Any existing artifacts within +/-30 days?
   → primary_view: 'timeline'
3. Tag overlap: Shared tags with existing artifacts?
   → primary_view: 'board'
4. Source overlap: Same author/channel/subreddit as existing artifacts?
   → primary_view: 'board'
5. Phenomenon match: Same linked phenomenon?
   → primary_view: 'board'
```

If any match, generate an instant insight (no Claude API call needed — pure SQL/logic).

### 6.2 Trigger: Periodic Deep Scan (Cron)

Weekly (or when constellation grows past thresholds), run Claude analysis:

```
Input: User's full research hub (artifacts, connections, case files)
Prompt: "Analyze this researcher's evidence collection. Identify:
  - Non-obvious patterns across case files
  - Temporal sequences that suggest escalation or migration
  - Geographic corridors or clusters
  - Witness/source reliability patterns
  - Suggested connections the researcher hasn't drawn
  - Gaps in their investigation (what evidence might they look for next?)"
Output: Array of AI insights with confidence scores and primary_view assignments
```

### 6.3 Trigger: Community Pattern Detection

Across all users (anonymized), detect convergence:

```
- URL signals: 10+ users saved the same external link → "Trending in the community"
- Investigation overlap: Multiple users building case files on similar phenomena in same region
- Connection consensus: 5+ users drew the same connection between two Paradocs reports
```

### 6.4 Insight Lifecycle

```
Generated → Displayed (badge + in-view rendering) → Viewed → [Helpful/Dismissed] → Expired/Archived
```

User feedback (helpful/dismissed) trains future insight quality per user.

### 6.5 Insight Rendering by View

| View | How insights appear |
|------|-------------------|
| Board | Distinct cards interspersed between artifact cards in relevant case file. Glow border + AI icon. |
| Timeline | Shaded time-span regions with annotation text. Arrows between chronologically linked artifacts. |
| Map | Translucent shaded regions on the map. Dotted proximity lines with distance labels. |
| Constellation | Pulsing glow animations between related stars. Insight icon near cluster with tooltip. |

All insights are visible in all views (via a collapsible insights panel in the sidebar). The `primary_view` field just determines where the insight gets prominent inline placement.

---

## 7. API Design

### 7.1 Artifacts

```
GET    /api/constellation/artifacts          — List user's artifacts (paginated, filterable)
  Query params: case_file_id, source_type, verdict, tag, has_coordinates, has_date,
                sort_by (created_at|extracted_date|title), page, per_page
POST   /api/constellation/artifacts          — Create artifact (from report or URL)
GET    /api/constellation/artifacts/:id      — Get artifact detail
PUT    /api/constellation/artifacts/:id      — Update artifact (note, verdict, tags)
DELETE /api/constellation/artifacts/:id      — Remove artifact

POST   /api/constellation/artifacts/extract  — Extract metadata from URL (preview before saving)
```

### 7.2 Case Files

```
GET    /api/constellation/case-files              — List user's case files
POST   /api/constellation/case-files              — Create case file
GET    /api/constellation/case-files/:id          — Get case file with artifacts
PUT    /api/constellation/case-files/:id          — Update case file metadata
DELETE /api/constellation/case-files/:id          — Delete case file (artifacts kept)

POST   /api/constellation/case-files/:id/artifacts     — Add artifact(s) to case file
DELETE /api/constellation/case-files/:id/artifacts/:aid — Remove artifact from case file
PUT    /api/constellation/case-files/:id/reorder        — Reorder artifacts within case file
```

### 7.3 Connections

```
GET    /api/constellation/connections        — List user's connections
POST   /api/constellation/connections        — Create connection
PUT    /api/constellation/connections/:id    — Update connection
DELETE /api/constellation/connections/:id    — Delete connection
```

### 7.4 AI Insights

```
GET    /api/constellation/insights           — List active insights (filterable by primary_view)
  Query params: view (board|timeline|map|constellation), scope_type, dismissed
POST   /api/constellation/insights/:id/feedback  — Mark helpful/dismissed
POST   /api/constellation/insights/analyze   — Trigger on-demand deep analysis
```

### 7.5 Theories

```
GET    /api/constellation/theories           — List user's theories
POST   /api/constellation/theories           — Create theory
PUT    /api/constellation/theories/:id       — Update theory
DELETE /api/constellation/theories/:id       — Delete theory
POST   /api/constellation/theories/:id/publish   — Make public
```

### 7.6 Research Hub (Full Data Load)

```
GET    /api/constellation/user-map           — Full research hub data for rendering
  Query params: view (board|timeline|map|constellation)
```

Returns the complete payload: all artifacts, case files, connections, active insights, stats. For the constellation view, includes force simulation seed positions. Paginated for large collections (100+ artifacts).

**View-specific optimizations:**

- `view=board` — Returns artifacts grouped by case file with sort_order. Skips coordinate data.
- `view=timeline` — Returns artifacts sorted by extracted_date. Skips coordinate data.
- `view=map` — Returns only artifacts with coordinates. Includes cluster pre-computation.
- `view=constellation` — Returns all artifacts with force layout seed data.

### 7.7 Public Profiles

```
GET    /api/constellation/public/:userId     — View public case files + theories
```

---

## 8. Component Architecture

### 8.1 Shared Components (Used Across Views)

```
ResearchHub/
├── ResearchHub.tsx                  — Main container, view switcher, shared state
├── ResearchHubSidebar.tsx           — Case file list, insights panel, filters
├── ResearchHubMobileSidebar.tsx     — Bottom sheet version for mobile
├── ArtifactCard.tsx                 — Rich artifact card (used in Board + Timeline + sidebars)
├── ArtifactDetailDrawer.tsx         — Slide-out full detail panel
├── ArtifactQuickAdd.tsx             — "+" button → search Paradocs or paste URL
├── CaseFileSelector.tsx             — Dropdown/modal to assign artifact to case file
├── ConnectionDrawer.tsx             — UI for creating/editing connections
├── InsightCard.tsx                  — AI insight display (card variant for Board)
├── InsightBadge.tsx                 — Notification badge with count
├── ViewSwitcher.tsx                 — The [ Board | Timeline | Map | Constellation ] toggle
│
├── views/
│   ├── BoardView.tsx                — Masonry/kanban card layout
│   ├── TimelineView.tsx             — Chronological axis with event cards
│   ├── MapView.tsx                  — Leaflet/Mapbox with artifact markers
│   └── ConstellationView.tsx        — Canvas star field (existing V2 engine)
│
├── hooks/
│   ├── useResearchHub.ts            — Shared data fetching, mutations, optimistic updates
│   ├── useArtifacts.ts              — Artifact CRUD with SWR/React Query
│   ├── useCaseFiles.ts              — Case file CRUD
│   ├── useConnections.ts            — Connection CRUD
│   ├── useInsights.ts               — Insight fetching + feedback
│   ├── useForceSimulation.ts        — D3 force engine (constellation only)
│   └── useCanvasRenderer.ts         — Canvas rendering (constellation only)
│
└── utils/
    ├── artifact-helpers.ts          — Source type icons, verdict colors, metadata formatting
    ├── view-transitions.ts          — Animated transitions between views
    └── url-extractor.ts             — Client-side URL metadata preview
```

### 8.2 State Management

All views share a single data context (`ResearchHubProvider`) so that:

- Adding an artifact in Board View immediately appears in Timeline, Map, and Constellation
- Drawing a connection in Constellation View shows the connection badge on the Board card
- Dismissing an insight in any view dismisses it everywhere

Mutations use optimistic updates — the UI responds instantly, then syncs with the server. If the server rejects, the UI rolls back with a toast notification.

---

## 9. Implementation Phases

### Phase 1: Foundation + Board View (Current Sprint)
**Goal:** A working research hub with the Board view as the mobile-first default. Users can save Paradocs reports, organize into case files, and see basic AI insights.

- [ ] Create database migration (all 7 tables + RLS + indexes)
- [ ] Update `database.types.ts` with new table types
- [ ] Build `ResearchHub.tsx` container with `ViewSwitcher`
- [ ] Build `BoardView.tsx` with masonry grid (desktop) and single-column feed (mobile)
- [ ] Build `ArtifactCard.tsx` with source type variations
- [ ] Build case file CRUD (API + UI): create, rename, reorder, delete
- [ ] Build "Save to Research Hub" button on report detail pages (replaces/supplements current save)
- [ ] Build `ArtifactDetailDrawer.tsx` (slide-out on card tap)
- [ ] Build `ConnectionDrawer.tsx` (tap card A → tap card B → annotate)
- [ ] Build `ResearchHubSidebar.tsx` (desktop) and `ResearchHubMobileSidebar.tsx` (bottom sheet)
- [ ] Implement basic on-add insights (spatial + temporal proximity, SQL-only)
- [ ] Build `InsightCard.tsx` rendering within Board View
- [ ] Wire up "Unsorted" section for unaffiliated artifacts
- [ ] Mobile responsive testing across breakpoints

### Phase 2: Timeline + Map Views
**Goal:** Add the two analytical views that make the research hub a real investigation tool.

- [ ] Build `TimelineView.tsx` with vertical chronological axis
- [ ] Timeline zoom levels (decade/year/month/week)
- [ ] Case file color-coded layers on timeline
- [ ] Timeline AI insight rendering (shaded spans, arrows)
- [ ] Build `MapView.tsx` leveraging existing Leaflet/Mapbox infrastructure
- [ ] Map marker types by source type
- [ ] Map case file layers with toggle
- [ ] Map AI insight rendering (shaded regions, proximity lines)
- [ ] Time slider on map (date range filter)
- [ ] "Fit to case file" map control
- [ ] Mobile-optimized map with bottom sheet artifact list

### Phase 3: External Sources + Constellation View
**Goal:** Complete the multi-view experience with external URL support and the prestige constellation.

- [ ] Build URL metadata extraction service (OpenGraph, YouTube API, Reddit API, etc.)
- [ ] Add "Paste URL" flow in ArtifactQuickAdd
- [ ] Source-type-specific card rendering in Board View
- [ ] Refactor existing ConstellationMapV2 into `ConstellationView.tsx`
- [ ] Implement nebula rendering for case files
- [ ] Constellation progression system (locked → basic → growing → rich → majestic)
- [ ] Mobile constellation (full-screen immersive mode, simplified rendering)
- [ ] External URL hash dedup + flywheel signal tracking
- [ ] Admin dashboard: view trending external URLs, approve for ingestion

### Phase 4: AI Intelligence
**Goal:** Make the AI insight layer proactive and valuable across all views.

- [ ] Enhanced on-add insight generation (all 5 check types)
- [ ] Build cron job for weekly deep constellation analysis (Claude API)
- [ ] View-specific insight rendering (inline cards, timeline spans, map regions, constellation pulses)
- [ ] Insight notification system (badge counts, subtle animations)
- [ ] User feedback loop (helpful/dismiss) with quality training
- [ ] Build community pattern detection across users
- [ ] "X other researchers also saved this" social proof badges

### Phase 5: Social & Sharing
**Goal:** Let researchers share their work and learn from each other.

- [ ] Complete theory publishing flow
- [ ] Public researcher profile pages (with read-only constellation embed)
- [ ] Case file sharing (with view counts, upvotes)
- [ ] Embeddable research hub snippets (for blogs, social media)
- [ ] Community leaderboard / featured researchers

---

## 10. Migration from V1

The current codebase references `constellation_entries` and uses `ConstellationMapV2.tsx` as the primary view. The migration path:

1. Create new tables (Phase 1)
2. If any `constellation_entries` data exists, migrate to `constellation_artifacts` with `source_type = 'paradocs_report'`
3. Build the new `ResearchHub.tsx` container alongside the existing dashboard
4. Route `/dashboard/constellation` to the new ResearchHub with Board as default
5. Phase in Timeline, Map, and Constellation views in subsequent phases
6. Deprecate old `ConstellationMap.tsx` (V1), migrate `ConstellationMapV2.tsx` logic into `ConstellationView.tsx`
7. Remove old hooks (`useForceSimulation.ts`, `useCanvasRenderer.ts`) once they're absorbed into the new component tree

---

## 11. Performance Considerations

- **Board View:** Virtualized list rendering (react-window or similar) for 100+ artifact cards. Lazy-load thumbnails. Skeleton loading states.
- **Timeline View:** Virtualized timeline (only render visible date range). Debounced zoom level changes.
- **Map View:** Cluster markers for dense areas (already have clustering logic). Lazy-load artifact details on marker click.
- **Constellation View:** Existing Canvas renderer with device pixel ratio capping (max 2x). WebWorker offloading for 500+ nodes. Simplified rendering on mobile (fewer background stars, skip edges at low zoom).
- **API pagination:** All list endpoints paginate at 50 items. The `user-map` endpoint uses view-specific projections to minimize payload size.
- **URL extraction:** Async queue-based. Show "loading metadata..." placeholder card while extracting. Cache extracted metadata for 24 hours.
- **Optimistic updates:** All CRUD operations update the local cache immediately. Server sync happens in the background. Rollback on failure with toast notification.

---

## 12. Open Questions

1. **Should connections span across case files?** (Current design: yes — but this increases visual complexity in constellation view. Board view handles it cleanly with badge counts.)
2. **What's the artifact limit for free tier?** (Proposed: 25 Paradocs + 10 external. Board and Timeline always available. Map requires Basic. Constellation requires Pro.)
3. **Should the flywheel URL signal threshold be 5 users, 10 users, or configurable?** (Proposed: 10, with admin override)
4. **Theory upvotes — should they affect the author's researcher rank/XP?** (Proposed: yes, +10 XP per upvote)
5. **Should view preference persist per case file?** (e.g., user prefers Timeline for their "Arizona Wave" case but Board for "Skinwalker Ranch") (Proposed: no, keep it simple — one active view for the whole hub)
6. **Should the "Save to Research Hub" button replace or supplement the existing save/bookmark feature?** (Proposed: replace — the research hub IS the save destination, and the existing `saved_reports` table gets migrated)

---

*This document should be reviewed and approved before implementation begins. Once approved, Phase 1 work will start with the database migration and Board View build.*
