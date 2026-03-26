# Session Prompt: Session 6b — Report Detail Page Redesign (Index Model)

**Session:** Paradocs - Report Experience — Ingestion & Scale
**Scope:** Redesign the report detail page for the index-with-attribution model. Paradocs Analysis box, metadata grid, source attribution, Research Hub preview, no raw description rendering.
**Priority:** HIGH — must ship before or alongside mass ingestion (Session 10)
**Handoff doc:** `HANDOFF_REPORTS_INGESTION.md` (create)
**Date:** March 23, 2026

---

## Context — Read These First

- `PROJECT_STATUS.md` (root) — Read the **Content & Legal Posture** section. Paradocs is an index with attribution, not a republisher. This redesign enforces that model at the page level.
- `HANDOFF_REPORTS.md` — Session 6a's curated content work. Roswell + Rendlesham editorial pages. These pages are unaffected by this redesign (they're curated, we own the content).
- `src/pages/report/[slug].tsx` (~1100 lines) — current report detail page. This is what you're redesigning.
- `src/components/reports/ReportAIInsight.tsx` — current "AI Analysis" component (on-demand, Claude Sonnet). Will be replaced/refactored.
- `src/lib/services/report-insights.service.ts` — current on-demand insight service. Being replaced by pre-generated `paradocs_narrative` + `paradocs_assessment` fields (Session 10 builds the generator).
- `src/components/FormattedDescription.tsx` — currently renders the raw `description` field. **This must NOT be used for mass-ingested reports.** Only curated reports should render full body text.
- `src/pages/phenomena/[slug].tsx` — contains the "Paradocs Analysis" box styling to match (purple gradient, Lightbulb icon pattern).

**Key understanding:** After Session 10 runs mass ingestion, every report in the DB will have:
- `title`, `summary`, `category`, `location_name`, `country`, `state_province`, `city`, `latitude`, `longitude`, `event_date`, `event_date_precision`, `credibility`, `source_type`
- `feed_hook` (AI-generated 2-3 sentence editorial hook)
- `paradocs_narrative` (AI-generated 1-4 paragraph original contextual analysis)
- `paradocs_assessment` (JSON: credibility_score, credibility_factors, mundane_explanations, content_type, similar_phenomena)
- `source_url` (link to original source — REQUIRED)
- `source_label` (display name like "r/Paranormal", "BFRO Database")
- `description` (raw scraped text — stored for AI but NEVER displayed)

---

## The Two Report Modes

The report page must handle two distinct content modes:

### Mode 1: Mass-Ingested Reports (NEW — this is the main redesign)
- Source: external data (Reddit, NUFORC, BFRO, YouTube, etc.)
- Content model: index with attribution
- Display: Paradocs Analysis (narrative + assessment) + metadata + source link
- Body text: **NONE** — the raw `description` is never rendered
- Source attribution: always shown with outbound link

### Mode 2: Curated Editorial Reports (EXISTING — minimal changes)
- Source: hand-crafted (Roswell, Rendlesham, future Featured Investigations)
- Content model: we own this content entirely
- Display: full editorial body text via FormattedDescription, media gallery, TOC, reading progress
- Source attribution: not needed (we are the source)
- Paradocs Analysis: could show as enhancement, but body text is the main content

**Detection:** Use `source_type` field. Curated reports have `source_type = 'curated'` or `'editorial'`. Everything else is mass-ingested and uses the index model.

---

## Page Layout — Mass-Ingested Reports

Top to bottom, here's what a mass-ingested report page should look like:

### 1. Hero Section
- **Title** (large, prominent)
- **Metadata bar**: Category badge (colored), location (MapPin icon), date (Calendar icon), credibility indicator
- **Feed hook** displayed as a subtitle/lede under the title (styled distinctly from title — slightly smaller, gray-200, italic or serif feel). This is Paradocs's editorial voice — NOT labeled as AI.

### 2. Paradocs Analysis Box (THE MAIN CONTENT)

This is the centerpiece of the page. Style it to match the encyclopedia "Paradocs Analysis" boxes:

```jsx
{/* Container with purple gradient — match phenomena/[slug].tsx style */}
<div className="relative rounded-xl overflow-hidden mb-8">
  <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-indigo-900/30 to-gray-900/40 rounded-xl" />
  <div className="absolute inset-0 border border-purple-500/30 rounded-xl" />
  <div className="relative p-6">
    {/* Header */}
    <div className="flex items-center gap-3 mb-4">
      <Lightbulb className="w-5 h-5 text-purple-400" />
      <div>
        <h2 className="text-lg font-semibold text-white">Paradocs Analysis</h2>
        <p className="text-xs text-purple-400 font-medium tracking-wider uppercase">
          Contextual Analysis
        </p>
      </div>
    </div>

    {/* Narrative — the main content */}
    <div className="prose prose-invert prose-purple max-w-none">
      {/* Render paradocs_narrative as paragraphs */}
      {/* This is Paradocs's editorial voice — NOT labeled as AI-generated */}
    </div>
  </div>
</div>
```

**Key design rules:**
- The narrative (`paradocs_narrative`) is NOT labeled as AI-generated. It is Paradocs's editorial voice.
- Use `Lightbulb` icon (from lucide-react) to match encyclopedia pages.
- Purple gradient background must match the phenomena page style exactly.
- Paragraphs should be well-spaced, readable, with prose-invert styling.

### 3. Assessment Sections (Expandable)

Below the narrative, show the structured assessment data from `paradocs_assessment`:

**3a. Credibility Assessment**
- Credibility score (0-100) with visual indicator (color-coded bar or badge)
- Reasoning text
- Expandable credibility factors list (positive/negative/neutral impacts)
- **Label:** "AI-Assisted Analysis" in small text (this section IS labeled as AI)

**3b. Alternative Explanations**
- List of mundane explanations with likelihood badges (high/medium/low)
- Each with reasoning
- **Label:** "AI-Assisted Analysis"

**3c. Content Classification**
- Content type badge (experiencer_report, historical_case, news_discussion, research_analysis)
- First-hand account indicator
- Confidence level

**3d. Related Phenomena**
- Tags linking to encyclopedia entries (`similar_phenomena` array from assessment)
- Each links to `/phenomena/{slug}`

**Design:** These sections should be collapsible/expandable (credibility expanded by default, others collapsed). Use the existing expand/collapse pattern from ReportAIInsight.tsx.

### 4. Metadata Grid

A clean metadata card showing structured data:

| Field | Display |
|-------|---------|
| Category | Colored badge + label |
| Location | City, State/Province, Country (with MapPin) |
| Date | Formatted event_date + precision indicator |
| Source | source_label + "View original" footnote link |
| Content type | From assessment |
| Credibility | Score badge |

### 5. Source Attribution (Footnote Style)

**This is legally required.** But it should be a citation, not a CTA that directs users away.

```jsx
<div className="mt-6 pt-4 border-t border-white/10">
  <p className="text-xs text-gray-500">
    Original source: {source_label} — <a href={source_url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">View original</a>
  </p>
</div>
```

**Mobile behavior (important for Capacitor native app):**
- In the web app: `target="_blank"` opens in new tab
- In the Capacitor native app (future): use `Browser.open({ url, presentationStyle: 'popover' })` to open an in-app browser sheet that overlays rather than navigating away. For now, just use `target="_blank"` — the Capacitor team will handle the native wrapper behavior.

### 6. Research Hub Preview (Conversion Carrot)

For free/unauthenticated users, show a blurred preview of the Research Hub with a subscription CTA:

```jsx
<div className="relative mt-8 rounded-xl overflow-hidden">
  {/* Blurred content preview */}
  <div className="filter blur-sm pointer-events-none p-6 bg-white/5 rounded-xl">
    <h3 className="text-lg font-semibold text-white mb-2">Research Hub</h3>
    <p className="text-gray-400">Deep analysis, case file connections, related artifacts...</p>
    {/* Fake content blocks to suggest depth */}
    <div className="grid grid-cols-2 gap-3 mt-4">
      <div className="h-20 bg-white/10 rounded-lg" />
      <div className="h-20 bg-white/10 rounded-lg" />
    </div>
  </div>
  {/* Overlay CTA */}
  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-xl">
    <div className="text-center px-6">
      <p className="text-white font-medium mb-2">Unlock the full research toolkit</p>
      <p className="text-gray-300 text-sm mb-4">
        {/* Dynamic context — reference the specific report */}
        This case connects to {linkedPhenomenaCount} phenomena and {connectionCount} related reports.
      </p>
      <button className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-full text-sm font-medium">
        Start with Core — $5.99/mo
      </button>
    </div>
  </div>
</div>
```

