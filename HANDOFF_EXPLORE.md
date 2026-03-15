# HANDOFF_EXPLORE.md — Explore & Discovery Session

**Last updated:** March 15, 2026
**Session:** Explore & Discovery (Session 2)
**Status:** Active — Anonymous feed + soft-wall prompts deployed

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
| `src/pages/explore.tsx` | New interfaces (FeedPhenomenon), auth tracking, encyclopedia cards, upgraded report cards, 3 soft-wall prompts |

## Files NOT Modified (intentionally)

| File | Reason |
|------|--------|
| `src/pages/discover.tsx` | TikTok swipe experience is standalone and already handles anonymous users well |
| `src/pages/api/discover/feed.ts` | Powers /discover page, working correctly |
| `src/components/ReportCard.tsx` | Used in Browse view, not in Discover feed |
| Browse view in explore.tsx | Working correctly, untouched |

---

## What Needs Work Next

### Immediate (same sprint)
- **Test on live site** after deploy — verify API returns sections for anonymous users
- **Image fallback** — Some phenomena images may 404; add onError handling to spotlight cards
- **Mobile scroll snap** — Test horizontal scroll behavior on iOS Safari (snap-x can be finicky)

### Short-term
- **Free tier content limits** — Implement the soft usage cap (e.g., 50 full reports/month for free)
- **Core upgrade prompts** — When free users hit the limit, show contextual "Unlock full access" prompt
- **Save functionality for logged-in users** — The bookmark button currently only redirects anonymous users; needs actual save/unsave for authenticated users
- **Feed personalization quality** — Track which sections get the most engagement, A/B test section ordering

### Medium-term
- **Connection cards** — "Did You Know?" cross-report relationship cards in the feed (Sprint 2 feature)
- **Smart match alerts** — "New Bigfoot sighting near you" notifications for Core+ users
- **Weekly digest optimization** — Use feed engagement data to personalize digest content
- **Category-specific landing pages** — /explore?category=cryptids could show a category-themed feed

### Content dependencies
- Encyclopedia enrichment (Phase A) directly improves the Spotlight section
- Curated "perfect" reports (Phase B) dramatically improve report card quality
- Mass ingestion (Phase C) fills category sections with much more content

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
| 2026-03-15 | Feed API now returns `type` field ('reports' or 'phenomena') on each section. Any consumer of `/api/feed/personalized` must handle both types. | Dashboard (if it ever consumes this API), Email (digest could use feed sections) |
| 2026-03-15 | Explore page now imports and uses auth state (supabase.auth). Soft-wall redirects go to `/login?reason=save&redirect=/explore`. Login page should handle the `reason` query param for contextual messaging. | Search & Nav (login page), Foundation (auth flow) |
| 2026-03-15 | Encyclopedia Spotlight section queries phenomena with non-placeholder images. Image quality directly affects Explore feed quality. | Encyclopedia Enrichment (image quality matters for feed) |
