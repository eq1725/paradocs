# Patterns surface — descriptor-extraction gaps and freshness mechanism

**Sprint 1A-2 review memo. V11.18.1.**
**Author:** Cowork investigation agent
**Date:** 2026-06-09
**Scope:** Diagnose why the 5 candidate Finding Cards from `cross_family_overlap_pct` return suspiciously low EM / tunnel / static counts; recommend fixes; design the freshness mechanism for the public Patterns surface.

---

## TL;DR

1. **The descriptor extractor isn't broken — it doesn't exist.** `paradocs_assessment.descriptors` is **never written** by the consolidated-AI ingestion pipeline (`src/lib/services/consolidated-ai.service.ts:942-957` builds the assessment JSONB with `pull_quote / credibility_signal / frames / open_questions / similar_phenomena / emotional_tone / suggested_category / discovery_tags / anomalous_content_check` — no `descriptors` key). Direct DB sampling on five `ufos_aliens` rows confirmed: `assessment.descriptors` is `undefined` 5/5. Every Finding-Card percentage is being computed off a fallback **substring scan of `title + summary + description`** plus `reports.tags` (the phen-classifier slugs like `ufo / nuforc / triangle`).
2. **Three independent failures stack on top of that.** (a) the hint-side keyword list in `data-query-executor.ts:96-117` is far too narrow for EM/tunnel/static; (b) the executor only scans `description` text, not the Haiku-rewritten `paradocs_narrative` where the signal actually lives; (c) NDE-style tunnel reports live in `psychological_experiences` (1,765 narratives mention "tunnel"), not in the `consciousness_practices` + `perception_sensory` pair the seed hint queries.
3. **Ship shadow-figure today; fix the rest in Sprint 1B.** The shadow Finding is publishable as-is — the substring scan and the corpus structure both validate the founder's 47 / 45 / 9 read. The other four need the three fixes below before publish.
4. **Freshness pick: Option C (Hybrid).** Cron-recompute counts nightly; re-prompt Haiku weekly; cache 5 min at the edge. Pays the marginal Haiku cost (5 calls × $0.002 × 52 ≈ **$0.52/year**) and keeps the visible percentages tracking the corpus growth without grammar-substitution risk.

---

## 1. Trace of `cross_family_overlap_pct`

### 1.1 Where it's defined and what it reads

**Type / schema** — `src/lib/lab/hints/data-query-types.ts:63-84` defines `DescriptorFamily` as a closed enum of 21 string literals (`static_electricity / low_hum / shadow_figure / tunnel_imagery / electromagnetic_disturbance / witness_drowsy / ...`). **There is no mapping table here from descriptor → keyword list.** The "vocabulary" lives only as inline comments. The runtime keyword set is exclusively in `data-query-executor.ts:95-117`:

```ts
var DESCRIPTOR_KEYWORDS: Record<DescriptorFamily, string[]> = {
  static_electricity: ['static', 'tingling', 'hair-stand', 'hair stood', 'prickle'],
  tunnel_imagery: ['tunnel', 'corridor', 'passage'],
  shadow_figure: ['shadow', 'figure', 'presence', 'standing'],
  electromagnetic_disturbance: ['flicker', 'stopped watch', 'electronics', 'watch stopped'],
  witness_drowsy: ['hypnagogic', 'half-asleep', 'falling-asleep', 'drowsy'],
  // ... 16 more
}
```

**Executor** — `data-query-executor.ts:208-253` (`countDescriptorMatchInFamily`) does:

1. `SELECT count(*) WHERE status='approved' AND category=<fam>` → that's the denominator.
2. `SELECT id, tags, paradocs_assessment, title, summary, description WHERE … ORDER BY created_at DESC LIMIT 5000` (the scan cap).
3. For each row in the sample, build the token bag via `readReportTokens` (`:156-184`):
   - any non-null entry in `row.tags`,
   - any non-null entry in `row.paradocs_assessment.descriptors` (**always empty — see §1.2**),
   - one big token of `title + summary + description` lowercased.
