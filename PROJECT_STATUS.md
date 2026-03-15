# Paradocs — Project Status & Session Coordination

**Last updated:** March 14, 2026
**Project:** beta.discoverparadocs.com
**Repo:** github.com/eq1725/paradocs (main branch)

> **Purpose:** This is the top-level PM document. Every dedicated session reads this at startup and updates its section at the end. It serves as the coordination layer that prevents cross-feature dependencies from falling through the cracks.
>
> **This document is maintained by the Project Status session** — a dedicated PM session that reviews all feature session updates, identifies conflicts, reprioritizes work, and provides big-picture guidance. Feature sessions update their own sections and the Cross-Feature Notes table; the PM session synthesizes everything.

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
| 2 | **Explore & Discovery** | Personalized feed, category filters, content surfacing, recommendations | `HANDOFF_EXPLORE.md` | Not started |
| 3 | **Map & Geospatial** | Leaflet map, PostGIS queries, clustering, proximity search, geocoding | `HANDOFF_MAP.md` | Not started |
| 4 | **Insights & Pattern Analysis** | Pattern detection algorithms, AI narratives, skeptic mode, trending, methodology | `HANDOFF_INSIGHTS.md` | Not started |
| 5 | **User Dashboard & Constellation** | Dashboard home, constellation map (D3), research hub, journal, saved items, streaks, settings | `HANDOFF_DASHBOARD.md` | Active — Research Hub Phase 1-3 deployed, 16+ source types, mobile fixes applied |
| 6 | **Report Experience** | Report detail page, submission form, connections, evidence, related reports | `HANDOFF_REPORTS.md` | Not started |
| 7 | **Search & Navigation** | Full-text search, site navigation, onboarding flows, UX polish | `HANDOFF_SEARCH_NAV.md` | Not started |
| 8 | **Subscription & Monetization** | Stripe checkout, paywall, tier system, billing portal, cancellation | `HANDOFF_SUBSCRIPTION.md` | Not started |
| 9 | **Email & Engagement** | Weekly digests, drip campaigns, smart alerts, winback, notifications | `HANDOFF_EMAIL.md` | Not started |
| 10 | **Data Ingestion & Pipeline** | Source adapters, quality filters, dedup, bulk import, media extraction | `HANDOFF_INGESTION.md` | Not started |
| 11 | **Admin & Operations** | Admin dashboard, batch operations, cron jobs, A/B testing, monitoring | `HANDOFF_ADMIN.md` | Not started |
| 12 | **Foundation & Infrastructure** | Shared components, auth/RLS, database schema, deployment, performance, SEO | `HANDOFF_FOUNDATION.md` | Not started |
| 13 | **Mobile-First Design System** | Cross-cutting mobile UX: bottom tabs, bottom sheets, design tokens, screen-by-screen redesign | `HANDOFF_MOBILE.md` | Not started — Session prompt ready |

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

**What's next:**
- Enrich remaining categories beyond cryptids (UFOs, ghosts, etc.) with the full 7-field treatment (ai_description, ai_characteristics, ai_theories, ai_paradocs_analysis, ai_quick_facts, ai_summary, primary_regions)
- Media enrichment (images for phenomena entries)
- Cross-link phenomena to reports more comprehensively

**Touches other sessions:** Discover (ai_summary affects feed cards), Search (content affects search results), Reports (phenomena links on report pages)

---

### 2. Explore & Discovery

**Key files:**
- `src/pages/explore.tsx` — Main discovery feed page
- `src/pages/api/discover/feed.ts` — Personalized feed API
- `src/pages/api/feed/personalized.ts` — Alternative personalization endpoint
- `src/lib/services/personalization.service.ts` — User preference engine
- `src/components/CategoryFilter.tsx`, `SubcategoryFilter.tsx`, `PhenomenaFilter.tsx`
- `src/lib/hooks/usePersonalization.ts`

**Database tables:** `reports`, `phenomena`, `saved_reports`, `user_preferences`

