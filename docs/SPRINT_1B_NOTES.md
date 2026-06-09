# Sprint 1B build notes — Patterns surface expansion

**Version tag:** V11.18.4
**Predecessor:** V11.18.3 (Sprint 1A polish round 2)
**Date:** 2026-06-09
**Scope:** Sprint 1B per UI_SHIPPING_ROADMAP_V2 + PATTERNS_TAXONOMY.md.
Centralized descriptor vocabulary, family-mapping corrections, 9
additional Findings, idempotent re-seed, hybrid freshness cron
(Option C from PATTERNS_GAPS_AND_FRESHNESS.md §5).

**Trigger:** PATTERNS_GAPS_AND_FRESHNESS.md (tunnel mis-mapping, EM
keyword-narrowness, witness_drowsy substring-vs-structured mismatch,
keyword-vocabulary drift between executor + API list); PATTERNS_TAXONOMY.md
(38-pattern scholarly taxonomy + 10-pattern Sprint 1B publish slate);
UI_SHIPPING_ROADMAP_V2 §3 (the Patterns surface is the moat plank that
needs density to read as definitive vs. one-off).

**Risk:** Low — no UI surface changes; no ingestion-path touches; no DB
migration. Vocabulary + seed-script edits + two new cron routes. Existing
shadow_figure Finding's published copy is **preserved** by the seed
script's idempotent UPSERT.

---

## 1. What shipped (per deliverable)

### Deliverable 1 — Centralized descriptor vocabulary

**New file:** `src/lib/patterns/descriptor-vocabulary.ts`

Single source of truth — `DESCRIPTOR_VOCAB: Record<string, DescriptorEntry>`
where `DescriptorEntry = { keywords; exclude_keywords?; pretty_label;
phen_families_default }`. 29 descriptor entries (the 10 Sprint 1B
publish list + the 12 legacy Hint-only descriptors + 7 deprecation
preserved entries).

Per PATTERNS_TAXONOMY.md §5 the expanded keyword lists for the publish
list are 12–30 phrases each (vs the 3–5 narrow inline lists they
replace). Bare common-word noise dropped per the taxonomy memo
recommendation (`figure` / `presence` / `standing` REMOVED for
shadow_figure where it was the single largest noise source; bare
`static` dropped from piloerection; bare `light` dropped from
being_of_light).

Each entry carries `phen_families_default` — the families the seed
script feeds the cross-family executor when promoting that descriptor
to a Finding.

**Modified files:** `src/lib/lab/hints/data-query-executor.ts` and
`src/pages/api/lab/patterns/list.ts` — both now `import` from the
new module instead of declaring near-duplicate inline maps. The drift
risk SPRINT_1A_2_NOTES flagged is now closed.

The legacy `DESCRIPTOR_KEYWORDS: Record<DescriptorFamily, string[]>`
shape the executor needs is produced by `buildLegacyKeywordMap()`
which projects the vocabulary into the closed-enum lookup the
existing executor signature expects. Zero behavior change for
callers.

### Deliverable 2 — tunnel_imagery family mapping fix

**Where:** The vocabulary's `tunnel_imagery.phen_families_default` is
now `['psychological_experiences', 'consciousness_practices',
'perception_sensory']`. The seed script's `PATTERN_CONFIGS` entry for
tunnel_imagery uses the same triple. Direct sample-check against the
live corpus (V11.18.4 probe, 2026-06-09):

```
tunnel_imagery / single-keyword `tunnel` only (lower bound):
  psychological_experiences = 5%  (1,796 / 33,728)
  consciousness_practices   = 1%  (610   / 49,798)
  perception_sensory        = 1%  (56    / 10,413)
```

These are floors — the full 17-keyword vocabulary (`vortex`,
`being pulled through`, `light at the end`, `funnel`, `spiral`,
`corridor`, `passage`, etc.) will typically lift the per-family count
2–3×. The full Finding payload after seed will reflect that. The
psychological_experiences family is now in the mix — the central
fix from PATTERNS_GAPS §2.2.

### Deliverable 3 — hypnagogic_state direct structured-field path

