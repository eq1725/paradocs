# Paradocs — Source-Specific Ingestion Guidelines

> **Last updated:** March 25, 2026 (Session 10 Revised — xlsx source list incorporated)
> **Purpose:** Master reference for all current and planned data sources, adapter requirements, quality thresholds, and scaling targets. This document guides adapter development and ingestion configuration for every source in the Paradocs pipeline.

---

## Legal Posture Reminder

Paradocs operates as an **index with attribution** — like Google News, not a republisher. For every ingested report:
- `source_url` is **mandatory** (links back to original)
- Raw `description` is stored for AI processing but **never displayed** to users
- `paradocs_narrative` and `paradocs_assessment` are original AI-generated content (our editorial voice)
- `feed_hook` is original content for the feed card

---

## Pipeline Architecture (Per Report)

```
Adapter.scrape() → ENRICHMENT → Quality Filter → Dedup (original_report_id + source_type)
                       ↓
               Date extraction from text
               Location extraction from text
               Geocoding (MapTiler) → lat/lng
               Date precision validation
                       ↓
               INSERT (status: approved | pending_review | rejected)
                       ↓
               Title Improvement (Claude Haiku) → Phenomena Linking → Media Extraction
                       ↓
               Feed Hook (Claude Haiku) → Paradocs Analysis (Claude Haiku) → Vector Embedding (OpenAI)
```

### Enrichment Step (`src/lib/ingestion/enrichment/report-enricher.ts`)

Runs after adapter output, before quality scoring. Fills in missing structured data by extracting clearly stated information from the report text. **Never fabricates data** — if it can't find something in the text, the field stays null.

What it does:
1. **Date extraction**: Finds dates stated in description ("on January 15, 2019", "back in 2003", "12/25/2019") → sets `event_date` + `event_date_precision`
2. **Date precision validation**: Checks that `event_date_precision` matches the actual date value (downgrades overclaims, never upgrades)
3. **Location extraction**: Finds US locations stated in text ("in Portland, Oregon", "rural Ohio") → sets `city`, `state_province`, `location_name`
4. **Geocoding**: Converts location data to `latitude`/`longitude` via MapTiler API for map display

Why before scoring: enriched data improves quality scores. A Reddit post that says "this happened in Portland, Oregon in 2019" gets credit for having a date and location even though the adapter didn't parse those fields.

**AI cost per 1K reports:** ~$0.85–1.00
**Required env vars:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `NEXT_PUBLIC_MAPTILER_KEY`, plus source-specific keys below.

---

## Phenomenon Categories (11)

| ID | Label | Typical Sources |
|----|-------|-----------------|
| `ufos_aliens` | UFOs & Aliens | NUFORC, MUFON, Black Vault, GEIPAN, YouTube |
| `cryptids` | Cryptids | BFRO, Phantoms & Monsters, regional databases |
| `ghosts_hauntings` | Ghosts & Hauntings | Ghosts of America, Shadowlands, Paranormal Database UK |
| `psychic_phenomena` | Psychic Phenomena | Reddit, NDERF (related), historical archives |
| `consciousness_practices` | Consciousness Practices | Erowid, IANDS, Reddit |
| `psychological_experiences` | Psychological Experiences | NDERF, IANDS, OBERF, Reddit r/NDE |
| `biological_factors` | Biological Factors | Academic sources, Erowid |
| `perception_sensory` | Perception & Sensory | Cross-source (shadow people, orbs, auditory) |
| `religion_mythology` | Religion & Mythology | Historical archives, Wikipedia |
| `esoteric_practices` | Esoteric Practices | Reddit, historical archives |
| `combination` | Multi-Disciplinary | Complex multi-phenomena cases |

---

## TIER 1 — Active Adapters (Built, Need Testing/Fixes)

These 12 adapters exist in `src/lib/ingestion/adapters/`. Each needs quality testing before scale-up.

### 1. NUFORC (National UFO Reporting Center)

| Field | Value |
|-------|-------|
| **Adapter** | `nuforc` |
| **URL** | https://nuforc.org |
| **Category** | `ufos_aliens` |
| **Method** | Web scraping (WordPress wpDataTable) |
| **Volume** | ~100,000+ sightings |
| **API Key** | None needed |
| **Status** | ⚠️ ADAPTER BUG — parses IDs correctly but applies same row data to all reports |

**Quality expectations:**
- `source_url`: ✅ Always populated (`https://nuforc.org/sighting/?id={id}`)
- `event_date`: Should be populated from table metadata
- `event_date_precision`: `exact` or `month` (NUFORC has structured dates)
- `location_name`: City + State from table columns
- `credibility`: `medium` default; bump to `high` if multiple witnesses or photos
- `emotional_tone`: Typically `awe_inspiring` or `frightening`

**Known issues:**
- Index page parsing bug: all reports get first row's metadata (March 2026 test)
- `fetch_full_details=false` (default) means no individual page scraping — fast but only gets summary
- Need to fix row-level parsing in wpDataTable extraction OR enable `fetch_full_details=true`
- NUFORC TOS explicitly forbids scraping — consider using Kaggle/HuggingFace mirrors instead

**Config:** `{"base_url": "https://nuforc.org", "rate_limit_ms": 500, "max_months": 6, "fetch_full_details": false}`

**Fix priority:** HIGH — this is our largest UFO source

---

### 2. BFRO (Bigfoot Field Researchers Organization)

| Field | Value |
|-------|-------|
| **Adapter** | `bfro` |
| **URL** | https://www.bfro.net |
| **Category** | `cryptids` |
| **Method** | Web scraping (static HTML by state) |
| **Volume** | ~5,600+ reports |
| **API Key** | None needed |
| **Status** | Built, untested in clean pipeline |

**Quality expectations:**
- `source_url`: ✅ (`https://www.bfro.net/GDB/show_report.asp?id={id}`)
- `event_date`: Variable — BFRO has dates but formats vary ("Month Year", "YYYY-MM-DD", etc.)
- `event_date_precision`: `exact`, `month`, or `year` depending on report
- `location_name`: County + State (well-structured)
- `credibility`: Map from BFRO classification — Class A → `high`, Class B → `medium`, Class C → `low`
- Unique data: BFRO classification system (A/B/C) is a strong credibility signal

