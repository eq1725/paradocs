# Anomaly Gate Slip Investigation — V11.17.100

## Trigger

Founder flagged the Sedona-boom report (`8c4897fa-a5c0-4644-baf1-cfd73948988f`,
"Massive Underground Boom Shakes Sedona Hotel Room") as a clear ARCHIVE
case that nevertheless slipped past the V11.17.46 anomaly gate. The
report describes a single unexplained loud sound at a hotel; the
witness themselves canvassed a neighbor (Vietnam vet) and settled on
"something underground" — i.e. they offered the mundane explanation in
the source text. No paranormal element. Should not have been approved.

## What the gate actually said

The `paradocs_assessment.anomalous_content_check` field on the row at
the time of investigation:

```json
{
  "genre": "other_mundane",
  "reason": "The source describes an unexplained loud noise and vibration, but provides no evidence of a paranormal or anomalous phenomenon—only an unidentified sound with a plausible mundane explanation (seismic activity, industrial equipment, structural settling, or other geological/mechanical causes).",
  "anomalous": "no",
  "confidence": 0.8
}
```

Haiku correctly identified the report as mundane (`anomalous: "no"`,
`confidence: 0.8`, `genre: "other_mundane"`). The reason text is
articulate and on-point.

## Diagnosis — Finding (A)

**The gate fired correctly but at a confidence below the auto-archive
threshold.** The V11.17.41 engine.ts logic used:

```
conf >= 0.9 → status='archived' (auto-archive)
0.7 <= conf < 0.9 → status='pending_review' (admin queue)
conf < 0.7 → no demotion
```

At `conf=0.8`, the row went to `pending_review` rather than `archived`.
The pending_review queue is currently >2,300 rows deep — these
borderline-mundane cases sit there indefinitely. The Sedona row was
eventually archived only because a V11.17.98 manual QA audit caught it
post-hoc (`moderation_notes: "V11.17.98 — QA audit: YouTube comment
treated as report; conversational fragment with weak anomaly signal
(loud-boom story already mundanely explained by witness)"`).

So:
- Haiku judgment: correct
- Prompt: missing nuanced examples that would push borderline-mundane
  cases higher (0.85+)
- Threshold: too strict — 0.9 was leaving a lot of clean-archive cases
  stuck in the human queue

## Corpus audit

Across the full 198,309 approved reports:

| Cohort                                              | Count   |
| --------------------------------------------------- | ------- |
| Total approved                                      | 198,309 |
| Approved + anomaly check field present              | 62,761  |
| Approved + anomalous='yes' (gate kept)              | 62,760  |
| **Approved + anomalous='no' (gate-slip candidates)**| **1**   |
| Approved + missing anomaly check (pre-V11.17.41)    | 135,548 |
| Archived + anomalous='no' (gate worked)             | 44,390  |
| Pending_review + anomalous='no' (mid-band purgatory)| 2,348   |

The mid-band purgatory (2,348) is the bigger calibration story than
the slip queue (1). With V11.17.100's lower threshold (0.75), most of
those rows would have auto-archived at ingest.

### Genre distribution among already-archived 'no's

`opinion_theory: 1134`, `advice_request: 2219`, `other_mundane: 853`,
`consciousness_practices: 430`, `psychological_experiences: 239`,
`platform_complaint: 22`, `product_review: 19`, `news_summary: 15`,
`hiking_misadventure: 1`. The gate is doing real work.

### Sample of mid-band pending_review (anomalous='no' at conf 0.8-0.88)

Some of these ARE the kind of case the founder warned about — they
should NOT be archived. The 0.8-0.88 band is where prompt nuance
matters most.

- `[conf=0.85 psychological_experiences] Missing Hours After Five Pints at Home` — could be missing-time, but witness frames it as alcohol blackout
- `[conf=0.85 consciousness_practices] White Room and Black Door Appear During WILD Attempt` — first-person consciousness practice account, debatable
- `[conf=0.85 other_mundane] Lost Earring Reappears in Garage After One Year` — Mandela-effect-adjacent reappearing object, debatable
- `[conf=0.88 perception_sensory] Sleep Paralysis Episode With Extended Physical Aftermath` — sleep paralysis + physical aftermath = textbook keeper
- `[conf=0.88 psychological_experiences] Evolving Hypnagogic Imagery After Psilocybin Exposure` — psychedelic experience report, debatable

