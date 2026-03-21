# Session Prompt: Phase 2 — Discover Feed Architecture Redesign

**Session:** Paradocs - Explore & Discover (Session 2)
**Scope:** Major redesign of the Discover feed — mixed content types, multiple card templates, horizontal swipe for related content
**Priority:** High — this is the core engagement loop of the product
**Depends on:** Phase 1 (homepage cards) should ideally ship first but is not a hard blocker

---

## Context

Read these files before starting:
- `PROJECT_STATUS.md` (root) — overall project coordination doc
- `HANDOFF_EXPLORE.md` (root) — your session's handoff document
- `HANDOFF_AI_EXPERIENCE.md` (root) — Session 15's AI endpoints (you'll use `/api/ai/report-similar`)
- `src/pages/discover.tsx` (662 lines) — the current Discover feed page
- `src/pages/api/discover/feed.ts` (246 lines) — the current feed API (phenomena only)
- `src/components/mobile/MobileBottomTabs.tsx` — bottom nav (label is "Stories")

**Current state:** The Discover feed is a TikTok-style vertical scroll that shows ONLY phenomena (encyclopedia entries). It uses CSS snap scroll (`snap-y snap-mandatory`), IntersectionObserver for tracking the current card, and a seeded deterministic shuffle algorithm with tiered quality scoring. Each card shows: background image, gradient overlay, category badge, phenomenon name, aliases, AI summary (line-clamp-3), quick fact pills, and a "Read Full Entry" CTA.

**The problem:** The feed only shows phenomena — it completely ignores the ~900 embedded reports which are the core content of the platform. There's no horizontal navigation for related content. The experience dead-ends at "Read Full Entry."

---

## What to Build

### 1. Mixed Content Feed (Reports + Phenomena)

The feed must show BOTH reports and phenomena, interleaved. Reports are the primary content; phenomena provide variety and encyclopedia context.

**New feed API:** Create `src/pages/api/discover/feed-v2.ts` (keep the old one for backward compat during transition). The v2 feed should:

- Query both `reports` (status = 'approved') and `phenomena` (status = 'active', has ai_summary)
- Score both content types using a unified quality metric:
  - Reports: +3 if has media/images, +2 if has summary, +1 if has location, +1 if credibility is 'verified' or 'high', +2 if has feed_hook (check if column exists)
  - Phenomena: existing scoring (image +3, description +1, quick_facts +1, reports +2)
- Interleave at roughly a 3:1 ratio (3 reports per 1 phenomenon) — reports are the main attraction
- Maintain the existing seeded shuffle, tiered interleave, and category diversity algorithms
- Return a unified item shape:

```typescript
interface FeedItemV2 {
  id: string
  type: 'report' | 'phenomenon'
  title: string          // report.title or phenomenon.name
  slug: string
  category: string
  image_url: string | null
  hook: string | null     // feed_hook for reports, ai_summary for phenomena
  summary: string | null  // report.summary or phenomenon.ai_description
  location: string | null
  date: string | null     // event_date or first_reported_date
  credibility: string | null  // reports only
  aliases: string[] | null    // phenomena only
  quick_facts: object | null  // phenomena only
  report_count: number | null // phenomena only
}
```

### 2. Three Card Templates

Replace the single card design with three templates based on content type and available data:

**Template A — Text Report Card (reports without strong images)**
- Full-screen dark card
- Large, dramatic serif/display typography for the hook text (2-3 lines max)
- Category color accent (thin top bar or side bar)
- Location + date in subtle footer
- Credibility indicator if available
- Visual: think longform journalism cover — the TEXT is the visual

**Template B — Media Report Card (reports with images/video)**
- Full-bleed hero image fills ~60% of viewport
- Gradient overlay from bottom (dark) to transparent (top)
- Title overlaid on the gradient in bold white
- Hook text below the image area (1-2 lines)
- Category badge floating top-left over image
- If video media exists, show a play indicator

**Template C — Phenomenon Card (encyclopedia entries)**
- Keep close to the current design (it works well for phenomena)
- Background image with dark gradient overlay
- Phenomenon name large and centered
- AI summary (line-clamp-3)
- Quick fact pills
- Aliases shown if available
- Visual distinction from report cards — maybe a subtle "Encyclopedia" or book icon badge so users learn the two content types

**Template assignment logic:**
```
if (item.type === 'phenomenon') -> Template C
else if (item.image_url && image is not placeholder) -> Template B
else -> Template A
```

### 3. Horizontal Swipe for Related Content

This is the signature interaction. When viewing any card, swiping RIGHT reveals a horizontal tray of related content. Think: TikTok vertical scroll + Netflix horizontal rows.

**Implementation approach:**

- Use **Framer Motion** (already installed: v11.5.0) for horizontal swipe gesture detection
- Each card in the vertical feed becomes a horizontal swipe container
- Default position: the main card (x: 0)
- Swipe right: reveals a horizontal scrollable row of 4-6 related content cards
- Swipe left or tap "back": returns to main card