**Config:** `{"base_url": "https://www.bfro.net", "rate_limit_ms": 500, "states": ["wa", "or", "ca", "oh", "fl", "tx", "pa", "ny", "mi", "il"]}`

**Notes:** Scrapes individual report pages (slower but gets full descriptions). 500ms rate limit respects server. Priority states cover highest-activity areas.

---

### 3. Ghosts of America

| Field | Value |
|-------|-------|
| **Adapter** | `ghostsofamerica` |
| **URL** | https://www.ghostsofamerica.com |
| **Category** | `ghosts_hauntings` |
| **Method** | Web scraping |
| **Volume** | Thousands of user-submitted stories |
| **API Key** | None needed |
| **Status** | Built, untested in clean pipeline |

**Quality expectations:**
- `source_url`: ✅
- `event_date`: Often missing — user stories rarely include precise dates
- `event_date_precision`: Typically `unknown` or `estimated`
- `location_name`: State/city usually present
- `credibility`: Default `unverified` — user-submitted with no verification
- Quality filter should use higher threshold — many stories are low-quality/fiction

**Quality thresholds:** Minimum description length 200 chars. Reject obvious fiction markers ("I made this up", "this is a story I heard").

---

### 4. Shadowlands

| Field | Value |
|-------|-------|
| **Adapter** | `shadowlands` |
| **URL** | https://theshadowlands.net |
| **Category** | `ghosts_hauntings` |
| **Method** | Web scraping (state-by-state listings) |
| **Volume** | Thousands of haunted location entries |
| **API Key** | None needed |
| **Status** | Built, untested in clean pipeline |

**Quality expectations:**
- `source_url`: ✅
- `event_date`: Rarely available — these are location descriptions, not event reports
- `event_date_precision`: Usually `unknown`
- `location_name`: Well-structured (location-based database)
- `credibility`: `low` to `medium` — brief, unverified descriptions
- Reports tend to be very short — quality filter should accept shorter descriptions for this source

**Special handling:** These are more "haunted location entries" than eyewitness reports. Consider tagging with `content_type: 'historical_case'` rather than `'experiencer_report'`.

---

### 5. Reddit (Arctic Shift API)

| Field | Value |
|-------|-------|
| **Adapter** | `reddit` (legacy) / `reddit-v2` (enhanced) |
| **URL** | Arctic Shift API |
| **Category** | Multiple (mapped by subreddit) |
| **Method** | API (Arctic Shift) |
| **Volume** | Effectively unlimited |
| **API Key** | None (Arctic Shift is public) |
| **Status** | Built, `reddit-v2` is the preferred adapter |

**Subreddit → Category mapping (13+ subreddits):**
- `r/UFOs`, `r/ufo` → `ufos_aliens`
- `r/Paranormal`, `r/Ghosts` → `ghosts_hauntings`
- `r/bigfoot`, `r/cryptids` → `cryptids`
- `r/NDE`, `r/NearDeathExperiences` → `psychological_experiences`
- `r/HighStrangeness` → `combination`
- `r/Thetruthishere` → `combination`
- `r/AstralProjection` → `consciousness_practices`
- `r/Glitch_in_the_Matrix` → `perception_sensory`

**Quality expectations:**
- `source_url`: ✅ (Reddit permalink)
- `event_date`: **Post date ≠ event date** — use post date as `estimated`, never `exact`
- `event_date_precision`: `estimated` always
- `location_name`: Rarely available — must extract from text if possible
- `credibility`: `unverified` default; anonymous internet posts
- Filter aggressively: reject meta posts, questions, memes, crossposts, posts < 300 chars

**Special handling:**
- Reddit v2 handles gallery posts, video embeds, and media extraction
- 2000ms rate limit on Arctic Shift
- Filter out: "[removed]", "[deleted]", moderator posts, bot posts
- Post score (upvotes) can inform quality but is NOT a credibility signal

---

### 6. Wikipedia

| Field | Value |
|-------|-------|
| **Adapter** | `wikipedia` |
| **URL** | Wikipedia API / list pages |
| **Category** | Multiple |
| **Method** | API + HTML parsing |
| **Volume** | Hundreds of structured entries |
| **API Key** | None needed |
| **Status** | Built, untested in clean pipeline |

**Quality expectations:**
- `source_url`: ✅ (Wikipedia article URL)
- `event_date`: Usually available — Wikipedia lists are well-dated
- `event_date_precision`: `exact` or `year`
- `location_name`: Usually well-structured
- `credibility`: `medium` to `high` — Wikipedia entries are community-verified
- `content_type`: `historical_case` always

**Special handling:** Wikipedia entries are factual reference material, not eyewitness accounts. Set `content_type: 'historical_case'`. These provide the historical backbone for patterns.

---

### 7. NDERF (Near-Death Experience Research Foundation)

| Field | Value |
|-------|-------|
| **Adapter** | `nderf` |
| **URL** | https://www.nderf.org |
| **Category** | `psychological_experiences` |
| **Method** | Web scraping |
| **Volume** | 16,000+ NDEs in 23 languages |
| **API Key** | None needed |
| **Status** | Built, untested in clean pipeline |

**Quality expectations:**
- `source_url`: ✅
- `event_date`: Sometimes available (from questionnaire)
- `event_date_precision`: `estimated` or `unknown`
- `location_name`: Sometimes available
- `credibility`: `medium` — structured questionnaire format adds credibility
- Long-form narratives — quality filter should accept longer descriptions
- `emotional_tone`: Usually `awe_inspiring` or `hopeful`

**Special handling:** NDERF uses structured questionnaires — parse NDE type, characteristics, and circumstances. These are among the highest-quality experiencer reports available. Public access by design (submissions posted with permission).

---

### 8. IANDS (International Association for Near-Death Studies)

