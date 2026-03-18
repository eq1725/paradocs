# HANDOFF_REPORTS.md — Report Experience

**Session:** Report Experience (Session 6)
**Date:** 2026-03-18
**Status:** Active — Phase B: mobile optimization, Roswell cluster expanded to 13 reports, AI Analysis grounded, images stored in Supabase Storage, client-side nav crash fixed

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
- ~~Pull quote system~~ ✅ Fixed (March 18) — expanded quotes, attribution regex rewrite
- ~~Client-side navigation crash~~ ✅ Fixed (March 18) — React hooks violation + stale state
- ~~Media images~~ ✅ All stored in Supabase Storage (March 18) — no more hotlinking
- ~~Barnett photo~~ ✅ Sourced from Find a Grave (March 18)
- "Did You Know?" connection quality: Stargate Project cross-phenomenon link NOT showing on showcase — all 8 connections are geographic/temporal within ufos_aliens. Needs cross-category report data.
- `roswell-incident` slug is a thin stub (382 chars, no case_group, no images, generic title). Consider merging into the showcase or deprecating.
- Migrate existing pre-session report images (DuBose, Marcel, etc.) from Wikimedia hotlinks to Supabase Storage — same pattern as new reports.
- Research Data Panel cross-referencing and statistical comparison features (post-ingestion)

**NEXT PRIORITY: Roswell Content Enrichment (Phase B Quality Bar)**

The Roswell cluster is the showcase for what Paradocs content should look like. Current descriptions are 2,000-2,800 chars — solid but not comprehensive. They need to be 4,000-6,000+ chars, drawing from all available sources, with the depth that demonstrates Paradocs' value proposition as the world's best aggregated resource.

**Source inventory for enrichment:**

1. **roswellproof.com** — Comprehensive research site with dedicated pages for:
   - Individual witnesses: Chester Lytle, Glenn Dennis, DuBose, Marcel, Brazel interview, Lovekin
   - Debris categories: I-beams with hieroglyphics, memory foil, parchment, misc metal, debris field size/quantity
   - ABC News radio bulletin audio (July 8, 1947 — original acetate recording by Taylor Grant)
   - Ramey Memo analysis, post-1947 references
   - URLs: `roswellproof.com/Chester_Lytle.html`, `/Dennis.html`, `/dubose.html`, `/brazel_interview.html`, `/debris_main.html`, `/debris1_beams.html`, `/debris2_memory_foil.html`, `/ABC_News_July8.html`

2. **roswellfiles.com** — Witness pages with detailed individual profiles:
   - `roswellfiles.com/Witnesses/glenndennis.htm`, `/Blanchard.htm`, etc.

3. **"Witness to Roswell" by Carey & Schmitt** — 600+ witnesses referenced across multiple editions (2007, 2009, 75th Anniversary). The most comprehensive published collection.

4. **"Roswell: The Ultimate Cold Case" by Carey & Schmitt** — New exclusive eyewitness testimonies, connections to astronauts Mitchell and Armstrong.

5. **Kevin Randle's "A Different Perspective" blog** — Detailed analytical posts on individual witnesses (Cavitt, Rickett, Marcel, Blanchard).

6. **Government documents:**
   - GAO Report NSIAD-95-187 (RAAF records destroyed)
   - NSA declassified Air Force Roswell Report (1994)
   - FBI Vault Roswell files
   - National Archives footage (gov.archives.341-roswell series)

7. **SoundCloud/Archive.org** — Original ABC News 1947 broadcast audio (`soundcloud.com/x503/abc-news-1947-roswell-ufo`)

8. **Find a Grave** — Memorial pages with photos/records for Barnett, potentially others

9. **ufoevidence.org** — Compiled witness testimonies document

10. **thinkaboutitdocs.com** — 1992 witness testimony compilation

**Per-report enrichment plan:**

| Report | Current | Target | Key additions needed |
|--------|---------|--------|---------------------|
| Showcase | 6,000+ | 8,000+ | ABC radio bulletin embed, debris taxonomy section, government response timeline, legacy section |
| Mac Brazel | 2,290 | 4,500+ | Brazel interview transcript details, military detention account, family testimony |
| Jesse Marcel | 2,350 | 5,000+ | 1980 TV interview quotes, debris handling details, son's corroboration, Fort Worth photo switch |
| Sheridan Cavitt | 2,765 | 4,500+ | 1994 Air Force interview analysis, wife Mary's contradicting testimony, CIC role context |
| George Wilcox | 2,510 | 4,000+ | Granddaughter Barbara Dugger testimony expansion, daughter Phyllis McGuire details |
| Thomas DuBose | 2,593 | 4,500+ | Sworn affidavit details, debris substitution testimony, Ramey memo connection |
| Walter Haut | 2,442 | 5,000+ | 2002 sealed deathbed affidavit (full details), Building 84 hangar account, UFO Museum founding |
| Robert Porter | 2,100 | 3,500+ | Flight details, weight anomaly testimony, chain of custody (Roswell→Fort Worth→Wright Field) |
| Jesse Marcel Jr | 2,800 | 4,500+ | Kitchen floor scene details, I-beam hieroglyphics, "Roswell Legacy" book, 35 years of testimony |
| Bill Rickett | 2,200 | 4,500+ | La Paz trajectory investigation details, crystallized sand, debris handling testimony |
| Glenn Dennis | 2,800 | 4,500+ | Nurse story evolution and credibility issues, child coffin call details, contemporaneous corroboration |
| Barney Barnett | 2,500 | 3,500+ | Maltais testimony details, Plains of San Agustin location debate, archaeologists claim |
| Chester Lytle | 2,300 | 3,500+ | Manhattan Project credentials, Blanchard relationship context, Robert Hastings interview details |
| Philip Corso | 3,200 | 4,500+ | Fort Riley shipping crate scene, specific technology claims and rebuttals, Senate testimony |

