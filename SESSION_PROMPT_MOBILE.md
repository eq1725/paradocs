# Session Prompt — Mobile-First Design System (Session 13)

Paste this into a new Claude session to continue:

---

This is the **Mobile-First Design System session (Session 13)**, a cross-cutting session that establishes world-class mobile UX across the entire Paradocs platform.

## Startup Instructions

Read these files in order before doing anything:

1. `PROJECT_STATUS.md` — Check all 12 session scopes and Cross-Feature Notes
2. `HANDOFF_MOBILE.md` — Full context on current mobile state, audit findings, and the design system plan
3. `CONSTELLATION_V2_DESIGN.md` — Research Hub architecture (the most complex mobile surface)

## Mission

Transform Paradocs from a desktop-first site with responsive CSS patches into a **mobile-native experience** that rivals Netflix, Uber, and Spotify in polish and intuitiveness. This session owns the mobile design system — reusable patterns, components, and navigation that all other sessions inherit.

## Design Philosophy & References

Model the mobile experience on these world-class apps:

- **Netflix:** Horizontal scrollable category rows, edge-to-edge imagery, minimal text per card, smooth list-to-detail transitions, bottom tab navigation
- **Uber:** Clean information hierarchy, prominent primary CTAs, bottom sheets for contextual info, consistent back/close patterns, progressive disclosure
- **Spotify:** Bottom tab navigation with 4-5 primary destinations, search-first discovery, card-based content with clear visual hierarchy, full-screen detail views
- **Apple Maps:** Gesture-driven bottom sheets that pull up from the bottom, progressive disclosure of detail layers, swipe-to-dismiss

Core principles:
- **44px minimum touch targets** (Apple Human Interface Guidelines)
- **Thumb-zone design** — primary actions reachable with one hand
- **Content-first** — minimize chrome, maximize content density per screen
- **Progressive disclosure** — show summary first, detail on demand
- **Native feel** — swipe gestures, bottom sheets, smooth transitions (no page reloads)
- **Offline-first mindset** — skeleton loading states that feel fast even on slow connections

## Current State (What's Wrong)

Session 5 attempted incremental mobile fixes but the core problems are architectural:

### Navigation
- **Hamburger menu** slides from right — users must reach top-right corner (worst thumb zone)
- No persistent bottom tab bar — users lose context of where they are
- Research Hub has its own sidebar + mobile sidebar separate from the dashboard nav
- Back navigation is inconsistent — some pages use browser back, others have arrow buttons, some have no way back

### Research Hub (Session 5's domain)
- Board View now renders single-column cards on mobile via CSS (`sm:hidden` / `hidden sm:grid`) — this was fixed in the last commit
- Artifact detail drawer covers full screen (`w-full`) but back button touch target was too small (enlarged to `p-2.5` in latest fix)
- No swipe-to-dismiss on the detail drawer
- Floating action buttons ("New Case" + "Add Artifact") at bottom — functional but not integrated into a bottom bar
- Case file headers can get cramped on narrow screens
- Quick-add modal isn't optimized for mobile keyboard

### Dashboard
- Text boxes overflow/truncate at viewport edge — partially fixed with `truncate`, `overflow-hidden`, `min-w-0`, `flex-shrink-0`
- Constellation mini-map overlay cluttered on mobile — partially fixed by hiding star count, shorter button text
- Metric pills too wide on small screens — partially fixed with responsive padding
- No mobile-specific layout hierarchy (everything stacked linearly)
- Empty state CTA buttons now stack vertically on mobile

### Other Pages (NOT yet touched)
- **Explore/Discovery feed:** Unknown mobile state — needs audit
- **Map page:** Leaflet map likely has touch interaction issues
- **Report detail:** 40K+ line page, mobile reading experience unknown
- **Constellation map:** D3 canvas-based force graph, touch controls unknown
- **Search:** Full-text search page mobile state unknown
- **Journal:** Entry list and editor mobile state unknown
- **Settings/Subscription:** Form layouts may overflow
- **Login/Onboarding:** Three separate onboarding components, unknown mobile state

