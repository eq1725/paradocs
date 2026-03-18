# HANDOFF_REPORTS.md — Report Experience

**Session:** Report Experience (Session 6)
**Date:** 2026-03-18
**Status:** Active — Phase B mobile optimization + Roswell audit complete

---

## Current State

The report detail page (`/report/[slug]`) has been extensively improved across multiple sessions focused on Phase B: perfecting the Roswell showcase cluster as the quality bar for all future reports.

### What's Been Done (Phase B — March 2026)

**Body Text & Reading Experience**
- `FormattedDescription.tsx` — Complete rewrite. Detects ALL-CAPS section headers in report body text, converts to styled `<h2>` elements with primary accent left-border and anchor IDs for TOC linking. Extracts pull quotes (40-250 char quoted passages) with speaker attribution detection, one per section max.
- `ReadingProgress.tsx` — New. Thin gradient progress bar fixed at top of viewport, tracks scroll position relative to the article body.
- `ArticleTableOfContents.tsx` — New. Extracts section headers from description text, renders numbered jump links with IntersectionObserver-based active state. Shows first 4 sections with expand toggle. Only renders for articles with 3+ sections.

**Media & Sources**
- `MediaGallery.tsx` — Added `mode` prop (`'images' | 'sources' | 'all'`) to split hero images (above TOC) from external document/video sources (after body text in dedicated "Sources & Documents" section). Fixed `line-clamp-2` for captions.

**Location Intelligence Map**
- `LocationMap.tsx` — Fully rewritten from Leaflet to MapLibre GL + MapTiler. Uses the same rendering stack as the main `/map` page for visual consistency. Features: dark/satellite basemap toggle, category-colored nearby markers (same color mapping as main map), "Explore on Map" deep-link that flies the main map to the report's location via URL params (`?lat=X&lng=Y&zoom=9`). Distance units in miles (US audience). `overflow-x: hidden` fixes horizontal scrollbar.
- Main `/map` page updated to accept `lat`, `lng`, `zoom` URL params for deep-linking from report pages.

**Environmental Context**
- `EnvironmentalContext.tsx` — Responsive grid fixed (always 2-col, never 4-col in a half-width card). Date-aware satellite filtering: no Starlink/ISS for pre-2000 events, "Pre-Satellite Era" for pre-1957. Clean "Unknown" states ("Time not recorded" instead of ❓). Analysis notes filtered by era. Subtitle shows formatted event date.

**Research Data Panel**
- `AcademicObservationPanel.tsx` — Responsive grid fixed (2-col always). Witness count uses `~est.` treatment for counts ≥10. Duration shows "Not recorded" instead of "Unknown". NLP-extracted phenomenon data flagged with amber "Auto-extracted" badge + CPU icon (when no `academic_observations` record exists). Citation URL fixed to `beta.discoverparadocs.com`. Expanded section (full data + JSON export + citation) Pro-gated via `canAccess('data_export')`. Free/Basic users see quick stats + soft paywall.

**Did You Know? Connection Cards**
- `ConnectionCards.tsx` — Filters out same-case connections (reports sharing `case_group`). Sorts cross-phenomenon links first (most surprising). Uses `CATEGORY_CONFIG` labels ("UFOs & Aliens" not "ufos_aliens"). Shows `ai_explanation` directly instead of generic boilerplate fun_facts. Removed strength dots.
- `generate-connections.ts` — Complete rewrite. Skips same-case connections. Generates unique, specific explanations per connection with actual location names, distances in miles, temporal/geographic context. Supports `?slug=` param to regenerate for specific reports. Supports admin auth.
- Connections API returns `case_group` on connected reports for client-side filtering.

**Engagement & CTA**
- Engagement bar redesigned from sticky black bar to integrated glass-card with pill-style vote buttons, hidden zero counts, disambiguated labels (Research/Save/Share/Journal).
- CTA contextualized by `content_type`: historical_case/research_analysis/news_discussion get "Help build the record" / "Contribute Research"; experiencer_report gets "Share Your Experience".
- Engagement bar and CTA combined into cohesive bottom section. CTA full article width.
- Comments section removed — doesn't serve either user journey (casual browsing/saving or researcher hub-building).

