# Session 7 Handoff — Search, Navigation & Homepage

**Date:** March 19, 2026
**Session:** 7 (Search, Navigation & Homepage)
**Status:** Complete — P0-P3 implemented

---

## What Was Done

### P0: Homepage Conversion Optimization (`src/pages/index.tsx`)

**Changes:**
- **Hero copy rewritten** for 5-second comprehension: "The World's Largest Paranormal Database" replaces vague "Where Mysteries Meet Discovery" — cold traffic now understands what Paradocs is immediately.
- **Subhead tightened** to feature-dense: "258,000+ reports. UFO sightings, cryptid encounters, ghost reports, and unexplained events—searchable, mapped, and AI-analyzed."
- **Search bar enhanced** with quick-search tags (Roswell, Bigfoot, strange lights, ghost apparition), inline search button that appears on input, and better focus states.
- **Removed redundant Quick Links section** (4 cards for Explore/Encyclopedia/Map/Insights) — these duplicate the desktop nav exactly. Removing them shortens the page and focuses attention on content.
- **Featured Investigations from Session 6a preserved as centerpiece** — no changes to editorial content, hero image, or story cards. This section is the best conversion asset on the page.

**A/B Testing Integration:**
- Hero headline + subheadline now use `useABTest('hero_headline', ['A','B','C','D','E'])` from `src/lib/ab-testing.ts`
- 5 variants match the admin panel at `/admin/ab-testing`: A (Identity/Emotional), B (Authority/Scale), C (Curiosity/Mystery), D (Community/Belonging), E (Action/Urgency)
- View events fire automatically on page load (via `useABTest` hook)
- Click events fire on "Start Exploring" and "Share Your Experience" CTAs
- Conversion events fire on search submission
- Variant B ("The World's Largest Paranormal Database") is the default/fallback if no variant is assigned
- Also fixed `trackEvent` type signature in `ab-testing.ts` to properly type `metadata` as optional

**What was NOT changed (intentionally):**
- Featured Investigation section layout (6a owns editorial)
- Stats counter section (working well)
- Categories grid (functional)
- Email capture section (functional)
- Continue Your Research for logged-in users (functional)

### P1: Search Quality (`src/pages/search.tsx`)

**Major change: Switched from ILIKE to fulltext search API.**

The search page was using client-side `ILIKE` pattern matching (`title.ilike.%pattern%`) which has no ranking, no stemming, and poor performance. The `fulltext_search` RPC function was already deployed in Supabase with proper ts_rank_cd weighting (title=A, summary=B, description=C, location=B) but the search page wasn't using it.