## What Needs to Be Built

### Phase 1: Design Tokens & Component Library

Establish the mobile design language that all sessions inherit:

**Spacing scale:**
- `space-safe` — safe area insets (notch/Dynamic Island)
- `space-nav` — bottom tab bar height (e.g., 56-64px + safe area bottom)
- `space-touch` — minimum touch target (44px)
- Standard Tailwind spacing scale for everything else

**Typography hierarchy (mobile):**
- Page title: `text-lg font-bold` (not `text-2xl`)
- Section header: `text-base font-semibold`
- Card title: `text-sm font-medium`
- Body: `text-sm`
- Caption/metadata: `text-xs`

**Reusable mobile components to create:**
- `MobileBottomTabs` — persistent bottom navigation (Dashboard, Research Hub, Explore, Constellation, More)
- `MobileBottomSheet` — gesture-driven bottom sheet (pull up to expand, swipe down to dismiss) for detail views
- `MobileHeader` — consistent top bar with back button, title, and action buttons
- `MobileCardRow` — horizontal scrollable card row (Netflix-style) with peek-at-next
- `MobileActionBar` — floating action bar that integrates with bottom tabs
- `SwipeablePage` — wrapper that supports swipe-right-to-go-back
- `MobileSkeletonLoader` — content-shaped loading states (not generic pulses)

**Shared CSS utilities:**
- Safe area handling (already partially done in DashboardLayout)
- Hide scrollbar utility
- Touch-action isolation
- Bottom padding for tab bar clearance

### Phase 2: Navigation Shell

Replace the current hamburger menu with a bottom tab bar system:

**Bottom tabs (5 items):**
1. Home (Dashboard) — `LayoutDashboard` icon
2. Research — `FlaskConical` icon (Research Hub)
3. Explore — `Compass` icon
4. Constellation — `Stars` icon
5. More — `Menu` icon (opens bottom sheet with: Journal, Saved, Reports, Digests, Settings, Subscription, Sign Out)

**Header pattern:**
- Default: App title or page title, centered
- Detail pages: Back arrow (left), page title (center), actions (right)
- Search pages: Search bar spanning full width

**Drawer/Sheet pattern:**
- Artifact detail: bottom sheet that slides up (not full-screen sidebar)
- Case file picker: bottom sheet
- Quick-add: bottom sheet with URL paste field at top
- Settings panels: full-screen push navigation

### Phase 3: Screen-by-Screen Redesign

Work through each session's screens, highest-traffic first:

**Priority 1 — Dashboard (`/dashboard`):**
- Hero: welcome text + single prominent CTA
- Research Hub summary: Netflix-style horizontal card row for case files, vertical list for recent artifacts
- Activity feed: compact timeline
- Metric pills: horizontal scroll row (not wrapping grid)
- Constellation preview: full-width with simple "View Map" overlay

**Priority 2 — Research Hub (`/dashboard/research-hub`):**
- Board View: full-width stacked cards with visible action buttons
- Artifact detail: bottom sheet (swipe up to expand, swipe down to dismiss)
- Quick-add: bottom sheet modal optimized for mobile keyboard
- Case file headers: collapsible with artifact count badge
- View switcher: horizontal pill selector (not icon-only buttons)

**Priority 3 — Explore feed (`/explore`):**
- Card-based discovery feed (Instagram/TikTok style vertical scroll)
- Category filter: horizontal chip row at top
- Report preview cards: thumbnail-heavy, minimal text

**Priority 4 — Report detail (`/report/[slug]`):**
- Progressive disclosure: summary hero → evidence → analysis → connections
- Sticky bottom bar with Save/React/Share actions
- Readable text column width (max-w-prose equivalent)
- Image gallery: swipeable full-screen viewer

**Priority 5 — Map (`/map`):**
- Full-screen map with bottom sheet for selected report
- Touch-optimized controls (pinch zoom, tap marker)
- Filter chips overlay at top