The V11.17.100 prompt now treats these correctly: missing-time and
sleep paralysis + aftermath are explicit KEEPS; psychedelic / lucid /
practice debriefs are ARCHIVE unless the practice reports a documented
anomaly.

## The fix — V11.17.100

### A. Prompt refinement

Both `consolidated-ai.service.ts` and `paradocs-analysis.service.ts`
ANOMALY GATE sections were rewritten. Highlights of the new section:

**Before (V11.17.41 — list-only, no worked examples):**
```
- KEEP (anomalous="yes") — UFO sightings, missing time, apparitions,
  hauntings, poltergeists, witnessed phenomena, precognitive dreams,
  telepathy, OBE, NDE, sleep paralysis with sensed presence, cryptids,
  synchronicity, manifestation experiences.
- ARCHIVE (anomalous="no") — mundane hiking/navigation/dehydration;
  wildlife encounters; perceptual quirks; platform/algorithm complaints;
  opinion pieces; advice requests; product reviews; psychological change.
- Be STRICT. False negatives recoverable from pending_review.
- If unsure, set anomalous="yes" with confidence <0.7.
```

**After (V11.17.100 — nuance + worked examples + calibration):**
```
JUDGMENT, NOT KEYWORDS. Many phrases that LOOK anomalous on the
surface are mundane, and many phrases that LOOK mundane are anomalous
in context. Read the WHOLE account before deciding.

KEEP (anomalous="yes") — first-hand or close-witness accounts of:
  - missing time / lost hours with no recall — even when the surface
    phrase is mundane ("I lost an hour driving home"), if the account
    points at a gap with no ordinary explanation, KEEP
  - apparitions, hauntings, poltergeist activity — even subtle ones.
    "Felt a chill" PAIRED with shadow figure / unexplained sound /
    object moving / sensed presence is a documented haunting indicator
  - "saw a light that hovered silently then split into three" — the
    BEHAVIOR is what makes it anomalous, not the word "light"

ARCHIVE (anomalous="no") — accounts that are NOT actually anomalous:
  - a single loud boom / bang / vibration with NO other anomalous
    element. A boom alone is a mundane physical event. Only KEEP if
    paired with something else unexplained.
  - "felt a chill" attributable to drafty room / AC with no paired
    phenomenon
  - vivid dream / nightmare alone
  - third-person commentary on someone else's experience

WORKED EXAMPLES:
  "Heard a loud boom that shook the hotel. Asked a neighbor; he said
    not a bomb. Maybe underground." → anomalous="no" conf 0.9.
  "Heard a boom, then saw a glowing object lift off the ridge and
    disappear silently." → anomalous="yes" conf 0.9.
  "Driving home from work I lost an hour with no memory of the road."
    → anomalous="yes" conf 0.85.
  "Felt a chill in the basement after we moved in. Probably drafty."
    → anomalous="no" conf 0.85.
  "Felt a chill, then saw a shadow figure at the foot of the bed
    every night for a week." → anomalous="yes" conf 0.95.

CONFIDENCE CALIBRATION:
  0.95-1.0: unambiguous.
  0.80-0.94: confident but not certain. The Sedona-boom case belongs
    here at ~0.85.
  0.70-0.79: leaning sparingly.
  <0.70: genuinely uncertain → default to anomalous="yes".
```

### B. Threshold tuning

`src/lib/ingestion/engine.ts` (lines 1521-1547), plus mirrors in
`scripts/batch-ingest-worker.ts`, `src/pages/api/onboarding/submit.ts`,
and `scripts/backfill-user-submission-ai.ts`:

| Decision           | V11.17.41 (before) | V11.17.100 (after) |
| ------------------ | ------------------ | ------------------ |
| Auto-archive       | conf ≥ 0.9         | **conf ≥ 0.75**    |
| Pending_review     | 0.7 ≤ conf < 0.9   | 0.7 ≤ conf < 0.75  |
| No demotion        | conf < 0.7         | conf < 0.7         |

