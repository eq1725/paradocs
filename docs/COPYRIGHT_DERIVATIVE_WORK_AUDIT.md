# Paradocs — Copyright + Derivative-Work Audit

**Date:** June 7, 2026
**Author:** Engineering audit (code + ToS + render review)
**Scope:** All active ingestion adapters and the `/report/[slug]` render path
**Status:** TECHNICAL + RISK assessment — NOT legal advice. HIGH-risk findings require an IP/media attorney before reliance.

---

## Executive Summary

Paradocs ingests paranormal reports from 11 third-party sources (NUFORC, Reddit, YouTube, NDERF, OBERF, BFRO, IANDS, Erowid, Shadowlands, Ghosts of America, Wikipedia, plus news + government). The founder's premise — "extract facts, add original analysis, link out" — is **largely implemented well at the render layer** but has **meaningful gaps at the storage and policy layers**.

**The good (render layer is strong):**
- `scrubIndexReport()` in `src/pages/report/[slug].tsx:120-146` nulls the `description` field for every non-curated source before the page leaves the server. The public client never sees verbatim source prose from NUFORC, Reddit, YouTube, NDERF, OBERF, etc.
- The `SourceBlock` component (`src/components/reports/SourceBlock.tsx`) renders an explicit "Originally published at [Source]" header, an optional 500-char-capped italicized blockquote excerpt with "Excerpt and preview shown under fair use for commentary" caption, and a prominent "Read original →" CTA on every report.
- `src/lib/ingestion/media-policy.ts` codifies per-source media handling: `link_only` for NUFORC/Reddit/NDERF/OBERF/Erowid/IANDS/news, `embed_only` for YouTube, `download` only for CC-BY-SA Wikipedia + public-domain government works.
- AI rewrites run through `rewriteWithGuardrails` (`src/lib/ai/rewrite-pipeline.ts`) with hedge-voice rules ("the source describes…"), anti-fabrication preamble, anonymization rules, and a Haiku claim-citation second pass.
- A formal `B0_8_LEGAL_REVIEW_PACKET.md` brief exists for outside counsel; `MEDIA_POLICY.md` documents the per-source ToS rationale.

**The not-so-good (storage layer + policy gaps):**
- The full verbatim source text is **stored in `reports.description` for every ingested record** (capped at 15,000 chars for NDERF, 5,000 for YouTube, ~unlimited for Reddit). Scrubbing happens at SSR render time only; the underlying DB still holds Reddit/NUFORC/NDERF/OBERF prose at scale. This is defensible as "AI input cache" but at 100k+ rows reads as a republication-class corpus if anyone subpoenas the DB.
- **No takedown endpoint is publicly advertised** (no /dmca, no contact-us page found, no robots.txt-style "notice & takedown" disclosure on the site). The B0.8 packet references an admin-side per-source takedown tool but it is not exposed to the public.
- **Terms of Service barely addresses ingested content** (`src/pages/terms.tsx`: one mention of "third parties" on line 141; no fair-use framework, no DMCA agent, no per-source attribution policy).
- **No `/sources` or "About our ingestion" page** to publicly document the editorial framework — currently invisible to users + rights holders.
- Reddit's ingestion path (`src/lib/ingestion/adapters/reddit.ts`) uses **Arctic Shift** (a third-party Reddit archive mirror) rather than the official Reddit API, which itself raises an unresolved question about whether Reddit's API ToS or Arctic Shift's own terms apply.

