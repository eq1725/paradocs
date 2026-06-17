# Cross-category phenomenon classification — design & scope

**Date:** June 17, 2026
**Problem (founder):** the classifier only tags reports to phenomena in the report's *own* category, so cross-cutting phenomena are stranded — e.g. ~1,730 "angel" and ~1,765 "demon" approved reports sit in ghosts/psychic/etc. and never get tagged to the religion **Angels**/**Demon** phenomena. "We should classify across categories as well as within them."

## How it works today (root cause)

`scripts/classify-phenomena-batch.ts` → `buildSystemPrompt(category, phenomena)` builds a prompt-cached **catalog of one category's phenomena** (slug · name · aliases · summary). For each approved report *in that category*, Haiku picks `primary` + up to 2 `secondary` slugs **only from that catalog**, then `verifyTag` (a second Haiku gate) confirms each before a `report_phenomena` link is written. Both sides are category-scoped (`.eq('category', category)` on reports and on phenomena). There are **no report/phenomenon embeddings** (the column/vector tables aren't active), so today's matching is entirely "LLM + in-category catalog."

A report only gets re-examined when it is **unlinked** — the run filters to "approved reports without existing phenomenon links." So already-linked reports won't pick up a new cross-category tag without a forced re-tag.

## Options considered

- **A — Universal catalog augmentation (recommended).** Merge a small, curated set of genuinely cross-cutting phenomena (Angels, Demon, Shadow Person, Sleep Paralysis, Orbs…) into *every* category's catalog. The LLM can then tag a ghosts-categorized angel report with the religion **Angels** phenomenon; the verify-gate still guards precision. Token cost: +~20–40 catalog lines per run (negligible vs the 100–600-entry category catalogs). Surgical, low-risk, directly closes the named gap.
- **B — Phenomenon-pull backfill.** For specific cross-cutting phenomena, keyword/LLM-retrieve candidate reports across *all* categories and link them. Needed to capture the **already-linked** stranded reports (which Option A's unlinked-only re-run won't touch). Pairs with A.
- **C — Full embedding retrieval.** Build embeddings for ~300k reports + all phenomena, retrieve top-K candidates per report across categories, then gate. Most general, but requires standing up embedding infra that doesn't exist — disproportionate to the need. Defer.

## Recommended plan (A + B)

1. **Curate a "universal" cross-cutting phenomena set** (founder input). Starter proposal (each genuinely appears across categories): Angels, Demon, Shadow Person, Sleep Paralysis, Orbs, Poltergeist, Black-Eyed Children, Men in Black, Doppelgänger, Missing Time, Cryptid Sighting, Marian/Saint Apparitions, Demonic Haunting. Keep it ~15–40 entries — only phenomena that legitimately recur outside one category.
2. **Code change:** `buildSystemPrompt` includes `(category phenomena ∪ universal set)`, de-duplicated, with universal entries clearly grouped ("CROSS-CATEGORY phenomena — tag if they fit, regardless of this report's category"). One-function change; the verify-gate and everything downstream is unchanged.
3. **Durable result:** every future classifier run can assign cross-cutting tags. Newly-approved + unlinked reports get them automatically.
4. **Backfill the stranded existing reports (B):** a targeted pull pass per universal phenomenon — candidate reports by keyword/alias across all categories → `verifyTag` gate → link. This catches the ~1,730 angel / ~1,765 demon already-linked reports that the unlinked-only re-run misses.

## Effort / cost / risk

- **Build:** catalog-merge change (small) + the phenomenon-pull backfill script (moderate, mirrors the existing classifier's gate). ~half a day.
- **AI cost:** catalog augmentation adds trivial per-run tokens. Backfill: ~candidate reports × Haiku verify (~$0.001 each) — rough order **$10–25** for the angel/demon/shadow/sleep-paralysis set; dry-run will price it exactly.
- **Risks & mitigations:** false positives → the existing `verifyTag` gate stays in front of every link (primary defense); catalog bloat → keep the universal set small + curated; double-counting → links are idempotent per (report, phenomenon). Touches the classifier everything depends on, so: ship behind a dry-run with a sample of proposed cross-category links for review before any writes.

## Open decisions for the founder

- **Curate the universal set** — confirm/trim the starter list above (what's truly cross-cutting vs should stay category-bound).
- **Backfill scope** — all universal phenomena at once, or start with Angels + Demon (the named gap) and expand.
- **Sequencing** — this touches the live classifier; recommend building + dry-running it *after* tonight's `--all` run finishes, so we're not changing the matcher mid-run.
