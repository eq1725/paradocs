# B0.1 — B1.5 Smoke Test Checklist

**Status:** Ready to execute · Chase action
**Spec:** MVP_EXECUTION_PLAN.md § B0.1 · B1_5_QA_QC_NOTES.md § 7
**Gates:** B2.1 (NDERF/OBERF mass ingestion) and all downstream B2.x

Tests every ingestion adapter against live source sites at small scale (5 reports per type per adapter) and verifies the DB state matches the spec. Once all green, mass ingestion is safe to start.

---

## Prerequisites

Before running:

1. **Migrations applied to staging** (or wherever you're testing against):
   - `20260516_tier_design_v2.sql`
   - `20260516_user_notifications.sql`
   - `20260516_report_type_enum.sql`
   - `20260516_paradocs_cost_log.sql`
   - `20260516_source_takedown_log.sql`
   - `20260414_nde_family_taxonomy.sql` (if not already applied)

2. **Environment variables in `.env.local`:**
   - `NEXT_PUBLIC_SUPABASE_URL` (point at staging, not prod)
   - `SUPABASE_SERVICE_ROLE_KEY` (matching the URL above)
   - `ANTHROPIC_API_KEY` (for paradocs_narrative generation)
   - `YOUTUBE_API_KEY` (only if testing YouTube)

3. **Run from project root:** `cd /Users/chase/paradocs`

4. **Decide:** test against staging (recommended — no production data pollution) OR against prod (real verification but inserts real rows that need cleanup).

---

## Execute

### Quick path — run all adapters at once

```bash
npx tsx scripts/b1-5-smoke-test.ts
```

Skips YouTube by default. ~3-10 minutes depending on source response times. Outputs structured per-adapter PASS/FAIL/WARN findings + a JSON report file in the project root.

### Adapter-by-adapter (recommended for first run)

Lets you spot-check between adapters. Order matches the B1_5_QA_QC_NOTES.md priority:

```bash
# B0.1a — NDERF (5 NDE + Distressing-NDE reports)
npx tsx scripts/b1-5-smoke-test.ts nderf

# B0.1b — OBERF (5 each of the 14 experience types; --limit=14 for one of each)
npx tsx scripts/b1-5-smoke-test.ts oberf
npx tsx scripts/b1-5-smoke-test.ts oberf --limit=14

# B0.1c — NUFORC
npx tsx scripts/b1-5-smoke-test.ts nuforc

# B0.1d — BFRO
npx tsx scripts/b1-5-smoke-test.ts bfro

# B0.1e — Reddit (4 subreddits, 5 each)
npx tsx scripts/b1-5-smoke-test.ts reddit-v2

# B0.1f — IANDS, Wikipedia, historical_archive
npx tsx scripts/b1-5-smoke-test.ts iands
npx tsx scripts/b1-5-smoke-test.ts wikipedia
npx tsx scripts/b1-5-smoke-test.ts historical_archive

# YouTube — only after B0.8 legal sign-off
# npx tsx scripts/b1-5-smoke-test.ts youtube
```

---

## After each adapter — manual spot-check

The script automates structural verification (`phenomenon_type_id` resolved, junction rows created, `paradocs_narrative` populated). It cannot evaluate **quality**. For each adapter, do these manually:

### Universal (every adapter)

1. **Visit `/phenomena/<expected-slug>`** for each expected `phenomenon_type` and confirm the newly-inserted reports appear under "Reports tagged".
2. **Visit `/report/<one-slug>`** for at least one of the new reports and verify:
   - The IngestedBadge ("Indexed from [source]") renders above the title
   - `source_url` links back to the canonical source
   - `paradocs_narrative` reads as Paradocs-voice analysis, not as a copy of the source
3. **Check the cost log:** `SELECT model, status, SUM(cost_usd) FROM paradocs_narrative_cost_log WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY model, status;` — should show completed Haiku spend within reasonable bounds.

### NDERF-specific

4. Confirm Distressing-NDE branching: `SELECT id, title, tags, metadata->>'experienceTypeSlug' FROM reports WHERE source_type = 'nderf' AND created_at > NOW() - INTERVAL '1 hour';` — at least one row should resolve to `distressing-nde` if the sample included any. Read the narrative to confirm it's actually distressing-tagged appropriately.

### OBERF-specific (most important manual check)

5. Find sub-type reassignments:

   ```sql
   SELECT id, title,
          metadata->>'archiveTypeSlug' AS archive_slug,
          metadata->>'experienceTypeSlug' AS effective_slug,
          substring(description, 1, 300) AS snippet
   FROM reports
   WHERE source_type = 'oberf'
     AND created_at > NOW() - INTERVAL '1 hour'
     AND metadata->>'archiveTypeSlug' IS DISTINCT FROM metadata->>'experienceTypeSlug';
   ```

   For each row returned, read the snippet and decide:
   - Was the reassignment defensible? (e.g., DBV → ADC because narrative is clearly post-death contact)
   - Or did the cue-matcher misfire? (false positive — e.g., DBV stayed DBV because narrative was actively-dying, no reassignment needed but matcher fired anyway)

   Document the verdict per row. False-positive rate > 30% means `subtypeDBVArchive()` / `subtypeDreamArchive()` needs tuning before B2.1 mass ingestion.

### NUFORC-specific

6. Confirm shape + region variety: `SELECT metadata->>'shape', country, state_province FROM reports WHERE source_type = 'nuforc' AND created_at > NOW() - INTERVAL '1 hour';`
7. Confirm location precision: every row should have city + state, lat/lng populated.

### BFRO-specific

8. Confirm regional variety + Class A/B/C: `SELECT state_province, metadata->>'bfroClass' FROM reports WHERE source_type = 'bfro' AND created_at > NOW() - INTERVAL '1 hour';`

### Reddit-specific (B0.1e)

9. Confirm subreddit variety: `SELECT metadata->>'subreddit', count(*) FROM reports WHERE source_type IN ('reddit', 'reddit-v2') AND created_at > NOW() - INTERVAL '1 hour' GROUP BY metadata->>'subreddit';` — should see all 4 target subs represented.
10. Confirm spam filter caught at least the obvious junk: spot-check that NO rows have titles like "Buy followers" or "Free crypto."

### Wikipedia + historical

11. Confirm attribution: `SELECT id, source_label, source_url FROM reports WHERE source_type IN ('wikipedia', 'historical_archive') AND created_at > NOW() - INTERVAL '1 hour';` — every row needs a source_url and a meaningful source_label.

---

## Pass criteria

B0.1 is COMPLETE when:

- [ ] All 8 adapters run via the smoke test script with zero `FAIL` verifications
- [ ] All universal manual spot-checks pass for every adapter
- [ ] OBERF: ≥70% of any sub-type reassignments are defensible (false positive rate < 30%)
- [ ] NUFORC: shape + region variety present in the sample
- [ ] BFRO: regional variety + Class A/B/C present
- [ ] Reddit: all 4 target subreddits represented + spam filter caught obvious junk
- [ ] No paradocs_narrative cost run > $5 for the entire smoke-test pass (sanity check on Haiku spend)

---

## Cleanup after testing

Two options:

**Option A (recommended) — Archive via the admin source-takedown tool:**
1. Sign in as admin → visit `/admin/source-takedown`
2. For each tested source, archive all ingested reports
3. Audit log captures this as a deliberate cleanup, not a deletion

**Option B — Direct SQL (use only on staging):**
```sql
DELETE FROM reports
WHERE created_at > NOW() - INTERVAL '<hours-since-test-start> hours'
  AND report_type = 'ingested';
```

---

## When to escalate

Stop the smoke test pass and escalate to engineering (or back to me) if:

- Any adapter throws an exception other than "no env var"
- `phenomenon_type_id` resolution fails for NDERF / OBERF (B1.5 contract broken)
- `report_phenomena` junction rows missing for NDERF / OBERF rows (encyclopedia page won't show them)
- Haiku cost cap fires unexpectedly during smoke test (`SELECT * FROM paradocs_narrative_cost_log WHERE status='skipped_cap';` should be empty)
- Any source returns content that obviously violates the legal posture (PII in comments, scraped content the source explicitly prohibits, etc.)

---

## What comes next

Once B0.1 is complete with everything green:

1. **B2.1** — NDERF + OBERF mass ingestion can start immediately (~1 week to full corpus)
2. **B2.2** — NUFORC mass ingestion (~2 weeks)
3. **B2.3** — Reddit Arctic Shift (~4 weeks, after counsel sign-off per B0.8)
4. **B2.4** — YouTube Data API (continuous, post-launch ok)

Mass ingestion runs in parallel with C1.x (Capacitor setup). Both feed the MVP launch criterion: populated archive + native apps in stores.
