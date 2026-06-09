# Sprint 1C build notes — descriptor vocab expansion + FindingCard polish + prose_locked + Helena validator refinement

**Version tag:** V11.18.6
**Predecessor:** V11.18.5 (Sprint 1B + Reunion V2 prose)
**Date:** 2026-06-09
**Scope:** Sprint 1C per `UI_SHIPPING_ROADMAP_V2` §3 + `PATTERNS_TAXONOMY.md`
+ `SPRINT_1B_NOTES.md` + founder feedback (right-side blank space, V2
reunion prose pattern). Vocabulary expansion for 4 descriptors that
under-registered in Sprint 1B, FindingCard family-icon affordance,
`prose_locked` row flag + cron support, Helena validator refinement.

**Trigger:**
- `animal_witness_reaction` registered 0/0/0 in Sprint 1B — Hynek's CE2
  effect MUST register in a corpus this size; the keyword set was too
  narrow.
- `paralysis` registered 93/5/0 — abduction literature (Mack) shows the
  UFO family should be ~5–15%; Sprint 1B's "sleep paralysis" framing
  missed the canonical UFO-abduction phrasings.
- `time_dilation` registered 3/1/0 — Mack's "missing time" is the
  canonical UFO-abduction marker; Sprint 1B missed it.
- `piloerection` (alias was `static_electricity`) — bare 'static' was
  the single largest noise source ("static vigil", "stationary",
  "static-like"); Sprint 1B brief calls for replacement.
- Founder feedback: "we could make more use of the blank space on the
  right side of the card."
- Founder feedback: V2 reunion sentence pattern lands; apply same
  pattern to `electromagnetic_disturbance` + `sensed_presence`.
- Sprint 1B's bare-substring `'haunting'` ban rejected legitimate uses
  ("in a haunting", "a haunted location"). Needs structured check.
- Sprint 1B's Helena cron route had no way to lock founder-edited
  prose against weekly Haiku drift.

**Risk:** Low — no ingestion-path touches; one column addition
(`prose_locked BOOLEAN DEFAULT FALSE`, idempotent via `IF NOT EXISTS`);
existing seed contract preserved (idempotent UPSERT still skips
founder-edited `interpretive_sentence`); FindingCard visual change
limited to additive icon strip on `today_card` + `grid` variants.

---

## 1. What shipped (per deliverable)

### Deliverable 1 — Expand 4 descriptor vocabularies

**File:** `src/lib/patterns/descriptor-vocabulary.ts`

Four descriptor entries rewritten; one (`static_electricity`) dropped
entirely:

**`animal_witness_reaction`** — Sprint 1B set (16 keywords) replaced
with 38-keyword set per the brief. Covers:
- generic ("animals fled", "animals scattered", "animals refused")
- species-specific horse ("horse spooked", "horse bolted", "horses
  bolted/scattered")
- cattle/livestock ("cattle fled", "cattle in distress", "livestock
  panicked")
- birds ("birds went silent", "birds stopped singing", "sudden silence
  in the trees")
- dogs (singular + plural + species-specific reactions)
- cats (singular + plural + "cat refused")
- other species ("chickens panicked", "sheep ran", "deer fled",
  "wildlife disappeared")
- possessive narrator (Hynek's literary marker — "the dog wouldn't",
  "my dog refused", "spooked the horses")
- preserved Sprint 1B keywords for parity

**`piloerection`** — Sprint 1B set (18 keywords) replaced with
14-keyword set targeting the cleaned-up canonical forms:
- hair-raising ("hair stood on end", "hair-raising", "hair on end")
- goosebumps (US + UK + hyphenated)
- prickling/tingling
- possessive narrator ("the hairs on my arm", "hairs on my neck",
  "hairs on my arms stood")
- canonical ("piloerection")
- **DROPPED**: bare 'static' (huge noise source — "static vigil",
  "stationary", "static-like"); bare 'static electricity' (broader
  than the piloerection sense); 'skin crawled' (different sensation —
  more disgust than sympathetic-nervous arousal).

**`paralysis`** — Sprint 1B set (15 keywords) replaced with 32-keyword
set covering the abduction-literature phrasings Mack documents:
- canonical ("paralysis", "paralyzed", "as if paralyzed", "like I was
  paralyzed")
- mobility loss ("couldn't move", "could not move", "couldn't move at
  all", "unable to move")
- frozen ("frozen", "froze", "frozen in place / solid / still")
- canonical others ("immobilized", "body wouldn't respond",
  "limbs/arms/legs wouldn't move", "something held me", "held in
  place", "pinned", "pinned down")
- canonical ("sleep paralysis")
- preserved Sprint 1B keywords ("can't move", "couldn't speak",
  "weight on my chest") so the existing 93% perception-sensory match
  is preserved.

**`time_dilation`** — Sprint 1B set (11 keywords) replaced with
28-keyword set covering Mack's "missing time" canonical form plus the
abduction-stretch phrasings:
- subjective stretch ("time stood still", "time stopped", "time slowed",
  "time slowing")
- missing-time canonical ("lost track of time", "time was lost",
  "lost time", **"missing time"**)
- proportional ("hours felt like minutes", "minutes felt like hours",
  "felt like seconds", "felt like an eternity", "lasted forever")
- motion ("everything went in slow motion", "in slow motion")
- abduction-discontinuity ("the clock skipped", "clock skipped ahead",
  "no recollection of", "woke up later than", "when I came to",
  "came to in")
- canonical ("frozen moment", "time-frozen", "time froze")
- preserved Sprint 1B keywords for parity.

**`static_electricity`** — vocabulary entry DROPPED per Sprint 1C
brief. The `DescriptorFamily` enum value remains (`data-query-types.ts`
line 64) marked DEPRECATED so existing references in `seed-hints.ts`,
`dossier-engine.ts`, `match-engine.ts`, `WatchlistEditor.tsx`, and
`fingerprint.ts` keep type-checking. Any scan for this descriptor at
runtime returns zero matches (correct — it's deprecated; new code
should use `piloerection`).

**`piloerection` enum value** — already present in
`data-query-types.ts` (line 88), added in Sprint 1B. No type changes
needed.

### Deliverable 2 — Re-seed the 10 patterns with new vocabularies

**File:** `scripts/seed-patterns-v1.ts` (no changes — the seed script
already imports `DESCRIPTOR_VOCAB` from the vocabulary module; the
re-seed is just running the existing script).

**Dry-run command:**
```bash
cd /Users/chase/paradocs
npx tsx scripts/seed-patterns-v1.ts
```

**Expected counts** (estimates based on the literature-derived
keyword sets; the actual numbers come from the dry-run run):

| descriptor | Sprint 1B | Sprint 1C target | Why |
|---|---|---|---|
| `animal_witness_reaction` | 0/0/0% | **≥1%** in at least one family, with raw counts in the hundreds or low thousands per family | Hynek CE2 effect; corpus is 50k+ in ghost + UFO families |
| `piloerection` | (deprecated alias) | UFO **≥3%**, cryptid **≥3%**, ghost **≥3%** | Cleaned-up Hynek "hair on my arm stood up" pattern, three-family overlap is the entire reason this descriptor exists |
| `paralysis` | perception_sensory 93%, psych_exp 5%, UFO 0% | **UFO 5–15%**, perception_sensory unchanged at ~93%, psych_exp ~5% | Mack abduction phrasings now matched ("as if paralyzed", "something held me", "limbs wouldn't move") |
| `time_dilation` | psych_exp 3%, consciousness 1%, UFO 0% | **UFO 5–10%**, psych_exp 3–8%, consciousness 1–3% | "missing time" + abduction-discontinuity phrasings now matched |

**Validation gates** (founder spot-checks after dry-run output):
- If `animal_witness_reaction` is still 0/0/0 → keywords missed the
  corpus's literary register; flag in §7 open questions; revisit
  Sprint 1D.
- If `paralysis` UFO is still 0% → the "abduction" narratives may not
  use the "paralyzed" framing the literature predicts; might need a
  separate "abduction onset" descriptor.
- If `time_dilation` UFO is still 0% → the corpus may filter UFO
  narratives away from the missing-time frame (e.g., shorter
  encounters in NUFORC). Revisit in Sprint 1D.

**Apply command** (after founder reviews dry-run output):
```bash
npx tsx scripts/seed-patterns-v1.ts --apply
```

The seed script's idempotent UPSERT contract preserves the 4
founder-edited interpretive sentences:
- `shadow_figure` (V11.18.3 hand-edit; preserved by NULL-check + no
  `--force-update-copy` flag)
- `reunion_with_deceased` (V11.18.5 Helena-cleared 4-editor copy)
- `electromagnetic_disturbance` (Sprint 1C hand-rewrite — see §1.5)
- `sensed_presence` (Sprint 1C hand-rewrite — see §1.5)

These are protected at TWO levels after Sprint 1C:
1. seed script's UPSERT skips `interpretive_sentence` for non-NULL rows
2. weekly prose cron skips rows with `prose_locked = true`

### Deliverable 3 — Founder-publish workflow for new Findings

Walked in §3 below. Shape:
1. Dry-run; eyeball counts per the table above.
2. Apply; the 4 vocab-expanded descriptors land in DB (paralysis +
   time_dilation as UPDATEs to existing rows; animal_witness_reaction
   as UPDATE if it was inserted as a 0-row in Sprint 1B, otherwise
   INSERT; piloerection as INSERT since Sprint 1B's signal was zero).
3. SQL spot-check headlines + interpretive sentences.
4. Publish the strong rows; hold the weak rows for Sprint 1D.

### Deliverable 4 — FindingCard right-side blank space fill

**File:** `src/components/patterns/FindingCard.tsx`

**Picked Option B (icon set).** New `FamilyIconSet` component renders
a 3-icon strip at the top-right of `today_card` + `grid` variants,
right-aligned with the eyebrow. Each icon represents one of the
Finding's three phen_families.

**Mapping:**
| family | Lucide icon |
|---|---|
| cryptid | `Footprints` |
| UFO | `Radio` |
| haunting | `Ghost` |
| psychic | `Sparkles` |
| esoteric | `Sparkles` |
| consciousness | `Brain` |
| perception-sensory | `Moon` |
| psychological | `Brain` |
| religion/mythology | `Church` |

**Why B over A or C:**
- B has zero new data dependency (icons read from existing
  `phen_families` JSON). A (sparkline of count-over-time) would
  require either a history table or render-time derivation that
  doesn't exist yet. C (mini histogram) duplicates the per-family
  bars already on the card; founder testing on parallel surfaces
  showed it crowds the visual.
- B fits the documentary register — small (24px boxes on grid, 28px
  on today_card), gray-toned, hairline borders, no chart chrome.
- B reinforces the cross-family scope that IS the Finding's reason
  for existing.

**Why skipped on `rail`:** the rail variant is 300px wide; the top
row already carries the eyebrow + brand-purple hairline. Adding 3
icon boxes makes the eyebrow truncate or the icons clip. The brand
hairline already signals "this is a Patterns artifact" on that
variant.

**Accessibility:** the icon strip has `role="img"` and
`aria-label="Across {family1}, {family2}, {family3}"`; individual
icons are `aria-hidden`. Screen readers read the label, not the
SVGs.

**Visual register:**
- Box: 24px (grid) / 28px (today_card); rounded-md; 1px
  `border-white/[0.08]`; subtle white/[0.025] background.
- Icon: 14px (grid) / 16px (today_card); gray-400 stroke; strokeWidth=1.5.
- Hover: native `title` attribute exposes the family label on desktop;
  no additional tooltip layer.

### Deliverable 5 — Hand-rewrite prose for `electromagnetic_disturbance` + `sensed_presence`

Per V2 reunion-pattern: acknowledge smallness, turn into the finding.

**`electromagnetic_disturbance`** — Sprint 1B Haiku-generated prose:
> "Witnesses in UFO reports (5%), ghost accounts (3%), and cryptid
> sightings (1%) describe electromagnetic disturbance at measurably
> different rates across 138,369 documented cases, yet the descriptor
> appears in all three families."

**Sprint 1C rewrite candidate (Helena + Mariko pass):**
> "Across 138,369 documented experiences, 5,659 witnesses describe
> instruments behaving abnormally — watches stopping, electronics
> dying, engines stalling — during their encounter. The descriptor
> turns up in 5% of UFO reports, 3% of ghost reports, and 1% of
> cryptid sightings — three settings that otherwise share nothing
> else."
> (47 words. No banned terms. No second person. Lead is the
> count-anchored summary; close is the cross-family invariance —
> mirrors the reunion shape.)

- Helena: ON-BRAND.
- Mariko: ACCESSIBLE ("instruments behaving abnormally" with concrete
  examples; "watches stopping" is documentary).
- Devi: FACTUAL.
- Tariq: "huh — three settings that share nothing else, but the
  instruments still misbehave."

**`sensed_presence`** — Sprint 1B Haiku-generated prose:
> "Ghost accounts (4%, 2261 of 56,535), perception-sensory reports
> (4%, 417 of 10,413), and cryptid sightings (4%, 128 of 3,208)
> converge on a single descriptor: witnesses across all three
> families report a sensed presence with identical frequency."

**Sprint 1C rewrite candidate (Helena + Mariko pass):**
> "Across 70,156 documented experiences, 2,806 witnesses describe
> feeling watched or accompanied by an unseen presence — without
> seeing or hearing anything. The same 4% rate shows up in ghost
> reports, perception-sensory accounts, and cryptid sightings. Three
> different settings; one steady descriptor."
> (44 words. No banned terms. No second person. The two-clause
> closer mirrors the reunion shape Helena cleared.)

- Helena: ON-BRAND.
- Mariko: ACCESSIBLE ("feeling watched or accompanied" + the
  qualifier "without seeing or hearing anything" disambiguates from
  literal "presence sensed" perception).
- Devi: FACTUAL.
- Tariq: "huh — same rate, three settings."

**SQL to ship** (after founder approves the two candidates):
```sql
UPDATE findings_catalogue
SET
  interpretive_sentence = 'Across 138,369 documented experiences, 5,659 witnesses describe instruments behaving abnormally — watches stopping, electronics dying, engines stalling — during their encounter. The descriptor turns up in 5% of UFO reports, 3% of ghost reports, and 1% of cryptid sightings — three settings that otherwise share nothing else.',
  refreshed_at = NOW()
WHERE slug LIKE 'electromagnetic_disturbance-%';

UPDATE findings_catalogue
SET
  interpretive_sentence = 'Across 70,156 documented experiences, 2,806 witnesses describe feeling watched or accompanied by an unseen presence — without seeing or hearing anything. The same 4% rate shows up in ghost reports, perception-sensory accounts, and cryptid sightings. Three different settings; one steady descriptor.',
  refreshed_at = NOW()
WHERE slug LIKE 'sensed_presence-%';
```

Numbers in the rewrites should be verified against the post-re-seed
counts. If `denominator_n` shifted (likely — paralysis vocabulary
expansion changes its row's denominators, but EM and sensed_presence
denominators are stable across this sprint), update the candidates
before running the UPDATE.

### Deliverable 6 — `prose_locked` row flag

**New migration:** `supabase/migrations/20260609_findings_catalogue_prose_locked.sql`

```sql
ALTER TABLE findings_catalogue
  ADD COLUMN IF NOT EXISTS prose_locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN findings_catalogue.prose_locked IS
  'When true, the weekly prose-refresh cron will not overwrite interpretive_sentence. '
  'Founder sets to true on any row with hand-edited copy to prevent cron drift.';
```

**Modified `refresh-patterns-prose.ts`:**
- The SELECT now filters `published = true AND prose_locked = false`.
- A separate head-only count query reports the locked-skip count.
- Log line: `[CronRefreshPatternsProse] Skipping <N> rows (prose_locked).`
- Output JSON now includes `skipped_locked: <N>`.

**Operator SQL to lock the 4 founder-edited rows** (run after the
re-seed and after the EM + sensed_presence UPDATEs):
```sql
UPDATE findings_catalogue
SET prose_locked = true
WHERE slug LIKE 'shadow_figure-%'
   OR slug LIKE 'reunion-with-deceased-%'
   OR slug LIKE 'electromagnetic_disturbance-%'
   OR slug LIKE 'sensed_presence-%';
```

This is **4 rows**, not 6 — the brief mentioned "6 founder-edited
rows" but Sprint 1B's published slate contains only 4 with
founder-hand-edited prose at this stage. If founder hand-edits
more during Sprint 1C publish review (likely candidates: a strong
`animal_witness_reaction` or `piloerection` row that needed Helena
copy), extend the UPDATE accordingly.

### Deliverable 7 — Helena validator refinement

**Files:** `scripts/seed-patterns-v1.ts` + `src/pages/api/cron/refresh-patterns-prose.ts`

The bare `'haunting'` substring entry was REMOVED from `BANNED` in
both files. Replaced with a structured `isAdjectivalHaunting()`
function that runs as a separate validator step.

**Function** (identical implementation in both files; the validator
arms intentionally drift-resistant — the seed script's
`BANNED_PHRASES` export is for the cron route, but `isAdjectivalHaunting`
is duplicated in source rather than imported because the cron route
keeps its banned-list self-contained):

```ts
function isAdjectivalHaunting(text: string): boolean {
  return /\bhaunting\b\s+(tale|tales|silence|silences|melody|melodies|story|stories|image|images|moment|moments|memory|memories|feeling|feelings|sound|sounds|sight|sights)\b/i.test(text)
}
```

**Unit-test-style behavior table:**
| input | Sprint 1B behavior | Sprint 1C behavior |
|---|---|---|
| `"in a haunting (47%)"` | REJECT (banned substring) | **PASS** (noun, preceded by article) |
| `"a haunting tale"` | REJECT | **REJECT** (adjective + noun) |
| `"in a haunted location"` | PASS (no 'haunting' substring) | **PASS** (past-participle adjective) |
| `"haunting silence"` | REJECT | **REJECT** (adjective + noun) |
| `"the haunting"` | REJECT | **PASS** (noun, preceded by article) |
| `"filed as a haunting"` | REJECT | **PASS** (noun, preceded by article) |
| `"a haunting melody fell"` | REJECT | **REJECT** (adjective + noun) |

The new check rejects `haunting` ONLY when it's followed by one of a
documented set of nouns the goth-marketing voice attaches to it
(tale/silence/melody/story/image/moment/memory/feeling/sound/sight).
Other syntactic environments — noun "in a haunting", past-participle
"haunted", standalone "the haunting" — pass cleanly.

The Sprint 1B Haiku prompt's "Refer to the ghost-family category as
'ghost reports'…" steering remains in place (the Haiku side-step
that produced V2-style prose) — so we expect Haiku output to use
"ghost reports" most of the time anyway. The validator refinement is
the safety net for when Haiku reaches for the noun form.

### Deliverable 8 — Runbook

This file.

---

## 2. Operator command sequence

**Pre-conditions:**
- Sprint 1B is live in prod (V11.18.5 includes the reunion prose
  V2 UPDATE).
- `paradocs_narrative` is populated across the 232k corpus.
- `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` set in `.env.local` AND
  Vercel prod env.
- 4 published founder-edited rows currently exist: `shadow_figure`,
  `reunion-with-deceased`, `electromagnetic_disturbance`,
  `sensed_presence`. (If `electromagnetic_disturbance` or
  `sensed_presence` is NOT yet published in your DB, treat the §3
  steps below as a publish-after-Helena-pass flow.)

### Step 1 — Type-check on edited files

```bash
cd /Users/chase/paradocs
npx tsc --noEmit 2>&1 | grep -E "(descriptor-vocabulary|seed-patterns-v1|refresh-patterns|FindingCard|data-query-types)" || echo "clean"
```

Expected: `clean`.

### Step 2 — Commit (operator)

```bash
git add \
  src/lib/patterns/descriptor-vocabulary.ts \
  src/components/patterns/FindingCard.tsx \
  src/pages/api/cron/refresh-patterns-prose.ts \
  scripts/seed-patterns-v1.ts \
  supabase/migrations/20260609_findings_catalogue_prose_locked.sql \
  docs/SPRINT_1C_NOTES.md
git commit -m "V11.18.6 — Sprint 1C: vocab expansion + FindingCard icons + prose_locked + Helena validator"
git push origin main
```

(Operator commits / pushes locally per session rules.)

### Step 3 — Apply migration

```bash
# Via Supabase dashboard SQL editor, paste from:
# supabase/migrations/20260609_findings_catalogue_prose_locked.sql
#
# Or via psql:
psql "$DATABASE_URL" < supabase/migrations/20260609_findings_catalogue_prose_locked.sql
```

Expected:
```
ALTER TABLE
COMMENT
```

Verify:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'findings_catalogue' AND column_name = 'prose_locked';
-- Expect: prose_locked | boolean | false
```

### Step 4 — Dry-run the seed (no DB writes)

```bash
npx tsx scripts/seed-patterns-v1.ts
```

The script prints, for each of the 10 patterns:
- family triple
- per-family `pct% (count/denom)`
- generated headline
- Haiku-generated interpretive_sentence (won't be applied for
  rows where the existing prose is non-NULL)

**Critical spot-checks** (the §1 Deliverable 2 table):
- `animal_witness_reaction` should now show non-zero counts in at
  least one family.
- `piloerection` should show ≥1–3% in cryptid + UFO + ghost.
- `paralysis` UFO column should be 5–15% (was 0%).
- `time_dilation` UFO column should be 5–10% (was 0%).

**If any of the four don't materialize**, document the observed
counts here in this runbook and flag in §7 open questions. The
script's `hasSignal` guard short-circuits 0/0/0 rows, so they
silently skip — there's no risk of dishonest counts shipping.

### Step 5 — Apply the seed

```bash
npx tsx scripts/seed-patterns-v1.ts --apply
```

The script:
- UPDATEs counts on all existing rows (always — counts always refresh).
- UPDATEs `interpretive_sentence` ONLY on rows where the existing
  value is NULL (i.e., new patterns + previously-skipped patterns).
- PRESERVES `interpretive_sentence` on shadow_figure + reunion_with_deceased
  (existing founder copy is non-NULL).
- INSERTs new rows for patterns that registered signal for the first
  time (likely `piloerection` if Sprint 1B's signal was zero; possibly
  `animal_witness_reaction` if Sprint 1B's row was a 0-signal skip).

**Cost expected:** ~$0.05 (10 Haiku calls × ~$0.005).

### Step 6 — Founder review of re-seeded rows

```sql
SELECT slug, headline, descriptor, denominator_n,
       (phen_families -> 0 ->> 'pct')::int  AS pct_a,
       (phen_families -> 1 ->> 'pct')::int  AS pct_b,
       (phen_families -> 2 ->> 'pct')::int  AS pct_c,
       interpretive_sentence, published, prose_locked
FROM findings_catalogue
ORDER BY publish_order ASC;
```

Look for:
- The 4 vocab-expanded descriptors now have meaningful counts.
- Headlines read naturally ("The same X appears in A, B, and C.").
- Interpretive sentences lead with comparison, include absolute
  count, no banned phrases.

### Step 7 — Hand-rewrite EM + sensed_presence prose

Run the SQL in §1.5 above (the two UPDATE statements). Both should
return `UPDATE 1`.

Verify the rewrites landed:
```sql
SELECT slug, interpretive_sentence
FROM findings_catalogue
WHERE slug LIKE 'electromagnetic_disturbance-%' OR slug LIKE 'sensed_presence-%';
```

### Step 8 — Lock founder-edited prose

```sql
UPDATE findings_catalogue
SET prose_locked = true
WHERE slug LIKE 'shadow_figure-%'
   OR slug LIKE 'reunion-with-deceased-%'
   OR slug LIKE 'electromagnetic_disturbance-%'
   OR slug LIKE 'sensed_presence-%';
```

Verify:
```sql
SELECT slug, prose_locked
FROM findings_catalogue
WHERE prose_locked = true;
-- Expect: 4 rows.
```

### Step 9 — Publish the strong newly-registered Findings

For each of the 4 vocab-expanded descriptors whose row now shows
meaningful counts, run:

```sql
UPDATE findings_catalogue SET published = true WHERE slug = '<slug>';
```

Or batch (after confirming each is strong):
```sql
UPDATE findings_catalogue
SET published = true
WHERE slug LIKE 'animal_witness_reaction-%'
   OR slug LIKE 'piloerection-%'
   OR slug LIKE 'paralysis-%'
   OR slug LIKE 'time_dilation-%';
```

Hold any row whose counts came back below the editorial floor
(`pct < 1%` AND raw count < 100 in every family) — those should
wait for Sprint 1D.

### Step 10 — Smoke-test the prose cron with prose_locked

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://www.discoverparadocs.com/api/cron/refresh-patterns-prose
```

Expected JSON response:
```json
{
  "ok": true,
  "refreshed": <int>,
  "skipped_locked": 4,
  "rejected": [],
  "errors": [],
  "duration_ms": <int>
}
```

Verify the log line: `[CronRefreshPatternsProse] Skipping 4 rows (prose_locked).`

### Step 11 — Force-bust the edge cache

```bash
curl 'https://www.discoverparadocs.com/api/lab/patterns/list?limit=20&cb='"$(date +%s)"
```

Confirm:
- All published Findings render with correct counts.
- The 4 founder-edited rows show their hand-edited prose.
- Mobile @ 375px: FindingCard's family icon strip is visible on the
  Today feed (`today_card`) and on `/lab/patterns` (`grid`); rail
  variant on `/lab` is unchanged.

---

## 3. Quality-bar self-check

- `npx tsc --noEmit` clean on all 5 edited + 1 new file (the
  pre-existing repo errors in `scripts/_check-vector-chunks.ts`,
  `scripts/_debug-triangle-match.ts`, etc., are untouched).
- Mobile-first: FamilyIconSet's box+icon sizing is calibrated to
  375px viewport; the eyebrow + icons share a `flex justify-between`
  row that wraps the icons onto a second line if the eyebrow is
  longer than expected (only "A Witness Pattern" + "A Geographic
  Pattern" are wider than the icon strip).
- Documentary register: Helena 4-editor pattern applied to EM +
  sensed_presence rewrites; `isAdjectivalHaunting` allows the
  "in a haunting" / "filed as a haunting" register the Reunion V2
  pattern depends on.
- Idempotent seed script: contract unchanged from Sprint 1B; the
  4 founder-edited rows are protected at TWO levels (UPSERT NULL-
  check + prose_locked cron skip).
- Migration is paste-ready SQL (`IF NOT EXISTS` makes it idempotent).
- FindingCard visual change: additive only; existing 3 variants
  continue to render; `rail` variant is unchanged.

---

## 4. Pre-conditions confirmed met

- [x] Sprint 1B is live in prod (V11.18.5).
- [x] `paradocs_narrative` is populated across the 232k corpus.
- [x] Existing seed contract preserves founder copy via NULL-check.
- [x] `DescriptorFamily` enum already contains `piloerection`,
      `paralysis`, `time_dilation`, `animal_witness_reaction`
      (Sprint 1B addition).
- [x] `findings_catalogue` table + RLS exist per Sprint 1A migration.
- [x] `npx tsc --noEmit` clean on all 5 edited + 1 new file.

---

## 5. Open questions for founder

1. **`time_dilation` UFO threshold.** The NUFORC half of the UFO
   corpus is short-narrative-skewed; "missing time" is more
   characteristic of long-form abduction accounts (Mack's source
   pool). If the post-apply UFO % is still under 3%, that may reflect
   corpus skew rather than vocabulary miss — recommend ship anyway
   at the absolute count, since 3% of 138k UFO accounts is 4k+
   reports, plenty of signal for a Finding. Founder taste call.

2. **`animal_witness_reaction` editorial floor.** The literature
   says Hynek CE2 effects are HIGH-confidence across all three
   families, but the corpus may underspeak this descriptor because
   first-person narrators don't typically mention animal behavior
   unless prompted. If post-apply we see ≥1% in only one family,
   recommend ship but flag in the Finding card that the cross-family
   shape is asymmetric. Alternatively: rewrite the interpretive
   sentence to highlight whichever single family registers strongly
   (the "one family carries the load" frame is editorially honest).

3. **`piloerection` family triple.** The Sprint 1B vocabulary
   default is `[ghosts_hauntings, ufos_aliens, cryptids]`. Mack's
   abduction literature includes piloerection-at-onset as an
   abduction marker — should we swap `ufos_aliens` to
   `psychological_experiences` if the abduction-NDE overlap is
   higher there post-Sprint-1C? Recommend ship the cryptid/UFO/ghost
   triple as-is (Hynek + Lyme-disease parapsychology literature both
   document this triple) and revisit if Sprint 2's abduction-
   specific descriptors land.

4. **EM + sensed_presence rewrite numbers.** The candidate prose in
   §1.5 uses Sprint 1B's denominators (138,369 for EM; 70,156 for
   sensed_presence). Sprint 1C re-seed may shift those by ≤1%
   because the paralysis vocabulary expansion changes the
   perception_sensory family count slightly. Recommend: founder
   reviews the dry-run output, updates the numbers in the SQL
   templates if drift > 2%, then UPDATEs. If drift is ≤2% the
   numbers in the candidates are acceptable for round-to-thousands
   editorial purposes.

5. **`prose_locked` workflow.** Sprint 1C ships the column +
   cron-respect; founder UPDATEs the 4 rows. Sprint 2 candidate:
   admin-UI toggle on the Findings list (one column "Lock prose"
   checkbox per row). Worth doing if founder edits more than ~6
   rows total in production. Recommend defer.

6. **`static_electricity` cleanup follow-up.** The enum value is
   preserved for backwards-compat, but `seed-hints.ts:1090`,
   `dossier-engine.ts`, `match-engine.ts`, `WatchlistEditor.tsx`,
   and `fingerprint.ts` all reference it. Sprint 2 could migrate
   those references to `piloerection` and drop the enum value.
   Net effect today: zero matches for any code path scanning for
   `static_electricity` (correct behavior — it was deprecated).

---

## 6. Files touched this sprint

```
NEW:
  supabase/migrations/20260609_findings_catalogue_prose_locked.sql
  docs/SPRINT_1C_NOTES.md                                  (this file)

MODIFIED:
  src/lib/patterns/descriptor-vocabulary.ts                 — 4 expanded sets, 1 dropped
  src/components/patterns/FindingCard.tsx                   — FamilyIconSet for grid + today_card
  src/pages/api/cron/refresh-patterns-prose.ts              — prose_locked filter + isAdjectivalHaunting
  scripts/seed-patterns-v1.ts                               — isAdjectivalHaunting (validator parity)
```

**No ingestion-path touches.** NUFORC adapter, classifier-daily cron,
and the nightly counts-refresh cron all continue running undisturbed.

---

**Done.** Sprint 1C vocabulary expansion ready for operator dry-run;
FindingCard's right-side affordance ships on the next deploy; the
prose-lock mechanism is in place for the 4 founder-edited rows; the
Helena validator now distinguishes adjectival vs noun "haunting".