**Related content source:**
- For reports: call `/api/ai/report-similar?slug=X` (Session 15 endpoint — returns vector-similarity matched reports with similarity percentages)
- For phenomena: query reports linked to that phenomenon, or use `/api/ai/related?query=phenomenon_name`
- Lazy-load related content only when user initiates the swipe (don't pre-fetch for every card)

**Related content card design (mini cards in horizontal tray):**
- Compact: ~200px wide, full viewport height
- Show: title, category badge, similarity percentage (from API), location
- Tap navigates to that report's detail page
- The horizontal tray should feel like peeking into a rabbit hole of connected reports

**Swipe hint UX:**
- On the first card only, show a subtle animated hint: a small chevron or "swipe for related" text that fades after 2 seconds
- After the user successfully swipes once, never show the hint again (track in sessionStorage or component state)

**Framer Motion implementation sketch:**
```jsx
// Wrap each card in a motion container
<motion.div
  drag="x"
  dragConstraints={{ left: -relatedWidth, right: 0 }}
  onDragEnd={function(e, info) {
    if (info.offset.x < -50) {
      // Reveal related content
      loadRelated(item.slug)
    }
  }}
>
  {/* Main card at x=0 */}
  {/* Related tray slides in from right */}
</motion.div>
```

### 4. Completion Signals & Progression

- **Progress indicator:** Subtle dot indicator or thin progress bar showing position in feed (e.g., "3 of 47")
- **Content type indicator:** Small badge or icon showing whether current card is a Report or Encyclopedia entry
- **Infinite scroll trigger:** When user reaches card N-3, pre-fetch next batch (existing pattern, just wire it to v2 API)
- **End-of-feed state:** When all content is exhausted, show a "You've explored everything" message with a CTA to submit their own report or try the AI chat

### 5. Signup Gate (Preserve Existing)

The current signup prompt shows at card 6 for non-authenticated users. Keep this behavior. Adjust the index if needed based on the new mixed content feed pacing.

---

## Technical Constraints

- **SWC compliance:** Use `var` (not const/let), `function(){}` syntax, string concatenation (not template literals), unicode escapes for special chars. No template literals in JSX.
- **Framer Motion:** Import from `framer-motion`. Already in package.json (v11.5.0). Has NOT been used in this file before — you're adding it fresh.
- **CSS snap scroll:** The current vertical scroll uses `snap-y snap-mandatory`. This may conflict with Framer Motion horizontal drag. You may need to:
  - Keep snap scroll for vertical navigation between cards
  - Use Framer Motion only for the horizontal related-content gesture within each card
  - Test that both work together without fighting
- **Performance:** The feed currently lazy-loads 15 items at a time. Keep this pattern. Related content must be lazy-loaded per-card (only when swipe initiated), NOT pre-fetched for all visible cards.
- **Dark theme:** Site uses dark background (gray-950). All text on dark.
- **Existing file:** `src/pages/discover.tsx` — you can either refactor in place or create a new file and update the route. If refactoring in place, the file will grow significantly — consider extracting card templates into `src/components/discover/` subcomponents.

**Files to create/modify:**
- `src/pages/api/discover/feed-v2.ts` — NEW: mixed content feed API
- `src/pages/discover.tsx` — MAJOR REWRITE
- `src/components/discover/TextReportCard.tsx` — NEW (optional extraction)
- `src/components/discover/MediaReportCard.tsx` — NEW (optional extraction)
- `src/components/discover/PhenomenonCard.tsx` — NEW (optional extraction)
- `src/components/discover/RelatedTray.tsx` — NEW: horizontal related content
- `src/components/discover/SwipeHint.tsx` — NEW: first-time swipe hint

---

## API Endpoints Available

These Session 15 endpoints are live on beta.discoverparadocs.com and can be called from the frontend:

| Endpoint | Use For |
|----------|---------|
| `GET /api/ai/report-similar?slug=X` | Related reports for horizontal swipe tray |
| `GET /api/ai/related?query=X` | Related content for any search term (backup) |
| `POST /api/ai/search` | Semantic search (if needed for discovery features) |

---

## Definition of Done

- [ ] Feed shows both reports AND phenomena in an interleaved mix
- [ ] Three distinct card templates render based on content type and available media
- [ ] Text Report cards use dramatic typography that makes text-heavy content feel visually compelling
- [ ] Media Report cards show hero images with gradient overlays
- [ ] Horizontal swipe right on any card reveals related content tray
- [ ] Related content loaded lazily via `/api/ai/report-similar` or `/api/ai/related`
- [ ] Swipe hint shown on first card, disappears after first successful swipe
- [ ] Vertical snap scroll still works smoothly between cards
- [ ] Framer Motion horizontal drag doesn't conflict with vertical scroll
- [ ] Feed pagination works (infinite scroll, 15 items per batch)
- [ ] Signup gate preserved at appropriate card index
- [ ] Mobile-first: works great on 375px viewport, scales up to desktop
- [ ] No regressions to existing pages
- [ ] Update `HANDOFF_EXPLORE.md` with what you changed

---

## Design Philosophy

The Discover feed is where Paradocs becomes addictive. Every card should create a micro-moment of "wait, what?" that makes the user want to know more. The vertical scroll creates the dopamine loop (what's next?). The horizontal swipe creates the rabbit hole (what's connected?). Together they turn a database of reports into an experience that feels like exploring the unknown.

Text-heavy reports are NOT a weakness — they're the product's superpower. A well-formatted text card with a killer hook line can be more arresting than a generic stock image. Lean into dramatic typography, cinematic language, and the inherent eeriness of real people's accounts.