| Field | Value |
|-------|-------|
| **Adapter** | `iands` |
| **URL** | https://iands.org |
| **Category** | `psychological_experiences` |
| **Method** | Web scraping |
| **Volume** | Smaller collection of curated accounts |
| **API Key** | None needed |
| **Status** | Built, untested in clean pipeline |

**Quality expectations:** Similar to NDERF. Categorizes by experience type (NDE, OBE, STE — shared transformative experiences).

---

### 9. YouTube

| Field | Value |
|-------|-------|
| **Adapter** | `youtube` |
| **URL** | YouTube Data API v3 |
| **Category** | Multiple (mapped by channel/keywords) |
| **Method** | YouTube API |
| **Volume** | Effectively unlimited |
| **API Key** | `YOUTUBE_API_KEY` **required** |
| **Status** | Built (Session 10), untested |

**Target channels (eyewitness/investigation focus):**
- Nuke's Top 5 — Ghost/paranormal video compilations
- MrBallen — Strange/dark/mysterious stories
- BuzzFeed Unsolved — Paranormal investigations
- Jim Harold's Campfire — Listener paranormal stories
- Bedtime Stories — Paranormal case studies
- The Why Files — Paranormal investigations with research
- Lazy Masquerade — True scary stories
- Mr. Nightmare — Paranormal compilations
- Chills — Top paranormal lists

**Quality expectations:**
- `source_url`: ✅ (YouTube video URL)
- `event_date`: Video publish date, NOT event date → `estimated`
- `location_name`: Extract from title/description if possible
- `credibility`: `unverified` default
- Video description is the primary text source
- Duration filter: reject videos < 60 seconds (shorts) and > 3 hours (compilations)

**YouTube Comments as a source:**
- Comments on paranormal videos often contain eyewitness accounts ("this happened to me too...")
- Would need a separate adapter or mode to ingest high-engagement comments
- Filter: minimum 100 chars, minimum 5 upvotes, exclude replies to keep first-person accounts
- Map to same category as parent video
- `source_url` = video URL + comment timestamp/ID
- `credibility`: `unverified` — anonymous internet comments

---

### 10. News

| Field | Value |
|-------|-------|
| **Adapter** | `news` |
| **URL** | NewsAPI.org |
| **Category** | Multiple (keyword-detected) |
| **Method** | NewsAPI REST API |
| **Volume** | Ongoing (news cycle) |
| **API Key** | `NEWS_API_KEY` **required** |
| **Status** | Built (Session 10), untested |

**Search queries (7):** UFO sighting, ghost haunting, bigfoot sighting, paranormal activity, cryptid encounter, near-death experience, alien encounter

**Quality expectations:**
- `source_url`: ✅ (news article URL)
- `event_date`: Article publish date — use `estimated` precision
- `location_name`: Extract from article content
- `credibility`: `medium` — news articles have editorial oversight
- `content_type`: `news_discussion`
- Filter: reject opinion pieces, listicles, entertainment articles

---

### 11. Erowid (Experience Vault)

| Field | Value |
|-------|-------|
| **Adapter** | `erowid` |
| **URL** | https://erowid.org |
| **Category** | `consciousness_practices` / `psychological_experiences` |
| **Method** | Web scraping (2-second rate limit) |
| **Volume** | Thousands of experience reports |
| **API Key** | None needed |
| **Status** | Built (Session 10), untested |

**Quality expectations:**
- `source_url`: ✅
- `event_date`: Rarely available
- `event_date_precision`: `unknown`
- `location_name`: Rarely available
- `credibility`: `low` to `medium` — anonymous self-reports of altered states
- `emotional_tone`: Highly variable

**Special handling:** These are substance-related altered state experiences. Filter for paranormal-relevant content (entity encounters, OBEs, mystical experiences). Reject pure drug trip reports with no paranormal dimension. Respects Erowid's servers with 2-second rate limit.

---

## TIER 2 — New Adapters to Build (High Priority)

These sources don't have adapters yet but are high-value targets for reaching 1M+ reports.

### 12. Kaggle/HuggingFace Data Mirrors

| Field | Value |
|-------|-------|
| **Adapter** | `kaggle-import` (to build) |
| **Category** | `ufos_aliens`, `cryptids` |
| **Method** | Bulk CSV/JSONL import |
| **Volume** | 300,000+ records across datasets |
| **API Key** | Kaggle API key (optional) |
| **Priority** | 🔴 HIGH — fastest path to volume |

**Key datasets:**
- **NUFORC mirror** (Kaggle): ~80,000–100,000 UFO sightings, pre-cleaned CSV. Bypasses NUFORC TOS scraping issues.
- **HuggingFace NUFORC** (kcimc/NUFORC): ~327,000 merged records in JSONL
- **BFRO data** (data.world): Structured Bigfoot reports
- **Historical UFO compilations**: Various cleaned datasets

**Adapter design:** Batch importer that reads CSV/JSONL files, maps columns to our schema, and feeds through the standard quality filter pipeline. No web scraping needed.

**Why this matters:** This is the single fastest way to get to 100K+ reports. Pre-cleaned data, no rate limiting, no TOS issues with mirrors.

---

### 13. The Black Vault (FOIA Documents)

| Field | Value |
|-------|-------|
| **Adapter** | `blackvault` (to build) |
| **URL** | https://www.theblackvault.com/documentarchive/ |
| **Category** | `ufos_aliens` |
| **Method** | Web scraping + document parsing |
| **Volume** | 129,491+ UFO documents, 3.8M+ pages total |
| **API Key** | None needed |
| **Priority** | 🟡 MEDIUM — high value but complex parsing |

**Special handling:** These are government FOIA documents (PDFs, scanned images). Would need OCR for scanned documents. Extract case summaries, dates, locations. Set `content_type: 'research_analysis'` and `credibility: 'high'` (government source).

---

### 14. Project Blue Book (National Archives / Internet Archive)