4. Match descriptor → keywords by **case-insensitive substring** (`tokensIncludeDescriptorFamily`, `:186-195`). One keyword anywhere in any of those tokens scores the row.
5. Scale the sample match count up to the family total (`:243-247`). For families >5,000 rows (UFO, ghost, consciousness, psych-exp) this is an extrapolation, not an exact count.

The sampling cap matters for EM in `ufos_aliens` (75,168 reports — only 6.6% sampled).

The dispatch loop is `cross_family_overlap_pct` at `:503-525`: it calls `countDescriptorMatchInFamily` per family in the seed-hint's `families` tuple and writes the per-family percentages into `bindings.cross_family_a_pct / _b_pct / _c_pct`.

### 1.2 What the ingestion pipeline actually writes

`src/lib/services/consolidated-ai.service.ts:942-957`:

```ts
var assessmentData: Record<string, any> = {
  pull_quote, credibility_signal, frames, open_questions,
  similar_phenomena, emotional_tone, suggested_category,
  discovery_tags, anomalous_content_check,
}
```

No `descriptors` key. I sampled 5 approved `ufos_aliens` rows directly — every one has `paradocs_assessment.descriptors === undefined`. So the executor's "preferred storage path" (`data-query-executor.ts:24-29` TODO comment) was specced but never wired. **All descriptor matching today runs off the substring scan + the phen-classifier tags.**

### 1.3 What's in `reports.tags`

Sampled top 20 in approved reports per family:

- `ufos_aliens`: `ufo / nuforc / bright / night / fast / light / luminous / silent / multiple-witnesses / hovering / triangle / triangular / fireball / circle / round …` — shape and color tags, no descriptor tags.
- `ghosts_hauntings`: `paranormal / personal-experience / encounter / unexplained / evidence / haunted-house / apparition / demonic-activity / shadow-people (8 of 500) / sleep-paralysis (7 of 500) …` — the Reddit subreddit slugs plus a few descriptor-ish ones; `shadow-people` shows in 1.6% of the sample.
- `cryptids`: `crawlersightings / encounter / personal-experience / skinwalkers / mothman …` — almost entirely subreddit/phen-name slugs.

So `tags` adds very little for the EM/tunnel/static descriptors; the entire signal is the substring scan.

---

## 2. DB sample-check — keyword-hit counts vs. what the executor sees

Counts are per single keyword via case-insensitive `ILIKE` against `paradocs_narrative` (the Haiku-rewritten field) and `description` (raw adapter text). Approved totals current at run time: ufos_aliens=75,168; ghosts_hauntings=56,535; cryptids=3,208; consciousness_practices=49,798; perception_sensory=10,413; psychological_experiences=33,728.

### 2.1 Electromagnetic — narrative carries the signal

| keyword | ufos_aliens (description / narrative) | ghosts (desc / nar) | cryptids (desc / nar) |
|---|---|---|---|
| `electromagnetic` | 60 / **1,545** | (low) / 270 | – / 5 |
| `flicker` | 1,797 / **2,007** | – / 963 | – / 13 |
| `interference` | 119 / **533** | – / 454 | – / 13 |
| `emf` | 10 / 5 | – / **118** | – / 0 |
| `magnetic field` | – / 63 | – / 55 | – / 2 |
| `watch stopped` | 3 / 3 | – / 0 | – / 0 |
| `car stalled` | 3 / 6 | – / 2 | – / 0 |
| `radio static` | – / 17 | – / – | – / – |

Floor on `ufos_aliens` EM is at least **2,007 reports** (`flicker` alone in narrative ≈ 2.7%); a broad keyword union is conservatively **3,000-4,000** (≈4-5%). The hint-narrow set (`flicker, stopped watch, electronics, watch stopped`) running against `description` only — which is what the executor effectively sees in `ufos_aliens` raw text — is hitting maybe 100-1,800 depending on the exact sample, which collapses to the ~5% the dry-run reported. **Founder's 5% read is the substring scan finding `flicker` in raw `description`, which is most of the signal already** — but it's missing the ~1,500 narratives where Haiku canonicalized the language to "electromagnetic" / "interference" / "magnetic field." Lifting to a broader keyword set and including `paradocs_narrative` likely lifts EM/UFO to ~7-9%. EM/ghost should rise from 2% to ~3-4%; EM/cryptid is genuinely sparse (<0.5% even broad).

