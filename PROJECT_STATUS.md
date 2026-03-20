# Paradocs — Project Status & Session Coordination

**Last updated:** March 18, 2026
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

## Critical Sequencing — DO NOT SKIP

Mass ingestion cannot happen until the foundation is right. The order matters:

**Phase A: Encyclopedia (the schema).** The 4,792 phenomena entries are the structural taxonomy that every report classifies against. All 11 categories need the full 7-field AI enrichment treatment completed to the same standard as the cryptid category (208/208 done). This defines what "good" looks like for phenomena content and ensures reports have a complete, high-quality taxonomy to classify into. Without this, mass ingestion produces unclassifiable or poorly organized data.

**Phase B: Perfect Reports (the quality bar).** The Roswell cluster and related curated witness entries are the gold standard — what a report should look like with the right balance of text content, rich media, and external links. These are still under development. They set the display standard, the data model expectations, and the UX patterns that every other report will follow. The current ~900 approved reports and ~2M hidden Reddit reports are essentially test data from pipeline development — most will need to be removed or re-ingested through the final pipeline.

**Phase C: Mass Ingestion (the scale).** Only after the encyclopedia is complete and the perfect reports establish the quality bar do you open the floodgates — YouTube, Erowid, MUFON, forums, podcasts, everything. At that point the taxonomy is locked, the quality standard is defined, and the pipeline knows what "good" looks like. Every report ingested will classify cleanly against the encyclopedia and display to the standard set by the curated reports.

**Current data status:** Existing site content is test data. The ~2M hidden Reddit reports are development data. Neither represents launch quality. The curated Roswell/witness cluster is the seed of what launch content will look like, but it's not finished yet.

**Design implications:** All feature sessions — especially Mobile-First Design and any UX work — must design for three content layers simultaneously: (1) the curated perfect reports and enriched encyclopedia content that will define launch quality, (2) the Research Hub and user-generated artifacts, where users add their own URLs, media, notes, case files, and connections across 16+ source types (YouTube, Reddit, Twitter/X, TikTok, podcasts, academia, government docs, etc.), and (3) the eventual scale of millions of aggregated reports. The dashboard is not a passive display — it's an active research workspace with multi-view architecture (Board/Timeline/Map/Constellation), artifact cards, detail drawers, quick-add flows, and external URL extraction. Mobile design must account for all of this interactive complexity, not just content browsing.

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
| 2 | **Explore & Discovery** | Personalized feed, category filters, content surfacing, recommendations | `HANDOFF_EXPLORE.md` | Active — Anonymous feed, soft-wall prompts, mobile UX optimized, Discover feed randomization |
| 3 | **Map & Geospatial** | MapLibre GL map, PostGIS queries, Supercluster, heatmap, bottom sheet | `HANDOFF_MAP.md` | Active — Phase 1 & 2 COMPLETE, Phase 3 partial. Deep-link URL params added (lat/lng/zoom) |
| 4 | **Insights & Pattern Analysis** | Pattern detection algorithms, AI narratives, skeptic mode, trending, methodology | `HANDOFF_INSIGHTS.md` | Not started |
| 5 | **User Dashboard & Constellation** | Dashboard home, constellation map (D3), research hub, journal, saved items, streaks, settings | `HANDOFF_DASHBOARD.md` | Active — Research Hub Phase 1-3 deployed, 16+ source types, mobile fixes applied |
| 6a | **Report Experience — Curated Content** | Handcrafted case files, editorial enrichment, Featured Investigations, curated media, book recommendations | `HANDOFF_REPORTS.md` | Active — 20 reports across 2 case clusters (Roswell 14 + Rendlesham 6), credibility rationales, badge redesign, homepage discovery row |
| 6b | **Report Experience — Ingestion & Scale** | Reports from mass ingestion pipeline, quality templates, automated enrichment, connection generation at scale | `HANDOFF_REPORTS_INGESTION.md` | Not started — blocked by Phase C (mass ingestion) |
| 7 | **Search, Navigation & Homepage** | Full-text search, site navigation, homepage layout/UX, onboarding flows, SEO | `HANDOFF_SEARCH_NAV.md` | Not started — Homepage has Featured Investigations hero + discovery row (added by 6a) |
| 8 | **Subscription & Monetization** | Stripe checkout, paywall, tier system, billing portal, cancellation | `HANDOFF_SUBSCRIPTION.md` | Not started |
| 9 | **Email & Engagement** | Weekly digests, drip campaigns, smart alerts, winback, notifications | `HANDOFF_EMAIL.md` | Not started |
| 10 | **Data Ingestion & Pipeline** | Source adapters, quality filters, dedup, bulk import, media extraction | `HANDOFF_INGESTION.md` | Not started |
| 11 | **Admin & Operations** | Admin dashboard, batch operations, cron jobs, A/B testing, monitoring | `HANDOFF_ADMIN.md` | Not started |
| 12 | **Foundation & Infrastructure** | Shared components, auth/RLS, database schema, deployment, performance, SEO | `HANDOFF_FOUNDATION.md` | Not started |
| 13 | **Mobile-First Design System** | Cross-cutting mobile UX: bottom tabs, bottom sheets, design tokens, screen-by-screen redesign | `HANDOFF_MOBILE.md` | Active — Phase 1-2 + 3a + Nav Unification deployed. Screen-by-screen redesign next. |
| 14 | **Amazon Affiliate & Revenue Content** | Book recommendations, ASIN curation, affiliate strategy, FTC compliance, revenue optimization | `HANDOFF_AFFILIATE.md` | Active — Foundation deployed (report_books table, FurtherReading component, 16 Roswell books). Expansion needed. |
| 15 | **AI Experience & Intelligence** | Ask the Unknown chat, AI report analysis, AI cross-referencing, AI search, AI voice/personality, provider management | `HANDOFF_AI.md` | Not started |

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