| Field | Value |
|-------|-------|
| **Adapter** | `bluebook` (to build) |
| **URL** | https://archive.org/details/ProjectBlueBook |
| **Category** | `ufos_aliens` |
| **Method** | Internet Archive API + document parsing |
| **Volume** | 10,000+ cases (94 microfilm rolls) |
| **API Key** | None needed |
| **Priority** | 🟡 MEDIUM — historical gold mine |

**Special handling:** Historical USAF UFO investigation (1947-1969). Government records = public domain. Each case has date, location, investigation summary. Set `content_type: 'historical_case'`, `credibility: 'high'`. Event dates are precise — `event_date_precision: 'exact'`.

---

### 15. GEIPAN (French Government UAP Database)

| Field | Value |
|-------|-------|
| **Adapter** | `geipan` (to build) |
| **URL** | https://www.geipan.org |
| **Category** | `ufos_aliens` |
| **Method** | Web scraping |
| **Volume** | ~5,300 cases |
| **API Key** | None needed |
| **Priority** | 🟡 MEDIUM — international coverage, high credibility |

**Special handling:** French language — will need translation pipeline. Cases are rigorously analyzed by French space agency (CNES). Classification system: A (explained), B (probably explained), C (insufficient data), D (unexplained). Only D-class cases are truly paranormal.

---

### 16. Paranormal Database UK

| Field | Value |
|-------|-------|
| **Adapter** | `paranormaldb-uk` (to build) |
| **URL** | https://www.paranormaldatabase.com |
| **Category** | `ghosts_hauntings`, `cryptids`, `ufos_aliens` |
| **Method** | Web scraping |
| **Volume** | 14,800+ entries |
| **API Key** | None needed |
| **Priority** | 🟡 MEDIUM — strong international coverage |

**Special handling:** UK and Ireland focused. Multi-category (ghosts, UFOs, cryptids, poltergeists). Location-based with county/region structure. Short entries — adjust quality filter for this source's style.

---

### 17. OBERF / ADCRF (OBE and After-Death Communication)

| Field | Value |
|-------|-------|
| **Adapter** | `oberf` (to build) |
| **URL** | https://www.oberf.org, https://www.adcrf.org |
| **Category** | `psychological_experiences`, `consciousness_practices` |
| **Method** | Web scraping |
| **Volume** | Thousands of accounts each |
| **API Key** | None needed |
| **Priority** | 🟢 LOW-MEDIUM — extends NDE coverage |

**Special handling:** Companion sites to NDERF. Same structured questionnaire format. OBE = out-of-body experiences. ADC = after-death communication. High-quality experiencer reports.

---

### 18. YouTube Comments Adapter

| Field | Value |
|-------|-------|
| **Adapter** | `youtube-comments` (to build) |
| **URL** | YouTube Data API v3 |
| **Category** | Multiple (inherit from parent video) |
| **Method** | YouTube API (comments endpoint) |
| **Volume** | Potentially 100K+ relevant comments |
| **API Key** | `YOUTUBE_API_KEY` **required** |
| **Priority** | 🟡 MEDIUM — huge untapped volume |

**Design:**
1. For each paranormal video ingested by the `youtube` adapter, fetch top-level comments
2. Filter criteria: minimum 150 characters, minimum 5 likes, contains first-person markers ("I saw", "this happened to me", "I experienced")
3. Reject replies (keep only top-level for first-person accounts)
4. `source_url`: `https://youtube.com/watch?v={videoId}&lc={commentId}`
5. `credibility`: `unverified`
6. `event_date_precision`: `unknown`
7. Inherit category from parent video

**Why this matters:** YouTube comment sections on paranormal videos are one of the richest untapped sources of eyewitness accounts. People share their own experiences in response to videos.

---

### 19. Podcast Transcripts

| Field | Value |
|-------|-------|
| **Adapter** | `podcast` (to build) |
| **Category** | Multiple |
| **Method** | RSS feed + Whisper transcription |
| **Volume** | 1,000+ episodes across top podcasts |
| **API Key** | Whisper API or local model |
| **Priority** | 🟢 LOW — complex pipeline |

**Target podcasts:**
- Jim Harold's Campfire (700+ episodes of listener paranormal stories)
- The Paranormal Podcast (900+ episodes)
- Astonishing Legends
- Mysterious Universe
- Sasquatch Chronicles
- Coast to Coast AM (archive)

**Design:** RSS → download audio → Whisper transcription → segment by story → quality filter → ingest. Complex pipeline but podcasts contain thousands of eyewitness accounts not available anywhere else.

---

### 20. Government FOIA Archives

| Field | Value |
|-------|-------|
| **Adapter** | `foia` (to build) |
| **URLs** | AARO, CIA, FBI, DOE, UK MOD, etc. |
| **Category** | `ufos_aliens` primarily |
| **Method** | Document scraping + OCR |
| **Volume** | Tens of thousands of pages |
| **API Key** | None needed |
| **Priority** | 🟡 MEDIUM — highest credibility source |

**Sources:**
- **AARO** (aaro.mil): Official US UAP records
- **CIA FOIA Reading Room**: Declassified UFO collection
- **FBI Vault**: Declassified UFO documents
- **DOE/NNSA**: UAP-related documents
- **UK National Archives**: UK MOD UFO files
- **Alien.gov** (2026 Trump disclosure): New government disclosure initiative

All government records = public domain, highest credibility tier.

---

### 21. Crop Circle Archives

| Field | Value |
|-------|-------|
| **Adapter** | `cropcircles` (to build) |
| **URLs** | ukcropcircles.co.uk, circleresearcharchive.com |
| **Category** | `combination` (spans UFOs, esoteric, perception) |
| **Method** | Web scraping |
| **Volume** | Thousands of formations |
| **API Key** | None needed |
| **Priority** | 🟢 LOW — niche but passionate community |

**Special handling:** Geotagged data, photos, formation descriptions. `event_date_precision: 'exact'` (crop circles have precise discovery dates).

---

### 22. Castle of Spirits / Regional Ghost Databases

| Field | Value |
|-------|-------|
| **Adapter** | `castleofspirits` (to build) |
| **URL** | https://www.castleofspirits.com |
| **Category** | `ghosts_hauntings` |
| **Method** | Web scraping |
| **Volume** | Thousands of ghost stories |
| **Priority** | 🟢 LOW |

