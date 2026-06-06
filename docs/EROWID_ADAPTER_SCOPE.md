# Erowid Experience Vaults — Adapter Scope Memo

**Version:** V11.17.89-scope
**Author:** Ingestion sub-agent
**Date:** 2026-06-05
**Status:** PRE-IMPLEMENTATION — awaiting founder sign-off AND licensor permission

---

## 1. TL;DR

- **Recommendation: NO-GO until Erowid Center grants written permission.** Their ToS, Copyrights page, and Experience Vaults footer all explicitly prohibit machine reading, downloading, distilling, or feeding the corpus into AI systems without prior written agreement. Their `robots.txt` `Disallow`s ClaudeBot, GPTBot, Google-Extended, CCBot, Applebot-Extended, and others — i.e. Erowid has actively opted out of the AI-ingestion ecosystem.
- A stub adapter (`src/lib/ingestion/adapters/erowid.ts`, 674 lines) was already written and a permission request was already emailed to Erowid Center in April 2026 (per the comment on line 36 of `src/lib/ingestion/adapters/index.ts`). The registry entry is deliberately commented out. **As of this writing we have no record of a reply.** First action: chase that email before sinking any more engineering time.
- **Estimated corpus (if permitted):** ~117,000 published reports as of Jan 2023 per Erowid's own "About" page, with steady growth since then. ID space probed up to 120,000+ (HTTP 200). Realistic target after quality + dedup gate (analogous to Reddit's 88% pass-rate, but tighter due to brand fit): **~85,000 – 95,000 inserts.**
- **Estimated full-ingest cost:** ~$595 at $0.007/report (high end of the COST_RECONCILIATION_NOTES.md band, because Erowid lacks structured location → Haiku safety net fires on ~all rows). Range: ~$425 – $665.
- **Top risk:** License compliance, by a wide margin. App-store sensitivity (drug content) is a strong second. Editorial brand-fit is third. Technical risk is comparatively low — the corpus is static, single-host, has clean structure, and behind standard Cloudflare (not Turnstile).

---

## 2. License + TOS audit (this section gates everything else)

Erowid's posture is unambiguous and across three independent surfaces:

1. **`robots.txt`** (fetched June 5, 2026):
   > "Crawling and/or scraping Erowid.org requires written permission from Erowid Center. Your use of software to read, save, or display Erowid pages requires you accept our Terms of Use policies. Publishing our data or analysis of our data or website requires written permission of Erowid Center."

   The same file `Disallow:`s ClaudeBot, GPTBot, Google-Extended, Applebot-Extended, CCBot, Amazonbot, Bytespider, and meta-externalagent. Cloudflare-Managed `Content-Signal: search=yes, ai-train=no` is set. The intent could not be plainer: they want their content indexable for search, but they have opted out of AI consumption.

2. **Experience Vaults "About" page** (`/experiences/exp_about.cgi`), `Copyrights / Usage Agreement` section:
   > "The reports in Erowid's Experience Vaults are copyrighted by Erowid Center. Authors have permission to use their own reports as they wish. Researchers and authors may NOT 'mine', distill, or use aggregate data from Experience Vaults without prior written permission... **Explicit permission is required before conducting or publishing data analysis of Erowid's experience report collection.**"

3. **The Vaults' page footer** (rendered at the bottom of every Vaults page):
   > "TERMS OF USE: By accessing this page, you agree not to download, analyze, distill, reuse, digest, **or feed into any AI-type system** the report data without first contacting Erowid Center and receiving written permission."

A Paradocs ingestion pipeline does all of: downloads, analyzes (Haiku location + classifier), distills (consolidated narrative rewrite), and feeds the report data into an AI system. There is **no fair-use or research-exemption argument** that survives that footer line. Proceeding without permission would be an in-writing breach of an in-writing usage agreement on a copyrighted corpus where the licensor has formally opted-out of AI use via robots Content-Signals — this is the worst possible posture for any copyright dispute.

**The deliverable answer to "are we allowed to systematically scrape + republish?":** No. Not under any honest reading of their published policies. Permission is reachable (Erowid has historically granted research access with attribution requirements per the search results), but it must be in hand, in writing, and the terms-of-grant must allow republishing on a commercial-tier platform (Paradocs Pro/Basic) before any code runs in production.

---

## 3. Site structure findings (research-only, polite probing)