**What's next (PHASE A — blocks mass ingestion):**
- Enrich remaining categories beyond cryptids (UFOs, ghosts, etc.) with the full 7-field treatment (ai_description, ai_characteristics, ai_theories, ai_paradocs_analysis, ai_quick_facts, ai_summary, primary_regions)
- The encyclopedia serves as the structural taxonomy/schema — every ingested report classifies against it, so it must be complete and high-quality before mass ingestion begins
- Media enrichment (images for phenomena entries)
- Cross-link phenomena to reports more comprehensively

**Touches other sessions:** Discover (ai_summary affects feed cards), Search (content affects search results), Reports (phenomena links on report pages)

---

### 2. Explore & Discovery

**Key files:**
- `src/pages/explore.tsx` — Main discovery feed page (Discover + Browse tabs)
- `src/pages/discover.tsx` — TikTok-style fullscreen swipe feed (standalone, no nav chrome)
- `src/pages/api/discover/feed.ts` — Discover swipe feed API (seeded shuffle, quality tiering, category diversity)
- `src/pages/api/feed/personalized.ts` — Explore feed API (encyclopedia spotlight, trending, category highlights)
- `src/lib/services/personalization.service.ts` — User preference engine
- `src/components/CategoryFilter.tsx`, `SubcategoryFilter.tsx`, `PhenomenaFilter.tsx`
- `src/lib/hooks/usePersonalization.ts`
- `src/components/AskTheUnknown.tsx` — AI chat FAB (on explore + report pages)

**Database tables:** `reports`, `phenomena`, `saved_reports`, `user_preferences`

**Current state (March 16, 2026):**
- **Anonymous feed COMPLETE:** Rich 5-7 section editorial feed for all users (Encyclopedia Spotlight, Trending, Category Highlights, Recently Added). No empty states for logged-out users.
- **Soft-wall signup COMPLETE:** 3 contextual touchpoints (bookmark, in-feed card, bottom CTA). Research-backed: gate depth not breadth.
- **Mobile UX optimized (March 16):** Layout.tsx header fixed (logo nowrap, Submit demoted, Sign In pill button). Explore page compacted (inline title+toggle, larger encyclopedia cards at 75vw, compressed Pattern Insights banner). Ask the Unknown FAB repositioned above bottom nav with AI presence animations (rotating aurora border, breathing glow, sparkle micro-animation). MobileBottomTabs enlarged (Discover FAB 64px, nav icons 24px).
- **Discover feed randomization (March 16):** Seed moved from module scope to component useRef (fresh order every visit). API tier interleaving (3:1:1 explore-exploit pattern) replaces concatenated tiers. Users now see genuinely different content on each visit.

**What needs work:**
- Free tier content limits (e.g., 50 full reports/month)
- Core upgrade prompts when free users hit limit
- Save functionality for logged-in users (bookmark currently only gates anonymous)
- Feed personalization quality (A/B test section ordering, track engagement)
- "Connection cards" / "Did You Know?" cross-report relationships (Sprint 2, not built)
- Smart match alerts (Sprint 2, not built)
- Image fallback (onError handling for phenomena images that 404)

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

