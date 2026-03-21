# HANDOFF_EXPLORE.md — Explore & Discovery Session

**Last updated:** March 16, 2026
**Session:** Explore & Discovery (Session 2)
**Status:** Active — Anonymous feed + soft-wall prompts deployed, mobile UX optimized, Discover feed randomization live

---

## What Was Done (March 15, 2026)

### Strategy: Freemium Conversion Funnel

Based on market research (2026 freemium benchmarks, Strava/Duolingo models, RevenueCat data), the Explore feed was redesigned around a three-step conversion ladder:

1. **Anonymous → Free Account:** Hook with content, gate with persistence (save, personalize)
2. **Free → Core ($5.99):** Gate with access (full database, advanced search, AI analysis)
3. **Core → Pro ($14.99):** Gate with tools (Research Hub, AI cross-referencing, Constellation)

**Key principle:** Gate depth, not breadth. Anonymous users see everything; signup prompts are contextual and non-interruptive.

### Changes Made

#### 1. `/api/feed/personalized.ts` — Enhanced for Anonymous Users

**Before:** Only returned Trending + Recent for anonymous users. Missing category, credibility, location fields. Auth token was never passed from the frontend.

**After:** Returns 5-7 rich sections for everyone:
- **Encyclopedia Spotlight** (new) — Top phenomena with images, summaries, category badges. The "wow" factor. Links to `/phenomena/[slug]`.
- **Trending / Most Popular** — Most viewed reports with full metadata
- **Category Highlights** (new) — Two rotating category sections based on day-of-year (variety for return visitors). Cycles through cryptids, UFOs, ghosts, psych experiences, consciousness.
- **Near You** — Only for authenticated users with location (unchanged)
- **Because You Saved** — Only for authenticated users with saves (unchanged)
- **Recently Added** — Newest reports
- **For You** — Only for authenticated users with interests (unchanged)

All report queries now return full metadata: `category, credibility, country, city, state_province, event_date, upvotes, view_count, comment_count, location_name, source_type, source_label, has_photo_video, has_physical_evidence, content_type`.

Added caching: 60s public for anonymous, 30s private for authenticated.

#### 2. `explore.tsx` — Discover Tab Rewritten

**Before:** Empty state for logged-out users ("Complete your profile to get personalized recommendations"). Basic text-only feed cards with minimal metadata.

**After:**
- **Encyclopedia Spotlight cards** — Image-backed cards with category badges, report counts, AI summaries. Visually rich, links to encyclopedia entries. Includes a "Browse Encyclopedia" CTA card at end.
- **Upgraded report cards** — Category icon, category badge, credibility badge, title, summary, location, date, view count, upvotes. Consistent visual hierarchy.
- **Auth state tracking** — Frontend now passes auth token to feed API and tracks user session for conditional rendering.

#### 3. Soft-Wall Signup Touchpoints (3 total)

Research indicates 3 max contextual touchpoints before annoyance. Implemented:

1. **Save action (Bookmark button)** — Anonymous users see a bookmark icon on every report card. Clicking it redirects to `/login?reason=save&redirect=/explore`. Contextual, non-blocking.
2. **In-feed signup card** — After the 2nd feed section, anonymous users see a styled card: "Enjoying what you see?" with benefits (save reports, personalized feed, weekly digest) and a "Create Free Account" CTA. Part of the feed flow, not an overlay.
3. **Bottom CTA** — After all sections, a subtle "Want to see reports tailored to your interests?" prompt with a sign-in link.

**What was NOT done (intentionally):**
- No hard paywall on any content
- No timed pop-ups or modal overlays
- No interruptions while reading a report
- The /discover TikTok swipe page was left untouched (it already has its own signup prompt at card 6)

### Mobile UX Optimization (March 16, 2026)

Based on iPhone 16 Pro Max testing and mobile UX research:

#### Layout.tsx Header Fixes
- **Logo wrapping fixed:** Added `whitespace-nowrap` + scaled to `text-xl` on mobile (was `text-2xl`, caused "Paradocs." period to wrap to new line)
- **Submit Report demoted:** Changed from `hidden sm:flex btn-primary` to `hidden md:flex` with secondary ghost styling. Shortened to "Submit". Not a core platform CTA — accessible via More menu on mobile.
- **Sign In upgraded:** Plain text link → pill button with `rounded-full`, glass background (`bg-white/10`), white border, hover transition to primary color. Much more visible for conversion.

#### Explore Page (`explore.tsx`) Mobile Layout
- **Page header compacted:** Title ("Explore") + Discover/Browse toggle moved to same row. Reduced `py-8` → `py-4` on mobile. Saves ~60px above the fold.
- **Browse button fixed:** Removed inline count `(929)` that was wrapping to two lines. Added `whitespace-nowrap`.
- **Encounter count styled:** Tabular-nums font-medium for the number, shorter "encounters" label on mobile (full "documented encounters" on desktop). Live from `/api/public/stats`.
- **Pattern Insights banner compressed:** Two-row card → single compact row on mobile.
- **Encyclopedia spotlight cards enlarged:** `min-w-[220px]` → `min-w-[75vw]` on mobile (~322px on iPhone 16 Pro Max). Image height `h-36` → `h-44`. Text bumped up a size. "Browse Encyclopedia" CTA card widened to `min-w-[50vw]`.
- **Feed section spacing tightened:** `space-y-8` → `space-y-6` on mobile for more density.

#### Ask the Unknown FAB
- **Position fixed:** Moved from `bottom-6` to `bottom-28` on mobile (clears 80px bottom nav zone + 16px breathing room). Desktop stays at `bottom-6`.
- **AI presence animations added (CSS only):**
  - Rotating conic-gradient border ring, intermittent 13s cycle (3s visible burst, 10s rest — based on NNG attention research showing intermittent motion avoids banner blindness)
  - Soft breathing ambient glow (radial gradient, 4s pulse cycle, 50-85% opacity)
  - Sparkle icon micro-rotation (6s cycle, subtle personality touch)
  - Three-color gradient (primary → purple → indigo) for premium AI feel
  - `@property` CSS registration for conic-gradient animation (Chrome/Safari)
- **z-index:** Dropped from 50 to 40 so it doesn't fight with nav.

#### Mobile Bottom Nav (`MobileBottomTabs.tsx`)
- **All nav icons enlarged:** `w-5 h-5` (20px) → `w-6 h-6` (24px) for better thumb targets (Apple HIG recommends 44pt minimum).
- **Discover FAB enlarged:** `w-12 h-12` (48px) → `w-16 h-16` (64px, upper bound for nav-embedded FABs per Material Design). Icon `w-6` → `w-8`. Elevation `-mt-4` → `-mt-6`. Added gradient treatment (`from-primary-500 to-purple-600`).

### Discover Feed Randomization (March 16, 2026)

**Problem:** Users always saw the same content in the same order. The seed was generated at module scope (`var SESSION_SEED = Math.random()...`) which only executed once per JS bundle load. In PWA mode, the module stays cached, so the seed rarely changed.

**Client fix (`discover.tsx`):** Moved seed to `useRef` inside the component. Now generates a fresh random seed on every mount (every visit to /discover). Stable during pagination (useRef persists for component lifetime) but resets when navigating away and back.

**API fix (`api/discover/feed.ts`):** Replaced tier concatenation with interleaved explore-exploit pattern. Previously: all high-tier items first → all mid → all low. This meant the first 15 cards were always drawn from the same ~30 highest-scored phenomena regardless of seed. Now interleaves 3:1:1 (3 high-quality, 1 mid, 1 discovery per batch). Based on TikTok/Spotify explore-exploit model — maintains quality perception while injecting genuine surprise from the long tail.

---

## Architecture Notes

### Two Discovery Experiences

| Page | Purpose | Nav Chrome | Auth Required |
|------|---------|-----------|---------------|
| `/explore` | Primary browse/discover hub with Discover + Browse tabs | Full Layout.tsx with MobileBottomTabs | No |
| `/discover` | TikTok-style fullscreen encyclopedia swipe | Standalone (no nav) | No |