**Current state:** Basic discovery feed built with category filters. Personalization service exists but limited.

**What needs work:**
- Recommendation algorithm improvements
- Content surfacing logic (trending, new, relevant-to-you)
- Feed performance optimization at scale
- "Connection cards" / "Did You Know?" cross-report relationships (Sprint 2, not built)
- Smart match alerts (Sprint 2, not built)
- Category-specific feed tuning

**Touches other sessions:** Encyclopedia (content quality affects feed), Insights (trending patterns surface in feed), Dashboard (personalization preferences), Search (shared filter components)

---

### 3. Map & Geospatial

**Key files:**
- `src/pages/map.tsx` — Main map page
- `src/components/MapView.tsx` — Full interactive map
- `src/components/PhenomenonMiniMap.tsx` — Lightweight phenomenon map
- `src/components/patterns/PatternMiniMap.tsx` — Pattern location map
- `src/pages/api/search/proximity.ts` — Geospatial proximity search
- `src/pages/api/geocode/regions.ts` — Geocoding API
- `src/lib/services/geocoding.service.ts` — Mapbox integration
- `src/lib/hooks/useMapInteractions.ts`
- `src/lib/ingestion/utils/location-parser.ts`, `location-inferrer.ts`

**Database:** PostGIS extension, `coordinates` column on reports, `primary_regions` on phenomena

**Current state:** MapBox-powered map exists. PostGIS queries work. Geocoding service operational.

**What needs work:**
- Clustering logic for dense report areas
- Heatmap visualization layer
- Regional filtering / geographic browsing
- Phenomenon-specific map views (e.g., "all Bigfoot sightings")
- Timeline slider (filter by date range on map)
- Performance at scale (current 900 reports fine, but 10K+ needs optimization)
- Mobile map UX

**Touches other sessions:** Reports (report location data), Encyclopedia (primary_regions field), Ingestion (location parsing quality), Insights (geospatial pattern detection)

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

### 6. Report Experience

**Key files:**
- `src/pages/report/[slug].tsx` — Report detail page (40K+ lines)
- `src/pages/submit.tsx` — Report submission form
- `src/pages/api/reports/[slug]/` — patterns, phenomena, nearby, connections, academicData, environment, insight
- `src/lib/services/report-insights.service.ts` — AI-powered per-report analysis
- `src/lib/services/ai-title.service.ts` — Title improvement
- `src/components/ReportCard.tsx` — Preview card
- `src/components/RelatedReports.tsx`, `MediaGallery.tsx`, `FormattedDescription.tsx`, `SourceBadge.tsx`
- `src/components/LogToConstellation.tsx` — Add to research map

**Database tables:** `reports`, `report_media`

**Current state:** Full report detail page with reactions, comments, share, save, related reports, phenomena links, credibility scoring, investigation journal, evidence section. Submission form built.

**What needs work:**
- Report detail page performance (40K+ file needs refactoring)
- Connection cards ("Did You Know?" cross-report relationships)
- Shareable story cards (viral share images) — Sprint 3
- Report moderation workflow improvements
- Evidence section enhancement
- Witness credibility display refinement
- Mobile reading experience optimization
- Breadcrumb navigation

**Touches other sessions:** Encyclopedia (phenomena links), Map (report location display), Insights (per-report patterns), Dashboard (submitted/saved reports), Explore (report cards in feed)

---

### 7. Search & Navigation

**Key files:**
- `src/pages/search.tsx` — Full-text search page
- `src/pages/api/search/fulltext.ts` — Full-text search API
- `src/components/Layout.tsx` — Global navigation
- `src/components/Navigation*.tsx` — Navigation components
- `src/components/NavigationHelper.tsx` — Breadcrumbs
- `src/components/OnboardingTour.tsx`, `WelcomeOnboarding.tsx`, `ThreeTapOnboarding.tsx`
- `src/pages/about.tsx`, `src/pages/index.tsx` (landing)

**Database:** `search_vector` column, full-text search indexes

**Current state:** Full-text search works. Basic navigation built. Three onboarding components exist.