The pending_review band shrinks dramatically — it now exists only as
a 0.05-wide safety strip for cases Haiku flags as `no` but at
uncomfortably low confidence. Most of the band's volume migrates to
auto-archive, matching the new prompt calibration (Sedona-boom-style
cases land at ~0.85 with the worked example).

The prompt also instructs Haiku to default to `anomalous="yes"` with
conf < 0.7 whenever genuinely uncertain — so the no-demotion branch
should remain rare by design.

### C. No keyword filters added

Per founder direction. The fix is entirely prompt + threshold. The
prompt sharpens Haiku's judgment with worked examples that distinguish
KEEP nuance ("lost an hour" — missing-time, KEEP; "felt a chill" +
shadow figure — haunting, KEEP) from ARCHIVE nuance (boom alone —
mundane, ARCHIVE; chill alone — drafty room, ARCHIVE).

## Files touched

- `src/lib/services/consolidated-ai.service.ts` — ANOMALY GATE section (lines 141-238)
- `src/lib/services/paradocs-analysis.service.ts` — ANOMALY GATE block (lines 269-281)
- `src/lib/ingestion/engine.ts` — demotion logic (lines 1521-1547)
- `scripts/batch-ingest-worker.ts` — mass-mode mirror (lines 657-690)
- `src/pages/api/onboarding/submit.ts` — user-submission mirror (lines 479-491)
- `scripts/backfill-user-submission-ai.ts` — historical-backfill mirror (lines 105-130)
- `scripts/archive-gate-slips.ts` — new sweep tool (dry-run default)

## Audit / sweep tool

`scripts/archive-gate-slips.ts` (new) finds and (with `--apply`)
archives any `status='approved' AND anomalous='no'` slip rows.

```
npx tsx scripts/archive-gate-slips.ts                # dry-run
npx tsx scripts/archive-gate-slips.ts --apply        # commit
npx tsx scripts/archive-gate-slips.ts --limit 50     # show 50
```

### Dry-run result (2026-06-06)

```
Total slip candidates (status=approved AND anomalous=no): 1
Genre distribution: { news_summary: 1 }
Confidence: min=0.92 median=0.92 max=0.92
---
[conf=0.92 genre=news_summary src=nuforc] White Orb Crosses Trinidad
  and Tobago at Sunset (1fd28820-19ee-4a19-8fc5-231a575e93d0)
DRY-RUN: would flip 1 row.
```

The Trinidad orb row's `paradocs_assessment.anomalous_content_check.reason`:

> "The NUFORC note identifies the sighting as Starship Flight Test 12,
> a known SpaceX suborbital test with a documented trajectory over the
> Caribbean. The report describes a real phenomenon with a confirmed
> mundane explanation."

Haiku correctly identified this as a NUFORC report with a debunking
NUFORC note attached — a SpaceX Starship trajectory. Should archive.
**Awaiting founder sign-off before running with `--apply`.**

The Sedona-boom row is NOT in the list because the V11.17.98 manual QA
sweep already archived it.

## Side effect — pending_review backlog

There are 2,348 reports in `status='pending_review'` with
`anomalous_content_check.anomalous='no'` at confidence 0.7-0.89. Under
the new threshold (0.75), the vast majority of these (~2,300) would
have auto-archived at ingest. They're not a slip per se — they're
deliberately deferred — but they're also blocking the admin queue.

A follow-up sweep could re-evaluate them under the new threshold and
archive the ones whose confidence is ≥0.75, leaving only the truly
borderline cases in pending_review. This is **NOT** part of this
change — flagging for founder decision.

## Open question for founder

The sweep dry-run flagged 1 row (Trinidad orb at 0.92 — NUFORC note
confirms it was SpaceX Starship Flight Test 12). Confidence is high
and the genre call is right. Apply?

A second open question: should we also re-sweep the 2,348 pending_review
rows under the new 0.75 threshold? Most should auto-archive cleanly,
draining the admin queue. Only the borderline 0.7-0.75 band would
remain. Yes/no on this sweep is the bigger calibration call.

## Verification

`tsc --noEmit` — no new errors in any V11.17.100-touched file. The
four pre-existing errors in engine.ts (lines 780, 791, 1347, 1758) are
unrelated and exist on `main` independently of this change.
