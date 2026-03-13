# Session Prompt — Dashboard & Constellation (Phase 3b+)

Paste this into a new Claude session to continue:

---

This is the **User Dashboard & Constellation session (Session 5)**, continuing from previous sessions that completed Phases 1-3 (External URLs) of the Research Hub.

## Startup Instructions

Read these files in order before doing anything:

1. `PROJECT_STATUS.md` — Check Cross-Feature Notes for anything that affects us
2. `HANDOFF_DASHBOARD.md` — Full context on what was built, known issues, and what's next
3. `CONSTELLATION_V2_DESIGN.md` — The comprehensive design doc with schema, API, component architecture, and all 5 phases

## What's Already Done

- **Phase 1 (Board View + Foundation):** DEPLOYED & LIVE at beta.discoverparadocs.com/dashboard/research-hub
- **Phase 2 (Timeline + Map Views):** DEPLOYED & LIVE
- **Phase 3 External URL Support:** DEPLOYED & LIVE
  - URL extraction endpoint (`extract-url.ts`) with source auto-detection (YouTube, Reddit, Twitter/X, TikTok, Instagram, podcast, news, website)
  - Reddit-specific 6-source fallback chain (oEmbed → embed.reddit.com → rxddit.com → noembed → jsonlink → microlink) to work around Reddit blocking Vercel IPs
  - Quick-add modal with "Save Report" and "Paste URL" tabs, loading bar, editable description, manual thumbnail URL fallback
  - Branded SVG logo fallbacks (`SourceLogos.tsx`) for cards without thumbnails (Reddit Snoo, YouTube play button, X logo, etc.)
  - Uniform card heights with flex layout, opacity-based action bar toggle
  - Unsorted section auto-expands in BoardView
  - Twitter/X source type added to DB CHECK constraint and types
- **Database:** 7 tables with RLS, live on Supabase (project `bhkbctdmwnowfmqpksed`)
- **API:** 7 endpoints in `src/pages/api/research-hub/` (artifacts, case-files, case-file-artifacts, connections, insights, hub-data, extract-url)
- **Components:** 13 components in `src/components/dashboard/research-hub/` (ResearchHub, BoardView, TimelineView, MapView, MapViewInner, ViewSwitcher, ArtifactCard, ArtifactDetailDrawer, ArtifactQuickAdd, InsightCard, SourceLogos, ResearchHubSidebar, MobileSidebar)
- **Hooks:** `useResearchHub.ts`, `useArtifactActions.ts`
- **Helpers:** `research-hub-helpers.ts` (source type configs, verdict configs, relationship configs)

## Known Issues to Be Aware Of

- Reddit thumbnail extraction may still fail for some video posts — Reddit blocks Vercel IPs aggressively. The embed.reddit.com and rxddit.com fallbacks help but aren't guaranteed.
- CSS keyframes in inline `<style>` tags don't work in this project's JSX — always use Tailwind built-in animations instead.
- TypeScript has `ignoreBuildErrors: true`, but missing module imports WILL fail the build.
- There may be debug code (`_debug` field, `console.log` statements) in `extract-url.ts` that should be cleaned up when ready.

## What Needs to Be Built

### Phase 3b: Constellation View
- Wire existing D3 ConstellationMapV2 (Canvas-based, in `src/components/dashboard/ConstellationMapV2.tsx`) to new `constellation_artifacts` + `constellation_connections` data model
- Progression unlock system (locked <5 artifacts, basic 5+, majestic 50+)
- Node types: artifact nodes (colored by source_type), case file clusters, connection edges
- Interactive: click node to open detail drawer, drag to rearrange, zoom/pan
- Visual: particle effects on connections, pulsing for AI-suggested connections

### Phase 4: AI Intelligence Layer
- On-add insight generation (async Claude call when user adds artifact)
- Weekly deep scan cron (cross-artifact patterns, temporal clusters, geographic correlations)
- Community pattern detection (anonymized cross-user aggregation)
- Cross-case-file relationship suggestions

### Phase 5: Social & Sharing
- Theory publishing to public profile
- Public researcher profiles with stats
- Embeddable research snippets
- Community signal aggregation (popular external URLs feed ingestion pipeline via `constellation_external_url_signals` table)

## Critical Constraints

- **SWC:** No template literals in JSX, use `var`, use `function(){}`, unicode escapes for smart quotes
- **Push method:** User pushes via git CLI on their local machine. Prepare changes, then provide exact git commands for the user to run.
- **TypeScript:** `ignoreBuildErrors: true` in next.config.js, but webpack module resolution errors WILL fail the build
- **Auth pattern:** API routes use `createServerClient()` with Bearer token. Pages check `supabase.auth.getSession()` in useEffect and redirect to `/login`.
- **Leaflet:** Must use `next/dynamic` with `{ ssr: false }` for any map components
- **Animations:** Use Tailwind built-in classes (e.g. `animate-pulse`, `animate-spin`), NOT inline `<style>` with CSS keyframes

## Project Details

- **Stack:** Next.js 14 Pages Router, Supabase, Vercel, Tailwind
- **Site:** beta.discoverparadocs.com
- **Repo:** github.com/eq1725/paradocs (main branch, auto-deploy on push)
- **DB:** Supabase project `bhkbctdmwnowfmqpksed`, bucket `artifact-images`

## Current Testing Notes

The user (Chase) was actively testing the Research Hub. Things to verify/ask about:
1. Do the branded SVG logo fallbacks render correctly on cards without thumbnails?
2. Are cards now uniform height across each grid row?
3. Does the Reddit video post (https://www.reddit.com/r/UFOs/comments/1rst9h8/ross_coulthart_shares_new_details_about_the/) get a thumbnail via the new fallback sources?
4. Does the loading bar (Tailwind animate-pulse) appear during URL extraction?

Let's continue from where we left off. Ask Chase what he'd like to work on next — likely either continuing testing/polish or moving to Phase 3b (Constellation View).