**Current state (March 14, 2026):**
- **Research Hub Phase 1 COMPLETE:** Multi-view architecture deployed. Board View (mobile-first default) with sidebar, case files, artifact cards, quick-add modal, detail drawer. Auth check with login redirect.
- **Research Hub Phase 2 COMPLETE:** Timeline View (decade/year/month/week zoom with case file color coding) and Map View (Leaflet with clustering, spatial insights, mobile bottom sheet) built and deployed.
- **Research Hub Phase 3 External URLs COMPLETE:** Full URL extraction pipeline with source auto-detection for 16+ source types (YouTube, Reddit, Twitter/X, TikTok, Instagram, podcast, news, Archive.org, academia, forum, government, blog, book, documentary, interview, and generic website). OG scraping, multi-source Reddit fallback chain, branded SVG logo fallbacks, manual thumbnail URL override, uniform card heights, action bar opacity toggle.
- **PUT /api/research-hub/artifacts/[id] CREATED:** Artifact update endpoint (verdict, user_note, tags, title, description). Was previously missing — useResearchHub hook was calling it but getting 405.
- **Mobile CSS fixes applied:** Replaced JS viewport detection with CSS-only Tailwind responsive classes (eliminates SSR hydration flash). Added overflow containment, truncation, responsive padding across dashboard and Research Hub.
- **Database migration LIVE:** 7 new tables with RLS policies, indexes, and backward-compatible migration from old constellation_entries. 16+ source types in CHECK constraint.
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

**What still needs work (Session 6a — Curated Content):**
- **Next curated case files:** Skinwalker Ranch, Phoenix Lights, Ariel School, etc. — each follows the Roswell/Rendlesham pattern (showcase + witness cluster + editorial enrichment + book recommendations + credibility rationales + YouTube videos + witness portraits)
- **Phenomenon type taxonomy cleanup (PM decision):** All 14 Roswell + 6 Rendlesham reports have `phenomenon_type` set to "Notable Case" — a placeholder. Need to add "Crash & Retrieval", "Military Encounter", etc. to `phenomenon_types` table. Badge display already filters "Notable Case" so this is data-quality only.
- Did You Know? cross-phenomenon connections need cross-category report data (Stargate Project etc.)
- `roswell-incident` stub report (382 chars, no case_group) — consider merging into the showcase or deprecating
- Migrate pre-session Roswell report images (DuBose, Marcel, Haut) from Wikimedia hotlinks to Supabase Storage
- Shareable story cards (viral share images) — post-ingestion
- Research Data Panel cross-referencing features — post-ingestion

**Touches other sessions:** Map (shared MapLibre/MapTiler stack, deep-link URL params), Subscription (Research Data Panel Pro-gated), Session 6b (quality bar templates for ingested reports), Session 14 (book recommendations, affiliate strategy), Ingestion (generate-connections ready for batch), Encyclopedia (phenomena links), Mobile (reading experience COMPLETE), Foundation (on-demand ISR revalidation endpoint, FTC disclosure in Layout.tsx footer), Homepage/Explore (index.tsx "More Investigations" row added)

---

### 6b. Report Experience — Ingestion & Scale (NOT STARTED)

**Scope:** Reports generated from mass ingestion pipeline. Quality templates, automated enrichment, connection generation at scale, automated media sourcing.

**Depends on:** Phase A (encyclopedia complete) and Phase B (curated quality bar set by Session 6a).

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

### 15. AI Experience & Intelligence (ACTIVE — Architecture Complete)

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
- `src/components/AskTheUnknown.tsx` — Floating AI chat button (backward-compatible with new chat endpoint)
- `src/components/reports/ReportAIInsight.tsx` — Per-report AI analysis section
- `src/lib/services/report-insights.service.ts` — AI analysis generation (hash-based caching, DB-grounded)
- `src/lib/services/ai-insights.service.ts` — Claude-powered pattern narratives

**Database tables (new):** `vector_chunks` (pgvector), `embedding_sync`, `ai_featured_patterns`

