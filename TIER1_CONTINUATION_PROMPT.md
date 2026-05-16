# Tier 1 Continuation Prompt — copy/paste into new session

---

## The handoff in one sentence

We are mid-sprint on Tier 1 pre-launch work for Paradocs (discoverparadocs.com). The encyclopedia has been culled and re-framed as a tag vocabulary (not a Wikipedia), `report_count` reconciled, `/phenomena` index 301-deprecated. Pick up at **T1.3 — simplify `/phenomena/[slug]` to a thin "Reports tagged [X]" page** and proceed through T1.13 in order.

## Before you start

1. **Read** `TIER1_EXECUTION_PLAN.md` end-to-end. It is the single-source-of-truth for everything that's been decided. Locked decisions and architectural framing both live there.
2. **Skim** `B1_5_QA_QC_NOTES.md` and `HANDOFF_INGESTION.md` for Track B (mass-ingestion) context — you don't need to act on them in this session, but you should know what exists so you don't suggest rebuilding it.
3. **Note** the `B1_5_CONTINUATION_PROMPT.md` already exists for the parallel ingestion track — don't conflate Tier 1 product work with B1.5/B2 ingestion work.

## Core principles for this session

- **Tag vocabulary, not encyclopedia.** Every UI decision should ask: "would a real ingested report (from Reddit / NUFORC / NDERF / YouTube comment) ever be tagged with this and surface here?" If not, simplify.
- **Preserve content in DB, simplify rendering.** Q3=a is locked — don't null out `ai_*` fields. Just stop rendering them in the simplified surfaces.
- **Don't relitigate decisions** in `TIER1_EXECUTION_PLAN.md`. If the user asks, refer back. If genuinely new info changes a decision, surface that decision change explicitly.
- **One task at a time, in order.** T1.3 → T1.4 → ... → T1.13. Don't skip ahead unless blocked. Each is independently shippable; finish + verify each before starting next.
- **Use TaskList/TaskUpdate** to track per-task progress. The Tier 1 tasks already exist as IDs in the task system (T1.1=#59, T1.2=#60, T1.3=#61, ... T1.13=#71). Start each by setting status `in_progress`, finish by setting `completed`.
- **Mass ingestion (Track B) is a parallel workstream** — don't pull it into this Tier 1 sprint unless explicitly asked.

## Status snapshot at handoff

- ✅ T1.1 — `report_count` reconciled (Shadow Person 9,675 → 0 + 3 orphan links cleaned; 80 entries now have nonzero counts; 322 total approved links). Cron at `/api/cron/reconcile-phenomena-counts` scheduled 03:00 UTC.
- ✅ T1.2 — `/phenomena` index 301-redirects to `/explore?view=categories` via `next.config.js`. Internal links in `src/pages/explore.tsx` updated.
- ⏭️ T1.3 — START HERE. See `TIER1_EXECUTION_PLAN.md` § T1.3 for spec.
- ⏭️ T1.4 through T1.13 — pending; specs in `TIER1_EXECUTION_PLAN.md`.

## Encyclopedia state at handoff

1,463 active entries across 8 categories. 765 hand-curated, 698 auto-generated. 3,062 archived. Top live `report_count`: 55. Currently 80 entries with `report_count > 0` (the rest will fill in as mass-ingestion goes live).

```
religion_mythology    111h + 168a = 279
ufos_aliens           194h +  27a = 221
ghosts_hauntings      182h +  33a = 215
cryptids               99h + 112a = 211
esoteric_practices     42h + 126a = 168
consciousness_practices 47h + 108a = 155
psychic_phenomena      45h +  87a = 132
psychological_experiences 45h + 37a = 82
TOTAL                              1,463
```

## Environment

- Workspace: `/Users/chase/paradocs/` (mounted at `/sessions/<session>/mnt/paradocs/` in bash)
- Supabase URL: `https://bhkbctdmwnowfmqpksed.supabase.co`
- Service role key: in `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`
- Anthropic key: in `.env.local` as `ANTHROPIC_API_KEY`
- Production: https://discoverparadocs.com
- Admin email: `williamschaseh@gmail.com`

## Behavior expectations

- **Ask once, execute.** If a task has a decision point clearly stated in `TIER1_EXECUTION_PLAN.md`, follow it. If there's a genuinely new judgment call (e.g., specific UI copy, specific styling), make a reasonable decision and call it out so user can override.
- **Show file diffs** for any non-trivial UI change before committing — large files (start.tsx 2700+, lab.tsx 2000+, explore.tsx 1700+, phenomena/[slug].tsx ~700+) benefit from "here's the planned change" before execution.
- **Verify each task end-to-end** before marking completed: re-read the modified files, sanity-check that nothing downstream broke (e.g., T1.4 changes depend on T1.1's reconciled report_count — verify the count is what you expect before testing the filter).
- **Don't add docs unless explicitly asked.** `TIER1_EXECUTION_PLAN.md` is the canonical doc; supplement only if user requests.

## Getting started

```
Read /Users/chase/paradocs/TIER1_EXECUTION_PLAN.md, then proceed with T1.3 — simplify /phenomena/[slug] to a thin "Reports tagged [X]" page per the spec in the plan doc. Mark task #61 as in_progress before starting. Show me a brief diff plan (what's being removed, what's being added) before making the file changes.
```

---

**File created:** May 16, 2026 (end of session that completed T1.1 + T1.2 + the Tier 1 plan)
**Single source of truth:** `TIER1_EXECUTION_PLAN.md` (this prompt is just the on-ramp).
