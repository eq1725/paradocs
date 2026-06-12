# Dúchas adapter — design notes, license posture, permission email

**Session:** June 11, 2026. First national-folklore-archive source (the "multilingual authority wedge").
**Files:** `src/lib/ingestion/adapters/duchas.ts`, `scripts/duchas-smoke-test.ts`, `scripts/duchas-narrative-enrich.ts` (gated).

## Decisions (founder, this session)

1. **Facts+link only.** All Dúchas data is CC BY-NC 4.0 © National Folklore Collection, UCD — and Paradocs is commercial (Pro tier). We ingest only the uncopyrightable fact layer: title, topic, place + coordinates, county, school, language, collection era, attribution + deep link. No transcript `Text`, no `Extract` snippet. Dúchas report pages are index-style — thinner than NUFORC pages, deliberately.
2. **Belt-and-braces on narratives.** Clean-room two-step (transcript → fact sheet → original Gaia-voice narrative that never sees the source prose) is specified in `scripts/duchas-narrative-enrich.ts` but hard-gated off until NFC/Gaois grant written permission. Email draft below.
3. **Smoke test before scope.** ~200-item dry run (no DB writes) to measure transcript coverage, pagination behaviour, latency, and real per-topic volumes before committing to a full pass.
4. **Both languages.** Irish + English items ingested. Full-transcript translation is moot under facts-only; if GA `Title` fields need EN display translation later, that's a cheap metadata enrichment (~$0.0002/item) — decide after smoke test.

## API facts