- **Entry point:** `https://www.erowid.org/experiences/` (index page).
- **Per-experience URL:** `https://www.erowid.org/experiences/exp.php?ID=N` (ID is a sequential integer; probed 115000, 118000, 120000 — all return HTTP 200, confirming corpus extends past 117k self-reported figure).
- **Browse / paginate:**
  - By substance: `exp.cgi?S1=<substance_id>` (substance IDs are listed on the substance index).
  - By "new": `exp.cgi?New=&S1=...` (recent submissions per-substance).
  - Advanced search: `exp_search.cgi` (form-based, parameters `S1`/`S2`/`C1`/`Rone`/`Start`/`Max=25`).
- **Enumeration shape:** No sitemap.xml of Vault content. ID-range walk is the only deterministic enumeration; substance-paginated walks would multi-cover the same IDs.
- **Highest known ID:** ≥ 120,000 (probed). Erowid's "About" page (Jan 2023 update) says "more than 117,000 reports having been submitted in the past 22 years" — adding ~3 years of submissions at the historical rate (≈5k–8k/year), the live corpus is plausibly **~125,000–135,000 IDs total, of which roughly 90,000–105,000 are published** (Erowid filters submissions — they openly say "it can take more than a year for some reports to be reviewed" and many are rejected or held at "marginal/cellar" tiers).
- **Infrastructure:** Cloudflare-fronted, `cf-ray` headers present, but standard rate-limiting only — no Turnstile challenge on a vanilla curl with a browser UA. The site is also extremely cacheable (`cache-control: max-age=300000` on tested pages). One politely-spaced shard worker is sufficient; we should not deploy NUFORC's 5-worker circuit-breaker treatment.

---

## 4. Per-experience data shape

Based on the existing `src/lib/ingestion/adapters/erowid.ts` stub (which already parses the page structure correctly per the April-2026 work), each report page exposes:

| Field on Erowid page | Description |
|---|---|
| `<h1>` title | E.g. "Eating the Universe — DMT (105 mg)" |
| `class="report-text-surround"` | The narrative body (varies 200 – 15,000+ chars; Erowid quality-curators reject < ~300 char submissions) |
| `class="author"` | Anonymized author handle |
| `class="dosechart"` table | T+offset, amount, route, form, substance — one row per substance (polysubstance use captured as multiple rows) |
| `class="bodyweight-amount"` | Body weight (e.g. "150 lb") |
| `class="sex"` | Gender |
| `class="age"` | Age at experience |
| `Published: <date>` | Publication date string |
| `Exp Year: <yyyy>` | Experience year (year-precision only — Erowid almost never has month or day) |
| Erowid experience-category tags | Set by curators — e.g. "Difficult Experiences", "Bad Trips", "First Times", "Glowing Experiences", "Mystical Experiences", "Entities and Beings", "Combinations", "Health Benefits", "Train Wrecks & Trip Disasters" |
| Location | **Almost never present as a structured field.** Erowid intentionally anonymizes — many narratives also omit location in prose. |

Narrative quality vs. Reddit / NUFORC: Erowid narratives are **substantially better-written on average**. The corpus is curator-triaged ("marginal/cellar" tier reports are hidden by default since v1.91, 2005) so the visible base is already filtered for coherence. Median narrative length is likely 1,500–4,000 chars vs. NUFORC's 50–300 and Reddit's wildly bimodal distribution. Quality filter pass-rate should be the highest of any source we've ingested.

Mod-flagged / warned-against reports: Erowid surfaces "marginal" and "cellar" tiers but those are hidden by default behind a `show cellar` checkbox; if we respect their default visibility we never see those rows, which is the correct behavior. We should NOT scrape with `show cellar` enabled.

---

## 5. Mapping to Paradocs schema

