# Cross-Source Deduplication Hardening — Two-Panel Review

**Scope:** Harden deduplication so that as we add overlapping sources (CUFOS, MUFON, more newspapers) the archive does not fill with the same account twice — *without* destroying the thing that makes Paradocs valuable: many independent people witnessing the same event. Covers all adapters and all categories, and the already-ingested corpus, not just new ingests.

**Method:** Panel 1 (the design panel) proposes an architecture. Panel 2 (the red team) attacks it. We keep only what survives. The final section is the synthesized, air-tight plan + phased roadmap + guardrails + open founder calls.

**Status:** Recommendation for founder approval **before** implementation. This is the gate for the CUFOS pipeline (the highest-overlap UFO source we have).

---

## 0. The job to be done

Two jobs that look identical and are opposite:

- **Kill duplicates.** The *same account* appearing twice — a NUFORC case that CUFOS also catalogues, a wire story reprinted in 30 newspapers, a Reddit cross-post of a news article. One underlying report, ingested twice. These must collapse to a single canonical record.
- **Protect corroboration.** The *same event* witnessed independently by different people — Phoenix Lights (hundreds of distinct accounts), a regional UFO flap, a haunting reported by multiple residents across years. These are **not** duplicates. They are the single most valuable signal in the archive ("you are not alone — 47 people saw this too"). Collapsing them would delete the product.

**The north star the panel proposes:**

> *Dedup collapses re-publications of the same account. It must never collapse independent witnesses of the same event — those get linked into an event cluster and surfaced as corroboration.*

Get this distinction wrong in either direction and we either (a) bloat the archive with reprints, or (b) silently destroy the corroboration that is our moat. The design exists to thread exactly this needle.

---

## 1. Current state (grounded in the live code)

What exists today, by evidence:

- **Per-source exact dedup.** DB unique index `idx_reports_source_unique ON reports(source_type, original_report_id)` (migration 025) + an engine check that UPDATEs on `(source_type, original_report_id)` match. Catches re-ingesting the *same source's same record*. Scoped to one source — a NUFORC id and a CUFOS id never compare.
- **Engine fuzzy dedup** (`engine.ts` ~1016-1070 → `dedup.ts compareCandidates`): cross-source-capable, weighted title/location/date/content score (definite ≥0.85 auto-skip; likely 0.65-0.84 insert + flag in `duplicate_matches`). **But:** capped to ~200 recent rows, **scoped to the same category**, lexical (Levenshtein/Jaccard, no semantics), and — critically — **the mass-ingest drivers bypass it entirely.**
- **Content fingerprint** (`dedup.ts generateFingerprint` = `title[0:40] | YYYY-MM-DD | location[0:20]`, stored in `reports.content_fingerprint`, indexed but **not** a unique constraint). Cross-source-capable, currently used only as an optional pre-filter.
- **Semantic dedup** (`scripts/ca-semantic-dedup.ts`): real embedding-based clustering (OpenAI `text-embedding-3-small` 1536-d → `vector_chunks` + `search_vectors` RPC, cosine ≥0.90, ±45-day guard, canonical-keep + reversible archive). **Chronicling-America only.**

**The gap, stated plainly:** the path that ingests NUFORC, NDERF, BFRO — and will ingest CUFOS — does **only** per-source exact-id dedup. A UFO sighting present in both NUFORC and CUFOS lands as two rows and nothing stops it. The one good cross-source tool (semantic dedup) is hard-scoped to CA. So we are about to point a high-overlap source (CUFOS) at a system with no cross-source defense.

---

## 2. PANEL 1 — the design panel's recommendation

### 2.1 Reframe: this is entity resolution, two operations not one

Stop thinking "dedup." Think **same-account resolution** + **same-event clustering**, run by the same pipeline but with different thresholds and different outcomes:

| | Trigger | Outcome |
|---|---|---|
| **Same account (duplicate)** | Near-identical *text* + same date + same place (reprint, cross-catalogue, cross-post) | Collapse → canonical + archive others (reversible) + provenance ("also in CUFOS") |
| **Same event (corroboration)** | Different text, same date-window + same locality, distinct witness | **Keep both** → link into an `event_cluster` + surface "N reports of this event" |
| **Unrelated** | Fails date/geo agreement | Independent rows, no action |

The same candidate-generation and scoring feed both; only the **decision band** differs.

### 2.2 The matching architecture — blocking → scoring

Brute-force comparing every new report against 300k+ rows is impossible. Standard entity-resolution two stages:

1. **Blocking (cheap candidate generation).** For an incoming report, fetch a small candidate set using indexes we already have or can add:
   - same/near `content_fingerprint`,
   - event_date within ±N days,
   - geo within R km (haversine / state bucket),
   - (optionally) embedding ANN top-k via `search_vectors`.
   Union these, cap at ~50 candidates. No category restriction (cross-category is allowed; geo+date is the gate).