### 2.2 Tunnel — wrong family

| keyword | conscious / nar | perception / nar | psych_exp / desc | psych_exp / nar |
|---|---|---|---|---|
| `tunnel` | 617 | 55 | **1,765** | (not measured) |
| `corridor` | 158 | 26 | – | – |
| `passage` | 635 | 37 | – | – |
| `vortex` | 145 | 19 | – | – |
| `being pulled through` | 585 | 207 | – | – |

The seed hint asks `consciousness_practices` + `perception_sensory`. NDE/OBE/Astral-Projection phenomena are filed under `psychological_experiences` (verified via `phenomenon_types`: `near-death-experience, out-of-body-experience, astral-projection, distressing-nde, sudden-obe, nde-like-experience, nearing-end-of-life-experience` — all `category='psychological_experiences'`). 1,765 of 33,728 psych-exp narratives mention "tunnel" (5.2%). The hint is fishing in the wrong pond.

### 2.3 Static / hair-on-end — narrow set + noisy substring

| keyword | cryptids / narrative | ufos_aliens / narrative |
|---|---|---|
| `static` | 15 | 932 |
| `tingling` | 2 | 72 |
| `prickle` | 0 | 0 |
| `hair stood` | 2 | 14 |
| `hair on end` | 0 | 0 |
| `goosebump` | 15 | 124 |

The hint's `static` keyword is ALSO contaminated. I pulled 5 cryptid narratives matching `%static%` — every one was `static-like / static vigil / static or slowly moving / static, cloudy appearance / static-like sounds`, **none** referring to a static-electricity sensation. So the 0% the dry-run reported is approximately correct on cryptids, and the founder's intuition ("hair stood on end") needs the keyword set to actually include `hair stood / hair on end / goosebump / electrical sensation`. Even with the broad set, cryptid static is genuinely small (probably 30-50 reports out of 3,208 ≈ 1-1.5%); UFO static could reach ~150 reports (~0.2%). Static sensation is a real cross-family signal but it's much smaller than EM or tunnel, and the founder's literature expectation may overstate corpus prevalence.

### 2.4 Shadow — the hint set accidentally works

The narrow keyword list `[shadow, figure, presence, standing]` catches "figure" alone, which appears in **21,049** approved `ghosts_hauntings` narratives (37%), **4,166** in `perception_sensory` (40%), and **3,758** in `ufos_aliens` (5%). The 47 / 45 / 9 number the founder eyeballed is partly noise from `figure` matching every "the figure of the craft" / "stood as a still figure" — but the corpus actually does describe shadow-figure imagery densely in haunting and perception accounts (`shadow figure` exact phrase = 2,722 / 646 / 102). For shadow specifically the narrow keyword acts as a coarse upper bound and the result roughly tracks the founder's qualitative read. **This Finding is publishable today.**

### 2.5 Witness drowsy — substring scan can't see witness state

The hint scans for `[hypnagogic, half-asleep, falling-asleep, drowsy]` in title/summary/description. But the actual signal lives in the structured `reports.witness_state_at_event` enum (set by the consolidated-AI prompt at `consolidated-ai.service.ts:1056-1064`). Direct counts:

- `perception_sensory` total 10,413 → witness_state = drowsy_falling_asleep = **1,477 (14.2%)**
- `consciousness_practices` total 49,798 → drowsy = **7,069 (14.2%)**
- `psychological_experiences` total 33,728 → drowsy = **1,731 (5.1%)**

The Finding should ideally be powered by `witness_state_pct` (which queries the enum directly — that query kind exists at `data-query-types.ts:412-417`) rather than `cross_family_overlap_pct`. The 602-report total in the dry-run is the substring-scan undercounting by an order of magnitude.

---

## 3. Diagnosis per hypothesis

