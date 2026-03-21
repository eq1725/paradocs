# Paradocs — Project Status & Session Coordination

**Last updated:** March 21, 2026
**Project:** beta.discoverparadocs.com
**Repo:** github.com/eq1725/paradocs (main branch)

> **Purpose:** This is the top-level PM document. Every dedicated session reads this at startup and updates its section at the end. It serves as the coordination layer that prevents cross-feature dependencies from falling through the cracks.
>
> **This document is maintained by the Project Status session** — a dedicated PM session that reviews all feature session updates, identifies conflicts, reprioritizes work, and provides big-picture guidance. Feature sessions update their own sections and the Cross-Feature Notes table; the PM session synthesizes everything.

---

## Product Vision

Paradocs operates on three layers, each serving a distinct audience but sharing a single data foundation.

**Layer 1 — The People's Tool.** Anyone who's had an experience — seen a UFO, had an NDE, encountered something they can't explain — can log it, search through what others have reported, save things, and study them. The database is the core asset: the largest aggregated collection of experiencer reports and phenomena data online, pulled from every legally accessible source. The experiencer demographic is genuinely underserved — MUFON is bureaucratic, Gaia is entertainment, the Black Vault is raw and unfiltered. Paradocs is the first product that meets that person where they are.

**Layer 2 — The AI Brain.** This is what makes Paradocs more than a database. The AI sees across millions of reports, detects patterns humans can't, identifies temporal and geographic clusters, and eventually predicts flaps and activity surges. The editorial position is deliberate: we hypothesize that the data points toward consciousness being fundamental and these phenomena being real, but the platform leads with evidence and analysis rather than declarations. Let the data speak. Present the best analysis possible and let people draw their own conclusions — while making it clear through the depth and seriousness of the platform that this deserves rigorous attention.

**Layer 3 — The Professional Platform.** Content creators researching a show episode, podcasters building an outline, academics writing a paper for peer review — Paradocs gives them research tools (the Research Hub, case files, artifact collection, external URL aggregation) that make their work faster and more thorough. The goal is to become the infrastructure the paranormal research ecosystem runs on, with relationships across all major networks and content channels.

**Data Aggregation Strategy:** Aggressive and comprehensive. Scrape and aggregate everything legally available: Reddit posts and comments, YouTube video metadata/transcripts/comments, Erowid trip reports, MUFON case files, NUFORC sightings, BFRO reports, NDERF/IANDS accounts, forum posts, podcast transcripts, news articles, academic papers, government documents — all flowing into one normalized database where the AI can see connections across sources that no human could track. The more data, the more valuable the platform becomes.

---

## Critical Sequencing

> **REVISED March 20, 2026.** The original A → B → C waterfall (encyclopedia complete → curated reports complete → mass ingestion) has been replaced. Encyclopedia enrichment and curated editorial content are valuable but are NOT blockers to launch. The four pillars — Database Scale, AI Intelligence, Research Dashboard, Stories Feed — are the product. Encyclopedia and editorial are parallel value-adds that improve continuously.

### Launch Path (Critical — MVP)

The critical path to launch is now:

1. **Data cleanup** — Delete ~2M hidden Reddit dev data. Re-ingest the ~900 existing approved reports through the final pipeline (or delete and replace with fresh ingestion). Start clean.
2. **Mass ingestion at scale** — Open the floodgates: YouTube, Erowid, MUFON, Reddit (fresh), forums, podcasts, news, academic papers, government docs. Target: millions of reports. The 4,792 phenomena entries already provide a basic taxonomy for classification — entries don't need full AI enrichment to serve as classification targets.
3. **Embedding pipeline at scale** — Embed all ingested reports into pgvector for semantic search and RAG. Pipeline exists and is tested (Session 15). Cost: ~$500-600 for 5M reports.
4. **Subscription & payments** — Stripe integration, checkout flow, tier gating. Blocked on Stripe key.
5. **Native app wrapper (Capacitor)** — Wrap Next.js web app in Capacitor native shell for iOS App Store + Google Play Store. Subscriptions route to Stripe web checkout (zero commission in US per Epic v. Apple ruling). Push notifications via native APIs. Gives store presence + credibility. Estimate: 1-2 dedicated sessions.
6. **Closed beta (~2 weeks)** — Alpha group + friends & family testing with real content at scale. Native apps in TestFlight (iOS) + internal testing (Android). Iterate on quality, performance, and UX.
7. **Public launch** — App Store + Play Store + web. Open to the world.

### Parallel Tracks (Ongoing — Not Blockers)

These improve the product continuously but do not gate launch:

- **Encyclopedia enrichment (Session 1)** — Enrich the 7 AI fields across all 11 categories. Each batch makes encyclopedia pages richer and improves semantic search. Cryptids (208/208) are the model. Work category by category, no deadline pressure.
- **Curated editorial content (Session 6a)** — Build more Featured Investigation clusters (Skinwalker Ranch, Phoenix Lights, Ariel School, etc.). Each adds a premium showcase to the homepage. These are the "Netflix Originals" — they draw people in but the library is the product.
- **Email & engagement (Session 9)** — Onboarding drips, weekly digests, smart alerts, winback. Retention infrastructure.

### Data Status

- **~900 approved reports:** Test data from pipeline development. Will be re-ingested through the final pipeline to ensure consistent quality.
- **~2M hidden Reddit reports:** Development data from pipeline testing. Will be deleted entirely. Fresh ingestion through the expanded source list will replace these.
- **20 curated reports (Roswell 14 + Rendlesham 6):** Real editorial content. These persist through all data operations — they are hand-crafted and not affected by pipeline changes.
- **4,792 phenomena entries:** Basic taxonomy exists across all 11 categories. Only cryptids (208) have full AI enrichment. The basic entries are sufficient for report classification; enrichment improves the encyclopedia pages themselves.

### Design Implications

All feature sessions must design for two content realities simultaneously: (1) the mass-ingested database at scale (millions of reports with basic metadata, pipeline-generated quality), and (2) the curated premium layer (Featured Investigations, enriched encyclopedia, editorial content). The Research Hub and user-generated artifacts (16+ source types) represent a third layer where users add their own research. The dashboard is an active research workspace, not a passive display.

---

## Subscription Tiers

| Tier | Price | Audience | What They Get |
|------|-------|----------|---------------|
| **Free** | $0 | Everyone | Curated slice of the database. Enough to experience the product, get hooked on a case, browse reports. No barrier. Free users are the funnel and the social proof engine — shares, screenshots, word of mouth. |
| **Core** | $5.99/mo | Casual explorers + experiencers | Two equally important audiences. The casual explorer drawn in by breadth — UFOs, NDEs, cryptids, consciousness, reincarnation, occultism, all searchable and browsable. And the experiencer: the person who saw something, had an NDE, has a family history of encounters — looking for context, validation, or simply to know they're not alone. For them, Paradocs isn't entertainment, it's a mirror. Full database access, clean UX, less than a coffee a month. |
| **Pro** | $14.99/mo | Deep researchers + creators | Podcasters sourcing material, independent investigators, content creators needing primary sources and AI cross-referencing, serious experiencers mapping encounters against historical data. Full toolkit: advanced search, AI cross-referencing, saved collections, annotations, alerts. Most engaged users. Backbone of recurring revenue. They'd pay $29 without hesitation; $14.99 gets them in faster and keeps them longer. |
| **Enterprise** | $99/mo | Organizations | Research groups, podcast networks, academic institutions, investigation orgs, media outlets. Small pool (dozens to low hundreds) but each worth 7x Pro with institutional stickiness. MUFON chapters, university parapsychology programs, UFO investigation orgs, paranormal media companies. Multi-seat, priority support, API potential. |

**Tier gating approach (per Dashboard session):** Board+Timeline views free, Map view basic, Constellation view pro-gated. Pattern insights, AI cross-referencing, and advanced search are pro features. Enterprise gets API access and multi-seat.

---

## How Sessions Work

Each major feature area has a dedicated Claude session with its own deep context. Sessions follow this protocol:

1. **On startup:** Read `PROJECT_STATUS.md` + your feature's HANDOFF file
2. **During work:** Stay focused on your feature domain
3. **On completion:** Update your section below + flag any cross-feature impacts in the Cross-Feature Notes section
4. **If you touch shared code:** Note it in the Foundation/Infrastructure section

---

## Session Registry

| # | Session Name | Scope | HANDOFF File | Status |
|---|-------------|-------|-------------|--------|
| 1 | **Encyclopedia Enrichment** | Phenomena content, AI fields, QA/QC, triage | `HANDOFF.md` (existing) | Active — Cryptid category 100% complete |
| 2 | **Explore & Discovery** | Personalized feed, category filters, content surfacing, recommendations | `HANDOFF_EXPLORE.md` | Active — Phase 2 mixed content feed deployed (March 21): feed-v2 API serves phenomena + reports, three card templates (PhenomenonCard/TextReportCard/MediaReportCard), Framer Motion related tray, completion signals |
| 3 | **Map & Geospatial** | MapLibre GL map, PostGIS queries, Supercluster, heatmap, bottom sheet | `HANDOFF_MAP.md` | Active — Phase 1 & 2 COMPLETE, Phase 3 partial. Deep-link URL params added (lat/lng/zoom) |
| 4 | **Insights & Pattern Analysis** | Pattern detection algorithms, AI narratives, skeptic mode, trending, methodology | `HANDOFF_INSIGHTS.md` | Not started |
| 5 | **User Dashboard & Constellation** | Dashboard home, constellation map (D3), research hub, journal, saved items, streaks, settings | `HANDOFF_DASHBOARD.md` | Active — Research Hub Phase 1-3 deployed, 16+ source types, mobile fixes applied |
| 6a | **Report Experience — Curated Content** | Handcrafted case files, editorial enrichment, Featured Investigations, curated media, book recommendations | `HANDOFF_REPORTS.md` | Active — 20 reports across 2 case clusters (Roswell 14 + Rendlesham 6), credibility rationales, badge redesign, homepage discovery row |
| 6b | **Report Experience — Ingestion & Scale** | Reports from mass ingestion pipeline, quality templates, automated enrichment, connection generation at scale | `HANDOFF_REPORTS_INGESTION.md` | Not started — NOW UNBLOCKED (March 20 strategic revision) |
| 7 | **Search, Navigation & Homepage** | Full-text search, site navigation, homepage layout/UX, onboarding flows, SEO, color system, PWA | `HANDOFF_SEARCH_NAV.md` | COMPLETE — Homepage: 4 sections / 168 lines. PWA: service worker + install prompt + icon refresh. Color: #9000F0. Search: fulltext + AI. Native app wrapper plan documented. |
| 8 | **Subscription & Monetization** | Stripe checkout, paywall, tier system, billing portal, cancellation | `HANDOFF_SUBSCRIPTION.md` | Not started |
| 9 | **Email & Engagement** | Weekly digests, drip campaigns, smart alerts, winback, notifications | `HANDOFF_EMAIL.md` | Not started |
| 10 | **Data Ingestion & Pipeline** | Source adapters, quality filters, dedup, bulk import, media extraction | `HANDOFF_INGESTION.md` | Not started — NOW UNBLOCKED and ON CRITICAL LAUNCH PATH (March 20 strategic revision) |
| 11 | **Admin & Operations** | Admin dashboard, batch operations, cron jobs, A/B testing, monitoring | `HANDOFF_ADMIN.md` | Not started |
| 12 | **Foundation & Infrastructure** | Shared components, auth/RLS, database schema, deployment, performance, SEO | `HANDOFF_FOUNDATION.md` | Not started |
| 13 | **Mobile-First Design System** | Cross-cutting mobile UX: bottom tabs, bottom sheets, design tokens, screen-by-screen redesign | `HANDOFF_MOBILE.md` | Active — Phase 1-2 + 3a + Nav Unification deployed. Screen-by-screen redesign next. |
| 14 | **Amazon Affiliate & Revenue Content** | Book recommendations, ASIN curation, affiliate strategy, FTC compliance, revenue optimization | `HANDOFF_AFFILIATE.md` | Active — Foundation deployed (report_books table, FurtherReading component, 16 Roswell books). Expansion needed. |
| 15 | **AI Experience & Intelligence** | Ask the Unknown chat, AI report analysis, AI cross-referencing, AI search, AI voice/personality, provider management | `HANDOFF_AI_EXPERIENCE.md` | DEPLOYED — RAG pipeline, semantic search, pattern detection, chat with citations all live. ~3,600 phenomena embedding remaining. |

