# V11.17.102 — Anomaly Gate `reasoning` Field Auditability Fix

## TL;DR

The Haiku anomaly self-check (`paradocs_assessment.anomalous_content_check`)
was emitting its explanation under the JSON key `reason`, but every
downstream auditor — including the founder's borderline-sweep inspection
script — reads `reasoning`. Result: 100% of historical rows
(110,937 with an anomaly verdict) looked like the explanation was missing,
when in fact it was present under a different key.

This was NOT a no-case-only bug. It was a universal field-name mismatch.
Affects `anomalous="yes"` AND `anomalous="no"` rows equally.

## Diagnosis

### Field-name mismatch (root cause)

| File | Line | Field name emitted | Field name expected |
|------|------|--------------------|---------------------|
| `src/lib/services/consolidated-ai.service.ts` | 280 (prompt) | `reason` | — |
| `src/lib/services/consolidated-ai.service.ts` | 942 (normalizer) | `reason` | — |
| `src/lib/services/paradocs-analysis.service.ts` | 265 (fallback prompt) | `reason` | — |
| `src/lib/services/paradocs-analysis.service.ts` | 1224 (fallback normalizer) | `reason` | — |
| `scripts/inspect-borderline-sweep.ts` | 129 (founder audit) | — | `reasoning` |

The two writer paths (consolidated + fallback) both serialized
`{ anomalous, confidence, reason, genre }`. The borderline-sweep tool
read `ac.reasoning`, found undefined, printed `"(no reasoning field)"`
— the exact symptom that prompted this investigation.

### Production DB confirmation (V11.17.102 probe)

```
AC=no total:                                  46,904
AC=no with .reason populated:                 46,904  (100%)
AC=no with .reasoning populated:                   0  (0%)

AC=yes total:                                 64,033
AC=yes with .reason populated:                64,033  (100%)
AC=yes with .reasoning populated:                  0  (0%)
```

**Every row has the explanation — under the wrong key.** The "12 reports
missing reasoning" the founder sampled were a no-case slice of the
universal mismatch.

### Was V11.17.100 the culprit?

No. V11.17.100 (KEEP/ARCHIVE worked-examples prompt rewrite) preserved
the existing `reason` field name. The mismatch dates back to V11.17.41
when the gate was first introduced. The recent sample was likely the
first time anyone tried to audit the field via the borderline script,
exposing the latent mismatch.

## Fix (V11.17.102)

### Prompt changes — renamed the JSON key to `reasoning`

**`src/lib/services/consolidated-ai.service.ts` ~line 280:**

```js
'    "reasoning": "<one sentence — REQUIRED on every response, whether anomalous=yes or no. Explain WHY in one sentence the witness account does or does not qualify as a documented first-person anomalous experience. Cite the deciding feature(s) from the source.>",',
```

Tightened the spec to make explicit that `reasoning` is required for
both `yes` and `no` verdicts, and that Haiku must cite the deciding
feature(s) from the source.

**`src/lib/services/paradocs-analysis.service.ts` ~line 265:** same
edit to the fallback (single-call legacy) path.

### Normalizer changes — canonical write key + legacy `reason` fallback

**`consolidated-ai.service.ts` `normalizeAnomalyCheck` (~L932):** writes
the field as `reasoning` going forward. Also accepts `reason` from any
in-flight cached Haiku response during the rollout window so we don't
drop an explanation if the prompt cache emits the old shape briefly.

**`paradocs-analysis.service.ts` (~L1224, ~L1234, ~L1625, ~L1968):**
identical canonical rename + legacy fallback for the parser and the
two default-object literals.

### Consumer change — defensive read

**`scripts/inspect-borderline-sweep.ts` line 129:** reads `ac.reasoning`
first, falls back to `ac.reason` if absent (handles historical rows
prior to the one-shot SQL alias backfill).

### Engine impact: none

`src/lib/ingestion/engine.ts` reads only `anomalous`, `confidence`,
`genre` for its three-tier demotion logic. The reasoning string was
already not part of the gating decision, so no engine change is needed.

## Verification

### Test command (smoke a single live call)

```bash
# Trigger one report through the consolidated path
NODE_ENV=development USE_CONSOLIDATED_AI=true \
  npx ts-node -e "
    import { generateAndSaveConsolidatedAI } from './src/lib/services/consolidated-ai.service'
    generateAndSaveConsolidatedAI('<recent-report-id>').then(r => console.log(JSON.stringify(r, null, 2)))
  "
```

Then read the row back:

```sql
SELECT
  id, slug,
  paradocs_assessment->'anomalous_content_check' AS ac
FROM reports
WHERE id = '<the-report-id>';
```

Confirm the `ac` object has key `reasoning` (NOT `reason`) and the
value is a one-sentence explanation.

### Verification SQL — fleet-wide

```sql
-- After the rename ships, every freshly ingested row should have
-- .reasoning populated and zero new rows under .reason.
SELECT
  COUNT(*) FILTER (
    WHERE paradocs_assessment->'anomalous_content_check' ? 'reasoning'
      AND (paradocs_assessment->'anomalous_content_check'->>'reasoning') <> ''
  ) AS with_reasoning,
  COUNT(*) FILTER (
    WHERE paradocs_assessment->'anomalous_content_check' ? 'reason'
      AND NOT (paradocs_assessment->'anomalous_content_check' ? 'reasoning')
  ) AS legacy_reason_only,
  COUNT(*) AS total_with_ac
FROM reports
WHERE paradocs_analysis_generated_at > NOW() - INTERVAL '1 hour'
  AND paradocs_assessment ? 'anomalous_content_check';
```

After 1h of live traffic post-deploy: `with_reasoning` should be ~100%
of `total_with_ac`; `legacy_reason_only` should be 0.

### Audit script verification

```bash
npx ts-node scripts/inspect-borderline-sweep.ts --no 5 --random 5
```

Every row should now print a real `AC.reasoning:` line — not
`(no reasoning field)`.

## Backfill question for the founder

**110,937 reports** have an anomaly verdict (`anomalous=yes` or `no`)
but no `.reasoning` key. 100% of them have a populated `.reason` —
the SAME English explanation, under the legacy key.

Two options:

1. **One-shot SQL alias (recommended — $0, ~5 seconds).** Just rename
   the JSON key in place; the explanation string is already perfect.
   Founder gets full historical auditability immediately.

   ```sql
   UPDATE reports
   SET paradocs_assessment = jsonb_set(
     paradocs_assessment #- '{anomalous_content_check,reason}',
     '{anomalous_content_check,reasoning}',
     paradocs_assessment#>'{anomalous_content_check,reason}'
   )
   WHERE paradocs_assessment#>'{anomalous_content_check,reason}' IS NOT NULL
     AND NOT (paradocs_assessment#>'{anomalous_content_check}' ? 'reasoning');
   ```

   Wrap in a transaction; run on a 1k-row test cohort first. The audit
   scripts already have a defensive `reason` fallback so they keep
   working before AND after this runs.

2. **Re-classify with V11.17.102 prompt (~$555, ~4-6 hours via batch
   API).** Would also benefit from the V11.17.102 prompt's stronger
   spec ("cite the deciding feature(s)"). But: the existing `reason`
   strings are already source-grounded and read well; the marginal
   audit quality lift is small.

**Recommendation:** Option 1. The historical rows are auditable as-is;
Option 2's cost doesn't pencil out vs. the rename. New rows will use the
V11.17.102 stricter spec automatically.

DO NOT run this backfill without explicit founder approval — this
notes doc only proposes it; no production data has been modified.

## Operator runbook

1. **Deploy V11.17.102.** Files touched:
   - `src/lib/services/consolidated-ai.service.ts`
   - `src/lib/services/paradocs-analysis.service.ts`
   - `scripts/inspect-borderline-sweep.ts`
   - `docs/REASONING_FIELD_FIX_NOTES.md` (new)
2. **Smoke test:** trigger one report through `generateAndSaveConsolidatedAI`,
   confirm `.reasoning` populated in DB.
3. **Run verification SQL** (above) after 1h to confirm fleet-wide write
   is using the new key.
4. **Decide on backfill** (Option 1 vs. Option 2 vs. leave-as-is). If
   running Option 1, wrap in transaction, test on `LIMIT 1000` cohort
   first, run on full fleet during low-traffic window.
5. **Once backfill completes**, the defensive `reason` fallback in
   `inspect-borderline-sweep.ts` (and the legacy `reason` accepter in
   both normalizers) can be removed in a follow-up cleanup pass — not
   blocking, just hygiene.

## Files changed in this commit

- `src/lib/services/consolidated-ai.service.ts` — prompt + normalizer
- `src/lib/services/paradocs-analysis.service.ts` — prompt + normalizer + 2 default literals
- `scripts/inspect-borderline-sweep.ts` — defensive legacy-key fallback
- `docs/REASONING_FIELD_FIX_NOTES.md` — this doc