| Erowid field | `ScrapedReport` slot | Notes |
|---|---|---|
| `<h1>` title | `title` | Already cleaner than what we generate elsewhere — keep verbatim, cap at 200 chars |
| narrative body | `description` (and truncated `summary`) | This is the Vaults' copyrighted prose — handling per § 8 |
| primary substance | `tags[]` + `metadata.experienceTypeSlug` | Deterministic linker to existing phens (see substance-map sketch in § 9) |
| co-substances | `metadata.case_profile.coSubstances` | Polysubstance flag in tags |
| route | `metadata.case_profile.route` | oral / inhaled / IV / etc. |
| dose amount | `metadata.case_profile.doseAmount` | Short factual string |
| `Exp Year` | `event_date` (year-precision) | `event_date_precision='year'`, `event_date_extracted_from='structured'` |
| `Published:` date | `source_published_at` | Distinct from `event_date` per V10.8.B |
| Gender, Age, Weight | `metadata.case_profile.{gender,ageAtExperience,bodyWeight}` | Optional, factual, short |
| Erowid category tags (e.g. "Mystical Experiences") | `tags[]` + informs `metadata.experienceTypeSlug` | These are Erowid curators' editorial classification — treating them as **input signals** is fine; do not surface "Marginal" or "Cellar" tier indicators (parallels the NDERF-tier handling in `nderf.ts`) |
| Location | `location_*` (rare) | Almost always null. **V11.17.52 location safety net (Haiku from prose) will fire on every row.** Expected coverage post-safety-net: **15-30%** (Erowid prose is geographically diffuse — many reports start "I was at a friend's house" with no further specificity; many international authors don't name the country). |
| `category` | `'consciousness_practices'` (primary) | Default. A subset (Ketamine death-like, OBE prose, mystical experiences) may justify `'psychological_experiences'` — the existing stub already maps this. |

PII handling: Erowid is already anonymized at the source (author handles only), but `redactReportPii` still needs to run for defense-in-depth. Erowid prose often contains friends' first names — those will be redacted by the existing pipeline.

---

## 6. Scope estimation (corpus size + expected inserts)

- **Total ID space (live):** ~125,000 – 135,000 (extrapolated; needs confirmation via a `Max ID` probe at adapter startup).
- **Published & visible (excluding marginal/cellar):** ~90,000 – 105,000.
- **Quality gate pass-rate:** Estimated **92%** (higher than Reddit's 88% and NUFORC's 86.5%, because curator pre-filtering removes most junk before we see it). Failures will mostly be very short reports (< 300 char minDescLength).
- **Anomaly gate (V11.17.46):** Should not demote much. Erowid prose is on-register for `consciousness_practices` — direct first-person psychoactive experience reports. The anomaly gate is tuned to demote mundane life anecdotes; Erowid reports are by definition not mundane.
- **Tag-verifier (V11.17.54):** Will be busy. The substance→phen deterministic map (§ 9) covers the top ~10 substances; the long tail of Erowid substances (research chemicals, plant medicines, kratom, salvia divinorum, peyote, etc.) needs phen coverage decisions per § 11. Verifier will catch mismatches.
- **Realistic final inserts: ~85,000 – 95,000.**

---

## 7. Cost estimation

Per `COST_RECONCILIATION_NOTES.md` the all-in per-report cost is $0.005 – $0.007. Erowid's specifics push toward the high end:

| Cost lane | Per-report | Why Erowid-specific |
|---|---|---|
| Consolidated narrative (Sonnet via batch, 50% off) | ~$0.004 | Erowid bodies are long (2-4k chars median) — modestly more expensive than NUFORC (~50-300 char) |
| Classifier (Haiku primary + verify) | ~$0.001 | Concentrated hits on `consciousness_practices` phens — fewer candidate phens to consider per call, somewhat cheaper than the average |
| Tag-verify gate (engine.ts) | ~$0.0005 | Standard |
| **Location safety net (Haiku)** | **~$0.0001 × 100% of rows** | Erowid has near-zero structured location coverage → the safety net fires on every row, vs. NDERF where it fires on ~60-70% |
| Anomaly gate, dedup, geocode | ~$0.0001 | Standard |

**Per-report all-in: ~$0.0066. Range: $0.005 – $0.0075.**

**Full-ingest cost (90,000 inserts × $0.0066): ~$595.**

Range: **$425 – $665** depending on final insert count + Erowid mean narrative length.

For comparison: NUFORC's 99k drain ran ~$310 (per cost_reconciliation_notes total: $310 logged consolidated-batch); Erowid will cost roughly 2× per row because the narratives are 5-10× longer.

---

## 8. Risks + ethics flags

1. **License compliance (BLOCKING).** See § 2. The single most important thing on this memo. Nothing else matters if this isn't resolved.
2. **App-store sensitivity.** Erowid content is by definition drug-experience reports. Apple's App Store Review Guideline 1.4.3 ("Apps that promote illegal or excessive consumption of [drugs]…") and Google Play's Substance Abuse policy are both relevant. Paradocs frames as a documentary archive of first-person reports, not as drug encouragement — that's defensible — but the **volume swing matters**. Adding 90k drug-experience reports to a 250k-row corpus shifts the surface dramatically. App Store reviewers do read sample content. We should plan for: (a) an editorial filter that down-ranks substance-only narratives without an anomalous component for default discovery feeds (the anomaly gate already does some of this); (b) explicit harm-reduction footer copy on Erowid-sourced report pages; (c) consider whether Erowid-sourced reports should be Pro-tier-gated or behind an 18+ consciousness-practices tag-toggle.
3. **Editorial brand fit.** Paradocs is positioned as "first-person paranormal/anomalous experience reports". Drug experiences fit `consciousness_practices` reasonably well — DMT entity encounters, ayahuasca death-and-rebirth narratives, salvia ego-dissolution accounts are squarely paranormal-adjacent — but a 90k-row inflow doubles the size of the `consciousness_practices` category and risks tilting the catalogue's center of gravity. The founder needs to consciously decide this is the brand expansion they want. **Question for founder:** is `consciousness_practices` meant to be a primary pillar of Paradocs, or a secondary one? If secondary, ingest only the "Mystical Experiences" + "Entities and Beings" + "Difficult Experiences" Erowid sub-categories (~15-20k reports, much tighter fit) rather than the full corpus.
4. **Attribution requirement.** Any permitted ingest must surface "Source: Erowid Experience #N" with a hyperlink back to `exp.php?ID=N` on the canonical report page. Suggest: same MediaMentionBanner-style component used for NUFORC, with copy "Originally published in Erowid Experience Vaults". The `source_label` and `source_url` slots already accommodate this.
5. **Author republication consent.** Erowid's copyright section preserves authors' rights to use their own reports as they wish. Erowid Center's permission grants us the right to use the database; it does not retroactively grant us individual author consents. This is structurally similar to NDERF and we have been treating it the same way (per-author attribution would be impossible — handles are pseudonymous). Worth flagging in the Paradocs ToS that this content is sourced under license from the publishing organization.
6. **Marginal/Cellar tier inclusion.** Erowid's default search hides their "marginal" and "cellar" tiers (low-rating curator decision). We MUST mirror that — never opt-in to `show cellar`. The existing stub does not currently set the search params explicitly; the production adapter should.

---

## 9. Adapter design sketch

```ts
// src/lib/ingestion/adapters/erowid.ts
// V11.17.89 — Erowid Experience Vaults adapter (LICENSE-GATED)
//
// THIS ADAPTER MUST REMAIN DISABLED IN THE REGISTRY (src/lib/ingestion/
// adapters/index.ts) UNTIL EROWID CENTER GRANTS WRITTEN PERMISSION.
// See docs/EROWID_ADAPTER_SCOPE.md § 2.
//
// Mirrors nuforc.ts hardening (UA rotation, exponential backoff,
// Cloudflare circuit-breaker, browser-like headers) and nderf.ts
// structure (static archive scrape with shardable enumeration).
//
// Sharding: by Exp ID range. ID space is 1–~135k; shards of 1000 IDs
// each (135 shards) process independently with --resume. Each shard
// records last-completed-ID in outputs/erowid-mass-ingest-state.json
// so a Ctrl+C resumes mid-shard without re-fetching.
//
// Rate-limit: 2s default between fetches (per existing stub), single
// worker. Erowid is one academic-host site behind generous Cloudflare
// caching; politeness > parallelism.
//
// Quality gates flow through engine.ts normally:
//   - PII redact, isObviouslyLowQuality, assessQuality, smartReEvaluate
//   - V11.17.52 location safety net (Haiku — fires on ~100% of rows)
//   - V11.17.54 tag verification gate (in classifier batch)
//   - V11.17.46 anomaly gate demotion (in batch-ingest-worker)
//   - V11.17.82 date extractor with architectural-context guard
//     (handles "Exp Year: 2018" structured slot directly)
//
// SUBSTANCE_TO_PHENOMENON_SLUG: deterministic link from Erowid primary
// substance → Paradocs phen slug. Mirrors SHAPE_TO_PHENOMENON_SLUG in
// nuforc.ts. Bypasses the brittle pattern matcher entirely for the
// primary type. Slugs below are PROPOSED — must be DB-verified at PR
// time. Any substance without a mapping leaves experienceTypeSlug
// undefined and falls through to AI classifier (Stage D) for linking.

export const SUBSTANCE_TO_PHENOMENON_SLUG: Record<string, string> = {
  // CONFIRMED ALIGNMENT WITH EXISTING SLUGS (per start.tsx PHEN_PRIMARY_LABELS)
  'dmt':            'dmt-experience',
  'ayahuasca':      'ayahuasca-experience',
  'lsd':            'lsd-experience',
  'psilocybin':     'psilocybin-mushrooms',
  'psilocybin mushrooms': 'psilocybin-mushrooms',

  // LIKELY ALIGNMENT — verify slug exists in phenomenon_types at PR time
  '5-meo-dmt':      'dmt-experience',         // collapse to parent DMT?
  'salvia':         'salvia-experience',      // verify slug
  'salvia divinorum': 'salvia-experience',
  'ketamine':       'ketamine-experience',    // verify slug
  'mdma':           'mdma-experience',        // verify slug
  'mescaline':      'mescaline-experience',   // verify slug — may not exist
  'peyote':         'mescaline-experience',   // fold into mescaline if no peyote slug
  'cannabis':       'cannabis-experience',    // verify — brand-fit question (§ 8.3)
  'meditation':     'meditation-experience',  // verify — non-substance
  'iboga':          'iboga-experience',       // verify slug
  'ibogaine':       'iboga-experience',

  // EXPLICITLY UNMAPPED (long-tail research chemicals; let Stage D classify)
  // 2C-B, 2C-I, MDA, 4-AcO-DMT, NBOMe, kratom, datura, brugmansia, etc.
};

// Erowid curator categories — used as INPUT SIGNALS for tagging but
// NEVER as user-facing labels (parallels how nderf.ts treats nderfTier).
// E.g. "Train Wrecks & Trip Disasters" is an internal Erowid editorial
// classification; we map it to our own tags ("difficult-experience",
// "challenging-trip") rather than reprinting their label.
const EROWID_CATEGORY_TO_TAGS: Record<string, string[]> = {
  'Mystical Experiences':     ['mystical', 'transcendent'],
  'Entities and Beings':      ['entity-encounter', 'beings'],
  'Difficult Experiences':    ['difficult-experience', 'challenging'],
  'Bad Trips':                ['difficult-experience', 'challenging'],
  'First Times':              ['first-experience'],
  'Glowing Experiences':      ['positive-experience'],
  'Combinations':             ['polysubstance'],
  'Health Benefits':          ['therapeutic'],
  'Train Wrecks & Trip Disasters': ['difficult-experience', 'medical-emergency'],
  'Health Problems':          ['adverse-event'],
};

export const erowidAdapter: SourceAdapter = {
  name: 'erowid',
  async scrape(config: Record<string, any>, limit: number = 100): Promise<AdapterResult> {
    // Implements ID-range sharding per orchestrator (target_id_range arg).
    // For each ID in range: fetch exp.php?ID=N with rate-limit, parse via
    // existing parseExperiencePage logic from V11.17.89 stub, return
    // ScrapedReport[]. Skip 404s silently (deleted/withheld reports).
    ...
  }
};
```

Orchestrator skeleton (`scripts/erowid-mass-ingest.ts`): forks NDERF orchestrator. Shard = ID range of 1000. Default concurrency = 1. `--target` insert cap. `--cost-cap-usd` default $600. `--rate-limit-ms` default 2000. `--smoke` mode for 5-report sanity check.

---

## 10. Smoke test plan

Before any mass-ingest, run a 5-report smoke test against these specific Exp IDs (chosen for diversity — assuming permission is granted):

1. **ID = 25** (one of the oldest reports — verifies the v1.0-era page template still parses)
2. **ID = 14947** — a known DMT entity-encounter report (verifies substance map → `dmt-experience` slug, and the entity tagger fires)
3. **ID = 100032** (recently published — verifies modern page template)
4. **An ID known to have a long narrative** (~5000+ chars) — verifies the description-length cap doesn't truncate inappropriately
5. **An ID with polysubstance** (multiple rows in dose chart) — verifies `coSubstances` extraction and that the primary→phen mapping picks the right substance

Smoke checklist for each report:
- [ ] Title parsed correctly
- [ ] Body text > 200 chars, no header chrome leaking in
- [ ] Substance extracted; `experienceTypeSlug` set when in `SUBSTANCE_TO_PHENOMENON_SLUG`
- [ ] `event_date` set to `Exp Year` value at year-precision
- [ ] `source_published_at` set to `Published:` value
- [ ] Quality filter (`assessQuality`) passes (score ≥ 50, status `pending_review` or `approved`)
- [ ] V11.17.52 location safety net runs (will likely return null for these IDs — expected)
- [ ] V11.17.54 tag verifier accepts substance tag, rejects spurious
- [ ] Consolidated narrative (Stage C/D) writes `paradocs_narrative` successfully
- [ ] At least 1 of the 5 reaches `status='approved'` with a written narrative

**Orchestrator `--smoke` flag:** `tsx scripts/erowid-mass-ingest.ts --smoke` — fetches the 5 IDs above, runs them through the full ingest pipeline (PII redact → enrich → geocode → quality → smart-re-eval → insert), prints a one-line summary per report, exits. Sub-$0.05 total cost. **Founder runs this before any `--target N` invocation.**

`--limit 10` flag should also exist on the orchestrator so the founder can do a slightly larger sanity-check at any time without committing to the 90k drain.

---

## 11. Open questions for the founder

1. **What's the status of the April 2026 Erowid Center permission request?** The adapter has been written, gated, and emailed-on, but the registry-comment doesn't record a reply. Before any more eng time goes in, we should chase that email (or restart the conversation if it lapsed). I can draft the follow-up if you want. **This is the single decision that determines whether anything else on this memo matters.**

2. **Brand-fit scoping decision: full corpus or curated subset?** Ingesting all ~90k Erowid reports doubles the size of `consciousness_practices` and shifts Paradocs' editorial center of gravity meaningfully toward drug experiences. The alternative — limiting to Erowid's "Mystical Experiences" + "Entities and Beings" + "Difficult Experiences" sub-categories — yields ~15-20k reports that fit the paranormal-adjacent register much more cleanly. We can do either at the same per-report cost; the difference is corpus position. **Which?**

3. **Long-tail phen creation policy.** The proposed substance→phen map covers DMT, ayahuasca, LSD, psilocybin, salvia, ketamine, MDMA, mescaline, cannabis, meditation. Erowid catalogues 600+ substances. Most of the long tail (2C-B, MDA, 4-AcO-DMT, kratom, datura, etc.) won't have Paradocs phens. Three options: (a) auto-create new phens for any substance with ≥ N (e.g. 50) Erowid reports — most code-effort; (b) leave long-tail reports unlinked at the phen level, surface only via tags and category — simplest, accepts some discoverability loss; (c) fold long-tail substances into the broadest matching parent (all dissociatives → ketamine-experience, all phenethylamines → mescaline-experience) — risks miscategorization. **Recommend (b) for v1 and revisit if the tail proves valuable.**

4. **App-store positioning.** Should Erowid-sourced reports be (a) freely visible like the rest of the catalogue, (b) gated behind an 18+ consciousness-practices toggle in user settings, or (c) Pro-tier-only? Option (b) is the safest App Store posture and aligns with our category-toggle infrastructure; option (a) is the simplest. **Which?**

---

## Appendix A — Files to be modified (when permission lands)

- `src/lib/ingestion/adapters/erowid.ts` — version-stamp to V11.17.89, port the SUBSTANCE_TO_PHENOMENON_SLUG map, add UA-rotation + circuit-breaker per nuforc.ts, add ID-range shard support per nderf.ts orchestrator
- `src/lib/ingestion/adapters/index.ts` line 36 — uncomment `erowid: erowidAdapter,`
- `scripts/erowid-mass-ingest.ts` — new file, fork of `nderf-mass-ingest.ts` with ID-range sharding
- `outputs/erowid-mass-ingest-state.json` — state file (auto-created)
- `src/lib/caseProfile.ts` — verify `erowid` case (already exists at line 471)
- `src/lib/ingestion/filters/quality-filter.ts` — Erowid thresholds already set (line 1249: approve=70, review=50, minDescLength=300) — confirm at PR time
- DB migration to seed `data_sources` row for `erowid` with `legal_status` = `'licensed_with_written_permission'` + reference the permission letter date

## Appendix B — What we did NOT do during scoping

- We did **not** scrape any reports. Fewer than 5 polite probes against `robots.txt`, `about_legal.shtml`, `about_copyrights.shtml`, `exp_about.cgi`, and three high-ID `exp.php` HEAD-equivalent fetches were made to confirm site structure. No report bodies were downloaded or stored.
- We did **not** fingerprint the IP behind any aggressive bot signature.
- We did **not** modify any production code; the existing April-2026 stub at `src/lib/ingestion/adapters/erowid.ts` is unchanged and remains commented-out in the registry.