---

## Session Details

### 1. Encyclopedia Enrichment (ACTIVE)

**Owner files:** `HANDOFF.md`, `PARADOCS_PROJECT_NOTES.md`, `SESSION_NOTES.md`
**Key directories:** `src/pages/phenomena/`, `src/pages/api/admin/phenomena/`, `src/lib/services/phenomena.service.ts`
**Database tables:** `phenomena`, `phenomena_media`

**Current state:**
- Cryptid category: 100% COMPLETE (208 entries across 18 batches)
- Phase 2 regeneration: COMPLETE (all categories, ai_history >= 800 chars, all ai_quick_facts populated)
- Total phenomena: 4,792 entries across 11 categories
- Quality standard: 7 AI fields populated, character minimums, verified sources, no fabrication

**What's next (parallel track — no longer blocks mass ingestion):**

> **STATUS CHANGE (March 20):** Encyclopedia enrichment is now a parallel value-add, not a launch blocker. The 4,792 basic entries provide sufficient taxonomy for report classification. Enrichment improves encyclopedia pages and semantic search quality but is not required before mass ingestion proceeds.

- Enrich remaining categories beyond cryptids (UFOs, ghosts, etc.) with the full 7-field treatment (ai_description, ai_characteristics, ai_theories, ai_paradocs_analysis, ai_quick_facts, ai_summary, primary_regions)
- Each enriched batch should be re-embedded via Session 15's embedding pipeline (`/api/admin/ai/embed`) to improve semantic search
- Media enrichment (images for phenomena entries)
- Cross-link phenomena to reports more comprehensively

**Touches other sessions:** Discover (ai_summary affects feed cards), Search (content affects search results), Reports (phenomena links on report pages), AI Experience (enriched entries improve semantic search when re-embedded)

---

### 2. Explore & Discovery

**Key files:**
- `src/pages/explore.tsx` — Main discovery feed page (Discover + Browse tabs)
- `src/pages/discover.tsx` — TikTok-style fullscreen swipe feed (standalone, no nav chrome) — Phase 2: mixed content
- `src/pages/api/discover/feed-v2.ts` — **NEW** Mixed content feed API (phenomena + reports, seeded shuffle, quality tiering, content-type diversity)
- `src/pages/api/discover/feed.ts` — Legacy phenomena-only feed API (preserved for backward compat)
- `src/components/discover/DiscoverCards.tsx` — **NEW** Three card templates: PhenomenonCard, TextReportCard, MediaReportCard + RelatedTray
- `src/pages/api/feed/personalized.ts` — Explore feed API (encyclopedia spotlight, trending, category highlights)
- `src/lib/services/personalization.service.ts` — User preference engine
- `src/components/CategoryFilter.tsx`, `SubcategoryFilter.tsx`, `PhenomenaFilter.tsx`
- `src/lib/hooks/usePersonalization.ts`
- `src/components/AskTheUnknown.tsx` — AI chat FAB (on explore + report pages)

**Database tables:** `reports`, `phenomena`, `saved_reports`, `user_preferences`

**Current state (March 21, 2026):**
- **Anonymous feed COMPLETE:** Rich 5-7 section editorial feed for all users (Encyclopedia Spotlight, Trending, Category Highlights, Recently Added). No empty states for logged-out users.
- **Soft-wall signup COMPLETE:** 3 contextual touchpoints (bookmark, in-feed card, bottom CTA). Research-backed: gate depth not breadth.
- **Mobile UX optimized (March 16):** Layout.tsx header fixed (logo nowrap, Submit demoted, Sign In pill button). Explore page compacted (inline title+toggle, larger encyclopedia cards at 75vw, compressed Pattern Insights banner). Ask the Unknown FAB repositioned above bottom nav with AI presence animations (rotating aurora border, breathing glow, sparkle micro-animation). MobileBottomTabs enlarged (Stories FAB 64px, nav icons 24px).
- **Discover feed randomization (March 16):** Seed moved from module scope to component useRef (fresh order every visit). API tier interleaving (3:1:1 explore-exploit pattern) replaces concatenated tiers.
- **Phase 2 mixed content feed (March 21):** Stories feed now serves both phenomena AND reports via `/api/discover/feed-v2`. Three card templates: PhenomenonCard (encyclopedia entries), TextReportCard (first-person accounts), MediaReportCard (reports with photo/video evidence). Framer Motion horizontal swipe tray for related content on each card (uses Session 15 RAG APIs). Completion milestone toasts at 25/50/75%. Content type pill indicator in header. Old feed API preserved for backward compat.

**What needs work:**
- Free tier content limits (e.g., 50 full reports/month)
- Core upgrade prompts when free users hit limit
- Save functionality for logged-in users (bookmark currently only gates anonymous)
- Feed personalization quality (A/B test section ordering, track engagement)
- "Connection cards" / "Did You Know?" cross-report relationships (Sprint 2, not built)
- Smart match alerts (Sprint 2, not built)
- Report media display — MediaReportCard uses gradient bg; when report images are available, switch to image-backed
- Tune report/phenomena ratio in mixed feed
- Complete remaining phenomena embeddings (~3,600) for Related tray coverage

**Touches other sessions:** Encyclopedia (content quality affects feed + spotlight), Insights (trending patterns surface in feed), Dashboard (personalization preferences), Search (shared filter components), Foundation (Layout.tsx + globals.css modified), Mobile Design (MobileBottomTabs modified)

---

### 3. Map & Geospatial (ACTIVE)

**Key files (Phase 1 + 2):**
- `src/pages/map.tsx` — Complete rewrite (~234 lines, MapLibre GL, desktop timeline bar)
- `src/components/map/MapContainer.tsx` — Core MapLibre GL renderer (heatmap + clusters + markers + basemap switching)
- `src/components/map/MapBottomSheet.tsx` — Mobile 3-snap-point bottom sheet with category stats + pull-to-dismiss
- `src/components/map/MapControls.tsx` — Floating control buttons (heatmap, locate me, basemap toggle)
- `src/components/map/MapTimeline.tsx` — NEW Phase 2: Dual-handle date range slider with histogram + era presets
- `src/components/map/MapFilterPanel.tsx` — Collapsible filter drawer / inline filters
- `src/components/map/MapReportCard.tsx` — Selected report detail card
- `src/components/map/mapStyles.ts` — Style constants, category colors, types, timeline config, BASEMAP_STYLES
- `src/components/map/useMapState.ts` — URL-synced filter state hook
- `src/components/map/useViewportData.ts` — Supabase fetch + Supercluster clustering + category/country/yearHistogram stats

**Key files (unchanged — still used):**
- `src/components/PhenomenonMiniMap.tsx` — Lightweight Leaflet phenomenon map (kept as-is per design decision)
- `src/components/patterns/PatternMiniMap.tsx` — Pattern location map (Leaflet, kept)
- `src/pages/api/search/proximity.ts` — Geospatial proximity search
- `src/lib/services/geocoding.service.ts` — Mapbox geocoding (server-side)
- `src/lib/ingestion/utils/location-parser.ts`, `location-inferrer.ts` — Location extraction

**Database:** PostGIS extension, `latitude`/`longitude` columns on reports, `primary_regions` on phenomena, GIST index

**Dependencies added:** `maplibre-gl ^4.7.1`, `react-map-gl ^7.1.7`, `supercluster ^8.0.1`, `@types/supercluster ^7.1.3`

**Environment variables:** `NEXT_PUBLIC_MAPTILER_KEY` — MapTiler API key (Flex plan, domain-restricted to beta.discoverparadocs.com + localhost). Must be set in Vercel env vars.

**Current state (March 16, 2026):**
- **Phase 1 COMPLETE:** Full MapLibre GL migration deployed. Leaflet replaced on main map page. 312 geocoded reports rendering with Supercluster clustering, heatmap layer, category-colored markers, mobile bottom sheet (3-snap), auto-fit to data bounds, URL-synced filters, locate me (geolocation → flyTo), desktop filter drawer + report detail panel.
- **Phase 2 COMPLETE:** Timeline slider (dual-handle, 1400–2026) with decade histogram sparkline and era presets (All Time, Pre-Modern, 1900–1950, 1950–2000, 2000+). Basemap toggle cycling dark → satellite → terrain. Bottom sheet improvements: raised above nav bar, pull-down-to-dismiss from content area, enlarged slider touch targets (44×44px). Era presets visible on mobile. Desktop timeline bar with backdrop blur.
- **Phase 3 PARTIALLY COMPLETE:** Map Spotlight placeholder cards deployed on Explore page (`MapSpotlightRow.tsx`). 5 hardcoded cards (UFO Hotspots US, Cryptid Sightings, Ghost & Hauntings, Global Heatmap, Pre-Modern Encounters) with gradient backgrounds, icons, and deep-link URLs to `/map` with filter params. Positioned as 2nd row in Discover feed (after Encyclopedia Spotlight). Card dimensions matched to Encyclopedia Spotlight cards. Deep-link URLs and encyclopedia map links deferred to post-ingestion.