**Top risk concentrations:** Reddit (volume + commercial-use ToS clause + Arctic Shift indirection), NDERF/OBERF (joint copyright with experiencers, MEDIA_POLICY flags as "❌ LINK ONLY"), NUFORC (no public reuse license + Cloudflare adversarial-scraping posture suggests they don't want bulk scraping). Across all of these, the volume of takings — six-figure row count per source — pushes well past the "transformative few" zone and into the "looks like republication" zone unless the storage + render disclosures are tightened.

**Recommendation:** Five shippable changes in the next 1–2 sprints (see Quick Wins) materially de-risk the posture. Beyond that, founder should retain media/IP counsel **before** the planned mass-market launch.

---

## Legal Framework

This audit applies established US copyright doctrine; it does not invent novel theories. The relevant principles:

**Facts are not copyrightable** (*Feist v. Rural Telephone*, 499 U.S. 340 (1991)). Date, location, phenomenon type, witness count, UFO shape, NDE trigger event, sighting duration — uncopyrightable. Paradocs can extract and store these freely from any public source. A directory of facts may carry a thin "compilation copyright" if the **selection or arrangement** is creative, but the underlying facts themselves remain free.

**Expression is copyrightable.** The specific wording a witness used to describe their experience — the prose narrative — is protected the moment it is fixed in tangible form (a Reddit post, a NUFORC submission, a YouTube comment, an NDERF questionnaire). Length doesn't gate copyrightability; even a single sentence can be protected if creative.

**Fair use (17 U.S.C. §107)** is a four-factor defense, not a right:
1. **Purpose and character** — transformative use (criticism, comment, scholarship, research) weighs strongly for fair use. Commercial purpose weighs against, though commerciality alone is not dispositive (*Campbell v. Acuff-Rose*, 510 U.S. 569 (1994)).
2. **Nature of the work** — factual/published works are more amenable to fair use than creative/unpublished works. Witness testimony sits in a grey zone: it's factual reporting *delivered* as creative prose.
3. **Amount and substantiality** — both quantitative (length) and qualitative ("the heart of the work") matter. Short pull-quotes are safer than full reproduction.
4. **Effect on the market** — does Paradocs substitute for the source? If a reader can get "the report" entirely on Paradocs without ever visiting NUFORC/Reddit/NDERF, factor 4 cuts hard against fair use.

**Derivative work** — a work "based upon" a copyrighted work. An AI paraphrase that retains substantial similarity to the original may be derivative even if no exact phrases match. Faithful-paraphrase prompts can produce derivative output; transformative commentary (genuinely new analytical framing) is safer.

**Platform-specific ToS** are often more restrictive than copyright law alone:
- Reddit's User Agreement reserves commercial-use restrictions; the 2023 API repricing made bulk archival access a paid product (and effectively shut down free third-party archives like Pushshift in the form they previously took).
- YouTube's API ToS prohibits caching beyond a small operational window and prohibits creating "substitute" services.
- NUFORC's site footer claims "© 2026 NUFORC" with no reuse license stated.
- NDERF/OBERF: experiencer submissions retain copyright; the foundation operates with joint custody and asks third parties to seek permission for republication.

**Database rights (EU)** — sui generis database protection exists in the EU but not in the US. If Paradocs is US-domiciled and serves EU users, EU rights-holders could theoretically assert claims; this is a counsel question.

**Attribution** is not a fair-use prerequisite under US law, but it is a *strong factor* in transformativeness analysis and a near-uniform community norm. Paradocs already attributes via SourceBlock; the question is whether attribution is prominent enough.

**Note on the Internet Archive *Hachette* (2023) decision:** the Second Circuit rejected Internet Archive's "controlled digital lending" fair-use theory in significant part because it functioned as a market substitute. The lesson for Paradocs: storage volume + commercial subscription + substitution function are the danger triad. We have at least two of three; the third (substitution) is the question that the render-layer scrubbing is designed to mitigate.

This memo flags areas where counsel input is needed; it is not itself legal advice.

---

## Per-Source Audit

### 1. NUFORC — UFO Sighting Reports

**Adapter:** `src/lib/ingestion/adapters/nuforc.ts` (1,107 lines)
**Mass-ingest script:** `scripts/nuforc-mass-ingest.ts`

**What gets fetched:** Index page → per-month wpDataTable AJAX endpoint → per-report HTML page when narrative is needed (lines 757–874 in `fetchReportDetails`). Pulls structured fields (date, city/state, shape, duration, observer count, color, estimated speed/size, direction, angle, characteristics) and the free-text narrative.

**What's stored verbatim in DB:**
- `reports.description` = full narrative text from the NUFORC report page (no length cap visible in adapter; the engine may cap downstream).
- `reports.summary` = capped at 400 chars (lines 1047–1048).
- `metadata.shape`, `metadata.estimatedSpeed`, `metadata.estimatedSize`, etc. = structured fields (factual, safe).
- `source_url` = `https://nuforc.org/sighting/?id=<id>` — present and linked back.

**What's transformed:**
- Title is regenerated: e.g. `"Sphere Sighting in Toledo, Ohio (2024-05-12)"` (line 1047) — this is a Paradocs-original title, not the NUFORC title.
- Shape → canonical phenomenon slug via `SHAPE_TO_PHENOMENON_SLUG` map (lines 78–100).

**What's discarded:** NUFORC reports whose "Explanation" column already names a mundane cause (hoax, IFO, Starlink, Venus, balloon, etc.) — `NUFORC_DEBUNKED_PATTERNS` filter at line 12. This is a *quality* filter, not a copyright safeguard.

**Rate limiting / ToS compliance:** Strong — V11.17.63 hardening (lines 169–266) includes:
- Exponential backoff 5s/15s/45s with ±25% jitter
- Respects `Retry-After` headers
- Module-level circuit breaker (pauses all workers 5 min after 5 consecutive 503/429/403)
- 5-User-Agent rotation, `Sec-Fetch-*` browser-like headers
- 500ms default per-request rate limit

The Cloudflare 503/403 pattern that triggered V11.17.94–96 hardening is a strong signal that **NUFORC's CDN is actively blocking bulk scrapers**. The fact that we built an evasion path is operationally pragmatic but legally noteworthy — it's circumstantial evidence the rights holder did not consent to bulk ingestion.

**ToS / reuse posture:** Per `MEDIA_POLICY.md` line 15: "Site copyright © 2026 NUFORC. User submissions grant NUFORC a perpetual license, but no sublicense to third parties is stated." Founder team has not (per code comments + B0.8 packet) reached out to NUFORC for explicit reuse permission.

**Volume:** The codebase tracks ~624 monthly index pages × ~345 reports/month = upper bound around 215k NUFORC reports in the corpus. Multiple completed tasks reference "NUFORC mass ingest" workflows. **At this scale, the fair-use volume argument weakens.**

**Risk: HIGH** — bulk scraping over Cloudflare resistance, no per-source license, six-figure row count, full narrative stored verbatim in DB. Render-layer scrub mitigates user-facing exposure but does not eliminate underlying storage risk.

---

### 2. Reddit — r/Paranormal, r/UFOs, r/Ghosts, r/Glitch_in_the_Matrix, etc.

**Adapter:** `src/lib/ingestion/adapters/reddit.ts` (1,033 lines) + `reddit-v2.ts`
**Subreddits ingested:** 50+ mapped in `SUBREDDIT_CATEGORIES` (lines 25–98), including r/Paranormal, r/UFOs, r/Ghosts, r/AlienAbduction, r/DMT, r/Ayahuasca, r/AstralProjection, r/Witch, r/Demons, r/SleepParalysis, etc.

**API surface:** Uses **Arctic Shift** (`https://arctic-shift.photon-reddit.com/api/...`, line 17) — a third-party Reddit archive mirror — **not** Reddit's official Data API. This is operationally necessary (Reddit's API repricing in 2023 made bulk access expensive) but it raises an unresolved question: does Reddit's User Agreement still bind us when we never touch Reddit directly? Probably yes (we are downstream consumers of content Reddit owns the platform rights to), but Arctic Shift's own ToS would also apply.