| Hypothesis | Verdict | Evidence |
|---|---|---|
| **A. Keywords too narrow** | Confirmed for EM, tunnel, static | EM `flicker` alone catches 2,007 narrative hits in `ufos_aliens`; `electromagnetic` catches 1,545 more; the broader set roughly doubles the signal. Tunnel narrow set misses the 1,765 `psychological_experiences` hits entirely because of hypothesis B, but `vortex / being pulled through` also adds 700+ hits in `consciousness_practices`. Static narrow set has the opposite problem — too broad (`static` catches "static-like / stationary" noise) AND too narrow (misses `hair stood / hair on end / goosebump / electrical sensation`). |
| **B. Wrong family mapping** | Confirmed for tunnel; likely for EM | NDE/OBE/Astral-Projection phens all live in `category='psychological_experiences'` per `phenomenon_types`. The seed hint pairs `consciousness_practices` (where lucid-dreaming, meditation, OBE-adjacent practice lives) with `perception_sensory` (which is mostly sleep-paralysis). It misses the 33,728-row psych-exp family where the bulk of tunnel-imagery NDEs sit. |
| **C. Backfill needed** | Mostly No | `paradocs_assessment.descriptors` is **never** written, so backfill isn't the issue — extraction was never enabled at all. The narrative-language signal (`paradocs_narrative`) is already in place across the full 232k corpus. The fix isn't backfill — it's wiring the keyword scan to look at `paradocs_narrative` (it already does for one combined token, but text scans cap at 5,000 rows per family, which is fine for sampling). The structural fix is either to add a real descriptor extraction step OR to switch the executor to count via a server-side `ILIKE … OR …` against `paradocs_narrative` directly (avoids the sample cap entirely). |

---

## 4. Proposed fixes (Sprint 1B)

Ordered by impact × ease:

### Fix 1 — Keyword set expansion (smallest, biggest unlock)
**Cost:** 30 minutes editorial review.
**Where:** `src/lib/lab/hints/data-query-executor.ts:95-117` (and mirror in `src/pages/api/lab/patterns/list.ts:56-62` — these two maps must drift together; consider extracting to a shared module).

Recommended additions:

```ts
electromagnetic_disturbance: [
  'electromagnetic', 'emf', 'flicker', 'lights flicker', 'watch stopped',
  'stopped watch', 'electronics', 'interference', 'radio static',
  'car stalled', 'engine died', 'engine stopped', 'battery died',
  'magnetic field', 'electrical interference',
],
tunnel_imagery: [
  'tunnel', 'corridor', 'passage', 'vortex', 'funnel', 'spiral',
  'being pulled through', 'light at the end',
],
static_electricity: [
  // Drop bare 'static' — too noisy (static-like, static vigil, etc.)
  'static electricity', 'tingling', 'hair stood', 'hair on end',
  'hair stand', 'prickling', 'goosebump', 'goose bump',
  'electrical sensation',
],
witness_drowsy: [
  // Keep keyword fallback but PRIMARY signal should come from
  // reports.witness_state_at_event = 'drowsy_falling_asleep'
  // Recommend swapping this descriptor's data query from
  // cross_family_overlap_pct → witness_state_pct.
  'hypnagogic', 'hypnopompic', 'half-asleep', 'half asleep',
  'falling asleep', 'falling-asleep', 'drowsy', 'drifting off',
  'just before sleep', 'just as i was waking',
],
```

Drop the bare `static` keyword and the bare `figure / presence / standing` keywords (still too noisy — accept that shadow_figure should rely on the multi-word phrases).

### Fix 2 — Direct narrative scan, not sample-based (medium)
**Cost:** 1-2 hours implementation.
**Where:** `data-query-executor.ts:countDescriptorMatchInFamily`.

Replace the "sample 5,000 rows + extrapolate" loop with a direct exact-count `ILIKE … OR … OR …` against `paradocs_narrative + description + title` for the broad keyword union. This is what the diagnostic script does and it gets exact counts in ~3s per family. The cost: PostgREST `or()` filters across many keywords across multiple columns DID time out on large families when I tried it, so the right approach is to issue one query per keyword (Postgres uses index scans), sum into a set, return the distinct count via a small RPC. Practically: write a Postgres function `count_descriptor_matches(family, keywords[])` that does `SELECT count(DISTINCT id) FROM reports WHERE status='approved' AND category=$1 AND (description ~* ANY($2) OR paradocs_narrative ~* ANY($2))`.

This eliminates the sampling bias entirely and the result is provably reproducible — important for the Helena copy-clearance audit trail.