**What needs work:**
- Search results quality and ranking
- Autocomplete / typeahead suggestions
- Advanced search filters (date, location, category, credibility)
- Site-wide navigation UX overhaul (header/mobile nav — noted as outstanding)
- Homepage flow optimization
- Onboarding flow consolidation (three separate components)
- SEO optimization (meta tags, structured data, sitemap)
- 404 / error page experience

**Touches other sessions:** All sessions (navigation is global), Foundation (shared layout components), Explore (search integration with feed)

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

**Current state:** Pipeline locked in and tested on ~2,500 reports. 8 source adapters (NUFORC, BFRO, Reddit, NDERF, IANDS, Ghosts of America, Shadowlands, Wikipedia). Quality filter, dedup, title improvement, location parsing. ~900 approved reports currently live.

**What needs work:**
- Curate to 1,000 "perfect" reports for alpha (need ~100 more from diverse sources)
- New source adapters (MUFON, podcasts, books, news)
- Pipeline monitoring and error alerting
- Automated scheduled ingestion (cron optimization)
- Content viability checks at scale
- De-archive or re-ingest Reddit data through final pipeline (Phase 4)

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

**Current state (March 14, 2026):**
- Session prompt and handoff doc created and ready for a new session
- Incremental mobile CSS fixes applied during Session 5 work (responsive padding, truncation, overflow-hidden, CSS-only responsive layout replacing JS viewport detection)
- Key architectural fix deployed: replaced JS `useState`/`useEffect` viewport detection with CSS-only Tailwind responsive classes to eliminate hydration flash
- PUT /api/research-hub/artifacts/[id] endpoint created (was missing, causing silent data loss)
- X.com source duplication fix in ArtifactDetailDrawer

**What needs work (Session 13 scope):**
- **Phase 1:** Design tokens and component library (spacing scale, color system, typography, reusable mobile primitives like bottom sheets, swipe-to-dismiss, pull-to-refresh)
- **Phase 2:** Navigation shell (bottom tab bar replacing hamburger menu, modeled on Netflix/Uber/Spotify)
- **Phase 3:** Screen-by-screen redesign (Dashboard home, Research Hub, Explore, Report detail, Map, Journal, Search, Settings)
- Known unsolved issues: no bottom tab navigation, no swipe-to-dismiss on drawers, no swipe-back gesture, quick-add modal not optimized for mobile keyboard, Explore/Report/Map/Constellation/Journal/Search pages not audited for mobile

**Touches other sessions:** ALL sessions — mobile design system is cross-cutting. Especially Dashboard (navigation shell), Reports (40K+ line detail page mobile audit), Map (touch interactions), Explore (feed card mobile layout), Search (mobile search UX), Foundation (shared components, globals.css)

---

## Cross-Feature Notes

> **Instructions:** When a session makes a change that affects another feature, add a dated note here. The affected session checks this section on startup.

| Date | Source Session | Note | Affects |
|------|--------------|------|---------|
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
| OpenAI API balance is $0 | AI chat fallback provider | Chase | Waiting |
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

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| Approved reports | ~900 | 1,000 (alpha) | Need ~100 more from diverse sources |
| Phenomena entries | 4,792 | 4,792+ | Enrichment ongoing across categories |
| Cryptid entries enriched | 208/208 | 208/208 | 100% COMPLETE |
| Other categories enriched | Partial | All | Next encyclopedia session work |
| Source adapters | 8 | 12+ | MUFON, podcasts, books, news planned |

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
**Push method:** GitHub API (browser-based, not git CLI)
**SWC rules:** No template literals in JSX, use `var`, use `function(){}`, unicode escapes for smart quotes
**AI providers:** Anthropic Claude (primary), OpenAI (fallback, currently $0 balance)
**Email:** Resend
**Maps:** Mapbox (server-side geocoding), Leaflet (client-side maps)
**Payments:** Stripe (key not yet provided)

---

*This document is the single source of truth for cross-session coordination. Keep it updated.*
