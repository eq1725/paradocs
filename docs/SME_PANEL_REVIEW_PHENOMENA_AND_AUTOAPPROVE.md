# SME Panel Review — CA auto-approve, religion/mythology gap, skeptical-framing sweep

**Date:** June 17, 2026
**Requested by founder:** (1) auto-approve the CA `pending_review` backlog against quality + page requirements; (2) explain why `religion_mythology` shows only 4 phenomena-with-reports and why entries like *Angels* don't surface; (3) sweep for phenomena framed as "not real" (e.g. *Psychosocial Hypothesis*) and flag for hide/deprecate, since that contradicts the editorial line; (4) panel input on all of it.

## Diagnostic baseline (measured)

- **CA `pending_review`:** 4,699. Of these **1,259** carry the published-format `paradocs_narrative`; **3,440 do not** (they hold the extractor's `description`/modern body but never went through the narrative pass). 100% have `location_name` and `description`.
- **`religion_mythology` phenomena:** 630 total — **5 active, 4 with reports, 621 archived.** *Angels, Archangel Gabriel/Raphael, Saint Apparitions, Custodian Angels, Decani (Angels), Incorruptible Saints, Sainthood* are all `status='archived', report_count=0`. Only **139** religion reports are approved; **9** carry a `phenomenon_type_id`.
- **Skeptical-framed phenomena (active):** *Psychosocial Hypothesis* (74), *Confabulation* (1,083), *Truman Show Delusion* (23), *Gang Stalking Delusion* (18), *Mass Hysteria* (10) ≈ **1,208 tagged reports**. Separately, **40+ active, legitimate phenomena** carry debunking language inside `ai_theories`/`ai_description` (*Deathbed Vision*, *Phantom Smell* (523), *Battlefield Ghost* (195), *Plasma UFO* (346), etc.).

---

## Panel

### 1. Editorial / Brand Voice Lead (Gaia-aligned, documentary register)
The "not real" problem is **two problems**. The named debunking phenomena (*Psychosocial Hypothesis*, *Mass Hysteria*, the *Delusion* set, *Confabulation*) are explanatory buckets that exist to say "this didn't really happen" — they directly contradict the founder editorial line and should be **deprecated/hidden** as phenomena. But the 40+ legitimate phenomena with skeptical *copy* must NOT be deleted — *Deathbed Vision* and *Phantom Smell* are core archive content; the fix is to **scrub the debunking framing from their generated text** (regenerate `ai_theories`/`ai_description` in the documentary-but-affirming voice: present testimony as testimony, present competing explanations only as "some researchers suggest…", never as verdict). Recommend a regeneration pass gated on a lexicon of skeptic-verdict phrases.

### 2. Religious-Studies / Folklore SME
The religion gap is an **archival artifact, not absence of material.** The taxonomy is rich (Angels, Archangels, Marian apparitions, sainthood, demonology) but was auto-archived for emptiness before any reports were linked. Un-archiving the legitimate entries is safe and necessary, but un-archiving alone yields empty pages — they must be **re-linked**: re-run the classifier over approved religion reports with these phenomena un-archived so counts populate. Also note only 139 religion reports are approved; the auto-approve pass + continued ingest will widen the base. Caution on un-archive: keep clearly-duplicative or junk entries archived (review the 621 list, don't blanket-restore).

### 3. Parapsychology / Anomalistics Researcher
Endorses deprecating the verdict-style phenomena, with one nuance: *Mass Hysteria* and *Confabulation* are real clinical constructs, but as **archive phenomena** they function as dismissals of experiencer accounts and mis-file 1,200+ first-person reports under a "you imagined it" label. Those reports shouldn't be deleted — they should be **re-classified** to the actual experience phenomenon (a *Confabulation*-tagged sleep-paralysis report belongs under sleep paralysis / the relevant experience), then the debunking phenomenon archived. Net: deprecate the bucket, rescue the reports.

### 4. Data / Classifier Engineer
On auto-approve: the safe gate is **page-completeness + quality**, not a blanket promote. Require: published narrative present (or run the narrative pass first for the 3,440 that lack it), `title`, `summary`, body within the 400–3000-char window, valid `location_name`, `event_date`, source attribution, ≥1 tag, and NOT flagged by the period-language lexicon or held by the anomaly gate at <0.9 "anomalous=no". Promote only rows clearing all of it; leave the rest in queue. Dry-run + reversible, like the prior backfills. On religion linkage and the skeptical re-classification: both are classifier passes — schedule them after un-archive/deprecate so the graph is correct before tagging.

### 5. Trust & Quality / Content-Standards Lead
Auto-approve is acceptable **only** with a hard page-requirements gate, because these go live publicly. Insist on: no period-sensitive-language flag, no empty/placeholder fields, a real verbatim-anchored body, and a real place (the location cleanup we just did is a prerequisite — good timing). Anything failing → stays `pending_review` for human review, never silently dropped. Recommend the gate emit a rejection-reason breakdown so we can see *why* rows don't qualify.

---

## Consensus action plan (sequenced)

1. **Auto-approve gate (CA):** build a quality+page-requirements gate; **narrative pass first** for the 3,440 lacking `paradocs_narrative`; dry-run with a pass/fail + rejection-reason breakdown; founder signs off on criteria; apply (reversible). Rows failing the gate stay queued.
2. **Deprecate verdict-style phenomena:** archive *Psychosocial Hypothesis, Mass Hysteria, Truman Show Delusion, Gang Stalking Delusion, Confabulation* (and the archived *Delusion/Hallucination/Hoax* set stays archived) — but first **re-classify their ~1,208 reports** to the real experience phenomenon so accounts aren't lost.
3. **Scrub skeptical copy:** regenerate `ai_theories`/`ai_description` for the 40+ legitimate phenomena that carry "not real / hallucination / misidentification" verdicts, in the documentary-affirming voice.
4. **Religion gap:** un-archive the legitimate religion phenomena (review the 621 list, restore Angels/Archangels/Saints/Marian/etc.), then classifier-link approved religion reports so counts populate.
5. **Re-verify:** religion drillable-count climbs; skeptical phenomena gone from surfaces; auto-approved rows render complete.

## Open decisions for the founder

- **Auto-approve scope:** include the narrative pass for the 3,440 (cost ~$0.007/row ≈ ~$25) so the whole 4,699 is eligible, or auto-approve only the 1,259 already narrated now and narrate the rest later?
- **Deprecation depth:** deprecate all five verdict-phenomena including *Confabulation* (1,083 reports — biggest re-classification), or stage *Confabulation* separately given volume?
- **Skeptical-copy scrub:** regenerate all 40+ now (AI cost), or flag + scrub the worst first?
- **Religion un-archive:** restore all 621 archived, or only a vetted list of clearly-legitimate entries?