- Base `https://www.duchas.ie/api/v0.6` (prerelease — envelope/pagination undocumented; smoke test probes both). Auth via `X-Api-Key`; free key from the [Gaois Developer Hub](https://www.gaois.ie/en/technology/developers/). They reserve the right to revoke keys for ToS violations.
- CBÉS (Schools' Collection, 1937–39, 1,128 volumes, ~740k pages, fully digitized) is the only text-bearing collection via API; story text lives on `page.Transcripts[].Text` (community Meitheal transcription, partial coverage), joined to items by `transcript.ItemID`. CBÉ (Main Manuscript) = metadata only.
- Topics: `/cbes/topics`, hierarchical, `ID`/`TitleEN`/`TitleGA`/`SubTopics`. Adapter matches titles at runtime via `DUCHAS_TOPIC_RULES` (no hardcoded IDs); refine rules against `outputs/duchas-topic-tree.json` after first run.
- Geo: every place object carries `Coordinates` (lat/lng) + logainm IDs. Place coords → `location_precision='city'`, `coords_synthetic=false`; county-centroid fallback → `'region'`, synthetic. No MapTiler needed.
- `ModifiedSince` supports cheap incremental syncs later.
- Item URL pattern `https://www.duchas.ie/en/cbes/{volumeId}/{pageId}/{itemId}` is **assumed** — smoke test spot-checks 3 URLs (step 4). Fix the constructor in `mapItemToReport` if they 404.

## Posture details

- **PII:** informants/collectors are named 1930s schoolchildren with ages and home addresses. We store counts and roles only — never names. The narrative prompts also ban names.
- **Dates:** legends are undated; 1937–39 is the *collection* period. `event_date` left unset (keeps OnThisDate honest); era in `metadata.collectionPeriod`; `metadata.content_type='historical_case'`.
- **Dedup:** `original_report_id = duchas-cbes-{ItemID}` rides the existing `(source_type, original_report_id)` unique constraint. Facts-only rows can be enriched with narratives later in place — nothing wasted by starting thin.
- **Classification:** topic mapping gives deterministic category + tags (and `metadata.experienceTypeSlug` where confident), so most items shouldn't need the Haiku classifier at all.
- **Schema follow-ups (not yet done):** `reports.language` column if we want GA surfaced properly; quality-filter whitelist for `ga` (current filter rejects non-English — verify whether facts-only descriptions, which are English, even trigger it).

## Status — June 11, 2026

**Smoke test attempted; Dúchas API is down server-side.** All routes/versions return IIS 500 (unauthenticated requests too — should be 401). Founder's key verified valid via Logainm API (200, same Gaois auth infra). duchas.ie site itself is up; topic pages are client-rendered JS (not scrapeable, and scraping isn't our posture anyway). Action: founder sends the email below (permission + outage report). Retry `npx tsx scripts/duchas-smoke-test.ts` periodically — key is already in `.env.local`.

## Smoke-test runbook

```bash
# .env.local: DUCHAS_API_KEY=...   (founder registers at Gaois Developer Hub)
npx tsx scripts/duchas-smoke-test.ts                 # default: 200 samples, both languages
npx tsx scripts/duchas-smoke-test.ts --limit 50 --language en
npx tsx scripts/duchas-smoke-test.ts --topics 5192275  # rerun against specific TopicIDs
```

Outputs: `outputs/duchas-topic-tree.json`, `outputs/duchas-smoke-test-results.json` (stats + 25 mapped samples). Watch for: envelope shape, per-topic counts vs duchas.ie topic pages (silent truncation = pagination exists), transcript coverage %, URL spot-check statuses.

**Block-risk stance:** keyed, identified UA, 750ms spacing, exponential backoff on 429/5xx, single worker. Full topic-filtered pass is likely only dozens-to-hundreds of requests — hours, not days. This is a partner archive, not a scrape target; politeness is strategy, not just etiquette.

## Permission email draft (founder sends from his own address)

> **To:** gaois@dcu.ie
> **Subject:** Commercial-use permission request — Dúchas API, attributed folklore index (Paradocs)
>
> Dear Gaois team,
>
> I'm the founder of Paradocs (paradocs.app), a documentary-style archive that indexes first-hand accounts of anomalous experiences — currently ~320,000 reports from public sources such as NUFORC, with strict source attribution and deep links on every record.
>
> One thing about our model up front: we do not gate content behind paywalls. The archive itself — every report, including anything derived from Dúchas — is freely accessible to all visitors. Our paid tier covers tools built around the archive (analysis features, personalization, user profiles, and the like), never access to the source material itself.
>
> We'd love to make the Schools' Collection discoverable to our readers. Because Dúchas data is CC BY-NC 4.0 and Paradocs is a commercial entity, I want to ask permission rather than rely on interpretation. Two uses, in increasing order of what we're asking:
>
> 1. **Factual index + link (metadata only).** Item title, subject-list topic, place and coordinates, county, school name, language, and collection era — displayed with the recommended attribution ("Folklore data by Dúchas © National Folklore Collection, UCD, licensed under CC BY-NC 4.0") and a prominent deep link to read the full story on duchas.ie. No transcript text stored or displayed.
> 2. **Original summaries.** Short original-language summaries of accounts, generated by a two-step process in which the writing model never sees the transcript text — only a structured fact list (motif, places, claimed events). No informant or collector names would ever appear. Each summary would link back to duchas.ie as above.
>
> We would respect `Sensitive` flags, never surface personal data of informants or collectors, and keep request rates minimal (single worker, sub-1 req/s, incremental syncs via `ModifiedSince`). We're equally happy to discuss conditions, a data-sharing agreement, or any attribution format you prefer — and to share usage statistics; I expect we'd send duchas.ie meaningful referral traffic from readers who want the full manuscripts.
>
> If use 1 is acceptable but use 2 isn't (or needs different terms), that's entirely workable — we'll operate at whatever level you're comfortable with.
>
> Thank you for building a remarkable resource, and for making it programmatically accessible.
>
> Kind regards,
> [Name], Founder, Paradocs (Level 6 LLC dba Paradocs)
> [email] · paradocs.app
>
> P.S. — While testing with a freshly issued API key (June 11, 2026), every Dúchas API route (`/api`, `/api/v0.6/cbes/topics`, `/api/v0.6/counties`, keyed and unkeyed alike) returns HTTP 500, while the same key works against the Logainm API and duchas.ie itself is up. Happy to share request details if useful.

*Note: this asks for permission for use 1 as well, even though we believe the fact layer is uncopyrightable — goodwill with the anchor institution of the folklore wedge is worth more than being right. If they say no to everything, decision point: facts-only-anyway (legally defensible, relationship cost) or drop the source.*

## Next archives in the vein (deferred)

Iceland Sagnagrunnur (structured geodatabase of legends), Scotland (Tobar an Dualchais / Calum Maclean), Finland SKS, Estonia. Evaluate after Dúchas proves the pattern. Same adapter skeleton should generalize: topic match → facts+link → permission email.