**What's stored verbatim:** `parseRedditPost()` at lines 659–798. Critical detail:
- `description` = the full Reddit `selftext` (after markdown normalization). **No length cap.** Self-text on Reddit can be 10,000+ chars; long Glitch-in-the-Matrix or Paranormal narratives commonly run 2k–4k chars.
- `summary` = first 200 chars of description.
- Comments are also ingested as standalone "reports" (line 540 `fetchPostComments`); minimum 150 chars, score ≥ 0; stored verbatim.

**What's transformed:** Title goes through `improveTitle()` / `forceGenerateTitle()` (`src/lib/ingestion/filters/title-improver.ts`) — adapter generates a descriptive title like `"Shadow Figure Encounter — r/Paranormal"` rather than reusing the OP's headline. This is a meaningful transformation.

**What's discarded:** Strong content filter — `META_POST_PATTERNS` (175+ regex patterns), `NON_SIGHTING_PATTERNS` (art/merch/movie talk), `SPAM_URL_PATTERNS`. These filter for *quality*, not copyright. Removed/deleted/promotional posts are dropped.

**Rate limiting:** 1000ms between subreddit fetches (line 956). Identifies as `Paradocs/1.0 (Paranormal Research Database; contact: admin@paradocs.com)` — proper UA, contact email present.

**Reddit ToS posture (counsel verification needed):**
- Reddit's User Agreement § content licensing — users grant Reddit a license; Reddit grants other users a similar license for personal, non-commercial use of platform content. Commercial republication outside Reddit's API terms is not generally permitted.
- The 2023 API repricing was specifically about commercial bulk access. Paradocs' subscription tiers ($5.99/$14.99) clearly make this a commercial product.
- Arctic Shift is a community archive; its own ToS / sustainability is not guaranteed.

**Volume:** With 50+ subs and over-fetch of `MIN_PER_SUB × TARGET_OVERFETCH` (line 988), each smoke pass could pull hundreds; mass-ingest scripts have run since at least task #97. Estimated 50k–150k Reddit-derived reports in the DB based on cross-referenced tasks (#97, #100, #105, #156).

**Risk: HIGH** — three independently-bad signals: commercial-use ToS friction, full-selftext verbatim storage, six-figure volume, Arctic Shift indirection adds a second ToS layer. Comment ingestion in particular (`isComment: true` reports) is harder to defend because comments are short, conversational, and the "transformative analysis" framing weighs less.

---

### 3. YouTube — Video Metadata, Descriptions, Comments

**Adapter:** `src/lib/ingestion/adapters/youtube.ts` (656 lines)
**Mass-ingest:** `scripts/youtube-mass-ingest.ts`

**What's fetched:** Uses the **official YouTube Data API v3** (line 411 `commentThreads`, line 487 `search`). Two phases: per-channel video listing (8 default channels — MrBallen, Nukes Top 5, The Why Files, MUFON, Bob Gymlan, etc.), and search-based discovery on 20 default queries. Per video: title, description, thumbnail, statistics, top-level comments.

**What's stored verbatim:**
- For videos: `description` = the YouTube video description, **truncated to 5,000 chars** (line 261). Title stored verbatim.
- For comments: `description` = full comment text (HTML stripped), minimum 300 chars, minimum 5 likes (lines 79–82). No upper truncation visible.

**What's transformed:** Comment titles synthesized from first sentence (line 339). `isExperiencerComment()` filter (line 197) requires first-person + narrative indicators.

**Media policy:** `embed_only` per `media-policy.ts:48`. YouTube thumbnails ARE pushed to `report_media` (line 276) which is technically a hotlink to YouTube's CDN — under YouTube ToS this is borderline; thumbnails should be served via embed, not stored as URLs. **Open question — counsel review.**

**YouTube ToS:**
- YouTube API Services Terms of Service §III.E.4 — developers must not "store copies of any data … other than for the limited period necessary to provide your API Client."
- Caching comment text indefinitely in a public database is in tension with that clause.
- Embedding videos via the standard embed URL is explicitly permitted.

**Volume:** Per task #101–#102 (YouTube mass-ingest audited for V11.17.x mitigations and daily cap), this pipeline runs under quota; daily cap suggests low thousands per day. Estimated 10k–40k YouTube-derived reports + comments.

**Risk: MEDIUM-HIGH** — YouTube ToS is unusually explicit about caching restrictions on API-derived data. The thumbnail-as-stored-URL pattern is the most concrete violation indicator. Video descriptions truncated to 5k is also long-ish for fair use. Comment ingestion shares the Reddit problem: short, conversational, harder to defend as "transformative analysis."

---

### 4. NDERF — Near-Death Experience Research Foundation

**Adapter:** `src/lib/ingestion/adapters/nderf.ts` (1,152 lines)
**Mass-ingest:** `scripts/nderf-mass-ingest.ts`