**Who sees this:** Free and unauthenticated users. Core+ subscribers see actual Research Hub functionality (or a link to add this report to their hub).

### 7. Behavioral Event Firing (Integration with Session 2)

The report page must fire behavioral events for the algorithmic feed. Session 2 is building the `useFeedEvents` hook and `feed_events` table. On this page, fire:

- **`case_view` event** on page load — increments the depth gate counter AND feeds the algorithmic ranking
- **`scroll_depth` events** at 25%, 50%, 75%, 100% scroll milestones — drives "You might also find..." prompt at 80%+
- **`save` event** on bookmark action
- **`share` event** on share action

Use Session 2's `useFeedEvents` hook (import from `@/lib/hooks/useFeedEvents`). If the hook isn't built yet, stub the calls so they're ready to wire.

Also fire the **gate check** on load: if the user is free-tier and has exceeded daily case views, show the `CaseViewGate` component instead of report content. Session 2 builds the gate component and `useGateStatus` hook — import and render it here.

### 8. "You Might Also Find..." Prompt (Integration with Session 2)

After 80%+ scroll depth, Session 2's `YouMightAlsoFind` component should render as a fixed bottom overlay. The report page provides the `nextRelated` card data (from the existing `related-cards` API) and handles the scroll depth tracking. Session 2 builds the prompt component.

### 9. Related Reports / Connections

Keep the existing `RelatedReports`, `ConnectionCards`, `PatternConnections` components. These work for both curated and mass-ingested reports.

### 8. Below-Fold Components

Keep: `EnvironmentalContext`, `AcademicObservationPanel`, `FurtherReading` (for curated reports). For mass-ingested reports, some of these may have no data and should gracefully hide.

---

## What to Remove/Change for Mass-Ingested Reports

1. **FormattedDescription** — DO NOT render for mass-ingested reports. The raw `description` must never be shown. Only curated reports (`source_type = 'curated'` or `'editorial'`) should use FormattedDescription.

2. **ReportAIInsight (current component)** — Replace with the new Paradocs Analysis box. The new component reads pre-generated `paradocs_narrative` and `paradocs_assessment` directly from the report data (no API call needed — it's in the report record). No loading spinner, no regenerate button. The data is already there.

3. **On-demand insight API** — The `/api/reports/[slug]/insight` endpoint can remain for backward compat but is no longer the primary path. The page reads `paradocs_narrative` and `paradocs_assessment` from the report query itself.

4. **ArticleTableOfContents** — Not needed for mass-ingested reports (no long body text to navigate). Only show for curated reports.

5. **ReadingProgress** — Same as TOC — only for curated reports with full body text.

---

## Implementation Approach

### Option A: Conditional rendering in existing page (recommended)

Add a mode check near the top of the report page component:

```typescript
var isCurated = report.source_type === 'curated' || report.source_type === 'editorial';
var isIndexReport = !isCurated;
```

Then conditionally render sections:

```jsx
{/* Body content */}
{isCurated ? (
  <>
    <ArticleTableOfContents />
    <ReadingProgress />
    <FormattedDescription text={report.description} />
  </>
) : (
  <>
    <ParadocsAnalysisBox
      narrative={report.paradocs_narrative}
      assessment={report.paradocs_assessment}
    />
    <SourceAttribution
      label={report.source_label}
      url={report.source_url}
    />
    <ResearchHubPreview
      report={report}
      isSubscribed={isSubscribed}
    />
  </>
)}
```

### New Components to Create

1. **`src/components/reports/ParadocsAnalysisBox.tsx`**
   - Props: `narrative: string`, `assessment: ParadocsAssessment | null`, `className?: string`
   - Purple gradient container matching encyclopedia style
   - Narrative paragraphs (not labeled as AI)
   - Expandable assessment sections (labeled "AI-Assisted Analysis")

2. **`src/components/reports/SourceAttribution.tsx`**
   - Props: `label: string`, `url: string`
   - Footnote-style attribution link
   - Small, unobtrusive, but always present

3. **`src/components/reports/ResearchHubPreview.tsx`**
   - Props: `report: Report`, `isSubscribed: boolean`
   - Blurred preview for free users
   - Dynamic CTA text referencing the specific report's connections
   - Link to Research Hub for subscribed users

4. **Refactor `src/components/reports/ReportAIInsight.tsx`** → either deprecate or refactor into a wrapper that reads pre-generated data instead of fetching on-demand.

---

## Technical Constraints

- **SWC compliance:** Use `var`, `function(){}`, string concat, no template literals in JSX, unicode escapes for emojis. This is frontend code — SWC rules apply strictly.
- **No new dependencies:** Use existing lucide-react icons, Tailwind classes, existing component patterns.
- **Report query:** The report query in `[slug].tsx` must now SELECT `paradocs_narrative`, `paradocs_assessment`, `source_url`, `source_label`, `feed_hook`, `event_date_precision` in addition to existing fields. These are all on the `reports` table.
- **Graceful fallback:** If a report doesn't have `paradocs_narrative` yet (ingestion hasn't run), fall back to the existing on-demand analysis or show a "Analysis coming soon" placeholder. Don't crash.
- **Mobile-first:** Everything must look great on mobile. The Paradocs Analysis box, assessment sections, metadata grid — all responsive. Test at 375px width.

