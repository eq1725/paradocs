# Session Prompt: Session 5 — User Dashboard & Constellation UX Overhaul

**Session:** Paradocs - User Dashboard & Constellation
**Scope:** Dashboard home redesign, constellation view integration, UX polish, subscription state integration, activity feed, onboarding flow
**Priority:** HIGH — the dashboard is where engaged users live. It must feel polished and valuable before launch.
**Handoff doc:** `HANDOFF_DASHBOARD.md` (update existing)
**Date:** March 24, 2026

---

## Context — Read These First

- `PROJECT_STATUS.md` (root) — Read **Content & Legal Posture**, **Conversion Strategy**, **Subscription Tiers**, and **Algorithmic Feed Strategy** sections. The dashboard is the "depth" product — where Core/Pro subscribers spend time.
- `HANDOFF_DASHBOARD.md` — if exists, previous session's work notes.
- `CONSTELLATION_V2_DESIGN.md` — Full design doc for Research Hub multi-view architecture (Board, Timeline, Map, Constellation views).
- `src/pages/dashboard/index.tsx` — Current dashboard home page (~400+ lines). Mobile-first with Research Hub summary, constellation mini-map, activity feed, metric pills.
- `src/pages/dashboard/` — All dashboard pages: index, saved, reports, insights, digests, constellation, research-hub, settings, subscription, journal/
- `src/components/dashboard/DashboardLayout.tsx` — Layout wrapper with sidebar (desktop) + bottom tabs (mobile)
- `src/components/dashboard/` — 15+ components: ConstellationMap, ConstellationMapV2, ResearchStreak, UsageMeter, FeatureGate, TierBadge, UpgradeCard, DashboardTour, etc.
- `src/components/dashboard/research-hub/` — 13 components: ResearchHub, BoardView, TimelineView, MapView, ViewSwitcher, ArtifactCard, etc.
- `src/pages/api/research-hub/` — 7 endpoints for artifacts, case files, connections, insights
- `src/pages/api/user/stats` — Dashboard stats API
- `src/lib/hooks/useSubscription.ts` — Subscription state hook

**Current state (March 20, 2026):**
- Research Hub Phases 1-3 COMPLETE: Board View (mobile-first default), Timeline View, Map View, external URL extraction pipeline with 16+ source types, artifact CRUD
- Dashboard home has: welcome hero, research streak, case files (Netflix-style horizontal scroll on mobile), recent artifacts, AI insights banner, constellation mini-map, activity feed, metric pills, suggested explorations
- ConstellationMapV2 exists (D3 force-directed graph) but not fully wired into new data model
- Phase 3b (Constellation View integration) and Phase 4 (AI intelligence layer) not started
- DashboardLayout uses sidebar (desktop) + MobileBottomTabs (mobile) — Session 13 Phase 3a deployed

---

## What This Session Delivers

The dashboard currently works but feels like a collection of features rather than a cohesive experience. This session makes it feel like **mission control for a paranormal researcher** — every section has clear purpose, the hierarchy is obvious, and the flow guides users deeper.

---

## Work Sequence

### Part 1: Dashboard Home Redesign

The current dashboard index page has the right pieces but the hierarchy and flow need tightening.

#### 1a. Revised Page Flow (Top to Bottom)

**Mobile (primary target — this is what most users see):**

1. **Welcome Bar** — Compact. Name + tier badge + streak indicator (flame icon + day count). No verbose subtitle. One line.

2. **Quick Actions Row** — Horizontal scroll of action pills:
   - "Browse Cases" → /discover (Stories feed)
   - "Search" → /search
   - "Ask the Unknown" → opens AskTheUnknown
   - "Research Hub" → /dashboard/research-hub
   - "Saved" → /dashboard/saved
   These replace the current hero CTAs with something faster and more useful.

3. **Your Activity This Week** — A clean, compact summary card:
   - Cases viewed: {N}
   - Reports saved: {N}
   - Research streak: {N} days
   - Time researching: ~{N} min (from session data if available, else omit)
   This replaces the current scattered metric pills and research streak widget with one consolidated card.

