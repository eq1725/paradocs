# Lab Tier 2B — Build Notes (V11.17.69)

**Scope:** Structural pass — collapse the 3-tab Lab IA into a single
scrolling "My Record" page anchored on a persistent, n-aware dossier
header with stacked comparative surfaces (Hints / Temporal /
Geographic / categorical Radar lens), wired to the Tier 2A
`LabPaywallSurface` for Free → Basic / Free → Pro depth gates.

**Predecessors:**
- `docs/LAB_TIER1_BUILD_NOTES.md` — rename + vocabulary purge.
- Tier 2A — pricing / subscription / Stripe (committed at `9cbb5cbf`).
  No Tier 2A files touched in this PR.

**Briefing:**
- `docs/LAB_PANEL_REVIEW_V3.md` §2 (gating matrix), §3 (n=1 gold
  standard), §4 (cadence + RADAR scope), §5 (RADAR clarification).
- `docs/LAB_PANEL_REVIEW_V2.md` §4 (Hints + temporal/geographic
  pairing).
- `docs/PRO_TIER_VALIDATION_V3.md` (Dossier + Watchlists flagships
  for the Pro teaser slots).

**Out of scope (kept for Tier 3):**
- Pro Dossier auto-generation, PDF export, social share.
- Custom Watchlists schema + alerting.
- Named-match handshake (`LabPaywallSurface` teaser surfaces the
  pitch; mutual opt-in machinery is Tier 3).
- Sentiment baseline copy line (soft-launch Tier 3 per V3 §5).
- Splitting `MyRecordTab.tsx` apart (the legacy match-list +
  Manage panel still renders as a section below the new surfaces).

---

## Files created (NEW)

| File | Purpose |
|---|---|
| `src/components/lab/DossierHeader.tsx` | Persistent n-aware spine. Renders `EmptyDossier` at n=0; full-bleed dossier card at n=1; experience strip + focused dossier at n≥2. Includes the permanent "Add another to your record" pill below. |
| `src/components/lab/EmptyDossier.tsx` | n=0 ghosted-dossier empty state with CTA `Document your first experience → /start`. Per V2 §2 / V3 §3 mass-market default. |
| `src/components/lab/TemporalStrip.tsx` | Clock-and-decade strip. 24-hour dial + decade band; user dot vs corpus distribution. Paired prose sentence per visualization. |
| `src/components/lab/GeographicSurface.tsx` | Real MapLibre map (not RADAR). Centered on user's location with 50-mile ring + nearby-Archive dots; three prose data lines beneath (count / closest in time and place / corridor when detected). |
| `src/components/lab/RadarSurface.tsx` | V3 §5 wrapper around `RadarVisualization`. Adds permanent scope eyebrow, "What's not shown" info tooltip, "Widen the view" pill. |
| `src/components/lab/CrossExperienceHeader.tsx` | n≥2 aggregated header. Body-of-work paragraph computed client-side (year range, dominant phen-family, shared-location anchor, night-time concentration). |

## Files edited

| File | Change |
|---|---|
| `src/pages/lab.tsx` | **Full rewrite.** Tabs removed (story / library / explore). New single-page scroll IA: header → DossierHeader → CrossExperienceHeader → HintsRail → TemporalStrip → GeographicSurface → named-match `LabPaywallSurface` (Free only) → RadarSurface → legacy `MyRecordTab` (match list + Manage panel kept until Tier 3 split) → Dossier paywall teaser (non-Pro) → Watchlists paywall teaser (non-Pro). Loads reports via direct Supabase query (the prior path was inside `MyRecordTab`); fetches matches per focused experience via existing `/api/constellation/match` RPC; derives `nearbyReports` + synthesized paragraph client-side from the match payload. |

## Files explicitly NOT touched (Tier 2A or orthogonal)

- `src/components/lab/LabPaywallSurface.tsx` — Tier 2A; just USED.
- `src/components/lab/HintsRail.tsx` — Hints session; just kept
  mounted in the new IA.
- `src/components/pricing/*`, `src/pages/pricing.tsx`,
  `src/pages/account/subscription.tsx`,
  `src/pages/api/subscription/*`,
  `src/pages/api/webhooks/stripe.ts` — Tier 2A.
- `src/components/Layout.tsx` — Tier 2A added the Upgrade pill.
- `src/components/dashboard/MyRecordTab.tsx` — left untouched
  (it still drives the legacy polished-radar view, match list,
  multi-submission switcher, manage panel, EditReportModal). It is
  mounted below the new surfaces in `lab.tsx` so all of its UX
  remains reachable until Tier 3 splits it apart.
- `src/components/dashboard/LabCollectionsTab.tsx`,
  `LabSavesTab.tsx` — Library/Collections functionality is
  reachable via Manage panel inside `MyRecordTab`; the Tier 3
  pass will decide whether to revive `/collections` as a
  dedicated sub-route.
- `src/lib/hooks/useLabData.ts` — not needed in the new IA
  (lab.tsx now reads reports directly + delegates per-experience
  enrichment to the constellation/match RPC). Hook left
  untouched because LabSavesTab / LabCollectionsTab still
  depend on it.