**Current state (March 20, 2026):**
- **P0 COMPLETE:** Vector embedding pipeline built. pgvector migration ready. Admin endpoint for bulk/incremental embedding.
- **P1 COMPLETE:** Semantic search API at `/api/ai/search`. Deduplicates by source, rate-limited by tier.
- **P2 COMPLETE:** Pattern detection (geographic clusters, temporal spikes, phenomena similarity). API at `/api/ai/patterns`.
- **P3 COMPLETE:** RAG-powered chat. Embeds query, retrieves top-8 chunks, injects into Claude context. Anti-hallucination rules. Source citations with `[slug:x]` format.
- **P4 COMPLETE:** Integration endpoints for Session 7 (featured patterns, related search, report similarity).

**BLOCKING DEPLOYMENT STEPS:**
1. Run SQL migration `20260320_vector_embeddings.sql` in Supabase
2. Set `OPENAI_API_KEY` in Vercel environment variables (needed for embeddings)
3. Run initial embedding via admin endpoint
4. Verify `ANTHROPIC_API_KEY` is set in Vercel (should already exist)

**What still needs work:**
- Incremental embedding hooks (auto-embed on report insert/update)
- AskTheUnknown UI: parse `[slug:x]` citation format into clickable links
- Session 7 homepage wiring: consume `/api/ai/featured-patterns`
- Session 7 search wiring: consume `/api/ai/related`
- Streaming chat responses for better UX
- Conversation memory (multi-session)
- Skeptic/believer mode toggle

**Touches other sessions:** Session 7 (homepage AI preview, search enrichment, "Ask AI" nav), Session 5 (Research Hub AI), Session 4 (complements pattern detection), Session 6a/6b (report similarity), Session 10 (new reports must be embedded after ingestion), Foundation (OPENAI_API_KEY env var)

---

### 7. Search, Navigation & Homepage

**Key files:**
- `src/pages/index.tsx` — Homepage (hero, Featured Investigations, "More Investigations" discovery row, stats, category cards)
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
3. ~~Session 7 Phase 2~~ — SHIPPED (March 20): Four new homepage components (FourPillars, AIPreview, DashboardPreview, DiscoverPreview), A/B variants updated, section consolidation, freshness signals, inline email capture
4. **NEXT: Session 7 Phase 3** — AI search results, highlighting, Save Search, notification bell, nav for 5M+

**Touches other sessions:** All sessions (navigation global), AI Experience (Phase 2-3 blocked on RAG/pattern APIs), Explore (onboarding import updated), Session 6a (editorial content), Session 13 (mobile search addition to Layout.tsx)

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

**Current state:** Pipeline locked in and tested on ~2,500 reports. 8 source adapters (NUFORC, BFRO, Reddit, NDERF, IANDS, Ghosts of America, Shadowlands, Wikipedia). Quality filter, dedup, title improvement, location parsing. ~900 approved reports currently live (TEST DATA — not launch quality). ~2M Reddit reports ingested but hidden (development data — will be wiped or re-ingested). **Mass ingestion is blocked until Phase A (encyclopedia) and Phase B (perfect reports) are complete — see Critical Sequencing section.**

**What needs work:**
- Curate to 1,000 "perfect" reports for alpha (need ~100 more from diverse sources)
- **Massive source expansion** (see Product Vision — aggregate everything legally available):
  - YouTube: video metadata, transcripts, comments (paranormal channels, witness testimony, documentary clips)
  - Erowid: trip reports (consciousness, DMT entities, altered states)
  - MUFON: case files (if API/scraping access available)
  - Podcast transcripts: major paranormal podcasts (Coast to Coast, Mysterious Universe, etc.)
  - News articles: mainstream and alternative coverage of paranormal events
  - Academic papers: parapsychology journals, consciousness studies
  - Government documents: AARO, Project Blue Book, FOIA releases
  - Forums: AboveTopSecret, Phantoms & Monsters, specialized communities
  - Books: public domain and fair-use excerpts
- Pipeline monitoring and error alerting
- Automated scheduled ingestion (cron optimization)
- Content viability checks at scale
- De-archive or re-ingest Reddit data through final pipeline (Phase 4)
- Scale target: tens of millions of reports, all consistent quality

**Touches other sessions:** Encyclopedia (phenomena linking after ingestion), Map (location quality), Reports (report quality), Search (searchable content), Insights (more data = better patterns)

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