4. **Active Investigations** — Case files from Research Hub. Keep the Netflix-style horizontal scroll (MobileCardRow). But improve the cards:
   - Show case file title, artifact count, last updated date, and a progress indicator (e.g., "3 artifacts, 2 insights")
   - Color-coded left border (existing)
   - Tap → deep link to that case file in Research Hub
   - "New investigation" card at the end (+ icon) for quick case file creation

5. **Recent Discoveries** — The most recently saved/bookmarked reports and phenomena. Horizontal scroll. Each card: title, category badge, date saved. Tap → report/phenomenon page. This surfaces the user's own curation, not the global feed.

6. **AI Insights** — If the user has case files with AI-generated insights, show the top 1-2 insights as expandable cards. If no insights yet, show a teaser: "Add 5+ artifacts to a case file to unlock AI pattern detection." This is a Pro feature hook.

7. **Constellation Preview** — Compact D3 mini-map showing the user's connection web. Tap to expand to full constellation view. If the user has <5 entries, show an onboarding prompt: "Log your first 5 items to build your constellation." This should feel like a reward that unlocks.

8. **Suggested Next Steps** — Context-aware prompts based on what the user hasn't done yet:
   - No saved reports → "Save your first case from the feed"
   - No case files → "Create an investigation folder"
   - No constellation entries → "Log something to your constellation"
   - Has case file but <3 artifacts → "Add more evidence to {case_file_name}"
   - Free tier → subtle upgrade prompt (not aggressive)

**Desktop:** Same content, but laid out in a 2-column or 3-column grid where it makes sense (activity card + quick actions in top row, investigations and discoveries side by side, constellation gets more room).

#### 1b. Remove or Consolidate

- **Current metric pills** (reports submitted, saved, API calls) — These are developer-oriented. Replace with the "Your Activity This Week" summary.
- **Current suggested explorations** — Generic and not personalized. Replace with "Suggested Next Steps" that are contextual.
- **Usage footer** — Move usage/limits info to settings page, not dashboard home.
- **DashboardTour** — Keep but make it contextual rather than a popup. Show inline hints next to empty sections instead.

### Part 2: Constellation View Integration (Phase 3b)

The ConstellationMapV2 (D3 force-directed graph) exists but needs to be wired into the new Research Hub data model.

#### 2a. What the Constellation Shows

The constellation is a visual representation of the user's research connections:
- **Nodes:** Saved reports, saved phenomena, research hub artifacts, journal entries
- **Edges:** Connections the user has drawn between nodes (explicit) + auto-detected connections (shared phenomena, geographic proximity, temporal overlap)
- **Clusters:** Case files become visual clusters — nodes in the same case file are grouped

#### 2b. Data Wiring

The current ConstellationMapV2 reads from `constellation_entries` and `constellation_connections` tables. The Research Hub introduced new tables: `constellation_artifacts`, `constellation_case_files`, etc. Wire the constellation view to pull from ALL sources:

```typescript
// Unified node query
var nodes = await Promise.all([
  getConstellationEntries(userId),       // Legacy constellation entries
  getResearchHubArtifacts(userId),       // Research Hub artifacts
  getSavedReports(userId),               // Bookmarked reports
  getSavedPhenomena(userId),             // Bookmarked phenomena
]);

// Unified edge query
var edges = await Promise.all([
  getExplicitConnections(userId),        // User-drawn connections
  getAutoDetectedConnections(userId),    // AI-suggested connections (same phenomenon, location, etc.)
  getCaseFileGroupings(userId),          // Case file membership (implied connections)
]);
```

#### 2c. Progression System

The constellation should feel like something that **grows with you:**

- **0-4 items:** "Start logging" prompt. Show empty constellation with glowing entry point.
- **5-9 items:** First connections appear. "Your web is forming" message.
- **10-24 items:** Categories emerge. Nodes color-coded by phenomenon type.
- **25-49 items:** Clusters visible. Case file groupings become obvious.
- **50+ items:** Full constellation. Auto-detected patterns highlighted. "You've mapped more than 95% of researchers" social proof.

#### 2d. Interaction

- **Tap node:** Show detail panel (existing NodeDetailPanel) with title, summary, source, connections
- **Drag:** Rearrange nodes (D3 force simulation already built)
- **Pinch zoom:** Mobile pinch-to-zoom on the canvas
- **Double-tap cluster:** Zoom into that case file's sub-constellation
- **Long press:** Connection drawing mode — drag from one node to another to create explicit connection