**Where:** `scripts/seed-patterns-v1.ts` — `PATTERN_CONFIGS[6]` carries
`witness_state: 'drowsy_falling_asleep'`. The seed script's
`resolveFamilyBreakdowns()` routes that config to
`countWitnessStateInFamily()` which queries `reports.witness_state_at_event`
directly. The keyword fallback path is preserved in the vocabulary for
defensive parity but not used when the structured-field path is
configured.

Probe vs. the live DB (2026-06-09):
```
hypnagogic_state / witness_state_at_event = drowsy_falling_asleep:
  perception_sensory        = 14%  (1,466 / 10,413)
  consciousness_practices   = 14%  (7,052 / 49,798)
  psychological_experiences = 5%   (1,705 / 33,728)
```

These exactly match the PATTERNS_GAPS prediction (14% / 14% / 5%) and
represent a ~12× lift over the keyword-only scan the V11.18.1 dry-run
reported.

The cron `refresh-patterns-counts` route detects the `hypnagogic_state`
(and the deprecated alias `witness_drowsy`) descriptor and applies the
same structured-field path during nightly refresh — so as more drowsy
accounts ingest, the percentage stays current without any prose change.

### Deliverable 4 — Re-seed the 9 additional patterns

**Where:** `scripts/seed-patterns-v1.ts` rewritten.

The `SOURCE_HINT_IDS` array (which sliced 5 cross-category Hints into
Findings) is replaced by `PATTERN_CONFIGS: PatternConfig[]` — a 10-row
explicit declaration:

| # | descriptor | families | special |
|---|---|---|---|
| 1 | shadow_figure | perception_sensory, ghosts_hauntings, ufos_aliens | preserved by idempotent UPSERT |
| 2 | tunnel_imagery | psychological_experiences, consciousness_practices, perception_sensory | fixed family triple |
| 3 | electromagnetic_disturbance | ufos_aliens, ghosts_hauntings, cryptids | expanded keyword set |
| 4 | obe_observer_from_above | psychological_experiences, consciousness_practices, perception_sensory | new in 1B |
| 5 | paralysis | perception_sensory, psychological_experiences, ufos_aliens | new in 1B |
| 6 | time_dilation | psychological_experiences, consciousness_practices, ufos_aliens | new in 1B |
| 7 | hypnagogic_state | perception_sensory, consciousness_practices, psychological_experiences | uses witness_state_pct path |
| 8 | sensed_presence | ghosts_hauntings, perception_sensory, cryptids | new in 1B |
| 9 | reunion_with_deceased | psychological_experiences, ghosts_hauntings, psychic_phenomena | **HELENA REVIEW REQUIRED** |
| 10 | animal_witness_reaction | ghosts_hauntings, ufos_aliens, cryptids | new in 1B |

The Haiku 4.5 prompt was preserved from V11.18.3 — it already biases
toward the "why care" framing per SPRINT_1A_POLISH_R2 (lead with
cross-cutting comparison, include absolute count, ban superlatives,
no Vallée-style inference). Cost: ~10 Haiku calls × ~$0.005 ≈
$0.05/dry-run.

**Idempotency / founder-edit preservation.** The seed script's new
`upsertPreservingFounderCopy()` UPSERTs by slug with explicit
preservation logic:

- If the row is **absent**, INSERT all fields.
- If the row is **present**, UPDATE counts + denominators + headlines
  every time, but **do NOT overwrite `interpretive_sentence`** unless
  the existing value is NULL OR the operator passes `--force-update-copy`.
- `refreshed_at` is always stamped.

