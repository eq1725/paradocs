# MVP Continuation Prompt — copy/paste into new session

This is the on-ramp to a 4-track MVP push that ends with Paradocs live in Apple App Store + Google Play.

---

## The handoff in one sentence

We are mid-sprint on a 4-track MVP execution plan for Paradocs (discoverparadocs.com). Track A (product Tier 1) is 2 of 13 tasks done. Tracks B (mass ingestion), C (Capacitor + app stores), and D (launch readiness) are spec'd but not started. Pick up at **T1.3** in Track A and work through the dependency graph in `MVP_EXECUTION_PLAN.md`.

## Before you start

1. **Read `MVP_EXECUTION_PLAN.md` end-to-end.** It's the master doc: all 4 tracks, dependency graph, sequencing recommendation, full task table.
2. **Read `TIER1_EXECUTION_PLAN.md` end-to-end.** Has Track A (T1.1–T1.13) at execution detail. The MVP plan references this for Track A detail rather than duplicating.
3. **Skim `B1_5_QA_QC_NOTES.md` + `HANDOFF_INGESTION.md`** for Track B context — you don't need to act on them today but should know what exists.
4. **Note**: `B1_5_CONTINUATION_PROMPT.md` is the prior ingestion-pipeline session's prompt. Don't conflate it with the current MVP-wide push.

## What's done at handoff

- ✅ **T1.1** — `report_count` reconciled across all 1,463 active phenomena (Shadow Person 9,675 → 0, 3 orphan-link cleanups). Nightly cron at `/api/cron/reconcile-phenomena-counts` scheduled 03:00 UTC.
- ✅ **T1.2** — `/phenomena` index 301-redirects to `/explore?view=categories` via `next.config.js`. Internal links in `src/pages/explore.tsx` updated.

## What's next (in order)

**Immediate (Track A continuation):**
- ⏭️ **T1.3** — simplify `/phenomena/[slug]` to thin "Reports tagged [X]" page (spec in `TIER1_EXECUTION_PLAN.md` § T1.3)
- Then T1.4 → T1.13 sequentially

**Parallel-able (per sequencing recommendation in `MVP_EXECUTION_PLAN.md`):**
- **Track B Phase 0:** B0.1 (finish B1.5 smoke tests) can start in parallel with Track A
- **Track C setup:** C0.1 (Chase action — Google Play signup), C0.3 (env vars), C1.1–C1.3 (Capacitor wrap) can start in parallel
- **Track D scaffolding:** D3 (support email), D5 (incident runbook draft) can start anytime

## Operating principles for this session

- **One task at a time, mark in_progress → completed.** Tasks #59–#71 cover Track A. Create new TaskCreate IDs for Track B/C/D items as you start them.
- **Don't relitigate locked decisions.** Q1=b, Q2=b, Q3=a, account-first onboarding (no A/B), index-with-attribution legal model, ingested-vs-submitted display divergence — all in the plan docs. Refer back if user asks; don't re-propose alternatives unless something genuinely changes.
- **Show diff plans for large files before editing.** start.tsx (2700+), lab.tsx (2000+), explore.tsx (1700+), phenomena/[slug].tsx (700+) — each benefits from a "removing X, adding Y, keeping Z" preview before execution.
- **Verify each task end-to-end** before marking completed. Many tasks have downstream dependencies (T1.4 depends on T1.1's reconciled report_count; T1.6 lazy image hook depends on ingestion engine wiring from B1.5).
- **Don't add new docs unless asked.** `MVP_EXECUTION_PLAN.md` + `TIER1_EXECUTION_PLAN.md` are the canonical docs. Supplement only on request.
- **Track B/C/D are parallel workstreams** — don't blindly defer everything to "after Track A done." Per the sequencing recommendation, Track B Phase 0 + Track C setup + Track D scaffolding can run concurrently with Track A execution.

## The 4-track summary

| Track | Scope | Tasks | Status |
|---|---|---|---|
| A | Product Tier 1 (pre-launch surfaces) | T1.1–T1.13 | 2/13 done |
| B | Mass ingestion (content engine) | B0.1–B0.8 + B2.1–B2.4 | 0/12 done |
| C | Capacitor + App Store + Google Play | C0.1–C4.3 | 0/19 done |
| D | Launch readiness | D1–D7 | 0/7 done |

**Total:** 2 done · 49 remaining → MVP launch.

## Encyclopedia state at handoff (for context)

1,463 active entries across 8 categories. 765 hand-curated, 698 auto-generated. 3,062 archived. Top live `report_count`: 55. Currently 80 entries with `report_count > 0` (will fill in as Track B mass-ingestion goes live).

```
religion_mythology       111h + 168a = 279
ufos_aliens              194h +  27a = 221
ghosts_hauntings         182h +  33a = 215
cryptids                  99h + 112a = 211
esoteric_practices        42h + 126a = 168
consciousness_practices   47h + 108a = 155
psychic_phenomena         45h +  87a = 132
psychological_experiences 45h +  37a =  82
TOTAL                                 1,463
```

## Environment

- Workspace: `/Users/chase/paradocs/` (mounted at `/sessions/<session>/mnt/paradocs/` in bash)
- Supabase URL: `https://bhkbctdmwnowfmqpksed.supabase.co`
- Service role key + Anthropic key in `.env.local`
- Production: https://discoverparadocs.com
- Admin email: `williamschaseh@gmail.com`
- Apple Developer account: ready
- Google Play Console: signup pending (Chase action)

## Getting started

```
Read /Users/chase/paradocs/MVP_EXECUTION_PLAN.md, then /Users/chase/paradocs/TIER1_EXECUTION_PLAN.md. Then proceed with T1.3 (Track A continuation) — simplify /phenomena/[slug] per the spec. Mark task #61 as in_progress before starting. Show me a brief diff plan (what's being removed, what's being added) before making the file changes.

In parallel, queue up the Track B Phase 0 + Track C setup work per the sequencing recommendation in the MVP plan. If something needs my decision or action (like the Google Play signup), surface it explicitly.
```

---

**Created:** May 16, 2026 (end of session that completed T1.1 + T1.2 + the full MVP plan)
**Single source of truth:** `MVP_EXECUTION_PLAN.md` (master) + `TIER1_EXECUTION_PLAN.md` (Track A detail). This prompt is just the on-ramp.