### Part 3: Saved Items & Collections Polish

#### 3a. Saved Reports Page (`/dashboard/saved`)

Currently a basic list. Improve to:
- **Filter bar:** Category filter pills (horizontal scroll), sort (date saved, date reported, credibility)
- **Card layout:** On mobile, stack of compact cards showing title, category badge, date, source label. On desktop, 2-column grid.
- **Bulk actions:** Select multiple → add to case file, remove from saved
- **Empty state:** "Browse the feed to discover cases" with CTA to /discover

#### 3b. Reports Page (`/dashboard/reports`)

Currently shows user-submitted reports. Improve:
- Show status badges (pending, approved, rejected) with clear visual distinction
- "Submit new report" CTA
- For approved reports, show view count and engagement stats

### Part 4: Settings & Subscription Integration

#### 4a. Settings Page (`/dashboard/settings`)

Organize into clear sections:
- **Profile:** Display name, username, avatar, bio
- **Preferences:** Interested categories (drives feed personalization), notification preferences, email digest frequency
- **Subscription:** Current tier + usage + upgrade/manage button (links to subscription page)
- **Privacy:** Data export, account deletion
- **About:** App version, legal links

#### 4b. Subscription Page (`/dashboard/subscription`)

Currently exists but may need updates for the new tier structure. Show:
- Current tier with visual indicator
- Feature comparison table (Free vs Core vs Pro)
- Usage meters for gated features (case views today, Ask the Unknown queries this week)
- Upgrade/downgrade buttons
- Billing history (once Stripe is integrated — stub for now)

This page should also be reachable from every depth gate CTA across the app.

### Part 5: Dashboard Onboarding Flow

For a brand-new user who just signed up, the dashboard should guide rather than overwhelm.

#### 5a. Empty State Design

Every dashboard section needs a compelling empty state, not just "Nothing here yet":
- **Investigations (case files):** "Investigations are where you collect evidence. Think of each one as a case folder." + "Create your first investigation" button
- **Saved:** "Reports you save from the feed appear here. Like building a personal library." + "Browse cases" button
- **Constellation:** "Your constellation maps connections between everything you research. It grows with you." + visual preview of what a populated constellation looks like
- **Insights:** "When you have 5+ artifacts in a case file, AI finds patterns you might miss." + example insight card (placeholder)

#### 5b. Progressive Disclosure

Don't show everything at once. For new users:
- First visit: Show only Welcome + Quick Actions + Suggested Next Steps
- After first save: Show Saved section
- After first case file: Show Investigations section
- After 5+ constellation entries: Show Constellation section
- After 5+ artifacts in a case file: Show AI Insights section

Use localStorage to track which milestones the user has hit. Sections that haven't been "unlocked" show as collapsed teasers with a brief explanation of what they do and how to unlock them.

### Part 6: Mobile Polish

#### 6a. DashboardLayout Improvements

- **Sidebar (desktop):** Ensure all nav items reflect current page hierarchy. Active state should be visually clear. Research Hub should be the most prominent item after Overview.
- **Bottom tabs (mobile):** Verify the tab bar works well with all dashboard pages. The current MobileBottomTabs are global — make sure dashboard-specific navigation (between dashboard sub-pages) is intuitive. Consider a secondary nav row or swipeable tabs at the top of the dashboard content area.
- **Header:** Compact on mobile. Show page title + notification bell. No verbose descriptions.

#### 6b. Touch Interactions

- All cards must have generous tap targets (44px minimum)
- Swipe-to-delete on saved items (with confirmation)
- Pull-to-refresh on dashboard home and saved pages
- Smooth transitions between dashboard sub-pages

---

## Technical Constraints

- **SWC compliance:** Use `var`, `function(){}`, string concat, no template literals in JSX, unicode escapes. ALL frontend code.
- **Existing patterns:** Follow the patterns already established in the dashboard codebase — MobileCardRow for horizontal scroll, DashboardLayout for page wrapper, glass-card / bg-gray-900 for card styling.
- **No new heavy dependencies.** D3 is already imported for ConstellationMapV2. Use existing Tailwind, lucide-react.
- **Auth required:** All dashboard pages must check auth state. Redirect to /login if not authenticated. This is already implemented — don't break it.
- **Subscription state:** Use `useSubscription()` hook for tier checks. Feature gates use the existing `FeatureGate` component.
- **Mobile-first:** Design for 375px first, then enhance for desktop. Most users will be on mobile (especially after Capacitor app launch).