**What's fetched:** Archive index pages (`nderf.org/Archives/*.html`) → individual experience pages (`/Experiences/<id>.htm`). Per-page extraction targets the `<span class="m108">Experience Description</span> ... </span>` block (line 899), then extracts ~14 structured questionnaire fields (gender, trigger, tunnel/light/OBE/life-review yes-no, etc.) via `extractField()`.

**What's stored verbatim:**
- `description` = the experience narrative, **capped at 15,000 chars** (line 938). Most NDE narratives are 1k–8k; some run long.
- `case_profile` = structured questionnaire answers (yes/no, gender, trigger) — these are *facts*, fair-use safe (lines 300–330).

**What's transformed:**
- Title is regenerated: `"Near-Death Experience During Drowning, Vancouver Island (2010)"` (line 794 `generateNDERFTitle`). Never includes person names; trigger detected from narrative or questionnaire.
- NDERF's evaluative tier ("exceptional / probable / questionable") is explicitly NOT surfaced — "internal only" (line 22 comment, line 1044 `nderf_tier` in metadata only). **Good editorial discipline** — republishing NDERF's editorial judgment would be a worse ToS posture than republishing the narrative.

**ToS posture:** Per `MEDIA_POLICY.md` line 20: "**❌ LINK ONLY** Joint copyright with experiencers. Most experiencers don't grant republishing permission. Link only."

NDERF asks third parties to seek permission for republication. The submission terms experiencers agree to grant NDERF a license for NDERF's use; nothing in those terms grants downstream rights to platforms like Paradocs.

**Volume:** Adapter targets exceptional + probable archives; estimated 4k–8k NDERF experiences in the corpus.

**Rate limiting:** 500ms default; browser-like UA. Adequate but lighter than NUFORC. NDERF has not (per code) blocked Paradocs scrapers; absence of resistance is not consent.

**Risk: HIGH on storage, MEDIUM on render** — 15k-char verbatim narratives stored is the highest single-source storage exposure. Render layer scrub fully hides this from users. Without scrubbing, this would be a clear-cut derivative-work problem.

---

### 5. OBERF — Out-of-Body Experience Research Foundation

**Adapter:** `src/lib/ingestion/adapters/oberf.ts` (940 lines)
**Same foundation as NDERF**, sister site. Reuses NDERF's `extractField`, `buildCaseProfile`, `extractLocationSmart` (lines 26–33 import from `nderf.ts`).

Covers experience types NDERF doesn't host: OBE, STE, SDE, DBV, pre-birth memory, prayer, dream, UFO-contact (see `OBERF_ARCHIVES` array, line 115).

**Same storage pattern as NDERF.** Same `MEDIA_POLICY.md` posture (link-only, joint copyright). Adapter explicitly comments (line 21): "ToS posture: same as NDERF — store source description as AI input only, surface only the AI-generated narrative + structured case profile to users."

**Volume:** ~2k–5k experiences in the corpus (smaller archive than NDERF).

**Risk: HIGH on storage, MEDIUM on render** — identical to NDERF.

---

### 6. BFRO — Bigfoot Field Researchers Organization

**Adapter:** `src/lib/ingestion/adapters/bfro.ts` (1,116 lines).
**ToS posture:** Per `MEDIA_POLICY.md` line 16: "© BFRO.net — standard copyright, no public reuse license found." Link-only media policy. BFRO uses Class A/B/C classification (line 31) — Paradocs uses these as internal credibility signals.

**Stored verbatim:** Narrative text and BFRO's classification rationale. Similar to NDERF/OBERF — long-form narratives stored, then scrubbed at render.

**Risk: MEDIUM-HIGH** — same shape as NDERF but lower volume.

---

### 7. IANDS — International Association for Near-Death Studies

**Adapter:** `src/lib/ingestion/adapters/iands.ts` (408 lines).
**ToS posture:** Per `MEDIA_POLICY.md` line 21: "**❌ LINK ONLY**. 'All Rights Reserved.' Explicit statement: linking is not permission to duplicate or republish content. Academic fair-use citations only."

This is the strictest ToS posture in our source set — IANDS has explicitly written "linking ≠ permission to republish." Despite that, the adapter still stores `description` verbatim (subject to the render-layer scrub).

**Risk: HIGH on storage** — the source has explicitly disclaimed reuse. The Paradocs storage pattern is in tension with that disclaimer even if the render layer suppresses user-facing exposure.

---

### 8. Erowid — Experience Vaults

**Adapter:** `src/lib/ingestion/adapters/erowid.ts` (674 lines).
**ToS posture:** Per `MEDIA_POLICY.md` line 19: "Explicitly prohibits reuse and AI ingestion without written permission. Text content already indexed under fair-use index model; media must never be downloaded."

Per task #177 ("Erowid scope + design memo — adapter architecture, corpus size, cost, ethics, smoke plan"), the founder/team produced a design memo before building this adapter. The adapter respects robots.txt (line 5 comment) and uses a 2-second rate limit (line 77).

**Critical:** Erowid is the **only source in our set that has explicit, public, written prohibition of AI ingestion**. The adapter exists; whether it has been run in production needs verification with the operator.

**Risk: HIGH** — explicit prohibition. Even with fair-use rationale, this is the most likely source to send a cease-and-desist.

---

### 9. Other sources: Shadowlands, Ghosts of America, Wikipedia, News, ADCRF

