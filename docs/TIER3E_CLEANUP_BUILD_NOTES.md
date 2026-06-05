# Lab Tier 3E — Cleanup Build Notes (V11.17.75)

**Scope:** Resolve the contained UI duplication between the new
`RadarSurface` (V3 §5 categorical lens) and the legacy `MyRecordTab`
polished radar dial. Split the legacy tab into the two focused
components that were still load-bearing (`MatchList` +
`ManageSubmissionsPanel`) and delete the wrapper.

This closes Tier 2B Tier 3 TODO #4 and the open question
("ship Tier 2B as-is with the duplication, or hold for the split?")
documented in `docs/LAB_TIER2B_BUILD_NOTES.md`.

**Predecessors:**
- Tier 2B (V11.17.69) — single-page IA, `RadarSurface` added,
  `MyRecordTab` left mounted as the legacy spine.
- Tier 3A–3D — Pro Dossier, Watchlists, Named-Match / Peer DM,
  Sentiment + Haiku synthesized paragraphs.

**Files explicitly NOT touched (parallel agents own these):**
- `src/lib/lab/named-match/*`
- `src/components/lab/NamedMatch*`, `src/components/lab/DM*`,
  `src/components/lab/DiscoverabilityToggle.tsx`
- `src/pages/api/lab/named-match/*`,
  `src/pages/api/cron/detect-named-matches.ts`
- `supabase/migrations/*named_matches*`
- `src/lib/sentiment/*`,
  `src/pages/api/lab/temporal-distribution*`,
  `src/pages/api/lab/synthesized-paragraph*`,
  `scripts/_*sentiment*`,
  `supabase/migrations/*sentiment*`
- Tier 3A `ProDossier.tsx`, Tier 3B `WatchlistsRail.tsx` and friends.

---

## Files created

| File | Purpose |
|---|---|
| `src/components/lab/MatchList.tsx` | Rich, inline-expandable related-account list. Filter chips ("All reports" / "Nearby"), witness-adjacency callout (≥3 corroborated rows), `NewMatchAlertsCard` opt-in, per-dimension match bars, "Strong" glyph, location + date facts, "View full report" link, persistent "Add another experience" CTA. Pure presentational — accepts the `matches` payload from the `/api/constellation/match` RPC. |
| `src/components/lab/ManageSubmissionsPanel.tsx` | Self-contained Edit/Delete panel. Inline trigger pill + slide-up modal (mobile) / centered dialog (desktop). Lazy-loads the user's submissions from Supabase on open. Edit reuses the existing `EditReportModal`. Delete is the same two-step iOS Mail / Notes confirm pattern, posting to `/api/reports/[slug]/delete`. Calls `onDeleted` / `onEdited` callbacks so the parent (`lab.tsx`) can refetch its own focused-experience state. |

## Files deleted

| File | Reason |
|---|---|
| `src/components/dashboard/MyRecordTab.tsx` | Legacy wrapper that combined a polished radar dial (now duplicated by `RadarSurface`), a `SubmissionSwitcher` (replaced by `DossierHeader` in Tier 2B), the match list (extracted to `MatchList`), and the manage panel (extracted to `ManageSubmissionsPanel`). Per the Tier 2B founder open question, picking option (b) — delete the legacy file outright — was cleaner long-term than keeping a transition shim. |

## Files edited

| File | One-line reason |
|---|---|
| `src/pages/lab.tsx` | Drop `MyRecordTab` import + mount; add `MatchList` + `ManageSubmissionsPanel` imports + mounts (replaces SECTION 8). Capture user email in the auth effect so the inline `NewMatchAlertsCard` inside `MatchList` can scope its preferences. Wire `onDeleted` / `onEdited` callbacks to keep the parent's `reports[]` and focused index in sync. The `data-section="lab-constellation"` analytics hook is retained on the new wrapper. |
| `src/components/dashboard/SignatureGrowthCard.tsx` | One-line comment fix — stale reference to `LabConstellationTab` rewritten to point at the new `MatchList` (data-section="lab-constellation"). No code change. |
| `src/components/radar/RadarVisualization.tsx` | One-line comment fix — stale `LabConstellationTab` reference replaced with `RadarSurface`. No code change. |

---

## Radar duplication: resolved

**Before (V11.17.74):** `/lab` rendered `RadarSurface` (V3 §5 lens
with eyebrow + tooltip + widen pill) immediately above a second
RADAR dial inside `MyRecordTab` (the polished view, with its own
filter chips and "YOU"-card affordance). Both showed the same
matches in the same abstract / categorical lens — one-screen-tall
visual duplication.

**After (V11.17.75):** `RadarSurface` is the single canonical dial.
The polished view's content that was load-bearing (match list,
new-match alerts card, witness-adjacency callout, "add another"
CTA, Manage panel) has been split into `MatchList` and
`ManageSubmissionsPanel`. The radar dial itself is gone. The
multi-submission switcher chrome that wrapped these was already
superseded by `DossierHeader` in Tier 2B — no functionality regressed.

---

## Pre-existing TypeScript errors that GO AWAY by the delete

The Tier 2B build notes flagged a set of "pre-existing Supabase
generic-typing errors persist in `MyRecordTab.tsx`" — these were
the 16 `TS2339: Property 'X' does not exist on type 'never'`
errors that resulted from the repo-wide Supabase v2 generic-typing
regression hitting MyRecordTab's `loadData` block where it indexed
`userReports[initialIdx]` directly. All gone:

```
src/components/dashboard/MyRecordTab.tsx(158,22): Property 'id' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(162,91): Property 'category' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(163,28): Property 'category' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(164,29): Property 'city' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(164,42): Property 'state_province' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(164,95): Property 'location_description' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(165,28): Property 'latitude' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(166,29): Property 'longitude' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(172,31): Property 'description' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(172,53): Property 'summary' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(180,35): Property 'id' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(180,46): Property 'category' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(180,63): Property 'latitude' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(180,80): Property 'longitude' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(180,98): Property 'description' does not exist on type 'never'.
src/components/dashboard/MyRecordTab.tsx(180,120): Property 'summary' does not exist on type 'never'.
```

The new components avoid the issue by typing their Supabase rows
explicitly (`SubmissionRow` interface in `ManageSubmissionsPanel`)
and accepting matches as a typed prop in `MatchList`.

---

## Verification

```bash
cd /sessions/affectionate-tender-fermi/mnt/paradocs
npx tsc --noEmit --project tsconfig.json 2>&1 \
  | grep -E "MatchList|ManageSubmissionsPanel|src/pages/lab\.tsx|MyRecordTab"
# (no output)

npx next lint --file src/components/lab/MatchList.tsx
# ✔ No ESLint warnings or errors

npx next lint --file src/components/lab/ManageSubmissionsPanel.tsx
# ✔ No ESLint warnings or errors
```

Other repo-wide Supabase generic-typing errors persist outside the
affected files (saved_searches, user/stats, etc.) — same regression
as Tier 2B, unrelated to this PR.

---

## Open questions for founder

**Q1 — `ManageSubmissionsPanel` lazy-fetches its own reports list,
duplicating the Supabase round-trip that `lab.tsx` already does.**
The duplication is intentional (the panel works regardless of
whether the parent has loaded reports) but it's an extra ~1 query
per open. If we want to share state, we'd promote a `useLabReports`
hook. Leaving as-is until usage data tells us it matters.

**Q2 — The "Manage your submissions" trigger pill currently sits
between SECTION 8 (`MatchList`) and SECTION 9 (Pro Dossier teaser).
Visually it's small and discoverable, but if founder wants it
nearer to `DossierHeader` (which already owns submission focus
switching) we should move it up to right under the dossier.** Today
the pill is positioned where the old Manage gear used to be (above
the match list), so visual rhythm is preserved.

---

## Commit message draft

```
V11.17.75 — Tier 3E Lab cleanup: split MyRecordTab + drop radar duplication

Per LAB_TIER2B_BUILD_NOTES.md Tier 3 TODO #4 + the founder open
question on the contained MyRecordTab ↔ RadarSurface duplication.

New components (src/components/lab/):
- MatchList.tsx               — rich related-account list extracted
                                 from MyRecordTab; filter chips,
                                 witness-adjacency callout, new-match
                                 alerts opt-in, per-dimension match
                                 bars, location + date facts.
- ManageSubmissionsPanel.tsx  — self-contained edit/delete panel
                                 extracted from MyRecordTab; trigger
                                 pill + slide-up modal + EditReportModal
                                 + two-step inline delete.

Deleted:
- src/components/dashboard/MyRecordTab.tsx — legacy wrapper. The
  polished radar dial inside it duplicated RadarSurface visually
  on the same page; deleting removes the duplication and 16 pre-
  existing Supabase generic-typing TS errors at the same time.

Edited:
- src/pages/lab.tsx — drop MyRecordTab import + mount; mount
  MatchList + ManageSubmissionsPanel in SECTION 8 of the single-
  page IA. Capture user email so MatchList's inline new-match
  alerts card can scope its preferences. Wire onDeleted / onEdited
  callbacks so the parent reports[] + focused index stay in sync.
- src/components/dashboard/SignatureGrowthCard.tsx — comment-only
  fix; stale LabConstellationTab reference now points at MatchList.
- src/components/radar/RadarVisualization.tsx — comment-only fix;
  stale LabConstellationTab reference now points at RadarSurface.

Radar duplication: RESOLVED. RadarSurface (V3 §5 categorical lens
with eyebrow + tooltip + widen pill) is the single canonical dial
on /lab. The polished radar dial that used to sit alongside the
match list is gone entirely.

Submission-focus switching: DossierHeader keeps owning this (Tier
2B). The legacy SubmissionSwitcher inside MyRecordTab was already
superseded — it's deleted now as part of the wrapper delete.

UX parity: visual + behavioral parity with the legacy match list
and Manage panel. Match-list filter chips ("All reports" / "Nearby"),
witness-adjacency callout, new-match alerts opt-in card, "Strong"
glyph on corroborated rows, per-dimension match bars, "View full
report" link, persistent "Add another experience" CTA — all
preserved. Edit and two-step delete affordances in the Manage panel
preserved.

Typecheck: ZERO errors in MatchList / ManageSubmissionsPanel / lab.tsx.
The 16 pre-existing Supabase TS errors in MyRecordTab.tsx that the
Tier 2B notes flagged as "pre-existing, ignore" are GONE — they
disappeared with the delete.

Lint: clean on both new components. Pre-existing react-hooks/exhaustive-deps
warning on lab.tsx auth effect carries over from Tier 2B unchanged.

See docs/TIER3E_CLEANUP_BUILD_NOTES.md for the full file map and
the two open questions for founder.
```
