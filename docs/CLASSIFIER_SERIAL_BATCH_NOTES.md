# V11.17.92 — classify-phenomena-batch.ts serial-batch cache fix

## V11.17.91's batch submission pattern

Already serial. The chunk loop at `scripts/classify-phenomena-batch.ts`
(was line 763) is `for (let ci = 0; ci < chunks.length; ci++)` with an
`await submitBatch(chunk)` then a `while (true)` poll loop that
`break`s only when the batch's `processing_status === 'ended'`. So
chunks within a category have NEVER been submitted in parallel — they
queue and complete one at a time. Good.

The leak was NOT parallelism between chunks. It was the **per-chunk
prewarm** firing on every chunk iteration. Each prewarm is a single
sync write that hasn't fully propagated across Anthropic's parallel
batch workers by the time the chunk fires, so within each chunk's
batch ~30% of workers raced and paid cache_creation.

## What V11.17.92 changes

Wrap the `prewarmCache(systemPrompt)` call in `if (ci === 0)`. Only the
first chunk per category prewarms. Chunks 2+ rely on the previous
chunk's batch having already written cache (4000 successful Anthropic
cache writes is a vastly stronger warm than a single sync prewarm
write — the previous batch's TTL also gets refreshed on every read).

That's the entire functional change. Submission is already serial via
the existing `for ... await` loop, so chunks 2+ start with a
confirmed-warm cache from chunk N-1's just-completed batch.

## Expected cache_creation reduction

Per category (~9 chunks for ufos_aliens at 4000 reqs/chunk × 35k reports):

| Behavior | V11.17.91 | V11.17.92 |
| --- | --- | --- |
| Prewarm writes | 9 (one per chunk) | 1 (first chunk only) |
| Within-batch parallel-write race | ~30% of 9 chunks = ~10,800 cache_create reqs | ~30% of 1 chunk = ~1,200 cache_create reqs |
| Total cache_create tokens (6k sys × ~1200 reqs) | ~64.8M | ~7.2M |
| Reduction | — | ~9× |

User's projection of "~8.2M → ~0.05M per 5 min" assumes Anthropic's
warm cache eliminates the within-batch race for chunks 2+ entirely
(not just reduces it). Worst case (race still happens at 30% on chunk
2+): we still get a ~9× reduction. Best case (Anthropic's warm cache
fully absorbs parallel reads): we get the projected ~160× reduction.

## Wall-clock impact

**Zero.** The chunk loop was already sequential — submission, poll,
process, next chunk. We only removed one fast sync prewarm call per
chunk (which is ~300-800ms over 4000 chunks → seconds saved, if any).
No new sleeps, no new ordering constraints.

## Quality

No changes:
- `VERIFY_SKIP_CONFIDENCE` = 0.92 (unchanged)
- Classifier asks for primary + up to 2 secondary candidates (unchanged)
- Verify gate still runs on candidates with confidence < 0.92 (unchanged)
- System prompt structure unchanged
- Confidence floor (0.85 for legacy bare-slug) unchanged

## Typecheck

```
cd /sessions/affectionate-tender-fermi/mnt/paradocs && \
  npx tsc --noEmit --project tsconfig.json 2>&1 | \
  grep "classify-phenomena-batch" | head
# clean — no output
```

## Smoke test recommendation

```
tsx scripts/classify-phenomena-batch.ts --category cryptids --limit 50
```

Check the new log lines:

```
Chunk 1/N: submitting 4000 requests...
  prewarm OK (sync cost: $0.00XXX)
  batch_id: ...

Chunk 2/N: submitting 4000 requests...
  prewarm skipped (cache warmed by chunk 1)
  batch_id: ...
```

Then inspect `paradocs_narrative_cost_log` for that run. Chunk 1's
rows should still show some cache_creation_input_tokens (one race
wave at the start). Chunks 2+ rows should show ~zero
cache_creation_input_tokens — all cache_read.

If chunks 2+ still show appreciable cache_creation_input_tokens, the
hypothesis was wrong and either:
1. Anthropic's batch workers don't read each other's cache writes
   (each batch has isolated cache state), in which case we should
   re-add per-chunk prewarm.
2. The 5-min TTL isn't refreshing on read (only on write), and a
   batch that takes 5+ min between chunks busts the cache. Easy fix:
   add a 1-token sync ping between chunks.

## Files touched

- `scripts/classify-phenomena-batch.ts`
  - Header comment: V11.17.92 stamp + design rationale.
  - Chunk loop: `if (ci === 0)` guard around `prewarmCache`.
  - Main banner string: V11.17.92.
  - New log line `prewarm skipped (cache warmed by chunk N)`.

## Open question for founder

If after the smoke test we see chunks 2+ STILL paying cache_create —
i.e. each batch on Anthropic's side has its own isolated cache scope
— we'll need a different fix. Re-add the per-chunk prewarm and look
at request-level cache_control with longer TTL flags (Anthropic now
supports 1-hour beta TTL on some endpoints — `anthropic-beta:
extended-cache-ttl-2025-04-11`). Should we keep V11.17.91's per-chunk
prewarm as a fallback flag (`--per-chunk-prewarm`) so we can A/B on
the live ufos_aliens run?