**Data Accuracy**
- Witness count estimate display: `~30 witnesses (est.)` for counts ≥10, exact display for smaller counts. Tooltip on hover.
- All 9 Roswell cluster reports audited for witness_count accuracy against content.
- Roswell coordinates fixed: showcase and 3 witness reports corrected from Roswell city center (33.39, -104.52) to actual Foster Ranch debris field (33.96, -105.31). Migration endpoint created and executed. Seed scripts updated.

**Visual Polish**
- Header badges: removed "Featured" (internal signal), removed redundant "Notable Case". Slightly smaller on mobile.
- Tags: show 8 (was 6), smaller/subtler (`text-[11px]`, `bg-white/[0.04]`), tighter gaps.
- Metadata cards: labels now `text-[11px] uppercase tracking-wider`. "curated" → "Editorial". "Submitted: about 1 month ago" → "Added: Feb 2026". Compact padding.
- Event time format: raw "14:00:00" → "2:00 PM" (12-hour with AM/PM).

**Mobile Reading Experience (March 18)**
- `FormattedDescription.tsx` — Pull quotes: responsive padding (`px-4 sm:px-6`), smaller text on mobile (`text-base sm:text-lg`), tighter margins. Section headers: responsive sizing (`text-lg sm:text-xl` for h2, `text-base sm:text-lg` for h3), reduced top margin on mobile.
- `ArticleTableOfContents.tsx` — Compact mobile padding (`p-3 sm:p-4`), smaller heading text (`text-xs sm:text-sm`), tighter item padding (`py-1 sm:py-1.5`, `text-xs sm:text-sm`).
- `AskTheUnknown.tsx` — Floating button less intrusive on mobile: smaller (`px-2.5 py-2`), semi-transparent when not hovered (`opacity-70 hover:opacity-100`), tighter positioning (`bottom-24 right-3`), smaller icon (`w-4 h-4 md:w-5 md:h-5`).
- `ConnectionCards.tsx` — Explicit single-column on mobile (`grid-cols-1 sm:grid-cols-2`), compact card padding (`p-3 sm:p-4`).
- Environmental/Academic grid gap reduced on mobile (`gap-4 sm:gap-6`).

**Single-Word ALL-CAPS Header Fix (March 18)**
- `FormattedDescription.tsx` + `ArticleTableOfContents.tsx` — Lowered minimum from 2 words to 1 word for ALL-CAPS header detection. Single words must be ≥4 chars (avoids "A", "IT", "OK"). Fixes "LEGACY" not being styled as a section header.

**Breadcrumb Navigation (March 18)**
- Mobile breadcrumb: now shows parent case trail (`Category > Case File`) when viewing a witness report that belongs to a case group. Added `aria-label="Breadcrumb"`.
- Desktop breadcrumb: now includes parent case title in the trail (`Explore > Category > Case Title > Report Title`). Added `aria-label="Breadcrumb"`.

---

## Key Files

**Page & Layout:**
- `src/pages/report/[slug].tsx` — Main report detail page (~1100 lines)
- `src/pages/submit.tsx` — Report submission form

**Components (in `src/components/` and `src/components/reports/`):**
- `FormattedDescription.tsx` — Body text renderer with headers, pull quotes
- `ReadingProgress.tsx` — Scroll progress bar
- `ArticleTableOfContents.tsx` — Section jump links
- `MediaGallery.tsx` — Hero images + sources/documents (mode prop)
- `LocationMap.tsx` — MapLibre GL embedded map
- `EnvironmentalContext.tsx` — Astronomical conditions panel
- `AcademicObservationPanel.tsx` — Research data panel (Pro-gated export)
- `ConnectionCards.tsx` — "Did You Know?" cross-report connections
- `RelatedReports.tsx` — Sidebar related reports
- `ReportAIInsight.tsx` — AI analysis section
- `LogToConstellation.tsx` — Research hub save modal

**APIs (in `src/pages/api/reports/[slug]/`):**
- `nearby.ts` — Geographic proximity reports (Haversine, km internally)
- `connections.ts` — Cross-report connections with case_group filtering
- `academicData.ts` — Structured observation data with NLP extraction
- `environment.ts` — Astronomical context (moon phase, meteor showers, satellites)
- `insight.ts` — AI-generated per-report analysis

