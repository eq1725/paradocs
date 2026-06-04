# Lab Tier 1 — Build Notes (V11.17.67)

**Scope:** Quick-wins rename + vocabulary purge pass per
`LAB_PANEL_REVIEW_V3.md` (sections 2-4) and `LAB_PANEL_REVIEW_V2.md`
(final naming recommendation).

**Out of scope:** Structural tab consolidation, dossier-as-spine,
named-match scaffolding (Tier 2); sentiment arc, export, peer DM
(Tier 3); DB table renames (deferred 90 days per panel).

---

## Files touched

| File | Change |
|---|---|
| `src/components/Layout.tsx` | Top-nav "Lab" → "My Record"; dropdown menu entry "Lab" → "My Record"; footer link "Lab" → "My Record" |
| `src/components/mobile/MobileBottomTabs.tsx` | Bottom-nav label "Lab" → "My Record" (URL `/lab` unchanged) |
| `src/pages/lab.tsx` | `<title>` Lab → My Record; `<h1>` "Lab" → "My Record"; subtitle reframed; tabs `"Your Story" → "Story"`; `UnauthenticatedPrompt` copy rewritten; `YourSignalTab` header `"Your Signal" → "How yours connects"`; `SinceLastVisitLine` "signal" register purged; `SignalAlertsOptInCard` titles/copy → "Record alerts"; band sublabels "signal" → "account"; locked AI card upgrade copy modernized; "Your Signal updates" → "Your record updates"; legacy comments updated to reflect new identifiers; imports flipped (`LabConstellationTab → MyRecordTab`, `LabCasesTab → LabCollectionsTab`) |
| `src/components/dashboard/MyRecordTab.tsx` | **Renamed** from `LabConstellationTab.tsx`; default export `LabConstellationTab` → `MyRecordTab`; file-header doc reframed; RADAR caption strings → "pattern lens on your record" |
| `src/components/dashboard/LabCollectionsTab.tsx` | **Renamed** from `LabCasesTab.tsx`; default export + props interface flipped to `LabCollectionsTab` / `LabCollectionsTabProps`; user-visible "Case Files" → "Collections", "case file" → "collection" throughout titles / buttons / aria-labels / empty states / sharing copy / collaborator copy |
| `src/components/dashboard/CaseFileBar.tsx` | "New case file" CTA → "New collection"; create-modal heading → "New collection"; placeholder + validation strings rewritten; "Create case file" → "Create collection" |
| `src/components/discover/LabPromo.tsx` | Wordmark "Lab" → "My Record" (size adjusted for longer string); sub-headline reframed; benefit lines rewritten with new tab labels ("My Record" / "Connections" / "Collections"); headline pool documentary-register pass; file-header doc reframed |
| `src/components/discover/CaseViewGate.tsx` | Depth-message copy: "Core gives you unlimited access" → "Basic opens all of them — and adds your own to the archive"; CTA "Start Core" → "Start Basic" |
| `src/components/reports/ResearchHubPreview.tsx` | CTA "Start with Core" → "Start with Basic" |
| `src/pages/api/cron/signal-alerts.ts` | Notification copy "Daily Signal Alerts" → "Daily record alerts"; body line rewritten in record register |

**Files renamed (git mv):**

- `src/components/dashboard/LabConstellationTab.tsx` → `MyRecordTab.tsx`
- `src/components/dashboard/LabCasesTab.tsx` → `LabCollectionsTab.tsx`

**Importers updated:**

- `src/pages/lab.tsx` — both rename targets
- `src/components/dashboard/SignatureGrowthCard.tsx` — comment only (no runtime import)
- `src/components/radar/RadarVisualization.tsx` — comment only (no runtime import)

---

## Literal old → new rename table

### Surface labels

| Old string | New string |
|---|---|
| `Lab` (nav) | `My Record` |
| `Lab \| Paradocs` (title) | `My Record \| Paradocs` |
| `Your Story` (tab) | `Story` |
| `Your Signal` (Story header) | `How yours connects` |
| `Case Files` / `case files` / `case file` | `Collections` / `collections` / `collection` |
| `New case file` | `New collection` |
| `Create case file` | `Create collection` |
| `Edit case file` | `Edit collection` |
| `Each report sharpens your RADAR.` | `Each report sharpens the pattern lens on your record.` |
| `Every match in your RADAR…` | `Every related account in the pattern lens…` |
| `Welcome to your Signal.` | `Welcome to your record.` |
| `Nothing new in your signal yet` | `Nothing new for your record yet` |
| `Signal alerts are on` | `Record alerts are on` |
| `Enable signal alerts` | `Enable record alerts` |
| `Get a ping when your signal grows` | `Get a quiet note when your record grows` |
| `Signal Pushes` (cron notification body) | record-register rewrite |
| `Start Core — $5.99/mo` | `Start Basic — $5.99/mo` |
| `Start with Core` | `Start with Basic` |
| `Daily Signal Alerts are now part of Basic` | `Daily record alerts are now part of Basic` |