---

## Files to Create/Modify

**New files:**
- `src/components/dashboard/ActivitySummary.tsx` — "Your Activity This Week" consolidated card
- `src/components/dashboard/QuickActions.tsx` — Horizontal quick action pills
- `src/components/dashboard/SuggestedNextSteps.tsx` — Context-aware onboarding/progression prompts
- `src/components/dashboard/RecentDiscoveries.tsx` — Recently saved reports/phenomena horizontal scroll
- `src/components/dashboard/EmptyState.tsx` — Reusable empty state component with illustration + CTA

**Modified files:**
- `src/pages/dashboard/index.tsx` — Major restructure: new page flow, consolidated sections, progressive disclosure
- `src/pages/dashboard/saved.tsx` — Filter bar, card layout improvements, bulk actions
- `src/pages/dashboard/settings.tsx` — Reorganize into clear sections
- `src/pages/dashboard/subscription.tsx` — Tier comparison, usage meters, gate feature visibility
- `src/pages/dashboard/constellation.tsx` — Wire to new Research Hub data model, progression system
- `src/components/dashboard/ConstellationMapV2.tsx` — Update data sources, add progression states
- `src/components/dashboard/DashboardLayout.tsx` — Nav polish, mobile header improvements
- `src/components/dashboard/ResearchStreak.tsx` — Compact into ActivitySummary or keep as sub-component
- `HANDOFF_DASHBOARD.md` — Update with all new work
- `PROJECT_STATUS.md` — Update Session 5 section

---

## Definition of Done

**Dashboard Home:**
- [ ] Revised page flow: Welcome bar → Quick Actions → Activity Summary → Active Investigations → Recent Discoveries → AI Insights → Constellation Preview → Suggested Next Steps
- [ ] "Your Activity This Week" replaces scattered metric pills
- [ ] Quick action pills for fast navigation
- [ ] Suggested Next Steps are context-aware (different for new users vs. active researchers)
- [ ] Progressive disclosure: new users see simplified dashboard, sections unlock with usage

**Constellation:**
- [ ] ConstellationMapV2 reads from all data sources (constellation entries, research hub artifacts, saved reports/phenomena)
- [ ] Progression system (0-4 → 5-9 → 10-24 → 25-49 → 50+ milestones)
- [ ] Case file groupings visible as clusters
- [ ] Node tap shows detail panel
- [ ] Connection drawing (long press + drag between nodes)

**Saved & Collections:**
- [ ] Saved page has category filters and sort options
- [ ] Bulk actions: select multiple → add to case file
- [ ] Compelling empty states for all sections

**Settings & Subscription:**
- [ ] Settings organized into Profile, Preferences, Subscription, Privacy sections
- [ ] Subscription page shows tier comparison and usage meters
- [ ] Subscription page reachable from all gate CTAs across the app

**Mobile:**
- [ ] All sections responsive at 375px
- [ ] Touch targets 44px minimum
- [ ] SWC compliant (no template literals in JSX)

**Documentation:**
- [ ] `HANDOFF_DASHBOARD.md` updated
- [ ] `PROJECT_STATUS.md` Session 5 section updated

---

## Cross-Session Integration

| Session | Dependency |
|---------|-----------|
| Session 2 (Discover) | Feed events data could power "Your Activity This Week" (cases viewed, time spent). Quick Actions link to /discover. |
| Session 6b (Report detail) | "Save to Research Hub" flow from report pages feeds into dashboard saved items and case files. |
| Session 8 (Subscription) | Subscription page needs Stripe checkout integration. Until then, stub upgrade buttons. FeatureGate component already handles tier checks. |
| Session 10 (Ingestion) | More reports = more things to save, more constellation nodes. Dashboard scales with content volume. |
| Session 13 (Mobile Design) | DashboardLayout + MobileBottomTabs already exist from Session 13. This session polishes within that framework. |
| Session 15 (AI) | AI Insights in dashboard come from Research Hub's AI intelligence layer. Stub if not yet built. |
