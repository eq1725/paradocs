# V11.17.91 — classify-phenomena-batch.ts prompt-cache fix

## Problem

V11.17.90 reduced per-report cost from $0.027 → $0.00236. Projection
target (per V11.17.90 design notes, $0.00125-$0.001475/report) was not
hit. The ~$0.001 gap suggested Anthropic's prompt cache wasn't sticking
on the classifier-primary path.

## Diagnosis

`cache_control` IS structurally correct on the classifier-primary
system block (`scripts/classify-phenomena-batch.ts:647`):

```ts
system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
```

System prompt is built ONCE per category (`buildSystemPrompt`,
`classifyCategory` line 617) and reused for every report in that
category — no per-call interpolation. Prompt size for the larger
categories (ufos_aliens, ghosts_hauntings, cryptids) is ~3-6k tokens,
well above Haiku's 1024-token cache floor.

**Where the cache misses come from — three failure modes:**

### Failure 1: Parallel-write race inside a single batch

Anthropic's Batch API processes requests in PARALLEL inside one
submission. When 4000 requests fire simultaneously sharing the same
system prefix, several can hit Anthropic's queue BEFORE any has
finished writing the cache. Each of those gets billed full input
price, not cache_read. The cost model assumes "one write, N-1 reads"
but reality is "M writes, N-M reads" where M depends on Anthropic's
queue parallelism.

Math: full input on a 6k-token sys prompt = $0.003/req (batch input
$0.50/M). Cached read = $0.0003. The per-call miss premium is
~$0.00135 once user + output costs roll in. The observed $0.00236
(V11.17.90) vs projected $0.00125 = $0.00111 gap matches that pattern
almost exactly.

### Failure 2: Non-deterministic system prompt across re-runs

`fetchAllRows(... .eq('category', category))` returns rows in
arbitrary Postgres order without `ORDER BY`. Two separate classifier
runs over the same category emit byte-different system prompts (phens
in different order), each writing its own cache key. Within one run
the order is fixed, but cross-run sharing — and across parallel
workers from `parallel-drain` — was leaking cache hits.

Same issue with `p.aliases`: a Postgres `text[]` column has no
guaranteed element order across reads.

### Failure 3: Verify path has no caching at all

`runVerifyBatch` (line 380) submits each candidate as a single user
message with no system block, no cache_control. The verify boilerplate
(TASK / MATCH rules / OUTPUT format) is ~320 tokens — below Haiku's
1024-token cache floor — so even adding cache_control there wouldn't
help. Verify cost stays at $0.00125/call regardless.

## Fix applied (V11.17.91)

**Fix A — ORDER BY slug on phenomena query, sort aliases.**
`classifyCategory()` query now uses `.order('slug', { ascending: true })`
and `buildSystemPrompt` sorts `aliases` before joining. Guarantees
byte-stable system prompt across runs, workers, days.

**Fix B — Sync prewarm Haiku call before each batch chunk submission.**
New helper `prewarmCache(systemPrompt)` makes a sync (non-batch) Haiku
call with the EXACT same system block + cache_control marker, `max_tokens: 1`,
user message "ping". Pays cache_creation cost once (~$0.004 for a 6k
sys prompt) and primes Anthropic's prompt cache. The batch chunk
fires immediately after — all 4000 parallel requests hit the warm
cache.

Amortized prewarm cost: $0.004 / 4000 = $0.000001/report.
Saved cache-miss cost: ~$0.00135/report × 4000 = $5.40/chunk.
Net win: ~$5.40 per 4000-request chunk.

The verify path was NOT fixed — its variable-content prompt is below
Haiku's cache floor even after restructure. Verify cost stays at
$0.001-$0.0014/report.

## Per-report cost projection

| Component | V11.17.90 (observed) | V11.17.91 (projected) |
| --- | --- | --- |
| classifier-primary cached | partial (~$0.001) | full ($0.000475) |
| classifier-primary cache miss premium | ~$0.00135/req | $0 |
| verify (1.0-1.5 cands × $0.00125) | $0.00125-$0.001875 | $0.00125-$0.001875 |
| **total per report** | **$0.00236** | **$0.00135-$0.00185** |

Target $0.00125 will land near the floor of the projected range if the
verify-skip rate is at the design 50%. If verify-skip is lower than
projected (founder may want to check the confidence-gate firing rate
on the next live run), verify cost dominates and we'll land closer to
$0.00185.

## Files touched

- `scripts/classify-phenomena-batch.ts`
  - header comment: V11.17.91 stamp + design notes
  - `fetchAllRows` phenomena query: `.order('slug')`
  - `buildSystemPrompt`: `p.aliases.slice().sort()`
  - new `prewarmCache(systemPrompt)` helper before `submitBatch`
  - chunk submission loop: prewarm before each `submitBatch(chunk)`
  - main banner: V11.17.91 string

## Typecheck

```
cd /sessions/affectionate-tender-fermi/mnt/paradocs && \
  npx tsc --noEmit --project tsconfig.json 2>&1 | \
  grep "classify-phenomena-batch" | head
# (clean — no output)
```

Pre-existing typecheck noise across `scripts/` is unrelated (--target ES5
iteration warnings, etc.).

## Smoke test

ANTHROPIC_API_KEY is not present in this environment — a live batch
submission was not possible. Static verification: `prewarmCache`
signature, JSON body shape, cache_control structure all line up with
the working consolidated-ai.service and batch-ingest-worker patterns
already in production.

**Before founder unleashes:** run

```
tsx scripts/classify-phenomena-batch.ts --category cryptids --limit 50
```

Check the new log line:

```
  prewarm OK (sync cost: $0.00XXX)
```

Then inspect the `paradocs_narrative_cost_log` rows for that run:

- `classifier-primary` rows should show `cache_read_input_tokens` ≈
  full system size (~3-6k) on EVERY row, not just a fraction.
- `input_tokens` should drop to user-message-only (~400) on every row.
- `cache_creation_input_tokens` should be near-zero on batched rows
  (the prewarm pays the write).

V11.17.90 was showing cache_creation on a meaningful fraction of
batched rows — that's the symptom this fix targets.

## Open questions for founder

1. **Verify-rate** — if the live smoke shows the confidence-gate is
   firing on <40% of candidates (i.e. classifier rarely emits ≥0.92
   confidence), the verify path will dominate cost and we'll miss the
   $0.00125 target despite the prewarm landing. Bumping the
   classifier's max_tokens may help it commit harder to high-confidence
   verdicts; or lowering `VERIFY_SKIP_CONFIDENCE` to 0.88 (still above
   the V11.17.90 "I'm pretty sure" 0.85 floor).
2. **Prewarm failure mode** — if the sync API is throttled or down,
   the prewarm fails and the chunk runs without warm cache (V11.17.90
   behavior). Logged as a warn; chunk still proceeds. Wanted to flag
   this as expected behavior, not a bug.
3. **TTL** — Anthropic ephemeral cache is 5 min after last hit. Batch
   chunks submit immediately after prewarm (sub-second), so the cache
   is warm when parallel requests fire. Subsequent chunks within the
   same category re-prewarm, so TTL expiry between chunks doesn't
   cost us anything.