---

## New lab.tsx structure (top → bottom)

1. `<Head>` — title "My Record | Paradocs".
2. Header row — Telescope mark + "My Record" wordmark (Changa One) +
   subtitle; Submit Report / Bell / Settings on the right.
3. `<UnauthenticatedPrompt>` OR loading shimmer (preserved).
4. `<DossierHeader>` — spine (n=0 → EmptyDossier; n=1 → full-bleed
   focused dossier; n≥2 → strip + focused dossier; "Add another"
   pill below).
5. `<CrossExperienceHeader>` — only at n≥2.
6. `<HintsRail>` — kept mounted.
7. `<TemporalStrip>` — focused experience's hour + decade against
   the same-family Archive distribution. Placeholder when distribution
   not yet loaded.
8. `<GeographicSurface>` — real MapLibre map + 3 prose data lines.
9. `<LabPaywallSurface kicker="Named-match introductions" upgradeTo="basic" />`
   — Free tier only, when nearbyReports.length > 0.
10. `<RadarSurface>` — categorical lens with V3 §5 scope eyebrow,
    "What's not shown" tooltip, "Widen the view" pill.
11. Legacy `<MyRecordTab>` — match list + Manage panel + EditReportModal.
12. `<LabPaywallSurface kicker="The Dossier" upgradeTo="pro" />` —
    Free + Basic teaser for Pro flagship.
13. `<LabPaywallSurface kicker="Custom Watchlists" upgradeTo="pro" />` —
    Free + Basic teaser for the second Pro flagship.

---

## n-tier scaling (per founder decision V3 §3)

| n | Renders |
|---|---|
| n=0 | `EmptyDossier` (ghosted dossier 30% opacity + "Document your first experience" CTA). All comparative surfaces suppressed. |
| n=1 | Full-bleed dossier + synthesized paragraph + verbatim account + all comparative surfaces (Temporal / Geographic / Hints / Radar / paywall teasers). |
| n=2-4 | Same as n=1 + experience strip above focused dossier + `CrossExperienceHeader` body-of-work paragraph. |
| n=5-14 | Same as n=2-4; experience strip scrolls horizontally on overflow. |
| n=15+ | Same again; `CrossExperienceHeader` surfaces the "Open filters" affordance (handler placeholder; wire-up is Tier 3 — Pro lens bar). |

Tier-depth gating (NOT count-gating):
- **Free:** all surfaces render with shallow stats. `TemporalStrip` /
  `GeographicSurface` show the Free-tier "Basic adds…" depth-add
  hint at the bottom of each card.
- **Basic / Pro:** depth-add hints suppressed; the structure is the
  same. (Depth deepening — radius control, lunar overlays, etc. — is
  Tier 3.)

---

## Where `LabPaywallSurface` is surfaced

Three sites, all inline (never modal), per the Tier 2A spec:

1. **Named-match teaser** (canonical V3 §3 step 6). Renders ONLY
   when `tier === 'free'` AND the focused experience has nearby
   reports (`nearbyReports.length > 0`). Surface slug `named_match`,
   upgrade target `basic`.
2. **Dossier preview** (`kicker="The Dossier"`). Renders when
   `tier !== 'pro'`, surface slug `dossier_preview`, target `pro`.
3. **Watchlists preview** (`kicker="Custom Watchlists"`). Renders
   when `tier !== 'pro'`, surface slug `watchlist_preview`, target
   `pro`.

---

## Tier 3 wire-up TODOs (for the next pass)

1. **Real distributions for `TemporalStrip`.** Build
   `/api/lab/temporal-distribution?phen_family=X` (hour-of-day
   histogram + decade share). Wire into `lab.tsx` after match
   load. Today the strip renders the user's dot + a "computing"
   placeholder until distribution arrives.
2. **Real corridor detection for `GeographicSurface`.** Add the
   "Reports cluster on a roughly NW-SE corridor along US-74"
   sentence when an algorithm detects it; suppress otherwise
   (V3 §3 — never fabricate). Currently always passed as `null`.
3. **Real Haiku-generated synthesized paragraph.** Today
   `lab.tsx` synthesizes from match counts client-side. Tier 3
   should hit a dedicated `/api/lab/synthesis?report_id=X` that
   calls Haiku with the experience text + top 20 matches per
   V3 §3 ("a single prompt at submit, ~2-3 seconds, $0.001").
4. **Split `MyRecordTab.tsx`.** Today we mount the legacy
   `MyRecordTab` below the new surfaces because the polished
   match-list, multi-submission switcher, Manage panel, and
   EditReportModal still live there. Tier 3 should split them
   into:
   - `MatchList.tsx` (the per-experience match table — replaces
     the redundant `RadarSurface` polished view).
   - `ManageSubmissionsPanel.tsx` (already a sub-component;
     promote to its own file).
   - `SubmissionSwitcher.tsx` — DELETE; `DossierHeader` owns
     this now.
   Remove `MyRecordTab` from `lab.tsx` once the split lands.