2. **Scoring (confirm).** For each candidate, combine:
   - **embedding cosine** (semantic similarity of the narrative — catches reworded reprints the lexical scorer misses),
   - **structured agreement**: date proximity, geo proximity, witness-count/shape/category agreement,
   - the existing **lexical** `compareCandidates` score as one more signal.
   Produce a calibrated 0-1 with an explicit reason string.

### 2.3 Where it runs

- **Pre-insert, in the mass-ingest path** (the actual fix). Add the blocking+scoring step to the shared driver flow so CUFOS/NUFORC/BFRO check cross-source *before* insert. High-confidence same-account → don't insert, attach provenance to the canonical instead.
- **Backfill wave over the existing corpus.** Generalize `ca-semantic-dedup.ts` to be source-agnostic and run it across all UFO rows first (the densest overlap), then other categories. Reversible archive, exactly as CA does today.
- **Shared module.** Both call one `resolveEntity(report)` in `dedup.ts` — single source of truth, no per-driver divergence.

### 2.4 The merge / provenance model

- **Never hard-delete.** Canonical row stays `approved`; non-canonical → `archived` with `metadata.duplicate_of = <canonical_id>` and `metadata.dup_sim`. Fully reversible (CA already proves this pattern).
- **Provenance, not erasure.** The canonical record records every source that carried the account (`metadata.also_reported_in = ['nuforc','cufos']`). The user sees "Documented in NUFORC and CUFOS," which *increases* trust, not a silently dropped row.
- **Event clusters** get a lightweight `event_cluster_id` so corroborating-but-distinct accounts render as "N independent reports of this event" — turning the dedup engine's by-product into a feature.

### 2.5 Thresholds + the human-review band

- **Auto-collapse** only at high confidence *with* structured agreement (e.g. cosine ≥0.92 AND same date AND ≤10 km AND text-overlap high). Reprints clear this easily; independent witnesses don't.
- **Review band** (medium confidence) → insert both, record in `duplicate_matches`, surface in the admin queue. Bias toward *keeping* (a false duplicate kept is cheap; a false merge is destructive).
- **Cluster band** (high event-similarity, low text-similarity) → keep both, link as cluster.

### 2.6 Cost & performance

- Embeddings are the *cheap* part: `text-embedding-3-small` ≈ $0.02/1M tokens; embedding the whole corpus is a few dollars, not a few hundred. The expensive class is LLM calls — this design uses **no per-pair LLM**; scoring is vector + arithmetic.
- Blocking keeps comparisons at ~50/report. ANN via existing HNSW index is sub-100ms.

---

## 3. PANEL 2 — the red team attacks Panel 1

**Attack 1 — "The flap killer: this will delete corroboration."**
The Phoenix Lights have hundreds of genuine, distinct witness accounts. A naive cross-source semantic dedup at 0.90 cosine over same date+city *will* collapse them — destroying the exact "you're not alone" signal that is the product. This is the single most dangerous failure mode and Panel 1's 2.1 names it but the thresholds must enforce it.
**Fix that makes it air-tight:** Auto-collapse requires **high textual near-identity**, not just semantic+geo+date. Two accounts can be 0.92 *semantically* (both "triangle, three lights, slow, silent") and still be independent witnesses — semantic similarity alone is a *cluster* signal, never a *merge* signal. Merge requires near-verbatim text overlap (shared phrasing, same first-person detail order) **plus** structured agreement. Everything that's semantically-close-but-textually-distinct routes to **cluster**, never merge. When in doubt, cluster, don't collapse.

**Attack 2 — "A false merge is unrecoverable truth-damage; a false keep is just clutter."**
The cost function is wildly asymmetric and Panel 1 treats the bands too symmetrically.
**Fix:** Bake the asymmetry in. Default action on any uncertainty is **keep + link**, never merge. Auto-merge thresholds set conservatively (tune on a labeled gold set, target precision ≥0.98 on the merge decision, accept lower recall). All merges reversible and audited. We would rather ship 100 reprints than vaporize one real corroboration.

**Attack 3 — "Cross-category dedup will mis-merge across phenomena."**
Removing the category gate (Panel 1, 2.2) invites a UFO report and a meteor/ghost report at the same place/time to merge.
**Fix:** Geo+date is the *blocking* gate (cross-category candidates allowed in), but the *scoring* includes category/phenomenon agreement as a strong feature, and cross-category pairs require correspondingly higher textual identity to merge. Cross-category almost always resolves to *cluster or nothing*, rarely merge — which is correct (a UFO and a fireball at the same time are a fascinating cross-reference, not a duplicate).

**Attack 4 — "Blocking on 200-recent / fingerprint misses the historical long tail."**
The current engine's 200-recent cap is why old events slip; fingerprint requires near-identical titles.
**Fix:** Blocking is **index-backed, not recency-capped** — date-window + geo-bucket + embedding-ANN over the *whole* corpus via the HNSW index, not a `limit(200)` scan. The fingerprint is one blocking key among several, never the only one.