**Priority 6 — Constellation (`/dashboard/constellation`):**
- Touch-optimized D3 canvas (pinch zoom, drag pan, tap node)
- Bottom sheet for node details
- Simplified controls for mobile

**Priority 7+ — Remaining pages:**
- Journal, Search, Settings, Subscription, Login/Onboarding

## Files That Will Be Modified

This session will touch files across many other sessions' domains. Changes will be documented in the Cross-Feature Notes table in `PROJECT_STATUS.md`.

**Core new files (this session creates):**
- `src/components/mobile/MobileBottomTabs.tsx`
- `src/components/mobile/MobileBottomSheet.tsx`
- `src/components/mobile/MobileHeader.tsx`
- `src/components/mobile/MobileCardRow.tsx`
- `src/components/mobile/MobileActionBar.tsx`
- `src/components/mobile/index.ts`
- `src/styles/mobile.css` (or utilities in globals.css)
- `HANDOFF_MOBILE.md`

**Files that will be modified (partial list):**
- `src/components/dashboard/DashboardLayout.tsx` — Replace hamburger menu with bottom tabs on mobile
- `src/pages/dashboard/index.tsx` — Mobile-first dashboard layout
- `src/components/dashboard/research-hub/BoardView.tsx` — Mobile card layout (partially done)
- `src/components/dashboard/research-hub/ArtifactDetailDrawer.tsx` — Convert to bottom sheet on mobile
- `src/components/dashboard/research-hub/ArtifactQuickAdd.tsx` — Bottom sheet modal
- `src/components/dashboard/research-hub/ResearchHub.tsx` — Mobile navigation integration
- `src/components/dashboard/research-hub/ViewSwitcher.tsx` — Mobile-friendly view selector
- `src/pages/explore.tsx` — Mobile feed layout
- Various other page components

## Critical Constraints

- **SWC:** No template literals in JSX, use `var`, use `function(){}`, unicode escapes for smart quotes
- **Push method:** User pushes via git CLI on their local machine. Prepare changes, then provide exact git commands for the user to run.
- **TypeScript:** `ignoreBuildErrors: true` in next.config.js, but webpack module resolution errors WILL fail the build
- **Leaflet:** Must use `next/dynamic` with `{ ssr: false }` for any map components
- **Animations:** Use Tailwind built-in classes, NOT inline `<style>` with CSS keyframes
- **CSS-first responsive:** Use Tailwind responsive classes (`sm:hidden`, `hidden sm:block`, etc.) instead of JavaScript viewport detection (`useState` + `useEffect` on `window.innerWidth`). JS detection causes hydration flash where desktop layout renders briefly on mobile before the useEffect fires.
- **No template literal workaround:** String concatenation with `+` operator, or `classNames()` utility from `src/lib/utils.ts`

## Project Details

- **Stack:** Next.js 14 Pages Router, Supabase, Vercel, Tailwind
- **Site:** beta.discoverparadocs.com
- **Repo:** github.com/eq1725/paradocs (main branch, auto-deploy on push)
- **DB:** Supabase project `bhkbctdmwnowfmqpksed`

## Coordination Protocol

This session is cross-cutting. After every batch of changes:
1. Update `HANDOFF_MOBILE.md` with what was changed
2. Add a row to Cross-Feature Notes in `PROJECT_STATUS.md` noting which sessions' files were modified
3. Note any breaking changes or API contracts that other sessions need to adopt

## Start

Begin by auditing every mobile-facing page. Read the key layout files (`DashboardLayout.tsx`, `ResearchHub.tsx`, `BoardView.tsx`, `ArtifactDetailDrawer.tsx`, `explore.tsx`, the report detail page, the map page) and catalog:
1. Current responsive breakpoints used
2. Touch interaction patterns (or lack thereof)
3. Overflow/layout issues on 375px viewport width
4. Navigation patterns per page

Then present a prioritized implementation plan for Phase 1 (Design Tokens + Component Library) and Phase 2 (Navigation Shell). Wait for Chase's approval before writing any code.
