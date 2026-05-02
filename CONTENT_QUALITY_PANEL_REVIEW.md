# Today (/discover) — Content Quality Panel Review

**Cohort:** Gaia + Contact-in-the-Desert paranormal-curious adults.
**Reviewers:** Content Strategy, UX Engagement, Editorial, Information Quality, AI/Prompting.
**Date:** May 2 2026.
**Triggered by:** Chase's QA — cards "talk about something before actually telling readers what it is" + factual errors (Loch Ness 5/1/1933 vs. correct July 22, 1933).

---

## Executive summary

The current feed copy is engagement-optimized but cohort-mismatched. The V5-and-prior prompts treat the reader like a paranormal insider — "Three Navy pilots tracked it on infrared at 80,000 feet" is great copy if you already know what *it* is, useless if you don't. For the Gaia subscriber walking up to the booth at Contact in the Desert who has never heard of Pali Canon, USS Nimitz tramp, the Spicer photo, the Patterson-Gimlin film, or Roko's Basilisk — the hook makes them feel left out, not curious.

Plus: the underlying data has factual drift. The Loch Ness `first_reported_date` field says 1933-05-01; the AI-generated `ai_quick_facts.first_documented` correctly says "July 22, 1933." Neither layer cross-validates the other. This is one example of a class of problem affecting an unknown number of phenomena and surfacing through the OnThisDate card on the wrong date.

Three fixes, in order:

1. **Prompt revision (shipped).** V6 prompts now require Sentence 1 to lead with plain-language identification ("Scotland's most famous lake monster, reported from Loch Ness since 1933.") before Sentence 2 carries the engagement tension. Both phenomena and reports.
2. **Regeneration script.** Curl the existing admin endpoints with the new prompts. ~5,000 phenomena + ~30 reports = roughly $4–8 of Claude Haiku spend, runs overnight.
3. **Date audit + correction script.** SQL to find phenomena where `first_reported_date` doesn't agree with `ai_quick_facts.first_documented`, plus a Claude-Haiku batch endpoint that can re-extract correct first-reported dates from the AI history field.

---

## Panel observation 1 — "Lead with what it is"

### What was wrong (V5 prompts and prior)

The V5 prompts said *"Lead with numbers, names, dates, or places — never abstractions."* That's correct *engagement* advice but wrong *clarity* advice. A hook for the Pali Canon was generated as:

> "Four centuries of manuscript transmission, 47 major Pali Canon recensions across Southeast Asia. The earliest texts describe identical miracles — levitation, telepathy, weather control — yet archeological records show no contemporary documentation of these events during his lifetime."

This is gorgeous if you already know "Pali Canon = Buddha's earliest teachings preserved in oral and manuscript tradition." For the Gaia cohort it reads as "I clearly missed something — there's a thing called the Pali Canon and it has 47 recensions and I don't know what a recension is."

### Comparable products

- **Apple News:** "An ape-like creature reported in the Pacific Northwest. Footprint casts...." Always identifies the creature class first.
- **Wikipedia article ledes:** "X is a Y in Z" structure. Universally read; universally clear.
- **Atlas Obscura:** "A lake in Scotland said to harbor a serpent-like creature first photographed in 1934." Identification, then specifics.
- **Substack culture/curiosity newsletters (e.g. Defector, Today in Tabs):** Identify the subject in the first 6 words; then twist into the angle.

### V6 prompt structure (now in code)

Sentence 1 — IDENTIFICATION. Plain-language description of what this thing IS. Within 8 words a stranger to the topic must understand "this is a [class of phenomenon] in [place/era]". The phenomenon's name is *additional information*, never the anchor.

Sentence 2 — HOOK. The unresolved tension or striking detail that makes the reader tap.

### Examples (V6 prompt-generated)

| Bad (V5) | Good (V6) |
|----------|-----------|
| "Four centuries of manuscript transmission, 47 major Pali Canon recensions..." | "The Buddha's earliest teachings, preserved in 47 manuscript versions across Southeast Asia. All describe identical miracles..." |
| "Three Navy pilots tracked it on infrared at 80,000 feet..." | "A UFO encounter over the Pacific in 2004 involving F/A-18 pilots from the USS Nimitz. The object descended from 80,000 feet to sea level in 0.78 seconds." |
| "Over 10,000 sightings since 1958..." | "An ape-like creature reported in the Pacific Northwest since the 1950s. Over 10,000 sightings concentrated in a 90-mile corridor..." |

---

## Panel observation 2 — Factual drift (Loch Ness date issue)

### Diagnosis

The Loch Ness phenomenon row in the database has at least four fields that should agree but don't:

- `phenomena.first_reported_date` (DATE column) — drives OnThisDate card surfacing. Reportedly `1933-05-01`.
- `phenomena.ai_history` (TEXT column with full encyclopedia history) — describes the Spicer sighting in July 1933, correctly.
- `phenomena.ai_quick_facts.first_documented` (JSONB field, AI-authored) — reportedly says "July 22, 1933" or "1933".
- The encyclopedia page UI displays both `first_reported_date` (formatted) AND the structured `ai_quick_facts.first_documented` text, leading to the visible inconsistency.

The likely root cause is ingestion-time placeholder dates. When the original phenomenon row was seeded, `first_reported_date` may have been set to `'1933-01-01'` or `'1933-05-01'` (a default May Day) when only the year was known, and never re-populated when `ai_quick_facts` was generated.

### Audit SQL — run in Supabase SQL Editor

```sql
-- Find phenomena where first_reported_date might be wrong.
-- Strategy: extract any 4-digit year from ai_quick_facts.first_documented;
-- compare to year from first_reported_date. Suspect: same year but
-- different month/day, OR ai_quick_facts says "early 1930s" but the
-- date column says 1930-01-01 (placeholder).
SELECT
  p.id,
  p.slug,
  p.name,
  p.first_reported_date,
  p.ai_quick_facts->>'first_documented' AS ai_first_documented,
  CASE
    WHEN p.first_reported_date IS NULL THEN 'no_date'
    WHEN EXTRACT(MONTH FROM p.first_reported_date) = 1
         AND EXTRACT(DAY FROM p.first_reported_date) = 1 THEN 'jan1_placeholder'
    WHEN EXTRACT(MONTH FROM p.first_reported_date) = 5
         AND EXTRACT(DAY FROM p.first_reported_date) = 1 THEN 'may1_placeholder'
    ELSE 'plausible'
  END AS date_quality
FROM phenomena p
WHERE p.first_reported_date IS NOT NULL
  AND p.ai_quick_facts->>'first_documented' IS NOT NULL
  AND p.status = 'active'
ORDER BY date_quality DESC, p.report_count DESC NULLS LAST
LIMIT 200;
```

This will surface every phenomenon where `first_reported_date` is a Jan 1 or May 1 placeholder. Expect 100+ rows.

### Audit SQL #2 — surface OnThisDate cards likely surfacing on wrong dates

```sql
-- The OnThisDate API surfaces phenomena where first_reported_date matches
-- today's month/day. Any with placeholder dates are firing on the wrong day.
SELECT
  to_char(first_reported_date, 'MM-DD') AS month_day,
  count(*) AS phenomena_with_this_date
FROM phenomena
WHERE first_reported_date IS NOT NULL
GROUP BY month_day
ORDER BY phenomena_with_this_date DESC
LIMIT 20;
```

If you see "01-01" or "05-01" with 50+ phenomena, those are placeholder dumps that will all surface on those single days — the OnThisDate card will be useless on Jan 1 and May 1, and absent the rest of the year.

### Fix paths (in order of effort)

**Path A — Immediate UI mitigation (5 minutes, no data changes):** Filter the OnThisDate API to skip phenomena whose `first_reported_date` is a Jan 1 or May 1 placeholder. Code change below.

**Path B — Re-extract dates from ai_history (~$3 in Claude Haiku spend, ~30 minutes runtime):** New admin endpoint that asks Claude Haiku to extract the most accurate first-reported-date from `ai_history` text and writes it back to `first_reported_date`. Runs as a batch job.

**Path C — Manual curation of high-traffic phenomena (~1 hour):** For the top 50 phenomena by `report_count`, manually verify dates against Wikipedia / source material. Loch Ness, Roswell, Bell Witch, etc. all deserve hand-checking.

I recommend Path A immediately + Path B overnight + Path C for the curated case files (Roswell cluster, Rendlesham cluster).

---

## Panel observation 3 — Header structure beyond the hook

### What V6 prompts do not yet address

The hook is just the engagement entry. Once a card expands, the user reads `paradocs_narrative` (for reports) or `ai_description` (for phenomena). The V5 narratives are competent but sometimes assume the same prior knowledge. Recommendations for next regeneration pass:

- **Lede-first paragraphs.** First paragraph of every narrative restates what the case is, in plain terms, before the analysis.
- **Section headings on long entries.** Anything over 600 chars should have semantic chunking ("Witnesses", "Evidence", "Contradictions", "Mainstream explanations") instead of a wall of text.
- **Cross-references with explanatory tooltips.** When a narrative says "Project Blue Book" or "MUFON" or "the SPR," those phrases should be hover-tooltips with one-line definitions for cohort-strangers.
- **Skeptical-perspective paragraph required.** Mass-market trustworthiness depends on naming the mainstream / skeptical view alongside the case. Currently optional in narratives.

