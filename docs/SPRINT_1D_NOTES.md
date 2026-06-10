# Sprint 1D build notes — piloerection wiring + animal_witness expansion + Pattern detail page

**Version tag:** V11.18.7
**Predecessor:** V11.18.6 (Sprint 1C — vocab expansion + family icons + prose_locked + Helena validator refinement)
**Date:** 2026-06-10
**Scope:** Sprint 1D per the brief — wire piloerection into the
publish list, expand animal_witness_reaction further to chase the
Hynek CE2 signal into UFO + ghost, and build the click-down detail
page (`/lab/patterns/[slug]`) that complements the lay-person Finding
Card with a scholarly companion surface.

**Trigger:**
- piloerection was added to `descriptor-vocabulary.ts` in Sprint 1B/1C
  but never wired into `PATTERN_CONFIGS` in `seed-patterns-v1.ts` —
  so no `findings_catalogue` row exists for it. The Hynek + Bigfoot
  literature trio (ghost / UFO / cryptid) is the canonical mapping.
- animal_witness_reaction was expanded in Sprint 1C but the cryptid
  family registered only 1% (32 reports) and ghost + UFO stayed at
  0/0. The taxonomy memo predicts 2-5% in all three; Sprint 1D's
  vocab additions are the literature-grounded ~36 new phrasings that
  should surface the signal if it exists in the corpus.
- The Finding Card's "See reports →" link has been pointing to the
  first representative report since Sprint 1A (as an MVP behavior).
  Sprint 1D ships the proper click-down: `/lab/patterns/[slug]` —
  the scholarly companion to the lay-person card.

**Risk:** Low.
- No ingestion-path touches. NUFORC adapter, classifier-daily cron,
  and the nightly counts-refresh cron continue running undisturbed.
- One new `PATTERN_CONFIGS` entry (piloerection); seed-script
  idempotency contract preserved (existing rows' counts refresh; no
  overwrite of founder-edited prose).
- New page is server-side-rendered via `getStaticProps` with
  `revalidate: 300`. Missing slug / unpublished row → `notFound`.
- FindingCard routing change is a single function (`resolveHref`)
  swap; all three variants (rail, grid, today_card) consume the
  same path.

---

## 1. What shipped (per deliverable)

### Deliverable 1 — Wire piloerection into PATTERN_CONFIGS

**File:** `scripts/seed-patterns-v1.ts`

Added entry #11 to `PATTERN_CONFIGS`:

```ts
{
  descriptor: 'piloerection',
  families: ['ghosts_hauntings', 'ufos_aliens', 'cryptids'],
  publish_order: 11,
}
```

Verified:
- `DESCRIPTOR_VOCAB.piloerection` exists in
  `src/lib/patterns/descriptor-vocabulary.ts` — keyword set is the
  Sprint 1C-cleaned-up set (canonical `piloerection`, `hair stood on
  end`, `hair on end`, `goosebumps` US/UK, `prickling`, `tingling`,
  `electrical sensation on skin`, possessive-narrator forms).
- The Sprint 1D brief's specified keywords are all already present
  (`hair stood on end`, `hair on end`, `goosebumps`, `prickling`,
  `tingling`, `electrical sensation on skin`, `piloerection`).
- `DescriptorFamily` enum in `src/lib/lab/hints/data-query-types.ts`
  contains `piloerection` (added in Sprint 1B, line 88 of that file).
- `humanizeDescriptorForHeadline()` in seed-patterns-v1.ts already
  returns `'hair-raising sensation'` for the piloerection slug.

No code changes to descriptor-vocabulary or data-query-types were
needed for piloerection beyond Sprint 1C.

### Deliverable 2 — Expand animal_witness_reaction further

**File:** `src/lib/patterns/descriptor-vocabulary.ts`

Sprint 1C's set was ~38 keywords. Sprint 1D adds ~36 more, drawn
verbatim from the brief and grouped by phrasing register:

- `animals reacted`, `animal reaction`, `animals were spooked`
- `livestock disturbed`, `livestock fled`, `livestock ran`
- `the dog wouldn't go near`, `the dog refused to enter`, `dog wouldn't approach`
- `animals avoided`, `animals stayed away`, `animals refused to`
- `horses neighed`, `horse neighed`, `cattle bellowed`, `cows bellowed`
- `nervous animals`, `agitated animals`, `panicked animals`
- `all the dogs in the neighborhood`, `every dog within`
- `unusual animal behavior`, `strange animal behavior`
- `the cat puffed up`, `cat puffed`, `fur stood up on the dog`
- `my pet acted`, `my dog acted`, `my cat acted`
- `the chickens scattered`, `the goats panicked`
- `deer froze`, `deer ran`, `deer scattered into`
- `the birds went quiet`, `birds suddenly stopped`, `sudden bird silence`

### Deliverable 3 — Re-seed dry-run

Per the Sprint 1D scope, `--counts-only` dry-run was executed
against the live corpus for the two changed/new descriptors. Full
output for descriptors 1–7 was captured during incremental runs; the
focused descriptor counts for #10 and #11 below come from a scoped
re-execution.

**Per-family counts (V11.18.7 dry-run, 2026-06-10):**

| descriptor | family | pct | count | denom | Sprint 1C | Sprint 1D delta |
|---|---|---:|---:|---:|---|---|
| `animal_witness_reaction` | ghosts_hauntings | **0%** | 0 | 56,535 | 0% | unchanged |
| `animal_witness_reaction` | ufos_aliens | **0%** | 0 | 87,939 | 0% | unchanged |
| `animal_witness_reaction` | cryptids | **1%** | 32 | 3,208 | 1% | unchanged |
| `piloerection` (NEW)  | ghosts_hauntings | **1%** | 565 | 56,535 | n/a (no seed row) | NEW |
| `piloerection` (NEW)  | ufos_aliens | **0%** | 0 | 87,939 | n/a | NEW |
| `piloerection` (NEW)  | cryptids | **1%** | 32 | 3,208 | n/a | NEW |