---

### 23. Cryptid Wiki / Fandom

| Field | Value |
|-------|-------|
| **Adapter** | `cryptid-wiki` (to build) |
| **URL** | https://cryptidz.fandom.com |
| **Category** | `cryptids` |
| **Method** | Fandom API + web scraping |
| **Volume** | Hundreds of cryptid entries |
| **Priority** | 🟢 LOW — reference data, not eyewitness |

**Special handling:** Encyclopedia-style entries, not eyewitness reports. Set `content_type: 'research_analysis'`. Good for building the phenomena taxonomy and linking reports to known creatures.

---

### 24. High Strangeness App

| Field | Value |
|-------|-------|
| **Adapter** | `highstrangeness` (to build) |
| **URL** | https://highstrangeness.app |
| **Category** | `combination` |
| **Method** | API (if available) or web scraping |
| **Volume** | Community-contributed, growing |
| **Priority** | 🟢 LOW |

**Notes:** Living map of high strangeness events. Check if they have an API or data export.

---

## TIER 3 — Extended Source Catalog (from Paradocs Research xlsx, 2024)

> Sources below were compiled in our original 2024 research phase (2,569 entries across all categories). They are organized by phenomenon category and prioritized by data density, scrapability, and uniqueness. Many are individual researchers' sites or small organizations — build adapters for the collection-type databases first, then consider individual sites for manual curation or targeted scraping.

### UFOs & Aliens/NHIs (326 xlsx sources — key additions)

**High-priority databases (not yet in Tier 1/2):**
- **MUFON** (mufon.com) — Mutual UFO Network. Largest civilian UFO database (~120K cases). Backend access was broken as of 2024. Monitor for API or data export. Would be our single largest UFO source if accessible.
- **NICAP** (nicap.org) — National Investigations Committee on Aerial Phenomena. Historical archive of pre-1970s cases. Static HTML, scrapable. `content_type: 'historical_case'`.
- **AARO** (aaro.mil) — All-domain Anomaly Resolution Office. Official US government UAP records. Public domain. Highest credibility.
- **Enigma Labs** (enigmalabs.io) — Modern UAP reporting platform with structured data. Check for API access. Has a "library" of cases.
- **UFO Evidence** (ufoevidence.org) — Large compilation of UFO evidence, photos, documents. Static site, scrapable.
- **NARCAP** (narcap.org) — National Aviation Reporting Center on Anomalous Phenomena. Aviation-specific UAP reports. High credibility (pilot/ATC witnesses).
- **Project Hessdalen** (hessdalen.org) — Long-running Norwegian scientific UAP monitoring project. Instrumental data + visual sightings. Very high credibility.
- **COBEPS** (cobeps.org) — Belgian Committee for Study of Space Phenomena. European UFO research org with structured case database.
- **UFO Index** (ufoindex.com) — Aggregated UFO case index.
- **Internet Archive UFO Files** (archive.org/details/ufo-files) — Digitized historical UFO documents. Public domain.

**International UFO orgs:**
- UFO Vision (visionovni.com.ar) — Argentina
- UFOcom (ufo-com.net) — Belarus
- BUFORA (bufora.org.uk) — British UFO Research Association
- UK Government UFO Files (gov.uk/government/publications/ufo-reports-in-the-uk)
- Staatliche Museen zu Berlin historical sighting archive
- CUFOS (cufos.org) — Center for UFO Studies (founded by J. Allen Hynek)

**Smaller/individual researcher sites (lower priority):**
- UFO Sightings Daily, The UFO Chronicles, UFO Explorations, UFO Seekers, UFO Hub, UFO Wisconsin, Round Town UFO Society, My UFO Photos, Dr. Jacob's Official Website, International Community for Alien Research, The Light Side, UFO Research Center, Metrocosm UFO Map

### Ghosts & Hauntings (670 xlsx sources — key additions)

**High-priority databases:**
- **Your Ghost Stories** (yourghoststories.com) — Large user-submitted ghost story database. Similar to Ghosts of America. Volume: thousands of stories.
- **True Ghost Tales** (trueghosttales.com) — User-submitted ghost encounters.
- **Ghost Village** (ghostvillage.com) — Community ghost story and investigation site.
- **The Ghost Club** (ghostclub.org.uk) — UK. Oldest paranormal investigation org in the world (founded 1862). Historical case files.
- **Toronto Ghosts** (torontoghosts.org) — Canadian ghost database.

**Regional ghost databases (bulk — one adapter pattern):**
Many of the 670 ghost sources are regional paranormal investigation teams with small datasets. Build a generic "ghost team" adapter that can be configured per site. Key regions with multiple sources: Alabama (5+ teams), UK (20+ teams/sites), Canada (5+), various US states.

**Notable UK ghost sources:** Ghost Connections, Avon Paranormal Team, Phoenix Paranormal Investigators, Spooky Things, It's Behind You, Lets Be Spooked, Ghosts of Redditch

**Notable investigation orgs:** Wolf River Ghost Society, MadCo Paranormal, Mobile Order of Paranormal Researchers, Spirit Communications and Research Alabama, Webb Paranormal Group, Bench Breaking Broads Ghost Hunters

**Forums with eyewitness content:** Paranormal Forum (paranormalforum.net), Spiritual Forums (spiritualforums.com), Unexplained Mysteries forums (unexplained-mysteries.com/forum/), Paranormalis (paranormalis.com)

**Trans-communication / ITC:** Messages From The Big Circle, Association for Trans-communication Research (vtf.de — German), Haunted Hovel, Ghostly Voices

### Cryptids (173 xlsx sources — key additions)

