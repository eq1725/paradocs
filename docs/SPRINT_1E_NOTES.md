# Sprint 1E — Today Special Cards Redesign — Build Notes

**Tag:** V11.18.12
**Spec:** `docs/TODAY_SPECIAL_CARDS_REDESIGN.md`
**Date:** June 2026
**Scope:** Redesign of three Today-feed special cards — `FindingCard`
(today_card variant), `ClusteringCard`, `LabPromo` (Today variant).
**Status:** Code complete; pending operator commit + DB UPDATE + smoke
test.

---

## 1. Per-card before / after

### 1.1 FindingCard (today_card variant)

**Before:** Hero stat + 2 secondary bars + denominator italic +
interpretive sentence + footer citation. ~45% of the card was dead
`bg-gray-950` below the body.

**After:**
- HERO ZONE (unchanged structure): eyebrow + headline + hero stat.
- HERO ZONE (NEW chrome): share button absolutely positioned top-right.
  The eyebrow + family icons now stack vertically in a single column
  to leave room for the share button on the right.
- SUBSTANCE ZONE (NEW): representative-report excerpt slab — title +
  location · date + 2-3 sentence pull from `paradocs_narrative` (the
  Helena-cleared rewrite, NOT raw source description). Subtle
  dark-card-on-card treatment (`bg-white/[0.025]` /
  `border-white/[0.07]`). Tapping the slab routes to `/report/<slug>`.
- ACTION ZONE (unchanged): `Paradocs Archive · NN accounts` footer +
  `Read more →` chevron routing to `/lab/patterns/<slug>` (the Finding
  detail page). The chevron is now a real Link element so Cmd-click /
  middle-click open-in-new-tab still works.
- Reunion finding interpretive sentence reworded — see §4 below.

### 1.2 ClusteringCard

**Before:** Corner pill eyebrow + headline (the count + place) +
italic dim "5× the usual week" buried at the bottom + ~60% dead card.

**After:**
- HERO ZONE (NEW): 72px brand-purple hero numeric parsed from
  `baseline_text` ("5×") + fact-line beneath ("the usual week") +
  demoted headline ("292 UFO sightings from Washington in the last 7
  days."). When `baseline_text` is missing OR doesn't parse to a
  defensible numeric, the hero numeric is suppressed and the headline
  promotes back into the hero slot at its original 30px scale.
  Card never has a void.
- SUBSTANCE ZONE (NEW): `IN THIS CLUSTER` small-caps label + hairline
  rule + 3-row tappable list of representative cluster reports (title
  + location + relative date — "2 days ago" / "last week" / "Mar 14").
  Each row routes to `/report/<slug>`.
- ACTION ZONE (unchanged): category · location · time-range +
  chevron, pinned to bottom.

### 1.3 LabPromo (Today variant)

**Before:** Top-left "FROM PARADOCS" pill + "My Record" wordmark +
140px RADAR-teaser SVG + state-aware headline + workshop-vocab
sub-line + 3-row corporate value-prop list + cream-pill "Start 7-day
free trial" CTA + small caption.

**After:**
- HERO ZONE: "My Record" wordmark + state-aware headline (new copy
  per panel §4.4) + austere documentary sub-line:
  *"Your account, set against the archive."* Drops the "FROM
  PARADOCS" pill — wordmark already identifies.
- SUBSTANCE ZONE (NEW): `YOUR RECORD SO FAR` chip stack — up to 4 of
  the user's most-recently saved reports as tappable chips (title +
  location + "saved Tuesday" / "saved Mar 14"). Replaces the RADAR
  sphere wholesale.