**Changes:**
- Primary search now calls `/api/search/fulltext` for ranked results
- Falls back to ILIKE if the fulltext API fails (graceful degradation)
- Added **autocomplete/typeahead** with 250ms debounce — searches `phenomena` table for matching names
- Added **search mode toggle** (Keywords vs Exact Phrase) for advanced users
- Added **"Ranked by relevance"** indicator so users know results are ordered
- Custom result cards for fulltext results showing category, credibility, location, and date
- Better empty state with try-these suggestions and link to explore
- Better loading state with spinner
- Proper meta tags with noindex (search results pages shouldn't be indexed)

**How autocomplete works:**
1. User types 2+ characters
2. 250ms debounce fires
3. Queries `phenomena` table with `ilike` for name matches
4. Shows dropdown with phenomenon suggestions + raw search option
5. Clicking a suggestion performs the search immediately

### P2: SEO (`src/pages/index.tsx`)

**Changes:**
- Full meta tag suite: title, description, og:title, og:description, og:type, og:url, og:image
- Twitter card meta tags
- Canonical URL
- **JSON-LD structured data** with `WebSite` schema and `SearchAction` for Google sitelinks search box
- Search page gets proper meta tags too (with noindex)

**Note:** og:image points to `/og-home.png` which doesn't exist yet. Session 6a or a design session should create this (1200x630px recommended).

### P3: Onboarding Consolidation

**Problem:** Three separate onboarding components existed:
1. `OnboardingTour.tsx` — Report page guided tour (spotlight/tooltip, 9 steps)
2. `WelcomeOnboarding.tsx` — Post-auth: pick categories, location, digest opt-in, reveal report
3. `ThreeTapOnboarding.tsx` — Post-auth: pick interests (tiles), location detection, timeframe

Components 2 and 3 were overlapping (both ask for interests + location after auth). ThreeTapOnboarding was orphaned (imported nowhere).

**Solution:**
- Created `UnifiedOnboarding.tsx` combining ThreeTapOnboarding's UX (tile-based interest picker, auto-geolocation) with WelcomeOnboarding's API persistence
- Checks all three legacy localStorage keys so existing users won't see it again
- Sets all legacy keys on completion for backward compatibility
- `explore.tsx` updated to use `UnifiedOnboarding` instead of `WelcomeOnboarding`
- `OnboardingTour.tsx` left untouched (it's a different thing — report page tour)
- Old components left in place (not deleted) to avoid breaking any imports we missed

### Layout.tsx Changes

**Minimal changes to Layout.tsx:**
- Desktop search bar: added `group-focus-within:text-primary-400` for icon color transition on focus
- Added `focus:bg-white/[0.08]` background transition for search input
- Updated placeholder to "Search reports, phenomena..."
- No structural changes to navigation or mobile nav

---

## Files Modified

| File | Change Type | Notes |
|------|------------|-------|
| `src/pages/index.tsx` | Modified | Hero copy, search bar, SEO meta tags, removed Quick Links |
| `src/pages/search.tsx` | Rewritten | Fulltext API, autocomplete, search modes, better UX |
| `src/components/Layout.tsx` | Minor | Search bar focus states |
| `src/components/UnifiedOnboarding.tsx` | New | Consolidated onboarding flow |
| `src/pages/explore.tsx` | Modified | Import switched to UnifiedOnboarding |
| `src/lib/ab-testing.ts` | Modified | Fixed `trackEvent` type signature (metadata now optional) |
| `HANDOFF_SEARCH_NAV.md` | New | This file |

---

## Approved UX Audit & Revision Plan (v4 — March 19, 2026)

Full plan document: `Paradocs_UX_Audit_Plan.docx` (in repo root)

### Vision: Four Pillars (approved by Chase)

The homepage and site UX must communicate all four pillars:

1. **The Massive Database** — 5M+ reports aggregated from across the web, filtered by world-class AI pipeline. This is the core moat.
2. **AI Analysis & Emergent Patterns** — RAG architecture embedding all reports into vector chunks. Semantic search + cross-referencing surfaces patterns no human could find across millions of reports. This is the highest-value differentiator.
3. **The Research Dashboard** — Case files, Constellation graph, artifact management, AI analysis. The workspace for casual and professional researchers.
4. **The Discover Feed** — TikTok-style casual browsing. The mass-market entry point.

**Important:** Curated investigations (Roswell, Rendlesham) are a value-add, not the main attraction. The main attractions are the database scale, AI intelligence, research workspace, and casual discovery.

### Phase 1: Trust & Access (Ship This Week)
1. Add persistent mobile search icon in Layout.tsx header
2. Replace legacy 258K/953 stats with stable real numbers (4,792 encyclopedia, 20+ investigations, 11 categories)
3. Hide TrendingPatternsWidget on homepage (shows batch-artifact placeholder data)
4. Monitor A/B Variant C downstream conversion

### Phase 2: Tell the Real Story — SHIPPED (March 20, 2026)
5. ~~Redesign hero to communicate four pillars~~ — A/B variants updated to remove legacy 258K, all variants now reference AI + scale
6. ~~Add AI Intelligence preview section~~ — `AIPreview.tsx` consumes `GET /api/ai/featured-patterns`
7. ~~Add Research Dashboard preview with Pro CTA~~ — `DashboardPreview.tsx` with case files, constellation, AI analysis
8. ~~Add four-pillar "What Is Paradocs?" section~~ — `FourPillars.tsx` (Database, AI, Workspace, Discover)
9. ~~Add Discover feed preview~~ — `DiscoverPreview.tsx` with real report cards + "Start Swiping" CTA
10. ~~Inline email capture~~ — lightweight form between AI Preview and Featured Investigation
11. ~~Section consolidation~~ — merged Featured + Latest Reports into single "Recent Reports"; removed old Trending Patterns
12. ~~Freshness signals~~ — "Updated [month year]" badge with green pulse dot on Featured Investigation header

### Homepage Cleanup + Section-by-Section Optimization (March 20, 2026)
Cut homepage from 14 sections to 4 clean sections, then optimized each section individually through UX/engagement SME review following AllTrails/Ancestry conversion patterns.

**Final page structure (deployed):**
1. **Hero** — A/B headline, one subtext line, search bar (always-visible Search button), single trust line ("4,792+ phenomena catalogued across 11 categories · AI-powered pattern analysis"). Removed: social proof badge (bring back at 1,000+ users), 4-stat animated grid, quick-search tags, dual CTAs, tour CTA, count-up animation hooks, intersection observer, all dead data fetches (7+ API calls removed), 12 unused state variables, 3 unused interfaces. File went from 1,135 lines to 168.
2. **Four Pillars** — "Four ways to explore" bridge label + 4 cards. Title/subtitle removed (cards are self-explanatory). CTAs rewritten as action verbs: "Search the database" / "Uncover patterns" / "Build a case file" / "Start swiping". Pro badge softened to gray uppercase text. Padding tightened.
3. **Discover Preview** — "From the database" bridge label + 4 text-forward report cards. Cards redesigned: removed aspect-square emoji thumbnails and Play icon hover (false video affordance). New card format: category badge + title (the hook) + first sentence (cinematic pull) + location. Content IS the visual. Component cut from 241 to 126 lines.
4. **Get Started CTA** — "Start exploring for free" + "Create free account" primary button (→ /login) + "Browse without an account" secondary link (→ /explore). Replaced newsletter email capture — account creation is the conversion action that leads to paid tiers (AllTrails/Ancestry pattern). Newsletter was optimizing for the wrong funnel stage.

**Removed from render (components preserved, not deleted):**
- AIPreview — bring back after mass ingestion populates real AI patterns
- Featured Investigation (Roswell cinematic) — bring back when 4+ investigations exist
- More Investigations (Rendlesham) — bring back when >= 3 featured investigations
- Categories Grid, Recent Reports, Encyclopedia, DashboardPreview — duplicated nav/pillars
- Continue Your Research — logged-in feature, belongs in dashboard
- Email capture form — replaced with account creation CTA
- Categories Grid — duplicates Explore page
- Recent Reports — duplicates Discover preview
- Phenomena Encyclopedia — duplicates Encyclopedia nav
- DashboardPreview — covered by Four Pillars Research Workspace card
- Submit a Report CTA — power-user action, doesn't belong on homepage

### Phase 3: Depth & Scale Readiness — SHIPPED (March 20, 2026)
13. ~~AI-powered "Related Patterns"~~ — search results now fetch `/api/ai/related` and show AI-matched patterns with similarity scores
14. ~~Search page rebranded~~ — "AI-Powered Search" header, updated description, AI pattern cards in results
15. ~~Save Search + Notify Me~~ — logged-in users get "Save Search" button; anonymous get "Get alerts" soft-wall linking to login
16. ~~Functional notification bell~~ — `NotificationBell.tsx` component replaces non-functional bell in DashboardLayout; shows "New this week" reports with time-ago labels
17. ~~"Ask AI" nav item~~ — replaced "Insights" with "Ask AI" (links to `/search?mode=ai`); nav now: Explore, Map, Encyclopedia, Ask AI, Stories
18. ~~Rename Discover~~ — "Discover" renamed to "Stories" in desktop nav
19. ~~Hide header search on /search~~ — header search bar conditionally hidden when router.pathname === '/search'
20. ~~Launch stats~~ — added "AI Pattern Analysis" as 4th stat with gradient text; pre-ingestion: 4,792+/20+/11/AI; post-ingestion: swap to 5M+/[X]/4,792+/AI

### Color System Overhaul — SHIPPED (March 20, 2026)
Complete primary palette redesign centered on brand purple #9000F0:
- **Tailwind primary scale replaced:** Old indigo (#5B63F1 at H:236°) → new purple (#9000F0 at H:271°). Full 50-950 scale in tailwind.config.js. Every `primary-*` Tailwind class across the entire app now renders purple.
- **Logo period:** #9000F0 on all instances (Layout.tsx header/footer, DashboardLayout, discover.tsx, researcher page)
- **37 hardcoded inline color replacements** across 13 files: #5b63f1→#9000f0, #4f46e5→#7a00cc, rgba(91,99,241)→rgba(144,0,240)
- **Accent gradient:** purple→pink (#9000f0→#f472b6) for hero stats — split-complementary, same technique as Stripe/Linear/Vercel
- **Design brief v3** created with full deployed palette documentation (Paradocs_Design_Brief.docx)

Key palette values (deployed):
- primary-400: #c084fc (text on dark, links, nav)
- primary-500: #9000f0 (buttons, brand mark, main accent)
- primary-600: #7a00cc (hover/pressed states, gradient dark end)
- brand.purple: #9000F0 (Tailwind utility: text-brand-purple)

### Session Dependency: AI Experience Session
Phase 2 items 5-6 and Phase 3 items 13-14 depend on the AI Experience & Intelligence session being at least partially complete. The homepage AI preview and search intelligence features need the RAG pipeline and pattern detection APIs to exist before they can be surfaced in the UI. **Recommendation: Run AI Experience session before resuming Phase 2 of this plan.**

### Data Context for AI Session
- **~900 approved reports:** Legacy test data from earlier ingestion. Use for developing and testing the AI pipeline. Will be replaced by mass ingestion (5M+). Do NOT treat these as production-quality content.
- **Curated collections (Roswell 14 reports, Rendlesham 6 reports):** Real editorial content. These persist through mass ingestion and represent the quality bar.
- **Encyclopedia (4,792 entries):** Only Cryptids category copy is mostly finalized. Other categories are still being enriched. The AI system MUST support incremental re-embedding so encyclopedia updates are reflected in the vector store without full re-indexing.
- **At launch:** Mass ingestion fills the database with 5M+ filtered reports. The same pipeline built today scales automatically — just re-embed the new data.
- **Embedding strategy must support:** (a) initial bulk embed of current data, (b) incremental embed on insert/update, (c) manual re-embed endpoint for admin use, (d) full re-index for mass ingestion events.

### PWA Install Prompt — SHIPPED (March 20, 2026)
- **Service worker** (`public/sw.js`): minimal hand-rolled SW — cache-first for static assets, network-first for pages, skip API/auth. Satisfies Chrome PWA installability criteria.
- **SW registration** in `_app.tsx`: registered in useEffect on mount.
- **useInstallPrompt hook** (`src/lib/hooks/useInstallPrompt.ts`): detects Android (beforeinstallprompt), iOS Safari (UA check), standalone mode, desktop. Returns isInstallable, promptInstall, dismissPrompt. Respects localStorage dismiss flag.
- **InstallPrompt component** (`src/components/InstallPrompt.tsx`): Android: "Add Paradocs to your home screen" button → native Chrome dialog. iOS: instructional UI with share icon. Desktop/installed/dismissed: hidden.
- **Integrated** into homepage Section 4 (Get Started) as tertiary mobile-only prompt below CTA buttons.
- **App icon updated**: SVG gradient updated from old purples (#c4b5fd/#8b5cf6/#5b21b6) to brand purple (#c084fc/#9000f0/#6500a8). All 8 PNG icons regenerated.

---

## What's Still Needed (Future Sessions)

### Homepage
- Revise OG image placeholder (`/public/og-home.png`) with professional design
- Continue monitoring A/B test variants
- Lazy-loading for below-fold sections

### Search
- **Server-side search** — fulltext API called from browser (no SSR/ISR)
- **Search analytics** — track queries, zero-result queries
- **Proximity search** — `/api/search/proximity.ts` exists but not in UI
- **Autocomplete for locations** — currently only phenomena names
- **Pro tier gating** for advanced search features

### Navigation
- Category mega-menu for desktop (post-ingestion)
- "Ask AI" as primary nav item
- Content-type tabs on Explore page (archives / recent / experiencer)

### Onboarding
- Delete old `WelcomeOnboarding.tsx` and `ThreeTapOnboarding.tsx`
- Add onboarding analytics (completion rate, drop-off step)

### SEO
- Per-page meta tags for report/phenomenon pages
- JSON-LD for individual reports and phenomena
- Sitemap generation (`/sitemap.xml`)
- 404 page with search and popular content

---

## Cross-Session Dependencies

| What | Affects | Notes |
|------|---------|-------|
| Homepage Quick Links removed | Session 2 (Explore) | No functional impact — nav links unchanged |
| Search now uses fulltext API | Session 15 (AI) | AI cross-referencing search should also use fulltext API |
| UnifiedOnboarding replaces WelcomeOnboarding | Session 5 (Dashboard) | If dashboard references WelcomeOnboarding, update import |
| Layout.tsx search bar tweaked | Session 13 (Mobile) | No structural change, just CSS |
| OG image needed | Design session | `/og-home.png` referenced but doesn't exist |
| **Phase 2 hero + AI preview** | **AI Experience session** | **Needs RAG pipeline + pattern APIs before homepage can preview AI** |
| **Phase 3 search intelligence** | **AI Experience session** | **"Related Patterns" on results needs pattern detection API** |
| **"Ask AI" in nav** | **AI Experience session** | **Needs conversational AI endpoint before adding nav entry** |
