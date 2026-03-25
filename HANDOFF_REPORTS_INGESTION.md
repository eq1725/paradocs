# HANDOFF_REPORTS_INGESTION.md — Report Experience (Ingestion & Scale)

**Session:** Report Experience — Ingestion & Scale (Session 6b)
**Date:** 2026-03-25
**Status:** Active — Report detail page redesign COMPLETE. Index model enforced at the page level.

**Sister session:** Session 6a (Report Experience — Curated Content) handles hand-crafted editorial case files. See `HANDOFF_REPORTS.md`.

**Upstream dependency:** Session 10 (Data Ingestion & Pipeline) produces `paradocs_narrative`, `paradocs_assessment`, `source_url`, `source_label`, `feed_hook` fields. Must run before this page has real data to display.

---

## What Was Done (March 25, 2026)

### Report Detail Page Redesign — Index Model

The report page (`/report/[slug]`) now handles two distinct content modes:

**Mode 1: Mass-Ingested Reports (NEW)**
- Detection: `source_type !== 'curated' && source_type !== 'editorial'`
- Content model: Index with attribution. Paradocs Analysis + metadata + source link. Raw `description` never rendered.
- Components rendered:
  - Feed hook lede (italic serif subtitle under title)
  - `ParadocsAnalysisBox` — purple gradient box matching encyclopedia styling (Lightbulb icon). Narrative NOT labeled as AI. Assessment sections labeled "AI-Assisted Analysis".
  - `SourceAttribution` — footnote-style citation with external link
  - `ResearchHubPreview` — blurred preview with subscription CTA for free users
  - Metadata grid, credibility rationale, engagement bar, related reports, connections