**Admin Scripts (in `src/pages/api/admin/`):**
- `seed-showcase.ts` — Roswell showcase report creation
- `upgrade-roswell-cluster.ts` — 4 new witness reports + media for all 8
- `generate-connections.ts` — Batch connection generation (v2, case-group aware)
- `fix-roswell-coordinates.ts` — Migration: Foster Ranch coordinate corrections

**Services:**
- `src/lib/services/astronomical.service.ts` — Moon phase, meteor showers, satellite info
- `src/lib/services/report-insights.service.ts` — AI analysis generation

**Database tables:** `reports`, `report_media`, `report_connections`, `report_links`, `academic_observations`, `report_insights`

---

## What Still Needs Work

**Remaining Phase B items:**
- ~~Mobile reading experience optimization~~ ✅ Complete (March 18)
- ~~Breadcrumb navigation~~ ✅ Complete (March 18)
- "Did You Know?" connection quality: Stargate Project cross-phenomenon link NOT showing on showcase — all 8 connections are geographic/temporal within ufos_aliens. Needs either: (a) a Stargate Project report to exist in the DB, or (b) regeneration of connections with cross-category reports after more data ingestion.
- `roswell-incident` slug is a thin stub (382 chars, no case_group, no images, generic title). Consider merging into the showcase or deprecating.
- Research Data Panel cross-referencing and statistical comparison features (post-ingestion)

**Post-ingestion enhancements:**
- Location extraction subsystem for pipeline: NLP extract → geocode → reconcile → precision tag → review queue
- Research Data Panel: corroboration scoring, comparative analysis against dataset baseline
- Generate connections at ingestion time for all new reports
- Shareable story cards (viral share images) — Sprint 3

**Technical debt:**
- Report detail page file size (~1100 lines) — could benefit from extracting more sub-components
- `report_connections` table cleanup script for orphaned entries

---

## Roswell Cluster Audit (March 18)

All 6 witness reports reviewed and confirmed meeting quality bar:

| Report | Coords | Location | Date | Witnesses | Cred | Desc |
|--------|--------|----------|------|-----------|------|------|
| showcase | 33.96, -105.31 | Foster Ranch | Jul 8, 1947 | ~30 (est.) | high | 6000+ |
| mac-brazel | 33.96, -105.31 | Foster Ranch | Jul 3, 1947 | 1 | high | 2290 |
| jesse-marcel | 33.96, -105.31 | Foster Ranch/RAAF | Jul 7, 1947 | 3 | high | 2350 |
| sheridan-cavitt | 33.96, -105.31 | Foster Ranch/RAAF | Jul 7, 1947 | 1 | medium | 2765 |
| george-wilcox | 33.39, -104.52 | Courthouse, Roswell | Jul 7, 1947 | 1 | medium | 2510 |
| thomas-dubose | 32.77, -97.44 | Ft Worth AAF | Jul 8, 1947 | 1 | high | 2593 |
| walter-haut | 33.30, -104.53 | Roswell AAF | Jul 8, 1947 | 1 | medium | 2442 |

All have: correct coordinates for their physical locations, case_group=roswell-1947, "Part of Case File" banner, media/images, substantial descriptions, proper event dates.

---

## Cross-Session Impacts

- **Map (Session 3):** Embedded LocationMap now uses same MapLibre/MapTiler stack. Deep-link URL params added to `/map` page.
- **Subscription (Session 8):** Research Data Panel expanded section Pro-gated via `canAccess('data_export')`.
- **Ingestion (Session 10):** `generate-connections.ts` ready for batch processing. Location validation subsystem needed.
- **Encyclopedia (Session 1):** Phenomena links display on report pages; taxonomy quality affects report classification.
- **Mobile (Session 13):** Report page mobile reading pass complete (March 18). Pull quotes, TOC, headers, connection cards all optimized for small screens. AskTheUnknown FAB made less intrusive.

---

## Design Principles Applied

- **Accuracy over estimation:** If a value is approximate, the UI must be transparent about that (~est., tooltips, Auto-extracted badges).
- **Date awareness:** Environmental context adapts to the era (no Starlink for 1947, "Pre-Satellite Era").
- **Cohesive design:** Embedded maps use same tech stack as main map. Category colors consistent throughout.
- **Progressive disclosure:** Quick stats visible to all tiers. Detailed data + export gated to Pro. Same-case connections in sidebar; cross-case in "Did You Know?"
- **US-first audience:** Miles not kilometers. Familiar date formats.
