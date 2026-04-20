# Session B1.5 — Continuation Prompt

> Paste this message verbatim into a fresh session to resume the ingestion-adapter QA/QC work.

---

You are continuing Session B1.5 — Ingestion Adapter QA/QC for the Paradocs anomalous-experiences platform. The prior session hardened NDERF and OBERF adapters and smoke-tested them with 3 OBERF reports. **We are NOT starting mass ingestion (Session B2) yet.** B1.5 must complete QA/QC across all remaining adapters first.

**Read these two files before doing anything else:**

1. `B1_5_QA_QC_NOTES.md` — current state of NDERF + OBERF work, acceptance evidence, known issues, the B1.5 protocol, and the priority list of remaining adapters.
2. `PROJECT_STATUS.md` — scroll to the **Session B1.5** section (after B1). Also note the overall ingestion status in Session 10's row.

**B1.5 Protocol — apply to each adapter in turn:**

1. Ingest **5 reports per category/archive** via the admin endpoint:
   ```bash
   # Ensure the service role key is loaded
   export $(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' /sessions/zen-upbeat-carson/mnt/paradocs/.env.local | xargs)

   # Use the UUID (not slug) of the data source
   curl -X POST -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     "http://localhost:3000/api/admin/ingest?source=<SOURCE_UUID>&limit=5"
   ```

2. Run the generic verification SELECT in `B1_5_QA_QC_NOTES.md` (section "Generic verification SELECT template"), adjusting columns to what the adapter actually writes.

3. For any row that comes back sparse or all-null in key fields, fetch the live source page (curl with a full desktop UA, OBERF/NDERF filter short UAs) and diff expected vs. extracted to determine whether it's an **extractor bug** (fixable) or a **source-data gap** (acceptable — document and move on).

4. Fix bugs, re-ingest the same 5 reports to confirm, then **log a new `## <Adapter> — B1.5 Results` section in `B1_5_QA_QC_NOTES.md`** before moving on.

5. Only after the current adapter passes, proceed to the next one in the priority list.

**Start with NDERF + OBERF re-verification** (priority 0), then work through the priority list in `B1_5_QA_QC_NOTES.md`:

- Priority 0: NDERF + OBERF — confirm current state matches notes. NDERF: confirm 5 fresh rows have populated `case_profile.nderf_tier`, public `ndeType = "Near-Death Experience"`, and date/consciousness/emotion fields. Decide whether to DELETE the stale pre-neutralization rows (`bill_c_nde_13460`, `kelly_g_nde_13461`) or let re-ingest overwrite them. OBERF: pull 5 per archive across the remaining 7 archive types (STE, DBV, NDE-like, Pre-Birth, Prayer, Dream, Other) — not just OBE/SOBE.
- Priority 1: IANDS — check for a tier concept similar to NDERF "Exceptional" and neutralize if present.
- Priority 2: BFRO — verify Class A/B/C classification lands somewhere queryable and geo extraction works.
- Priority 3: NUFORC — 5-report test; verify parsing-strategy fallback behavior.
- Priority 4: Reddit V2 — Arctic Shift API; if the sandbox blocks it, run the 5-report test locally or defer.
- Priority 5: YouTube — requires `YOUTUBE_API_KEY`; confirm `yt-video-` vs `yt-comment-` ID prefix separation.
- Priority 6: Erowid — confirm substance-to-category mapping and 200-char quality filter.

**Critical ground rules:**

- **No mass ingestion this session.** Mass ingest is Session B2, to be kicked off in a fresh session only after B1.5 is fully signed off.
- **No date cutoff** on any adapter. Ingest every available report; undated rows are acceptable and simply won't surface in date-filtered searches. (The prior session summary mis-cited a "Stop at 2019" policy — that is not current.)
- **Always use source UUIDs, not slugs**, when hitting `/api/admin/ingest` — the engine does `.eq('id', sourceId)` and rejects non-UUID strings.
- **Always use a full desktop User-Agent** when curl'ing OBERF/NDERF directly for page inspection — short UAs return 226-byte stubs.
- **Typecheck only the two adapter files** to avoid noise from pre-existing `GenericStringError` drift in `scripts/pipeline-validate.ts`:
   ```bash
   npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "nderf\.ts|oberf\.ts|iands\.ts|bfro\.ts|nuforc\.ts|reddit-v2\.ts|youtube\.ts|erowid\.ts"
   ```

**End-of-session requirements:**

Before closing B1.5, update these docs:
- `B1_5_QA_QC_NOTES.md` — one `## <Adapter> — B1.5 Results` section per adapter touched, plus a final "B1.5 Sign-off" section confirming each adapter is cleared for B2.
- `PROJECT_STATUS.md` — update Session B1.5 section, Session 10 row, and Cross-Feature Notes table with a B1.5 completion entry.
- `HANDOFF_INGESTION.md` — append a "B1.5 QA Pass" subsection summarizing what changed and confirming readiness for B2.
- Write `B2_CONTINUATION_PROMPT.md` — the handoff prompt for the Session B2 mass-ingestion session.

First action when you resume: read `B1_5_QA_QC_NOTES.md`, then ask which priority adapter to start with (or confirm Priority 0 NDERF/OBERF re-verification).
