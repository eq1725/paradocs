# Reunion-with-deceased Finding — 4-editor copy review

**Subject:** PATTERNS_TAXONOMY §E1 Finding Card interpretive sentence.
**Panel:** Helena (register), Mariko (mass-market), Devi (anthropology), Tariq (cynic).
**Founder flag:** the current sentence reads small-number-confusing and ends on jargon ("transcends the category that frames it").

---

## 1. Diagnostic — why the current sentence fails

Current text:
> "Witnesses in psychological accounts (2%), ghost reports (2%), and psychic sessions (3%) describe reunions with deceased persons at comparable rates across 94,341 documented cases, suggesting the experience transcends the category that frames it."

Two defects, both founder-flagged.

**The 2/2/3% reads as "small."** The sentence opens by stacking three sub-5% figures before naming what makes them interesting. The reader's first frame is "two percent of anything is not much" — a magnitude judgement — when the actual finding is a *consistency* judgement (the rate barely moves across three settings that should produce wildly different rates). Leading with the numbers in serial order trains the eye to read them as small rather than aligned. The cross-cutting comparison — the only reason this Finding exists — is buried behind a 17-word noun phrase.

**"Transcends the category that frames it" is abstract jargon.** In a documentary register, *transcends* is a religious-philosophical hedge; it doesn't name what the data shows. "The category that frames it" is one layer of abstraction above the concrete claim that ghost reports, NDEs, and psychic sessions are three different *settings* in which a witness encounters a deceased person. The sentence asks the reader to do interpretive work without giving them the noun (setting / framing / context) the work would attach to. Tariq's five-second test fails: no "huh."

---

## 2. Three candidate rewrites

### Candidate A — the setting frame
> "Across three settings that frame the encounter differently — a haunting, a near-death event, a psychic session — reunion with a deceased person appears at the same low rate (2%, 2%, 3% of 94,341 accounts). The setting changes; the rate does not."
(40 words)

- Helena: ON-BRAND.
- Mariko: ACCESSIBLE.
- Devi: FACTUAL.
- Tariq: "huh, interesting."

### Candidate B — the rate-is-the-same frame
> "The rate is the same whether the witness was haunted, dying, or seated at a psychic's table: reunion with a deceased person appears in 2% of ghost reports, 2% of near-death accounts, and 3% of psychic sessions — 94,341 cases surveyed."
(40 words)

- Helena: FLAG ("seated at a psychic's table" reads a touch literary; "psychic session" is the registered term).
- Mariko: ACCESSIBLE.
- Devi: FACTUAL.
- Tariq: "huh, interesting."

### Candidate C — the constant frame (mirrors shadow_figure shape)
> "Whether the encounter is filed as a haunting, a near-death event, or a psychic session, reunion with a deceased person turns up at roughly the same rate — 2%, 2%, 3% across 94,341 documented accounts. The framing changes. The rate holds."
(40 words)

- Helena: ON-BRAND.
- Mariko: ACCESSIBLE.
- Devi: FACTUAL.
- Tariq: "huh, interesting."

---

## 3. Panel recommendation

**3-of-4 unanimous on Candidate C, with Helena and Devi preferring C narrowly over A.** Mariko is indifferent between A and C; Tariq prefers C ("the framing changes / the rate holds" is the cleanest five-second beat). Candidate B carries a Helena flag on "seated at a psychic's table" and is dropped. The decision is C.

The split that matters: Helena notes Candidate A is also shippable, and would prefer C revert to A if engineering wants the cadence-twin structure to match shadow_figure's ending ("the shadow figure is the constant"). C already does that with "The framing changes. The rate holds." — so C wins.

---

## 4. Suggested final sentence

> "Whether the encounter is filed as a haunting, a near-death event, or a psychic session, reunion with a deceased person turns up at roughly the same rate — 2%, 2%, 3% across 94,341 documented accounts. The framing changes. The rate holds."

(40 words. No banned terms. No second person. No "transcends." Three families named in plain English. Absolute count anchored. Two-clause closer mirrors the shadow_figure pattern Helena cleared in R2.)

---

## 5. Why the rewrite lands better

Four concrete moves the original didn't make.

**It leads with the comparison, not the numbers.** "Whether the encounter is filed as A, B, or C" is a structural setup; the reader is primed to expect a contrast before any percentage appears. The 2/2/3 sequence then arrives as the *resolution* of that setup, not as three small magnitudes hunting for a frame.

**It names the three settings in plain English.** "Filed as a haunting" / "a near-death event" / "a psychic session" replaces the taxonomic *psychological accounts / ghost reports / psychic sessions* trio. *Filed as* is documentary-register — it's the verb an archivist uses, which is exactly what the corpus does — and it implies the witness's own framing without claiming the witness was right or wrong about it.

**It makes the consistency the headline, not an afterthought.** The two-clause closer ("The framing changes. The rate holds.") is the rate-is-the-same beat operationalized. It mirrors the shadow_figure pattern Helena already cleared ("the shadow figure is the constant") and gives Tariq his five-second moment: the reader doesn't have to infer that consistency is the finding — the sentence ends on that exact claim.

**It does not oversell.** "Roughly the same rate" is honest: 2 and 3 are not identical. *Turns up* is corpus-language for "appears in the catalogue" — neither dismissive nor evangelical. The sentence does not assert what reunion means, only that the rate of its appearance is invariant to the setting that produced the report. Devi's factual-integrity bar holds.

---

**SQL to ship:**
```sql
UPDATE findings_catalogue
SET
  interpretive_sentence = 'Whether the encounter is filed as a haunting, a near-death event, or a psychic session, reunion with a deceased person turns up at roughly the same rate — 2%, 2%, 3% across 94,341 documented accounts. The framing changes. The rate holds.',
  refreshed_at = NOW()
WHERE slug LIKE 'reunion-with-deceased-%';
```