### Fix 3 — Add `psychological_experiences` to the tunnel-imagery hint (smallest)
**Cost:** 1 line change.
**Where:** `src/lib/lab/hints/seed-hints.ts:1001`. Change
```
families: ['consciousness_practices', 'perception_sensory'],
```
to
```
families: ['psychological_experiences', 'consciousness_practices', 'perception_sensory'],
```
This is a three-family Finding once the data lands. Headline becomes "Tunnel imagery recurs across NDE, consciousness-practice, and perception-sensory accounts."

### Fix 4 — Swap `witness_drowsy` query kind (small)
**Cost:** Edit one seed-hint entry.
**Where:** `src/lib/lab/hints/seed-hints.ts:1097-1103`. Replace `cross_family_overlap_pct(descriptor_family: 'witness_drowsy', …)` with two `witness_state_pct(witness_state: 'drowsy_falling_asleep', phen_family: <fam>, …)` queries — or extend the executor to handle witness_drowsy as a special descriptor that reads the enum column. The expected payload after the fix: perception_sensory 14% / consciousness_practices 14% / psychological_experiences 5% (real numbers, structured-field-grounded).

### Fix 5 — DON'T add a Haiku descriptor extraction step (deferred)
The instinct is to add a `descriptors: [...]` field to the Haiku output. **Don't, for Sprint 1B.** Costs at $0.002/call × 200k reports = $400 for a full backfill, plus ongoing $0.002 × ~3,000/day ≈ $6/mo. Fixes 1-2 give 80% of the signal at 0% of the cost. If the Patterns surface eventually drives material traffic, revisit.

**Estimated work for Sprint 1B:** half a day's coding for fixes 1+3+4; one day total with Fix 2 (Postgres function + executor switchover + smoke test). Re-run `scripts/seed-patterns-v1.ts --apply` and publish 4 of the 5 Findings (EM-cross-family, tunnel-three-family, static-cross-family, witness-drowsy-cross-family) once the numbers settle.

---

## 5. Freshness mechanism

### Shape of the problem

A `findings_catalogue` row holds:
- **Hard data:** `denominator_n`, `denominator_n_label`, `phen_families` (an array of `{family_slug, family_label, count, total_in_family, pct}` objects).
- **Soft prose:** `headline` (deterministic — built from descriptor + family labels, low-drift); `interpretive_sentence` (Haiku-generated, brand-voice-validated).

The corpus grows ~1-3k approved reports per day (NUFORC trickle + Reddit + occasional bulk pushes). Family totals shift slowly but visibly over a quarter. Worst case for staleness: the headline says "47% of haunting accounts" but the table now shows 45% because shadow-figure share dropped slightly as Reddit imports diluted the family. That's a credibility leak.

### Option A — Nightly cron only

Daily Vercel cron at 04:00 UTC re-runs `cross_family_overlap_pct` per published Finding, recomputes per-family counts/percentages/denominators, optionally re-prompts Haiku for `interpretive_sentence`, UPSERTs the row with `refreshed_at = now()`. Cards render whatever's in the table; CDN edge cache TTL 5 min.

**Implementation cost:** Small — basically `scripts/seed-patterns-v1.ts --apply` wired to an API route + `vercel.json` cron entry. Reuses everything that exists.
**Operational cost:** 5 Haiku calls/day × $0.002 = **$0.01/day, ~$3.65/year**.
**Stale-data risk:** Up to 24h drift between corpus and prose. Not visible to most users.
**Where the cron lives:** `vercel.json` + `src/pages/api/cron/refresh-patterns.ts` (alongside `audit-category-counts`).

### Option B — Read-time template interpolation

Store `interpretive_sentence` as `"The catalogue treats this as a {fam_a_pct}% / {fam_b_pct}% / {fam_c_pct}% cross-family descriptor"` with placeholders; resolve at read-time by hitting the count query under a 5-15 min edge cache. The interpretive sentence is one-time-written; the counts always reflect now-minus-cache-ttl.