**Media enrichment plan:**
- ABC News 1947 radio bulletin (SoundCloud embed or archive.org link) — add to showcase
- Additional document links (GAO report, NSA report, FBI vault) — add to relevant witness pages
- YouTube interview clips where available (Glenn Dennis interview already added)
- Migrate all remaining Wikimedia hotlinks to Supabase Storage

**Critical principles for enrichment:**
1. NEVER hallucinate. Every factual claim must trace to a documented source.
2. Include uncertainty explicitly. Where testimony is contested, say so with specifics.
3. Use direct quotes where available (and format for pull quote extraction at 40+ chars).
4. Attribute everything. "According to [Name]", "As documented in [Source]".
5. Store all images locally in Supabase Storage. No external hotlinking.

**Post-ingestion enhancements:**
- Location extraction subsystem for pipeline: NLP extract → geocode → reconcile → precision tag → review queue
- Research Data Panel: corroboration scoring, comparative analysis against dataset baseline
- Generate connections at ingestion time for all new reports
- Shareable story cards (viral share images) — Sprint 3

**Technical debt:**
- Report detail page file size (~1100 lines) — could benefit from extracting more sub-components
- `report_connections` table cleanup script for orphaned entries

---

## AI Analysis Anti-Hallucination Fix (March 18)

**Problem:** AI Analysis "Similar Historical Cases" was generating fabricated case names from Claude's training data. Insights also regenerated every 24 hours with inconsistent results.

**Fix (report-insights.service.ts):**
1. Hash-based caching — insights only regenerate when report content changes, not on a timer
2. DB-grounded Similar Cases — service queries related reports and injects them into the prompt
3. Anti-hallucination instructions in system prompt and format spec
4. All 72 existing report insights invalidated — regenerate with grounded system on next view

## 5 New Roswell Witness Reports (March 18)

Created via `add-roswell-witnesses-2.ts`. All linked to showcase, case_group=roswell-1947, connections generated.

| Report | Slug | Cred | Notes |
|--------|------|------|-------|
| Bill Rickett | bill-rickett-roswell-cic-agent-1947 | high | CIC agent, direct testimony |
| Glenn Dennis | glenn-dennis-roswell-mortician-1947 | medium | Controversial, nurse unverified |
| Barney Barnett | barney-barnett-roswell-san-agustin-1947 | medium | Second-hand only, died 1969 |
| Chester Lytle | chester-lytle-roswell-blanchard-testimony-1953 | medium | Manhattan Project engineer, told by Blanchard |
| Philip Corso | philip-corso-roswell-reverse-engineering-1997 | low | NYT bestseller, documented factual errors |

Total Roswell cluster now: 13 reports (1 showcase + 12 witnesses). Related Reports sidebar shows "Case 10" with overflow.

## Media & Image Storage (March 18)

**Problem:** Images were hotlinked to Wikimedia Commons — some URLs were wrong (404), and external hosting is unreliable. One caption falsely claimed "No photograph of Barnett himself is known to exist" when Find a Grave has his photo.

**Fixes:**
1. All 14+ images downloaded from external sources and uploaded to Supabase Storage (`report-media` bucket). URLs in `report_media` table updated to `bhkbctdmwnowfmqpksed.supabase.co/storage/v1/object/public/report-media/roswell/...`
2. Barnett photo sourced from Find a Grave memorial records (WWI ID card). Added as primary image with proper attribution.
3. False "no photo exists" claim removed from Barnett caption.
4. On-demand ISR revalidation endpoint created (`/api/admin/revalidate`) — POST array of paths to force page cache refresh after DB changes.

**Admin scripts created:**
- `add-roswell-media.ts` — Inserts media records for the 5 new reports
- `store-roswell-media.ts` — Downloads external images → Supabase Storage, updates URLs
- `fix-roswell-captions.ts` — Fixes captions, sources Barnett photo from Find a Grave
- `revalidate.ts` — On-demand ISR revalidation for any page paths

**Key principle violated and corrected:** Never make absolute claims about something not existing without thorough verification. The Barnett "no photo exists" claim was factually wrong.

## Pull Quote System Fixes (March 18)

1. Expanded short quotes in all 5 report descriptions to be 40+ chars (the pull quote system's minimum). Each report now has a compelling, attributed pull quote.
2. Fixed attribution regex — removed `/i` flag that caused lowercase words ("from the crash. He") to match as names. Added `NOT_NAMES` blocklist (He, She, They, According, However, etc.), `isLikelyName()` validator, 3-char minimum, 200-char proximity limit.

## Client-Side Navigation Fix (March 18)

**Root cause:** React error #310 — `ArticleTableOfContents` had an early `return null` between `useState` and `useEffect` calls. When navigating between reports with different section counts, React saw different hook counts and crashed.

**Fixes:**
1. Moved early return AFTER `useEffect` in `ArticleTableOfContents.tsx` (Rules of Hooks compliance)
2. Added immediate state clearing in `[slug].tsx` when slug changes (prevents stale data + new slug frame)
3. Added stale-slug guard in `loadReport()` (discards fetch results if user navigated again)
4. Added `window.scrollTo(0, 0)` on client-side report navigation

---

## Roswell Cluster Audit (March 18)

All 6 original witness reports reviewed and confirmed meeting quality bar:

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