**High-priority databases:**
- **Dogman Encounters** (dogmanencounters.com) — Dedicated dogman/werewolf sighting database.
- **NA Dogman Project** (northamericandogmanproject.com) — Structured reports.
- **National Cryptid Society** (nationalcryptidsociety.org) — Community-contributed cryptid sightings.
- **Bigfoot Forums** (bigfootforums.com) — Forum with eyewitness accounts.
- **Pine Barrens Institute** (pinebarrensinstitute.com) — Northeast US cryptid/paranormal reports.
- **Centre for Fortean Zoology** (cfz.org.uk) — UK cryptozoology research org.
- **International Cryptozoology Museum** (cryptozoologymuseum.com) — Museum with case archive.
- **Sasquatch Canada** (sasquatchcanada.com) — Canadian Bigfoot database.

**Individual researchers with case data:** Linda Godfrey (dogman/werewolf), Lyle Blackburn (southern cryptids), Jay Bachochin, Adam Davies Explorer, Karl Shuker, The Crypto Crew

**Niche cryptid databases:** Sea Serpents and Lake Monsters (theshadowlands.net/serpent.htm), The Cadborosaurus Watch, Big Foot Times, CryptoZooNews, Strange Ark, Cryptopia

### Psychological Experiences — NDEs, OBEs, Dreams (305 xlsx sources — key additions)

**High-priority databases (not yet in Tier 1/2):**
- **Sleep and Dream Database** (sleepanddreamdatabase.org) — Academic dream research database. Structured data.
- **Dream Bank** (dreambank.net) — Large academic dream report archive.
- **Astral Projection Forum** (forumforastral.com) — OBE experiencer accounts.
- **The Astral Pulse** (astralpulse.com) — OBE/AP community with detailed reports.
- **Near-Death.com** (near-death.com) — NDE research and accounts aggregator.
- **REM Space** (remspace.net) — Dream/OBE research with forums.
- **Tulpa Info** (community.tulpa.info) — Tulpa/thoughtform creation experiences. Unique to Paradocs.

**Research organizations:**
- Rhine Research Center (rhineonline.org) — Parapsychology research, Duke University legacy
- Parapsychology Foundation (parapsychology.org)
- Windbridge Research Center (windbridge.org) — Mediumship research
- Institute of Noetic Sciences (noetic.org) — Consciousness research
- International Remote Viewing Association (irva.org) — Remote viewing research and reports
- Open Sciences (opensciences.org) — Consciousness research aggregator

**Afterlife-specific:**
- Afterlife Forums (afterlifeforums.com) — Community discussion with experiencer accounts
- Forever Family Foundation (foreverfamilyfoundation.org) — Afterlife science
- Eternea (eternea.org) — NDE/consciousness research
- Afterlife Data (afterlifedata.com), Afterlife 101 (afterlife101.com), Afterlife Research and Education Institute (afterlifeinstitute.org)

**Dream research:** Dream Forum (dreamforum.net), Dream Bible forums, Lucid Dream Society (luciddreamsociety.com), Dream Studies (dreamstudies.org)

### Consciousness Altering Practices (139 xlsx sources — key additions)

**High-priority databases:**
- **DMT Nexus** (forum.dmt-nexus.me) — Detailed psychedelic experience reports, especially entity encounters. High overlap with paranormal phenomena (machine elves, hyperspace entities).
- **Shroomery** (shroomery.org/forums) — Psilocybin experience reports with paranormal dimensions.
- **Blossom** (blossomanalysis.com) — Psychedelic experience analysis.
- **Altered States Database** (asdb.info) — Academic altered states research.
- **Princeton Engineering Anomalies Research (PEAR)** (pearlab.icrl.org) — Consciousness anomalies research from Princeton. Historical but high-credibility data.
- **Monroe Institute** (monroeinstitute.org) — OBE/consciousness research programs (Gateway tapes, Hemi-Sync).

**Shamanism (substantial cluster in xlsx):**
- Foundation for Shamanic Studies (shamanism.org)
- Shaman Links (shamanlinks.net), Shaman Portal (shamanportal.org)
- Shamanic Visions (shamanicvisions.com), Shamans Cave forums (shamanscave.com/forum)
- The Power Path (thepowerpath.com)

**Psychedelic research orgs:**
- MAPS (maps.org) — Multidisciplinary Association for Psychedelic Studies
- The Third Wave (thethirdwave.co), Psychedelic Review (psychedelicreview.com)
- Beckley Foundation (beckleyfoundation.org), Chacruna (chacruna.net)
- Mind Foundation (mind-foundation.org), Open Foundation (open-foundation.org)
- PAREA (parea.eu) — European psychedelic research
- Psychedelic History Archive (psychedelicarchive.com)

### Psychic Phenomena / ESP (126 xlsx sources — key additions)

**High-priority databases:**
- **Psychic Experiences** (psychic-experiences.com) — User-submitted psychic experience reports. Similar format to ghost story sites.
- **The Weiler Psi** (weilerpsiblog.wordpress.com) — Parapsychology blog with case studies.
- **Parapsychological Association** (parapsych.org) — Professional research org.
- **RetroPsychoKinesis Project** (fourmilab.ch/rpkp) — PK research experiments.

**Animal communication (unique niche — 10+ sources):**
- Animal Talk (animaltalk.com.au), Species Link Journal (specieslinkjournal.com)
- Rupert Sheldrake's research (sheldrake.org) — Telepathy research
- Various animal communicator sites (animalthoughts.com, animalmuse.com, etc.)

**Mediumship:** Arthur Findlay College (arthurfindlaycollege.org), Stewart Alexander, Allison Dubois, George Anderson, John Edward

### Esoteric Practices & Beliefs (166 xlsx sources — key additions)

**High-priority databases:**
- **Twilit Grotto: Archives of Western Esoterica** (esotericarchives.com) — Historical occult text archive.
- **Internet Sacred Text Archive** (sacred-texts.com) — Massive collection of religious/esoteric texts. Public domain.
- **The Gnosis Archive** (gnosis.org) — Gnostic and esoteric texts.
- **The Hermetic Library** (hermetic.com) — Hermeticism, Thelema, Golden Dawn texts.
- **The Alchemy Web Site** (alchemywebsite.com) — Historical alchemy texts and research.
- **Sacred Magick** (sacred-magick.com) — PDF archive of occult texts.

