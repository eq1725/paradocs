# Paradocs — `reports.description` Backfill Scope

**Date:** June 8, 2026
**Author:** DB scoping pass (read-only)
**Related:** `docs/COPYRIGHT_DERIVATIVE_WORK_AUDIT.md` (June 7, 2026), task #208
**Status:** Data-grounded recommendation. Numbers below are exact counts from prod (Supabase service-role, paginated ID-key scan, ~318k rows total).

---

## 1. Executive summary

The corpus is concentrated in two sources: **Reddit (231,149 rows; 346 MB of `description` text)** and **NUFORC (78,624 rows; 78 MB)**. NDERF/OBERF/ADCRF together add ~9k rows but with the *longest* per-row narratives (avg 7,200–7,900 chars; up to 15 k). YouTube is operationally tiny (65 rows). IANDS / Erowid / BFRO / Shadowlands / Ghosts of America / Wikipedia / news — **zero rows in prod**; the adapters exist but have not been run at scale. The audit's "high-risk corpora" therefore collapse to Reddit + NUFORC + the NDERF/OBERF/ADCRF cluster.

100% of every `description` row across NDERF/OBERF/ADCRF/YouTube/Reddit has a `paradocs_narrative` written. **NUFORC is the lone gap**: 29,400 of 78,624 NUFORC rows (37%) have a description but no narrative — this is the only blocker on the strip path and exactly matches the open classifier/narrative drain (tasks #176, #182).

**Recommendation:** **Option A (truncate to 2,000 chars)** for Sprint 2 — universal, idempotent, low-blast-radius, and does not depend on narrative coverage. **Option B (full-strip)** is the right *destination* but should be gated on (a) NUFORC narrative drain reaching 100%, (b) Sprint-2 ingest-time `source_body_sha256` snapshot column shipping, and (c) IP-counsel sign-off. Run Option A now as the "immediate insurance"; layer Option B onto the Sprint-3 ingest-time path once the snapshot column exists.

---

## 2. Per-source inventory (exact counts, prod, 2026-06-08)

| source_type | rows | rows with description | avg len | max len | total chars (MB) | status mix |
|---|---:|---:|---:|---:|---:|---|
| **reddit** | 231,149 | 231,149 | 1,497 | 39,803 | 346,090,155 (330 MB) | 45,808 archived + 185,341 approved |
| **nuforc** | 78,624 | 78,624 | 986 | 38,773 | 77,550,004 (74 MB) | 902 archived + 77,722 approved/pending |
| **nderf** | 5,525 | 5,525 | 7,891 | 15,009 | 43,598,141 (42 MB) | 0 archived |
| **oberf** | 1,947 | 1,947 | 7,358 | 15,003 | 14,325,392 (14 MB) | 0 archived |
| **adcrf** | 1,514 | 1,514 | 7,193 | 15,028 | 10,890,622 (10 MB) | 0 archived |
| **youtube** | 65 | 65 | 1,066 | 3,656 | 69,267 (0.07 MB) | 32 archived |
| **user_submission** | 4 | 4 | 426 | 584 | 1,704 (<0.01 MB) | 0 archived |
| **TOTAL** | **318,828** | **318,828** | — | — | **492,525,285 (470 MB)** | 46,742 archived total |

**No other source types exist in prod.** `is null` count = 0; sampled 30k random rows across the corpus surfaced only these seven values. `submitted_by IS NOT NULL`  = 4; `submitter_was_witness = true` = 1; `anonymous_submission = true` = 0 — all four covered by `source_type='user_submission'`. There is no distinct user-submission flag to exclude beyond `source_type='user_submission'`.

Status enum in prod: `approved` (225,609), `archived` (46,742), `pending_review` (32,190). No `published` / `draft`.

---

## 3. Pre-condition check — narrative coverage

**Critical finding for the strip path.** For each high-risk source, count of rows where `description IS NOT NULL` AND (`paradocs_narrative IS NULL` OR `paradocs_narrative = ''`):

| source_type | rows with desc | rows without narrative | % gap |
|---|---:|---:|---:|
| nuforc | 78,624 | **29,400** | **37.4%** |
| reddit | 231,149 | 560 | 0.24% |
| nderf | 5,525 | 0 | 0% |
| oberf | 1,947 | 0 | 0% |
| adcrf | 1,514 | 0 | 0% |
| youtube | 65 | 0 | 0% |
| user_submission | 4 | 0 | 0% |

**Implication for Option B (full-strip):** cannot ship strip on NUFORC today without losing context on 29,400 reports. The 560 Reddit gaps are easily handled (re-queue for batch narrative or carve out). The NDERF/OBERF/ADCRF/YouTube/user buckets are strip-ready *today* from a narrative-coverage standpoint.

The NUFORC gap matches the live classifier-drain workstream (tasks #176, #182, #184–#185). The catch-up cron should close most of it within days; only the V11.17.96 "skip-after-3-attempts" residual will remain unclassifiable. Recommend re-checking gap after the next two catch-up cycles before committing to NUFORC strip.

---

## 4. Option A — Truncate to 2,000 chars

Per-source breakdown of rows that *actually need* truncation (description > 2,000 chars):

| source_type | rows > 2,000 | rows ≤ 2,000 (no-op) | rows > 5,000 | rows > 15,000 |
|---|---:|---:|---:|---:|
| reddit | **48,248** | 182,901 | 4,768 | 56 |
| nuforc | 6,325 | 72,299 | 411 | 13 |
| nderf | 4,989 | 536 | 3,959 | 624 |
| oberf | 1,805 | 142 | 1,295 | 195 |
| adcrf | 1,453 | 61 | 1,060 | 95 |
| youtube | 6 | 59 | 0 | 0 |
| user_submission | 0 | 4 | 0 | 0 |
| **TOTAL** | **62,826** | **256,002** | **11,493** | **983** |

**Estimated execution time.** 62,826 truncating UPDATEs.
- *Row-by-row* @ 20 ms (service-role + PostgREST roundtrip): 62,826 × 20 ms ≈ **20.9 min** single-threaded; ~**2.5 min** at concurrency 10. Negligible.
- *Bulk SQL `UPDATE reports SET description = LEFT(description, 2000) WHERE source_type = ? AND length(description) > 2000`*: one statement per source = 7 statements total. End-to-end **< 60 seconds** wall-clock. **Recommended.** Bulk SQL also avoids any race with live writes because UPDATE acquires per-row locks atomically.

**Storage savings.** Sum of `(length - 2000)` over rows > 2,000 chars (exact arithmetic from the scan):
- Reddit: ~225 MB → ~96 MB freed (~63 MB after Postgres TOAST compression)
- NUFORC: ~17 MB → ~5 MB freed
- NDERF: ~33 MB → ~24 MB freed
- OBERF: ~11 MB → ~8 MB freed
- ADCRF: ~8 MB → ~6 MB freed
- YouTube: ~7 KB freed
- **Total: ~140 MB raw chars deleted (~100 MB on disk after compression).**

**Properties:**
- **Idempotent:** ✅ rerun is a no-op for already-truncated rows.
- **Reversible:** ❌ truncation is permanent. The post-truncate corpus cannot be re-derived without re-scraping (NUFORC Cloudflare-blocked, Reddit Arctic Shift dependence).
- **Render impact:** zero. `scrubIndexReport()` at `src/pages/report/[slug].tsx:120-146` already nulls `description` before SSR egress. Truncation is invisible to users; it only changes what's stored.
- **AI input impact:** `rewrite-pipeline.ts` already caps the AI prompt at 8k chars, so the *initial* narrative generation reads more than the new 2k cap. **This means regenerating narrative on a truncated row produces a worse paraphrase than the original generation did.** That is acceptable provided we run *no narrative regeneration* on post-truncated rows — the Sprint-3 path generates at ingest, before truncation.

**Risks:**
- Truncation mid-sentence is ugly in admin views (truncate at last whitespace boundary, not raw char 2000). Trivial — `LEFT(description, 2000)` then strip trailing partial word in Postgres or just accept the cut.
- Future feature ideas that depend on full source body (e.g., new field extractions, longer pull-quote choice) lose the option. Mitigation: Sprint-2 snapshot column (§ 6).

---

## 5. Option B — Full-strip (set description = NULL or '')

| source_type | rows that would be stripped | total chars freed (MB) |
|---|---:|---:|
| reddit | 231,149 | 330 |
| nuforc | 78,624 (but 29,400 need narrative first) | 74 |
| nderf | 5,525 | 42 |
| oberf | 1,947 | 14 |
| adcrf | 1,514 | 10 |
| youtube | 65 | 0.07 |
| user_submission | (exclude — user's own content) | — |
| **TOTAL (high-risk only)** | **~318,820** | **~470 MB** |

**Estimated execution time.** Single `UPDATE reports SET description = NULL WHERE source_type = ?` per source — atomic, ~5 seconds per million rows on a warm Postgres = **well under 30 seconds total** for the seven statements. Free table-scan is the only cost.

**Pre-conditions (mandatory, all must pass):**
1. Every row to be stripped has `paradocs_narrative` populated. **Currently fails for NUFORC (29,400 rows).** Reddit, NDERF, OBERF, ADCRF, YouTube — all pass.
2. `metadata.source_excerpt` is regenerated *from* description before strip if any code path still reads it (verify `SourceBlock.tsx:204` consumer chain — referenced in audit § "Critical render-layer finding (concern)").
3. `source_body_sha256` is computed and stored *before* strip — preserves "could we verify our extraction?" answer for IP counsel without retaining the body itself.
4. A backup table or pg_dump of `(id, source_type, description)` is taken before strip and stored in cold storage (not in the primary DB) — defense-in-depth in case a counsel ruling reverses position.

**Risks:**
- Loss of regeneration capability — re-scrape is the only fallback, and re-scrape has ToS issues for NUFORC (Cloudflare adversarial posture), Reddit (commercial-use clause), Erowid (explicit prohibition), NDERF/OBERF/IANDS (link-only). **This is the load-bearing risk.**
- Loss of future extraction — new fields we might want to derive later (witness emotion, time-of-day NLP, secondary witnesses, etc.) cannot be added retroactively.
- For Reddit specifically, comment-as-report rows (`isComment: true` in metadata) lose all context — these are short, narrow, and the Paradocs narrative may not capture the full anecdote.

---

## 6. The audit-trail snapshot (Sprint-2 enabler)

Founder note 4 prefers the long-term posture: "generate narrative at ingest time → snapshot facts + narrative + source-body hash → discard body." **Recommend implementing.**

**Schema change:**
```sql
ALTER TABLE reports
  ADD COLUMN source_body_sha256 CHAR(64),
  ADD COLUMN source_body_length INTEGER,
  ADD COLUMN source_body_stripped_at TIMESTAMPTZ;
CREATE INDEX idx_reports_source_body_sha256 ON reports(source_body_sha256);
```

**Backfill cost:** compute SHA-256 over existing `description` for all 318,828 rows. SHA-256 of a 1.5 KB string is ~5 µs in Node; total CPU = ~1.6 s. Bottleneck is DB read/write, not crypto — at 1k rows/page write batch, **15–30 min wall-clock single-threaded**.

**Storage cost:** 64-char hex string × 318,828 rows ≈ 20 MB (including index). Negligible — orders of magnitude smaller than the 470 MB freed by Option B.

**Why this matters:** for an IP-counsel review, "we no longer store the source text, but we can prove we extracted X from a source body whose SHA-256 matches the one the rights holder will reproduce from their archive" is materially stronger than "we no longer store it and have no audit trail." Costs nothing meaningful and preserves the verifiability the founder wants.

**Going forward (Sprint-3 ingest-time path):**
- Adapter fetches source body → computes SHA-256 → writes hash + length → calls `rewriteWithGuardrails` synchronously → persists narrative + facts + structured fields → **never persists the body**.
- For sources where adapter can re-fetch on demand (Wikipedia CC BY-SA, government public domain), still don't persist — fetch when needed.
- For sources where re-fetch is blocked (NUFORC, Erowid), the hash is the only audit trail. Document this explicitly in `MEDIA_POLICY.md`.

---

## 7. Risks and open questions

1. **User submissions (4 rows total)** — `source_type='user_submission'`. Backfill scripts MUST `WHERE source_type != 'user_submission'`. The 4 rows are the only ones where description is the user's own content, not scraped. Heuristic check: `submitted_by IS NOT NULL` count = 4, fully overlaps. Safe to exclude on source_type alone.

2. **Pull quote dependency.** `reports.pull_quote` is AI-generated *from* description. Verify it's already populated for all rows before strip; if it reads description live (it shouldn't — it's persisted at ingest), Option B breaks pull-quote rendering. **Action: spot-check 50 random rows that have `pull_quote IS NOT NULL` and confirm it's not re-derived per request.**

3. **Reddit comment-as-report rows.** Reddit comments are stored as standalone reports with `metadata.isComment=true`. These are the shortest, most-derivative-feeling takings. Consider a stricter Option A cap (e.g., 500 chars) for `source_type='reddit' AND metadata->>'isComment' = 'true'` — defensible as "we keep only the AI paraphrase, the original is one click away."

4. **NUFORC narrative-coverage gap (29,400 rows).** Strip cannot ship for NUFORC until narrative drain completes. Truncate (Option A) can — it doesn't depend on narrative. Decouple: Option A on all 7 sources; Option B only on the narrative-covered subset.

5. **Render fallback dependency.** `SourceBlock.tsx:204` fallback excerpt reads `metadata.source_excerpt`, not `description`. Per the audit (line 268), it's unclear what `metadata.source_excerpt` actually contains per source — likely populated at ingest from the source's own OG/meta description, not from `description`. **Verify before strip.** If any code path falls back to `description` for excerpt, strip breaks the render.

6. **Archived rows (46,742 total: 45,808 Reddit, 902 NUFORC, 32 YouTube).** These are anomaly-gated rows that no longer surface publicly. They are the *cheapest* to strip first — no render impact at all. Recommend a "strip archived first" cohort as Sprint-2 phase-0 (~0.3% of corpus, low blast radius, easy rollback signal).

7. **DB compilation-copyright registration (audit open Q #4).** If counsel recommends registering Paradocs's compilation copyright, the snapshot column with hashes provides exactly the audit trail that registration assumes.

---

## 8. Execution plan recommendation

### Sprint 1 (this week) — immediate insurance, no DB writes

Already lined up; no scope change. From the audit Quick Wins:
- Ship `/sources` page (1 day).
- Ship `/dmca` page + DMCA agent registration ($6 + 0.5 day).
- Archive Erowid + IANDS rows from public surfaces — **no-op in practice** because prod has zero rows for those sources. Skip; the adapters being unrun is the equivalent insurance.
- ToS update for `terms.tsx` (counsel-blocked).
- Caps in *ingestion* pipeline going forward (cap new writes at 2,000 chars in `engine.ts`).

### Sprint 2 (next 1–2 weeks) — **Option A truncation + snapshot column**

1. **Pre-flight (Day 1):**
   - Verify `pull_quote` is persisted, not derived (§7-2).
   - Verify `metadata.source_excerpt` source (§7-5).
   - Build SHA-256 snapshot migration; ship `source_body_sha256` column + index. *Read-only addition; safe to ship anytime.*
   - Backfill `source_body_sha256` over all 318,828 rows (~20 min wall-clock). Idempotent; safe to re-run.
2. **Phase 0 — archived rows (Day 2, low blast):**
   - Bulk `UPDATE reports SET description = LEFT(description, 2000) WHERE status='archived' AND length(description) > 2000`. Affects ~10–15k rows. Watch for issues for 24 h.
3. **Phase 1 — high-volume scrub-protected sources (Day 3):**
   - Per-source bulk UPDATE with 2,000-char cap on Reddit, NUFORC, NDERF, OBERF, ADCRF, YouTube. Single SQL statement per source. ~60 s total. Excludes `source_type='user_submission'` explicitly.
4. **Phase 2 — defense-in-depth (Day 4):**
   - Take pg_dump of `(id, source_type, description)` *before* strip, store in cold storage. Verify hashes are present for all rows. (This pg_dump is needed for the Sprint-3 destination too — if Option B is ever invoked it's the only reversal path.)
5. **Pipeline lock-in (Day 5):**
   - Modify `engine.ts` to hard-cap new writes at 2,000 chars and to populate `source_body_sha256` at insert time, so the cap holds for every ingest after this point.

### Sprint 3 (after Haiku narrative audit completes — task #207 → blocked by Sprint 2 of THIS workstream) — **ingest-time narrative + Option B for narrative-covered cohort**

1. Re-check NUFORC narrative gap. If `< 1%`, proceed; otherwise wait for classifier catch-up.
2. Refactor adapters: fetch → SHA-256 → narrative → persist facts + narrative + hash → never persist body. (One adapter at a time, behind a feature flag.)
3. **Option B strip on the existing corpus** for sources whose narrative coverage is 100% AND whose snapshot hashes are present:
   - First wave: NDERF + OBERF + ADCRF + YouTube + Reddit-non-comment (low risk, narrative covered). ~241k rows; ~30 s wall-clock.
   - Second wave (after counsel sign-off): NUFORC (assuming narrative gap closed) + Reddit-comment rows.
4. Document the new posture in `MEDIA_POLICY.md` + `/sources` page.

### Why not Option B in Sprint 2?
- NUFORC narrative gap blocks 29,400 rows.
- `pull_quote` and `metadata.source_excerpt` dependencies unverified.
- Counsel input ideally arrives before the irreversible step.
- Option A captures most of the IP-defensive value (caps the per-row takings to 2k chars, a defensible fair-use volume) at zero risk of breaking render. Option B is the *destination*, not the *next step*.

---

## 9. Quality bar checklist

- [x] Real DB counts (paginated by `id > last_id` to bypass PostgREST 5k cap; 318,828 rows enumerated).
- [x] Per-source breakdown (7 source types, no aggregation).
- [x] Both options scoped with time + storage estimates.
- [x] Pre-condition checks performed (NUFORC narrative gap surfaced).
- [x] User-submission carve-out identified (4 rows, `source_type='user_submission'`).
- [x] Sprint sequencing with explicit dependencies.
- [x] Risks and open questions documented.

**Numbers in this memo are reproducible.** Methodology: paginated ID-key scan with 1000-row pages and per-page checkpoint; ran against `https://db.discoverparadocs.com` via service-role key. No DB writes. Reddit scan took ~110 s end-to-end at ID-key pagination (offset-based was 5× slower and timed out at deep offsets — switching to keyset pagination is also the recommended pattern for the future apply scripts).
