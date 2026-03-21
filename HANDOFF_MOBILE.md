# HANDOFF - Mobile-First Design System (Session 13)

**Last updated:** March 15, 2026
**Session focus:** Cross-cutting mobile UX design system, navigation, and screen-by-screen redesign
**Design references:** Netflix, Uber, Spotify, Apple Maps

---

## Nav Architecture: Unified Mobile Bottom Tabs (RESOLVED)

Discovered dual layout problem during Phase 3a (March 14). **RESOLVED** during Session 13 Nav Unification (March 15).

### How Page Layouts Work (`_app.tsx`)

```
STANDALONE_PAGES = ['/beta-access', '/survey', '/discover']  → No layout wrapper (full-screen immersive)
CUSTOM_LAYOUT_PREFIXES = ['/dashboard']                       → DashboardLayout.tsx (sidebar + MobileBottomTabs)
Everything else                                                → Layout.tsx (public header + MobileBottomTabs)
```

### Unified Bottom Tab Bar (SAME component everywhere)

Both `Layout.tsx` and `DashboardLayout.tsx` now render the same `MobileBottomTabs` component. The tabs are identical on every page:

**Tabs:** Explore (Compass) | Map (MapIcon) | **Stories FAB** (Flame, elevated center) | Library/Encyclopedia (auth-aware) | More (Menu)

- **4th tab is auth-aware:** Non-logged-in users see "Encyclopedia" (BookOpen → `/phenomena`). Logged-in users see "Library" (LayoutDashboard → `/dashboard`).
- **Stories FAB:** Elevated circular center button with Flame icon — the TikTok-like casual user hook. Visually distinct from other tabs (larger, elevated, colored background). Route remains `/discover`; renamed to "Stories" per Session 7 desktop nav update.
- **More sheet** (MobileBottomSheet): Unified menu with sections:
  - Browse: Home, Encyclopedia (logged-in only, since their tab is Library), AI Insights, Submit Report
  - My Paradocs (logged-in only): Research Hub, Constellation, Saved Reports, My Reports, Journal, Weekly Digests
  - Account: Subscription + Settings + Sign Out (logged-in) OR Sign In (guest)

### Auth Detection

MobileBottomTabs uses a lightweight `supabase.auth.getSession()` check — no API call, just session existence. Listens for auth state changes to update in real-time.

**Discover page** (`/discover`): Standalone — no layout wrapper, no nav chrome. TikTok-like full-screen immersive. Intentionally standalone per Chase's direction.

### What Was Removed

- Layout.tsx: Entire inline mobile bottom nav (old Explore/Map/Discover FAB/Encyclopedia/More bar), slide-up "More" panel, `mobileMenuOpen` state, `<style jsx global>` MobileDropdownHide block (no longer needed — desktop dropdown already uses `hidden md:block`)
- Old MobileBottomTabs: Dashboard-only tabs (Home/Explore/Research/Stars/More) replaced with unified tabs

---

## Current Mobile State

### Phase 1 & 2 COMPLETE (Session 13, March 14, 2026)

Mobile design system foundation deployed. Bottom tab navigation replaces hamburger menu in DashboardLayout. Reusable components created. Design tokens established.

#### New Components Created

**`src/components/mobile/MobileBottomTabs.tsx`**
- Persistent 5-tab bottom navigation bar: Home, Explore, Research, Stars (Constellation), More
- Tab ordering prioritizes content browsing ($5.99 casual users) over research tools ($14.99 power users)
- "More" tab opens a MobileBottomSheet with secondary nav: Saved Reports, My Reports, Journal, Digests, AI Insights, Subscription, Settings, Sign Out
- Constellation tab shows lock icon for non-pro users, links to subscription page
- Respects safe-area-inset-bottom for iPhone home indicator
- Hidden on desktop (`md:hidden`)

**`src/components/mobile/MobileBottomSheet.tsx`**
- Gesture-driven bottom sheet with touch swipe-to-dismiss
- Three snap points: peek (35vh), half (55vh), full (90vh)
- Velocity-based dismiss detection (swipe down fast = dismiss)
- CSS transform + transition animations (no libraries)
- Prevents body scroll when open (adds `sheet-open` class)
- Reusable for: artifact detail, case file picker, quick-add, "More" nav, map report panel

**`src/components/mobile/MobileHeader.tsx`**
- Consistent mobile top bar with safe-area handling
- Patterns: default (centered title), detail (back + title + actions), search (full-width bar)
- Props: `title`, `showBack`, `onBack`, `actions` (right slot), `leftSlot`, `bordered`
- 44px minimum touch targets on back button

**`src/components/mobile/MobileCardRow.tsx`**
- Netflix-style horizontal scrollable card row
- Scroll-snap alignment, peek-at-next (85% card width), hidden scrollbar
- Touch-action isolation (`pan-x` only)
- Optional section title, subtitle, icon, "See All" link
- Optional dot indicators for active card
- `MobileCardRowItem` wrapper component for snap-aligned cards