**Attack 5 — "Embedding every report at ingest adds latency and a hard dependency."**
If the embedding service is down, does ingestion stall?
**Fix:** Embedding is **async + non-blocking**: drivers do cheap structured blocking (fp + date + geo) inline for the obvious same-account cases; the embedding-confirm runs in the post-ingest wave and the batch worker. If embeddings are unavailable, ingest proceeds and the wave catches dups later (degraded, not broken) — same resilience posture as the existing narrative backfill.

**Attack 6 — "CUFOS may be mostly scanned PDFs — you're hardening dedup for a source that's the wrong cost class."**
If cufos.org is journal PDFs and scanned catalogues, it's the expensive OCR class, and the dedup work is premature.
**Fix:** Decouple. The dedup hardening is justified *regardless of CUFOS* (NUFORC↔newspaper↔Reddit overlap already exists unguarded). CUFOS structure assessment is a **separate gate** before the CUFOS pipeline; it does not block or justify the dedup work on its own.

**Attack 7 — "Reversibility claims are easy to make and hard to keep."**
A merge that loses the non-canonical's source_url, original_report_id, or distinct details can't be truly reverted.
**Fix:** Archive (status change + metadata pointer), never delete; the non-canonical row stays intact and queryable. Revert restores status and clears the pointer (CA's `--revert` already does this). Provenance is additive on the canonical. Full audit trail in `duplicate_matches` / metadata.

**Attack 8 — "Big-bang dedup over 300k rows is reckless on a live archive."**
**Fix:** Phase it (below). Dry-run + sample-audit before any apply; UFO subset first; reversible throughout; instrument false-merge rate on a labeled gold set before widening.

**Where the panels disagree (founder calls):** (a) auto-merge vs. always-review for cross-source merges; (b) whether event-clustering ships now or is deferred; (c) how aggressively to retro-dedup the existing corpus vs. only guard new ingests.

---

## 4. SYNTHESIS — the air-tight plan

**The locked principle:**

> **Merge only near-identical re-publications of the same account, conservatively and reversibly, with provenance. Everything semantically-similar-but-textually-distinct is corroboration — keep it and cluster it. When uncertain, keep.**

**Locked design decisions:**
- One shared `resolveEntity(report)` used by both the mass-ingest path (pre-insert) and a source-agnostic backfill wave (generalized from `ca-semantic-dedup.ts`).
- Two-stage: index-backed blocking (fp + date-window + geo + embedding-ANN, no recency cap, no category gate) → scoring (embedding cosine + structured agreement + lexical).
- Asymmetric decision: **auto-merge** requires textual near-identity AND structured agreement (precision-first); **review band** inserts both; **cluster band** links distinct witnesses. Default-to-keep.
- Never delete. Canonical + reversible archive + additive provenance ("also reported in …"). Event clusters surfaced as corroboration.

### Phased roadmap

**Phase 0 — Instrument + gold set (days).** Build a small labeled set of known dups (CA reprints), known corroborations (Phoenix Lights), and unrelated pairs. This is how we tune thresholds honestly. Without it we are guessing.

**Phase 1 — Shared resolver + pre-insert guard (the core).** Extract `resolveEntity()` into `dedup.ts`; wire it into the shared mass-ingest flow so all adapters (incl. CUFOS later) get cross-source same-account dedup before insert. Conservative auto-merge; review band to admin queue. Flag-gated, dry-run first.

**Phase 2 — Source-agnostic backfill wave.** Generalize `ca-semantic-dedup.ts` to all sources; run UFO subset first (densest overlap), dry-run → sample-audit → apply, reversible. Then other categories.

**Phase 3 — Event clustering as a feature.** `event_cluster_id` + "N independent reports of this event" surfacing. Turns the engine's by-product into product value (and is the safety valve that lets us be conservative on merging).

**Phase 4 — CUFOS pipeline** (gated separately on the structure assessment), now landing into a system that won't double-count it.

### Success metrics + guardrails
- **Merge precision ≥0.98** on the gold set (the guardrail that protects corroboration). Recall is secondary.
- **Zero** Phoenix-Lights-class events collapsed (explicit regression test).
- Duplicate rate on new CUFOS ingest vs. existing NUFORC (should be high *and caught*, proving the guard works).
- All merges reversible; false-merge reports from admin review trend to ~0.

### Founder decisions (LOCKED — 2026-06-29)
1. **Auto-merge — trust the threshold**, but ship a **dry-run of example proposed merges for founder review** before any apply, to validate precision first.
2. **Event-clustering — ship now** ("N independent reports of this event" in this pass).
3. **Retro-dedup — full historical backfill across all categories**, executed in the panel's safety phases (UFO subset first as the precision gate → then widen to all categories). Same destination, sequenced for safety.
4. **Provenance — surface on the report page now** ("also documented in NUFORC/CUFOS"); revisit styling on the next UI pass.