**What needs work (remaining Phase 3 + Phase 4, post-ingestion):**
- **Phase 3 remaining (post-ingestion):** Replace placeholder Map Spotlight cards with dynamic data-driven cards (cluster density, hotspots). Add pre-rendered static map thumbnail images. Deep-link URL schema for `?phenomenon=`, `?bounds=`. Encyclopedia "View all on map" links.
- **Phase 4 (post mass-ingestion, scale):** Server-side viewport clustering API, PostGIS materialized views, vector tile server (Martin), geocoding queue, location quality scoring

**Touches other sessions:** Reports (report location data), Encyclopedia (primary_regions field, "View all on map" links), Ingestion (location parsing quality), Insights (geospatial pattern detection), Explore (Map Spotlight cards), Mobile Design (bottom sheet, touch gestures), Foundation (new dependencies, env var)

---

### 4. Insights & Pattern Analysis

**Key files:**
- `src/pages/insights/index.tsx` — Patterns overview
- `src/pages/insights/methodology.tsx` — Methodology docs
- `src/pages/insights/patterns/[id].tsx` — Pattern detail
- `src/pages/api/patterns/` — Pattern APIs (index, [id], trending, insight)
- `src/lib/services/pattern-analysis.service.ts` — v1 algorithm
- `src/lib/services/pattern-analysis-v2.service.ts` — v2 algorithm
- `src/lib/services/pattern-scoring.service.ts` — Quality metrics
- `src/lib/services/ai-insights.service.ts` — Claude-powered narratives
- `src/components/patterns/` — 15+ visualization components (temporal, seasonal, uncertainty, skeptic mode, etc.)
- `src/pages/api/cron/analyze-patterns.ts`, `analyze-patterns-v2.ts`
- `src/pages/api/cron/drift-detection.ts`

**Database tables:** `patterns`, related indexes

**Current state:** v1 and v2 pattern algorithms exist. Claude-powered insight narratives. Rich visualization components (temporal, seasonal, uncertainty, skeptic mode). Drift detection cron job.

**What needs work:**
- Tune algorithms for accuracy with current dataset
- New pattern types (cross-category correlations, witness profile patterns)
- Dashboard widget integration (trending patterns)
- Performance optimization for real-time analysis
- Pattern quality scoring refinement
- Community validation / crowdsourced pattern verification