- ACTION ZONE: chevron `Open My Record →` (founder taste-call #1 over
  cream-pill CTA) + quiet pricing caption beneath
  (*"Free to start · $5.99/mo after 7 days."*). Destination is `/lab`
  (founder taste-call #3 — engage primary, convert secondary), NOT
  `/pricing`.

---

## 2. Data-fetching changes

### 2.1 `/api/lab/patterns/list` — extended response

Each finding now carries `representative_report_preview` shape:

```ts
representative_report_preview: null | {
  id: string
  slug: string
  title: string | null
  location_text: string | null
  event_date: string | null
  preview_text: string | null   // 2-3 sentence preview from paradocs_narrative
  category: string | null
}
```

Loaded via a single PostgREST IN-query keyed on the first element of
each Finding's `representative_report_ids`. Falls through to `null`
when the catalogue row has no rep IDs or the join row was missing —
FindingCard then suppresses the slab.

### 2.2 `/discover` `getServerSideProps` — extended Finding seed

The SSR path duplicates the same join (single .maybeSingle() on the
first rep ID) so the day's pre-fetched Finding lands fully populated
on first paint. No new round-trip — the existing service-role client
inside getServerSideProps is reused.

### 2.3 `/api/discover/clusters` — extended response

Each cluster now carries `representative_reports` shape:

```ts
representative_reports: [
  { id, slug, title, location_short, date_short },
  // up to 3
]
```

Loaded via a single PostgREST IN-query per cluster on
`linked_report_ids.slice(0, 3)`. Cluster IDs come from the existing
geo/temporal grouping. Renders inside the ClusteringCard substance
zone; empty array yields a hidden section.

### 2.4 `/api/lab/recent-saves` — NEW endpoint

```
GET /api/lab/recent-saves   (Bearer auth, no-store)
->  { signedIn, savedCount7d, saves: [{id, slug, title, location_short, date_short}, ...up to 4] }
```

Replaces the LabPromo's previous `/api/lab/footprint` dependency.
Returns the headline-ladder state in `savedCount7d` AND the chip-stack
content in `saves[]` — single round-trip per LabPromo activation.
Anonymous viewers get `signedIn: false`, `saves: []`, which lights up
the empty-state chip on the card.

---

## 3. Founder taste-call decisions locked in this sprint

1. **LabPromo CTA:** chevron `Open My Record →` (NOT cream pill).
   Lucia's dissent recorded but not implemented.
2. **Share button:** FindingCard only. ClusteringCard share deferred
   to a later sprint despite Sho's dissent.
3. **LabPromo primary goal:** engage with `/lab` (NOT direct
   conversion to `/pricing`). Pricing caption keeps the offer visible
   without making it the visual lead.

---

## 4. SQL UPDATE — reunion copy refresh

The reunion finding interpretive sentence is the founder-preferred
Candidate A from the panel memo (Helena ON-BRAND; Mariko PASSES AUNT).
**Apply this AFTER V11.18.12 ships:**

```sql
UPDATE findings_catalogue
SET interpretive_sentence = '1,928 witnesses describe meeting someone they knew who had died. Whether they were at a deathbed, in a haunted house, or sitting with a medium, the rate is the same — 2-3%. Three doors into the experience; the same person on the other side.',
    refreshed_at = NOW()
WHERE slug = 'reunion-with-deceased-across-psychological-haunting-psychic';
```

The new sentence reads identically on every variant (rail / grid /
today_card) — the slug + descriptor + family breakdown are unchanged.
No re-publish step required.

---

## 5. Operator commit + smoke-test sequence

```bash
# 1. From repo root, sanity-check edits + new file
git status
# expected diff:
#   M  src/components/patterns/FindingCard.tsx
#   M  src/components/discover/ClusteringCard.tsx
#   M  src/components/discover/LabPromo.tsx
#   M  src/pages/discover.tsx
#   M  src/pages/api/lab/patterns/list.ts
#   M  src/pages/api/discover/clusters.ts
#   A  src/pages/api/lab/recent-saves.ts
#   A  docs/SPRINT_1E_NOTES.md

# 2. Typecheck (clean on edited + new files)
npx tsc --noEmit

# 3. Commit (operator does this — agent did NOT commit)
git add -A
git commit -m "V11.18.12 — Sprint 1E special-card redesign"
git tag V11.18.12

# 4. Push + deploy via Vercel
git push origin main
git push origin V11.18.12

# 5. AFTER deploy is green, run the reunion-copy SQL UPDATE in the
#    Supabase SQL editor (or via psql against prod). Confirm by
#    re-loading /lab/patterns/reunion-with-deceased-... and verifying
#    the new interpretive sentence renders verbatim.

# 6. Smoke test on a phone (or 375px iPhone-portrait dev tools):
#    a. Open /discover anonymous — confirm FindingCard at position 4
#       renders the new substance slab. Tap the slab → /report/...
#       Tap "Read more →" → /lab/patterns/...
#       Tap the share button → native share sheet OR clipboard toast.
#    b. Sign in. Save 2-3 reports. Refresh /discover.
#       Confirm LabPromo headline ladder shows the count-aware copy.
#       Confirm the chip stack shows the saved reports.
#       Tap a chip → routes to the report page.
#       Tap "Open My Record →" → routes to /lab.
#    c. Find a Washington-area UFO cluster. Confirm ClusteringCard
#       shows the 5× hero numeric AND a 3-row substance list. Tap
#       a row → routes to the report page.
```

---

## 6. Open questions for the founder

1. **ClusteringCard share button — when?** Panel split 3-2 in favor
   of FindingCard-only for MVP (Sho + Lucia dissented). Sprint 1E
   shipped FindingCard-only per locked decision #2. Add to ClusteringCard
   in V11.18.13 / Sprint 1F, or defer further?

2. **LabPromo Lucia A/B?** Lucia's dissent was that the chevron
   under-converts vs the cream pill by 15-25%. We didn't A/B; the
   founder picked the documentary register. Worth re-visiting once
   we have 2-3 weeks of post-V11.18.12 conversion numbers?

3. **Findings without representative reports?** The catalogue
   currently has 9 published Findings; all 9 carry at least one
   `representative_report_ids` entry. The FindingCard substance slab
   gracefully suppresses when null — but a Finding without a rep
   report is now visibly thinner than its siblings. Worth requiring
   ≥1 rep ID at publish time (a server-side guard in the seed
   pipeline)?

4. **LabPromo Pro-tier suppression** — the existing tier-skip in
   `discover.tsx::fetchSpecialCards` still suppresses for
   `tier === 'pro' || tier === 'enterprise'`. The Sprint 1E LabPromo
   is the engage-primary variant; should Basic-tier users also skip
   (they already converted), or is the chip stack still useful for
   them as a "recent saves" mini-surface?

5. **Reunion copy approval** — Candidate A landed per the panel call,
   but the new sentence introduces "three doors into the experience;
   the same person on the other side" which Mariko flagged as
   one register-step toward mystical voice. Founder owns the call;
   if it doesn't land in the wild, Candidate B (Mariko's quieter
   alternative: *"The setting changes; the rate doesn't."*) is
   pre-cleared and can swap in via a one-line SQL UPDATE.