- Components NOT rendered: `FormattedDescription`, `ArticleTableOfContents`, `ReadingProgress`, `FurtherReading`, reading time estimate
- Fallback: If `paradocs_narrative` is null (ingestion hasn't run), falls back to on-demand `ReportAIInsight`

**Mode 2: Curated Editorial Reports (UNCHANGED)**
- Detection: `source_type === 'curated' || source_type === 'editorial'`
- Full editorial body text, TOC, reading progress, media gallery, sources & documents, evidence section, Further Reading
- Roswell (14) + Rendlesham (6) clusters unaffected

### New Components Created

1. **`src/components/reports/ParadocsAnalysisBox.tsx`**
   - Props: `narrative: string | null`, `assessment: ParadocsAssessment | null`, `className?: string`
   - Purple gradient container matching encyclopedia `phenomena/[slug].tsx` style
   - Narrative paragraphs rendered as Paradocs editorial voice (not labeled AI)
   - Expandable assessment sections: Credibility (expanded by default), Alternative Explanations, Content Classification, Related Phenomena
   - Each assessment section labeled "AI-Assisted Analysis" in small text
   - Graceful fallback when both narrative and assessment are null
   - Credibility score visual bar + color coding (green/yellow/red)
   - Related phenomena link to `/phenomena/{slug}`
   - SWC compliant

2. **`src/components/reports/SourceAttribution.tsx`**
   - Props: `label: string`, `url: string`, `className?: string`
   - Footnote-style: "Original source: {label} — View original"
   - External link with `target="_blank"` and `rel="noopener noreferrer"`
   - Small, unobtrusive, always present on index reports

3. **`src/components/reports/ResearchHubPreview.tsx`**
   - Props: `reportId`, `reportTitle`, `reportCategory`, `isSubscribed`, `isAuthenticated`, `className?`
   - Free/unauthenticated: blurred content preview with purple CTA overlay ("Start with Core — $5.99/mo" or "Sign up to unlock")
   - Subscribed users: "Add to Hub" link to Research Hub
   - Fake content blocks suggest depth behind the blur

### Report Page Modifications (`src/pages/report/[slug].tsx`)

- Added mode detection: `isCurated` / `isIndexReport` flags based on `source_type`
- Conditional rendering of body content (curated: full text | index: Paradocs Analysis box)
- Feed hook lede displayed for index reports (italic serif subtitle)
- ReadingProgress only renders for curated reports
- Reading time estimate only shown for curated reports
- FurtherReading only rendered for curated reports
- ReportAIInsight shown for curated reports OR as fallback for index reports without `paradocs_narrative`
- `paradocs_assessment` JSON parsing with error handling
- Behavioral event stubs added (case_view on load, scroll_depth tracking at 25/50/75/100%)
- Gate check stub for Session 2's `useGateStatus` hook

### Behavioral Event Integration (Session 2 Stubs)

Stubs wired in `[slug].tsx` for Session 2 to replace:
- `case_view` event on page load — ready for `useFeedEvents.trackCaseView()`
- `scroll_depth` events at 25%, 50%, 75%, 100% milestones — ready for `useFeedEvents.trackScrollDepth()`
- Gate check on load — ready for `useGateStatus()` + `CaseViewGate` component
- "You Might Also Find..." prompt at 80%+ scroll — Session 2 builds the component

---

## Key Files

**New files:**
- `src/components/reports/ParadocsAnalysisBox.tsx` — Main Paradocs Analysis display
- `src/components/reports/SourceAttribution.tsx` — Source citation footnote
- `src/components/reports/ResearchHubPreview.tsx` — Blurred Research Hub conversion carrot

**Modified files:**
- `src/pages/report/[slug].tsx` — Mode detection, conditional rendering, feed hook lede, behavioral event stubs

**Unmodified (referenced):**
- `src/components/reports/ReportAIInsight.tsx` — Preserved as fallback for reports without pre-generated analysis
- `src/components/FormattedDescription.tsx` — Only used for curated reports now
- `src/components/ReadingProgress.tsx` — Only rendered for curated reports
- `src/components/ArticleTableOfContents.tsx` — Only rendered for curated reports

---

## Database Fields Required

The following fields must exist on the `reports` table for the index model to work:

| Field | Type | Source | Required |
|-------|------|--------|----------|
| `paradocs_narrative` | text | Session 10 (AI generation) | For Paradocs Analysis box content |
| `paradocs_assessment` | jsonb | Session 10 (AI generation) | For credibility, mundane explanations, content type |
| `source_url` | text | Ingestion adapters | For source attribution link (legally required) |
| `source_label` | text | Ingestion adapters | Display name for source (e.g., "r/Paranormal") |
| `feed_hook` | text | Session 10 (AI generation) | 2-3 sentence editorial hook displayed as lede |
| `source_type` | text | Already exists | Used for mode detection (curated vs index) |
| `event_date_precision` | text | Ingestion adapters | "exact", "month", "year", "decade" |

---

## Cross-Session Integration

| Session | Integration Point |
|---------|------------------|
| **Session 10 (Ingestion)** | Produces all `paradocs_*` fields, `feed_hook`, `source_url`, `source_label`. Must run before pages have real data. |
| **Session 2 (Discover)** | Feed cards link to this page. Behavioral event stubs ready for wiring. Gate check stub ready. |
| **Session 5 (Dashboard)** | ResearchHubPreview drives conversion to Dashboard features. |
| **Session 8 (Subscription)** | ResearchHubPreview CTA depends on subscription state check. Currently hardcoded `isSubscribed={false}`. |
| **Session 6a (Curated)** | Curated reports use separate rendering path — unaffected. |
| **Session 15 (AI)** | Ask the Unknown FAB stays on all report pages. Pre-generated analysis reduces on-demand AI calls. |

---

## What Still Needs Work

- **Wire subscription state to ResearchHubPreview** — Currently hardcoded `isSubscribed={false}`. When Session 8 ships, use `useSubscription().isPaidTier`.
- **Wire behavioral events to Session 2** — Stubs in place. Replace with actual `useFeedEvents` hook calls when built.
- **Wire gate check** — Stub in place. Replace with actual `useGateStatus` + `CaseViewGate` when Session 2 builds them.
- **"You Might Also Find..." prompt** — Space reserved at 80%+ scroll. Session 2 builds the `YouMightAlsoFind` component.
- **Event date precision display** — The `event_date_precision` field is available but not yet used in the metadata display. Could add "(approx.)" or "circa" based on precision level.
- **Capacitor native browser** — Source attribution uses `target="_blank"`. When Capacitor wrapper ships, use `Browser.open({ url, presentationStyle: 'popover' })`.
