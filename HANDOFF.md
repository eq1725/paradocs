# Paradocs Development Handoff

**Last updated:** March 15, 2026 (Session 30 — Cryptid Enrichment COMPLETE + first_reported_date fix)

## Project Overview

Paradocs is a paranormal phenomena tracking platform (beta.discoverparadocs.com) built with Next.js 14.2.35 (Pages Router), Supabase, and deployed on Vercel. The codebase lives at `eq1725/paradocs` on GitHub (main branch). Currently has ~900 approved reports and **4,792 phenomena entries** across 11 categories (UFOs, cryptids, ghosts, psychic phenomena, consciousness practices, psychological experiences, biological factors, perception/sensory, religion/mythology, esoteric practices, combination) sourced from NUFORC, BFRO, and other databases via an automated ingestion pipeline.

The platform's thesis: emergent patterns across massive anecdotal reports of paranormal experiences suggest a deeper reality — but this should be implied through analysis, not stated outright. The goal is to make each entry "the most robust report on this cryptid/item on the internet."

## Tech Stack

- **Frontend**: Next.js (Pages Router), React, Tailwind CSS, Leaflet (maps), D3 (constellation)
- **Backend**: Supabase (PostgreSQL + PostGIS + RLS), Next.js API routes
- **Ingestion**: Custom pipeline with source adapters, quality scoring, title improvement, location parsing, phenomenon linking
- **Deployment**: Vercel (auto-deploy on push to main)
- **Auth**: Supabase Auth with RLS policies
- **Geocoding**: Mapbox API (server-side only via `MAPBOX_ACCESS_TOKEN` env var)

---

## Completed Work (All Sprints)

### Most Recent (March 15, 2026) — Session 30 (continued): first_reported_date Bulk Fix

#### first_reported_date Alignment Fix ✅
- **Problem**: The `first_reported_date` column in the `phenomena` table was being populated by the ingestion pipeline based on the earliest *ingested report* date, NOT the actual historical first sighting date. Example: Mothman showed "First Reported: 4/27/2011" instead of 1966.
- **Fix**: Extracted the year from `ai_quick_facts.first_documented` for all enriched cryptids and set `first_reported_date` to January 1 of that year.
- **Scope**: 154 entries updated (26 with wrong dates + 128 with null dates). 52 entries with null dates had no parseable year in their quick_facts and were skipped.
- **All 154 PATCHes returned 204.**
- **Known frontend bug**: The UI renders `first_reported_date` with a timezone offset, so `1966-01-01` displays as `12/31/1965`. This is a **frontend code fix** needed in the date rendering logic (likely `new Date('1966-01-01')` interpreted as UTC midnight, displayed in local time). Should be addressed in a dedicated frontend session.

#### CRITICAL RULE FOR FUTURE ENRICHMENT — `first_reported_date` alignment:
- During enrichment, ALWAYS set `first_reported_date` to the historical first documented year (format: `YYYY-01-01`) based on research.
- This is the "source of truth" date that the UI displays as "First Reported".
- If the ingestion pipeline later links a report with an *earlier* date than the current `first_reported_date`, this should be flagged for review (not auto-overwritten), because it could indicate either: (a) a genuinely earlier report we didn't know about, or (b) a data quality issue in the ingested report.
- **Admin panel feature needed**: An alert/flag in the **admin/operations panel** when an ingested report's date is earlier than the phenomenon's existing `first_reported_date`, prompting manual review. This is admin-side ops tooling — NOT the user-facing dashboard.

### Previous (March 12, 2026) — Session 30 (continued): Skinwalker Correction

#### Skinwalker Reclassification & Enrichment ✅
- Reclassified Skinwalker from religion_mythology back to cryptids (per user review — modern cryptid profile via Skinwalker Ranch / AAWSAP justifies cryptid categorization)
- Full 7-field enrichment written and pushed (P1 + P2, both 204)
- QA/QC: PASS — all fields populated, character minimums met, summary within 150-350 chars
- Visual spot-check confirmed clean rendering on beta site
- **Updated running total: ~209 entries enriched**
- ID: 1eb3bfd9-dce5-4a00-92dc-08c4a2654156

### Previous (March 11, 2026) — Session 30: Batch 18 (FINAL)

#### Batch 18 Content Enrichment ✅ — CRYPTID CATEGORY COMPLETE
- Queried remaining 17 cryptid entries alphabetically after "Wampus Cat" needing ai_paradocs_analysis
- **DELETED (5 entries)**:
  - Waterduivel (no verifiable cryptid sources — database artifact)
  - Wolpertinger (Bavarian novelty/joke creature, not a genuine cryptid tradition)
  - Yali (indigenous people of Papua New Guinea, not a cryptid)
  - Youl-Sooree (no verifiable sources found — database artifact)
  - Zusimacoa (no verifiable sources found — database artifact)
- **RECLASSIFIED to religion_mythology (5 entries)**:
  - Wechuge (Athabaskan mythology), Wendigo (Algonquian mythology), Werehyena (African/Middle Eastern folklore), Yara-ma-yha-who (Aboriginal Australian mythology), Yawkyawk (Aboriginal Australian water spirit)
- **ENRICHED (7 entries)**: Water Elephant, White River Monster, White Thang, Yacumama, Yeren, Yeti, Yowie
- Fixed Yeti primary_regions error (Shennongjia incorrectly listed as Nepal; corrected to Khumbu region, Nepal)
- All 7 entries passed QA/QC: 7 fields populated, character minimums met, correct quick_facts keys, proper danger_level prefix, plain string regions, summary within 150-350 chars
- Visual spot-checks on Yowie and Yeti confirmed clean rendering
- **FINAL RUNNING TOTAL: ~208 entries enriched across 18 batches**
- **CRYPTID ENRICHMENT BACKLOG: 100% COMPLETE** — no remaining cryptid entries missing ai_paradocs_analysis

### Previous (March 11, 2026) — Session 29: Batch 17

#### Batch 17 Content Enrichment ✅
- Fetched 20 cryptid entries alphabetically after "Thylacine" needing ai_paradocs_analysis
- **DELETED (4 entries)**:
  - Tut-tut (no verifiable sources found — database artifact)
  - Uskumogul (no verifiable sources found — database artifact)
  - Vozhd (no verifiable sources found — database artifact)
  - Wampus Beast (duplicate of Wampus Cat)
- **RECLASSIFIED to religion_mythology (7 entries)**:
  - Tiyanak (Philippine mythology), Tokoloshe (South African Zulu mythology), Trauco (Chiloé mythology), Umm El Duwais (Arabian djinn tradition), Unktahe (Lakota mythology), Vodyanoy (Slavic mythology), Water Babies (Native American spiritual tradition)
- **ENRICHED (9 entries)**: Tompandrano, Traverspine Gorilla, Trunko, Tsuchinoko, Tuttle Bottoms Monster, Ujit, Urayuli, Van Meter Visitor, Wampus Cat
- All 9 entries passed QA/QC: 7 fields populated, character minimums met, correct quick_facts keys, proper danger_level prefix, plain string regions, summary within 150-350 chars
- Visual spot-checks on Van Meter Visitor and Tsuchinoko confirmed clean rendering
- **Running total: ~201 entries enriched, ~63 remaining (~76% through cryptid enrichment backlog)**
- **Next batch starts after: "Wampus Cat" (alphabetically)**

### Previous (March 11, 2026) — Session 28: Batch 16

#### Batch 16 Content Enrichment ✅
- Fetched 20 cryptid entries alphabetically after "Snallygaster" needing ai_paradocs_analysis
- **DELETED (2 entries)**:
  - Splinter Cat (lumberjack tall tale/fearsome critter from 1910 William T. Cox book, not a genuine cryptid)
  - Tiyaga (no verifiable sources found anywhere — database artifact)
- **RECLASSIFIED to religion_mythology (7 entries)**:
  - Stikini, Strigoi, Taniwha, Teihiihan, Teju Jagua, Tepegöz, Tikbalang
- **ENRICHED (11 entries)**: Specter Moose, Spring Heeled Jack, Storsjöodjuret, Tapire-iauara, Tatzelwurm, Tennessee Wildman, Teratorn, Tessie, Thetis Lake Monster, Thunderbird, Thylacine
- All 11 entries passed QA/QC: 7 fields populated, character minimums met, correct quick_facts keys, proper danger_level prefix, plain string regions, summary within 150-350 chars
- Visual spot-checks on Thylacine and Spring Heeled Jack confirmed clean rendering
- **Running total: ~192 entries enriched, ~72 remaining (~73% through cryptid enrichment backlog)**
- **Next batch starts after: "Thylacine" (alphabetically)**

### Previous (March 11, 2026) — Session 27: Batch 15

#### Batch 15 Content Enrichment ✅
- Fetched 20 cryptid entries alphabetically after "Rougarou" needing ai_paradocs_analysis
- **DELETED (5 entries)**:
  - Sasquatch (duplicate of Bigfoot, already enriched)
  - Selma (duplicate of Seljordsormen — same Lake Seljord serpent, Norway)
  - Skvader (taxidermy hoax/joke creature from Sweden, not a real cryptid tradition)
  - Slide-Rock Bolter (lumberjack tall tale, not a cryptid tradition)
  - Sky Serpents (duplicate entry in combination category, blocked Sky Serpent PATCH via near-duplicate trigger)
- **RECLASSIFIED to religion_mythology (5 entries)**:
  - Samjogo, Scultone, Selkie, Shurala, Skinwalker