These are V7+ items.

### What the encyclopedia page currently does well

The encyclopedia (/phenomena/[slug]) generally has good narrative quality — `ai_history` and `ai_characteristics` etc. are at length and read well. The issue is the **feed_hook layer** which was optimized for swipe-engagement and lost the lede.

---

## Panel observation 4 — Tone calibration for the cohort

### What the cohort responds to

Gaia subscribers + paranormal-curious adults consume content like:
- *Hellier* (Substack docuseries), *The UFO Investigations* (Reddit longform), *Astonishing Legends* (podcast), *In Search of...* (Leonard Nimoy 1976), *Unsolved Mysteries* (Robert Stack 1987–2002).
- Patterns: documentary calm voice, no hype, named witnesses, named places, named dates, careful sourcing, occasional admission of limits.

### What they don't respond to

- TikTok-style ALL-CAPS HOOK ALERT phrasing.
- "You won't believe what happened next."
- "Skeptics hate this one weird trick."
- Vague spook ("strange," "eerie," "haunting"). All already banned in prompt.
- Authority-without-evidence claims ("Scientists confirm...").

### What the prompt should add (V7)

- A "documentary voice" instruction: "Write as Robert Stack would narrate this case — calm, factual, precise, with named sources."
- An explicit instruction to credit named witnesses, named institutions, named investigators when present.
- An instruction to flag what's CONFIRMED vs. what's CLAIMED. ("The Pentagon released the radar tapes" vs. "Witnesses claim the object accelerated impossibly.")

These belong in V7 once V6 ships and we measure tap-through.

---

## Roadmap

### Now (this commit)

1. **V6 prompts shipped** in `feed-hook.service.ts` (reports) and `generate-phenomena-hooks.ts` (phenomena). Lead-with-identification rule. Updated examples. ✅
2. **OnThisDate API placeholder-date guard** — filter out phenomena where `first_reported_date` is a known placeholder (Jan 1, May 1, exact-year-only). Code change below. ✅
3. **Audit SQL queries** documented above for Chase to run in Supabase SQL Editor.

### Chase to execute (overnight)

4. **Regenerate phenomena hooks** with V6 prompt:
   ```bash
   curl -X POST 'https://beta.discoverparadocs.com/api/admin/ai/generate-phenomena-hooks?action=batch_missing' \
     -H 'x-admin-api-key: <ADMIN_API_KEY>'
   ```
   Then for force-regenerate-all (after verifying a sample):
   ```bash
   curl -X POST 'https://beta.discoverparadocs.com/api/admin/ai/generate-phenomena-hooks?action=force_all&offset=0&limit=100' \
     -H 'x-admin-api-key: <ADMIN_API_KEY>'
   ```
   (Run with offset=0,100,200,... up to ~5000. ~$4 total in Haiku spend.)

5. **Regenerate report hooks** with V6 prompt:
   ```bash
   curl -X POST 'https://beta.discoverparadocs.com/api/admin/generate-hooks?limit=100&overwrite=true' \
     -H 'x-admin-api-key: <ADMIN_API_KEY>'
   ```
   Run with offset/limit pagination until all ~30 reports are regenerated.

6. **Audit dates** by running the two SQL queries above. Expect to find Jan/May 1 placeholders.

### Next sprint

7. **Path B date re-extraction** — new `/api/admin/ai/repair-dates` endpoint that re-extracts `first_reported_date` from `ai_history` for any phenomenon flagged by audit query. ~$3 spend.
8. **V7 narrative regeneration** — "Robert Stack documentary voice" prompt rewrite for `paradocs_narrative` and `ai_description`.
9. **Skeptical-paragraph requirement** in narratives.
10. **Manual curation** of the top 50 high-traffic phenomena.

---

## Comparable case studies referenced

- *Apple News* curated feed editorial standards (2017–): explicit "lede paragraph" requirement.
- *The Atlantic* CMS guidelines: every story must answer "what is this?" within the first 30 words.
- *Wikipedia* WP:LEAD: "the lead should be able to stand alone as a concise overview of the article's topic."
- *NYT Cooking* recipe ledes: identification before instructions.
- *Pocket Discover* curator notes (publicly visible 2018–2022): hooks always identify the subject.
- *The Browser* daily curation: every link recommendation begins with subject identification.

The pattern is universal in long-tail content recommendation. Paradocs has been writing for the assumed-insider; V6 reorients toward the cohort that's actually in front of the booth.