**Current state (March 15, 2026):**
- **Phase 1-2 COMPLETE:** Design tokens (spacing.touch, spacing.nav, slide animations), 4 reusable mobile components (MobileBottomTabs, MobileBottomSheet, MobileHeader, MobileCardRow), CSS utilities in globals.css. DashboardLayout rewritten — hamburger menu removed, MobileBottomTabs added. ViewSwitcher mobile labels visible.
- **Phase 3a COMPLETE:** Report detail mobile redesign — reading progress bar bug fix, mobile back button, non-sticky action bar on mobile, native share (`navigator.share`), responsive typography, content spacing.
- **DISCOVERED:** Dual layout architecture — Layout.tsx (public pages) has its own completely different mobile bottom nav from DashboardLayout's MobileBottomTabs. Nav unification is next priority.
- PUT /api/research-hub/artifacts/[id] endpoint created (was missing)

**What needs work:**
- ~~Quick fix: Reading progress bar~~ ✅ (h-[3px] → h-1.5, March 15)
- ~~Nav unification~~ ✅ (MobileBottomTabs unified across Layout.tsx + DashboardLayout, March 15)
- **Phase 3 remaining screens:** ~~Dashboard home~~ ✅, ~~Explore feed~~ ✅, ~~Map page~~ ✅, ~~ArtifactDetailDrawer→bottom sheet~~ ✅, ~~ArtifactQuickAdd→bottom sheet~~ ✅. Remaining: Constellation touch controls, Journal, Search, Settings (lower priority)

**Touches other sessions:** ALL sessions — mobile design system is cross-cutting. Especially Dashboard (navigation shell), Reports (40K+ line detail page mobile audit), Map (touch interactions), Explore (feed card mobile layout), Search (mobile search UX), Foundation (shared components, globals.css)

---

## Cross-Feature Notes

> **Instructions:** When a session makes a change that affects another feature, add a dated note here. The affected session checks this section on startup.

| Date | Source Session | Note | Affects |
|------|--------------|------|---------|
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
| 2026-03-16 | Explore & Discovery | **Mobile UX optimized + Discover feed randomized.** Layout.tsx header modified (logo nowrap, Submit Report `hidden md:flex` secondary, Sign In pill button). MobileBottomTabs enlarged (Discover FAB 64px, nav icons 24px). AskTheUnknown FAB repositioned to `bottom-28` on mobile with AI presence CSS animations (globals.css). Explore page compacted (inline header, 75vw encyclopedia cards, compressed banners). Discover feed seed moved to component useRef (fresh order every visit). Feed API uses interleaved 3:1:1 explore-exploit tiering. | Mobile Design (bottom nav sizing changed), Foundation (Layout.tsx header + globals.css animations), Search & Nav (header structure changed), All sessions (AskTheUnknown FAB position changed) |
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
| STRIPE_SECRET_KEY not provided | Subscription checkout flow | Chase | Waiting |
| OpenAI API balance is $0 | AI chat fallback, **vector embeddings** | Chase | **CRITICAL** — must fund for semantic search/RAG |
| OPENAI_API_KEY not in Vercel env | Semantic search, RAG chat, pattern similarity | Chase | Set in Vercel dashboard |
| pgvector migration not yet run | All vector-based features | Chase | Run `20260320_vector_embeddings.sql` in Supabase SQL editor |
| 2 unpushed local commits | Possible code drift | Chase | Waiting |

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

| Metric | Current | Launch Target | Scale Target | Notes |
|--------|---------|-------------|-------------|-------|
| Curated "perfect" reports | In progress (Roswell cluster) | Enough to set the quality bar | — | **PHASE B** — must complete before mass ingestion |
| Approved reports (test data) | ~900 | To be removed/replaced | — | Current content is test data, not launch quality |
| Reddit reports (dev data) | ~2M (hidden) | To be wiped or re-ingested | — | Development data from pipeline testing |
| Phenomena entries (encyclopedia) | 4,792 | All 11 categories fully enriched | 10,000+ | **PHASE A** — must complete before mass ingestion |
| Cryptid entries enriched | 208/208 | 208/208 | — | 100% COMPLETE — model for other categories |
| Other categories enriched | Partial | All 11 categories | — | Next encyclopedia session work |
| Source adapters | 8 | 12+ | 20+ | YouTube, Erowid, MUFON, podcasts, news, academic, govt docs — **PHASE C** |

---

## Tech Debt & Known Issues

- `report/[slug].tsx` is 40K+ lines — needs componentization
- Three separate onboarding components — consolidate
- SWC compatibility requires `var` + string concat (no template literals in JSX)
- Code pushes via GitHub API (no git CLI) — documented in SESSION_NOTES.md
- No CI/CD pipeline (no tests, no linting on push)
- No error monitoring service
- Mobile responsiveness gaps → **Session 13 created to address comprehensively**

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