---

## Files to Create/Modify

**New files:**
- `src/components/reports/ParadocsAnalysisBox.tsx` — Main Paradocs Analysis display
- `src/components/reports/SourceAttribution.tsx` — Source citation footnote
- `src/components/reports/ResearchHubPreview.tsx` — Blurred Research Hub conversion carrot
- `HANDOFF_REPORTS_INGESTION.md` — Session handoff document

**Modified files:**
- `src/pages/report/[slug].tsx` — Add mode detection (curated vs. index), conditional rendering, updated query to include new fields
- `src/components/reports/ReportAIInsight.tsx` — Deprecate or refactor (reads pre-generated data now)
- `PROJECT_STATUS.md` — Update Session 6b section

---

## Definition of Done

- [ ] Report page detects curated vs. mass-ingested reports and renders appropriately
- [ ] Mass-ingested reports show: title, feed_hook lede, Paradocs Analysis box (narrative + assessment), metadata grid, source attribution, Research Hub preview, related reports
- [ ] Mass-ingested reports do NOT show: raw description, FormattedDescription, TOC, reading progress
- [ ] Curated reports (Roswell, Rendlesham) are UNAFFECTED — still show full editorial content
- [ ] Paradocs Analysis box matches encyclopedia page styling (purple gradient, Lightbulb icon)
- [ ] Narrative section is NOT labeled as AI-generated
- [ ] Assessment sections (credibility, mundane explanations) ARE labeled "AI-Assisted Analysis"
- [ ] Source attribution footnote always present on index reports with working link
- [ ] Research Hub preview shows blurred content with subscription CTA for free users
- [ ] Graceful fallback when `paradocs_narrative` is null (analysis not yet generated)
- [ ] Behavioral events fire on page load (case_view), scroll milestones (scroll_depth), save, share
- [ ] Gate check on load — free users past daily limit see CaseViewGate instead of content
- [ ] "You might also find..." prompt space reserved at 80%+ scroll depth
- [ ] Mobile responsive at 375px — all sections render cleanly
- [ ] SWC compliant (no template literals in JSX, etc.)
- [ ] `HANDOFF_REPORTS_INGESTION.md` created
- [ ] `PROJECT_STATUS.md` Session 6b updated

---

## Cross-Session Integration

| Session | Dependency |
|---------|-----------|
| Session 10 (Ingestion) | Produces `paradocs_narrative`, `paradocs_assessment`, `source_url`, `feed_hook` fields. **Must run before this page has real data to display.** |
| Session 2 (Discover) | Feed cards link to this page. Card `feed_hook` matches page lede. |
| Session 5 (Dashboard) | Research Hub preview on report page drives conversion to Dashboard features. |
| Session 8 (Subscription) | Research Hub CTA and depth gating depend on subscription state check. |
| Session 6a (Curated) | Curated reports use different rendering path — must not break those pages. |
| Session 15 (AI) | Ask the Unknown FAB stays on report pages. Pre-generated analysis reduces need for on-demand AI calls. |