**`src/components/mobile/index.ts`** — barrel export

#### Design Tokens Added

**`tailwind.config.js`**
- `spacing.touch`: 44px (Apple HIG minimum touch target)
- `spacing.nav`: 64px (bottom tab bar height)
- `animation.slide-up`, `slide-down`, `slide-in-right`, `fade-in`
- Corresponding keyframes (in config, not inline `<style>`)

**`src/styles/globals.css`** — new mobile utilities:
- `.mobile-nav-height`: height including safe area
- `.mobile-content-pb`: content padding to clear bottom tab bar (resets to 1.5rem on desktop)
- `.mobile-fab-bottom`: FAB positioning above bottom tabs (resets to 2rem on desktop)
- `.safe-area-background`, `.dashboard-mobile-header-positioned`, `.mobile-title-offset`: migrated from inline `<style jsx global>` in DashboardLayout
- `.bottom-sheet-backdrop`, `.sheet-handle`: bottom sheet UI utilities
- `.touch-pan-x`, `.touch-pan-y`, `.overscroll-contain`: touch interaction isolation
- `body.sheet-open`: prevents scroll when sheet is open

#### Files Modified

**`src/components/dashboard/DashboardLayout.tsx`** — Major rewrite:
- REMOVED: Hamburger menu (slide-from-right overlay), mobileMenuOpen state, entire Mobile Menu Overlay section
- REMOVED: `<style jsx global>` block (CSS migrated to globals.css and tailwind.config.js)
- ADDED: `MobileBottomTabs` component rendered at bottom of layout
- CHANGED: Mobile content area uses `.mobile-content-pb` instead of hardcoded `pb-20`
- CHANGED: Mobile header simplified — no hamburger button, just logo + bell notification
- CHANGED: Converted arrow functions to function declarations for SWC compliance
- Desktop sidebar completely untouched

**`src/components/dashboard/research-hub/ViewSwitcher.tsx`** — Rewritten:
- Labels now VISIBLE on mobile (was `hidden sm:inline`, now always shown)
- Short labels on mobile ("Stars"), full labels on desktop ("Constellation")
- Smaller padding on mobile (`px-2.5 py-1.5 text-xs` vs `px-3 py-2 text-sm`)
- Removed unused tooltip state for "Coming Soon" feature
- Converted to SWC-compliant syntax

**`src/components/dashboard/research-hub/ResearchHub.tsx`** — Minor update:
- Case file picker button (hamburger icon) remains but is now specifically for opening the case file sidebar, not for navigation
- ViewSwitcher wrapper div now has `overflow-x-auto scrollbar-hide` for horizontal scroll on narrow screens

**`src/components/dashboard/research-hub/BoardView.tsx`** — Minor update:
- Floating action buttons now use `.mobile-fab-bottom` class instead of `bottom-6`
- This positions FABs above the bottom tab bar on mobile, at normal position on desktop

### What's Been Done Previously (Session 5, March 13-14, 2026)

Incremental mobile fixes applied during Research Hub development:

- BoardView: CSS-only responsive layout (`sm:hidden` / `hidden sm:grid`), single-column on mobile
- ArtifactDetailDrawer: Full-screen on mobile (`w-full sm:w-96`), enlarged back button touch target
- ResearchHub: overflow containment, responsive padding
- ArtifactCard: Always-visible actions on mobile, responsive thumbnail height
- Dashboard index: Truncation, overflow-hidden, responsive metric pills
- DashboardLayout: Safe area handling (now migrated to globals.css)

### Phase 3a COMPLETE: Report Detail Mobile Redesign (Session 13, March 14, 2026)

**`src/pages/report/[slug].tsx`** — Mobile reading experience overhaul:

- **Bug fix:** Reading progress bar was misplaced inside the error/not-found conditional block. Moved to main render so it displays during actual report reading.
- **Mobile back button:** Inline back button (ChevronRight rotated 180) + category link replaces breadcrumb on mobile. Desktop breadcrumb unchanged. Note: report page is wrapped in `Layout.tsx` (not DashboardLayout), which already provides its own fixed header and mobile bottom nav bar (Explore, Map, Discover, Encyclopedia, More). MobileHeader and MobileBottomTabs are NOT used here to avoid duplicate navigation.
- **Sticky action bar → inline on mobile:** Voting/share/save bar is `md:sticky md:bottom-0` — stays sticky on desktop but flows inline on mobile to avoid overlapping Layout.tsx's bottom nav. Added `rounded-xl` on mobile for visual distinction.
- **Native share:** `navigator.share` is now the primary share method (triggers iOS/Android share sheet). Falls back to clipboard copy on desktop.
- **Typography:** Title scales from `text-xl` (mobile) to `text-4xl` (desktop) with `leading-tight`. Prose content uses `max-w-prose` on mobile for comfortable line length, `max-w-none` on desktop. Font size forced to 16px on mobile (prevents iOS zoom on focus).
- **Content spacing:** `mobile-title-offset` class adds top padding to clear MobileHeader + safe area. `mobile-content-pb` adds bottom padding to clear bottom tabs.

