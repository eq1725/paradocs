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
2. **Four Pillars** — "Four ways to explore" white h2 heading + "Each built for a different kind of curiosity." subline + 4 cards. Taller card layout (min-h-[280px] md:min-h-[320px]) with full-length descriptions (no line-clamp). Descriptions rewritten: benefit-driven, specific, curiosity-building. CTAs: "Search the database" / "Uncover patterns" / "Build a case file" / "Start swiping". Pro badge softened to gray uppercase text.
3. **Discover Preview** — "Stories from the unknown" white h2 heading + "Millions of reports from real people worldwide." subline. **Multi-format card system** (3 formats):
   - **Featured Card** (Format A): spans 2 columns on sm+, larger text, full hook paragraph, "Read report" link with divider. Assigned to highest-scoring report.
   - **Pull-Quote Card** (Format B): italic quote-style hook with large curly quote mark, title small at bottom. Dramatic, text-forward.
   - **Compact Card** (Format C): clean, metadata-rich, title + category + location.
   - **Smart selection**: fetches 10 reports, scores by content richness (summary length, location, date, feed_hook), selects best 3 with category diversity. Featured spans 2 cols + pull-quote 1 col + compact 1 col = 4 grid columns, one row.
   - **Hook extraction**: scores first 5 sentences for vivid language, penalizes generic openers, prefers sentences 2-3. Falls back to feed_hook when available.
   - **Category accents**: left border color + hover glow per category (green=UFO, amber=cryptid, purple=ghost, etc.)
   - CTA: "Explore stories" with ArrowRight icon (→ /discover). Component grew from 129 to 415 lines.
4. **Get Started CTA** — "Start exploring for free" + "Create free account" primary button (→ /login) + "Browse without an account" secondary link (→ /explore) + PWA install prompt (mobile only, tertiary). Replaced newsletter email capture — account creation is the conversion action that leads to paid tiers (AllTrails/Ancestry pattern). Newsletter was optimizing for the wrong funnel stage.

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

### Native App Wrapper (Post-Mass-Ingestion, Pre-Closed-Beta)
- **Approach:** Capacitor wrapper around the existing Next.js web app
- **Why:** App Store/Play Store presence for discoverability + credibility. Single codebase. Zero commission on subscriptions in the US (Epic v. Apple ruling, May 2025 — apps can link to web checkout without Apple fee).
- **What to build:** Capacitor project wrapping beta.discoverparadocs.com in native WebView shell. Subscription payments route to Stripe web checkout via in-app link (system browser, not WebView — Apple requires this). Push notifications via native APIs. App Store + Play Store submission.
- **Sequence:** Mass ingestion complete → Capacitor wrapper built → Store submission → Closed beta (2 weeks) → Public launch
- **Session needed:** Dedicated session for Capacitor setup, native project scaffolding, store asset creation (screenshots, descriptions, privacy policy), and submission. Estimate: 1-2 sessions.
- **Key detail:** The in-app-to-web payment flow must open Stripe checkout in the system browser (not in-app WebView). After payment, user returns to app with subscription active (webhook-based sync via existing Stripe integration).

### Session 7 Continued: Card Visual Upgrades & Scaling Strategy (March 22, 2026)

Expert-reviewed and implemented visual design + engagement improvements for both the homepage preview cards and the Discover feed cards. Focus: making text-only experiencer report cards visually compelling and scalable to millions of reports.

**DiscoverPreview.tsx (homepage) changes:**

1. **Hook extraction quality threshold** (`HOOK_QUALITY_THRESHOLD = 3`, raised from 2): Sentences scoring below threshold fall back to a dramatic title treatment instead of displaying mediocre quote text. Expanded vivid word list to 70+ words covering visual/sensory, experiencer language, and emotional/atmospheric terms. Added bonus for shorter/punchier sentences under 100 chars. `extractHook()` now returns `{ text, isQuote, score }` so selection and cards can use the score.

2. **Multi-layer sentence scoring** (`scoreSentence()`): Vivid words (+2 each), generic starts penalty (-3), filler phrase penalty (-2), dry/academic language penalty (-3). DRY_ACADEMIC list catches: "presentation", "explained that", "discussed", "described", "during his", "conference", etc. FILLER_PHRASES catches: "here and there", "my whole life", "kind of", "sort of", etc. GENERIC_STARTS catches: "i think", "so i", "basically i", etc.

3. **Feed_hook quality scoring** (March 22 late): Feed hooks now scored through `scoreSentence() + 10` instead of flat score of 20. This ensures vivid AI hooks ("A security patrol chases unexplained lights...") beat dry/academic ones ("Joe McMoneagle projects four photographs..."). Vivid hooks score ~15-25, dry ones score ~7-12.

4. **Smart report selection overhaul**: Hook quality is now the dominant selection signal. `selectBestReports()` uses `extractHook().score` directly as the primary scoring component. Category diversity enforced for first 2 cards; 3rd card picks purely by quality regardless of category. Fetch pool expanded to 20 reports (was 10).