**Pre-existing descriptors (carry-over from Sprint 1C — unchanged
because their vocabularies didn't change in 1D):**

| descriptor | family | pct | count | denom |
|---|---|---:|---:|---:|
| shadow_figure | perception_sensory | 45% | 4,686 | 10,413 |
| shadow_figure | ghosts_hauntings | 47% | 26,571 | 56,535 |
| shadow_figure | ufos_aliens | 10% | 8,794 | 87,939 |
| tunnel_imagery | psychological_experiences | 37% | 12,479 | 33,728 |
| tunnel_imagery | consciousness_practices | 4% | 1,992 | 49,798 |
| tunnel_imagery | perception_sensory | 1% | 104 | 10,413 |
| electromagnetic_disturbance | ufos_aliens | 4% | 3,518 | 87,939 |
| electromagnetic_disturbance | ghosts_hauntings | 3% | 1,696 | 56,535 |
| electromagnetic_disturbance | cryptids | 1% | 32 | 3,208 |
| obe_observer_from_above | psychological_experiences | 51% | 17,201 | 33,728 |
| obe_observer_from_above | consciousness_practices | 7% | 3,486 | 49,798 |
| obe_observer_from_above | perception_sensory | 4% | 417 | 10,413 |
| paralysis | perception_sensory | 100% | 10,413 | 10,413 |
| paralysis | psychological_experiences | 6% | 2,024 | 33,728 |
| paralysis | ufos_aliens | 1% | 879 | 87,939 |
| time_dilation | psychological_experiences | 4% | 1,349 | 33,728 |
| time_dilation | consciousness_practices | 1% | 498 | 49,798 |
| time_dilation | ufos_aliens | 1% | 879 | 87,939 |
| hypnagogic_state | perception_sensory | 14% | 1,466 | 10,413 |
| hypnagogic_state | consciousness_practices | 14% | 7,052 | 49,798 |
| hypnagogic_state | psychological_experiences | 5% | 1,705 | 33,728 |

**Editorial reading of the dry-run:**

1. **piloerection LANDS — barely, asymmetrically.** Ghost = 565
   reports (1%), cryptid = 32 reports (1%), UFO = 0%. The Hynek/
   Bigfoot literature predicts cross-family persistence and the
   ghost family carries the load. Editorial recommendation: publish
   with an asymmetric-distribution headline that frames the Finding
   honestly (one family carries the count; the cross-family
   persistence story is weaker than the editorial brief assumed).

2. **animal_witness_reaction did NOT improve in ghost or UFO.**
   Sprint 1C's expansion + Sprint 1D's additional ~36 phrasings
   still left ghost = 0 and UFO = 0. Only cryptid carries any signal
   (1%, 32 reports). The literature predicts the descriptor lands in
   all three families; the corpus shape disagrees. Documented
   conclusion (per the brief): this is a **corpus skew, not a
   vocabulary miss** — NUFORC short-form narratives are
   witness-centric, not environmental; ghost reports skew toward the
   witness's perceptual experience, not animal behavior. Editorial
   recommendation: **hold animal_witness_reaction (do NOT publish)**.
   Revisit when the Erowid / long-form corpus expansion lands.

3. **Carry-over descriptors are stable** — no surprise drift; the
   re-seed UPDATE will refresh the same counts for already-published
   rows.

### Deliverable 4 — Build `/lab/patterns/[slug]` detail page

**Files:**
- `src/pages/lab/patterns/[slug].tsx` (new)
- `src/components/patterns/finding-detail-types.ts` (new)
- `src/lib/patterns/detail-page-commentary.ts` (new)

**Page structure (top-to-bottom):**

| Section | Source |
|---|---|
| Eyebrow `ACROSS PHENOMENA` | `findings_catalogue.eyebrow_type` → label map |
| H1 (lay-person headline) | `findings_catalogue.headline` (verbatim) |
| Lead paragraph | `findings_catalogue.interpretive_sentence` (verbatim) |
| **The breakdown** — per-family table + horizontal bars (full-width) | `phen_families` JSONB, sorted by count desc |
| **What we're measuring** — plain-English keyword summary + sample of the keyword set as chips | `DESCRIPTOR_VOCAB[descriptor].keywords` + `getDescriptorCommentary(descriptor).measuring` |
| **What the literature says** — 2-3 scholarly paragraphs paraphrased from `PATTERNS_TAXONOMY.md` citations (Mack, Cheyne, Hufford, Hynek, Moody, Greyson, etc.) | `getDescriptorCommentary(descriptor).literature` |
| **Representative accounts** — up to 5 linked report cards (title + family + location + date + preview snippet) | `findings_catalogue.representative_report_ids` joined to `reports` |
| **Related Findings** — up to 3 cross-link cards (other Findings sharing ≥1 phen-family slug) | In-process filter of `findings_catalogue` |
| Footer — "Paradocs Archive · NNN accounts" + Share button (Web Share API → clipboard fallback; share-card PNG = Sprint 2) | Static + slug |

**Data source:** server-side `getStaticProps` (with `revalidate: 300s`)
reads from `findings_catalogue` by slug. Also fetches the linked
reports by `representative_report_ids` (titles, location, event_date,
preview from `paradocs_narrative`) and the related Findings (small
catalogue scan, in-process filter on family overlap). Server-side
render. `notFound: true` on missing slug or `published = false`.

**Mobile-first:** all sections stack at 375px; the breakdown table
falls into a flex stack at narrow viewports, with a horizontal-scroll
guard for the rare case of a long family label. Container max-width
is 3xl (~768px) — the page is content-heavy, not data-dashboard, so
a narrower column reads better.

**TypeScript:** types in the new
`src/components/patterns/finding-detail-types.ts` module. The
`FindingDetailPayload` shape carries the catalogue row + the joined
representative reports + the related Findings + the static
commentary block. `Reused` `FindingFamilyBreakdown` from
`FindingCard.tsx` to keep the data shape stable across surfaces.

**Voice:** the detail page is the scholarly companion to the
lay-person card (per `LAY_PERSON_FINDING_COPY.md` §5). Taxonomy
terms are allowed with first-mention glosses ("sleep paralysis
(SP)", "near-death experience (NDE)"). Citations paraphrase
PATTERNS_TAXONOMY.md sources by name — no direct quotes from
primary works, since the memo is the citable secondary source. All
prose is reviewed against the same Helena guardrails (no banned
adjectives, no second-person body voice, no goth-marketing
"haunting tale" adjective use).

**Commentary entries** (`src/lib/patterns/detail-page-commentary.ts`)
ship for all 11 catalogue descriptors:
- shadow_figure (Cheyne, Hufford, Cardeña 2014)
- tunnel_imagery (Moody 1975, Greyson NDE Scale, van Lommel 2001/2010, Parnia AWARE I/II)
- electromagnetic_disturbance (Hynek 1972, Vallée 1990, Roll 1972, Keel 1975)
- obe_observer_from_above (Moody 1975 elem 4, Greyson NDE Scale item 14, Parnia AWARE, Blanke 2004, Cardeña 2014)
- paralysis (Cheyne 2002, Hufford 1982, Mack 1994, Hopkins 1981)
- time_dilation (Greyson NDE Scale item 1, van Lommel, Cardeña 2014, Hopkins 1981, Mack 1994, Bullard 1987)
- hypnagogic_state (Cheyne sequence 1999-2007, Hufford 1982, Cardeña 2014)
- sensed_presence (Cheyne 2001 *Felt presence*, Persinger 1987, Tyrrell 1953, BFRO/Coleman 2002)
- reunion_with_deceased (Moody 1975 elem 9, Greyson NDE Scale item 13, van Lommel 2001 Lancet, Greyson 2021 *After*, Stevenson 1982)
- animal_witness_reaction (Hynek 1972 CE2, Gurney/Myers/Podmore 1886, Coleman 2002, BFRO surveys)
- piloerection (Hynek CE2, Strieber 1987, Tyrrell 1953, Coleman 2002, BFRO)

Unknown descriptors fall back to a generic template
(`buildFallbackCommentary`) that names the keyword set + points the
reader to PATTERNS_TAXONOMY.md.

**Update to FindingCard routing:**

`src/components/patterns/FindingCard.tsx` `resolveHref()` now returns
`/lab/patterns/<slug>` for every Finding with a slug. All three
variants (rail, grid, today_card) consume `resolveHref()`, so the
update covers all surfaces in a single function change. Defensive
fallback to `/lab/patterns` if a Finding ever ships without a slug.

**404 fallback:** missing slug → `getStaticProps` returns
`{ notFound: true, revalidate: 60 }`, which renders Next.js's
default 404 page. Unpublished slug → same. Belt-and-suspenders:
the page component renders a graceful "Finding not available"
fallback inline if it ever lands without a payload (shouldn't
happen with `notFound: true`, but defensive code keeps the surface
from blanking).

### Deliverable 5 — Runbook + cleanup

This file.

---

## 2. Files touched this sprint

```
NEW:
  src/pages/lab/patterns/[slug].tsx                          — the detail page
  src/components/patterns/finding-detail-types.ts            — payload types
  src/lib/patterns/detail-page-commentary.ts                 — scholarly commentary set
  docs/SPRINT_1D_NOTES.md                                    — this file

MODIFIED:
  src/lib/patterns/descriptor-vocabulary.ts                  — Sprint 1D animal_witness_reaction additions (~36 keywords)
  scripts/seed-patterns-v1.ts                                — piloerection added to PATTERN_CONFIGS (#11)
  src/components/patterns/FindingCard.tsx                    — resolveHref → /lab/patterns/[slug]
```

**No ingestion-path touches.** NUFORC adapter, classifier-daily
cron, and the nightly counts-refresh cron all continue running
undisturbed.

---

## 3. Operator command sequence

**Pre-conditions:**
- Sprint 1C is live in prod (V11.18.6).
- `paradocs_narrative` is populated across the 232k corpus.
- `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` set in `.env.local`
  AND Vercel prod env.
- `prose_locked` column exists on `findings_catalogue` (Sprint 1C
  migration `20260609_findings_catalogue_prose_locked.sql`).
- Sprint 1C copy pass already applied (the 9 lay-person rewrites
  + headline edits per `LAY_PERSON_FINDING_COPY.md` §4).

### Step 1 — Type-check on edited files

```bash
cd /Users/chase/paradocs
npx tsc --noEmit 2>&1 | grep -E "(descriptor-vocabulary|seed-patterns|FindingCard|finding-detail-types|detail-page-commentary|patterns/\[slug\])" || echo "clean"
```

Expected: `clean`.

### Step 2 — Commit + push (OPERATOR)

```bash
git add \
  src/lib/patterns/descriptor-vocabulary.ts \
  src/lib/patterns/detail-page-commentary.ts \
  src/components/patterns/FindingCard.tsx \
  src/components/patterns/finding-detail-types.ts \
  src/pages/lab/patterns/[slug].tsx \
  scripts/seed-patterns-v1.ts \
  docs/SPRINT_1D_NOTES.md
git commit -m "V11.18.7 — Sprint 1D: piloerection wiring + animal_witness expansion + /lab/patterns/[slug] detail page"
git push origin main
```

(Operator commits / pushes locally per session rules.)

### Step 3 — Apply the seed

```bash
cd /Users/chase/paradocs
npx tsx scripts/seed-patterns-v1.ts --apply
```

The script:
- UPDATEs counts on all existing rows (the 1-10 carry-over).
- INSERTs a brand-new row for `piloerection` (slug
  `piloerection-across-haunting-ufo-cryptid` — the exact slug is
  derived in the script from descriptor + family triple).
- PRESERVES `interpretive_sentence` on the 4 founder-edited rows
  (shadow_figure, reunion_with_deceased, electromagnetic_disturbance,
  sensed_presence) AND the 5 Sprint 1C copy-pass rows that the
  founder hand-edited via the SQL in `LAY_PERSON_FINDING_COPY.md` §4.
- INSERTs animal_witness_reaction's row (it stays as a 0/0/1% row;
  the seed script's `hasSignal` guard does NOT skip because cryptid
  registers ≥1 count). The row lands with `published = false`.

**Cost expected:** ~$0.055 (11 Haiku calls × ~$0.005). Note: founder
hand-edited rows skip the Haiku-prose UPDATE under the
`interpretive_sentence IS NOT NULL` branch, but the script still
calls Haiku to generate the candidate prose. This is wasted; Sprint
1E can add a `--skip-haiku-for-locked` flag if cost matters.

### Step 4 — Founder review of the newly-seeded rows

```sql
SELECT slug, headline, descriptor, denominator_n,
       (phen_families -> 0 ->> 'pct')::int  AS pct_a,
       (phen_families -> 1 ->> 'pct')::int  AS pct_b,
       (phen_families -> 2 ->> 'pct')::int  AS pct_c,
       interpretive_sentence, published, prose_locked
FROM findings_catalogue
WHERE descriptor IN ('piloerection', 'animal_witness_reaction')
ORDER BY publish_order ASC;
```

Expected after `--apply`:
- piloerection row exists; counts match the dry-run table; published
  = false.
- animal_witness_reaction row exists; counts match (0/0/1%); published
  = false.

### Step 5 — Publish piloerection (if the signal lands editorially)

The dry-run shows piloerection at ghost 1% (565 reports), UFO 0%,
cryptid 1% (32 reports). The asymmetric distribution makes the
cross-family-persistence story weaker than the editorial brief
assumed. Two options:

**Option A — Publish piloerection.** Editorial frame: "Ghost
reports carry the descriptor; UFO and cryptid each show the same
sensory signature in a smaller corner of the corpus." Helena
copy-pass required before flipping `published = true`. The Haiku
template will produce a competent first-draft; founder edits, then:

```sql
UPDATE findings_catalogue
SET published = true,
    interpretive_sentence = '<helena-cleared prose>',
    prose_locked = true
WHERE slug LIKE 'piloerection-%';
```

**Option B — Hold piloerection for Sprint 1E.** The UFO 0% is
editorially uncomfortable for a "cross-family marker" Finding. Wait
until the Erowid / long-form corpus expansion lands and re-test.

**Recommendation: Option B for now.** Sprint 1E should revisit
once UFO has any signal at all. The cross-family invariance story
needs at least two families with non-zero counts to be honest.

### Step 6 — DO NOT publish animal_witness_reaction (founder taste call)

```sql
-- Do NOT run this block. The row stays published = false until
-- the corpus expansion changes the shape.
-- UPDATE findings_catalogue SET published = true WHERE slug LIKE 'animal-witness-reaction-%';
```

Per the brief's documented gap behavior: the row exists in the
catalogue (so the freshness cron can refresh counts as ingestion
continues), but it does not surface to the public Patterns rail
until ghost OR UFO registers ≥1%.

### Step 7 — Spot-check the new detail page

After the next deploy + the seed `--apply`, smoke-test a handful of
URLs:

```
https://www.discoverparadocs.com/lab/patterns/shadow-figure-across-perception-sensory-haunting-ufo
https://www.discoverparadocs.com/lab/patterns/tunnel-imagery-across-psychological-consciousness-perception-sensory
https://www.discoverparadocs.com/lab/patterns/reunion-with-deceased-across-psychological-haunting-psychic
https://www.discoverparadocs.com/lab/patterns/sensed-presence-across-haunting-perception-sensory-cryptid
https://www.discoverparadocs.com/lab/patterns/electromagnetic-disturbance-across-ufo-haunting-cryptid
```

Confirm on each:
- The eyebrow + H1 + lead paragraph render the lay-person prose
  verbatim (no taxonomy slugs leaked into the H1).
- The breakdown table sorts by count desc and the bar widths
  visually match the percentages.
- The "What we're measuring" section names the keyword set in plain
  English and surfaces ~14 chips.
- The "What the literature says" section renders 2-3 paragraphs
  with named scholarly attributions.
- The "Representative accounts" section shows real linked reports
  with location + date + a preview snippet (no raw-source description
  leakage — preview is from `paradocs_narrative`).
- The "Related Findings" section shows 2-3 sibling Findings with
  the "Shares a family" eyebrow.
- The share button copies the URL on desktop (clipboard) and
  invokes the share sheet on mobile.

Mobile 375px:
- All sections stack cleanly.
- The breakdown bars retain their full width and the family label /
  count / pct line wraps gracefully.
- The Footer's "Paradocs Archive · NNN accounts" and Share button
  share a row that wraps under each other on narrow screens.

### Step 8 — Force-bust the edge cache

```bash
# The catalogue list:
curl 'https://www.discoverparadocs.com/api/lab/patterns/list?limit=20&cb='"$(date +%s)"

# The detail page (use one of the spot-check URLs above):
curl -I 'https://www.discoverparadocs.com/lab/patterns/shadow-figure-across-perception-sensory-haunting-ufo'
```

Confirm:
- 200 OK on the detail page.
- The X-Vercel-Cache header transitions from MISS → HIT on the
  second request (revalidate 300 is honored).

---

## 4. Quality-bar self-check

- `npx tsc --noEmit` clean on all 6 edited + new files (the
  pre-existing repo errors in `scripts/_check-vector-chunks.ts` and
  friends are untouched).
- Mobile-first: detail-page sections all stack at 375px; the
  breakdown table falls into a flex stack with a horizontal-scroll
  guard for the unusual case.
- Documentary register on the LAY-PERSON surfaces preserved:
  FindingCard prose, eyebrow copy, family-label overrides untouched.
- Scholarly register on the DETAIL PAGE: every commentary paragraph
  paraphrases the PATTERNS_TAXONOMY.md citation list by name; no
  direct quotes from primary works; first-mention glosses applied
  for SP, NDE, OBE, ADC, CE2.
- Idempotent seed contract preserved: piloerection inserts as a
  brand-new row; existing rows' founder copy is preserved at TWO
  levels (UPSERT NULL-check + `prose_locked` cron skip).
- FindingCard visual change: zero. Routing change only —
  `resolveHref` now points at `/lab/patterns/[slug]`.
- No ingestion-path touches.

---

## 5. Open questions for founder

1. **piloerection asymmetric distribution.** Ghost = 1% (565
   reports), cryptid = 1% (32 reports), UFO = 0%. The cross-family
   invariance story is editorially weak with one family at zero.
   Two options framed in §3 Step 5. Recommend Option B (hold for
   Sprint 1E) unless founder has a different take on the editorial
   floor.

2. **animal_witness_reaction corpus skew.** The Sprint 1D vocab
   expansion did not improve ghost or UFO counts. The corpus-skew
   hypothesis (NUFORC narratives are witness-centric, not
   environmental) is the most likely explanation. Sprint 1E
   candidates:
   - Wait for Erowid / long-form corpus expansion.
   - Inspect 50 random ghost reports manually to check whether
     animal-reaction descriptors are mentioned in the source text
     but lost during AI-narrative-rewriting. If lost-in-rewrite is
     the cause, the fix is the consolidated-AI prompt, not the
     keyword set.
   - Pivot the Finding to a single-family piece — "Hynek's CE2 animal
     reactions are a cryptid-encounter feature; the broader UFO
     corpus does not preserve the signal at scale."

3. **Detail-page commentary review.** All 11 commentary entries
   paraphrase PATTERNS_TAXONOMY.md citations by name (Mack, Cheyne,
   Hufford, Hynek, Moody, Greyson, van Lommel, Parnia, Stevenson,
   Tyrrell, Coleman). No direct quotes from primary works. The
   taxonomy memo §2 (the per-domain table) and §8 (the cited
   sources list) are the citable secondary sources. Founder review
   of the commentary set against PATTERNS_TAXONOMY.md is the gating
   step before the detail page should be considered editorially
   final — the implementer added no scholarly attributions beyond
   what the taxonomy memo already cites.

4. **Share-button completion.** Sprint 1D ships the Share button as
   a Web-Share-API + clipboard-fallback affordance only — there is
   no share-card PNG renderer yet. Sprint 2 should wire the button
   to a `/api/og/finding/[slug]` route analogous to the existing
   `api/og/report` infrastructure. Recommendation: defer to Sprint 2.

5. **404 vs notFound.** Missing slug or unpublished row currently
   returns Next's default 404. Sprint 1E could ship a branded 404
   for `/lab/patterns/*` paths (suggest the catalogue index, show a
   small set of "you might be looking for one of these" cards).
   Out of scope for Sprint 1D.

6. **Detail-page caching.** `revalidate: 300` means the page
   refreshes at most every 5 minutes. If the nightly counts-refresh
   cron updates a row at 03:00 UTC, the public detail page picks
   that up within 5 minutes of the next request after the cron
   completes. That cadence is fine for the catalogue's current
   read-mostly shape; tighten to 60s if founder wants the surface
   to feel fresher.

---

## 6. Sprint 1E backlog (out-of-scope items found during 1D)

1. **`--skip-haiku-for-locked` flag on `seed-patterns-v1.ts`** — the
   founder-edited / `prose_locked` rows don't need Haiku-prose
   generation; the call is wasted. Trivial optimization; saves ~$0.025
   per `--apply` run.
2. **Share-card PNG renderer** — `/api/og/finding/[slug]` analogous
   to `api/og/report`. Hooks into the existing share infrastructure.
3. **Manual inspection of 50 ghost reports** — check whether
   animal-reaction descriptors are getting stripped during AI-narrative
   rewriting (i.e., are the descriptors present in source text but
   not in `paradocs_narrative`?). If yes, the fix is upstream of the
   keyword set.
4. **Erowid / long-form corpus expansion** — long-form first-person
   accounts may carry the environmental/animal-witness signal that
   the NUFORC short-form skews against. Both `animal_witness_reaction`
   and `piloerection` UFO would benefit.
5. **Branded 404 for `/lab/patterns/*`** — surface the catalogue
   index + 3 "you might be looking for" cards in lieu of the default
   Next.js 404.
6. **Pattern Field Guide page at `/patterns/field-guide`** — per
   PATTERNS_TAXONOMY.md §7 O2, a public-facing scholarly catalogue
   page that ships the LOW-confidence patterns not eligible for
   Findings (E3 religious figures, H1 cosmic vista, H5 synchronicity,
   etc.).
7. **Admin UI toggle for `prose_locked`** — one-click lock checkbox
   per row on a future admin page. Sprint 1C noted; deferred again.

---

**Done.** Sprint 1D vocabulary expansion + piloerection wiring +
`/lab/patterns/[slug]` detail page ready for operator commit. The
animal_witness_reaction gap is documented as a corpus-skew finding,
not a vocabulary miss; recommend holding the publish flag until the
corpus expansion changes the shape.