### Nav Unification COMPLETE (Session 13, March 15, 2026)

**`src/components/mobile/MobileBottomTabs.tsx`** — Complete rewrite:
- REMOVED: Dashboard-only tab structure (Home/Explore/Research/Stars/More)
- REMOVED: `useSubscription` dependency (no longer needed for tab gating)
- ADDED: Unified 5-tab bar used by both Layout.tsx and DashboardLayout
- ADDED: Auth-aware 4th tab (Encyclopedia for guests, Library/Dashboard for logged-in)
- ADDED: Stories FAB (elevated center button with Flame icon, route `/discover`)
- ADDED: Comprehensive More sheet with Browse + My Paradocs + Account sections
- ADDED: Lightweight auth check via `supabase.auth.getSession()` (no API call)
- ADDED: `MoreLink` helper component for DRY More sheet items
- SWC compliant: `var`, `function(){}`, string concatenation

**`src/components/Layout.tsx`** — Major cleanup:
- REMOVED: Entire mobile bottom nav (lines 212-285 of old file)
- REMOVED: Slide-up "More" menu panel (lines 287-433 of old file)
- REMOVED: `mobileMenuOpen` state
- REMOVED: `<style jsx global>` MobileDropdownHide component (SWC violation eliminated)
- REMOVED: Unused imports (Menu, X, BarChart3, Star, Bookmark)
- ADDED: `MobileBottomTabs` import and render
- Desktop header nav unchanged

**`src/pages/report/[slug].tsx`** — Quick fix:
- Reading progress bar: `h-[3px]` → `h-1.5` (6px) for better visibility

### Known Issues (Remaining)

**RESOLVED:** ~~Nav Unification~~ ✅ (March 15, 2026)
**RESOLVED:** ~~Layout.tsx `<style jsx global>` block~~ ✅ (removed entirely, no longer needed)

**Phase 3 Remaining Screens:**
3. **ArtifactDetailDrawer** — Still slides from right as a full-screen overlay on mobile. Should become a bottom sheet (use MobileBottomSheet).
4. **ArtifactQuickAdd** — Modal overlay, not a bottom sheet. URL paste field should be at top of sheet for mobile keyboard.
5. **Explore page** — Title `text-3xl` too large on mobile. Feed scroll arrows invisible on touch. Uses Layout.tsx wrapper.
6. **Map page** — Selected report panel should be bottom sheet on mobile. Legend/filter button collision on narrow screens.
7. **Constellation map** — D3 touch controls unverified.
8. **Dashboard home** — Needs mobile-first layout hierarchy (Netflix-style card rows, compact activity feed, horizontal metric pills).
9. **Journal, Search, Settings** — Unaudited.
10. **MobileSidebar.tsx** — Still exists as case-file picker in Research Hub. Could refactor to use MobileBottomSheet for consistency. Low priority.
11. **Report detail: progressive disclosure** — Environmental Context + Academic Observation Panel could be collapsible on mobile. Low priority.

## API Endpoints

**PUT /api/research-hub/artifacts/[id]** — Created March 14, 2026
- Handles verdict, user_note, tags, title, description updates

## Database Schema Reference

No mobile-specific tables. All existing tables documented in `HANDOFF_DASHBOARD.md`.

## Design Philosophy

Per Chase's direction: Paradocs is **content-browsing first, research tool second** on mobile.

- $5.99 users (500K potential) are browsers — Netflix-scrolling through reports at midnight. The experience should feel like falling down a rabbit hole.
- $14.99 users (100K+ potential) are researchers — building case files, tagging artifacts, drawing connections. They probably started as $5.99 users who got hooked.
- Bottom tab ordering reflects this: Home > Explore > Research > Stars > More
- Content browsing UX (Explore feed, report reading, save/react/share) is higher priority than Research Hub polish

## Tech Stack Notes for Mobile

- **CSS-first responsive:** Always use Tailwind responsive classes. NEVER use JavaScript viewport detection.
- **Touch targets:** Minimum 44px (Apple HIG). Use `p-2.5` or `p-3` on buttons.
- **Safe areas:** Handled by CSS utilities in globals.css.
- **Animations:** Use Tailwind config keyframes, NOT inline `<style>` with CSS keyframes.
- **SWC constraints:** No template literals in JSX, use `var`, use `function(){}`, string concatenation with `+`, `classNames()` utility.
- **Bottom sheets:** Use MobileBottomSheet component for all mobile detail/picker/modal surfaces.