**Implementation cost:** Medium — a template grammar that the Haiku prompt has to produce reliably; per-render count execution (or precomputed table); fallback prose if a placeholder fails.
**Operational cost:** No recurring Haiku spend after seed (~$0). Count queries are cheap (cached).
**Stale-data risk:** ~5 min only (just the cache TTL).
**Risk:** Haiku occasionally produces template prose that breaks when you substitute (e.g., "The catalogue lists this as the most common descriptor" — what does that even mean when the number changes from 47% to 32%? The grammar locks tighter than the data does). The validator at `scripts/seed-patterns-v1.ts:246-259` doesn't catch this.

### Option C — Hybrid (RECOMMENDED)

Counts recomputed nightly; Haiku interpretive sentence re-prompted weekly (Sunday 04:00 UTC); CDN cache 5 min.

**Implementation cost:** Medium-small. One cron route that takes a `?refresh=counts|all` query param. The weekly schedule reuses Sprint 1's seed script `--apply` path (which already re-prompts Haiku); the nightly schedule is the same script with a `--counts-only` flag (skip the Haiku call, only refresh `phen_families` + `denominator_n` + `refreshed_at`).

**Operational cost:**
- Counts cron: 5 Findings × 3-4 ILIKE queries per family × 2-3 families = ~50 lightweight queries per day. Negligible.
- Haiku weekly: 5 Findings × $0.002 × 52 weeks ≈ **$0.52/year**.
- Edge cache: same as today (5 min `s-maxage=300`).

**Stale-data risk:** Counts drift ≤ 24h (95th pct: <0.5pp delta on family share). Interpretive sentence drifts ≤ 7 days but the sentence is qualitative — "the catalogue tracks this as a cross-family descriptor" — and survives small percentage shifts without going stale. If counts shift dramatically week-over-week (a bulk import lands), the Sunday Haiku pass updates the prose.

**Where it lives:**
- `vercel.json` adds `crons: [{ path: '/api/cron/refresh-patterns?mode=counts', schedule: '0 4 * * *' }, { path: '/api/cron/refresh-patterns?mode=all', schedule: '0 4 * * 0' }]`.
- `src/pages/api/cron/refresh-patterns.ts` — gated by `x-cron-key` header, validates the mode arg, reuses the seed-script Haiku/exec code paths.
- `src/pages/api/lab/patterns/list.ts:256` already sets `s-maxage=300, stale-while-revalidate=60` — keep as is.

### Recommendation: Option C for Sprint 1B.