---

## 7. Files changed / added

- `src/components/patterns/FindingCard.tsx` — TodayCardLayout rewrite;
  new `ShareButton` + `ReportExcerptSlab` sub-components;
  `Finding.representative_report_preview` added to interface.
- `src/components/discover/ClusteringCard.tsx` — full layout rewrite;
  hero numeric parse from `baseline_text`; new `IN THIS CLUSTER`
  substance list; outer wrapper switched to div+onClick to permit
  nested rep-row anchors.
- `src/components/discover/LabPromo.tsx` — full layout rewrite; RADAR
  + value-prop list dropped; chip stack + chevron CTA added; new
  `pickHeadline` ladder; new `/api/lab/recent-saves` consumer.
- `src/pages/discover.tsx` — getServerSideProps extended to pre-fetch
  the first rep report's preview for the SSR-delivered Finding.
- `src/pages/api/lab/patterns/list.ts` — response shape +
  `representative_report_preview`; new `loadRepresentativePreviews`
  + `buildPreview` helpers.
- `src/pages/api/discover/clusters.ts` — response shape +
  `representative_reports`; new `loadClusterReports` +
  `shortLocationLabel` + `relativeTimeLabel` helpers.
- `src/pages/api/lab/recent-saves.ts` — NEW endpoint.
- `docs/SPRINT_1E_NOTES.md` — this runbook.

Touched zero ingestion / cron / classifier code paths.