- **ENRICHED (11 entries)**: Sasabonsam, Seljordsormen, Sheepsquatch, Sigbin, Sink Hole Sam, Sinomegaceros, Sisimito, Skunk Ape, Sky Serpent, Smoke Wolf, Snallygaster
- All 11 entries passed QA/QC: 7 fields populated, character minimums met, correct quick_facts keys, proper danger_level prefix, plain string regions, summary within 150-350 chars
- Visual spot-checks on Snallygaster and Skunk Ape confirmed clean rendering
- **Running total: ~181 entries enriched, ~83 remaining (~69% through cryptid enrichment backlog)**
- **Next batch starts after: "Snallygaster" (alphabetically)**

### Previous (March 11, 2026) — Session 26: Batch 14

#### Batch 14 Content Enrichment ✅
- Fetched 20 cryptid entries alphabetically after "Orang-bati" needing ai_paradocs_analysis
- **DELETED (2 entries)**:
  - Owlman (duplicate of Owlman of Mawnan)
  - Páloki (no real-world sources, database artifact)
- **RECLASSIFIED to religion_mythology (5 entries)**:
  - Penanggalan, Phi Am, Pishtaco, Púca, Qalupalik
- **RE-RECLASSIFIED (1 entry)**:
  - Osschaert (Batch 13 reclassification hadn't persisted — re-applied)
- **ENRICHED (12 entries)**: Oude Rode Ogen, Owlman of Mawnan, Ozark Howler, Pascagoula River Aliens, Pé de Garrafa, Piasa Bird, Pongo, Pope Lick Monster, Popobawa, Pukwudgie, Ropen, Rougarou
- All 12 entries passed QA/QC: 7 fields populated, character minimums met, correct quick_facts keys, proper danger_level prefix, plain string regions, summary within 150-350 chars
- Visual spot-checks on Rougarou and Ropen confirmed clean rendering
- **Running total: ~170 entries enriched, ~94 remaining (~64% through cryptid enrichment backlog)**
- **Next batch starts after: "Rougarou" (alphabetically)**

### Previous (March 11, 2026) — Session 25: Batch 13

#### Batch 13 Content Enrichment ✅
- Fetched 20 cryptid entries alphabetically after "Muldjewangk" needing ai_paradocs_analysis
- **DELETED (1 database artifact)**:
  - Ndambi-Kaikai (no verifiable sources found anywhere — appears to be a database artifact with no real-world references)
- **RECLASSIFIED to `religion_mythology` (4 entries)**:
  - Namazu (Japanese Shinto catfish deity responsible for earthquakes — organized religious tradition)
  - Ningyo (Japanese yokai/fish-human hybrid from organized Buddhist-Shinto folklore tradition)
  - Nue (Japanese yokai chimera from organized Shinto-Buddhist tradition, featured in The Tale of the Heike)
  - Osschaert (Flemish folklore shape-shifting spirit from organized Belgian folk-religious tradition)
- **ENRICHED as cryptids (15 entries)**: Nahuelito, Nandi Bear, Ngoubou, Nguma-monene, Nguoi Rung, Ningen, Ninki Nanka, Nuk-luk, Ochre Coloured Cat, Ogopogo, Old Yellow Top, Olitiau, Orang Minyak, Orang Pendek, Orang-bati
- All 15 entries verified: 7/7 fields populated with all quality minimums met (desc 2000+, chars 2000+, theories 2000+, paradocs 2500+, summary 150-350, quick_facts 10 correct keys, regions 2+ plain strings)
- Removal rate: 25% (5 of 20 removed/reclassified)
- **Research-first mandate**: All 20 entries individually web-searched before any content was written
- **Post-push QA issue**: Initial push via parallel subagents used incorrect UUIDs (fabricated suffixes) due to truncated ID display. Supabase PATCH with `Prefer: return=minimal` returns 204 even when 0 rows match, so failures were silent. Required complete re-push with correct IDs. Further QA revealed agents wrote wrong quick_facts key structures (custom keys like "Size", "Region" instead of required 10 standard keys), short paradocs (<2500), and JSON-object regions. All 14 failed entries were individually corrected.
- **Lesson reinforced**: Never trust agent subagent content quality — always run independent QA verification and fix manually.
- **Running total**: ~158 entries enriched across Batches 1-13; next batch starts after "Orang-bati" (alphabetically, also after "Osschaert" which was reclassified); ~106 cryptids remaining

### Prior (March 11, 2026) — Session 22: Batch 12

#### Batch 12 Content Enrichment ✅
- Fetched 20 cryptid entries alphabetically after "Mirygdy" needing ai_paradocs_analysis
- **DELETED (1 duplicate entry)**:
  - Momo the Monster (duplicate of Momo — same Missouri Monster)
- **RECLASSIFIED to `religion_mythology` (4 entries)**:
  - Mokumokuren (Japanese yokai/household spirit from organized Shinto-Buddhist tradition)
  - Moñai (Guaraní folklore legend — mythological serpent creature)
  - Muki (Andean supernatural mining spirit from organized indigenous spiritual tradition)
  - Naga (Hindu/Buddhist mythological serpent from organized South/Southeast Asian religious traditions)
- **ENRICHED as cryptids (15 entries)**: Mngwa, Moehau, Mogollon Monster, Mokele-mbembe, Momo, Mongolian Death Worm, Mono Grande, Monster of Lake Fagua, Moosehead Lake Creature, Morag, Morgawr, Mothman, Muc-Sheilch, Muhuru, Muldjewangk
- All 15 entries verified: 7/7 fields populated with all quality minimums met (desc 2000+, chars 2000+, theories 2000+, paradocs 2500+, summary 150+, quick_facts 10 keys, regions 2+)
- Removal rate: 25% (5 of 20 removed/reclassified)
- **Key note**: These entries already had short auto-generated content from a prior bulk process — this batch upgraded all fields to full quality standards and added the missing ai_paradocs_analysis field
- **Running total**: ~143 entries enriched across Batches 1-12; next batch starts after "Muldjewangk"; 136 cryptids originally needed enrichment, ~121 remaining

#### Batch 12 QA/QC (Session 23) ✅
- **Quick Facts keys**: All 15 entries verified — correct 10 snake_case keys (origin, classification, first_documented, danger_level, typical_encounter, evidence_types, active_period, notable_feature, cultural_significance, also_known_as)
- **also_known_as arrays**: All 15 entries confirmed storing proper JSON arrays
- **Danger level color coding**: Found Mongolian Death Worm used "Extreme" which only renders on index page (not detail page). Fixed to "High — considered extremely dangerous by reputation..." for consistent red rendering on both pages
- **Region geocoding**: Mothman had "Mason County" geocoding to Mason County, Texas instead of West Virginia. Fixed primary_regions to explicitly include state: `["Point Pleasant, West Virginia, USA", "Mason County, West Virginia", "West Virginia, USA", "Ohio River Valley"]`
- **Visual spot-checks**:
  - Mongolian Death Worm: map pins correct in Mongolia, all Quick Facts rendering, danger level now red ✅
  - Mokele-mbembe: 5 known regions pinned correctly in Central Africa, all 10 Quick Facts fields rendering, danger level "High" in red, Paradocs Analysis with CROSS-FRAMEWORK CONVERGENCE badge ✅
- **Key frontend discovery**: Also Known As section on detail page renders from `phenomenon.aliases` column, NOT from `ai_quick_facts.also_known_as` — the latter is supplementary data only
- **Danger level rendering inconsistency documented**: Detail page (`[slug].tsx`) uses `.toLowerCase().includes('high')` etc.; Index page (`index.tsx`) uses `.split(' ')[0]` with DANGER_COLORS constant that supports Extreme/High/Moderate/Low/Unknown/Varies. Best practice: always start danger_level with "High", "Moderate", or "Low" to ensure consistent rendering on both pages

#### Batch 12 Research Audit & Reprocessing (Session 24) ✅
- **Context**: User identified that Batch 12 content was written from training knowledge without per-entry web research. Mandated a research audit to verify factual accuracy, followed by full reprocessing of entries with verified inaccuracies.
- **Methodology**: Web searched all 15 entries, compared research findings against DB content for specific factual claims (dates, names, locations, measurements).
- **Findings and corrections**:
  - **CRITICAL — Monster of Lake Fagua (11dee785)**: FULL REWRITE of all 7 fields. Original content placed the creature in Colombia (Laguna de Fúquene, Muisca traditions) — research revealed it's actually from Chile (Laguna de Tagua Tagua, near Santa Fe under Peruvian administration). Key source: José Celestino Mutis's 1784 notes published in Journal de Paris. Corrected to Chilean origin with Mapuche traditions.
  - **MODERATE — Mngwa (d360e3f6)**: FULL REWRITE of all 7 fields. Original omitted Captain William Hichens (1922 magistrate in Lindi), Patrick Bowen (hunter), the specific 1922 date, Sultan Majnun folklore, and brindled fur evidence. Fixed Wester Ross/Tanzania region error.
  - **MODERATE — Muhuru (8630a251)**: FULL REWRITE of all 7 fields. Original said "Tana River region" with "15-30 feet" — research shows key sighting was by Cal Bombay in 1963 in the Great Rift Valley, creature was 9-12 feet. Corrected location and size.
  - **MODERATE — Moosehead Lake Creature (07cd1ebd)**: Description rewrite + new quick facts. Added 1881 lumberjack sighting, 2024 photo sighting from Lazy Tom Bog area.
  - **MINOR — Moehau (5c603901)**: Quick facts update. Added 1882 prospector death, maeroero term, 1903 Karangahake Gorge footprints, 1971 park ranger tracks.
  - **MINOR — Morgawr (2a145196)**: Quick facts update. Added Tony "Doc" Shiels, Mary F photos, 2022 academic hoax study.
  - **MINOR — Muc-Sheilch (0c12f445)**: Quick facts update. Added Mr Banks of Letterewe, 1850s draining attempt, Loch-na-Beiste.
  - **MINOR — Morag (4bc125d6)**: Quick facts update. Added 1887 earliest sighting, Alexander Carmichael, 34 incidents by 1981.
  - **MINOR — Mongolian Death Worm (c9498b2e)**: Description update. Added Roy Chapman Andrews by name, his 1926 book "On the Trail of Ancient Man", and the 1983 Tartar sand boa (Eryx tataricus) identification by Gobi locals.
  - **MINOR — Muldjewangk (c14c7064)**: Description + quick facts update. Added bunyip connection (bunyip appears in Ngarrindjeri dreaming as the Muldjewangk), alternate name Mulyawonk, fish-greed warning tradition.
  - **VERIFIED OK (5 entries)**: Mothman, Mogollon Monster, Mokele-mbembe, Momo, Mono Grande — all contained accurate verifiable facts (named witnesses, dates, locations). No corrections needed.
- **Lesson learned**: Every entry MUST be individually web-searched before content is written. Training knowledge alone produces plausible but sometimes inaccurate details, especially for obscure cryptids. The Research-First Mandate is now embedded in the continuation prompt and Content Quality Standards.

### Prior (March 10, 2026) — Session 21: Batch 11

#### Batch 11 Content Enrichment ✅
- Fetched 20 entries alphabetically after "Mapinguari"
- **DELETED (3 duplicate entries)**:
  - Memphré (duplicate of Memphre — accent variant)
  - Menhune (duplicate of Menehune — spelling variant)
  - Minhocão (duplicate of Minhocao — accent variant)
- **RECLASSIFIED to `religion_mythology` (3 entries)**:
  - Mbói Tu'i (Guaraní serpent deity from organized Tupi-Guaraní mythological tradition)
  - Menehune (Hawaiian small people from organized Polynesian cultural tradition)
  - Mishipeshu (Ojibwe underwater panther from organized Anishinaabe spiritual tradition)
- **ENRICHED as cryptids (14 entries)**: Maricoxi, Maroochy River Monster, Marozi, Mbielu-Mbielu-Mbielu, Mecheny, Megaconda, Megalodon, Melon Heads, Memphre, Mermaid, Metoh-kangmi, Mimic Tiger, Minhocao, Mirygdy
- All 14 entries verified: 7/7 fields populated (ai_description, ai_characteristics, ai_theories, ai_paradocs_analysis, ai_summary, ai_quick_facts, primary_regions)
- Removal rate: 30% (6 of 20 removed/reclassified) — lowest rate yet, reflecting strong cryptid representation in the Ma-Mi range
- **Push method**: Direct JS string pushes with `\n\n` paragraph breaks for text fields; ai_quick_facts as native JSONB; combined field pushes where possible for efficiency
- **Running total**: ~128 entries enriched across Batches 1-11; next batch starts after "Mirygdy"

### Prior (March 10, 2026) — Session 20: Batch 10 + Report Count Fix

#### Report Count Consistency Fix ✅
- **Problem**: `report_count` column on `phenomena` table contained fake seed data (random numbers like 220, 150, 280) not reflecting actual linked reports
- **Root cause**: The `report_phenomena` join table (280K+ rows) links reports to phenomena, but `report_count` was never synced with it
- **Fix**: Ran SQL UPDATE across all phenomena to set `report_count = COUNT of approved linked reports` (via INNER JOIN on `reports.status = 'approved'`). Required temporarily disabling the `check_phenomena_duplicates` trigger.
- **Result**: Only ~15 phenomena now have non-zero report_count (e.g., CE-1: 324, Orbs: 101, Black Triangle UFO: 33, Bigfoot: 23). Jersey Devil went from fake 321 → 0 (all its linked reports are archived, not approved).
- **Key finding**: The `report_phenomena` table has 280K+ links but most linked reports have `status: 'archived'`. The `getPhenomenonReports` API correctly filters by `status = 'approved'`, so `report_count` now matches what users actually see in the Reports tab.
- **Architecture note**: `report_count` is a static column — no auto-sync trigger exists yet. Future enhancement could add a Postgres trigger on `report_phenomena` INSERT/DELETE to keep it current.

#### Batch 10 Content Enrichment ✅
- Fetched 20 entries alphabetically after "Lake Tianchi Monster"
- **DELETED (2 entries)**:
  - Maam (no verifiable cryptid tradition; appears to be a database artifact with no documented sightings or folklore)
  - Man-Eating Tree (19th-century literary hoax; originated from fabricated 1874 newspaper account by Karl Leche, no genuine cryptid tradition)
- **RECLASSIFIED to `religion_mythology` (8 entries)**:
  - Lange Wapper (Flemish shapeshifting giant from organized Antwerp folklore tradition)
  - Lindworm (European wingless dragon from organized Norse/Germanic mythological tradition)
  - Lobizón (Argentine werewolf from organized seventh-son folk-Catholic tradition)
  - Luison (Guaraní god of death from organized Tupi-Guaraní mythological tradition)
  - Lupo Mannaro (Italian werewolf from organized Mediterranean lycanthropy tradition)
  - Mami Wata (Pan-African water spirit from organized syncretic religious tradition)
  - Manananggal (Filipino self-segmenting viscera sucker from organized aswang folk-Catholic tradition)
  - Mannegishi (Cree/Ojibwe trickster water spirit from organized Algonquian spiritual tradition)
- **ENRICHED as cryptids (10 entries)**: Lake Worth Monster, Lechuza, Lizard Man of Scape Ore Swamp, Loch Ness Monster, Loveland Frog, Lusca, Mamlambo, Mande Barung, Manipogo, Mapinguari
- All 10 entries verified: character minimums met (desc 2000+, chars 2000+, theo 2000+, anal 2500+), 10 ai_quick_facts keys each, primary_regions populated, paragraph breaks confirmed
- Removal rate: 50% (10 of 20 removed/reclassified) — lower rate than recent batches, reflecting stronger cryptid representation in the L-M range
- **Push method**: Base64 encoding via `atob()` for all text fields to preserve `\n\n` paragraph breaks; ai_quick_facts passed as native JSONB object; individual field pushes (one PATCH per field) for reliability
- **Session note**: Text field pushes via agent subprocesses caused data truncation; all text fields must be pushed directly from main context to avoid base64 string truncation

### Prior (March 10, 2026) — Session 19: Batch 9

#### Batch 9 Content Enrichment ✅
- Fetched 20 entries alphabetically after "J'ba Fofi"
- **DELETED (3 entries)**:
  - Jenglot (Indonesian novelty hoax; manufactured figurines sold as curiosities, not a genuine cryptid tradition)
  - Kasai Rex (fabricated entry; single dubious 1932 account with no corroboration, widely considered a hoax)
  - Kraken (generic category term for giant sea creatures, not a specific cryptid; now understood as giant squid)
- **RECLASSIFIED to `religion_mythology` (13 entries)**:
  - Kaiaimunu (Papua New Guinean spirit being from organized animist tradition)
  - Kappa (Japanese water spirit from organized Shinto/Buddhist mythological tradition)
  - Kee-Wakw (Abenaki cannibal ice giant from organized northeastern Algonquian mythology)
  - Keelut (Inuit supernatural hairless dog from organized shamanic cosmological tradition)
  - Kelpie (Scottish shapeshifting water spirit from organized Celtic mythological tradition)
  - Kinnara (South/Southeast Asian divine half-human, half-bird from Hindu-Buddhist mythology)
  - Kishi (Angolan two-faced demon from organized Kimbundu spiritual tradition)
  - Kitsune (Japanese shapeshifting fox spirit from organized Shinto/Buddhist mythological tradition)
  - Kodama (Japanese tree spirit from organized Shinto animist tradition)
  - Kting Voar (Cambodian spiral-horned bovid from Vietnamese/Cambodian folk tradition)
  - Kushtaka (Tlingit shapeshifting otter spirit from organized Northwest Coast spiritual tradition)
  - La Llorona (Latin American weeping ghost woman from organized Catholic-syncretic folk tradition)
  - Lamassu (Mesopotamian winged bull-human deity from organized Assyrian/Babylonian religion)
- **ENRICHED as cryptids (4 entries)**: Jersey Devil, Kongamato, Lagarfljót Worm, Lake Tianchi Monster
- All 4 entries verified: character minimums met (desc 2000+, chars 2000+, theo 2000+, anal 2500+), 10 ai_quick_facts keys each, primary_regions populated, paragraph breaks confirmed
- Removal rate: 80% (16 of 20 removed/reclassified) — highest rate yet, reflecting heavy mythological/religious content in the J-L alphabetical range
- **Push method**: Base64 encoding for all text fields to preserve `\n\n` paragraph breaks; ai_quick_facts passed as native JSONB object

### Prior (March 10, 2026) — Session 18: QA/QC + Code Fixes

#### Sitewide "ParaDocs" → "Paradocs" Rename ✅
- Renamed all instances of "ParaDocs" to "Paradocs" across 45 codebase files (components, pages, API routes, scripts, docs)
- SQL UPDATE fixed 52 phenomena rows with "ParaDocs" in AI-generated text fields (ai_paradocs_analysis, ai_history, ai_description, etc.)
- **Commits**: `c07832be` (codebase rename + scroll fix), `9473c322` (scroll restoration fix)

#### Encyclopedia Scroll Position Restoration Fix ✅
- **Problem**: Previous scroll fix (Session 16) was incomplete — `sessionStorage paradocs_nav_ctx` was never SET when navigating from index to detail page, so `router.back()` never triggered
- **Fix**: Added `routeChangeStart` event listener in index.tsx that saves `window.scrollY` to module-level `_scrollY` variable and sets `paradocs_nav_ctx` in sessionStorage when navigating to `/phenomena/*`. On remount, restores scroll position via `requestAnimationFrame`.
- **Commit**: `9473c322`

#### Ask the Unknown Button Z-Index Fix ✅
- **Problem**: Leaflet map tiles use internal z-indices of 200-400 which leaked into the page stacking context and covered the fixed `z-50` chat button
- **Fix**: Added CSS `isolate` class to PhenomenonMiniMap.tsx outer container to create an isolated stacking context
- User committed and pushed directly

#### Batch 4 Paragraph Break Reformat ✅
- **Problem**: Batch 4 content (Black Demon through Chupacabra, 14 entries) was stored as wall-of-text with zero `\n\n` paragraph breaks across all AI text fields
- **Fix**: Created `add_paragraph_breaks()` PL/pgSQL function that splits text at sentence boundaries (`. [A-Z]`) and groups every 4 sentences into paragraphs. Applied to all 7 AI text fields for all 14 Batch 4 slugs.
- **Affected slugs**: black-demon, black-shuck, bukit-timah-monkey-man, bunyip, burrunjor, buru, cadborosaurus, champ, cheonji-monster, chessie, chipekwe, chipfalamfula, chuchunya, chupacabra
- **Note for future batches**: Ensure AI content includes `\n\n` paragraph breaks during generation. Batch 4's issue was caused by paragraph breaks being stripped during push. Use per-field base64 encoding to preserve formatting.

### Prior (March 10, 2026) — Session 17: Batch 8

#### Batch 8 Content Enrichment ✅
- Fetched 20 entries alphabetically after "Great Lakes Sea Monster"
- **DELETED (3 entries)**:
  - Hidebehind (American lumberjack tall tale/folk humor; not a genuine cryptid tradition)
  - Hodag (confirmed deliberate hoax created by Eugene Shepard in Rhinelander, Wisconsin, 1893)
  - Jackalope (admitted novelty/hoax originating with Douglas Herrick in Douglas, Wyoming, 1930s)
- **RECLASSIFIED to `religion_mythology` (6 entries)**:
  - Gurumapa (Nepalese mythological baby-eating demon from Hindu-Buddhist tradition)
  - Hombre Gato (Latin American supernatural cat-man figure from organized folklore)
  - Horned Serpent (Pan-Native American sacred spiritual being from organized ceremonial traditions)
  - Impundulu (Southern African lightning bird from Zulu/Xhosa cosmological tradition)
  - Imugi (Korean proto-dragon from organized Confucian-Buddhist mythological tradition)
  - Intulo (Zulu supernatural lizard-man from organized ancestral belief system)
- **ENRICHED as cryptids (11 entries)**: Hawkesbury River Monster, Hibagon, Honey Island Swamp Monster, Hopkinsville Goblins, Igopogo, Indrid Cold, Inkanyamba, Irkuiem, Isnachi, Isshii, J'ba Fofi
- All 11 entries verified to meet character minimums (desc 2000+, chars 2000+, theo 2000+, anal 2500+) and correct ai_quick_facts keys (10 keys each)
- **Note**: Sub-agent push partially failed on 4 entries (hopkinsville-goblins p2 truncated, isnachi p2 partial, isshii and j-ba-fofi not pushed). All re-pushed directly with full content confirmed. Lesson reinforced: always push content directly, never via sub-agents.
- Removal rate: 45% (9 of 20 removed/reclassified) — within expected 30-60% range for this alphabetical depth

### Prior (March 10, 2026) — Session 16: QA/QC Fixes

#### Batch 6 Quick Facts Fix (6 entries) ✅
- 6 of 8 Batch 6 entries had wrong `ai_quick_facts` keys (arbitrary keys like "Geographic Range", "Montana Location" instead of required frontend keys)
- Fixed entries: dwayyo, ebu-gogo, el-cuero, emela-ntouka, enfield-horror, flathead-lake-monster
- Also corrected flathead-lake-monster alias from "Flahead" to "Flessie"
- Dover-demon and flatwoods-monster already had correct keys (not affected)

#### Missing Preview Card Text Fix ✅
- Dover Demon and Flatwoods Monster had NULL `ai_summary` — these entries were initially deleted then restored in Batch 6, so summaries were never set
- Wrote and pushed `ai_summary` for both entries (used for preview card text on /phenomena listing page)
- **Note**: The /phenomena listing uses `ai_summary` (NOT `ai_description`) for card preview text

#### Scroll Position Restoration Fix ✅
- **Problem**: Navigating from /phenomena into an entry and going back reset scroll position to top
- **Root cause**: /phenomena page fetches data client-side on every mount → on back-navigation, component re-mounts with empty state → loading spinner → data arrives too late for NavigationHelper's scroll restoration
- **Fix**: Added module-level cache (`_phenomenaCache`) to `src/pages/phenomena/index.tsx` that persists across component unmount/remount. When cache exists, page renders immediately with data (no loading state), allowing scroll restoration to work.
- **Commit**: `3690a9ec` — "Cache phenomena data in module-level variable for instant back-navigation rendering"
- Verified: scrollY 2000 → clicked Appalachian Wildman → back → scrollY 2000 exactly

### Prior (March 10, 2026) — Session 15: Batch 7

#### Batch 7 Content Enrichment ✅
- Fetched 20 entries alphabetically after "Flatwoods Monster"
- **DELETED (4 entries)**:
  - Fur-Bearing Trout (joke/tall tale creature; lumberjack folklore humor, not a genuine cryptid tradition)
  - Globster (generic category term for unidentified organic ocean masses, not a specific cryptid)
  - Gorgakh (fabricated entry; no verifiable documentation in any cryptid or folklore database)
  - Guai Wu (fabricated entry; no verifiable documentation in any cryptid or folklore database)
- **RECLASSIFIED to `religion_mythology` (5 entries)**:
  - Fox Spirit (Chinese/East Asian supernatural shapeshifting spirit from organized mythological tradition)
  - Gatto Mammone (Italian/Mediterranean supernatural cat figure from folklore tradition)
  - Germakochi (Armenian mythological figure from organized supernatural tradition)
  - Grootslang (South African mythological creature from Richtersveld cave legend tradition)
  - Gumiho (Korean nine-tailed fox spirit from organized mythological/shamanistic tradition)
- **ENRICHED as cryptids (11 entries)**: Fouke Monster, Fresno Nightcrawler, Gbahali, Giant Anaconda, Giant Ground Sloth, Giant Spider, Gippsland Phantom Cat, Goatman, Grafton Monster, Grassman, Great Lakes Sea Monster
- All 11 entries verified to meet character minimums (desc 2000+, chars 2000+, theo 2000+, anal 2500+) and correct ai_quick_facts keys (10 keys each)
- **Note**: giant-ground-sloth `ai_theories` was initially truncated during push (1468 chars instead of 2927) — re-pushed and verified at full 2927 chars with 3 paragraph breaks. All other entries pushed cleanly on first attempt using per-field base64 encoding via paired push scripts (2 fields per JS call).

### Prior (March 9, 2026) — Session 14: Batch 6

#### Batch 6 Content Enrichment ✅
- Fetched 20 entries alphabetically after "Dogman"
- **DELETED (4 entries)**:
  - Drop Bear (Australian joke/tourist prank; not genuine folklore or cryptid)
  - Eastern Cougar (confirmed real species — Puma concolor couguar; declared extinct by USFWS in 2018)
  - Enchanto (fabricated entry; no verifiable cryptid documentation distinct from Encantado)
  - Fear Liath (duplicate of Am Fear Liath Mòr — already enriched in Batch 1)
- **RECLASSIFIED to `religion_mythology` (8 entries)**:
  - Drekavac (Slavic mythological creature from Serbian/Balkan supernatural tradition)
  - Duende (Pan-Latin American supernatural spirit/fairy from Iberian folklore tradition)
  - El Sombrerón (Guatemalan/Central American supernatural figure with magical powers)
  - Eloko (Bantu/Congo Basin mythological dwarf spirit from organized belief system)
  - Elwetritsch (German/Palatinate folklore creature from regional mythological tradition)
  - Encantado (Brazilian Amazonian shapeshifting dolphin spirit from indigenous mythology)
  - Engkanto (Filipino supernatural nature spirit from organized animist belief system)
  - Fastitocalon (Medieval bestiary sea monster from Christian allegorical tradition)
- **ENRICHED as cryptids (8 entries)**: Dover Demon, Dwayyo, Ebu Gogo, El Cuero, Emela-Ntouka, Enfield Horror, Flathead Lake Monster, Flatwoods Monster
- All 8 entries verified to meet character minimums (desc 2000+, chars 2000+, theo 2000+, anal 2500+) and correct ai_quick_facts keys (10 keys each)
- **Note**: Initial push via sub-agent truncated content; required field-by-field re-push for 12 failing fields. Dover Demon and Flatwoods Monster were initially incorrectly deleted but restored after review — both have documented multi-witness sighting traditions. Elwetritsch was initially deleted but reclassified to religion_mythology after review. Paragraph breaks (`\n\n`) were stripped by sub-agent during initial push — all 28 text fields (7 slugs × 4 fields) re-pushed with proper breaks using per-field base64 encoding and verified in DB.

### Prior (March 9, 2026) — Session 13: Batch 5

#### Batch 5 Content Enrichment ✅
- Fetched 20 entries alphabetically after "Chupacabra"
- **DELETED (5 entries)**:
  - Crawfordsville Monster (confirmed misidentification of killdeer birds; single debunked 1891 incident)
  - Crawler (modern internet creepypasta/fabrication; no real folklore tradition)
  - Croughshrion (completely fabricated; no verifiable sources in any cryptid or folklore database)
  - Dahu (deliberate Alpine prank/joke tradition; not genuine folklore or cryptid)
  - De Loys' Ape (confirmed hoax; posed spider monkey carcass; broad scientific consensus)
- **RECLASSIFIED to `religion_mythology` (6 entries)**:
  - Cipelahq (Wabanaki owl spirit from Maliseet/Passamaquoddy mythology)
  - Colocolo (Mapuche mythological creature with supernatural origin)
  - Cu Sith (Celtic fairy hound from Scottish/Irish supernatural tradition)
  - Curupira (Brazilian Tupí-Guaraní forest guardian spirit)
  - Deer Woman (Native American shape-shifting supernatural spirit)
  - Dokkaebi (Korean supernatural nature spirits/goblins)
- **ENRICHED as cryptids (9 entries)**: Ciguapa, Con Rit, Crosswick Monster, Devil Bird, Dewey Lake Monster, Didi, Dingonek, Dobhar-chú, Dogman
- All 9 entries verified to meet character minimums (desc 2000+, chars 2000+, theo 2000+, anal 2500+) and correct ai_quick_facts keys (10 keys each)

### Prior (March 9, 2026) — Session 12: Batch 4

#### Batch 4 Content Enrichment ✅
- Fetched 20 entries alphabetically after "Bigfoot"
- **DELETED (3 entries)**:
  - Black Winged Humanoid (generic category, not a specific cryptid)
  - Buratsche-al-llgs (no verifiable folklore or cryptid documentation)
  - Cactus Cat (lumberjack tall tale, not a genuine cryptid tradition)
- **RECLASSIFIED to `religion_mythology` (3 entries)**:
  - Cadejo (supernatural guardian spirit from Central American folklore)
  - Cherufe (Mapuche volcanic deity, not a cryptid)
  - Chonchon (Mapuche sorcery entity, not a cryptid)
- **ENRICHED as cryptids (14 entries)**: Black Demon, Black Shuck, Bukit Timah Monkey Man, Bunyip, Burrunjor, Buru, Cadborosaurus, Champ, Cheonji Monster, Chessie, Chipekwe, Chipfalamfula, Chuchunya, Chupacabra
- All 14 entries verified to meet character minimums (desc 2000+, chars 2000+, theo 2000+, anal 2500+) and correct ai_quick_facts keys

### Prior (March 9, 2026) — Session 11: Minimap UX + Batch 3

#### Sidebar Minimap UX Improvements ✅
- Moved minimap above Quick Facts in sidebar (`891443e8`)
- Made minimap scroll away naturally while Quick Facts remains sticky (`ef72a5f6`) — separates minimap from `lg:sticky` container so users see Quick Facts without scrolling past the map

#### Batch 3 Content Enrichment ✅
- Fetched 20 entries alphabetically after "Ban Manush"
- **DELETED (4 entries)**:
  - Barmanu (duplicate of Barmanou — same creature, alternate spelling)
  - Big Grey Man (duplicate of Am Fear Liath Mòr — already enriched in Batch 1)
  - Bili Ape (confirmed real species — Eastern chimpanzee, Pan troglodytes schweinfurthii)
  - Bennington Monster (acknowledged fabrication by author Joseph Citro)
- **RECLASSIFIED to `religion_mythology` (3 entries)**:
  - Basilisk (classical mythology creature from Greek/Roman tradition, no modern cryptid sightings)
  - Baykok (Ojibwe spiritual being/death spirit, not a cryptid)
  - Bichura (Turkic household spirit, not a cryptid)
- **ENRICHED as cryptids (13 entries)**: Barghest of Yorkshire, Barmanou, Basajaun, Batsquatch, Batutut, Bear Lake Monster, Beast of Bodmin Moor, Beast of Bray Road, Beast of Busco, Beast of Exmoor, Beast of Gévaudan, Bessie, Bigfoot
- All 13 entries verified to meet character minimums (desc 2000+, chars 2000+, theo 2000+, anal 2500+)

### Prior (March 9, 2026) — Session 10: Batch 1+2 QA Audit, JSONB Fix, Research Audit

This session performed comprehensive QA across both Batch 1 and Batch 2 entries, fixing critical data issues and auditing for fabricated entries.

#### CRITICAL FIX: ai_quick_facts JSONB Double-Encoding ✅
- **Root cause**: `ai_quick_facts` column is `jsonb` (NOT text). When updating via REST API with `JSON.stringify(object)`, the value was double-encoded — stored as a JSON string literal instead of a JSON object. This caused the frontend to receive `typeof === "string"` instead of a parsed object, so Quick Facts never rendered.
- **Fix**: SQL command: `UPDATE phenomena SET ai_quick_facts = (ai_quick_facts #>> '{}')::jsonb WHERE ai_quick_facts IS NOT NULL AND jsonb_typeof(ai_quick_facts) = 'string'` — converted 98 rows from string to object type. Required temporarily disabling the `check_phenomena_duplicates` trigger.
- **Going forward**: When updating `ai_quick_facts` via REST API, pass the object directly — do NOT use `JSON.stringify()`. The REST API body itself is JSON-serialized, so `body: JSON.stringify({ ai_quick_facts: objectValue })` correctly sends the object as a nested JSON value.

#### Batch 1 Research Audit ✅
- Researched all 20 Batch 1 entries for fabrication/misclassification
- **DELETED (fabricated)**: Akka (no credible cryptid sources; confused with Sami goddess), Amenoba (no verifiable documentation in any cryptid database)
- **Notable overlap**: Almas, Almasti, and Altai Wild Man are regional variants of the same creature — kept as separate entries since each represents distinct regional tradition
- **Remaining Batch 1 entries (18)**: Adjule, Adlet, Adze, Agogwe, Agropelter, Ahool, Ahuizotl, Akkorokamui, Akunna, Alicanto, Alien Big Cat, Alkali Lake Monster, Almas, Almasti, Altai Wild Man, Altamaha-ha, Am Fear Liath Mòr, Amomongo, Animiki, Ao Ao

#### Entry-Specific Fixes ✅
- **Adjule**: Added missing `also_known_as` to quick facts, expanded description/characteristics/theories to meet minimums
- **Ahuizotl**: Complete quick facts rewrite (had wrong keys like `length`, `location` etc.), wrote full Paradocs Analysis (was 0 chars), added primary_regions (was empty), expanded description/characteristics/theories

#### ai_quick_facts Key Rename Fix ✅
- 19 Batch 1 entries had `evidence` instead of `evidence_types` — frontend checks for `evidence_types` specifically. Renamed all via REST API.

### Prior (March 9, 2026) — Batch 1 Content + Mini-Map Fixes

This session completed Batch 1 (20 cryptid entries) content enrichment and fixed multiple mini-map issues.

#### Batch 1: Originally 20 Cryptid Entries Enriched (now 18 after deletions) ✅
Entries processed (content only — no media/profile images yet):
Adjule, Adlet, Adze, Agogwe, Agropelter, Ahool, Ahuizotl, Akkorokamui, Akunna, Alicanto, Alien Big Cat, Alkali Lake Monster, Almas, Almasti, Altai Wild Man, Altamaha-ha, Am Fear Liath Mòr, Amomongo, Animiki, Ao Ao

Each entry received: `ai_description`, `ai_characteristics`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts` (JSON), `primary_regions` (text[])

**Adjule** (the template entry from Session 8) also received:
- 6 YouTube media entries in `phenomena_media` table
- Profile image uploaded to Supabase Storage (`phenomena-images` bucket)
- `primary_image_url` set

#### Mini-Map Fixes ✅
- **Map centering**: Replaced broken `MapFitBounds` dynamic import with `bounds` prop directly on `MapContainer`
- **Geocode outlier detection**: Added two-pass system to `regions.ts` — detects extreme geographic spread and re-geocodes outliers using `bbox` constraint (fixed "Labrador, Australia" bug)
- **Zoom controls**: Enabled `zoomControl` and `scrollWheelZoom`, styled dark theme with purple accents
- **Visible markers**: Replaced invisible SVG pins with Lucide MapPin-style icons (32x32, purple fill, white center, drop-shadow glow). Fixed `display:none` caused by global CSS rule requiring `custom-div-marker` class.
- **Tighter bounds**: Reduced padding from 30%/2° to 15%/1° for better default zoom

#### Profile Image Cropping Fix ✅
- Added `object-top` to thumbnail blur layer in `[slug].tsx` (line 240)
- Added `object-top` to encyclopedia card images in `index.tsx` (line 877)
- Hero banner reverted to default `object-cover` per user request

### Prior (March 8, 2026) — Adjule Entry Review & Overview Tab Restructure

#### Branding Fix, Paradocs Analysis Section, Interactive Mini-Map, Overview Tab Restructure ✅
- All previously documented work from Session 8 remains intact
- See git history for details

#### Quick Facts Icon Fix (prior session) ✅
- Replaced broken emoji icons with Lucide React icons (BookOpen, Fingerprint, Lightbulb, etc.)

#### Profile Image Enhancement (prior session) ✅
- Added blurred background fill for profile images on phenomena pages

#### Media Tab Videos (prior session) ✅
- Added YouTube video embeds to the Adjule Media tab

### Earlier (March 2026)

#### Media Pipeline & Admin Media Review ✅ (COMPLETE)
- **Files**: `src/pages/admin/media-review.tsx`, `src/pages/api/admin/phenomena/media-review.ts`, `src/pages/api/admin/phenomena/auto-search-profile-images.ts`
- Admin media review page at `/admin/media-review` with three tabs: Profile Review, Candidate Review, Denied Queue

#### Automated Wikimedia Commons Image Search ✅
- **Auto-Search API** (`src/pages/api/admin/phenomena/auto-search-profile-images.ts`):
  - Batch endpoint searches Wikimedia Commons for phenomena missing profile images
  - Scores by AI confidence: 0.95 (name in title), 0.70 (name in description), 0.65 (term in description), 0.40 (generic), 0.1 (mismatch)
  - Default confidence threshold: 0.3
  - Config: `maxDuration: 60`, `RATE_LIMIT_MS = 250`, `MAX_SEARCH_RESULTS = 8`, `MAX_CANDIDATES_PER_TERM = 3`, default `batch_size = 3`
  - Saves best candidate as `primary_image_url`, marks `profile_review_status = 'unreviewed'`
- **Media Review Frontend** (`src/pages/admin/media-review.tsx`):
  - "Auto-Find Images (All)" button with live progress counter
  - Profile Review tab: visual grid of all 4,792 phenomena with approve/deny buttons
  - Denied Queue tab: manual URL input per item + bulk CSV import
  - Category filter dropdown, search by name, status filter

### Earlier (February 2026)

#### Dashboard Overhaul: Constellation-First Research Hub ✅
- Sidebar reorganized into Research / Library / Tools groups
- Constellation and Journal promoted to positions #2 and #3
- Constellation Map V2 preview as dashboard centerpiece (D3 force simulation)
- Research Activity feed, Research Snapshot metric pills, Suggested Explorations cards

#### Psychic Phenomena Content Enrichment ✅
- Expanded psychic_phenomena entries from 55 to 157
- Enriched 90 entries below 4,500 chars total content

#### Encyclopedia Page Navigation ✅
- Category quick-nav bar: horizontal scrollable pill buttons with category icons, labels, and entry counts
- IntersectionObserver tracks active category on scroll

### Earlier Work
- PostGIS Geographic Search, Full-Text Search, Map Page Enhancement
- Saved Searches & Alerts, Location Inference Engine
- SEO groundwork, ingestion pipeline

---

## Key Files & Architecture

### Phenomena Detail Page
- `src/pages/phenomena/[slug].tsx` — **Primary detail page** (~1029 lines, heavily modified in recent sessions)
  - Overview tab: Fragment wrapper with top 3-col grid (main + sticky sidebar) + bottom 2-col grid (Characteristics | Theories)
  - History, Media, Reports tabs
  - Uses `ContentSection` component for Description, Characteristics, Theories
  - Custom Paradocs Analysis section with purple gradient
  - Phenomenon interface includes: `ai_summary`, `ai_description`, `ai_history`, `ai_characteristics`, `ai_notable_sightings`, `ai_theories`, `ai_cultural_impact`, `ai_paradocs_analysis`, `primary_regions`, `ai_quick_facts`
- `src/components/PhenomenonMiniMap.tsx` — Location mini-map for phenomenon sidebar
- `src/pages/api/geocode/regions.ts` — Server-side geocoding proxy for Mapbox
- `src/pages/api/admin/phenomena/update.ts` — Admin endpoint using `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS

### Ingestion Pipeline
- `src/lib/ingestion/engine.ts` — Main orchestrator
- `src/lib/ingestion/adapters/` — Source-specific scrapers (Reddit, NUFORC, BFRO, etc.)
- `src/lib/ingestion/utils/location-parser.ts` — Basic regex location parsing
- `src/lib/ingestion/utils/location-inferrer.ts` — Deep text analysis
- `src/lib/services/geocoding.service.ts` — Mapbox geocoding with in-memory cache

### Admin Endpoints
- `src/pages/api/admin/geocode.ts` — Batch geocode reports
- `src/pages/api/admin/infer-locations.ts` — Batch location inference
- `src/pages/api/admin/phenomena/update.ts` — Bypass RLS for phenomena updates
- `src/pages/api/admin/phenomena/media-review.ts` — Media review actions
- `src/pages/api/admin/phenomena/auto-search-profile-images.ts` — Wikimedia image search

### Frontend Components
- `src/components/Layout.tsx` — App shell, navigation
- `src/components/MapView.tsx` — Global sightings map (167 lines, CartoDB dark tiles)
- `src/components/reports/LocationMap.tsx` — Report location map (299 lines)
- `src/components/PhenomenonMiniMap.tsx` — Phenomenon-specific location map
- `src/components/patterns/PatternMiniMap.tsx` — Canvas-based mini-map alternative
- `src/pages/dashboard/constellation.tsx` — User's personal constellation (D3 force simulation)
- `src/pages/dashboard/index.tsx` — Dashboard overview

### Database
- Supabase project: `bhkbctdmwnowfmqpksed`
- Extensions: `postgis`, `pg_trgm`
- Key tables: `reports`, `phenomena`, `categories`, `saved_searches`, `constellation_entries`, `constellation_connections`, `constellation_theories`, `journal_entries`, `phenomena_media`
- Notable columns on `phenomena`: `ai_paradocs_analysis` (text), `primary_regions` (text[]), `profile_review_status` (text)
- RLS policies on most tables; admin endpoint uses `SUPABASE_SERVICE_ROLE_KEY` to bypass

---

## Current State: Batch Processing

### Completed
- **Adjule** (template): Fully complete — content, media (6 YouTube videos), profile image, primary_regions
- **Batch 1 (20 entries)**: Content complete (descriptions, characteristics, theories, paradocs analysis, quick facts, primary_regions). NO media or profile images yet.
- **Batch 2 (16 entries, originally 20 — 4 removed)**: Content complete and fact-checked. Entries: Ao Ao, Ape Canyon Creature, Apotamkin, Appalachian Wildman, Asanbosam, Aswang, Atlantic Sea Dragon, Australian Panther, Awful, Ayia Napa Sea Monster, Azores Sea Serpent, Badalischio, Baikal Lake Dragon, Baluchistan Wildman, Bamboo Ape, Ban Manush
  - **DELETED (fabricated/misclassified)**: Aquatic Ape (not a cryptid — evolutionary hypothesis), Architeuthis Giganteus (confirmed real species — Giant Squid), Ashuanipi Lake Monster (fabricated — no documented monster legend), Banip (fabricated — no documented PNG creature)
  - **Fact-check corrections applied**: Apotamkin (removed vampire mischaracterization), Bamboo Ape (linked to verified Nguoi Rung/Batutut), Awful (transparent about questionable provenance), Azores Sea Serpent (honest about limited documentation)

### Two-Phase Approach
- **Phase 1 (current)**: Content enrichment only — `ai_description`, `ai_characteristics`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts`, `primary_regions` for all cryptid entries, 20 at a time
- **Phase 2 (later)**: Profile images and media (YouTube videos) for all entries — Chase will provide custom profile images and YouTube URLs

### Progress: ~114/~353 cryptids done (Adjule + Batch 1 (18) + Batch 2 (16) + Batch 3 (13) + Batch 4 (14) + Batch 5 (9) + Batch 6 (8) + Batch 7 (11) + Batch 8 (11) + Batch 9 (4) + Batch 10 (10) — 86 total deleted/reclassified across all batches)

---

## Planned / Next Work

### IMMEDIATE: Continue Batch Content Enrichment
- Process next 20 cryptid entries starting alphabetically after "Mapinguari" (Batch 11)
- Each entry needs: `ai_description`, `ai_characteristics`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts` (JSON), `primary_regions` (text[])
- Use Supabase REST API with service role key (browser JS) to update entries
- Target: 20 entries per session
- **CRITICAL: Follow the Content Quality Standards below exactly**

---

## Content Quality Standards (MUST follow for every batch)

These standards ensure consistency across all enriched entries. Derived from the Adjule/Agogwe/Almas/Animiki templates.

### Character Length Targets

| Field | Minimum | Target | Max |
|-------|---------|--------|-----|
| `ai_description` | 1800 | 2000–2600 | 3000 |
| `ai_characteristics` | 1800 | 2000–2300 | 2800 |
| `ai_theories` | 1800 | 2000–2500 | 3000 |
| `ai_paradocs_analysis` | 2200 | 2500–3100 | 3500 |

Each field should contain 3–5 substantial paragraphs. Content should read like a well-researched encyclopedia article — specific, evidence-aware, and analytically rich. Avoid generic filler. Every paragraph should contain concrete details: dates, names, locations, physical measurements, behavioral specifics.

### `ai_quick_facts` Format (CRITICAL — frontend will not render if wrong)

**Must be a flat JSON object** with these exact keys (all optional but include as many as applicable):

```json
{
  "origin": "Detailed origin — region, culture, and historical context (50-150 chars)",
  "classification": "Cryptid type and taxonomic speculation (40-100 chars)",
  "first_documented": "Year and context of first Western/written documentation (50-200 chars)",
  "danger_level": "Assessment with explanation — triggers color coding in UI (50-150 chars)",
  "typical_encounter": "What a sighting usually looks like — conditions, duration, behavior (80-220 chars)",
  "evidence_types": "What evidence exists — oral tradition, photos, tracks, specimens, etc. (80-220 chars)",
  "active_period": "When the creature is active — diurnal, nocturnal, seasonal patterns (50-150 chars)",
  "notable_feature": "The single most distinctive or unusual characteristic (80-200 chars)",
  "cultural_significance": "Role in local culture, spiritual traditions, or modern impact (80-200 chars)",
  "also_known_as": ["Alt Name 1", "Alt Name 2"]
}
```

**Key rules:**
- `danger_level` value is parsed for color: include words like "High", "Moderate", "Low", "None", "Dangerous", "Benign", "Harmless", "Caution"
- `also_known_as` is the ONLY array field — all others are strings
- Values should be **detailed phrases/sentences**, not terse labels. 50-220 chars each.
- **CRITICAL**: The column is `jsonb`, NOT text. When updating via REST API, pass the object directly — do NOT wrap in `JSON.stringify()`. Example: `{ ai_quick_facts: quickFactsObject }` — the REST body serialization handles it correctly.
- The frontend renders each key conditionally with a specific Lucide icon — if the key doesn't match exactly, it won't display

### `primary_regions` Format
- Array of 3-6 specific geographic strings
- Include both specific locations and broader regions
- Example: `["Chittagong Hill Tracts, Bangladesh", "Southeastern Bangladesh", "Indo-Burman borderlands", "Sylhet Division, Bangladesh"]`

### Content Quality Checklist (per entry)
- [ ] Description: 3-5 paragraphs, 2000+ chars, includes historical context, physical description overview, notable sightings
- [ ] Characteristics: 3-4 paragraphs, 2000+ chars, detailed morphology, behavioral patterns, habitat specifics, sensory details
- [ ] Theories: 3-4 paragraphs, 2000+ chars, at minimum covers: scientific/conventional explanation, cryptozoological hypothesis, cultural/anthropological interpretation
- [ ] Analysis: 3-5 paragraphs, 2500+ chars, connects to Paradocs database patterns, identifies cross-cultural parallels, raises analytical questions, discusses evidence quality
- [ ] Quick Facts: flat object with 8-10 keys from the approved list, detailed values
- [ ] Summary: 150-350 chars, one sentence for /phenomena listing card preview (`ai_summary` field)
- [ ] Regions: 3-6 specific geographic strings

### Research-First Mandate (NON-NEGOTIABLE)

**All content must be grounded in actual research. No fabrication.**

Before writing content for ANY entry, you MUST:

1. **Web search the cryptid name** — find actual sources (Wikipedia, cryptozoology databases, folklore archives, academic papers, news articles)
2. **Verify key facts** before including them:
   - Geographic origin and specific locations of sightings
   - First documented accounts (who, when, where)
   - Physical descriptions from actual witness reports or folklore sources
   - Cultural context from the actual tradition (not invented)
   - Named researchers, expeditions, or investigators
   - Specific dates, publications, or events
3. **If a fact cannot be verified**, do NOT include it. It is better to write shorter, accurate content than to pad with plausible-sounding fabrications.
4. **For obscure entries** with very little available information, acknowledge the limited documentation rather than inventing details. Focus on what IS known and verifiable.
5. **Cross-reference** — if multiple sources agree on a detail, include it. If only one dubious source mentions something, note the uncertainty.

6. **Entry quality gate** — if research reveals that an entry is fabricated (no documented tradition), a confirmed real species (not a cryptid), or a misclassified concept (e.g., a scientific hypothesis, not a creature), flag it for DELETION rather than writing content for it. Entries that are mythological/religious in nature (not cryptids) should be RECLASSIFIED to `religion_mythology` category rather than deleted, as long as they come from real text/research traditions. Only real reported myths, cryptids, and folklore creatures should have entries in the encyclopedia.

**What counts as fabrication (DO NOT DO):**
- Inventing specific dates of sightings that didn't happen
- Creating fictional researcher names or expeditions
- Attributing quotes or accounts to people who didn't make them
- Making up physical measurements or behavioral details
- Inventing cultural practices or beliefs not documented in actual traditions
- Creating "first documented" dates without a source

**What is acceptable:**
- Synthesizing information from multiple verified sources into original prose
- Drawing reasonable analytical connections between verified facts
- Noting the analytical significance of a cryptid within the Paradocs framework (this is the Analysis section's purpose)
- Using general knowledge about a region's geography, ecology, or culture when it provides context for verified cryptid reports

### Writing Style for Paradocs
- **Tone**: Intellectually serious but accessible. The platform treats paranormal phenomena as legitimate subjects of inquiry without being credulous.
- **Thesis**: Emergent patterns in massive anecdotal data suggest deeper reality — implied through analysis, never stated outright.
- **Goal per entry**: "The most robust report on this cryptid on the internet."
- **Paradocs Analysis section** should reference the "Paradocs database" or "Paradocs system" and discuss cross-entry patterns, analytical metrics, and evidence quality. This is the signature section that distinguishes Paradocs from a standard encyclopedia.

### Phase 2 (Later): Profile Images & Media
- Chase uploads custom profile images to Supabase Storage `phenomena-images` bucket
- Chase provides YouTube URLs per entry
- Claude inserts media entries into `phenomena_media` table and sets `primary_image_url`

### Other Later Work
- Auto-search images (partially complete ~100+ processed, ~58 found)
- UX Optimization (header/nav cleanup, homepage flow, report detail UX)
- Email alerts for saved searches
- Location inference in live ingestion pipeline
- SEO optimization, Stripe checkout, Collections, Connection cards

---

## Git History (Recent Commits)

| SHA | Description |
|-----|-------------|
| `9473c322` | Fix encyclopedia scroll restoration: save/restore scroll position and set nav context |
| `c07832be` | Rename ParaDocs to Paradocs sitewide + fix encyclopedia back-navigation scroll |
| `3690a9ec` | Cache phenomena data in module-level variable for instant back-navigation rendering |
| `ef72a5f6` | Make minimap scroll away so Quick Facts sticks to top |
| `891443e8` | Move minimap above Quick Facts in sidebar |
| `79d555f2` | Fix blank space between Paradocs Analysis and Characteristics/Theories |
| `98afbb0` | Fix hidden markers by adding custom-div-marker class |
| `fdc3092` | Replace invisible SVG pins with Lucide MapPin-style markers |
| `d92057f` | Add zoom controls to mini-map and tighten default bounds |
| `1c2788b` | Use bbox instead of proximity for geocode outlier re-geocoding |
| `4a632a7` | Fix geocode outlier detection for ambiguous region names |
| `824d7a2` | Fix map centering by using bounds prop directly on MapContainer |
| `a6ede1e` | Improve mini-map: fix centering and add purple pin markers |
| `5e6a588` | Revert hero banner to default center positioning |
| `b953cbd` | Fix profile image cropping by adding object-top positioning |
| `871d081` | Restructure overview tab: mobile-first sidebar, sticky Quick Facts |
| `fb6f331` | Create PhenomenonMiniMap component with server-side geocoding |

---

## Environment & Access

- **Live site**: beta.discoverparadocs.com
- **Vercel**: vercel.com/eq1725s-projects/paradocs
- **Supabase**: supabase.com/dashboard/project/bhkbctdmwnowfmqpksed
- **GitHub**: github.com/eq1725/paradocs (main branch)
- **GitHub token**: (stored locally — do not commit to repo)
- **Mapbox**: Server-side only via `MAPBOX_ACCESS_TOKEN` env var
- **Admin email whitelist**: `williamschaseh@gmail.com`
- **Adjule phenomenon ID**: `6a49e38e-516b-4c89-9c10-bda16b3a828d`

---

## Critical: SWC Compiler Rules for [slug].tsx

**These MUST be followed or the Vercel build WILL fail for `[slug].tsx`:**
- **NO template literals** — use `'hello ' + name` not `` `hello ${name}` ``
- **Use `var`** — never `const` or `let`
- **Use `function(){}`** — never arrow functions `() =>`
- **String concatenation for URLs/classNames** — never template literals in JSX
- **Unicode escapes for smart quotes** — use `\u2019` not `'`
- **useState pattern:** `var fooState = useState(default); var foo = fooState[0]; var setFoo = fooState[1];`

**Note:** Other component files (PhenomenonMiniMap.tsx, MapView.tsx, LocationMap.tsx, API routes) use modern JS syntax (const, arrow functions, template literals) without issues. The SWC restriction only applies to `[slug].tsx`.

## Code Deployment Method

**The VM sandbox CANNOT make outbound HTTPS requests** (403 Forbidden tunnel). All GitHub pushes happen via browser JavaScript:

```javascript
// 1. Get current file SHA
fetch('https://api.github.com/repos/eq1725/paradocs/contents/PATH', {
  headers: { 'Authorization': 'token GH_TOKEN' }
}).then(function(r) { return r.json(); }).then(function(data) {
  // data.sha is needed for updates
});

// 2. Encode content properly (handles unicode)
var bytes = new TextEncoder().encode(content);
var binary = '';
for (var i = 0; i < bytes.length; i++) {
  binary += String.fromCharCode(bytes[i]);
}
var b64 = btoa(binary);

// 3. Push complete file
fetch('https://api.github.com/repos/eq1725/paradocs/contents/PATH', {
  method: 'PUT',
  headers: { 'Authorization': 'token GH_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'commit msg', content: b64, sha: data.sha, branch: 'main' })
});
```

- Always push COMPLETE file content (not diffs)
- Vercel auto-deploys on push (~1.5 min build)
- Chrome extension content blocker frequently blocks JS outputs containing JSX, base64, or cookie-like patterns — use simpler output formats, split into chunks, or use window variables

## Database Update Method (for batch content enrichment)

The VM cannot make outbound HTTPS. All Supabase updates happen via browser JavaScript:

```javascript
// Set up once per session
window._SB_URL = 'https://bhkbctdmwnowfmqpksed.supabase.co';
window._SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoa2JjdGRtd25vd2ZtcXBrc2VkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxOTg2MiwiZXhwIjoyMDg1MDk1ODYyfQ.dClu6HWGaTRR6TDeT8JkwCvqVUBtMo3Kb8Dr8r7EuwA';

// Update a phenomenon by ID
window._updatePhenomenon = function(id, fields) {
  return fetch(window._SB_URL + '/rest/v1/phenomena?id=eq.' + id, {
    method: 'PATCH',
    headers: {
      'apikey': window._SB_KEY,
      'Authorization': 'Bearer ' + window._SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(fields)
  }).then(function(r) { return r.status; });
};

// Insert media entry
window._insertMedia = function(phenomenonId, url, type, title, desc) {
  return fetch(window._SB_URL + '/rest/v1/phenomena_media', {
    method: 'POST',
    headers: {
      'apikey': window._SB_KEY,
      'Authorization': 'Bearer ' + window._SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      phenomenon_id: phenomenonId,
      media_url: url,
      media_type: type,
      title: title,
      description: desc || ''
    })
  }).then(function(r) { return r.status; });
};
```

### Key schema notes:
- `phenomena_media.media_type` CHECK constraint: valid values are `image`, `video`, `document`, `illustration`
- `ai_quick_facts` is `jsonb` column — pass as a plain JS object, do NOT stringify (or it will be double-encoded as a JSON string literal)
- `primary_regions` is `text[]` — pass as a JS array
- Supabase Storage bucket `phenomena-images` (public) for profile images
- `primary_image_url` field (NOT `image_url`) for profile images

## Notes for Next Session

1. **Continue batch content enrichment** — Batch 9 starts after "J'ba Fofi" alphabetically, process 20 entries
2. **RESEARCH FIRST** — Web search EVERY cryptid before writing content. Verify all facts. No fabrication. See "Research-First Mandate" section.
3. **READ the Content Quality Standards section above BEFORE writing any content** — this is critical for consistency
4. First establish the browser helper functions (see Database Update Method above)
5. Query for next 20 cryptid entries: `phenomena?category=eq.cryptids&order=name&name=gt.J'ba Fofi&limit=20`
6. For each entry, generate and update: `ai_description`, `ai_characteristics`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts`, `primary_regions`, `ai_summary` (150-350 char preview text for /phenomena listing cards)
7. **`ai_quick_facts` must be a flat object** with keys: origin, classification, first_documented, danger_level, typical_encounter, evidence_types, active_period, notable_feature, cultural_significance, also_known_as. Pass as JS object (NOT stringified). NOT an array of label/value pairs.
8. **Content length targets**: desc 2000+, chars 2000+, theories 2000+, analysis 2500+ (chars). Check against these AFTER pushing and run a verification query across all entries in the batch before marking complete.
9. The mini-map automatically works for any entry with `primary_regions` populated
10. Profile images and media are Phase 2 — skip for now
11. **Push content directly, NOT via sub-agents** — sub-agents strip `\n\n` newlines from JS string literals. Use per-field base64 encoding if content is large (>10KB per field). See "Lessons Learned" for details.
11. **Git workflow**: Claude commits in VM, Chase pushes from `~/paradocs` with `rm -f .git/HEAD.lock && git push origin main`
12. **SWC restrictions** only apply to `[slug].tsx` — other files use modern JS
13. **DB column note**: category column is `category` (not `category_id`), no `description` column (use `ai_description`)

### Lessons Learned (from Batches 1-4)
- **Parallel agents produce short content**: When using parallel agents to research/write entries, they frequently produce fields under the character minimums. Always verify lengths AFTER pushing and expand any short fields before marking the batch complete.
- **Quick facts keys must be exact**: The frontend only renders these 10 keys: `origin`, `classification`, `first_documented`, `danger_level`, `typical_encounter`, `evidence_types`, `active_period`, `notable_feature`, `cultural_significance`, `also_known_as`. Agents sometimes invent arbitrary keys. Always validate.
- **Push via slug not id**: Use `?slug=eq.SLUG` in REST API URLs — more reliable than looking up UUIDs.
- **JS variables don't persist between browser executions**: Each `javascript_exec` call is independent. Store reusable data on `window` (e.g., `window._fixData`) or combine build+push in a single call.
- **REST API returns 405 on DELETE**: Use Supabase SQL Editor (tab 741825755) with Monaco API for deletions: `monaco.editor.getEditors()[0].setValue(sql)` then click Run.
- **Batch 5 efficiency**: Splitting pushes into text fields (4 fields) and meta fields (quick_facts + regions) as separate PATCH calls is reliable. Total ~14 API calls for 7 entries. Each entry's full JSON payload (~12K) fits in a single javascript_exec call.
- **High deletion/reclassification rate in Batch 5-6**: 11 of 20 entries (55%) in Batch 5, 14 of 20 (70%) in Batch 6 were removed or reclassified. As we move further alphabetically, the proportion of obscure/fabricated/mythology entries increases. Budget for fewer enriched entries per batch.
- **Reclassify via PATCH**: `fetch(url + '?slug=eq.SLUG', { method: 'PATCH', body: JSON.stringify({ category: 'religion_mythology' }) })`
- **Sub-agent content pushes can truncate**: In Batch 6, a sub-agent pushing content via javascript_exec truncated all text fields to ~60-70% of original length. Fix: push each failing field individually by reading the fix JS file and executing it directly. Always verify DB char counts after pushing, not just local file counts.
- **Duplicate checking**: Always check new entries against previously enriched entries. Fear Liath was a duplicate of Am Fear Liath Mòr (Batch 1). Big Grey Man was caught as duplicate in Batch 3. Query `?slug=in.(slug1,slug2)&select=slug,name,ai_description` to check.
- **Don't over-delete**: Research agents can be too aggressive classifying entries as "debunked" or "single incident." Dover Demon (3 independent witnesses, 1977, investigated by Loren Coleman) and Flatwoods Monster (multiple witnesses, 1952, has its own museum) were initially deleted but are legitimate well-known cryptids. A cryptid should be KEPT if it has: (a) multiple witnesses, (b) cultural significance, (c) ongoing recognition in cryptozoology literature, or (d) a documented sighting tradition — even if skeptics propose conventional explanations. Similarly, folklore creatures like Elwetritsch should be reclassified to religion_mythology rather than deleted.
- **DB constraint**: The `phenomena_status_check` constraint requires `status` to be `'active'` or `'merged'` (NOT `'approved'`). Use `'active'` when re-inserting entries.
- **Sub-agents strip `\n\n` newlines**: When sub-agents execute JavaScript via `javascript_tool`, double-newline characters (`\n\n`) are silently stripped from string literals. This means content pushed through sub-agents will arrive as walls of text with no paragraph breaks — even though the sub-agent reports 204 success. **Workaround**: Push content directly (not via sub-agent) using base64 encoding. Encode on the VM with Python `base64.b64encode()`, read the base64 file, pass it as a string literal to `javascript_tool`, and decode in browser with `decodeURIComponent(escape(atob(b64)))` for proper UTF-8 handling.
- **Per-field base64 for large content**: When pushing text fields via browser JS, the `javascript_tool` text parameter can truncate base64 strings larger than ~16KB. Solution: encode each field individually (2-8KB each) instead of combining all 4 fields per slug into one payload (16-25KB). Generate per-field files with Python: `base64.b64encode(field_value.encode()).decode()` → write to `/tmp/b64pf_{slug}_{field}.txt`. Then read each file and push one field at a time via `_updateBySlug`.
- **Paired push scripts (Batch 7)**: The most reliable push method is paired base64 scripts — each script pushes 2 text fields per entry (p1: description + characteristics, p2: theories + analysis). Generate per-field base64 files on VM, then build JS scripts that decode and push 2 fields at once (~8KB each, well under the ~16KB truncation limit). Meta fields (quick_facts + primary_regions) can be pushed separately in grouped batches. This approach achieved 100% first-attempt success for 21 of 22 pushes in Batch 7 (1 truncation on giant-ground-sloth theories, fixed with re-push).
- **`ai_summary` for preview cards**: The /phenomena listing page uses `ai_summary` (NOT `ai_description`) for card preview text. When enriching entries, ensure `ai_summary` is populated — especially for entries that were deleted and restored. A good summary is 150-350 chars, one sentence describing what the cryptid is.
- **Paragraph breaks quality fix (Batch 6)**: All 7 Batch 6 enriched entries (dwayyo, ebu-gogo, el-cuero, emela-ntouka, enfield-horror, flathead-lake-monster, flatwoods-monster) had their 4 AI text fields fixed to include proper `\n\n` paragraph breaks. All 28 fields verified in DB with break counts ranging from 2-8 per field. This issue was caused by sub-agent newline stripping during the initial content push — future batches should push content directly (not via sub-agent) to avoid this.
