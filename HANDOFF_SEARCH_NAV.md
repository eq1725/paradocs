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

## What's Still Needed (Future Sessions)

### Homepage
- Create `/og-home.png` (1200x630 OG image for social sharing)
- A/B test hero copy variants
- Consider lazy-loading below-fold sections
- Add "What's new" section for return visitors (beyond Continue Your Research)

### Search
- **Server-side search** instead of client-side — the fulltext API is called from the browser which means no SSR/ISR
- **Search analytics** — track what people search for, zero-result queries
- **Search result snippets** with highlighted matching terms
- **Proximity search** — the `/api/search/proximity.ts` endpoint exists but isn't exposed in the UI
- **Autocomplete for locations** — currently only searches phenomena names
- **Pro tier gating** for advanced search (phrase mode, date filters, evidence filters)

### Navigation
- Desktop header nav could be improved with mega-menu for categories
- Mobile search UX (currently no search in mobile nav — users need to navigate to /search)
- Consider adding search to MobileBottomTabs "More" menu

### Onboarding
- Delete old `WelcomeOnboarding.tsx` and `ThreeTapOnboarding.tsx` once confirmed no imports reference them
- Add onboarding analytics (completion rate, drop-off step)
- Consider showing onboarding to non-auth users too (currently auth-gated)

### SEO
- Per-page meta tags for report pages, phenomenon pages, map page
- JSON-LD for individual reports (`Article` schema with `datePublished`, `author`, `locationCreated`)
- JSON-LD for phenomena (`Thing` schema)
- Sitemap generation (`/sitemap.xml`)
- 404 page with search and popular content suggestions

---

## Cross-Session Dependencies

| What | Affects | Notes |
|------|---------|-------|
| Homepage Quick Links removed | Session 2 (Explore) | No functional impact — nav links unchanged |
| Search now uses fulltext API | Session 15 (AI) | AI cross-referencing search should also use fulltext API |
| UnifiedOnboarding replaces WelcomeOnboarding | Session 5 (Dashboard) | If dashboard references WelcomeOnboarding, update import |
| Layout.tsx search bar tweaked | Session 13 (Mobile) | No structural change, just CSS |
| OG image needed | Design session | `/og-home.png` referenced but doesn't exist |
