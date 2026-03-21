# Session Prompt: Phase 1 — Homepage Preview Cards Redesign

**Session:** Paradocs - Search, Navigation & Homepage (Session 7)
**Scope:** Redesign the "From the database" DiscoverPreview section on the homepage
**Priority:** High — this is the top-of-funnel hook that drives users into the Discover feed

---

## Context

Read these files before starting:
- `PROJECT_STATUS.md` (root) — overall project coordination doc
- `HANDOFF_SEARCH_NAV.md` (root) — your session's handoff document
- `src/components/homepage/DiscoverPreview.tsx` (129 lines) — the component you're redesigning

The homepage "From the database" section currently shows 4 identical-format cards in a grid. Each card has: category badge, title (line-clamp-2), first sentence of summary (line-clamp-2), and location. They all look the same. This is a problem.

The goal: make these 4 cards visually varied, editorially compelling, and optimized for click-through — like a curated magazine spread, not a database dump.

---

## What to Build

### 1. Visual Variety Across the 4 Cards

Do NOT render 4 identical cards. Alternate between 2-3 distinct card formats so the section feels curated rather than auto-generated. Suggested formats:

**Format A — Image-Led Card (use when report has media)**
- Hero image fills the top ~60% of the card
- Category color accent bar (thin, left edge or top edge)
- Title overlaid on gradient at bottom of image
- No summary text — the image IS the hook
- Fallback: if no image, use a category-colored gradient background with large title typography

**Format B — Pull-Quote Card (text-forward)**
- No image
- Large, dramatic quote-style typography for the hook line
- Category-colored left border or accent
- Title smaller below the quote
- Location + date subtle at bottom

**Format C — Stat-Led Card (when credibility or data is strong)**
- Bold stat or data point at top (e.g., "47 witnesses", "Investigated by MUFON", credibility badge)
- Title below
- One-line summary
- Category accent

Assign formats based on available data: if report has media, prefer Format A. If summary is particularly vivid, prefer Format B. Default to a mix.

### 2. Hook-Quality Copy

The current code does this:
```js
var firstLine = report.summary
  ? report.summary.split('.')[0] + '.'
  : 'An intriguing report waiting for your investigation.'
```

This produces boring truncated database text. Instead:

- If the report has a `feed_hook` field (will be added in a future session — check for it), use that. It's an AI-generated 2-3 sentence tension hook.
- If no `feed_hook`, extract a more compelling snippet: look for the most vivid sentence in the summary (not always the first one). Consider using the second or third sentence if the first is generic.
- Fallback: format the title itself as the hook with atmospheric framing.

### 3. Category Color System

Use the existing `CATEGORY_CONFIG` from `@/lib/constants` for category colors. Apply category color as:
- Accent borders or bars (not full background fills)
- Badge colors (already done)
- Subtle gradient tints on hover

The brand color is `#9000F0` (primary-500 in Tailwind config). Category accents should complement, not compete.

### 4. Section Header & CTA

Current: "From the database" heading + "Start swiping" CTA button.

Update to:
- Header: "Stories from the unknown" or similar (test what feels right — should evoke curiosity, not clinical database language)
- Subhead: keep it short, one line, emphasizing the human experience angle
- CTA: "Explore stories" or "Dive in" — link to /discover. Keep the Play icon if it works, or swap for ArrowRight.

### 5. Responsive Layout

Current: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

Consider instead:
- Mobile: single column, but make Format A cards full-bleed (edge-to-edge) for impact
- Tablet: 2 columns, alternating large/small
- Desktop: keep 4-column grid but with varied card heights (masonry-lite feel via row-span)

### 6. Data Fetching Enhancement

Current query fetches 4 most recent approved reports. Enhance:
- Fetch 8-10 reports, then select the best 4 based on content richness (has image? has strong summary? has location?)
- Prioritize variety: don't show 4 from the same category
- Consider fetching `media` column to check for images (current query doesn't include it)
- Add `feed_hook` to the select if the column exists (graceful — don't break if it doesn't)

Updated interface:
```typescript
interface PreviewReport {
  id: string
  title: string
  slug: string
  summary: string | null
  feed_hook: string | null  // may not exist yet — handle gracefully
  category: string
  location_name: string | null
  event_date: string | null
  credibility: string | null
  media: any[] | null  // for checking if images exist
}
```

---

## Technical Constraints

- **SWC compliance:** Use `var` (not const/let), `function(){}` syntax, string concatenation (not template literals), unicode escapes for special chars. No template literals in JSX.
- **File to modify:** `src/components/homepage/DiscoverPreview.tsx`
- **Existing imports available:** React, Link (next/link), MapPin/Play (lucide-react), supabase, CATEGORY_CONFIG, classNames
- **Keep it a single component file** — no new files needed for this phase
- **Tailwind only** for styling (no CSS files)
- **Dark theme** — the site uses a dark background (gray-950). All text on dark.

---

## Definition of Done

- [ ] 4 homepage preview cards render with at least 2 visually distinct formats
- [ ] Cards look curated, not auto-generated — visual variety is obvious
- [ ] Hook copy is more compelling than raw first-sentence truncation
- [ ] Category color accents are visible but subtle
- [ ] Section header and CTA updated to be more evocative
- [ ] Responsive: looks great on mobile (375px), tablet (768px), desktop (1280px)
- [ ] `feed_hook` field is used when available, graceful fallback when not
- [ ] No regressions to other homepage sections
- [ ] Update `HANDOFF_SEARCH_NAV.md` with what you changed

---

## Reference: Current Card Rendering (what to replace)

The entire `ReportCard` component in DiscoverPreview.tsx needs to be replaced with 2-3 format-specific card components. The parent `DiscoverPreview` component structure (useEffect fetch, loading state, section wrapper) can stay similar but needs the enhanced query and format-assignment logic.