- **Shadowlands** (`shadowlands.ts`, 281 lines) — "© 1998 shadowlord@theshadowlands.net. Standard copyright." Link-only media. Low volume. **Risk: MEDIUM**.
- **Ghosts of America** (`ghostsofamerica.ts`, 330 lines) — no ToS found per MEDIA_POLICY; conservative link-only. Low–medium volume. **Risk: MEDIUM**.
- **Wikipedia** (`wikipedia.ts`, 497 lines) — CC BY-SA, fully permissible with attribution. Download + store enabled. **Risk: LOW** (provided CC BY-SA attribution is present on rendered pages — verify SourceBlock includes the license string for Wikipedia sources).
- **News** (`news.ts`, 323 lines) — link-only; ToS varies per outlet. **Risk: MEDIUM-HIGH** (news lawsuits are the most common copyright outcome for aggregators).
- **ADCRF** (`adcrf.ts`, 697 lines) — After-Death Communication Research Foundation, same family as NDERF/OBERF. Same risk profile.

---

## Report-Page Rendering Audit

Walking the `/report/[slug]` page top-to-bottom and tagging every rendered field with a risk classification.

| # | Field | Source of text | Risk Class | Notes |
|---|-------|---------------|-----------|-------|
| 1 | Animated map header (location pin) | `reports.latitude/longitude/city/state` | **FACTS-ONLY** | Geocoded coords + city/state. Uncopyrightable factual data. |
| 2 | Title (h1) | `reports.title` — Paradocs-generated for NUFORC/NDERF/OBERF; lightly improved for Reddit/YouTube via `title-improver.ts` | **ORIGINAL** for NUFORC/NDERF/OBERF; **PARAPHRASE** for Reddit/YouTube | NUFORC/NDERF titles are 100% synthesized (e.g. "Sphere Sighting in Toledo, Ohio"). Reddit/YouTube can fall back to OP title under `improveTitle()` no-improvement path — verify in practice. |
| 3 | Answer line (TL;DR) | `reports.answer_line` — AI-generated via `rewriteWithGuardrails` faithful_paraphrase mode | **PARAPHRASE** | Subject to anti-fabrication + hedge-voice + claim-check. Low risk if pipeline runs correctly. |
| 4 | "Who / Where / When" meta block | `reports.event_date`, `city`, `state_province`, `country`, `witness_count` — structured factual columns | **FACTS-ONLY** | Safe. |
| 5 | Phenomenon chips + category | `reports.phenomenon_type_id` (foreign key) + `reports.category` | **ORIGINAL** (Paradocs taxonomy) | Phenomenon taxonomy is Paradocs's own editorial work. |
| 6 | Pull quote | `reports.pull_quote` — AI-generated highlight from narrative | **PARAPHRASE** (with quotation framing) | The pull quote is the highest-risk AI-generated field because a faithful paraphrase of a short, distinctive sentence can land very close to the original. Mitigations in `rewrite-pipeline.ts` reduce but don't eliminate this risk. |
| 7 | "What happened" narrative | `reports.paradocs_narrative` — AI-rewritten via faithful_paraphrase mode | **PARAPHRASE** | The most substantial AI-generated field. Hedge voice ("the source describes…") + claim-check + anonymization rules are good defenses. Could still be derivative if the source narrative is short + distinctive. |
| 7b | Fallback excerpt blockquote | `metadata.source_excerpt` — first paragraph / meta description of source | **VERBATIM, ≤500 chars** | Only renders when `paradocs_narrative` is null. 500-char cap + italics + quotation marks + "Excerpted from {sourceLabel} … Read the full account below" + explicit "Excerpt and preview shown under fair use for commentary" caption (SourceBlock.tsx:208). This is a textbook fair-use treatment. |
| 8 | SourceBlock (attribution + Tier 1/2/3 embed) | `source_url`, `source_label`, optionally `thumbnail_url` + `excerpt` | **ATTRIBUTION + LINK** | "Originally published at [Source]" + "Read original →" CTA + (Tier 1) sandboxed iframe embed for YouTube/Reddit/Vimeo/Imgur, (Tier 2) OG thumbnail + capped excerpt, (Tier 3) text-only. The attribution chrome ALWAYS renders above any embed. |
| 9 | Paradocs Analysis lens cards (frames, open questions, alt explanations) | AI-generated commentary | **ORIGINAL** (editorial) | This is the value-add layer the founder's framing references. |
| 10 | Patterns strip ("N similar cases in [State]") | Cross-corpus aggregate counts | **ORIGINAL** (compilation work) | Genuine database analytics. |
| 11 | Related reports cards | Internal Paradocs reports | **N/A** | Cross-references to other Paradocs records. |
| 12 | Additional images strip (in SourceBlock) | `report_media.url` hotlinks | **LINK-ONLY (hotlink)** | Per `media-policy.ts`, link-only sources get hotlinked, not stored. Hotlinking sidesteps storage copyright but creates a "deep-link" / hot-link liability surface that varies by jurisdiction. |

**Critical render-layer finding (positive):** `src/pages/report/[slug].tsx:120-146` `scrubIndexReport()` sets `reportData.description = null` and `reportData.summary` to a short AI-derived alternative before returning props from `getStaticProps`. This means the verbatim source text is **never sent over the wire** for non-curated sources. Verified by reading `ReportPageV2.tsx`: there is no code path that renders `report.description` directly. The narrative-paragraph render at line 823 reads from `sanitized.narrative` (= `paradocs_narrative`), not from `description`.