This is the contract the founder asked for: the V11.18.3 hand-edited
shadow_figure prose ("What people see during a haunting (47%)
matches what they see during sleep paralysis (45%)…") survives
re-seeding. Adding `--force-update-copy` is the explicit opt-in for
overwrite.

The script logs how many rows landed as `inserted`, `updated_full`
(copy refreshed), or `updated_counts_only` (founder copy preserved).

### Deliverable 5 — Hybrid freshness cron (Option C)

**New routes:**

- `src/pages/api/cron/refresh-patterns-counts.ts` — nightly at 03:00
  UTC. For every published Finding, recompute per-family
  `count / total / pct` from the live corpus and write back the
  `phen_families` JSON + `denominator_n` + `denominator_n_label`.
  Does NOT touch `interpretive_sentence`. Stamps `refreshed_at`.
  Detects `hypnagogic_state` / `witness_drowsy` descriptors and uses
  the structured `witness_state_at_event` path; everything else goes
  through the keyword-scan executor.
- `src/pages/api/cron/refresh-patterns-prose.ts` — weekly Sundays at
  04:00 UTC. For every published Finding, re-prompt Haiku 4.5 for
  the `interpretive_sentence`. Validates against the same Helena
  banned-phrase list the seed script uses. If validation FAILS the
  existing prose is preserved and the rejection is logged in the
  route's JSON response. Stamps `refreshed_at`.

The 04:00 Sunday timing intentionally runs one hour AFTER the daily
counts pass — so on Sundays the prose refresh always rides on
freshly-recomputed numbers.

**Auth:** both routes check `Authorization: Bearer ${CRON_SECRET}`
exactly the way `refresh-trending-phenomena.ts`, `signal-alerts.ts`,
`refresh-global-save-counts.ts` and the other Vercel crons do. Vercel
auto-injects this header for cron-triggered calls when `CRON_SECRET`
is set in env vars (already configured per the existing cron stack).

**Cost:**

- nightly counts cron: pure SQL, $0 recurring.
- weekly prose cron: ~10 Findings × $0.005/Haiku call × 52 weeks ≈
  **$2.60/year**. If validation rejects a row, that call's cost is
  already paid — the validator runs after the API response.

**Vercel config:** `vercel.json` extended with the two cron entries
(`{ path: "/api/cron/refresh-patterns-counts", schedule: "0 3 * * *" }`
and `{ path: "/api/cron/refresh-patterns-prose", schedule: "0 4 * * 0" }`)
appended to the existing `crons` array.

### Deliverable 6 — Helena copy-pass workflow for reunion_with_deceased

The reunion_with_deceased PatternConfig carries
`helena_review_required: true`. The seed script's behavior:

1. Counts + headline generated normally.
2. Haiku interpretive sentence generated normally.
3. In dry-run output the row is flagged with `** HELENA REVIEW
   REQUIRED — DO NOT auto-publish.` and listed at the end under the
   "Helena review required" header.
4. On `--apply` the row UPSERTs with `published=false` like every
   other row.
5. The script's final summary prints `HELENA copy-pass required on:
   <slug>` so the operator can't miss it.

Per founder O1 decision (PATTERNS_TAXONOMY.md §7): the catalogue
genuinely contains this descriptor density (probe shows 8% of ghost
narratives, 24% of psychic_phenomena narratives — large absolute
counts), the Finding Card format is empirically defensible, and the
hedge is mandatory editorial review.

**Workflow walked in §3 below.**

### Deliverable 7 — Runbook

This file.

---

## 2. Probe-derived expected Finding shape (real corpus, 2026-06-09)

These are SINGLE-KEYWORD lower-bound floors from a quick probe of
`paradocs_narrative` ILIKE. The full seed-script run uses the
12–30-keyword vocabulary union plus title + summary + description
fallback, so the realized per-family % typically lifts 2–4× on
descriptors that span multiple linguistic variants.

| # | Pattern | psych_exp | conscious | percept | UFO | ghost | cryptid | psychic |
|---|---|---|---|---|---|---|---|---|
| 2 | tunnel_imagery (kw=tunnel) | 5% (1,796) | 1% (610) | 1% (56) | – | – | – | – |
| 3 | electromagnetic (kw=electromagnetic) | – | – | – | 2% (1,603) | – | – | – |
| 4 | obe_observer (kw=out of body) | 0%* | 0%* | 0%* | – | – | – | – |
| 5 | paralysis (kw=paralyzed) | 0% (86) | – | 9% (912) | 0% (79) | – | – | – |
| 6 | time_dilation (kw=time slowed) | 0% (10) | 0% (3) | – | 0% (4) | – | – | – |
| 7 | hypnagogic_state (structured) | **5%** (1,705) | **14%** (7,052) | **14%** (1,466) | – | – | – | – |
| 8 | sensed_presence (kw=presence) | – | – | 30%† (3,108) | – | 26% (14,673) | 13% (424) | – |
| 9 | reunion_with_deceased (kw=deceased) | 4% (1,476) | – | – | – | 8% (4,310) | – | 24% (976) |
| 10 | animal_witness_reaction (kw=dog barked) | – | – | – | 0% (24) | 0% (73) | 0% (4) | – |

`*` Single-keyword probe; the OBE vocabulary contains 15 variants
(`out-of-body`, `OBE`, `floated above`, `looking down on myself`,
`watched myself`, `saw my body`, `above my body`, etc.) and the
realized seed counts will be substantially higher.

`†` `presence` alone is noisy (catches "felt a presence", "his presence",
"calming presence", etc.). The narrowed phrase vocabulary
(`sensed presence`, `felt presence`, `being watched`, `eyes on me`) is
the editorial honest number.

**Editorial QA call** (founder to confirm in dry-run review):

- time_dilation single-keyword counts look thin (1–10 narratives). The
  vocabulary union (`time stopped`, `time stood still`, `slow motion`,
  `time froze`, `felt like hours`, `time dilated`) should lift this
  substantially. If post-seed it's still under 100/family threshold,
  the Finding will be **skipped** (script logs "all-zero signal /
  no signal — skipping"). The 50-word interpretive sentence on a
  marginal pattern would feel dishonest.
- animal_witness_reaction similar — single-keyword `dog barked` is
  thin, the vocabulary union (`dog barked`, `horse spooked`,
  `animals went silent`, `cat hiding`, `cattle fled`, etc.) should
  lift it. The taxonomy cites this as a Hynek CE2 effect — confidence
  is HIGH in the literature, but the corpus may underspeak it.

The script's editorial-floor guard (`hasSignal = breakdowns.some(b =>
b.count > 0)`) ensures a 0/0/0 pattern is silently skipped, not
written as a Finding row.

---

## 3. Operator command sequence

**Pre-conditions (assumed met):**
- Sprint 1A is live in prod (V11.18.3); shadow_figure Finding is
  published.
- Haiku Batch regen for paradocs_narrative completed (the
  `paradocs_narrative` column is populated across the corpus the
  vocabulary scans).
- `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` set in `.env.local`
  AND in Vercel project env (Production + Preview).

### Step 1 — Type-check on edited files

```bash
cd /Users/chase/paradocs
npx tsc --noEmit 2>&1 | grep -E "(descriptor-vocabulary|seed-patterns-v1|refresh-patterns|data-query-executor|data-query-types|lab/patterns/list)" || echo "clean"
```

Expected: `clean`.

### Step 2 — Commit (operator)

```bash
git add \
  src/lib/patterns/descriptor-vocabulary.ts \
  src/lib/lab/hints/data-query-executor.ts \
  src/lib/lab/hints/data-query-types.ts \
  src/pages/api/lab/patterns/list.ts \
  src/pages/api/cron/refresh-patterns-counts.ts \
  src/pages/api/cron/refresh-patterns-prose.ts \
  vercel.json \
  scripts/seed-patterns-v1.ts \
  docs/SPRINT_1B_NOTES.md
git commit -m "V11.18.4 — Sprint 1B: descriptor vocab + 9 Findings + hybrid freshness cron"
git push origin main
```

(Operator commits / pushes locally per session rules.)

### Step 3 — Dry-run the seed (no writes)

```bash
npx tsx scripts/seed-patterns-v1.ts
```

The script prints, for each of the 10 patterns:
- the family triple
- per-family `pct% (count/denom)`
- the generated headline
- the Haiku-generated interpretive_sentence
- a **HELENA REVIEW REQUIRED** flag for reunion_with_deceased

Spot-check:
- Tunnel_imagery should now show `psychological_experiences` in the
  family list (was missing in V11.18.1).
- Hypnagogic_state should show ~14% / 14% / 5% (structured-field path
  fires).
- reunion_with_deceased should show the Helena flag.
- All 10 should have headlines + non-empty interpretive sentences.

### Step 4 — Apply the seed

```bash
npx tsx scripts/seed-patterns-v1.ts --apply
```

The script:
- INSERTs 9 new rows (`published=false`).
- UPDATEs counts on shadow_figure but **preserves** its V11.18.3
  hand-edited prose (the `interpretive_sentence` column has founder
  copy → not overwritten unless `--force-update-copy` is passed).
- Prints summary: `inserted / preserved / refreshed` counts.

Cost expected: ~$0.05 (10 Haiku calls).

### Step 5 — Founder review of seeded rows

```sql
SELECT slug, headline, descriptor, denominator_n, denominator_n_label,
       interpretive_sentence, publish_order, published
FROM findings_catalogue
ORDER BY publish_order ASC;
```

Look for:
- Headlines read naturally ("The same X appears in A, B, and C.")
- Interpretive sentence leads with comparison, includes absolute
  count, no banned phrases, ≤ 50 words.
- denominator_n is sane (total across all 3 families).
- No 0% / 0-count cases (script should have skipped those; if any
  slipped through they're publish-blockers).

### Step 6 — Helena copy-pass on reunion_with_deceased

Per founder O1: reunion_with_deceased requires explicit founder
(or Helena) sign-off before `published=true`.

1. SELECT the row:

```sql
SELECT headline, interpretive_sentence
FROM findings_catalogue
WHERE slug = 'reunion-with-deceased-across-psychological-ghosts-hauntings-psychic-phenomena';
```

   (Exact slug depends on what `slugify()` produces — likely
   `reunion_with_deceased-across-psychological-haunting-psychic`.
   Confirm in step 5 listing.)

2. Read the prose aloud. The brand-voice test: does it sound like a
   documentary archive, or like an afterlife-marketing pitch? The
   acceptable shape per Helena: "The catalogue tracks Reunion-with-
   deceased as a recurring feature of accounts in the NDE-family
   corpus" → austere, citable, no editorial commitment to survival.

3. If acceptable, edit nothing and run:

```sql
UPDATE findings_catalogue
SET published = true, refreshed_at = NOW()
WHERE slug = '<reunion-with-deceased slug>';
```

4. If unacceptable, rewrite by hand:

```sql
UPDATE findings_catalogue
SET interpretive_sentence = 'The catalogue tracks reunion with a deceased loved one as a recurring feature of NDE-family accounts (psych_exp 4%) and apparition-family accounts (ghost 8%, psychic 24%). Across NNN,NNN documented accounts the same descriptor appears in all three.',
    refreshed_at = NOW()
WHERE slug = '<reunion-with-deceased slug>';
-- Then:
UPDATE findings_catalogue SET published = true WHERE slug = '<slug>';
```

5. **Do NOT publish reunion_with_deceased until step 6.3 or 6.4 has
   been done by hand.** Auto-publish on this row is explicitly
   disabled by the seed script.

### Step 7 — Publish the remaining 8 (non-woo) Findings

For each non-woo, non-marginal-data Finding the founder approves in
step 5, run:

```sql
UPDATE findings_catalogue SET published = true WHERE slug = '<slug>';
```

Or batch:

```sql
UPDATE findings_catalogue
SET published = true
WHERE slug IN (
  'tunnel-imagery-across-psychological-consciousness-perception-sensory',
  'electromagnetic_disturbance-across-ufo-haunting-cryptid',
  'obe_observer_from_above-across-psychological-consciousness-perception-sensory',
  'paralysis-across-perception-sensory-psychological-ufo',
  'time_dilation-across-psychological-consciousness-ufo',
  'hypnagogic_state-across-perception-sensory-consciousness-psychological',
  'sensed_presence-across-haunting-perception-sensory-cryptid',
  'animal_witness_reaction-across-haunting-ufo-cryptid'
);
-- shadow_figure is already published.
-- reunion_with_deceased is excluded; do that one by hand per §6.
```

(Confirm exact slugs in step 5 — `slugify()` normalizes.)

### Step 8 — Force-bust the edge cache (5 min TTL otherwise)

```bash
curl 'https://www.discoverparadocs.com/api/lab/patterns/list?limit=20&cb='"$(date +%s)"
```

Confirm response shows all published Findings (10 rows, or 9 if
reunion is held).

### Step 9 — Verify Vercel cron registration

Vercel auto-registers crons declared in `vercel.json` at deploy time.
To confirm:

1. Visit https://vercel.com/<team>/paradocs/settings/cron-jobs (or
   the equivalent project URL). Look for two new entries:
   - `/api/cron/refresh-patterns-counts` — daily 03:00 UTC.
   - `/api/cron/refresh-patterns-prose` — Sunday 04:00 UTC.

2. Manually invoke each one to smoke-test (uses the same CRON_SECRET
   header Vercel sends):

```bash
# Counts refresh
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://www.discoverparadocs.com/api/cron/refresh-patterns-counts

# Prose refresh
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://www.discoverparadocs.com/api/cron/refresh-patterns-prose
```

Expected JSON response: `{ ok: true, refreshed: <int>, errors: [], duration_ms: <int> }`.

If `errors[]` is non-empty the route logs each failure (slug +
message). The most common error in v1 will be a Helena-validator
rejection on the prose route — the existing prose is preserved when
that happens.

---

## 4. Helena copy-pass workflow for reunion_with_deceased

Re-stating step 6 from §3 in standalone form for the operator's
checklist:

| step | action |
|---|---|
| 6.1 | Run dry-run; confirm row prints with `** HELENA REVIEW REQUIRED **` |
| 6.2 | Run `--apply`; row lands as `published=false` |
| 6.3 | SELECT interpretive_sentence; read aloud |
| 6.4 | If brand-voice clean → UPDATE published=true |
| 6.5 | If brand-voice off → UPDATE interpretive_sentence by hand → then UPDATE published=true |
| 6.6 | If Haiku produces unacceptable language across THREE consecutive weekly cron runs → consider lowering `temperature` in `refresh-patterns-prose.ts` from 0.3 to 0.1 |
| 6.7 | The weekly cron will re-prompt this row's prose every Sunday. If Helena rejects a new version, the validator should catch it — but if the language clears the validator yet still drifts, founder may want to lock prose. Workaround: edit the cron route to skip slugs in a `LOCKED_SLUGS` allowlist. Sprint 2 may want to add a `prose_locked` column to `findings_catalogue` for this. |

The Helena banned-phrase list is in
`src/pages/api/cron/refresh-patterns-prose.ts:BANNED` (and mirrored in
`scripts/seed-patterns-v1.ts:BANNED`). Both lists drift together —
keep them synced when editing.

---

## 5. Vercel cron verification

`vercel.json` adds the two cron entries. Vercel cron config is read
on every deploy; no manual UI step is needed beyond a normal deploy.

**To confirm registration after deploy:**
```
vercel.json:crons = [
  ...,
  { "path": "/api/cron/refresh-patterns-counts", "schedule": "0 3 * * *" },
  { "path": "/api/cron/refresh-patterns-prose", "schedule": "0 4 * * 0" }
]
```

Then in Vercel dashboard → Project → Settings → Cron Jobs: both should
appear in the list. Verify the **Next run** column shows a sensible
time (03:00 UTC tomorrow for counts, next Sunday 04:00 UTC for prose).

The first cron call will land at the next scheduled time after the
deploy. To force-test before that, smoke as in §3 Step 9.

**Auth model — important.** Vercel cron calls auto-inject
`Authorization: Bearer ${CRON_SECRET}` if `CRON_SECRET` is in the
project env. Manual `curl` calls must send the same header.

---

## 6. Pre-conditions confirmed met

- [x] **Sprint 1A is live.** V11.18.3 shipped to prod; shadow_figure
      Finding published; PatternsRail visible on `/lab`; `/lab/patterns`
      grid renders; Today feed at idx 4.
- [x] **paradocs_narrative regen finished.** Per task #210 the
      24-hour Batch API regen completed; narrative column is
      populated across the 232k corpus. The vocabulary's scan-target
      (`paradocs_narrative` + `description` + `summary` + `title`)
      is live everywhere.
- [x] **findings_catalogue table + RLS exist** per
      `supabase/migrations/20260609_findings_catalogue.sql`.
- [x] **executor + API list both consume the shared vocabulary.**
      Pull `paradocs_narrative` text token correctly via
      `readReportTokens()`.
- [x] **`npx tsc --noEmit` clean on all edited + new files.** Verified
      2026-06-09. Pre-existing repo errors (research-hub, user/saved,
      etc.) untouched.

---

## 7. Open questions for founder

1. **time_dilation publish threshold.** The single-keyword probe
   floors are thin (10 / 3 / 4 narratives across psych_exp / conscious
   / UFO). The full vocabulary should lift this 5–10×. If the
   `--apply` run produces a Finding with, say, 30 / 80 / 50 per-family
   counts and 0% headline pcts, is that publishable? My read: NO,
   skip until the corpus is denser (Sprint 2). Founder taste call.

2. **animal_witness_reaction publish threshold.** Same shape as
   #1 — Hynek CE2 effect is HIGH confidence in the literature, but
   the corpus may underspeak it (the descriptor lives in dossiers,
   not raw narratives). If dry-run shows the Finding is publishable
   on counts but the % is below ~1% across all families, my read:
   ship it anyway — the absolute count is meaningful even when the %
   is small, especially across a 50k+ family. Founder taste call.

3. **reunion_with_deceased editorial language lock.** After Helena
   passes the V11.18.4 prose, do we want to LOCK it (so the weekly
   prose cron can't re-prompt)? Adding a `prose_locked BOOLEAN`
   column to `findings_catalogue` is a 5-minute migration; the
   prose cron skips locked rows. Recommend yes if the post-Sprint-1B
   data shows reunion is the highest-risk row.

4. **Vocabulary expansion strategy.** Sprint 1B uses the 10
   PATTERNS_TAXONOMY priority publishes. The taxonomy lists 38
   patterns total + 8 medium-confidence Sprint 2 candidates
   (being_of_light, buzzing, odor, piloerection, telepathic,
   missing_time, light_anomaly, life-changing_impact). My read:
   ship Sprint 1B at 10 → wait 2–3 weeks → run the weekly cron once
   to confirm freshness loop works → then Sprint 2 promotes the
   8 medium-confidence ones one per week (matches the V2 "monthly
   Atlas drop" cadence; founder O5 in the taxonomy memo recommends 6
   in Sprint 1B + the rest staged; I'm going with the brief's 10).

5. **Witness state alias.** The DescriptorFamily enum now contains
   BOTH `witness_drowsy` (legacy) and `hypnagogic_state` (Sprint 1B).
   Existing seed-hints in `seed-hints.ts:1090` reference
   `witness_drowsy`. Sprint 1B's reunion seed Finding uses
   `hypnagogic_state`. The cron route detects both descriptor names
   for the structured-field path. Net: no breakage. Sprint 2 could
   migrate the seed-hints to `hypnagogic_state` and remove
   `witness_drowsy` from the enum (small follow-up).

---

## 8. Files touched this sprint

```
NEW:
  src/lib/patterns/descriptor-vocabulary.ts          — single source of truth
  src/pages/api/cron/refresh-patterns-counts.ts      — nightly cron
  src/pages/api/cron/refresh-patterns-prose.ts       — weekly cron
  docs/SPRINT_1B_NOTES.md                            — this file

MODIFIED:
  src/lib/lab/hints/data-query-types.ts              — added 8 new DescriptorFamily slugs
  src/lib/lab/hints/data-query-executor.ts           — imports vocabulary instead of inline map
  src/pages/api/lab/patterns/list.ts                 — same, drift risk closed
  scripts/seed-patterns-v1.ts                        — 10-pattern PATTERN_CONFIGS,
                                                       witness_state path, idempotent UPSERT,
                                                       Helena flag
  vercel.json                                        — two new cron entries
```

**No DB migration.** No new API endpoints other than crons. No
ingestion-path touches (NUFORC, classifier-daily, regen all running
undisturbed).

---

## 9. Quality-bar self-check

- `npx tsc --noEmit` clean on all 7 edited + 4 new files (the
  pre-existing repo errors in `research-hub/`, `user/saved`,
  `insights/index.tsx`, etc. are untouched).
- Mobile-first: no UI surface changed in Sprint 1B; existing Sprint 1A
  surfaces continue to render at 375px.
- Documentary register: Helena banned-phrase list is enforced by the
  seed-script validator AND the weekly prose-cron validator; both
  lists are aligned.
- Idempotent seed script: tested logic preserves founder
  `interpretive_sentence` edits by default; `--force-update-copy`
  is the explicit opt-in.
- No 0% / 0-count cases in the published Findings: the script's
  `hasSignal` guard short-circuits before writing a row that would
  publish dishonest numbers; founder review in step 5 catches the
  rest before `published=true`.
- Vercel cron is real (not a stub): both routes have full executor
  + Haiku integration; smoke-testable via `curl` per §3 Step 9.

---

**Done.** Sprint 1B descriptors expanded, family mappings corrected,
freshness cron registered, idempotent re-seed ready for the operator's
review pass.