5. **Pro Dossier full implementation** per
   `PRO_TIER_VALIDATION_V3.md` §3 (the 7-section structured
   cross-reference + PDF + share card). Replace the Pro paywall
   teaser with the real Dossier surface for Pro users.
6. **Custom Watchlists** schema + create/list/delete +
   notification cadence per `PRO_TIER_VALIDATION_V3.md` §4.
7. **Sentiment baseline line** in the dossier per V3 §5 (10%
   soft-launch flag + editorial-reviewed copy templates). Slot
   it inside `DossierHeader` beneath the synthesized paragraph.
8. **Cross-experience pattern callouts at Basic+.** Today
   `CrossExperienceHeader` always renders the same baseline
   sentences. Basic tier should add "3 of your 4 accounts share
   X" style explicit pattern detection beyond the simple
   year/category/location aggregates currently computed.
9. **`hour_dist` / `decade_dist` props on `TemporalStrip`** —
   currently `setHourDist(null)` / `setDecadeDist(null)` is
   intentional pending the API in #1. The component already
   renders a placeholder bar layout for `null` so there is no
   visual reflow when real data arrives.

---

## Typecheck status

**Clean for Tier 2B work.** Verification:

```bash
cd /sessions/affectionate-tender-fermi/mnt/paradocs
npx tsc --noEmit --project tsconfig.json 2>&1 \
  | grep -E "src/components/lab|src/pages/lab\.tsx"
# (no output)
```

Pre-existing Supabase generic-typing errors persist in
`src/components/dashboard/MyRecordTab.tsx` ("Property X does not
exist on type 'never'") — exact same lines as Tier 1, same
repo-wide regression. No new errors introduced by Tier 2B.

---

## Open question for founder

**Should the legacy match list inside `MyRecordTab` be removed
NOW or in Tier 3?** Today the new IA stacks:
- `RadarSurface` (the new V3 §5 categorical lens), then
- The legacy `MyRecordTab` polished radar + match list below it.

These visually overlap — both show the radar dial + match list.
Keeping both is intentional for this PR (no regression in match
list UX, no risk of breaking the multi-submission switcher /
Manage panel that depends on `MyRecordTab` internals). Tier 3 is
the natural place to split `MyRecordTab` apart and remove the
duplication.

Founder call: ship Tier 2B as-is (clean structural pass, one
small duplication), or hold for the `MyRecordTab` split? The
panel recommendation is **ship as-is** — the new surfaces are
load-bearing and the duplication is one-screen-tall, not
catastrophic.

---

## Commit message draft

```
V11.17.69 — Tier 2B Lab structural rebuild: single-page IA + n-aware dossier

Per LAB_PANEL_REVIEW_V3 §3 + §5: collapse the 3-tab Lab IA
(story / library / explore) into a single scrolling My Record
page anchored on a persistent, n-aware dossier header with
stacked comparative surfaces in priority order.

New components (src/components/lab/):
- DossierHeader.tsx     — persistent n-aware spine (n=0/1/2-4/5+)
- EmptyDossier.tsx      — n=0 ghosted-dossier empty state
- TemporalStrip.tsx     — clock-and-decade strip (24h dial +
                           decade band; user vs corpus dist)
- GeographicSurface.tsx — real MapLibre map (not RADAR) with
                           radius ring + nearby-Archive dots +
                           3 prose data lines beneath
- RadarSurface.tsx      — V3 §5 wrapper on RadarVisualization
                           (eyebrow + "what's not shown" tooltip
                           + "Widen the view" pill)
- CrossExperienceHeader.tsx — n≥2 body-of-work paragraph

Rewrote src/pages/lab.tsx as the single scroll surface. Sections,
top to bottom:
  1. Page header (Telescope mark + Submit / Bell / Settings)
  2. DossierHeader (spine)
  3. CrossExperienceHeader (n≥2 only)
  4. HintsRail (kept mounted)
  5. TemporalStrip
  6. GeographicSurface
  7. Named-match LabPaywallSurface (Free tier only)
  8. RadarSurface (categorical lens)
  9. Legacy MyRecordTab (match list + Manage panel — kept until
     Tier 3 split)
 10. Pro Dossier LabPaywallSurface (non-Pro)
 11. Custom Watchlists LabPaywallSurface (non-Pro)

Gating: pattern surfaces NOT gated by experience count (per V3
§2 founder decision). Subscription tier governs DEPTH only. Free
sees every surface; Basic/Pro get deeper depths (handled inside
each component's tier prop + LabPaywallSurface inline upsells).

NOT touched (Tier 2A or orthogonal):
- Layout.tsx Upgrade pill, LabPaywallSurface.tsx, HintsRail.tsx,
  /pricing/*, /account/subscription/*, /api/webhooks/stripe,
  /api/subscription/*, MyRecordTab.tsx (left intact; mounted as
  legacy section pending Tier 3 split).

Typecheck: zero new TypeScript errors. Pre-existing Supabase
generic-typing errors persist in MyRecordTab.tsx (same lines as
Tier 1 — repo-wide regression).

See docs/LAB_TIER2B_BUILD_NOTES.md for the full Tier 3 wire-up
TODO list and the founder open question on the MyRecordTab
duplication.
```