### Component / file identifiers (exports + file paths)

| Old | New |
|---|---|
| `LabConstellationTab` (default export) | `MyRecordTab` |
| `LabConstellationTab.tsx` (file) | `MyRecordTab.tsx` |
| `LabCasesTab` (default export) | `LabCollectionsTab` |
| `LabCasesTab.tsx` (file) | `LabCollectionsTab.tsx` |
| `LabCasesTabProps` (interface) | `LabCollectionsTabProps` |

### Vocabulary purge — body copy register

| Old (intelligence / fitness vocabulary) | New (documentary / archive vocabulary) |
|---|---|
| "your story" (when meaning the user's submitted experience) | "your account" / "your experience" / "your record" |
| "Your Signal" (header / nav) | "How yours connects" / "your record" |
| "fingerprint" (body copy) | "signature" |
| "RADAR" (body copy) | "pattern lens" / "the pattern lens on your record" |
| "report" (where it meant the user's own submission to themselves) | "account" / "experience" |
| "personal research workspace" (subtitle) | "the experiences you've shared and where they sit in the wider archive" |
| "Your Lab is your personal research workspace" | "My Record is the experience you share, set against the wider archive of 200,000+ accounts" |
| "Lab makes it visible" (LabPromo sub-headline) | "My Record places your account inside it" |

### Marketing benefit lines (LabPromo)

| Old | New |
|---|---|
| `Every report you save, in one place` / tab=Library | `Your experience, set against 200k accounts` / tab=My Record |
| `Radar — reports that match your details` / tab=Your Story | `Related reports surfaced as the archive grows` / tab=Connections |
| `Ask the archive — 100k witnesses, one question` / tab=Explore | `Keep collections of accounts that matter to you` / tab=Collections |

### Class flag retained

`data-section="lab-constellation"` was retained intentionally — it's an
analytics-dashboard selector, not a user-facing string. Its rename
will happen alongside the DB table rename in the 90-day defer window.

---

## Deliberately NOT changed (with reasons)

1. **DB tables remain `constellation_*`.** Per
   `LAB_PANEL_REVIEW_V3.md` §3 and `LAB_PANEL_REVIEW_V2.md` final naming
   recommendation, the actual `ALTER TABLE` is deferred until after the
   UI ships and views have been in production for a sprint. All
   `supabase.from('constellation_*')` queries remain unchanged.

2. **Internal TypeScript identifiers (`CaseFile`, `caseFile`,
   `case_files` query strings, `selectedCaseFileId`, etc.) retained**
   inside `LabCollectionsTab.tsx`. Renaming the variable + type names
   would have touched ~250 lines of plumbing for zero user-visible
   change. The surface label flipped; the internal data shape
   intentionally still reads as "case_file" because the DB column name
   is `case_file_id`. Tier 2 (or the post-90-day rename window) can
   sweep these.

3. **Pricing not changed.** Founder confirmed Free / Basic $5.99 /
   Pro $14.99 in the brief, and that matches what's in
   `src/pages/api/subscription/create-checkout.ts` (V9.6 line 17: "the
   public pricing is $5.99/$14.99"). No price strings touched. Tier
   labels normalized from legacy "Core" → "Basic" in two surfaces
   (`CaseViewGate.tsx`, `ResearchHubPreview.tsx`).

4. **`ConstellationReveal.tsx`, `ConstellationListView.tsx`,
   `ConstellationMap.tsx`, `ConstellationSidebar.tsx`,
   `ConstellationPanel.tsx`, `constellation-data.ts`,
   `constellation-types.ts` left as-is.** Per V2 final-naming-recommendation
   sub-bullet "do these in v2 of the rename sprint, not v1." Tier 2
   touches these when collapsing tab structure.

5. **`/pricing` route not modified.** No `/pricing.tsx` exists in the
   repo — that route appears to be served externally or is a 404.
   Several CTAs link to `/pricing`; flagging for founder review (see
   open question).

6. **`useLabData.ts` hook untouched** per V2 guidance ("the hook is
   fine; nothing user-facing").

7. **`RadarVisualization.tsx`** kept its name per V2 guidance ("RADAR
   is a useful internal name and the user-facing label is the scope
   eyebrow, not the component"). User-visible RADAR copy is already
   rewritten in `MyRecordTab.tsx` (captions, CTA microcopy).

8. **`signal_*` PostHog events untouched** — instrumentation needs a
   coordinated migration with the email-digest copy + dashboard
   filters. Tier 2.

9. **`LabSavesTab.tsx` import/name kept** per brief: "keep until Tier
   2 collapses tabs."

---

## Typecheck status

**Clean for Tier 1 work.** Zero new TypeScript errors introduced by
this pass. Verification:

```bash
cd /sessions/affectionate-tender-fermi/mnt/paradocs
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E \
  "src/components/Layout\.tsx|src/components/mobile/MobileBottomTabs\.tsx|src/components/discover/LabPromo\.tsx|src/components/discover/CaseViewGate\.tsx|src/components/reports/ResearchHubPreview\.tsx|src/components/dashboard/CaseFileBar\.tsx|src/components/lab/HintsRail\.tsx|src/pages/lab\.tsx|src/pages/api/cron/signal-alerts\.ts"
# (no output)
```

The errors that show up in `MyRecordTab.tsx` and `LabCollectionsTab.tsx`
are all pre-existing Supabase generic-typing issues ("Property X does
not exist on type 'never'") — they exist at identical line numbers
under the old filenames; the rename did not introduce them. Same
pattern persists across every API file in `src/pages/api/research-hub/`
and is a known repo-wide Supabase-types regression unrelated to this
work.

---

## HintsRail polish — verification

The brief asked us to confirm the HintsRail header voice and visual
fit. Status:

- **Header copy:** `"From the catalogue"` (line 173) — documentary,
  panel-blessed, already correct. No change needed.
- **Wordmark:** Card titles use `font-brand` + inline
  `'Changa One'` family stack (line 193) — matches the Paradocs brand
  wordmark.
- **Brand purple:** Accent strip falls back to `#9000F0` (line 63) for
  generic / cross-category Hints; category-family Hints map to the
  established `paranormal-*` palette. On-brand.
- **CTA buttons:** Use `bg-primary-600 hover:bg-primary-500` — same
  primary token as everywhere else.
- **SIGNAL duplication:** `YourSignalTab` and `HintsRail` currently
  both render on the Story tab. The bands inside SIGNAL (Your
  Signature / Near You / Across the Archive) overlap conceptually
  with what Hints surfaces. **Marked for Tier 2** — the panel's Tier 2
  deliverable #1 is "Replace four Signal cards with one synthesized
  prose paragraph; demote cards to 'see the breakdown' expandable."
  HintsRail is the right replacement; SIGNAL collapses to an expander
  beneath it. Not removed in Tier 1 to avoid scope creep / partial
  cutover.

---

## Open question for founder

**`/pricing` route.** No `/pricing.tsx` exists in the repo, yet
multiple surfaces link to it (`LabPromo` CTA, `CaseViewGate` CTA,
`ResearchHubPreview` CTA, plus the Stripe checkout success-redirect
path). Either (a) that page is served from a separate marketing
deployment, (b) it's a stub that needs to be built, or (c) the links
should go to `/account/subscription` (which does exist and is the
target of the in-app upgrade CTAs).

Suggested resolution: confirm whether `/pricing` is intentional. If
not, repoint all four CTAs to `/account/subscription` (a 5-minute
follow-up that I'll roll into Tier 2 once the founder weighs in).

---

## Commit message draft

```
V11.17.67 — Tier 1 Lab rename: "Lab" → "My Record" surface pass

Per LAB_PANEL_REVIEW_V3 §2-4: ship the quick-wins rename + vocabulary
purge so a user opening the app immediately feels the brand shift
toward documentary register, even though IA hasn't been restructured
yet (Tier 2).

Surface changes:
- Bottom nav, top nav, dropdown, footer: "Lab" → "My Record"
- Page title + <h1> + subtitle on /lab reframed in archive register
- Tab label "Your Story" → "Story" (drops the dashboard possessive)
- "Your Signal" header → "How yours connects"
- "Case Files" / "case file" → "Collections" / "collection" throughout
- "Signal alerts" → "Record alerts" in opt-in card + push copy
- "your story" / "your signal" / "your fingerprint" body copy →
  "your account" / "your record" / "signature" (documentary register)
- "Each report sharpens your RADAR" → "...sharpens the pattern lens"
- LabPromo wordmark + sub-headline + benefit lines rewritten
- Legacy "Core" tier labels → "Basic" in two paywall CTAs

Component renames (file + export):
- LabConstellationTab.tsx → MyRecordTab.tsx
- LabCasesTab.tsx → LabCollectionsTab.tsx
Importers updated in lab.tsx; comment-only references in
SignatureGrowthCard / RadarVisualization left as-is.

Not changed:
- DB tables (constellation_*) — deferred 90 days per panel
- Pricing prices ($5.99 / $14.99 confirmed by founder)
- /pricing route (flagged for founder — may not exist)
- signal_* PostHog events (Tier 2 coordinated migration)
- ConstellationReveal / ConstellationListView / etc. — Tier 2
- LabSavesTab — per brief, keep until Tier 2 collapses tabs

Typecheck: zero new errors introduced by this pass. Pre-existing
Supabase generic-typing errors persist at identical lines in the
renamed files.

See docs/LAB_TIER1_BUILD_NOTES.md for the full string-replacement
table and rationale.
```