The mobile bottom nav has a center Discover FAB pointing to `/discover` and an Explore tab pointing to `/explore`. Both are valid entry points for different browsing modes.

### Feed API Response Shape

```typescript
interface FeedSection {
  id: string           // 'spotlight' | 'trending' | 'recent' | 'for_you' | 'near_you' | 'because_saved' | 'category_*'
  title: string
  subtitle: string
  type: 'reports' | 'phenomena' | 'mixed'
  reports?: FeedReport[]
  phenomena?: FeedPhenomenon[]
}
```

### Content Strategy

Current site has ~928 test reports and ~4,792 encyclopedia phenomena. The feed is designed for both:
- **Current state:** Encyclopedia Spotlight is the hero section (has images + AI summaries). Reports fill category and trending sections.
- **Future state:** When curated "perfect" reports (Roswell cluster) are ready, the report cards will be even more compelling. When mass ingestion happens, the category sections and trending become much richer.

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/api/feed/personalized.ts` | Complete rewrite — encyclopedia spotlight, category highlights, richer report data, caching |
| `src/pages/explore.tsx` | New interfaces (FeedPhenomenon), auth tracking, encyclopedia cards, upgraded report cards, 3 soft-wall prompts, mobile layout compaction (March 16) |
| `src/components/Layout.tsx` | Logo nowrap, Submit Report demoted to md-only secondary, Sign In pill button (March 16) |
| `src/components/AskTheUnknown.tsx` | FAB repositioned above bottom nav, AI presence animations, gradient upgrade (March 16) |
| `src/styles/globals.css` | AI FAB CSS animations: rotating border, breathing glow, sparkle rotate, `@property` (March 16) |
| `src/components/mobile/MobileBottomTabs.tsx` | Discover FAB 48→64px, all nav icons 20→24px, gradient treatment (March 16) |
| `src/pages/discover.tsx` | Seed moved from module scope to useRef — fresh order on every visit (March 16) |
| `src/pages/api/discover/feed.ts` | Interleaved explore-exploit quality tiering instead of concatenated tiers (March 16) |

### Phase 2: Discover Feed Architecture Redesign (March 21, 2026)

**Problem:** The Stories (/discover) feed showed only encyclopedia phenomena. Reports — the heart of the platform (firsthand experiencer accounts) — were absent. This meant the casual-user hook (TikTok-style swipe) didn't showcase the content most likely to create emotional connection and conversion.

**Solution:** Mixed content feed with three card templates and related content discovery.

#### New API: `/api/discover/feed-v2`

Replaces the phenomena-only `/api/discover/feed` as the data source for /discover. Fetches both phenomena (up to 800) and approved reports (up to 400), scores them on a unified 0-8 scale, and interleaves using the same 3:1:1 explore-exploit pattern. Added content-type variety constraint (no more than 3 same `item_type` in a row) on top of the existing category variety constraint (no more than 2 same category in a row).

**Report scoring factors:** has_photo_video (+3), has_physical_evidence (+1), credibility high (+2) / medium (+1), upvotes > 3 (+1), historical_case content_type (+1).

Each item in the response includes an `item_type` field ('phenomenon' or 'report') so the client can select the right card template. Reports also include resolved `phenomenon_type` with name/slug/category for linking to encyclopedia entries.

#### Three Card Templates (`src/components/discover/DiscoverCards.tsx`)

1. **PhenomenonCard** — Upgraded from the original DiscoverCard. Image-backed or gradient background, name, AI summary, quick facts pills, aliases. Links to `/phenomena/[slug]`.

2. **TextReportCard** — For experiencer reports without photo/video evidence. Quote-styled layout with decorative quotation mark watermark, border-left excerpt styling, credibility badge, location + date metadata, evidence pills, phenomenon type link. Links to `/report/[slug]`.

3. **MediaReportCard** — For reports with photo/video evidence. Camera-themed styling with evidence badge prominently displayed, amber accent color for visual distinction. Links to `/report/[slug]` with "View Evidence" CTA.

All cards share: TikTok-style right sidebar actions (Save, Share, More), Framer Motion horizontal related content tray, staggered entrance animations.

#### Related Content Tray (Framer Motion)

Each card fetches related content when it becomes the active (visible) card. Uses:
- `/api/ai/report-similar?slug=X` for report cards (vector similarity from Session 15 RAG pipeline)
- `/api/ai/related?query=X` for phenomenon cards (semantic search from Session 15)

Results are cached per item ID to avoid re-fetching on scroll-back. Displayed as a horizontal swipe tray at the bottom of each card using `framer-motion` drag gestures. Each related item links directly to the full entry.

#### Completion Signals

- Progress bar (existing, unchanged) shows current position in feed
- **Completion milestone toasts** at 25%, 50%, 75% — auto-dismiss after 3 seconds
- **Max-seen tracking** — tracks the furthest card reached (not just current position)
- **End-of-feed card** updated to show combined story count and suggest both Encyclopedia and Explore as next steps

#### Preserved Behaviors

- Signup gate at card 6 for anonymous users (unchanged)
- Seeded PRNG shuffle with per-mount seed (unchanged)
- Keyboard navigation (arrow keys, space) (unchanged)
- IntersectionObserver for scroll tracking (unchanged)
- Prefetch next batch at items.length - 5 (unchanged)

| File | Change |
|------|--------|
| `src/pages/api/discover/feed-v2.ts` | **NEW** — Mixed content feed API (phenomena + reports) |
| `src/components/discover/DiscoverCards.tsx` | **NEW** — PhenomenonCard, TextReportCard, MediaReportCard + RelatedTray |
| `src/pages/discover.tsx` | **REWRITTEN** — Consumes feed-v2, renders mixed cards, related content, completion signals |

## Files NOT Modified (intentionally)

| File | Reason |
|------|--------|
| `src/components/ReportCard.tsx` | Used in Browse view, not in Discover feed |
| Browse view in explore.tsx | Working correctly, untouched |

---

## What Needs Work Next

### Immediate (same sprint)
- ~~Test on live site~~ ✅ (deployed and tested on iPhone 16 Pro Max, March 16)
- ~~Image fallback~~ ✅ (PhenomenonCard uses onError + fallback gradient, March 21)
- ~~Mobile scroll snap~~ ✅ (tested, working on iOS Safari with snap-x + 75vw cards)
- ~~Mobile header issues~~ ✅ (logo wrapping, Submit Report, Sign In — all fixed March 16)
- ~~Discover feed always same order~~ ✅ (seed moved to useRef + interleaved tiering, March 16)
- ~~Phase 2: Mixed content feed~~ ✅ (feed-v2 API, three card templates, Framer Motion related tray, March 21)
- **Test mixed feed on live site** — Deploy and verify on iPhone 16 Pro Max
- **Tune report/phenomena ratio** — Monitor whether the 3:1:1 tiering produces good variety with ~928 reports vs ~4,792 phenomena

### Short-term
- **Free tier content limits** — Implement the soft usage cap (e.g., 50 full reports/month for free)
- **Core upgrade prompts** — When free users hit the limit, show contextual "Unlock full access" prompt
- **Save functionality for logged-in users** — The bookmark button currently only redirects anonymous users; needs actual save/unsave for authenticated users
- **Feed personalization quality** — Track which sections get the most engagement, A/B test section ordering
- **Report media display** — MediaReportCard currently uses gradient bg; when report images are available, switch to image-backed layout

### Medium-term
- **Connection cards** — "Did You Know?" cross-report relationship cards in the feed (Sprint 2 feature)
- **Smart match alerts** — "New Bigfoot sighting near you" notifications for Core+ users
- **Weekly digest optimization** — Use feed engagement data to personalize digest content
- **Category-specific landing pages** — /explore?category=cryptids could show a category-themed feed
- **Completion achievements** — Persist completion milestones per user, gate behind account creation

### Content dependencies
- Encyclopedia enrichment (Phase A) directly improves the Spotlight section
- Curated "perfect" reports (Phase B) dramatically improve report card quality
- Mass ingestion (Phase C) fills category sections with much more content
- **Remaining phenomena embeddings** (~3,600) needed for Related tray to populate on phenomenon cards

---

## Subscription Tier Gating Plan (not yet implemented)

| Feature | Anonymous | Free | Core ($5.99) | Pro ($14.99) |
|---------|-----------|------|-------------|-------------|
| Browse feed | Full | Full | Full | Full |
| Read reports | Unlimited (summaries) | 50/month full | Unlimited | Unlimited |
| Save/bookmark | No (signup prompt) | Yes (limited) | Yes | Yes |
| Personalized feed | No | Yes | Yes | Yes |
| Advanced search | No | Basic | Full | Full |
| AI pattern analysis | No | No | Yes | Yes |
| Research Hub | No | Board+Timeline | +Map | +Constellation |
| Smart alerts | No | No | Yes | Yes |
| Weekly digest | No | Yes | Yes (enhanced) | Yes (enhanced) |

---

## Cross-Feature Notes

| Date | Note | Affects |
|------|------|---------|
| 2026-03-16 | **Layout.tsx header modified:** Logo scaled, Submit Report hidden on mobile (md breakpoint), Sign In restyled as pill button. Any session touching Layout.tsx header should be aware of these changes. | Search & Nav (header structure changed), Foundation (Layout.tsx modified), Mobile Design (header now mobile-optimized) |
| 2026-03-16 | **MobileBottomTabs.tsx updated:** Discover FAB now 64px (was 48px), all nav icons 24px (was 20px). Gradient treatment on FAB. Any session modifying bottom nav should account for these sizes. | Mobile Design (nav sizing changed), All sessions using mobile nav |
| 2026-03-16 | **AskTheUnknown.tsx FAB repositioned and animated:** Now at `bottom-28` on mobile (above bottom nav). Uses `ai-fab-glow` CSS class from globals.css. z-index 40. Any page including this component should test bottom-right corner for overlap. | All pages using AskTheUnknown, Foundation (globals.css has new animation keyframes) |
| 2026-03-16 | **Discover feed API (`/api/discover/feed`) now uses interleaved tiering** instead of concatenated tiers. Quality distribution changed: 3 high, 1 mid, 1 low per batch. Any analytics on feed position should account for this. | Admin (analytics), Insights (feed engagement data) |
| 2026-03-15 | Feed API now returns `type` field ('reports' or 'phenomena') on each section. Any consumer of `/api/feed/personalized` must handle both types. | Dashboard (if it ever consumes this API), Email (digest could use feed sections) |
| 2026-03-15 | Explore page now imports and uses auth state (supabase.auth). Soft-wall redirects go to `/login?reason=save&redirect=/explore`. Login page should handle the `reason` query param for contextual messaging. | Search & Nav (login page), Foundation (auth flow) |
| 2026-03-15 | Encyclopedia Spotlight section queries phenomena with non-placeholder images. Image quality directly affects Explore feed quality. | Encyclopedia Enrichment (image quality matters for feed) |
| 2026-03-21 | **Stories feed now mixed content (feed-v2):** `/api/discover/feed-v2` serves both phenomena and reports. Old `/api/discover/feed` still exists for backward compat but is no longer consumed by `/discover`. | All sessions touching /discover, Admin (analytics) |
| 2026-03-21 | **Three card templates in DiscoverCards.tsx:** PhenomenonCard, TextReportCard, MediaReportCard. Any session modifying the Stories experience should use these components. | Mobile Design, Foundation |
| 2026-03-21 | **Related tray consumes Session 15 RAG APIs:** `/api/ai/report-similar` and `/api/ai/related` are called lazily per card. Depends on vector embeddings being populated. | Session 15 (AI Experience), Admin (embedding status) |
| 2026-03-21 | **Framer Motion used in DiscoverCards.tsx:** `motion.div` with drag="x" for horizontal swipe. First production use of framer-motion in the project. Other sessions can reference this pattern. | Foundation (new dependency usage) |