**Touches other sessions:** Explore (trending patterns in feed), Reports (per-report pattern display), Dashboard (user's pattern insights), Encyclopedia (phenomena-level patterns), Email (pattern alerts in digests)

---

### 5. User Dashboard & Constellation

**Key files:**
- `src/pages/dashboard/` — All dashboard pages (index, saved, reports, insights, digests, constellation, research-hub, settings, subscription, journal/)
- `src/components/dashboard/` — 15+ components (ConstellationMap, ConstellationMapV2, DashboardLayout, ResearchStreak, UsageMeter, FeatureGate, TierBadge, etc.)
- `src/components/dashboard/research-hub/` — **13 components:** ResearchHub, BoardView, TimelineView, MapView, MapViewInner, ViewSwitcher, ArtifactCard, ArtifactDetailDrawer, ArtifactQuickAdd, ResearchHubSidebar, MobileSidebar, InsightCard, SourceLogos
- `src/pages/api/research-hub/` — **7 endpoints:** artifacts, case-files, case-file-artifacts, connections, insights, hub-data, extract-url
- `src/lib/hooks/useResearchHub.ts`, `useArtifactActions.ts` — **NEW**
- `src/lib/research-hub-helpers.ts` — **NEW**
- `src/pages/api/constellation/` — entries, connections, theories, public-profile, user-map
- `src/pages/api/user/` — reports, saved, searches, journal, digests, personalization, streak, stats, year-in-review
- `src/lib/services/journal.service.ts`, `streak.service.ts`
- `src/lib/hooks/useForceSimulation.ts`, `useCanvasRenderer.ts`
- `src/lib/constellation-data.ts`
- `CONSTELLATION_V2_DESIGN.md` — Full design doc for Research Hub multi-view architecture

**Database tables:** `profiles`, `constellation_entries`, `saved_reports`, `saved_phenomena`, `constellation_artifacts` (NEW), `constellation_case_files` (NEW), `constellation_case_file_artifacts` (NEW), `constellation_connections` (REBUILT), `constellation_ai_insights` (NEW), `constellation_theories` (REBUILT), `constellation_external_url_signals` (NEW)

**Current state (March 20, 2026):**
- **Research Hub Phase 1 COMPLETE:** Multi-view architecture deployed. Board View (mobile-first default) with sidebar, case files, artifact cards, quick-add modal, detail drawer. Auth check with login redirect.
- **Research Hub Phase 2 COMPLETE:** Timeline View (decade/year/month/week zoom with case file color coding) and Map View (Leaflet with clustering, spatial insights, mobile bottom sheet) built and deployed.
- **Research Hub Phase 3 External URLs COMPLETE:** Full URL extraction pipeline with source auto-detection for 16+ source types (YouTube, Reddit, Twitter/X, TikTok, Instagram, podcast, news, Archive.org, academia, forum, government, blog, book, documentary, interview, and generic website). OG scraping, multi-source Reddit fallback chain, branded SVG logo fallbacks, manual thumbnail URL override, uniform card heights, action bar opacity toggle.
- **PUT /api/research-hub/artifacts/[id] CREATED:** Artifact update endpoint (verdict, user_note, tags, title, description). Was previously missing — useResearchHub hook was calling it but getting 405.
- **Mobile CSS fixes applied:** Replaced JS viewport detection with CSS-only Tailwind responsive classes (eliminates SSR hydration flash). Added overflow containment, truncation, responsive padding across dashboard and Research Hub.
- **Database migration LIVE:** 7 new tables with RLS policies, indexes, and backward-compatible migration from old constellation_entries. 16+ source types in CHECK constraint.
- **Desktop NotificationBell integrated:** Replaced static bell icon + hardcoded purple dot in desktop header with Session 7's functional `<NotificationBell />` component.
- Old constellation-first dashboard still exists alongside new Research Hub.

**What needs work (Phases 3b-5):**
- **Phase 3b:** Constellation View integration (D3 force-directed graph wired into new data model, progression unlock at 5+ artifacts) — External URL support is DONE
- **Phase 4:** AI Intelligence layer (on-add insight generation via Claude, weekly deep scan cron, community pattern detection, cross-case-file relationship suggestions)
- **Phase 5:** Social & Sharing (theory publishing, public researcher profiles, embeddable research snippets, community signal aggregation where popular external links feed into ingestion pipeline)
- Reddit thumbnail extraction may still fail for some video posts (Reddit blocks Vercel IPs aggressively)
- Journal curation workflow refinement
- Gamification system (challenges, badges, levels)
- Dashboard tour / onboarding improvements
- Mobile dashboard experience polish → **Moved to Session 13 (Mobile-First Design System)**

**Touches other sessions:** Subscription (tier gating — Board+Timeline free, Map basic, Constellation pro), Insights (AI insights integration), Encyclopedia (saved phenomena, report artifacts), Reports (save-to-hub flow), Email (digest preferences), Ingestion (external URL signal aggregation feeds pipeline)

---

### 6a. Report Experience — Curated Content (ACTIVE)

**Key files:**
- `src/pages/report/[slug].tsx` — Report detail page (~1100 lines)
- `src/pages/submit.tsx` — Report submission form
- `src/pages/api/reports/[slug]/` — nearby, connections, academicData, environment, insight
- `src/components/reports/` — LocationMap, EnvironmentalContext, AcademicObservationPanel, ConnectionCards
- `src/components/FormattedDescription.tsx` — Body text renderer (ALL-CAPS headers, pull quotes)
- `src/components/ReadingProgress.tsx`, `ArticleTableOfContents.tsx` — Reading experience
- `src/components/MediaGallery.tsx` — Hero images + sources/documents (mode prop)
- `src/pages/api/admin/generate-connections.ts` — Batch connection generation (v2)

**Database tables:** `reports`, `report_media`, `report_connections`, `report_links`, `academic_observations`

**Current state (March 18, 2026) — Phase B comprehensive: mobile, Roswell cluster, AI grounding, media storage, nav fix, CONTENT ENRICHMENT COMPLETE:**
- **Body text:** FormattedDescription rewrite (ALL-CAPS headers → styled h2s, pull quotes with attribution, anchor IDs). Single-word headers (e.g. "LEGACY") now supported (≥4 chars).
- **Pull quotes (NEW):** Attribution regex rewritten with `NOT_NAMES` blocklist, `isLikelyName()` validator, 3-char minimum, 200-char proximity limit. Expanded quotes in all 5 new reports to 40+ chars.
- **Reading UX:** ReadingProgress bar, ArticleTableOfContents with IntersectionObserver (hooks violation fixed), MediaGallery split (hero images vs Sources & Documents)
- **Mobile reading:** Pull quotes responsive, section headers scaled, TOC compact, AskTheUnknown FAB less intrusive, connection cards single-column, event_time 12-hour.
- **Breadcrumbs:** Mobile shows parent case trail. Desktop shows full path including parent case title.
- **Client-side navigation fix (NEW):** React error #310 fixed — ArticleTableOfContents early return moved after useEffect. State cleared immediately on slug change. Stale-slug guard in loadReport(). Scroll-to-top on navigation.
- **LocationMap:** MapLibre GL + MapTiler. Satellite toggle, "Explore on Map" deep-link.
- **Environmental Context:** Date-aware, responsive 2-col grid, clean Unknown states.
- **Research Data Panel:** NLP confidence flags, Pro-gated export, witness count ~est.
- **Did You Know?:** Same-case filtering, cross-phenomenon priority. Stargate Project link needs cross-category data.
- **AI Analysis fix (NEW):** Hash-based caching (content-hash comparison, not 24h timer). DB-grounded Similar Cases (no hallucination). Anti-hallucination system prompt. 72 insights invalidated.
- **Roswell cluster expanded (NEW):** 14 total reports (1 showcase + 13 witnesses). All with uncertainty notes. Connections generated.
- **Media storage (NEW):** All images downloaded to Supabase Storage (`report-media` bucket). No more hotlinking to Wikimedia. Barnett photo sourced from Find a Grave. On-demand ISR revalidation endpoint (`/api/admin/revalidate`).
- **Content enrichment COMPLETE (March 18):** All 14 Roswell reports enriched from 2,000-6,000 chars to 4,000-12,500 chars. Engagement-optimized with tension hooks, dramatic pacing at reveals (Building 84, debris switch, Fort Riley crate), pull quotes at reading breakpoints. Sources: Kevin Randle blog, GAO Report NSIAD-95-187, 1994 Air Force report, Walter Haut sealed affidavit, DuBose sworn affidavit, Porter affidavit, Mac Brazel Daily Record interview, Marcel NBC interview, Corso rebuttals (Klass, UK National Archives). Government documents (GAO, FBI Vault, NSA) and ABC News 1947 radio bulletin added as media. Brazel duplicate newspaper images fixed, landscape photo added.
- **Data accuracy:** Foster Ranch coords, witness count audit, all reports verified. False "no photo exists" claim corrected on Barnett.
- **Visual polish:** Compact badges, subtler tags, cleaner metadata cards, merged engagement+CTA.

- **Featured Investigations system DEPLOYED (March 18):** `featured_investigations` table, `/api/public/featured-investigations` API, homepage `index.tsx` updated to use editorial curation with spotlight fallback. Roswell seeded as first featured investigation. Ready for additional case file clusters.
- **Amazon affiliate book recommendations DEPLOYED (March 18):** `report_books` table, `FurtherReading.tsx` component on report pages, 16 books across 10 Roswell reports, FTC-compliant disclosures. All ASINs verified. Owned by Session 14 going forward.
- **Brazel media fixed (March 18):** Duplicate newspaper images removed, correct landscape photo added.

**March 19, 2026 updates:**
- **Rendlesham Forest case cluster COMPLETE:** 1 showcase + 5 witness reports (Penniston, Burroughs, Halt, Warren, Cabansag). 4,700-13,400 chars each. Academic research, credibility rationales, 8 book recommendations, 8 Supabase-stored images, 5 witness portraits, 7 YouTube videos, Halt Memo PDF, Halt audio tape. Featured Investigation entry (display_order: 2).
- **Credibility rationale feature DEPLOYED:** New `credibility_rationale` column on `reports`. Tappable credibility badge expands editorial explanation below info grid. 20 reports seeded (14 Roswell + 6 Rendlesham). Falls back to generic description for reports without rationales.
- **Badge system redesigned:** Removed redundant category badge (already in breadcrumb). New "Featured Investigation" badge (amber/gold, star icon) for `featured=true`. "Notable Case" phenomenon type filtered from display.
- **Pull quote QA hardened:** Title/citation rejection, em-dash attribution detection, unattributed quotes suppressed. Audit endpoint added (`/api/admin/audit-pull-quotes`).
- **Reading progress bar:** 2px → 4px for mobile visibility.
- **MediaGallery audio fix:** Wiki page URLs no longer misclassified as direct media files.
- **Homepage "More Investigations" row:** Secondary discovery grid below the main hero. Static (no auto-rotation — UX research shows carousels have ~1% CTR). Renders when 2+ featured investigations exist.
- **Corso media:** 2 YouTube videos added to Philip Corso report.
- **Lesson learned:** Wikimedia hash paths from research agents are frequently wrong. Must verify via Wikimedia API (`action=query&prop=imageinfo&iiprop=url`). Vercel serverless functions cannot access repo root files — use local Node.js scripts for file uploads.

**What still needs work (Session 6a — Curated Content, parallel track — not a launch blocker):**

> **STATUS CHANGE (March 20):** Curated editorial content is a parallel value-add, not a launch prerequisite. The 20 existing reports (Roswell + Rendlesham) are premium showcases. More clusters add value but mass ingestion and launch do not depend on them.

- **Next curated case files:** Skinwalker Ranch, Phoenix Lights, Ariel School, etc. — each follows the Roswell/Rendlesham pattern (showcase + witness cluster + editorial enrichment + book recommendations + credibility rationales + YouTube videos + witness portraits)
- **Phenomenon type taxonomy cleanup (PM decision):** All 14 Roswell + 6 Rendlesham reports have `phenomenon_type` set to "Notable Case" — a placeholder. Need to add "Crash & Retrieval", "Military Encounter", etc. to `phenomenon_types` table. Badge display already filters "Notable Case" so this is data-quality only.
- Did You Know? cross-phenomenon connections need cross-category report data (Stargate Project etc.)
- `roswell-incident` stub report (382 chars, no case_group) — consider merging into the showcase or deprecating
- Migrate pre-session Roswell report images (DuBose, Marcel, Haut) from Wikimedia hotlinks to Supabase Storage
- Shareable story cards (viral share images) — post-ingestion
- Research Data Panel cross-referencing features — post-ingestion

**Touches other sessions:** Map (shared MapLibre/MapTiler stack, deep-link URL params), Subscription (Research Data Panel Pro-gated), Session 6b (quality bar templates for ingested reports), Session 14 (book recommendations, affiliate strategy), Ingestion (generate-connections ready for batch), Encyclopedia (phenomena links), Mobile (reading experience COMPLETE), Foundation (on-demand ISR revalidation endpoint, FTC disclosure in Layout.tsx footer), Homepage/Explore (index.tsx "More Investigations" row added)

---

### 6b. Report Experience — Ingestion & Scale (NOT STARTED — NOW UNBLOCKED)

**Scope:** Reports generated from mass ingestion pipeline. Quality templates, automated enrichment, connection generation at scale, automated media sourcing.

**Depends on:** Session 10 (ingestion pipeline running). ~~Phase A (encyclopedia complete) and Phase B (curated quality bar set by Session 6a)~~ — dependency removed March 20. Encyclopedia and editorial are parallel tracks.

**Key responsibilities:**
- Define quality templates for ingested reports (minimum description length, required fields, credibility scoring)
- Automated connection generation at ingestion time
- Media sourcing automation (image extraction, thumbnail generation)
- Report deduplication and merging for similar incidents
- Location extraction subsystem for pipeline
- Quality scoring and grading automation
- Batch operations for report cleanup and enrichment

**Shares with Session 6a:** Report detail page components, FormattedDescription, MediaGallery, FurtherReading, AI Analysis, reading experience. Session 6b should not modify shared components without coordinating with 6a.

---

### 14. Amazon Affiliate & Revenue Content (ACTIVE)

**Owner files:** `HANDOFF_AFFILIATE.md`
**Key files:**
- `src/components/reports/FurtherReading.tsx` — Book recommendation component on report pages
- `src/pages/api/reports/[slug]/books.ts` — API for fetching books per report
- `src/pages/api/admin/seed-featured-and-books.ts` — Admin script for populating books
- `src/pages/api/admin/fix-book-asins.ts` — ASIN correction script
- `src/components/Layout.tsx` — Site-wide FTC disclosure in footer

**Database tables:** `report_books`

**Current state (March 18, 2026):**
- Foundation DEPLOYED: `report_books` table, `FurtherReading.tsx` component, books API, FTC disclosures
- 16 books seeded across 10 Roswell reports, all ASINs verified against Amazon
- Amazon Associates StoreID: `paradocs-20`
- All links use `tag=paradocs-20` parameter
- Covers load from Amazon's image service with fallback icon

**What needs work:**
- **ASIN curation expansion:** Add books to the 4 Roswell reports without recommendations (Cavitt, DuBose, Wilcox, Porter)
- **New case file books:** As Session 6a builds case files (Skinwalker Ranch, Phoenix Lights, etc.), Session 14 curates relevant book recommendations for each
- **Dedicated bookshelf page:** `/books` or `/library` — organized by topic/case, SEO-optimized for book-related searches
- **Revenue analytics:** Track click-through rates, conversion attribution, and revenue per report
- **Product expansion:** Beyond books — documentaries, equipment, merchandise relevant to case files
- **Cover image quality:** Some Amazon image service covers are low-res or wrong edition; consider storing verified cover images in Supabase Storage
- **Seasonal/promotional rotation:** Feature timely books (e.g., new Roswell book releases, anniversary editions)
- **Affiliate compliance monitoring:** Regular ASIN audits, link health checks, Amazon Associates program compliance

**Touches other sessions:** Session 6a (book data seeded per case file), Session 6b (automated book suggestion for ingested reports — future), Subscription (potential Pro-only book lists), Foundation (Layout.tsx footer disclosure)

---

### 15. AI Experience & Intelligence (DEPLOYED — Live on Production)

**Scope:** RAG pipeline, vector embeddings, semantic search, pattern detection, conversational AI, all AI-powered features across the platform.

**Key files (new — Session 15):**
- `supabase/migrations/20260320_vector_embeddings.sql` — pgvector tables, HNSW index, search_vectors RPC
- `src/lib/services/embedding.service.ts` — Core embedding pipeline (chunk, embed, store, search)
- `src/lib/services/ai-pattern-detection.service.ts` — Geographic, temporal, similarity pattern detection
- `src/pages/api/admin/ai/embed.ts` — Admin embedding trigger endpoint
- `src/pages/api/ai/search.ts` — Semantic search API
- `src/pages/api/ai/patterns.ts` — Pattern detection API
- `src/pages/api/ai/featured-patterns.ts` — Homepage AI preview (Session 7 Phase 2)
- `src/pages/api/ai/related.ts` — Search enrichment (Session 7 Phase 3)
- `src/pages/api/ai/report-similar.ts` — Per-report vector similarity
- `src/pages/api/ai/chat.ts` — **REWRITTEN** with RAG pipeline + source citations

**Key files (existing, unchanged):**
- `src/components/AskTheUnknown.tsx` — Floating AI chat button (MODIFIED: citation parsing + Sources footer for RAG responses)
- `src/components/reports/ReportAIInsight.tsx` — Per-report AI analysis section
- `src/lib/services/report-insights.service.ts` — AI analysis generation (hash-based caching, DB-grounded)
- `src/lib/services/ai-insights.service.ts` — Claude-powered pattern narratives

**Database tables (new):** `vector_chunks` (pgvector), `embedding_sync`, `ai_featured_patterns`

**Current state (March 20, 2026) — DEPLOYED AND LIVE:**
- **P0 DEPLOYED:** Vector embedding pipeline. pgvector migration executed. ~900 reports fully embedded, ~1,150/4,792 phenomena embedded (remaining rate-limited, safe to re-run).
- **P1 DEPLOYED:** Semantic search API at `/api/ai/search`. Confirmed working ("Roswell crash debris" → 66.5% match).
- **P2 DEPLOYED:** Pattern detection (geographic clusters, temporal spikes, phenomena similarity). API at `/api/ai/patterns`.
- **P3 DEPLOYED:** RAG-powered chat. Embeds query, retrieves top-8 chunks, injects into Claude context. Anti-hallucination rules. Source citations with `[slug:x]` format.
- **P4 DEPLOYED:** Integration endpoints for Session 7 (featured patterns, related search, report similarity).
- **3 commits on main:** `e06c977` (main pipeline), `09b3df7` (column name fix), `158443d` (phenomena column fix).
- **Column name discoveries:** `reports` uses `location_name` (not `location`), `phenomenon_type_id` (not `phenomenon_type`). `phenomena` has no `subcategory` column.

**Remaining work in this session:**
- Finish embedding remaining ~3,600 phenomena (re-run with staggered batches to avoid OpenAI rate limits)

**What still needs work (future sessions):**
- Incremental embedding hooks (auto-embed on report insert/update)
- ~~AskTheUnknown UI: parse `[slug:x]` citation format into clickable links~~ ✅ DONE (March 20) — `renderMarkdown()` parses citations, Sources footer for RAG responses
- ~~Session 7 homepage wiring: consume `/api/ai/featured-patterns`~~ ✅ DONE (March 20) — `AIPreview.tsx` on homepage
- ~~Session 7 search wiring: consume `/api/ai/related`~~ ✅ DONE (March 20) — Related Patterns in search results
- Streaming chat responses for better UX
- Conversation memory (multi-session)
- Skeptic/believer mode toggle

**Touches other sessions:** Session 7 (homepage AI preview, search enrichment — **UNBLOCKED**), Session 5 (Research Hub AI), Session 4 (complements pattern detection), Session 6a/6b (report similarity), Session 10 (new reports must be embedded after ingestion), Foundation (OPENAI_API_KEY env var)

---

### 7. Search, Navigation & Homepage

**Key files:**
- `src/pages/index.tsx` — Homepage (4 sections: Hero, Four Pillars, Discover Preview, Get Started CTA + PWA install)
- `src/pages/search.tsx` — Full-text search page
- `src/pages/api/search/fulltext.ts` — Full-text search API
- `src/components/Layout.tsx` — Global navigation
- `src/components/Navigation*.tsx` — Navigation components
- `src/components/NavigationHelper.tsx` — Breadcrumbs
- `src/components/OnboardingTour.tsx`, `WelcomeOnboarding.tsx`, `ThreeTapOnboarding.tsx`
- `src/pages/about.tsx`

**Database:** `search_vector` column, full-text search indexes, `featured_investigations` (data owned by Session 6a, layout owned by Session 7)

**Current state (March 19 Session 7 update):**
- Homepage hero A/B tested (5 variants), search bar enhanced with quick-search tags, Quick Links removed, SEO + JSON-LD added
- Search page rewritten: fulltext API with ts_rank ranking (was ILIKE), autocomplete on phenomena, keyword/phrase toggle
- Onboarding consolidated: `UnifiedOnboarding.tsx` replaces WelcomeOnboarding + ThreeTapOnboarding
- **UX Audit completed (v4 approved):** Three-lens audit (UX, Engagement, Vision) produced 20-item phased plan. See `Paradocs_UX_Audit_Plan.docx` and `HANDOFF_SEARCH_NAV.md`.

**Approved revision plan (four pillars: Database + AI + Dashboard + Discover):**
- **Phase 1 (this week):** Mobile search icon, replace legacy stats, hide placeholder Trending Patterns
- **Phase 2 (next 2 weeks, BLOCKED on AI Experience session):** Hero redesign around four pillars, AI intelligence preview, dashboard preview, four-pillar "What Is Paradocs?" section, Discover feed preview on homepage
- **Phase 3 (month 2):** AI-powered search results ("Related Patterns"), search highlighting, Save Search, notification bell, nav scaling for 5M+ reports

**Phase 1 SHIPPED (March 19):** Mobile search icon in Layout.tsx, legacy stats replaced (4,792 encyclopedia / 20+ investigations / 11 categories), TrendingPatternsWidget hidden.

**Session sequence:**
1. ~~Session 7 Phase 1~~ — SHIPPED (March 19)
2. ~~AI Experience & Intelligence (Session 15)~~ — SHIPPED (March 20): RAG pipeline, vector embeddings, pattern detection, conversational AI
3. ~~Session 7 Phase 2~~ — SHIPPED (March 20): Four new homepage components, A/B variants updated, section consolidation
4. ~~Session 7 Phase 3~~ — SHIPPED (March 20): AI search results, Save Search, NotificationBell, Ask AI nav, Stories rename, launch stats

**ALL PHASES COMPLETE + PWA INSTALL PROMPT.** Homepage: 4 clean sections with PWA install prompt in Get Started CTA. Service worker deployed (public/sw.js) — satisfies Chrome installability. useInstallPrompt hook handles Android/iOS/desktop detection. App icon P gradient updated to #9000F0 brand purple, all 8 PNG sizes regenerated.

**Touches other sessions:** ALL sessions (service worker is Foundation-level — all pages now cached by SW), Session 13 (mobile install prompt), Foundation (sw.js + _app.tsx SW registration)

---

### 8. Subscription & Monetization

**Key files:**
- `src/pages/dashboard/subscription.tsx` — Billing management
- `src/pages/api/subscription/` — create-checkout, billing-portal, cancel, tiers
- `src/pages/api/webhooks/stripe.ts` — Stripe webhook handler
- `src/lib/subscription.ts` — Tier logic
- `src/lib/hooks/useSubscription.ts`
- `src/components/PaywallGate.tsx`, `dashboard/FeatureGate.tsx`, `dashboard/UpgradeCard.tsx`, `dashboard/TierBadge.tsx`, `dashboard/UsageMeter.tsx`
- `src/components/CancellationFlow.tsx`

**Database tables:** `subscriptions`, `profiles` (tier fields)

**Current state:** Tier system exists (free/basic/pro/enterprise). Paywall gate component built. Stripe webhook handler exists. STRIPE_SECRET_KEY NOT YET PROVIDED (blocking).

**What needs work:**
- **BLOCKED:** Chase needs to provide STRIPE_SECRET_KEY
- Complete Stripe checkout flow
- Billing portal integration
- Cancellation flow with retention offers
- Trial period implementation
- Usage metering accuracy
- Pricing page / marketing
- Revenue analytics

**Touches other sessions:** Dashboard (subscription tab, usage meter, tier badge), All features (PaywallGate/FeatureGate integration), Email (billing-related emails), Admin (subscription analytics)

---

### 9. Email & Engagement

**Key files:**
- `src/pages/api/cron/weekly-digest.ts` — Weekly digest
- `src/pages/api/cron/email-drip.ts` — Onboarding drip
- `src/pages/api/cron/smart-alerts.ts` — Smart notifications
- `src/pages/api/cron/winback.ts` — Re-engagement
- `src/lib/services/digest.service.ts` — Digest generation
- `src/lib/services/email.service.ts` — Resend integration
- `src/pages/api/user/digests.ts` — User digest preferences
- `src/pages/api/beta-signup.ts` — Email capture

**Current state:** Weekly digest built (Resend). Cron endpoints for drip, alerts, winback exist. Email service operational.

**What needs work:**
- Email template design and branding
- Drip campaign content creation
- Smart alert algorithm tuning
- Winback sequence design
- Engagement metrics tracking
- Unsubscribe flow
- Email deliverability optimization
- A/B testing of email subject lines

**Touches other sessions:** Dashboard (digest preferences), Insights (pattern alerts), Subscription (billing emails), Explore (personalized content selection for digests)

---

### 10. Data Ingestion & Pipeline

**Key files:**
- `src/lib/ingestion/` — engine.ts, types.ts, dedup.ts, adapters/ (8 sources), filters/, utils/
- `src/pages/api/admin/ingest.ts`, `batch-import.ts`
- `src/pages/api/cron/ingest.ts`
- `scripts/` — 41+ CLI tools for import, backfill, cleanup
- `docs/DEVELOPMENT_STRATEGY.md` — Pipeline architecture

**Database tables:** `reports`, `ingestion_logs`

**Current state:** Pipeline locked in and tested on ~2,500 reports. 8 source adapters (NUFORC, BFRO, Reddit, NDERF, IANDS, Ghosts of America, Shadowlands, Wikipedia). Quality filter, dedup, title improvement, location parsing. ~900 approved reports currently live (TEST DATA — will be re-ingested through final pipeline). ~2M Reddit reports ingested but hidden (development data — will be deleted entirely).

> **STATUS CHANGE (March 20):** Mass ingestion is now UNBLOCKED. Encyclopedia enrichment and curated editorial content are parallel tracks, not prerequisites. See revised Critical Sequencing section.

**What needs work (Priority Order):**
1. **Data cleanup:** Delete ~2M hidden Reddit dev data. Re-ingest ~900 existing approved reports through final pipeline (or delete and replace).
2. **Source adapter expansion** (aggregate everything legally available):
   - YouTube: video metadata, transcripts, comments (paranormal channels, witness testimony, documentary clips)
   - Erowid: trip reports (consciousness, DMT entities, altered states)
   - MUFON: case files (if API/scraping access available)
   - Podcast transcripts: major paranormal podcasts (Coast to Coast, Mysterious Universe, etc.)
   - News articles: mainstream and alternative coverage of paranormal events
   - Academic papers: parapsychology journals, consciousness studies
   - Government documents: AARO, Project Blue Book, FOIA releases
   - Forums: AboveTopSecret, Phantoms & Monsters, specialized communities
   - Reddit: fresh ingestion through final pipeline (replace deleted dev data)
   - Books: public domain and fair-use excerpts
3. **Mass ingestion run** — target 1M+ for closed beta, 5M+ for public launch
4. **Post-ingestion embedding** — embed all new reports into pgvector (Session 15 pipeline). ~$500-600 for 5M reports.
5. Pipeline monitoring and error alerting
6. Automated scheduled ingestion (cron optimization)
7. Content viability checks at scale

**Touches other sessions:** AI Experience (new reports must be embedded after ingestion), Map (location quality + geocoding at scale), Reports (report quality), Search (searchable content), Insights (more data = better patterns), Encyclopedia (phenomena linking after ingestion)

---

### 11. Admin & Operations

**Key files:**
- `src/pages/admin/` — index, ab-testing, media-review
- `src/pages/api/admin/` — 25+ endpoints for batch operations
- `src/components/admin/` — StatsCard, SourceHealthGrid, ActivityFeed
- `src/pages/api/ab/track.ts`, `report.ts`
- `src/lib/ab-testing.ts`
- `src/pages/analytics.tsx`, `src/pages/api/analytics/enhanced.ts`

**Current state:** Admin dashboard with stats. A/B testing framework. Media review page. Batch operation endpoints. Public analytics page.

**What needs work:**
- Admin dashboard comprehensiveness (cover all operations)
- Content moderation workflow
- A/B test management UI
- Analytics depth (funnels, retention, cohorts)
- Error monitoring and alerting
- Database health monitoring
- Automated quality audits

**Touches other sessions:** All sessions (admin manages all features), Ingestion (admin triggers), Subscription (revenue dashboard)

---

### 12. Foundation & Infrastructure

**Key files:**
- `src/pages/_app.tsx`, `_document.tsx` — App wrapper
- `src/lib/supabase.ts` — Client config
- `src/lib/database.types.ts` — TypeScript types
- `src/lib/constants.ts`, `utils.ts`
- `src/styles/globals.css` — Tailwind + custom CSS
- `supabase/migrations/` — 30 migration files (includes 20260311_research_hub_constellation_v2.sql)
- `next.config.js`, `tailwind.config.js`, `tsconfig.json`
- `DEPLOYMENT.md`, `SECURITY.md`
- `src/pages/auth/callback.tsx`, `src/pages/login.tsx`

**Current state:** Next.js 14 Pages Router. Supabase with RLS. Vercel deployment (auto-deploy). Auth working.

**What needs work:**
- Performance optimization (Core Web Vitals)
- Database schema optimization (indexes for new queries)
- Auth flow improvements
- RLS policy audit
- Error boundary implementation
- Shared component library cleanup
- TypeScript strictness improvements
- CI/CD pipeline (tests, linting)
- Mobile responsiveness audit
- Accessibility (a11y) audit
- Security hardening

**Touches other sessions:** ALL sessions (foundation changes affect everything). Extra care needed — coordinate via Cross-Feature Notes.

---

### 13. Mobile-First Design System

**Key files:**
- `SESSION_PROMPT_MOBILE.md` — Full session prompt with startup instructions, design philosophy, three-phase plan
- `HANDOFF_MOBILE.md` — Current mobile state documentation, known issues, tech stack notes
- `src/components/dashboard/DashboardLayout.tsx` — Mobile header, hamburger menu, safe area handling
- `src/components/dashboard/research-hub/BoardView.tsx` — CSS-only responsive layout (sm:hidden / hidden sm:grid)
- `src/components/dashboard/research-hub/ArtifactDetailDrawer.tsx` — Full-screen mobile drawer, enlarged back button
- `src/components/dashboard/research-hub/ResearchHub.tsx` — overflow-x-hidden, overscroll-behavior containment
- `src/pages/dashboard/index.tsx` — Extensive overflow/truncation mobile fixes
- All other page and component files across sessions (cross-cutting concern)

**Database tables:** None (CSS/UX only)

**Current state (March 20, 2026):**
- **Phase 1-2 COMPLETE:** Design tokens (spacing.touch, spacing.nav, slide animations), 4 reusable mobile components (MobileBottomTabs, MobileBottomSheet, MobileHeader, MobileCardRow), CSS utilities in globals.css. DashboardLayout rewritten — hamburger menu removed, MobileBottomTabs added. ViewSwitcher mobile labels visible.
- **Phase 3a COMPLETE:** Report detail mobile redesign — reading progress bar bug fix, mobile back button, non-sticky action bar on mobile, native share (`navigator.share`), responsive typography, content spacing.
- **DISCOVERED:** Dual layout architecture — Layout.tsx (public pages) has its own completely different mobile bottom nav from DashboardLayout's MobileBottomTabs. Nav unification is next priority.
- PUT /api/research-hub/artifacts/[id] endpoint created (was missing)

**What needs work:**
- ~~Quick fix: Reading progress bar~~ ✅ (h-[3px] → h-1.5, March 15)
- ~~Nav unification~~ ✅ (MobileBottomTabs unified across Layout.tsx + DashboardLayout, March 15)
- **Phase 3 remaining screens:** ~~Dashboard home~~ ✅, ~~Explore feed~~ ✅, ~~Map page~~ ✅, ~~ArtifactDetailDrawer→bottom sheet~~ ✅, ~~ArtifactQuickAdd→bottom sheet~~ ✅. Remaining: Constellation touch controls, Journal, Search, Settings (lower priority)
- **Stories rename (March 20):** MobileBottomTabs FAB comment updated from "Discover" to "Stories" to match Session 7 desktop nav rename. Route unchanged (`/discover`).

**Touches other sessions:** ALL sessions — mobile design system is cross-cutting. Especially Dashboard (navigation shell), Reports (40K+ line detail page mobile audit), Map (touch interactions), Explore (feed card mobile layout), Search (mobile search UX), Foundation (shared components, globals.css)

---

## Cross-Feature Notes

> **Instructions:** When a session makes a change that affects another feature, add a dated note here. The affected session checks this section on startup.

| Date | Source Session | Note | Affects |
|------|--------------|------|---------|
| 2026-03-20 | Search & Nav (7) | **PWA INSTALL PROMPT + SERVICE WORKER + APP ICON UPDATE.** Service worker deployed at `public/sw.js` (cache-first static, network-first pages, skip API/auth). Registered in `_app.tsx`. `useInstallPrompt` hook detects Android beforeinstallprompt, iOS Safari, standalone mode, desktop. `InstallPrompt` component shows mobile-only "Add to home screen" in homepage Get Started section. App icon SVG gradient updated from old purples to brand #9000F0 scale (#c084fc/#9000f0/#6500a8), all 8 PNG icons regenerated. | **ALL sessions (FOUNDATION-LEVEL: service worker now exists — all pages cached by SW)**, Session 13 (mobile PWA install experience), Foundation (_app.tsx modified, public/sw.js added, all icons regenerated) |
| 2026-03-20 | Search & Nav (7) | **NATIVE APP WRAPPER ADDED TO LAUNCH PATH.** Capacitor wrapper for iOS App Store + Google Play Store added as step 5 in critical launch path (after Stripe, before closed beta). Wraps existing Next.js web app in native shell. Subscriptions route to Stripe web checkout via system browser — zero Apple/Google commission in US (Epic v. Apple ruling, May 2025). Push notifications via native APIs. Closed beta will use TestFlight (iOS) + internal testing track (Android). Estimate: 1-2 dedicated sessions. Full spec in HANDOFF_SEARCH_NAV.md "Native App Wrapper" section. | Session 8/Subscription (Stripe web checkout must work for in-app-to-web payment flow), ALL sessions (native app wrapper touches every page via WebView), Foundation (Capacitor project scaffolding) |
| 2026-03-20 | Search & Nav (7) | **SECTION-BY-SECTION OPTIMIZATION.** Each homepage section individually audited through AllTrails/Ancestry lens. Hero: social proof badge removed (restore at 1K+ users), 4-stat grid collapsed to single trust line, 7+ dead API calls removed, file 1135→168 lines. Four Pillars: title/subtitle removed, CTAs rewritten as action verbs ("Search the database"/"Uncover patterns"/"Build a case file"/"Start swiping"), Pro badge softened, bridge label "Four ways to explore" added. Discover Preview: emoji thumbnails removed, cards redesigned as text-forward (category + title + first sentence + location), Play hover removed, bridge label "From the database" added, 241→126 lines. Bottom CTA: newsletter email capture replaced with account creation ("Create free account" → /login + "Browse without an account" → /explore). | ALL sessions (homepage completely rewritten, newsletter form removed), Session 8/Subscription (account creation is now the homepage conversion action) |
| 2026-03-20 | Search & Nav (7) | **HOMEPAGE CLEANUP: 14 sections cut to 4.** Hero (search-forward, removed dual CTAs + quick-search tags + tour CTA), Four Pillars (tightened copy), Discover Preview (product taste), Email Capture (clean, no Submit CTA). Removed from render but components preserved: AIPreview, Featured Investigation (Roswell), secondary stories, More Investigations, Categories Grid, Recent Reports, Encyclopedia, DashboardPreview, Continue Your Research, inline email, Submit CTA. All removable sections can be restored by re-adding JSX in index.tsx. No component files deleted. | Session 6a (Featured Investigation hidden until 4+ investigations exist), Explore (categories section removed from homepage but /explore unchanged), Dashboard (DashboardPreview hidden, Four Pillars card covers it), ALL sessions (homepage structure dramatically simplified) |
| 2026-03-20 | **PM Session** | **STRATEGIC SHIFT: Encyclopedia and curated editorial content are NO LONGER launch blockers.** The old A→B→C waterfall (encyclopedia complete → curated reports → mass ingestion) has been replaced. Mass ingestion is now UNBLOCKED. The four pillars (Database Scale, AI Intelligence, Research Dashboard, Stories Feed) are the MVP. Encyclopedia enrichment and curated editorial content continue as parallel value-adds. Data cleanup: ~2M Reddit dev data will be deleted entirely; ~900 test reports will be re-ingested through final pipeline. Launch path: data cleanup → mass ingestion → embedding → Stripe/subscription → closed beta (2 weeks) → public launch. | **ALL sessions** — especially Session 10 (now on critical path), Session 6b (now unblocked), Session 1 (no longer a blocker), Session 6a (no longer a blocker), Session 8 (Stripe key now on critical path) |
| 2026-03-20 | Search & Nav (7) | **FULL COLOR SYSTEM OVERHAUL.** Primary palette in tailwind.config.js shifted from indigo (#5B63F1, H:236°) to brand purple (#9000F0, H:271°). Full 50-950 scale replaced. 37 hardcoded inline color references updated across 13 source files (#5b63f1→#9000f0, #4f46e5→#7a00cc, rgba(91,99,241)→rgba(144,0,240)). Logo period set to #9000F0 on all 6 instances. Accent gradient: purple→pink (#9000f0→#f472b6). Design brief v3 documents full deployed palette. **Every Tailwind primary-\* class across the entire app now renders purple.** | ALL sessions (global color change — buttons, links, badges, focus rings, gradients all shifted from indigo to purple), Foundation (tailwind.config.js modified), Session 13 (mobile nav inherits new colors), Session 5 (dashboard inherits), Session 6a (report page inline styles updated) |
| 2026-03-21 | Explore & Discovery (2) | **Phase 2: Mixed content Stories feed DEPLOYED.** `/api/discover/feed-v2` now serves phenomena + reports (was phenomena-only). Three card templates in `DiscoverCards.tsx` (PhenomenonCard, TextReportCard, MediaReportCard). Framer Motion horizontal swipe for related content (consumes Session 15 RAG APIs: `/api/ai/report-similar`, `/api/ai/related`). Completion milestone toasts at 25/50/75%. Old feed API preserved. `discover.tsx` fully rewritten. | Session 15 (RAG APIs now consumed by Stories feed), Foundation (first Framer Motion usage), All sessions (Stories feed now shows reports, not just phenomena) |
| 2026-03-20 | Mobile Design (13) | **MobileBottomTabs FAB label renamed "Discover" → "Stories"** to match Session 7's desktop nav rename. Route unchanged (`/discover`). Component comment updated. | Explore (label change only, no functional change), All sessions (mobile nav label updated) |
| 2026-03-20 | Dashboard (5) | Desktop header bell icon in DashboardLayout.tsx replaced with Session 7's functional `<NotificationBell />` component. Static `<button>` with hardcoded purple dot removed. | Search & Nav (Session 7 component now used on both mobile and desktop headers) |
| 2026-03-20 | Search & Nav (7) | **Session 7 ALL PHASES COMPLETE.** Phase 1: mobile search icon, real stats, hidden placeholders. Phase 2: FourPillars, AIPreview, DashboardPreview, DiscoverPreview components on homepage; A/B variants updated for AI+scale messaging; section consolidation 9→6; inline email capture; freshness signals. Phase 3: AI Related Patterns in search results (fetches /api/ai/related); Save Search + Get Alerts soft-wall; NotificationBell component (replaces non-functional bell in DashboardLayout); "Ask AI" nav item replacing "Insights"; "Discover" renamed to "Stories"; header search hidden on /search; AI gradient stat badge. Desktop nav now: Explore, Map, Encyclopedia, Ask AI, Stories. | ALL sessions (nav changed globally), Session 13 (mobile nav — "Stories" label should be coordinated), Session 5 (Dashboard — NotificationBell replaces bell buttons), Session 15 (AI — /api/ai/related and /api/ai/featured-patterns now consumed by homepage+search) |
| 2026-03-20 | AI Experience (15) | **AskTheUnknown citation parsing DEPLOYED.** `AskTheUnknown.tsx` modified: `renderMarkdown()` now parses `[slug:x]` citations from RAG chat into clickable report/phenomena links using `sources` metadata from API. RAG responses show a "Sources:" footer with deduplicated links. | Explore (AskTheUnknown.tsx modified), Reports (inline links to report pages from chat) |
| 2026-03-20 | AI Experience (15) | **RAG pipeline, semantic search, pattern detection, and integration endpoints BUILT.** New DB migration: `20260320_vector_embeddings.sql` (pgvector, vector_chunks, embedding_sync, ai_featured_patterns, search_vectors RPC). New service: `embedding.service.ts` (chunk, embed, search). New service: `ai-pattern-detection.service.ts` (geographic clusters, temporal spikes, phenomena similarity). New endpoints: `/api/ai/search` (semantic), `/api/ai/patterns`, `/api/ai/featured-patterns` (homepage), `/api/ai/related` (search enrichment), `/api/ai/report-similar`. `/api/ai/chat` REWRITTEN with RAG (embeds query, retrieves top-8 chunks, injects into Claude context, returns source citations). Admin endpoint: `/api/admin/ai/embed` for bulk/incremental embedding. **DEPLOYMENT STEPS:** (1) Run SQL migration, (2) Set OPENAI_API_KEY in Vercel, (3) Run initial embedding. Session 7 Phase 2 is now UNBLOCKED for AI features. | Session 7 (homepage AI preview at /api/ai/featured-patterns, search enrichment at /api/ai/related), Session 5 (Research Hub can use /api/ai/search), Session 4 (complements pattern detection), Session 6a/6b (report similarity at /api/ai/report-similar), Session 10 (must embed new reports after ingestion), Foundation (OPENAI_API_KEY env var needed, SQL migration) |
| 2026-03-19 | Search & Nav (7) | **Phase 1 SHIPPED + AI Experience session QUEUED.** Mobile search icon in Layout.tsx header, legacy stats replaced (4,792/20+/11), TrendingPatternsWidget hidden. AI Experience & Intelligence session is NEXT in the approved sequence. Data context: ~900 approved reports are test data only (will be replaced by mass ingestion). Curated collections (Roswell, Rendlesham) are real. Encyclopedia still being enriched (only Cryptids mostly done). AI system must support incremental re-embedding for encyclopedia updates. Session 7 Phase 2 resumes after AI session delivers RAG pipeline + pattern APIs. | AI Experience (immediate next session), Session 7 (Phase 2 blocked), ALL sessions (four-pillar vision is approved product direction) |
| 2026-03-19 | Search & Nav (7) | **UX Audit v4 APPROVED (four-pillar vision).** Three-lens audit (UX/Engagement/Vision) produced 20-item phased plan. Key findings: (1) homepage leads with editorial, not the four pillars (Database 5M+, AI Intelligence, Research Dashboard, Discover Feed); (2) mobile has no search; (3) AI layer completely invisible; (4) Discover feed hidden behind ambiguous nav link; (5) legacy 258K stats will be deleted. Phase 1 (trust/access) ready to ship. Phase 2 (hero redesign, AI preview, dashboard preview) BLOCKED on AI Experience session delivering RAG pipeline + pattern APIs. See `Paradocs_UX_Audit_Plan.docx`. | ALL sessions (vision alignment), AI Experience (critical dependency for Phase 2-3), Explore (Discover feed preview planned for homepage), Dashboard (preview card planned for homepage) |
| 2026-03-19 | Search & Nav (7) | **Homepage + Search + Onboarding overhaul.** Homepage hero rewritten for cold-traffic comprehension, search bar enhanced with quick-search tags, redundant Quick Links removed. Search page rewritten to use `fulltext_search` RPC (was ILIKE), autocomplete added (phenomena table), search mode toggle. SEO meta tags + JSON-LD added. Onboarding consolidated: `UnifiedOnboarding.tsx` replaces WelcomeOnboarding + ThreeTapOnboarding. `explore.tsx` import updated. Layout.tsx minor search bar CSS. See `HANDOFF_SEARCH_NAV.md`. | Explore (explore.tsx onboarding import changed), Foundation (Layout.tsx minor CSS), All sessions (homepage structure changed, Quick Links section removed) |
| 2026-03-19 | Report Experience (6a) | **Rendlesham Forest cluster DEPLOYED + homepage "More Investigations" row + badge redesign + credibility rationale feature.** Rendlesham (6 reports, case_group rendlesham-1980) is second curated case cluster. Homepage `index.tsx` modified: added secondary discovery card grid below hero for additional Featured Investigations. Report `[slug].tsx` modified: badge system redesigned (category badge removed, "Featured Investigation" badge added, "Notable Case" filtered), credibility badge now tappable/expandable with rationale. `FormattedDescription.tsx` modified: pull quote extraction hardened. `MediaGallery.tsx` modified: audio wiki URL fix + new source labels. `ReadingProgress.tsx`: 2px→4px. New DB column: `reports.credibility_rationale`. | Explore/Homepage (index.tsx modified), Foundation (FormattedDescription, MediaGallery, ReadingProgress modified), Session 14 (8 new books across Rendlesham reports), All sessions (credibility rationale pattern for all future reports) |
| 2026-03-18 | Report Experience (6a) | **Session split: 6a (Curated Content) + 6b (Ingestion & Scale) + 14 (Affiliate).** Session 6 split into three sessions. 6a owns handcrafted case files, editorial enrichment, Featured Investigations curation. 6b (not started) will own ingestion-generated reports, quality templates, automated enrichment. Session 14 owns Amazon affiliate book recommendations, ASIN curation, compliance, revenue optimization. | All sessions (session registry updated), Ingestion (6b dependency), Subscription (14 potential Pro book lists) |
| 2026-03-18 | Report Experience (6a) | **Featured Investigations + Book Recommendations deployed.** `featured_investigations` table created (editorial curation for homepage hero). `report_books` table created (Amazon affiliate). Homepage `index.tsx` modified (editorial data with spotlight fallback). `FurtherReading.tsx` component added to `report/[slug].tsx`. `Layout.tsx` footer updated with FTC disclosure. 16 books across 10 reports, all ASINs verified. Roswell seeded as first featured investigation. | Explore/Homepage (index.tsx modified, new API), Foundation (Layout.tsx footer, new DB tables), Subscription (affiliate revenue tracking), Session 14 (owns expansion) |
| 2026-03-18 | Report Experience (6a) | **Roswell content enrichment COMPLETE.** All 14 reports enriched to 4,000-12,500 chars with engagement hooks, dramatic pacing, and pull quotes. Government documents (GAO, FBI Vault, NSA) and ABC News 1947 audio added as media. Brazel duplicate images fixed. All descriptions researched against documented sources with explicit uncertainty and attribution. | All sessions (Roswell cluster is now the quality bar for Phase B), Session 6b (quality templates should match this standard) |
| 2026-03-16 | Map & Geospatial | **Phase 3 partial: Map Spotlight placeholder cards on Explore page.** `MapSpotlightRow.tsx` with 5 hardcoded cards rendering as 2nd row in Discover feed (after Encyclopedia Spotlight). Cards sized to match Encyclopedia Spotlight (`min-w-[75vw]`, `h-44`). Deep-links to `/map` with filter params. Cards flagged as placeholder data — must be replaced with dynamic cards post-ingestion. | Explore (new row in Discover feed, `explore.tsx` modified), Ingestion (cards need real report counts + thumbnails post-ingestion) |
| 2026-03-16 | Map & Geospatial | **Phase 2 COMPLETE: Timeline slider, basemap toggle, bottom sheet UX.** Timeline slider (1400–2026) with era presets (All Time, Pre-Modern, 1900–1950, 1950–2000, 2000+) and decade histogram. Basemap toggle (dark/satellite/terrain). Bottom sheet: raised above nav, pull-down-to-dismiss from scrolled content, enlarged touch targets. Phase 3 (Map Spotlight cards, deep-link URLs, encyclopedia map links) deferred to post-ingestion. | Explore (Map Spotlight cards planned for Phase 3 post-ingestion), Mobile Design (bottom sheet pull-to-dismiss pattern reusable) |
| 2026-03-18 | Report Experience | **On-demand ISR revalidation endpoint.** `/api/admin/revalidate` — POST array of paths to force Next.js ISR page cache refresh. Use whenever DB data changes (media, descriptions, etc.) and pages need to reflect updates immediately. Also: `report-insights.service.ts` now uses hash-based caching and DB-grounded Similar Cases (anti-hallucination). `FormattedDescription.tsx` pull quote attribution regex rewritten with `NOT_NAMES` blocklist. `ArticleTableOfContents.tsx` hooks violation fixed. `[slug].tsx` client-side navigation crash fixed (state clearing + stale-slug guard). All new report images stored in Supabase Storage (`report-media` bucket) — no external hotlinking. | Foundation (revalidation endpoint available for all sessions), All sessions (anti-hallucination pattern for AI features), Admin (new admin scripts: add-roswell-witnesses-2, add-roswell-media, store-roswell-media, fix-roswell-quotes, fix-roswell-captions) |
| 2026-03-16 | Map & Geospatial | **Phase 1 COMPLETE: MapLibre GL migration deployed.** Leaflet replaced with MapLibre GL + react-map-gl + Supercluster on `/map`. New `src/components/map/` directory with 8 components. MapTiler basemap (dataviz-dark, Flex plan). Heatmap layer, clustered markers, mobile bottom sheet with category stats, auto-fit to data bounds, locate me, URL-synced filters. `map.tsx` rewritten from 752 to ~220 lines. New env var `NEXT_PUBLIC_MAPTILER_KEY` required in Vercel. Mini-maps (PhenomenonMiniMap, PatternMiniMap) remain on Leaflet by design. | Foundation (4 new npm dependencies, new env var), Mobile Design (bottom sheet touch handling, controls positioning), Explore (Map Spotlight cards planned for Phase 3) |
| 2026-03-16 | Explore & Discovery | **Mobile UX optimized + Discover feed randomized.** Layout.tsx header modified (logo nowrap, Submit Report `hidden md:flex` secondary, Sign In pill button). MobileBottomTabs enlarged (Stories FAB 64px, nav icons 24px). AskTheUnknown FAB repositioned to `bottom-28` on mobile with AI presence CSS animations (globals.css). Explore page compacted (inline header, 75vw encyclopedia cards, compressed banners). Discover feed seed moved to component useRef (fresh order every visit). Feed API uses interleaved 3:1:1 explore-exploit tiering. | Mobile Design (bottom nav sizing changed), Foundation (Layout.tsx header + globals.css animations), Search & Nav (header structure changed), All sessions (AskTheUnknown FAB position changed) |
| 2026-03-15 | Explore & Discovery | **Anonymous feed + soft-wall prompts deployed.** Feed API (`/api/feed/personalized`) rewritten: returns Encyclopedia Spotlight (phenomena with images), category highlights (rotating), trending, recent for ALL users (not just authenticated). Explore Discover tab replaced empty state with rich editorial feed. Three soft-wall signup touchpoints: bookmark button, in-feed card after 2nd section, bottom CTA. Feed API response now includes `type` field ('reports' or 'phenomena'). Login redirect uses `?reason=save` for contextual messaging. | Search & Nav (login page should handle `reason` param), Encyclopedia (image quality affects spotlight), Email (digest could reuse feed sections), Dashboard (if consuming feed API), Subscription (tier gating plan documented in HANDOFF_EXPLORE.md) |
| 2026-03-15 | Mobile Design | **Nav Unification COMPLETE.** MobileBottomTabs rewritten as unified component used by BOTH Layout.tsx and DashboardLayout. Same 5 tabs on every page: Explore, Map, Discover FAB (elevated center), Library/Encyclopedia (auth-aware 4th tab), More. Layout.tsx mobile inline nav + slide-up menu + style jsx global all removed. Progress bar thickness fix (h-1.5). | Search & Nav (Layout.tsx mobile nav completely replaced — public mobile navigation now uses MobileBottomTabs), Foundation (Layout.tsx style jsx global removed), All sessions (mobile bottom nav is now unified across all pages) |
| 2026-03-15 | Mobile Design | Phase 3a: Report detail mobile redesign deployed (report/[slug].tsx). Progress bar bug fix, mobile back button, non-sticky action bar, native share, responsive typography. DISCOVERED dual layout architecture: Layout.tsx (public pages) has its own mobile bottom nav completely different from DashboardLayout's MobileBottomTabs. Nav unification is next priority — will modify Layout.tsx significantly. Discover page confirmed intentionally standalone (TikTok-like, no nav chrome). | Reports (report/[slug].tsx modified), Search & Nav (Layout.tsx nav unification upcoming, will change public mobile navigation), Foundation (globals.css already updated, Layout.tsx <style jsx global> needs migration) |
| 2026-03-14 | Mobile Design | Phase 1-2 deployed: Bottom tab bar replaces hamburger menu on mobile. 4 new components (MobileBottomTabs, MobileBottomSheet, MobileHeader, MobileCardRow) in src/components/mobile/. Design tokens added to tailwind.config.js (spacing.touch, spacing.nav, slide animations). Mobile CSS utilities added to globals.css. DashboardLayout rewritten: removed inline style jsx global, removed hamburger slide-from-right overlay. ViewSwitcher now shows labels on mobile. BoardView FABs repositioned above bottom tabs. | All dashboard sessions (new bottom tab bar changes mobile navigation pattern), Foundation (globals.css + tailwind.config.js updated), Dashboard (DashboardLayout.tsx rewritten, ViewSwitcher.tsx rewritten, ResearchHub.tsx header updated, BoardView.tsx FAB positioning) |
| 2026-03-11 | Encyclopedia | Cryptid category 100% complete. `ai_summary` field standardized to 150-350 chars for all cryptid entries. | Explore (feed cards), Search (index) |
| 2026-03-05 | Encyclopedia | All `ai_quick_facts` now populated (9-key JSONB). All `ai_history` >= 800 chars. | Report detail (quick facts display), Explore (filtering) |
| 2026-03-14 | Dashboard | Mobile CSS fixes: replaced JS viewport detection with CSS-only Tailwind responsive classes (eliminates hydration flash). Added overflow-x-hidden, overscroll-behavior containment, truncation across dashboard and Research Hub. Created PUT /api/research-hub/artifacts/[id] endpoint (was missing). Fixed X.com source duplication in ArtifactDetailDrawer. Expanded source types to 16+ (archive_org, academia, forum, government, tiktok, instagram, podcast, news, etc.). | Foundation (database.types.ts updated with 16+ source types, new DB CHECK constraint), All sessions (mobile layout pattern: use CSS-only responsive, never JS viewport detection) |
| 2026-03-14 | Dashboard | Session 13 (Mobile-First Design System) created with full session prompt and handoff doc. Cross-cutting mobile redesign modeled on Netflix/Uber/Spotify planned. | All sessions (Session 13 will touch every page for mobile optimization) |
| 2026-03-13 | Dashboard | Phase 3 External URL support deployed: extract-url.ts endpoint (7th API route), SourceLogos.tsx (13th component), twitter source type added to DB CHECK constraint + types. Uniform card heights. Branded SVG fallback thumbnails. | Foundation (database.types.ts updated with twitter type, new DB CHECK constraint), Ingestion (external URL signal table ready for pipeline integration) |
| 2026-03-11 | Dashboard | Research Hub deployed with multi-view architecture (Board/Timeline/Map/Constellation). 7 new DB tables (constellation_artifacts, constellation_case_files, etc.) with RLS. Nav link added to DashboardLayout. | Foundation (database.types.ts updated), Navigation (new sidebar link), Subscription (view-based tier gating planned) |
| 2026-02-26 | Dashboard | Dashboard rewritten as constellation-first research hub. Sidebar reorganized into Research/Library/Tools groups. | Navigation (sidebar links), Subscription (tier display) |

---

## Blocking Issues

| Issue | Blocks | Owner | Status |
|-------|--------|-------|--------|
| STRIPE_SECRET_KEY not provided | Subscription checkout flow (Session 8) — **on critical launch path** | Chase | Waiting |
| ~2M hidden Reddit dev data needs deletion | Clean database for mass ingestion | Session 10 | Pending — first task when Session 10 starts |
| ~900 approved test reports need re-ingestion or deletion | Clean database for mass ingestion | Session 10 | Pending — re-ingest through final pipeline |
| ~3,600 phenomena not yet embedded | Full semantic search coverage for encyclopedia | Chase | Re-run embed batches with staggered timing (see HANDOFF_AI_EXPERIENCE.md). NOT a launch blocker — improves search quality incrementally. |

---

## Sprint Roadmap (from Dev Handoff v3)

### Sprint 1 (Beta Launch) — MOSTLY COMPLETE
- 3-tap onboarding, AI-curated feed, immersive reading, frictionless saves, reactions, AI chat: ALL BUILT
- **Missing:** Collections (named save folders) — needs DB schema + UI

### Sprint 2 (Post-Launch) — PARTIAL
- Weekly digest, submission form, landing page: BUILT
- **Missing:** Connection cards, Smart match alerts, Stripe checkout (blocked)

### Sprint 3 (Month 2) — NOT STARTED
- Shareable story cards, cancellation flow, drift detection emails, researcher mode, email drip

### Sprint 4 (Month 3+) — MOSTLY NOT STARTED
- Embeddable widgets: BUILT
- **Missing:** A/B testing UI, community challenges, year in review, winback emails, advisory board, data drop events

---

## Content Targets

| Metric | Current | Closed Beta Target | Public Launch Target | Notes |
|--------|---------|-------------------|---------------------|-------|
| Mass-ingested reports | 0 | 1M+ | 5M+ | **CRITICAL PATH** — Session 10 builds expanded source adapters, runs mass ingestion |
| Curated editorial reports | 20 (Roswell 14 + Rendlesham 6) | 20+ | 40+ | Parallel track — not a launch blocker. Each new cluster (Skinwalker, Phoenix Lights, etc.) adds ~6-14 reports |
| Existing test reports | ~900 approved | Re-ingested or deleted | — | Must be cleaned before beta — re-run through final pipeline |
| Reddit dev data | ~2M (hidden) | Deleted | — | Delete entirely. Start fresh with expanded source list |
| Phenomena entries (encyclopedia) | 4,792 (208 fully enriched) | 4,792+ (500+ enriched) | 10,000+ | Parallel track — not a launch blocker. Basic entries sufficient for classification. Enrichment improves encyclopedia pages + semantic search |
| Source adapters | 8 | 12+ | 20+ | YouTube, Erowid, MUFON, podcasts, news, academic, govt docs |
| Reports embedded (pgvector) | ~900 | All ingested reports | All ingested reports | Scales with ingestion — ~$500-600 for 5M reports |

---

## Tech Debt & Known Issues

- `report/[slug].tsx` is 40K+ lines — needs componentization
- ~~Three separate onboarding components — consolidate~~ ✅ `UnifiedOnboarding.tsx` created (Session 7). Old `WelcomeOnboarding.tsx` and `ThreeTapOnboarding.tsx` still in codebase — safe to delete.
- SWC compatibility requires `var` + string concat (no template literals in JSX)
- Code pushes via GitHub API (no git CLI) — documented in SESSION_NOTES.md
- No CI/CD pipeline (no tests, no linting on push)
- No error monitoring service
- Mobile responsiveness gaps → **Session 13 created to address comprehensively**
- `/og-home.png` referenced in meta tags but doesn't exist yet — needs design (1200×630)

---

## Quick Reference

**Database:** Supabase project `bhkbctdmwnowfmqpksed`
**Deploy:** Auto on push to main via Vercel
**Push method:** `git push origin main` from local terminal (sandbox proxy blocks git CLI)
**SWC rules:** No template literals in JSX, use `var`, use `function(){}`, unicode escapes for smart quotes
**AI providers:** Anthropic Claude (primary), OpenAI (fallback, currently $0 balance)
**Email:** Resend
**Maps:** MapLibre GL + MapTiler (main map page), Leaflet (mini-maps only), Mapbox (server-side geocoding)
**Payments:** Stripe (key not yet provided)

---

*This document is the single source of truth for cross-session coordination. Keep it updated.*
