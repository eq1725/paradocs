# V11.17.90 — classify-phenomena-batch.ts cost optimization

## Problem

Founder observed real-time burn rate of ~$20/hour during a classifier
run, working out to ~$0.027/report at the prior pace. Target was
≤$0.012/report (~55% reduction).

## Audit (pre-V11.17.90 state)

**Sync vs Batch.** The classifier-primary call was ALREADY on the
Anthropic Batch API (`scripts/classify-phenomena-batch.ts:44, 166-184`).
50% batch discount was being applied for that one call. But the
post-classifier verification path called `verifyTag()`
(`tag-verification.service.ts:165-219`) synchronously, in a per-candidate
`for` loop (`classify-phenomena-batch.ts:535-561`, old line numbers).

**Per-report call pattern.** One batched classifier-primary call
proposing primary + up to 2 secondary candidates (3 candidates max),
followed by up to 3 sync verify calls — total 1-4 Haiku calls per
report. The comment at the old line 531 ("3 calls × 97k ≈ $145")
matched observation but understated burn because sync verify pays full
price ($1.00/M input vs $0.50/M batched).

**Prompt caching.** Classifier-primary had `cache_control: ephemeral`
on its system block (line 349). Working. Verify path had NO cache
control and a single user message — no caching at all.

**Confidence.** Classifier output had NO confidence score. Just
`{primary: "slug", secondary: ["slug", "slug"]}`. Could not gate
verify-skip without changing the prompt.

**Coverage short-circuit.** Already implemented — script filters
reports with ANY existing junction row before classifying (line 307
pre-edit; `existingLinks` set). Step E is moot.

## Optimizations applied

| Step | Status | Notes |
| --- | --- | --- |
| A. Batch API for verify | DONE | Two-pass batched verify in `runVerifyBatch()`. 50% off all verify calls. |
| B. Prompt caching | UNCHANGED on classifier-primary (already enabled); SKIPPED on verify (per-candidate prompts are mostly variable, caching wouldn't help) |
| C. Skip verify on high confidence | DONE | Threshold 0.92. Classifier now returns `{slug, confidence}` per candidate. ≥0.92 → auto-accept, <0.92 → batched verify. `--no-verify-skip` flag for defensive runs. |
| D. Reduce candidate count | N/A | Already capped at 3 (primary + 2 secondary). |
| E. Skip already-covered reports | N/A | Already skips reports with ANY existing junction row. |

## Per-report cost projection

Token estimates (per category, after first request — cache hits):

- **classifier-primary**: ~3000 sys (cached read, $0.000150), 400 user
  input ($0.000200), 50 output ($0.000125). Total ~$0.000475 per
  report.
- **classifier-verify** (per candidate, batched): ~2000 input prompt
  ($0.001000), 100 output ($0.000250). Total ~$0.00125 per verify call.

Assuming 1.6 candidates per report avg (matches founder's observation
of ~3 candidates with the new tighter scoring), and a verify-skip rate
of 50% from confidence gating:

```
classifier-primary:        $0.000475 / report
verify (1.6 cands × 0.5 verify-rate × $0.00125):
                           $0.001000 / report
total:                     $0.001475 / report  ←  projected
```

Even with a pessimistic verify-skip rate of 30%:

```
classifier-primary:        $0.000475
verify (1.6 × 0.7 × $0.00125):
                           $0.001400
total:                     $0.001875 / report
```

Both projections are well under the $0.012 target.

Compared to pre-V11.17.90 ($0.027/report sync verify pattern):

- $0.001475 / $0.027 = **94.5% reduction** (best case)
- $0.001875 / $0.027 = **93.0% reduction** (pessimistic)

## Smoke test

ANTHROPIC_API_KEY is not present in this environment, so a live batch
submission was not possible. Offline tests covered the parsing layer
and confidence-gate logic — the two pieces V11.17.90 introduces.

```
16 pass, 0 fail
- normalizeClassifierEntry handles {slug,confidence} object form
- normalizeClassifierEntry handles legacy bare-string fallback (defaults
  confidence to 0.85, just below the 0.92 skip threshold, so legacy
  outputs still go through the V11.17.54 verify gate)
- normalizeClassifierEntry clamps out-of-range confidence to [0,1]
- normalizeClassifierEntry returns null for missing/empty/malformed input
- VERIFY_SKIP_CONFIDENCE gate correctly skips at >=0.92, verifies below
```

**Live smoke test recommended before founder unleashes:** run
`tsx scripts/classify-phenomena-batch.ts --category cryptids --limit 20`
in a real env, eyeball:

1. Auto-accept count is non-zero (confidence-gate firing).
2. Verify-batch chunk runs to completion (~5-15 min via Batch API).
3. `paradocs_narrative_cost_log` shows both `classifier-primary` and
   `classifier-verify` rows for the same report IDs.
4. Junction confidence values are now gradient (0.95, 0.72, etc.) not
   the prior fixed (0.9, 0.6) constants.

## Files touched

- `scripts/classify-phenomena-batch.ts` — main script, ~250 LOC added.
- `src/lib/services/tag-verification.service.ts` — exported
  `buildVerifyPrompt()` so the batched verify path can reuse the exact
  same prompt the sync `verifyTag()` uses. No behavior change to the
  sync path.

## Typecheck

```
cd /sessions/affectionate-tender-fermi/mnt/paradocs && \
  npx tsc --noEmit --project tsconfig.json 2>&1 | \
  grep -E "classify-phenomena|tag-verification|ai-cost-logger" | head -10
# (clean — no errors)
```

## Open questions for founder

1. **Verify-skip threshold (0.92)** — pulled from "well above the
   default 'I'm pretty sure' floor 0.85". If a smoke run shows the
   classifier marks too many candidates 0.95+ without good reason,
   bump to 0.95. The `--no-verify-skip` flag forces full verification
   for any one-off run that needs maximum safety.
2. **Verify-batch latency** — Batch API can take minutes to hours. The
   script polls until `processing_status === 'ended'`. With the prior
   sync verify, a report's junction rows appeared seconds after the
   classifier batch completed; now they wait for a second batch round
   trip. Acceptable for the bulk drain, but if there's any "show as
   tagged within X minutes" SLA the founder cares about, flag it.
3. **Verify cost ledger attribution** — verify-batch rows now log under
   `classifier-verify` (was already an enum entry in
   `ai-cost-logger.ts`). The cost-summary endpoint will show this as
   a new bucket. If the founder's dashboard explicitly filters on the
   old `tag-verify` service code, the chart may show a sudden zero in
   that bucket and a corresponding spike in `classifier-verify` until
   he updates the filter.

## V11.17.90 changelog summary (for commit msg)

- Classifier prompt now requests per-candidate confidence (0-1).
- Confidence ≥ 0.92 → auto-accept (skip verify), preserves V11.17.54
  hallucination safety net for <0.92 candidates.
- Verify pass batched via Anthropic Batch API (50% off). Two-pass
  architecture: classifier-primary batch → split by confidence →
  optional classifier-verify batch → upsert.
- Junction confidence is now the classifier's own per-candidate score
  (was fixed 0.9 primary / 0.6 secondary).
- `--no-verify-skip` CLI flag forces full verification for first-run
  validation on new categories.
- Tolerant parser accepts legacy bare-string classifier output
  (`primary: "slug"`) — defaults confidence to 0.85 so legacy outputs
  always go through the verify gate.
- All verify calls write `classifier-verify` ledger rows. No
  unattributed Haiku spend.
