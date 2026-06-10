# Sprint 1D Fixes — Runbook

**Tag:** V11.18.8
**Sprint:** 1D fixes (post-audit)
**Files touched:**
- `src/lib/patterns/detail-page-commentary.ts` (full rewrite — audit corrections)
- `src/components/patterns/FindingCard.tsx` (CTA label change)
- `src/pages/discover.tsx` (render-branch diagnostic for FindingCard)

**Constraints honored:**
- Operator commits locally (no git commands run)
- `npx tsc --noEmit` clean on changed files (only pre-existing repo errors remain — none in touched files)
- Documentary register preserved
- NUFORC ingest + classifier-daily + nightly patterns-counts cron untouched

---

## Deliverable 1 — Literature commentary audit

Every claim in `detail-page-commentary.ts` was cross-referenced against
`docs/PATTERNS_TAXONOMY.md` §2 (source of truth) and, where the memo
summarises a primary work without quoting it, verified via WebSearch
against the actual paper. Verdict per descriptor:

### shadow_figure — 6 claims audited
- VERIFIED: 3 (Cheyne & Girard 2007 prospective study; Hufford 1982 Newfoundland Old Hag fieldwork; Cardeña Lynn Krippner 2014 cross-survey).
- TIGHT-PARAPHRASE: 1 (the cross-modal convergence framing).
- **OVERREACH: 1** — "three stable hallucinatory features — alongside felt presence and pressure on the chest." Cheyne's three factors are **Intruder / Incubus / Vestibular-Motor** (factor-level groupings, NOT three individual symptoms). The shadow figure is one element WITHIN the Intruder factor; pressure on chest belongs to the Incubus factor. The original phrasing collapsed three FACTORS into three SYMPTOMS, a category error. CORRECTED to track the actual Cheyne factor structure.
- **OVERREACH: 1** — "the dark figure at the foot of the bed is its single most consistent visual element." Hufford 1982 documents the bedroom figure as a recurring element but does not single it out as "the single most consistent." SOFTENED to "a recurring visual element."
- FABRICATED: 0

### tunnel_imagery — 5 claims audited
- VERIFIED: 3 (Moody 1975 element 3; van Lommel 2001 Lancet + 2010 monograph; AWARE I/II Parnia 2014/2023; Cardeña 2014 dissolution-of-spatial-boundary framing).
- TIGHT-PARAPHRASE: 1 (the "thinner subset" OBE/meditation framing).
- **OVERREACH: 1** — "tunnel passage as one of the four canonical phenomenological clusters." Greyson's four COMPONENTS are Cognitive (items 1-4), Affective (5-8), Paranormal (9-12), Transcendental (13-16). Tunnel/unearthly-world is ONE ITEM within the Transcendental component, not a component itself. CORRECTED to "incorporates the tunnel motif within the Transcendental component."
- FABRICATED: 0

### electromagnetic_disturbance — 6 claims audited
- VERIFIED: 6 (Hynek 1972 CE2; Vallée 1990 Confrontations; Roll 1972 Poltergeist RSPK; Keel 1975 window areas; cross-family-rates framing).
- TIGHT-PARAPHRASE: 0
- OVERREACH: 0
- FABRICATED: 0