**Forums with experiencer content:** Occult Forums (occultforums.net), The Way of Hermes Forum (wayofhermes.com), Cult of Tarot (cultoftarotforum.com), The Cauldron (ecauldron.com), Wizard Forums (wizardforums.com)

**Organizations:** Hermetic Order of the Golden Dawn (hermeticgoldendawn.org), ESSWE (esswe.org), Societas Magica, US Grand Lodge OTO (oto-usa.org), Builders of the Adytum (bota.org), Museum of Witchcraft and Magic (UK)

**Kabbalah cluster:** Kabbalah.info, Gal Einai (inner.org), Kabbalah Online (kabbalaonline.org)

**Astrology cluster:** Digital International Astrology Library (cura.free.fr/DIAL.html), Kepler College, Mountain Astrologer, AstroStar

### Comparative Religion & Mythology (113 xlsx sources — key additions)

**High-priority databases:**
- **American Folklore Society** (americanfolkloresociety.org) — Academic folklore research.
- **The Folklore Society** (folklore-society.com) — UK folklore research org.
- **ARAS** (aras.org) — Archive for Research in Archetypal Symbolism. Academic, image-based.
- **Joseph Campbell Foundation** (jcf.org) — Mythology research foundation.
- **Learn Religions** (learnreligions.com) — Comparative religion reference.
- **Pantheon** (pantheon.org) — Mythology encyclopedia.

**Afterlife in world religions:** Reincarnation Central (reincarnationcentral.com), Afterlife Communication (adcguides.com), Reluctant Messenger (reluctant-messenger.com), Revelatorium (revelatorium.com)

**Cross-cultural:** Japanese Buddhism (japanese-buddhism.com), Avesta (avesta.org), Jewish mysticism (marquette.edu/maqom), Comparative Religion (comparativereligion.com), Online Mythology (online-mythology.com), Timeless Myths (timelessmyths.co.uk — UK), Strange Lands (batcow.co.uk/strangelands — UK)

### Combination / Multi-Category (527 xlsx sources — key additions)

**High-priority databases:**
- **Above Top Secret** (abovetopsecret.com) — One of the largest paranormal/conspiracy forums. Massive volume of eyewitness accounts across all categories.
- **Archives for the Unexplained (AFU)** (files.afu.se/Downloads/) — Swedish archive. Downloadable document collections. One of the world's largest physical paranormal archives being digitized.
- **Unexplained Phenomena Database** (updb.app) — Modern UAP/anomaly repository.
- **Metabunk** (metabunk.org) — Skeptical analysis of paranormal claims. Valuable for the debunking/analysis perspective.
- **Reddit Archived** (the-eye.eu/redarcs/) — Downloadable Reddit data archives. Bulk import possible for paranormal subreddits.
- **Data World** (data.world) — Structured paranormal datasets. Check for BFRO, NUFORC, ghost datasets.
- **Rice University Impossible Archives** (impossiblearchives.rice.edu) — Academic paranormal archives.

**Research organizations:**
- Society for Psychical Research (spr.ac.uk) — UK, oldest parapsychology org (founded 1882)
- Sol Foundation (thesolfoundation.org) — UAP research think tank
- Dr. Steven Greer / Disclosure Project (drstevengreer.com) — Document library

**Forums (combination content):**
- 4chan /x/ (boards.4chan.org/x/) — Paranormal board. Very high volume, very low signal-to-noise. Needs aggressive quality filtering.
- Paranormal Forum (paranormalforum.net)
- Spiritual Forums (spiritualforums.com)
- Unexplained Mysteries (unexplained-mysteries.com)
- Paranormalis (paranormalis.com)

**Other notable sources:** The Skeptic's Dictionary (skepdic.com — valuable for balanced perspective), Open Library (openlibrary.org), FBI Vault (vault.fbi.gov), Monstrous (monstrous.com), Cosmopoisk (kosmopoisk.org — Russian), Edith Cowan University shamanism/abduction research thesis

### Perception & Sensory / Biological / Natural Experiences (5 xlsx sources)

Small categories in the xlsx:
- **Deja Experience Research** (deja-experience-research.org) — Déjà vu research database
- **Sedona Anomalies** (sedonanomalies.com) — Sedona vortex/energy research
- **Journal of Applied Consciousness Studies** (journals.lww.com) — Academic journal

---

## Scaling Plan: Path to 1M+ Reports

### Phase 1: Quick Wins (Target: 100K reports)
1. **Kaggle/HuggingFace bulk import** — 300K+ pre-cleaned UFO/cryptid records
2. **Fix NUFORC adapter** + ingest with `fetch_full_details=true` — 20K+ recent reports
3. **BFRO full scrape** — 5,600+ reports
4. **NDERF full scrape** — 16,000+ reports
5. **Reddit v2 targeted scrape** (13 subreddits, quality filtered) — 50K+ reports

### Phase 2: Depth (Target: 500K reports)
6. **YouTube videos** (100+ channels) — 10K+ video-based reports
7. **YouTube comments** on paranormal videos — 100K+ eyewitness comments
8. **Paranormal Database UK** — 14,800+ reports
9. **News adapter** (ongoing) — 5K+ per month
10. **OBERF + ADCRF** — 5K+ reports

### Phase 3: Authority (Target: 1M+ reports)
11. **Black Vault FOIA documents** — 50K+ case summaries
12. **Project Blue Book** — 10K+ historical cases
13. **GEIPAN (French)** — 5,300+ cases (with translation)
14. **Government FOIA archives** (CIA, FBI, DOE) — 10K+ documents
15. **Podcast transcripts** — 10K+ story segments
16. **Wikipedia** historical backbone — 500+ reference cases