**Critical render-layer finding (concern):** When `paradocs_narrative` is `null` (claim-check failed, INSUFFICIENT sentinel, or the AI pipeline hasn't run), the fallback at line 854 renders `sourceExcerpt` — which comes from `metadata.source_excerpt`. This is meant to be the source's *own* meta-description (first paragraph), capped at 500 chars in the render. The ingestion adapters do not always populate `metadata.source_excerpt` from a clearly fair-use-safe slice; for Reddit specifically, this could fall back to a slice of the OP's selftext. **Verify what `metadata.source_excerpt` actually contains for each source** before relying on this fallback being safe.

**OG image / share card:** The `og:image` is generated at `/api/og/report/:slug` (line 430). If this image embeds the AI narrative + pull quote, it's still Paradocs-original output. If it ever embeds verbatim source text, that would be a new exposure surface (verify the OG endpoint).

---

## Risk Register

| Source | Storage Risk | Render Risk | Volume Risk | ToS Risk | Overall |
|--------|-------------|-------------|------------|----------|---------|
| **NUFORC** | HIGH (full narratives, no cap) | LOW (scrubbed) | HIGH (~100k+) | HIGH (Cloudflare blocking, no license) | **HIGH** |
| **Reddit** | HIGH (full selftext, no cap, comments too) | LOW (scrubbed) | HIGH (~50k–150k) | HIGH (commercial-use clause + Arctic Shift indirection) | **HIGH** |
| **YouTube** | MEDIUM (descriptions 5k cap, comments uncapped) | LOW (embed only) | MEDIUM (~10k–40k) | HIGH (API ToS caching clause) | **HIGH** |
| **NDERF** | HIGH (15k cap narratives) | LOW (scrubbed) | MEDIUM (~4k–8k) | HIGH (joint copyright, link-only per MEDIA_POLICY) | **HIGH** |
| **OBERF** | HIGH (same as NDERF) | LOW | LOW–MEDIUM (~2k–5k) | HIGH (same as NDERF) | **HIGH** |
| **IANDS** | HIGH (storage despite explicit no-reuse) | LOW | LOW | VERY HIGH (explicit "linking ≠ republish" disclaimer) | **HIGH** |
| **Erowid** | HIGH | LOW | LOW | VERY HIGH (explicit prohibition on AI ingestion) | **HIGH** |
| **BFRO** | MEDIUM | LOW | MEDIUM | MEDIUM (no public license but no explicit disclaimer either) | **MEDIUM** |
| **Shadowlands** | LOW (text-only, low volume) | LOW | LOW | MEDIUM | **LOW–MEDIUM** |
| **Ghosts of America** | LOW–MEDIUM | LOW | LOW–MEDIUM | MEDIUM | **MEDIUM** |
| **News** | MEDIUM | LOW | varies | HIGH per-outlet | **MEDIUM–HIGH** |
| **Wikipedia** | LOW (CC BY-SA) | LOW (verify attribution shown) | LOW | LOW (CC BY-SA) | **LOW** |
| **Government / FOIA / BlackVault** | LOW | LOW | LOW | LOW (public domain) | **LOW** |

**Highest concentration of risk:** Reddit (volume × ToS × commercial × indirection), NDERF/OBERF (volume × explicit no-reuse posture), Erowid (explicit prohibition). NUFORC's adversarial-CDN posture is the strongest "rights-holder didn't consent" signal across the set.

---

## Recommendations

### Per-source adjustments to push risk → LOW

**Reddit:**
- Cap stored `description` at 1,500 chars (vs current uncapped). Truncate with `…` and rely on `paradocs_narrative` for the user-facing render. The discarded tail is no loss to the analysis pipeline because the AI already gets only the first ~8k chars in `rewrite-pipeline.ts:v10.6.18`.
- For comment ingestion specifically, store only the AI-paraphrased version + cite the parent post URL. Comments are the lowest-defensibility class of takings (short, conversational, hard to call "research material").
- Add a one-line disclosure in the SourceBlock attribution chrome for Reddit-sourced reports: "Posted publicly to r/[sub] by [author or 'anonymous']. Read original →" — this names the rights holder and makes the link-back unmissable.
- Migrate from Arctic Shift to a sanctioned path before mass-market launch (either Reddit's paid API or a written agreement).

**NUFORC:**
- Reach out to NUFORC editorial board for an explicit reuse / API arrangement. They are a small, mission-driven org; many such orgs say yes when asked and were never going to send a takedown until the volume embarrassed them publicly. A friendly outreach is cheap insurance.
- Until that lands, cap stored `description` at 2,000 chars and back off the request rate further (current 500ms is fine quantitatively; the issue is Cloudflare's reputation system has already flagged us).
- Drop the User-Agent rotation. UA rotation reads as actively adversarial. Use a single, honest UA: `Paradocs/1.0 (research aggregation; contact: legal@paradocs.com)`.

**YouTube:**
- Delete cached video descriptions older than the YouTube ToS-permitted operational window (~30 days is the conservative read). Or migrate descriptions to "fetched on demand" rather than stored.
- Stop hotlinking YouTube thumbnails into `report_media`. Use the YouTube embed iframe which auto-includes the thumbnail; the embed is explicitly permitted by YouTube ToS.
- Cap comment ingestion volume — currently min 5 likes / 300 chars; tighten to min 50 likes / 600 chars to defensibly call it "selected, high-signal testimony."

**NDERF / OBERF:**
- Reach out to the foundation for explicit reuse permission. They have a research mission that aligns with Paradocs's framing; a written license is the right ask.
- Reduce stored `description` cap from 15,000 → 3,000 chars. The AI rewriter doesn't need more than that for a good paraphrase (per `rewrite-pipeline.ts` v10.6.18 the prompt is fed 8K max).
- Already-good: editorial tier is suppressed, name-anonymized titles, structured case profile is fact-only.

**IANDS / Erowid:**
- **Recommend full removal until written permission obtained.** These are the two sources with the most explicit rights-holder positions. The current `link_only` posture in media-policy.ts protects images but the *text storage + AI ingestion* are exactly what these sources have disclaimed.
- If keeping for research-only internal use (e.g. for pattern analysis but not public-facing report pages), set `status='archived'` on all IANDS + Erowid rows and exclude from public APIs.

**News:**
- Apply 250-char hard cap on stored description; rely on link-out for body.

### Report-page rendering improvements

**Concrete UI changes:**

1. **Shrink the fallback excerpt block from 500 → 280 chars** (`SourceBlock.tsx:204`). 280 chars is "Twitter-quote-length," well within the courts' historical comfort zone for fair-use pull quotes. The "Excerpt and preview shown under fair use for commentary" caption is good — keep it.

2. **Make the "Read original →" button bigger and earlier.** Right now it lives in the SourceBlock header which sits below the narrative. Add a second link-out at the top of the "What happened" section: `"Source: r/Paranormal · Read original →"` as a small dateline above the section header. This unmistakably signals to a reader that they are reading Paradocs's analysis of a primary source, not the primary source itself.

3. **Add an explicit attribution kicker above the title** for ingested reports: `"Ingested from NUFORC · Paradocs analysis"`. This shifts the editorial frame from "Paradocs published this UFO sighting" to "Paradocs is analyzing a UFO sighting published elsewhere."

4. **For Wikipedia-sourced reports, ensure the CC BY-SA license string actually renders.** Currently `getAttributionText('wikipedia')` returns `'CC BY-SA, Wikimedia Commons'` but it is unclear whether SourceBlock consumes this. Verify and surface.

5. **Add a per-report "Request takedown" link in the SourceBlock footer** that emails a Paradocs legal-contact address with the slug pre-filled. This is the operational signal of good faith — much more than ToS language alone.

6. **Add structured-data markup (`<script type="application/ld+json">`)** that flags the page as a `CreativeWork` / `AnalysisNewsArticle` with `isBasedOn` pointing to `source_url`. Both search engines and rights holders use this to disambiguate "analyzing X" from "publishing X."

### Cross-cutting

- **Add `/sources` page** publicly documenting (a) the list of sources, (b) the fair-use rationale, (c) the takedown contact, (d) what factual data Paradocs extracts vs. what original analysis Paradocs adds. This is a top-3 fair-use signal to courts: showing a thoughtful editorial framework cuts hard against "wholesale republication."
- **Add `/dmca` page** with designated agent name + address. Costs $6 to register the agent with the Copyright Office; provides Section 512 safe-harbor protection.
- **ToS update** — `src/pages/terms.tsx` currently has one line mentioning third-party content. Expand to: ingestion framework description, source list, fair-use stance, takedown procedure, AI-rewrite disclosure. Have counsel approve.
- **robots.txt audit per source** — verify the adapters respect each source's robots.txt; Erowid adapter comment claims it does, others don't reference it. Add a runtime check in the shared `fetchWithHeaders` helper.

---

## Comparable Case Studies

**1. Pinterest (image attribution + link-back, settled lawsuits 2012–2014).** Pinterest's early posture was "pin anything from anywhere"; they got sued by photographers and quickly added (a) "Visit site" link-backs on every pin, (b) opt-out meta-tag (`<meta name="pinterest" content="nopin">`), and (c) DMCA agent + fast takedown. They were never definitively held liable (settlements, not adverse judgments) but the lesson is clear: **link-back prominence + takedown responsiveness moved them off the bullseye.** Paradocs has the link-back; needs the takedown.

**2. Wikipedia / Wikimedia Commons (fair-use thresholds + image free-content requirement).** Wikipedia's policy is to use **only free-content images** for living people and where free alternatives are practically obtainable; fair-use claims on Wikipedia are extremely narrow (one image, low resolution, with explicit fair-use rationale per use). The lesson for Paradocs: when fair use is the defense, *narrowness is itself a defense*. The 500-char excerpt cap is good; tighter is better. Wikipedia's success at avoiding image-copyright lawsuits is largely because they choose to take less than fair use would allow.

**3. Goodreads (publisher-supplied vs. user-supplied content).** Goodreads originally scraped book metadata from publisher catalogs; after Amazon acquired them they shifted to publisher-supplied metadata under license. The pattern is generalizable: **the safest path from "we scrape" to "we sustain" is converting per-source scrapes into per-source licenses or data-feed agreements.** Paradocs could approach NUFORC, NDERF, and IANDS the same way — small annual data-license fees are common in the research-archive world.

**4. Genius / lyric sites (Lyrics.com et al.) — repeated NMPA / music publisher litigation.** Lyric aggregators have been repeatedly sued because they reproduce 100% of a short, distinctive creative work (a song lyric) with attribution. **Attribution alone did not save them.** The lesson for Paradocs is that *for short, distinctive narratives* (a 200-word Reddit ghost story, an evocative pull quote), attribution + transformative framing may be inadequate; the takings volume itself matters. This is the strongest argument for the storage-cap recommendations above.

**5. AllRecipes / Food52 (recipe headnote vs. recipe-itself copyright).** Recipes are an interesting precedent because the *list of ingredients + steps* is unprotectable (functional/factual) but the *narrative headnote* ("On a rainy Tuesday in Provence, my grandmother…") is protectable. Aggregator sites that extract only ingredients/steps + write their own headnotes have generally not been sued; sites that copy the headnote have been. **This is exactly the Paradocs framing the founder articulated**: extract facts (the recipe), write your own headnote (the Signal analysis). The execution matches the framing — the question this audit answers is whether the execution holds at scale.

---

## Open Legal Questions for the Founder

These genuinely require counsel. The first three are blocking before mass-market launch; the last two are scoping questions.

1. **NUFORC + NDERF + IANDS + Erowid — outreach status.** Has anyone from Paradocs proactively contacted these orgs for explicit reuse permission? If not, that outreach is itself a positive signal to a future court (good-faith effort to license). If yes, what was their response — written record? Especially urgent for Erowid, given the explicit prohibition.

2. **Reddit ToS as of mid-2026 + Arctic Shift legal status.** Has Reddit's User Agreement materially changed since the 2023 API repricing? Is Arctic Shift operating under any known cease-and-desist or threatened action? Does Reddit's commercial-use clause apply to Paradocs given the subscription tiers? Counsel should opine on whether the current ingestion path is sustainable or whether migration to a paid Reddit API arrangement is required.

3. **YouTube API ToS §III.E.4 caching clause.** Does indefinite storage of comment text and video descriptions in Paradocs's DB violate the YouTube ToS caching restriction? If yes, what is the remediation path — delete + re-fetch on demand, or restructure ingestion to extract only the AI-paraphrased version + structured metadata? This is the single most cleanly-violable ToS clause across our source set.

4. **Database compilation copyright claim — defensive scope.** Paradocs's editorial selection + arrangement + cross-corpus analytics likely qualifies for a thin compilation copyright. Counsel should opine on (a) whether to register the compilation with the US Copyright Office to enable statutory-damages claims against scrapers of Paradocs's own database, and (b) how to draft Paradocs's ToS to prohibit downstream scraping while not contradicting the fair-use framework Paradocs itself relies on.

5. **EU exposure given paid subscribers in EU.** If Paradocs sells $14.99/mo subscriptions to EU residents, does that bring the platform within reach of (a) EU sui generis database rights of EU-domiciled rights holders, and (b) GDPR data-subject rights for ingested-witness narratives that might contain PII? The render-time `stripPiiWithLogging` helps but doesn't directly answer the question.

---

## Quick Wins (Sprint-1, Shippable in 1–2 Weeks)

These five changes meaningfully reduce risk without major rewrites. None require new infrastructure; all are bounded edits.

1. **Ship a `/sources` page** (1 day eng work) — public-facing list of sources, fair-use rationale, takedown email. Pull narrative from `MEDIA_POLICY.md` + the founder framing in the audit prompt. Link from the footer. **This is the single highest-impact change** — it converts an invisible editorial framework into a visible one, which is exactly what fair-use analyses weight.

2. **Ship a `/dmca` page + designated agent registration** (½ day eng + $6 + form). Register a DMCA agent with the US Copyright Office (eCO portal). Add `/dmca` page with the agent contact, the takedown procedure, and a 24-hour SLA commitment. Provides Section 512 safe-harbor protection that materially limits exposure on user-submitted content + reduces hostility on takedown requests.

3. **Cap stored `description` lengths and rebuild attribution kicker** (2 days eng). In `engine.ts` or a one-time migration: truncate `reports.description` to 2,000 chars for Reddit/NUFORC/NDERF/OBERF/IANDS/Erowid existing rows; add the cap to the ingestion pipeline going forward. In parallel, add the dateline kicker "Source: [Label] · Read original →" above the "What happened" header in `ReportPageV2.tsx`. The cap is irreversible for archived sources where re-fetching has gotten harder; back up before running.

4. **Shrink fallback-excerpt block 500 → 280 chars + add explicit fair-use disclosure as user-visible text, not just metadata** (½ day eng) — in `SourceBlock.tsx:204` change the slice. The "Excerpt and preview shown under fair use for commentary" caption (line 208) is already there; make it slightly more prominent (color tweak, not size).

5. **Archive Erowid + IANDS rows from public surfaces** (½ day eng) — set `status='archived'` on all `source_type in ('erowid','iands')` rows so they stop appearing in public APIs. These are the two sources with the most explicit rights-holder positions; pulling them is cheap and signals discipline. Keep the data in DB for potential future use under license.

**Bonus sixth (1 day eng):** add `<script type="application/ld+json">` JSON-LD on every report page declaring the page as a `CreativeWork` with `isBasedOn` pointing to `source_url` and `author` pointing to "Paradocs editorial." Search engines AND rights-holder bots use this to disambiguate "analyzing" from "republishing."

---

## Final Note

The render layer (`scrubIndexReport` + `SourceBlock`'s explicit fair-use treatment + `rewrite-pipeline`'s anti-fabrication guardrails) is genuinely well-built and lives up to the founder's "extract facts, add analysis, link out" framing. The exposure is concentrated at the **storage layer** (verbatim text in the DB at 100k+ row scale) and the **policy layer** (no public takedown path, ToS doesn't address ingested content, no `/sources` page documenting the framework). Three of the five Quick Wins close the policy-layer gap entirely; two close the storage-layer gap to ~50%.

Before any HIGH-risk finding here is relied upon to set product direction, the founder should retain media/IP counsel for a formal opinion. The B0.8 legal-review packet (`B0_8_LEGAL_REVIEW_PACKET.md`) is already drafted and ready to send.

— Audit completed June 7, 2026
