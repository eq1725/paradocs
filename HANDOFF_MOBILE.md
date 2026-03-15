# HANDOFF - Mobile-First Design System (Session 13)

**Last updated:** March 14, 2026
**Session focus:** Cross-cutting mobile UX design system, navigation, and screen-by-screen redesign
**Design references:** Netflix, Uber, Spotify, Apple Maps

---

## Current Mobile State

### What's Been Done (Session 5, March 13-14, 2026)

Incremental mobile fixes applied during Research Hub development. These are CSS patches, not a cohesive design system:

**BoardView.tsx (Research Hub):**
- Replaced JS viewport detection (`useState` + `useEffect` on `window.innerWidth`) with CSS-only responsive layout (`sm:hidden` / `hidden sm:grid`)
- Mobile: single-column full-width stacked cards. Desktop: 2-3 column grid.
- Floating action buttons ("New Case" + "Add Artifact") span full width on mobile, fixed position on desktop
- Case file headers use responsive padding (`p-3 sm:p-4`), truncated titles, responsive icons
- SwipeableCardRow component exists (CSS scroll-snap) but is NOT currently used — was replaced by single-column layout due to touch-action issues with parent scroll container

**ArtifactDetailDrawer.tsx:**
- Full-screen on mobile (`w-full sm:w-96`), side drawer on desktop
- Back button touch target enlarged to `p-2.5` on mobile
- Responsive padding (`px-4 sm:px-6`, `py-4 sm:py-6`)
- Title: `text-xl sm:text-2xl` with `break-words`
- Source platform deduplication fix: skips showing `source_platform` if it matches `sourceConfig.label` (fixed "X.com · X.com")
- Source URLs use `break-all` for long URLs

**ResearchHub.tsx:**
- Content area: `overflow-y-auto overflow-x-hidden` with `overscrollBehavior: 'contain'`
- Responsive padding: `p-3 sm:p-6` on board and timeline views
- Removed duplicate floating FAB (was overlapping with BoardView's buttons)
- Responsive loading skeleton

**ArtifactCard.tsx:**
- Action buttons always visible on mobile: `compact || showActions ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'`
- Responsive thumbnail height: `h-28 sm:h-32`
- Added missing Lucide icons to the `lucideIcons` map (Archive, BookOpen, PenTool, Search, Lock, Radio)

**Dashboard (index.tsx):**
- Hero: `truncate` on welcome text, `flex-shrink-0` on CTAs, responsive button padding
- Case file cards: responsive padding (`p-3 sm:p-3.5`), `overflow-hidden`
- Recent artifact cards: `overflow-hidden`, `min-w-0`, `flex-shrink-0` on icons
- AI Insights banner: `truncate`, `flex-shrink-0`, `overflow-hidden`, responsive padding
- Activity feed: `overflow-hidden`, `truncate` on labels, responsive gap/padding
- Metric pills: responsive padding/gap (`px-2.5 sm:px-3.5`, `text-xs sm:text-sm`)
- Constellation overlay: responsive — shorter button text, hidden star count on mobile
- Account footer: hidden "saved" stat on mobile, `flex-shrink-0` on Manage link
- Empty state CTAs: stack vertically on mobile (`flex-col sm:flex-row`)
- Research Hub summary section: `overflow-hidden`

**DashboardLayout.tsx:**
- Mobile header with safe area handling (`env(safe-area-inset-top)`)
- Hamburger menu slides from right with backdrop blur
- Content area: `p-4 md:p-6 overflow-x-hidden overflow-y-auto pb-20 md:pb-6`
- Mobile title offset calculated with safe area

### Known Issues (Unsolved)

1. **No bottom tab navigation** — users must reach top-right hamburger menu
2. **No swipe-to-dismiss** on artifact detail drawer
3. **No swipe-back gesture** support (drawer blocks iOS edge swipe)
4. **Quick-add modal** not optimized for mobile keyboard
5. **Explore page** not audited for mobile
6. **Report detail page** (40K+ lines) not audited for mobile
7. **Map page** touch interactions unknown
8. **Constellation map** D3 touch controls unknown
9. **Journal** mobile state unknown
10. **Search page** mobile state unknown
11. **View switcher** in Research Hub is icon-only buttons — not obvious on mobile

## API Endpoint Created

**PUT /api/research-hub/artifacts/[id]** — Created March 14, 2026
- File: `src/pages/api/research-hub/artifacts/[id].ts`
- Handles verdict, user_note, tags, title, description updates
- Auth: Bearer token, verifies artifact belongs to user
- Previously missing — the `useResearchHub` hook was calling this endpoint but it didn't exist

## Database Schema Reference

No mobile-specific tables. All existing tables documented in `HANDOFF_DASHBOARD.md`.

## Files Modified by Session 13's Predecessor Work

All changes listed here were made during Session 5 and should be considered baseline for Session 13:

| File | Changes |
|------|---------|
| `src/components/dashboard/research-hub/BoardView.tsx` | CSS-only responsive layout, SwipeableCardRow (unused), floating buttons |
| `src/components/dashboard/research-hub/ResearchHub.tsx` | overflow-x-hidden, responsive padding, removed duplicate FAB |
| `src/components/dashboard/research-hub/ArtifactCard.tsx` | Always-visible actions on mobile, responsive thumbnail height |
| `src/components/dashboard/research-hub/ArtifactDetailDrawer.tsx` | Full-screen mobile, enlarged back button, responsive padding, dedup fix |
| `src/components/dashboard/DashboardLayout.tsx` | Safe area handling, hamburger menu, mobile header |
| `src/pages/dashboard/index.tsx` | Truncation, overflow, responsive pills/cards/CTAs |
| `src/pages/api/research-hub/artifacts/[id].ts` | NEW — PUT endpoint for artifact updates |

## Tech Stack Notes for Mobile

- **CSS-first responsive:** Always use Tailwind responsive classes (`sm:hidden`, `hidden sm:block`). NEVER use JavaScript viewport detection — it causes hydration flash.
- **Touch targets:** Minimum 44px (Apple HIG). Use `p-2.5` or `p-3` on buttons, not `p-1.5`.
- **Safe areas:** Use `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` for notch/Dynamic Island and home indicator.
- **Scroll containers:** Use `overscroll-behavior: contain` to prevent scroll chaining. Use `touch-action: pan-x` on horizontal scrollers.
- **Bottom sheets:** Consider using a lightweight CSS-based approach (transform + transition) rather than a heavy library.