### Phase 4: Completeness
17. Regional ghost databases (670 xlsx sources), crop circles, cryptid wiki
18. International sources — AFU Sweden (downloadable archives), Canadian UFO Survey, BUFORA, COBEPS, GEIPAN, Cosmopoisk, UFO Vision Argentina, UK Government UFO Files
19. Historical newspaper archives (if accessible)
20. Social media (TikTok, Twitter/X) — volume play
21. Forum scraping — Above Top Secret, DMT Nexus, Shroomery, 4chan /x/, Paranormal Forum, Unexplained Mysteries
22. Dream databases — Dream Bank, Sleep and Dream Database, Lucid Dream Society
23. Psychedelic research databases — MAPS, Altered States Database, Erowid (already Tier 1)
24. Esoteric text archives — Sacred Texts, Gnosis Archive, Hermetic Library, Twilit Grotto

> **Total addressable volume from xlsx + existing:** Conservatively 2M+ unique reports/entries across all tiers. The xlsx alone catalogs 2,569 source sites. Even if most individual sites yield only 50-200 entries, the long tail adds up significantly.

---

## Quality Filter Thresholds by Source Type

> **Implementation:** These thresholds are now implemented in `src/lib/ingestion/filters/quality-filter.ts` as the `SOURCE_THRESHOLDS` config and enforced via `getStatusFromScore(score, sourceType)` and `getSourceThresholds(sourceType)`. The `assessQuality` function automatically applies the correct `minDescLength` per source.

| Source Type | Min Description Length | Min Quality Score (Approve) | Min Quality Score (Review) | Special Rules |
|------------|----------------------|---------------------------|--------------------------|---------------|
| Government/FOIA (`government`, `blackvault`, `bluebook`, `foia`, `geipan`) | 100 chars | 50 | 30 | Auto `credibility: 'high'` |
| Academic (`nderf`, `iands`, `oberf`) | 200 chars | 55 | 35 | Structured questionnaire bonus |
| Investigation org (`bfro`, `nuforc`, `mufon`) | 150 chars | 60 | 40 | Classification system bonus |
| News (`news`) | 200 chars | 65 | 45 | Reject opinion/listicle |
| Community (`reddit`, `reddit-v2`, `youtube`, `youtube-comments`) | 150–300 chars | 70 | 45 | Reject meta/questions/fiction |
| Ghost databases (`shadowlands`, `ghostsofamerica`, `paranormaldb-uk`) | 80 chars | 50 | 30 | Accept shorter entries |
| Reference (`wikipedia`, `cryptid-wiki`) | 100 chars | 50 | 30 | All `content_type: 'historical_case'` |
| Erowid (`erowid`) | 300 chars | 70 | 50 | Must have paranormal dimension |
| Bulk import (`kaggle-import`) | 100 chars | 55 | 35 | Pre-cleaned data |
| Default (unlisted sources) | 100 chars | 70 | 40 | Standard thresholds |

---

## Environment Variables Required

| Variable | Required For | Where to Set |
|----------|-------------|-------------|
| `ANTHROPIC_API_KEY` | Feed hooks, Paradocs Analysis, title improvement | Vercel + `.env.local` |
| `OPENAI_API_KEY` | Vector embeddings | Vercel + `.env.local` |
| `YOUTUBE_API_KEY` | YouTube adapter, YouTube comments adapter | Vercel + `.env.local` |
| `NEWS_API_KEY` | News adapter | Vercel + `.env.local` |

**Current status (March 25, 2026):** Only Supabase keys are set on Vercel. ANTHROPIC_API_KEY and OPENAI_API_KEY need to be added before AI features (feed hooks, paradocs analysis, embeddings) will work in production.

---

## Adapter Development Checklist

When building a new adapter, it must:

- [ ] Return `source_url` for every report (MANDATORY)
- [ ] Return `original_report_id` unique to the source (for dedup)
- [ ] Set `source_type` to match the adapter name
- [ ] Map to one of the 11 phenomenon categories
- [ ] Extract `event_date` when available
- [ ] Set `event_date_precision` appropriately
- [ ] Extract `location_name` when available
- [ ] Set `credibility` based on source reliability
- [ ] Handle rate limiting (respect source servers)
- [ ] Include media URLs when available (images, videos)
- [ ] Generate meaningful tags for phenomena linking
- [ ] Handle pagination/batching for large sources
- [ ] Log progress for monitoring
- [ ] Handle errors gracefully (don't crash on single bad record)

---

## Source Catalog Statistics (from xlsx)

| Category | xlsx Sources | Key Database Sources | Estimated Addressable Volume |
|----------|-------------|---------------------|------------------------------|
| Ghosts & Hauntings | 670 | ~10 databases + 600+ regional teams | 200K+ |
| Combination/Multi | 527 | ~15 forums/databases | 500K+ |
| UFOs & Aliens | 326 | ~15 databases + 200+ org sites | 500K+ |
| Psychological Experiences | 305 | ~15 databases + 200+ research sites | 100K+ |
| Cryptids | 173 | ~10 databases + 100+ researcher sites | 50K+ |
| Esoteric Practices | 166 | ~10 archives + 100+ org sites | 50K+ |
| Consciousness Practices | 139 | ~10 databases + 100+ org sites | 100K+ |
| Psychic Phenomena | 126 | ~5 databases + 100+ practitioner sites | 30K+ |
| Comparative Religion | 113 | ~10 archives + 80+ org sites | 30K+ |
| Other (Perception, Bio, Natural) | 5 | ~3 research sites | 5K+ |
| **TOTAL** | **2,569** | — | **~1.5M+** |

> Source: `Paradocs Research (1).xlsx` compiled 2024. Aggregated column values disregarded per instruction. Individual source entries extracted and categorized above.

---

## Related Documents

- `PROJECT_STATUS.md` — Overall project roadmap and launch path
- `HANDOFF_INGESTION.md` — Pipeline technical details and session handoffs
- `src/lib/ingestion/adapters/index.ts` — Adapter registry
- `src/lib/ingestion/engine.ts` — Core ingestion engine
- `src/lib/ingestion/filters/quality-filter.ts` — Quality scoring and status assignment
- `src/lib/ingestion/filters/quality-scorer.ts` — 10-dimension quality scorer
- `supabase/migrations/` — Database migrations including enum fixes
- `Paradocs Research (1).xlsx` — Original 2024 source research (2,569 entries)