5. **Pull-quote card atmospheric redesign**: Category-tinted gradient backgrounds. Oversized decorative quote watermark at 8-10rem opacity 6% in category-specific color. Quote mark colored per category (green for UFO, amber for cryptid, purple for ghost, etc.). Pull-quote slot explicitly requires `isQuote=true`.

6. **Compact card hook text**: Now shows 2-line hook excerpt below title when a quality quote is available.

7. **Visual rhythm across all 3 formats**: Featured card gets category gradient + radial accent glow. Pull-quote gets `bg-gradient-to-t` category tint + watermark overlay. Compact gets subtle radial accent only. All cards use `overflow-hidden` + `relative`/`z-10` pattern for layered atmospheric backgrounds.

8. **Section title**: Changed to "Eyewitness accounts" with subline "Millions of real reports from people worldwide."

9. **Featured card title fix**: Hook paragraph only renders when `hookResult.isQuote` is true, preventing duplicate title display when hook extraction falls back to title.

**DiscoverCards.tsx (Discover feed) changes:**

1. **Complete `ACCENT_VARIATIONS` coverage**: Added 6 missing categories (psychological_experiences, biological_factors, perception_sensory, religion_mythology, esoteric_practices, combination). All 11 categories now have unique accent variations.

2. **Category-specific quote borders**: Raw summary quote borders now use category color instead of mood-based color.

**Feed Hook Generation (March 22):**

- **New endpoint**: `/api/admin/generate-hooks` — Admin API for AI feed_hook generation using Claude Sonnet. Auth via `x-admin-api-key` header. Supports `limit`, `category`, `dryRun`, `overwrite` query params. Processes in batches of 5 with 300ms rate limiting.
- **198 of 200 reports** processed successfully in first batch run. Hooks stored in `reports.feed_hook` column.
- **~700+ reports** still need hooks generated. Run: `curl -X POST "https://beta.discoverparadocs.com/api/admin/generate-hooks?limit=800" -H "x-admin-api-key: [key]"`
- **A few hooks have formatting artifacts** (markdown headers, bold markers in ~3-4 hooks) — could be cleaned with SQL.

### Session 2 Continued: Card Content Overhaul for Index Model (March 28, 2026)

Session 2 overhauled all card rendering across the codebase to comply with the index model (Paradocs is an index with attribution — never republishes source text). Changes to homepage `DiscoverPreview.tsx`:

1. **PullQuoteCard → DossierCard**: Giant `"` quotation mark watermark removed. Italic serif text removed. Category-colored quote marks removed. Replaced with case-file grid pattern (subtle 40px grid lines at 2% opacity), geometric corner markers (border-l-2 + border-t-2), matching the Discover feed's dossier mood.

2. **`isQuote` → `hasHook`**: Renamed throughout `extractHook()`, `FeaturedCard`, `DossierCard`, `CompactCard`, `assignFormats()`. The concept is no longer "is this a quote from someone" but "does this item have engagement copy."

3. **`CATEGORY_QUOTE_COLORS` removed**: No longer needed — no quote marks to color.

4. **All card text unified**: Bold, non-italic, `font-medium` text in `text-gray-200`/`text-gray-300`. No italic blockquotes anywhere. `feed_hook` is the primary text source; summary fallback uses same style.

5. **`assignFormats()` updated**: `'pullquote'` format → `'dossier'` format. Selection logic unchanged (prefers reports with hooks for dossier slot).

6. **Feed hooks at 100% coverage**: 29/29 reports regenerated with new two-line prompt. 4,727/4,743 phenomena generated via new `/api/admin/ai/generate-phenomena-hooks` endpoint.

**Scaling Strategy for feed_hook Pipeline (future ingestion session):**

The `feed_hook` field is the key to making millions of text-only reports visually compelling at scale. Current approach:

- **Immediate (no feed_hook)**: `extractHook()` scores sentences for vividness and picks the best one. Quality threshold catches weak text and falls back to styled title.
- **Ingestion pipeline (future)**: When mass-ingesting 5M+ reports, the AI pipeline should generate a `feed_hook` for each report. One-time write during ingestion, stored in `feed_hook` column. No runtime AI calls.
- **Batch generation**: `/api/admin/generate-hooks` endpoint ready for batches. Priority: reports with longest/richest summaries first.
- **Graceful degradation**: Homepage and Discover feed handle missing `feed_hook` gracefully. Supabase query tries with `feed_hook` first, retries without if column doesn't exist.
- **Quality differentiation**: Feed hooks are scored through the same vivid-language system as raw summaries. The +10 base bonus ensures AI hooks generally win over raw text, but a dry AI hook can still lose to a vivid raw sentence. This prevents low-quality generated hooks from surfacing.
- **Visual variety at scale**: Generative variety system provides 2,816 unique visual combinations across all 11 categories (4 moods x 4 gradients x 4 accents x 4 watermarks per category).

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
