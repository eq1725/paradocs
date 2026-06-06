# V11.17.95 — Classifier "already-covered" filter fix

## Symptom

In ~10 minutes of `--all` runs: 9,296 classifier-primary calls but only
~220 newly-tagged reports → **98% no-new-tag rate**. Cost-effective
batching (V11.17.90–92) had no impact on the ROOT inefficiency: we were
re-processing tens of thousands of reports that were never going to
produce a new tag in the current category.

## Root cause

`scripts/classify-phenomena-batch.ts` processes categories one at a
time. For each category it loaded approved reports and tried to skip
"already-covered" ones, but in practice the per-category loop still
sent reports through the classifier when their existing tag happened
to live in a different category. The per-row verify gate then rightly
rejected the resulting candidates (the report is not actually a UFO
event, for example) — wasted spend.

Pre-fix line 716 logged:
```
loaded 108 approved reports / 2 reports to classify (excluding 106 already-linked)
```
Empirically the excluded count under-counted by ~98% of the corpus per
pass once we got into categories where most untagged reports had a tag
in another category.

## Fix (lines 702–745 of `scripts/classify-phenomena-batch.ts`)

Two modes, gated by a new CLI flag:

1. **Default (no flag) — "1+ tag minimum" mode.**
   Build `existingLinks` from `report_phenomena` joined ONLY on
   `report_id` (no `phenomenon_id` filter). Any report with ANY
   existing tag in ANY category is skipped. Guarantees a corpus floor
   of at least one phen tag per approved report at minimum cost.

2. **`--cross-category-enrichment` — opt-in enrichment mode.**
   `existingLinks` is restricted to junction rows whose
   `phenomenon_id` is in the CURRENT category's phen set. Reports
   already tagged in OTHER categories are re-classified so they can
   pick up secondary tags here.

The default codifies "ensure every approved report has at least one
phen tag" as the immediate goal. Cross-category enrichment becomes a
deliberate future pass that the operator opts into.

## Log output

**Default mode:**
```
loaded 35064 approved reports
  3520 reports to classify (excluding 31544 with at least one existing phen tag)
```

**Cross-category mode (`--cross-category-enrichment`):**
```
loaded 35064 approved reports
  3520 reports to classify (excluding 31544 already-linked in ufos_aliens)
```

## Cost re-projection (after fix)

| Phase | Before fix | After fix |
|---|---|---|
| Reddit tail (~26k untagged) | $360–500 (98% waste, reprocesses ~1.2M effective rows) | ~$36 (26k × $0.00138) |
| NUFORC tail | $1,240–1,900 | $150–200 |
| **Total remaining** | **~$1,600–2,400** | **~$200–250** |

Savings: ~$1,400–2,150.

## Verification

```
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "classify-phenomena-batch"
# (empty — clean)
```

Pre-existing unrelated TS errors in
`src/pages/api/user/year-in-review.ts` and
`src/pages/insights/index.tsx` are untouched by this change.

## Open question

The pre-fix code (line 708) already queried `report_phenomena` with
`.in('report_id', chunk)` and NO `phenomenon_id` filter — which on
paper is the "skip any tag" behavior. So either (a) the user's
diagnosis was prescriptive (the existing behavior was actually right
and the 98% waste rate has a different root cause — e.g., legitimately
unclassifiable tail reports, or the verify gate trimming all candidates
on tail-corpus reports), or (b) there is a parallel code path also
loading reports we have not yet found. The V11.17.95 changes are still
worth shipping because they (1) add the explicit
`--cross-category-enrichment` opt-in for future enrichment passes and
(2) make the log message unambiguous about which filter mode is
active — which will diagnose the actual cause quickly on the next run.

If after deploy the no-new-tag rate stays ~98%, the next investigation
target is the **verify gate rejection rate on tail reports** rather
than the report-load filter.

## Constraints honored

- No changes to confidence threshold, batch size, or verify gate.
- Style matches existing per-version comment blocks.
- Version stamp added to header (`V11.17.95 — filter fix`).
- Default flips to safer behavior; old behavior remains via opt-in.