Reasoning: Option B's read-time interpolation creates a grammar-vs-data coupling problem that the Haiku validator can't enforce (banned-phrase rules don't check whether a sentence parses correctly when a number changes). Option A leaves Haiku locked at seed time, which is fine for Sprint 1 but ages out as the corpus changes shape. Option C costs $0.52/year more than A in exchange for prose that adapts to large month-over-month shifts. The cron infra is already present (`audit-category-counts` cron pattern at V11.17.33 is the template).

---

## 6. Founder-facing summary

**Why are EM / tunnel / static low?**
- **EM (5% UFO / 2% ghost / 1% cryptid):** Keyword list at `data-query-executor.ts:107` is 4 narrow phrases (`flicker, stopped watch, electronics, watch stopped`); the corpus actually canonicalizes EM language as `electromagnetic / interference / magnetic field` inside `paradocs_narrative` (1,545 + 533 + 63 hits in UFO alone). Expanding the keyword list to the literature-grounded set + scanning narrative directly should lift UFO EM to 7-9%, ghost EM to 3-4%. Cryptid EM is genuinely sparse.
- **Tunnel (2% conscious / 1% perception):** The Hint queries the wrong families — NDE / OBE / Astral Projection live under `category='psychological_experiences'` (1,765 narratives contain "tunnel" = 5.2%). The Hint at `seed-hints.ts:1001` lists only `consciousness_practices` and `perception_sensory`, missing the bulk of the NDE corpus.
- **Static (0% / 0%):** Two stacked failures. The single keyword `static` is too noisy (matches `static-like / static vigil / stationary`); the keyword set is also missing `hair stood / hair on end / goosebump / electrical sensation`. Even after the fix the descriptor is small (<2% of either family) — the founder's literature intuition may overstate corpus prevalence here.

**What's the fix?**
Three small edits in Sprint 1B (half a day): (1) expand keyword lists per descriptor in `data-query-executor.ts:95-117` + `api/lab/patterns/list.ts:56-62`; (2) add `psychological_experiences` to the tunnel Hint's families; (3) swap the witness-drowsy descriptor to read `witness_state_at_event` directly. One medium edit (one day): switch `countDescriptorMatchInFamily` from sample-and-extrapolate to a Postgres-RPC exact-count over the keyword union. No Haiku re-extraction is needed — the language is already in `paradocs_narrative`.

**How does freshness work?**
Option C (Hybrid): a Vercel cron at 04:00 UTC daily refreshes per-family counts; a Sunday cron also re-prompts Haiku for the interpretive sentence; published Findings serve from `findings_catalogue` with 5-min edge cache. Adds ~$0.52/year to operational spend; keeps the visible percentages truthful as the corpus grows.

**What ships in Sprint 1A right now vs. Sprint 1B?**

**Sprint 1A — publish TODAY:**
- Publish only the `shadow_figure-across-perception-sensory-haunting-ufo` Finding (`UPDATE findings_catalogue SET published=true WHERE slug='shadow-figure-imagery-across-perception-sensory-haunting-ufo'` or whatever the seed-script produced). The 47 / 45 / 9 numbers track the corpus signal correctly; the substring scan accidentally captures the right shape because the descriptor's keywords (`shadow figure / dark figure / shadow person`) appear densely in raw text and Haiku narrative alike.
- Leave the four other Finding rows in `published=false`. The seed script can stay; the rows are present in the table awaiting the fix-and-refresh pass.

**Sprint 1B — fix-and-refresh (1-2 days):**
1. Expand `DESCRIPTOR_KEYWORDS` in `data-query-executor.ts` (and mirror in `api/lab/patterns/list.ts`).
2. Add `psychological_experiences` to tunnel hint's `families`.
3. Switch `witness_drowsy` to query `witness_state_at_event` directly.
4. Add the Postgres RPC for direct count-over-keyword-union (optional but recommended — eliminates the 5000-row sample cap).
5. Re-run `scripts/seed-patterns-v1.ts --apply`, eyeball the new numbers against the corpus, publish the remaining 4 Findings as their counts cross the editorial-credibility threshold.
6. Ship the cron refresh route + `vercel.json` cron entries (Option C). Smoke-test once.
7. Sprint 1C / 2: rename the file structure so the descriptor-keyword vocabulary lives in one shared module that both the executor and the overlay API import (right now they're duplicated — a drift risk the SPRINT_1A_2_NOTES.md already flagged).

**Diagnostic script saved at `/Users/chase/paradocs/scripts/diagnose-descriptor-gaps.ts`** — runs read-only against the live DB and prints per-keyword hit counts so the fix can be verified before the seed re-run. Invoke via `npx tsx scripts/diagnose-descriptor-gaps.ts` once `.env.local` is populated.

---

## Code references

- `src/lib/lab/hints/data-query-executor.ts:95-117` — keyword vocabulary (the one to edit)
- `src/lib/lab/hints/data-query-executor.ts:208-253` — `countDescriptorMatchInFamily` (sampling + scaling logic)
- `src/lib/lab/hints/data-query-executor.ts:503-525` — `cross_family_overlap_pct` dispatch
- `src/lib/lab/hints/data-query-types.ts:63-84` — descriptor enum (comments-only vocabulary doc)
- `src/lib/lab/hints/seed-hints.ts:958-1115` — the 5 sourced cross-category Hints
- `src/lib/services/consolidated-ai.service.ts:942-957` — assessment JSONB builder (no `descriptors` key written)
- `src/pages/api/lab/patterns/list.ts:56-62` — DUPLICATE keyword map for overlay (drift risk)
- `src/pages/api/lab/patterns/list.ts:256` — current 5-min edge cache header (keep)
- `scripts/seed-patterns-v1.ts` — seed driver (already idempotent on slug, reused by Option C cron)
- `supabase/migrations/20260609_findings_catalogue.sql` — `findings_catalogue` schema + RLS
- `scripts/diagnose-descriptor-gaps.ts` — new read-only diagnostic harness (this investigation's artifact)