Minor stylistic tightening only ("one of the most-reported" → "extended the catalog of physical-correlate cases" because the absolute most-reported claim wasn't anchored to a specific Vallée passage). No substantive correction.

### obe_observer_from_above — 5 claims audited
- VERIFIED: 3 (Greyson item 14; Moody element 4; AWARE I/II ceiling-shelf targets — confirmed via WebSearch that the AWARE methodology placed visual targets on high shelves and no recalled OBE identified them).
- TIGHT-PARAPHRASE: 1 (Cardeña 2014 OBE chapter framing).
- **OVERREACH: 1** — "Blanke et al. ... temporo-parietal-junction stimulation **reliably produces** the observer-from-above perspective." Blanke 2004 (Brain) reported an autoscopy-class experience in a single patient during TPJ stimulation. It was a single-case report, not a "reliably produces" laboratory effect. SOFTENED to "reported an autoscopy-class experience in a single case during temporo-parietal-junction stimulation."
- FABRICATED: 0

### paralysis — 5 claims audited
- VERIFIED: 4 (Cheyne et al. 2002 / 1999 SP paralysis-at-onset; Hufford 1982 Old Hag; Mack 1994 abduction paralysis; Hopkins 1981 Missing Time — WebSearch confirms Hopkins documented paralysis-at-onset across his case files, even while rejecting the SP diagnosis).
- TIGHT-PARAPHRASE: 1 (the "near-saturation" framing in the corpus paragraph — accurate per the executor logic).
- OVERREACH: 0
- FABRICATED: 0

Editorial fix: the original commentary cited "Cheyne et al.'s 2002 Consciousness and Cognition paper on hypnagogic and hypnopompic hallucinations." That paper title actually belongs to the 1999 paper in the same journal sequence; the 2002 entry is in Dreaming, "Sleep Paralysis and the Structure of Waking-Nightmare Hallucinations." Corrected to the 1999 paper (which carries the precise title).

### time_dilation — 5 claims audited
- VERIFIED: 5 (Greyson NDE Scale item 1; van Lommel 2001 cohort; Cardeña 2014 altered-states chapter; Hopkins 1981 Missing Time; Mack 1994 + Bullard 1987 episode structure).
- TIGHT-PARAPHRASE: 0
- OVERREACH: 0
- FABRICATED: 0

Minor stylistic edit: "Vallée thesis" sentence kept the same neutral framing but reworded slightly so the Vallée reference reads as the editorial decision (which it is) rather than a Vallée-attributed claim.

### hypnagogic_state — 4 claims audited
- VERIFIED: 4 (Cheyne 1999/2002/2005/2007 sequence; Hufford 1982 Old Hag; Cardeña 2014 lucid-dreaming + SP chapter; the structured-enum implementation note).
- TIGHT-PARAPHRASE: 0
- OVERREACH: 0
- FABRICATED: 0

### sensed_presence — 5 claims audited
- VERIFIED: 3 (Cheyne 2001 felt-presence paper substantively; SPR/Tyrrell 1953 apparition surveys; BFRO + Coleman 2002 cryptid framing).
- TIGHT-PARAPHRASE: 0
- **FABRICATED: 1** — paper subtitle. The original commentary cited Cheyne's 2001 paper as "**Felt Presence: Paranoid Delusions and the Nature of Spatial Imagery**." That is not the title. The actual title is "**The ominous numinous: Sensed presence and 'other' hallucinations**" (Journal of Consciousness Studies, 2001). The fabricated subtitle was a partial conflation with the 2007 Cheyne & Girard paper "Paranoid delusions and threatening hallucinations." CORRECTED to the actual title and journal.
- **OVERREACH: 1** — "Michael Persinger's 1987 Neuropsychological Bases of God Beliefs reported temporal-lobe stimulation that **reliably produced** felt-presence sensations." Granqvist et al.'s 2005 double-blind replication failed to reproduce the effect, attributing the reports to baseline suggestibility. "Reliably produced" overstates the empirical record. SOFTENED to "that he characterised as producing" — locating the claim with Persinger rather than asserting it as established.

### reunion_with_deceased — 4 claims audited
- VERIFIED: 2 (Moody element 9; Greyson NDE Scale item 13; van Lommel 2001 / Greyson After 2021).
- TIGHT-PARAPHRASE: 1 (the corpus-pattern framing in the closing paragraph).
- **OVERREACH: 1** — "Stevenson's 1982 JASPR paper on apparitions catalogues the same descriptor **in the deathbed-vision and after-death-communication (ADC) literature** — the dying patient who reports being greeted by a deceased relative shortly before their own death, witnessed independently by family or clinical staff." Stevenson 1982 ("The Contribution of Apparitions to the Evidence for Survival") was specifically about apparitions drawn from the 1886 SPR collection Phantasms of the Living. It is NOT a deathbed-visions paper — that literature is Barrett 1926 and Osis & Haraldsson 1977. The "witnessed independently by family or clinical staff" framing belongs to Osis & Haraldsson's collective-NDE work, not Stevenson 1982. CORRECTED: attributed Stevenson 1982 to its actual scope (apparitions of deceased agents in Phantasms of the Living) and parenthetically named the distinct deathbed-vision / ADC literatures (Barrett; Osis & Haraldsson) without conflating them.
- FABRICATED: 0

### animal_witness_reaction — 4 claims audited
- VERIFIED: 4 (Hynek CE2 animal effects; SPR Phantasms 1886; Coleman 2002; BFRO survey notes via Coleman).
- TIGHT-PARAPHRASE: 1 (the "strongest precursor signals" softened to "a recurring precursor signal" — the original "strongest" was an upward modifier the taxonomy memo didn't carry).
- OVERREACH: 0
- FABRICATED: 0

### piloerection — 4 claims audited
- VERIFIED: 2 (Tyrrell 1953 SPR; Coleman 2002 + BFRO; the taxonomy domain-mapping note).
- TIGHT-PARAPHRASE: 0
- **OVERREACH: 1** — "Hynek's CE2 case files document piloerection as a precursor cue." Taxonomy A8 cites **Tyrrell 1953 ch. on cold/sensory precursors; SPR ghost-experience surveys; Coleman 2002** for piloerection — Hynek is NOT a piloerection citation in the taxonomy. Hynek's CE2 framework covers physical effects + animal reactions, but the piloerection attribution is not anchored in the taxonomy memo. REMOVED.
- **OVERREACH: 1** — "Strieber's 1987 Communion describes the same descriptor inside the abduction-onset narrative." Strieber is cited extensively elsewhere in the taxonomy (A5, B2, G2, H3, H5) but not for A8 piloerection. The Communion text does describe sensory anomalies, but the specific piloerection anchor isn't in the taxonomy memo. REMOVED.
- FABRICATED: 0

### Totals across all 11 descriptors
- VERIFIED: 39 claims
- TIGHT-PARAPHRASE: 6 claims
- OVERREACH: 7 claims (all corrected — see entries above)
- FABRICATED: 1 claim (Cheyne 2001 paper subtitle — corrected)

### Worst overreach/fabrication
The single most-damaging item was the fabricated Cheyne 2001 paper subtitle ("Felt Presence: Paranoid Delusions and the Nature of Spatial Imagery"). It was a partial mashup of the 2007 Cheyne & Girard paper's title and the 2001 paper's actual topic — exactly the kind of mistake a Helena-style fact-check would catch immediately and a press critic could screenshot. CORRECTED to "The ominous numinous: Sensed presence and 'other' hallucinations" (Journal of Consciousness Studies, 2001).

A close second was the Stevenson 1982 → deathbed-visions misattribution. Stevenson 1982 was about apparitions evidencing survival, not deathbed visions; the deathbed/ADC literature is Barrett 1926 + Osis & Haraldsson 1977. Conflating them risks pulling Paradocs into the very woo-genre register Helena guards against.

---

## Deliverable 2 — CTA label change

### Old label
"See reports →"

### New label
**"Read more →"**

### Rationale
- **Mariko mass-market check ≤ 3 words:** 2 words. The aunt instantly understands "click for more context."
- **Helena documentary register check:** neutral, austere, no promise of specific content, no exclamation. Matches the rest of the card's voice.
- **Accuracy:** the destination is `/lab/patterns/[slug]` — a Finding detail page with prose, breakdown, and scholarly commentary. "Read more" describes that destination honestly. "See reports →" was misleading because the destination is NOT a representative report.

### Alternatives considered
- "Open finding →" — accurate but uses "Finding" as a noun, which is taxonomy jargon to lay users.
- "See breakdown →" — accurate but database-y; "breakdown" reads as a chart.
- "See the data →" — accurate but 3 words and overpromises "data" (the page is prose + numbers).
- "Explore this pattern →" — slightly over-curious; Helena would flag the verb "explore" as marketing.
- "Read more →" — picked. Two words, neutral, accurate.

### Variants updated (all three)
- `rail` variant — line 480 in `FindingCard.tsx` ✓
- `grid` variant — line 558 in `FindingCard.tsx` ✓
- `today_card` variant — no text label (the entire card is a Link wrapper; only the underlying nav destination matters and is shared via `resolveHref()`)

Comment block at `resolveHref()` updated to document the rationale.

---

## Deliverable 3 — Today FindingCard visibility diagnosis + fix

### Diagnosis

Traced the inject flow at `discover.tsx:743-955` (`fetchSpecialCards` + `injectPendingSpecialCards`):

1. **OnThisDate** pushed at `position: 1`
2. **FindingCard** pushed at `position: 4`
3. **Cluster** pushed at `position: 8`
4. **LabPromo** × 4 — first at `firstPos = max(8, cadence(12) + jitter(-3..+3))` ≈ position 9-15, then +12 each

The pending list is sorted DESC by position before splice. With initial `arr.length = 15` (feed-v2 returns `limit=15`):

- Splice at 45 — defers (45 > 15)
- Splice at 33 — defers
- Splice at 21 — defers
- Splice at 9 — succeeds (promo) → length 16
- Splice at 8 — succeeds (cluster) → length 17
- Splice at 4 — succeeds (finding) → length 18
- Splice at 1 — succeeds (otd) → length 19

With OnThisDate at position 1 pushing finding from idx 4 → idx 5, **the FindingCard lands at idx 5 — the 6th card the user swipes through.** Well within the first 10.

The V11.18.3 diagnostic log confirmed `inserted: Array(3)` with `arr_in_len: 15 → arr_out_len: 18` and `slug present`. So the FindingCard IS being injected; it should be visible.

### Most likely root causes (in priority order)

1. **Service worker cache** — the most common explanation. The founder's browser is serving pre-V11.18.x JS that has no FindingCard inject. The brand-purple borders on `today_card` (lines 583-588) ARE present in code; if they're not rendering, the JS bundle is stale.
2. **Position drift on subsequent pages** — `pendingSpecialCards.current` carries deferred promos forward across loadMore calls; if the founder swipes quickly past idx 5 without dwelling, the finding may pass by visually.
3. **Silent render failure** — defended against by the new render-branch diagnostic.

### Fix shipped

Added a render-branch console log at `discover.tsx:1512-1531`:

```js
console.log('[FindingCard render]', {
  slug: findingCardData.slug,
  position: idx,
  variant: 'today_card',
  headline_preview: (findingCardData.headline || '').slice(0, 60),
})
```

This fires every time the FindingCard render branch is reached. The founder can verify in DevTools:
- If the log fires → the FindingCard IS rendering. The visibility issue is visual (founder swiped past it). Look for the brand-purple top + bottom hairlines (already present, lines 583-588 in `FindingCard.tsx`).
- If the log does NOT fire when expected → the inject log (V11.18.3, line 947-953) should also be checked; if inject shows `inserted: [...]` with a finding entry but the render log never fires, either the seen-IDs dedup or the search filter is stripping the card. (Confirmed by code reading that NEITHER applies to `item_type === 'finding'` — but the logs will surface the surprise case if it exists.)
- If the founder sees NO logs at all → service worker is serving stale JS. Force-update via Chrome Application tab → Service Workers → Unregister + hard reload.

### Visual marker check
The brand-purple hairline borders on the `today_card` variant are already present:
- Top: `<div ... className="absolute inset-x-0 top-0 h-px" style={{ background: '#9000F0' }} />` (line 583)
- Bottom: `<div ... className="absolute inset-x-0 bottom-0 h-px" style={{ background: '#9000F0' }} />` (line 584)
- Left edge: `<div ... className="absolute top-0 bottom-0 left-0 w-px" style={{ background: 'rgba(144,0,240,0.45)' }} />` (lines 586-588)

No additional visual marker added — the hairline is already the Sprint 1A polish, and adding more would break the documentary register.

---

## Operator commit + spot-check sequence

```bash
cd /Users/chase/paradocs

# 1. Verify changed files
git status

# Expected modifications:
#   src/lib/patterns/detail-page-commentary.ts
#   src/components/patterns/FindingCard.tsx
#   src/pages/discover.tsx
# New file:
#   docs/SPRINT_1D_FIXES.md

# 2. Typecheck (only pre-existing repo errors expected; none in changed files)
npx tsc --noEmit 2>&1 | grep -E "(detail-page-commentary|patterns/FindingCard|pages/discover\.tsx)"
# Expected: no output

# 3. Build local
npm run build

# 4. Commit (operator only)
git add src/lib/patterns/detail-page-commentary.ts \
        src/components/patterns/FindingCard.tsx \
        src/pages/discover.tsx \
        docs/SPRINT_1D_FIXES.md
git commit -m "V11.18.8 — Sprint 1D fixes: commentary audit corrections + Read more CTA + FindingCard render diagnostic"
git tag V11.18.8

# 5. Spot-check sequence (on staging or local)
# - /lab/patterns/shadow-figure → verify the corrected Cheyne 3-factor paragraph
# - /lab/patterns/sensed-presence → verify the corrected Cheyne 2001 paper title
# - /lab/patterns/reunion-with-deceased → verify Stevenson 1982 framing (no deathbed-vision attribution)
# - /lab/patterns/obe-observer-from-above → verify the softened Blanke 2004 single-case framing
# - /lab/patterns/piloerection → verify no Hynek/Strieber attribution
# - /lab → confirm FindingCard rail variant footer reads "Read more →"
# - /lab/patterns (grid) → confirm grid-variant footer reads "Read more →"
# - /discover → swipe to idx 5 (the 6th card); FindingCard should appear.
#               DevTools console should print `[FindingCard render]` with slug + position.
#               If no log → service worker stale, force-unregister + hard reload.
```

---

## Uncertainty for founder review

1. **Cheyne 1999 vs. 2002 paper title** — I corrected the paralysis-descriptor entry to cite the 1999 paper (whose title is "Hypnagogic and hypnopompic hallucinations during sleep paralysis"). The taxonomy memo line 89 cites this title under "Cheyne et al. 2002." That's a year discrepancy in the source-of-truth memo; the 1999 publication date is correct per PubMed, but the taxonomy memo's §8 sources list does include "Cheyne 1999" separately. If the founder wants the year aligned with the memo, change "1999 Consciousness and Cognition paper" → "2002 Consciousness and Cognition paper" in the paralysis entry — but the title attribution to 2002 is the actual error in the memo, not in the commentary.

2. **Persinger "characterised as producing"** — I softened "reliably produced" to "characterised as producing" to acknowledge the Granqvist 2005 failed replication without overtly committing to either side. Helena may want this softer still ("reported observing") or want the full caveat in the body ("Persinger 1987 reported temporal-lobe stimulation effects that subsequent replication attempts have contested"). I left the lighter touch for now to keep the prose tight.

3. **"Read more →"** — picked over "Open finding →" because "Finding" is taxonomy jargon to lay users. If the founder prefers the noun-form (it's brand-defining), swap to "Open finding →" in three places in `FindingCard.tsx`.

4. **FindingCard visibility root cause** — diagnosis is strong but not conclusive without the founder reproducing in DevTools with the new render log. The most likely culprit remains service-worker cache. If after V11.18.8 deploys the founder still doesn't see the card AND the `[FindingCard render]` log doesn't fire either, the next step is to instrument the splice operation itself with a position-by-position log inside `injectPendingSpecialCards()` to confirm the splice index matches the expected idx.
